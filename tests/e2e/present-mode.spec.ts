import { expect, test, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { isMobile, navigateTo, openMeeting, sidebarNav } from "./replacement-helpers";
import { enterPresent, expectMountedHidden, expectPresentOff, expectPresentOn, expectedPresentPeriod, htmlRoot, loadDemoForPresent, presentMetrics, presentToggle, rootToken } from "./present-helpers-v39";

/*
 * V3-9b F22 投影模式（PRD §9.7、D-V3-23＝A；代理 E3）。示範資料（fixtures/demo）。
 * 投影是會議室桌機的閱讀方式：完整流程在 desktop（1440）、laptop（1280）、tablet（768）三種寬度跑；
 * mobile（390）的頁首按鈕用 CSS 隱藏但仍掛載（M1），只在第一個測試斷言「掛載但不可見」，其餘流程在手機寬度沒有入口，標為 skip 並寫明原因。
 * 斷言字串一律取自 labels／fill；期間文字取自期間列的期間摘要（不寫死日期）。
 */
const copy = labels.shell.presentV3;
const NO_ENTRY_ON_MOBILE = "≤ 767px 頁首不顯示投影按鈕（CSS 隱藏但掛載）；手機只在「只有總覽與會議頁有按鈕」一案斷言掛載但不可見";
/** 沒有投影按鈕的頁（有資料時）。開發者驗證頁另需 #validation，不在本清單。 */
const OTHER_PAGES = ["diagnosis", "products", "scenarios", "actions", "data"] as const;
const dialogOf = (page: Page) => page.locator("dialog.evidence-drawer");

test.describe("V3-9b F22 投影模式", () => {
  test("(a) 只有總覽與會議頁有投影按鈕：預設 aria-pressed=false、文字「投影模式」；手機寬度掛載但不可見", async ({ page }) => {
    // 沒有資料時（空狀態）總覽也沒有按鈕。
    await page.goto("/");
    await expect(page.getByRole("button", { name: labels.buttons.loadDemo, exact: true }).first()).toBeVisible();
    await expect(presentToggle(page)).toHaveCount(0);

    await loadDemoForPresent(page);
    await expect(sidebarNav(page, "overview")).toHaveAttribute("aria-current", "page");
    await expectPresentOff(page);
    // 按鈕在頁首（div.page-present 內）；看得到時可及名稱＝文字（手機 display:none，不在無障礙樹裡）。
    await expect(page.locator(".page-heading .page-present").getByTestId("present-toggle")).toHaveCount(1);
    if (isMobile(page)) {
      await expect(presentToggle(page)).toBeAttached();
      await expect(presentToggle(page)).toBeHidden();
    } else {
      await expect(presentToggle(page)).toBeVisible();
      await expect(presentToggle(page)).toHaveAccessibleName(copy.enter);
    }

    for (const id of OTHER_PAGES) {
      await navigateTo(page, id);
      await expect(page.getByRole("heading", { level: 1, name: labels.nav[id].label, exact: true })).toBeAttached();
      await expect(presentToggle(page)).toHaveCount(0);
    }

    await openMeeting(page);
    await expectPresentOff(page);
    if (isMobile(page)) {
      await expect(presentToggle(page)).toBeAttached();
      await expect(presentToggle(page)).toBeHidden();
    } else await expect(presentToggle(page)).toBeVisible();
  });

  test.describe("桌機與平板（mobile 沒有入口）", () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, NO_ENTRY_ON_MOBILE);

    test("(b) 總覽進入投影：只剩 L1、其他區塊掛載但不可見；字級 48／40／16px、main 最大 1280px 置中、沒有橫向溢出", async ({ page }) => {
      await loadDemoForPresent(page);
      const before = await presentMetrics(page);
      expect(before.body).toBe("14px");
      const expectedPeriod = await expectedPresentPeriod(page);
      await expect(page.getByTestId("present-period")).toHaveCount(0);

      await enterPresent(page);
      await expect(page.getByTestId("present-period")).toHaveText(expectedPeriod);
      await expect(page.getByTestId("present-period")).toBeVisible();

      // 可見：本期一句話、KPI 帶、三件事各列（標題與影響金額）、本期利潤結構、頁首期間一行。
      for (const id of ["snapshot-sentence", "kpi-band", "profit-waterfall", "present-period", "present-toggle"]) await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: labels.nav.overview.label, exact: true })).toBeVisible();
      const priorities = page.locator("[data-testid^='overview-priority-']");
      const priorityCount = await priorities.count();
      expect(priorityCount).toBeGreaterThan(0);
      for (let index = 0; index < priorityCount; index += 1) {
        const row = priorities.nth(index);
        await expect(row).toBeVisible();
        await expect(row.locator(".alert-title")).toBeVisible();
        await expect(row.locator(".alert-impact")).toBeVisible();
        await expectMountedHidden(row.locator(".alert-actions"));
        await expectMountedHidden(row.locator(".alert-explain"));
      }

      // 掛載但不可見（M1）：側欄、期間列、拆解、輔助指標、進階、趨勢與通路兩張圖、會議入口、頁首說明。
      await expectMountedHidden(page.locator(".app-shell > .sidebar"));
      for (const id of ["period-bar", "bridge-section", "assist-kpis", "overview-advanced", "trend", "channel-mix", "overview-meeting-entry", "copy-summary"]) await expectMountedHidden(page.getByTestId(id));
      await expectMountedHidden(page.locator(".page-heading .subtitle"));
      await expectMountedHidden(page.getByTestId("profit-waterfall").locator("details.data-alternative"));

      // 字級：KPI 重點格 48px、其他格 40px；body 16px（--text-14 → 16px）。
      const metrics = await presentMetrics(page);
      expect(metrics.keyKpi).toBe("48px");
      expect(metrics.otherKpis.length).toBe(4);
      for (const size of metrics.otherKpis) expect(size).toBe("40px");
      expect(metrics.body).toBe("16px");
      expect(await rootToken(page, "--text-14")).toBe("16px");
      // 版面：main 最大 1280px、置中（1440 時左緣 80）；沒有橫向溢出。
      const viewport = page.viewportSize()!;
      const width = Math.min(1280, viewport.width);
      expect(metrics.mainWidth).toBe(width);
      expect(metrics.mainLeft).toBe(Math.round((viewport.width - width) / 2));
      if (viewport.width === 1440) expect(metrics.mainLeft).toBe(80);
      expect(metrics.scrollWidth).toBeLessThanOrEqual(metrics.clientWidth);
    });

    test("(c) Esc 離開投影、焦點回按鈕；開著抽屜時第一次 Esc 只關抽屜、第二次才離開", async ({ page }) => {
      await loadDemoForPresent(page);
      await enterPresent(page);
      await page.keyboard.press("Escape");
      await expectPresentOff(page);
      await expect(presentToggle(page)).toBeFocused();
      await expect(page.getByTestId("present-period")).toHaveCount(0);

      // 再進一次，在 KPI 主值上開「計算與來源」抽屜。
      await enterPresent(page);
      const kpiButton = page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value button.number-link");
      await kpiButton.click();
      const dialog = dialogOf(page);
      await expect(dialog).toHaveAttribute("open", "");
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      // 抽屜關閉後整個卸載（toBeHidden 也涵蓋不存在）；投影仍在、焦點回到 KPI 主值。
      await expect(dialog).toBeHidden();
      await expect(kpiButton).toBeFocused();
      await expectPresentOn(page);
      await page.keyboard.press("Escape");
      await expectPresentOff(page);
      await expect(presentToggle(page)).toBeFocused();
    });

    test("(d) 投影中切到資料來源頁自動退出、按鈕不存在；回總覽仍是未投影", async ({ page }) => {
      await loadDemoForPresent(page);
      await enterPresent(page);
      // 側欄在投影中隱藏；從頂欄資料狀態 → 「前往資料來源」切頁。
      await page.getByTestId("data-status").click();
      await page.getByTestId("data-status-go-data").click();
      await expect(sidebarNav(page, "data")).toHaveAttribute("aria-current", "page");
      await expect(htmlRoot(page)).not.toHaveAttribute("data-mode", /.*/);
      await expect(presentToggle(page)).toHaveCount(0);
      await expect(page.locator(".app-shell > .sidebar")).toBeVisible();

      await navigateTo(page, "overview");
      await expectPresentOff(page);
      await expect(presentToggle(page)).toBeVisible();
      await expect(page.getByTestId("period-bar")).toBeVisible();
    });

    test("(e) 會議頁投影：標題、決議、議程 1–2 與期間一行可見；目錄、議程 3–6、比較與歷史掛載但不可見", async ({ page }) => {
      await loadDemoForPresent(page);
      const meeting = await openMeeting(page);
      // 載入資料時已自動建立會議稿；沒有的話按「建立這次的會議紀錄」。
      if (await meeting.getByTestId("meeting-create").count()) await meeting.getByTestId("meeting-create").click();
      await expect(meeting.getByTestId("meeting-title")).toBeVisible();
      await expect(meeting.getByTestId("manager-summary")).toBeVisible();
      const expectedPeriod = await expectedPresentPeriod(page);

      await enterPresent(page);
      await expect(page.getByTestId("present-period")).toHaveText(expectedPeriod);
      for (const id of ["meeting-title", "meeting-decision", "meeting-agenda-1", "meeting-agenda-2", "meeting-finalize"]) await expect(meeting.getByTestId(id)).toBeVisible();
      await expect(page.getByTestId("present-period")).toBeVisible();
      await expect(meeting.getByTestId("meeting-decision").getByRole("combobox", { name: labels.meeting.decision, exact: true })).toBeVisible();

      await expectMountedHidden(meeting.locator(".meeting-toc"));
      for (const n of [3, 4, 5, 6]) await expectMountedHidden(meeting.getByTestId(`meeting-agenda-${n}`));
      await expectMountedHidden(meeting.getByTestId("meeting-compare"));
      await expectMountedHidden(meeting.getByTestId("meeting-history"));
      await expectMountedHidden(page.locator(".app-shell > .sidebar"));
      await expectMountedHidden(page.getByTestId("period-bar"));

      await page.keyboard.press("Escape");
      await expectPresentOff(page);
      await expect(presentToggle(page)).toBeFocused();
      await expect(meeting.getByTestId("meeting-agenda-3")).toBeVisible();
    });

    test("(f) 列印媒體不套用投影規則：--text-14 仍是 14px，回到螢幕恢復 16px", async ({ page }) => {
      await loadDemoForPresent(page);
      await enterPresent(page);
      expect(await rootToken(page, "--text-14")).toBe("16px");
      await page.emulateMedia({ media: "print" });
      await expect(htmlRoot(page)).toHaveAttribute("data-mode", "present");
      expect(await rootToken(page, "--text-14")).toBe("14px");
      await page.emulateMedia({ media: "screen" });
      expect(await rootToken(page, "--text-14")).toBe("16px");
      expect((await presentMetrics(page)).keyKpi).toBe("48px");
    });
  });
});
