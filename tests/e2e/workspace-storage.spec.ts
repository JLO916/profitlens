import { WORKSPACE_VERSION } from "../../src/application/workspace-backup";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { startChannelContext, switchActionsView } from "./replacement-helpers";

// R2: every visible string comes from labels; machine values (dataset ids, channel codes, amounts, testids) stay literal.
// 長流程（兩方案＋行動＋保存／重整／恢復）在平板曾跑到 40 秒；比照 scenarios.spec 放寬單一案例的時間上限，斷言不變。
test.describe.configure({ timeout: 90_000 });
const storageCopy = labels.ui.workspaceStorage;
const replacementCopy = labels.ui.replacementDialog;
const scenarioCopy = labels.ui.multiScenarioWorkbench;
const contributionLabel = labels.metrics.contribution_after_marketing.label;
/** Mirrors multi-scenario-workbench's template(): only the body before a full-width parenthesis is used. */
const scenarioTemplate = (text: string) => text.split("（")[0];
const replacementDialog = (page: Page) => page.getByRole("dialog", { name: replacementCopy.heading });
const restorePreview = (page: Page) => page.getByRole("region", { name: storageCopy.restorePreviewAria });

const storage = (page: Page) => page.getByTestId("workspace-storage");
const status = (page: Page) => page.getByTestId("workspace-status");
async function openStorage(page: Page) {
  if ((await storage(page).getAttribute("open")) === null) await storage(page).locator(":scope > summary").click();
}
async function golden(page: Page) {
  await page.getByRole("button", { name: labels.nav.validation.label, exact: true }).click();
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption("golden");
  await page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }).click();
  await expect(status(page)).toContainText(labels.status.ready);
  await page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).selectOption("DTC");
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("270.00");
}
/** R5：試算頁進頁即表單（方案 1 是本地草稿），第二個方案起才按「新增方案」；通路預設＝全站單一通路 DTC。 */
async function makeScenario(page: Page, index: number, cost: string, expected: string) {
  await page.getByRole("button", { name: labels.nav.scenarios.label, exact: true }).click();
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("DTC");
  if (index > 1) await page.getByRole("button", { name: labels.buttons.addScenario, exact: true }).click();
  const card = page.getByTestId(`scenario-${index}`);
  await card.getByLabel(labels.ui.decisionWorkbench.planName, { exact: true }).fill(`保存方案 ${index}`);
  const values = { [labels.scenario.volume.label]: "0", [labels.scenario.discount.label]: "0", [labels.scenario.fulfillmentUnit.label]: "-10", [labels.scenario.adSpend.label]: "0", [labels.scenario.oneOff.label]: cost };
  for (const [label, value] of Object.entries(values)) await card.getByLabel(label, { exact: true }).fill(value);
  await card.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).check();
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText(expected);
}
async function makeAction(page: Page) {
  await page.getByRole("button", { name: labels.nav.actions.label, exact: true }).click();
  await switchActionsView(page, "list");
  await page.getByRole("button", { name: labels.buttons.addAction, exact: true }).click();
  const card = page.getByTestId("action-1");
  const fields = { [labels.actions.problem]: "核對履約成本", [labels.actions.step]: "取得物流報價與服務條款", [labels.actions.owner]: "營運主管", [labels.actions.metric]: "本期履約費用", [labels.actions.due]: "2026-10-15", [labels.actions.stop]: "服務品質下降即停止", [labels.actions.extraData]: "物流合約" };
  for (const [label, value] of Object.entries(fields)) await card.getByLabel(label, { exact: true }).fill(value);
  // R5：證據改為 checkbox 清單（fieldset role=group）。
  const factText = fill(labels.ui.actionsWorkbench.factLabel, { start: "2026-08-02", end: "2026-08-02", metric: contributionLabel, scope: "DTC", scopeKind: labels.csvColumns.channel, value: "270.00" });
  const box = evidenceList(card).getByRole("checkbox", { name: factText, exact: true });
  const value = await box.getAttribute("value");
  expect(value).toBeTruthy();
  await box.check();
  await card.getByRole("button", { name: labels.buttons.confirm, exact: true }).click();
  await expect(card).toContainText(labels.ui.actionsWorkbench.tagConfirmed);
  return value;
}
const evidenceList = (card: Locator) => card.getByRole("group", { name: labels.ui.actionsWorkbench.evidencePicker, exact: true });
const checkedEvidence = (card: Locator) => evidenceList(card).locator("input[type=checkbox]:checked").evaluateAll(inputs => inputs.map(input => (input as HTMLInputElement).value));
async function backup(page: Page) {
  await openStorage(page);
  const [file] = await Promise.all([page.waitForEvent("download"), storage(page).getByRole("button", { name: labels.buttons.downloadBackup, exact: true }).click()]);
  expect(file.suggestedFilename()).toBe("profitlens-workspace.json");
  return readFile((await file.path())!, "utf8");
}
async function restoreFile(page: Page, text: string) {
  await openStorage(page);
  await storage(page).getByLabel(storageCopy.selectBackupFile, { exact: true }).setInputFiles({ name: "workspace.json", mimeType: "application/json", buffer: Buffer.from(text) });
}
async function saveLocal(page: Page) {
  await openStorage(page);
  await storage(page).getByLabel(storageCopy.consent, { exact: true }).check();
  await storage(page).getByRole("button", { name: labels.buttons.saveLocal, exact: true }).click();
  await expect(storage(page).getByTestId("storage-notice")).toContainText(storageCopy.savedLocalNotice);
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
  await expect(storage(page).getByRole("button", { name: labels.buttons.saveLocal, exact: true })).toBeDisabled();
  const exported = JSON.parse(await backup(page));
  expect(exported.schema_version).toBe(WORKSPACE_VERSION);
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
  await expect(status(other)).toContainText(labels.status.empty);
  await page.reload();
  await expect(status(page)).toContainText(labels.status.empty);
  await openStorage(page);
  await storage(page).getByRole("button", { name: labels.buttons.restorePreview, exact: true }).click();
  await expect(restorePreview(page)).toContainText(fill(storageCopy.restoreCounts, { plans: 2, actions: 1 }));
  await expect(status(page)).toContainText(labels.status.empty);
  await storage(page).getByRole("button", { name: storageCopy.applyRestore, exact: true }).click();
  await expect(status(page)).toContainText(labels.status.ready);
  await expect(page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true })).toHaveValue("DTC");
  await expect(storage(page).getByLabel(storageCopy.consent, { exact: true })).not.toBeChecked();
  await page.getByRole("button", { name: labels.nav.scenarios.label, exact: true }).click();
  await expect(page.getByTestId("decision-freshness")).toContainText(labels.ui.decisionWorkbench.freshTitle);
  await expect(page.getByTestId("scenario-1").getByTestId("scenario-contribution")).toHaveText("284.00");
  await expect(page.getByTestId("scenario-2").getByTestId("scenario-contribution")).toHaveText("264.00");
  await page.getByRole("button", { name: labels.nav.actions.label, exact: true }).click();
  // 備份 ui_prefs.view 記住了清單檢視（R5），恢復後直接是清單。
  await expect(page.getByTestId("actions-view-list")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("action-1")).toContainText(labels.ui.actionsWorkbench.tagConfirmed);
  await expect(page.getByTestId("action-1").getByLabel(labels.actions.problem, { exact: true })).toHaveValue("核對履約成本");
  expect(await checkedEvidence(page.getByTestId("action-1"))).toEqual([factId!]);
  await expect(status(other)).toContainText(labels.status.empty);
  await openStorage(page);
  await storage(page).getByRole("button", { name: labels.buttons.deleteLocal, exact: true }).click();
  await expect(storage(page).getByTestId("storage-notice")).toContainText(storageCopy.deletedNotice);
  expect(await page.evaluate(async () => (await indexedDB.databases()).map(item => item.name))).toEqual([]);
  await expect(status(page)).toContainText(labels.status.ready);
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
  await expect(storage(page).getByRole("alert")).toContainText(storageCopy.invalidBackupError);
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("270.00");
  const old = JSON.parse(original); old.schema_version = "profitlens-workspace-v0";
  await restoreFile(page, JSON.stringify(old));
  await expect(storage(page).getByRole("alert")).toContainText(storageCopy.invalidBackupError);
  await storage(page).getByLabel(storageCopy.consent, { exact: true }).check();
  await page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).selectOption("MARKETPLACE");
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("-15.00");
  await restoreFile(page, original);
  await expect(restorePreview(page)).toBeVisible();
  await expect(page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true })).toHaveValue("MARKETPLACE");
  await storage(page).getByRole("button", { name: storageCopy.applyRestore, exact: true }).click();
  await replacementDialog(page).getByRole("button", { name: replacementCopy.discardAndContinue, exact: true }).click();
  await expect(page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true })).toHaveValue("DTC");
  await expect(storage(page).getByLabel(storageCopy.consent, { exact: true })).not.toBeChecked();
});

test("PL01 清空提醒可取消；替換資料後歷史方案保存恢復不復活", async ({ page }) => {
  await golden(page); await makeScenario(page, 1, "0", "284.00");
  await page.getByRole("button", { name: labels.buttons.clear, exact: true }).click();
  const dialog = replacementDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: labels.buttons.cancel, exact: true }).click();
  await expect(page.getByTestId("scenario-1").getByTestId("scenario-contribution")).toHaveText("284.00");
  await page.getByRole("button", { name: labels.nav.validation.label, exact: true }).click();
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption("golden");
  await page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }).click();
  await dialog.getByRole("button", { name: replacementCopy.discardAndContinue, exact: true }).click();
  await expect(status(page)).toContainText(labels.status.ready);
  await page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).selectOption("DTC");
  const saved = await backup(page);
  expect(JSON.parse(saved).payload.scenario_workspace.contexts[0].status).toBe("historical");
  await page.getByRole("button", { name: labels.buttons.clear, exact: true }).click();
  await dialog.getByRole("button", { name: replacementCopy.discardAndContinue, exact: true }).click();
  await expect(status(page)).toContainText(labels.status.empty);
  await restoreFile(page, saved);
  await storage(page).getByRole("button", { name: storageCopy.applyRestore, exact: true }).click();
  await page.getByRole("button", { name: labels.nav.scenarios.label, exact: true }).click();
  // R5 進頁即表單：目前通路只有一個未計算的本地草稿「方案 1」，歷史方案不會被復活成目前方案。
  await startChannelContext(page);
  const draft = page.getByTestId("scenario-1");
  await expect(draft.getByLabel(labels.ui.decisionWorkbench.planName, { exact: true })).toHaveValue(fill(labels.ui.decisionWorkbench.defaultPlanName, { n: 1 }));
  await expect(draft.getByTestId("scenario-draft")).toHaveText(labels.scenario.draft);
  await expect(draft.getByTestId("scenario-contribution")).toHaveCount(0);
  await expect(page.getByTestId("scenario-2")).toHaveCount(0);
  await page.getByText(scenarioCopy.historyHeading, { exact: true }).click();
  await expect(page.getByTestId("multi-scenario-workbench")).toContainText(fill(scenarioTemplate(scenarioCopy.historyPlanSummary), { plan: "保存方案 1", resultLabel: labels.scenario.resultTitle, amount: "284.00" }));
  // 要沿用只能明確按「複製到目前方案」。
  await expect(page.getByRole("button", { name: scenarioCopy.copyToCurrent, exact: true })).toBeVisible();
  // 只是打開試算頁不會寫入新的方案範圍：備份仍只有那一個歷史範圍。
  const reread = JSON.parse(await backup(page)).payload.scenario_workspace.contexts;
  expect(reread).toHaveLength(1);
  expect(reread[0].status).toBe("historical");
});

test("PL01 清空移除備份預覽、下載確認與本機保存同意；已保存副本僅可手動重讀", async ({ page }) => {
  await golden(page);
  const original = await backup(page);
  await saveLocal(page);
  await page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).selectOption("MARKETPLACE");
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("-15.00");
  await restoreFile(page, original);
  await expect(restorePreview(page)).toBeVisible();
  await expect(storage(page).getByRole("button", { name: storageCopy.confirmDownloaded, exact: true })).toBeVisible();
  await expect(storage(page).getByLabel(storageCopy.consent, { exact: true })).toBeChecked();
  await page.getByRole("button", { name: labels.buttons.clear, exact: true }).click();
  await replacementDialog(page).getByRole("button", { name: replacementCopy.discardAndContinue, exact: true }).click();
  await expect(status(page)).toContainText(labels.status.empty);
  await openStorage(page);
  await expect(restorePreview(page)).toHaveCount(0);
  await expect(storage(page).getByRole("button", { name: storageCopy.confirmDownloaded, exact: true })).toHaveCount(0);
  await expect(storage(page).getByLabel(storageCopy.consent, { exact: true })).not.toBeChecked();
  await expect(storage(page).getByRole("button", { name: labels.buttons.saveLocal, exact: true })).toBeDisabled();
  await storage(page).getByRole("button", { name: labels.buttons.restorePreview, exact: true }).click();
  await expect(restorePreview(page)).toContainText("golden-v1");
  await expect(status(page)).toContainText(labels.status.empty);
});
