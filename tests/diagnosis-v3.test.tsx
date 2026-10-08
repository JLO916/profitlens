import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildManagerSummary } from "@/application/manager-summary";
import { formatAmountL2, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { aiCollapseStatus, AiCollapse } from "@/components/ai-collapse";
import { ChannelWideTable, DEFAULT_CHANNEL_SORT, sortChannelRows } from "@/components/channel-table";
import { DiagnosisList, diagnosisCounts } from "@/components/diagnosis-list";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters, Diagnostic } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";

// V3-5 代理 A（PRD §7.2、§6.3 #33–#35、§9.4 C3／C8／C9）：通路寬表 diagnosis 變體（欄序、兩層表頭、排序、備註欄、手機清單屬性）、
// 計數徽章（含有利與中性）、AI 區收合。互動（點排序鈕、更多範圍 popover 的 Esc／點外面）由 E2E 驗；這裡驗 SSR 結構與純函式。
async function snapshot(name = "golden", filters: AnalysisFilters = {}) {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, filters, await hashInput(input));
}
const noop = () => undefined;
const text = (html: string) => html.replace(/<[^>]*>/g, "");
const tableV3 = labels.diagnosis.tableV3;
const renderTable = (snap: WorkspaceSnapshot, variant?: "default" | "diagnosis") => renderToStaticMarkup(<ChannelWideTable summary={buildManagerSummary(snap)} onEvidence={noop} ariaLabel={labels.overview.sections.channelTableAria} caption={labels.overview.sections.channelTableCaption} variant={variant} />);
const rowsOf = (html: string, part: "thead" | "tbody") => {
  const body = html.slice(html.indexOf(`<${part}`), html.indexOf(`</${part}>`));
  return [...body.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)].map(match => match[1]);
};
const cells = (row: string) => [...row.matchAll(/<(th|td)\b([^>]*)>([\s\S]*?)<\/\1>/g)].map(match => ({ tag: match[1], attrs: match[2], html: match[3], text: text(match[3]) }));
const attr = (attrs: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(attrs)?.[1] ?? null;

describe("通路寬表 diagnosis 變體（各通路兩期比較）", () => {
  it("欄序：通路｜本期淨營收｜上期淨營收｜差額｜本期扣廣告後貢獻｜上期｜差額｜備註；兩層表頭，欄群組標單位一次，caption 不再寫單位", async () => {
    const html = renderTable(await snapshot(), "diagnosis");
    expect(html).toMatch(new RegExp(`^<div class="table-scroll channel-table-scroll" tabindex="0" role="region" aria-label="${labels.overview.sections.channelTableAria}"><table class="ui-table channel-table-v3" role="table">`));
    expect(html).toContain(`<caption>${labels.overview.sections.channelTableCaption}</caption>`);
    expect(html).not.toContain(fill(labels.overview.channelTable.unitCaption, { caption: labels.overview.sections.channelTableCaption }));
    const [groupRow, columnRow] = rowsOf(html, "thead");
    const groups = cells(groupRow);
    expect(groups.map(cell => cell.text)).toEqual([labels.overview.channelTable.channelHeader, fill(labels.format.units.yuanColumn, { label: metricDefinitions.net_revenue.label }), fill(labels.format.units.yuanColumn, { label: metricDefinitions.contribution_after_marketing.label }), tableV3.note]);
    expect(groups.map(cell => [attr(cell.attrs, "rowSpan"), attr(cell.attrs, "colSpan"), attr(cell.attrs, "scope")])).toEqual([["2", null, "col"], [null, "3", "colgroup"], [null, "3", "colgroup"], ["2", null, "col"]]);
    expect(cells(columnRow).map(cell => cell.text)).toEqual([labels.shell.periods.current, labels.shell.periods.previous, tableV3.change, labels.shell.periods.current, labels.shell.periods.previous, tableV3.change]);
    // 單位「（元）」只在兩個欄群組標題出現；儲存格內不重複單位。
    const unit = fill(labels.format.units.yuanColumn, { label: "" });
    expect(html.split(unit)).toHaveLength(3);
    const yuan = fill(labels.format.units.yuan, { value: "" }).trim();
    for (const row of rowsOf(html, "tbody")) for (const cell of cells(row).slice(1, 7)) expect(cell.text).not.toContain(yuan);
  });

  it("可排序欄（本期淨營收、淨營收差額、本期扣廣告後貢獻、扣廣告後貢獻差額）：表頭是含 SVG icon 的按鈕；預設依本期扣廣告後貢獻由低到高，只有該欄設 aria-sort", async () => {
    const snap = await snapshot();
    const html = renderTable(snap, "diagnosis");
    const columnRow = cells(rowsOf(html, "thead")[1]);
    const buttons = columnRow.map(cell => /<button type="button" class="sort-button" data-label="[^"]*" aria-label="([^"]*)">/.exec(cell.html)?.[1] ?? null);
    const full = (name: "net_revenue" | "contribution_after_marketing", period: "current" | "change") => period === "change" ? fill(tableV3.changeLabel, { metric: metricDefinitions[name].label }) : fill(tableV3.cellLabel, { period: labels.shell.periods.current, metric: metricDefinitions[name].label });
    expect(buttons).toEqual([full("net_revenue", "current"), null, full("net_revenue", "change"), full("contribution_after_marketing", "current"), null, full("contribution_after_marketing", "change")]);
    for (const cell of columnRow) if (attr(cell.attrs, "class")!.includes("sortable")) expect(cell.html).toMatch(/<svg class="sort-icon"[^>]*aria-hidden="true"/);
    expect(columnRow.map(cell => attr(cell.attrs, "aria-sort"))).toEqual([null, null, null, "ascending", null, null]);
    expect(html.match(/aria-sort=/g)).toHaveLength(1);
    expect(DEFAULT_CHANNEL_SORT).toEqual({ key: "contribution_after_marketing:current", direction: "ascending" });
    // golden：MARKETPLACE 本期扣廣告後貢獻 −15.00 排在 DTC 270.00 之前。
    expect(rowsOf(html, "tbody").map(row => cells(row)[0].text)).toEqual(["MARKETPLACE", "DTC"]);
  });

  it("每格都是 number-link（L2 整數元、差額帶號、U+2212），差額只有不利上色；每格有明確的 role、data-label 與 data-list-role（手機清單）", async () => {
    const snap = await snapshot();
    const summary = buildManagerSummary(snap);
    const html = renderTable(snap, "diagnosis");
    expect(html).toMatch(/<thead role="rowgroup">/);
    expect(html).toMatch(/<tbody role="rowgroup">/);
    expect(html.match(/<tr\b/g)!.length).toBe(html.match(/<tr role="row"/g)!.length);
    for (const row of rowsOf(html, "thead")) for (const cell of cells(row)) expect(attr(cell.attrs, "role")).toBe("columnheader");
    for (const row of rowsOf(html, "tbody")) {
      const [name, ...rest] = cells(row);
      const channel = summary.channels.find(item => item.channel === name.text)!;
      expect([name.tag, attr(name.attrs, "role"), attr(name.attrs, "scope"), attr(name.attrs, "data-list-role"), attr(name.attrs, "data-label")]).toEqual(["th", "rowheader", "row", "primary", labels.overview.channelTable.channelHeader]);
      expect(rest.every(cell => cell.tag === "td" && attr(cell.attrs, "role") === "cell")).toBe(true);
      const short = (metric: "net_revenue" | "contribution_after_marketing", period: "current" | "previous" | "change") => period === "change" ? fill(tableV3.changeLabel, { metric: metricDefinitions[metric].shortLabel }) : fill(tableV3.cellLabel, { period: labels.shell.periods[period], metric: metricDefinitions[metric].shortLabel });
      expect(rest.map(cell => [attr(cell.attrs, "data-label"), attr(cell.attrs, "data-list-role")])).toEqual([
        [short("net_revenue", "current"), "secondary"], [short("net_revenue", "previous"), "secondary"], [short("net_revenue", "change"), "secondary"],
        [short("contribution_after_marketing", "current"), "labeled"], [short("contribution_after_marketing", "previous"), "secondary"], [short("contribution_after_marketing", "change"), "labeled"],
        [tableV3.note, "secondary"],
      ]);
      const values = [channel.revenue, channel.contribution].flatMap(metric => [formatAmountL2(metric.current.value), formatAmountL2(metric.previous.value), formatSignedDelta(metric.change.value, "L2")]);
      expect(rest.slice(0, 6).map(cell => cell.text)).toEqual(values);
      for (const cell of rest.slice(0, 6)) expect(cell.html).toMatch(/^<button type="button" class="number-link" aria-label="[^"]+">/);
    }
    // golden：MARKETPLACE 扣廣告後貢獻 170.00 → −15.00（差額 −185.00，不利上色）；淨營收差額 +90.00（有利不上色）。
    const marketplace = cells(rowsOf(html, "tbody")[0]);
    expect(marketplace[6].text).toBe(formatSignedDelta("-185.00", "L2"));
    expect(attr(marketplace[6].attrs, "class")).toBe("num negative");
    expect(attr(marketplace[3].attrs, "class")).toBe("num positive");
    expect(attr(marketplace[2].attrs, "class")).toBe("num prev");
  });

  it("備註欄：上期 > 0 且本期 < 0 標「轉負」（不利色），並連到該通路觸發的第一個健檢列（同頁錨點 #diagnosis-row-{rule}）", async () => {
    const snap = await snapshot();
    const summary = buildManagerSummary(snap);
    const html = renderTable(snap, "diagnosis");
    const [marketplace, dtc] = rowsOf(html, "tbody").map(row => cells(row)[7]);
    expect(marketplace.html).toContain(`<span class="ui-lozenge" data-tone="unfavorable">${labels.overview.channelsV3.turnedNegative}</span>`);
    expect(dtc.html).not.toContain("ui-lozenge");
    // 健檢結果的順序中，第一個範圍含該通路的群組（合計列以外）；golden 兩個通路都先命中「淨營收多…卻少賺…」。
    const first = summary.diagnosis[0];
    expect(first.rule).toBe("REV_UP_CM_DOWN");
    for (const note of [marketplace, dtc]) expect(note.html).toContain(`<a class="note-link" href="#diagnosis-row-REV_UP_CM_DOWN">${first.headline}</a>`);
    // 只選一個通路時，合計就是這個通路：連到健檢結果的第一列。
    const dtcOnly = await snapshot("golden", { channels: ["DTC"] });
    const dtcHtml = renderTable(dtcOnly, "diagnosis");
    const firstDtc = buildManagerSummary(dtcOnly).diagnosis[0];
    expect(cells(rowsOf(dtcHtml, "tbody")[0])[7].html).toBe(`<a class="note-link" href="#diagnosis-row-${firstDtc.rule}">${firstDtc.headline}</a>`);
  });

  it("sortChannelRows：只改呈現順序；由高到低反轉；資料待補一律排最後；同值保留原本順序", async () => {
    const golden = buildManagerSummary(await snapshot()).channels;
    const names = (rows: typeof golden) => rows.map(row => row.channel);
    expect(names(sortChannelRows(golden, DEFAULT_CHANNEL_SORT))).toEqual(["MARKETPLACE", "DTC"]);
    expect(names(sortChannelRows(golden, { key: "contribution_after_marketing:current", direction: "descending" }))).toEqual(["DTC", "MARKETPLACE"]);
    expect(names(sortChannelRows(golden, { key: "net_revenue:current", direction: "ascending" }))).toEqual(["MARKETPLACE", "DTC"]);
    expect(names(sortChannelRows(golden, { key: "net_revenue:change", direction: "descending" }))).toEqual(["DTC", "MARKETPLACE"]);
    expect(names(sortChannelRows(golden, { key: "contribution_after_marketing:change", direction: "ascending" }))).toEqual(["MARKETPLACE", "DTC"]);
    expect(names(golden)).toEqual(["DTC", "MARKETPLACE"]);
    // missing_cogs：DTC 本期扣廣告後貢獻是資料待補，升冪與降冪都排最後。
    const missing = buildManagerSummary(await snapshot("errors/missing_cogs")).channels;
    expect(missing.find(row => row.channel === "DTC")!.contribution.current.value).toBeNull();
    expect(names(sortChannelRows(missing, DEFAULT_CHANNEL_SORT))).toEqual(["MARKETPLACE", "DTC"]);
    expect(names(sortChannelRows(missing, { key: "contribution_after_marketing:current", direction: "descending" }))).toEqual(["MARKETPLACE", "DTC"]);
    // 同值：維持原本通路順序。
    const tie = golden.map(row => ({ ...row, revenue: { ...row.revenue, current: { value: "100.00", reason_codes: [] } } }));
    expect(names(sortChannelRows(tie, { key: "net_revenue:current", direction: "descending" }))).toEqual(["DTC", "MARKETPLACE"]);
  });

  it("default 變體（會議摘要）不變：上期／本期／差額欄序、caption 標單位、沒有排序與手機清單屬性", async () => {
    const html = renderTable(await snapshot());
    expect(html).not.toContain("channel-table-v3");
    expect(html).not.toContain("aria-sort");
    expect(html).not.toContain("data-list-role");
    expect(html).toContain(`<caption>${fill(labels.overview.channelTable.unitCaption, { caption: labels.overview.sections.channelTableCaption })}</caption>`);
    const headers = cells(rowsOf(html, "thead")[0]).map(cell => cell.text);
    expect(headers).toEqual([labels.overview.channelTable.channelHeader, ...(["net_revenue", "contribution_after_marketing"] as const).flatMap(name => [`${labels.shell.periods.previous}${metricDefinitions[name].shortLabel}`, `${labels.shell.periods.current}${metricDefinitions[name].shortLabel}`, `${metricDefinitions[name].shortLabel}${labels.exports.csv.suffix.change}`])]);
    expect(rowsOf(html, "tbody").map(row => cells(row)[0].text.replace(labels.overview.channelTable.turnedNegative, ""))).toEqual(["DTC", "MARKETPLACE"]);
    expect(html).toContain(labels.overview.channelTable.turnedNegative);
  });
});

describe("健檢結果的計數徽章", () => {
  it("有利、不利、資料待補各自計數；中性（影響金額為 0）不計；0 項的徽章不顯示", async () => {
    const base = await snapshot();
    const make = (id: string, code: Diagnostic["code"], value: string): Diagnostic => ({ id, code, scope: { kind: "all", channels: ["DTC", "MARKETPLACE"] }, title: "", fact_ids: [], hypothesis: "", recommendation: "", limitations: [], ranking_amount: { value, reason_codes: [] } });
    // 費用規則的排序金額是「本期 − 上期」：折扣少 50 元 → 影響金額 +50（有利）；廣告多 30 元 → −30（不利）；退款差 0 → 中性。
    const diagnostics = [make("a", "DISCOUNT_BURDEN_UP", "-50.00"), make("b", "MARKETING_BURDEN_UP", "30.00"), make("c", "REFUND_BURDEN_UP", "0.00")];
    const snap = { ...base, report: { ...base.report, diagnostics } };
    const html = renderToStaticMarkup(<DiagnosisList snapshot={snap} onEvidence={noop} />);
    const listV3 = labels.diagnosis.listV3;
    expect(html).toContain(`<span class="ui-count-badge" role="img" aria-label="${fill(listV3.countFavorable, { n: 1 })}">1</span>`);
    expect(html).toContain(`<span class="ui-count-badge" role="img" aria-label="${fill(listV3.countUnfavorable, { n: 1 })}">1</span>`);
    expect(html).not.toContain('data-testid="diagnosis-count-missing"');
    expect(html.match(/<details class="alert diagnosis-row"/g)).toHaveLength(3);
    expect(html.match(/<span class="ui-lozenge" data-tone="(favorable|unfavorable|warning)">/g)).toHaveLength(2);
    // 狀態字對輔助科技隱藏（可及名稱已是完整意思），可見文字是「有利 1」「不利 1」。
    expect(html).toContain(`<span class="diagnosis-badge-text" data-tone="favorable" aria-hidden="true">${labels.format.favorable}</span>`);
    expect(diagnosisCounts([{ missing: true, impact_cents: null }, { missing: false, impact_cents: "-1.00" }, { missing: false, impact_cents: "0.00" }])).toEqual({ missing: 1, unfavorable: 1, favorable: 0 });
  });
});

describe("AI 區收合（AI 解釋 · 狀態）", () => {
  it("狀態字與頂欄 AI 狀態同一套判斷；公開示範站才加「不送出任何資料」", () => {
    const copy = labels.diagnosis.aiCollapse;
    expect(aiCollapseStatus(null)).toBe(copy.status.unknown);
    expect(aiCollapseStatus({ available: false, reason: "STATUS_UNAVAILABLE", provider: "openai" })).toBe(copy.status.unknown);
    expect(aiCollapseStatus({ available: true, reason: "AVAILABLE", provider: "openai" })).toBe(copy.status.needsConsent);
    expect(aiCollapseStatus({ available: false, reason: "PUBLIC_DEMO", provider: "openai" })).toBe(copy.status.off);
    expect(aiCollapseStatus({ available: false, reason: "DISABLED", provider: "openai" })).toBe(copy.status.off);
    const demo = renderToStaticMarkup(<AiCollapse capability={{ available: false, reason: "PUBLIC_DEMO", provider: "openai" }}><p>x</p></AiCollapse>);
    expect(demo).toMatch(/^<details class="ai-collapsed" data-testid="ai-collapsed"><summary>/);
    expect(text(demo.slice(0, demo.indexOf("</summary>")))).toBe(`${fill(copy.summary, { status: copy.status.off })}${copy.publicNote}`);
    const off = renderToStaticMarkup(<AiCollapse capability={{ available: false, reason: "DISABLED", provider: "openai" }}><p>x</p></AiCollapse>);
    expect(off).not.toContain(copy.publicNote);
    expect(off).toContain("<p>x</p></details>");
  });
});
