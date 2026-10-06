import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { scanTsxText } from "../scripts/lib/ui-scan.mjs";
import { channelConclusion, trendTakeaways } from "../src/application/chart-takeaways";
import { chartColors, chartHeights } from "../src/application/chart-theme";
import { channelLabel, demoAlias } from "../src/application/copy";
import type { EventSet } from "../src/application/events";
import { formatAmountL2, formatMetric, metricDefinitions } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import type { EvidenceSelection } from "../src/components/evidence-drawer";
import { Overview } from "../src/components/overview";
import { axisTicks, ChartFrame, type ChartFrameState } from "../src/components/overview/charts/chart-frame";
import { ChannelSection, channelEvidence } from "../src/components/overview/charts/channel-section";
import { lastPoints, TrendSection, trendRows } from "../src/components/overview/charts/trend-section";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, escapeAttr, openTag, textOf } from "./helpers/markup";

// V3-4b 代理 B2：C16 ChartFrame、區塊 7 每週趨勢、區塊 8 各通路（PRD §7.1 第 7、8 點、§9.4 C16、§9.5、§11.1「圖表」）。
// SSR（golden、demo）結構測試：期待值一律由 labels、fill、chart-takeaways 與 presentation 的格式化函式從 snapshot 的精確字串組出，不寫死數字。
// Recharts 在伺服器端只輸出容器（圖形由瀏覽器繪製），所以這裡斷言框、標題、takeaway、緊湊表與資料表；圖形與點擊由 E2E 與 channelEvidence 的單元測試涵蓋。

const noop = () => undefined;
const frameCopy = labels.overview.chartFrame, trendCopy = labels.overview.trendV3, channelCopy = labels.overview.channelsV3, ui = labels.ui.overview;
async function load(name: string): Promise<WorkspaceSnapshot> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}
let golden: WorkspaceSnapshot;
let demo: WorkspaceSnapshot;
beforeAll(async () => { golden = await load("golden"); demo = await load("demo"); });

const overview = (snapshot: WorkspaceSnapshot, events: EventSet | null = null) => renderToStaticMarkup(createElement(Overview, { snapshot, onEvidence: noop, events, datasetName: "demo", missingItems: 0, actionsSummary: { pending: 0, pinned: [] } }));
const frameTag = (html: string) => openTag(html, 'class="chart-frame ');
const legendHtml = `<div class="sec-end"><div class="legend"><span><i aria-hidden="true" style="background:${chartColors.current}"></i>${labels.periods.current}</span><span><i aria-hidden="true" style="background:${chartColors.previous}"></i>${labels.periods.previous}</span></div></div>`;

describe("C16 ChartFrame：標題列、takeaway 列、固定高度的圖、資料表", () => {
  const render = (props: Partial<Parameters<typeof ChartFrame>[0]> = {}) => renderToStaticMarkup(createElement(ChartFrame, { id: "demo-chart", testId: "demo-chart", title: "T", subtitle: "S", ...props }));

  it("section 以 h2 為名、副標為描述；圖例是線段＋文字；takeaway 是 dl（dd 內可有 small 註記）；資料表是收合的 data-alternative", () => {
    const html = render({
      legend: [{ key: "current", label: labels.periods.current, color: chartColors.current }, { key: "previous", label: labels.periods.previous, color: chartColors.previous }],
      takeaways: [{ key: "a", label: "A", value: "1" }, { key: "b", label: "B", value: "2", note: "n" }],
      dataTable: { summary: "Sum", content: createElement("table", null) },
      children: createElement("svg"),
    });
    expect(openTag(html, 'data-testid="demo-chart"')).toBe('<section class="panel chart-section" aria-labelledby="demo-chart-title" aria-describedby="demo-chart-sub" data-testid="demo-chart">');
    expect(html).toContain('<div class="sec-head"><div class="sec-title"><h2 id="demo-chart-title">T</h2><p class="sub" id="demo-chart-sub">S</p></div>');
    expect(html).toContain(legendHtml);
    expect(html).not.toContain("legend-dot");
    expect(html).toContain('<dl class="takeaways"><div class="takeaway"><dt>A</dt><dd>1</dd></div><div class="takeaway"><dt>B</dt><dd>2<small>n</small></dd></div></dl>');
    expect(frameTag(html)).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" aria-hidden="true" data-state="ready">`);
    expect(element(html, 'class="chart-frame ')).toContain("<svg>");
    expect(html).toMatch(/<details class="data-alternative"><summary>Sum<\/summary><table><\/table><\/details><\/section>$/);
  });

  it("四種狀態（有資料、載入、空、錯誤）都在同一個固定高度的容器裡；lg 為 320px", () => {
    const tags = (["ready", "loading", "empty", "error"] as ChartFrameState[]).map(state => frameTag(render({ state, children: createElement("svg") }))!);
    for (const tag of tags) expect(tag).toMatch(new RegExp(`^<div class="chart-frame sm" style="height:${chartHeights.sm}px"`));
    expect(chartHeights).toEqual({ sm: 180, lg: 320 });
    expect(frameTag(render({ height: "lg", children: createElement("svg") }))).toBe('<div class="chart-frame lg" style="height:320px" aria-hidden="true" data-state="ready">');

    const empty = render();
    expect(frameTag(empty)).toBe('<div class="chart-frame sm" style="height:180px" data-state="empty">');
    expect(empty).toContain(`<p class="chart-frame-message">${frameCopy.noData}</p>`);
    const error = render({ state: "error" });
    expect(error).toContain(`<p class="chart-frame-message">${frameCopy.error}</p>`);
    expect(render({ state: "empty", message: "M" })).toContain('<p class="chart-frame-message">M</p>');
    const loading = render({ state: "loading" });
    expect(openTag(loading, 'data-testid="demo-chart"')).toContain('aria-busy="true"');
    expect(frameTag(loading)).toBe('<div class="chart-frame sm" style="height:180px" aria-hidden="true" data-state="loading">');
    expect(loading).toContain(`<p class="sr-only" role="status">${frameCopy.loading}</p>`);
    expect(openTag(render({ children: createElement("svg") }), 'data-testid="demo-chart"')).not.toContain("aria-busy");
  });
});

describe("區塊 7 每週淨營收與扣廣告後貢獻（ChartFrame id=trend）", () => {
  const events = (snapshot: WorkspaceSnapshot): EventSet => ({ filename: "events.csv", rows: [{ start: snapshot.report.current.period.start, end: snapshot.report.current.period.end, label: "E", line: 2 }] });

  it("demo：標題是標準名稱、副標是週的分組說明；圖例本期／上期；takeaway 兩個數字＝trendTakeaways 的 display（number-link），最近完整週附週範圍", () => {
    const html = overview(demo);
    const trend = byTestId(html, "trend");
    const takeaway = trendTakeaways(demo);
    expect(openTag(html, 'data-testid="trend"')).toBe('<section class="panel chart-section" aria-labelledby="trend-title" aria-describedby="trend-sub" data-testid="trend">');
    expect(trend).toContain(`<h2 id="trend-title">${labels.sections.trend}</h2><p class="sub" id="trend-sub">${takeaway.subtitle}</p>`);
    expect(takeaway.subtitle).toBe(ui.trendNote);
    expect(trend).toContain(legendHtml);
    const dl = element(trend, 'class="takeaways"')!;
    expect([...dl.matchAll(/<dt>([^<]*)<\/dt>/g)].map(match => match[1])).toEqual([trendCopy.takeaways.total, trendCopy.takeaways.lastCompleteWeek]);
    const buttons = [...dl.matchAll(/<button type="button" class="number-link" aria-label="([^"]*)">([^<]*)<\/button>/g)];
    expect(buttons.map(match => match[2])).toEqual([takeaway.total.display, takeaway.lastCompleteWeek.display]);
    expect(buttons.map(match => match[1])).toEqual([
      escapeAttr(fill(trendCopy.takeawayAria, { label: takeaway.total.label, value: takeaway.total.display })),
      escapeAttr(fill(trendCopy.takeawayAria, { label: takeaway.lastCompleteWeek.label, value: takeaway.lastCompleteWeek.display })),
    ]);
    expect(dl).toContain(`<small>${takeaway.lastCompleteWeek.range}</small>`);
    expect(takeaway.lastWeekIncomplete).toBe(false);
    expect(trend).not.toContain(`<p class="note">${trendCopy.incompleteNote}</p>`);
  });

  it("圖：固定 180px、aria-hidden；資料表保留（摘要同 v2、每週一列、L2 number-link、技術註記）", () => {
    const trend = byTestId(overview(demo), "trend");
    expect(frameTag(trend)).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" aria-hidden="true" data-state="ready">`);
    const details = element(trend, 'class="data-alternative"')!;
    expect(details).toContain(`<summary>${fill(ui.dataTable, { title: labels.sections.trend })}</summary>`);
    expect(details.match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr>/g)).toHaveLength(demo.weeks.length);
    const first = demo.weeks[0];
    expect(details).toContain(`<td>${labels.periods[first.period]}</td><td>${first.start} — ${first.end}</td><td><button class="number-link">${formatAmountL2(first.metrics.net_revenue.value)}</button></td>`);
    expect(details).toContain(`<p class="note">${ui.trendTechnical}</p>`);
  });

  it("golden：本期沒有完整週 → 最近完整週顯示不適用（不是 number-link）；最後一週未滿 7 天加註", () => {
    const trend = byTestId(overview(golden), "trend");
    const takeaway = trendTakeaways(golden);
    expect(takeaway.lastCompleteWeek.week).toBeNull();
    const dl = element(trend, 'class="takeaways"')!;
    expect(dl).toContain(`<dd><span class="takeaway-empty">${takeaway.lastCompleteWeek.display}</span></dd>`);
    expect(dl.match(/class="number-link"/g)).toHaveLength(1);
    expect(trend).toContain(`<p class="note">${trendCopy.incompleteNote}</p>`);
  });

  it("檔期：有檔期時保留 trend-events 的檔期句（events.trendList），沒有時不出現；沒有週資料時圖框改空狀態、仍為 180px", () => {
    const withEvents = byTestId(overview(demo, events(demo)), "trend");
    const event = events(demo).rows[0];
    expect(byTestId(withEvents, "trend-events")).toBe(`<p class="note" data-testid="trend-events">${fill(labels.events.trendList, { list: fill(labels.events.trendItem, { label: event.label, start: event.start, end: event.end }) })}</p>`);
    expect(byTestId(overview(demo), "trend")).not.toContain("trend-events");
    const empty = structuredClone(demo);
    empty.weeks = [];
    const html = renderToStaticMarkup(createElement(TrendSection, { snapshot: empty, onEvidence: noop }));
    expect(frameTag(html)).toBe('<div class="chart-frame sm" style="height:180px" data-state="empty">');
    expect(html).toContain(`<p class="chart-frame-message">${frameCopy.noData}</p>`);
  });

  it("折線資料：上期與本期各自只在自己的週有值（座標＝精確字串的 Number），最後一點是各期最後一個有值的週", () => {
    const rows = trendRows(demo.weeks);
    expect(rows).toHaveLength(demo.weeks.length);
    for (const row of rows) {
      const own = row.period === "current" ? ["revenueCurrent", "contributionCurrent"] as const : ["revenuePrevious", "contributionPrevious"] as const;
      const other = row.period === "current" ? ["revenuePrevious", "contributionPrevious"] as const : ["revenueCurrent", "contributionCurrent"] as const;
      expect(row[own[0]]).toBe(Number(row.metrics.net_revenue.value));
      expect(row[own[1]]).toBe(Number(row.metrics.contribution_after_marketing.value));
      for (const key of other) expect(row[key]).toBeNull();
    }
    const lastCurrent = demo.weeks.map(week => week.period).lastIndexOf("current");
    const lastPrevious = demo.weeks.map(week => week.period).lastIndexOf("previous");
    expect(lastPoints(rows)).toEqual({ revenuePrevious: lastPrevious, contributionPrevious: lastPrevious, revenueCurrent: lastCurrent, contributionCurrent: lastCurrent });
    // 缺資料的週不畫成 0：座標為 null（connectNulls=false 斷線），最後一點往前找有值的週。
    const gap = structuredClone(demo.weeks);
    gap[lastCurrent].metrics.net_revenue = { value: null, reason_codes: ["MISSING_VALUE"] };
    const gapRows = trendRows(gap);
    expect(gapRows[lastCurrent].revenueCurrent).toBeNull();
    expect(lastPoints(gapRows).revenueCurrent).toBe(lastCurrent - 1);
    expect(lastPoints(gapRows).contributionCurrent).toBe(lastCurrent);
  });
});

describe("區塊 8 各通路扣廣告後貢獻（ChartFrame id=channel）", () => {
  it("demo：標題是結論句、副標是標準名稱與本期；圖例本期／上期；圖 180px aria-hidden", () => {
    const html = overview(demo);
    const section = byTestId(html, "channel-mix");
    const conclusion = channelConclusion(demo);
    expect(openTag(html, 'data-testid="channel-mix"')).toBe('<section class="panel chart-section" aria-labelledby="channel-title" aria-describedby="channel-sub" data-testid="channel-mix">');
    expect(section).toContain(`<h2 id="channel-title">${escapeAttr(conclusion.title)}</h2><p class="sub" id="channel-sub">${escapeAttr(conclusion.subtitle)}</p>`);
    expect(section).toContain(legendHtml);
    expect(frameTag(section)).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" aria-hidden="true" data-state="ready">`);
  });

  it("緊湊表：每個通路一列（順序同 report.scope.channels）、本期金額 L2 與貢獻率是 number-link；MARKETPLACE 轉負用不利色狀態標籤", () => {
    const section = byTestId(overview(demo), "channel-mix");
    const kv = element(section, 'class="kv channel-kv"')!;
    const conclusion = channelConclusion(demo);
    expect(kv).toContain(`<thead><tr><th scope="col">${channelCopy.table.channel}</th><th scope="col" class="num">${channelCopy.table.current}</th><th scope="col" class="num">${channelCopy.table.margin}</th></tr></thead>`);
    const rows = kv.match(/<tr>[\s\S]*?<\/tr>/g)!.slice(1);
    expect(rows).toHaveLength(demo.report.scope.channels.length);
    expect(rows).toHaveLength(conclusion.rows.length);
    for (const [index, row] of conclusion.rows.entries()) {
      const tr = rows[index];
      const amount = formatMetric("contribution_after_marketing", row.current, "L2"), rate = formatMetric("contribution_margin", row.margin, "L2");
      expect(tr, row.channel).toMatch(new RegExp(`^<tr><th scope="row">${row.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
      expect(tr, row.channel).toContain(`aria-label="${escapeAttr(fill(channelCopy.amountAria, { channel: row.label, metric: metricDefinitions.contribution_after_marketing.label, value: amount }))}">${amount}</button>`);
      expect(tr, row.channel).toContain(`aria-label="${escapeAttr(fill(channelCopy.marginAria, { channel: row.label, metric: metricDefinitions.contribution_margin.label, value: rate }))}">${rate}</button>`);
    }
    const marketplace = rows[conclusion.rows.findIndex(row => row.channel === "MARKETPLACE")];
    expect(marketplace).toContain(`<span class="ui-lozenge" data-tone="unfavorable">${channelCopy.turnedNegative}</span>`);
    expect(marketplace).toContain('<td class="num negative">');
    const dtc = rows[conclusion.rows.findIndex(row => row.channel === "DTC")];
    expect(dtc).not.toContain("ui-lozenge");
    expect(dtc).not.toContain("negative");
    // v2 的通路摘要卡與單位說明已移除（單位只寫在表頭一次）。
    expect(section).not.toContain("channel-summaries");
    expect(section).not.toContain(ui.kpiHint);
  });

  it("轉正：上期 ≤ 0、本期 > 0 時標「轉正」（中性狀態標籤，有利不上色）", () => {
    const snap = structuredClone(golden);
    snap.report.previous.channels.MARKETPLACE.metrics.contribution_after_marketing = { value: "-20.00", reason_codes: [] };
    snap.report.current.channels.MARKETPLACE.metrics.contribution_after_marketing = { value: "300.00", reason_codes: [] };
    const html = renderToStaticMarkup(createElement(ChannelSection, { snapshot: snap, onEvidence: noop }));
    expect(html).toContain(`<span class="ui-lozenge">${channelCopy.turnedPositive}</span>`);
    expect(html).not.toContain(channelCopy.turnedNegative);
    expect(html).toContain(`<h2 id="channel-title">${escapeAttr(channelConclusion(snap).title)}</h2>`);
  });

  it("資料表保留 v2 的 5 欄（摘要同 v2），每通路一列、金額 L2 number-link", () => {
    const section = byTestId(overview(demo), "channel-mix");
    const details = element(section, 'class="data-alternative"')!;
    expect(details).toContain(`<summary>${fill(ui.dataTable, { title: labels.sections.channelMix })}</summary>`);
    expect(details.match(/<thead>[\s\S]*<\/thead>/)![0].match(/<th>/g)).toHaveLength(5);
    const alias = demoAlias(demo.report.dataset_id);
    for (const [channel, row] of Object.entries(demo.report.current.channels)) {
      expect(details, channel).toContain(`<tr><th>${channelLabel(channel, alias)}</th><td><button class="number-link">${formatAmountL2(row.metrics.net_revenue.value)}</button></td><td><button class="number-link">${formatAmountL2(demo.report.previous.channels[channel].metrics.contribution_after_marketing.value)}</button></td>`);
    }
    expect(details.match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr>/g)).toHaveLength(Object.keys(demo.report.current.channels).length);
  });

  it("channelEvidence：長條（本期、上期）與表格共用的抽屜內容＝v2 通路摘要的 number()（指標名、單一通路、該期期間與來源列）", () => {
    for (const channel of demo.report.scope.channels) for (const period of ["previous", "current"] as const) {
      const summary = demo.report[period];
      const expected: EvidenceSelection = { name: "contribution_after_marketing", metric: summary.channels[channel].metrics.contribution_after_marketing, period: summary.period, sources: summary.channels[channel].sources, channels: [channel], title: metricDefinitions.contribution_after_marketing.label };
      expect(channelEvidence(demo, channel, period)).toEqual(expected);
    }
    expect(channelEvidence(demo, "DTC", "current", "contribution_margin")).toMatchObject({ name: "contribution_margin", metric: demo.report.current.channels.DTC.metrics.contribution_margin, title: metricDefinitions.contribution_margin.label });
    expect(channelEvidence(demo, "UNKNOWN", "current")).toMatchObject({ metric: { value: null }, sources: [], channels: ["UNKNOWN"] });
  });
});

describe("axisTicks：長條圖數值軸（只是圖形座標）", () => {
  it("範圍含 0、不向外延伸；刻度是 1／2／2.5／5 × 10ⁿ 的倍數且含 0", () => {
    // demo 的各通路扣廣告後貢獻（座標）：−6.1 萬到 133.1 萬 → 步長 50 萬。
    expect(axisTicks([1147526.13, 1330962.66, 721100.55, -61169.93])).toEqual({ domain: [-61169.93, 1330962.66], ticks: [0, 500000, 1000000] });
    expect(axisTicks([120, 80])).toEqual({ domain: [0, 120], ticks: [0, 50, 100] });
    expect(axisTicks([-300, -20])).toEqual({ domain: [-300, 0], ticks: [-300, -200, -100, 0] });
    expect(axisTicks([null, 0])).toEqual({ domain: [0, 1], ticks: [0] });
    expect(axisTicks([])).toEqual({ domain: [0, 1], ticks: [0] });
  });
});

describe("總覽順序與 .pair", () => {
  it("一句話 → KPI 帶 → 三件事 → .pair（趨勢、各通路）→ 其他常用指標 → 進階；趨勢與各通路都在同一個 .pair 內，各一個", () => {
    const html = overview(demo);
    const markers = ['data-testid="weekly-snapshot"', 'data-testid="kpi-band"', 'data-testid="top-three"', '<div class="pair">', 'data-testid="trend"', 'data-testid="channel-mix"', 'data-testid="assist-kpis"', 'data-testid="overview-advanced"'];
    const positions = markers.map(marker => html.indexOf(marker));
    for (const [index, position] of positions.entries()) expect(position, markers[index]).toBeGreaterThan(-1);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    const pair = element(html, 'class="pair"')!;
    expect(pair).toContain('data-testid="trend"');
    expect(pair).toContain('data-testid="channel-mix"');
    for (const marker of ['id="trend-title"', 'id="channel-title"', 'id="trend-sub"', 'id="channel-sub"']) expect(html.split(marker), marker).toHaveLength(2);
    // 負號一律 U+2212（ISO 日期的連字號除外）。
    expect(textOf(pair)).not.toMatch(/(?<!\d)-\d/);
    expect(textOf(pair)).toContain("\u2212");
  });
});

describe("元件規則：無 hex、無中文、字級不寫數字、顏色來自 chartColors", () => {
  it.each(["chart-frame.tsx", "trend-section.tsx", "channel-section.tsx"])("%s", file => {
    const path = resolve("src/components/overview/charts", file);
    const text = readFileSync(path, "utf8");
    const scan = scanTsxText(text, file);
    expect(scan.hex).toEqual([]);
    expect(scan.jsxCjk).toEqual([]);
    expect(scan.cjkLiterals).toEqual([]);
    expect(scan.fontSize).toEqual([]);
    expect(text).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(text).not.toMatch(/fontSize=\{?\d|fontSize: \d/);
    if (file !== "chart-frame.tsx") {
      expect(text).toContain("chartColors.current");
      expect(text).toContain("chartColors.previous");
      expect(text).toContain("fontSize: chartFontSize");
      expect(text).not.toMatch(/"var\(--/);
    }
  });
});
