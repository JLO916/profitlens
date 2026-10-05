import { WORKSPACE_VERSION } from "../../src/application/workspace-backup";
import { formatSavedDateTime, formatSavedTime } from "../../src/application/auto-save";
import { appendFile, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test, expect, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { acceptSavePrompt, dismissSavePrompt, openValidation, startChannelContext, switchActionsView } from "./replacement-helpers";

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
/** Ready status reads fill(status.ready, { date: manifest.data_as_of }) (dashboard.tsx statusText); every flow here uses golden (fixtures/golden/manifest.json data_as_of). */
const goldenReady = fill(labels.status.ready, { date: "2026-08-03" });
const autoCopy = labels.autoSave;
// R6（D7＝A）：首次載入資料時的非 modal 保存提示、儲存選單內的自動保存狀態、頂欄「儲存」tag。
const savePrompt = (page: Page) => page.getByTestId("local-save-prompt");
const autoStatus = (page: Page) => storage(page).getByTestId("autosave-status");
const savedTag = (page: Page) => storage(page).locator(":scope > summary .tag");
const consentBox = (page: Page) => storage(page).getByLabel(storageCopy.consent, { exact: true });
/** 同意後才出現的「自動保存」開關（預設勾選；取消＝維持手動「存在這台電腦」）。 */
const autoToggle = (page: Page) => storage(page).getByTestId("autosave-toggle");
const announce = (page: Page) => page.getByTestId("local-save-announce");
/** 本機副本目前保存的通路篩選（沒有副本時 null）。 */
const savedChannels = async (page: Page) => { const copy = await readLocalCopy(page); return copy ? JSON.parse(copy.text).payload.active.filters.channels as string[] : null; };
const kpiContribution = (page: Page) => page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value");
const channelFilter = (page: Page) => page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true });
/** 還原預覽摘要的通路片段（labels 模板「… · 通路 {channels}」最後一段）。 */
const restoreChannels = (channels: string) => fill(storageCopy.restoreSummary.split(" · ").at(-1)!, { channels });
const LOCAL_DB = "profitlens-opt-in-workspace-v1";
const localDatabases = (page: Page) => page.evaluate(async () => (await indexedDB.databases()).map(item => item.name));
/**
 * 直接讀 IndexedDB 的本機副本（store "workspace" 的 explicitly-saved／explicitly-saved-at）。
 * 先用 databases() 確認資料庫存在，避免 indexedDB.open 替不存在的資料庫建一個空的 v1。
 */
async function readLocalCopy(page: Page): Promise<{ text: string; savedAt: string } | null> {
  return page.evaluate(async name => {
    if (!(await indexedDB.databases()).some(item => item.name === name)) return null;
    return new Promise<{ text: string; savedAt: string } | null>((done, fail) => {
      const request = indexedDB.open(name);
      request.onerror = () => fail(request.error);
      request.onsuccess = () => {
        const database = request.result;
        if (!database.objectStoreNames.contains("workspace")) { database.close(); done(null); return; }
        const transaction = database.transaction("workspace", "readonly");
        const store = transaction.objectStore("workspace");
        const text = store.get("explicitly-saved"), savedAt = store.get("explicitly-saved-at");
        transaction.oncomplete = () => { database.close(); done(typeof text.result === "string" && typeof savedAt.result === "string" ? { text: text.result, savedAt: savedAt.result } : null); };
        transaction.onerror = () => { database.close(); fail(transaction.error); };
      };
    });
  }, LOCAL_DB);
}
/** 等到本機副本的保存時間和 previous 不同（previous＝null 表示等第一次保存），回傳新的副本。 */
async function waitForLocalSave(page: Page, previous: string | null) {
  await expect.poll(async () => (await readLocalCopy(page))?.savedAt ?? null, { timeout: 15_000 }).not.toBe(previous);
  return (await readLocalCopy(page))!;
}
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 頂欄 tag「已保存 hh:mm」（臺北時間）。畫面時間在寫入完成後才取，跨分鐘邊界時允許下一分鐘。 */
function savedTimes(savedAt: string) {
  const at = Date.parse(savedAt);
  return [...new Set([formatSavedTime(new Date(at)), formatSavedTime(new Date(at + 5_000))])];
}
const savedTagPattern = (savedAt: string) => new RegExp(`^(${savedTimes(savedAt).map(time => escapeRegExp(fill(labels.status.savedAt, { time }))).join("|")})$`);
const lastSavedPattern = (savedAt: string) => new RegExp(`(${savedTimes(savedAt).map(time => escapeRegExp(fill(autoCopy.lastSaved, { time }))).join("|")})`);
async function openStorage(page: Page) {
  if ((await storage(page).getAttribute("open")) === null) await storage(page).locator(":scope > summary").click();
}
async function golden(page: Page) {
  await openValidation(page);
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption("golden");
  await page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }).click();
  await expect(status(page)).toContainText(goldenReady);
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
/** 勾選同意並手動「存在這台電腦」；R6 起手動保存的通知改為 labels.autoSave.savedLocalNotice（勾選後之後的修改會自動保存）。 */
async function saveLocal(page: Page) {
  await openStorage(page);
  await consentBox(page).check();
  await storage(page).getByRole("button", { name: labels.buttons.saveLocal, exact: true }).click();
  await expect(storage(page).getByTestId("storage-notice")).toContainText(autoCopy.savedLocalNotice);
  const saved = (await readLocalCopy(page))!;
  expect(saved).not.toBeNull();
  await expect(savedTag(page)).toHaveText(savedTagPattern(saved.savedAt));
  return saved;
}
test.beforeEach(async ({ page }) => {
  page.on("dialog", dialog => { if (dialog.type() === "beforeunload") void dialog.accept(); else void dialog.dismiss(); });
  await page.goto("/");
});

test("PL01 主動保存兩方案與已確認行動，重整後手動恢復；其他同源分頁不自動共享", async ({ page, context }, testInfo) => {
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
  expect(await localDatabases(page)).toEqual([]);
  await golden(page);
  // R6：首次載入資料出現保存提示；本案例測「主動保存＋手動恢復」，先選「先不要」。
  await expect(savePrompt(page)).toBeVisible();
  await dismissSavePrompt(page);
  await expect(savePrompt(page)).toHaveCount(0);
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
  const saved = await saveLocal(page);
  const other = await context.newPage();
  await other.goto(page.url());
  await expect(status(other)).toContainText(labels.status.empty);
  await expect(savePrompt(other)).toHaveCount(0);
  await page.reload();
  await expect(status(page)).toContainText(labels.status.empty);
  // 沒有資料時不問；重整後也不會自動讀回本機副本。
  await expect(savePrompt(page)).toHaveCount(0);
  await openStorage(page);
  await storage(page).getByRole("button", { name: labels.buttons.restorePreview, exact: true }).click();
  await expect(restorePreview(page)).toContainText(fill(storageCopy.restoreCounts, { plans: 2, actions: 1 }));
  await expect(status(page)).toContainText(labels.status.empty);
  await storage(page).getByRole("button", { name: storageCopy.applyRestore, exact: true }).click();
  await expect(status(page)).toContainText(goldenReady);
  await expect(page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true })).toHaveValue("DTC");
  await expect(storage(page).getByLabel(storageCopy.consent, { exact: true })).not.toBeChecked();
  // R6：恢復後同意重設為未勾選（自動保存關閉），保存提示再出現，並提醒這台電腦已有保存的工作區。
  await expect(autoStatus(page)).toHaveText(autoCopy.statusOff);
  await expect(savePrompt(page)).toBeVisible();
  await expect(savePrompt(page).getByTestId("local-save-replace-warning")).toHaveText(fill(autoCopy.replaceWarning, { time: formatSavedDateTime(new Date(saved.savedAt)) }));
  await dismissSavePrompt(page);
  await expect(savePrompt(page)).toHaveCount(0);
  expect((await readLocalCopy(page))!.savedAt).toBe(saved.savedAt);
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
  expect(await localDatabases(page)).toEqual([]);
  await expect(status(page)).toContainText(goldenReady);
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
  // R6：勾選同意＝開啟自動保存（勾選也算回答了保存提示）。
  await expect(autoStatus(page)).toContainText(autoCopy.statusOn);
  await expect(savePrompt(page)).toHaveCount(0);
  await page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).selectOption("MARKETPLACE");
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("-15.00");
  // 已同意＝修改在 2 秒內自動保存：等 MARKETPLACE 這一版存好（頂欄「已保存 hh:mm」），之後的恢復沒有未保存的修改要確認。
  await expect.poll(async () => { const copy = await readLocalCopy(page); return copy ? JSON.parse(copy.text).payload.active.filters.channels : null; }, { timeout: 15_000 }).toEqual(["MARKETPLACE"]);
  const autosaved = (await readLocalCopy(page))!;
  await expect(savedTag(page)).toHaveText(savedTagPattern(autosaved.savedAt));
  await restoreFile(page, original);
  await expect(restorePreview(page)).toBeVisible();
  await expect(restorePreview(page)).not.toContainText(storageCopy.unsavedWarning);
  await expect(page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true })).toHaveValue("MARKETPLACE");
  await storage(page).getByRole("button", { name: storageCopy.applyRestore, exact: true }).click();
  await expect(page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true })).toHaveValue("DTC");
  await expect(replacementDialog(page)).toHaveCount(0);
  await expect(storage(page).getByLabel(storageCopy.consent, { exact: true })).not.toBeChecked();
  await expect(autoStatus(page)).toHaveText(autoCopy.statusOff);
  // 恢復撤銷同意後不再自動保存：本機副本停在恢復前自動保存的那一版。
  await page.waitForTimeout(3_000);
  expect((await readLocalCopy(page))!.savedAt).toBe(autosaved.savedAt);
});

test("PL01 清空提醒可取消；替換資料後歷史方案保存恢復不復活", async ({ page }) => {
  await golden(page); await dismissSavePrompt(page); await makeScenario(page, 1, "0", "284.00");
  await page.getByRole("button", { name: labels.buttons.clear, exact: true }).click();
  const dialog = replacementDialog(page);
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: labels.buttons.cancel, exact: true }).click();
  await expect(page.getByTestId("scenario-1").getByTestId("scenario-contribution")).toHaveText("284.00");
  await openValidation(page);
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption("golden");
  await page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }).click();
  await dialog.getByRole("button", { name: replacementCopy.discardAndContinue, exact: true }).click();
  await expect(status(page)).toContainText(goldenReady);
  await page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).selectOption("DTC");
  const saved = await backup(page);
  expect(JSON.parse(saved).payload.scenario_workspace.contexts[0].status).toBe("historical");
  await page.getByRole("button", { name: labels.buttons.clear, exact: true }).click();
  await dialog.getByRole("button", { name: replacementCopy.discardAndContinue, exact: true }).click();
  await expect(status(page)).toContainText(labels.status.empty);
  await restoreFile(page, saved);
  await storage(page).getByRole("button", { name: storageCopy.applyRestore, exact: true }).click();
  await expect(status(page)).toContainText(goldenReady);
  // R6：清空後儲存面板重掛，恢復出的工作區尚未同意本機保存 → 保存提示再出現；本案例不測保存，選「先不要」。
  await expect(savePrompt(page)).toBeVisible();
  await dismissSavePrompt(page);
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
  await dismissSavePrompt(page);
  const original = await backup(page);
  const manual = await saveLocal(page);
  expect(JSON.parse(manual.text).payload.active.filters.channels).toEqual(["DTC"]);
  await page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).selectOption("MARKETPLACE");
  await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText("-15.00");
  // R6：已同意本機保存，修改會在 2 秒內自動覆寫本機副本；等自動保存寫完，副本停在 MARKETPLACE 這一版再往下驗。
  const autosaved = await waitForLocalSave(page, manual.savedAt);
  expect(JSON.parse(autosaved.text).payload.active.filters.channels).toEqual(["MARKETPLACE"]);
  await expect(savedTag(page)).toHaveText(savedTagPattern(autosaved.savedAt));
  await restoreFile(page, original);
  await expect(restorePreview(page)).toBeVisible();
  await expect(storage(page).getByRole("button", { name: storageCopy.confirmDownloaded, exact: true })).toBeVisible();
  await expect(storage(page).getByLabel(storageCopy.consent, { exact: true })).toBeChecked();
  // R6：修改已自動保存（沒有未保存的變更），清空不再跳「替換前先儲存」提醒，直接清空。
  await page.getByRole("button", { name: labels.buttons.clear, exact: true }).click();
  await expect(status(page)).toContainText(labels.status.empty);
  await expect(replacementDialog(page)).toHaveCount(0);
  await openStorage(page);
  await expect(restorePreview(page)).toHaveCount(0);
  await expect(storage(page).getByRole("button", { name: storageCopy.confirmDownloaded, exact: true })).toHaveCount(0);
  await expect(storage(page).getByLabel(storageCopy.consent, { exact: true })).not.toBeChecked();
  await expect(storage(page).getByRole("button", { name: labels.buttons.saveLocal, exact: true })).toBeDisabled();
  await expect(autoStatus(page)).toHaveText(autoCopy.statusOff);
  // 清空不刪除也不改寫本機副本；只能手動重讀，讀到的是自動保存的最後一版（MARKETPLACE）。
  expect((await readLocalCopy(page))!.savedAt).toBe(autosaved.savedAt);
  await storage(page).getByRole("button", { name: labels.buttons.restorePreview, exact: true }).click();
  await expect(restorePreview(page)).toContainText("golden-v1");
  await expect(restorePreview(page)).toContainText(restoreChannels("MARKETPLACE"));
  await expect(status(page)).toContainText(labels.status.empty);
  await expect(savePrompt(page)).toHaveCount(0);
});

test("R6 首次保存提示：先不要維持手動保存、不建立本機資料庫；清空後再載入會再問一次，Esc 等於先不要", async ({ page }) => {
  expect(await localDatabases(page)).toEqual([]);
  await golden(page);
  const prompt = savePrompt(page);
  await expect(page.getByRole("dialog", { name: autoCopy.promptTitle, exact: true })).toBeVisible();
  await expect(prompt).not.toHaveAttribute("aria-modal", "true");
  await expect(prompt).toContainText(autoCopy.promptBody);
  // 提示 portal 到 <body> 最後（在 main 之後，Tab 順序排在頁面內容後面）；出現時由 polite live region 宣告。
  expect(await prompt.evaluate(element => element.parentElement === document.body && Boolean(document.querySelector("main")!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(announce(page)).toHaveText(autoCopy.announce);
  await expect(announce(page)).toHaveAttribute("role", "status");
  // 共享電腦提醒只在同意對話框內（05 §12），儲存選單裡沒有；這台電腦沒有保存過，所以沒有「會改存」提醒。
  await expect(prompt).toContainText(storageCopy.caution);
  await expect(storage(page)).not.toContainText(storageCopy.caution);
  await expect(prompt.getByTestId("local-save-replace-warning")).toHaveCount(0);
  // 提示開著也不讀寫本機資料庫。
  expect(await localDatabases(page)).toEqual([]);
  await prompt.getByRole("button", { name: autoCopy.decline, exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(announce(page)).toHaveText("");
  await openStorage(page);
  await expect(consentBox(page)).not.toBeChecked();
  await expect(autoStatus(page)).toHaveText(autoCopy.statusOff);
  // 沒同意就沒有自動保存開關。
  await expect(autoToggle(page)).toHaveCount(0);
  await expect(storage(page).getByRole("button", { name: labels.buttons.saveLocal, exact: true })).toBeDisabled();
  await channelFilter(page).selectOption("MARKETPLACE");
  await expect(kpiContribution(page)).toHaveText("-15.00");
  // 超過 2 秒的自動保存間隔：維持手動，不建立資料庫、不標已保存，也不再問一次。
  await page.waitForTimeout(3_000);
  expect(await localDatabases(page)).toEqual([]);
  await expect(savedTag(page)).toHaveText(labels.status.unsaved);
  await expect(prompt).toHaveCount(0);
  // 清空工作區後（儲存面板重掛）再載入資料會再問；在提示內按 Esc 等於「先不要」。
  await page.getByRole("button", { name: labels.buttons.clear, exact: true }).click();
  await replacementDialog(page).getByRole("button", { name: replacementCopy.discardAndContinue, exact: true }).click();
  await expect(status(page)).toContainText(labels.status.empty);
  await expect(prompt).toHaveCount(0);
  await golden(page);
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: autoCopy.decline, exact: true }).focus();
  await page.keyboard.press("Escape");
  await expect(prompt).toHaveCount(0);
  await openStorage(page);
  await expect(consentBox(page)).not.toBeChecked();
  await expect(autoStatus(page)).toHaveText(autoCopy.statusOff);
  await page.waitForTimeout(3_000);
  expect(await localDatabases(page)).toEqual([]);
});

test("R6 自動保存：按「存在這台電腦」3 秒內寫入 v4 備份，再修改一次 3 秒內更新；頂欄顯示已保存 hh:mm，刪除本機資料即停止", async ({ page }) => {
  const posts: string[] = [];
  page.on("request", request => { if (request.method() === "POST") posts.push(request.url()); });
  await golden(page);
  expect(await localDatabases(page)).toEqual([]);
  await expect(savedTag(page)).toHaveText(labels.status.unsaved);
  // 「存在這台電腦」同時是提示框按鈕與儲存選單內的手動按鈕：acceptSavePrompt 只在提示框內找。
  const acceptedAt = await page.evaluate(() => Date.now());
  await acceptSavePrompt(page);
  await expect(savePrompt(page)).toHaveCount(0);
  const first = await waitForLocalSave(page, null);
  // 3 秒內：以 App 寫進 explicitly-saved-at 的時間計（不受測試輪詢延遲影響）。
  expect(Date.parse(first.savedAt) - acceptedAt).toBeLessThanOrEqual(3_000);
  const firstBackup = JSON.parse(first.text);
  expect(firstBackup.schema_version).toBe(WORKSPACE_VERSION);
  expect(Array.isArray(firstBackup.payload.meeting_history)).toBe(true);
  expect(firstBackup.payload.active.filters.channels).toEqual(["DTC"]);
  await expect(savedTag(page)).toHaveText(savedTagPattern(first.savedAt));
  await openStorage(page);
  await expect(consentBox(page)).toBeChecked();
  await expect(autoStatus(page)).toContainText(autoCopy.statusOn);
  await expect(autoStatus(page)).toContainText(lastSavedPattern(first.savedAt));
  // 再改一次（換通路）：2 秒 debounce 後自動保存，副本與保存時間都更新。
  const changedAt = await page.evaluate(() => Date.now());
  await channelFilter(page).selectOption("MARKETPLACE");
  await expect(kpiContribution(page)).toHaveText("-15.00");
  const second = await waitForLocalSave(page, first.savedAt);
  expect(Date.parse(second.savedAt)).toBeGreaterThan(Date.parse(first.savedAt));
  expect(Date.parse(second.savedAt) - changedAt).toBeLessThanOrEqual(3_000);
  const secondBackup = JSON.parse(second.text);
  expect(secondBackup.schema_version).toBe(WORKSPACE_VERSION);
  expect(Array.isArray(secondBackup.payload.meeting_history)).toBe(true);
  expect(secondBackup.payload.active.filters.channels).toEqual(["MARKETPLACE"]);
  await expect(savedTag(page)).toHaveText(savedTagPattern(second.savedAt));
  await expect(autoStatus(page)).toContainText(lastSavedPattern(second.savedAt));
  // 「刪除本機資料」保留：刪掉資料庫並關閉自動保存，之後的修改不會再寫回。
  await storage(page).getByRole("button", { name: labels.buttons.deleteLocal, exact: true }).click();
  await expect(storage(page).getByTestId("storage-notice")).toContainText(storageCopy.deletedNotice);
  expect(await localDatabases(page)).toEqual([]);
  await expect(consentBox(page)).not.toBeChecked();
  await expect(autoStatus(page)).toHaveText(autoCopy.statusOff);
  await channelFilter(page).selectOption("DTC");
  await expect(kpiContribution(page)).toHaveText("270.00");
  await page.waitForTimeout(3_000);
  expect(await localDatabases(page)).toEqual([]);
  await expect(savedTag(page)).toHaveText(labels.status.unsaved);
  expect(posts).toEqual([]);
});

test("R6 自動保存開關：同意後預設開啟，取消後修改不再自動寫入、手動「存在這台電腦」仍可用；重新勾選後照常自動保存", async ({ page }) => {
  await golden(page);
  await acceptSavePrompt(page);
  const first = await waitForLocalSave(page, null);
  expect(JSON.parse(first.text).payload.active.filters.channels).toEqual(["DTC"]);
  await openStorage(page);
  await expect(consentBox(page)).toBeChecked();
  await expect(autoToggle(page)).toBeChecked();
  await expect(storage(page).getByRole("checkbox", { name: autoCopy.toggle, exact: true })).toBeChecked();
  await expect(autoStatus(page)).toContainText(autoCopy.statusOn);
  // 取消自動保存：狀態改「未開啟自動保存」，同意仍勾著（手動保存可用）。
  await autoToggle(page).uncheck();
  await expect(autoToggle(page)).not.toBeChecked();
  await expect(autoStatus(page)).toContainText(autoCopy.statusOff);
  await expect(consentBox(page)).toBeChecked();
  await channelFilter(page).selectOption("MARKETPLACE");
  await expect(kpiContribution(page)).toHaveText("-15.00");
  await expect(savedTag(page)).toHaveText(labels.status.unsaved);
  // 超過 2 秒的自動保存間隔（等 3 秒）：本機副本不更新。
  await page.waitForTimeout(3_000);
  expect((await readLocalCopy(page))!.savedAt).toBe(first.savedAt);
  expect(await savedChannels(page)).toEqual(["DTC"]);
  await expect(savedTag(page)).toHaveText(labels.status.unsaved);
  // 手動「存在這台電腦」：寫入目前這一版，通知說明自動保存已關閉。
  await openStorage(page);
  await storage(page).getByRole("button", { name: labels.buttons.saveLocal, exact: true }).click();
  await expect(storage(page).getByTestId("storage-notice")).toHaveText(autoCopy.savedLocalManualNotice);
  const manual = await waitForLocalSave(page, first.savedAt);
  expect(JSON.parse(manual.text).payload.active.filters.channels).toEqual(["MARKETPLACE"]);
  await expect(savedTag(page)).toHaveText(savedTagPattern(manual.savedAt));
  await expect(autoStatus(page)).toContainText(autoCopy.statusOff);
  // 之後的修改仍維持手動：3 秒內不寫入。
  await channelFilter(page).selectOption("DTC");
  await expect(kpiContribution(page)).toHaveText("270.00");
  await page.waitForTimeout(3_000);
  expect((await readLocalCopy(page))!.savedAt).toBe(manual.savedAt);
  // 重新勾選自動保存：未保存的修改在 2 秒內寫入。
  await openStorage(page);
  await autoToggle(page).check();
  await expect(autoStatus(page)).toContainText(autoCopy.statusOn);
  const resumed = await waitForLocalSave(page, manual.savedAt);
  expect(JSON.parse(resumed.text).payload.active.filters.channels).toEqual(["DTC"]);
  await expect(savedTag(page)).toHaveText(savedTagPattern(resumed.savedAt));
});

test("R6 在儲存選單勾選同意而這台電腦已有副本：先顯示覆寫提醒、確認前不自動保存；按「改存成目前的工作區」後寫入並照常自動保存", async ({ page }) => {
  await golden(page);
  await acceptSavePrompt(page);
  const first = await waitForLocalSave(page, null);
  expect(JSON.parse(first.text).payload.active.filters.channels).toEqual(["DTC"]);
  // 重新整理：工作區清空、同意重設；再載入資料時提示提醒這台電腦已有副本，這次選「先不要」。
  await page.reload();
  await expect(status(page)).toContainText(labels.status.empty);
  await golden(page);
  await expect(savePrompt(page)).toBeVisible();
  await expect(savePrompt(page).getByTestId("local-save-replace-warning")).toHaveText(fill(autoCopy.replaceWarning, { time: formatSavedDateTime(new Date(first.savedAt)) }));
  await savePrompt(page).getByRole("button", { name: autoCopy.decline, exact: true }).click();
  await expect(savePrompt(page)).toHaveCount(0);
  await channelFilter(page).selectOption("MARKETPLACE");
  await expect(kpiContribution(page)).toHaveText("-15.00");
  // 在選單勾選同意：已有副本 → 先顯示覆寫提醒與確認按鈕，自動保存等確認。
  await openStorage(page);
  await consentBox(page).check();
  const warning = storage(page).getByTestId("autosave-replace-warning");
  await expect(warning).toHaveText(fill(autoCopy.menuReplaceWarning, { time: formatSavedDateTime(new Date(first.savedAt)) }));
  const confirm = storage(page).getByTestId("autosave-confirm-replace");
  await expect(confirm).toHaveText(autoCopy.confirmReplace);
  await expect(autoStatus(page)).toContainText(autoCopy.statusPendingReplace);
  await expect(autoToggle(page)).toBeChecked();
  // 確認前 3 秒內不寫入：本機副本仍是重新整理前的那一版（DTC）。
  await page.waitForTimeout(3_000);
  expect((await readLocalCopy(page))!.savedAt).toBe(first.savedAt);
  expect(await savedChannels(page)).toEqual(["DTC"]);
  await expect(savedTag(page)).toHaveText(labels.status.unsaved);
  // 確認改存：立即寫入目前的工作區（MARKETPLACE），提醒消失、狀態改為已開啟。
  await confirm.click();
  const replaced = await waitForLocalSave(page, first.savedAt);
  expect(JSON.parse(replaced.text).payload.active.filters.channels).toEqual(["MARKETPLACE"]);
  await expect(warning).toHaveCount(0);
  await expect(confirm).toHaveCount(0);
  await expect(autoStatus(page)).toContainText(autoCopy.statusOn);
  await expect(savedTag(page)).toHaveText(savedTagPattern(replaced.savedAt));
  // 之後照常自動保存。
  await channelFilter(page).selectOption("DTC");
  await expect(kpiContribution(page)).toHaveText("270.00");
  const next = await waitForLocalSave(page, replaced.savedAt);
  expect(JSON.parse(next.text).payload.active.filters.channels).toEqual(["DTC"]);
  await expect(savedTag(page)).toHaveText(savedTagPattern(next.savedAt));
});

test("R6 首次保存提示開著時，捲到頁尾的「口徑說明」仍可點（主內容底部留白，不被提示擋住）", async ({ page }) => {
  await golden(page);
  const prompt = savePrompt(page);
  await expect(prompt).toBeVisible();
  await expect(announce(page)).toHaveText(autoCopy.announce);
  // 捲到最底：頁尾按鈕在畫面上的位置已是最高，按鈕中心點命中的是按鈕本身（不是提示框）。
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const basis = page.locator("footer.main-footer").getByRole("button", { name: labels.buttons.basis, exact: true });
  await expect(basis).toBeInViewport();
  expect(await basis.evaluate(element => { const box = element.getBoundingClientRect(); const target = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2); return target !== null && (target === element || element.contains(target)); })).toBe(true);
  await basis.click();
  const dialog = page.getByTestId("basis-dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: labels.basis.title, exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  // 提示仍在（點頁尾不算回答）。
  await expect(prompt).toBeVisible();
});
