import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { COVERAGE_RANGE_FIELD, coverageTimeline } from "../src/application/chart-coverage";
import { chartColors, chartHeights, chartRowHeights } from "../src/application/chart-theme";
import { channelsLabel } from "../src/application/copy";
import type { EventSet } from "../src/application/events";
import { formatDateL1, formatPeriodL1 } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import type { ChartDataTableProps } from "../src/components/charts/chart-data-table";
import { COVERAGE_SEG_TESTID_PREFIX, CoverageChart, coverageChartModel, coverageDataTable, coverageFilterOf, coverageSegmentTestId, type CoverageChartProps } from "../src/components/data/coverage-chart";
import type { Dataset, DatasetInput, ValidationIssue } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, openTag, textOf } from "./helpers/markup";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";
import { yoyInput } from "./helpers/yoy-dataset";

/*
 * V4-7a 代理 A：G20 涵蓋時間軸（PRD §4.1–§4.7 G20、§5.7；CHART_CATALOG G20「標題與 labels」「資料表」「鍵盤」「抽屜」；06_BATCHES V4-7a 驗收重點；D-V4-40＝A）的 SSR 結構測試。
 * - missing_ad_day：標題用單日模板（不出現「8/2 到 8/2」）；缺列框 chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02；資料表 1 列、篩選按鈕的可及名稱帶檔案與通路。
 * - 合成資料：標題取最長的缺列區段（通路費用 LIVE 9/14–9/19，6 天）；資料表 3 列。示範資料：標題 none；沒有缺列時資料表 0 列。
 * - 範圍級缺列：退回文字（state empty，不畫區段）；沒有資料集：等高空狀態。去年同期（D-V4-40＝A）：副標第二行，不畫在圖上。
 * - 點缺列框或篩選按鈕都是 onFilter({ file, channel, reason })（不開抽屜）；SSR 驗資料表按鈕的 onClick（node 環境沒有 DOM，圖上點擊由 E2E 驗）。
 *   同一檔不同通路重疊的缺列合成一框（D-V4-51（b）＝B）另見 tests/charts-data-coverage-overlap-v4.test.tsx。
 * - D-V4-53＝B（使用者 2026-10-12）：去年同期期間內的缺列不延伸軸，資料表照列，資料表後加 yoyBeforeAxisNote。
 */

const copy = labels.data.chartsV4.coverage;
const files = labels.importWizard.files;
const datasetOf = (input: DatasetInput): Dataset => validateDataset(input).dataset!;
async function snapshotOf(input: DatasetInput): Promise<{ dataset: Dataset; snapshot: WorkspaceSnapshot }> {
  const dataset = datasetOf(input);
  return { dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}
const render = (props: CoverageChartProps) => renderToStaticMarkup(createElement(CoverageChart, props));
const chartOf = (html: string) => byTestId(html, "chart-data-coverage");
const frameOf = (html: string) => element(chartOf(html), 'class="chart-frame')!;
const titleOf = (html: string) => textOf(element(html, 'id="data-coverage-title"')!);
const rowsOf = (html: string) => [...byTestId(html, "chart-data-coverage-table").matchAll(/<tr>(.*?)<\/tr>/g)].map(match => match[1]).slice(1);
const cellsOf = (row: string) => [...row.matchAll(/<(th|td)[^>]*>(.*?)<\/\1>/g)].map(match => textOf(match[2]));
const noop = () => undefined;

describe("G20：missing_ad_day（單日模板、1 段缺列、資料表 1 列）", () => {
  it("標題「廣告投放缺 8/2 1 天（MARKETPLACE）」：單日模板，不出現「8/2 到 8/2」與「共 1 天」", async () => {
    const { dataset, snapshot } = await snapshotOf(fixture("errors/missing_ad_day"));
    const html = render({ dataset, snapshot, onFilter: noop });
    const title = titleOf(html);
    expect(title).toBe(fill(copy.title.missingOneDay, { file: files.ads, date: "8/2", channel: "MARKETPLACE" }));
    expect(title).not.toContain("到");
    expect(title).not.toContain("共");
    expect(coverageChartModel(coverageTimeline(dataset)).titleKind).toBe("missingOneDay");
  });

  it("區塊結構：section.panel.chart-section、h2#data-coverage-title、sm 固定高且 aria-hidden；圖例有列（line）與缺列（dash）；缺列框 testid 在圖內", async () => {
    const { dataset, snapshot } = await snapshotOf(fixture("errors/missing_ad_day"));
    const html = render({ dataset, snapshot, onFilter: noop });
    const section = openTag(html, 'data-testid="chart-data-coverage"')!;
    expect(section).toContain('class="panel chart-section coverage-section"');
    expect(section).toContain('aria-labelledby="data-coverage-title"');
    expect(section).toContain('aria-describedby="data-coverage-sub"');
    expect(html).toContain('<h2 id="data-coverage-title">');
    const frame = openTag(chartOf(html), 'class="chart-frame')!;
    expect(frame).toContain('class="chart-frame sm"');
    expect(frame).toContain(`height:${chartHeights.sm}px`);
    expect(frame).toContain('aria-hidden="true"');
    expect(frameOf(html)).toContain('data-testid="chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02"');
    expect(frameOf(html)).toContain('class="chart-timeline"');
    expect(frameOf(html)).toContain(`height="${4 * chartRowHeights.row24 + chartRowHeights.axis}"`);
    const legend = element(chartOf(html), 'class="legend"')!;
    expect(textOf(legend)).toBe(`${copy.legend.rows}${copy.legend.missing}`);
    expect(legend).toContain(`stroke="${chartColors.missing}"`);
    expect(legend).toContain('class="legend-dash"');
    // 圖框內沒有可聚焦元素（CL-7）；按鈕只在資料表。
    expect(frameOf(html)).not.toMatch(/<button|tabindex/i);
  });

  it("資料表（C33）：summary「表格 · 涵蓋時間軸」；欄 檔案｜通路｜缺列起日｜缺列訖日｜天數｜篩選；1 列＝廣告投放 · MARKETPLACE · 2026-08-02 · 2026-08-02 · 1 · 篩選按鈕", async () => {
    const { dataset, snapshot } = await snapshotOf(fixture("errors/missing_ad_day"));
    const html = render({ dataset, snapshot, onFilter: noop });
    expect(html).toContain(`<summary>${fill(labels.overview.page.dataTable, { title: copy.section })}</summary>`);
    const table = byTestId(html, "chart-data-coverage-table");
    expect(table).toContain(`<caption>${copy.section}</caption>`);
    const head = [...table.matchAll(/<th scope="col"[^>]*>(.*?)<\/th>/g)].map(match => textOf(match[1]));
    expect(head).toEqual([labels.data.pageV3.issueTable.columns.file, labels.overview.page.colChannel, copy.columns.start, copy.columns.end, copy.columns.days, copy.columns.action]);
    const rows = rowsOf(html);
    expect(rows).toHaveLength(1);
    expect(cellsOf(rows[0])).toEqual([files.ads, "MARKETPLACE", "2026-08-02", "2026-08-02", "1", copy.filterButton]);
    const button = openTag(rows[0], "<button")!;
    expect(button).toContain('type="button"');
    expect(button).toContain(`aria-label="${fill(copy.filterName, { file: files.ads, channel: "MARKETPLACE" })}"`);
    // 可及名稱包含可見文字（WCAG 2.5.3）。
    expect(fill(copy.filterName, { file: files.ads, channel: "MARKETPLACE" }).startsWith(copy.filterButton)).toBe(true);
  });

  it("chart-lint SSR（CL-1、CL-2、CL-9、CL-11）：0 違規；主層圖區塊 1 張；chart- testid 都符合命名", async () => {
    const { dataset, snapshot } = await snapshotOf(fixture("errors/missing_ad_day"));
    const check = checkChartMarkup(render({ dataset, snapshot, onFilter: noop }), { page: "data" });
    for (const rule of ["CL-1", "CL-2", "CL-9", "CL-11"] as const) expect(check.violations[rule], rule).toEqual([]);
    expect(check.mainSections).toEqual(["chart-data-coverage"]);
    expect([...check.chartTestIds].sort()).toEqual(["chart-data-coverage", "chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02", "chart-data-coverage-table"]);
  });
});

describe("G20：點缺列框與資料表的篩選按鈕（onFilter，不開抽屜）", () => {
  it("資料表每列的按鈕呼叫 onFilter({ file, channel, reason })；與圖上缺列框同一組條件（coverageFilterOf）", () => {
    const dataset = datasetOf(synthetic4ChannelInput());
    const model = coverageChartModel(coverageTimeline(dataset));
    const onFilter = vi.fn();
    const table = coverageDataTable(model, onFilter);
    const props = (table.content as ReactElement<ChartDataTableProps<(typeof model.timeline & object)["segments"][number], string>>).props;
    expect(props.rows).toHaveLength(3);
    for (const segment of props.rows) {
      const button = props.actionColumn!.render(segment) as ReactElement<{ onClick: () => void; "aria-label": string }>;
      button.props.onClick();
      expect(onFilter).toHaveBeenLastCalledWith({ file: segment.file, channel: segment.channel, reason: segment.reason });
      expect(onFilter).toHaveBeenLastCalledWith(coverageFilterOf(segment));
    }
    expect(onFilter.mock.calls.map(call => call[0])).toEqual([
      { file: "channel_costs_daily.csv", channel: "LIVE", reason: "MISSING_CHANNEL_COST_DAY" },
      { file: "ad_spend_daily.csv", channel: "LIVE", reason: "MISSING_AD_DAY" },
      { file: "ad_spend_daily.csv", channel: "LIVE", reason: "MISSING_AD_DAY" },
    ]);
    // 圖上的缺列框帶同一組條件（Timeline 的 onSegment 收到的就是這三個欄位）。
    const tracks = model.tracks.flatMap(track => track.missing.map(segment => ({ file: segment.file, channel: segment.channel, reason: segment.reason })));
    expect(tracks).toEqual(onFilter.mock.calls.map(call => call[0]));
    // 列都是純文字（沒有 number-link）。
    expect(props.evidenceOf(props.rows[0], props.columns[0])).toBeNull();
  });

  it("不給 onFilter：沒有篩選欄、缺列框不可點", () => {
    const dataset = datasetOf(synthetic4ChannelInput());
    const html = render({ dataset });
    expect(byTestId(html, "chart-data-coverage-table")).not.toContain("<button");
    expect(byTestId(html, "chart-data-coverage-table")).not.toContain(copy.columns.action);
    expect(frameOf(html)).not.toMatch(/is-clickable|pointer-events/);
    const withFilter = render({ dataset, onFilter: noop });
    expect(openTag(withFilter, `data-testid="${COVERAGE_SEG_TESTID_PREFIX}costs-LIVE-2026-09-14"`)).toContain("is-clickable");
  });
});

describe("G20：合成資料、示範資料、golden", () => {
  it("合成資料：標題取最長區段「通路費用缺 9/14 到 9/19 共 6 天（LIVE）」；副標＝檔案涵蓋 8/20–9/23（35 天）與 4 個通路；資料表 3 列；右端缺 6 天、缺 5 天", async () => {
    const { dataset, snapshot } = await snapshotOf(synthetic4ChannelInput());
    const html = render({ dataset, snapshot, onFilter: noop });
    expect(titleOf(html)).toBe(fill(copy.title.missing, { file: files.costs, start: "9/14", end: "9/19", n: "6", channel: "LIVE" }));
    expect(textOf(element(html, 'id="data-coverage-sub"')!)).toBe(fill(copy.subtitle, { section: copy.section, range: formatPeriodL1("2026-08-20", "2026-09-23", { anchor: "2026-09-24" }), channels: "DTC、LIVE、MARKETPLACE、SOCIAL" }));
    expect(rowsOf(html).map(cellsOf)).toEqual([
      [files.costs, "LIVE", "2026-09-14", "2026-09-19", "6", copy.filterButton],
      [files.ads, "LIVE", "2026-08-30", "2026-09-02", "4", copy.filterButton],
      [files.ads, "LIVE", "2026-09-22", "2026-09-22", "1", copy.filterButton],
    ]);
    for (const n of [6, 5]) expect(frameOf(html)).toContain(`>${fill(copy.gapDays, { n })}</text>`);
    expect(frameOf(html)).toContain(`>${labels.shell.periods.previous}</text>`);
    expect(frameOf(html)).toContain(`>${labels.shell.periods.current}</text>`);
    // D-V4-40＝A：軸從上期起日 8/21 開始（涵蓋起日 8/20 在軸外），去年同期不可用、沒有第二行。
    expect(frameOf(html)).toContain(">8/21</text>");
    expect(html).not.toContain('data-testid="data-coverage-yoy"');
    const table = byTestId(html, "chart-data-coverage-table");
    expect(table).not.toContain(copy.tableNone);
    for (const segment of coverageTimeline(dataset).segments) expect(html).toContain(`data-testid="${coverageSegmentTestId(segment)}"`);
    // 審查 R1-F1（D-V4-51（a）＝A，使用者 2026-10-12）：涵蓋起日 8/20 的銷售無列在軸外，只寫在資料表後的說明（在收合的 <details> 內，不在主層）。
    const beforeAxis = fill(copy.noRowsBeforeAxisNote, { file: files.sales, date: "8/21", n: "1" });
    const details = element(chartOf(html), 'class="data-alternative"')!;
    expect(details).toContain(`<p class="note">${beforeAxis}</p>`);
    expect(html.split(beforeAxis)).toHaveLength(2);
    expect(frameOf(html)).not.toContain(beforeAxis);
    expect(html).not.toContain(fill(copy.noRowsNote, { file: files.sales, n: "1" }));
  });

  it("示範資料：標題「三份檔案涵蓋 6/1 到 8/23，沒有缺列」；通路用別名；資料表 0 列、表後說明 tableNone；圖上沒有缺列框", async () => {
    const { dataset, snapshot } = await snapshotOf(fixture("demo"));
    const html = render({ dataset, snapshot, onFilter: noop });
    expect(titleOf(html)).toBe(fill(copy.title.none, { start: "6/1", end: "8/23" }));
    expect(textOf(element(html, 'id="data-coverage-sub"')!)).toContain(channelsLabel(["DTC", "MARKETPLACE"], true));
    expect(rowsOf(html)).toEqual([]);
    expect(html).toContain(`<p class="note">${copy.tableNone}</p>`);
    // 軸起日＝涵蓋起日（6/1）：沒有軸外的無列說明。
    expect(html).not.toContain(copy.noRowsBeforeAxisNote.split("{date}")[1].split("{n}")[0]);
    expect(html).not.toContain(COVERAGE_SEG_TESTID_PREFIX);
    expect(checkChartMarkup(html, { page: "data" }).violations["CL-1"]).toEqual([]);
  });

  it("同一天兩個通路都缺廣告列（審查修正）：右端「缺 1 天」與標題的「1 天」一致，不是問題筆數 2；資料表仍是 2 列（檔 × 通路）", () => {
    const dataset = datasetOf(fixture("golden"));
    const day = (channel: string): ValidationIssue => ({ file: "ad_spend_daily.csv", line: null, date: "2026-08-02", channel, field: "$row", severity: "partial", reason_code: "MISSING_AD_DAY", message: "" });
    const html = render({ dataset: { ...dataset, issues: [day("DTC"), day("MARKETPLACE")] }, onFilter: noop, width: 1122 });
    expect(titleOf(html)).toBe(fill(copy.title.missingOneDay, { file: files.ads, date: "8/2", channel: "DTC" }));
    expect(frameOf(html)).toContain(`>${fill(copy.gapDays, { n: "1" })}</text>`);
    expect(frameOf(html)).not.toContain(`>${fill(copy.gapDays, { n: "2" })}</text>`);
    expect(rowsOf(html)).toHaveLength(2);
  });

  it("golden：沒有缺列；標題 none（8/1 到 8/2）", async () => {
    const { dataset, snapshot } = await snapshotOf(fixture("golden"));
    expect(titleOf(render({ dataset, snapshot }))).toBe(fill(copy.title.none, { start: "8/1", end: "8/2" }));
  });

  it("主層（收合的資料表之外）沒有「不是／不代表／不等於／不可」的句子（B8 copy-density）", async () => {
    for (const input of [fixture("demo"), fixture("errors/missing_ad_day"), synthetic4ChannelInput()]) {
      const { dataset, snapshot } = await snapshotOf(input);
      const html = render({ dataset, snapshot, onFilter: noop });
      const main = html.replace(/<details[\s\S]*?<\/details>/g, "");
      expect(textOf(main)).not.toMatch(/不是|不代表|不等於|不可/);
    }
  });
});

describe("G20：範圍級缺列退回文字、沒有資料集、無列、檔期、去年同期", () => {
  it("範圍級缺列：標題 range、圖區退回文字（rangeFallback，等高）、沒有缺列框與圖例；資料表 0 列、表後說明 rangeFallback；CL-1 照樣有資料表", () => {
    const dataset = datasetOf(fixture("golden"));
    const range = (file: "channel_costs_daily.csv" | "ad_spend_daily.csv", reason_code: string): ValidationIssue => ({ file, line: null, field: COVERAGE_RANGE_FIELD, severity: "partial", reason_code, message: "" });
    const html = render({ dataset: { ...dataset, issues: [range("channel_costs_daily.csv", "MISSING_CHANNEL_COST_DAY"), range("ad_spend_daily.csv", "MISSING_AD_DAY")] }, onFilter: noop });
    expect(titleOf(html)).toBe(copy.title.range);
    const frame = frameOf(html);
    expect(openTag(chartOf(html), 'class="chart-frame')).toContain('data-state="empty"');
    expect(textOf(element(frame, 'class="chart-frame-message"')!)).toBe(copy.rangeFallback);
    expect(frame).not.toContain("<svg");
    expect(chartOf(html)).not.toContain('class="legend"');
    expect(rowsOf(html)).toEqual([]);
    expect(byTestId(html, "chart-data-coverage")).toContain(`<p class="note">${copy.rangeFallback}</p>`);
    expect(checkChartMarkup(html, { page: "data" }).violations["CL-1"]).toEqual([]);
  });

  it("沒有資料集：等高空狀態（chartHeights.sm），標題是區塊名、圖區寫「無資料」", () => {
    const html = render({ dataset: null });
    expect(titleOf(html)).toBe(copy.section);
    expect(openTag(chartOf(html), 'class="chart-frame')).toContain(`height:${chartHeights.sm}px`);
    expect(textOf(element(frameOf(html), 'class="chart-frame-message"')!)).toBe(labels.overview.chartFrame.noData);
    expect(rowsOf(html)).toEqual([]);
  });

  it("銷售無列：圖上標「無列」與右端「無列 n 天」（不算缺列、不畫虛線框）；資料表後說明 noRowsNote", () => {
    const dataset = datasetOf(synthetic4ChannelInput());
    const sales = dataset.sales.filter(row => !["2026-09-10", "2026-09-11", "2026-08-25"].includes(row.date));
    const html = render({ dataset: { ...dataset, sales }, onFilter: noop, width: 1122 });
    expect(frameOf(html)).toContain(`>${fill(copy.noRowDays, { n: "3" })}</text>`);
    expect(frameOf(html)).toContain(`data-kind="no-rows"`);
    expect(frameOf(html)).toContain(`>${copy.noRows}</text>`);
    expect(rowsOf(html)).toHaveLength(3);
    expect(html).toContain(`<p class="note">${fill(copy.noRowsNote, { file: files.sales, n: "3" })}</p>`);
  });

  it("檔期：與軸重疊時加第 4 軌（軌名沿用 overview.alerts.eventPeriod），svg 高 144 ≤ sm；沒有檔期時 3 軌", () => {
    const dataset = datasetOf(synthetic4ChannelInput());
    const events: EventSet = { filename: "events.csv", rows: [{ start: "2026-09-11", end: "2026-09-13", label: "A", line: 2 }] };
    const html = render({ dataset, events, onFilter: noop, width: 1122 });
    expect(frameOf(html)).toContain(`>${labels.overview.alerts.eventPeriod}</text>`);
    expect(openTag(frameOf(html), "<svg")).toContain(`height="${5 * chartRowHeights.row24 + chartRowHeights.axis}"`);
    expect(5 * chartRowHeights.row24 + chartRowHeights.axis).toBeLessThanOrEqual(chartHeights.sm);
    expect(frameOf(html)).toContain(`data-kind="event"`);
    expect(frameOf(render({ dataset, onFilter: noop }))).not.toContain(`>${labels.overview.alerts.eventPeriod}</text>`);
  });

  it("去年同期可用（D-V4-40＝A）：圖上方一行（副標第二行 .coverage-yoy）寫期間與天數；圖上沒有去年同期細線", async () => {
    const complete = await snapshotOf(yoyInput());
    const html = render({ dataset: complete.dataset, snapshot: complete.snapshot, onFilter: noop });
    const anchor = complete.dataset.manifest.data_as_of;
    const range = formatPeriodL1("2025-07-13", "2025-08-23", { anchor });
    const line = byTestId(html, "data-coverage-yoy");
    expect(textOf(line)).toBe(`${labels.data.pageV3.separator}${fill(copy.yoy.line, { yoy: labels.shell.periods.presets.yoy, range, detail: copy.yoy.complete })}`);
    expect(line).toContain('<span class="sr-only">');
    // 在副標（aria-describedby）裡、圖框之外。
    expect(element(html, 'id="data-coverage-sub"')).toContain('data-testid="data-coverage-yoy"');
    expect(frameOf(html)).not.toContain("data-coverage-yoy");
    expect(frameOf(html)).not.toContain(chartColors.yoy);
    expect(frameOf(html)).not.toContain(`>${labels.shell.periods.presets.yoy}</text>`);

    const gaps = await snapshotOf(yoyInput({ missingCostDates: ["2025-07-20", "2025-07-21"] }));
    const gapHtml = render({ dataset: gaps.dataset, snapshot: gaps.snapshot });
    const gapLine = textOf(byTestId(gapHtml, "data-coverage-yoy"));
    expect(gapLine).toContain(fill(copy.yoy.line, { yoy: labels.shell.periods.presets.yoy, range, detail: fill(copy.yoy.missing, { n: "2" }) }));
    // D-V4-53＝B：缺列都在去年同期內，不延伸軸（軸從上期起日 6/1 開始，不再從 2025/7/20）；圖上沒有缺列框，資料表照列 4 段，表後說明。
    expect(frameOf(gapHtml)).toContain(">6/1</text>");
    expect(frameOf(gapHtml)).not.toContain(`>${formatDateL1("2025-07-20", { anchor })}</text>`);
    expect(frameOf(gapHtml)).not.toContain(COVERAGE_SEG_TESTID_PREFIX);
    expect(rowsOf(gapHtml)).toHaveLength(4);
    expect(element(chartOf(gapHtml), 'class="data-alternative"')).toContain(`<p class="note">${fill(copy.yoyBeforeAxisNote, { yoy: labels.shell.periods.presets.yoy, date: "6/1", n: "4" })}</p>`);
  });

  it("D-V4-53＝B：yoyInput 缺 2025-07-20、07-21 與 2026-07-01——軸＝上期起日 6/1 到 8/23（不從 2025/7/20）；2026-07-01 在上期內照畫（兩個通路同一天缺，合成一框）；資料表 8 段照列、篩選按鈕照常；表後說明去年同期內的 4 段；標題取軸上的那天", async () => {
    const { dataset, snapshot } = await snapshotOf(yoyInput({ missingCostDates: ["2025-07-20", "2025-07-21", "2026-07-01"] }));
    const anchor = dataset.manifest.data_as_of;
    const html = render({ dataset, snapshot, onFilter: noop, width: 1122 });
    const frame = frameOf(html);
    expect(openTag(frame, "<svg")).toContain('data-days="84"');
    expect(frame).toContain(">6/1</text>");
    expect(frame).not.toContain(`>${formatDateL1("2025-07-20", { anchor })}</text>`);
    // 2026-07-01 兩個通路都缺：通路費用、廣告各一個合成框（D-V4-51（b）＝B）；去年同期內的區段不在圖上。
    expect([...frame.matchAll(/data-testid="(chart-data-coverage-seg-[^"]+)"/g)].map(match => match[1])).toEqual(["chart-data-coverage-seg-costs-all-2026-07-01", "chart-data-coverage-seg-ads-all-2026-07-01"]);
    // 右端只算軸上的 1 天；去年同期那一行寫 2 天。
    expect(frame).toContain(`>${fill(copy.gapDays, { n: "1" })}</text>`);
    expect(frame).not.toContain(`>${fill(copy.gapDays, { n: "3" })}</text>`);
    expect(textOf(byTestId(html, "data-coverage-yoy"))).toContain(fill(copy.yoy.missing, { n: "2" }));
    expect(titleOf(html)).toBe(fill(copy.title.missingOneDay, { file: files.costs, date: "7/1", channel: "DTC" }));
    // 資料表：8 段（每檔 × 通路 2 段）照列、每列一個篩選按鈕。
    const rows = rowsOf(html).map(cellsOf);
    expect(rows).toHaveLength(8);
    expect(rows[0]).toEqual([files.costs, "DTC", "2025-07-20", "2025-07-21", "2", copy.filterButton]);
    expect(rows.filter(row => row[2] === "2025-07-20")).toHaveLength(4);
    expect(rows.every(row => row[5] === copy.filterButton)).toBe(true);
    // 表後說明（收合的 <details> 內，不在主層）：去年同期內、圖的起日 6/1 之前的 4 段。
    const note = fill(copy.yoyBeforeAxisNote, { yoy: labels.shell.periods.presets.yoy, date: "6/1", n: "4" });
    expect(element(chartOf(html), 'class="data-alternative"')).toContain(`<p class="note">${note}</p>`);
    expect(html.split(note)).toHaveLength(2);
    expect(frame).not.toContain(note);
    // 沒有去年同期那一行（不給 snapshot）時照 D-V4-40＝A 延伸，沒有說明。
    const plain = render({ dataset, onFilter: noop, width: 1122 });
    expect(frameOf(plain)).toContain(`>${formatDateL1("2025-07-20", { anchor })}</text>`);
    expect(plain).not.toContain(note);
    expect(checkChartMarkup(html, { page: "data" }).violations["CL-2"]).toEqual([]);
  });

  it("兩期取目前套用的期間（snapshot.report.scope），不是 manifest 的預設", async () => {
    const input = synthetic4ChannelInput();
    const dataset = datasetOf(input);
    const snapshot = await createSnapshot(dataset, { previous_period: { start: "2026-09-01", end: "2026-09-11" }, current_period: { start: "2026-09-13", end: "2026-09-23" } }, await hashInput(input));
    const html = render({ dataset, snapshot, onFilter: noop });
    // 最早的缺列 8/30 比套用的上期起日 9/01 早：軸從 8/30 開始。
    expect(frameOf(html)).toContain(">8/30</text>");
  });
});
