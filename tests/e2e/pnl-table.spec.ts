import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { MINUS, formatAmountL1, formatAmountL2, formatAmountL3, formatDateL1, formatPeriodL1, formatRateL1, metricDefinitions } from "../../src/application/presentation";
import { PNL_ROWS } from "../../src/application/pnl-table";
import { dateRange } from "../../src/domain/date";
import { clickReplacing, dismissSavePrompt, navigateTo } from "./replacement-helpers";
import { importViaWizard } from "./import-wizard-helpers";
import { openPnlTable, pnlCell, pnlCellAria, pnlCellButton, pnlEvidenceHeading, pnlHeadColumns, pnlPanel, pnlRow, pnlRowColumns, pnlScroll, pnlTable, setPnlGranularity } from "./pnl-helpers-v39";

/*
 * V3-9a F9 每日／每週管理損益表（PRD §10.1 F9、§7.1 區塊 10、§9.3 報表型表格；D-V3-19＝A、D-V3-8 螢幕負號 U+2212）。
 * 斷言字串一律由 labels／fill 與 presentation 的格式化函式組出；數字期待值用 fixtures/demo（本期扣廣告後貢獻 1269792.73）與 fixtures/refund_only（淨營收 −100.00、扣廣告後貢獻 −60.00）。
 */
const copy = labels.overview.pnlV3;
// fixtures/demo/manifest.json：資料到 2026-08-24，本期 2026-07-13～2026-08-23（42 天＝6 個 7 天週）。
const DEMO_AS_OF = "2026-08-24";
const DEMO_DAYS = dateRange("2026-07-13", "2026-08-23");
const DEMO_WEEK_STARTS = ["2026-07-13", "2026-07-20", "2026-07-27", "2026-08-03", "2026-08-10", "2026-08-17"];
const DEMO_RESULT = "1269792.73";
// fixtures/refund_only：資料到 2026-08-03，本期只有 2026-08-02 一天；淨營收 −100.00、扣廣告後貢獻 −60.00（expected.json）。
const REFUND_ONLY_DAY = "2026-08-02";
// refund_only 的零值列（全部有資料的欄與合計恰好是 0）：原價收入、折扣、四項費用、廣告投放費；只有一般列（item）會隱藏。
const REFUND_ONLY_ZERO_ROWS = ["gross_sales", "discounts", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"];
const RESULT_METRIC = "contribution_after_marketing";
const resultLabel = metricDefinitions[RESULT_METRIC].label;
const dialogOf = (page: Page) => page.locator("dialog.evidence-drawer");
const yuan = (value: string) => fill(labels.format.units.yuan, { value: formatAmountL3(value) });
/** 抽屜精確值行（「{value} 元」）→ 到分的 ASCII 十進位字串，交回 formatAmountL2 與格子比對。 */
function preciseToDecimal(text: string): string {
  const [prefix, suffix] = labels.format.units.yuan.split("{value}");
  return text.trim().slice(prefix.length, text.trim().length - suffix.length).replaceAll(",", "").replaceAll(MINUS, "-");
}

async function loadDemo(page: Page) {
  await page.goto("/");
  await clickReplacing(page, page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true }));
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText(formatAmountL1(DEMO_RESULT));
  await expect(page.getByTestId("local-save-prompt")).toBeVisible();
  await dismissSavePrompt(page);
  await expect(page.getByTestId("local-save-prompt")).toHaveCount(0);
}
async function loadRefundOnly(page: Page) {
  await page.goto("/");
  await importViaWizard(page, resolve("fixtures/refund_only"), { manifest: true });
  await dismissSavePrompt(page);
  await navigateTo(page, "overview");
  await expect(page.getByTestId("kpi-contribution_after_marketing")).toContainText(formatAmountL1("-60.00"));
}

test.describe("V3-9a F9 管理損益表", () => {
  test("總覽「進階」summary 用新鍵；兩層 details 預設收合，展開後預設每日、表頭與列順序依 §9.3", async ({ page }) => {
    await loadDemo(page);
    const advanced = page.getByTestId("overview-advanced");
    await expect(advanced.locator(":scope > summary")).toHaveText(copy.advancedSummary);
    await expect(advanced).not.toHaveAttribute("open", /.*/);
    await expect(pnlPanel(page)).not.toHaveAttribute("open", /.*/);
    // 收合時內容仍掛載（M1）：表格在 DOM 裡、只是看不到。
    await expect(pnlTable(page)).toHaveCount(1);
    await expect(pnlTable(page)).toBeHidden();

    await openPnlTable(page);
    // 管理損益表在期間合計與日均之後（並列，不在它裡面）。
    await expect(page.getByTestId("period-comparison").getByTestId("pnl-table")).toHaveCount(0);
    expect(await page.evaluate(() => {
      const period = document.querySelector("[data-testid='period-comparison']")!, pnl = document.querySelector("[data-testid='pnl-table']")!;
      return Boolean(period.compareDocumentPosition(pnl) & Node.DOCUMENT_POSITION_FOLLOWING);
    })).toBe(true);
    await expect(pnlPanel(page).locator(":scope > summary")).toHaveText(copy.summary);
    await expect(page.getByTestId("pnl-granularity-day")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("pnl-granularity-week")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("pnl-granularity-day")).toHaveText(copy.granularity.day);
    await expect(page.getByTestId("pnl-granularity-week")).toHaveText(copy.granularity.week);
    await expect(pnlPanel(page).getByRole("group", { name: copy.granularity.aria, exact: true })).toBeVisible();
    await expect(page.getByTestId("pnl-show-zero")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("pnl-show-zero")).toHaveText(copy.showZero);
    await expect(pnlTable(page)).toHaveAttribute("data-granularity", "day");
    await expect(pnlTable(page).locator("caption")).toHaveText(fill(copy.caption, { granularity: copy.granularity.day }));
    await expect(pnlPanel(page).getByRole("region", { name: copy.tableAria, exact: true })).toBeVisible();

    // 表頭：項目 → 42 個日欄（M/D）→ 合計 → 佔淨營收 %。
    const headers = pnlTable(page).locator("thead th");
    await expect(headers.first()).toHaveText(copy.columns.item);
    await expect(headers).toHaveText([copy.columns.item, ...DEMO_DAYS.map(day => formatDateL1(day, { anchor: DEMO_AS_OF })), copy.columns.total, copy.columns.share]);
    expect(DEMO_DAYS).toHaveLength(42);
    expect(await pnlHeadColumns(page)).toEqual([...DEMO_DAYS, "total", "share"]);

    // 列：PNL_ROWS 的固定順序；費用列「減：{指標名}」，其餘是指標名；class pnl-row-item／subtotal／total；每列 42 日欄＋合計＋佔淨營收 %。
    const rows = pnlTable(page).locator("tbody > tr");
    await expect(rows).toHaveCount(PNL_ROWS.length);
    expect(await rows.evaluateAll(items => items.map(item => item.getAttribute("data-row")))).toEqual(PNL_ROWS.map(row => row.metric));
    await expect(rows.locator(":scope > th")).toHaveText(PNL_ROWS.map(row => row.deduct ? fill(copy.rowDeduct, { label: metricDefinitions[row.metric].label }) : metricDefinitions[row.metric].label));
    for (const [index, row] of PNL_ROWS.entries()) await expect(rows.nth(index)).toHaveClass(`pnl-row-${row.kind}`);
    expect(PNL_ROWS.filter(row => row.deduct).every(row => row.kind === "item")).toBe(true);
    await expect(pnlTable(page).locator("tbody > tr.pnl-row-subtotal")).toHaveCount(3);
    await expect(pnlTable(page).locator("tbody > tr.pnl-row-total")).toHaveAttribute("data-row", RESULT_METRIC);
    for (const row of PNL_ROWS) expect(await pnlRowColumns(page, row.metric), row.metric).toEqual([...DEMO_DAYS, "total", "share"]);
    // 示範資料沒有零值列，也沒有「無資料」的日欄。
    await expect(pnlTable(page).locator("tbody > tr[data-zero]")).toHaveCount(0);
    await expect(pnlTable(page).locator("tbody > tr[hidden]")).toHaveCount(0);
    await expect(pnlTable(page).locator("td.pnl-empty")).toHaveCount(0);
    // 每格（日欄＋合計）都是 number-link；佔淨營收 % 不是按鈕。
    await expect(pnlTable(page).locator("button.number-link")).toHaveCount(PNL_ROWS.length * (DEMO_DAYS.length + 1));
    await expect(pnlTable(page).locator("td[data-col='share'] button")).toHaveCount(0);
    // 合計欄＝本期合計（L2 整數元）；可及名稱 fill(cellAria, { date: 合計, metric, value })。
    await expect(pnlCellButton(page, RESULT_METRIC, "total")).toHaveText(formatAmountL2(DEMO_RESULT));
    await expect(pnlCellButton(page, RESULT_METRIC, "total")).toHaveAccessibleName(pnlCellAria(copy.columns.total, resultLabel, formatAmountL2(DEMO_RESULT)));
    // 佔淨營收 %：淨營收那列是 100.0%（合計 ÷ 淨營收合計）。
    await expect(pnlCell(page, "net_revenue", "share")).toHaveText(formatRateL1("1"));
  });

  test("合計格與某一天的格子開「計算與來源」：標題、精確值（L3 到分）、Esc 回焦", async ({ page }) => {
    await loadDemo(page);
    await openPnlTable(page);
    const dialog = dialogOf(page);
    const heading = dialog.getByRole("heading", { level: 2 });

    // 合計格：抽屜標題「扣廣告後貢獻 · 合計」，精確值行到分（1,269,792.73 元）。
    const total = pnlCellButton(page, RESULT_METRIC, "total");
    await total.click();
    await expect(dialog).toBeVisible();
    await expect(heading).toHaveText(pnlEvidenceHeading(resultLabel, copy.columns.total));
    await expect(dialog.locator("p.number")).toHaveText(formatAmountL1(DEMO_RESULT));
    await expect(dialog.getByTestId("evidence-precise-value")).toHaveText(yuan(DEMO_RESULT));
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(total).toBeFocused();

    // 某一天（7/20）：欄名用 formatDateL1；抽屜標題「扣廣告後貢獻 · 7/20」；精確值四捨五入到整數元就是格子上的 L2 值。
    const day = "2026-07-20";
    const dayText = formatDateL1(day, { anchor: DEMO_AS_OF });
    const cell = pnlCellButton(page, RESULT_METRIC, day);
    const cellText = (await cell.textContent())!.trim();
    await expect(cell).toHaveAccessibleName(pnlCellAria(dayText, resultLabel, cellText));
    await cell.click();
    await expect(dialog).toBeVisible();
    await expect(heading).toHaveText(pnlEvidenceHeading(resultLabel, dayText));
    const precise = (await dialog.getByTestId("evidence-precise-value").textContent())!;
    expect(formatAmountL2(preciseToDecimal(precise))).toBe(cellText);
    await expect(dialog.getByTestId("evidence-precise-value")).toHaveText(yuan(preciseToDecimal(precise)));
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(cell).toBeFocused();

    // 費用列（減：廣告投放費）的合計格也能開抽屜，標題用指標名（不帶「減：」）。
    const adTotal = pnlCellButton(page, "ad_spend", "total");
    await adTotal.click();
    await expect(heading).toHaveText(pnlEvidenceHeading(metricDefinitions.ad_spend.label, copy.columns.total));
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
    await expect(adTotal).toBeFocused();
  });

  test("切到每週：6 個週欄＋合計＋佔淨營收 %，合計不變；切回每日恢復 42 欄", async ({ page }) => {
    await loadDemo(page);
    await openPnlTable(page);
    await setPnlGranularity(page, "week");
    await expect(page.getByTestId("pnl-granularity-day")).toHaveAttribute("aria-pressed", "false");
    await expect(pnlTable(page).locator("caption")).toHaveText(fill(copy.caption, { granularity: copy.granularity.week }));
    expect(await pnlHeadColumns(page)).toEqual([...DEMO_WEEK_STARTS, "total", "share"]);
    // 週欄頭第二行是該週起訖（formatPeriodL1，不帶天數）。
    const weekRanges = pnlTable(page).locator("thead th[data-col] .pnl-col-range");
    await expect(weekRanges).toHaveText(DEMO_WEEK_STARTS.map(start => formatPeriodL1(start, dateRange(start, "2026-08-23")[6], { anchor: DEMO_AS_OF, days: false })));
    for (const row of PNL_ROWS) expect(await pnlRowColumns(page, row.metric), row.metric).toEqual([...DEMO_WEEK_STARTS, "total", "share"]);
    await expect(pnlTable(page).locator("button.number-link")).toHaveCount(PNL_ROWS.length * (DEMO_WEEK_STARTS.length + 1));
    await expect(pnlCellButton(page, RESULT_METRIC, "total")).toHaveText(formatAmountL2(DEMO_RESULT));

    // 週格的抽屜：標題用週欄名（欄頭第一行）。
    const weekLabel = (await pnlTable(page).locator(`thead th[data-col='${DEMO_WEEK_STARTS[1]}'] .pnl-col-label`).textContent())!.trim();
    const weekCell = pnlCellButton(page, RESULT_METRIC, DEMO_WEEK_STARTS[1]);
    await expect(weekCell).toHaveAccessibleName(pnlCellAria(weekLabel, resultLabel, (await weekCell.textContent())!.trim()));
    await weekCell.click();
    await expect(dialogOf(page).getByRole("heading", { level: 2 })).toHaveText(pnlEvidenceHeading(resultLabel, weekLabel));
    await page.keyboard.press("Escape");
    await expect(dialogOf(page)).toBeHidden();
    await expect(weekCell).toBeFocused();

    await setPnlGranularity(page, "day");
    await expect(page.getByTestId("pnl-granularity-week")).toHaveAttribute("aria-pressed", "false");
    expect(await pnlHeadColumns(page)).toEqual([...DEMO_DAYS, "total", "share"]);
  });

  test("零值列預設隱藏（hidden 但掛載）、「顯示零值列」切換；負數用 U+2212、淨營收 ≤ 0 時佔淨營收 % 不適用（refund_only）", async ({ page }) => {
    await loadRefundOnly(page);
    await openPnlTable(page);
    expect(await pnlHeadColumns(page)).toEqual([REFUND_ONLY_DAY, "total", "share"]);
    const zeroRows = pnlTable(page).locator("tbody > tr[data-zero='true']");
    expect(await zeroRows.evaluateAll(items => items.map(item => item.getAttribute("data-row")))).toEqual(REFUND_ONLY_ZERO_ROWS);
    await expect(pnlTable(page).locator("tbody > tr")).toHaveCount(PNL_ROWS.length);
    const toggle = page.getByTestId("pnl-show-zero");
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(toggle).toHaveAttribute("aria-controls", (await pnlTable(page).getAttribute("id"))!);
    for (const row of REFUND_ONLY_ZERO_ROWS) {
      await expect(pnlRow(page, row)).toHaveAttribute("hidden", "");
      await expect(pnlRow(page, row)).toBeHidden();
    }
    await expect(pnlTable(page).locator("tbody > tr:not([hidden])")).toHaveCount(PNL_ROWS.length - REFUND_ONLY_ZERO_ROWS.length);

    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    for (const row of REFUND_ONLY_ZERO_ROWS) {
      await expect(pnlRow(page, row)).not.toHaveAttribute("hidden", /.*/);
      await expect(pnlRow(page, row)).toBeVisible();
      await expect(pnlCellButton(page, row, "total")).toHaveText(formatAmountL2("0.00"));
    }
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    for (const row of REFUND_ONLY_ZERO_ROWS) await expect(pnlRow(page, row)).toBeHidden();

    // 負數：螢幕用 U+2212（不是 ASCII「-」）。
    for (const [row, value] of [["net_revenue", "-100.00"], ["refunds", "100.00"], ["cogs_net", "-40.00"], ["gross_profit", "-60.00"], [RESULT_METRIC, "-60.00"]] as const) {
      await expect(pnlCellButton(page, row, "total"), row).toHaveText(formatAmountL2(value));
      await expect(pnlCellButton(page, row, REFUND_ONLY_DAY), row).toHaveText(formatAmountL2(value));
    }
    await expect(pnlCellButton(page, "net_revenue", "total")).toContainText(MINUS);
    expect(await pnlCellButton(page, "net_revenue", "total").textContent()).not.toContain("-");
    // 淨營收 ≤ 0：佔淨營收 % 寫不適用。
    await expect(pnlCell(page, "net_revenue", "share")).toHaveText(formatRateL1(null, "notApplicable"));
    await expect(pnlCell(page, RESULT_METRIC, "share")).toHaveText(formatRateL1(null, "notApplicable"));
    // 抽屜精確值行也用 U+2212。
    const netTotal = pnlCellButton(page, "net_revenue", "total");
    await netTotal.click();
    await expect(dialogOf(page).getByTestId("evidence-precise-value")).toHaveText(yuan("-100.00"));
    await expect(dialogOf(page).getByTestId("evidence-precise-value")).toContainText(MINUS);
    await page.keyboard.press("Escape");
    await expect(dialogOf(page)).toBeHidden();
    await expect(netTotal).toBeFocused();
  });

  test("表格在捲動容器內橫向捲動，第一欄 sticky；整頁沒有橫向溢出", async ({ page }) => {
    await loadDemo(page);
    await openPnlTable(page);
    const scroll = pnlScroll(page);
    await scroll.scrollIntoViewIfNeeded();
    await expect(scroll).toHaveAttribute("tabindex", "0");
    // 42 個日欄在任何尺寸都比容器寬，捲動發生在 .table-scroll 內，不撐開整頁。
    expect(await scroll.evaluate(element => element.scrollWidth > element.clientWidth)).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    const rowHead = pnlRow(page, RESULT_METRIC).locator(":scope > th");
    const colHead = pnlTable(page).locator("thead th").first();
    const firstDay = pnlCell(page, RESULT_METRIC, DEMO_DAYS[0]);
    const before = { row: (await rowHead.boundingBox())!, col: (await colHead.boundingBox())!, day: (await firstDay.boundingBox())! };
    await scroll.evaluate(element => { element.scrollLeft = 400; });
    await expect.poll(() => scroll.evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
    const scrolled = await scroll.evaluate(element => element.scrollLeft);
    const after = { row: (await rowHead.boundingBox())!, col: (await colHead.boundingBox())!, day: (await firstDay.boundingBox())! };
    // 第一欄（列名 th 與表頭「項目」）是 sticky：x 不變；資料格跟著往左移。
    expect(Math.abs(after.row.x - before.row.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(after.col.x - before.col.x)).toBeLessThanOrEqual(1);
    expect(before.day.x - after.day.x).toBeGreaterThan(scrolled - 2);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  });
});
