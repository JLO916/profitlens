import { expect, test, type Page } from "@playwright/test";
import { applyCustomPeriod, choosePreset, clickReplacing, dismissSavePrompt, isMobile, navigateTo, openCustomPeriod, openDetails, openPeriodSheet, openTopbarMore, periodSummary, periodSummaryText, periodSummaryVisibleText, periodToggleText, presetButton, sidebarNav } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";
import { MINUS, deltaTone, formatAmountL1, formatAmountL3, formatDateL1, formatSignedDelta, metricDefinitions } from "../../src/application/presentation";
import { AMOUNT_FIELDS } from "../../src/domain/types";

const aiLabelPrefix = labels.ui.dashboard.aiLabel.replace("{ai}", "");
// V3-3：示範資料（fixtures/demo/manifest.json）的「資料到」；頂欄資料狀態按鈕寫「示範資料 · 資料到 8/24」。
const DEMO_AS_OF = "2026-08-24";
const demoStatusButton = fill(labels.shell.dataStatus.button, { source: labels.status.demo, date: formatDateL1(DEMO_AS_OF, { anchor: DEMO_AS_OF }) });
// V3-3 期間列（period-summary）：示範資料載入後的預設範圍（v2 scopeNote 的「各 42 天」）與「近 7 天」快捷的範圍。
const DEFAULT_SUMMARY = periodSummaryText("2026-07-13", "2026-08-23", "2026-06-01", "2026-07-12", { anchor: DEMO_AS_OF });
const LAST7_SUMMARY = periodSummaryText("2026-08-17", "2026-08-23", "2026-08-10", "2026-08-16", { anchor: DEMO_AS_OF });

// R1 總覽重排與頁首減負：首屏 KPI、三件事一屏內、切頁歸零、頂欄 AI 標籤與選單、期間快捷（V3-3 起單擊即套用）。
async function loadDemo(page: Page) {
  await page.goto("/");
  await clickReplacing(page, page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }));
  // V3-2b：KPI 卡是 L1（萬、一位小數），golden 精確值 1269792.73 經 formatAmountL1 顯示；到分的值改在抽屜的精確值行。
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText(formatAmountL1("1269792.73"));
  // R6：首次載入資料時右下角出現非 modal 的保存提示（也是 role=dialog）；本檔不測自動保存，先選「先不要」。
  await expect(page.getByTestId("local-save-prompt")).toBeVisible();
  await dismissSavePrompt(page);
  await expect(page.getByTestId("local-save-prompt")).toHaveCount(0);
}
const box = async (page: Page, selector: string) => { const value = await page.locator(selector).first().boundingBox(); expect(value, `${selector} has a bounding box`).not.toBeNull(); return value!; };

test.describe("R1 overview first screen", () => {
  test("KPI cards fit the first screen and the top three are one page down", async ({ page }, testInfo) => {
    await loadDemo(page);
    const viewport = page.viewportSize()!;
    // V3-4a：五張卡改成一個 KPI 帶（C1）。
    const kpi = await box(page, "[data-testid='kpi-band']");
    if (["desktop", "laptop"].includes(testInfo.project.name)) expect(kpi.y + kpi.height, "KPI 區塊不捲動即可見").toBeLessThanOrEqual(viewport.height);
    const topThree = page.getByTestId("top-three");
    await expect(topThree).toBeVisible();
    const before = await box(page, "#top-three-title");
    if (before.y + before.height > viewport.height) {
      // V3-2a：390 寬的首屏要到 V3-3／V3-4 才重排（PRD §2.3 B）；在那之前手機允許兩次 PageDown，其他尺寸仍是一次。
      const allowed = testInfo.project.name === "mobile" ? 2 : 1;
      let after = before;
      for (let i = 0; i < allowed && after.y + after.height > viewport.height; i++) { await page.keyboard.press("PageDown"); await page.waitForTimeout(300); after = await box(page, "#top-three-title"); }
      expect(after.y, `三件事標題在 ${allowed} 次 PageDown 內`).toBeGreaterThanOrEqual(0);
      expect(after.y + after.height).toBeLessThanOrEqual(viewport.height);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    // V3-4b（§7.1）：本期一句話（含會議入口）→ KPI 帶 → 三件事 → 貢獻變化拆解（#bridge-title）→ 本期利潤結構（profit-waterfall）
    // → 趨勢與各通路（.pair；1440 並排、同一列頂端對齊；1280 以下上下排列）→ 其他常用指標 → 進階（期間合計與日均收在裡面）。
    const order = await page.evaluate(() => {
      const ids = ["[data-testid='weekly-snapshot']", "[data-testid='kpi-band']", "[data-testid='top-three']", "[aria-labelledby='bridge-title']", "[data-testid='profit-waterfall']", "[aria-labelledby='trend-title']", "[aria-labelledby='channel-title']", "[data-testid='assist-kpis']", "[data-testid='overview-advanced']"];
      return ids.map(selector => document.querySelector(selector)?.getBoundingClientRect().top ?? -1);
    });
    expect(order.every(top => top >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect(page.getByTestId("overview-advanced")).not.toHaveAttribute("open", /.*/);
    await expect(page.getByTestId("period-comparison")).not.toHaveAttribute("open", /.*/);
    await expect(page.getByTestId("weekly-snapshot").getByTestId("overview-meeting-entry")).toHaveCount(1);
    await expect(page.locator(".view-content .export-actions")).toHaveCount(0);
    await expect(page.locator(".view-content .ai-availability")).toHaveCount(0);
    // R6：會議稿搬到「會議紀錄」分頁，總覽頁尾只留一行入口（本期會議狀態＋前往按鈕），不再有收合的 overview-meeting。
    await expect(page.getByTestId("overview-meeting")).toHaveCount(0);
    const entry = page.getByTestId("overview-meeting-entry");
    await expect(entry).toContainText(fill(labels.overview.snapshotUi.meetingEntry, { state: labels.meeting.decisions.draft }));
    await expect(entry.getByRole("button")).toHaveCount(1);
    await expect(page.getByTestId("manager-summary")).toHaveCount(0);
    await entry.getByRole("button", { name: labels.meetingPage.goToMeeting }).click();
    await expect(page.getByTestId("meeting-page")).toBeVisible();
    // V3-3：手機側欄隱藏（改用底部分頁列），目前頁面一律讀側欄按鈕的 aria-current（sidebarNav 在手機上仍掛載）。
    await expect(sidebarNav(page, "meeting")).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("overview-meeting-entry")).toHaveCount(0);
  });

  test("top three show the contribution impact with unfavourable amounts in red", async ({ page }) => {
    await loadDemo(page);
    const first = page.getByTestId("top-three").locator("li[data-testid^='overview-priority-']").first();
    await expect(first).toContainText(labels.sections.impact);
    // V3-4a（C9 摘要型）：列的影響金額在 .alert-impact；列內收合的「相關範圍」另有各範圍的 L2 金額，不取那些。
    const amount = first.locator(".alert-impact .impact-amount");
    // V3-2b：三件事的影響金額是 L1 帶號差額（「−59.9 萬」，U+2212）；精確值在抽屜的 evidence-precise-value（L3 到分），兩者要同源。
    const shown = (await amount.textContent())!.trim();
    expect(shown).toMatch(new RegExp(`^[+${MINUS}]`));
    await expect(amount).toHaveClass(/negative|positive/);
    await expect(first.getByRole("button", { name: labels.buttons.viewEvidence, exact: true })).toBeVisible();
    await expect(first.getByRole("button", { name: labels.buttons.addToActions, exact: true })).toBeVisible();
    await amount.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(labels.sections.impact);
    const precise = (await page.getByRole("dialog").getByTestId("evidence-precise-value").textContent())!.trim();
    const exactValue = precise.replace(fill(labels.units.yuan, { value: "" }).trim(), "").trim().replaceAll(",", "").replace("+", "").replace(MINUS, "-");
    expect(precise).toBe(fill(labels.units.yuan, { value: formatSignedDelta(exactValue, "L3") }));
    expect(shown).toBe(formatSignedDelta(exactValue, "L1"));
    // 只有不利上色：class 依 deltaTone（對扣廣告後貢獻的影響），不依數學正負號。
    await expect(amount).toHaveClass(deltaTone("contribution_after_marketing", exactValue, "L1") === "unfavorable" ? /negative/ : /positive/);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("R1 shell", () => {
  test("switching pages scrolls to the top and focuses the main landmark", async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    // V3-3：桌機點側欄、手機點底部分頁列（navigateTo 依視窗選可見的控制）。
    await navigateTo(page, "diagnosis");
    await expect(page.getByRole("heading", { name: labels.nav.diagnosis.label, exact: true, level: 1 })).toBeVisible();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("main-content");
    await expect(page.getByRole("region", { name: labels.sections.channelTableAria, exact: true })).toBeVisible();
    // R5-1 健檢清單：一個規則一列（details.diagnosis-row），前三列預設展開，summary 帶「對貢獻影響」。
    const firstRow = page.getByTestId("diagnosis-list").locator("details.diagnosis-row").first();
    await expect(firstRow).toHaveAttribute("open", "");
    await expect(firstRow.locator(":scope > summary")).toContainText(labels.sections.impact);
  });

  test("AI status is a top-bar label whose explanation opens in a popover", async ({ page }) => {
    await page.goto("/");
    // V3-3 C7：頂欄 48px 單列，四種尺寸都一樣（v2 上限是桌機 120／手機 170）；手機的 AI／指標定義／儲存／匯出收進 topbar-more。
    expect(await page.locator("header.topbar").boundingBox().then(value => Math.round(value!.height)), "頂欄 48px").toBe(48);
    // 手機：AI 狀態在 topbar-more 裡（收起時 display:none），先展開；桌機不動。
    await openTopbarMore(page);
    const status = page.getByTestId("ai-availability");
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    const label = status.getByRole("button");
    await expect(label).toContainText(aiLabelPrefix);
    await expect(label).toHaveAttribute("aria-expanded", "false");
    await expect(status.locator("#ai-availability-detail")).toBeHidden();
    await label.click();
    await expect(label).toHaveAttribute("aria-expanded", "true");
    await expect(status.locator("#ai-availability-detail")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(status.locator("#ai-availability-detail")).toBeHidden();
    await expect(label).toBeFocused();
  });

  test("save and download live in top-bar menus and keep their test ids", async ({ page }) => {
    await loadDemo(page);
    // V3-3：手機的儲存／匯出選單在 topbar-more 裡（收起時 display:none），先展開；桌機不動。
    await openTopbarMore(page);
    const storage = page.getByTestId("workspace-storage");
    await expect(storage.locator(":scope > summary")).toContainText(labels.status.unsaved);
    await storage.locator(":scope > summary").click();
    await storage.getByRole("button", { name: labels.buttons.restorePreview, exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(storage.locator(":scope > summary")).toBeFocused();
    await expect(storage.getByRole("button", { name: labels.buttons.downloadBackup, exact: true })).toBeHidden();
    await storage.locator(":scope > summary").click();
    await expect(storage.getByRole("button", { name: labels.buttons.downloadBackup, exact: true })).toBeVisible();
    // V3-3：v2 頂欄的「清空」搬進儲存選單的危險區；全頁只有這一顆。
    await expect(storage.getByRole("button", { name: labels.buttons.clear, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: labels.buttons.clear, exact: true })).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(storage.getByRole("button", { name: labels.buttons.downloadBackup, exact: true })).toBeHidden();
    await openTopbarMore(page);
    const download = page.getByTestId("download-menu");
    // V3-3：選單摘要「下載」改名「匯出」；項目名稱不變。
    await expect(download.locator(":scope > summary")).toContainText(labels.shell.topbarV3.export);
    await download.locator("summary").click();
    await expect(download.getByRole("button", { name: labels.downloads.analysisCsv })).toBeVisible();
    const [file] = await Promise.all([page.waitForEvent("download"), download.getByRole("button", { name: labels.downloads.analysisCsv }).click()]);
    expect(file.suggestedFilename()).toBe("profitlens-analysis.csv");
    await page.keyboard.press("Escape");
    await expect(download.getByRole("button", { name: labels.downloads.analysisCsv })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    // V3-3：側欄的 .tiny-tag 移除；「示範資料」改由頂欄資料狀態按鈕呈現（v2 狀態文字在 sr-only 的 workspace-status）。
    await expect(page.locator(".sidebar .tiny-tag")).toHaveCount(0);
    await expect(page.getByTestId("data-status")).toHaveText(demoStatusButton);
    await expect(page.getByTestId("workspace-status")).toContainText(labels.status.demo);
    await expect(page).toHaveTitle(labels.brand.title);
  });

  test("period presets apply on one click; only custom dates need 套用", async ({ page }, testInfo) => {
    await loadDemo(page);
    // V3-3（D-V3-10＝A）：期間列單列；v2 的 .filter-bar／.scope-note 移除，套用中的範圍改由 period-summary 呈現。
    await expect(page.locator(".filter-bar, .scope-note")).toHaveCount(0);
    await expect(periodSummary(page)).toContainText(DEFAULT_SUMMARY);
    expect(await periodSummaryVisibleText(page)).toBe(DEFAULT_SUMMARY);
    if (isMobile(page)) await expect(page.getByTestId("period-toggle")).toHaveText(periodToggleText(null, "2026-07-13", "2026-08-23", { anchor: DEMO_AS_OF }));
    const monthly = presetButton(page, "monthVsPrev");
    await expect(monthly).toBeDisabled();
    await expect(monthly).toHaveAttribute("title", /2026-08-23/);
    await expect(monthly).toHaveAccessibleDescription(/2026-08-23/);
    await expect(presetButton(page, "last12w")).toBeDisabled();
    // 單擊快捷就套用：不按「套用」、自訂期間 popover 維持收合；表單日期同步成快捷的範圍。
    const summaryText = await choosePreset(page, "last7");
    expect(summaryText).toContain(LAST7_SUMMARY);
    await expect.poll(() => periodSummaryVisibleText(page)).toBe(LAST7_SUMMARY);
    await expect(page.locator("#previous-start")).toHaveValue("2026-08-10");
    await expect(page.locator("#previous-end")).toHaveValue("2026-08-16");
    await expect(page.locator("#current-start")).toHaveValue("2026-08-17");
    await expect(page.locator("#current-end")).toHaveValue("2026-08-23");
    await expect(presetButton(page, "last7")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId(isMobile(page) ? "period-toggle" : "period-custom")).toHaveAttribute("aria-expanded", "false");
    await expect(page.getByRole("button", { name: labels.buttons.apply, exact: true })).toBeHidden();
    if (isMobile(page)) await expect(page.getByTestId("period-toggle")).toHaveText(periodToggleText("last7", "2026-08-17", "2026-08-23", { anchor: DEMO_AS_OF }));
    // 自訂期間：改了日期、按「套用」之前，期間摘要不變；按了才套用，快捷不再 aria-pressed。
    const panel = await openCustomPeriod(page);
    await page.locator("#previous-start").fill("2026-08-03");
    await page.locator("#previous-end").fill("2026-08-09");
    await page.locator("#current-start").fill("2026-08-10");
    await page.locator("#current-end").fill("2026-08-16");
    expect(await periodSummaryVisibleText(page)).toBe(LAST7_SUMMARY);
    await panel.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
    const customSummary = periodSummaryText("2026-08-10", "2026-08-16", "2026-08-03", "2026-08-09", { anchor: DEMO_AS_OF });
    await expect.poll(() => periodSummaryVisibleText(page)).toBe(customSummary);
    await expect(page.getByTestId(isMobile(page) ? "period-toggle" : "period-custom")).toHaveAttribute("aria-expanded", "false");
    await expect(presetButton(page, "last7")).toHaveAttribute("aria-pressed", "false");
    if (isMobile(page)) await expect(page.getByTestId("period-toggle")).toHaveText(periodToggleText(null, "2026-08-10", "2026-08-16", { anchor: DEMO_AS_OF }));
    const bar = await box(page, "[data-testid='period-bar']");
    if ((page.viewportSize()?.width ?? 0) > 640) {
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(100);
      const stuck = await box(page, "[data-testid='period-bar']");
      const topbar = await box(page, "header.topbar");
      // V3-3：頂欄也是 sticky（48px），期間列貼在頂欄下緣。
      expect(topbar.y, "頂欄 sticky 貼在頂端").toBeLessThanOrEqual(1);
      expect(Math.abs(stuck.y - (topbar.y + topbar.height)), "期間列 sticky 貼在頂欄下緣").toBeLessThanOrEqual(1);
      if (["desktop", "laptop"].includes(testInfo.project.name)) expect(bar.height, "期間列在 1280 以上單列").toBeLessThanOrEqual(56);
    }
  });
});

// ── V3-3 殼層驗收（PRD §7.0 殼層、§2.3 B） ──
/** 看得到才回傳框（checkVisibility＋寬度 > 0）；手機收起的 topbar-more 內容是 display:none，會回傳 null。 */
const visibleBox = (page: Page, selector: string) => page.locator(selector).first().evaluate(element => { const rect = element.getBoundingClientRect(); return element.checkVisibility() && rect.width > 0 ? { top: rect.top, bottom: rect.bottom } : null; });

test.describe("V3-3 shell acceptance", () => {
  test("top bar is one 48px row with a single visible 示範資料", async ({ page }, testInfo) => {
    await loadDemo(page);
    const topbar = await box(page, "header.topbar");
    expect(Math.round(topbar.height), "頂欄 48px").toBe(48);
    // 單列：頂欄裡每個看得到的控制都落在 48px 之內（沒有折到第二列）。手機右側只剩資料狀態與 topbar-more。
    const controls = isMobile(page)
      ? ["header.topbar .brand", "[data-testid='data-status']", "[data-testid='topbar-more']"]
      : ["header.topbar .brand", "[data-testid='data-status']", "[data-testid='ai-availability'] button", `header.topbar button[aria-label='${labels.buttons.basis}']`, "[data-testid='workspace-storage'] > summary", "[data-testid='download-menu'] > summary"];
    for (const selector of controls) {
      const value = await visibleBox(page, selector);
      expect(value, `${selector} 在頂欄可見`).not.toBeNull();
      expect(value!.top, `${selector} 在頂欄第一列`).toBeGreaterThanOrEqual(topbar.y);
      expect(value!.bottom, `${selector} 在頂欄第一列`).toBeLessThanOrEqual(topbar.y + topbar.height);
    }
    if (!isMobile(page)) {
      // 768 以上（含 1280）：品牌與「匯出」同一列（垂直中心對齊）。
      const brand = (await visibleBox(page, "header.topbar .brand"))!, exportButton = (await visibleBox(page, "[data-testid='download-menu'] > summary"))!;
      expect(Math.abs((brand.top + brand.bottom) / 2 - (exportButton.top + exportButton.bottom) / 2), `${testInfo.project.name}：品牌與匯出同一列`).toBeLessThanOrEqual(2);
      await expect(page.getByTestId("download-menu").locator(":scope > summary")).toContainText(labels.shell.topbarV3.export);
    }
    // §6.3 #9：頂欄可見的「示範資料」只有一處（資料狀態按鈕）；sr-only 的 workspace-status 與收合的 popover 不算。
    const visibleDemo = await page.locator("header.topbar").evaluate((root, text) => {
      const shown = (element: Element) => element.checkVisibility() && !element.closest(".sr-only, [hidden]") && element.getBoundingClientRect().width > 1;
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let count = 0;
      for (let node = walker.nextNode(); node; node = walker.nextNode()) if (node.textContent?.includes(text) && node.parentElement && shown(node.parentElement)) count++;
      return count;
    }, labels.status.demo);
    expect(visibleDemo, "頂欄可見的「示範資料」只有一處").toBe(1);
    await expect(page.getByTestId("data-status")).toHaveText(demoStatusButton);
  });

  test("first screen budget: 1440 chrome ends by 152px, 390 first KPI value by 360px", async ({ page }, testInfo) => {
    await loadDemo(page);
    // v2 頁首的 eyebrow、麵包屑、模式徽章、側欄說明／頁尾、.tiny-tag、.scope-note、.preset-reason、.filter-bar 都移除（§7.0；區塊內的 eyebrow 屬 V3-4）。
    await expect(page.locator(".page-heading .eyebrow, header.topbar .eyebrow, .breadcrumb, .mode-badge, .sidebar-note, .sidebar-footer, .tiny-tag, .scope-note, .preset-reason, .filter-bar")).toHaveCount(0);
    if (testInfo.project.name === "desktop") {
      const topbar = await box(page, "header.topbar"), heading = await box(page, "main .page-heading"), bar = await box(page, "[data-testid='period-bar']");
      expect(heading.y, "頁首在頂欄下").toBeGreaterThanOrEqual(topbar.y + topbar.height - 1);
      expect(bar.y, "期間列在頁首下").toBeGreaterThanOrEqual(heading.y + heading.height - 1);
      expect(bar.y + bar.height, "1440：頂欄＋頁首＋期間列底緣 ≤ 152px").toBeLessThanOrEqual(152);
    }
    if (testInfo.project.name === "mobile") {
      // V3-4a（§2.3 B）：390 的 KPI 帶改成清單，扣廣告後貢獻放第一列；量它的數字頂端。
      const top = await page.evaluate(() => { const value = document.querySelector("[data-testid='kpi-contribution_after_marketing'] .kpi-value"); return value && value.checkVisibility() ? value.getBoundingClientRect().top : null; });
      expect(top, "390：扣廣告後貢獻的數字可見").not.toBeNull();
      expect(top!, "390：扣廣告後貢獻數字 top ≤ 360px").toBeLessThanOrEqual(360);
    }
  });

  test("import wizard is two clicks away from the overview", async ({ page }) => {
    await loadDemo(page);
    await expect(sidebarNav(page, "overview")).toHaveAttribute("aria-current", "page");
    // 頁首的「匯入資料」只在資料來源頁；總覽從頂欄資料狀態進：資料狀態 → 匯入新資料（2 次點擊）。
    await expect(page.getByTestId("page-import")).toHaveCount(0);
    await page.getByTestId("data-status").click();
    await expect(page.getByTestId("data-status-popover")).toBeVisible();
    await page.getByTestId("data-status-import").click();
    await expect(page.getByTestId("import-wizard")).toBeVisible();
    await expect(page.getByTestId("data-status-popover")).toBeHidden();
  });

  test("data-status and custom-period popovers close on Esc and return focus", async ({ page }) => {
    await loadDemo(page);
    const status = page.getByTestId("data-status");
    await status.click();
    await expect(status).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByTestId("data-status-popover")).toBeVisible();
    await page.getByTestId("data-status-import").focus();
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("data-status-popover")).toBeHidden();
    await expect(status).toHaveAttribute("aria-expanded", "false");
    await expect(status).toBeFocused();
    // 自訂期間：桌機是 period-custom 的 popover；手機是 period-toggle 的底部面板（同一份表單）。
    const trigger = page.getByTestId(isMobile(page) ? "period-toggle" : "period-custom");
    const panel = await openCustomPeriod(page);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await page.locator("#previous-start").focus();
    await page.keyboard.press("Escape");
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    await expect(panel).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test("main has at most 10 focusable controls before the first KPI at 1440", async ({ page }, testInfo) => {
    await loadDemo(page);
    const focusables = await page.evaluate(() => {
      const main = document.querySelector("main")!, kpi = main.querySelector("[data-testid^='kpi-']")!;
      return [...main.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, summary, [tabindex]")]
        .filter(element => (element.compareDocumentPosition(kpi) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0 && !kpi.contains(element))
        .filter(element => element.tabIndex >= 0 && !(element as HTMLButtonElement).disabled && element.checkVisibility() && element.getBoundingClientRect().width > 1)
        .map(element => element.getAttribute("aria-label") || element.textContent?.trim() || element.tagName);
    });
    testInfo.annotations.push({ type: "focusable-before-first-kpi", description: `${focusables.length}: ${focusables.join(" | ")}` });
    console.log(`[V3-3] focusable before first KPI @${testInfo.project.name} = ${focusables.length}: ${focusables.join(" | ")}`);
    // §2.3 B 的預算只定在 1440（desktop）；其他尺寸只記錄數值。
    if (testInfo.project.name === "desktop") expect(focusables.length, "1440：第一個 KPI 之前 main 內可聚焦元素 ≤ 10").toBeLessThanOrEqual(10);
  });
});

// ── V3-4b 圖表段（PRD §7.1 第 5–8 點、§9.4 C16／C17、§9.5、§10.3）：固定高的圖表框（CLS）、瀑布與表格共用抽屜、平衡檢核 ──
const evidenceDrawer = (page: Page) => page.getByRole("dialog", { name: new RegExp(`${labels.sections.evidence}$`) });
/** 抽屜標題：「{title} · 計算與來源」。 */
const evidenceHeading = (title: string) => `${title} · ${labels.sections.evidence}`;
/** 四個圖表框：拆解與利潤結構是瀑布（.chart-frame.waterfall），趨勢與各通路是 C16 的 .chart-frame.sm。 */
const CHART_FRAMES = ["[data-testid='bridge-section'] .chart-frame", "[data-testid='profit-waterfall'] .chart-frame", "[data-testid='trend'] .chart-frame", "[data-testid='channel-mix'] .chart-frame"] as const;
const chartFrameHeights = (page: Page) => Promise.all(CHART_FRAMES.map(async selector => (await box(page, selector)).height));
/** 含 {占位符} 的標籤模板 → 正規式片段（占位符換成非空字串）。 */
const templateSource = (template: string) => template.split(/\{[^}]+\}/).map(part => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".+?");
const profitTitlePattern = new RegExp(`^(?:${templateSource(labels.overview.profit.title.positive)}|${templateSource(labels.overview.profit.title.negative)})$`);
/** 「每 100 元淨營收」句型的固定字：positive／negative 兩個模板在占位符之前的共同前綴。 */
const profitTitleFixed = (() => {
  const [a, b] = [labels.overview.profit.title.positive, labels.overview.profit.title.negative].map(template => template.split("{")[0]);
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return a.slice(0, i);
})();
type ShiftState = { cls: number; all: number; observer: PerformanceObserver };

test.describe("V3-4b charts", () => {
  test("切換期間前後圖表容器等高、CLS < 0.05", async ({ page }, testInfo) => {
    await loadDemo(page);
    await expect(page.locator("main .chart-frame")).toHaveCount(CHART_FRAMES.length);
    const before = await chartFrameHeights(page);
    expect(before.every(height => height > 0), "四個圖表框都有高度").toBe(true);
    // 只累加非使用者輸入造成的位移（hadRecentInput 為 false，與 CLS 的定義相同）；另記錄含輸入後 500ms 內的全部位移，只供參考。
    await page.evaluate(() => {
      const holder = window as unknown as { __v34bShift: ShiftState };
      const observer = new PerformanceObserver(list => {
        for (const entry of list.getEntries() as unknown as { value: number; hadRecentInput: boolean }[]) { holder.__v34bShift.all += entry.value; if (!entry.hadRecentInput) holder.__v34bShift.cls += entry.value; }
      });
      holder.__v34bShift = { cls: 0, all: 0, observer };
      observer.observe({ type: "layout-shift", buffered: false });
    });
    // 手機：期間列收成 period-toggle，快捷在底部面板裡（先開面板；choosePreset 點完會等面板收起）。桌機不動。
    await openPeriodSheet(page);
    expect(await choosePreset(page, "last7")).toContain(LAST7_SUMMARY);
    await expect.poll(() => periodSummaryVisibleText(page)).toBe(LAST7_SUMMARY);
    await expect(page.getByTestId("period-bar")).not.toHaveAttribute("aria-busy", "true");
    expect(await chartFrameHeights(page), "近 7 天：四個圖表框高度不變").toEqual(before);
    // 示範資料載入時的預設範圍（各 42 天）不是任何一個快捷：用自訂期間套回原範圍。
    await applyCustomPeriod(page, { previousStart: "2026-06-01", previousEnd: "2026-07-12", currentStart: "2026-07-13", currentEnd: "2026-08-23" });
    await expect.poll(() => periodSummaryVisibleText(page)).toBe(DEFAULT_SUMMARY);
    await expect(page.getByTestId("period-bar")).not.toHaveAttribute("aria-busy", "true");
    await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText(formatAmountL1("1269792.73"));
    const shift = await page.evaluate(() => {
      const state = (window as unknown as { __v34bShift: ShiftState }).__v34bShift;
      for (const entry of state.observer.takeRecords() as unknown as { value: number; hadRecentInput: boolean }[]) { state.all += entry.value; if (!entry.hadRecentInput) state.cls += entry.value; }
      state.observer.disconnect();
      return { cls: state.cls, all: state.all };
    });
    testInfo.annotations.push({ type: "v3-4b-period-switch-cls", description: `cls=${shift.cls.toFixed(4)} all=${shift.all.toFixed(4)}` });
    console.log(`[V3-4b] period switch CLS @${testInfo.project.name}: cls=${shift.cls.toFixed(4)} (incl. shifts after input: ${shift.all.toFixed(4)})`);
    expect(shift.cls, "切換期間的累積版面位移 < 0.05").toBeLessThan(0.05);
    expect(await chartFrameHeights(page), "套回原範圍：四個圖表框高度與切換前相同").toEqual(before);
  });

  test("瀑布與表格共用抽屜", async ({ page }) => {
    await loadDemo(page);
    const dialog = evidenceDrawer(page);
    const heading = dialog.getByRole("heading", { level: 2 });
    // 貢獻變化拆解：橋接表第一個差額列（九項的第一項）→ 抽屜「{指標}拆解差額」；Esc 關閉後焦點回到該 number-link。
    const bridgeTable = page.getByTestId("bridge-table");
    const firstDelta = bridgeTable.locator("tbody tr[data-row]").nth(1);
    await expect(firstDelta).toHaveAttribute("data-row", AMOUNT_FIELDS[0]);
    const bridgeTitle = evidenceHeading(fill(labels.overview.page.bridgeRowTitle, { metric: metricDefinitions[AMOUNT_FIELDS[0]].label }));
    const bridgeLink = firstDelta.locator(".number-link");
    await bridgeLink.click();
    await expect(dialog).toBeVisible();
    await expect(heading).toHaveText(bridgeTitle);
    const bridgePrecise = (await dialog.getByTestId("evidence-precise-value").textContent())!.trim();
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(bridgeLink).toBeFocused();
    // 瀑布（aria-hidden 的視覺層）：第 1 根是上期，第 2 根是九項的第一項；點柱與點表格列是同一個抽屜（同標題、同精確值）。
    await page.getByTestId("bridge-waterfall").locator("rect.wf-bar").nth(1).click();
    await expect(dialog).toBeVisible();
    await expect(heading).toHaveText(bridgeTitle);
    await expect(dialog.getByTestId("evidence-precise-value")).toHaveText(bridgePrecise);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // 本期利潤結構：資料表在收合的 <details> 裡，先展開；扣廣告後貢獻列的 number-link 與同名的瀑布柱開出同一個抽屜（合計＝示範資料本期 1269792.73）。
    const profit = page.getByTestId("profit-waterfall");
    await openDetails(profit.locator("details.data-alternative"));
    const resultLink = profit.locator("tr[data-row='contribution_after_marketing'] .number-link");
    const profitTitle = evidenceHeading(metricDefinitions.contribution_after_marketing.label);
    const profitPrecise = fill(labels.units.yuan, { value: formatAmountL3("1269792.73") });
    await resultLink.click();
    await expect(dialog).toBeVisible();
    await expect(heading).toContainText(metricDefinitions.contribution_after_marketing.label);
    await expect(heading).toHaveText(profitTitle);
    await expect(dialog.getByTestId("evidence-precise-value")).toHaveText(profitPrecise);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(resultLink).toBeFocused();
    await page.getByTestId("profit-waterfall-bar-contribution_after_marketing").click();
    await expect(dialog).toBeVisible();
    await expect(heading).toHaveText(profitTitle);
    await expect(dialog.getByTestId("evidence-precise-value")).toHaveText(profitPrecise);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // 範圍分段按鈕：合計＋各通路（示範資料兩個通路）；切到第二個通路，標題（每 100 元淨營收句型）跟著改變。
    const scope = page.getByTestId("profit-waterfall-scope").getByRole("button");
    await expect(scope).toHaveCount(3);
    await expect(scope.first()).toHaveText(labels.overview.profit.scope.all);
    await expect(scope.first()).toHaveAttribute("aria-pressed", "true");
    const title = page.locator("#profit-title");
    await expect(title).toHaveText(profitTitlePattern);
    const totalTitle = (await title.textContent())!.trim();
    await scope.nth(2).click();
    await expect(scope.nth(2)).toHaveAttribute("aria-pressed", "true");
    await expect(scope.first()).toHaveAttribute("aria-pressed", "false");
    await expect(title).not.toHaveText(totalTitle);
    await expect(title).toContainText(profitTitleFixed);
    await expect(title).toHaveText(profitTitlePattern);
    // 範圍切換只影響本圖：KPI 帶仍是全部通路的本期扣廣告後貢獻。
    await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText(formatAmountL1("1269792.73"));
  });

  test("平衡檢核", async ({ page }) => {
    await loadDemo(page);
    const balance = page.getByTestId("bridge-balance-check");
    await expect(balance.locator("th")).toHaveText(labels.overview.bridgeV3.balance.label);
    // 九項加總＝兩期扣廣告後貢獻差額：「已平衡（差 0.00）」（差額是 L3 到分的絕對值；與 bridgeWaterfall 的 balanceText 同一個模板）。
    await expect(balance.locator("td")).toHaveText(fill(labels.overview.bridgeV3.balance.balanced, { difference: formatAmountL3("0.00") }));
    await expect(balance.locator(".bridge-balance")).toHaveAttribute("data-tone", "balanced");
  });
});
