import { applyCustomPeriod, clearWorkspace, clickReplacing, closePeriodSheet, dismissSavePrompt, isMobile, navigateTo, openCustomPeriod, openPeriodSheet, openValidation, periodSummary, periodSummaryText, ruleHeadline } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";
import { MINUS, deltaTone, formatAmountL1, formatAmountL2, formatAmountL3, formatGrowth, formatPointsValue, formatSignedDelta, metricDefinitions } from "../../src/application/presentation";
import { formatHeadlineAmount } from "../../src/application/copy";
import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test as base, expect, type Locator, type Page } from "@playwright/test";

interface BrowserEvent {
  kind: string;
  message: string;
  url?: string;
}
interface BrowserAudit {
  events: BrowserEvent[];
  allowDemo503: boolean;
}

// Capture actual browser output even when an assertion fails. Expected HTTP 503
// is permitted only in the explicitly intercepted failure test, never globally.
const test = base.extend<{ browserAudit: BrowserAudit }>({
  browserAudit: [async ({ page }, use, testInfo) => {
    const audit: BrowserAudit = { events: [], allowDemo503: false };
    page.on("console", message => audit.events.push({
      kind: `console:${message.type()}`,
      message: message.text(),
      url: message.location().url,
    }));
    page.on("pageerror", error => audit.events.push({ kind: "pageerror", message: error.message }));
    page.on("requestfailed", request => audit.events.push({
      kind: "requestfailed", message: request.failure()?.errorText ?? "unknown", url: request.url(),
    }));
    await use(audit);
    const record = {
      recorded_at: new Date().toISOString(),
      project: testInfo.project.name,
      test: testInfo.title,
      status: testInfo.status,
      events: audit.events,
    };
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/review-v2-a-regression-regression-m6-regression-workspace-regression-browser-logs.jsonl"), `${JSON.stringify(record)}\n`);
    await testInfo.attach("browser-log", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
    const errors = audit.events.filter(event => {
      if (event.kind !== "pageerror" && event.kind !== "console:error") return false;
      return !(audit.allowDemo503 && event.kind === "console:error"
        && event.url?.includes("/api/datasets/demo")
        && /Failed to load resource.*503/.test(event.message));
    });
    expect(errors, "瀏覽器不應出現未預期的 console error 或 page error").toEqual([]);
  }, { auto: true }],
});

const dashboard = labels.ui.dashboard;
/** Ready status reads fill(status.ready, { date: manifest.data_as_of }) (dashboard.tsx statusText); fixtures/{golden,demo}/manifest.json. */
const dataAsOf = { golden: "2026-08-03", demo: "2026-08-24" } as const;
const ready = (page: Page, dataset: keyof typeof dataAsOf) => page.getByTestId("workspace-status").filter({ hasText: fill(labels.status.ready, { date: dataAsOf[dataset] }) });
const partial = (page: Page) => page.getByTestId("workspace-status").filter({ hasText: labels.status.partial });
const failed = (page: Page) => page.getByTestId("workspace-status").filter({ hasText: labels.status.error });
const contribution = (page: Page) => page.getByTestId("kpi-contribution_after_marketing");
const revenue = (page: Page) => page.getByTestId("kpi-net_revenue");
/** The empty workspace status line shows labels.status.empty; the loading one shows labels.status.loading. */
const emptyStatus = labels.status.empty;
const loadingStatus = labels.status.loading;
/** Evidence dialog: `${title}｜${labels.sections.evidence}` (evidence-drawer.tsx). */
const evidenceDialog = (page: Page) => page.getByRole("dialog", { name: new RegExp(`${escapeRegExp(labels.sections.evidence)}$`) });
/**
 * V3-2b 三層數字（PRD §8.5）：KPI 卡主數字與上期是 L1（萬／元），表格 L2，抽屜標題下的精確值行與橋接是 L3（到分）。
 * 金額一律由 golden／獨立手算的到分字串經 presentation 格式化函式產生，不手寫顯示字串。
 */
const kpiValue = (card: Locator) => card.locator(".kpi-value");
const kpiPrevious = (card: Locator) => card.locator(".kpi-prev");
/** V3-4a KPI 帶：上期 number-link 的可及名稱「{指標}上期 {L1}，看明細」（可見文字包含在內）。 */
const previousLinkName = (metric: keyof typeof metricDefinitions, amount: string) => fill(labels.overview.kpiBand.previousAria, { metric: metricDefinitions[metric].label, value: formatAmountL1(amount) });
/** KPI 卡「上期 {L1}」（overview.tsx：`{labels.periods.previous} {number(...)}`）。 */
const previousLine = (amount: string) => `${labels.periods.previous} ${formatAmountL1(amount)}`;
/** 抽屜大數字（L1）與下一行精確值（L3＋元，evidence-drawer.tsx data-testid="evidence-precise-value"）。 */
const drawerNumber = (dialog: Locator) => dialog.locator(".evidence-body > .number");
const drawerPrecise = (dialog: Locator) => dialog.getByTestId("evidence-precise-value");
const preciseMoney = (amount: string) => fill(labels.units.yuan, { value: formatAmountL3(amount) });
const preciseSignedMoney = (amount: string) => fill(labels.units.yuan, { value: formatSignedDelta(amount, "L3") });
/** Date-range segment of the evidence scope line (`{scope}；{start} 至 {end}；通路：{channels}。`). */
const evidenceDateRange = (start: string, end: string) => fill(labels.ui.evidenceDrawer.scopeLine, { scope: "", start, end, channels: "" }).split("；")[1];
/** R2 evidence drawer lists source rows per file behind tabs: `${labels.evidence.sourceTabs[x]}（count）` buttons inside role="group" (evidence-drawer.tsx). */
async function openSourceTab(dialog: ReturnType<Page["getByRole"]>, tab: keyof typeof labels.evidence.sourceTabs) {
  await dialog.getByRole("group", { name: labels.ui.evidenceDrawer.sourceTabsAria, exact: true })
    .getByRole("button", { name: new RegExp(`^${escapeRegExp(labels.evidence.sourceTabs[tab])}（\\d+）$`) }).click();
}
/** Period date inputs: sr-only labels are fill(filter.periodStart/End, { period }) (dashboard.tsx periodFieldLabel). */
const periodField = (edge: "start" | "end", period: "previous" | "current") => fill((edge === "start" ? dashboard.filter.periodStart : dashboard.filter.periodEnd).split(" → ")[0], { period: labels.periods[period] });
/** Overview data-table summaries: fill(ui.overview.dataTable, { title }). */
const dataTable = (title: string) => fill(labels.ui.overview.dataTable, { title });
const dataTablePrefix = dataTable("").trim();
/** Diagnosis ranking button aria-label: fill(ui.workspacePanels.rankingAria, { title: headline, amount }). */
function rankingButtonName(code: Parameters<typeof ruleHeadline>[0], amountPattern: string): RegExp {
  const headline = ruleHeadline(code).source.replace(/^\^/, "").replace(/\$$/, "");
  const template = escapeRegExp(fill(labels.ui.workspacePanels.rankingAria, { title: "\u0000", amount: "\u0001" }));
  return new RegExp(`^${template.replace("\u0000", headline).replace("\u0001", amountPattern)}$`);
}
function escapeRegExp(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

async function requestDataset(page: Page, id: string) {
  await openValidation(page);
  await page.getByLabel(dashboard.validation.datasetLabel, { exact: true }).selectOption(id);
  await clickReplacing(page, page.getByRole("button", { name: dashboard.validation.loadButton, exact: true }));
}
async function loadGolden(page: Page) {
  await requestDataset(page, "golden");
  await expect(ready(page, "golden")).toBeVisible();
  // R6：載入資料後右下角（手機底部滿版）出現非 modal 的首次保存提示，會擋住頁尾附近的按鈕；本流程不測自動保存，先按「先不要」。
  await dismissSavePrompt(page);
  await navigateTo(page, "overview");
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("255.00"));
}
/** V3-3：通路下拉在期間列裡；手機期間列收成 period-toggle，先開底部面板，選完按「完成」收起（桌機不動）。 */
async function selectChannel(page: Page, channel: string) {
  await openPeriodSheet(page);
  await page.getByLabel(dashboard.filter.channel, { exact: true }).selectOption(channel);
  await closePeriodSheet(page);
}
function deferred() {
  let release!: () => void;
  const promise = new Promise<void>(resolvePromise => { release = resolvePromise; });
  return { promise, release };
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
});

test("示範資料由空狀態進入可閱讀總覽，圖表有表格替代", async ({ page }, testInfo) => {
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: dashboard.skipLink, exact: true });
  await expect(skip).toBeFocused();
  await expect(skip).toHaveCSS("clip-path", "none");
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(skip).not.toHaveCSS("clip-path", "none");
  await expect(page.getByTestId("workspace-status")).toContainText(emptyStatus);
  await clickReplacing(page, page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }));
  await expect(ready(page, "demo")).toBeVisible();
  await dismissSavePrompt(page);
  await navigateTo(page, "overview");
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("1269792.73"));
  await expect(kpiValue(revenue(page))).toHaveText(formatAmountL1("7850657.90"));
  // L1 只到 0.1 萬；到分的精確值在抽屜標題下一行（§7.8），逐一打開確認仍可追溯到分。
  for (const [card, metric, amount] of [[contribution(page), "contribution_after_marketing", "1269792.73"], [revenue(page), "net_revenue", "7850657.90"]] as const) {
    // V3-4a：主值 number-link 的可及名稱「{指標} {L1}，看明細」（可見文字包含在內）。
    await kpiValue(card).getByRole("button", { name: fill(labels.overview.kpiBand.valueAria, { metric: metricDefinitions[metric].label, value: formatAmountL1(amount) }), exact: true }).click();
    const dialog = evidenceDialog(page);
    await expect(drawerNumber(dialog)).toHaveText(formatAmountL1(amount));
    await expect(drawerPrecise(dialog)).toHaveText(preciseMoney(amount));
    await dialog.getByRole("button", { name: labels.buttons.close, exact: true }).click();
    await expect(dialog).not.toBeVisible();
  }
  const alternatives = page.locator("details").filter({ has: page.locator("summary", { hasText: dataTablePrefix }) });
  expect(await alternatives.count(), "週趨勢、金額橋接與通路比較皆須提供數據表").toBeGreaterThanOrEqual(3);
  for (const alternative of await alternatives.all()) {
    await alternative.locator("summary").click();
    await expect(alternative.getByRole("table")).toBeVisible();
    await alternative.locator("summary").click();
  }
  await alternatives.first().locator("summary").click();
  await expect(alternatives.first().getByRole("table")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), "工作台不可造成整頁水平溢出").toBe(true);
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-regression-m6-regression-workspace-regression-${testInfo.project.name}.png`), fullPage: true });
});

test("切換 golden 與 demo 會重算同一組 KPI", async ({ page }) => {
  await loadGolden(page);
  await expect(kpiValue(revenue(page))).toHaveText(formatAmountL1("2470.00"));
  // golden 本期 255.00、上期 570.00、差額 −315.00：上期連結（L1）、帶號差額（L1）與成長率（上期 > 0 才有），不利方向才上色。
  await expect(kpiPrevious(contribution(page))).toHaveText(previousLine("570.00"));
  await expect(kpiPrevious(contribution(page)).getByRole("button", { name: previousLinkName("contribution_after_marketing", "570.00"), exact: true })).toBeVisible();
  // V3-4a 差額行：「比上期」＋方向詞＋絕對值（L1）＋成長率；差額本身仍是 number-link。
  const change = contribution(page).locator(".kpi-delta");
  const deltaText = fill(labels.overview.kpiBand.deltaLine, { word: labels.format.earnLess, amount: formatHeadlineAmount("-315.00") });
  await expect(change.getByRole("button", { name: fill(labels.overview.kpiBand.deltaAria, { metric: metricDefinitions.contribution_after_marketing.label, delta: deltaText }), exact: true })).toHaveText(deltaText);
  await expect(change.locator(".pct")).toHaveText(fill(labels.ui.overview.growthInline, { value: formatGrowth("255.00", "570.00", "L1")! }));
  expect(deltaTone("contribution_after_marketing", "-315.00", "L1")).toBe("unfavorable");
  await expect(change).toHaveClass(/\bnegative\b/);
  await requestDataset(page, "demo");
  await expect(ready(page, "demo")).toBeVisible();
  await navigateTo(page, "overview");
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("1269792.73"));
  await expect(kpiValue(revenue(page))).toHaveText(formatAmountL1("7850657.90"));
  await loadGolden(page);
  await expect(kpiValue(revenue(page))).toHaveText(formatAmountL1("2470.00"));
});

test("通路篩選共用，金額證據可用鍵盤開啟與返回", async ({ page }) => {
  await loadGolden(page);
  await selectChannel(page, "DTC");
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("270.00"));
  await expect(kpiValue(revenue(page))).toHaveText(formatAmountL1("1480.00"));
  const trigger = kpiValue(contribution(page)).getByRole("button", { name: fill(labels.overview.kpiBand.valueAria, { metric: metricDefinitions.contribution_after_marketing.label, value: formatAmountL1("270.00") }), exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = evidenceDialog(page);
  await expect(dialog).toBeVisible();
  // Source rows are grouped per file in tabs (sales is the default); switch tabs to see each file's rows.
  await expect(dialog).toContainText("sales_daily.csv");
  await openSourceTab(dialog, "costs");
  await expect(dialog).toContainText("channel_costs_daily.csv");
  await openSourceTab(dialog, "ads");
  await expect(dialog).toContainText("ad_spend_daily.csv");
  await expect(dialog).toContainText("2026-08-02");
  await expect(dialog).toContainText("CM_after =");
  await expect(drawerNumber(dialog)).toHaveText(formatAmountL1("270.00"));
  await expect(drawerPrecise(dialog)).toHaveText(preciseMoney("270.00"));
  for (let index = 0; index < 8; index += 1) {
    await page.keyboard.press(index % 2 ? "Shift+Tab" : "Tab");
    expect(await dialog.evaluate(element => element.contains(document.activeElement)), "Tab 焦點必須留在原生 modal 內").toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(trigger).toBeFocused();
  await trigger.click();
  await dialog.getByRole("button", { name: labels.buttons.close, exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await navigateTo(page, "diagnosis");
  await expect(page.getByLabel(dashboard.filter.channel, { exact: true })).toHaveValue("DTC");
  await navigateTo(page, "overview");
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("270.00"));
});

test("貢獻率差額的證據保留百分點單位，不再乘以 100", async ({ page }) => {
  await loadGolden(page);
  const card = page.getByTestId("kpi-contribution_margin");
  // Independent fixed answer: (255 / 2470 - 570 / 2250) * 100 = -15.01 pp（百分點單位的差，交給 formatPointsValue；L1「降 15.0 個百分點」）。
  // V3-4a：KPI 帶的差額按鈕有可及名稱「{指標}比上期{差額}，看明細」（labels.overview.kpiBand.deltaAria）。
  await card.getByRole("button", { name: fill(labels.overview.kpiBand.deltaAria, { metric: metricDefinitions.contribution_margin.label, delta: formatPointsValue("-15.01", "L1") }), exact: true }).click();
  const dialog = evidenceDialog(page);
  await expect(dialog).toBeVisible();
  await expect(drawerNumber(dialog)).toHaveText(formatPointsValue("-15.01", "L1"));
  // 精確值行到兩位小數、U+2212、單位仍是百分點（不是乘 100 的百分比）。
  await expect(drawerPrecise(dialog)).toHaveText(formatPointsValue("-15.01", "L3"));
  await expect(drawerPrecise(dialog)).toContainText(labels.evidence.percentagePoint);
  // R2 moved the exact system value into the technical <details>: `系統原值 <code>…</code>（百分點差值）`.
  await expect(dialog.locator(".evidence-technical")).toContainText(labels.evidence.exactValue);
  await expect(dialog.locator(".evidence-technical")).toContainText(`（${labels.evidence.pointNote}）`);
  await expect(dialog).toContainText(labels.ui.overview.ratePointFormula);
  await expect(dialog).not.toContainText("-1,501.13%");
  await expect(dialog).not.toContainText(`${MINUS}1,501.13%`);
  await expect(drawerNumber(dialog)).not.toContainText("%");
  await expect(drawerPrecise(dialog)).not.toContainText("%");
});

test("診斷排序金額使用兩期已觀察差額，證據方向與來源一致", async ({ page }) => {
  await loadGolden(page);
  await navigateTo(page, "diagnosis");
  // R5-1：同一規則的合計與各通路合併成一列（details.diagnosis-row-<RuleCode>）；範圍切換鈕預設選「合計」。
  const card = page.getByTestId("diagnosis-row-DISCOUNT_BURDEN_UP");
  await expect(card.getByRole("heading", { level: 3, name: ruleHeadline("DISCOUNT_BURDEN_UP") })).toBeVisible();
  if (await card.getAttribute("open") === null) await card.locator(":scope > summary h3").click();
  await expect(card.getByRole("group", { name: labels.diagnosisList.scopeSwitch, exact: true }).getByRole("button", { name: labels.sections.total, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(card.locator(".fact-list")).toContainText(labels.ui.workspacePanels.scopeAll);
  // The summary shows the contribution impact (cost up => -250.00); the ranking amount stays the observed delta.
  // V3-2b：列摘要的影響金額是 L1（U+2212）；技術細節的排序金額是 L3 帶號＋元（diagnosis-list.tsx rankingText）。
  await expect(card.locator(":scope > summary .impact-amount")).toHaveText(formatSignedDelta("-250.00", "L1"));
  const rankingAmount = preciseSignedMoney("250.00");
  const ranking = card.getByRole("button", { name: rankingButtonName("DISCOUNT_BURDEN_UP", escapeRegExp(rankingAmount)) });
  // Golden booked discount delta: 450.00 - 200.00 = +250.00.
  // This is the observed increase, whereas the contribution bridge is -250.00.
  // R1/R5 keep the ranking amount under the technical details of the row.
  await expect(ranking).toBeHidden();
  await card.locator("details.diagnosis-technical > summary", { hasText: labels.sections.technicalDetails }).click();
  await expect(ranking).toHaveText(rankingAmount);
  await ranking.click();
  const dialog = evidenceDialog(page);
  // 差額類證據（有上期／本期組成）帶正負號：大數字 L1、精確值行 L3。
  await expect(drawerNumber(dialog)).toHaveText(formatSignedDelta("250.00", "L1"));
  await expect(drawerPrecise(dialog)).toHaveText(preciseSignedMoney("250.00"));
  // R2 glossary formula: 「差額 = 本期折扣 − 上期折扣（這是實際差額，不是可以省下的錢）」 replaces the 改善收益估計 wording.
  await expect(dialog).toContainText(fill(labels.ui.workspacePanels.deltaFormula, { metric: metricDefinitions.discounts.label }));
  const components = dialog.getByRole("region", { name: labels.evidence.components, exact: true });
  // 組成表頭標一次「（元）」，儲存格是 L3 不帶單位。
  await expect(components.getByRole("heading", { name: fill(labels.units.yuanColumn, { label: labels.evidence.components }), exact: true })).toBeVisible();
  const component = (period: "previous" | "current") => components.locator("dl > div").filter({ has: page.locator("dt", { hasText: labels.periods[period] }) }).locator("dd");
  await expect(component("previous")).toHaveText(formatAmountL3("200.00"));
  await expect(component("current")).toHaveText(formatAmountL3("450.00"));
  await expect(dialog).toContainText("sales_daily.csv");
  await expect(dialog).toContainText("2026-08-01");
  await expect(dialog).toContainText("2026-08-02");
});

test("商品篩選只影響毛利明細，不帶入通路廣告與貢獻", async ({ page }, testInfo) => {
  await loadGolden(page);
  await selectChannel(page, "DTC");
  await navigateTo(page, "products");
  const table = page.getByTestId("product-table");
  await expect(table).toBeVisible();
  // Product columns must not carry channel-level ad or contribution metrics (any of their labels or short labels).
  const channelOnlyMetrics = (["ad_spend", "mer", "marketing_burden", "contribution_before_marketing", "contribution_after_marketing", "contribution_margin"] as const)
    .flatMap(name => [metricDefinitions[name].label, metricDefinitions[name].shortLabel]);
  expect((await table.getByRole("columnheader").allTextContents()).join(" ")).not.toMatch(new RegExp(channelOnlyMetrics.map(escapeRegExp).join("|")));
  await page.getByLabel(labels.csvColumns.category, { exact: true }).selectOption("HOME");
  await page.getByLabel(labels.ui.productComparisonPanel.searchSku, { exact: true }).fill("A");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.getByRole("rowheader", { name: "A", exact: true })).toBeVisible();
  // DTC／A 本期商品毛利 = (1400.00 − 210.00 − 70.00) − 580.00 = 540.00；表格是 L2 整數元（表頭帶「（元）」）。
  const grossProfit = table.getByRole("button", { name: fill(labels.ui.productComparisonPanel.evidenceAria, { channel: "DTC", sku: "A", period: "", label: metricDefinitions.gross_profit.shortLabel, value: formatAmountL2("540.00") }), exact: true });
  await expect(grossProfit).toHaveText(formatAmountL2("540.00"));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-regression-m6-regression-workspace-regression-${testInfo.project.name}-products.png`), fullPage: true });
  await navigateTo(page, "overview");
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("270.00"));
  await expect(kpiValue(revenue(page))).toHaveText(formatAmountL1("1480.00"));
});

test("無效期間不覆寫已套用的分析範圍", async ({ page }) => {
  await loadGolden(page);
  // V3-3：日期欄收在「自訂期間」popover（手機是期間底部面板）；在裡面改日期仍要按「套用」。golden 上期 8/1、本期 8/2。
  const applied = periodSummaryText("2026-08-02", "2026-08-02", "2026-08-01", "2026-08-01", { anchor: dataAsOf.golden });
  await expect(periodSummary(page)).toContainText(applied);
  let panel = await openCustomPeriod(page);
  await page.getByLabel(periodField("start", "current"), { exact: true }).fill("2026-08-01");
  await panel.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(dashboard.errors.periodNotApplied);
  await expect(page.getByTestId("banner-filter-error")).toHaveText(dashboard.errors.periodNotApplied);
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("255.00"));
  await expect(periodSummary(page)).toContainText(applied);
  panel = await openCustomPeriod(page);
  await page.getByLabel(periodField("start", "current"), { exact: true }).fill("2026-08-02");
  await panel.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("255.00"));
  await expect(page.getByTestId("banner-filter-error")).toHaveCount(0);
  await expect(periodSummary(page)).toContainText(applied);
});

test("有效自訂期間會同步更新 KPI、週資料及來源期間", async ({ page }) => {
  await requestDataset(page, "demo");
  await expect(ready(page, "demo")).toBeVisible();
  await dismissSavePrompt(page);
  // V3-3：自訂期間 popover（手機是底部面板）裡填四個日期欄（id／標籤不變）再按「套用」；期間摘要改成新範圍。
  const panel = await openCustomPeriod(page);
  for (const [edge, period] of [["start", "previous"], ["end", "previous"], ["start", "current"], ["end", "current"]] as const) {
    await expect(panel.getByLabel(periodField(edge, period), { exact: true })).toBeVisible();
  }
  await applyCustomPeriod(page, { previousStart: "2026-06-01", previousEnd: "2026-06-07", currentStart: "2026-06-08", currentEnd: "2026-06-14" });
  await expect(periodSummary(page)).toContainText(periodSummaryText("2026-06-08", "2026-06-14", "2026-06-01", "2026-06-07", { anchor: dataAsOf.demo }));
  // Independently computed once from original demo CSV with Python csv + Decimal;
  // these literal expectations never call the application's financial functions.
  // KPI 卡是 L1（本期主數字＋上期連結）；到分的值在下面的抽屜精確值行驗證。
  await expect(kpiValue(revenue(page))).toHaveText(formatAmountL1("1032680.09"));
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("316379.67"));
  await expect(kpiPrevious(revenue(page))).toHaveText(previousLine("1069415.21"));
  await expect(kpiPrevious(contribution(page))).toHaveText(previousLine("327100.88"));
  const weekly = page.locator("details").filter({ has: page.locator("summary", { hasText: dataTable(labels.sections.trend) }) });
  await weekly.locator("summary").click();
  await expect(weekly.locator("tbody tr")).toHaveCount(2);
  await expect(weekly).toContainText("2026-06-01 — 2026-06-07");
  await expect(weekly).toContainText("2026-06-08 — 2026-06-14");
  await kpiValue(contribution(page)).getByRole("button", { name: fill(labels.overview.kpiBand.valueAria, { metric: metricDefinitions.contribution_after_marketing.label, value: formatAmountL1("316379.67") }), exact: true }).click();
  const dialog = evidenceDialog(page);
  await expect(dialog).toContainText(evidenceDateRange("2026-06-08", "2026-06-14"));
  await expect(drawerNumber(dialog)).toHaveText(formatAmountL1("316379.67"));
  await expect(drawerPrecise(dialog)).toHaveText(preciseMoney("316379.67"));
  await dialog.getByRole("button", { name: labels.buttons.close, exact: true }).click();
  // V3-4a 390 寬：非強調格是單行「名稱｜數值｜差額」，「上期」連結只在扣廣告後貢獻（強調格）可見；手機改點它，上期範圍與精確值的檢查相同。
  const [previousCard, previousMetric, previousAmount] = isMobile(page) ? [contribution(page), "contribution_after_marketing", "327100.88"] as const : [revenue(page), "net_revenue", "1069415.21"] as const;
  await kpiPrevious(previousCard).getByRole("button", { name: previousLinkName(previousMetric, previousAmount), exact: true }).click();
  await expect(dialog).toContainText(evidenceDateRange("2026-06-01", "2026-06-07"));
  await expect(drawerPrecise(dialog)).toHaveText(preciseMoney(previousAmount));
});

test("資料工作區展示三份原始檔案、行號、口徑與未縮減預覽", async ({ page }) => {
  await loadGolden(page);
  await selectChannel(page, "DTC");
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("270.00"));
  await navigateTo(page, "data");
  await expect(page.getByRole("heading", { name: labels.sections.dataScope, exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(labels.ui.workspacePanels.previewNote);
  const sales = page.getByRole("table", { name: fill(labels.ui.workspacePanels.previewCaption, { fileName: "sales_daily.csv" }), exact: true });
  await expect(sales.locator("tbody tr")).toHaveCount(8);
  await expect(sales.locator("tbody tr").first().getByRole("rowheader")).toHaveText("2");
  // 原始預覽保留 CSV 原字串（不套三層格式）。
  await expect(sales.locator("tbody tr").first()).toContainText("1000.00");
  // Golden keeps raw channel codes; the 官網／平台 alias applies only to the demo dataset.
  await expect(sales).toContainText("MARKETPLACE");
  for (const file of ["channel_costs_daily.csv", "ad_spend_daily.csv"]) {
    await expect(page.getByRole("table", { name: fill(labels.ui.workspacePanels.previewCaption, { fileName: file }), exact: true }).locator("tbody tr")).toHaveCount(4);
  }
  await expect(page.getByRole("main")).toContainText("Asia/Taipei");
  await expect(page.getByRole("main")).toContainText("contribution-v1");
});

for (const scenario of [
  { id: "missing-cogs", unaffectedChannel: "MARKETPLACE", unaffectedContribution: "-15.00" },
  { id: "missing-ad", unaffectedChannel: "DTC", unaffectedContribution: "270.00" },
]) {
  test(`${scenario.id} 顯示待補資料，保留收入與未受影響通路`, async ({ page }) => {
    await requestDataset(page, scenario.id);
    await expect(partial(page)).toBeVisible();
    await dismissSavePrompt(page);
    await navigateTo(page, "overview");
    // 缺值寫「資料待補」（不是「—」）；金額為 L1。
    await expect(kpiValue(contribution(page))).toHaveText(labels.status.missing);
    await expect(contribution(page)).not.toContainText("—");
    await expect(kpiValue(revenue(page))).toHaveText(formatAmountL1("2470.00"));
    await selectChannel(page, scenario.unaffectedChannel);
    await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1(scenario.unaffectedContribution));
  });
}

test("blocking 資料集載入失敗仍保留先前成功資料", async ({ page }) => {
  await loadGolden(page);
  await requestDataset(page, "duplicate");
  await expect(failed(page)).toBeVisible();
  await page.getByRole("button", { name: dashboard.errorState.back, exact: true }).click();
  await expect(ready(page, "golden")).toBeVisible();
  await navigateTo(page, "overview");
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("255.00"));
  await expect(kpiValue(revenue(page))).toHaveText(formatAmountL1("2470.00"));
});

test("載入中與 HTTP 故障均有明確狀態", async ({ page, browserAudit }) => {
  const gate = deferred();
  browserAudit.allowDemo503 = true;
  await page.route("**/api/datasets/demo", async route => {
    await gate.promise;
    await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "合成測試：暫時無法載入資料" }) });
  });
  try {
    await clickReplacing(page, page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }));
    await expect(page.getByTestId("workspace-status")).toContainText(loadingStatus);
  } finally {
    gate.release();
  }
  await expect(failed(page)).toBeVisible();
  await expect(contribution(page)).toHaveCount(0);
});

test("較慢的舊資料請求不可覆寫較新的 golden 選擇", async ({ page }) => {
  const gate = deferred();
  const received = deferred();
  const finished = deferred();
  const requestEnded = deferred();
  page.on("requestfinished", request => {
    if (request.url().endsWith("/api/datasets/demo")) requestEnded.release();
  });
  page.on("requestfailed", request => {
    if (request.url().endsWith("/api/datasets/demo")) requestEnded.release();
  });
  await page.route("**/api/datasets/demo", async route => {
    const response = await route.fetch();
    received.release();
    await gate.promise;
    try { await route.fulfill({ response }); }
    finally { finished.release(); }
  });
  try {
    await clickReplacing(page, page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }));
    await received.promise;
    await expect(page.getByTestId("workspace-status")).toContainText(loadingStatus);
    await loadGolden(page);
  } finally {
    gate.release();
  }
  await finished.promise;
  await requestEnded.promise;
  // Observe a browser paint after the delayed response was consumed or aborted;
  // otherwise an immediate assertion could pass before an old response applies.
  await page.evaluate(() => new Promise<void>(resolvePaint => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolvePaint()));
  }));
  await expect(ready(page, "golden")).toBeVisible();
  await expect(kpiValue(contribution(page))).toHaveText(formatAmountL1("255.00"));
  await expect(kpiValue(revenue(page))).toHaveText(formatAmountL1("2470.00"));
});

test("清空與重新整理回到空狀態，另一個頁面沒有共用資料", async ({ page, context }) => {
  await loadGolden(page);
  const otherPage = await context.newPage();
  await otherPage.goto("/");
  await expect(otherPage.getByTestId("workspace-status")).toContainText(emptyStatus);
  await expect(otherPage.getByTestId("kpi-contribution_after_marketing")).toHaveCount(0);
  await otherPage.close();
  // V3-3：「清空」搬進頂欄儲存選單的危險區（手機先開頂欄「更多」）。
  const replacement = await clearWorkspace(page);
  await replacement.getByRole("button", { name: labels.ui.replacementDialog.discardAndContinue, exact: true }).click();
  await expect(contribution(page)).toHaveCount(0);
  await expect(page.getByTestId("workspace-status")).toContainText(emptyStatus);
  await loadGolden(page);
  await page.reload();
  await expect(contribution(page)).toHaveCount(0);
  await expect(page.getByTestId("workspace-status")).toContainText(emptyStatus);
});
