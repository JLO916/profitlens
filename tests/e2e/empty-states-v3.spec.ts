import { expect, test, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { isMobile, sidebarNav } from "./replacement-helpers";
import { wizard } from "./import-wizard-helpers";

// V3-8 C（PRD §7.10、§9.4 C10 頁面型）：首次進入的空狀態、從空狀態一次點擊開匯入精靈、取消後回到資料來源頁的空狀態、
// 載入示範資料前後不跳動（CLS < 0.05；空狀態容器高度＝有資料時「期間列頂到視窗底」，差 ≤ 8px）。
// 所有字串從 labels 取；版面數字（0.05、8px）是 §7.10 的驗收門檻。

const stateV3 = labels.empty.stateV3;
const emptyState = (page: Page) => page.getByTestId("empty-state");
/** a 在 DOM 順序上早於 b（主要按鈕放最前面，C12）。 */
async function precedes(a: Locator, b: Locator) {
  const other = await b.elementHandle();
  return a.evaluate((element, target) => !!target && !!(element.compareDocumentPosition(target) & Node.DOCUMENT_POSITION_FOLLOWING), other);
}

type Shift = { value: number; hadRecentInput: boolean; startTime: number };
declare global { interface Window { __layoutShifts?: Shift[] } }

test.describe("V3-8 空狀態（§7.10）", () => {
  test("首頁空狀態：h2、載入示範資料（主要）在匯入資料之前、需要的檔案表 3 列、沒有插圖／eyebrow／步驟列", async ({ page }) => {
    await page.goto("/");
    const state = emptyState(page);
    await expect(state).toBeVisible();
    await expect(sidebarNav(page, "overview")).toHaveAttribute("aria-current", "page");
    // 標題是 h2（頁面 h1 由頁首提供，M6 一個 h1），文字＝labels.empty.title；說明一句。
    const heading = state.getByRole("heading", { level: 2 });
    await expect(heading).toHaveCount(1);
    await expect(heading).toHaveText(labels.empty.title);
    await expect(state).toHaveAttribute("aria-labelledby", (await heading.getAttribute("id"))!);
    await expect(state.getByText(labels.empty.body, { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);

    // 按鈕列：載入示範資料（主要）在前、匯入資料（次要）在後；首頁只有空狀態這一組（頁首在總覽不渲染 load-controls）。
    const demo = page.getByTestId("empty-load-demo");
    const importButton = page.getByTestId("empty-import");
    await expect(demo).toBeVisible();
    await expect(importButton).toBeVisible();
    await expect(demo).toHaveText(labels.shell.buttons.loadDemo);
    await expect(importButton).toHaveText(labels.shell.buttons.importData);
    await expect(demo).toHaveClass(/(^|\s)ui-btn-primary(\s|$)/);
    await expect(importButton).toHaveClass(/(^|\s)ui-btn-secondary(\s|$)/);
    expect(await precedes(demo, importButton), "載入示範資料在匯入資料之前").toBe(true);
    await expect(page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true })).toHaveCount(1);
    await expect(page.getByRole("button", { name: labels.shell.buttons.importData, exact: true })).toHaveCount(1);

    // 「需要的檔案」表：3 列（三份日報），每列有檔名與一句內容說明。
    await expect(state.getByRole("heading", { level: 3, name: stateV3.filesHeading, exact: true })).toBeVisible();
    const files = state.getByRole("table", { name: stateV3.filesHeading, exact: true });
    await expect(files).toBeVisible();
    await expect(files.locator("tbody tr")).toHaveCount(3);
    const fileNames = [labels.importWizard.files.sales, labels.importWizard.files.costs, labels.importWizard.files.ads];
    const descriptions = [stateV3.fileDescriptions.sales, stateV3.fileDescriptions.costs, stateV3.fileDescriptions.ads];
    for (const [index, row] of (await files.locator("tbody tr").all()).entries()) {
      await expect(row.getByRole("rowheader")).toContainText(fileNames[index]);
      await expect(row).toContainText(descriptions[index]);
      await expect(row.getByRole("button", { name: fill(labels.exports.downloads.blankTemplate, { file: fileNames[index] }), exact: true })).toBeVisible();
      await expect(row.getByRole("link", { name: fill(labels.exports.downloads.exampleTemplate, { file: fileNames[index] }), exact: true })).toBeVisible();
    }

    // 不放插圖、eyebrow、步驟列（v2 的 .empty-illustration／.eyebrow／.empty-steps 與其文字都不再出現）。
    const main = page.locator("#main-content");
    await expect(main.locator(".empty-illustration, .eyebrow, .empty-steps")).toHaveCount(0);
    await expect(state).not.toContainText(labels.empty.eyebrow);
    // 步驟列（v2 的 ol.empty-steps）不存在：空狀態裡沒有清單；第一步「匯入資料」與按鈕同字，其餘兩步的文字也不出現。
    await expect(state.getByRole("list")).toHaveCount(0);
    for (const step of labels.empty.steps.filter(step => step !== labels.shell.buttons.importData)) await expect(state.getByText(step, { exact: true })).toHaveCount(0);
  });

  test("點空狀態的「匯入資料」一次就開精靈（全版專注），取消匯入回到資料來源頁空狀態（頁首載入示範資料為主要）", async ({ page }) => {
    await page.goto("/");
    await expect(emptyState(page)).toBeVisible();
    // 等前端接管（hydrate）後再點，才能驗證「一次點擊」。
    await page.waitForLoadState("networkidle");
    await page.getByTestId("empty-import").click();
    await expect(wizard(page)).toBeVisible();
    // 全版專注模式：頁首 h1 改「匯入資料」、描述是隱私一句；精靈 h2 是「第 1 步，共 4 步：選檔」；期間列、空狀態都不顯示。
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(labels.importWizard.title);
    await expect(page.locator(".page-heading .subtitle")).toHaveText(labels.importWizard.privacyNote);
    await expect(page.locator("#import-heading")).toHaveText(`${fill(labels.importWizard.wizardV3.stepOf, { n: 1, total: labels.importWizard.steps.length })}${labels.importWizard.steps[0]}`);
    await expect(page.getByTestId("period-bar")).toBeHidden();
    await expect(emptyState(page)).toBeHidden();
    await expect(page.getByTestId("page-import")).toBeHidden();
    await expect(sidebarNav(page, "data")).toHaveAttribute("aria-current", "page");

    // 取消匯入（版頭右上，只有一顆）→ 回到資料來源頁的空狀態。
    const cancel = wizard(page).getByRole("button", { name: labels.importWizard.cancel, exact: true });
    await expect(cancel).toHaveCount(1);
    await cancel.click();
    await expect(wizard(page)).toHaveCount(0);
    await expect(sidebarNav(page, "data")).toHaveAttribute("aria-current", "page");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(labels.shell.nav.data.headline);
    const state = emptyState(page);
    await expect(state).toBeVisible();
    await expect(state.getByRole("heading", { level: 2 })).toHaveText(labels.empty.title);
    // 資料來源頁的空狀態沒有按鈕列（頁首已有，M6 同一控制只有一個實例）；「需要的檔案」表仍在。
    await expect(page.getByTestId("empty-load-demo")).toHaveCount(0);
    await expect(page.getByTestId("empty-import")).toHaveCount(0);
    await expect(state.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true })).toHaveCount(0);
    await expect(state.getByRole("button", { name: labels.shell.buttons.importData, exact: true })).toHaveCount(0);
    await expect(state.getByRole("table", { name: stateV3.filesHeading, exact: true }).locator("tbody tr")).toHaveCount(3);
    // 頁首：沒有資料時「載入示範資料」主要在前、「匯入資料」（page-import）次要在後；全頁各只有一顆。
    const headerDemo = page.getByRole("button", { name: labels.shell.buttons.loadDemo, exact: true });
    const headerImport = page.getByTestId("page-import");
    await expect(headerDemo).toHaveCount(1);
    await expect(page.getByRole("button", { name: labels.shell.buttons.importData, exact: true })).toHaveCount(1);
    await expect(headerDemo).toBeVisible();
    await expect(headerImport).toBeVisible();
    await expect(headerImport).toHaveText(labels.shell.buttons.importData);
    await expect(headerDemo).toHaveClass(/(^|\s)ui-btn-primary(\s|$)/);
    await expect(headerImport).toHaveClass(/(^|\s)ui-btn-secondary(\s|$)/);
    expect(await precedes(headerDemo, headerImport), "頁首載入示範資料在匯入資料之前").toBe(true);
    expect(await precedes(headerDemo, state), "頁首按鈕在空狀態之上").toBe(true);
  });

  test("載入示範資料前後不跳動：CLS < 0.05，空狀態高度與載入後期間列頂到視窗底相差 ≤ 8px", async ({ page }, testInfo) => {
    // 從首頁開始記錄 layout-shift（buffered），直到第一張 KPI 可見後再等 1 秒。
    await page.addInitScript(() => {
      window.__layoutShifts = [];
      try {
        new PerformanceObserver(list => {
          for (const entry of list.getEntries() as unknown as Shift[]) window.__layoutShifts!.push({ value: entry.value, hadRecentInput: entry.hadRecentInput, startTime: entry.startTime });
        }).observe({ type: "layout-shift", buffered: true });
      } catch { /* 不支援時 __layoutShifts 為空陣列，下方會以 supported 檢查擋下 */ }
    });
    await page.goto("/");
    const state = emptyState(page);
    await expect(state).toBeVisible();
    await page.waitForLoadState("networkidle");
    expect(await page.evaluate(() => PerformanceObserver.supportedEntryTypes.includes("layout-shift")), "瀏覽器支援 layout-shift").toBe(true);
    const before = (await state.boundingBox())!;
    expect(before).not.toBeNull();

    await page.getByTestId("empty-load-demo").click();
    const firstKpi = page.getByTestId("kpi-band").locator("[data-testid^='kpi-']").first();
    await expect(firstKpi).toBeVisible();
    await page.waitForTimeout(1_000);

    const shifts = await page.evaluate(() => window.__layoutShifts ?? []);
    const total = shifts.reduce((sum, shift) => sum + shift.value, 0);
    const cls = `${testInfo.project.name}: total=${total.toFixed(4)} entries=${shifts.length} ${JSON.stringify(shifts)}`;
    testInfo.annotations.push({ type: "cls", description: cls });
    console.log(`[V3-8 CLS] ${cls}`);
    expect(total, `CLS（含輸入後 500ms 內的位移）${JSON.stringify(shifts)}`).toBeLessThan(0.05);

    // 首屏容器：載入前是空狀態的高度；載入後是期間列頂到視窗底（期間列在手機收成一列，仍掛 period-bar）。
    const viewport = page.viewportSize()!;
    const bar = await page.getByTestId("period-bar").boundingBox();
    expect(bar, "載入後期間列可見").not.toBeNull();
    const after = viewport.height - bar!.y;
    const firstScreen = `${testInfo.project.name}${isMobile(page) ? "（手機）" : ""}: empty-state=${before.height.toFixed(1)}px, period-bar top→bottom=${after.toFixed(1)}px, empty-state y=${before.y.toFixed(1)}, period-bar y=${bar!.y.toFixed(1)}`;
    testInfo.annotations.push({ type: "first-screen", description: firstScreen });
    console.log(`[V3-8 first screen] ${firstScreen}`);
    expect(Math.abs(before.height - after), `空狀態高 ${before.height}px vs 載入後首屏 ${after}px`).toBeLessThanOrEqual(8);
  });
});
