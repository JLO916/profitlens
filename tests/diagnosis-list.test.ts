import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { diagnosisGroups } from "../src/application/diagnosis-group";
import { buildManagerSummary } from "../src/application/manager-summary";
import { formatAmountL2, formatAmountL3, formatMultiple, formatRateL2, formatRateL3, formatSignedDelta } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { DIAGNOSIS_DEFAULT_OPEN, DIAGNOSIS_SCOPE_CHIPS, DiagnosisList, diagnosisCounts, displayMetric, rankingLabel, rankingSelection } from "../src/components/diagnosis-list";
import { alertStatus, TopThree } from "../src/components/top-three";
import { channelsLabel } from "../src/application/copy";
import { Diagnosis } from "../src/components/workspace-panels";
import { validateDataset } from "../src/domain/validation";
import type { AnalysisFilters, Diagnostic, Scope } from "../src/domain/types";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// R5-1 健檢清單的 DOM 契約（E2E 錨點）：ol[data-testid=diagnosis-list] > li > details[data-testid=diagnosis-row-<code>]。
// V3-5（PRD §7.2、§9.4 C9 清單型）：li.alert-row > details.alert.diagnosis-row#diagnosis-row-<code>；summary 一行（狀態標籤、標題、範圍、影響金額純文字），
// 標題列是「健檢結果」＋計數徽章（數字＝列內同色調狀態標籤的個數），範圍文字只在標題列寫一次。
async function snapshot(name = "golden", filters: AnalysisFilters = {}) {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, filters, await hashInput(input));
}
const noop = () => undefined;
const render = (snap: WorkspaceSnapshot, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(DiagnosisList, { snapshot: snap, onEvidence: noop, onCreateAction: noop, ...extra }));
/** 依 data-testid 取出整列 <details>…</details>（列內的技術細節與更多範圍也是 <details>，以巢狀深度配對）。 */
function row(html: string, code: string): string {
  const start = html.indexOf(`data-testid="diagnosis-row-${code}"`);
  expect(start, code).toBeGreaterThan(-1);
  const open = html.lastIndexOf("<details", start);
  let depth = 0;
  const tag = /<details[\s>]|<\/details>/g;
  tag.lastIndex = open;
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    depth += match[0] === "</details>" ? -1 : 1;
    if (depth === 0) return html.slice(open, match.index + match[0].length);
  }
  throw new Error(`unclosed row ${code}`);
}
const summaryOf = (rowHtml: string) => rowHtml.slice(rowHtml.indexOf("<summary"), rowHtml.indexOf("</summary>") + "</summary>".length);
const text = (html: string) => html.replace(/<[^>]*>/g, "");
const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** V3-2b：影響金額是 L1（萬／元、U+2212）；相關數字是 L2（整數元）；技術細節的排序金額是 L3 到分。 */
const impactL1 = (value: string) => formatSignedDelta(value, "L1");

describe("DiagnosisList renders one collapsible row per rule", () => {
  it("golden: list order, testids, first three rows open, count badges match the row lozenges, scope written once", async () => {
    const snap = await snapshot();
    const html = render(snap);
    const groups = diagnosisGroups(snap).groups;
    expect(html).toContain('data-testid="diagnosis-panel"');
    expect(html).toContain('<ol class="alert-list diagnosis-list" data-testid="diagnosis-list"');
    const rows = [...html.matchAll(/<details([^>]*)data-testid="diagnosis-row-([A-Z_]+)"([^>]*)>/g)];
    expect(rows.map(match => match[2])).toEqual(groups.map(group => group.rule));
    expect(rows.map(match => /\sopen(?:=|\s|$)/.test(`${match[1]} ${match[3]}`))).toEqual(groups.map((_, index) => index < DIAGNOSIS_DEFAULT_OPEN));
    // 每一列是 li.alert-row > details.alert.diagnosis-row，id 與 data-testid 同名（通路寬表備註欄的連結錨點）。
    for (const group of groups) expect(html).toContain(`<li class="alert-row"><details class="alert diagnosis-row" data-testid="diagnosis-row-${group.rule}" id="diagnosis-row-${group.rule}"`);
    // V3-5：刪除「自動健檢」與「n 項」標籤，改成計數徽章；徽章數字＝列內同色調狀態標籤的個數（資料待補／不利／有利，中性不計）。
    expect(html).not.toContain(labels.sections.autoCheck);
    expect(html).not.toContain(`>${fill(labels.ui.workspacePanels.itemCount, { n: groups.length })}<`);
    expect(html).not.toContain('class="tag');
    const counts = diagnosisCounts(groups);
    const summaries = groups.map(group => summaryOf(row(html, group.rule))).join("");
    const lozenges = (tone: string) => (summaries.match(new RegExp(`<span class="ui-lozenge" data-tone="${tone}">`, "g")) ?? []).length;
    expect(counts).toEqual({ missing: lozenges("warning"), unfavorable: lozenges("unfavorable"), favorable: lozenges("favorable") });
    expect(counts.unfavorable).toBe(groups.length);
    const listV3 = labels.diagnosis.listV3;
    const badge = (kind: string, aria: string, n: number) => {
      if (n === 0) { expect(html).not.toContain(`data-testid="diagnosis-count-${kind}"`); return; }
      expect(html).toContain(`data-testid="diagnosis-count-${kind}"`);
      expect(html).toContain(`<span class="ui-count-badge" role="img" aria-label="${fill(aria, { n })}">${n}</span>`);
    };
    badge("missing", listV3.countMissing, counts.missing);
    badge("unfavorable", listV3.countUnfavorable, counts.unfavorable);
    badge("favorable", listV3.countFavorable, counts.favorable);
    // 範圍文字只在標題列出現一次（13px，右側）。
    expect(html.match(/class="sec-scope"/g)).toHaveLength(1);
    expect(html).toContain(`<span class="sec-scope">${channelsLabel(snap.report.scope.channels, false)}</span>`);
    expect(html).toContain(`<p class="sub">${labels.ui.workspacePanels.diagnosisNote}</p>`);
    expect(html).not.toContain("diagnostic-grid");
    // 每一列的 <summary> 都不含互動元件（summary 本身就是展開鈕）也不含「｜」。
    for (const group of groups) {
      const summary = summaryOf(row(html, group.rule));
      expect(summary, group.rule).not.toMatch(/<button|<a\s|<input|<select|<details|tabindex/i);
      expect(text(summary), group.rule).not.toContain("｜");
    }
    // 狀態標籤與 alertStatus 一致（top-three 同一個判斷）。
    for (const group of groups) expect(summaryOf(row(html, group.rule))).toContain(`<span class="ui-lozenge" data-tone="${alertStatus(group)!.tone}">${alertStatus(group)!.text}</span>`);
  });

  it("summary holds only the lozenge, headline and impact text (scope label only when it differs from the page); the expanded body has the clickable amount, scope chips, 相關數字, cause, next step, limitation, then the actions", async () => {
    const snap = await snapshot();
    const group = diagnosisGroups(snap).groups.find(item => item.rule === "DISCOUNT_BURDEN_UP")!;
    const html = row(render(snap), "DISCOUNT_BURDEN_UP");
    const summary = summaryOf(html);
    expect(summary).toContain(`<span class="alert-loz"><span class="ui-lozenge" data-tone="unfavorable">${labels.format.unfavorable}</span></span><h3 class="alert-title diagnosis-headline">${group.headline}</h3>`);
    // 合計列的範圍和頁面範圍相同：summary 不再重複範圍標籤（v2 是「合計、DTC、MARKETPLACE」三個標籤）。
    expect(group.primary.scope.kind).toBe("all");
    expect(summary).not.toContain('class="scope-tag"');
    // summary 不放互動元件（<summary> 內有按鈕是巢狀互動）：影響金額是純文字，色調同可點的金額（−250 元，紅＝不利）；「影響金額」字樣只給輔助科技。
    expect(summary).not.toMatch(/<button|<a\s|<input|<select|tabindex/i);
    expect(summary).toContain(`<span class="diagnosis-impact"><span class="sr-only">${labels.sections.impact}</span><span class="impact-amount negative">${impactL1("-250.00")}</span></span>`);
    expect(summary).not.toContain(labels.buttons.viewEvidence);
    expect(summary).not.toContain(labels.buttons.addToActions);
    // 展開內容第一行：「影響金額 · 目前範圍」＋可點的影響金額。
    const body = html.slice(html.indexOf("</summary>"));
    expect(body).toMatch(new RegExp(`^</summary><div class="alert-body diagnosis-body"><p class="impact-line"><span>${fill(labels.diagnosisList.scopeImpact, { impact: labels.sections.impact, scope: labels.sections.total })}</span><button type="button" class="number-link impact-amount negative" aria-label="[^"]+">${impactL1("-250.00")}</button></p>`));
    // 每列只有一個可點的影響金額（E2E 以 .impact-line .impact-amount 取值）。
    expect(html.match(/class="impact-line"/g)).toHaveLength(1);
    // 段落順序：影響金額 → 範圍切換 → 相關數字 → 原因／下一步／限制 → 動作列（靠左）→ 技術細節。
    const order = ['class="impact-line"', 'class="scope-switch"', 'class="kv-heading"', 'class="kv-list fact-list"', 'class="diagnosis-copy"', 'class="diagnosis-actions"', 'class="diagnosis-technical"'].map(marker => body.indexOf(marker));
    expect(order.every(index => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const actions = body.slice(body.indexOf('<div class="diagnosis-actions">'), body.indexOf('<details class="diagnosis-technical">'));
    expect(text(actions)).toBe(`${labels.buttons.viewEvidence}${labels.buttons.addToActions}`);
    expect(actions.match(/<button type="button" class="ui-btn ui-btn-secondary">/g)).toHaveLength(2);
    // 範圍切換：合計預設按下，其他通路 aria-pressed=false。
    expect([...body.matchAll(/<button type="button" class="scope-chip" aria-pressed="(true|false)">([^<]*)<\/button>/g)].map(match => [match[2], match[1]])).toEqual([[labels.sections.total, "true"], ["DTC", "false"], ["MARKETPLACE", "false"]]);
    expect(body).toContain(`role="group" aria-label="${labels.diagnosisList.scopeSwitch}"`);
    expect(body).not.toContain('class="scope-more');
    // 相關數字（兩欄定義列表）：左「上期／本期 · 指標 · 範圍」，右整數元（L2）number-link，可開抽屜。
    const all = fill(labels.ui.workspacePanels.scopeAllWith, { channels: "DTC、MARKETPLACE" });
    expect(body).toContain(`<h4 class="kv-heading">${fill(labels.diagnosisList.dataFor, { data: labels.sections.data, scope: labels.sections.total })}</h4>`);
    expect(body).toContain(`<div><dt>${fill(labels.ui.workspacePanels.factLine, { period: labels.periods.previous, metric: labels.metrics.discounts.label, scope: all })}</dt><dd><button type="button" class="number-link"`);
    expect(body).toContain(fill(labels.ui.workspacePanels.factLine, { period: labels.periods.current, metric: labels.metrics.discounts.label, scope: all }));
    expect(body).toContain(`>${formatAmountL2("200.00")}</button></dd>`);
    expect(body).toContain(`>${formatAmountL2("450.00")}</button></dd>`);
    for (const heading of [labels.sections.cause, labels.sections.nextStep, labels.overview.alerts.limitation]) expect(body).toContain(`<dt>${heading}</dt>`);
    expect(body).toContain(`<div class="diagnosis-limit"><dt>${labels.overview.alerts.limitation}</dt><dd>${labels.rules.DISCOUNT_BURDEN_UP.caution}</dd></div>`);
    // 限制句不加「注意：」。
    expect(text(body)).not.toContain("注意：");
  });

  it("a channel-scope row shows its scope label in the summary because it differs from the page scope", async () => {
    const snap = await snapshot();
    const group = diagnosisGroups(snap).groups.find(item => item.rule === "NEGATIVE_CHANNEL_CM")!;
    expect(group.primary.scope.kind).toBe("channel");
    const summary = summaryOf(row(render(snap), "NEGATIVE_CHANNEL_CM"));
    expect([...summary.matchAll(/<span class="scope-tag">([^<]*)<\/span>/g)].map(match => match[1])).toEqual([group.scopes[0].label]);
    expect(summary.indexOf('class="scope-tag"')).toBeGreaterThan(summary.indexOf("</h3>"));
    expect(summary.indexOf('class="scope-tag"')).toBeLessThan(summary.indexOf('class="diagnosis-impact"'));
  });

  it("technical details keep the rule code, fact IDs, ranking amount link, limitations and metric version", async () => {
    const snap = await snapshot();
    const html = row(render(snap), "DISCOUNT_BURDEN_UP");
    const technical = html.slice(html.indexOf('<details class="diagnosis-technical">'));
    expect(technical).toMatch(new RegExp(`^<details class="diagnosis-technical"><summary>${labels.sections.technicalDetails}</summary>`));
    expect(technical).toContain("<code>DISCOUNT_BURDEN_UP</code>");
    expect(technical).toContain(`<dt>${labels.sections.rankingAmount}</dt>`);
    const group = diagnosisGroups(snap).groups.find(item => item.rule === "DISCOUNT_BURDEN_UP")!;
    const ranking = fill(labels.units.yuan, { value: formatSignedDelta("250.00", "L3") });
    expect(technical).toContain(`aria-label="${fill(labels.ui.workspacePanels.rankingAria, { title: group.headline, amount: ranking })}">${ranking}</button>`);
    expect(technical).toContain("<code>contribution-v1</code>");
    // 快照版本：資料版本與範圍版本（與匯出、備份同一組雜湊）。
    expect(technical).toContain(`<div><dt>${labels.csvColumns.dataset_hash}</dt><dd><code>${snap.dataset_hash}</code></dd></div>`);
    expect(technical).toContain(`<div><dt>${labels.csvColumns.filter_hash}</dt><dd><code>${snap.filter_hash}</code></dd></div>`);
    expect(snap.dataset_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(snap.filter_hash).toMatch(/^[a-f0-9]{64}$/);
    for (const id of group.primary.fact_ids) expect(technical).toContain(`<li><code>${id.replaceAll('"', "&quot;")}</code></li>`);
    for (const limit of group.primary.limitations) expect(technical).toContain(`<li>${limit}</li>`);
  });

  it("missing data row is first, tagged, and shows 資料待補 instead of an amount", async () => {
    const html = render(await snapshot("errors/missing_cogs"));
    const rows = [...html.matchAll(/data-testid="diagnosis-row-([A-Z_]+)"/g)].map(match => match[1]);
    expect(rows[0]).toBe("MISSING_CRITICAL_DATA");
    const summary = summaryOf(row(html, "MISSING_CRITICAL_DATA"));
    // V3-5：v2 的「先補資料」標籤改成 C8 狀態標籤「資料待補」（warning），計數徽章同步計入。
    expect(summary).toContain(`<span class="ui-lozenge" data-tone="warning">${labels.status.missing}</span>`);
    expect(summary).toContain(`<span class="impact-amount neutral">${labels.status.missing}</span>`);
    expect(summary).not.toContain("<button");
    expect(html).toContain(`<span class="ui-count-badge" role="img" aria-label="${fill(labels.diagnosis.listV3.countMissing, { n: 1 })}">1</span>`);
    expect(row(html, "MISSING_CRITICAL_DATA")).toMatch(/^<details class="alert diagnosis-row missing"/);
    // 展開內容第一行同樣顯示「資料待補」（沒有金額可開）。
    expect(row(html, "MISSING_CRITICAL_DATA")).toMatch(new RegExp(`<p class="impact-line"><span>[^<]*</span><span class="impact-amount neutral">${labels.status.missing}</span></p>`));
    // 本期合計商品成本未知：數據列顯示「資料待補」（不是 0，也不是「不適用」）。
    const metric = labels.metrics.cogs_net.label;
    const scope = fill(labels.ui.workspacePanels.scopeAllWith, { channels: "DTC、MARKETPLACE" });
    expect(row(html, "MISSING_CRITICAL_DATA")).toContain(`aria-label="${fill(labels.ui.workspacePanels.factAria, { period: labels.periods.current, metric, value: labels.status.missing, scope })}">${labels.status.missing}</button>`);
  });

  it("displayMetric: unknown is 資料待補 unless the only reason is a non-positive denominator", () => {
    expect(displayMetric("cogs_net", { value: null, reason_codes: ["MISSING_VALUE"] })).toBe(labels.status.missing);
    expect(displayMetric("cogs_net", { value: null, reason_codes: [] })).toBe(labels.status.missing);
    expect(displayMetric("discount_rate", { value: null, reason_codes: ["NON_POSITIVE_DENOMINATOR"] })).toBe(labels.status.notApplicable);
    expect(displayMetric("discount_rate", { value: null, reason_codes: ["MISSING_VALUE", "NON_POSITIVE_DENOMINATOR"] })).toBe(labels.status.missing);
    // 預設 L2（展開列的相關數字）：整數元、一位小數的比率與倍數；指定 L3 時到分。
    expect(displayMetric("net_revenue", { value: "-1234.50", reason_codes: [] })).toBe(formatAmountL2("-1234.50"));
    expect(displayMetric("net_revenue", { value: "-1234.50", reason_codes: [] }, "L3")).toBe(formatAmountL3("-1234.50"));
    expect(displayMetric("discount_rate", { value: "0.090100000000", reason_codes: [] })).toBe(formatRateL2("0.090100000000"));
    expect(displayMetric("discount_rate", { value: "0.090100000000", reason_codes: [] }, "L3")).toBe(formatRateL3("0.090100000000"));
    expect(displayMetric("mer", { value: "3.456", reason_codes: [] })).toBe(formatMultiple("3.456", "L2"));
  });

  it("SKU groups: the summary shows only the row's own scope; four scope chips stay inline and the rest move into the mounted 更多範圍 popover", async () => {
    const base = await snapshot();
    const scope = (index: number): Scope => ({ kind: "sku", channels: ["DTC"], sku: `S${String(index).padStart(2, "0")}` });
    const diagnostics: Diagnostic[] = Array.from({ length: 11 }, (_, index) => ({ id: `sku-${index}`, code: "SKU_NEGATIVE_GP", scope: scope(index), title: "", fact_ids: [], hypothesis: "", recommendation: "", limitations: [], ranking_amount: { value: `-${index + 1}.00`, reason_codes: [] } }));
    const html = render({ ...base, report: { ...base.report, diagnostics } });
    const sku = row(html, "SKU_NEGATIVE_GP");
    const summary = summaryOf(sku);
    // 列的範圍（|影響| 最大的 SKU）和頁面範圍不同 → summary 顯示一個範圍標籤；其他範圍不在 summary。
    expect([...summary.matchAll(/<span class="scope-tag">([^<]*)<\/span>/g)].map(match => match[1])).toEqual([fill(labels.ui.managerSummary.skuScope, { channels: "DTC", sku: "S10" })]);
    expect(summary).not.toContain(fill(labels.diagnosisList.moreScopes, { n: 3 }));
    // 11 個範圍都能選：前 4 個直接顯示，其餘 7 個收進「更多範圍」popover（<details> 收合時仍掛載，同樣是 role=group 的 chips）。
    expect(DIAGNOSIS_SCOPE_CHIPS).toBe(4);
    expect(sku.match(/class="scope-chip"/g)).toHaveLength(11);
    const more = sku.slice(sku.indexOf('<details class="scope-more'), sku.indexOf("</details>", sku.indexOf('<details class="scope-more')) + "</details>".length);
    expect(more).toMatch(new RegExp(`^<details class="scope-more ui-popover-host"><summary class="scope-chip scope-more-trigger">${escapeRegExp(fill(labels.diagnosis.listV3.moreScopes, { n: 7 }))}</summary><div class="ui-popover scope-more-panel"><div class="scope-chips" role="group" aria-label="${labels.diagnosisList.scopeSwitch}">`));
    expect(more.match(/<button type="button" class="scope-chip" aria-pressed="false">/g)).toHaveLength(7);
    const inline = sku.slice(sku.indexOf('<div class="scope-switch">'), sku.indexOf('<details class="scope-more'));
    expect(inline.match(/<button type="button" class="scope-chip"/g)).toHaveLength(4);
    expect(inline).toContain('<button type="button" class="scope-chip" aria-pressed="true">');
    // summary 裡沒有 popover（summary 不放互動元件）。
    expect(summary).not.toContain("scope-more");
    expect(rankingLabel("SKU_NEGATIVE_GP")).toBe(labels.diagnosisList.skuRanking);
  });

  it("an empty diagnosis shows the no-signal status instead of an empty list (and no count badges)", async () => {
    const base = await snapshot();
    const html = render({ ...base, report: { ...base.report, diagnostics: [] } });
    // V3-8（PRD §7.10「健檢沒有結果」、C10 區段型）：標題＋說明（role=status 沿用 v2，兩句合起來就是 v2 的 noDiagnostics）＋「查看健檢規則」文字按鈕；
    // 按鈕展開的 8 條規則說明保持掛載（hidden，M1），aria-controls 指到它。
    const empty = labels.data.pageV3.diagnosisEmpty;
    expect(`${empty.title}${empty.body}`).toBe(labels.ui.workspacePanels.noDiagnostics);
    expect(html).toContain(`<div class="ui-empty-block diagnosis-empty" data-testid="diagnosis-empty"><div role="status"><p class="diagnosis-empty-title">${empty.title}</p><p>${empty.body}</p></div>`);
    const button = new RegExp(`<button type="button" class="ui-btn ui-btn-text" aria-expanded="false" aria-controls="([^"]+)">${escapeRegExp(empty.action)}</button>`).exec(html);
    expect(button).not.toBeNull();
    const rules = new RegExp(`<ol id="${escapeRegExp(button![1])}" class="diagnosis-empty-rules" aria-label="${empty.rulesAria}" tabindex="-1" hidden="">(.*?)</ol>`).exec(html);
    expect(rules).not.toBeNull();
    expect(rules![1].match(/<li>/g)).toHaveLength(8);
    for (const text of Object.values(empty.rules)) expect(rules![1]).toContain(`<li>${text}</li>`);
    expect(html).not.toContain('data-testid="diagnosis-list"');
    expect(html).not.toContain("diagnosis-count-");
  });

  it("event overlap moves the 檔期 line into every row's expanded content (the headline stays unchanged)", async () => {
    const snap = await snapshot();
    const events = { filename: "events.csv", rows: [{ start: "2026-08-02", end: "2026-08-02", label: "夏季特賣", line: 2 }] };
    const html = render(snap, { events });
    const suffix = fill(labels.events.during, { label: "夏季特賣" });
    const line = `<div class="diagnosis-event"><dt>${labels.overview.alerts.eventPeriod}</dt><dd>${fill(labels.overview.alerts.eventValue, { label: "夏季特賣" })}</dd></div>`;
    for (const group of diagnosisGroups(snap).groups) {
      const rowHtml = row(html, group.rule);
      expect(summaryOf(rowHtml)).toContain(`<h3 class="alert-title diagnosis-headline">${group.headline}</h3>`);
      expect(rowHtml).not.toContain(suffix);
      expect(rowHtml.slice(rowHtml.indexOf("</summary>"))).toContain(line);
    }
    expect(render(snap)).not.toContain('class="diagnosis-event"');
  });
});

describe("rankingSelection keeps the R1 evidence behaviour", () => {
  it("delta rules carry the formula and previous/current components; current-only rules do not", async () => {
    const snap = await snapshot();
    const groups = diagnosisGroups(snap).groups;
    const discount = rankingSelection(snap, groups.find(item => item.rule === "DISCOUNT_BURDEN_UP")!.scopes[0], false)!;
    expect(discount.metric.value).toBe("250.00");
    expect(discount.formula).toBe(fill(labels.ui.workspacePanels.deltaFormula, { metric: labels.metrics.discounts.label }));
    expect(discount.components?.map(item => [item.label, item.metric.value])).toEqual([[labels.periods.previous, "200.00"], [labels.periods.current, "450.00"]]);
    expect(discount.period).toEqual({ start: "2026-08-01", end: "2026-08-02" });
    expect(discount.scopeLabel).toBe(labels.ui.workspacePanels.scopeAll);
    const negative = rankingSelection(snap, groups.find(item => item.rule === "NEGATIVE_CHANNEL_CM")!.scopes[0], false)!;
    expect(negative.metric.value).toBe("-15.00");
    expect(negative.formula).toBeUndefined();
    expect(negative.period).toEqual({ start: "2026-08-02", end: "2026-08-02" });
    expect(rankingLabel("NEGATIVE_CHANNEL_CM")).toBe(labels.ui.workspacePanels.rankingCurrent);
    expect(rankingLabel("REV_UP_CM_DOWN")).toBe(labels.sections.rankingAmount);
    const missing = diagnosisGroups(await snapshot("errors/missing_cogs")).groups[0];
    expect(rankingSelection(snap, missing.scopes[0], false)).toBeNull();
  });
});

describe("Diagnosis page and TopThree share the same groups", () => {
  it("V3-5 (PRD §7.2): the diagnosis list comes first (it is the conclusion), then 各通路兩期比較 with the channel wide table", async () => {
    const html = renderToStaticMarkup(createElement(Diagnosis, { snapshot: await snapshot(), onEvidence: noop }));
    expect(html.indexOf('aria-labelledby="channel-table-heading"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="diagnosis-list"')).toBeGreaterThan(-1);
    expect(html.indexOf('data-testid="diagnosis-list"')).toBeLessThan(html.indexOf('aria-labelledby="channel-table-heading"'));
    expect(html).toContain(`<h2 id="channel-table-heading">${labels.diagnosis.tableV3.heading}</h2>`);
    expect(html).toContain(`aria-label="${labels.sections.channelTableAria}"`);
    // 沒有 onCreateAction 時不顯示加入待辦。
    expect(html).not.toContain(labels.buttons.addToActions);
  });

  it("TopThree lists the first three groups with the same headline and impact, and keeps its anchors", async () => {
    const snap = await snapshot();
    const html = renderToStaticMarkup(createElement(TopThree, { snapshot: snap, onEvidence: noop, onCreateAction: noop }));
    const priorities = diagnosisGroups(snap).priorities;
    expect([...html.matchAll(/data-testid="overview-priority-([A-Z_]+)"/g)].map(match => match[1])).toEqual(priorities.map(group => group.rule));
    expect(priorities.map(group => group.rule)).toEqual(buildManagerSummary(snap).priorities.map(group => group.code));
    // V3-4a（C9 摘要型警示列）：標題是 summary 內的 h3.alert-title；相關範圍收進列內展開內容（第一列其餘 2 個範圍各一個 L2 影響金額）；
    // v2「另有 n 組未列出」改成區塊底部「查看全部 {n} 項健檢結果」（n＝健檢結果總數）。
    for (const group of priorities) expect(html).toContain(`<h3 class="alert-title">${group.headline}</h3>`);
    expect(html).toContain('data-testid="top-three"');
    expect(html).toContain('aria-describedby="top-three-threshold-help"');
    expect(html).toContain(fill(labels.diagnosisList.thresholdHelp, { amount: formatAmountL3("0.00") }));
    const firstScopes = html.slice(html.indexOf('<ul class="alert-scopes">'), html.indexOf("</ul>", html.indexOf('<ul class="alert-scopes">')));
    expect(html).toContain(`<dt>${labels.overview.alerts.relatedScopes}</dt>`);
    expect(firstScopes.match(/class="number-link impact-amount /g)).toHaveLength(priorities[0].scopes.length - 1);
    expect(priorities[0].scopes.length - 1).toBe(2);
    expect(html).toContain(fill(labels.overview.alerts.viewAll, { n: diagnosisGroups(snap).groups.length }));
    expect(diagnosisGroups(snap).omitted_group_count).toBe(3);
    // 三件事的影響金額是 L1（同一列只用一種尺度）。
    expect(text(html)).toContain(impactL1("-315.00"));
    expect(text(html)).toContain(impactL1("-250.00"));
  });
});
