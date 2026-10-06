import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test as base, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { formatAmountL1, formatAmountL2, formatSignedDelta } from "../../src/application/presentation";
import { clickReplacing, isMobile, navigateTo, openValidation, startChannelContext, switchActionsView } from "./replacement-helpers";

// R5（05 §7–§9、02 §4–§7）：健檢清單化、試算進頁即表單＋範本＋絕對值、行動看板、商品 Top／Bottom。
// 金額一律用 golden 手算（fixtures/golden，上期 2026-08-01、本期 2026-08-02）：
//   本期 DTC：淨營收 1120+360＝1480；商品毛利 540+200＝740；通路費 0+44+140+16＝200；廣告 270 → 扣廣告後貢獻 270.00（試算基準）。
//   docs/SCENARIOS.md 錨點：DTC f＝−10%、其餘 0 → 284.00；同情境 K＝20 → 264.00；MARKETPLACE（20, 2, −10, −20, 20）→ 19.70（差額 +34.70）。
//   本期件數：DTC 3+1＝4 件；MARKETPLACE 廣告 180 元（新預算 144 ＝ −20%）。
//   健檢 |對貢獻影響|：扣廣告後貢獻 570→255（−315）、折扣 200→450（+250）、廣告 300→450（+150）、退款 50→180（+130）、物流 160→225（+65）、MARKETPLACE 本期貢獻 −15。

const test = base.extend<{ audit: string[] }>({
  audit: [async ({ page }, use) => {
    const events: string[] = [];
    page.on("pageerror", error => events.push(`pageerror:${error.message}`));
    page.on("console", message => { if (message.type() === "error") events.push(`console:${message.text()}`); });
    page.on("dialog", dialog => { events.push(`dialog:${dialog.type()}`); void dialog.dismiss(); });
    // 只計「使用者」點擊（isTrusted）；Playwright 的 click 是真實滑鼠事件，會被計入。
    await page.addInitScript(() => {
      const w = window as unknown as { __r5Clicks: number };
      w.__r5Clicks = 0;
      document.addEventListener("click", event => { if (event.isTrusted) w.__r5Clicks++; }, true);
    });
    await use(events);
    expect(events).toEqual([]);
  }, { auto: true }],
});

const dash = labels.ui.dashboard;
const form = labels.scenarioForm;
const board = labels.actionBoard;
const presets = labels.scenarioPresets;
const highlight = labels.productHighlights;
const inputLabels = [labels.scenario.volume.label, labels.scenario.discount.label, labels.scenario.fulfillmentUnit.label, labels.scenario.adSpend.label, labels.scenario.oneOff.label] as const;
const [volume, discount, fulfillment, adSpend, oneOff] = inputLabels;
const statusLabel = { not_started: labels.actions.statuses.not_started, in_progress: labels.actions.statuses.in_progress, blocked: labels.actions.statuses.blocked, completed: labels.actions.statuses.done } as const;

const clicks = (page: Page) => page.evaluate(() => (window as unknown as { __r5Clicks: number }).__r5Clicks);
const resetClicks = (page: Page) => page.evaluate(() => { (window as unknown as { __r5Clicks: number }).__r5Clicks = 0; });
// V3-3：切頁走 navigateTo（桌機側欄；手機底部分頁列或「更多」面板）。全站通路篩選在期間列（period-bar）裡；手機收在期間底部面板，值仍可讀。
const globalChannel = (page: Page) => page.getByTestId("period-bar").getByLabel(dash.filter.channel, { exact: true });

// V3-2a：status.ready 帶 {date}＝資料集 manifest 的 data_as_of（golden 2026-08-03、demo 2026-08-24）。
const dataAsOf = (id: "golden" | "demo") => (JSON.parse(readFileSync(resolve("fixtures", id, "manifest.json"), "utf8")) as { data_as_of: string }).data_as_of;
async function loadDataset(page: Page, id: "golden" | "demo") {
  await page.goto("/");
  await openValidation(page);
  await page.getByLabel(dash.validation.datasetLabel, { exact: true }).selectOption(id);
  await clickReplacing(page, page.getByRole("button", { name: dash.validation.loadButton, exact: true }));
  await expect(page.getByTestId("workspace-status")).toContainText(fill(labels.status.ready, { date: dataAsOf(id) }));
  await declineSavePromptOnMobile(page);
}
/**
 * V3-3 手機：首次保存提示（.local-save-prompt，z-index 25）疊在「更多」面板（.mobile-tabbar 的堆疊層 20）與頂欄「更多」工具列（.topbar 的堆疊層 21）之上，
 * 提示出現時點不到「更多」裡的頁面與儲存／匯出選單（已回報為產品問題）。本檔不測保存提示，手機流程先按「先不要」；桌機流程不變。
 */
async function declineSavePromptOnMobile(page: Page) {
  if (!isMobile(page)) return;
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: labels.autoSave.decline, exact: true }).click();
  await expect(prompt).toHaveCount(0);
}
// V3-2b：試算結果是 L1（< 1 萬顯示整數元＋「元」，差額帶 +／U+2212）；參數是 golden 的精確值，由格式化函式轉成畫面字串。
async function calculate(card: Locator, contribution: string, delta: string) {
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText(formatAmountL1(contribution));
  await expect(card.getByTestId("scenario-delta")).toHaveText(formatSignedDelta(delta, "L1"));
}
const modeButton = (card: Locator, field: string, mode: "relative" | "absolute") => card.getByTestId(`scenario-mode-${field}`).getByRole("button", { name: mode === "relative" ? labels.scenario.modeRelative : labels.scenario.modeAbsolute, exact: true });

test("試算：側欄一次點擊就到表單；範本只填數字不代勾、版本只在計算成功時遞增、絕對值換算與超界提示", async ({ page }) => {
  // 步驟多（四次計算＋兩種模式切換），在負載高的機器上可能超過預設 45 秒；只放寬時間，不放寬斷言。
  test.setTimeout(90_000);
  await loadDataset(page, "golden");
  await expect(globalChannel(page)).toHaveValue("");
  await resetClicks(page);
  await navigateTo(page, "scenarios");
  await startChannelContext(page);
  const card = page.getByTestId("scenario-1");
  for (const label of inputLabels) await expect(card.getByLabel(label, { exact: true })).toBeVisible();
  // ≤ 2 次點擊：除了導覽到「假設試算」之外沒有其他點擊（沒有「開始試算」）。桌機是側欄 1 次；手機在「更多」面板裡，是「更多」→「假設試算」2 次。
  expect(await clicks(page)).toBe(isMobile(page) ? 2 : 1);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("DTC");
  await expect(page.getByTestId("scenario-assumptions")).not.toHaveAttribute("open", "");
  await expect(page.getByTestId("scenario-assumptions").locator(":scope > summary")).toHaveText(form.assumptionsSummary);
  await expect(card.getByTestId("scenario-template-note")).toHaveText(labels.scenario.templateNote);
  for (const label of inputLabels) await expect(card.getByLabel(label, { exact: true })).toHaveValue("");

  // 範本：選單第一項是提示，其餘六個範本；套用 keep 只填五格 0，不代替使用者勾選同意。
  const preset = card.getByTestId("scenario-preset");
  await expect(preset.locator("option")).toHaveText([presets.menuPlaceholder, ...(["keep", "double11", "cut_ads_half", "cancel_free_shipping", "price_up_5", "kol"] as const).map(id => presets.items[id].name)]);
  await preset.selectOption("keep");
  // R5 修正：範本改兩步（先選、再按「套用範本」），避免鍵盤方向鍵一掃就覆寫五格。
  await expect(card.getByTestId("scenario-preset-apply")).toBeEnabled();
  await card.getByTestId("scenario-preset-apply").click();
  for (const label of inputLabels) await expect(card.getByLabel(label, { exact: true })).toHaveValue("0");
  await expect(card.getByLabel(labels.scenario.acceptAssumptions, { exact: true })).not.toBeChecked();
  await expect(card.getByTestId("scenario-preset-purpose")).toHaveText(fill(form.presetApplied, { name: presets.items.keep.name, purpose: presets.items.keep.purpose }));
  await expect(card.getByTestId("scenario-version")).toHaveCount(0);

  // 計算成功才有版本 1；零變動回到基準 270.00。
  await card.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).check();
  await calculate(card, "270.00", "0.00");
  await expect(card.getByTestId("scenario-version")).toHaveText(fill(form.version, { n: 1 }));
  await expect(card.getByTestId("scenario-draft")).toHaveCount(0);
  // 改一格 → 草稿，結果與版本都撤下。
  await card.getByLabel(fulfillment, { exact: true }).fill("-10");
  await expect(card.getByTestId("scenario-draft")).toHaveText(labels.scenario.draft);
  await expect(card.getByTestId("scenario-version")).toHaveCount(0);
  await expect(card.getByTestId("scenario-contribution")).toHaveCount(0);
  await calculate(card, "284.00", "+14.00");
  await expect(card.getByTestId("scenario-version")).toHaveText(fill(form.version, { n: 2 }));
  // 輸入與最新版本相同時重算，版本維持。
  await calculate(card, "284.00", "+14.00");
  await expect(card.getByTestId("scenario-version")).toHaveText(fill(form.version, { n: 2 }));
  await card.getByLabel(oneOff, { exact: true }).fill("20");
  await calculate(card, "264.00", "-6.00");
  await expect(card.getByTestId("scenario-version")).toHaveText(fill(form.version, { n: 3 }));

  // 絕對值：本期 4 件 → 目標 6 件 ＝ 相對 +50.0%；只在表單層換算，切回相對 % 看到的是等值相對值。
  await modeButton(card, "volume_change_pct", "absolute").click();
  await expect(modeButton(card, "volume_change_pct", "absolute")).toHaveAttribute("aria-pressed", "true");
  await expect(modeButton(card, "volume_change_pct", "relative")).toHaveAttribute("aria-pressed", "false");
  await card.getByLabel(volume, { exact: true }).fill("6");
  await expect(card.getByTestId("scenario-equivalent-volume_change_pct")).toHaveText(fill(presets.absolute.equivalentPct, { value: "+50.0" }));
  await expect(card.getByTestId("scenario-draft")).toBeVisible();
  // 絕對值格式錯誤：提示且不換算。
  await card.getByLabel(volume, { exact: true }).fill("6.5");
  await expect(card.getByTestId("scenario-absolute-error-volume_change_pct")).toHaveText(presets.absolute.errors.volume_change_pct);
  // 絕對值換算後超出引擎界限也要即時提示：4 件 → 9 件 ＝ +125.0% ＞ +100%。
  await card.getByLabel(volume, { exact: true }).fill("9");
  await expect(card.getByTestId("scenario-equivalent-volume_change_pct")).toHaveText(fill(presets.absolute.equivalentPct, { value: "+125.0" }));
  await expect(card.getByTestId("scenario-range-volume_change_pct")).toHaveText(fill(presets.range.pct, { min: "−90", max: "+100" }));
  await card.getByLabel(volume, { exact: true }).fill("6");
  await expect(card.getByTestId("scenario-absolute-error-volume_change_pct")).toHaveCount(0);
  await expect(card.getByTestId("scenario-range-volume_change_pct")).toHaveCount(0);
  await modeButton(card, "volume_change_pct", "relative").click();
  await expect(card.getByLabel(volume, { exact: true })).toHaveValue("50");
  // 超界：銷量增減 [−90%, +100%]（docs/SCENARIOS.md）。
  await card.getByLabel(volume, { exact: true }).fill("101");
  await expect(card.getByTestId("scenario-range-volume_change_pct")).toHaveText(fill(presets.range.pct, { min: "−90", max: "+100" }));
  await card.getByLabel(volume, { exact: true }).fill("100");
  await expect(card.getByTestId("scenario-range-volume_change_pct")).toHaveCount(0);
});

test("試算通路單選只改本頁：全站篩選不變、各通路方案各自保留；MARKETPLACE 用絕對值廣告預算仍得 19.70", async ({ page }) => {
  // 步驟多（四次計算＋兩種模式切換），在負載高的機器上可能超過預設 45 秒；只放寬時間，不放寬斷言。
  test.setTimeout(90_000);
  await loadDataset(page, "golden");
  await navigateTo(page, "scenarios");
  await startChannelContext(page);
  const card = page.getByTestId("scenario-1");
  await expect(page.getByTestId("scenario-channel")).toHaveValue("DTC");
  await expect(page.getByTestId("scenario-channel").locator("option")).toHaveText(["DTC", "MARKETPLACE"]);
  await card.getByTestId("scenario-preset").selectOption("keep");
  await card.getByTestId("scenario-preset-apply").click();
  await card.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).check();
  await calculate(card, "270.00", "0.00");
  // 通路單選只改本頁：全站通路篩選仍是全部通路。
  await page.getByTestId("scenario-channel").selectOption("MARKETPLACE");
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-channel")).toHaveValue("MARKETPLACE");
  await expect(globalChannel(page)).toHaveValue("");
  const marketplace = page.getByTestId("scenario-1");
  for (const label of inputLabels) await expect(marketplace.getByLabel(label, { exact: true })).toHaveValue("");
  // MARKETPLACE 錨點，廣告用絕對值：本期 180 → 新預算 144 ＝ −20%；結果必須仍是 19.70／+34.70。
  for (const [label, value] of [[volume, "20"], [discount, "2"], [fulfillment, "-10"], [oneOff, "20"]] as const) await marketplace.getByLabel(label, { exact: true }).fill(value);
  await modeButton(marketplace, "ad_change_pct", "absolute").click();
  await marketplace.getByLabel(adSpend, { exact: true }).fill("144");
  await expect(marketplace.getByTestId("scenario-equivalent-ad_change_pct")).toHaveText(fill(presets.absolute.equivalentPct, { value: "−20.0" }));
  await marketplace.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).check();
  await calculate(marketplace, "19.70", "+34.70");
  await expect(marketplace.getByTestId("scenario-version")).toHaveText(fill(form.version, { n: 1 }));
  // DTC 的方案移到「其他通路的方案」，仍保留；切回 DTC 結果還在（不重算、不升版）。
  await expect(page.getByTestId("scenario-other-channels")).toContainText("DTC");
  await expect(globalChannel(page)).toHaveValue("");
  await page.getByTestId("scenario-channel").selectOption("DTC");
  await startChannelContext(page);
  await expect(page.getByTestId("scenario-1").getByTestId("scenario-contribution")).toHaveText(formatAmountL1("270.00"));
  await expect(page.getByTestId("scenario-1").getByTestId("scenario-version")).toHaveText(fill(form.version, { n: 1 }));
  await expect(globalChannel(page)).toHaveValue("");
});

test("健檢清單：通路寬表置頂、同規則合併一列、依影響金額排序、前三列展開、範圍切換、技術細節收合", async ({ page }) => {
  await loadDataset(page, "golden");
  await navigateTo(page, "diagnosis");
  const panel = page.getByTestId("diagnosis-panel");
  await expect(panel).toBeVisible();
  // 通路寬表在健檢清單之前。
  const channelTable = page.locator("section[aria-labelledby='channel-table-heading']");
  await expect(channelTable).toBeVisible();
  expect(await channelTable.evaluate((table, list) => !!(table.compareDocumentPosition(list!) & Node.DOCUMENT_POSITION_FOLLOWING), await panel.elementHandle())).toBe(true);
  const rows = page.getByTestId("diagnosis-list").locator(":scope > li > details.diagnosis-row");
  // 合計與各通路合併成一列：六條規則各一列，依 |對貢獻影響| 由大到小。
  const order = ["REV_UP_CM_DOWN", "DISCOUNT_BURDEN_UP", "MARKETING_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "NEGATIVE_CHANNEL_CM"];
  await expect(rows).toHaveCount(order.length);
  expect(await rows.evaluateAll(list => list.map(row => row.getAttribute("data-testid")))).toEqual(order.map(code => `diagnosis-row-${code}`));
  await expect(rows.locator(":scope > summary .diagnosis-impact .impact-amount")).toHaveText(["-315.00", "-250.00", "-150.00", "-130.00", "-65.00", "-15.00"].map(value => formatSignedDelta(value, "L1")));
  await expect(page.locator(".diagnostic-card")).toHaveCount(0);
  // 前三列預設展開，第四列起收合；點 summary 可展開。
  for (let index = 0; index < order.length; index++) {
    if (index < 3) await expect(rows.nth(index)).toHaveAttribute("open", "");
    else await expect(rows.nth(index)).not.toHaveAttribute("open", "");
  }
  await rows.nth(3).locator(":scope > summary").click();
  await expect(rows.nth(3)).toHaveAttribute("open", "");
  await expect(rows.nth(3).getByRole("button", { name: labels.buttons.addToActions, exact: true })).toBeVisible();
  // 第一列：合計／MARKETPLACE／DTC 三個範圍合併；預設看合計。
  const first = rows.first();
  await expect(first.locator(":scope > summary .scope-tag")).toHaveText([labels.sections.total, "MARKETPLACE", "DTC"]);
  const chips = first.getByRole("group", { name: labels.diagnosisList.scopeSwitch });
  await expect(chips.getByRole("button")).toHaveText([labels.sections.total, "MARKETPLACE", "DTC"]);
  await expect(chips.getByRole("button", { name: labels.sections.total, exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(first.locator(".impact-line .impact-amount")).toHaveText(formatSignedDelta("-315.00", "L1"));
  const factButtons = first.locator(".fact-list .number-link");
  // 合計：扣廣告後貢獻 570.00 → 255.00；淨營收 2,250.00 → 2,470.00。
  await expect(factButtons).toHaveCount(4);
  const totalFacts = await factButtons.allTextContents();
  // 展開列的數據是 L2（整數元、千分位）。
  expect(totalFacts).toEqual(expect.arrayContaining(["570.00", "255.00", "2250.00", "2470.00"].map(value => formatAmountL2(value))));
  // 切到 MARKETPLACE：數據換成該通路（貢獻 170.00 → −15.00、淨營收 900.00 → 990.00），影響 −185.00；合計列的標題仍在 summary。
  await chips.getByRole("button", { name: "MARKETPLACE", exact: true }).click();
  await expect(chips.getByRole("button", { name: "MARKETPLACE", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(chips.getByRole("button", { name: labels.sections.total, exact: true })).toHaveAttribute("aria-pressed", "false");
  await expect(first.locator(".impact-line .impact-amount")).toHaveText(formatSignedDelta("-185.00", "L1"));
  await expect(first.locator(".diagnosis-body > h4")).toHaveText(fill(labels.diagnosisList.dataFor, { data: labels.sections.data, scope: "MARKETPLACE" }));
  await expect(first.locator(".diagnosis-scope-headline")).toBeVisible();
  expect(await factButtons.allTextContents()).toEqual(expect.arrayContaining(["170.00", "-15.00", "900.00", "990.00"].map(value => formatAmountL2(value))));
  await expect(first.locator(":scope > summary .impact-amount")).toHaveText(formatSignedDelta("-315.00", "L1"));
  // 技術細節預設收合；展開後才看到規則代號與指標版本。
  const technical = first.locator("details.diagnosis-technical");
  await expect(technical).not.toHaveAttribute("open", "");
  await technical.locator(":scope > summary").click();
  await expect(technical).toHaveAttribute("open", "");
  await expect(technical).toContainText("REV_UP_CM_DOWN");
  await expect(technical).toContainText("contribution-v1");
});

test("加入待辦一次點擊就到看板；看板按鈕改狀態、焦點留在卡片；清單檢視狀態一致", async ({ page }) => {
  await loadDataset(page, "golden");
  await navigateTo(page, "diagnosis");
  const first = page.getByTestId("diagnosis-list").locator(":scope > li > details.diagnosis-row").first();
  await expect(first).toHaveAttribute("open", "");
  await expect(first).toHaveAttribute("data-testid", "diagnosis-row-REV_UP_CM_DOWN");
  await resetClicks(page);
  await first.getByRole("button", { name: labels.buttons.addToActions, exact: true }).click();
  // 自動切到行動頁（預設看板），新卡在「未開始」欄：從健檢頁算只有 1 次點擊（≤ 2）。
  const card = page.getByTestId("board-card-1");
  await expect(card).toBeVisible();
  expect(await clicks(page)).toBe(1);
  await expect(page.getByTestId("actions-view-board")).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("board-column-not_started").getByTestId("board-card-1")).toBeVisible();
  await expect(card.getByRole("heading", { level: 4 })).not.toHaveText(board.untitled);
  for (const status of ["in_progress", "blocked", "completed"] as const) await expect(page.getByTestId(`board-card-1-move-${status}`)).toHaveText(fill(board.moveTo, { status: statusLabel[status] }));
  await expect(page.getByTestId("board-card-1-move-not_started")).toHaveCount(0);
  await expect(page.getByTestId("board-column-not_started").locator("h3")).toContainText(fill(board.columnCount, { n: 1 }));
  await expect(page.getByTestId("board-column-in_progress").locator("h3")).toContainText(fill(board.columnCount, { n: 0 }));

  // 看板改狀態：按「移到進行中」，卡片移欄、通知、焦點到卡片、狀態更新日期。
  await page.getByTestId("board-card-1-move-in_progress").click();
  await expect(page.getByTestId("board-column-in_progress").getByTestId("board-card-1")).toBeVisible();
  await expect(page.getByTestId("board-column-not_started").getByTestId("board-card-1")).toHaveCount(0);
  await expect(page.getByTestId("action-notice")).toHaveText(fill(board.moved, { n: 1, status: statusLabel.in_progress }));
  await expect(page.getByTestId("board-card-1")).toBeFocused();
  await expect(page.getByTestId("board-card-1")).toContainText(new RegExp(fill(board.statusUpdated, { date: "\\d{4}-\\d{2}-\\d{2}" })));
  await expect(page.getByTestId("board-column-in_progress").locator("h3")).toContainText(fill(board.columnCount, { n: 1 }));
  await expect(page.getByTestId("board-card-1-move-in_progress")).toHaveCount(0);

  // 清單檢視：同一項的狀態下拉是「進行中」；草稿帶入健檢第一列合計的 4 個數據（證據勾選清單）。
  await switchActionsView(page, "list");
  const item = page.getByTestId("action-1");
  await expect(item.getByLabel(labels.actions.status, { exact: true })).toHaveValue("in_progress");
  const checklist = item.getByTestId("evidence-checklist");
  await expect(checklist.locator("input[type=checkbox]:checked")).toHaveCount(4);
  await expect(item.getByLabel(labels.actions.due, { exact: true })).toHaveAttribute("type", "date");
  const listId = await item.getByLabel(labels.actions.owner, { exact: true }).getAttribute("list");
  expect(listId).toBeTruthy();
  await expect(page.locator(`datalist[id="${listId}"]`)).toHaveCount(1);
  // 清單改回「未開始」，回看板卡片也回到第一欄。
  await item.getByLabel(labels.actions.status, { exact: true }).selectOption("not_started");
  await switchActionsView(page, "board");
  await expect(page.getByTestId("board-column-not_started").getByTestId("board-card-1")).toBeVisible();
});

test("商品頁：Top／Bottom 小表看整個範圍、不跟著篩選；資料狀態用新文案", async ({ page }) => {
  await loadDataset(page, "golden");
  await navigateTo(page, "products");
  const worst = page.getByTestId("product-worst"), best = page.getByTestId("product-best"), table = page.getByTestId("product-table");
  await expect(page.locator("#product-highlights-heading")).toHaveText(labels.sections.productTopBottom);
  // 本期商品毛利由低到高：MARKETPLACE/B 125、DTC/B 200、MARKETPLACE/A 280、DTC/A 540；毛利增加：DTC/A +40、MARKETPLACE/A +10。
  const rowHeads = (root: Locator) => root.locator("tbody tr th").evaluateAll(cells => cells.map(cell => (cell.textContent ?? "").replace(/\s+/g, " ").trim()));
  expect(await rowHeads(worst)).toEqual(["B MARKETPLACE", "B DTC", "A MARKETPLACE", "A DTC"]);
  await expect(worst.locator("tbody tr td:nth-of-type(2)")).toHaveText(["125.00", "200.00", "280.00", "540.00"].map(value => formatAmountL2(value)));
  expect(await rowHeads(best)).toEqual(["A DTC", "A MARKETPLACE"]);
  await expect(best.locator("tbody tr td:nth-of-type(3)")).toHaveText(["40.00", "10.00"].map(value => formatSignedDelta(value, "L2")));
  // 小表不跟著下方篩選。
  await page.getByLabel(labels.ui.productComparisonPanel.searchSku, { exact: true }).fill("a");
  await expect(table.locator("tbody tr")).toHaveCount(2);
  expect(await rowHeads(worst)).toEqual(["B MARKETPLACE", "B DTC", "A MARKETPLACE", "A DTC"]);
  // 「全部商品」標題在篩選列之前；資料狀態欄用新文案。
  expect(await page.locator("#product-full-heading").evaluate(heading => !!(heading.compareDocumentPosition(document.querySelector(".product-filters")!) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
  await expect(table.locator("thead th").last()).toHaveText(highlight.columns.dataStatus);
  await expect(table.locator("tbody tr td:last-child")).toHaveText([highlight.status.both, highlight.status.both]);
});
