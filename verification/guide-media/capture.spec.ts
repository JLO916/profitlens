import { expect, test, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { wizardDetails } from "../../tests/e2e/import-wizard-helpers";
import { openBasis, openDetails, openDownloads, openStorage } from "../../tests/e2e/replacement-helpers";
import { NO_OVERLAY_STYLE, evidenceDrawer, goTo, noOverlayStylePath } from "../revamp-v4-capture/shared";
import { DESKTOP, GUIDE_MEDIA_STEPS, GUIDE_MEDIA_WRITE, HIGHLIGHT_REACH, MOBILE, collectErrors, fitContent, highlight, isMobileMedia, settle, stateActionsAndMeeting, stateDemo, stateEmptyHome, stateFinalized, stateInclusiveWizard, stateMissingAdDay, stateMissingAdDayReview, stateScenarios, stateSynthetic, syncMedia, unionClip, type Clip, type Region } from "./shared";

// V41-2a 說明頁截圖（docs/revamp-v4.1/01_PRD.md §3.5、GUIDE_CONTENT.md §0 與 §2.1–2.5 的「截圖」欄；D-V41-20、21、22＝A）。
// 一個 mediaId 一個測試（各自全新的瀏覽器狀態），依 src/application/guide.ts 的 GUIDE_AREA_STEPS；CAPTURES 必須恰好涵蓋 GUIDE_AREA_STEPS 的每一張（載入時檢查）。
// 每張：設定視窗（-m 結尾 390×844，其餘 1440×1000）→ 擷取狀態（S0、S1、S3–S5）→ 等字型與圖表畫好 → 在目標元素注入強調框（「無」就不加）→
// 以元素聯集裁切（不截整頁；桌機盡量 ≤ 800 CSS px 寬）→ toHaveScreenshot 與 baseline/{mediaId}.png 比對。
// 桌機與 overview-bridge-m 以捲回頂端後的整頁座標裁切（fullPage＋clip，同畫面基準 10、11），並套 noOverlayStylePath：sticky 的頂欄、期間列、
// 精靈底部動作列改成 static、手機底部分頁列隱藏，不疊在裁切範圍內；量裁切範圍之前先在頁面注入同一段樣式，量到的位置與截圖時相同（精靈底部動作列排在第 4 步之後）。
// start-mobile-m 要看得到手機底部分頁列：不套 noOverlayStylePath（它把 .mobile-tabbar 設成 visibility: hidden），截整個視窗（390×844，不是整頁）。
// GUIDE_MEDIA=write 時每張比對完再呼叫 syncMedia（只更新有差異或新增的媒體）；check（預設）不寫任何檔。
// V41-2b（GUIDE_CONTENT §2.6–2.11）：再加 23 張（擷取狀態 S1、S4、S6–S8）。對話框與抽屜（計算與來源、指標定義、待辦編輯）與頂欄的「匯出」「儲存」選單
// 都在第一個視窗內：不套 noOverlayStylePath（頂欄選單以 sticky 的頂欄定位，頂欄改成 static 時選單會跑位），以視窗截圖（不帶 fullPage）裁切（fixed）；
// 對話框與抽屜另把裁切範圍限制在外框內（within），留白不帶到後面模糊的頁面。meeting-present 是例外的整個視窗（投影本來就是整個畫面）。

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
  /** V41-2b：在第一個視窗內的對話框、抽屜與頂欄選單：不套 noOverlayStylePath，以視窗截圖（不帶 fullPage）裁切。 */
  fixed?: boolean;
  /** V41-2b：裁切範圍不超出這個元素的外框（對話框、抽屜；或主內容區，裁切上緣不帶到頂欄）。 */
  within?: (page: Page) => Locator;
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
// ── V41-2b ──
const scenarioCard = (page: Page, n: number) => page.getByTestId(`scenario-${n}`);
/** scenarios-threshold 的三個銷量假設 A、B、C（%；虛構的值，在 −90% 到 +100% 內，不與兩個門檻重疊）。 */
const SENSITIVITY_VOLUMES = ["-50", "-20", "30"] as const;
const toScenarios = async (page: Page) => { await stateDemo(page); await goTo(page, "scenarios", scenarioCard(page, 1)); };
const toActions = async (page: Page) => { await stateActionsAndMeeting(page); await goTo(page, "actions", page.getByTestId("action-board")); };
const toData = async (page: Page) => { await stateDemo(page); await goTo(page, "data", page.getByTestId("data-scope")); };
const toMissingAdDayData = async (page: Page) => { await stateMissingAdDay(page); await goTo(page, "data", page.getByTestId("data-issues")); };
const storageGroups = (page: Page) => page.getByTestId("workspace-storage").locator("section.storage-group");
const actionDrawer = (page: Page) => page.getByTestId("action-drawer");
const basisDialog = (page: Page) => page.getByTestId("basis-dialog");
/** 總覽 KPI 帶扣廣告後貢獻的本期值 → 計算與來源抽屜。 */
async function openContributionEvidence(page: Page) {
  await stateDemo(page);
  await page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value button.number-link").click();
  await expect(evidenceDrawer(page)).toBeVisible();
  await expect(evidenceDrawer(page).getByTestId("evidence-precise-value")).toBeVisible();
}

const CAPTURES: Record<string, Capture> = {
  // ── start：開始使用（GUIDE_CONTENT §2.1）──
  // 首頁按鈕列到「需要的檔案」表；框「載入示範資料」。
  "start-load": {
    state: stateEmptyHome,
    region: page => [page.getByTestId("empty-state").locator(".state-actions"), page.getByTestId("empty-state").locator("table")],
    highlight: page => [page.getByTestId("empty-load-demo")],
  },
  // 側欄：四組頁面與「操作導覽」入口（V41-6 改名、文字前有問號圖示；側欄下方是空白，不截）；框四個分組標題。
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
  // 第 2 步欄位對照（標準欄名全部自動對上，收合成「已對照的 N 欄」）；文字都在左邊約 550 px 內，截到 600 px（390 顯示比值約 0.55）；沒有未對上的欄，框第一個收合列。
  // 收合列（summary）是滿版的區塊：擷取時把它設成 width: fit-content（display 仍是 list-item，文字與三角形位置不變、不移動其他元素），框只圍住文字，不被 600 px 的裁切切掉右邊。
  "import-mapping": {
    state: page => stateInclusiveWizard(page, 2),
    region: page => [wizardStep(page, 2)],
    highlight: async page => {
      const summary = wizardStep(page, 2).locator("details.mapping-done > summary").first();
      await summary.evaluate(element => (element as HTMLElement).style.setProperty("width", "fit-content"));
      return [summary];
    },
    maxWidth: 600,
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
  // 缺廣告列（S4）的第 4 步：檢核狀態一行到問題清單；框第一列的檔案格（檔名與哪一天哪個通路）。
  // 缺列的問題沒有原始行號（行號格是空的），所以不照 GUIDE_CONTENT 的「檔名與行號」框行號格（V41-2a 審查更正）。
  "import-issues": {
    state: stateMissingAdDayReview,
    region: page => [page.getByTestId("import-status"), wizardStep(page, 4).locator("table.issue-table")],
    highlight: page => [wizardStep(page, 4).locator("table.issue-table tbody tr").first().locator("td").nth(0)],
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
  // ── scenarios：假設試算（§2.6）──
  // S1：頁首（含「試算的通路」）到方案 1 的範本列與右欄「新增方案」（方案欄下半部不截；上緣不帶到頂欄）；框「新增方案」。
  "scenarios-setup": {
    state: toScenarios,
    region: page => [page.locator(".page-heading"), scenarioCard(page, 1).locator(".scenario-template"), page.getByTestId("scenario-add")],
    highlight: page => [page.getByTestId("scenario-add")],
    // 下緣只留 8 px：下一列的欄位名不入鏡。
    pad: 8,
    within: page => page.locator(".main-shell"),
  },
  // S1，方案 1 套用範本「維持現況」（五格帶入 0）、還沒勾選、還沒試算：五個假設欄位、確認勾選框與「試算」；框「試算」。
  "scenarios-inputs": {
    state: async page => {
      await toScenarios(page);
      const card = scenarioCard(page, 1);
      await card.getByTestId("scenario-preset").selectOption("keep");
      await card.getByTestId("scenario-preset-apply").click();
      await expect(card.getByLabel(labels.scenarios.inputs.volume.label, { exact: true })).toHaveValue("0");
      await expect(card.getByTestId("scenario-accept")).not.toBeChecked();
    },
    region: page => [scenarioCard(page, 1).locator(".scenario-inputs"), scenarioCard(page, 1).locator("label.scenario-accept"), scenarioCard(page, 1).locator(".scenario-actions")],
    highlight: page => [scenarioCard(page, 1).getByRole("button", { name: labels.scenarios.buttons.calculate, exact: true })],
    // 上緣只留 8 px：範本列下方的「會覆寫目前的假設」不入鏡。
    pad: 8,
  },
  // S6：方案差額圖框與其下的「本期與各方案明細」比較表；無強調框。
  "scenarios-compare": {
    state: stateScenarios,
    region: page => [page.getByTestId("chart-scenarios-variance"), page.locator("section.scenario-compare")],
    pad: 8,
  },
  // S6，方案 1 展開「要賣到多少才划算」，三個假設填 SENSITIVITY_VOLUMES 並按「試算三個假設」（像使用者一樣明填，系統不代填）：
  // 「選入會議」到門檻圖的圖框（兩個門檻是空心圈、三個假設是實心點 A、B、C；圖下的資料表收合列與輸入格不截）；框「選入會議」。
  "scenarios-threshold": {
    state: async page => {
      await stateScenarios(page);
      const sensitivity = scenarioCard(page, 1).getByTestId("scenario-sensitivity");
      await openDetails(sensitivity);
      await expect(scenarioCard(page, 1).getByTestId("chart-scenarios-threshold")).toBeVisible();
      for (const [index, value] of SENSITIVITY_VOLUMES.entries()) await sensitivity.getByLabel(fill(labels.scenarios.sensitivity.inputLabel, { letter: String.fromCharCode(65 + index) }), { exact: true }).fill(value);
      await sensitivity.getByRole("button", { name: labels.scenarios.sensitivity.recalc, exact: true }).click();
      await expect(sensitivity.getByTestId("sensitivity-result").getByRole("table")).toBeVisible();
      for (const id of ["a", "b", "c"]) await expect(sensitivity.getByTestId(`chart-scenarios-threshold-point-${id}`)).toBeVisible();
    },
    region: page => [page.getByTestId("scenario-select-1"), scenarioCard(page, 1).getByTestId("chart-scenarios-threshold").locator(".chart-frame")],
    highlight: page => [page.getByTestId("scenario-select-1")],
    // 下緣只留 8 px：圖下的收合列不入鏡。
    pad: 8,
  },
  // ── actions：待辦（§2.7）──
  // S7：到期分布的計數條、看板／清單切換與四欄看板；框看板／清單切換。
  "actions-board": {
    state: toActions,
    region: page => [page.getByTestId("chart-actions-due"), page.getByTestId("actions-toolbar"), page.getByTestId("action-board")],
    highlight: page => [page.getByTestId("actions-toolbar").locator(".ui-segmented")],
  },
  // S7，開第一張卡的編輯抽屜：標題列與「內容」段（問題到進度紀錄）；框「廣告決策」欄。
  "actions-edit": {
    state: async page => {
      await toActions(page);
      await page.getByTestId("board-card-1-edit").click();
      await expect(actionDrawer(page)).toBeVisible();
    },
    region: page => [actionDrawer(page).locator(".action-drawer-head"), actionDrawer(page).locator("section.action-editor-content")],
    highlight: page => [actionDrawer(page).locator(".action-editor-ad-decision")],
    fixed: true,
    within: actionDrawer,
  },
  // S7：看板「未開始」欄與第一張卡；框卡片左上角的置頂（星號）按鈕。
  "actions-pin": {
    state: toActions,
    region: page => [page.getByTestId("board-column-not_started")],
    highlight: page => [page.getByTestId("board-card-1").getByRole("button", { name: labels.actions.buttons.pin, exact: true })],
    // 框畫在按鈕內（星號四周），不貼著旁邊的標題字。
    offset: -5,
    pad: 8,
  },
  // ── meeting：會議紀錄與投影（§2.8）──
  // S7：左側議程目錄與議程第 1–2 項；框議程目錄。
  "meeting-agenda": {
    state: stateActionsAndMeeting,
    region: page => [page.locator("nav.meeting-toc"), page.locator(".meeting-agenda-head"), page.getByTestId("meeting-agenda-1"), page.getByTestId("meeting-agenda-2")],
    highlight: page => [page.locator("nav.meeting-toc")],
  },
  // S7：頁首動作列右半（決議選單、結束會議、複製週會摘要、匯出會議）；框決議選單。
  "meeting-decision": {
    state: stateActionsAndMeeting,
    region: page => [page.locator(".meeting-head-actions")],
    highlight: page => [page.getByTestId("meeting-decision").getByRole("combobox", { name: labels.meeting.form.decision, exact: true })],
    pad: 12,
  },
  // S7，總覽按「投影模式」：整個視窗（例外：投影本來就是整個畫面，靠原尺寸連結）；框「離開投影」。
  "meeting-present": {
    state: async page => {
      await stateActionsAndMeeting(page);
      await goTo(page, "overview", page.getByTestId("kpi-band"));
      await page.getByTestId("present-toggle").click();
      await expect(page.locator("html")).toHaveAttribute("data-mode", "present");
      await expect(page.getByTestId("present-toggle")).toHaveText(labels.shell.presentV3.exit);
    },
    // 視窗內的區塊：KPI 帶、本期三件事與貢獻變化拆解（視窗外延後掛載的圖不必等）。
    region: page => [page.getByTestId("kpi-band"), page.getByTestId("top-three"), section(page, "bridge")],
    highlight: page => [page.getByTestId("present-toggle")],
    viewport: true,
  },
  // S8：會議歷史面板（剛結束的一筆與旁邊的「下載 Markdown」「移除這筆紀錄」）；框「下載 Markdown」。
  "meeting-finalize": {
    state: stateFinalized,
    region: page => [page.getByTestId("meeting-history")],
    highlight: page => [page.getByTestId("meeting-history-item").locator(".meeting-history-buttons button").filter({ hasText: labels.exports.buttons.exportMarkdown })],
    pad: 8,
  },
  // S8，展開頂欄「匯出」：選單的「會議」組；框「複製週會摘要」。
  "meeting-copy": {
    state: async page => { await stateFinalized(page); await openDownloads(page); },
    region: page => [page.getByTestId("download-group-meeting")],
    highlight: page => [page.getByTestId("download-copy-summary")],
    // 選單清單是捲動容器，會裁掉畫在項目外的框：框畫在項目內。
    offset: -3,
    pad: 8,
    fixed: true,
  },
  // ── data：資料來源（§2.9）──
  // S1：頁首下方的狀態列一行（資料到哪天、涵蓋、檔案數、金額基準、問題數）；框狀態列（段落設成 fit-content，框只圍住文字）。
  "data-scope": {
    state: toData,
    region: page => [page.getByTestId("data-status-line")],
    highlight: async page => [await fitContent(page.getByTestId("data-status-line"))],
    pad: 12,
  },
  // S4 套用後：涵蓋時間軸圖框（廣告投放 8/2 缺列）；框缺列的虛線框。
  "data-coverage": {
    state: toMissingAdDayData,
    region: page => [page.getByTestId("chart-data-coverage")],
    highlight: page => [page.getByTestId("chart-data-coverage").locator("rect.timeline-missing")],
    pad: 8,
  },
  // S4 套用後：資料完整性問題（問題分布表與問題清單）；框「下載問題清單 CSV」。
  "data-issues": {
    state: toMissingAdDayData,
    region: page => [page.getByTestId("data-issues")],
    highlight: page => [page.getByTestId("data-issues-download")],
    pad: 8,
  },
  // S1：來源檔案區，展開第一份（商品銷售）的前 10 列；無強調框。
  "data-preview": {
    state: async page => {
      await toData(page);
      const sales = page.getByTestId("data-preview-sales_daily.csv");
      await openDetails(sales);
      await expect(sales.locator("table tbody tr")).toHaveCount(10);
    },
    region: page => [page.getByTestId("data-preview")],
    pad: 8,
  },
  // ── evidence：計算與來源、指標定義（§2.10）──
  // S1，開 KPI 帶扣廣告後貢獻的計算與來源：抽屜標題列、L1 值與到分的精確值、計算方式（算法階梯）；框精確值（段落設成 fit-content）。
  "evidence-drawer": {
    state: openContributionEvidence,
    region: page => [evidenceDrawer(page).locator("header.evidence-head"), evidenceDrawer(page).locator("section.evidence-ladder")],
    highlight: async page => [await fitContent(evidenceDrawer(page).getByTestId("evidence-precise-value"))],
    fixed: true,
    within: evidenceDrawer,
  },
  // S1，同一個抽屜捲到「原始明細」（標題在抽屜標題列下方 24 px）：標題、說明、分頁與搜尋、前兩列；框第一列的「檔名:行號」。
  "evidence-sources": {
    state: async page => {
      await openContributionEvidence(page);
      const drawer = evidenceDrawer(page);
      const title = drawer.locator("section.evidence-sources > h3");
      const target = await drawer.evaluate(element => {
        const head = element.querySelector("header.evidence-head")!.getBoundingClientRect();
        const heading = element.querySelector("section.evidence-sources > h3")!.getBoundingClientRect();
        element.scrollTop += heading.top - head.bottom - 24;
        return Math.round(head.bottom + 24);
      });
      await expect.poll(() => title.evaluate(element => Math.round(element.getBoundingClientRect().top))).toBe(target);
    },
    region: page => [evidenceDrawer(page).locator("section.evidence-sources > h3"), evidenceDrawer(page).locator("table.source-table tbody tr").nth(1)],
    highlight: page => [evidenceDrawer(page).locator("table.source-table tbody tr").first().locator(".evidence-fileline")],
    // 下緣只留 8 px：第三列的文字不入鏡。
    pad: 8,
    fixed: true,
    within: evidenceDrawer,
  },
  // S1，開頂欄「指標定義」：對話框標題列、九條規則、名詞小辭典的標題、搜尋與「找到 N 個名詞」；框名詞小辭典的標題（設成 fit-content）。
  "evidence-basis": {
    state: async page => { await stateDemo(page); await openBasis(page); },
    region: page => [basisDialog(page).locator(":scope > header"), basisDialog(page).locator("ol.basis-list"), basisDialog(page).locator("section.glossary .glossary-count")],
    highlight: async page => [await fitContent(basisDialog(page).locator("section.glossary > h3").first())],
    fixed: true,
    within: basisDialog,
  },
  // ── export：匯出、儲存與備份（§2.11）──
  // S7，展開頂欄「匯出」：按鈕與整個選單（五組）；框一頁摘要的版本選擇（標準版、老闆一頁版、客戶報告版）。
  "export-menu": {
    state: async page => { await stateActionsAndMeeting(page); await openDownloads(page); },
    region: page => [page.getByTestId("download-menu").locator(":scope > summary"), page.getByTestId("download-menu").locator(".menu-panel")],
    highlight: page => [page.getByTestId("download-variant-picker")],
    // 選單有自己的外框與陰影：左右只留 8 px，旁邊被選單蓋住的頁面少入鏡。
    pad: 8,
    fixed: true,
  },
  // S7，展開頂欄「儲存」：按鈕與整個選單（本機保存、備份檔、危險區）；框本機保存段。
  "export-save": {
    state: async page => { await stateActionsAndMeeting(page); await openStorage(page); },
    region: page => [page.getByTestId("workspace-storage").locator(":scope > summary"), page.getByTestId("workspace-storage").locator(".storage-panel")],
    highlight: page => [storageGroups(page).first()],
    pad: 8,
    fixed: true,
  },
  // S7，儲存選單的備份檔段；框「下載備份檔」。
  "export-backup": {
    state: async page => { await stateActionsAndMeeting(page); await openStorage(page); },
    region: page => [storageGroups(page).nth(1)],
    highlight: page => [storageGroups(page).nth(1).getByRole("button", { name: labels.storage.buttons.downloadBackup, exact: true })],
    pad: 12,
    fixed: true,
  },
  // S7，儲存選單的危險區；框「刪除這台電腦上的資料」。
  "export-delete": {
    state: async page => { await stateActionsAndMeeting(page); await openStorage(page); },
    region: page => [page.getByTestId("workspace-storage").locator("section.storage-danger")],
    highlight: page => [page.getByTestId("workspace-storage").getByRole("button", { name: labels.storage.buttons.deleteLocal, exact: true })],
    pad: 12,
    fixed: true,
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
    if (!capture.viewport && !capture.fixed) await page.addStyleTag({ content: NO_OVERLAY_STYLE });
    const regions = capture.region(page);
    await settle(page, regions);
    await highlight(page, capture.highlight ? await capture.highlight(page) : [], capture.offset);
    const name = `${step.mediaId}.png`;
    let clip: Clip;
    if (capture.viewport) {
      clip = { x: 0, y: 0, ...viewport };
      await expect(page).toHaveScreenshot(name);
    } else {
      clip = await unionClip(page, regions, { pad: Math.max(capture.pad ?? 16, HIGHLIGHT_REACH), across: capture.across?.(page), maxWidth: capture.maxWidth, within: capture.within?.(page) });
      if (capture.fixed) await expect(page).toHaveScreenshot(name, { clip });
      else await expect(page).toHaveScreenshot(name, { fullPage: true, clip, stylePath: await noOverlayStylePath() });
    }
    if (GUIDE_MEDIA_WRITE) console.log(`${step.mediaId}: ${clip.width}×${clip.height} ${await syncMedia(browser, step)}`);
    expect(errors, `${errors.length} console／page errors`).toEqual([]);
  });
}
