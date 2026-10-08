import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { channelLabel, demoAlias } from "../src/application/copy";
import { applyEvidenceFilter, evidenceFilterText, hasEvidenceFilter, type EvidenceFilter } from "../src/application/evidence-filter";
import { evidenceRows, formatPeriodL1, metricDefinitions } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { EvidenceDrawer, evidenceSubtitle, type EvidenceSelection } from "../src/components/evidence-drawer";
import { channelEvidence } from "../src/components/overview/charts/channel-section";
import { weekEvidence } from "../src/components/overview/charts/trend-section";
import type { Dataset } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, escapeAttr } from "./helpers/markup";
import { yoyInput } from "./helpers/yoy-dataset";

// V3-9b 代理 A：F10 圖表點擊下鑽（PRD §10.1 F10、§9.5 互動 P1）。
// applyEvidenceFilter 只過濾來源列（日期落在週的起訖、通路相等；manifest 列保留），不重算任何金額；
// 抽屜（SSR）：有 filter 時原始明細上方一列片語＋「清除篩選」各一份，分段筆數與筆數說明是篩選後的列；沒有 filter 時不出現。
// golden 有兩個通路：用本期全部通路的來源列證明「通路篩選真的少列」（銷售 4 → 2、通路費用 2 → 1、廣告 2 → 1）。

const noop = () => undefined;
const copy = labels.overview.trendYoyV3.filter;
async function load(input = fixture("golden")): Promise<{ dataset: Dataset; snapshot: WorkspaceSnapshot }> {
  const dataset = validateDataset(input).dataset!;
  return { dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}
let golden: Awaited<ReturnType<typeof load>>;
let demo: Awaited<ReturnType<typeof load>>;
let twoYear: Awaited<ReturnType<typeof load>>;
beforeAll(async () => { golden = await load(fixture("golden")); demo = await load(fixture("demo")); twoYear = await load(yoyInput()); });

const count = (rows: ReturnType<typeof evidenceRows>, file: string) => rows.filter(row => row.file === file).length;
/** 本期扣廣告後貢獻（全部通路），可附篩選。 */
const contribution = (snapshot: WorkspaceSnapshot, filter?: EvidenceFilter): EvidenceSelection => ({ title: metricDefinitions.contribution_after_marketing.label, name: "contribution_after_marketing", metric: snapshot.report.current.metrics.contribution_after_marketing, period: snapshot.report.current.period, channels: snapshot.report.scope.channels, sources: snapshot.report.current.sources, ...(filter ? { filter } : {}) });

describe("applyEvidenceFilter：只過濾來源列", () => {
  it("沒有篩選（undefined、空物件）時原樣回傳全部列（新陣列）", () => {
    const rows = evidenceRows(golden.dataset, golden.snapshot.report.current.sources);
    expect(applyEvidenceFilter(rows, undefined)).toEqual(rows);
    expect(applyEvidenceFilter(rows, {})).toEqual(rows);
    expect(applyEvidenceFilter(rows, undefined)).not.toBe(rows);
    expect(hasEvidenceFilter(undefined)).toBe(false);
    expect(hasEvidenceFilter({})).toBe(false);
    expect(hasEvidenceFilter({ channel: "DTC" })).toBe(true);
  });

  it("通路：golden 本期兩個通路的列，篩 DTC 後銷售 4 → 2、通路費用 2 → 1、廣告 2 → 1，每列都是 DTC", () => {
    const rows = evidenceRows(golden.dataset, golden.snapshot.report.current.sources);
    expect([count(rows, "sales_daily.csv"), count(rows, "channel_costs_daily.csv"), count(rows, "ad_spend_daily.csv")]).toEqual([4, 2, 2]);
    const dtc = applyEvidenceFilter(rows, { channel: "DTC" });
    expect([count(dtc, "sales_daily.csv"), count(dtc, "channel_costs_daily.csv"), count(dtc, "ad_spend_daily.csv")]).toEqual([2, 1, 1]);
    expect(dtc.every(row => row.channel === "DTC")).toBe(true);
    expect(dtc.length).toBeLessThan(rows.length);
    // 篩出來的列與「該通路自己的來源列」相同（檔名與行號一致）。
    const own = evidenceRows(golden.dataset, golden.snapshot.report.current.channels.DTC.sources);
    expect(dtc.map(row => [row.file, row.line])).toEqual(own.map(row => [row.file, row.line]));
  });

  it("週：demo 本期全部列篩到本期第 2 週，只剩日期在起訖內（含兩端）的列；與該週自己的來源列相同", () => {
    const week = demo.snapshot.weeks.filter(row => row.period === "current")[1];
    const rows = evidenceRows(demo.dataset, demo.snapshot.report.current.sources);
    const filtered = applyEvidenceFilter(rows, { week: { start: week.start, end: week.end, label: week.label } });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.length).toBeLessThan(rows.length);
    expect(filtered.every(row => row.date! >= week.start && row.date! <= week.end)).toBe(true);
    expect(filtered.some(row => row.date === week.start) && filtered.some(row => row.date === week.end)).toBe(true);
    expect(filtered.map(row => [row.file, row.line])).toEqual(evidenceRows(demo.dataset, week.sources).map(row => [row.file, row.line]));
    // 週＋通路同時成立。
    const both = applyEvidenceFilter(rows, { week: { start: week.start, end: week.end, label: week.label }, channel: "MARKETPLACE" });
    expect(both.length).toBeGreaterThan(0);
    expect(both.every(row => row.channel === "MARKETPLACE" && row.date! >= week.start && row.date! <= week.end)).toBe(true);
    expect(both.length).toBeLessThan(filtered.length);
  });

  it("manifest 列一律保留；沒有日期的資料列在週篩選下不列入", () => {
    const rows = evidenceRows(golden.dataset, [...golden.snapshot.report.current.sources, { file: "manifest.json", line: null }]);
    expect(count(rows, "manifest.json")).toBe(1);
    expect(count(applyEvidenceFilter(rows, { channel: "NOPE" }), "manifest.json")).toBe(1);
    expect(applyEvidenceFilter(rows, { channel: "NOPE" })).toHaveLength(1);
    const undated = [{ file: "sales_daily.csv" as const, line: null, values: {}, missing: true }];
    expect(applyEvidenceFilter(undated, { week: { start: "2026-08-02", end: "2026-08-02", label: "x" } })).toEqual([]);
  });
});

describe("evidenceFilterText：篩選片語", () => {
  it("週：「篩選：本期第 2 週（7/20–7/26）」；週＋通路以「 · 」相接；通路用示範資料的 alias；沒有篩選時為 null", () => {
    const week = demo.snapshot.weeks.filter(row => row.period === "current")[1];
    const anchor = demo.dataset.manifest.data_as_of;
    const alias = demoAlias(demo.snapshot.report.dataset_id);
    const range = formatPeriodL1(week.start, week.end, { anchor, days: false });
    expect(range).toBe("7/20–7/26");
    const weekFilter = { week: { start: week.start, end: week.end, label: week.label } };
    expect(evidenceFilterText(weekFilter, { alias, anchor })).toBe(fill(copy.phrase, { scope: fill(copy.week, { label: week.label, range }) }));
    expect(evidenceFilterText(weekFilter, { alias, anchor })).toBe(`篩選：${fill(labels.overview.pnlV3.weekLabel.current, { n: 2 })}（7/20–7/26）`);
    expect(evidenceFilterText({ ...weekFilter, channel: "DTC" }, { alias, anchor })).toBe(fill(copy.phrase, { scope: [fill(copy.week, { label: week.label, range }), channelLabel("DTC", alias)].join(copy.joiner) }));
    expect(evidenceFilterText({ channel: "DTC" }, { alias: false })).toBe(fill(copy.phrase, { scope: "DTC" }));
    expect(evidenceFilterText(undefined, { alias })).toBeNull();
    expect(evidenceFilterText({}, { alias })).toBeNull();
  });

  it("去年同期的週：期間與資料到的年份不同時寫年份", () => {
    const yoy = twoYear.snapshot.yoy!;
    if (yoy.status !== "ready") throw new Error("yoy 不可用");
    const week = yoy.weeks[0];
    expect(evidenceFilterText({ week: { start: week.start, end: week.end, label: week.label } }, { alias: false, anchor: twoYear.dataset.manifest.data_as_of })).toBe(fill(copy.phrase, { scope: fill(copy.week, { label: fill(labels.overview.trendYoyV3.weekLabel, { n: 1 }), range: "2025/7/13–2025/7/19" }) }));
  });
});

describe("抽屜（SSR）：下鑽的篩選片語與清除", () => {
  const render = (dataset: Dataset, snapshot: WorkspaceSnapshot, evidence: EvidenceSelection) => renderToStaticMarkup(createElement(EvidenceDrawer, { dataset, snapshot, evidence, onClose: noop, onBasis: noop }));
  const tabs = (html: string) => [...element(html, 'class="source-tabs')!.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(match => match[1]);

  it("有 filter：原始明細段的小標與說明之後、分段按鈕之前一列片語＋「清除篩選」（各一份）；分段筆數是篩選後的列", () => {
    const html = render(golden.dataset, golden.snapshot, contribution(golden.snapshot, { channel: "DTC" }));
    const filter = byTestId(html, "evidence-filter");
    expect(filter).toBe(`<div class="evidence-filter" data-testid="evidence-filter"><span>${escapeAttr(evidenceFilterText({ channel: "DTC" }, { alias: false })!)}</span><button type="button" class="ui-btn ui-btn-text" data-testid="evidence-filter-clear">${copy.clear}</button></div>`);
    expect(html.split('data-testid="evidence-filter"')).toHaveLength(2);
    expect(html.split('data-testid="evidence-filter-clear"')).toHaveLength(2);
    expect(html).not.toContain("evidence-filter-apply");
    const sources = element(html, 'class="evidence-section evidence-sources"')!;
    expect(sources.indexOf('data-testid="evidence-filter"')).toBeGreaterThan(sources.indexOf(`<p class="note">${labels.evidence.sourcesNote}</p>`));
    expect(sources.indexOf('data-testid="evidence-filter"')).toBeLessThan(sources.indexOf('class="source-controls"'));
    const sourceTabs = labels.evidence.sourceTabs;
    expect(tabs(html)).toEqual([fill(labels.evidence.drawer.tabWithCount, { tab: sourceTabs.sales, n: 2 }), fill(labels.evidence.drawer.tabWithCount, { tab: sourceTabs.costs, n: 1 }), fill(labels.evidence.drawer.tabWithCount, { tab: sourceTabs.ads, n: 1 })]);
    expect(html).toContain(fill(labels.evidence.showing, { from: 1, to: 2, n: 2 }));
    // 篩選後的表格只有 DTC 的列。
    expect(element(html, 'class="source-table"')!.match(/<tr role="row">/g)).toHaveLength(1 + 2);
  });

  it("沒有 filter：不出現片語與清除鈕，分段筆數是全部列（銷售 4、通路費用 2、廣告 2）", () => {
    const html = render(golden.dataset, golden.snapshot, contribution(golden.snapshot));
    expect(html).not.toContain("evidence-filter");
    const sourceTabs = labels.evidence.sourceTabs;
    expect(tabs(html)).toEqual([fill(labels.evidence.drawer.tabWithCount, { tab: sourceTabs.sales, n: 4 }), fill(labels.evidence.drawer.tabWithCount, { tab: sourceTabs.costs, n: 2 }), fill(labels.evidence.drawer.tabWithCount, { tab: sourceTabs.ads, n: 2 })]);
  });

  it("通路長條（channelEvidence）與週的點（weekEvidence）開的抽屜都有片語；週的抽屜副標是該週期間、片語寫週名與起訖", () => {
    const channel = render(demo.dataset, demo.snapshot, channelEvidence(demo.snapshot, "MARKETPLACE", "current"));
    const alias = demoAlias(demo.snapshot.report.dataset_id);
    expect(byTestId(channel, "evidence-filter")).toContain(`<span>${escapeAttr(fill(copy.phrase, { scope: channelLabel("MARKETPLACE", alias) }))}</span>`);
    const week = demo.snapshot.weeks.filter(row => row.period === "current")[1];
    const html = render(demo.dataset, demo.snapshot, weekEvidence(week, "net_revenue", demo.snapshot.report.scope.channels));
    expect(byTestId(html, "evidence-filter")).toContain(`<span>${escapeAttr(evidenceFilterText({ week: { start: week.start, end: week.end, label: week.label } }, { alias, anchor: demo.dataset.manifest.data_as_of })!)}</span>`);
    expect(html).toContain(`class="sub">${escapeAttr(evidenceSubtitle({ period: { start: week.start, end: week.end }, channels: demo.snapshot.report.scope.channels }, { alias, anchor: demo.dataset.manifest.data_as_of, allChannels: demo.dataset.manifest.channels, report: demo.snapshot.report }))}</p>`);
  });

  it("去年同期的週與整段：抽屜畫得出四層階梯（取 snapshot.yoy 的指標），整段的副標寫「去年同期」", () => {
    const yoy = twoYear.snapshot.yoy!;
    if (yoy.status !== "ready") throw new Error("yoy 不可用");
    const channels = twoYear.snapshot.report.scope.channels;
    const week = render(twoYear.dataset, twoYear.snapshot, weekEvidence(yoy.weeks[0], "contribution_after_marketing", channels));
    expect(week).toContain('class="ladder-table"');
    expect(week).toContain(fill(labels.format.units.yuan, { value: "518.00" }));
    const whole = render(twoYear.dataset, twoYear.snapshot, { name: "net_revenue", metric: yoy.metrics.net_revenue, period: yoy.period, sources: yoy.sources, channels, title: metricDefinitions.net_revenue.label });
    expect(whole).toContain('class="ladder-table"');
    const range = formatPeriodL1(yoy.period.start, yoy.period.end, { anchor: twoYear.dataset.manifest.data_as_of, days: false });
    expect(whole).toContain(`class="sub">${escapeAttr(fill(labels.evidence.drawerV3.subtitle, { scope: labels.evidence.allChannels, period: fill(labels.evidence.drawerV3.periodNamed, { name: labels.shell.periods.presets.yoy, range }) }))}</p>`);
  });
});
