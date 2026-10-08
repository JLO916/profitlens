import { expect, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { chartColors } from "../../src/application/chart-theme";
import { formatPeriodL1, metricDefinitions } from "../../src/application/presentation";
import { chooseBasis, commitWizard, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardFiles, type FilePayload, type WizardRole } from "./import-wizard-helpers";
import { openDetails } from "./replacement-helpers";

// V3-9b F8 趨勢圖第三線「去年同期」與 F10 圖表點擊下鑽（PRD §10.1 F8、F10；§9.5）的定位器、期待字串與兩年合成資料。
// 字串一律由 labels 依元件的組字方式組出（trend-section.tsx、evidence-drawer.tsx、src/application/evidence-filter.ts），不寫死中文。
const yoyCopy = labels.overview.trendYoyV3;
const frame = labels.overview.chartFrame;
const overviewUi = labels.overview.page;

// ── 趨勢圖（section data-testid="trend"） ──
export const trend = (page: Page) => page.getByTestId("trend");
/** 圖例各項（本期、上期、去年同期）；第三項是 trend-legend-yoy（12×2 虛線段，不是 <i>）。 */
export const trendLegendItems = (page: Page) => trend(page).locator(".legend > span");
export const yoyLegend = (page: Page) => trend(page).getByTestId("trend-legend-yoy");
/** 去年同期不可用時圖下方的一行原因（p.note.trend-yoy-note）；可用時不渲染。 */
export const yoyNote = (page: Page) => trend(page).getByTestId("trend-yoy-note");
/** Recharts 折線：示範資料 4 條（本期、上期 × 淨營收、扣廣告後貢獻）；去年同期可用時 6 條。 */
export const trendLines = (page: Page) => trend(page).locator(".recharts-line");
/** 去年同期線的虛線樣式（trend-section.tsx 的 YOY_LINE：--chart-yoy、1.5px、"4 3"）。 */
export const YOY_DASH = "4 3";
export const yoyCurves = (page: Page) => trend(page).locator(`path.recharts-line-curve[stroke='${chartColors.yoy}'][stroke-dasharray='${YOY_DASH}']`);
export type TrendSeries = "revenuePrevious" | "contributionPrevious" | "revenueCurrent" | "contributionCurrent" | "revenueYoy" | "contributionYoy";
/** F10：每個非空點的透明熱區 circle.chart-point-hit[data-series][data-start]（data-start＝該週起日）。 */
export function pointHits(page: Page, series?: TrendSeries, start?: string): Locator {
  const attrs = `${series === undefined ? "" : `[data-series='${series}']`}${start === undefined ? "" : `[data-start='${start}']`}`;
  return trend(page).locator(`circle.chart-point-hit${attrs}`);
}
export const pointStarts = (hits: Locator) => hits.evaluateAll(nodes => nodes.map(node => node.getAttribute("data-start")));
/** 提示列（.takeaway）：淨營收期間合計、最近完整週淨營收；去年同期可用時多「去年同期淨營收合計」。 */
export const trendTakeaways = (page: Page) => trend(page).locator(".takeaway");

// ── 趨勢資料表（收合的 details.data-alternative） ──
export const trendTable = (page: Page) => trend(page).locator("details.data-alternative");
export async function openTrendTable(page: Page): Promise<Locator> {
  const details = await openDetails(trendTable(page));
  await expect(details.getByRole("table")).toBeVisible();
  return details;
}
/** 表頭 7 欄：期間｜起訖日｜淨營收｜商品毛利｜扣廣告後貢獻｜去年同期淨營收｜去年同期扣廣告後貢獻。 */
export const TREND_TABLE_HEADERS = [
  overviewUi.colPeriod, overviewUi.colRange,
  ...(["net_revenue", "gross_profit", "contribution_after_marketing"] as const).map(name => metricDefinitions[name].label),
  ...(["net_revenue", "contribution_after_marketing"] as const).map(name => fill(yoyCopy.tableColumn, { metric: metricDefinitions[name].label })),
];
/** 每列最後兩格是去年同期（td 第 6、7 欄）。 */
export const yoyCells = (row: Locator) => row.locator("td:nth-child(n+6)");
/** 對不到去年同期週（上期各列、或去年同期不可用）時的 span.trend-yoy-empty「無資料」。 */
export const YOY_EMPTY = frame.noData;

// ── 期待字串 ──
/** 去年同期不可用：「沒有去年同期線：{期間快捷的原因}」；資料起日太晚時原因是 periods.presetTooShort。 */
export const yoyTooShortNote = (coverageStart: string) => fill(yoyCopy.unavailable, { reason: fill(labels.shell.periods.presetTooShort, { date: coverageStart, preset: labels.shell.periods.presets.yoy }) });
/** 抽屜篩選片語「篩選：{scope}」；scope 由週與通路以 joiner 相接。 */
export const filterPhrase = (...scope: string[]) => fill(yoyCopy.filter.phrase, { scope: scope.join(yoyCopy.filter.joiner) });
/** 週的篩選範圍「{週名}（{M/D–M/D}）」；日期用主層期間（anchor＝資料到，跨年寫年份）。 */
export const weekScope = (label: string, start: string, end: string, anchor: string) => fill(yoyCopy.filter.week, { label, range: formatPeriodL1(start, end, { anchor, days: false }) });
/** 本期／上期第 n 週（snapshot.weeks 的週名）與去年同期第 n 週（snapshot.yoy.weeks 的週名）。 */
export const weekLabel = (period: "current" | "previous" | "yoy", n: number) => fill(period === "yoy" ? yoyCopy.weekLabel : labels.overview.pnlV3.weekLabel[period], { n });
/** 抽屜副標「{範圍} · {期間}」；name 給了就前綴「本期／上期／去年同期」（evidence.drawerV3.periodNamed）。 */
export function drawerSubtitle(scope: string, start: string, end: string, anchor: string, name?: string) {
  const range = formatPeriodL1(start, end, { anchor, days: false });
  return fill(labels.evidence.drawerV3.subtitle, { scope, period: name === undefined ? range : fill(labels.evidence.drawerV3.periodNamed, { name, range }) });
}
/** 原始明細分段按鈕「{分段}（{筆數}）」。 */
export const sourceTabName = (tab: keyof typeof labels.evidence.sourceTabs, n: number) => fill(labels.evidence.drawer.tabWithCount, { tab: labels.evidence.sourceTabs[tab], n });

// ── 計算與來源抽屜 ──
export const evidenceDialog = (page: Page) => page.getByRole("dialog", { name: new RegExp(`${labels.evidence.sections.evidence.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`) });
export const evidenceHeading = (dialog: Locator) => dialog.getByRole("heading", { level: 2 });
/** F10：下鑽時才有的篩選列（div.evidence-filter）：span 是片語或「全部來源」，按鈕是清除／套用（同一顆按鈕切換）。 */
export const evidenceFilter = (dialog: Locator) => dialog.getByTestId("evidence-filter");
export const evidenceFilterText = (dialog: Locator) => evidenceFilter(dialog).locator(":scope > span");
export const filterClear = (dialog: Locator) => dialog.getByTestId("evidence-filter-clear");
export const filterApply = (dialog: Locator) => dialog.getByTestId("evidence-filter-apply");
export const sourceTabs = (dialog: Locator) => dialog.getByRole("group", { name: labels.evidence.drawer.sourceTabsAria, exact: true }).getByRole("button");
/** 目前分頁的原始明細日期欄（td.evidence-date）。 */
export const sourceDates = (dialog: Locator) => dialog.locator("table.source-table td.evidence-date").allTextContents();
/** 目前分頁的原始明細通路欄：只取通路名（商品另起一行 <small>，不算）。 */
export const sourceChannels = (dialog: Locator) => dialog.locator(`table.source-table td[data-label='${labels.evidence.drawerV3.sourceColumns.channel}']`).evaluateAll(cells => cells.map(cell => [...cell.childNodes].filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent ?? "").join("").trim()));
/** 日期都落在 [start, end]（含）且至少一列。 */
export async function expectDatesWithin(dialog: Locator, start: string, end: string) {
  const dates = await sourceDates(dialog);
  expect(dates.length, "原始明細至少一列").toBeGreaterThan(0);
  expect(dates.filter(date => date < start || date > end), `原始明細的日期都在 ${start}～${end}`).toEqual([]);
}

// ── 兩年合成資料（F8 去年同期可用） ──
/**
 * 一個通路「官網」、一個商品，涵蓋 2025-07-01～2026-08-31（不含稅、標準欄名，精靈第 2 步自動完成）。
 * 2025 年每天：原價收入 50.00、成本 20.00、費用 5.00／2.00／3.00／0.00、廣告 30.00 → 淨營收 50.00、扣廣告後貢獻 50 − 20 − 10 − 30 ＝ −10.00。
 * 2026 年每天：原價收入 200.00、成本 40.00、費用同上、廣告 40.00 → 淨營收 200.00、扣廣告後貢獻 200 − 40 − 10 − 40 ＝ 110.00。
 * 本月 vs 上月（本期 2026-08、上期 2026-07）時去年同期＝2025-08-01～08-31（31 天）：淨營收 31 × 50 ＝ 1550.00；
 * 去年同期第 1 週 2025-08-01～08-07：淨營收 7 × 50 ＝ 350.00、扣廣告後貢獻 7 × −10 ＝ −70.00；共 5 週（7、7、7、7、3 天）。
 * 本期每週淨營收 1400.00、扣廣告後貢獻 770.00；四個值在同一個 x 上彼此相距夠遠，去年同期的點熱區不會被本期的點蓋住。
 */
export const TWO_YEARS = { coverageStart: "2025-07-01", coverageEnd: "2026-08-31" } as const;
function days(start: string, end: string): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
export function twoYearFiles(): Record<WizardRole, FilePayload> {
  const all = days(TWO_YEARS.coverageStart, TWO_YEARS.coverageEnd);
  const lastYear = (day: string) => day < "2026";
  const sales = ["date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency", ...all.map(day => `${day},官網,SKU-1,服飾,${lastYear(day) ? "1" : "2"},${lastYear(day) ? "50.00" : "200.00"},0.00,0.00,${lastYear(day) ? "20.00" : "40.00"},TWD`)].join("\n");
  const costs = ["date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency", ...all.map(day => `${day},官網,5.00,2.00,3.00,0.00,TWD`)].join("\n");
  const ads = ["date,channel,ad_spend,currency", ...all.map(day => `${day},官網,${lastYear(day) ? "30.00" : "40.00"},TWD`)].join("\n");
  const file = (name: WizardRole, text: string): FilePayload => ({ name, mimeType: "text/csv", buffer: Buffer.from(text, "utf8") });
  return { "sales_daily.csv": file("sales_daily.csv", sales), "channel_costs_daily.csv": file("channel_costs_daily.csv", costs), "ad_spend_daily.csv": file("ad_spend_daily.csv", ads) };
}
/** 經四步精靈匯入兩年合成資料（不含稅、檢核通過）。 */
export async function importTwoYears(page: Page) {
  await openWizard(page);
  await setWizardFiles(page, "", twoYearFiles());
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  await chooseBasis(page, "exclusive");
  await confirmAndCheck(page, "valid");
  await commitWizard(page);
}
