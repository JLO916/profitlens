import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { importColumns, inspectImportFile } from "@/application/import";
import { columnGuidance } from "@/application/import-guidance";
import { exampleTemplateUrl, initialWizardState, runCheck, wizardReducer, ORDER_AGGREGATION_DOC_URL, type WizardState } from "@/application/import-wizard";
import type { MappingMemoryEntry } from "@/application/mapping-memory";
import { formatAmountL3, formatCount, formatPeriodL1, formatRateL3 } from "@/application/presentation";
import { CONVERTIBLE_FIELDS, DEFAULT_CONVERSION_FIELDS } from "@/application/tax-basis";
import type { FileName } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { ImportWizard } from "@/components/import-wizard";
import { CHANNELS_INLINE_MAX, STEP3_VISIBLE_BUDGET } from "@/components/import-wizard/step-basis";
import { scanLabels } from "../scripts/lib/copy-scan.mjs";

/*
 * V3-8 B（PRD §7.7.2、§6.3 #54、§6.4 M1／M6、C20）：匯入精靈全版專注模式的 SSR 結構。
 * 以 reducer 推進的狀態（initialState）渲染整個精靈：版頭只寫步驟名、stepper、四步內容、底部固定動作列。
 * 文字斷言一律從 labels 取字；數字經 presentation 的格式化函式。
 */
const copy = labels.importWizard;
const v3 = copy.wizardV3;
const panel = labels.importWizard.panel;
const roles: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
const fileLabel: Record<FileName, string> = { "sales_daily.csv": copy.files.sales, "channel_costs_daily.csv": copy.files.costs, "ad_spend_daily.csv": copy.files.ads };
const alternative = resolve("tests/fixtures/alternative"), inclusive = resolve("tests/fixtures/inclusive_tax");
const bytes = (text: string) => new TextEncoder().encode(text);

function loaded(dir: string, overrides: Partial<Record<FileName, { name?: string; text: string }>> = {}, memory: Partial<Record<FileName, MappingMemoryEntry>> = {}): WizardState {
  let state = initialWizardState();
  for (const role of roles) {
    const override = overrides[role];
    const content = override ? bytes(override.text) : new Uint8Array(readFileSync(resolve(dir, role)));
    state = wizardReducer(state, { type: "fileRead", role, draft: inspectImportFile(role, { name: override?.name ?? role, size: content.byteLength, bytes: content }), encoding: "utf8", memory: memory[role] ?? null });
  }
  return state;
}
const render = (state?: WizardState, consent = false) => renderToStaticMarkup(createElement(ImportWizard, { onCommit: async () => undefined, onCancel: () => undefined, busy: false, localSaveConsented: consent, initialState: state }));
const checkedFrom = (state: WizardState) => { const confirmed = wizardReducer(state, { type: "confirm" }); return wizardReducer(confirmed, { type: "checked", candidate: runCheck(confirmed) }); };

/* ---------- markup 工具 ---------- */
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const occurrences = (html: string, text: string) => html.split(text).length - 1;
const textOf = (html: string) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
/** 含有 attr 的元素（開始標籤到對應的結束標籤）。 */
function element(html: string, attr: string): string | null {
  const at = html.indexOf(attr);
  if (at < 0) return null;
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start))![1];
  const re = new RegExp(`<(/?)${escapeRe(tag)}(?=[\\s>/])[^>]*?(/?)>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    if (match[1]) depth--; else if (!match[2]) depth++;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  throw new Error(`元素沒有結束標籤：${attr}`);
}
/** 預設可見的 markup：拿掉「收合的 <details>」裡 summary 之後的內容（summary 本身可見、可操作）。 */
function visibleMarkup(html: string): string {
  const tag = /<details(\s[^>]*)?>|<\/details>/g;
  const stack: { start: number; open: boolean }[] = [];
  const ranges: [number, number][] = [];
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    if (match[0] !== "</details>") { stack.push({ start: match.index, open: /\sopen(?:=|\s|$)/.test(match[1] ?? "") }); continue; }
    const node = stack.pop()!;
    if (!node.open && stack.every(parent => parent.open)) ranges.push([html.indexOf("</summary>", node.start) + "</summary>".length, match.index]);
  }
  let kept = "", last = 0;
  for (const [from, to] of ranges) { kept += html.slice(last, from); last = to; }
  return kept + html.slice(last);
}
/** 預設可見、可操作的控制（input／select／button／summary），不含底部動作列與 stepper。 */
function visibleControls(html: string): number {
  const footer = element(html, 'class="wizard-footer"')!;
  const stepper = element(html, 'data-testid="import-stepper"')!;
  const body = visibleMarkup(html.replace(footer, "").replace(stepper, ""));
  return (body.match(/<(input|select|button|summary)[\s>]/g) ?? []).length;
}
const duplicates = (html: string, attr: "data-testid" | "id") => {
  const counts = new Map<string, number>();
  for (const match of html.matchAll(new RegExp(`\\s${attr}="([^"]+)"`, "g"))) counts.set(match[1], (counts.get(match[1]) ?? 0) + 1);
  return [...counts].filter(([, n]) => n > 1).map(([id, n]) => `${id}×${n}`);
};

/* ---------- 各步狀態 ---------- */
const salesText = readFileSync(resolve(alternative, "sales_daily.csv"), "utf8");
/** 改名欄位（gross_sales→revenue）＋未知欄：第 2 步只有 gross_sales 需要確認（E2E import.spec 同一組）。 */
const renamedText = salesText.trimEnd().split(/\r?\n/).map((line, index) => index === 0 ? line.replace("gross_sales", "revenue") + ",private_note" : line + ",X").join("\n") + "\n";
const dictionaryText = salesText.replace(/^date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency/, "結帳日,通路,商品貨號,品類,件數,商品金額,折扣,退款,成本,幣別");
const orderText = "訂單號碼,訂單日期,商品貨號,商品名稱,數量,商品金額\n#1001,2026-09-01,SKU-1,T,1,100\n";
const metaHeaders = ["Day", "Campaign name", "Amount spent (TWD)", "Currency"];
const metaText = `${metaHeaders.join(",")}\n2026-09-01,Brand,100,TWD\n`;
const metaMemory: MappingMemoryEntry = { key: "m", role: "ad_spend_daily.csv", headers: metaHeaders, mapping: { date: "Day" }, preset_id: null, basis: null, rate: null, convert_fields: [], used_at: "2026-09-28" };

const step1Empty = initialWizardState();
const step1Loaded = loaded(alternative);
const step1OrderLevel = loaded(alternative, { "sales_daily.csv": { name: "orders.csv", text: orderText } });
const step2Renamed = wizardReducer(loaded(alternative, { "sales_daily.csv": { name: "renamed-sales.csv", text: renamedText } }), { type: "next" });
const step2Dictionary = wizardReducer(loaded(alternative, { "sales_daily.csv": { name: "shop-sales.csv", text: dictionaryText } }), { type: "next" });
const step2MemoryPreset = wizardReducer(loaded(alternative, { "ad_spend_daily.csv": { name: "meta-ads.csv", text: metaText } }, { "ad_spend_daily.csv": metaMemory }), { type: "next" });
const step2OrderLevel = wizardReducer(step1OrderLevel, { type: "next" });
const step3Inclusive = wizardReducer(wizardReducer(loaded(inclusive), { type: "next" }), { type: "basis", basis: "inclusive" });
const step3TwoChannels = wizardReducer(wizardReducer(loaded(alternative), { type: "next" }), { type: "basis", basis: "inclusive" });
const step4Valid = checkedFrom(step3Inclusive);
const exclusive = (dir: string) => wizardReducer(wizardReducer(loaded(dir), { type: "next" }), { type: "basis", basis: "exclusive" });
const step4Partial = checkedFrom(exclusive(resolve("fixtures/errors/missing_cogs")));
const step4Blocked = checkedFrom(exclusive(resolve("fixtures/errors/duplicate_sales_key")));
const step4Checking = wizardReducer(step3Inclusive, { type: "confirm" });

describe("V3-8 B 匯入精靈全版模式（§7.7.2）", () => {
  it("狀態推進符合預期（測試前提）", () => {
    expect([step1Loaded.step, step2Renamed.step, step2Dictionary.step, step2MemoryPreset.step, step2OrderLevel.step, step3Inclusive.step, step3TwoChannels.step, step4Valid.step]).toEqual([1, 2, 2, 2, 2, 3, 3, 4]);
    expect(step3Inclusive.mappingSkipped).toBe(true);
    expect([step4Valid, step4Partial, step4Blocked].map(state => state.candidate!.validation.classification)).toEqual(["valid", "partial", "blocking"]);
    expect(step4Checking.checking).toBe(true);
  });

  it("版頭：h2 只寫目前步驟名（sr-only 寫第 n 步），沒有「｜」拼接、沒有 eyebrow（PageHeader 提供 h1 與隱私說明，手機另有一行 aria-hidden 的可見隱私句）；「取消匯入」只有一份、在版頭", () => {
    for (const [n, state] of [[1, step1Loaded], [2, step2Renamed], [3, step3Inclusive], [4, step4Valid]] as const) {
      const html = render(state);
      const heading = element(html, 'id="import-heading"')!;
      expect(heading, `第 ${n} 步`).toMatch(/^<h2 id="import-heading" tabindex="-1">/);
      expect(textOf(heading)).toBe(`${fill(v3.stepOf, { n, total: 4 })}${copy.steps[n - 1]}`);
      expect(element(heading, 'class="sr-only"')).toBe(`<span class="sr-only">${fill(v3.stepOf, { n, total: 4 })}</span>`);
      expect(heading).not.toContain("｜");
      expect(heading).not.toContain(copy.title);
      expect(html).not.toContain('class="eyebrow"');
      // 隱私句只剩手機用的一行（aria-hidden；桌機由 PageHeader 描述提供，CSS 只在 < 768 顯示）。
      expect(occurrences(html, copy.privacyNote)).toBe(1);
      expect(html).toContain(`<p class="wizard-privacy" aria-hidden="true">${copy.privacyNote}</p>`);
      expect(occurrences(html, `>${copy.cancel}</button>`)).toBe(1);
      expect(element(html, 'class="wizard-head"')).toContain(`>${copy.cancel}</button>`);
      expect(duplicates(html, "data-testid"), `第 ${n} 步 testid`).toEqual([]);
      expect(duplicates(html, "id"), `第 ${n} 步 id`).toEqual([]);
    }
  });

  it("C20 stepper：目前步驟 aria-current=step；完成（含自動完成）的步驟是 SVG 勾＋sr-only 狀態；步驟之間 3 個 SVG chevron；沒有文字箭頭", () => {
    const stepper = element(render(step3Inclusive), 'data-testid="import-stepper"')!;
    expect(stepper).toContain(`aria-label="${copy.stepperAria}"`);
    const items = [...stepper.matchAll(/<li class="(\w+)"( aria-current="step")?>/g)].map(match => `${match[1]}${match[2] ? "*" : ""}`);
    expect(items).toEqual(["done", "skipped", "current*", "todo"]);
    const lis = stepper.split("</li>").slice(0, 4);
    expect(lis[0]).toMatch(/class="wizard-step-number" aria-hidden="true"><svg/);
    expect(lis[0]).toContain(`（${copy.stepState.done}）`);
    expect(lis[1]).toMatch(/class="wizard-step-number" aria-hidden="true"><svg/);
    expect(lis[1]).toContain(`（${copy.stepState.skipped}）`);
    expect(lis[2]).toContain('class="wizard-step-number" aria-hidden="true">3</span>');
    expect(lis[3]).toContain('class="wizard-step-number" aria-hidden="true">4</span>');
    expect(occurrences(stepper, 'class="wizard-step-sep"')).toBe(3);
    expect(textOf(stepper)).not.toMatch(/[→←⇒▸▾›»]/);
    for (const [index, title] of copy.steps.entries()) expect(lis[index]).toContain(`<span class="wizard-step-title">${title}</span>`);
  });

  it("底部固定動作列：左「上一步」（次要），右側是該步的主要按鈕（文字沿用既有鍵）；import-commit 只在第 4 步、可套用時出現", () => {
    const footer = (state: WizardState) => element(render(state), 'class="wizard-footer"')!;
    expect(footer(step1Loaded)).not.toContain(copy.back);
    expect(footer(step1Loaded)).toMatch(new RegExp(`class="ui-btn ui-btn-primary">${escapeRe(copy.next)}</button>`));
    expect(footer(step1Empty)).toMatch(new RegExp(`class="ui-btn ui-btn-primary" disabled="">${escapeRe(copy.next)}</button>`));
    expect(footer(step2Renamed)).toMatch(new RegExp(`class="ui-btn ui-btn-secondary">${escapeRe(copy.back)}</button>`));
    expect(footer(step2Renamed)).toMatch(new RegExp(`disabled="">${escapeRe(copy.confirmMapping)}</button>`));
    expect(footer(step3Inclusive)).toContain(`>${copy.confirmAndCheck}</button>`);
    expect(footer(step3Inclusive)).not.toContain(" disabled=\"\">" + copy.confirmAndCheck);
    const valid = footer(step4Valid);
    expect(valid).toContain(copy.commitHint);
    expect(valid).toMatch(new RegExp(`<button type="button" class="ui-btn ui-btn-primary" data-testid="import-commit">${escapeRe(copy.commit)}</button>`));
    for (const state of [step1Loaded, step2Renamed, step3Inclusive, step4Blocked, step4Checking]) expect(render(state)).not.toContain('data-testid="import-commit"');
    expect(occurrences(render(step4Partial), 'data-testid="import-commit"')).toBe(1);
  });

  it("步驟 1：拖放區＋三個檔案槽 C3 列（角色、檔名、編碼、列數、狀態標籤、選檔與移除），範本／欄位說明／進階設定檔各收在 <details>（內容掛載）", () => {
    const empty = render(step1Empty);
    expect(empty).toContain(`role="group" aria-label="${copy.dropzoneAria}"`);
    expect(element(empty, 'class="dropzone"')).toContain(copy.dropHint);
    for (const role of roles) {
      const slot = element(empty, `data-testid="import-file-${role}"`)!;
      expect(slot).toMatch(/^<article data-testid="[^"]+" class="file-slot" data-state="empty">/);
      expect(slot).toContain(`aria-label="${fileLabel[role]}" type="file"`);
      expect(slot).toContain(`>${copy.pickFile}</span>`);
      expect(slot).toContain(copy.fileEmpty);
      expect(slot).not.toContain(copy.removeFile);
    }
    const html = render(step1Loaded);
    for (const role of roles) {
      const slot = element(html, `data-testid="import-file-${role}"`)!;
      const parsed = step1Loaded.files[role]!.draft.parsed!;
      expect(slot).toContain('data-state="ready"');
      expect(slot).toContain(`<span class="file-mono">${role}</span>`);
      expect(slot).toContain(copy.encoding.utf8);
      expect(slot).toContain(fill(panel.rowCount, { n: formatCount(parsed.rows.length, "L2") }));
      expect(slot).toContain(v3.fileState.ready);
      expect(slot).toContain(`>${copy.replaceFile}</span>`);
      expect(slot).toContain(`aria-label="${fill(v3.removeAria, { file: fileLabel[role] })}">${copy.removeFile}</button>`);
    }
    // 三個 <details>：預設收合，內容掛載。
    const details = [...html.matchAll(/<details class="wizard-details">/g)];
    expect(details).toHaveLength(3);
    const [templatesBlock, howToBlock, advancedBlock] = html.split('<details class="wizard-details">').slice(1).map(part => part.slice(0, part.indexOf("</details>")));
    expect(templatesBlock).toContain('<table class="template-table">');
    expect(occurrences(templatesBlock, "<tr><th scope=\"row\">")).toBe(3);
    for (const role of roles) expect(templatesBlock).toContain(`aria-label="${fill(labels.exports.downloads.blankTemplate, { file: fileLabel[role] })}"`);
    expect(templatesBlock).toContain(`href="${exampleTemplateUrl("manifest.json")}" download="manifest.json">${labels.exports.downloads.exampleManifest}</a>`);
    expect(howToBlock).toContain(`<summary>${copy.howTo}</summary>`);
    expect(howToBlock).toContain(copy.howToIntro);
    expect(howToBlock).toContain(copy.howToDoc);
    expect(advancedBlock).toContain(`<summary>${copy.advanced}</summary>`);
    expect(advancedBlock).toContain(`aria-label="${copy.manifestLabel}" type="file"`);
    // D5：訂單級 inline 提示，連到整理工具說明。
    const order = element(render(step1OrderLevel), 'data-testid="import-order-level-sales_daily.csv"')!;
    expect(order).toContain('role="alert"');
    expect(order).toContain(copy.orderLevelDetected);
    expect(order).toContain(`href="${ORDER_AGGREGATION_DOC_URL}"`);
  });

  it("步驟 2：區段標題「已對照 m／n 欄 · k 欄需要確認」；需要確認的列展開在外，已對照的列收在 <details> 且掛載；預設可見的 select ≤ 需要確認數＋1", () => {
    const html = render(step2Renamed);
    const sales = element(html, 'data-testid="import-mapping-sales_daily.csv"')!;
    expect(textOf(element(sales, "<h3>")!)).toBe(fill(v3.mappingTitle, { file: copy.files.sales, mapped: "9", total: formatCount(importColumns["sales_daily.csv"].length, "L2"), pending: "1" }));
    expect(sales).toContain(`<span class="mapping-file">renamed-sales.csv</span>`);
    expect((visibleMarkup(sales).match(/<select /g) ?? [])).toHaveLength(1);
    expect(visibleMarkup(sales)).toContain(`aria-label="${fill(panel.mappingAria, { file: "sales_daily.csv", field: "gross_sales" })}"`);
    expect((sales.match(/<select /g) ?? [])).toHaveLength(10);
    expect(sales).toContain(`<summary>${fill(v3.mappedSummary, { n: "9" })}</summary>`);
    expect(sales).toContain(`aria-label="${fill(v3.mappedRegionAria, { file: "sales_daily.csv" })}"`);
    expect(sales).toContain(copy.mappingStatus.none);
    expect(sales).toContain(fill(copy.mappingIncomplete, { fields: "gross_sales" }));
    expect(sales).toContain(`aria-label="${fill(panel.ignoreAria, { file: "sales_daily.csv" })}"`);
    for (const role of ["channel_costs_daily.csv", "ad_spend_daily.csv"] as const) {
      const card = element(html, `data-testid="import-mapping-${role}"`)!;
      expect(textOf(element(card, "<h3>")!)).toBe(fill(v3.mappingTitle, { file: fileLabel[role], mapped: formatCount(importColumns[role].length, "L2"), total: formatCount(importColumns[role].length, "L2"), pending: "0" }));
      expect(visibleMarkup(card)).not.toContain("<select ");
      expect((card.match(/<select /g) ?? [])).toHaveLength(importColumns[role].length);
    }
    const pending = 1;
    expect((visibleMarkup(element(html, 'data-testid="import-step-2"')!).match(/<select /g) ?? []).length).toBeLessThanOrEqual(pending + 1);
    // 全部是字典建議：10 欄都要確認、都展開。
    const dictionary = element(render(step2Dictionary), 'data-testid="import-mapping-sales_daily.csv"')!;
    expect(textOf(element(dictionary, "<h3>")!)).toBe(fill(v3.mappingTitle, { file: copy.files.sales, mapped: "0", total: "10", pending: "10" }));
    expect((visibleMarkup(dictionary).match(/<select /g) ?? [])).toHaveLength(10);
    expect(dictionary).not.toContain("<details");
  });

  it("步驟 2：欄位說明是標準欄位名旁的 ? 按鈕（aria-expanded／aria-controls），說明區 hidden 掛載；記憶與預設提示合併在同一行、testid 各自保留；訂單級提示連到說明", () => {
    const html = render(step2Renamed);
    const step = element(html, 'data-testid="import-step-2"')!;
    const triggers = [...step.matchAll(/<button type="button" class="ui-help-trigger" aria-label="([^"]+)" aria-expanded="false" aria-controls="([^"]+)">/g)];
    expect(triggers).toHaveLength(roles.reduce((sum, role) => sum + importColumns[role].length, 0));
    for (const [, label, id] of triggers) {
      const region = element(step, `id="${id}"`)!;
      expect(region).toMatch(new RegExp(`^<span id="${escapeRe(id)}" role="region" aria-label="${escapeRe(label)}" class="[^"]*field-help-panel" hidden="">`));
    }
    // 銷售檔第一列是唯一需要確認的 gross_sales；說明內容就是欄位說明。
    expect(triggers[0][1]).toBe(fill(v3.fieldHelpAria, { label: columnGuidance.gross_sales.label }));
    expect(element(step, `id="${triggers[0][2]}"`)).toContain(columnGuidance.gross_sales.meaning);
    const both = element(render(step2MemoryPreset), 'data-testid="import-mapping-ad_spend_daily.csv"')!;
    const hints = element(both, 'class="mapping-hints"')!;
    expect(hints).toMatch(/^<p class="mapping-hints">/);
    expect(element(hints, 'data-testid="import-memory-hint"')).toMatch(/^<span class="mapping-hint" data-testid="import-memory-hint">/);
    expect(element(hints, 'data-testid="import-preset-hint"')).toMatch(/^<span class="mapping-hint" data-testid="import-preset-hint">/);
    const order = element(render(step2OrderLevel), 'data-testid="import-order-level"')!;
    expect(order).toContain('role="alert"');
    expect(order).toContain(`href="${ORDER_AGGREGATION_DOC_URL}"`);
    expect(order).toContain(copy.orderLevelLink);
  });

  it("步驟 3：金額基準三個 radio 各有一行說明；選含稅時 9 個換算欄位收在「調整換算欄位」裡（掛載），預設勾選數＝reducer 的 D2 預設；兩欄表單；預設可見控制 ≤ 12", () => {
    const html = render(step3Inclusive);
    for (const [value, label, help] of [["exclusive", copy.basis.exclusive, v3.basisHelp.exclusive], ["inclusive", copy.basis.inclusive, v3.basisHelp.inclusive], ["unknown", copy.basis.unsure, v3.basisHelp.unsure]] as const) {
      expect(html).toContain(`aria-label="${label}" aria-describedby="import-basis-${value}-help"`);
      expect(html).toContain(`<p class="basis-help" id="import-basis-${value}-help">${help}</p>`);
    }
    expect(occurrences(html, 'type="radio"')).toBe(3);
    const conversion = element(html, 'data-testid="import-conversion"')!;
    const total = roles.reduce((sum, role) => sum + CONVERTIBLE_FIELDS[role].length, 0);
    const defaults = roles.reduce((sum, role) => sum + DEFAULT_CONVERSION_FIELDS[role].length, 0);
    expect(total).toBe(9);
    expect(occurrences(conversion, 'type="checkbox"')).toBe(total);
    expect(occurrences(visibleMarkup(conversion), 'type="checkbox"')).toBe(0);
    expect(occurrences(conversion, 'type="checkbox" class="ui-check" aria-label="')).toBe(total);
    expect((conversion.match(/type="checkbox"[^>]*checked=""/g) ?? [])).toHaveLength(defaults);
    expect(defaults).toBe(roles.reduce((sum, role) => sum + step3Inclusive.convertFields[role].length, 0));
    expect(conversion).toContain(`<p class="wizard-line">${fill(v3.convertCount, { n: formatCount(defaults, "L2") })}</p>`);
    expect(conversion).toContain(`<summary>${v3.adjustConvert}</summary>`);
    expect(visibleMarkup(conversion)).toContain(`aria-label="${copy.rateLabel}"`);
    expect(conversion).toContain(`aria-label="${copy.files.sales} ${labels.metrics.cogs_net.headline}"`);
    // 設定提案：兩欄表單（資料集名稱、資料到、涵蓋起訖），比較方式與兩期日期收在「調整比較期間」。
    const proposal = element(html, 'data-testid="import-settings-proposal"')!;
    const grid = element(proposal, 'class="ui-form-grid"')!;
    for (const label of [copy.datasetName, copy.dataAsOf, copy.coverageStart, copy.coverageEnd]) expect(grid).toContain(`aria-label="${label}"`);
    expect(proposal).toContain(copy.proposedBy);
    const { settings } = step3Inclusive;
    expect(proposal).toContain(`<p class="wizard-line">${fill(v3.periodsSummary, { mode: labels.shell.periods.sameDays, previous: formatPeriodL1(settings.previous_start, settings.previous_end, { anchor: settings.current_end }), current: formatPeriodL1(settings.current_start, settings.current_end, { anchor: settings.current_end }) })}</p>`);
    expect(proposal).toContain(`<summary>${v3.adjustPeriods}</summary>`);
    const hidden = proposal.slice(proposal.indexOf(`<summary>${v3.adjustPeriods}</summary>`));
    for (const label of [copy.comparisonMode, labels.exports.csv.columns.previous_start, labels.exports.csv.columns.previous_end, labels.exports.csv.columns.current_start, labels.exports.csv.columns.current_end]) {
      expect(hidden).toContain(`aria-label="${label}"`);
      expect(visibleMarkup(proposal)).not.toContain(`aria-label="${label}"`);
    }
    // 只有一個通路：直接列出勾選框。
    expect(CHANNELS_INLINE_MAX).toBe(1);
    expect(visibleMarkup(proposal)).toContain('aria-label="官網"');
    expect(html).toContain(`<li>${copy.coverageConfirm}</li><li>${copy.amountConfirm}</li>`);
    expect(visibleControls(html)).toBeLessThanOrEqual(STEP3_VISIBLE_BUDGET);
  });

  it("步驟 3：通路多於名額時改成「已選 n 個通路」一行＋「調整通路」（勾選框掛載在收合區內）；預設可見控制仍 ≤ 12", () => {
    const html = render(step3TwoChannels);
    const proposal = element(html, 'data-testid="import-settings-proposal"')!;
    expect(step3TwoChannels.availableChannels).toEqual(["DTC", "MARKETPLACE"]);
    expect(proposal).toContain(`<p class="wizard-line">${fill(v3.channelsSelected, { n: "2", channels: "DTC、MARKETPLACE" })}</p>`);
    expect(proposal).toContain(`<summary>${v3.adjustChannels}</summary>`);
    for (const channel of ["DTC", "MARKETPLACE"]) {
      expect(proposal).toContain(`aria-label="${channel}" checked=""`);
      expect(visibleMarkup(proposal)).not.toContain(`aria-label="${channel}"`);
    }
    expect(visibleControls(html)).toBeLessThanOrEqual(STEP3_VISIBLE_BUDGET);
    // 一個通路都沒勾時收合區預設展開，並顯示 channelsRequired。
    const none = wizardReducer(wizardReducer(step3TwoChannels, { type: "channel", channel: "DTC", checked: false }), { type: "channel", channel: "MARKETPLACE", checked: false });
    const noneHtml = element(render(none), 'data-testid="import-settings-proposal"')!;
    expect(noneHtml).toContain(copy.channelsRequired);
    expect(noneHtml).toMatch(new RegExp(`<details class="wizard-details" open="">\\s*<summary>${escapeRe(v3.adjustChannels)}</summary>`));
  });

  it("步驟 4：頂部狀態一行（L1 樣板）→ 前處理摘要表 → 對帳表 → 記憶備註；既有檢核句在下一行；數字經 presentation 格式化", () => {
    const html = render(step4Valid);
    const status = element(html, 'data-testid="import-status"')!;
    const issues = step4Valid.candidate!.validation.issues;
    const rows = roles.reduce((sum, role) => sum + step4Valid.files[role]!.draft.parsed!.rows.length, 0);
    expect(status).toBe(`<p role="status" data-testid="import-status" data-classification="valid" class="import-result valid">${fill(v3.statusReady, { files: "3", rows: formatCount(rows, "L2"), errors: "0", warnings: formatCount(issues.filter(issue => issue.severity === "warning").length, "L2") })}</p>`);
    expect(element(html, 'data-testid="import-result-note"')).toBe(`<p class="wizard-note" data-testid="import-result-note">${copy.result.valid}</p>`);
    const preprocessing = element(html, 'data-testid="import-preprocessing"')!;
    for (const head of Object.values(v3.preprocessingHead)) expect(preprocessing).toContain(head);
    expect(preprocessing).toContain(`aria-label="${v3.preprocessingTableAria}"`);
    expect(preprocessing).toContain(formatAmountL3("4725.00"));
    expect(preprocessing).toContain(formatAmountL3("4500.00"));
    expect(occurrences(preprocessing, formatRateL3("0.05"))).toBe(8);
    expect(preprocessing).toContain(fill(copy.conversionSummary, { percent: "5", fields: step4Valid.candidate!.conversion!.fields.map(field => columnGuidance[field].label).join("、"), n: "12" }));
    expect(element(html, 'data-testid="import-memory-note"')).toBe(`<p class="wizard-note" data-testid="import-memory-note">${copy.memorySessionOnly}</p>`);
    expect(render(step4Valid, true)).toContain(copy.memoryPersistent);
    const order = ["import-status", "import-preprocessing", "import-reconciliation", "import-memory-note"].map(id => html.indexOf(`data-testid="${id}"`));
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(order.every(index => index > 0)).toBe(true);
    expect(html.indexOf('data-testid="import-commit"')).toBeGreaterThan(html.indexOf('class="wizard-footer"'));
    expect(element(html, 'data-testid="reconciliation-gross_sales"')).toContain(formatAmountL3("4500.00"));
    expect(element(html, 'data-testid="reconciliation-metric-net_revenue"')).toContain(formatAmountL3("4150.00"));
  });

  it("步驟 4：部分資料待補「可套用已有範圍」、無法套用「無法套用：n 項錯誤」（沒有套用按鈕、保留下載問題清單 CSV）、檢核中只顯示 checking", () => {
    const partial = render(step4Partial);
    const partialIssues = step4Partial.candidate!.validation.issues;
    const count = (severity: string) => formatCount(partialIssues.filter(issue => issue.severity === severity).length, "L2");
    const partialRows = roles.reduce((sum, role) => sum + step4Partial.files[role]!.draft.parsed!.rows.length, 0);
    expect(textOf(element(partial, 'data-testid="import-status"')!)).toBe(fill(v3.statusPartial, { files: "3", rows: formatCount(partialRows, "L2"), pending: count("partial"), warnings: count("warning") }));
    expect(element(partial, 'data-testid="import-status"')).toContain('data-classification="partial" class="import-result partial"');
    expect(partial).toContain(copy.resultNote.partial);
    const blocked = render(step4Blocked);
    const blockedIssues = step4Blocked.candidate!.validation.issues;
    expect(textOf(element(blocked, 'data-testid="import-status"')!)).toBe(fill(v3.statusBlocked, { errors: formatCount(blockedIssues.filter(issue => issue.severity === "blocking").length, "L2") }));
    expect(element(blocked, 'data-testid="import-result-note"')).toContain(copy.result.blocking);
    expect(blocked).toContain(`>${labels.exports.downloads.issuesCsv}</button>`);
    expect(blocked).toContain(panel.duplicateAlert);
    const checking = render(step4Checking);
    expect(textOf(element(checking, 'data-testid="import-status"')!)).toBe(copy.checking);
    expect(checking).toContain('data-classification="checking"');
    expect(checking).not.toContain('data-testid="import-result-note"');
  });

  it("§6.3 #54 列的 testid 全部存在（各步狀態合計），每個狀態內不重複", () => {
    const states = [step1Loaded, step1OrderLevel, step2Renamed, step2MemoryPreset, step2OrderLevel, step3Inclusive, step4Valid];
    const all = new Set(states.flatMap(state => [...render(state).matchAll(/data-testid="([^"]+)"/g)].map(match => match[1])));
    const expected = [
      "import-wizard", "import-stepper", "import-step-1", "import-step-2", "import-step-3", "import-step-4",
      ...roles.map(role => `import-file-${role}`), "import-order-level-sales_daily.csv", ...roles.map(role => `import-mapping-${role}`),
      "import-memory-hint", "import-preset-hint", "import-order-level", "import-conversion", "import-settings-proposal", "import-status", "import-preprocessing", "import-memory-note", "import-reconciliation",
      ...["gross_sales", "discounts", "refunds", "cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"].map(field => `reconciliation-${field}`),
      ...["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"].map(metric => `reconciliation-metric-${metric}`),
      "import-commit",
    ];
    expect(expected.filter(id => !all.has(id))).toEqual([]);
    for (const state of states) expect(duplicates(render(state), "data-testid")).toEqual([]);
  });

  it("wizardV3 新鍵沒有文案黑名單、箭頭、「｜」、問句、驚嘆號、注意：前綴與 emoji", () => {
    const { metrics, details } = scanLabels({ importWizard: { wizardV3: v3 } });
    for (const [key, value] of Object.entries(metrics)) expect(value, `${key}：${JSON.stringify(details)}`).toBe(0);
    const strings = JSON.stringify(v3);
    expect(strings).not.toMatch(/[？?！!｜→←⇒▸▾]|注意：/);
  });
});
