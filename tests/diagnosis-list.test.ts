import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { diagnosisGroups } from "../src/application/diagnosis-group";
import { buildManagerSummary } from "../src/application/manager-summary";
import { formatAmountL2, formatAmountL3, formatMultiple, formatRateL2, formatRateL3, formatSignedDelta } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { DIAGNOSIS_DEFAULT_OPEN, DiagnosisList, displayMetric, rankingLabel, rankingSelection } from "../src/components/diagnosis-list";
import { TopThree } from "../src/components/top-three";
import { Diagnosis } from "../src/components/workspace-panels";
import { validateDataset } from "../src/domain/validation";
import type { AnalysisFilters, Diagnostic, Scope } from "../src/domain/types";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// R5-1 健檢清單的 DOM 契約（E2E 錨點）：ol[data-testid=diagnosis-list] > li > details[data-testid=diagnosis-row-<code>]。
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
/** V3-2b：影響金額是 L1（萬／元、U+2212）；相關數字是 L2（整數元）；技術細節的排序金額是 L3 到分。 */
const impactL1 = (value: string) => formatSignedDelta(value, "L1");

describe("DiagnosisList renders one collapsible row per rule", () => {
  it("golden: list order, testids, first three rows open, count tag", async () => {
    const snap = await snapshot();
    const html = render(snap);
    const groups = diagnosisGroups(snap).groups;
    expect(html).toContain('data-testid="diagnosis-panel"');
    expect(html).toContain('<ol class="diagnosis-list" data-testid="diagnosis-list"');
    const rows = [...html.matchAll(/<details([^>]*)data-testid="diagnosis-row-([A-Z_]+)"([^>]*)>/g)];
    expect(rows.map(match => match[2])).toEqual(groups.map(group => group.rule));
    expect(rows.map(match => /\sopen(?:=|\s|$)/.test(`${match[1]} ${match[3]}`))).toEqual(groups.map((_, index) => index < DIAGNOSIS_DEFAULT_OPEN));
    expect(html).toContain(`<span class="tag">${fill(labels.ui.workspacePanels.itemCount, { n: groups.length })}</span>`);
    expect(html).toContain(`<span class="tag">${labels.sections.autoCheck}</span>`);
    expect(html).not.toContain("diagnostic-grid");
    // 每一列的 <summary> 都不含按鈕（summary 本身就是展開鈕）。
    for (const group of groups) expect(summaryOf(row(html, group.rule)), group.rule).not.toContain("<button");
  });

  it("summary holds only non-interactive headline, scope labels and impact text; the clickable amount and actions open the expanded body", async () => {
    const snap = await snapshot();
    const group = diagnosisGroups(snap).groups.find(item => item.rule === "DISCOUNT_BURDEN_UP")!;
    const html = row(render(snap), "DISCOUNT_BURDEN_UP");
    const summary = summaryOf(html);
    expect(summary).toContain(`<h3 class="diagnosis-headline">${group.headline}</h3>`);
    expect([...summary.matchAll(/<span class="scope-tag">([^<]*)<\/span>/g)].map(match => match[1])).toEqual([labels.sections.total, "DTC", "MARKETPLACE"]);
    // summary 不放互動元件（<summary> 內有按鈕是巢狀互動）：影響金額是純文字，色調同可點的金額（−250 元，紅＝不利）。
    expect(summary).not.toMatch(/<button|<a\s|<input|<select|tabindex/i);
    expect(summary).toContain(`<span class="diagnosis-impact"><span class="diagnosis-impact-label">${labels.sections.impact}</span><span class="impact-amount negative">${impactL1("-250.00")}</span></span>`);
    expect(summary).not.toContain(labels.buttons.viewEvidence);
    expect(summary).not.toContain(labels.buttons.addToActions);
    // 展開內容第一行：可點的影響金額（目前範圍）、看證據、加入待辦。
    const body = html.slice(html.indexOf("</summary>"));
    expect(body.indexOf('class="diagnosis-actions"')).toBeLessThan(body.indexOf('class="scope-switch"'));
    const firstLine = body.slice(body.indexOf('<div class="diagnosis-actions">'), body.indexOf('<div class="scope-switch"'));
    expect(firstLine.indexOf('<p class="impact-line">')).toBe('<div class="diagnosis-actions">'.length);
    expect(text(firstLine)).toBe(`${fill(labels.diagnosisList.scopeImpact, { impact: labels.sections.impact, scope: labels.sections.total })}${impactL1("-250.00")}${labels.buttons.viewEvidence}${labels.buttons.addToActions}`);
    expect(firstLine).toMatch(new RegExp(`<p class="impact-line"><span>[^<]*</span><button type="button" class="number-link impact-amount negative" aria-label="[^"]+">${impactL1("-250.00")}</button></p>`));
    // 每列只有一個可點的影響金額（E2E 以 .impact-line .impact-amount 取值）。
    expect(html.match(/class="impact-line"/g)).toHaveLength(1);
    // 範圍切換：合計預設按下，其他通路 aria-pressed=false。
    expect([...body.matchAll(/<button type="button" class="scope-chip" aria-pressed="(true|false)">([^<]*)<\/button>/g)].map(match => [match[2], match[1]])).toEqual([[labels.sections.total, "true"], ["DTC", "false"], ["MARKETPLACE", "false"]]);
    expect(body).toContain(`role="group" aria-label="${labels.diagnosisList.scopeSwitch}"`);
    // 數據：上期／本期 × 指標 × 範圍，數字可開抽屜。
    const all = fill(labels.ui.workspacePanels.scopeAllWith, { channels: "DTC、MARKETPLACE" });
    expect(body).toContain(fill(labels.ui.workspacePanels.factLine, { period: labels.periods.previous, metric: labels.metrics.discounts.label, scope: all }));
    expect(body).toContain(fill(labels.ui.workspacePanels.factLine, { period: labels.periods.current, metric: labels.metrics.discounts.label, scope: all }));
    expect(body).toContain(`>${formatAmountL2("200.00")}</button>`);
    expect(body).toContain(`>${formatAmountL2("450.00")}</button>`);
    for (const heading of [labels.sections.cause, labels.sections.nextStep, labels.sections.caution]) expect(body).toContain(`<dt>${heading}</dt>`);
    expect(body).toContain(`<dd>${labels.rules.DISCOUNT_BURDEN_UP.caution}</dd>`);
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
    expect(summary).toContain(`<span class="tag blocking">${labels.ui.workspacePanels.tagMissingData}</span>`);
    expect(summary).toContain(`<span class="impact-amount neutral">${labels.status.missing}</span>`);
    expect(summary).not.toContain("<button");
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

  it("SKU groups show at most eight 通路／SKU labels plus 等 n 個, and every scope stays selectable", async () => {
    const base = await snapshot();
    const scope = (index: number): Scope => ({ kind: "sku", channels: ["DTC"], sku: `S${String(index).padStart(2, "0")}` });
    const diagnostics: Diagnostic[] = Array.from({ length: 11 }, (_, index) => ({ id: `sku-${index}`, code: "SKU_NEGATIVE_GP", scope: scope(index), title: "", fact_ids: [], hypothesis: "", recommendation: "", limitations: [], ranking_amount: { value: `-${index + 1}.00`, reason_codes: [] } }));
    const html = render({ ...base, report: { ...base.report, diagnostics } });
    const sku = row(html, "SKU_NEGATIVE_GP");
    const summary = summaryOf(sku);
    expect([...summary.matchAll(/<span class="scope-tag">([^<]*)<\/span>/g)]).toHaveLength(8);
    expect(summary).toContain(`<span class="scope-tag more">${fill(labels.diagnosisList.moreScopes, { n: 3 })}</span>`);
    expect(summary).toContain(fill(labels.ui.managerSummary.skuScope, { channels: "DTC", sku: "S10" }));
    expect(sku.match(/class="scope-chip"/g)).toHaveLength(11);
    expect(sku).toContain(`<details class="scope-more"><summary>${fill(labels.diagnosisList.moreScopes, { n: 3 })}</summary>`);
    expect(rankingLabel("SKU_NEGATIVE_GP")).toBe(labels.diagnosisList.skuRanking);
  });

  it("an empty diagnosis shows the no-signal status instead of an empty list", async () => {
    const base = await snapshot();
    const html = render({ ...base, report: { ...base.report, diagnostics: [] } });
    expect(html).toContain(`<p role="status">${labels.ui.workspacePanels.noDiagnostics}</p>`);
    expect(html).not.toContain('data-testid="diagnosis-list"');
  });

  it("event overlap adds the 檔期 suffix to every headline", async () => {
    const snap = await snapshot();
    const events = { filename: "events.csv", rows: [{ start: "2026-08-02", end: "2026-08-02", label: "夏季特賣", line: 2 }] };
    const html = render(snap, { events });
    const suffix = fill(labels.events.during, { label: "夏季特賣" });
    for (const group of diagnosisGroups(snap).groups) expect(html).toContain(`${group.headline}${suffix}</h3>`);
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
  it("channel table comes first, then the diagnosis list", async () => {
    const html = renderToStaticMarkup(createElement(Diagnosis, { snapshot: await snapshot(), onEvidence: noop }));
    expect(html.indexOf('aria-labelledby="channel-table-heading"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-labelledby="channel-table-heading"')).toBeLessThan(html.indexOf('data-testid="diagnosis-list"'));
    // 沒有 onCreateAction 時不顯示加入待辦。
    expect(html).not.toContain(labels.buttons.addToActions);
  });

  it("TopThree lists the first three groups with the same headline and impact, and keeps its anchors", async () => {
    const snap = await snapshot();
    const html = renderToStaticMarkup(createElement(TopThree, { snapshot: snap, onEvidence: noop, onCreateAction: noop }));
    const priorities = diagnosisGroups(snap).priorities;
    expect([...html.matchAll(/data-testid="overview-priority-([A-Z_]+)"/g)].map(match => match[1])).toEqual(priorities.map(group => group.rule));
    expect(priorities.map(group => group.rule)).toEqual(buildManagerSummary(snap).priorities.map(group => group.code));
    for (const group of priorities) expect(html).toContain(`<h3>${group.headline}</h3>`);
    expect(html).toContain('data-testid="top-three"');
    expect(html).toContain('aria-describedby="top-three-threshold-help"');
    expect(html).toContain(fill(labels.diagnosisList.thresholdHelp, { amount: formatAmountL3("0.00") }));
    expect(html).toContain(fill(labels.ui.topThree.relatedScopesCount, { n: 2 }));
    expect(html).toContain(fill(labels.notes.omittedGroups, { n: 3 }));
    // 三件事的影響金額是 L1（同一列只用一種尺度）。
    expect(text(html)).toContain(impactL1("-315.00"));
    expect(text(html)).toContain(impactL1("-250.00"));
  });
});
