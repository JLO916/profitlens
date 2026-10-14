import { expect, test, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { wizardDetails } from "../../tests/e2e/import-wizard-helpers";
import { NO_OVERLAY_STYLE, goTo, noOverlayStylePath } from "../revamp-v4-capture/shared";
import { DESKTOP, GUIDE_MEDIA_STEPS, GUIDE_MEDIA_WRITE, HIGHLIGHT_REACH, MOBILE, collectErrors, highlight, isMobileMedia, settle, stateDemo, stateEmptyHome, stateInclusiveWizard, stateMissingAdDayReview, stateSynthetic, syncMedia, unionClip, type Clip, type Region } from "./shared";

// V41-2a 說明頁截圖（docs/revamp-v4.1/01_PRD.md §3.5、GUIDE_CONTENT.md §0 與 §2.1–2.5 的「截圖」欄；D-V41-20、21、22＝A）。
// 一個 mediaId 一個測試（各自全新的瀏覽器狀態），依 src/application/guide.ts 的 GUIDE_AREA_STEPS；CAPTURES 必須恰好涵蓋 GUIDE_AREA_STEPS 的每一張（載入時檢查）。
// 每張：設定視窗（-m 結尾 390×844，其餘 1440×1000）→ 擷取狀態（S0、S1、S3–S5）→ 等字型與圖表畫好 → 在目標元素注入強調框（「無」就不加）→
// 以元素聯集裁切（不截整頁；桌機盡量 ≤ 800 CSS px 寬）→ toHaveScreenshot 與 baseline/{mediaId}.png 比對。
// 桌機與 overview-bridge-m 以捲回頂端後的整頁座標裁切（fullPage＋clip，同畫面基準 10、11），並套 noOverlayStylePath：sticky 的頂欄、期間列、
// 精靈底部動作列改成 static、手機底部分頁列隱藏，不疊在裁切範圍內；量裁切範圍之前先在頁面注入同一段樣式，量到的位置與截圖時相同（精靈底部動作列排在第 4 步之後）。
// start-mobile-m 要看得到手機底部分頁列：不套 noOverlayStylePath（它把 .mobile-tabbar 設成 visibility: hidden），截整個視窗（390×844，不是整頁）。
// GUIDE_MEDIA=write 時每張比對完再呼叫 syncMedia（只更新有差異或新增的媒體）；check（預設）不寫任何檔。

interface Capture {
  /** 擷取狀態：導到要拍的畫面（不含捲動與強調框）。 */
  state: (page: Page) => Promise<void>;
  /** 裁切範圍：這些區塊的聯集，四周留 pad。 */
  region: (page: Page) => Region[];
  /** 左右範圍改取這些區塊的聯集（上下仍取 region）。 */
  across?: (page: Page) => Region[];
  /** 強調框的目標（GUIDE_CONTENT「強調框」欄）；「無」時不設。 */
  highlight?: (page: Page) => Locator[] | Promise<Locator[]>;
  /** 強調框的 outline-offset（px），預設 2。 */
  offset?: number;
  /** 裁切範圍四周留白（px），預設 16；不小於 HIGHLIGHT_REACH，強調框才不會被切掉。面板（有自己的外框）用 8。 */
  pad?: number;
  /** 最大寬度（px，從左緣起算）：右半邊空白或重複的區塊只截左邊。 */
  maxWidth?: number;
  /** 截整個視窗、不套 noOverlayStylePath（要看得到 fixed 的手機底部分頁列）。 */
  viewport?: boolean;
}

/** 同一個 locator 的第 1..n 個（強調框一次框住多個元素時用）。 */
const each = (locator: Locator, count: number) => Array.from({ length: count }, (_, index) => locator.nth(index));
/** 一組元素中「數值最大」的那一個（例如最長的柱）；measure 在頁面裡執行，回傳每個元素的值。 */
async function largest(locator: Locator, measure: (elements: Element[]) => number[]): Promise<Locator> {
  const values = await locator.evaluateAll(measure);
  expect(values.length, "要有可比較的元素").toBeGreaterThan(0);
  return locator.nth(values.indexOf(Math.max(...values)));
}
/** ChartFrame 的圖區塊（section[aria-labelledby={id}-title]）、圖區塊的標題列與固定高的圖框。 */
const section = (page: Page, id: string) => page.locator(`section[aria-labelledby='${id}-title']`);
const chartOnly = (page: Page, id: string) => [section(page, id).locator(":scope > .sec-head"), section(page, id).locator(".chart-frame")];
const wizardStep = (page: Page, step: number) => page.getByTestId(`import-step-${step}`);
const diagnosisRows = (page: Page) => page.getByTestId("diagnosis-list").locator(":scope > li");
const toDiagnosis = async (page: Page) => { await stateDemo(page); await goTo(page, "diagnosis", page.getByTestId("diagnosis-list")); };
const toProducts = async (page: Page) => { await stateDemo(page); await goTo(page, "products", page.getByTestId("product-table")); };

const CAPTURES: Record<string, Capture> = {
  // ── start：開始使用（GUIDE_CONTENT §2.1）──
  // 首頁按鈕列到「需要的檔案」表；框「載入示範資料」。
  "start-load": {
    state: stateEmptyHome,
    region: page => [page.getByTestId("empty-state").locator(".state-actions"), page.getByTestId("empty-state").locator("table")],
    highlight: page => [page.getByTestId("empty-load-demo")],
  },
  // 側欄：四組頁面與「使用說明」（側欄下方是空白，不截）；框四個分組標題。
  "start-nav": {
    state: stateDemo,
    region: page => [page.locator("aside.sidebar > nav"), page.locator("aside.sidebar .sidebar-guide")],
    highlight: page => each(page.locator("aside.sidebar .nav-group-title"), 4),
    pad: 12,
  },
  // 期間列中期間快捷與本期、上期那一段（不截整列；期間摘要的 <p> 撐到整列，只取文字）；框期間快捷。
  "start-period": {
    state: stateDemo,
    region: page => [page.getByTestId("period-presets"), { contents: page.getByTestId("period-summary") }],
    highlight: page => [page.getByTestId("period-presets")],
    pad: 8,
  },
  // 手機「更多」展開後的整個視窗（看得到底部分頁列）；框「更多」面板：工具列（topbar-cluster）與其他頁（mobile-more）兩塊，都是滿版，框畫在面板內。
  "start-mobile-m": {
    state: async page => {
      await stateDemo(page);
      await page.getByTestId("mobile-tabbar-more").click();
      await expect(page.getByTestId("mobile-more")).toBeVisible();
    },
    region: page => [page.getByTestId("mobile-more"), page.getByTestId("mobile-tabbar")],
    highlight: page => [page.locator("#topbar-cluster"), page.getByTestId("mobile-more")],
    offset: -3,
    viewport: true,
  },
  // ── import：匯入資料（§2.2）──
  // 第 1 步全區（三份檔案已放進對應的位置）；框拖放區。
  "import-files": {
    state: page => stateInclusiveWizard(page, 1),
    region: page => [wizardStep(page, 1)],
    highlight: page => [wizardStep(page, 1).locator(".dropzone")],
  },
  // 第 2 步欄位對照（標準欄名全部自動對上，收合成「已對照的 N 欄」）；沒有未對上的欄，框第一個收合列。
  "import-mapping": {
    state: page => stateInclusiveWizard(page, 2),
    region: page => [wizardStep(page, 2)],
    highlight: page => [wizardStep(page, 2).locator("details.mapping-done > summary").first()],
  },
  // 第 3 步金額基準到建議的兩期（到「調整比較期間」為止，下方的通路與確認不截）；框含稅選項（選項與說明一行）。
  "import-basis": {
    state: page => stateInclusiveWizard(page, 3),
    region: page => [wizardStep(page, 3).locator("fieldset.basis-choice"), wizardDetails(page, labels.importWizard.wizardV3.adjustPeriods)],
    highlight: page => [wizardStep(page, 3).locator(".basis-option", { has: page.getByLabel(labels.importWizard.basis.inclusive, { exact: true }) })],
  },
  // 第 4 步（同畫面基準 12 的 import-step-4）與其後的底部動作列；框「套用」。
  "import-review": {
    state: page => stateInclusiveWizard(page, 4),
    region: page => [wizardStep(page, 4), page.locator(".wizard-footer")],
    highlight: page => [page.getByTestId("import-commit")],
  },
  // 缺廣告列（S4）的第 4 步：檢核狀態一行到問題清單；框第一列的檔名與行號。
  "import-issues": {
    state: stateMissingAdDayReview,
    region: page => [page.getByTestId("import-status"), wizardStep(page, 4).locator("table.issue-table")],
    highlight: page => { const row = wizardStep(page, 4).locator("table.issue-table tbody tr").first(); return [row.locator("td").nth(0), row.locator("td").nth(1)]; },
    // 表頭 sticky（蓋住格子上緣外的框）、捲動容器裁掉表格下緣外的框：框畫在格子內。
    offset: -3,
  },
  // ── overview：經營總覽（§2.3）──
  // 一句話到 KPI 帶（約 1,200 px 寬，靠原尺寸連結）；框本期一句話。
  "overview-snapshot": {
    state: stateDemo,
    region: page => [page.getByTestId("weekly-snapshot"), page.getByTestId("kpi-band")],
    highlight: page => [page.getByTestId("snapshot-sentence")],
  },
  // 本期三件事；框第一項。
  "overview-top-three": {
    state: stateDemo,
    region: page => [page.getByTestId("top-three")],
    highlight: page => [page.getByTestId("top-three").locator("li.alert-row").first()],
  },
  // 貢獻變化拆解整個圖框（瀑布與拆解表）；框最長的不利柱（框貼著柱，不壓到柱下的數值）。
  "overview-bridge": {
    state: stateDemo,
    region: page => [section(page, "bridge")],
    highlight: async page => [await largest(section(page, "bridge").locator(".wf-bars rect.is-unfavorable"), elements => elements.map(element => Number(element.getAttribute("height"))))],
    offset: 0,
    pad: 8,
  },
  // 每週趨勢圖框（574 px）；無強調框。
  "overview-trend": {
    state: stateDemo,
    region: page => [section(page, "trend")],
    pad: 8,
  },
  // 手機的貢獻變化拆解表與差額條；框最長的不利差額條。
  "overview-bridge-m": {
    state: stateDemo,
    region: page => [page.getByTestId("bridge-table")],
    highlight: async page => [await largest(page.getByTestId("bridge-table").locator("svg.bar-cell[data-tone='unfavorable']"), elements => elements.map(element => Number(element.querySelector("rect")?.getAttribute("width"))))],
  },
  // ── diagnosis：通路健檢（§2.4）──
  // 健檢清單標題與前三項（預設展開的前三項先收合，只看每一項的標題列）；框第一項的影響金額條。
  "diagnosis-list": {
    state: async page => {
      await toDiagnosis(page);
      for (const row of each(diagnosisRows(page), 3)) {
        const details = row.locator(":scope > details");
        if (await details.getAttribute("open") !== null) await details.locator(":scope > summary").click();
        await expect(details).not.toHaveAttribute("open");
      }
    },
    region: page => [page.getByTestId("diagnosis-panel").locator(":scope > .sec-head"), ...each(diagnosisRows(page), 3)],
    highlight: page => [page.getByTestId("diagnosis-list").locator("[data-testid^='chart-diagnosis-impact-bar-']").first()],
    // 下緣只留 8 px：第 4 項的文字不入鏡。
    pad: 8,
  },
  // 第一項（預設展開）的可能原因、下一步、限制與按鈕；文字只佔左半邊，截到 640 px；框「加入待辦」。
  "diagnosis-add-action": {
    state: toDiagnosis,
    region: page => [diagnosisRows(page).first().locator(".diagnosis-copy"), diagnosisRows(page).first().locator(".diagnosis-actions")],
    highlight: page => [diagnosisRows(page).first().getByRole("button", { name: labels.actions.buttons.addToActions, exact: true })],
    maxWidth: 640,
  },
  // 每 100 元淨營收去向圖框（條從 0 畫到 100，要整個寬度）；無強調框。
  "diagnosis-share": {
    state: toDiagnosis,
    region: page => [section(page, "share")],
    pad: 8,
  },
  // 日 × 通路月曆熱表圖框：標題所指通路的月曆在最左，右邊是其餘通路，截到 800 px；框標題所指的最差一格。
  "diagnosis-heat": {
    state: toDiagnosis,
    region: page => [section(page, "heat")],
    highlight: async page => [await largest(section(page, "heat").locator("table.heat-table").first().locator("td[data-tier] button"), elements => elements.map(element => { const numbers = (element.getAttribute("aria-label") ?? "").match(/[−-]?\d[\d,]*(?:\.\d+)?/g) ?? ["0"]; return -Number(numbers[numbers.length - 1].replace(/,/g, "").replace("−", "-")); }))],
    pad: 8,
    maxWidth: 800,
  },
  // ── products：商品毛利（§2.5）──
  // 商品毛利兩期差額的圖（標題列與圖框；下方的增加最多 10 個表不截）；框減少最多那一列的柱。
  "products-variance": {
    state: toProducts,
    region: page => chartOnly(page, "products-variance"),
    highlight: page => [section(page, "products-variance").locator(".ranked-block[data-block='decrease'] rect.ranked-bar").first()],
  },
  // 完整商品表的標題、工具列與前 5 列；左右只到工具列的「欄位」按鈕；框排序選單。
  "products-table": {
    state: toProducts,
    region: page => [page.locator(".product-full-heading"), page.getByTestId("product-toolbar"), page.getByTestId("product-table").locator("tbody tr").nth(4)],
    across: page => [page.getByTestId("product-toolbar").locator("#product-category"), page.getByTestId("product-toolbar").locator(".product-columns > summary")],
    highlight: page => [page.getByTestId("product-toolbar").getByLabel(labels.products.pageV3.sortLabel, { exact: true })],
    pad: 8,
  },
  // 4 通路合成資料（S5）的商品毛利為負累計圖（標題列與圖框；下方的最差 10 個表不截）；無強調框。
  "products-pareto": {
    state: async page => { await stateSynthetic(page); await goTo(page, "products", page.getByTestId("product-table")); },
    region: page => chartOnly(page, "products-pareto"),
  },
};

// CAPTURES 與 GUIDE_AREA_STEPS 的 mediaId 必須是同一組（多一張或少一張都在載入時失敗）。
const planned = GUIDE_MEDIA_STEPS.map(step => step.mediaId).sort();
const covered = Object.keys(CAPTURES).sort();
if (JSON.stringify(planned) !== JSON.stringify(covered)) throw new Error(`CAPTURES 與 GUIDE_AREA_STEPS 不一致：planned=${planned.join(",")} covered=${covered.join(",")}`);

for (const step of GUIDE_MEDIA_STEPS) {
  const capture = CAPTURES[step.mediaId];
  test(`${step.mediaId}（${step.area} › ${step.stepKey}）`, async ({ page, browser }) => {
    const errors = collectErrors(page);
    const viewport = isMobileMedia(step.mediaId) ? MOBILE : DESKTOP;
    await page.setViewportSize(viewport);
    await capture.state(page);
    if (!capture.viewport) await page.addStyleTag({ content: NO_OVERLAY_STYLE });
    const regions = capture.region(page);
    await settle(page, regions);
    await highlight(page, capture.highlight ? await capture.highlight(page) : [], capture.offset);
    const name = `${step.mediaId}.png`;
    let clip: Clip;
    if (capture.viewport) {
      clip = { x: 0, y: 0, ...viewport };
      await expect(page).toHaveScreenshot(name);
    } else {
      clip = await unionClip(page, regions, { pad: Math.max(capture.pad ?? 16, HIGHLIGHT_REACH), across: capture.across?.(page), maxWidth: capture.maxWidth });
      await expect(page).toHaveScreenshot(name, { fullPage: true, clip, stylePath: await noOverlayStylePath() });
    }
    if (GUIDE_MEDIA_WRITE) console.log(`${step.mediaId}: ${clip.width}×${clip.height} ${await syncMedia(browser, step)}`);
    expect(errors, `${errors.length} console／page errors`).toEqual([]);
  });
}
