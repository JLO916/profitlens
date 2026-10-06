import { expect, test, type Page } from "@playwright/test";
import { choosePreset, clickReplacing, dismissSavePrompt, isMobile, navigateTo, openCustomPeriod, openTopbarMore, periodSummary, periodSummaryText, periodSummaryVisibleText, periodToggleText, presetButton, sidebarNav } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";
import { MINUS, deltaTone, formatAmountL1, formatDateL1, formatSignedDelta } from "../../src/application/presentation";

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
    // V3-4a（§7.1）：本期一句話（含會議入口）→ KPI 帶 → 三件事 → 趨勢 → 拆解 → 其他常用指標 → 進階（期間合計與日均收在裡面）。
    const order = await page.evaluate(() => {
      const ids = ["[data-testid='weekly-snapshot']", "[data-testid='kpi-band']", "[data-testid='top-three']", "[aria-labelledby='trend-title']", "[aria-labelledby='bridge-title']", "[data-testid='assist-kpis']", "[data-testid='overview-advanced']"];
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
