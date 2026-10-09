import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { channelLabel, demoAlias } from "../src/application/copy";
import { applyEvidenceFilter, evidenceFilterError, evidenceFilterText, hasEvidenceFilter, scopedEvidenceFilter, type EvidenceFilter } from "../src/application/evidence-filter";
import { evidenceRows, formatDateL1, formatPeriodL1, metricDefinitions } from "../src/application/presentation";
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

// ── V4-3b 代理 B：EvidenceFilter 加 date（G11 熱表格下鑽）與 sku（商品層證據）（PRD §6.4、§8.7；CHART_CATALOG §1.2 filter、G11 抽屜）。
// 只過濾原始明細、不重算；sku 條件下沒有 sku 欄位的通路費用與廣告列一律不列入（AGENTS.md：SKU 篩選不可帶入全通路費用）；
// filter.sku 只和同一個商品的商品層證據一起用，其他證據帶 filter.sku 視為錯誤（evidenceFilterError），抽屜以 scopedEvidenceFilter 拿掉 sku 條件。
const v4 = labels.evidence.chartsV4.filter;
/** golden 兩期（8/1 上期、8/2 本期）全部的來源列，加一列 manifest。 */
const goldenAll = () => evidenceRows(golden.dataset, [...golden.snapshot.report.previous.sources, ...golden.snapshot.report.current.sources, { file: "manifest.json", line: null }]);
const counts = (rows: ReturnType<typeof evidenceRows>) => [count(rows, "sales_daily.csv"), count(rows, "channel_costs_daily.csv"), count(rows, "ad_spend_daily.csv")];

describe("V4-3b applyEvidenceFilter：單日與商品", () => {
  it("hasEvidenceFilter：只給 date 或只給 sku 也算有篩選", () => {
    expect(hasEvidenceFilter({ date: "2026-08-01" })).toBe(true);
    expect(hasEvidenceFilter({ sku: "A" })).toBe(true);
  });

  it("單日：golden 兩期 8 列銷售、4 列通路費用、4 列廣告，篩 8/1 只剩上期那一天（4、2、2），每列日期等於該日；manifest 列保留", () => {
    const rows = goldenAll();
    expect(counts(rows)).toEqual([8, 4, 4]);
    const day = applyEvidenceFilter(rows, { date: "2026-08-01" });
    expect(counts(day)).toEqual([4, 2, 2]);
    expect(day.filter(row => row.file !== "manifest.json").every(row => row.date === "2026-08-01")).toBe(true);
    expect(count(day, "manifest.json")).toBe(1);
    // 篩出來的列與上期（就是 8/1 這一天）自己的來源列相同。
    expect(day.filter(row => row.file !== "manifest.json").map(row => [row.file, row.line])).toEqual(evidenceRows(golden.dataset, golden.snapshot.report.previous.sources).map(row => [row.file, row.line]));
    // 沒有日期的資料列在單日條件下不列入。
    expect(applyEvidenceFilter([{ file: "sales_daily.csv", line: null, values: {}, missing: true }], { date: "2026-08-01" })).toEqual([]);
  });

  it("通路加單日（G11 熱表格的 filter）：demo 本期全部來源列篩到 MARKETPLACE 的一天，與 report.current.daily 該日該通路自己的來源列相同", () => {
    const { report } = demo.snapshot;
    const daily = report.current.daily.find(item => item.channel === "MARKETPLACE" && item.date === report.current.period.start)!;
    expect(daily).toBeDefined();
    const rows = evidenceRows(demo.dataset, report.current.sources);
    const filtered = applyEvidenceFilter(rows, { channel: "MARKETPLACE", date: daily.date });
    expect(filtered.length).toBeGreaterThan(0);
    expect(filtered.every(row => row.channel === "MARKETPLACE" && row.date === daily.date)).toBe(true);
    const key = (row: { file: string; line: number | null }) => `${row.file}:${row.line}`;
    expect(filtered.map(key).sort()).toEqual(evidenceRows(demo.dataset, daily.sources).map(key).sort());
    // 只篩單日（全部通路）比通路加單日多。
    expect(applyEvidenceFilter(rows, { date: daily.date }).length).toBeGreaterThan(filtered.length);
    // 週與單日同時給時兩個條件都成立（單日在週外時一列都不剩）。
    const week = demo.snapshot.weeks.filter(row => row.period === "current")[1];
    expect(applyEvidenceFilter(rows, { week: { start: week.start, end: week.end, label: week.label }, date: daily.date })).toEqual([]);
  });

  it("商品：golden 本期篩 SKU A 只剩兩通路的 A 銷售列，通路費用與廣告列一律不列入；加通路時只剩 DTC 的 A；manifest 列保留", () => {
    const rows = evidenceRows(golden.dataset, [...golden.snapshot.report.current.sources, { file: "manifest.json", line: null }]);
    expect(counts(rows)).toEqual([4, 2, 2]);
    const sku = applyEvidenceFilter(rows, { sku: "A" });
    expect(counts(sku)).toEqual([2, 0, 0]);
    expect(sku.filter(row => row.file !== "manifest.json").every(row => row.file === "sales_daily.csv" && row.sku === "A")).toBe(true);
    expect(count(sku, "manifest.json")).toBe(1);
    const dtc = applyEvidenceFilter(rows, { channel: "DTC", sku: "A" });
    expect(counts(dtc)).toEqual([1, 0, 0]);
    expect(dtc.find(row => row.file === "sales_daily.csv")).toMatchObject({ channel: "DTC", sku: "A", date: "2026-08-02" });
    // 缺列（line null）帶 sku 的銷售列照 sku 比對；沒有 sku 的通路費用缺列不列入。
    const missing = evidenceRows(golden.dataset, [{ file: "sales_daily.csv", line: null, date: "2026-08-02", channel: "DTC", sku: "A" }, { file: "channel_costs_daily.csv", line: null, date: "2026-08-02", channel: "DTC" }]);
    expect(applyEvidenceFilter(missing, { sku: "A" }).map(row => row.file)).toEqual(["sales_daily.csv"]);
  });
});

describe("V4-3b filter.sku 只和商品層證據一起用", () => {
  it("evidenceFilterError：非商品層證據帶 sku 是錯誤；同一個商品的商品層證據不是；不同商品是錯誤；沒有 sku 條件時一律 null", () => {
    expect(evidenceFilterError({ filter: { sku: "A" } })).toBe("skuWithoutProductEvidence");
    expect(evidenceFilterError({ filter: { channel: "DTC", sku: "A" } })).toBe("skuWithoutProductEvidence");
    expect(evidenceFilterError({ sku: "A", filter: { channel: "DTC", sku: "A" } })).toBeNull();
    expect(evidenceFilterError({ sku: "B", filter: { sku: "A" } })).toBe("skuMismatch");
    expect(evidenceFilterError({ filter: { channel: "DTC", date: "2026-08-02" } })).toBeNull();
    expect(evidenceFilterError({ sku: "A" })).toBeNull();
    expect(evidenceFilterError({})).toBeNull();
  });

  it("scopedEvidenceFilter：用錯時拿掉 sku、其餘條件照舊（不改原物件）；用法正確或沒有 sku 時原物件回傳", () => {
    const wrong: EvidenceFilter = { channel: "DTC", date: "2026-08-02", sku: "A" };
    expect(scopedEvidenceFilter({ filter: wrong })).toEqual({ channel: "DTC", date: "2026-08-02" });
    expect(wrong.sku).toBe("A");
    expect(scopedEvidenceFilter({ sku: "B", filter: wrong })).toEqual({ channel: "DTC", date: "2026-08-02" });
    const right: EvidenceFilter = { channel: "DTC", sku: "A" };
    expect(scopedEvidenceFilter({ sku: "A", filter: right })).toBe(right);
    const plain: EvidenceFilter = { channel: "DTC" };
    expect(scopedEvidenceFilter({ filter: plain })).toBe(plain);
    expect(scopedEvidenceFilter({})).toBeUndefined();
    // 只有 sku 一個條件而且用錯：拿掉之後沒有任何篩選。
    expect(hasEvidenceFilter(scopedEvidenceFilter({ filter: { sku: "A" } }))).toBe(false);
  });
});

describe("V4-3b evidenceFilterText：日期與商品片語", () => {
  const anchor = () => golden.dataset.manifest.data_as_of;
  it("單日「篩選：日期 8/2」；依週、單日、通路、商品的順序以「 · 」相接；日期與資料到的年份不同時寫年份", () => {
    expect(evidenceFilterText({ date: "2026-08-02" }, { alias: false, anchor: anchor() })).toBe(fill(copy.phrase, { scope: fill(v4.date, { date: "8/2" }) }));
    expect(evidenceFilterText({ date: "2026-08-02" }, { alias: false, anchor: anchor() })).toBe("篩選：日期 8/2");
    expect(evidenceFilterText({ channel: "DTC", date: "2026-08-02" }, { alias: false, anchor: anchor() })).toBe(fill(copy.phrase, { scope: [fill(v4.date, { date: "8/2" }), "DTC"].join(copy.joiner) }));
    expect(evidenceFilterText({ sku: "A" }, { alias: false })).toBe(fill(copy.phrase, { scope: fill(v4.sku, { sku: "A" }) }));
    expect(evidenceFilterText({ sku: "A" }, { alias: false })).toBe("篩選：商品 A");
    const week = { start: "2026-08-02", end: "2026-08-08", label: fill(labels.overview.pnlV3.weekLabel.current, { n: 1 }) };
    expect(evidenceFilterText({ sku: "A", channel: "DTC", date: "2026-08-02", week }, { alias: false, anchor: anchor() }))
      .toBe(fill(copy.phrase, { scope: [fill(copy.week, { label: week.label, range: formatPeriodL1(week.start, week.end, { anchor: anchor(), days: false }) }), fill(v4.date, { date: "8/2" }), "DTC", fill(v4.sku, { sku: "A" })].join(copy.joiner) }));
    expect(formatDateL1("2025-08-02", { anchor: anchor() })).toBe("2025/8/2");
    expect(evidenceFilterText({ date: "2025-08-02" }, { alias: false, anchor: anchor() })).toBe(fill(copy.phrase, { scope: fill(v4.date, { date: "2025/8/2" }) }));
  });
});

describe("V4-3b 抽屜（SSR）：單日與商品的下鑽", () => {
  const render = (dataset: Dataset, snapshot: WorkspaceSnapshot, evidence: EvidenceSelection) => renderToStaticMarkup(createElement(EvidenceDrawer, { dataset, snapshot, evidence, onClose: noop, onBasis: noop }));
  const tabs = (html: string) => [...element(html, 'class="source-tabs')!.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(match => match[1]);
  const dates = (html: string) => [...element(html, 'class="source-table"')!.matchAll(/class="evidence-date"[^>]*>([^<]*)<\/td>/g)].map(match => match[1]);
  const tabText = (tab: keyof typeof labels.evidence.sourceTabs, n: number) => fill(labels.evidence.drawer.tabWithCount, { tab: labels.evidence.sourceTabs[tab], n });

  it("通路加單日（G11 熱表格）：片語含日期與通路名；原始明細每列日期等於該日；分段筆數是篩選後的列", () => {
    const { report } = demo.snapshot;
    const date = report.current.period.start;
    const daily = report.current.daily.find(item => item.channel === "MARKETPLACE" && item.date === date)!;
    const evidence: EvidenceSelection = { name: "contribution_after_marketing", metric: daily.metrics.contribution_after_marketing, period: { start: date, end: date }, channels: ["MARKETPLACE"], sources: report.current.sources, title: metricDefinitions.contribution_after_marketing.label, filter: { channel: "MARKETPLACE", date } };
    const html = render(demo.dataset, demo.snapshot, evidence);
    const alias = demoAlias(demo.snapshot.report.dataset_id);
    const anchor = demo.dataset.manifest.data_as_of;
    const phrase = evidenceFilterText({ channel: "MARKETPLACE", date }, { alias, anchor })!;
    expect(phrase).toBe(fill(copy.phrase, { scope: [fill(v4.date, { date: formatDateL1(date, { anchor }) }), channelLabel("MARKETPLACE", alias)].join(copy.joiner) }));
    expect(byTestId(html, "evidence-filter")).toContain(`<span>${escapeAttr(phrase)}</span>`);
    expect(dates(html).length).toBeGreaterThan(0);
    expect(dates(html).every(value => value === date)).toBe(true);
    const filtered = applyEvidenceFilter(evidenceRows(demo.dataset, report.current.sources), { channel: "MARKETPLACE", date });
    expect(tabs(html)).toEqual([tabText("sales", count(filtered, "sales_daily.csv")), tabText("costs", count(filtered, "channel_costs_daily.csv")), tabText("ads", count(filtered, "ad_spend_daily.csv"))]);
  });

  it("商品層證據帶 filter.sku：片語含「商品 A」，原始明細只有該商品的銷售列（沒有通路費用與廣告分段）", () => {
    const evidence: EvidenceSelection = { sku: "A", name: "gross_profit", metric: golden.snapshot.report.current.metrics.gross_profit, period: golden.snapshot.report.current.period, channels: ["DTC"], sources: golden.snapshot.report.current.sources, title: metricDefinitions.gross_profit.label, filter: { channel: "DTC", sku: "A" } };
    const html = render(golden.dataset, golden.snapshot, evidence);
    expect(byTestId(html, "evidence-filter")).toContain(`<span>${escapeAttr(fill(copy.phrase, { scope: ["DTC", fill(v4.sku, { sku: "A" })].join(copy.joiner) }))}</span>`);
    expect(tabs(html)).toEqual([tabText("sales", 1)]);
    expect(element(html, 'class="source-table"')!.match(/<tr role="row">/g)).toHaveLength(1 + 1);
  });

  it("非商品層證據帶 filter.sku（用錯）：抽屜拿掉 sku 條件，片語沒有商品，通路費用與廣告列照常列出（不把通路金額配上單一商品的明細）", () => {
    const html = render(golden.dataset, golden.snapshot, contribution(golden.snapshot, { channel: "DTC", sku: "A" }));
    expect(byTestId(html, "evidence-filter")).toContain(`<span>${escapeAttr(fill(copy.phrase, { scope: "DTC" }))}</span>`);
    expect(html).not.toContain(escapeAttr(fill(v4.sku, { sku: "A" })));
    expect(tabs(html)).toEqual([tabText("sales", 2), tabText("costs", 1), tabText("ads", 1)]);
  });
});
