import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { acceptSavePrompt, dismissSavePrompt, openDetails, openDownloads, closeDownloads, openMeeting, openValidation, startChannelContext } from "../../tests/e2e/replacement-helpers";

// V3-0 testid 基準（PRD §11.7）：在真實瀏覽器走一遍「互動後才出現」的狀態，收集畫面上所有 data-testid。
// 結果寫到 verification/revamp-v3/collect-testids.json（testid → 收集到它的步驟），並斷言 testids-v2.txt 中來源為 e2e 的列都有收集到。
// 來源為 ssr 的列由 tests/testid-baseline.test.ts 以 SSR 比對；cond 列（失敗、live AI 等）兩邊都不進入，見 txt 說明欄。
const BASELINE = resolve("verification/revamp-v3/testids-v2.txt");
const OUTPUT = resolve("verification/revamp-v3/collect-testids.json");
const nav = (page: Page, id: keyof typeof labels.nav) => page.getByRole("button", { name: labels.nav[id].label, exact: true });

test("收集互動後才出現的 data-testid", async ({ page }) => {
  const seen = new Map<string, Set<string>>();
  const collect = async (step: string) => {
    const ids = await page.evaluate(() => [...document.querySelectorAll("[data-testid]")].map(element => element.getAttribute("data-testid") ?? ""));
    // 會議 id 含 crypto.randomUUID()，寫檔前換成 {uuid}，讓 collect-testids.json 重跑時不漂移。
    for (const raw of ids) { const id = raw.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "{uuid}"); seen.set(id, (seen.get(id) ?? new Set()).add(step)); }
  };

  await page.goto("/");
  await collect("首頁（空工作區）");
  await openValidation(page);
  await collect("#validation 開發者驗證");
  // 從驗證頁載入示範資料（預設選項）；首次載入出現「存在這台電腦？」提示。
  await page.getByTestId("validation-panel").getByRole("button", { name: labels.ui.dashboard.validation.loadButton }).click();
  await expect(page.getByTestId("workspace-status")).toContainText(labels.status.ready);
  await expect(page.getByTestId("local-save-prompt")).toBeVisible();
  await collect("載入示範資料＋首次保存提示");
  await acceptSavePrompt(page);

  await nav(page, "overview").click();
  await collect("總覽（示範資料）");
  await openDownloads(page);
  await collect("下載選單（有資料）");
  await closeDownloads(page);
  for (const id of ["diagnosis", "products", "data"] as const) { await nav(page, id).click(); await collect(`${labels.nav[id].label}頁`); }

  // 試算：選範本（顯示用途說明）、數量改用絕對值並輸入非整數（格式錯誤提示）。
  await nav(page, "scenarios").click();
  await startChannelContext(page);
  const card = page.getByTestId("scenario-1");
  await card.getByTestId("scenario-preset").selectOption({ index: 1 });
  await expect(card.getByTestId("scenario-preset-purpose")).toBeVisible();
  await card.getByTestId("scenario-mode-volume_change_pct").getByRole("button", { name: labels.scenario.modeAbsolute, exact: true }).click();
  await card.getByLabel(labels.scenario.volume.label, { exact: true }).fill("6.5");
  await expect(card.getByTestId("scenario-absolute-error-volume_change_pct")).toBeVisible();
  await collect("試算：範本＋絕對值格式錯誤");

  // 待辦：新增一張卡並移到「進行中」（看板通知）。
  await nav(page, "actions").click();
  await page.getByRole("button", { name: labels.buttons.addAction, exact: true }).click();
  await page.getByTestId("board-card-1-move-in_progress").click();
  await expect(page.getByTestId("action-notice")).toBeVisible();
  await collect("待辦：新增並移動卡片");

  // 會議：結束會議的確認區 → 確認 → 歷史項目的移除確認區。
  const meeting = await openMeeting(page);
  await meeting.getByTestId("meeting-finalize").click();
  await expect(meeting.getByTestId("meeting-finalize-confirm")).toBeVisible();
  await collect("會議：結束會議確認區");
  await meeting.getByTestId("meeting-finalize-confirm-button").click();
  await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(1);
  await collect("會議：已結束一場");
  await meeting.getByTestId("meeting-history").locator('[data-testid^="meeting-history-remove-meeting-"]').first().click();
  await expect(meeting.getByTestId("meeting-history-remove-confirm-region")).toBeVisible();
  await collect("會議：歷史移除確認區");

  // 重新整理：這台電腦已有副本 → 首次保存提示附「會覆蓋」提醒；勾選同意 → 自動保存待確認覆寫；讀取本機副本預覽 → 儲存通知。
  await page.goto("/");
  await page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }).first().click();
  await expect(page.getByTestId("local-save-replace-warning")).toBeVisible();
  await collect("重新整理後載入：提示附覆蓋提醒");
  await dismissSavePrompt(page);
  const storage = await openDetails(page.getByTestId("workspace-storage"));
  await storage.getByRole("checkbox", { name: labels.ui.workspaceStorage.consent, exact: true }).check();
  await expect(storage.getByTestId("autosave-replace-warning")).toBeVisible();
  await collect("儲存選單：同意後待確認覆寫");
  await storage.getByRole("button", { name: labels.buttons.restorePreview, exact: true }).click();
  await expect(storage.getByTestId("storage-notice")).toBeVisible();
  await collect("儲存選單：讀取本機副本預覽");

  writeFileSync(OUTPUT, `${JSON.stringify(Object.fromEntries([...seen].sort(([a], [b]) => a.localeCompare(b)).map(([id, steps]) => [id, [...steps]])), null, 2)}\n`);
  const expected = readFileSync(BASELINE, "utf8").split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => line.split("\t")).filter(([, source]) => source === "e2e").map(([id]) => id);
  expect(expected.filter(id => !seen.has(id)), "瀏覽器流程沒收集到的 e2e testid").toEqual([]);
});
