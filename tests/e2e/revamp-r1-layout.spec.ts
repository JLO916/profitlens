import { expect, test, type Page } from "@playwright/test";
import { clickReplacing } from "./replacement-helpers";
import { labels } from "../../src/i18n";

// R1 總覽重排與頁首減負：首屏 KPI、三件事一屏內、切頁歸零、頂欄 AI 標籤與選單、期間快捷只填日期。
async function loadDemo(page: Page) {
  await page.goto("/");
  await clickReplacing(page, page.getByRole("button", { name: "載入示範資料", exact: true }));
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText("1,269,792.73");
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
    const order = await page.evaluate(() => {
      const ids = ["[aria-label='本期關鍵數字']", "[data-testid='top-three']", "[aria-labelledby='trend-title']", "[aria-labelledby='bridge-title']", "[data-testid='period-comparison']", "[data-testid='overview-meeting']"];
      return ids.map(selector => document.querySelector(selector)?.getBoundingClientRect().top ?? -1);
    });
    expect(order.every(top => top >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect(page.getByTestId("period-comparison")).not.toHaveAttribute("open", /.*/);
    await expect(page.getByTestId("overview-meeting")).not.toHaveAttribute("open", /.*/);
    await expect(page.locator(".view-content .export-actions")).toHaveCount(0);
    await expect(page.locator(".view-content .ai-availability")).toHaveCount(0);
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
    await page.getByRole("button", { name: "通路診斷", exact: true }).click();
    await expect(page.getByRole("heading", { name: "通路診斷", exact: true, level: 1 })).toBeVisible();
    await page.waitForTimeout(100);
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("main-content");
    await expect(page.getByRole("region", { name: "通路寬表", exact: true })).toBeVisible();
    await expect(page.locator(".diagnostic-card").first()).toContainText(labels.sections.impact);
  });

  test("AI status is a top-bar label whose explanation opens in a popover", async ({ page }) => {
    await page.goto("/");
    const status = page.getByTestId("ai-availability");
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute("role", "status");
    await expect(status).toHaveAttribute("aria-live", "polite");
    const label = status.getByRole("button");
    await expect(label).toContainText("規則診斷可用");
    await expect(label).toHaveAttribute("aria-expanded", "false");
    await expect(status.locator("#ai-availability-detail")).toBeHidden();
    await label.click();
    await expect(label).toHaveAttribute("aria-expanded", "true");
    await expect(status.locator("#ai-availability-detail")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(status.locator("#ai-availability-detail")).toBeHidden();
    await expect(label).toBeFocused();
    expect(await page.locator("header.topbar").boundingBox().then(value => value!.height)).toBeLessThanOrEqual(120);
  });

  test("save and download live in top-bar menus and keep their test ids", async ({ page }) => {
    await loadDemo(page);
    const storage = page.getByTestId("workspace-storage");
    await expect(storage.locator("summary")).toContainText(labels.status.unsaved);
    await storage.locator("summary").click();
    await storage.getByRole("button", { name: "讀取本機副本預覽", exact: true }).focus();
    await page.keyboard.press("Escape");
    await expect(storage.locator("summary")).toBeFocused();
    await expect(storage.getByRole("button", { name: "下載完整工作區備份", exact: true })).toBeHidden();
    await storage.locator("summary").click();
    await expect(storage.getByRole("button", { name: "下載完整工作區備份", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(storage.getByRole("button", { name: "下載完整工作區備份", exact: true })).toBeHidden();
    const download = page.getByTestId("download-menu");
    await download.locator("summary").click();
    await expect(download.getByRole("button", { name: "下載目前分析 CSV" })).toBeVisible();
    const [file] = await Promise.all([page.waitForEvent("download"), download.getByRole("button", { name: "下載目前分析 CSV" }).click()]);
    expect(file.suggestedFilename()).toBe("profitlens-analysis.csv");
    await page.keyboard.press("Escape");
    await expect(download.getByRole("button", { name: "下載目前分析 CSV" })).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await expect(page.locator(".sidebar .tiny-tag")).toHaveText(labels.status.demo);
    await expect(page).toHaveTitle("ProfitLens｜電商獲利診斷與決策工作台");
  });

  test("period presets only fill the form until 套用期間 is pressed", async ({ page }, testInfo) => {
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
    await expect(page.getByRole("button", { name: "套用期間", exact: true })).toBeFocused();
    await expect(page.locator(".scope-note")).toContainText("前期 42 天／本期 42 天");
    await page.getByRole("button", { name: "套用期間", exact: true }).click();
    await expect(page.locator(".scope-note")).toContainText("前期 7 天／本期 7 天");
    await expect(page.locator(".scope-note")).toContainText("本期 2026-08-17 — 2026-08-23");
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
