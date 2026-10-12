import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { track } from "../src/application/analytics";
import { coverageTimeline, type CoverageSegment } from "../src/application/chart-coverage";
import { formatDateL1 } from "../src/application/presentation";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { filterIssues, issueFilterPhrase, issueReasonLabel } from "../src/application/issue-filter";
import type { ChartDataTableProps } from "../src/components/charts/chart-data-table";
import { Timeline, timelineGeometry, timelineSegmentRef, type TimelineProps } from "../src/components/charts/timeline";
import { COVERAGE_ALL_CHANNELS, CoverageChart, coverageBoxes, coverageChartModel, coverageDataTable, coverageFilterOf, coverageSegmentTestId, type CoverageChartProps } from "../src/components/data/coverage-chart";
import { IssueList } from "../src/components/issue-list";
import type { Dataset, DatasetInput } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, openTag, textOf } from "./helpers/markup";
import { synthetic4ChannelInput, synthetic4ChannelOverlapInput } from "./helpers/synthetic-4-channel";

/*
 * V4-7a：D-V4-51（b）＝B（使用者 2026-10-12 回覆「都依你的建議」）。G20 同一檔不同通路的缺列日期重疊時，圖上合成一個框（重疊區段的聯集），
 * testid 的通路段寫 all（chart-data-coverage-seg-{file}-all-{start}），點下去把問題表篩到「該檔＋該原因」（不帶 channel，全部通路）；
 * 不重疊的單一通路區段照舊（testid 與點擊條件不變）。資料表照列每個通路的區段，每列的「篩選問題表」按鈕仍帶通路。標題（最長區段）不變。
 * 重疊的資料在記憶體裡由 4 通路合成資料拿掉幾列做成（tests/helpers/synthetic-4-channel.ts 的 synthetic4ChannelOverlapInput，不新增任何資料檔）。
 * 圖上的點擊在 node 環境沒有 DOM：沿用 tests/issue-list-filter-v4.test.tsx 的 hooks harness（直接呼叫元件函式取得元素樹，再呼叫 rect 的 onClick）。
 */

const hooks = vi.hoisted(() => ({ active: false }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => (hooks.active ? [typeof initial === "function" ? (initial as () => unknown)() : initial, () => undefined] : actual.useState(initial)),
    useRef: (initial: unknown) => (hooks.active ? { current: initial } : actual.useRef(initial)),
    useEffect: (effect: () => void, deps?: unknown[]) => (hooks.active ? undefined : actual.useEffect(effect, deps)),
    useMemo: (factory: () => unknown, deps: unknown[]) => (hooks.active ? factory() : actual.useMemo(factory, deps)),
    useCallback: (callback: unknown, deps: unknown[]) => (hooks.active ? callback : actual.useCallback(callback as never, deps)),
  };
});
vi.mock("../src/application/analytics", async importOriginal => ({ ...await importOriginal<typeof import("../src/application/analytics")>(), track: vi.fn() }));
afterEach(() => { hooks.active = false; vi.mocked(track).mockClear(); });

type TreeElement = ReactElement<Record<string, unknown>>;
function findAll(node: ReactNode, match: (element: TreeElement) => boolean, found: TreeElement[] = []): TreeElement[] {
  if (Array.isArray(node)) for (const child of node) findAll(child, match, found);
  else if (node !== null && typeof node === "object" && "props" in node) {
    const item = node as TreeElement;
    if (match(item)) found.push(item);
    findAll(item.props.children as ReactNode, match, found);
  }
  return found;
}
/** 在 harness 下呼叫元件函式（hook 都是無狀態的替身）。 */
function call<P>(component: (props: P) => ReactNode, props: P): ReactNode {
  hooks.active = true;
  try { return component(props); } finally { hooks.active = false; }
}

const copy = labels.data.chartsV4.coverage;
const files = labels.importWizard.files;
const COSTS = "channel_costs_daily.csv" as const, ADS = "ad_spend_daily.csv" as const;
const datasetOf = (input: DatasetInput): Dataset => validateDataset(input).dataset!;
const overlap = () => datasetOf(synthetic4ChannelOverlapInput());
const render = (props: CoverageChartProps) => renderToStaticMarkup(createElement(CoverageChart, props));
const chartOf = (html: string) => byTestId(html, "chart-data-coverage");
const frameOf = (html: string) => element(chartOf(html), 'class="chart-frame')!;
const rowsOf = (html: string) => [...byTestId(html, "chart-data-coverage-table").matchAll(/<tr>(.*?)<\/tr>/g)].map(match => match[1]).slice(1);
const cellsOf = (row: string) => [...row.matchAll(/<(th|td)[^>]*>(.*?)<\/\1>/g)].map(match => textOf(match[2]));
const segTestIds = (html: string) => [...frameOf(html).matchAll(/data-testid="(chart-data-coverage-seg-[^"]+)"/g)].map(match => match[1]);
const MERGED_COSTS = "chart-data-coverage-seg-costs-all-2026-09-14";
const MERGED_ADS = "chart-data-coverage-seg-ads-all-2026-08-30";

describe("coverageBoxes：同一檔不同通路重疊的缺列合成一框（D-V4-51（b）＝B）", () => {
  it("記憶體合成資料：通路費用 DTC 9/16–9/17 落在 LIVE 9/14–9/19 內 → 一框 9/14–9/19；廣告 LIVE 8/30–9/02 與 SOCIAL 9/01–9/04 重疊 → 一框 8/30–9/04；LIVE 9/22 與 SOCIAL 9/23 只相鄰 → 各自一框", () => {
    const timeline = coverageTimeline(overlap());
    const boxes = coverageBoxes(timeline.segments);
    expect(boxes.map(({ key, channel, start, end, segments }) => [key, channel, start, end, segments.map(segment => segment.channel)])).toEqual([
      ["costs", null, "2026-09-14", "2026-09-19", ["DTC", "LIVE"]],
      ["ads", null, "2026-08-30", "2026-09-04", ["LIVE", "SOCIAL"]],
      ["ads", "LIVE", "2026-09-22", "2026-09-22", ["LIVE"]],
      ["ads", "SOCIAL", "2026-09-23", "2026-09-23", ["SOCIAL"]],
    ]);
    expect(boxes.map(box => coverageSegmentTestId(box))).toEqual([MERGED_COSTS, MERGED_ADS, "chart-data-coverage-seg-ads-LIVE-2026-09-22", "chart-data-coverage-seg-ads-SOCIAL-2026-09-23"]);
    expect(COVERAGE_ALL_CHANNELS).toBe("all");
    // 每個區段恰好在一個框內。
    expect(boxes.flatMap(box => box.segments).sort((a, b) => timeline.segments.indexOf(a) - timeline.segments.indexOf(b))).toEqual(timeline.segments);
  });

  it("不重疊時一段一框、順序與 segments 相同，testid 與點擊條件不變（missing_ad_day、4 通路合成資料）", () => {
    for (const [dataset, ids] of [
      [datasetOf(fixture("errors/missing_ad_day")), ["chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02"]],
      [datasetOf(synthetic4ChannelInput()), ["chart-data-coverage-seg-costs-LIVE-2026-09-14", "chart-data-coverage-seg-ads-LIVE-2026-08-30", "chart-data-coverage-seg-ads-LIVE-2026-09-22"]],
    ] as const) {
      const { segments } = coverageTimeline(dataset);
      const boxes = coverageBoxes(segments);
      expect(boxes.map(box => [box.channel, box.start, box.end])).toEqual(segments.map(segment => [segment.channel, segment.start, segment.end]));
      expect(boxes.map(box => coverageSegmentTestId(box))).toEqual(ids);
      expect(boxes.map(box => coverageFilterOf(box))).toEqual(segments.map(segment => ({ file: segment.file, channel: segment.channel, reason: segment.reason })));
    }
  });

  it("重疊依關係串連（A 與 B、B 與 C 重疊時三段一框，聯集起訖）；只相鄰不合；不同檔不合；空陣列回傳空陣列", () => {
    const seg = (key: "costs" | "ads", channel: string, start: string, end: string): CoverageSegment => ({ key, file: key === "costs" ? COSTS : ADS, reason: key === "costs" ? "MISSING_CHANNEL_COST_DAY" : "MISSING_AD_DAY", channel, start, end, days: 0 });
    const boxes = coverageBoxes([
      seg("costs", "DTC", "2026-08-01", "2026-08-03"), seg("costs", "DTC", "2026-08-09", "2026-08-09"),
      seg("costs", "LIVE", "2026-08-03", "2026-08-05"), seg("costs", "SOCIAL", "2026-08-05", "2026-08-07"), seg("costs", "SOCIAL", "2026-08-10", "2026-08-10"),
      seg("ads", "DTC", "2026-08-01", "2026-08-01"),
    ]);
    expect(boxes.map(box => [box.key, box.channel, box.start, box.end, box.segments.length])).toEqual([
      ["costs", null, "2026-08-01", "2026-08-07", 3], ["costs", "DTC", "2026-08-09", "2026-08-09", 1], ["costs", "SOCIAL", "2026-08-10", "2026-08-10", 1], ["ads", "DTC", "2026-08-01", "2026-08-01", 1],
    ]);
    expect(coverageBoxes([])).toEqual([]);
  });
});

describe("G20：重疊的缺列在圖上一框、資料表照列每個通路（SSR）", () => {
  it("圖上 4 個框（2 個合成框 testid 通路段 all）；資料表 6 列、每列帶通路與自己的篩選按鈕；標題仍是最長區段；右端缺 6 天、缺 8 天", async () => {
    const input = synthetic4ChannelOverlapInput();
    const dataset = datasetOf(input);
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    const html = render({ dataset, snapshot, onFilter: () => undefined, width: 1122 });
    expect(segTestIds(html)).toEqual([MERGED_COSTS, MERGED_ADS, "chart-data-coverage-seg-ads-LIVE-2026-09-22", "chart-data-coverage-seg-ads-SOCIAL-2026-09-23"]);
    expect(openTag(frameOf(html), `data-testid="${MERGED_COSTS}"`)).toContain('class="timeline-missing is-clickable"');
    expect(textOf(element(html, 'id="data-coverage-title"')!)).toBe(fill(copy.title.missing, { file: files.costs, start: "9/14", end: "9/19", n: "6", channel: "LIVE" }));
    for (const n of [6, 8]) expect(frameOf(html)).toContain(`>${fill(copy.gapDays, { n })}</text>`);
    expect(rowsOf(html).map(cellsOf)).toEqual([
      [files.costs, "DTC", "2026-09-16", "2026-09-17", "2", copy.filterButton],
      [files.costs, "LIVE", "2026-09-14", "2026-09-19", "6", copy.filterButton],
      [files.ads, "LIVE", "2026-08-30", "2026-09-02", "4", copy.filterButton],
      [files.ads, "LIVE", "2026-09-22", "2026-09-22", "1", copy.filterButton],
      [files.ads, "SOCIAL", "2026-09-01", "2026-09-04", "4", copy.filterButton],
      [files.ads, "SOCIAL", "2026-09-23", "2026-09-23", "1", copy.filterButton],
    ]);
    const labelsOf = rowsOf(html).map(row => /aria-label="([^"]+)"/.exec(openTag(row, "<button")!)![1]);
    expect(labelsOf).toEqual([["costs", "DTC"], ["costs", "LIVE"], ["ads", "LIVE"], ["ads", "LIVE"], ["ads", "SOCIAL"], ["ads", "SOCIAL"]].map(([key, channel]) => fill(copy.filterName, { file: files[key as "costs" | "ads"], channel })));
    // chart-lint SSR：0 違規；chart- testid 都符合命名（合成框的語意 key 是 {file}-all-{start}）。
    const check = checkChartMarkup(html, { page: "data" });
    for (const rule of ["CL-1", "CL-2", "CL-9", "CL-11"] as const) expect(check.violations[rule], rule).toEqual([]);
    expect([...check.chartTestIds].sort()).toEqual(["chart-data-coverage", "chart-data-coverage-table", ...segTestIds(html)].sort());
    // 圖框內沒有可聚焦元素（CL-7）。
    expect(frameOf(html)).not.toMatch(/<button|tabindex/i);
  });

  it("模型與幾何：合成框不帶 channel（點擊條件＝該檔＋該原因），寬＝聯集天數 × 一天寬；不重疊的框照舊帶通路", () => {
    const timeline = coverageTimeline(overlap());
    const model = coverageChartModel(timeline);
    const missing = model.tracks.flatMap(item => item.missing);
    expect(missing.map(item => item.testId)).toEqual([MERGED_COSTS, MERGED_ADS, "chart-data-coverage-seg-ads-LIVE-2026-09-22", "chart-data-coverage-seg-ads-SOCIAL-2026-09-23"]);
    expect(missing.map(item => timelineSegmentRef(item))).toEqual([
      { file: COSTS, reason: "MISSING_CHANNEL_COST_DAY" }, { file: ADS, reason: "MISSING_AD_DAY" },
      { file: ADS, channel: "LIVE", reason: "MISSING_AD_DAY" }, { file: ADS, channel: "SOCIAL", reason: "MISSING_AD_DAY" },
    ]);
    expect(Object.hasOwn(missing[0], "channel")).toBe(false);
    const geometry = timelineGeometry({ width: 1122, domain: timeline.axis, bands: model.bands, tracks: model.tracks, noRowsText: copy.noRows, dateLabel: iso => formatDateL1(iso, { anchor: timeline.dataAsOf }) });
    const shapes = geometry.tracks.flatMap(item => item.missing);
    const day = (978 / 34);
    expect(shapes.map(shape => shape.width)).toEqual([6, 6, 1, 1].map(days => Math.round(days * day * 10) / 10));
    expect(shapes.map(shape => shape.start)).toEqual(["2026-09-14", "2026-08-30", "2026-09-22", "2026-09-23"]);
    expect(shapes.map(shape => Object.hasOwn(shape, "channel"))).toEqual([false, false, true, true]);
  });
});

describe("G20：點合成框篩「該檔＋該原因」（不帶 channel），資料表按鈕仍帶通路", () => {
  it("點圖上的框（Timeline 的 rect onClick → CoverageChart 的 onSegment）：合成框 onFilter({ file, reason })、沒有 channel 鍵，單一通路的框 onFilter({ file, channel, reason })；每次點擊記 chart_clicked", () => {
    const dataset = overlap();
    const onFilter = vi.fn();
    const frame = call(CoverageChart, { dataset, onFilter, width: 1122 }) as TreeElement;
    const timeline = findAll(frame.props.children as ReactNode, item => item.type === Timeline)[0] as unknown as ReactElement<TimelineProps>;
    expect(timeline).toBeDefined();
    const svg = call(Timeline, timeline.props);
    const rect = (testId: string) => findAll(svg, item => item.props["data-testid"] === testId)[0];
    (rect(MERGED_COSTS).props.onClick as () => void)();
    expect(onFilter).toHaveBeenLastCalledWith({ file: COSTS, reason: "MISSING_CHANNEL_COST_DAY" });
    expect(onFilter.mock.lastCall![0]).not.toHaveProperty("channel");
    (rect(MERGED_ADS).props.onClick as () => void)();
    expect(onFilter.mock.lastCall![0]).toStrictEqual({ file: ADS, reason: "MISSING_AD_DAY" });
    (rect("chart-data-coverage-seg-ads-SOCIAL-2026-09-23").props.onClick as () => void)();
    expect(onFilter.mock.lastCall![0]).toStrictEqual({ file: ADS, channel: "SOCIAL", reason: "MISSING_AD_DAY" });
    expect(vi.mocked(track).mock.calls).toEqual([["chart_clicked"], ["chart_clicked"], ["chart_clicked"]]);
  });

  it("不重疊的資料（missing_ad_day）：chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02 點下去仍是 { file, channel, reason }", () => {
    const onFilter = vi.fn();
    const frame = call(CoverageChart, { dataset: datasetOf(fixture("errors/missing_ad_day")), onFilter, width: 560 }) as TreeElement;
    const timeline = findAll(frame.props.children as ReactNode, item => item.type === Timeline)[0] as unknown as ReactElement<TimelineProps>;
    const svg = call(Timeline, timeline.props);
    (findAll(svg, item => item.props["data-testid"] === "chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02")[0].props.onClick as () => void)();
    expect(onFilter.mock.lastCall![0]).toStrictEqual({ file: ADS, channel: "MARKETPLACE", reason: "MISSING_AD_DAY" });
  });

  it("資料表每列（每個通路的區段）的按鈕仍帶通路：6 列 6 組條件", () => {
    const model = coverageChartModel(coverageTimeline(overlap()));
    const onFilter = vi.fn();
    const table = coverageDataTable(model, onFilter);
    const props = (table.content as ReactElement<ChartDataTableProps<CoverageSegment, string>>).props;
    expect(props.rows).toHaveLength(6);
    for (const segment of props.rows) (props.actionColumn!.render(segment) as ReactElement<{ onClick: () => void }>).props.onClick();
    expect(onFilter.mock.calls.map(([filter]) => [filter.file, filter.channel, filter.reason])).toEqual([
      [COSTS, "DTC", "MISSING_CHANNEL_COST_DAY"], [COSTS, "LIVE", "MISSING_CHANNEL_COST_DAY"],
      [ADS, "LIVE", "MISSING_AD_DAY"], [ADS, "LIVE", "MISSING_AD_DAY"], [ADS, "SOCIAL", "MISSING_AD_DAY"], [ADS, "SOCIAL", "MISSING_AD_DAY"],
    ]);
  });

  it("問題表收到不帶通路的篩選：列出該檔該原因的全部通路（通路費用 DTC 2 列＋LIVE 6 列＝8 列），篩選片語只有檔案與原因、不寫通路", () => {
    const dataset = overlap();
    const filter = coverageFilterOf({ file: COSTS, channel: null, reason: "MISSING_CHANNEL_COST_DAY" });
    expect(filter).toStrictEqual({ file: COSTS, reason: "MISSING_CHANNEL_COST_DAY" });
    const shown = filterIssues(dataset.issues, filter);
    expect(shown).toHaveLength(8);
    expect([...new Set(shown.map(issue => issue.channel))].sort()).toEqual(["DTC", "LIVE"]);
    const phrase = issueFilterPhrase(filter, shown.length)!;
    expect(phrase).toBe(fill(labels.data.chartsV4.issues.filter.phrase, { scope: [files.costs, issueReasonLabel("MISSING_CHANNEL_COST_DAY")].join(labels.data.pageV3.separator), n: "8" }));
    expect(phrase).not.toMatch(/DTC|LIVE/);
    const html = renderToStaticMarkup(createElement(IssueList, { issues: dataset.issues, filter, onClearFilter: () => undefined, filterRequest: 1 }));
    expect(textOf(byTestId(html, "data-issues-filter"))).toBe(phrase);
    expect(element(html, "<tbody>")!.match(/<tr>/g)).toHaveLength(8);
    // 單一通路的框（同一檔）只列該通路：片語帶通路。
    const single = coverageFilterOf({ file: COSTS, channel: "LIVE", reason: "MISSING_CHANNEL_COST_DAY" });
    expect(filterIssues(dataset.issues, single)).toHaveLength(6);
    expect(issueFilterPhrase(single, 6)).toContain("LIVE");
  });
});
