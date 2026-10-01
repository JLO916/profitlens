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
    await appendFile(resolve("verification/m6-regression-workspace-regression-browser-logs.jsonl"), `${JSON.stringify(record)}\n`);
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

const ready = (page: Page) => page.getByRole("status").filter({ hasText: "資料已就緒" });
const partial = (page: Page) => page.getByRole("status").filter({ hasText: "部分資料待補" });
const failed = (page: Page) => page.getByRole("status").filter({ hasText: "資料載入失敗" });
const contribution = (page: Page) => page.getByTestId("kpi-contribution_after_marketing");
const revenue = (page: Page) => page.getByTestId("kpi-net_revenue");

async function requestDataset(page: Page, id: string) {
  await page.getByLabel("資料集", { exact: true }).selectOption(id);
  await page.getByRole("button", { name: "載入資料集", exact: true }).click();
}
async function loadGolden(page: Page) {
  await requestDataset(page, "golden");
  await expect(ready(page)).toBeVisible();
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
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
  const skip = page.getByRole("link", { name: "跳至主要內容", exact: true });
  await expect(skip).toBeFocused();
  await expect(skip).toHaveCSS("clip-path", "none");
  await page.keyboard.press("Enter");
  await expect(page.locator("#main-content")).toBeFocused();
  await expect(skip).not.toHaveCSS("clip-path", "none");
  await expect(page.getByRole("status")).toContainText(/尚未載入|尚無資料|尚未選擇/);
  await page.getByRole("button", { name: "載入示範資料", exact: true }).click();
  await expect(ready(page)).toBeVisible();
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(contribution(page)).toContainText("1,269,792.73");
  await expect(revenue(page)).toContainText("7,850,657.90");
  const alternatives = page.locator("details").filter({ has: page.locator("summary", { hasText: "數據表" }) });
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
  await page.screenshot({ path: resolve(`verification/m6-regression-workspace-regression-${testInfo.project.name}.png`), fullPage: true });
});

test("切換 golden 與 demo 會重算同一組 KPI", async ({ page }) => {
  await loadGolden(page);
  await expect(revenue(page)).toContainText("2,470.00");
  await requestDataset(page, "demo");
  await expect(ready(page)).toBeVisible();
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(contribution(page)).toContainText("1,269,792.73");
  await expect(revenue(page)).toContainText("7,850,657.90");
  await loadGolden(page);
  await expect(revenue(page)).toContainText("2,470.00");
});

test("通路篩選共用，金額證據可用鍵盤開啟與返回", async ({ page }) => {
  await loadGolden(page);
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await expect(contribution(page)).toContainText("270.00");
  await expect(revenue(page)).toContainText("1,480.00");
  const trigger = contribution(page).getByRole("button", { name: "270.00", exact: true });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: /公式與來源$/ });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("sales_daily.csv");
  await expect(dialog).toContainText("channel_costs_daily.csv");
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
  await dialog.getByRole("button", { name: "關閉公式與來源", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole("button", { name: "通路診斷", exact: true }).click();
  await expect(page.getByLabel("通路", { exact: true })).toHaveValue("DTC");
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(contribution(page)).toContainText("270.00");
});

test("貢獻率差額的證據保留百分點單位，不再乘以 100", async ({ page }) => {
  await loadGolden(page);
  const card = page.getByTestId("kpi-contribution_margin");
  // Independent fixed answer: (255 / 2470 - 570 / 2250) * 100 = -15.01 pp.
  await card.getByRole("button", { name: "-15.01 百分點", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /公式與來源$/ });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".evidence-body > .number")).toHaveText("-15.01 百分點");
  await expect(dialog).toContainText("系統百分點差值：");
  await expect(dialog).toContainText("單位為百分點");
  await expect(dialog).not.toContainText("-1,501.13%");
  await expect(dialog.locator(".evidence-body > .number")).not.toContainText("%");
});

test("診斷排序金額使用兩期已觀察差額，證據方向與來源一致", async ({ page }) => {
  await loadGolden(page);
  await page.getByRole("button", { name: "通路診斷", exact: true }).click();
  const card = page.getByRole("article")
    .filter({ has: page.getByRole("heading", { name: "折扣率上升", exact: true }) })
    .filter({ hasText: "所選通路合計" });
  const ranking = card.getByRole("button", { name: /^查看折扣率上升排序金額來源/ });
  // Golden booked discount delta: 450.00 - 200.00 = +250.00.
  // This is the observed increase, whereas the contribution bridge is -250.00.
  await expect(ranking).toHaveText("+250.00");
  await ranking.click();
  const dialog = page.getByRole("dialog", { name: /公式與來源$/ });
  await expect(dialog.locator(".evidence-body > .number")).toHaveText("NT$ 250.00");
  await expect(dialog).toContainText("本期商品折扣 − 前期商品折扣");
  await expect(dialog).toContainText("不是改善收益估計");
  const components = dialog.getByRole("region", { name: "公式組成項目", exact: true });
  await expect(components).toContainText("前期");
  await expect(components).toContainText("NT$ 200.00");
  await expect(components).toContainText("本期");
  await expect(components).toContainText("NT$ 450.00");
  await expect(dialog).toContainText("sales_daily.csv");
  await expect(dialog).toContainText("2026-08-01");
  await expect(dialog).toContainText("2026-08-02");
});

test("商品篩選只影響毛利明細，不帶入通路廣告與貢獻", async ({ page }, testInfo) => {
  await loadGolden(page);
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await page.getByRole("button", { name: "商品毛利", exact: true }).click();
  const table = page.getByTestId("product-table");
  await expect(table).toBeVisible();
  expect((await table.getByRole("columnheader").allTextContents()).join(" ")).not.toMatch(/廣告|行銷後貢獻/);
  await page.getByLabel("品類", { exact: true }).selectOption("HOME");
  await page.getByLabel("搜尋 SKU", { exact: true }).fill("A");
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.getByRole("rowheader", { name: "A", exact: true })).toBeVisible();
  await expect(table).toContainText("540.00");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: resolve(`verification/m6-regression-workspace-regression-${testInfo.project.name}-products.png`), fullPage: true });
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
  await expect(contribution(page)).toContainText("270.00");
  await expect(revenue(page)).toContainText("1,480.00");
});

test("無效期間不覆寫已套用的分析範圍", async ({ page }) => {
  await loadGolden(page);
  await page.getByLabel("本期開始", { exact: true }).fill("2026-08-01");
  await page.getByRole("button", { name: "套用期間", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText(/等長|重疊|期間/);
  await expect(contribution(page)).toContainText("255.00");
  await page.getByLabel("本期開始", { exact: true }).fill("2026-08-02");
  await page.getByRole("button", { name: "套用期間", exact: true }).click();
  await expect(contribution(page)).toContainText("255.00");
});

test("有效自訂期間會同步更新 KPI、週資料及來源期間", async ({ page }) => {
  await requestDataset(page, "demo");
  await expect(ready(page)).toBeVisible();
  await page.getByLabel("前期開始", { exact: true }).fill("2026-06-01");
  await page.getByLabel("前期結束", { exact: true }).fill("2026-06-07");
  await page.getByLabel("本期開始", { exact: true }).fill("2026-06-08");
  await page.getByLabel("本期結束", { exact: true }).fill("2026-06-14");
  await page.getByRole("button", { name: "套用期間", exact: true }).click();
  // Independently computed once from original demo CSV with Python csv + Decimal;
  // these literal expectations never call the application's financial functions.
  await expect(revenue(page)).toContainText("1,032,680.09");
  await expect(contribution(page)).toContainText("316,379.67");
  await expect(revenue(page)).toContainText("1,069,415.21");
  await expect(contribution(page)).toContainText("327,100.88");
  const weekly = page.locator("details").filter({ has: page.locator("summary", { hasText: "數據表 · 每週營收與貢獻" }) });
  await weekly.locator("summary").click();
  await expect(weekly.locator("tbody tr")).toHaveCount(2);
  await expect(weekly).toContainText("2026-06-01 — 2026-06-07");
  await expect(weekly).toContainText("2026-06-08 — 2026-06-14");
  await contribution(page).getByRole("button", { name: "316,379.67", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: /公式與來源$/ });
  await expect(dialog).toContainText("2026-06-08 至 2026-06-14");
  await expect(dialog.locator(".evidence-body > .number")).toHaveText("NT$ 316,379.67");
});

test("資料工作區展示三份原始檔案、行號、口徑與未縮減預覽", async ({ page }) => {
  await loadGolden(page);
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await expect(contribution(page)).toContainText("270.00");
  await page.getByRole("button", { name: "資料工作區", exact: true }).click();
  await expect(page.getByRole("heading", { name: "資料範圍與口徑", exact: true })).toBeVisible();
  await expect(page.getByRole("main")).toContainText("不隨上方分析篩選縮減");
  const sales = page.getByRole("table", { name: "sales_daily.csv 原始來源前 10 列", exact: true });
  await expect(sales.locator("tbody tr")).toHaveCount(8);
  await expect(sales.locator("tbody tr").first().getByRole("rowheader")).toHaveText("2");
  await expect(sales.locator("tbody tr").first()).toContainText("1000.00");
  await expect(sales).toContainText("MARKETPLACE");
  for (const file of ["channel_costs_daily.csv", "ad_spend_daily.csv"]) {
    await expect(page.getByRole("table", { name: `${file} 原始來源前 10 列`, exact: true }).locator("tbody tr")).toHaveCount(4);
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
    await page.getByRole("button", { name: "經營總覽", exact: true }).click();
    await expect(contribution(page)).toContainText("資料待補");
    await expect(revenue(page)).toContainText("2,470.00");
    await page.getByLabel("通路", { exact: true }).selectOption(scenario.unaffectedChannel);
    await expect(contribution(page)).toContainText(scenario.unaffectedContribution);
  });
}

test("blocking 資料集載入失敗仍保留先前成功資料", async ({ page }) => {
  await loadGolden(page);
  await requestDataset(page, "duplicate");
  await expect(failed(page)).toBeVisible();
  await page.getByRole("button", { name: "返回前次成功資料", exact: true }).click();
  await expect(ready(page)).toBeVisible();
  await page.getByRole("button", { name: "經營總覽", exact: true }).click();
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
    await page.getByRole("button", { name: "載入示範資料", exact: true }).click();
    await expect(page.getByRole("status")).toContainText(/載入中|正在載入/);
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
    await page.getByRole("button", { name: "載入示範資料", exact: true }).click();
    await received.promise;
    await expect(page.getByRole("status")).toContainText(/載入中|正在載入/);
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
  await expect(otherPage.getByRole("status")).toContainText(/尚未載入|尚無資料|尚未選擇/);
  await expect(otherPage.getByTestId("kpi-contribution_after_marketing")).toHaveCount(0);
  await otherPage.close();
  await page.getByRole("button", { name: "清空工作區", exact: true }).click();
  await expect(contribution(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(/尚未載入|尚無資料|尚未選擇/);
  await loadGolden(page);
  await page.reload();
  await expect(contribution(page)).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(/尚未載入|尚無資料|尚未選擇/);
});
