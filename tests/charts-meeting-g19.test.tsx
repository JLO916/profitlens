import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { meetingSeries } from "../src/application/chart-meeting";
import { chartColors, chartHeights } from "../src/application/chart-theme";
import type { Meeting } from "../src/application/meeting";
import { formatAmountL1, formatAmountL2, formatAxisWan, formatPeriodL1, metricDefinitions } from "../src/application/presentation";
import { amountAxis, smallMultipleGeometry, SmallMultiples, type SmallMultiplePanel } from "../src/components/charts/small-multiples";
import { MeetingHistory } from "../src/components/meeting-page";
import { MEETING_HISTORY_METRICS, MEETING_HISTORY_SERIES, meetingHistoryModel, MeetingHistoryChart } from "../src/components/meeting/history-chart";
import { fill, labels } from "../src/i18n";
import { element, escapeAttr, openTag, textOf } from "./helpers/markup";
import { finalizedMeeting, g19History, meetingVariant } from "./helpers/meeting-history";
import { SMALL_MULTIPLES_BASELINE_FILE, smallMultiplesBaseline } from "./helpers/small-multiples-baseline";

/*
 * V4-6 代理 A：G19 會議歷史小倍數（PRD §4.1–§4.7 G19、§7.1、§8.7；CHART_CATALOG G19「單元測試」「E2E 草案」；06_BATCHES V4-6 驗收重點）的 SSR 結構測試，
 * 以及 C26 SmallMultiples 擴充（dots、gaps、fitXLabels、全形字估寬、amountAxis）的純函式測試與 G12 逐字不變的基準比對。
 * - chart-meeting-history 在 section.panel.meeting-history 內、說明句之後、清單之前；inline（沒有 .panel 套 .panel）、h3、sm、multiples；≤ 767px 框高變數＝sm × 2。
 * - 保留 < 2 次時等高空狀態；斷段處不連線、間隙標「不同資料集」「期間不同」；線與點都是 chartColors.total（沒有任何 chartColors.current），最後一點 3px 並標 L1 值。
 * - 點不可點：圖框內沒有熱區、按鈕、連結、tabindex、<details>；資料表（C33）純文字、列數＝圖上的會議數。
 */

const copy = labels.meeting.chartsV4.history;
const yuanColumn = (label: string) => fill(labels.format.units.yuanColumn, { label });
const kpi = (meeting: Meeting, metric: "net_revenue" | "contribution_after_marketing") => meeting.agenda.kpis.find(row => row.metric === metric)!.current;
const all = (html: string, re: RegExp) => [...html.matchAll(re)];
const attrs = (tag: string) => Object.fromEntries([...tag.slice(0, tag.indexOf(">")).matchAll(/\s([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
/** 1440 時每張子圖約 409px（會議頁主欄最寬 880〔--meeting-main-max〕，.panel 內距 22 × 2、框線 1 × 2，兩張之間 16）。 */
const WIDE = 409;

let history: Meeting[];
let golden: Meeting;
beforeAll(async () => {
  history = await g19History();
  golden = history[0];
});
const renderHistory = (meetings: readonly Meeting[]) => renderToStaticMarkup(createElement(MeetingHistory, { history: meetings }));
const chartOf = (html: string) => element(html, 'data-testid="chart-meeting-history"')!;
const frameOf = (html: string) => element(chartOf(html), 'class="chart-frame')!;

describe("C26 向下相容（V4-6 擴充 dots、gaps、fitXLabels、全形字估寬；健檢頁 G12 逐字不變）", () => {
  it("以 V4-6 開工錨點（6142950）產生的基準逐字比對：G12 五份資料的小倍數、直接渲染的子圖（四種寬 × 點擊熱區、斷線、虛線、負值軸、單一點）", async () => {
    const expected = JSON.parse(readFileSync(SMALL_MULTIPLES_BASELINE_FILE, "utf8")) as Record<string, string>;
    const actual = await smallMultiplesBaseline();
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected)) expect(actual[key], key).toBe(expected[key]);
    // 基準確實涵蓋 G12（五張子圖）與沒有新選項的直接渲染（沒有小點、間隙標）。
    expect(expected["demo chart-diagnosis-rates"].match(/class="multiple" data-panel=/g)).toHaveLength(5);
    for (const html of Object.values(expected)) expect(html).not.toMatch(/multiple-point|multiple-gap/);
  }, 60_000);
});

describe("C26 擴充（純函式）", () => {
  const panel = (values: (number | null)[], options: { dots?: boolean; keys?: (string | null)[] } = {}): SmallMultiplePanel => ({
    key: "net_revenue", title: "x", axis: { domain: [0, 30_000], ticks: [0, 10_000, 20_000, 30_000], labels: formatAxisWan([0, 10_000, 20_000, 30_000], 10_000) },
    series: [{ key: "history", color: chartColors.total, strokeWidth: 1.5, values, keys: options.keys, dots: options.dots, lastDot: true, lastLabel: "2.5 萬" }],
  });

  it("amountAxis：範圍含 0、上下界是步長的整數倍；最大刻度 ≥ 1 萬時步長是整萬（刻度文字整數萬）；1 萬以下用元；負值往下延伸；沒有值時 0 到 1", () => {
    // golden 本期淨營收 2,470：約 4 格 → 617.5 → 1、2、5 × 10ⁿ 取 500；上界 ceil(2470 ÷ 500) × 500＝2,500。
    expect(amountAxis([2470, 1999.99])).toEqual({ domain: [0, 2500], ticks: [0, 500, 1000, 1500, 2000, 2500], step: 500 });
    expect(formatAxisWan([0, 500, 1000], 500)).toEqual(["0", "500 元", "1,000 元"]);
    // 9,500 → 1、2、5 的步長是 2,000，上界 10,000 已到 1 萬：改用 1 萬的步長（避免「0.2 萬」）。
    expect(amountAxis([9500])).toEqual({ domain: [0, 10_000], ticks: [0, 10_000], step: 10_000 });
    const big = amountAxis([7_850_657.9, 6_141_575.72, null]);
    expect(big.step % 10_000).toBe(0);
    expect(big.ticks[0]).toBe(0);
    expect(big.ticks.at(-1)!).toBeGreaterThanOrEqual(7_850_657.9);
    expect(formatAxisWan(big.ticks, big.step).every(label => label === "0" || /^\d[\d,]* 萬$/.test(label))).toBe(true);
    const negative = amountAxis([-45_000, 12_000]);
    expect(negative.domain[0]).toBeLessThanOrEqual(-45_000);
    expect(negative.ticks).toContain(0);
    expect(negative.step % 10_000).toBe(0);
    expect(amountAxis([null])).toEqual({ domain: [0, 1], ticks: [0], step: 1 });
    expect(amountAxis([0, 0])).toEqual({ domain: [0, 1], ticks: [0], step: 1 });
  });

  it("dots：每個有值的點一個 2px 小點（帶 data-index、data-key），最後一點只畫 3px 的那一顆；有小點時不另畫前後都斷的單一點", () => {
    const geometry = smallMultipleGeometry(panel([10_000, null, 20_000, 25_000], { dots: true, keys: ["a", null, "b", "c"] }), ["1", "", "3", "4"], { width: WIDE });
    const line = geometry.series[0];
    expect(line.dots.map(point => [point.index, point.key])).toEqual([[0, "a"], [2, "b"]]);
    expect(line.isolated).toEqual([]);
    expect(line.last?.index).toBe(3);
    expect(line.dotted).toBe(true);
    const html = renderToStaticMarkup(createElement(SmallMultiples, { panels: [panel([10_000, null, 20_000, 25_000], { dots: true, keys: ["a", null, "b", "c"] })], xLabels: ["1", "", "3", "4"], width: WIDE }));
    expect(all(html, /<circle class="multiple-point" data-index="(\d)" data-key="(\w)"[^>]* r="2" fill="([^"]+)"/g).map(match => [match[1], match[2], match[3]])).toEqual([["0", "a", chartColors.total], ["2", "b", chartColors.total]]);
    expect(all(html, /<circle class="multiple-last" data-index="3" data-key="c"[^>]* r="3" fill="([^"]+)"/g).map(match => match[1])).toEqual([chartColors.total]);
    // 沒給 dots：與 V4-5 相同（沒有小點；單一點照畫 1.5px）。
    const plain = smallMultipleGeometry(panel([10_000, null, 20_000, 25_000]), ["1", "2", "3", "4"], { width: WIDE }).series[0];
    expect(plain.dots).toEqual([]);
    expect(plain.dotted).toBe(false);
    expect(plain.isolated.map(point => point.index)).toEqual([0]);
  });

  it("gaps：間隙標置中在該位置、繪圖區垂直中間；放不進相鄰兩點之間（2 個位置寬 − 12）時不畫；沒給 gaps 時是空陣列", () => {
    const xLabels = ["1", "", "3", "", "5"];
    const gaps = [{ index: 1, label: copy.differentDataset }, { index: 3, label: copy.differentPeriod }];
    const wide = smallMultipleGeometry(panel([1, null, 2, null, 3]), xLabels, { width: WIDE, gaps });
    const slot = (wide.plot.right - wide.plot.left) / 5;
    expect(wide.gaps.map(gap => gap.label)).toEqual([copy.differentDataset, copy.differentPeriod]);
    expect(wide.gaps[0].x).toBeCloseTo(wide.plot.left + slot * 1.5, 0);
    expect(wide.gaps[0].y).toBeCloseTo((wide.plot.top + wide.plot.bottom) / 2 + 4, 0);
    // 窄（每個位置約 17px）：「不同資料集」（5 個全形字約 60px）、「期間不同」（約 48px）都放不下。
    const narrow = smallMultipleGeometry(panel([1, null, 2, null, 3]), xLabels, { width: 140, gaps });
    expect(narrow.gaps).toEqual([]);
    expect(smallMultipleGeometry(panel([1, 2]), ["1", "2"], { width: WIDE }).gaps).toEqual([]);
  });

  it("fitXLabels：空字串的位置不標；放得下時每個都標，否則只標頭尾，頭尾也放不下時只標最後一個；每個標收在 svg 內", () => {
    const labelsOf = (width: number, xLabels: string[]) => smallMultipleGeometry(panel(xLabels.map(() => 1)), xLabels, { width, fitXLabels: true }).xTicks;
    const periods = ["7/13–8/23", "", "8/3–8/9", "8/10–8/16", "8/17–8/23"];
    expect(labelsOf(WIDE, periods).map(tick => tick.label)).toEqual(["7/13–8/23", "8/3–8/9", "8/10–8/16", "8/17–8/23"]);
    expect(labelsOf(300, periods).map(tick => tick.label)).toEqual(["7/13–8/23", "8/17–8/23"]);
    expect(labelsOf(120, periods).map(tick => tick.label)).toEqual(["8/17–8/23"]);
    for (const width of [WIDE, 300, 120]) for (const tick of labelsOf(width, periods)) {
      const half = [...tick.label].length * 7 / 2;
      expect(tick.x - half, `${width} ${tick.label}`).toBeGreaterThanOrEqual(0);
      expect(tick.x + half, `${width} ${tick.label}`).toBeLessThanOrEqual(width);
    }
  });

  it("全形字估寬 12px：Y 標「100 萬」的左邊留白比「100%」寬（比率標沒有全形字，G12 不變）", () => {
    const axis = (labels: string[]): SmallMultiplePanel => ({ key: "k", title: "t", axis: { domain: [0, 1], ticks: [0, 1], labels }, series: [] });
    const wan = smallMultipleGeometry(axis(["0", "100 萬"]), ["1"]).plot.left;
    const pct = smallMultipleGeometry(axis(["0", "100%"]), ["1"]).plot.left;
    expect(wan).toBe(2 + 6 + 7 * 4 + 12);
    expect(pct).toBe(2 + 6 + 7 * 3 + 11);
  });
});

describe("G19 meetingHistoryModel（meeting-series-v1 的點；不同段之間多一個空位置）", () => {
  it("示範歷史：5 點 3 段 → 7 個位置（兩個間隙：不同資料集、期間不同）；X 標是資料本期 M/D–M/D；兩張子圖（淨營收、扣廣告後貢獻）各自的軸", () => {
    const model = meetingHistoryModel(history);
    const [goldenMeeting, demo42, week1, week2, , week3Again] = history;
    expect(model.slots.map(point => point?.id ?? null)).toEqual([goldenMeeting.id, null, demo42.id, null, week1.id, week2.id, week3Again.id]);
    expect(model.gaps).toEqual([{ index: 1, label: copy.differentDataset }, { index: 3, label: copy.differentPeriod }]);
    expect(model.xLabels).toEqual(["8/2–8/2", "", "7/13–8/23", "", "8/3–8/9", "8/10–8/16", "8/17–8/23"]);
    expect(model.panels.map(panel => [panel.key, panel.title])).toEqual(MEETING_HISTORY_METRICS.map(metric => [metric, metricDefinitions[metric].label]));
    for (const panel of model.panels) {
      const metric = panel.key as "net_revenue" | "contribution_after_marketing";
      const [line] = panel.series;
      expect(panel.series).toHaveLength(1);
      expect(line).toMatchObject({ key: MEETING_HISTORY_SERIES, color: chartColors.total, dots: true, lastDot: true, lastLabel: formatAmountL1(kpi(week3Again, metric)) });
      expect(line.values).toEqual(model.slots.map(point => point === null ? null : Number(point[metric])));
      // 各自的軸：含 0、涵蓋全部點；刻度文字＝formatAxisWan。
      const values = line.values.filter((value): value is number => value !== null);
      expect(panel.axis.domain[0]).toBeLessThanOrEqual(Math.min(0, ...values));
      expect(panel.axis.domain[1]).toBeGreaterThanOrEqual(Math.max(0, ...values));
      expect(panel.axis.ticks).toContain(0);
      const axis = amountAxis(line.values);
      expect(panel.axis.labels).toEqual(formatAxisWan(axis.ticks, axis.step));
    }
    // 不同指標各自的尺度（淨營收的上界比扣廣告後貢獻高）。
    expect(model.panels[0].axis.domain[1]).not.toBe(model.panels[1].axis.domain[1]);
  });

  it("標題只取最新一段可比的會議（3 次週會）：「近 3 次會議，扣廣告後貢獻從 {第 1 週} 到 {第 3 週（重開）}」；副標有斷段句；子句 ≤ 14 字", () => {
    const model = meetingHistoryModel(history);
    const [, , week1, , , week3Again] = history;
    expect(model.title).toBe(fill(copy.title, { n: 3, metric: metricDefinitions.contribution_after_marketing.label, a: formatAmountL1(kpi(week1, "contribution_after_marketing")), b: formatAmountL1(kpi(week3Again, "contribution_after_marketing")) }));
    expect(model.subtitle).toBe(fill(copy.subtitleBreaks, { subtitle: fill(copy.subtitle, { n: 5 }) }));
    for (const clause of model.title.split("，")) expect([...clause.replace(/[\d.,−+ ]|萬|元/g, "")].length, clause).toBeLessThanOrEqual(14);
  });

  it("最新一段只有 1 次時標題用區塊名；保留不到 2 次時標題是區塊名、副標是空狀態句", () => {
    const [goldenMeeting, demo42] = history;
    expect(meetingHistoryModel([goldenMeeting, demo42]).title).toBe(copy.section);
    expect(meetingHistoryModel([goldenMeeting, demo42]).subtitle).toBe(fill(copy.subtitleBreaks, { subtitle: fill(copy.subtitle, { n: 2 }) }));
    const empty = meetingHistoryModel([goldenMeeting]);
    expect(empty.title).toBe(copy.section);
    expect(empty.subtitle).toBe(copy.subtitleEmpty);
    expect(empty.series.points).toEqual([]);
  });
});

describe("G19 SSR：位置、外框、圖與資料表", () => {
  it("chart-meeting-history 在 section.panel.meeting-history 內、說明句之後、歷史清單之前；inline（沒有 .panel 套 .panel）、h3、≤ 767px 框高變數＝sm × 2；全區一份", () => {
    const html = renderHistory(history);
    const section = element(html, 'data-testid="meeting-history"')!;
    expect(all(section, /data-testid="chart-meeting-history"/g)).toHaveLength(1);
    const note = section.indexOf(`<p class="note">${escapeAttr(labels.meeting.page.historyNote)}</p>`);
    const chart = section.indexOf('data-testid="chart-meeting-history"');
    const list = section.indexOf('<ul class="meeting-history-list">');
    expect(note).toBeGreaterThan(-1);
    expect(note).toBeLessThan(chart);
    expect(chart).toBeLessThan(list);
    // 只有外層一個 .panel（ChartFrame variant="inline" 是 section.chart-section.is-inline）。
    expect(all(section, /class="[^"]*\bpanel\b[^"]*"/g)).toHaveLength(1);
    expect(openTag(section, 'data-testid="chart-meeting-history"')).toBe('<section class="chart-section is-inline" aria-labelledby="meeting-history-chart-title" aria-describedby="meeting-history-chart-sub" data-testid="chart-meeting-history">');
    expect(openTag(section, 'class="meeting-history-chart"')).toBe(`<div class="meeting-history-chart" style="--multiples-h:${chartHeights.sm * 2}px">`);
    expect(chartOf(html)).toMatch(/^<section[^>]*><div class="sec-head"><div class="sec-title"><h3 id="meeting-history-chart-title">/);
    // 既有的歷史項目 testid 與數量不變（6 次會議都列在清單，圖上只畫 5 點）。
    expect(all(section, /data-testid="meeting-history-item"/g)).toHaveLength(6);
    expect(checkChartMarkup(`<main id="main-content">${html}</main>`, { page: "meeting" }).mainSections).toEqual(["chart-meeting-history"]);
    expect(checkChartMarkup(`<main id="main-content">${html}</main>`, { page: "meeting" }).violations).toMatchObject({ "CL-1": [], "CL-2": [], "CL-9": [], "CL-11": [] });
  });

  it("圖框：.chart-frame.sm.multiples、aria-hidden、高 sm；兩張子圖（淨營收、扣廣告後貢獻）；裡面沒有熱區、按鈕、連結、tabindex、<details>；沒有任何 chartColors.current", () => {
    const html = renderHistory(history);
    const frame = frameOf(html);
    expect(attrs(frame)).toMatchObject({ class: "chart-frame sm multiples", style: `height:${chartHeights.sm}px`, "aria-hidden": "true", "data-state": "ready" });
    expect(all(frame, /class="multiple" data-panel="([^"]+)"/g).map(match => match[1])).toEqual([...MEETING_HISTORY_METRICS]);
    expect(all(frame, /<text class="multiple-title"[^>]*>([^<]+)<\/text>/g).map(match => match[1])).toEqual(MEETING_HISTORY_METRICS.map(metric => metricDefinitions[metric].label));
    expect(frame).not.toMatch(/chart-point-hit|<button|<a\s|tabindex|<details/i);
    expect(chartOf(html)).not.toContain(chartColors.current);
    expect(html).not.toContain(chartColors.current);
  });

  it("每張子圖：斷段處不連線（只有 3 次週會連成一條，golden 與 42 天各自一點）；每點 2px 小點、最後一點（最近一次會議）3px 實心並標 L1 值，都是 chartColors.total", () => {
    const frame = frameOf(renderHistory(history));
    const week3Again = history[5];
    for (const metric of MEETING_HISTORY_METRICS) {
      const panel = element(frame, `data-panel="${metric}"`)!;
      const polylines = all(panel, /<polyline points="([^"]+)" fill="none" stroke="([^"]+)" stroke-width="1.5"/g);
      expect(polylines, metric).toHaveLength(1);
      expect(polylines[0][1].split(" "), metric).toHaveLength(3);
      expect(polylines[0][2]).toBe(chartColors.total);
      const dots = all(panel, /<circle class="multiple-point" data-index="(\d+)"[^>]* r="2" fill="([^"]+)"/g);
      expect(dots.map(match => Number(match[1])), metric).toEqual([0, 2, 4, 5]);
      expect(new Set(dots.map(match => match[2]))).toEqual(new Set([chartColors.total]));
      const last = all(panel, /<circle class="multiple-last" data-index="(\d+)" data-key="([^"]+)"[^>]* r="3" fill="([^"]+)"/g);
      expect(last.map(match => [Number(match[1]), match[2], match[3]]), metric).toEqual([[6, week3Again.id, chartColors.total]]);
      expect(textOf(element(panel, 'class="chart-value is-strong"') ?? ""), metric).toBe(formatAmountL1(kpi(week3Again, metric)));
      // 前後都斷的單一點（1.5px）不另畫：小點已涵蓋。
      expect(panel).not.toMatch(/<circle cx="[^"]+" cy="[^"]+" r="1.5"/);
    }
  });

  it("間隙標在量到的寬（1440 每張約 409px）時畫在兩個間隙：「不同資料集」「期間不同」；SSR 的預設寬放不下時不畫（原因仍在資料表）", () => {
    const model = meetingHistoryModel(history);
    const wide = renderToStaticMarkup(createElement(SmallMultiples, { panels: model.panels, xLabels: model.xLabels, gaps: model.gaps, fitXLabels: true, width: WIDE }));
    for (const metric of MEETING_HISTORY_METRICS) {
      const panel = element(wide, `data-panel="${metric}"`)!;
      expect(all(panel, /<text class="multiple-gap" data-index="(\d)"[^>]*>([^<]+)<\/text>/g).map(match => [Number(match[1]), match[2]])).toEqual([[1, copy.differentDataset], [3, copy.differentPeriod]]);
      expect(openTag(panel, 'class="multiple-gaps"')).toBe(`<g class="multiple-gaps" fill="${chartColors.axis}">`);
    }
    expect(frameOf(renderHistory(history))).not.toContain("multiple-gap\"");
  });

  it("資料表（C33，純文字）：列數＝圖上的會議數 5；欄＝會議日期、會議名稱、資料本期、淨營收（元）、扣廣告後貢獻（元）、與前一次可比；金額 L2；表後註明斷段與省略 1 次", () => {
    const html = renderHistory(history);
    const chart = chartOf(html);
    const details = element(chart, '<details class="data-alternative"')!;
    expect(openTag(details, "<details")).not.toMatch(/\sopen=""/);
    expect(details).toContain(`<summary>${escapeAttr(fill(labels.overview.page.dataTable, { title: copy.section }))}</summary>`);
    const table = element(details, 'data-testid="chart-meeting-history-table"')!;
    expect(table).toContain(`<caption>${escapeAttr(yuanColumn(copy.section))}</caption>`);
    expect(all(element(table, "<thead>")!, /<th scope="col"[^>]*>([^<]+)<\/th>/g).map(match => match[1])).toEqual([copy.columns.date, copy.columns.name, copy.columns.period, yuanColumn(metricDefinitions.net_revenue.label), yuanColumn(metricDefinitions.contribution_after_marketing.label), copy.columns.comparable]);
    const rows = all(element(table, "<tbody>")!, /<tr>(.*?)<\/tr>/g).map(match => all(match[1], /<t[hd][^>]*>(.*?)<\/t[hd]>/g).map(cell => textOf(cell[1])));
    const points = meetingSeries(history).points;
    expect(rows).toHaveLength(5);
    expect(rows.map(row => row[0])).toEqual(points.map(point => point.date));
    expect(rows.map(row => row[1])).toEqual(points.map(point => point.name));
    expect(rows.map(row => row[2])).toEqual(points.map(point => formatPeriodL1(point.period.start, point.period.end, { days: false, anchor: "2026-08-23" })));
    expect(rows.map(row => row[3])).toEqual(points.map(point => formatAmountL2(point.net_revenue)));
    expect(rows.map(row => row[4])).toEqual(points.map(point => formatAmountL2(point.contribution_after_marketing)));
    expect(rows.map(row => row[5])).toEqual([copy.comparable.first, fill(copy.comparable.no, { reason: copy.differentDataset }), fill(copy.comparable.no, { reason: copy.differentPeriod }), copy.comparable.yes, copy.comparable.yes]);
    expect(table).not.toContain("<button");
    expect(details).toContain(`<p class="note">${escapeAttr(copy.breakNote)}</p>`);
    expect(details).toContain(`<p class="note">${escapeAttr(fill(copy.omittedNote, { n: 1 }))}</p>`);
  });

  it("保留不到 2 次時等高空狀態（data-state=empty、高 sm、說明句；沒有 svg）：1 次會議、2 次但本期相同（表後註明省略 1 次）；沒有任何會議時不渲染圖，只有 v3 的空狀態區塊", async () => {
    const again = meetingVariant(golden, { id: "again", date: "2026-08-04", finalized_at: "2026-08-04T06:00:00.000Z" });
    for (const [name, meetings, omitted] of [["一次", [golden], 0], ["本期相同", [golden, again], 1]] as const) {
      const html = renderHistory(meetings);
      const chart = chartOf(html);
      expect(chart, name).not.toBeNull();
      const frame = frameOf(html);
      expect(attrs(frame), name).toMatchObject({ class: "chart-frame sm multiples", style: `height:${chartHeights.sm}px`, "data-state": "empty" });
      expect(frame, name).not.toContain("aria-hidden");
      expect(textOf(frame), name).toBe(copy.empty);
      expect(chart, name).not.toContain("<svg");
      expect(textOf(element(chart, 'id="meeting-history-chart-title"')!), name).toBe(copy.section);
      expect(textOf(element(chart, 'id="meeting-history-chart-sub"')!), name).toBe(copy.subtitleEmpty);
      const table = element(chart, 'data-testid="chart-meeting-history-table"')!;
      expect(element(table, "<tbody>"), name).toBe("<tbody></tbody>");
      expect(chart.includes(escapeAttr(fill(copy.omittedNote, { n: 1 }))), name).toBe(omitted === 1);
      expect(openTag(html, 'class="meeting-history-chart"'), name).toContain(`--multiples-h:${chartHeights.sm * 2}px`);
    }
    const none = renderHistory([]);
    expect(none).not.toContain("chart-meeting-history");
    expect(none).toContain('<div class="ui-empty-block meeting-history-empty">');
  });

  it("直接渲染 MeetingHistoryChart 與經 MeetingHistory 渲染的圖區塊相同（元件沒有模組層級狀態；同一份歷史兩次渲染結果相同）", async () => {
    const direct = renderToStaticMarkup(createElement(MeetingHistoryChart, { history }));
    expect(element(renderHistory(history), 'class="meeting-history-chart"')).toBe(direct);
    expect(renderToStaticMarkup(createElement(MeetingHistoryChart, { history }))).toBe(direct);
    const other = await finalizedMeeting({ id: "rev-other", name: "另一次", date: "2026-09-01", now: "2026-09-01T06:00:00.000Z", fixture: "demo" });
    expect(renderToStaticMarkup(createElement(MeetingHistoryChart, { history: [other] }))).not.toBe(direct);
  });
});
