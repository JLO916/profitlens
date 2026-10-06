import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { validateDataset } from "@/domain/validation";
import type { Dataset, FileName } from "@/domain/types";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { inspectImportFile } from "@/application/import";
import { initialWizardState, runCheck, wizardReducer, type WizardState } from "@/application/import-wizard";
import { evidenceRows, formatAmountL3, formatPeriodL1, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { EvidenceDrawer, evidenceSubtitle, type EvidenceSelection } from "@/components/evidence-drawer";
import { impactEvidence } from "@/components/top-three";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";

// V3-5（PRD §7.8、§9.4 抽屜規格 C6、§6.3 #55）：計算與來源抽屜重排。
// 由上到下：固定標題列（h2 只放指標名或結論句＋副標＋關閉 icon）→ 大數字與精確值 → 計算方式 → 組成項目 → 指標定義與算法 → 原始明細 → 技術細節。
// 期待值一律由 labels／fill 與格式化函式組出；金額取自 golden 快照（本期 255.00、差額 −315.00），不新增任何計算。

const v3 = labels.evidence.drawerV3;
const noop = () => undefined;
let dataset: Dataset;
let snapshot: WorkspaceSnapshot;

beforeAll(async () => {
  const input = fixture("golden");
  dataset = validateDataset(input).dataset!;
  snapshot = await createSnapshot(dataset, {}, await hashInput(input));
});

const render = (evidence: EvidenceSelection, extra: Partial<Parameters<typeof EvidenceDrawer>[0]> = {}) =>
  renderToStaticMarkup(createElement(EvidenceDrawer, { dataset, snapshot, evidence, onClose: noop, onBasis: noop, ...extra }));
/** 本期扣廣告後貢獻（golden 255.00），全部通路，沒有 scopeLabel。 */
const currentContribution = (): EvidenceSelection => ({ title: metricDefinitions.contribution_after_marketing.label, name: "contribution_after_marketing", metric: snapshot.report.current.metrics.contribution_after_marketing, period: snapshot.report.current.period, channels: snapshot.report.scope.channels, sources: snapshot.report.current.sources });
/** 兩期差額（golden 570.00 → 255.00，−315.00），組成恰為上期／本期兩項。 */
const deltaContribution = (): EvidenceSelection => ({
  title: fill(labels.ui.overview.changeTitle, { metric: metricDefinitions.contribution_after_marketing.label }), name: "contribution_after_marketing", metric: { value: "-315.00", reason_codes: [] },
  period: { start: snapshot.report.previous.period.start, end: snapshot.report.current.period.end }, channels: snapshot.report.scope.channels,
  sources: [...snapshot.report.previous.sources, ...snapshot.report.current.sources], formula: labels.ui.overview.amountDeltaFormula, scopeLabel: labels.ui.overview.amountDeltaScope,
  components: [{ label: labels.periods.previous, metric: snapshot.report.previous.metrics.contribution_after_marketing }, { label: labels.periods.current, metric: snapshot.report.current.metrics.contribution_after_marketing }],
});
const range = (start: string, end: string) => formatPeriodL1(start, end, { days: false, anchor: dataset.manifest.data_as_of });
const between = (html: string, from: string, to: string) => { const start = html.indexOf(from); return html.slice(start, html.indexOf(to, start)); };
const h2 = (html: string) => /<h2 id="([^"]+)">(.*?)<\/h2>/.exec(html)!;
const visible = (inner: string) => inner.replace(/<span class="sr-only">.*?<\/span>/g, "").replace(/<[^>]+>/g, "");

describe("固定標題列（§7.8、C6）", () => {
  it("h2 只放指標名或結論句，可及名稱仍以「 · 計算與來源」結尾；不含「｜」與「怎麼算的」", () => {
    const html = render(currentContribution());
    const [, id, inner] = h2(html);
    expect(visible(inner)).toBe(metricDefinitions.contribution_after_marketing.label);
    expect(/<span class="sr-only">(.*?)<\/span>/.exec(inner)![1]).toBe(` · ${labels.sections.evidence}`);
    expect(inner).not.toContain("｜");
    expect(inner).not.toContain("怎麼算的");
    expect(html).toMatch(new RegExp(`<dialog class="evidence-dialog evidence-drawer" aria-labelledby="${id}"`));
    // v2 的 eyebrow 與「{標題} · 計算與來源」可見標題已移除。
    expect(html).not.toContain('class="eyebrow"');
    expect(html).not.toContain('class="evidence-header"');
  });

  it("副標的 id 與 dialog 的 aria-describedby 一致；全部通路的本期寫「全部通路 · 本期 8/2–8/2」", () => {
    const html = render(currentContribution());
    const describedBy = /aria-describedby="([^"]+)"/.exec(html)![1];
    const [, id, text] = /<p id="([^"]+)" class="sub">([^<]*)<\/p>/.exec(html)!;
    expect(id).toBe(describedBy);
    const { start, end } = snapshot.report.current.period;
    expect(text).toBe(fill(v3.subtitle, { scope: labels.evidence.allChannels, period: fill(v3.periodNamed, { name: labels.periods.current, range: range(start, end) }) }));
    expect(text).toBe(`${labels.evidence.allChannels} · ${labels.periods.current} 8/2–8/2`);
  });

  it("關閉是標題列右側的 icon 按鈕（aria-label＝關閉、autofocus），也是抽屜裡第一個可聚焦的控制", () => {
    const html = render(currentContribution());
    const firstButton = /<button[^>]*>/.exec(html)![0];
    expect(firstButton).toContain('class="ui-btn ui-btn-icon evidence-close"');
    expect(firstButton).toContain(`aria-label="${labels.buttons.close}"`);
    expect(firstButton).toContain("autofocus");
    expect(between(html, '<header class="evidence-head">', "</header>")).toContain("<svg");
  });
});

describe("副標組字（evidenceSubtitle）", () => {
  const options = () => ({ alias: false, anchor: dataset.manifest.data_as_of, allChannels: dataset.manifest.channels, report: snapshot.report });

  /** 規格：期間與報表本期／上期相同時加名稱，否則只寫 M/D 範圍。 */
  const periodText = (period: { start: string; end: string }) => {
    const same = (other: { start: string; end: string }) => other.start === period.start && other.end === period.end;
    const name = same(snapshot.report.current.period) ? labels.periods.current : same(snapshot.report.previous.period) ? labels.periods.previous : null;
    return name ? fill(v3.periodNamed, { name, range: range(period.start, period.end) }) : range(period.start, period.end);
  };

  it("影響類抽屜：scopeLabel「影響金額 · 合計（…）」已寫出通路，副標只加期間", () => {
    const diagnostic = snapshot.report.diagnostics.find(item => item.scope.kind === "all" && impactEvidence(snapshot, item));
    const evidence = impactEvidence(snapshot, diagnostic!)!;
    expect(evidence.scopeLabel!.startsWith(`${labels.sections.impact} · `)).toBe(true);
    expect(evidenceSubtitle(evidence, options())).toBe(fill(v3.subtitle, { scope: evidence.scopeLabel!, period: periodText(evidence.period) }));
  });

  it("scopeLabel 已寫出「全部通路」或通路名時不重複；沒寫出時另附「通路：…」；沒有 scopeLabel 時範圍就是通路名", () => {
    const delta = deltaContribution();
    expect(labels.ui.overview.amountDeltaScope).toContain(labels.evidence.allChannels);
    // 兩期差額的期間跨上期起日到本期迄日，不是本期也不是上期：只寫範圍「8/1–8/2」。
    expect(evidenceSubtitle(delta, options())).toBe(fill(v3.subtitle, { scope: labels.ui.overview.amountDeltaScope, period: range(delta.period.start, delta.period.end) }));
    expect(evidenceSubtitle(delta, options())).toBe(`${labels.ui.overview.amountDeltaScope} · 8/1–8/2`);
    const dtc = { period: snapshot.report.current.period, channels: ["DTC"], scopeLabel: undefined };
    expect(evidenceSubtitle(dtc, options())).toBe(fill(v3.subtitle, { scope: "DTC", period: fill(v3.periodNamed, { name: labels.periods.current, range: range(dtc.period.start, dtc.period.end) }) }));
    const scoped = { period: snapshot.report.previous.period, channels: ["DTC"], scopeLabel: labels.ui.workspacePanels.scopeAll };
    expect(evidenceSubtitle(scoped, options())).toBe(fill(v3.subtitleChannels, { scope: labels.ui.workspacePanels.scopeAll, period: fill(v3.periodNamed, { name: labels.periods.previous, range: range(scoped.period.start, scoped.period.end) }), channels: "DTC" }));
  });
});

describe("內容區（大數字、精確值、區段順序）", () => {
  it(".evidence-body 第一個子元素是 p.number，下一行是到分的精確值（evidence-precise-value）", () => {
    const html = render(currentContribution());
    const body = html.slice(html.indexOf('<div class="evidence-body">') + '<div class="evidence-body">'.length);
    expect(body.startsWith('<p class="number">')).toBe(true);
    expect(body).toMatch(new RegExp(`^<p class="number">[^<]+</p><p class="evidence-precise" data-testid="evidence-precise-value">${fill(labels.units.yuan, { value: formatAmountL3("255.00") })}</p>`));
  });

  it("區段順序：計算方式 → 組成項目 → 指標定義與算法 → 原始明細 → 技術細節（技術細節預設收合）", () => {
    const html = render(deltaContribution());
    const order = [`<h3>${labels.evidence.ladderTitle}</h3>`, `<h3>${labels.evidence.components}</h3>`, `<h3>${v3.definitionTitle}</h3>`, `<h3>${v3.sourcesTitle}</h3>`, `<summary>${labels.sections.technicalDetails}</summary>`].map(marker => html.indexOf(marker));
    expect(order.every(index => index > 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html).toContain('<details class="evidence-technical"><summary>');
    expect(v3.sourcesTitle).toBe(labels.evidence.sourcesTitle);
  });

  it("每個區段都是有名稱的 region（aria-label＝小標），沒有區段時不留空殼", () => {
    const html = render(currentContribution());
    for (const name of [labels.evidence.ladderTitle, v3.definitionTitle, labels.evidence.sourcesTitle]) expect(html).toContain(`aria-label="${name}"`);
    expect(html).not.toContain(`aria-label="${labels.evidence.components}"`);
  });

  it("指標定義與算法：指標的白話定義＋「版本 contribution-v1」＋「指標定義」文字按鈕（沒有 onBasis 時不顯示按鈕）", () => {
    const html = render(currentContribution());
    const section = between(html, `<h3>${v3.definitionTitle}</h3>`, "</section>");
    expect(section).toContain(metricDefinitions.contribution_after_marketing.plain);
    expect(section).toContain(fill(v3.version, { version: "contribution-v1" }));
    expect(section).toContain(`>${labels.buttons.basis}</button>`);
    const withoutBasis = renderToStaticMarkup(createElement(EvidenceDrawer, { dataset, snapshot, evidence: currentContribution(), onClose: noop }));
    expect(between(withoutBasis, `<h3>${v3.definitionTitle}</h3>`, "</section>")).not.toContain("<button");
    // 「指標定義」按鈕只在這一段，不再跟在計算方式的公式後面。
    expect(between(html, `<h3>${labels.evidence.ladderTitle}</h3>`, "</section>")).not.toContain(labels.buttons.basis);
  });

  it("件數這類非 domain 指標：定義段用證據自帶的公式說明與版本（assist-kpi-v1）", () => {
    const evidence: EvidenceSelection = { ...currentContribution(), name: "net_revenue", unitOverride: "count", metric: { value: "6", reason_codes: [] }, formula: labels.assist.items.units_sold.formula, formulaTechnical: labels.assist.items.units_sold.formulaTechnical, metricVersion: "assist-kpi-v1" };
    const section = between(render(evidence), `<h3>${v3.definitionTitle}</h3>`, "</section>");
    expect(section).toContain(labels.assist.items.units_sold.formula);
    expect(section).not.toContain(metricDefinitions.net_revenue.plain);
    expect(section).toContain(fill(v3.version, { version: "assist-kpi-v1" }));
  });

  it("條件句不加「注意：」前綴，13px 次要色一句放在技術細節上方（role=status 保留）", () => {
    const evidence: EvidenceSelection = { ...currentContribution(), name: "mer", metric: { value: null, reason_codes: ["NON_POSITIVE_DENOMINATOR"] } };
    const html = render(evidence);
    expect(html).toContain(`<p class="evidence-limit" role="status">${labels.evidence.conditionsNote}</p>`);
    expect(html).not.toContain(`${labels.sections.caution}：`);
    expect(html.indexOf('class="evidence-limit"')).toBeLessThan(html.indexOf('<details class="evidence-technical">'));
    expect(html.indexOf('class="evidence-limit"')).toBeGreaterThan(html.indexOf(`<h3>${v3.sourcesTitle}</h3>`));
  });
});

describe("組成項目表（14px，單位只在表頭）", () => {
  it("差額證據：一列三欄「上期（元）｜本期（元）｜差額（元）」，差額＝證據值（golden 570.00 → 255.00，−315.00）", () => {
    const html = render(deltaContribution());
    const table = between(html, `<h3>${labels.evidence.components}</h3>`, "</table>");
    expect(table).toContain('<table class="kv l3">');
    const headers = [...table.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(match => match[1]);
    expect(headers).toEqual([v3.componentsColumns.item, v3.componentsColumns.previous, v3.componentsColumns.current, v3.componentsColumns.change]);
    expect(table).toContain(`<th scope="row">${metricDefinitions.contribution_after_marketing.label}</th>`);
    const cells = [...table.matchAll(/<td class="num">([^<]*)<\/td>/g)].map(match => match[1]);
    expect(cells).toEqual([formatAmountL3("570.00"), formatAmountL3("255.00"), formatSignedDelta("-315.00", "L3")]);
    // 舊的 30px 大字 dl 已改成表格。
    expect(table).not.toContain("<dl>");
  });

  it("其他情況（不是恰好上期／本期兩項）：兩欄「項目｜金額（元）」，每個組成一列", () => {
    const evidence: EvidenceSelection = { ...deltaContribution(), components: [{ label: labels.targets.actual, metric: { value: "255.00", reason_codes: [] } }, { label: labels.targets.columns.target, metric: { value: "300.00", reason_codes: [] } }] };
    const table = between(render(evidence), `<h3>${labels.evidence.components}</h3>`, "</table>");
    const headers = [...table.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(match => match[1]);
    expect(headers).toEqual([v3.componentsColumns.item, v3.componentsColumns.amount]);
    expect(table).not.toContain(v3.componentsColumns.change);
    const rows = [...table.matchAll(/<tr><th scope="row">([^<]*)<\/th><td class="num">([^<]*)<\/td><\/tr>/g)].map(match => [match[1], match[2]]);
    expect(rows).toEqual([[labels.targets.actual, formatAmountL3("255.00")], [labels.targets.columns.target, formatAmountL3("300.00")]]);
  });
});

describe("原始明細（檔案:行號、手機清單）", () => {
  it("每列的「檔名:行號」用等寬字，且與 evidenceRows(dataset, sources) 的 file／line 一致", () => {
    const evidence = currentContribution();
    const html = render(evidence);
    const shown = [...html.matchAll(/<span class="evidence-fileline">([^<]*)<\/span>/g)].map(match => match[1]);
    // 扣廣告後貢獻引用三個檔案；預設分頁是第一個有資料的來源（銷售），每頁 50 列。
    const expected = evidenceRows(dataset, evidence.sources).filter(row => row.file === "sales_daily.csv").slice(0, 50).map(row => fill(v3.fileLine, { file: row.file, line: row.line! }));
    expect(shown.length).toBeGreaterThan(0);
    expect(shown).toEqual(expected);
    for (const text of shown) expect(text).toMatch(/^sales_daily\.csv:\d+$/);
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    expect(css).toMatch(/\.evidence-drawer \.evidence-fileline \{[^}]*font-family: var\(--font-mono\)/);
  });

  it("表頭是「檔案:行號｜日期｜通路｜欄位與數值」；每格有 data-label、data-list-role 與明確的 role（≤ 767px 以 CSS 重排成清單）", () => {
    const html = render(currentContribution());
    const table = between(html, '<table class="source-table" role="table">', "</table>");
    const headers = [...table.matchAll(/<th scope="col" role="columnheader">([^<]*)<\/th>/g)].map(match => match[1]);
    expect(headers).toEqual([v3.sourceColumns.fileLine, v3.sourceColumns.date, v3.sourceColumns.channel, v3.sourceColumns.values]);
    const body = between(table, '<tbody role="rowgroup">', "</tbody>");
    const rows = body.match(/<tr role="row">/g)!.length;
    expect(rows).toBeGreaterThan(0);
    expect(body.match(new RegExp(`<th scope="row" role="rowheader" data-label="${v3.sourceColumns.fileLine}" data-list-role="primary">`, "g"))).toHaveLength(rows);
    expect(body.match(new RegExp(`<td role="cell" class="evidence-date" data-label="${v3.sourceColumns.date}" data-list-role="secondary">`, "g"))).toHaveLength(rows);
    expect(body.match(new RegExp(`<td role="cell" data-label="${v3.sourceColumns.channel}" data-list-role="secondary">`, "g"))).toHaveLength(rows);
    expect(body.match(new RegExp(`<td role="cell" data-label="${v3.sourceColumns.values}" data-list-role="labeled">`, "g"))).toHaveLength(rows);
    expect(body.match(/<td(?![^>]*role="cell")/g)).toBeNull();
    // 既有互動保留：分段按鈕（aria-pressed）、搜尋、筆數、捲動容器。
    expect(html).toContain(`role="group" aria-label="${labels.ui.evidenceDrawer.sourceTabsAria}"`);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('type="search"');
    expect(html).toContain(`role="region" aria-label="${labels.ui.evidenceDrawer.sourceTableAria}"`);
  });

  it("日期、通路、商品已有自己的欄：欄位與數值不重複列出；匯入時改過欄名的仍列出並附「原欄位」", () => {
    const evidence = currentContribution();
    const values = (html: string) => between(between(html, '<tbody role="rowgroup">', "</tr>"), 'data-list-role="labeled">', "</td>");
    const plain = values(render(evidence));
    for (const field of ["date", "channel", "sku"]) expect(plain).not.toContain(`<dt>${labels.evidence.fields[field]}</dt>`);
    expect(plain).toContain(`<dt>${labels.evidence.fields.category}</dt>`);
    const row = evidenceRows(dataset, evidence.sources).find(item => item.file === "sales_daily.csv")!;
    const html = render(evidence, { mappings: { "sales_daily.csv": { date: "訂單日期" } } });
    const mapped = values(html);
    expect(mapped).toContain(`<dt>${labels.evidence.fields.date}<small>${labels.evidence.originalColumn}：訂單日期</small></dt><dd>${row.date}</dd>`);
    expect(mapped).not.toContain(`<dt>${labels.evidence.fields.channel}</dt>`);
    // 日期與通路仍在自己的欄。
    expect(between(html, '<tbody role="rowgroup">', "</tr>")).toContain(`data-list-role="secondary">${row.date}</td>`);
  });

  it("含稅匯入：evidence-conversion-note 在原始明細的說明之後、分段按鈕之前，含稅原值與換算值並列", async () => {
    const dir = resolve("tests/fixtures/inclusive_tax");
    let state: WizardState = initialWizardState();
    for (const role of ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"] as FileName[]) {
      const content = new Uint8Array(readFileSync(resolve(dir, role)));
      state = wizardReducer(state, { type: "fileRead", role, draft: inspectImportFile(role, { name: role, size: content.byteLength, bytes: content }), encoding: "utf8", memory: null });
    }
    const basis = wizardReducer(wizardReducer(state, { type: "next" }), { type: "basis", basis: "inclusive" });
    const confirmed = wizardReducer(basis, { type: "confirm" });
    const prepared = wizardReducer(confirmed, { type: "checked", candidate: runCheck(confirmed) }).candidate!;
    const imported = validateDataset(prepared.input!).dataset!;
    const importedSnapshot = await createSnapshot(imported, {}, await hashInput(prepared.input!));
    const { report } = importedSnapshot;
    const html = renderToStaticMarkup(createElement(EvidenceDrawer, { dataset: imported, snapshot: importedSnapshot, conversion: prepared.conversion, rawValues: prepared.raw_values, evidence: { title: metricDefinitions.net_revenue.label, name: "net_revenue", metric: report.current.metrics.net_revenue, period: report.current.period, channels: report.scope.channels, sources: report.current.sources }, onClose: noop }));
    const note = html.indexOf('data-testid="evidence-conversion-note"');
    expect(note).toBeGreaterThan(html.indexOf(`<h3>${v3.sourcesTitle}</h3>`));
    expect(note).toBeGreaterThan(html.indexOf(labels.evidence.sourcesNote));
    expect(note).toBeLessThan(html.indexOf('class="source-controls"'));
    expect(html).toContain('class="converted-value"');
    expect(html).toContain(`（${labels.evidence.rawToConverted}）`);
  });
});

describe("labels 一致性", () => {
  it("組成表欄頭與「{label}（元）」模板一致；檔案:行號模板只有 file、line 兩個占位符", () => {
    expect(v3.componentsColumns.previous).toBe(fill(labels.units.yuanColumn, { label: labels.periods.previous }));
    expect(v3.componentsColumns.current).toBe(fill(labels.units.yuanColumn, { label: labels.periods.current }));
    expect(fill(v3.fileLine, { file: "sales_daily.csv", line: 128 })).toBe("sales_daily.csv:128");
    expect(v3.sourceColumns.fileLine).not.toContain("｜");
  });
});
