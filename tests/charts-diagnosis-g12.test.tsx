import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { isFullWeek } from "../src/application/chart-takeaways";
import { chartColors, chartHeights } from "../src/application/chart-theme";
import { formatAxisPercent } from "../src/application/copy";
import { formatPeriodL1, formatRateL1, metricDefinitions } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { MULTIPLE_SSR_WIDTH, multiplesFrameStyle, rateAxis, smallMultipleGeometry, SmallMultiples, type SmallMultiplePanel } from "../src/components/charts/small-multiples";
import { RATE_METRICS, RATES_TABLE_COLUMNS, ratesEvidence, ratesModel, RatesSection, ratesTableCell } from "../src/components/diagnosis/rates-section";
import { coordinate } from "../src/components/overview/charts/chart-frame";
import { weekEvidence } from "../src/components/overview/charts/trend-section";
import { Diagnosis } from "../src/components/workspace-panels";
import type { DatasetInput } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { element, escapeAttr, openTag, textOf } from "./helpers/markup";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";
import { yoyInput } from "./helpers/yoy-dataset";

// V4-3b 代理 B：G12 五項比率每週走勢（PRD §4.1–§4.7 G12、§5.2 第 5 列、§7.2、§7.4；CHART_CATALOG G12「單元測試」欄、§9.1 C26）的 SSR 結構測試。
// （與代理 A 的 tests/charts-diagnosis-v4.test.tsx 分開，避免同檔衝突。）
// 收合時 chart-diagnosis-rates 仍在 markup（M1）；五個小標＝metricDefinitions 的五項比率名；圖容器（aria-hidden）內沒有 <details>、按鈕、連結與 tabindex；
// 標題等於區塊名（不寫結論句、不做跨比率排名）；每張子圖的 Y 範圍各自涵蓋該比率的全部線（毛利率為負時下界 < 0；物流費佔比取整到 1 個百分點）；
// 資料表列數＝週數（上期＋本期＋去年同期），每格是 number-link，和圖上的點呼叫同一個 builder（weekEvidence，帶 filter.week）；≤ 767px 框高＝chartHeights.sm × 5。

const noop = () => undefined;
const copy = labels.diagnosis.chartsV4.rates;
async function load(input: DatasetInput): Promise<WorkspaceSnapshot> {
  return createSnapshot(validateDataset(input).dataset!, {}, await hashInput(input));
}
type Name = "demo" | "golden" | "refundOnly" | "yoy" | "synthetic";
const snapshots = {} as Record<Name, WorkspaceSnapshot>;
beforeAll(async () => {
  Object.assign(snapshots, {
    demo: await load(fixture("demo")), golden: await load(fixture("golden")), refundOnly: await load(fixture("refund_only")),
    yoy: await load(yoyInput()), synthetic: await load(synthetic4ChannelInput()),
  });
});

const render = (snapshot: WorkspaceSnapshot) => renderToStaticMarkup(createElement(RatesSection, { snapshot, onEvidence: noop }));
/** 開始標籤的屬性。 */
const attrs = (html: string) => Object.fromEntries([...html.slice(0, html.indexOf(">")).matchAll(/\s([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const all = (html: string, re: RegExp) => [...html.matchAll(re)];
/** 圖的固定高容器（.chart-frame）。 */
const frameOf = (html: string) => element(element(html, 'data-testid="chart-diagnosis-rates"')!, 'class="chart-frame')!;
const panelOf = (html: string, rate: string) => element(frameOf(html), `data-panel="${rate}"`)!;
const points = (text: string) => text.split(" ").map(pair => pair.split(",").map(Number) as [number, number]);

describe("C26 rateAxis 與比率軸刻度（純函式）", () => {
  it("範圍 < 10 個百分點取整到 1：示範資料物流費佔比 1.14%–1.93% → 0 到 2%，刻度 0、1、2%", () => {
    expect(rateAxis([0.0114, 0.0193, null])).toEqual({ domain: [0, 0.02], ticks: [0, 0.01, 0.02], step: 0.01 });
    expect(formatAxisPercent([0, 0.01, 0.02])).toEqual(["0%", "1%", "2%"]);
  });
  it("範圍 ≥ 10 個百分點取整到 5：毛利率 36%–45% → 0 到 45%，刻度每 10（最多約 6 個）；折扣率 8.9%–18.3% → 0 到 20%，刻度每 5", () => {
    expect(rateAxis([0.3626, 0.4476])).toEqual({ domain: [0, 0.45], ticks: [0, 0.1, 0.2, 0.3, 0.4], step: 0.1 });
    expect(rateAxis([0.0885, 0.1831])).toEqual({ domain: [0, 0.2], ticks: [0, 0.05, 0.1, 0.15, 0.2], step: 0.05 });
    // 9.48 個百分點（< 10）：取整到 1，上界 10，刻度放大成每 2。
    expect(rateAxis([0.0506, 0.0948])).toEqual({ domain: [0, 0.1], ticks: [0, 0.02, 0.04, 0.06, 0.08, 0.1], step: 0.02 });
  });
  it("毛利率為負時下界跟著往下（< 0）、含 0；沒有任何值時 0 到 1%", () => {
    const axis = rateAxis([-0.12, 0.08]);
    expect(axis.domain[0]).toBeLessThan(0);
    expect(axis).toEqual({ domain: [-0.15, 0.1], ticks: [-0.15, -0.1, -0.05, 0, 0.05, 0.1], step: 0.05 });
    expect(rateAxis([-0.004, 0.003]).domain).toEqual([-0.01, 0.01]);
    expect(rateAxis([null, null])).toEqual({ domain: [0, 0.01], ticks: [0, 0.01], step: 0.01 });
  });
  it("formatAxisPercent：整數百分比、負號 U+2212、0 寫「0%」、步長不是整數百分點時留 1 位", () => {
    expect(formatAxisPercent([-0.15, -0.05, 0, 0.025, 0.45])).toEqual(["−15%", "−5%", "0%", "2.5%", "45%"]);
    expect(formatAxisPercent([0.07, 0.1 + 0.2])).toEqual(["7%", "30%"]);
    expect(formatAxisPercent([0.05])[0]).toBe(fill(labels.format.units.percent, { value: "5" }));
  });
});

describe("C26 smallMultipleGeometry（純函式）", () => {
  const panel = (values: (number | null)[]): SmallMultiplePanel => ({ key: "gross_margin", title: "x", axis: { domain: [0, 0.5], ticks: [0, 0.25, 0.5], labels: formatAxisPercent([0, 0.25, 0.5]) }, series: [{ key: "current", color: chartColors.current, strokeWidth: 2, values, lastDot: true, lastLabel: "40.0%" }] });
  it("Y：domain 上界在繪圖區頂、下界在底；X：n 個位置平均分，第 i 個在 (i＋0.5)／n；svg 高＝chartHeights.sm", () => {
    const geometry = smallMultipleGeometry(panel([0.5, 0, 0.25]), ["1", "2", "3"], { width: 240 });
    expect(geometry.height).toBe(chartHeights.sm);
    const [a, b, c] = geometry.series[0].points;
    expect(a.y).toBe(geometry.plot.top);
    expect(b.y).toBe(geometry.plot.bottom);
    expect(c.y).toBeCloseTo((geometry.plot.top + geometry.plot.bottom) / 2, 0);
    const slot = (geometry.plot.right - geometry.plot.left) / 3;
    expect(a.x).toBeCloseTo(geometry.plot.left + slot / 2, 0);
    expect(c.x).toBeCloseTo(geometry.plot.left + slot * 2.5, 0);
    expect(geometry.grid.map(line => line.label)).toEqual(["0%", "25%", "50%"]);
  });
  it("缺週斷線（不內插、不當 0）：null 把線切成兩段；前後都斷的單一點另列；最後一點與線尾標值在最後一個有值的位置", () => {
    const geometry = smallMultipleGeometry(panel([0.1, 0.2, null, 0.3, null, 0.4, 0.45]), ["1", "2", "3", "4", "5", "6", "7"], { width: 300 });
    const line = geometry.series[0];
    expect(line.lines).toHaveLength(2);
    expect(points(line.lines[0])).toHaveLength(2);
    expect(line.isolated.map(point => point.index)).toEqual([3]);
    expect(line.points.map(point => point.index)).toEqual([0, 1, 3, 5, 6]);
    expect(line.last?.index).toBe(6);
    expect(line.lastLabel?.text).toBe("40.0%");
    expect(line.lastLabel!.x).toBeLessThan(line.last!.x);
  });
  it("位置太窄時（768 一列 5 張，每張約 80px）X 標只留頭尾、熱區縮成位置寬的一半（相鄰不重疊）、放不下的線尾標值不畫", () => {
    const xLabels = ["1", "2", "3", "4", "5", "6"];
    const narrow = smallMultipleGeometry(panel([0.1, 0.2, 0.3, 0.4, 0.4, 0.4]), xLabels, { width: 80 });
    expect(narrow.xTicks.map(tick => tick.label)).toEqual(["1", "6"]);
    const slot = (narrow.plot.right - narrow.plot.left) / 6;
    expect(narrow.hitRadius).toBeLessThanOrEqual(slot / 2 + 0.05);
    expect(narrow.series[0].lastLabel).toBeNull();
    const wide = smallMultipleGeometry(panel([0.1, 0.2, 0.3, 0.4, 0.4, 0.4]), xLabels, { width: MULTIPLE_SSR_WIDTH });
    expect(wide.xTicks).toHaveLength(6);
    expect(wide.hitRadius).toBe(8);
    expect(wide.series[0].lastLabel?.text).toBe("40.0%");
  });
  it("≤ 767px 的框高＝chartHeights.sm × 子圖數（CSS 變數 --multiples-h，放在 ChartFrame 的祖先上）", () => {
    expect(multiplesFrameStyle(5)).toEqual({ "--multiples-h": `${chartHeights.sm * 5}px` });
    expect(multiplesFrameStyle(2)).toEqual({ "--multiples-h": `${chartHeights.sm * 2}px` });
  });
  it("SmallMultiples（SSR）：每張子圖一個 aria-hidden 的 svg，沒有按鈕、連結、tabindex、<details>；沒給 onPoint 時不輸出熱區", () => {
    const html = renderToStaticMarkup(createElement(SmallMultiples, { panels: [panel([0.1, 0.2])], xLabels: ["1", "2"] }));
    expect(all(html, /<svg /g)).toHaveLength(1);
    expect(attrs(openTag(html, 'class="chart-multiple"')!)).toMatchObject({ "aria-hidden": "true", focusable: "false", height: String(chartHeights.sm) });
    expect(html).not.toMatch(/<button|<a |tabindex|<details/i);
    expect(html).not.toContain("chart-point-hit");
  });
});

describe("G12 ratesModel（A 級：只挑選 snapshot.weeks 與 snapshot.yoy.weeks 的既有比率）", () => {
  it("示範資料：五個子圖依序是折扣率、退款金額比、物流費佔比、廣告佔比、商品毛利率；本期與上期各 6 週以第幾週對齊；去年同期不可用", () => {
    const model = ratesModel(snapshots.demo);
    expect(RATE_METRICS).toEqual(["discount_rate", "refund_ratio", "fulfillment_burden", "marketing_burden", "gross_margin"]);
    expect(model.panels.map(panel => panel.title)).toEqual(RATE_METRICS.map(rate => metricDefinitions[rate].label));
    expect(model.xLabels).toEqual(["1", "2", "3", "4", "5", "6"]);
    expect(model.yoyReady).toBe(false);
    expect(model.panels.every(panel => panel.series.map(line => line.key).join() === "previous,current")).toBe(true);
    const current = snapshots.demo.weeks.filter(week => week.period === "current");
    const previous = snapshots.demo.weeks.filter(week => week.period === "previous");
    for (const panel of model.panels) {
      const rate = panel.key as typeof RATE_METRICS[number];
      expect(panel.series.find(line => line.key === "current")!.values).toEqual(current.map(week => coordinate(week.metrics[rate])));
      expect(panel.series.find(line => line.key === "previous")!.values).toEqual(previous.map(week => coordinate(week.metrics[rate])));
      expect(panel.series.find(line => line.key === "current")!.keys).toEqual(current.map(week => week.start));
      // 線尾標本期最後一週的 L1 百分比（domain 字串格式化，不經座標）。
      expect(panel.series.find(line => line.key === "current")!.lastLabel).toBe(formatRateL1(current.at(-1)!.metrics[rate].value));
    }
    expect(model.rows).toEqual([...previous, ...current]);
    expect(model.subtitle).toBe(fill(copy.subtitle, { period: formatPeriodL1(snapshots.demo.report.current.period.start, snapshots.demo.report.current.period.end, { days: false, anchor: snapshots.demo.data_as_of }), n: 6 }));
    expect(model.incomplete).toBe(false);
  });

  it("每張子圖的 Y 各自涵蓋該比率的全部線（同一比率共用、不同比率各自）：物流費佔比 0 到 2%（取整到 1 個百分點），毛利率 0 到 45%（取整到 5）", () => {
    const model = ratesModel(snapshots.demo);
    for (const panel of model.panels) {
      const values = panel.series.flatMap(line => line.values).filter((value): value is number => value !== null);
      expect(panel.axis.domain[0], panel.key).toBeLessThanOrEqual(Math.min(0, ...values));
      expect(panel.axis.domain[1], panel.key).toBeGreaterThanOrEqual(Math.max(...values));
      expect(panel.axis.ticks).toContain(0);
      expect(panel.axis.labels).toEqual(formatAxisPercent(panel.axis.ticks));
    }
    const domains = Object.fromEntries(model.panels.map(panel => [panel.key, panel.axis.domain]));
    expect(domains).toEqual({ discount_rate: [0, 0.2], refund_ratio: [0, 0.05], fulfillment_burden: [0, 0.02], marketing_burden: [0, 0.1], gross_margin: [0, 0.45] });
    expect(new Set(Object.values(domains).map(domain => domain.join())).size).toBe(5);
  });

  it("去年同期可用（兩年合成資料）：每張子圖三條線（上期、去年同期、本期，本期在最上層）；去年同期第 i 週對齊本期第 i 週；Y 範圍也涵蓋去年同期", () => {
    const model = ratesModel(snapshots.yoy);
    const yoy = snapshots.yoy.yoy;
    if (yoy?.status !== "ready") throw new Error("yoy 不可用");
    expect(model.yoyReady).toBe(true);
    const current = snapshots.yoy.weeks.filter(week => week.period === "current");
    for (const panel of model.panels) {
      expect(panel.series.map(line => line.key)).toEqual(["previous", "yoy", "current"]);
      const line = panel.series.find(item => item.key === "yoy")!;
      expect(line).toMatchObject({ color: chartColors.yoy, dash: "4 3", strokeWidth: 1.5 });
      expect(line.values).toEqual(yoy.weeks.slice(0, current.length).map(week => coordinate(week.metrics[panel.key as typeof RATE_METRICS[number]])));
      const values = panel.series.flatMap(item => item.values).filter((value): value is number => value !== null);
      expect(panel.axis.domain[1]).toBeGreaterThanOrEqual(Math.max(...values));
    }
    expect(model.rows).toHaveLength(snapshots.yoy.weeks.length + Math.min(yoy.weeks.length, current.length));
  });

  it("未滿 7 天的週（X40）：比率照常畫；資料表的起訖日註明「未滿 7 天」並在表後加一句說明（4 通路合成資料兩期最後一週都只有 3 天）", () => {
    const model = ratesModel(snapshots.synthetic);
    expect(model.incomplete).toBe(true);
    const last = snapshots.synthetic.weeks.filter(week => week.period === "current").at(-1)!;
    expect(isFullWeek(last)).toBe(false);
    const discount = model.panels.find(panel => panel.key === "discount_rate")!;
    expect(discount.series.find(line => line.key === "current")!.values.at(-1)).toBe(coordinate(last.metrics.discount_rate));
    const range = formatPeriodL1(last.start, last.end, { days: false, anchor: snapshots.synthetic.data_as_of });
    expect(ratesTableCell(last, RATES_TABLE_COLUMNS[0], snapshots.synthetic.data_as_of)).toEqual({ value: fill(copy.incompleteRange, { range }) });
    const html = render(snapshots.synthetic);
    expect(html).toContain(escapeAttr(fill(copy.incompleteRange, { range })));
    expect(html).toContain(`<p class="note">${copy.incompleteNote}</p>`);
    // 合成資料有缺週（扣項缺列的週比率是資料待補）：線斷開，不當 0。
    const marketing = model.panels.find(panel => panel.key === "marketing_burden")!;
    expect(marketing.series.find(line => line.key === "previous")!.values[1]).toBeNull();
    expect(render(snapshots.demo)).not.toContain(copy.incompleteNote);
  });

  it("兩期週數不同時副標寫各自的週數；所有比率都沒有值（refund_only）時軸是 0 到 1%、線不畫", () => {
    const uneven = { ...snapshots.demo, weeks: snapshots.demo.weeks.slice(1) };
    expect(ratesModel(uneven).subtitle).toBe(fill(copy.subtitleUneven, { period: formatPeriodL1(snapshots.demo.report.current.period.start, snapshots.demo.report.current.period.end, { days: false, anchor: snapshots.demo.data_as_of }), current: 6, previous: 5 }));
    const model = ratesModel(snapshots.refundOnly);
    expect(model.panels.every(panel => panel.axis.domain.join() === "0,0.01")).toBe(true);
    const html = render(snapshots.refundOnly);
    expect(frameOf(html)).not.toContain("<polyline");
  });
});

describe("G12 SSR：<details> 收合時掛載、圖容器與資料表", () => {
  it("收合的 <details class=\"chart-more\">（沒有 open）：summary「五項比率走勢」；chart-diagnosis-rates 與資料表都在 markup（M1）；≤ 767px 框高變數＝sm × 5", () => {
    const html = render(snapshots.demo);
    const details = attrs(openTag(html, 'class="chart-more rates-more"')!);
    expect(details.open).toBeUndefined();
    expect(details.style).toBe(`--multiples-h:${chartHeights.sm * 5}px`);
    expect(textOf(element(html, "<summary")!)).toBe(copy.summary);
    expect(html.indexOf("<summary")).toBeLessThan(html.indexOf('data-testid="chart-diagnosis-rates"'));
    expect(all(html, /data-testid="chart-diagnosis-rates"/g)).toHaveLength(1);
    expect(all(html, /data-testid="chart-diagnosis-rates-table"/g)).toHaveLength(1);
  });

  it("標題等於區塊名「五項比率每週走勢」（不寫結論句）；副標是 aria 描述；圖例本期、上期線段、去年同期虛線段（不可用時標「無資料」）", () => {
    const html = render(snapshots.demo);
    const section = element(html, 'data-testid="chart-diagnosis-rates"')!;
    expect(attrs(section)).toMatchObject({ class: "panel chart-section rates-section", "aria-labelledby": "rates-title", "aria-describedby": "rates-sub" });
    expect(textOf(element(section, 'id="rates-title"')!)).toBe(copy.title);
    expect(copy.title).toBe("五項比率每週走勢");
    expect(textOf(element(section, 'id="rates-sub"')!)).toBe(ratesModel(snapshots.demo).subtitle);
    const legend = element(section, 'class="legend"')!;
    expect(textOf(legend)).toBe(`${labels.overview.chartFrame.legend.current}${labels.overview.chartFrame.legend.previous}${labels.overview.trendYoyV3.legend}${labels.overview.chartFrame.noData}`);
    expect(legend).toContain('stroke-dasharray="4 3"');
    expect(textOf(element(render(snapshots.yoy), 'class="legend"')!)).toBe(`${labels.overview.chartFrame.legend.current}${labels.overview.chartFrame.legend.previous}${labels.overview.trendYoyV3.legend}`);
  });

  it("圖容器：.chart-frame.sm.multiples、aria-hidden；內含五張子圖（小標＝指標名），沒有 <details>、按鈕、連結、tabindex（CL-7、X35）", () => {
    const html = render(snapshots.demo);
    const frame = frameOf(html);
    expect(attrs(frame)).toMatchObject({ class: "chart-frame sm multiples", "aria-hidden": "true", "data-state": "ready", style: `height:${chartHeights.sm}px` });
    expect(frame).not.toMatch(/<details|<button|<a |tabindex/i);
    expect(all(frame, /<svg class="chart-multiple"/g)).toHaveLength(5);
    expect(all(frame, /class="multiple-title"[^>]*>([^<]*)</g).map(match => match[1])).toEqual(RATE_METRICS.map(rate => metricDefinitions[rate].label));
    expect(all(frame, /data-panel="([^"]+)"/g).map(match => match[1])).toEqual([...RATE_METRICS]);
  });

  it("每張子圖：本期 2px chartColors.current、上期 1.5px chartColors.previous；本期最後一點 3px 實心並標 L1；Y 標是該比率自己的刻度；週點熱區是透明的 circle.chart-point-hit（data-series、data-index、data-key＝週起日）", () => {
    const html = render(snapshots.demo);
    const model = ratesModel(snapshots.demo);
    for (const rate of RATE_METRICS) {
      const panel = panelOf(html, rate);
      const lines = all(panel, /<polyline[^>]*>/g).map(match => attrs(match[0]));
      expect(lines.map(line => [line.stroke, line["stroke-width"]])).toEqual([[chartColors.previous, "1.5"], [chartColors.current, "2"]]);
      expect(points(lines[1].points)).toHaveLength(6);
      const last = attrs(openTag(panel, 'class="multiple-last"')!);
      expect(last).toMatchObject({ r: "3", fill: chartColors.current });
      expect(panel).toContain(`>${formatRateL1(snapshots.demo.weeks.filter(week => week.period === "current").at(-1)!.metrics[rate].value)}</text>`);
      const expectedTicks = model.panels.find(item => item.key === rate)!.axis.labels;
      expect(all(element(panel, 'class="multiple-axis"')!, /text-anchor="end"[^>]*>([^<]*)</g).map(match => match[1])).toEqual([...expectedTicks]);
      const hits = all(panel, /<circle class="chart-point-hit"[^>]*>/g).map(match => attrs(match[0]));
      expect(hits).toHaveLength(12);
      for (const hit of hits) {
        expect(hit.fill).toBe("transparent");
        const week = model.weeks[hit["data-series"] as "previous" | "current"][Number(hit["data-index"])];
        expect(hit["data-key"]).toBe(week.start);
      }
    }
  });

  it("資料表：列數＝週數（上期 6＋本期 6）、欄＝起訖日＋五項比率；每格 L2 百分比 number-link；和圖上的點同一個 builder（weekEvidence，帶 filter.week）", () => {
    const html = render(snapshots.demo);
    const table = element(html, 'data-testid="chart-diagnosis-rates-table"')!;
    expect(attrs(table).class).toBe("ui-table chart-data-table rates-data-table");
    const model = ratesModel(snapshots.demo);
    const body = element(table, "<tbody")!;
    expect(all(body, /<tr>/g)).toHaveLength(model.rows.length);
    expect(model.rows).toHaveLength(12);
    expect(all(body, /class="number-link"/g)).toHaveLength(model.rows.length * 5);
    expect(all(element(table, "<thead")!, /<th scope="col"[^>]*>([^<]*)/g).map(match => match[1])).toEqual([labels.overview.page.colPeriod, labels.overview.page.colRange, ...RATE_METRICS.map(rate => metricDefinitions[rate].label)]);
    const caption = fill(copy.caption, { title: copy.title, period: formatPeriodL1(snapshots.demo.report.current.period.start, snapshots.demo.report.current.period.end, { days: false, anchor: snapshots.demo.data_as_of }) });
    expect(table).toContain(`<caption>${caption}</caption>`);
    expect(html).toContain(`<summary>${fill(labels.overview.page.dataTable, { title: copy.title })}</summary>`);
    const first = model.rows[0];
    expect(body).toContain(`aria-label="${escapeAttr(fill(copy.cellAria, { week: first.label, metric: metricDefinitions.discount_rate.label, value: formatRateL1(first.metrics.discount_rate.value) }))}"`);
    for (const week of model.rows) for (const rate of RATE_METRICS) {
      const evidence = ratesEvidence(snapshots.demo, week, rate);
      expect(evidence).toEqual(weekEvidence(week, rate, snapshots.demo.report.scope.channels));
      expect(evidence.filter).toEqual({ week: { start: week.start, end: week.end, label: week.label } });
      expect(evidence.metricVersion).toBeUndefined();
    }
  });
});

describe("G12 在健檢頁的位置與護欄", () => {
  const page = (snapshot: WorkspaceSnapshot) => renderToStaticMarkup(createElement(Diagnosis, { snapshot, onEvidence: noop, onCreateAction: noop }));
  it("G10 之後、通路寬表之前；G12 在 <details> 內，不算主層獨立圖區塊（CL-9）；chart-lint SSR 規則 0 違規", () => {
    const html = page(snapshots.demo);
    expect(html.indexOf('data-testid="chart-diagnosis-share"')).toBeLessThan(html.indexOf('data-testid="chart-diagnosis-rates"'));
    expect(html.indexOf('data-testid="chart-diagnosis-rates"')).toBeLessThan(html.indexOf('data-testid="channel-compare"'));
    const details = element(html, 'class="chart-more rates-more"')!;
    expect(details).toContain('data-testid="chart-diagnosis-rates"');
    const { violations, mainSections } = checkChartMarkup(html, { page: "diagnosis" });
    expect(mainSections).not.toContain("chart-diagnosis-rates");
    for (const [rule, list] of Object.entries(violations)) expect(list, rule).toEqual([]);
  });
  it("示範資料的 G12（收合時）DOM 元素數在預算內（B9 健檢頁餘裕約 1,290，G11 與 G12 共用）：≤ 450", () => {
    const html = render(snapshots.demo);
    expect(all(html, /<[a-zA-Z]/g).length).toBeLessThanOrEqual(450);
  });
  it("golden（兩期各 1 天）：每張子圖各 1 個位置，本期與上期各一個孤立點（不畫線），資料表 2 列", () => {
    const model = ratesModel(snapshots.golden);
    expect(model.xLabels).toEqual(["1"]);
    const html = render(snapshots.golden);
    expect(frameOf(html)).not.toContain("<polyline");
    expect(all(element(element(html, 'data-testid="chart-diagnosis-rates-table"')!, "<tbody")!, /<tr>/g)).toHaveLength(2);
  });
});
