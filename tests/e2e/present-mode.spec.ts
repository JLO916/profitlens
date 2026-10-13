import { expect, test, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { isMobile, navigateTo, openMeeting, sidebarNav } from "./replacement-helpers";
import { enterPresent, expectMountedHidden, expectPresentOff, expectPresentOn, expectedPresentPeriod, htmlRoot, loadDemoForPresent, presentMetrics, presentSwitch, presentToggle, rootToken } from "./present-helpers-v39";

/*
 * V3-9b F22 投影模式（PRD §9.7、D-V3-23＝A；代理 E3）。示範資料（fixtures/demo）。
 * 投影是會議室桌機的閱讀方式：完整流程在 desktop（1440）、laptop（1280）、tablet（768）三種寬度跑；
 * mobile（390）的頁首按鈕用 CSS 隱藏但仍掛載（M1），只在第一個測試斷言「掛載但不可見」，其餘流程在手機寬度沒有入口，標為 skip 並寫明原因。
 * 斷言字串一律取自 labels／fill；期間文字取自期間列的期間摘要（不寫死日期）。
 * V4-8a 代理 A：投影按鈕不帶 aria-pressed（D-V3-33＝B）；總覽投影多了貢獻變化拆解的瀑布（D-V4-8、X39：旁欄與資料表掛載但不可見、單欄）；
 * --text-12／13 → 14px（D-V4-9，瀑布標值在 14px 下不重疊，768 也看）；投影中頁首的「經營總覽／會議紀錄」互切按鈕（D-V3-34＝A，(g)）。
 */
const copy = labels.shell.presentV3;
const NO_ENTRY_ON_MOBILE = "≤ 767px 頁首不顯示投影按鈕（CSS 隱藏但掛載）；手機只在「只有總覽與會議頁有按鈕」一案斷言掛載但不可見";
/** 沒有投影按鈕的頁（有資料時）。開發者驗證頁另需 #validation，不在本清單。 */
const OTHER_PAGES = ["diagnosis", "products", "scenarios", "actions", "data"] as const;
const dialogOf = (page: Page) => page.locator("dialog.evidence-drawer");
/**
 * V4-8a：瀑布 svg 內的文字重疊——柱上標值兩兩比（基線差小於字級的兩個標值，水平範圍不得相交）、x 標籤兩兩比（同一條基線，水平範圍不得相交）。
 * 水平範圍取瀏覽器實際排出的 getBoundingClientRect（容許 0.5px）；svg 1:1 顯示，y 屬性就是 CSS px。
 */
async function waterfallTextOverlaps(svg: Locator): Promise<string[]> {
  return svg.evaluate(root => {
    const size = Number.parseFloat(getComputedStyle(root.querySelector("text")!).fontSize);
    const items = (selector: string) => [...root.querySelectorAll(selector)].map(node => ({ text: node.textContent ?? "", y: Number(node.getAttribute("y")), box: node.getBoundingClientRect() }));
    const hits: string[] = [];
    for (const group of [items("text.wf-value"), items(".wf-x > text")]) for (let i = 0; i < group.length; i++) for (let j = i + 1; j < group.length; j++) {
      const [a, b] = [group[i], group[j]];
      if (Math.abs(a.y - b.y) < size && a.box.left < b.box.right - 0.5 && b.box.left < a.box.right - 0.5) hits.push(`${a.text}／${b.text}`);
    }
    return hits;
  });
}

test.describe("V3-9b F22 投影模式", () => {
  test("(a) 只有總覽與會議頁有投影按鈕：預設文字「投影模式」、沒有 aria-pressed（D-V3-33＝B）；手機寬度掛載但不可見；互切按鈕同條件掛載、不在投影中不可見（D-V3-34＝A）", async ({ page }) => {
    // 沒有資料時（空狀態）總覽也沒有按鈕。
    await page.goto("/");
    await expect(page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true }).first()).toBeVisible();
    await expect(presentToggle(page)).toHaveCount(0);
    await expect(presentSwitch(page)).toHaveCount(0);

    await loadDemoForPresent(page);
    await expect(sidebarNav(page, "overview")).toHaveAttribute("aria-current", "page");
    await expectPresentOff(page);
    // 按鈕在頁首（div.page-present 內）；看得到時可及名稱＝文字（手機 display:none，不在無障礙樹裡）。
    await expect(page.locator(".page-heading .page-present").getByTestId("present-toggle")).toHaveCount(1);
    // V4-8a：互切按鈕在同一個 div.page-present 內，不在投影中時掛載但不可見（不是 Tab 停留點）。
    await expect(page.locator(".page-heading .page-present").getByTestId("present-switch")).toHaveCount(1);
    await expect(presentSwitch(page)).toBeHidden();
    if (isMobile(page)) {
      await expect(presentToggle(page)).toBeAttached();
      await expect(presentToggle(page)).toBeHidden();
    } else {
      await expect(presentToggle(page)).toBeVisible();
      await expect(presentToggle(page)).toHaveAccessibleName(copy.enter);
    }

    for (const id of OTHER_PAGES) {
      await navigateTo(page, id);
      await expect(page.getByRole("heading", { level: 1, name: labels.shell.nav[id].headline, exact: true })).toBeAttached();
      await expect(presentToggle(page)).toHaveCount(0);
      await expect(presentSwitch(page)).toHaveCount(0);
    }

    await openMeeting(page);
    await expectPresentOff(page);
    await expect(presentSwitch(page)).toHaveCount(1);
    await expect(presentSwitch(page)).toBeHidden();
    if (isMobile(page)) {
      await expect(presentToggle(page)).toBeAttached();
      await expect(presentToggle(page)).toBeHidden();
    } else await expect(presentToggle(page)).toBeVisible();
  });

  test.describe("桌機與平板（mobile 沒有入口）", () => {
    test.skip(({ viewport }) => (viewport?.width ?? 0) < 768, NO_ENTRY_ON_MOBILE);

    test("(b) 總覽進入投影：只剩 L1（V4-8a 起含貢獻變化拆解的瀑布）、其他區塊掛載但不可見；字級 48／40／16px、--text-12／13 → 14px、main 最大 1280px 置中、沒有橫向溢出", async ({ page }) => {
      await loadDemoForPresent(page);
      const before = await presentMetrics(page);
      expect(before.body).toBe("14px");
      const expectedPeriod = await expectedPresentPeriod(page);
      await expect(page.getByTestId("present-period")).toHaveCount(0);

      await enterPresent(page);
      await expect(page.getByTestId("present-period")).toHaveText(expectedPeriod);
      await expect(page.getByTestId("present-period")).toBeVisible();

      // 可見：本期一句話、KPI 帶、三件事各列（標題與影響金額）、貢獻變化拆解（V4-8a：只有瀑布）、本期利潤結構、頁首期間一行與兩顆按鈕。
      for (const id of ["snapshot-sentence", "kpi-band", "bridge-section", "bridge-waterfall", "profit-waterfall", "present-period", "present-toggle", "present-switch"]) await expect(page.getByTestId(id)).toBeVisible();
      await expect(page.getByRole("heading", { level: 1, name: labels.shell.nav.overview.headline, exact: true })).toBeVisible();
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

      // 掛載但不可見（M1）：側欄、期間列、輔助指標、進階、趨勢與通路兩張圖、會議入口、頁首說明。
      await expectMountedHidden(page.locator(".app-shell > .sidebar"));
      for (const id of ["period-bar", "assist-kpis", "overview-advanced", "trend", "channel-mix", "overview-meeting-entry", "copy-summary"]) await expectMountedHidden(page.getByTestId(id));
      await expectMountedHidden(page.locator(".page-heading .subtitle"));
      await expectMountedHidden(page.getByTestId("profit-waterfall").locator("details.data-alternative"));
      // 其他 v4 圖（白名單外的區塊）掛載但不可見：G4 差額條、G7a 的 sparkline 與資料表。
      for (const locator of [page.locator("[data-testid^='chart-overview-channels-bar-']"), page.locator("[data-testid^='chart-overview-assist-spark-']"), page.getByTestId("chart-overview-assist-table")]) await expectMountedHidden(locator);

      // V4-8a（D-V4-8、X39）：貢獻變化拆解只顯示瀑布——標題、副標可見；旁欄（橋接表＋G6 九條＋平衡檢核）與 v2 四欄資料表掛載但不可見；
      // 單欄（瀑布與區塊內寬同寬，≥ 1024 不留空的旁欄）。
      const bridge = page.getByTestId("bridge-section");
      for (const locator of [bridge.locator("#bridge-title"), bridge.locator("#bridge-sub")]) await expect(locator).toBeVisible();
      // 單位說明寫「圖：萬元 · 表：元」，表在投影中隱藏，單位說明也隱藏但掛載（V4-8a 審查 PM-nit-1；柱上標值本身帶單位）。
      for (const locator of [page.getByTestId("bridge-table"), page.getByTestId("bridge-balance-check"), bridge.locator(".frame-aside"), bridge.locator(".bridge-table-wrap"), bridge.locator("details.data-alternative"), bridge.locator(".unit-note")]) await expectMountedHidden(locator);
      await expect(page.locator("[data-testid^='chart-overview-bridge-bar-']")).toHaveCount(9);
      await expectMountedHidden(page.locator("[data-testid^='chart-overview-bridge-bar-']"));
      const widths = await bridge.evaluate(section => {
        const style = getComputedStyle(section);
        const inner = section.getBoundingClientRect().width - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight) - Number.parseFloat(style.borderLeftWidth) - Number.parseFloat(style.borderRightWidth);
        return { inner, svg: section.querySelector("svg.waterfall-svg")!.getBoundingClientRect().width };
      });
      expect(widths.svg / widths.inner, "拆解區單欄：瀑布約與區塊內寬同寬").toBeGreaterThan(0.95);

      // V4-8a（D-V4-9）：--text-12、--text-13 → 14px（行高 22px）；瀑布的字與拆解區副標是 14px。
      for (const token of ["--text-12", "--text-13"]) expect(await rootToken(page, token)).toBe("14px");
      for (const token of ["--leading-12", "--leading-13"]) expect(await rootToken(page, token)).toBe("22px");
      await expect(page.getByTestId("bridge-waterfall").locator("text").first()).toHaveCSS("font-size", "14px");
      await expect(bridge.locator("#bridge-sub")).toHaveCSS("font-size", "14px");
      // 14px 下 G1、G2 的柱上標值與 x 標籤不重疊（瀑布量到 14px 後重排，可能晚一個 frame）。
      for (const svg of [page.getByTestId("bridge-waterfall"), page.getByTestId("profit-waterfall").locator("svg.waterfall-svg")]) await expect.poll(() => waterfallTextOverlaps(svg)).toEqual([]);
      // 投影中圖內停留點 0：拆解區看得到的可聚焦元素 0（number-link 都在隱藏的旁欄與資料表），兩個瀑布外框不溢出、不是停留點（≥ 768）。
      await expect.poll(() => page.evaluate(() => [...document.querySelectorAll<HTMLElement>(".bridge-section, .bridge-section *, .profit-section .chart-frame, .profit-section .chart-frame *")].filter(element => element.tabIndex >= 0 && element.getClientRects().length > 0 && (element.matches("a[href], button, input, select, textarea, summary") || element.hasAttribute("tabindex"))).length)).toBe(0);

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
      await expect(presentSwitch(page)).toHaveCount(0);
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
      await expect(meeting.getByTestId("meeting-decision").getByRole("combobox", { name: labels.meeting.form.decision, exact: true })).toBeVisible();
      // V4-8a（D-V3-34＝A）：會議頁的互切按鈕回總覽。
      await expect(presentSwitch(page)).toBeVisible();
      await expect(presentSwitch(page)).toHaveAccessibleName(labels.shell.nav.overview.headline);

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

    test("(f) 列印媒體不套用投影規則：--text-14 仍是 14px、--text-12／13 仍是 12／13px，回到螢幕恢復 16px 與 14px", async ({ page }) => {
      await loadDemoForPresent(page);
      await enterPresent(page);
      expect(await rootToken(page, "--text-14")).toBe("16px");
      for (const token of ["--text-12", "--text-13"]) expect(await rootToken(page, token)).toBe("14px");
      await page.emulateMedia({ media: "print" });
      await expect(htmlRoot(page)).toHaveAttribute("data-mode", "present");
      expect(await rootToken(page, "--text-14")).toBe("14px");
      expect(await rootToken(page, "--text-12")).toBe("12px");
      expect(await rootToken(page, "--text-13")).toBe("13px");
      await page.emulateMedia({ media: "screen" });
      expect(await rootToken(page, "--text-14")).toBe("16px");
      for (const token of ["--text-12", "--text-13"]) expect(await rootToken(page, token)).toBe("14px");
      expect((await presentMetrics(page)).keyKpi).toBe("48px");
    });

    test("(g) 投影中互切總覽與會議紀錄（D-V3-34＝A）：頁首一行內一顆按鈕、在投影按鈕之前，字樣是另一頁的頁名；點或 Enter 切頁後仍在投影中、焦點交給 main；Esc 離開後互切按鈕不可見", async ({ page }) => {
      await loadDemoForPresent(page);
      const overviewPeriod = await expectedPresentPeriod(page);
      await enterPresent(page);
      const toggleBox = await presentToggle(page).boundingBox();
      await expect(presentSwitch(page)).toBeVisible();
      await expect(presentSwitch(page)).toHaveAccessibleName(labels.shell.nav.meeting.headline);
      await expect(presentSwitch(page)).not.toHaveAttribute("aria-pressed", /.*/);
      const switchBox = await presentSwitch(page).boundingBox();
      // 與投影按鈕同一行（垂直中心相同）、在它左邊。
      expect(Math.abs(switchBox!.y + switchBox!.height / 2 - (toggleBox!.y + toggleBox!.height / 2))).toBeLessThanOrEqual(1);
      expect(switchBox!.x + switchBox!.width).toBeLessThanOrEqual(toggleBox!.x);

      // 點互切按鈕 → 會議紀錄，仍在投影中；期間一行還在、互切按鈕改成回總覽。
      await presentSwitch(page).click();
      await expect(page.getByRole("heading", { level: 1, name: labels.shell.nav.meeting.headline, exact: true })).toBeVisible();
      await expectPresentOn(page);
      await expect(page.getByTestId("present-period")).toBeVisible();
      await expect(presentSwitch(page)).toHaveAccessibleName(labels.shell.nav.overview.headline);
      await expectMountedHidden(page.locator(".app-shell > .sidebar"));
      // 切頁後焦點照一般切頁交給 main（R1-6），下一個 Tab 是互切按鈕；Enter 切回總覽，仍在投影中、拆解瀑布可見。
      await expect(page.locator("#main-content")).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(presentSwitch(page)).toBeFocused();
      await page.keyboard.press("Enter");
      await expect(page.getByRole("heading", { level: 1, name: labels.shell.nav.overview.headline, exact: true })).toBeVisible();
      await expectPresentOn(page);
      await expect(page.getByTestId("present-period")).toHaveText(overviewPeriod);
      await expect(page.getByTestId("bridge-waterfall")).toBeVisible();
      await expect(presentSwitch(page)).toHaveAccessibleName(labels.shell.nav.meeting.headline);
      await expect(page.locator("#main-content")).toBeFocused();

      // Esc 離開投影，焦點回到投影按鈕（切頁沒有換掉它）；互切按鈕掛載但不可見，側欄回來。
      await page.keyboard.press("Escape");
      await expectPresentOff(page);
      await expect(presentToggle(page)).toBeFocused();
      await expect(presentSwitch(page)).toHaveCount(1);
      await expect(presentSwitch(page)).toBeHidden();
      await expect(page.locator(".app-shell > .sidebar")).toBeVisible();
    });
  });
});
