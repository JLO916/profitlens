import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Page } from "@playwright/test";

const storage = (page: Page) => page.getByTestId("workspace-storage");
const status = (page: Page) => page.getByTestId("workspace-status");
async function openStorage(page: Page) {
  if ((await storage(page).getAttribute("open")) === null) await storage(page).locator("summary").click();
}
async function golden(page: Page) {
  await page.getByRole("button", { name: "進階驗證", exact: true }).click();
  await page.getByLabel("資料集", { exact: true }).selectOption("golden");
  await page.getByRole("button", { name: "載入資料集", exact: true }).click();
  await expect(status(page)).toContainText("資料已就緒");
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("270.00");
}
async function makeScenario(page: Page, index: number, cost: string, expected: string) {
  await page.getByRole("button", { name: "情境試算", exact: true }).click();
  const create = page.getByRole("button", { name: "建立 DTC 方案工作區", exact: true });
  await expect(create.or(page.getByTestId("decision-workbench"))).toBeVisible();
  if (await create.isVisible()) await create.click();
  await page.getByRole("button", { name: "新增方案", exact: true }).click();
  const card = page.getByTestId(`scenario-${index}`);
  await card.getByLabel("方案名稱", { exact: true }).fill(`保存方案 ${index}`);
  const values = { "售出量變化（相對 %）": "0", "折扣率變化（百分點）": "0", "單位履約成本變化（相對 %）": "-10", "總廣告支出變化（相對 %）": "0", "一次性投入（TWD）": cost };
  for (const [label, value] of Object.entries(values)) await card.getByLabel(label, { exact: true }).fill(value);
  await card.getByLabel("我接受此方案的全部固定假設", { exact: true }).check();
  await card.getByRole("button", { name: "計算方案", exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText(expected);
}
async function makeAction(page: Page) {
  await page.getByRole("button", { name: "行動摘要", exact: true }).click();
  await page.getByRole("button", { name: "新增行動", exact: true }).click();
  const card = page.getByTestId("action-1");
  const fields = { 問題: "核對履約成本", 具體動作: "取得物流報價與服務條款", 負責角色: "營運主管", 驗證指標: "本期履約費用", 期限: "2026-10-15", 停止條件: "服務品質下降即停止", 所需額外資料: "物流合約" };
  for (const [label, value] of Object.entries(fields)) await card.getByLabel(label, { exact: true }).fill(value);
  const evidence = card.getByLabel("本快照證據（可複選）", { exact: true });
  const value = await evidence.locator("option").filter({ hasText: /2026-08-02–2026-08-02 · 行銷後貢獻 · DTC（通路） · 270\.00/ }).getAttribute("value");
  await evidence.selectOption(value!);
  await card.getByRole("button", { name: "確認行動與證據", exact: true }).click();
  await expect(card).toContainText("使用者已確認");
  return value;
}
async function backup(page: Page) {
  await openStorage(page);
  const [file] = await Promise.all([page.waitForEvent("download"), storage(page).getByRole("button", { name: "下載完整工作區備份", exact: true }).click()]);
  expect(file.suggestedFilename()).toBe("profitlens-workspace.json");
  return readFile((await file.path())!, "utf8");
}
async function restoreFile(page: Page, text: string) {
  await openStorage(page);
  await storage(page).getByLabel("選取工作區備份 JSON", { exact: true }).setInputFiles({ name: "workspace.json", mimeType: "application/json", buffer: Buffer.from(text) });
}
async function saveLocal(page: Page) {
  await openStorage(page);
  await storage(page).getByLabel("我同意將工作區資料保存於這個瀏覽器（不自動保存）", { exact: true }).check();
  await storage(page).getByRole("button", { name: "保存本機副本", exact: true }).click();
  await expect(storage(page).getByTestId("storage-notice")).toContainText("已保存此版本");
}
test.beforeEach(async ({ page }) => {
  page.on("dialog", dialog => { if (dialog.type() === "beforeunload") void dialog.accept(); else void dialog.dismiss(); });
  await page.goto("/");
});

test("PL01 主動保存兩方案與已確認行動，重整後手動恢復；其他同源分頁不自動共享", async ({ page, context }, testInfo) => {
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
  expect(await page.evaluate(async () => (await indexedDB.databases()).map(item => item.name))).toEqual([]);
  await golden(page);
  await makeScenario(page, 1, "0", "284.00");
  await makeScenario(page, 2, "20", "264.00");
  const factId = await makeAction(page);
  await openStorage(page);
  await expect(storage(page).getByRole("button", { name: "保存本機副本", exact: true })).toBeDisabled();
  const exported = JSON.parse(await backup(page));
  expect(exported.schema_version).toBe("profitlens-workspace-v3");
  expect(Object.keys(exported.payload.sources)).toEqual([exported.payload.active.source_hash]);
  expect(exported.payload.active).not.toHaveProperty("input");
  expect(exported.payload.active.filters.channels).toEqual(["DTC"]);
  expect(exported.payload.scenario_workspace.contexts[0].plans).toHaveLength(2);
  expect(exported.payload.action_workspace.items[0].card.fact_ids).toEqual([factId]);
  expect(exported.payload.action_workspace.items[0].card.evidence_confirmed).toBe(true);
  expect(exported.payload.scenario_workspace.contexts[0].plans[0]).not.toHaveProperty("result");
  expect(exported.payload.scenario_workspace.contexts[0]).not.toHaveProperty("baseline");
  expect(exported.payload.scenario_workspace.contexts[0].source_hash).toBe(exported.payload.active.source_hash);
  await saveLocal(page);
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(status(other)).toContainText("尚未載入資料");
  await page.reload();
  await expect(status(page)).toContainText("尚未載入資料");
  await openStorage(page);
  await storage(page).getByRole("button", { name: "讀取本機副本預覽", exact: true }).click();
  await expect(page.getByRole("region", { name: "工作區恢復預覽" })).toContainText("方案 2 個、行動 1 項");
  await expect(status(page)).toContainText("尚未載入資料");
  await storage(page).getByRole("button", { name: "套用備份並取代工作區", exact: true }).click();
  await expect(status(page)).toContainText("資料已就緒");
  await expect(page.getByLabel("通路", { exact: true })).toHaveValue("DTC");
  await expect(storage(page).getByLabel("我同意將工作區資料保存於這個瀏覽器（不自動保存）", { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: "情境試算", exact: true }).click();
  await expect(page.getByTestId("decision-freshness")).toContainText("使用目前快照");
  await expect(page.getByTestId("scenario-1").getByTestId("scenario-contribution")).toHaveText("284.00");
  await expect(page.getByTestId("scenario-2").getByTestId("scenario-contribution")).toHaveText("264.00");
  await page.getByRole("button", { name: "行動摘要", exact: true }).click();
  await expect(page.getByTestId("action-1")).toContainText("使用者已確認");
  await expect(page.getByTestId("action-1").getByLabel("問題", { exact: true })).toHaveValue("核對履約成本");
  await expect(page.getByTestId("action-1").getByLabel("本快照證據（可複選）", { exact: true })).toHaveValues([factId!]);
  await expect(status(other)).toContainText("尚未載入資料");
  await openStorage(page);
  await storage(page).getByRole("button", { name: "刪除本機副本並關閉保存", exact: true }).click();
  await expect(storage(page).getByTestId("storage-notice")).toContainText("已刪除");
  expect(await page.evaluate(async () => (await indexedDB.databases()).map(item => item.name))).toEqual([]);
  await expect(status(page)).toContainText("資料已就緒");
  expect(posts).toEqual([]);
  await page.screenshot({ path: resolve(`verification/review-v2-a-regression-${testInfo.project.name}-restored.png`), fullPage: true });
  await appendFile(resolve("verification/review-v2-a-regression-storage-browser.jsonl"), `${JSON.stringify({ project: testInfo.project.name, save_restore: "pass", sources: "synthetic golden", scenarios: ["284.00", "264.00"], action_evidence: "confirmed", auto_cross_tab_load: false, posts, indexeddb_deleted: true })}\n`);
  await other.close();
});

test("PL01 portable備份驗證後才套用；篡改／舊格式不取代目前資料，恢復撤銷保存同意", async ({ page }) => {
  await golden(page);
  const original = await backup(page);
  const tampered = JSON.parse(original); tampered.payload.sources[tampered.payload.active.source_hash].manifest.dataset_id = "tampered";
  await restoreFile(page, JSON.stringify(tampered));
  await expect(storage(page).getByRole("alert")).toContainText("無法恢復");
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("270.00");
  const old = JSON.parse(original); old.schema_version = "profitlens-workspace-v0";
  await restoreFile(page, JSON.stringify(old));
  await expect(storage(page).getByRole("alert")).toContainText("無法恢復");
  await storage(page).getByLabel("我同意將工作區資料保存於這個瀏覽器（不自動保存）", { exact: true }).check();
  await page.getByLabel("通路", { exact: true }).selectOption("MARKETPLACE");
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("-15.00");
  await restoreFile(page, original);
  await expect(page.getByRole("region", { name: "工作區恢復預覽" })).toBeVisible();
  await expect(page.getByLabel("通路", { exact: true })).toHaveValue("MARKETPLACE");
  await storage(page).getByRole("button", { name: "套用備份並取代工作區", exact: true }).click();
  await page.getByRole("dialog", { name: "替換前先儲存工作區" }).getByRole("button", { name: "不儲存並繼續", exact: true }).click();
  await expect(page.getByLabel("通路", { exact: true })).toHaveValue("DTC");
  await expect(storage(page).getByLabel("我同意將工作區資料保存於這個瀏覽器（不自動保存）", { exact: true })).not.toBeChecked();
});

test("PL01 清空提醒可取消；替換資料後歷史方案保存恢復不復活", async ({ page }) => {
  await golden(page); await makeScenario(page, 1, "0", "284.00");
  await page.getByRole("button", { name: "清空工作區", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "替換前先儲存工作區" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(page.getByTestId("scenario-1").getByTestId("scenario-contribution")).toHaveText("284.00");
  await page.getByRole("button", { name: "進階驗證", exact: true }).click();
  await page.getByLabel("資料集", { exact: true }).selectOption("golden");
  await page.getByRole("button", { name: "載入資料集", exact: true }).click();
  await dialog.getByRole("button", { name: "不儲存並繼續", exact: true }).click();
  await expect(status(page)).toContainText("資料已就緒");
  await page.getByLabel("通路", { exact: true }).selectOption("DTC");
  const saved = await backup(page);
  expect(JSON.parse(saved).payload.scenario_workspace.contexts[0].status).toBe("historical");
  await page.getByRole("button", { name: "清空工作區", exact: true }).click();
  await dialog.getByRole("button", { name: "不儲存並繼續", exact: true }).click();
  await expect(status(page)).toContainText("尚未載入資料");
  await restoreFile(page, saved);
  await storage(page).getByRole("button", { name: "套用備份並取代工作區", exact: true }).click();
  await page.getByRole("button", { name: "情境試算", exact: true }).click();
  await expect(page.getByTestId("decision-workbench")).toHaveCount(0);
  await page.getByText("歷史通路工作稿", { exact: true }).click();
  await expect(page.getByTestId("multi-scenario-workbench")).toContainText("歷史條件貢獻 284.00");
  await expect(page.getByRole("button", { name: "建立 DTC 方案工作區", exact: true })).toBeVisible();
  expect(JSON.parse(await backup(page)).payload.scenario_workspace.contexts[0].status).toBe("historical");
});

test("PL01 清空移除備份預覽、下載確認與本機保存同意；已保存副本僅可手動重讀", async ({ page }) => {
  await golden(page);
  const original = await backup(page);
  await saveLocal(page);
  await page.getByLabel("通路", { exact: true }).selectOption("MARKETPLACE");
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("-15.00");
  await restoreFile(page, original);
  await expect(page.getByRole("region", { name: "工作區恢復預覽" })).toBeVisible();
  await expect(storage(page).getByRole("button", { name: "已確認備份檔已保存", exact: true })).toBeVisible();
  await expect(storage(page).getByLabel("我同意將工作區資料保存於這個瀏覽器（不自動保存）", { exact: true })).toBeChecked();
  await page.getByRole("button", { name: "清空工作區", exact: true }).click();
  await page.getByRole("dialog", { name: "替換前先儲存工作區" }).getByRole("button", { name: "不儲存並繼續", exact: true }).click();
  await expect(status(page)).toContainText("尚未載入資料");
  await openStorage(page);
  await expect(page.getByRole("region", { name: "工作區恢復預覽" })).toHaveCount(0);
  await expect(storage(page).getByRole("button", { name: "已確認備份檔已保存", exact: true })).toHaveCount(0);
  await expect(storage(page).getByLabel("我同意將工作區資料保存於這個瀏覽器（不自動保存）", { exact: true })).not.toBeChecked();
  await expect(storage(page).getByRole("button", { name: "保存本機副本", exact: true })).toBeDisabled();
  await storage(page).getByRole("button", { name: "讀取本機副本預覽", exact: true }).click();
  await expect(page.getByRole("region", { name: "工作區恢復預覽" })).toContainText("golden-v1");
  await expect(status(page)).toContainText("尚未載入資料");
});
