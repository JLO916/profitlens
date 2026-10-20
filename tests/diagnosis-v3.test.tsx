import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { CHANNEL_WEEKS_MAX_CHANNELS, CHANNEL_WEEKS_VERSION, channelWeeks } from "@/application/chart-channel-weeks";
import { chartColors } from "@/application/chart-theme";
import { channelLabel, snapshotResolver } from "@/application/copy";
import { evidenceFilterText } from "@/application/evidence-filter";
import { buildManagerSummary } from "@/application/manager-summary";
import { deltaTone, formatAmountL2, formatAmountL3, formatPeriodL1, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { aiCollapseStatus, AiCollapse } from "@/components/ai-collapse";
import { CHANNEL_WEEKS_TABLE_TESTID, CHANNEL_WEEKS_TOO_MANY_TESTID, ChannelWideTable, DEFAULT_CHANNEL_SORT, channelSparkTestId, channelWeekEvidence, channelWeeksState, sortChannelRows } from "@/components/channel-table";
import { DiagnosisList, diagnosisCounts } from "@/components/diagnosis-list";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { parseCents } from "@/domain/money";
import { validateDataset } from "@/domain/validation";
import type { AnalysisFilters, Diagnostic } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, openTag } from "./helpers/markup";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

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

// ── V4-3a 代理 B：G7b 通路寬表「近 {n} 週」sparkline 與「各通路每週」資料表（PRD §4.1–§4.7 G7、§5.2 第 6 列、§8.7；CHART_CATALOG G7（b））。
// 健檢頁傳入 snapshot 時才有（channelWeeks 在元件內 useMemo 計算，不進快照）；上面的 V3-5 斷言不傳 snapshot，結構逐字不變。
describe("G7b 通路寬表「近 {n} 週」與「各通路每週」（V4-3a）", () => {
  const spark = labels.diagnosis.chartsV4.channelsSpark;
  const metricLabel = metricDefinitions.contribution_after_marketing.label;
  const renderG7b = (snap: WorkspaceSnapshot) => renderToStaticMarkup(<ChannelWideTable summary={buildManagerSummary(snap)} snapshot={snap} onEvidence={noop} ariaLabel={labels.overview.sections.channelTableAria} caption={labels.overview.sections.channelTableCaption} variant="diagnosis" />);
  const syntheticSnapshot = async () => { const input = synthetic4ChannelInput(); return createSnapshot(validateDataset(input).dataset!, {}, await hashInput(input)); };
  const sparkCell = (row: string) => cells(row).find(cell => attr(cell.attrs, "class") === "spark-cell")!;
  const detailsOf = (html: string) => element(html.slice(html.indexOf('<details class="data-alternative"')), '<details class="data-alternative"')!;

  it("示範資料：扣廣告後貢獻欄群組與備註欄之間多一欄「近 6 週」（rowspan 2、colgroup 一欄）；每通路一格 td.spark-cell（data-list-role=spark），內含 aria-hidden 的 C19 sparkline", async () => {
    const snap = await snapshot("demo");
    const html = renderG7b(snap);
    const head = fill(spark.head, { n: 6 });
    expect(head).toBe("近 6 週");
    const groups = cells(rowsOf(html, "thead")[0]);
    expect(groups.map(cell => cell.text)).toEqual([labels.overview.channelTable.channelHeader, fill(labels.format.units.yuanColumn, { label: metricDefinitions.net_revenue.label }), fill(labels.format.units.yuanColumn, { label: metricLabel }), head, tableV3.note]);
    expect([attr(groups[3].attrs, "role"), attr(groups[3].attrs, "scope"), attr(groups[3].attrs, "rowSpan"), attr(groups[3].attrs, "class")]).toEqual(["columnheader", "col", "2", "spark-head"]);
    expect(cells(rowsOf(html, "thead")[1])).toHaveLength(6);
    expect(html.match(/<colgroup/g)).toHaveLength(5);
    const data = channelWeeks(snap)!;
    for (const row of rowsOf(html, "tbody")) {
      const all = cells(row);
      expect(all).toHaveLength(9);
      const channel = snap.report.scope.channels.find(code => all[0].text === channelLabel(code, snapshotResolver(snap)))!;
      const cell = all[7];
      expect([cell.tag, attr(cell.attrs, "role"), attr(cell.attrs, "class"), attr(cell.attrs, "data-label"), attr(cell.attrs, "data-list-role")]).toEqual(["td", "cell", "spark-cell", head, "spark"]);
      const svg = openTag(cell.html, `data-testid="${channelSparkTestId(channel)}"`)!;
      expect(svg).toMatch(/^<svg class="spark" data-chart-kind="spark" /);
      expect(svg).toContain('aria-hidden="true"');
      expect(svg).toContain('focusable="false"');
      expect(svg).toContain('data-points="6"');
      expect(cell.html).not.toMatch(/tabindex|<button|<a /i);
      // 示範資料 6 週都是完整週：一條連續折線，最後一點是本期實心點。
      expect(cell.html.match(/<polyline /g)).toHaveLength(1);
      expect(cell.html).toContain(`fill="${chartColors.current}"`);
      expect(cell.html).not.toContain('data-kind="hollow"');
      // 圖形座標只用 Number 近似值；數值本身仍是 domain 的精確字串（逐週加總＝本期合計）。
      const values = data.channels.find(series => series.channel === channel)!.values.map(value => value.metric.value!);
      expect(values.reduce((sum, value) => sum + parseCents(value)!, 0n)).toBe(parseCents(snap.report.current.channels[channel].metrics.contribution_after_marketing.value));
    }
    expect(html.match(/data-chart-kind="spark"/g)).toHaveLength(snap.report.scope.channels.length);
    // CL-1（sparkline 在 tr 內、同列有數字）、CL-2（命名）、CL-11（aria-hidden）都是 0。
    const { violations } = checkChartMarkup(html, { page: "diagnosis" });
    expect([violations["CL-1"], violations["CL-2"], violations["CL-11"]]).toEqual([[], [], []]);
  });

  it("「各通路每週」：表格之後的收合 <details class=data-alternative>（保持掛載）；列＝通路（順序同寬表目前的排序），欄＝近 6 週，格＝扣廣告後貢獻 L2 number-link", async () => {
    const snap = await snapshot("demo");
    const html = renderG7b(snap);
    const resolver = snapshotResolver(snap);
    expect(html.indexOf('<details class="data-alternative"')).toBeGreaterThan(html.indexOf("</table></div>"));
    const details = detailsOf(html);
    expect(openTag(details, '<details class="data-alternative"')).toBe('<details class="data-alternative">');
    expect(details).toContain(`<summary>${fill(labels.overview.page.dataTable, { title: spark.tableTitle })}</summary>`);
    const caption = fill(spark.caption, { metric: metricLabel, n: 6 });
    expect(caption).toBe("各通路每週扣廣告後貢獻（本期最後 6 週，元）");
    expect(details).toContain(`<div class="table-scroll chart-data-scroll" role="region" tabindex="0" aria-label="${caption}">`);
    const table = byTestId(details, CHANNEL_WEEKS_TABLE_TESTID);
    expect(table).toContain(`<caption>${caption}</caption>`);
    const data = channelWeeks(snap)!;
    const head = cells(rowsOf(table, "thead")[0]);
    expect(head.map(cell => cell.text)).toEqual([labels.overview.channelTable.channelHeader, ...data.weeks.map(week => `${week.label}${formatPeriodL1(week.period.start, week.period.end, { anchor: snap.data_as_of, days: false })}`)]);
    const body = rowsOf(table, "tbody");
    // 預設排序（本期扣廣告後貢獻由低到高）＝寬表的列序。
    const order = sortChannelRows(buildManagerSummary(snap).channels, DEFAULT_CHANNEL_SORT).map(row => row.channel);
    expect(body.map(row => cells(row)[0].text)).toEqual(order.map(channel => channelLabel(channel, resolver)));
    for (const [index, row] of body.entries()) {
      const series = data.channels.find(item => item.channel === order[index])!;
      const values = cells(row).slice(1);
      expect(values).toHaveLength(6);
      values.forEach((cell, week) => {
        const text = formatAmountL2(series.values[week].metric.value!);
        expect(cell.text).toBe(text);
        // V4-8a（D-V4-45＝B）：不利（deltaTone L2）的週值帶 C33 unfavorable（number-link negative）。
        const linkClass = deltaTone("contribution_after_marketing", series.values[week].metric.value, "L2") === "unfavorable" ? "number-link negative" : "number-link";
        expect(cell.html).toBe(`<button type="button" class="${linkClass}" aria-label="${fill(labels.overview.channelsV3.amountAria, { channel: channelLabel(series.channel, resolver), metric: fill(tableV3.cellLabel, { period: data.weeks[week].label, metric: metricLabel }), value: text })}">${text}</button>`);
      });
    }
    // V4-8a（D-V4-45＝B）示範資料：MARKETPLACE 六週都不利、上不利色；其他通路不上色（D-V3-7 有利不上色）。
    expect(body.map(row => [cells(row)[0].text, cells(row).slice(1).filter(cell => cell.html.startsWith('<button type="button" class="number-link negative"')).length])).toEqual(order.map(channel => [channelLabel(channel, resolver), channel === "MARKETPLACE" ? 6 : 0]));
    // 6 週都是完整週：沒有「未滿 7 天」欄註與表後說明。
    expect(details).not.toContain(labels.overview.trendV3.incompleteShort);
    expect(details).not.toContain(fill(spark.incompleteNote, { metric: metricLabel }));
  });

  it("每格的抽屜（channelWeekEvidence）：該通路該週的扣廣告後貢獻；filter 篩到該週與該通路；metric_version 維持 contribution-v1，另列 arrangeVersion channel-weeks-v1；大數字不帶正負號", async () => {
    const input = fixture("demo");
    const dataset = validateDataset(input).dataset!;
    const snap = await createSnapshot(dataset, {}, await hashInput(input));
    const data = channelWeeks(snap)!;
    for (const series of data.channels) data.weeks.forEach((week, index) => {
      const value = series.values[index];
      expect(channelWeekEvidence(series, week, value)).toEqual({
        name: "contribution_after_marketing", metric: value.metric, period: week.period, channels: [series.channel], sources: value.sources, title: metricLabel,
        filter: { week: { start: week.period.start, end: week.period.end, label: week.label }, channel: series.channel }, arrangeVersion: CHANNEL_WEEKS_VERSION,
      });
    });
    // DTC 每週為正：大數字與精確值是水準值，不帶「+」（沒有 components，PRD §8.7 第 3 點）。
    const dtc = data.channels.find(series => series.channel === "DTC")!;
    const evidence = channelWeekEvidence(dtc, data.weeks[0], dtc.values[0]);
    expect(parseCents(evidence.metric.value)! > 0n).toBe(true);
    expect(evidence).not.toHaveProperty("metricVersion");
    expect(evidence).not.toHaveProperty("components");
    const drawer = renderToStaticMarkup(<EvidenceDrawer dataset={dataset} snapshot={snap} evidence={evidence} onClose={noop} />);
    const technical = element(drawer, 'class="evidence-technical"')!;
    expect(technical).toContain("<div><dt>metric_version</dt><dd><code>contribution-v1</code></dd></div>");
    expect(technical).toContain(`<div data-testid="evidence-arrange-version"><dt>${labels.evidence.chartsV4.arrangeVersion}</dt><dd><code>${CHANNEL_WEEKS_VERSION}</code></dd></div>`);
    expect(drawer).toContain(fill(labels.format.units.yuan, { value: formatAmountL3(evidence.metric.value!) }));
    expect(drawer).not.toContain(formatSignedDelta(evidence.metric.value!, "L3"));
    expect(byTestId(drawer, "evidence-filter")).toContain(evidenceFilterText(evidence.filter, { resolver: snapshotResolver(snap), anchor: dataset.manifest.data_as_of })!);
  });

  // V4-3a 代理 E（合併 A 的 ladderMetrics 修正與 B 的 channelWeekEvidence 之後才能寫；06 V4-3a 驗收重點「單一通路週證據不畫全通路階梯（SSR）」）。
  it("合併後：「各通路每週」每一格的抽屜都不畫全部通路的四層階梯——示範資料與合成資料（週≠本期）一格都沒有 .ladder-table；golden（本期 1 天＝那一週）畫的是該通路自己的階梯，不是全通路合計", async () => {
    const drawerOf = async (name: "demo" | "golden" | "synthetic") => {
      const input = name === "synthetic" ? synthetic4ChannelInput() : fixture(name);
      const dataset = validateDataset(input).dataset!;
      const snap = await createSnapshot(dataset, {}, await hashInput(input));
      const data = channelWeeks(snap)!;
      const cellsOf = data.channels.flatMap(series => data.weeks.map((week, index) => ({ series, week, evidence: channelWeekEvidence(series, week, series.values[index]) })));
      return { snap, data, cells: cellsOf.map(cell => ({ ...cell, html: renderToStaticMarkup(<EvidenceDrawer dataset={dataset} snapshot={snap} evidence={cell.evidence} onClose={noop} />) })) };
    };
    for (const name of ["demo", "synthetic"] as const) {
      const { snap, data, cells: drawers } = await drawerOf(name);
      expect(drawers, name).toHaveLength(snap.report.scope.channels.length * data.weeks.length);
      for (const { series, week, html } of drawers) {
        expect(html, `${name} ${series.channel} ${week.label}`).not.toContain("ladder-table");
        expect(element(html, 'class="evidence-technical"'), `${name} ${series.channel} ${week.label}`).toContain(`<dd><code>${CHANNEL_WEEKS_VERSION}</code></dd>`);
      }
    }
    // golden：本期只有 8/02 一天，那一週的起訖等於本期，單一通路證據取 report.current.channels[通路]（該通路的階梯；DTC 270.00、MARKETPLACE −15.00），
    // 不是全部通路的合計 255.00（修正前的週查找會落到 snapshot.weeks 的全通路週值）。
    const golden = await drawerOf("golden");
    expect(golden.cells).toHaveLength(2);
    const total = fill(labels.format.units.yuan, { value: formatAmountL3(golden.snap.report.current.metrics.contribution_after_marketing.value!) });
    for (const { series, html } of golden.cells) {
      const current = element(html, 'class="current"')!;
      expect(current, series.channel).toContain(fill(labels.format.units.yuan, { value: formatAmountL3(golden.snap.report.current.channels[series.channel].metrics.contribution_after_marketing.value!) }));
      expect(current, series.channel).not.toContain(total);
    }
  }, 30_000);

  it("golden（本期 1 天，只有 1 週、未滿 7 天）：欄名「近 1 週」；每條 sparkline 只有 1 個空心點（X40）；資料表欄頭註「未滿 7 天」、表後有說明", async () => {
    const snap = await snapshot();
    const html = renderG7b(snap);
    expect(cells(rowsOf(html, "thead")[0])[3].text).toBe(fill(spark.head, { n: 1 }));
    for (const channel of ["DTC", "MARKETPLACE"]) {
      const svg = element(html, `data-testid="${channelSparkTestId(channel)}"`)!;
      expect(svg).toContain('data-points="1"');
      expect(svg).not.toContain("<polyline");
      expect(svg.match(/<circle /g)).toHaveLength(1);
      expect(svg).toContain('data-kind="hollow"');
      expect(svg).toContain(`fill="${chartColors.surface}"`);
    }
    const details = detailsOf(html);
    expect(details).toContain(`<small>${labels.overview.trendV3.incompleteShort}</small>`);
    expect(details).toContain(`<p class="note">${fill(spark.incompleteNote, { metric: metricLabel })}</p>`);
    const table = byTestId(details, CHANNEL_WEEKS_TABLE_TESTID);
    expect(rowsOf(table, "tbody").map(row => cells(row).map(cell => cell.text))).toEqual([["MARKETPLACE", formatAmountL2("-15.00")], ["DTC", formatAmountL2("270.00")]]);
    // V4-8a（D-V4-45＝B）：MARKETPLACE −15.00 不利、上不利色；DTC 270.00 不上色。
    expect(rowsOf(table, "tbody").map(row => cells(row).slice(1).map(cell => cell.html.startsWith('<button type="button" class="number-link negative"')))).toEqual([[true], [false]]);
  });

  it("合成資料 4 通路：LIVE 本期扣廣告後貢獻資料待補 → 那一格不畫 sparkline（格仍在）；其餘 3 條各 3 點、最後一週未滿 7 天是空心點、折線只連前兩週；資料表 LIVE 缺列的週寫「資料待補」", async () => {
    const snap = await syntheticSnapshot();
    const html = renderG7b(snap);
    const rows = rowsOf(html, "tbody");
    const rowOf = (channel: string) => rows.find(row => cells(row)[0].text === channel)!;
    expect(sparkCell(rowOf("LIVE")).html).toBe("");
    expect(html).not.toContain(channelSparkTestId("LIVE"));
    for (const channel of ["DTC", "MARKETPLACE", "SOCIAL"]) {
      const svg = element(sparkCell(rowOf(channel)).html, `data-testid="${channelSparkTestId(channel)}"`)!;
      expect(svg, channel).toContain('data-points="3"');
      expect(svg.match(/<polyline /g), channel).toHaveLength(1);
      expect(svg, channel).toContain('data-kind="hollow"');
    }
    const table = byTestId(detailsOf(html), CHANNEL_WEEKS_TABLE_TESTID);
    const live = cells(rowsOf(table, "tbody").find(row => cells(row)[0].text === "LIVE")!).slice(1);
    expect(live.map(cell => cell.text)).toEqual([formatAmountL2("7700.00"), labels.shell.status.missing, labels.shell.status.missing]);
    const week2 = channelWeeks(snap)!.weeks[1].label;
    expect(live[1].html).toContain(`aria-label="${fill(labels.overview.channelsV3.marginAria, { channel: "LIVE", metric: fill(tableV3.cellLabel, { period: week2, metric: metricLabel }), value: labels.shell.status.missing })}"`);
    const social = cells(rowsOf(table, "tbody").find(row => cells(row)[0].text === "SOCIAL")!).slice(1);
    expect(social.map(cell => cell.text)).toEqual(["490.00", "6730.00", "210.00"].map(value => formatAmountL2(value)));
    // V4-8a（D-V4-45＝B）：資料待補的格不上色（deltaTone 對缺值是 neutral）；SOCIAL 三週都是正值，不上色。
    for (const cell of [...live, ...social]) expect(cell.html.startsWith('<button type="button" class="number-link"'), cell.text).toBe(true);
  });

  it("通路 > 8：不呼叫 channelWeeks（狀態 tooMany）、沒有「近 {n} 週」欄與資料表，表格之後一句說明；會議摘要（default 變體）傳了 snapshot 也不變", async () => {
    const snap = await snapshot("demo");
    const nine = Array.from({ length: CHANNEL_WEEKS_MAX_CHANNELS + 1 }, (_, index) => `CH${index + 1}`);
    const many = { ...snap, report: { ...snap.report, scope: { ...snap.report.scope, channels: nine } } };
    expect(channelWeeksState(many)).toEqual({ status: "tooMany" });
    expect(channelWeeksState(undefined)).toEqual({ status: "off" });
    expect(channelWeeksState(snap)).toEqual({ status: "ready", data: channelWeeks(snap) });
    const html = renderToStaticMarkup(<ChannelWideTable summary={buildManagerSummary(snap)} snapshot={many} onEvidence={noop} ariaLabel={labels.overview.sections.channelTableAria} caption={labels.overview.sections.channelTableCaption} variant="diagnosis" />);
    expect(html).not.toContain("spark-head");
    expect(html).not.toContain("spark-cell");
    expect(html).not.toContain(CHANNEL_WEEKS_TABLE_TESTID);
    expect(html).not.toContain("<details");
    expect(html.match(/<colgroup/g)).toHaveLength(4);
    expect(html.endsWith(`</table></div><p class="note channel-weeks-note" data-testid="${CHANNEL_WEEKS_TOO_MANY_TESTID}">${fill(spark.tooMany, { max: CHANNEL_WEEKS_MAX_CHANNELS })}</p>`)).toBe(true);
    // 沒傳 snapshot（既有呼叫端）時與 V3-5 相同；default 變體忽略 snapshot。
    expect(renderTable(snap, "diagnosis")).not.toContain("spark");
    const meeting = renderToStaticMarkup(<ChannelWideTable summary={buildManagerSummary(snap)} snapshot={snap} onEvidence={noop} ariaLabel={labels.overview.sections.channelTableAria} caption={labels.overview.sections.channelTableCaption} />);
    expect(meeting).toBe(renderTable(snap));
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
