import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Decimal from "decimal.js";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { trendTakeaways } from "../src/application/chart-takeaways";
import { chartColors } from "../src/application/chart-theme";
import { periodPresets } from "../src/application/period-presets";
import { formatAmountL1, formatAmountL2, formatAxisWan, formatPeriodL1, MINUS, metricDefinitions } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import type { EvidenceSelection } from "../src/components/evidence-drawer";
import { Overview } from "../src/components/overview";
import { lastPoints, trendAxis, TrendSection, trendRows, weekEvidence, YOY_LINE, YOY_SERIES } from "../src/components/overview/charts/trend-section";
import { aggregatePeriod } from "../src/domain/aggregation";
import type { Dataset } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, escapeAttr } from "./helpers/markup";
import { YOY_EXPECTED_PERIOD, yoyDailySales, yoyInput } from "./helpers/yoy-dataset";

// V3-9b 代理 A：F8 趨勢圖三線比較（去年同期第三線，PRD §10.1 F8、§7.1 區塊 7、§9.5）。
// application：snapshot.yoy 用 periodPresets 的「去年同期」期間，整段與每週各多呼叫一次 domain 既有的 aggregatePeriod（不改函式、不自己寫公式）；
// demo／golden 的涵蓋不到去年 → unavailable，原因就是期間快捷的文案；兩年合成資料（tests/helpers/yoy-dataset.ts）→ ready，週數、對齊與加總用獨立手算驗證。
// 呈現：圖例第三項（虛線段、不可用時標「無資料」）、圖下方原因一行（trend-yoy-note）、資料表兩個去年同期欄、提示列「去年同期淨營收合計」。
// Recharts 在伺服器端不繪製圖形，第三線的樣式直接斷言 YOY_LINE（stroke＝chartColors.yoy、虛線、connectNulls=false）；實際 DOM 由 E2E 檢查。

const noop = () => undefined;
const copy = labels.overview.trendYoyV3, frame = labels.overview.chartFrame, ui = labels.overview.page;
const DAY_MS = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);

async function load(input = fixture("golden")): Promise<{ dataset: Dataset; snapshot: WorkspaceSnapshot; input: typeof input }> {
  const dataset = validateDataset(input).dataset!;
  return { dataset, input, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}
let golden: Awaited<ReturnType<typeof load>>;
let demo: Awaited<ReturnType<typeof load>>;
let twoYear: Awaited<ReturnType<typeof load>>;
beforeAll(async () => { golden = await load(fixture("golden")); demo = await load(fixture("demo")); twoYear = await load(yoyInput()); });

const overview = (snapshot: WorkspaceSnapshot) => renderToStaticMarkup(createElement(Overview, { snapshot, onEvidence: noop, datasetName: "demo", missingItems: 0, actionsSummary: { pending: 0, pinned: [] } }));
const ready = (snapshot: WorkspaceSnapshot) => { const yoy = snapshot.yoy!; if (yoy.status !== "ready") throw new Error("yoy 不可用"); return yoy; };

/** 獨立手算：直接讀 CSV 文字，把日期落在 [start, end] 的銷售列「原價收入 − 折扣 − 退款」相加（分為單位的整數）。 */
function handNetRevenue(input: ReturnType<typeof yoyInput>, start: string, end: string): string {
  const [, ...lines] = (input.files["sales_daily.csv"] as string).split("\n");
  let cents = 0;
  for (const line of lines) {
    const [date, , , , , gross, discount, refund] = line.split(",");
    if (date < start || date > end) continue;
    cents += Math.round(Number(gross) * 100) - Math.round(Number(discount) * 100) - Math.round(Number(refund) * 100);
  }
  return (cents / 100).toFixed(2);
}

describe("snapshot.yoy：去年同期彙總（application）", () => {
  it("demo、golden 的資料都從今年開始，去年同期不可用；原因就是期間快捷的文案（presetTooShort＋涵蓋起日＋「去年同期」）", () => {
    for (const { dataset, snapshot } of [demo, golden]) {
      expect(snapshot.yoy).toEqual({ status: "unavailable", reason: fill(labels.shell.periods.presetTooShort, { date: dataset.manifest.coverage_start, preset: labels.shell.periods.presets.yoy }) });
      const preset = periodPresets(dataset.manifest, { previous: snapshot.report.scope.previous_period, current: snapshot.report.scope.current_period, comparison_mode: snapshot.report.scope.comparison_mode }).find(item => item.id === "yoy")!;
      expect(preset.status === "unavailable" && preset.reason).toBe((snapshot.yoy as { reason: string }).reason);
    }
    expect((demo.snapshot.yoy as { reason: string }).reason).toBe(fill(labels.shell.periods.presetTooShort, { date: "2026-06-01", preset: labels.shell.periods.presets.yoy }));
  });

  it("既有 weeks 只放上期與本期、數量與起訖不變（demo 12 週）；yoy 不進 filter_hash", async () => {
    expect(demo.snapshot.weeks).toHaveLength(12);
    expect(demo.snapshot.weeks.every(week => week.period === "previous" || week.period === "current")).toBe(true);
    expect(twoYear.snapshot.weeks.every(week => week.period === "previous" || week.period === "current")).toBe(true);
    const { yoy: _yoy, ...rest } = twoYear.snapshot;
    void _yoy;
    const again = await createSnapshot(twoYear.dataset, {}, twoYear.snapshot.dataset_hash);
    expect(again.filter_hash).toBe(rest.filter_hash);
    expect(again.weeks).toEqual(rest.weeks);
  });

  it("兩年合成資料：去年同期可用，期間＝periodPresets 的「去年同期」（本期 2026-07-13–08-23 各減一年）", () => {
    const yoy = ready(twoYear.snapshot);
    const { scope } = twoYear.snapshot.report;
    const preset = periodPresets(twoYear.dataset.manifest, { previous: scope.previous_period, current: scope.current_period, comparison_mode: scope.comparison_mode }).find(item => item.id === "yoy")!;
    expect(preset.status).toBe("ready");
    expect(preset.status === "ready" && preset.previous).toEqual(YOY_EXPECTED_PERIOD);
    expect(yoy.period).toEqual(YOY_EXPECTED_PERIOD);
  });

  it("每週切法與 weeks 相同：從去年同期起日每 7 天一段（42 天 → 6 週）、週名「去年同期第 n 週」、period＝yoy；每週＝aggregatePeriod(該週)", () => {
    const yoy = ready(twoYear.snapshot);
    expect(yoy.weeks).toHaveLength(6);
    expect(yoy.weeks).toHaveLength(twoYear.snapshot.weeks.filter(week => week.period === "current").length);
    for (const [index, week] of yoy.weeks.entries()) {
      expect(week.period).toBe("yoy");
      expect(week.label).toBe(fill(copy.weekLabel, { n: index + 1 }));
      expect(week.start).toBe(shift(YOY_EXPECTED_PERIOD.start, index * 7));
      expect(week.end).toBe(shift(YOY_EXPECTED_PERIOD.start, index * 7 + 6));
      const summary = aggregatePeriod(twoYear.dataset, { start: week.start, end: week.end }, twoYear.snapshot.report.scope.channels);
      expect(week.metrics).toEqual(summary.metrics);
      expect(week.sources).toEqual(summary.sources);
    }
  });

  it("手算：去年同期第 1 週（2025-07-13–07-19）淨營收＝該週各列相加 1,155.00；扣廣告後貢獻 518.00；整段＝aggregatePeriod(去年同期)，各週加總＝整段", () => {
    const yoy = ready(twoYear.snapshot);
    const first = yoy.weeks[0];
    expect([first.start, first.end]).toEqual(["2025-07-13", "2025-07-19"]);
    // DTC：原價收入 112–118（合計 805）− 折扣 10×7 ＝ 735；MARKETPLACE：62–68（455）− 5×7 ＝ 420；合計 1,155.00。
    expect(yoyDailySales("2025-07-13", "DTC").gross).toBe(112);
    expect(first.metrics.net_revenue.value).toBe("1155.00");
    expect(handNetRevenue(yoyInput(), first.start, first.end)).toBe("1155.00");
    // 商品成本 (40＋20)×7＝420 → 商品毛利 735；四項費用 (8＋9)×7＝119 → 扣廣告前貢獻 616；廣告 (8＋6)×7＝98 → 扣廣告後貢獻 518.00。
    expect(first.metrics.gross_profit.value).toBe("735.00");
    expect(first.metrics.contribution_before_marketing.value).toBe("616.00");
    expect(first.metrics.contribution_after_marketing.value).toBe("518.00");
    for (const week of yoy.weeks) expect(week.metrics.net_revenue.value).toBe(handNetRevenue(yoyInput(), week.start, week.end));
    const whole = aggregatePeriod(twoYear.dataset, YOY_EXPECTED_PERIOD, twoYear.snapshot.report.scope.channels);
    expect(yoy.metrics).toEqual(whole.metrics);
    expect(yoy.sources).toEqual(whole.sources);
    expect(yoy.metrics.net_revenue.value).toBe(handNetRevenue(yoyInput(), YOY_EXPECTED_PERIOD.start, YOY_EXPECTED_PERIOD.end));
    for (const name of ["net_revenue", "gross_profit", "contribution_after_marketing"] as const) {
      const sum = yoy.weeks.reduce((total, week) => total.plus(week.metrics[name].value!), new Decimal(0));
      expect(sum.toFixed(2), name).toBe(yoy.metrics[name].value);
    }
  });

  it("去年同期缺通路費用與廣告的日子：該週扣廣告後貢獻是 null（不是 0），淨營收照算", async () => {
    const input = yoyInput({ missingCostDates: ["2025-07-21"] });
    const { snapshot } = await load(input);
    const yoy = ready(snapshot);
    expect(yoy.weeks[1].metrics.contribution_after_marketing.value).toBeNull();
    expect(yoy.weeks[1].metrics.net_revenue.value).toBe(handNetRevenue(input, yoy.weeks[1].start, yoy.weeks[1].end));
    expect(yoy.metrics.contribution_after_marketing.value).toBeNull();
    // 本期與上期不受影響。
    expect(snapshot.weeks.every(week => week.metrics.contribution_after_marketing.value !== null)).toBe(true);
  });

  it("不可用的原因直接取自快捷：本期往前一年超出涵蓋 → presetTooShort（涵蓋起日）；本期超過一年 → yoyOverlap", async () => {
    // 兩年合成資料改看 2026-06-20–08-23（65 天）：去年同期從 2025-06-20 起，早於涵蓋起日 2025-07-01。
    const snapshot = await createSnapshot(twoYear.dataset, { previous_period: { start: "2026-04-16", end: "2026-06-19" }, current_period: { start: "2026-06-20", end: "2026-08-23" }, comparison_mode: "same_days" }, twoYear.snapshot.dataset_hash);
    expect(snapshot.yoy).toEqual({ status: "unavailable", reason: fill(labels.shell.periods.presetTooShort, { date: "2025-07-01", preset: labels.shell.periods.presets.yoy }) });
    const overlap = periodPresets(twoYear.dataset.manifest, { previous: { start: "2025-07-01", end: "2025-07-01" }, current: { start: "2025-07-02", end: "2026-08-23" }, comparison_mode: "same_days" }).find(item => item.id === "yoy")!;
    expect(overlap).toMatchObject({ status: "unavailable", reason: labels.shell.periods.yoyOverlap });
  });
});

describe("trendRows：去年同期第 i 週對齊本期第 i 週", () => {
  it("上期的週沒有去年同期值；本期第 i 週的 revenueYoy／contributionYoy＝去年同期第 i 週的座標；既有四條系列不變", () => {
    const yoy = ready(twoYear.snapshot);
    const rows = trendRows(twoYear.snapshot.weeks, yoy.weeks);
    const current = rows.filter(row => row.period === "current");
    for (const row of rows.filter(item => item.period === "previous")) {
      expect(row.yoy).toBeNull();
      expect(row.revenueYoy).toBeNull();
      expect(row.contributionYoy).toBeNull();
    }
    for (const [index, row] of current.entries()) {
      expect(row.yoy).toBe(yoy.weeks[index]);
      expect(row.revenueYoy).toBe(Number(yoy.weeks[index].metrics.net_revenue.value));
      expect(row.contributionYoy).toBe(Number(yoy.weeks[index].metrics.contribution_after_marketing.value));
      expect(row.revenueCurrent).toBe(Number(row.metrics.net_revenue.value));
    }
    // 沒有 yoy 時與 V3-4b 相同（既有四條系列與最後一點不受影響）。
    const plain = trendRows(twoYear.snapshot.weeks);
    expect(plain.every(row => row.yoy === null && row.revenueYoy === null)).toBe(true);
    expect(lastPoints(rows)).toEqual(lastPoints(plain));
    expect(Object.keys(lastPoints(rows)).sort()).toEqual(["contributionCurrent", "contributionPrevious", "revenueCurrent", "revenuePrevious"]);
  });

  it("去年週數較少：本期多出的週為 null（只畫對得到的週）；去年週數較多：多出的不畫", () => {
    const yoy = ready(twoYear.snapshot);
    const fewer = trendRows(twoYear.snapshot.weeks, yoy.weeks.slice(0, 4)).filter(row => row.period === "current");
    expect(fewer.map(row => row.revenueYoy === null)).toEqual([false, false, false, false, true, true]);
    const extra = { ...yoy.weeks[5], start: "2025-08-24", end: "2025-08-24", label: fill(copy.weekLabel, { n: 7 }) };
    const more = trendRows(twoYear.snapshot.weeks, [...yoy.weeks, extra]);
    expect(more.some(row => row.yoy === extra)).toBe(false);
    expect(more.filter(row => row.yoy !== null)).toHaveLength(6);
  });

  it("缺資料的去年同期週斷線（座標 null，不畫成 0）", () => {
    const yoy = structuredClone(ready(twoYear.snapshot));
    yoy.weeks[2].metrics.net_revenue = { value: null, reason_codes: ["MISSING_VALUE"] };
    const current = trendRows(twoYear.snapshot.weeks, yoy.weeks).filter(row => row.period === "current");
    expect(current[2].revenueYoy).toBeNull();
    expect(current[2].contributionYoy).toBe(Number(yoy.weeks[2].metrics.contribution_after_marketing.value));
    expect(current.filter(row => row.revenueYoy === 0)).toEqual([]);
  });

  it("第三線樣式：--chart-yoy、1.5px、虛線、缺資料斷線；兩條（淨營收、扣廣告後貢獻）", () => {
    expect(YOY_LINE).toEqual({ stroke: chartColors.yoy, strokeWidth: 1.5, strokeDasharray: "4 3", connectNulls: false, isAnimationActive: false });
    expect(chartColors.yoy).toBe("var(--chart-yoy)");
    expect(YOY_SERIES.map(series => series.metric)).toEqual(["net_revenue", "contribution_after_marketing"]);
    // 元件把同一組設定展開到去年同期的 <Line>，且只在可用時渲染（不可用時沒有空的第三線）。
    const source = readFileSync(resolve("src/components/overview/charts/trend-section.tsx"), "utf8");
    expect(source).toMatch(/yoy\?\.status === "ready" && YOY_SERIES\.map\(series => <Line key=\{series\.key\} dataKey=\{series\.key\} \{\.\.\.YOY_LINE\}/);
  });
});

describe("趨勢圖第三線的呈現（SSR）", () => {
  /** 圖例每一項：一般項是 <i> 線段（background），虛線項是 12×2 的 SVG 線段（stroke、stroke-dasharray 與折線相同）。 */
  const legendItems = (html: string) => [...element(byTestId(html, "trend"), 'class="legend"')!.matchAll(/<span(?: data-testid="([^"]+)")?>(?:<i aria-hidden="true" style="([^"]+)"><\/i>|<svg class="legend-dash" width="12" height="2" viewBox="0 0 12 2" aria-hidden="true" focusable="false"><line x1="0" y1="1" x2="12" y2="1" stroke="([^"]+)" stroke-width="2" stroke-dasharray="([^"]+)"><\/line><\/svg>)([^<]*)(?:<small>([^<]*)<\/small>)?<\/span>/g)].map(match => ({ testId: match[1] ?? null, line: match[2] ?? `stroke:${match[3]};dash:${match[4]}`, label: match[5], note: match[6] ?? null }));

  it("可用：圖例三項，第三項是虛線段（12×2 SVG，stroke＝chartColors.yoy、dasharray 與第三線相同）、沒有「無資料」；沒有原因句", () => {
    const html = overview(twoYear.snapshot);
    expect(legendItems(html)).toEqual([
      { testId: null, line: `background:${chartColors.current}`, label: labels.shell.periods.current, note: null },
      { testId: null, line: `background:${chartColors.previous}`, label: labels.shell.periods.previous, note: null },
      { testId: "trend-legend-yoy", line: `stroke:${chartColors.yoy};dash:${YOY_LINE.strokeDasharray}`, label: copy.legend, note: null },
    ]);
    expect(copy.legend).toBe(labels.shell.periods.presets.yoy);
    expect(html).not.toContain('data-testid="trend-yoy-note"');
  });

  it("不可用（demo）：圖例項仍在並標「無資料」；圖下方一行原因（trend-yoy-note，一份）", () => {
    const html = overview(demo.snapshot);
    const items = legendItems(html);
    expect(items).toHaveLength(3);
    expect(items[2]).toEqual({ testId: "trend-legend-yoy", line: `stroke:${chartColors.yoy};dash:${YOY_LINE.strokeDasharray}`, label: copy.legend, note: frame.noData });
    const reason = (demo.snapshot.yoy as { reason: string }).reason;
    expect(byTestId(html, "trend-yoy-note")).toBe(`<p class="note trend-yoy-note" data-testid="trend-yoy-note">${escapeAttr(fill(copy.unavailable, { reason }))}</p>`);
    expect(html.split('data-testid="trend-yoy-note"')).toHaveLength(2);
    // 原因句在圖框之後、資料表之前。
    const trend = byTestId(html, "trend");
    expect(trend.indexOf('data-testid="trend-yoy-note"')).toBeGreaterThan(trend.indexOf('class="chart-frame '));
    expect(trend.indexOf('data-testid="trend-yoy-note"')).toBeLessThan(trend.indexOf('class="data-alternative"'));
  });

  it("快照沒有 yoy（舊程式組出的快照）：圖例標「無資料」，沒有原因句、沒有第三格提示", () => {
    const snap = structuredClone(demo.snapshot);
    delete snap.yoy;
    const html = renderToStaticMarkup(createElement(TrendSection, { snapshot: snap, onEvidence: noop }));
    expect(html).toContain(`${copy.legend}<small>${frame.noData}</small>`);
    expect(html).not.toContain("trend-yoy-note");
    expect(trendTakeaways(snap).yoy).toBeNull();
  });

  it("提示列：可用時第三格「去年同期淨營收合計」＝整段淨營收（L1，number-link），附去年同期期間；不可用時只有兩格", () => {
    const yoy = ready(twoYear.snapshot);
    const takeaway = trendTakeaways(twoYear.snapshot);
    expect(takeaway.yoy).toEqual({ label: copy.takeawayTotal, metric: yoy.metrics.net_revenue, display: formatAmountL1(yoy.metrics.net_revenue.value), range: formatPeriodL1(yoy.period.start, yoy.period.end, { anchor: twoYear.snapshot.data_as_of, days: false }), period: yoy.period, sources: yoy.sources });
    const dl = element(byTestId(overview(twoYear.snapshot), "trend"), 'class="takeaways"')!;
    expect([...dl.matchAll(/<dt>([^<]*)<\/dt>/g)].map(match => match[1])).toEqual([labels.overview.trendV3.takeaways.total, labels.overview.trendV3.takeaways.lastCompleteWeek, copy.takeawayTotal]);
    expect(dl).toContain(`<button type="button" class="number-link" aria-label="${escapeAttr(fill(labels.overview.trendV3.takeawayAria, { label: copy.takeawayTotal, value: takeaway.yoy!.display }))}">${takeaway.yoy!.display}</button><small>${takeaway.yoy!.range}</small>`);
    expect(takeaway.yoy!.range).toBe("2025/7/13–2025/8/23");
    const demoDl = element(byTestId(overview(demo.snapshot), "trend"), 'class="takeaways"')!;
    expect(demoDl.match(/<dt>/g)).toHaveLength(2);
    expect(trendTakeaways(demo.snapshot).yoy).toBeNull();
  });

  it("資料表：多兩欄「去年同期淨營收」「去年同期扣廣告後貢獻」；本期第 i 週是去年同期第 i 週的 L2 number-link，上期與對不到的週寫「無資料」", () => {
    const yoy = ready(twoYear.snapshot);
    const details = element(byTestId(overview(twoYear.snapshot), "trend"), 'class="data-alternative"')!;
    const headers = [...details.match(/<thead>[\s\S]*<\/thead>/)![0].matchAll(/<th>([^<]*)<\/th>/g)].map(match => match[1]);
    expect(headers).toEqual([ui.colPeriod, ui.colRange, metricDefinitions.net_revenue.label, metricDefinitions.gross_profit.label, metricDefinitions.contribution_after_marketing.label, fill(copy.tableColumn, { metric: metricDefinitions.net_revenue.label }), fill(copy.tableColumn, { metric: metricDefinitions.contribution_after_marketing.label })]);
    const rows = details.match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr>[\s\S]*?<\/tr>/g)!;
    expect(rows).toHaveLength(twoYear.snapshot.weeks.length);
    const empty = `<td><span class="trend-yoy-empty">${frame.noData}</span></td>`;
    let currentIndex = 0;
    for (const [index, week] of twoYear.snapshot.weeks.entries()) {
      const cells = rows[index].match(/<td>[\s\S]*?<\/td>/g)!;
      expect(cells).toHaveLength(7);
      if (week.period === "previous") { expect(cells.slice(5)).toEqual([empty, empty]); continue; }
      const aligned = yoy.weeks[currentIndex++];
      expect(cells.slice(5)).toEqual([`<td><button class="number-link">${formatAmountL2(aligned.metrics.net_revenue.value)}</button></td>`, `<td><button class="number-link">${formatAmountL2(aligned.metrics.contribution_after_marketing.value)}</button></td>`]);
    }
    // 不可用（demo）：兩欄全部是「無資料」，既有五欄不變。
    const demoDetails = element(byTestId(overview(demo.snapshot), "trend"), 'class="data-alternative"')!;
    expect(demoDetails.split(empty)).toHaveLength(demo.snapshot.weeks.length * 2 + 1);
    const first = demo.snapshot.weeks[0];
    expect(demoDetails).toContain(`<td>${labels.shell.periods[first.period]}</td><td>${first.start} — ${first.end}</td><td><button class="number-link">${formatAmountL2(first.metrics.net_revenue.value)}</button></td>`);
  });

  it("既有系列與 testid 不變：trend、trend-events（有檔期時）各一份；本期／上期的資料表 number-link 數不變", () => {
    const html = overview(twoYear.snapshot);
    expect(html.split('data-testid="trend"')).toHaveLength(2);
    expect(html.split('data-testid="trend-legend-yoy"')).toHaveLength(2);
    const details = element(byTestId(html, "trend"), 'class="data-alternative"')!;
    // 每週 3 個既有金額＋本期週 2 個去年同期金額。
    const currentWeeks = twoYear.snapshot.weeks.filter(week => week.period === "current").length;
    expect(details.match(/class="number-link"/g)).toHaveLength(twoYear.snapshot.weeks.length * 3 + currentWeeks * 2);
  });
});

describe("F10 週的抽屜（圖上的點與資料表共用）", () => {
  it("weekEvidence：指標名為標題、期間與來源是該週、通路是目前範圍，filter 篩到該週（週名、起訖）", () => {
    const week = twoYear.snapshot.weeks.find(row => row.period === "current")!;
    const channels = twoYear.snapshot.report.scope.channels;
    const expected: EvidenceSelection = { name: "net_revenue", metric: week.metrics.net_revenue, period: { start: week.start, end: week.end }, sources: week.sources, channels, title: metricDefinitions.net_revenue.label, filter: { week: { start: week.start, end: week.end, label: week.label } } };
    expect(weekEvidence(week, "net_revenue", channels)).toEqual(expected);
    const yoyWeek = ready(twoYear.snapshot).weeks[0];
    expect(weekEvidence(yoyWeek, "contribution_after_marketing", channels)).toMatchObject({ metric: yoyWeek.metrics.contribution_after_marketing, period: { start: "2025-07-13", end: "2025-07-19" }, filter: { week: { label: fill(copy.weekLabel, { n: 1 }) } } });
  });
});

// V4-2 代理 B（G3；PRD §4.1、§4.4 G3、§6.4、§7.2；CHART_CATALOG G3）：Y 軸刻度改由 trendAxis 算（含 0、整齊步長、上下界取步長的整數倍），
// 文字是 formatAxisWan（整數萬，不再出現「50.0 萬」）。Recharts 在伺服器端不繪製軸，這裡斷言 trendAxis 與原始碼接線；實際刻度文字由 E2E 檢查。
// 上面「趨勢圖第三線的呈現」的三項圖例斷言不變（去年同期線在任何寬度都畫）。
describe("V4-2 G3 Y 軸刻度：trendAxis＋formatAxisWan", () => {
  /** 圖上所有線的座標（本期、上期與去年同期的淨營收、扣廣告後貢獻）。 */
  const values = (snapshot: WorkspaceSnapshot) => {
    const yoy = snapshot.yoy?.status === "ready" ? snapshot.yoy.weeks : [];
    return trendRows(snapshot.weeks, yoy).flatMap(row => [row.revenuePrevious, row.contributionPrevious, row.revenueCurrent, row.contributionCurrent, ...YOY_SERIES.map(series => row[series.key])]);
  };
  const finite = (list: readonly (number | null)[]) => list.filter((value): value is number => value !== null);

  it("demo：刻度含 0、範圍涵蓋每一條線；文字＝formatAxisWan(ticks, step)，步長是整萬，沒有「.0 萬」也沒有小數", () => {
    const list = values(demo.snapshot);
    const axis = trendAxis(list);
    expect(axis.labels).toEqual(formatAxisWan(axis.ticks, axis.step));
    expect(axis.ticks).toContain(0);
    expect(axis.labels[axis.ticks.indexOf(0)]).toBe("0");
    expect(axis.domain).toEqual([axis.ticks[0], axis.ticks.at(-1)]);
    expect(axis.domain[0]).toBeLessThanOrEqual(Math.min(0, ...finite(list)));
    expect(axis.domain[1]).toBeGreaterThanOrEqual(Math.max(...finite(list)));
    expect(axis.step % 10_000).toBe(0);
    for (const [index, tick] of axis.ticks.entries()) expect(tick, String(index)).toBe(axis.ticks[0] + index * axis.step);
    for (const text of axis.labels) { expect(text).not.toMatch(/\.0\s*萬/); expect(text).not.toContain("."); }
    // 刻度約 4 條（與 V3 的 tickCount 相同），最高刻度不超過資料最大值一個步長。
    expect(axis.ticks.length).toBeGreaterThanOrEqual(3);
    expect(axis.ticks.length).toBeLessThanOrEqual(6);
    expect(axis.domain[1] - Math.max(...finite(list))).toBeLessThan(axis.step);
  });

  it("兩年合成資料（去年同期可用）：範圍也涵蓋去年同期兩條線；golden 不到 1 萬時 formatAxisWan 寫元（不出現「萬」）", () => {
    const list = values(twoYear.snapshot);
    const yoyOnly = finite(trendRows(twoYear.snapshot.weeks, ready(twoYear.snapshot).weeks).flatMap(row => YOY_SERIES.map(series => row[series.key])));
    expect(yoyOnly.length).toBeGreaterThan(0);
    const axis = trendAxis(list);
    expect(axis.domain[1]).toBeGreaterThanOrEqual(Math.max(...yoyOnly));
    expect(axis.domain[0]).toBeLessThanOrEqual(Math.min(0, ...yoyOnly));
    expect(axis.labels).toEqual(formatAxisWan(axis.ticks, axis.step));
    const goldenAxis = trendAxis(values(golden.snapshot));
    expect(goldenAxis.labels).toEqual(formatAxisWan(goldenAxis.ticks, goldenAxis.step));
    expect(Math.max(...goldenAxis.ticks.map(Math.abs))).toBeLessThan(10_000);
    for (const [index, tick] of goldenAxis.ticks.entries()) if (tick !== 0) expect(goldenAxis.labels[index]).toBe(formatAmountL1(tick.toFixed(2)));
  });

  it("負值：下界延伸到步長的整數倍、負刻度帶 U+2212；沒有任何有值的點時只有刻度 0", () => {
    const axis = trendAxis([-61169.93, 1330962.66, null]);
    expect(axis.domain[0]).toBeLessThanOrEqual(-61169.93);
    expect(Number.isInteger(axis.domain[0] / axis.step)).toBe(true);
    expect(axis.ticks).toContain(0);
    expect(axis.labels[0].startsWith(MINUS)).toBe(true);
    expect(axis.labels).toEqual(formatAxisWan(axis.ticks, axis.step));
    expect(trendAxis([null, null])).toEqual({ domain: [0, 1], ticks: [0], step: 1, labels: ["0"] });
    expect(trendAxis([])).toEqual({ domain: [0, 1], ticks: [0], step: 1, labels: ["0"] });
  });

  it("原始碼接線：YAxis 用 trendAxis 的 domain 與 ticks、刻度文字查 formatAxisWan 的結果；不再交給 Recharts 的 tickCount／niceTicks，也不再用 L1 的 axis 函式", () => {
    const source = readFileSync(resolve("src/components/overview/charts/trend-section.tsx"), "utf8");
    expect(source).toContain("<YAxis domain={yAxis.domain} ticks={yAxis.ticks}");
    expect(source).toContain("labels: formatAxisWan(ticks, step)");
    const yAxisTag = source.slice(source.indexOf("<YAxis "), source.indexOf("/>", source.indexOf("<YAxis ")));
    expect(yAxisTag).not.toMatch(/niceTicks|tickCount/);
    expect(source).not.toContain("formatAmountL1(String(value))");
    // 去年同期線照畫（沒有依寬度隱藏的程式），樣式仍是 YOY_LINE。
    expect(source).not.toMatch(/matchMedia|innerWidth|useMediaQuery/);
    expect(source).toContain("YOY_SERIES.map(series => <Line key={series.key} dataKey={series.key} {...YOY_LINE}");
  });
});
