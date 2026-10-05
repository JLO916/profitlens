import { expect, test, type Page } from "@playwright/test";
import { clickReplacing, dismissSavePrompt } from "./replacement-helpers";
import { fill, labels } from "../../src/i18n";

// R2 文案接線：期間列的範圍說明由 labels.ui.dashboard.scopeNote 模板組成，這裡只取測試關心的片段再填值。
const scopeNoteDays = (previousDays: number, currentDays: number) => fill(labels.ui.dashboard.scopeNote.match(/（(.*?)）/)![1], { previousDays, currentDays });
// V3-2a：scopeNote 改為「本期…對比 上期…（天數）」單句、不再用分隔符串接，本期片段改由 {currentStart}…{currentEnd} 連同前一個詞取出。
const scopeNoteCurrent = (currentStart: string, currentEnd: string) => fill(labels.ui.dashboard.scopeNote.match(/\S*\s*\{currentStart\}[^{]*\{currentEnd\}/)![0], { currentStart, currentEnd });
const aiLabelPrefix = labels.ui.dashboard.aiLabel.replace("{ai}", "");

// R1 總覽重排與頁首減負：首屏 KPI、三件事一屏內、切頁歸零、頂欄 AI 標籤與選單、期間快捷只填日期。
async function loadDemo(page: Page) {
  await page.goto("/");
  await clickReplacing(page, page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }));
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("1,269,792.73");
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
    const kpi = await box(page, `[aria-label="${labels.sections.kpis}"]`);
    if (["desktop", "laptop"].includes(testInfo.project.name)) expect(kpi.y + kpi.height, "KPI 區塊不捲動即可見").toBeLessThanOrEqual(viewport.height);
    const topThree = page.getByTestId("top-three");
    await expect(topThree).toBeVisible();
    const before = await box(page, "#top-three-title");
    if (before.y + before.height > viewport.height) {
      await page.keyboard.press("PageDown");
      await page.waitForTimeout(300);
      const after = await box(page, "#top-three-title");
      expect(after.y, "三件事標題在一次 PageDown 內").toBeGreaterThanOrEqual(0);
      expect(after.y + after.height).toBeLessThanOrEqual(viewport.height);
      await page.evaluate(() => window.scrollTo(0, 0));
    }
    const order = await page.evaluate((kpiLabel) => {
      const ids = [`[aria-label='${kpiLabel}']`, "[data-testid='top-three']", "[aria-labelledby='trend-title']", "[aria-labelledby='bridge-title']", "[data-testid='period-comparison']", "[data-testid='overview-meeting-entry']"];
      return ids.map(selector => document.querySelector(selector)?.getBoundingClientRect().top ?? -1);
    }, labels.sections.kpis);
    expect(order.every(top => top >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect(page.getByTestId("period-comparison")).not.toHaveAttribute("open", /.*/);
    await expect(page.locator(".view-content .export-actions")).toHaveCount(0);
    await expect(page.locator(".view-content .ai-availability")).toHaveCount(0);
    // R6：會議稿搬到「會議紀錄」分頁，總覽頁尾只留一行入口（本期會議狀態＋前往按鈕），不再有收合的 overview-meeting。
    await expect(page.getByTestId("overview-meeting")).toHaveCount(0);
    const entry = page.getByTestId("overview-meeting-entry");
    await expect(entry).toContainText(fill(labels.meetingPage.entry, { state: labels.meeting.decisions.draft }));
    await expect(entry.getByRole("button")).toHaveCount(1);
    await expect(page.getByTestId("manager-summary")).toHaveCount(0);
    await entry.getByRole("button", { name: labels.meetingPage.goToMeeting }).click();
    await expect(page.getByTestId("meeting-page")).toBeVisible();
    await expect(page.getByRole("button", { name: labels.nav.meeting.label, exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("overview-meeting-entry")).toHaveCount(0);
  });

  test("top three show the contribution impact with unfavourable amounts in red", async ({ page }) => {
    await loadDemo(page);
    const first = page.getByTestId("top-three").locator("li[data-testid^='overview-priority-']").first();
    await expect(first).toContainText(labels.sections.impact);
    const amount = first.locator(".impact-amount").first();
    await expect(amount).toHaveText(/^[-+]\d{1,3}(,\d{3})*\.\d{2}$/);
    await expect(amount).toHaveClass(/negative|positive/);
    await expect(first.getByRole("button", { name: labels.buttons.viewEvidence, exact: true })).toBeVisible();
    await expect(first.getByRole("button", { name: labels.buttons.addToActions, exact: true })).toBeVisible();
    await amount.click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("dialog")).toContainText(labels.sections.impact);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  });
});

test.describe("R1 shell", () => {
  test("switching pages scrolls to the top and focuses the main landmark", async ({ page }) => {
    await loadDemo(page);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(0);
    await page.getByRole("button", { name: labels.nav.diagnosis.label, exact: true }).click();
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

  test("AI status is a top-bar label whose explanation opens in a popover", async ({ page }, testInfo) => {
    await page.goto("/");
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
    // 頂欄高度上限：桌機兩列內；平板／手機允許狀態列、徽章與選單各自換行（三列）。
    const topbarLimit = { desktop: 120, laptop: 120, tablet: 160, mobile: 170 }[testInfo.project.name] ?? 170;
    expect(await page.locator("header.topbar").boundingBox().then(value => value!.height)).toBeLessThanOrEqual(topbarLimit);
  });

  test("save and download live in top-bar menus and keep their test ids", async ({ page }) => {
    await loadDemo(page);
    const storage = page.getByTestId("workspace-storage");
    await expect(storage.locator(":scope > summary")).toContainText(labels.status.unsaved);
    await storage.locator(":scope > summary").click();
    await storage.getByRole("button", { name: labels.buttons.restorePreview, exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(storage.locator(":scope > summary")).toBeFocused();
    await expect(storage.getByRole("button", { name: labels.buttons.downloadBackup, exact: true })).toBeHidden();
    await storage.locator(":scope > summary").click();
    await expect(storage.getByRole("button", { name: labels.buttons.downloadBackup, exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(storage.getByRole("button", { name: labels.buttons.downloadBackup, exact: true })).toBeHidden();
    const download = page.getByTestId("download-menu");
    await download.locator("summary").click();
    await expect(download.getByRole("button", { name: labels.downloads.analysisCsv })).toBeVisible();
    const [file] = await Promise.all([page.waitForEvent("download"), download.getByRole("button", { name: labels.downloads.analysisCsv }).click()]);
    expect(file.suggestedFilename()).toBe("profitlens-analysis.csv");
    await page.keyboard.press("Escape");
    await expect(download.getByRole("button", { name: labels.downloads.analysisCsv })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.locator(".sidebar .tiny-tag")).toHaveText(labels.status.demo);
    await expect(page).toHaveTitle(labels.brand.title);
  });

  test("period presets only fill the form until 套用 is pressed", async ({ page }, testInfo) => {
    await loadDemo(page);
    const group = page.getByRole("group", { name: labels.sections.presetGroup });
    const monthly = group.getByRole("button", { name: labels.periods.presets.monthVsPrev, exact: true });
    await expect(monthly).toBeDisabled();
    await expect(monthly).toHaveAttribute("title", /2026-08-23/);
    await expect(monthly).toHaveAccessibleDescription(/2026-08-23/);
    await expect(group.getByRole("button", { name: labels.periods.presets.last12w, exact: true })).toBeDisabled();
    await group.getByRole("button", { name: labels.periods.presets.last7, exact: true }).click();
    await expect(page.locator("#previous-start")).toHaveValue("2026-08-10");
    await expect(page.locator("#previous-end")).toHaveValue("2026-08-16");
    await expect(page.locator("#current-start")).toHaveValue("2026-08-17");
    await expect(page.locator("#current-end")).toHaveValue("2026-08-23");
    await expect(page.getByRole("button", { name: labels.buttons.apply, exact: true })).toBeFocused();
    await expect(page.locator(".scope-note")).toContainText(scopeNoteDays(42, 42));
    await page.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
    await expect(page.locator(".scope-note")).toContainText(scopeNoteDays(7, 7));
    await expect(page.locator(".scope-note")).toContainText(scopeNoteCurrent("2026-08-17", "2026-08-23"));
    await expect(group.getByRole("button", { name: labels.periods.presets.last7, exact: true })).toHaveAttribute("aria-pressed", "true");
    const bar = await box(page, ".filter-bar");
    if ((page.viewportSize()?.width ?? 0) > 640) {
      await page.evaluate(() => window.scrollTo(0, 600));
      await page.waitForTimeout(100);
      const stuck = await box(page, ".filter-bar");
      expect(stuck.y, "期間列 sticky 貼在頂端").toBeLessThanOrEqual(1);
      if (["desktop", "laptop"].includes(testInfo.project.name)) expect(bar.height, "期間列在 1280 以上最多兩行").toBeLessThanOrEqual(100);
    }
  });
});
