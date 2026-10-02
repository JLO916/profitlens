import { clickReplacing, ruleHeadline } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";
import { metricDefinitions } from "../../src/application/presentation";
import { appendFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

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
const ready = (page: Page) => page.getByTestId("workspace-status").filter({ hasText: labels.status.ready });
const partial = (page: Page) => page.getByTestId("workspace-status").filter({ hasText: labels.status.partial });
const failed = (page: Page) => page.getByTestId("workspace-status").filter({ hasText: labels.status.error });
const contribution = (page: Page) => page.getByTestId("kpi-contribution_after_marketing");
const revenue = (page: Page) => page.getByTestId("kpi-net_revenue");
/** The empty workspace status line shows labels.status.empty; the loading one shows labels.status.loading. */
const emptyStatus = labels.status.empty;
const loadingStatus = labels.status.loading;
/** Evidence dialog: `${title}｜${labels.sections.evidence}` (evidence-drawer.tsx). */
const evidenceDialog = (page: Page) => page.getByRole("dialog", { name: new RegExp(`${escapeRegExp(labels.sections.evidence)}$`) });
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
  await page.getByRole("button", { name: labels.nav.validation.label, exact: true }).click();
  await page.getByLabel(dashboard.validation.datasetLabel, { exact: true }).selectOption(id);
  await clickReplacing(page, page.getByRole("button", { name: dashboard.validation.loadButton, exact: true }));
}
async function loadGolden(page: Page) {
  await requestDataset(page, "golden");
  await expect(ready(page)).toBeVisible();
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await expect(contribution(page)).toContainText("255.00");
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
  await expect(ready(page)).toBeVisible();
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await expect(contribution(page)).toContainText("1,269,792.73");
  await expect(revenue(page)).toContainText("7,850,657.90");
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
  await expect(revenue(page)).toContainText("2,470.00");
  await requestDataset(page, "demo");
  await expect(ready(page)).toBeVisible();
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await expect(contribution(page)).toContainText("1,269,792.73");
  await expect(revenue(page)).toContainText("7,850,657.90");
  await loadGolden(page);
  await expect(revenue(page)).toContainText("2,470.00");
});

test("通路篩選共用，金額證據可用鍵盤開啟與返回", async ({ page }) => {
  await loadGolden(page);
  await page.getByLabel(dashboard.filter.channel, { exact: true }).selectOption("DTC");
  await expect(contribution(page)).toContainText("270.00");
  await expect(revenue(page)).toContainText("1,480.00");
  const trigger = contribution(page).getByRole("button", { name: "270.00", exact: true });
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
  await expect(dialog).toContainText("NT$ 270.00");
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
  await page.getByRole("button", { name: labels.nav.diagnosis.label, exact: true }).click();
  await expect(page.getByLabel(dashboard.filter.channel, { exact: true })).toHaveValue("DTC");
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await expect(contribution(page)).toContainText("270.00");
});

test("貢獻率差額的證據保留百分點單位，不再乘以 100", async ({ page }) => {
  await loadGolden(page);
  const card = page.getByTestId("kpi-contribution_margin");
  // Independent fixed answer: (255 / 2470 - 570 / 2250) * 100 = -15.01 pp.
  await card.getByRole("button", { name: fill(labels.ui.overview.percentagePoints, { value: "-15.01" }), exact: true }).click();
  const dialog = evidenceDialog(page);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".evidence-body > .number")).toHaveText(`-15.01 ${labels.evidence.percentagePoint}`);
  // R2 moved the exact system value into the technical <details>: `系統原值 <code>…</code>（百分點差值）`.
  await expect(dialog.locator(".evidence-technical")).toContainText(labels.evidence.exactValue);
  await expect(dialog.locator(".evidence-technical")).toContainText(`（${labels.evidence.pointNote}）`);
  await expect(dialog).toContainText(labels.ui.overview.ratePointFormula);
  await expect(dialog).not.toContainText("-1,501.13%");
  await expect(dialog.locator(".evidence-body > .number")).not.toContainText("%");
});

test("診斷排序金額使用兩期已觀察差額，證據方向與來源一致", async ({ page }) => {
  await loadGolden(page);
  await page.getByRole("button", { name: labels.nav.diagnosis.label, exact: true }).click();
  const card = page.getByRole("article")
    .filter({ has: page.getByRole("heading", { name: ruleHeadline("DISCOUNT_BURDEN_UP") }) })
    .filter({ hasText: labels.ui.workspacePanels.scopeAll });
  const ranking = card.getByRole("button", { name: rankingButtonName("DISCOUNT_BURDEN_UP", "\\+250\\.00") });
  // Golden booked discount delta: 450.00 - 200.00 = +250.00.
  // This is the observed increase, whereas the contribution bridge is -250.00.
  // R1 keeps the ranking amount under the technical details of the card.
  await card.locator("summary", { hasText: labels.sections.technicalDetails }).click();
  await expect(ranking).toHaveText("+250.00");
  await ranking.click();
  const dialog = evidenceDialog(page);
  await expect(dialog.locator(".evidence-body > .number")).toHaveText("NT$ 250.00");
  // R2 glossary formula: 「差額 = 本期折扣 − 上期折扣（這是實際差額，不是可以省下的錢）」 replaces the 改善收益估計 wording.
  await expect(dialog).toContainText(fill(labels.ui.workspacePanels.deltaFormula, { metric: metricDefinitions.discounts.label }));
  const components = dialog.getByRole("region", { name: labels.evidence.components, exact: true });
  await expect(components).toContainText(labels.periods.previous);
  await expect(components).toContainText("NT$ 200.00");
  await expect(components).toContainText(labels.periods.current);
  await expect(components).toContainText("NT$ 450.00");
  await expect(dialog).toContainText("sales_daily.csv");
  await expect(dialog).toContainText("2026-08-01");
  await expect(dialog).toContainText("2026-08-02");
});

test("商品篩選只影響毛利明細，不帶入通路廣告與貢獻", async ({ page }, testInfo) => {
  await loadGolden(page);
  await page.getByLabel(dashboard.filter.channel, { exact: true }).selectOption("DTC");
  await page.getByRole("button", { name: labels.nav.products.label, exact: true }).click();
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
  await expect(table).toContainText("540.00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-regression-m6-regression-workspace-regression-${testInfo.project.name}-products.png`), fullPage: true });
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await expect(contribution(page)).toContainText("270.00");
  await expect(revenue(page)).toContainText("1,480.00");
});

test("無效期間不覆寫已套用的分析範圍", async ({ page }) => {
  await loadGolden(page);
  await page.getByLabel(periodField("start", "current"), { exact: true }).fill("2026-08-01");
  await page.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(dashboard.errors.periodNotApplied);
  await expect(contribution(page)).toContainText("255.00");
  await page.getByLabel(periodField("start", "current"), { exact: true }).fill("2026-08-02");
  await page.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  await expect(contribution(page)).toContainText("255.00");
});

test("有效自訂期間會同步更新 KPI、週資料及來源期間", async ({ page }) => {
  await requestDataset(page, "demo");
  await expect(ready(page)).toBeVisible();
  await page.getByLabel(periodField("start", "previous"), { exact: true }).fill("2026-06-01");
  await page.getByLabel(periodField("end", "previous"), { exact: true }).fill("2026-06-07");
  await page.getByLabel(periodField("start", "current"), { exact: true }).fill("2026-06-08");
  await page.getByLabel(periodField("end", "current"), { exact: true }).fill("2026-06-14");
  await page.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
  // Independently computed once from original demo CSV with Python csv + Decimal;
  // these literal expectations never call the application's financial functions.
  await expect(revenue(page)).toContainText("1,032,680.09");
  await expect(contribution(page)).toContainText("316,379.67");
  await expect(revenue(page)).toContainText("1,069,415.21");
  await expect(contribution(page)).toContainText("327,100.88");
  const weekly = page.locator("details").filter({ has: page.locator("summary", { hasText: dataTable(labels.sections.trend) }) });
  await weekly.locator("summary").click();
  await expect(weekly.locator("tbody tr")).toHaveCount(2);
  await expect(weekly).toContainText("2026-06-01 — 2026-06-07");
  await expect(weekly).toContainText("2026-06-08 — 2026-06-14");
  await contribution(page).getByRole("button", { name: "316,379.67", exact: true }).click();
  const dialog = evidenceDialog(page);
  await expect(dialog).toContainText(evidenceDateRange("2026-06-08", "2026-06-14"));
  await expect(dialog.locator(".evidence-body > .number")).toHaveText("NT$ 316,379.67");
});

test("資料工作區展示三份原始檔案、行號、口徑與未縮減預覽", async ({ page }) => {
  await loadGolden(page);
  await page.getByLabel(dashboard.filter.channel, { exact: true }).selectOption("DTC");
  await expect(contribution(page)).toContainText("270.00");
  await page.getByRole("button", { name: labels.nav.data.label, exact: true }).click();
  await expect(page.getByRole("heading", { name: labels.sections.dataScope, exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toContainText(labels.ui.workspacePanels.previewNote);
  const sales = page.getByRole("table", { name: fill(labels.ui.workspacePanels.previewCaption, { fileName: "sales_daily.csv" }), exact: true });
  await expect(sales.locator("tbody tr")).toHaveCount(8);
  await expect(sales.locator("tbody tr").first().getByRole("rowheader")).toHaveText("2");
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
    await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
    await expect(contribution(page)).toContainText(labels.status.missing);
    await expect(revenue(page)).toContainText("2,470.00");
    await page.getByLabel(dashboard.filter.channel, { exact: true }).selectOption(scenario.unaffectedChannel);
    await expect(contribution(page)).toContainText(scenario.unaffectedContribution);
  });
}

test("blocking 資料集載入失敗仍保留先前成功資料", async ({ page }) => {
  await loadGolden(page);
  await requestDataset(page, "duplicate");
  await expect(failed(page)).toBeVisible();
  await page.getByRole("button", { name: dashboard.errorState.back, exact: true }).click();
  await expect(ready(page)).toBeVisible();
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await expect(contribution(page)).toContainText("255.00");
  await expect(revenue(page)).toContainText("2,470.00");
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
  await expect(ready(page)).toBeVisible();
  await expect(contribution(page)).toContainText("255.00");
  await expect(revenue(page)).toContainText("2,470.00");
});

test("清空與重新整理回到空狀態，另一個頁面沒有共用資料", async ({ page, context }) => {
  await loadGolden(page);
  const otherPage = await context.newPage();
  await otherPage.goto("/");
  await expect(otherPage.getByTestId("workspace-status")).toContainText(emptyStatus);
  await expect(otherPage.getByTestId("kpi-contribution_after_marketing")).toHaveCount(0);
  await otherPage.close();
  await page.getByRole("button", { name: labels.buttons.clear, exact: true }).click();
  await page.getByRole("button", { name: labels.ui.replacementDialog.discardAndContinue, exact: true }).click();
  await expect(contribution(page)).toHaveCount(0);
  await expect(page.getByTestId("workspace-status")).toContainText(emptyStatus);
  await loadGolden(page);
  await page.reload();
  await expect(contribution(page)).toHaveCount(0);
  await expect(page.getByTestId("workspace-status")).toContainText(emptyStatus);
});
