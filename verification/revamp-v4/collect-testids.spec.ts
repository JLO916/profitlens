import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { WORKSPACE_V4 } from "../../src/application/workspace-backup";
import { acceptSavePrompt, choosePreset, clickReplacing, closeDownloads, closeStorage, dismissSavePrompt, navigateTo, openAiSection, openAiStatus, openBasis, openCustomPeriod, openDetails, openDownloads, openMeeting, openPeriodComparison, openProductColumns, openProductExport, openStorage, openValidation, startChannelContext, switchActionsView } from "../../tests/e2e/replacement-helpers";
import { actionDrawer, closeActionDrawer, openActionDrawer, openActionsExport } from "../../tests/e2e/actions-helpers-v3";
import { acceptAssumptions, modeButton, openScenarioExport } from "../../tests/e2e/scenario-helpers-v3";
import { chooseBasis, commitWizard, confirmAndCheck, confirmMappingIfShown, importViaWizard, nextFromFiles, openWizard, openWizardChannels, openWizardConversion, openWizardPeriods, setWizardFiles, wizardDetails, type FilePayload, type WizardRole } from "../../tests/e2e/import-wizard-helpers";
import { endPrint, printVariant, stubPrint } from "../../tests/e2e/variant-helpers-v39";
import { enterPresent } from "../../tests/e2e/present-helpers-v39";
import { reenvelope } from "../../tests/e2e/ad-decision-helpers-v39";
import { openMeetingExport } from "../../tests/e2e/meeting-helpers-v3";

// V4-0a testid 基準第 2 步（PRD v4 §8.6、06_BATCHES V4-0a 第 3 項）：由 verification/revamp-v3/collect-testids.spec.ts 複製而來，改成 v3.0.0 的介面
// （V3-3 殼層：側欄分組、頂欄選單、手機分頁列；V3-4–V3-9 各頁改版）能走完的步驟，並盡量多覆蓋互動後才出現的狀態：各頁、抽屜、選單、確認框、
// 匯入精靈各步、會議、投影模式、列印版三種版本、載入中與錯誤、本機保存與備份還原。
// 收集畫面上所有 data-testid（含收合的 <details> 與 hidden 的內容；querySelectorAll 看得到就算），結果寫到 verification/revamp-v4/collect-testids.json
// （每個 testid 對應收集到它的步驟），並斷言 testids-v3.txt 中來源為 e2e 的列都有收集到（清單存在時）。來源為 ssr 的列由 tests/testid-baseline.test.ts 以 SSR 比對；
// cond 列（失敗、live AI 等）兩邊都不進入，見 txt 說明欄。
// 每個 test 是一段獨立流程（新的瀏覽器 context），收集結果先寫到 test-results-revamp-v4/collect-parts/，最後一個 test 合併；某一段失敗不會讓其他段的結果遺失。
const BASELINE = resolve("verification/revamp-v4/testids-v3.txt");
const OUTPUT = resolve("verification/revamp-v4/collect-testids.json");
const PARTS = resolve("test-results-revamp-v4/collect-parts");
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
const status = (page: Page) => page.getByTestId("workspace-status");

/** 每段流程一個收集器：collect(step) 讀目前 DOM 的全部 data-testid；flush() 把這段的結果寫成 collect-parts/{part}.json。 */
function collector(page: Page, part: string) {
  const seen = new Map<string, Set<string>>();
  const collect = async (step: string) => {
    const ids = await page.evaluate(() => [...document.querySelectorAll("[data-testid]")].map(element => element.getAttribute("data-testid") ?? ""));
    // 會議 id 含 crypto.randomUUID()，寫檔前換成 {uuid}，讓 collect-testids.json 重跑時不漂移。
    for (const raw of ids) { const id = raw.replace(UUID, "{uuid}"); seen.set(id, (seen.get(id) ?? new Set()).add(step)); }
  };
  const flush = () => {
    mkdirSync(PARTS, { recursive: true });
    writeFileSync(resolve(PARTS, `${part}.json`), JSON.stringify(Object.fromEntries([...seen].map(([id, steps]) => [id, [...steps]]))));
  };
  return { collect, flush };
}

/** 從開發者驗證頁載入示範資料或 golden（預設選項是示範資料）；等狀態列就緒。 */
async function loadFromValidation(page: Page, dataset: "demo" | "golden" = "demo") {
  await openValidation(page);
  const panel = page.getByTestId("validation-panel");
  await panel.getByLabel(labels.shell.devValidation.validation.datasetLabel, { exact: true }).selectOption(dataset);
  await clickReplacing(page, panel.getByRole("button", { name: labels.shell.devValidation.validation.loadButton, exact: true }));
  await expect(status(page)).toContainText(labels.shell.status.ready.split("{")[0]);
}
/** 空狀態的「載入示範資料」：等 KPI 帶出現，關掉首次保存提示。 */
async function loadDemo(page: Page) {
  await clickReplacing(page, page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true }).first());
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toBeVisible();
  await dismissSavePrompt(page);
}
/** 「計算與來源」抽屜（dialog.evidence-drawer）：按右上關閉鈕，等卸載。 */
const evidenceDrawer = (page: Page) => page.locator("dialog.evidence-drawer");
async function closeEvidence(page: Page) {
  await evidenceDrawer(page).locator("button.evidence-close").click();
  await expect(evidenceDrawer(page)).toHaveCount(0);
}
/** 每天相同、8 條健檢規則都不觸發的合成資料（同 tests/e2e/data-page-v3.spec.ts 的 flatDataset）。 */
function flatDataset(): Record<WizardRole, FilePayload> {
  const days: string[] = [];
  for (let t = Date.parse("2026-07-01T00:00:00Z"); t <= Date.parse("2026-08-31T00:00:00Z"); t += 86_400_000) days.push(new Date(t).toISOString().slice(0, 10));
  const csv = (name: WizardRole, header: string, row: string) => ({ name, mimeType: "text/csv", buffer: Buffer.from([header, ...days.map(day => `${day},${row}`)].join("\n"), "utf8") });
  return {
    "sales_daily.csv": csv("sales_daily.csv", "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency", "官網,SKU-1,服飾,2,200.00,0.00,0.00,40.00,TWD"),
    "channel_costs_daily.csv": csv("channel_costs_daily.csv", "date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency", "官網,5.00,2.00,3.00,0.00,TWD"),
    "ad_spend_daily.csv": csv("ad_spend_daily.csv", "date,channel,ad_spend,currency", "官網,40.00,TWD"),
  };
}

// collect-parts 在 outputDir（test-results-revamp-v4）內，Playwright 每次執行前會清空 outputDir；不在 beforeAll 刪（某段失敗時 worker 重啟會再跑一次 beforeAll，把前面各段的結果刪掉）。

test("01 殼層、總覽與抽屜（示範資料）", async ({ page }) => {
  const { collect, flush } = collector(page, "01-shell-overview");
  try {
    await page.goto("/");
    await collect("首頁（空工作區）");
    await openValidation(page);
    await collect("#validation 開發者驗證");
    // 從驗證頁載入示範資料（預設選項）；首次載入出現「存在這台電腦？」提示。
    await page.getByTestId("validation-panel").getByRole("button", { name: labels.shell.devValidation.validation.loadButton, exact: true }).click();
    await expect(status(page)).toContainText(labels.shell.status.ready.split("{")[0]);
    await expect(page.getByTestId("local-save-prompt")).toBeVisible();
    await collect("載入示範資料＋首次保存提示");
    await dismissSavePrompt(page);

    await navigateTo(page, "overview");
    await collect("總覽（示範資料）");
    await openDownloads(page);
    await collect("頂欄匯出選單（有資料）");
    await closeDownloads(page);
    await openStorage(page);
    await collect("頂欄儲存選單（有資料）");
    await closeStorage(page);
    const dataStatus = page.getByTestId("data-status");
    await dataStatus.click();
    await expect(page.getByTestId("data-status-popover")).toBeVisible();
    await collect("資料狀態 popover");
    await page.keyboard.press("Escape");
    await openAiStatus(page);
    await collect("AI 狀態說明");
    await page.keyboard.press("Escape");
    await openBasis(page);
    await collect("指標定義對話框");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: labels.glossary.basis.title })).toHaveCount(0);
    await openCustomPeriod(page);
    await collect("自訂期間 popover");
    await page.keyboard.press("Escape");
    await openPeriodComparison(page);
    await openDetails(page.getByTestId("pnl-table"));
    await collect("總覽：進階區（期間合計與日均、管理損益表）");
    await openDetails(page.getByTestId("trend").locator("details.data-alternative"));
    await openDetails(page.getByTestId("bridge-section").locator("details.data-alternative"));
    await collect("總覽：圖表資料表展開");

    // 計算與來源抽屜：KPI、各通路（下鑽篩選：清除後出現「套用篩選」）、橋接差額（帶正負號，有取位說明）。
    await page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value button.number-link").click();
    await expect(evidenceDrawer(page)).toBeVisible();
    await collect("計算與來源：KPI 扣廣告後貢獻");
    await closeEvidence(page);
    await page.getByTestId("channel-mix").locator("table.channel-kv button.number-link").first().click();
    await expect(evidenceDrawer(page).getByTestId("evidence-filter")).toBeVisible();
    await collect("計算與來源：通路下鑽（篩選中）");
    await evidenceDrawer(page).getByTestId("evidence-filter-clear").click();
    await expect(evidenceDrawer(page).getByTestId("evidence-filter-apply")).toBeVisible();
    await collect("計算與來源：通路下鑽（清除篩選後）");
    await closeEvidence(page);
    await page.getByTestId("bridge-table").locator("tbody tr").nth(1).locator("button.number-link").click();
    await expect(evidenceDrawer(page)).toBeVisible();
    await collect("計算與來源：橋接差額");
    await closeEvidence(page);
    const scopes = page.getByTestId("profit-waterfall-scope").getByRole("button");
    await scopes.nth(1).click();
    await expect(scopes.nth(1)).toHaveAttribute("aria-pressed", "true");
    await collect("總覽：利潤結構切到單一通路");

    // 複製週會摘要（沒有剪貼簿權限）：總覽一句話旁的按鈕開備案對話框；頂欄匯出選單「會議」組顯示選單內備案。
    await page.getByTestId("copy-summary").click();
    await expect(page.getByTestId("copy-summary-fallback")).toBeVisible();
    await collect("總覽：複製週會摘要備案對話框");
    await page.getByTestId("copy-summary-fallback").getByRole("button", { name: labels.shell.buttons.close, exact: true }).click();
    await expect(page.getByTestId("copy-summary-fallback")).toHaveCount(0);
    const menu = await openDownloads(page);
    await menu.getByTestId("download-copy-summary").click();
    await expect(menu.getByTestId("download-copy-summary-fallback")).toBeVisible();
    await collect("頂欄匯出選單：複製週會摘要備案");
    await closeDownloads(page);

    // 投影模式（總覽）。
    await enterPresent(page);
    await expect(page.getByTestId("present-period")).toBeVisible();
    await collect("總覽：投影模式");
    await page.getByTestId("present-toggle").click();
    await expect(page.getByTestId("present-period")).toHaveCount(0);
  } finally { flush(); }
});

test("02 通路健檢、商品毛利、資料來源（示範資料）", async ({ page }) => {
  const { collect, flush } = collector(page, "02-diagnosis-products-data");
  try {
    await page.goto("/");
    await loadDemo(page);
    await navigateTo(page, "diagnosis");
    await collect("通路健檢頁");
    await openAiSection(page);
    const row = page.locator("details.diagnosis-row").first();
    await openDetails(row);
    await collect("通路健檢：展開第一列與 AI 區");

    await navigateTo(page, "products");
    await collect("商品毛利頁");
    await openProductColumns(page);
    await collect("商品毛利：欄位 popover");
    await page.keyboard.press("Escape");
    await openProductExport(page);
    await collect("商品毛利：匯出本頁");
    await page.keyboard.press("Escape");
    const negative = page.getByRole("button", { name: labels.products.comparison.negativeOnly, exact: true });
    await negative.click();
    await expect(page.getByTestId("product-empty")).toBeVisible();
    await collect("商品毛利：只看負毛利（篩選後沒有商品）");
    await page.getByTestId("product-clear-filters").click();
    await expect(page.getByTestId("product-empty")).toHaveCount(0);

    await navigateTo(page, "data");
    for (const role of ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"]) await openDetails(page.getByTestId(`data-preview-${role}`));
    await openDetails(page.getByTestId("data-version-info"));
    await collect("資料來源頁（來源預覽與版本資訊展開）");
    // 目標與檔期：讀入 targets.csv、events.csv（期間是示範資料本期 2026-08-17 到 08-23，一項達成、一項落後；格式同 tests/e2e/revamp-r4.spec.ts）。
    const targets = "period_start,period_end,channel,metric,target\n2026-08-17,2026-08-23,ALL,net_revenue,100000.00\n2026-08-17,2026-08-23,ALL,contribution_after_marketing,99999999.00\n";
    await page.getByLabel(labels.targets.upload, { exact: true }).setInputFiles({ name: "targets.csv", mimeType: "text/csv", buffer: Buffer.from(targets) });
    await page.getByLabel(labels.events.upload, { exact: true }).setInputFiles({ name: "events.csv", mimeType: "text/csv", buffer: Buffer.from("start,end,label\n2026-08-17,2026-08-23,週年慶\n") });
    await expect(page.getByTestId("targets-entry")).toContainText("targets.csv");
    await expect(page.getByTestId("targets-table")).toBeAttached();
    await expect(page.getByTestId("events-table")).toBeAttached();
    await collect("資料來源：讀入目標與檔期");
    await navigateTo(page, "overview");
    await collect("總覽：有目標與檔期");
    // golden 資料（觸發的健檢規則與示範資料不同）。
    await loadFromValidation(page, "golden");
    await dismissSavePrompt(page);
    await navigateTo(page, "diagnosis");
    await collect("通路健檢頁（golden）");
    await navigateTo(page, "overview");
    await collect("總覽（golden）");
  } finally { flush(); }
});

test("03 假設試算", async ({ page }) => {
  const { collect, flush } = collector(page, "03-scenarios");
  try {
    await page.goto("/");
    await loadDemo(page);
    await navigateTo(page, "scenarios");
    await startChannelContext(page);
    await collect("假設試算頁（進頁即表單）");
    const card = page.getByTestId("scenario-1");
    await card.getByTestId("scenario-preset").selectOption({ index: 1 });
    await expect(card.getByTestId("scenario-preset-purpose")).toBeAttached();
    await modeButton(card, "volume_change_pct", "absolute").click();
    await card.getByLabel(labels.scenarios.inputs.volume.label, { exact: true }).fill("6.5");
    await expect(card.getByTestId("scenario-absolute-error-volume_change_pct")).toBeVisible();
    await collect("試算：範本＋絕對值格式錯誤");
    await modeButton(card, "volume_change_pct", "relative").click();
    const inputs = labels.scenarios.inputs;
    for (const [label, value] of [[inputs.volume.label, "10"], [inputs.discount.label, "0"], [inputs.fulfillmentUnit.label, "0"], [inputs.adSpend.label, "0"], [inputs.oneOff.label, "0"]] as const) await card.getByLabel(label, { exact: true }).fill(value);
    await acceptAssumptions(card);
    await card.getByRole("button", { name: labels.scenarios.buttons.calculate, exact: true }).click();
    await expect(card.getByTestId("scenario-result")).toBeVisible();
    await collect("試算：方案 1 計算後");
    await openDetails(card.getByTestId("scenario-sensitivity"));
    await collect("試算：展開要賣到多少才划算");
    await page.getByTestId("scenario-add").click();
    await expect(page.getByTestId("scenario-2")).toBeVisible();
    await collect("試算：新增方案 2（已了解聲明）");
    await openScenarioExport(page);
    await collect("試算：匯出本頁");
    await page.keyboard.press("Escape");
  } finally { flush(); }
});

test("04 待辦（看板、抽屜、清單）", async ({ page }) => {
  const { collect, flush } = collector(page, "04-actions");
  try {
    await page.goto("/");
    await loadDemo(page);
    await navigateTo(page, "actions");
    await collect("待辦頁（空）");
    // 新增待辦會直接開編輯抽屜（modal）；關掉後才能點頁首的「新增待辦」。
    await page.getByTestId("actions-empty-add").click();
    await expect(actionDrawer(page)).toBeVisible();
    await collect("待辦：新增第一張（編輯抽屜）");
    await closeActionDrawer(page);
    await page.getByTestId("actions-add").click();
    await expect(actionDrawer(page)).toBeVisible();
    await collect("待辦：新增第二張（編輯抽屜）");
    await closeActionDrawer(page);
    await expect(page.getByTestId("board-card-2")).toBeVisible();
    await page.getByTestId("board-card-1-move-in_progress").click();
    await expect(page.getByTestId("action-notice")).toBeVisible();
    await collect("待辦：新增兩張並移動卡片");
    const drawer = await openActionDrawer(page, 2);
    await expect(drawer.getByTestId("action-drawer-move-up")).toBeVisible();
    await collect("待辦：編輯抽屜");
    await closeActionDrawer(page);
    await switchActionsView(page, "list");
    await collect("待辦：清單檢視");
    await openActionsExport(page);
    await collect("待辦：匯出本頁");
    await page.keyboard.press("Escape");
  } finally { flush(); }
});

test("05 會議紀錄（結束會議、歷史、投影）", async ({ page }) => {
  const { collect, flush } = collector(page, "05-meeting");
  try {
    await page.goto("/");
    await loadDemo(page);
    const meeting = await openMeeting(page);
    await collect("會議紀錄頁");
    await meeting.getByTestId("meeting-copy-summary").click();
    await expect(page.getByTestId("copy-summary-fallback")).toBeVisible();
    await collect("會議：複製週會摘要備案對話框");
    await page.getByTestId("copy-summary-fallback").getByRole("button", { name: labels.shell.buttons.close, exact: true }).click();
    await openMeetingExport(page);
    await collect("會議：匯出會議選單");
    await page.keyboard.press("Escape");
    for (const details of await meeting.locator("details").all()) await openDetails(details).catch(() => undefined);
    await collect("會議：展開全部收合區");
    await enterPresent(page);
    await collect("會議：投影模式");
    await page.getByTestId("present-toggle").click();
    // 結束會議的確認區，確認後出現歷史項目，再開歷史項目的移除確認區。
    await meeting.getByTestId("meeting-finalize").click();
    await expect(meeting.getByTestId("meeting-finalize-confirm")).toBeVisible();
    await collect("會議：結束會議確認區");
    await meeting.getByTestId("meeting-finalize-confirm-button").click();
    await expect(meeting.getByTestId("meeting-history-item")).toHaveCount(1);
    await collect("會議：已結束一場");
    // 改期間（近 4 週）後再看與上次會議比較：期間不同。
    await choosePreset(page, "last4w");
    await openMeeting(page);
    for (const details of await meeting.locator("details").all()) await openDetails(details).catch(() => undefined);
    await collect("會議：改期間後與上次會議比較");
    await meeting.getByTestId("meeting-history").locator('[data-testid^="meeting-history-remove-meeting-"]').first().click();
    await expect(meeting.getByTestId("meeting-history-remove-confirm-region")).toBeVisible();
    await collect("會議：歷史移除確認區");
  } finally { flush(); }
});

test("06 列印版（標準、老闆一頁、客戶報告三種版本）", async ({ page }) => {
  const { collect, flush } = collector(page, "06-print");
  try {
    await stubPrint(page);
    await page.goto("/");
    await loadDemo(page);
    for (const variant of ["standard", "boss", "client"] as const) {
      await printVariant(page, variant);
      await collect(`列印版：${labels.exports.variantsV3.names[variant]}`);
      await endPrint(page);
    }
  } finally { flush(); }
});

test("07 匯入精靈各步與匯入後的資料來源", async ({ page }) => {
  const { collect, flush } = collector(page, "07-import");
  try {
    await page.goto("/");
    await openWizard(page);
    await collect("匯入精靈：第 1 步");
    // 欄名改成中文（字典對照需要確認），第 2 步不會自動完成。
    const inclusive = resolve("tests/fixtures/inclusive_tax");
    const sales = (await readFile(resolve(inclusive, "sales_daily.csv"), "utf8")).replace(/^date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency/, "結帳日,通路,商品貨號,品類,件數,商品金額,折扣,退款,成本,幣別");
    await setWizardFiles(page, inclusive, { "sales_daily.csv": { name: "shop-sales.csv", mimeType: "text/csv", buffer: Buffer.from(sales) } });
    await collect("匯入精靈：第 1 步選好三個檔");
    await nextFromFiles(page);
    await expect(page.getByTestId("import-step-2")).toBeVisible();
    await collect("匯入精靈：第 2 步欄位對照");
    await confirmMappingIfShown(page);
    await chooseBasis(page, "inclusive");
    await openWizardConversion(page);
    await openWizardPeriods(page);
    // 「調整通路」只在通路多於 1 個時出現（inclusive_tax 只有一個通路時沒有）。
    if (await wizardDetails(page, labels.importWizard.wizardV3.adjustChannels).count()) await openWizardChannels(page);
    await collect("匯入精靈：第 3 步含稅與收合區展開");
    await confirmAndCheck(page, "valid");
    await collect("匯入精靈：第 4 步檢核結果");
    await commitWizard(page);
    await dismissSavePrompt(page);
    await navigateTo(page, "data");
    await collect("資料來源：含稅換算匯入後（前處理）");
    // 部分資料待補（fixtures/errors/missing_cogs）：資料來源頁的問題表、需要處理橫幅。
    await importViaWizard(page, resolve("fixtures/errors/missing_cogs"), { classification: "partial" });
    await dismissSavePrompt(page);
    await navigateTo(page, "data");
    await collect("資料來源：部分資料待補（問題表）");
    await navigateTo(page, "diagnosis");
    await collect("通路健檢：部分資料待補");
    // 健檢規則都沒觸發的合成資料：通路健檢空狀態。
    await importViaWizard(page, "", { overrides: flatDataset() });
    await dismissSavePrompt(page);
    await navigateTo(page, "diagnosis");
    await expect(page.getByTestId("diagnosis-empty")).toBeVisible();
    await collect("通路健檢：規則都沒觸發（空狀態）");
  } finally { flush(); }
});

test("08 載入中與載入失敗", async ({ page }) => {
  const { collect, flush } = collector(page, "08-loading-error");
  try {
    let release: () => void = () => undefined;
    const gate = new Promise<void>(done => { release = done; });
    await page.route("**/api/datasets/demo", async route => { await gate; await route.continue(); });
    await page.goto("/");
    await clickReplacing(page, page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true }).first());
    await expect(page.getByTestId("loading-state")).toBeVisible();
    await collect("載入中");
    release();
    await expect(page.getByTestId("kpi-contribution_after_marketing")).toBeVisible();
    await dismissSavePrompt(page);
    await page.unroute("**/api/datasets/demo");
    // 有上次成功的資料時載入失敗（重複的銷售鍵）：錯誤容器多「回到上次成功的資料」。
    await openValidation(page);
    await page.getByLabel(labels.shell.devValidation.validation.datasetLabel, { exact: true }).selectOption("duplicate");
    await clickReplacing(page, page.getByRole("button", { name: labels.shell.devValidation.validation.loadButton, exact: true }));
    await expect(page.getByTestId("error-back")).toBeVisible();
    await collect("載入失敗（有上次成功的資料）");
    await page.getByTestId("error-back").click();
    await expect(page.getByTestId("error-state")).toHaveCount(0);
  } finally { flush(); }
});

test("09 本機保存、副本預覽與備份還原", async ({ page }) => {
  const { collect, flush } = collector(page, "09-storage");
  try {
    await page.goto("/");
    await loadFromValidation(page);
    await acceptSavePrompt(page);
    await navigateTo(page, "overview");
    await expect(page.getByTestId("autosave-status")).toContainText(/\S/);
    // 下載備份（v5），稍後改寫成 v4 信封還原，出現「這版改了什麼」。
    const storage = await openStorage(page);
    await collect("儲存選單：已同意本機保存");
    const [file] = await Promise.all([page.waitForEvent("download"), storage.getByRole("button", { name: labels.storage.buttons.downloadBackup, exact: true }).click()]);
    const backup = await readFile((await file.path())!, "utf8");
    await closeStorage(page);

    // 重新整理：這台電腦已有副本，首次保存提示附「會覆蓋」提醒；勾選同意後自動保存待確認覆寫；讀取本機副本預覽後出現儲存通知。
    await page.goto("/");
    await page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true }).first().click();
    await expect(page.getByTestId("local-save-replace-warning")).toBeVisible();
    await collect("重新整理後載入：提示附覆蓋提醒");
    await dismissSavePrompt(page);
    const menu = await openStorage(page);
    await menu.getByRole("checkbox", { name: labels.storage.workspace.consent, exact: true }).check();
    await expect(menu.getByTestId("autosave-replace-warning")).toBeVisible();
    await collect("儲存選單：同意後待確認覆寫");
    await menu.getByRole("button", { name: labels.storage.buttons.restorePreview, exact: true }).click();
    await expect(menu.getByTestId("storage-notice")).toBeVisible();
    await collect("儲存選單：讀取本機副本預覽");

    // 還原 v4 信封的備份：「這版改了什麼」提示。
    await menu.getByLabel(labels.storage.workspace.selectBackupFile, { exact: true }).setInputFiles({ name: "v4.json", mimeType: "application/json", buffer: reenvelope(backup, WORKSPACE_V4) });
    await expect(page.getByRole("region", { name: labels.storage.workspace.restorePreviewAria })).toBeVisible();
    await collect("儲存選單：備份還原預覽");
    await clickReplacing(page, menu.getByRole("button", { name: labels.storage.workspace.applyRestore, exact: true }));
    await expect(page.getByTestId("whats-new")).toBeVisible();
    await collect("還原 v4 備份後：這版改了什麼");
  } finally { flush(); }
});

test("合併各段收集結果，寫入 collect-testids.json", () => {
  const merged = new Map<string, string[]>();
  const parts = existsSync(PARTS) ? readdirSync(PARTS).filter(name => name.endsWith(".json")).sort() : [];
  for (const part of parts) for (const [id, steps] of Object.entries(JSON.parse(readFileSync(resolve(PARTS, part), "utf8")) as Record<string, string[]>)) merged.set(id, [...new Set([...(merged.get(id) ?? []), ...steps])]);
  writeFileSync(OUTPUT, `${JSON.stringify(Object.fromEntries([...merged].sort(([a], [b]) => a.localeCompare(b))), null, 2)}\n`);
  expect(parts.length, "九段流程都有寫出收集結果").toBe(9);
});

test("testids-v3.txt 中來源為 e2e 的列都有收集到", () => {
  test.skip(!existsSync(BASELINE), "testids-v3.txt 還沒產生（第一次收集時）");
  const seen = JSON.parse(readFileSync(OUTPUT, "utf8")) as Record<string, string[]>;
  const expected = readFileSync(BASELINE, "utf8").split(/\r?\n/).filter(line => line && !line.startsWith("#")).map(line => line.split("\t")).filter(([, source]) => source === "e2e").map(([id]) => id);
  expect(expected.length).toBeGreaterThan(0);
  expect(expected.filter(id => !(id in seen)), "瀏覽器流程沒收集到的 e2e testid").toEqual([]);
});
