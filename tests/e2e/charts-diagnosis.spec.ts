// V4-3a 代理 E（06_BATCHES V4-3a「驗收重點」的瀏覽器部分；CHART_CATALOG G7（b）、G9、G10 的 E2E 草案；PRD §2.2 B3、B4、§4.4–4.7、§7.2、§7.4、§8.7）：
// 通路健檢 G9 健檢清單內嵌影響金額條、G10 每 100 元淨營收去向（C27 ShareStack）、G7b 通路寬表「近 {n} 週」與「各通路每週」，
// 以及同批的總覽「進階」管理損益表「佔淨營收 %」number-link（D-V3-31＝B、D-V4-32＝A）。
// 四個視窗都跑（1440×1000、1280×900、768×1024、390×844）；示範資料（fixtures/demo），另有 4 通路合成資料與 fixtures/refund_only 各一條。
// 字串一律由 labels 組出、定位用 testid（PRD §4.7）；期待的數字與文字由 Node 端以同一組 application 函式算（chart-helpers-v4 的 datasetSnapshot），不寫死。
// G9 的條依 PRD §4.5 與 CHART_CATALOG G9「條不另設點擊」（代理 C 偏差 1）：點條等於點 summary（展開或收合），抽屜由展開內容第一行的影響金額 number-link 開。
// V4-3b 代理 E（06_BATCHES V4-3b「驗收重點」的瀏覽器部分；CHART_CATALOG G11、G12 的 E2E 草案）：檔尾兩組——G11 日 × 通路月曆熱表（ChartFrame mode="table"、C28 roving tabindex、
// 格的抽屜帶 filter { channel, date }）與 G12 五項比率每週走勢（<details> 內的 C26 小倍數）。期待的文字與格由 Node 端的 heatSectionModel、ratesModel 算，不寫死。
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { chartColors, chartHeights, chartRowHeights } from "../../src/application/chart-theme";
import { CHANNEL_STRUCTURE_VERSION } from "../../src/application/chart-structure";
import { CHANNEL_WEEKS_VERSION, channelWeeks, recentChannelWeeks } from "../../src/application/chart-channel-weeks";
import { channelLabel, channelsLabel, demoAlias } from "../../src/application/copy";
import { evidenceFilterText } from "../../src/application/evidence-filter";
import { buildManagerSummary } from "../../src/application/manager-summary";
import { buildPnlTable } from "../../src/application/pnl-table";
import { formatAmountL1, formatAmountL3, formatDateL1, formatHeatCell, formatPeriodL1, formatRateLayer, metricDefinitions } from "../../src/application/presentation";
import { profitWaterfall } from "../../src/application/waterfall";
import { CHANNEL_FEE_FIELDS } from "../../src/application/chart-structure";
import type { RuleCode } from "../../src/domain/types";
import { IMPACT_BAR_RULES, IMPACT_BAR_TOTAL_RULE, hasImpactBar } from "../../src/components/diagnosis-list";
import { sharePerHundredText, shareSectionModel, type ShareSectionModel } from "../../src/components/diagnosis/share-section";
import { DAILY_HEATMAP_VERSION, negativeAfterYuan, type HeatValueCell } from "../../src/application/chart-heatmap";
import { uniqueSources } from "../../src/domain/aggregation";
import { heatCellTestId, heatSectionModel, type HeatSectionModel } from "../../src/components/diagnosis/heat-section";
import { RATE_METRICS, ratesModel } from "../../src/components/diagnosis/rates-section";
import { evidenceDrawer, loadDemo } from "./launch-helpers-v310";
import { importViaWizard } from "./import-wizard-helpers";
import { openPnlTable, pnlEvidenceHeading } from "./pnl-helpers-v39";
import { choosePreset, dismissSavePrompt, isMobile, navigateTo, openDetails } from "./replacement-helpers";
import { analyticsCount, channelSpark, channelSparks, channelWeeksDetails, channelWeeksTable, channelWideTable, clickChartShape, datasetSnapshot, diagnosisRuleOrder, evidenceTechnicalRows, expectNoPageScrollX, frameBox, frameHeights, heatCell, heatCellInfo, heatFrame, heatGrid, heatLink, heatScroll, heatSection, heatTabStop, heatTables, impactBar, impactBarInfo, impactBars, importSynthetic, openDataTable, openRates, pnlShare, ratesFrame, ratesMore, ratesPanels, ratesSection, ratesTable, ratesYTicks, shareSection, shareSeg, shareSegInfo, shareSegs, shareTable, shareTableLink, stubAnalytics } from "./chart-helpers-v4";

const share = labels.diagnosis.chartsV4.share;
const spark = labels.diagnosis.chartsV4.channelsSpark;
const status = labels.shell.status;
/** 抽屜標題（h2 可及名稱）：「{title} · 計算與來源」（evidence-drawer.tsx 的 sr-only 後綴）。 */
const drawerTitle = (title: string) => `${title} · ${labels.evidence.sections.evidence}`;
const drawerHeading = (page: Page) => evidenceDrawer(page).getByRole("heading", { level: 2 });
const drawerNumber = (page: Page) => evidenceDrawer(page).locator(".evidence-body > p.number");
const preciseValue = (page: Page) => evidenceDrawer(page).getByTestId("evidence-precise-value");
const yuan = (value: string) => fill(labels.format.units.yuan, { value: formatAmountL3(value) });
/** 示範資料的資料截止日（manifest.data_as_of；抽屜篩選片語的週名錨點）。 */
const DEMO_AS_OF = "2026-08-24";
/** 示範資料本期剛好 6 個完整週（CHART_CATALOG G7 E2E 草案）。 */
const DEMO_WEEKS = 6;
const wide = (page: Page) => page.viewportSize()!.width >= 1024;

async function closeDrawer(page: Page) {
  await page.keyboard.press("Escape");
  await expect(evidenceDrawer(page)).toHaveCount(0);
}
async function openDiagnosis(page: Page) {
  await page.goto("/");
  await loadDemo(page);
  await navigateTo(page, "diagnosis");
  await expect(page.getByTestId("diagnosis-panel")).toBeVisible();
  await expect(shareSection(page)).toBeVisible();
}
async function boxOf(locator: Locator) {
  const value = await locator.boundingBox();
  expect(value, "元素有 bounding box").not.toBeNull();
  return value!;
}
/** 主層（不在 <details> 內、看得到）的獨立圖區塊（section.chart-section）的 testid（CL-9）。 */
const mainChartSections = (page: Page) => page.locator("main section.chart-section").evaluateAll(nodes => nodes.filter(node => !node.closest("details") && (node as HTMLElement).checkVisibility()).map(node => node.getAttribute("data-testid")));
/** G10 的列右端標值（ready 列，text.share-value）與不適用、資料待補列的文字（text.share-status），依 DOM 順序。 */
const shareValues = (page: Page) => shareSection(page).locator("svg.chart-share-stack text.share-value").allTextContents();
const shareStatuses = (page: Page) => shareSection(page).locator("svg.chart-share-stack text.share-status").allTextContents();
/** 模型裡 ready 列的右端標值（剩／虧 {n} 元）與其他列的狀態字（不適用、資料待補）。 */
const expectedValues = (model: ShareSectionModel) => model.rows.filter(row => row.structure.status === "ready").map(row => sharePerHundredText(row.perHundred));
const expectedStatuses = (model: ShareSectionModel) => model.rows.filter(row => row.structure.status !== "ready").map(row => row.structure.status === "missing" ? status.missing : status.notApplicable);
/** G10 資料表的欄（不含列頭）：淨營收、商品成本、四項費用、通路費用合計、廣告投放費、扣廣告後貢獻、每 100 元淨營收（代理 A 偏差 1、2）。 */
const SHARE_COLUMN = { net_revenue: 0, cogs_net: 1, fees: 6, ad_spend: 7, contribution_after_marketing: 8, perHundred: 9 } as const;
const SHARE_COLUMNS = 10;

test.describe("V4-3a 健檢 G9 健檢清單內嵌影響金額條", () => {
  test("差額類規則各一條、水準類沒有條（留同寬空位）；REV_UP_CM_DOWN 空心、其餘實心不利色；共用尺度（最長＝半寬、依 |影響| 由大到小、零線同 x）；條在 summary 的影響金額之後同一行、aria-hidden 不可聚焦；清單下方註明；1440 首列底與第一條頂", async ({ page }, testInfo) => {
    await openDiagnosis(page);
    const rules = await diagnosisRuleOrder(page);
    const barred = rules.filter(rule => IMPACT_BAR_RULES.has(rule as RuleCode));
    expect(barred, "示範資料：差額類五條（REV_UP_CM_DOWN 與四個費用負擔規則）").toEqual(["DISCOUNT_BURDEN_UP", "REV_UP_CM_DOWN", "MARKETING_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP"]);
    await expect(impactBars(page)).toHaveCount(barred.length);
    await expect(page.getByTestId("diagnosis-list")).toHaveAttribute("data-impact-bars", "");
    // 水準類規則（NEGATIVE_CHANNEL_CM；SKU_NEGATIVE_GP 示範資料沒有）不畫條，在同位置留同寬空位，影響金額照舊。
    for (const rule of ["NEGATIVE_CHANNEL_CM", "SKU_NEGATIVE_GP"]) await expect(impactBar(page, rule), `${rule}：水準類規則沒有條`).toHaveCount(0);
    const levelRow = page.getByTestId("diagnosis-row-NEGATIVE_CHANNEL_CM").locator(":scope > summary .diagnosis-impact");
    await expect(levelRow.locator(".impact-bar.is-empty[aria-hidden='true']")).toHaveCount(1);
    await expect(levelRow.locator(".impact-amount")).toHaveCount(1);

    const info = await impactBarInfo(page);
    expect(info.map(item => item.rule), "條的 DOM 順序＝清單列順序").toEqual(barred);
    const barWidth = wide(page) ? 96 : 64;
    for (const item of info) {
      expect(item.inSummary && item.afterAmount, `${item.rule}：在 summary 的 span.diagnosis-impact 內、影響金額之後`).toBe(true);
      expect([item.ariaHidden, item.focusable, item.tabIndex], `${item.rule}：aria-hidden、不可聚焦`).toEqual(["true", "false", null]);
      expect(item.tone, `${item.rule}：示範資料各列都是不利`).toBe("unfavorable");
      expect(item.zeroX, `${item.rule}：零線在中間（variance）`).toBe(item.viewWidth / 2);
      expect(item.box.width, `${item.rule}：條寬（≥ 1024 為 96、≤ 1023 為 64）`).toBe(barWidth);
      // 同一行：條的中線與影響金額的中線差不到 4px（PRD §5.2「列高不變」，代理 C 偏差 2 的 390 也在同一行）。
      expect(Math.abs((item.box.y + item.box.height / 2) - (item.amountBox.y + item.amountBox.height / 2)), `${item.rule}：條與影響金額同一行`).toBeLessThanOrEqual(4);
      const outline = item.rule === IMPACT_BAR_TOTAL_RULE;
      expect(item.classes.includes("is-outline"), `${item.rule}：只有總差額規則是空心條`).toBe(outline);
      if (outline) expect([item.fill, item.stroke, item.strokeWidth], `${item.rule}：空心條（不填色、2px 不利色框）`).toEqual(["none", chartColors.unfavorable, "2"]);
      else expect([item.fill, item.stroke], `${item.rule}：實心不利色`).toEqual([chartColors.unfavorable, null]);
    }
    expect(new Set(info.map(item => item.zeroX)).size, "各條零線 x 相同（同一把尺）").toBe(1);
    // 共用尺度：|影響| 最大的 DISCOUNT_BURDEN_UP 是最長的實心條，寬＝半寬（48）；實心條寬依清單順序（|影響| 由大到小）不增。
    const solid = info.filter(item => item.rule !== IMPACT_BAR_TOTAL_RULE);
    expect(solid[0].rule).toBe("DISCOUNT_BURDEN_UP");
    expect(solid[0].width, "最長的條＝半寬").toBe(info[0].viewWidth / 2);
    for (let index = 1; index < solid.length; index++) expect(solid[index].width!, `${solid[index].rule} 不比 ${solid[index - 1].rule} 長`).toBeLessThanOrEqual(solid[index - 1].width!);
    // 不利往左：實心條右緣貼零線。
    for (const item of solid) expect(Math.round((item.x! + item.width!) * 10) / 10, `${item.rule}：不利往左（右緣＝零線）`).toBe(item.zeroX);
    // 空心條（總差額 −598,833.95）比最長的實心條（−1,188,365.10）短，框外緣不超出零線。
    const outline = info.find(item => item.rule === IMPACT_BAR_TOTAL_RULE)!;
    expect(outline.width!).toBeLessThan(solid[0].width!);
    expect(outline.x! + outline.width!).toBeLessThanOrEqual(outline.zeroX!);
    // 清單下方註明空心與實心的差別（只在畫了空心條時出現）。
    const note = page.getByTestId("diagnosis-panel").locator("p.note.impact-note");
    await expect(note).toHaveText(labels.diagnosis.chartsV4.impact.totalNote);
    await expect(note).toBeVisible();
    // 條內沒有停留點。
    await expect(impactBars(page).locator("[tabindex], a, button")).toHaveCount(0);
    if (testInfo.project.name === "desktop") {
      // B1（06 護欄表、PRD §5.2）：健檢首列底不晚於 V4-0a 實測 888、第一個 G9 條頂 ≤ 900（文件座標；metrics.spec 另以 PUBLIC_DEMO 伺服器硬斷言）。
      await page.evaluate(() => window.scrollTo(0, 0));
      const first = await page.getByTestId(`diagnosis-row-${rules[0]}`).evaluate(node => { const rect = node.getBoundingClientRect(); return rect.bottom + window.scrollY; });
      expect(first, "健檢首列底 ≤ 888（V4-0a 實測）").toBeLessThanOrEqual(888);
      expect(info[0].box.y, "第一個 G9 條頂 ≤ 900").toBeLessThanOrEqual(900);
    }
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-3a-g9-bars", description: JSON.stringify(info.map(item => ({ rule: item.rule, x: item.x, width: item.width, top: item.box.y }))) });
  });

  test("條不另設點擊：點條等於點 summary（收合、再展開該列），不開抽屜、不記 chart_clicked；展開內容第一行的影響金額 number-link 開該列的抽屜", async ({ page }) => {
    await stubAnalytics(page);
    await openDiagnosis(page);
    const row = page.getByTestId("diagnosis-row-DISCOUNT_BURDEN_UP");
    await expect(row, "前三列預設展開").toHaveAttribute("open", "");
    await impactBar(page, "DISCOUNT_BURDEN_UP").click();
    await expect(row).not.toHaveAttribute("open", /.*/);
    await expect(evidenceDrawer(page)).toHaveCount(0);
    await impactBar(page, "DISCOUNT_BURDEN_UP").click();
    await expect(row).toHaveAttribute("open", "");
    await expect(evidenceDrawer(page)).toHaveCount(0);
    expect(await analyticsCount(page, "chart_clicked"), "點條不記 chart_clicked").toBe(0);
    const link = row.locator(".impact-line button.number-link");
    await link.click();
    await expect(evidenceDrawer(page)).toBeVisible();
    await closeDrawer(page);
    await expect(link).toBeFocused();
  });
});

test.describe("V4-3a 健檢 G10 每 100 元淨營收去向", () => {
  test("清單之後、通路寬表之前；標題與副標由 labels 組出；圖例四項；.chart-frame.sm aria-hidden、svg 高＝（列數＋2）× 24 ≤ 固定高；示範資料 12 段（MARKETPLACE 超過 100 照常畫、不利色）；右端標值與合計「剩 16.2 元」；主層獨立圖區塊（V4-3b 起＝2：G10、G11）；切期間框高不變；390 頁面不橫向捲動", async ({ page }, testInfo) => {
    const snapshot = await datasetSnapshot("demo");
    const model = shareSectionModel(snapshot);
    await openDiagnosis(page);
    const section = shareSection(page);
    // DOM 順序：健檢清單 → G10 → 通路寬表。
    const order = await page.evaluate(() => ["diagnosis-panel", "chart-diagnosis-share", "channel-compare"].map(id => document.querySelector(`[data-testid='${id}']`)!).map((node, index, all) => index === 0 || !!(all[index - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)));
    expect(order, "清單、G10、通路寬表的 DOM 順序").toEqual([true, true, true]);
    // V4-3b 核對：G11 熱表接在 G10 之後，主層獨立圖區塊＝2（G10、G11；G12 在 <details> 內不計，CL-9）。
    expect(await mainChartSections(page), "健檢頁主層獨立圖區塊是 G10、G11（V4-3b 起 CL-9＝2）").toEqual(["chart-diagnosis-share", "chart-diagnosis-heat"]);
    await expect(section).toHaveAttribute("aria-describedby", "share-sub");
    await expect(section.locator("#share-title")).toHaveText(model.title);
    expect(model.titleKind, "示範資料有虧損通路").toBe("loss");
    expect(model.title).toBe(fill(share.title.loss, { channel: channelLabel("MARKETPLACE", demoAlias(snapshot.report.dataset_id)), n: model.rows.find(row => row.channel === "MARKETPLACE")!.perHundred!.replace("-", "") }));
    await expect(section.locator("#share-sub")).toHaveText(model.subtitle);
    await expect(section.locator(".legend > span")).toHaveText([metricDefinitions.cogs_net.label, share.feesTitle, metricDefinitions.ad_spend.shortLabel, share.segments.remain]);
    await expect(section.locator(".legend svg.legend-mark[data-shape='rect'] rect"), "剩餘的圖例是空心框（與圖內形狀相同）").toHaveAttribute("fill", "none");

    const frame = frameBox(section);
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveClass(/(^|\s)sm(\s|$)/);
    await expect(frame).toHaveAttribute("aria-hidden", "true");
    const svg = frame.locator("svg.chart-share-stack");
    await expect(svg).toHaveAttribute("aria-hidden", "true");
    await expect(svg).toHaveAttribute("focusable", "false");
    await expect(frame.locator("[tabindex], a, button")).toHaveCount(0);
    const svgHeight = Number(await svg.getAttribute("height"));
    expect(svgHeight, "svg 高＝（列數＋2）× 24（列數＝通路數，另含合計與軸各一列）").toBe((snapshot.report.scope.channels.length + 2) * chartRowHeights.row24);
    expect(svgHeight, "≤ 所選固定高（sm）").toBeLessThanOrEqual(chartHeights.sm);
    expect((await boxOf(frame)).height, "框高＝chartHeights.sm").toBe(chartHeights.sm);

    const segs = await shareSegInfo(page);
    expect(segs.map(seg => seg.id), "示範資料 12 段：DTC 與合計有剩、MARKETPLACE 超過 100").toEqual(["DTC-cogs", "DTC-fees", "DTC-ad", "DTC-remain", "MARKETPLACE-cogs", "MARKETPLACE-fees", "MARKETPLACE-ad", "MARKETPLACE-over", "total-cogs", "total-fees", "total-ad", "total-remain"]);
    const fills: Record<string, string> = { cogs: chartColors.seg1, fees: chartColors.seg2, ad: chartColors.seg3, remain: "none", over: chartColors.unfavorable };
    for (const seg of segs) {
      const segment = seg.id.split("-").pop()!;
      expect(seg.fill, `${seg.id} 的填色`).toBe(fills[segment]);
      expect(seg.stroke, `${seg.id} 的框線（剩餘是空心框，其他是 1px 表面色分隔線）`).toBe(segment === "remain" ? chartColors.total : chartColors.surface);
      expect(seg.width, `${seg.id} 有寬度`).toBeGreaterThan(0);
    }
    // 超過 100 的部分從 100 的參考線往右畫；三段在 100 處截斷（MARKETPLACE 的廣告段右緣＝over 左緣）。
    const over = segs.find(seg => seg.id === "MARKETPLACE-over")!, ad = segs.find(seg => seg.id === "MARKETPLACE-ad")!;
    expect(Math.abs(ad.x + ad.width - over.x)).toBeLessThanOrEqual(0.2);
    const reference = Number(await svg.locator("line.share-reference").getAttribute("x1"));
    expect(Math.abs(over.x - reference), "over 從 100 的參考線開始").toBeLessThanOrEqual(0.2);
    // 右端標值：每 100 元剩／虧（一位小數）；合計＝profitWaterfall(snapshot, "all").perHundred（示範 16.2）。
    expect(await shareValues(page)).toEqual(expectedValues(model));
    expect(await shareStatuses(page)).toEqual([]);
    const total = model.rows.find(row => row.total)!;
    expect(total.perHundred, "合計的每 100 元＝profitWaterfall(all).perHundred").toBe(profitWaterfall(snapshot, "all", { alias: true }).perHundred);
    expect(total.perHundred, "示範資料合計剩 16.2（06 驗收重點）").toBe("16.2");
    await expect(svg.locator("text.share-value.is-unfavorable"), "虧的標值用不利色").toHaveText([sharePerHundredText(model.rows.find(row => row.channel === "MARKETPLACE")!.perHundred)!]);

    // 切期間（近 7 天）：框高不變（B4）；G10 照樣畫（同一組通路）。
    const before = await frameHeights(page);
    // V4-3b 核對：主層看得到的框多了 G11 熱表（lg）；G12 收在 <details> 內，收合時沒有 bounding box，不列入。
    expect(before).toEqual({ "chart-diagnosis-share": chartHeights.sm, "chart-diagnosis-heat": chartHeights.lg });
    await choosePreset(page, "last7");
    await expect(shareSegs(page).first()).toBeVisible();
    expect(await frameHeights(page), "近 7 天：G10 框高不變").toEqual(before);
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-3a-g10-segs", description: JSON.stringify(segs) });
  });

  test("資料表：收合時已掛載；展開記 chart_table_opened；列＝通路＋合計、10 欄每格 number-link；最後一欄「剩／虧 {n} 元」；寬表在 .table-scroll 內捲動、頁面不橫向捲動", async ({ page }, testInfo) => {
    const snapshot = await datasetSnapshot("demo");
    const model = shareSectionModel(snapshot);
    await stubAnalytics(page);
    await openDiagnosis(page);
    const table = shareTable(page);
    await expect(table, "M1：收合時表格已在 DOM").toHaveCount(1);
    await expect(table).toBeHidden();
    const details = await openDataTable(shareSection(page));
    await expect(details.locator(":scope > summary")).toHaveText(fill(labels.overview.page.dataTable, { title: share.section }));
    await expect.poll(() => analyticsCount(page, "chart_table_opened"), { message: "展開資料表記 chart_table_opened" }).toBe(1);
    const { period } = snapshot.report.current;
    const caption = fill(share.caption, { section: share.section, period: formatPeriodL1(period.start, period.end, { days: false, anchor: snapshot.data_as_of }) });
    await expect(table.locator("caption")).toHaveText(caption);
    await expect(details.locator(".chart-data-scroll[role='region']")).toHaveAttribute("aria-label", caption);
    await expect(table.locator("thead th")).toHaveCount(1 + SHARE_COLUMNS);
    await expect(table.locator("thead th").last()).toHaveText(share.columns.perHundred);
    await expect(table.locator("thead th").nth(1 + SHARE_COLUMN.fees)).toHaveText(fill(labels.format.units.yuanColumn, { label: share.feesTitle }));
    await expect(table.locator("thead th").nth(1 + SHARE_COLUMN.cogs_net)).toHaveText(fill(labels.format.units.yuanColumn, { label: metricDefinitions.cogs_net.label }));
    for (const [index, field] of CHANNEL_FEE_FIELDS.entries()) await expect(table.locator("thead th").nth(2 + SHARE_COLUMN.cogs_net + index)).toHaveText(fill(labels.format.units.yuanColumn, { label: metricDefinitions[field].label }));
    await expect(table.locator("tbody tr"), "列＝通路＋合計").toHaveCount(snapshot.report.scope.channels.length + 1);
    await expect(table.locator("tbody th")).toHaveText(model.rows.map(row => row.label));
    await expect(table.locator("tbody button.number-link"), "示範資料每格都有值、都是 number-link（D-V4-32＝A）").toHaveCount(model.rows.length * SHARE_COLUMNS);
    // V4-8a（D-V4-45＝B）：不利的扣廣告後貢獻與「虧 n 元」帶 C33 unfavorable（示範資料只有 MARKETPLACE 兩格）。
    await expect(table.locator("tbody button.number-link.negative"), "示範資料 G10 不利色：MARKETPLACE 兩格").toHaveCount(2);
    await expect(table.locator("tbody tr").filter({ has: page.getByRole("rowheader", { name: model.rows.find(row => row.channel === "MARKETPLACE")!.label, exact: true }) }).locator("button.number-link.negative")).toHaveCount(2);
    await expect(table.locator("tbody tr td:last-child")).toHaveText(model.rows.map(row => sharePerHundredText(row.perHundred)!));
    expect(await analyticsCount(page, "chart_clicked")).toBe(0);
    const scroll = await details.locator(".chart-data-scroll").evaluate(node => ({ scrollWidth: node.scrollWidth, clientWidth: node.clientWidth }));
    testInfo.annotations.push({ type: "v4-3a-g10-table-scroll", description: JSON.stringify(scroll) });
    await expectNoPageScrollX(page);
  });

  test("點段開抽屜並記 chart_clicked，與資料表同欄 number-link 同一個抽屜：商品成本（篩到該通路）、通路費用合計（不帶「+」、channel-structure-v1、不出現 platform_fees 的公式與定義）、超過 100 與合計剩餘（扣廣告後貢獻）；每 100 元格是百分比（扣廣告後貢獻率，有算式與兩個組成）", async ({ page }, testInfo) => {
    const snapshot = await datasetSnapshot("demo");
    const model = shareSectionModel(snapshot);
    const alias = demoAlias(snapshot.report.dataset_id);
    const label = (channel: string) => channelLabel(channel, alias);
    const current = snapshot.report.current;
    await stubAnalytics(page);
    await openDiagnosis(page);
    await openDataTable(shareSection(page));
    let clicks = 0;
    const clickSeg = async (key: string, segment: string) => {
      await clickChartShape(shareSeg(page, key, segment));
      clicks++;
      await expect(evidenceDrawer(page)).toBeVisible();
      await expect.poll(() => analyticsCount(page, "chart_clicked"), { message: `點 ${key}-${segment} 記 chart_clicked` }).toBe(clicks);
    };
    const filterText = (channel: string) => evidenceFilterText({ channel }, { alias, anchor: DEMO_AS_OF })!;

    // 1. DTC 商品成本段：channelEvidence（帶 filter.channel），大數字不帶號；資料表同欄格開同一個抽屜。
    const dtcCogs = yuan(current.channels.DTC.metrics.cogs_net.value!);
    await clickSeg("DTC", "cogs");
    await expect(drawerHeading(page)).toHaveText(drawerTitle(metricDefinitions.cogs_net.label));
    await expect(preciseValue(page)).toHaveText(dtcCogs);
    await expect(evidenceDrawer(page).getByTestId("evidence-filter").locator("span")).toHaveText(filterText("DTC"));
    await closeDrawer(page);
    const cogsLink = shareTableLink(page, label("DTC"), SHARE_COLUMN.cogs_net);
    await cogsLink.click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(metricDefinitions.cogs_net.label));
    await expect(preciseValue(page)).toHaveText(dtcCogs);
    await closeDrawer(page);
    await expect(cogsLink).toBeFocused();

    // 2. DTC 四項費用段：通路費用合計（valueKind level、channel-structure-v1、證據自帶標題、定義、技術算式；組成是四項費用）。
    const dtcFees = model.rows.find(row => row.channel === "DTC")!.structure.fees.value!;
    for (const open of [() => clickSeg("DTC", "fees"), () => shareTableLink(page, label("DTC"), SHARE_COLUMN.fees).click()]) {
      await open();
      const drawer = evidenceDrawer(page);
      await expect(drawerHeading(page)).toHaveText(drawerTitle(share.feesTitle));
      await expect(drawerNumber(page), "水準值：大數字不帶「+」").not.toHaveText(/^[+−-]/);
      await expect(preciseValue(page)).toHaveText(yuan(dtcFees));
      await expect(drawer.getByTestId("evidence-rounding-note"), "水準值沒有取位說明").toHaveCount(0);
      await expect(drawer.locator(".evidence-formula")).toHaveText(fill(share.feesFormula, { platform: metricDefinitions.platform_fees.label, payment: metricDefinitions.payment_fees.label, fulfillment: metricDefinitions.fulfillment_costs.label, other: metricDefinitions.other_variable_costs.label }));
      await expect(drawer.locator(".evidence-components tbody th")).toHaveText(CHANNEL_FEE_FIELDS.map(field => metricDefinitions[field].label));
      await expect(drawer.locator(".evidence-definition")).toContainText(share.feesDefinition);
      await expect(drawer.locator(".evidence-definition")).not.toContainText(metricDefinitions.platform_fees.plain);
      await expect(drawer.locator(".ladder-table")).toHaveCount(0);
      const rows = await evidenceTechnicalRows(drawer);
      expect(rows.find(row => row.dt === labels.evidence.technicalFormula)?.dd, "技術算式是四項相加").toBe(share.feesTechnical);
      expect(rows.find(row => row.dt === "metric_version")?.dd).toBe(CHANNEL_STRUCTURE_VERSION);
      expect(rows.some(row => row.dd.includes(metricDefinitions.platform_fees.formulaTechnical)), "技術細節不出現 platform_fees 的公式").toBe(false);
      await closeDrawer(page);
      testInfo.annotations.push({ type: "v4-3a-g10-fees-technical", description: JSON.stringify(rows) });
    }

    // 3. MARKETPLACE 超過 100 的部分與 4. 合計的剩餘：都開扣廣告後貢獻（通路列帶篩選，合計列是範圍內全部通路、沒有篩選）。
    const result = metricDefinitions.contribution_after_marketing.label;
    await clickSeg("MARKETPLACE", "over");
    await expect(drawerHeading(page)).toHaveText(drawerTitle(result));
    await expect(preciseValue(page)).toHaveText(yuan(current.channels.MARKETPLACE.metrics.contribution_after_marketing.value!));
    await expect(evidenceDrawer(page).getByTestId("evidence-filter").locator("span")).toHaveText(filterText("MARKETPLACE"));
    await closeDrawer(page);
    await clickSeg("total", "remain");
    await expect(drawerHeading(page)).toHaveText(drawerTitle(result));
    await expect(preciseValue(page)).toHaveText(yuan(current.metrics.contribution_after_marketing.value!));
    await expect(evidenceDrawer(page).getByTestId("evidence-filter")).toHaveCount(0);
    await closeDrawer(page);
    await shareTableLink(page, labels.overview.sections.total, SHARE_COLUMN.contribution_after_marketing).click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(result));
    await expect(preciseValue(page)).toHaveText(yuan(current.metrics.contribution_after_marketing.value!));
    await closeDrawer(page);

    // 5. 每 100 元格（MARKETPLACE 虧）：扣廣告後貢獻率（unitOverride percent）——大數字 L1、精確值 L3 百分比；算式；組成＝扣廣告後貢獻與淨營收（金額欄）；不畫階梯；版本 contribution-v1。
    const margin = current.channels.MARKETPLACE.metrics.contribution_margin.value!;
    const perHundred = shareTableLink(page, label("MARKETPLACE"), SHARE_COLUMN.perHundred);
    await expect(perHundred).toHaveText(sharePerHundredText(model.rows.find(row => row.channel === "MARKETPLACE")!.perHundred)!);
    await perHundred.click();
    const drawer = evidenceDrawer(page);
    await expect(drawerHeading(page)).toHaveText(drawerTitle(metricDefinitions.contribution_margin.label));
    await expect(drawerNumber(page)).toHaveText(formatRateLayer(margin, "L1"));
    await expect(preciseValue(page)).toHaveText(formatRateLayer(margin, "L3"));
    await expect(drawer.locator(".evidence-formula")).toHaveText(metricDefinitions.contribution_margin.formula);
    await expect(drawer.locator(".evidence-components thead th").last()).toHaveText(labels.evidence.drawerV3.componentsColumns.amount);
    await expect(drawer.locator(".evidence-components tbody th")).toHaveText([result, metricDefinitions.net_revenue.label]);
    await expect(drawer.locator(".evidence-components tbody td")).toHaveText([current.channels.MARKETPLACE.metrics.contribution_after_marketing.value!, current.channels.MARKETPLACE.metrics.net_revenue.value!].map(value => formatAmountL3(value)));
    await expect(drawer.locator(".ladder-table")).toHaveCount(0);
    const percentRows = await evidenceTechnicalRows(drawer);
    expect(percentRows.find(row => row.dt === labels.evidence.exactValue)?.dd).toBe(`${margin}（${labels.evidence.ratioNote}）`);
    expect(percentRows.find(row => row.dt === "metric_version")?.dd).toBe("contribution-v1");
    await closeDrawer(page);
    await expect(perHundred).toBeFocused();
    expect(await analyticsCount(page, "chart_clicked"), "資料表 number-link 不記 chart_clicked").toBe(clicks);
  });

  test("4 通路合成資料：SOCIAL（扣項為負）寫「不適用」、LIVE 寫「資料待補」，兩列沒有段；副標附一句不適用說明；標題只從可畫的通路挑；資料表 5 列", async ({ page }) => {
    const snapshot = await datasetSnapshot("synthetic");
    const model = shareSectionModel(snapshot);
    await page.goto("/");
    await importSynthetic(page);
    await navigateTo(page, "diagnosis");
    const section = shareSection(page);
    await expect(section).toBeVisible();
    expect(model.notApplicable, "合成資料的不適用通路").toEqual(["SOCIAL"]);
    await expect(section.locator("#share-title")).toHaveText(model.title);
    await expect(section.locator("#share-sub")).toHaveText(model.subtitle);
    expect(model.subtitle.endsWith(fill(share.subtitleNote, { subtitle: "", channels: channelsLabel(model.notApplicable, demoAlias(snapshot.report.dataset_id)) })), "副標末尾是不適用通路的說明句").toBe(true);
    await expect(frameBox(section)).toHaveClass(/(^|\s)sm(\s|$)/);
    expect(Number(await section.locator("svg.chart-share-stack").getAttribute("height"))).toBe((snapshot.report.scope.channels.length + 2) * chartRowHeights.row24);
    for (const channel of ["SOCIAL", "LIVE"]) await expect(section.locator(`[data-testid^='chart-diagnosis-share-seg-${channel}-']`), `${channel} 沒有段`).toHaveCount(0);
    expect(await shareValues(page)).toEqual(expectedValues(model));
    expect(await shareStatuses(page)).toEqual(expectedStatuses(model));
    expect(await shareStatuses(page)).toContain(status.notApplicable);
    expect(await shareStatuses(page)).toContain(status.missing);
    await openDataTable(section);
    await expect(shareTable(page).locator("tbody tr")).toHaveCount(snapshot.report.scope.channels.length + 1);
    await expectNoPageScrollX(page);
  });

  test("fixtures/refund_only：全部通路都不適用時標題用 title.notApplicable、沒有段、列寫「不適用」", async ({ page }) => {
    const snapshot = await datasetSnapshot("refund_only");
    const model = shareSectionModel(snapshot);
    await page.goto("/");
    await importViaWizard(page, resolve("fixtures/refund_only"), { manifest: true });
    await dismissSavePrompt(page);
    await navigateTo(page, "diagnosis");
    const section = shareSection(page);
    await expect(section).toBeVisible();
    expect(model.titleKind).toBe("notApplicable");
    await expect(section.locator("#share-title")).toHaveText(share.title.notApplicable);
    await expect(section.locator("#share-sub")).toHaveText(model.subtitle);
    await expect(shareSegs(page)).toHaveCount(0);
    expect(await shareValues(page)).toEqual([]);
    expect(await shareStatuses(page)).toEqual(expectedStatuses(model));
    expect(new Set(await shareStatuses(page))).toEqual(new Set([status.notApplicable]));
  });
});

test.describe("V4-3a 健檢 G7b 通路寬表「近 {n} 週」與「各通路每週」", () => {
  test("欄頭「近 6 週」在扣廣告後貢獻與備註之間；每通路一條 sparkline（6 點、aria-hidden、不可聚焦，Tab 跳過）；390 在清單主行右側、頁面不橫向捲動", async ({ page }, testInfo) => {
    const snapshot = await datasetSnapshot("demo");
    await openDiagnosis(page);
    const table = channelWideTable(page);
    const groups = ["net_revenue", "contribution_after_marketing"] as const;
    const head = fill(spark.head, { n: DEMO_WEEKS });
    if (!isMobile(page)) await expect(table.locator("thead tr.group-row th")).toHaveText([labels.overview.channelTable.channelHeader, ...groups.map(name => fill(labels.format.units.yuanColumn, { label: metricDefinitions[name].label })), head, labels.diagnosis.tableV3.note]);
    await expect(table.locator("thead th.spark-head")).toHaveText(head);
    await expect(channelSparks(page)).toHaveCount(snapshot.report.scope.channels.length);
    for (const channel of snapshot.report.scope.channels) {
      const svg = channelSpark(page, channel);
      await expect(svg.locator("xpath=..")).toHaveClass("spark-cell");
      await expect(svg.locator("xpath=..")).toHaveAttribute("data-list-role", "spark");
      await expect(svg).toHaveAttribute("data-points", String(DEMO_WEEKS));
      await expect(svg).toHaveAttribute("aria-hidden", "true");
      await expect(svg).toHaveAttribute("focusable", "false");
      await expect(svg.locator("[tabindex]")).toHaveCount(0);
      await expect(svg.locator("circle[data-kind='hollow']"), `${channel}：示範資料都是完整週`).toHaveCount(0);
      await expect(svg).toBeVisible();
      expect((await boxOf(svg)).width, `${channel}：寬 ≤ 64`).toBeLessThanOrEqual(64);
    }
    // Tab：從第一列扣廣告後貢獻差額（spark 格之前最後一個停留點）按一次 Tab，焦點到 DOM 順序的下一個停留點（sparkline 不是停留點）。
    const firstRow = table.locator("tbody tr").first();
    const before = firstRow.locator("td").nth(5).locator("button.number-link");
    await before.focus();
    await expect(before).toBeFocused();
    await page.keyboard.press("Tab");
    const landed = await page.evaluate(() => {
      const active = document.activeElement!;
      return { inSpark: !!active.closest("td.spark-cell"), inTable: !!active.closest("table.channel-table-v3"), tag: active.tagName.toLowerCase() };
    });
    expect(landed.inSpark, "Tab 不停在 sparkline").toBe(false);
    expect(landed.tag === "a" || landed.tag === "button", `Tab 到下一個連結或按鈕（${landed.tag}）`).toBe(true);
    if (isMobile(page)) {
      // 390 清單式（C3）：sparkline 在主行右側（主行放不下時換行靠右，代理 B 偏差 7），寬 64 不變。
      for (const channel of snapshot.report.scope.channels) {
        const svg = await boxOf(channelSpark(page, channel));
        const row = await boxOf(table.locator("tbody tr").filter({ has: channelSpark(page, channel) }));
        expect(svg.x + svg.width, `${channel}：sparkline 靠右`).toBeGreaterThanOrEqual(row.x + row.width - 32);
        expect(svg.x, `${channel}：sparkline 在列的右半`).toBeGreaterThan(row.x + row.width / 2);
      }
    }
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-3a-g7b-spark-box", description: JSON.stringify(await boxOf(channelSpark(page, "DTC"))) });
  });

  test("「各通路每週」收合時已掛載；展開記 chart_table_opened；列序同寬表、6 週、每格 number-link；格的抽屜：扣廣告後貢獻、篩選片語含週名與通路名、metric_version contribution-v1 之後另列 channel-weeks-v1、不畫階梯", async ({ page }, testInfo) => {
    const snapshot = await datasetSnapshot("demo");
    const alias = demoAlias(snapshot.report.dataset_id);
    const data = recentChannelWeeks(channelWeeks(snapshot)!);
    await stubAnalytics(page);
    await openDiagnosis(page);
    const details = channelWeeksDetails(page);
    await expect(details).toHaveCount(1);
    await expect(details).not.toHaveAttribute("open", /.*/);
    await expect(details.locator(":scope > summary")).toHaveText(fill(labels.overview.page.dataTable, { title: spark.tableTitle }));
    await expect(channelWeeksTable(page), "M1：收合時表格已在 DOM").toHaveCount(1);
    await expect(channelWeeksTable(page)).toBeHidden();
    await openDetails(details);
    await expect(details).toHaveAttribute("open", "");
    await expect(channelWeeksTable(page)).toBeVisible();
    await expect.poll(() => analyticsCount(page, "chart_table_opened"), { message: "展開「各通路每週」記 chart_table_opened" }).toBe(1);
    const table = channelWeeksTable(page);
    const metric = metricDefinitions.contribution_after_marketing.label;
    await expect(table.locator("caption")).toHaveText(fill(spark.caption, { metric, n: DEMO_WEEKS }));
    await expect(table.locator("thead th")).toHaveCount(1 + DEMO_WEEKS);
    // 列序同寬表目前的排序（示範資料每列都有 sparkline，以寬表 sparkline 的 DOM 順序讀出通路代碼）。
    const wideOrder = await channelSparks(page).evaluateAll(nodes => nodes.map(node => node.getAttribute("data-testid")!.replace("chart-diagnosis-channels-spark-", "")));
    await expect(table.locator("tbody th"), "列序同寬表目前的排序").toHaveText(wideOrder.map(channel => channelLabel(channel, alias)));
    await expect(table.locator("tbody tr")).toHaveCount(snapshot.report.scope.channels.length);
    await expect(table.locator("tbody button.number-link")).toHaveCount(snapshot.report.scope.channels.length * DEMO_WEEKS);
    // V4-8a（D-V4-45＝B）：示範資料 MARKETPLACE 每週都不利、帶 C33 unfavorable；其他通路不上色。
    await expect(table.locator("tbody button.number-link.negative"), "示範資料 G7b 不利色：MARKETPLACE 每週").toHaveCount(DEMO_WEEKS);
    await expect(table.locator("tbody tr").filter({ has: page.getByRole("rowheader", { name: channelLabel("MARKETPLACE", alias), exact: true }) }).locator("button.number-link.negative")).toHaveCount(DEMO_WEEKS);

    // 第一列第一格（示範資料預設排序：本期扣廣告後貢獻由低到高，MARKETPLACE 在前）。
    const firstRowChannel = wideOrder[0];
    const week = data.weeks[0];
    const value = data.channels.find(series => series.channel === firstRowChannel)!.values[0];
    const cell = table.locator("tbody tr").first().locator("button.number-link").first();
    await expect(cell).toHaveAccessibleName(fill(labels.overview.channelsV3.amountAria, { channel: channelLabel(firstRowChannel, alias), metric: fill(labels.diagnosis.tableV3.cellLabel, { period: week.label, metric }), value: (await cell.textContent())!.trim() }));
    await cell.click();
    const drawer = evidenceDrawer(page);
    await expect(drawerHeading(page)).toHaveText(drawerTitle(metric));
    await expect(preciseValue(page)).toHaveText(yuan(value.metric.value!));
    const filter = evidenceFilterText({ week: { start: week.period.start, end: week.period.end, label: week.label }, channel: firstRowChannel }, { alias, anchor: DEMO_AS_OF })!;
    await expect(drawer.getByTestId("evidence-filter").locator("span")).toHaveText(filter);
    expect(filter).toContain(week.label);
    expect(filter).toContain(channelLabel(firstRowChannel, alias));
    await expect(drawer.locator(".ladder-table"), "單一通路的週證據不畫全通路階梯").toHaveCount(0);
    const rows = await evidenceTechnicalRows(drawer);
    const version = rows.findIndex(row => row.dt === "metric_version");
    expect(rows[version]?.dd).toBe("contribution-v1");
    expect(rows[version + 1], "metric_version 之後另列 channel-weeks-v1").toEqual({ testId: "evidence-arrange-version", dt: labels.evidence.chartsV4.arrangeVersion, dd: CHANNEL_WEEKS_VERSION });
    await closeDrawer(page);
    await expect(cell).toBeFocused();
    expect(await analyticsCount(page, "chart_clicked"), "資料表 number-link 不記 chart_clicked").toBe(0);
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-3a-g7b-technical", description: JSON.stringify(rows) });
  });

  test("4 通路合成資料：欄頭「近 3 週」；LIVE（本期資料待補）不畫 sparkline、其餘 3 條最後一週未滿 7 天畫空心點；G9 只畫差額類規則（條數＝有金額的差額類 group 數）", async ({ page }) => {
    const snapshot = await datasetSnapshot("synthetic");
    await page.goto("/");
    await importSynthetic(page);
    await navigateTo(page, "diagnosis");
    await expect(channelWideTable(page).locator("thead th.spark-head")).toHaveText(fill(spark.head, { n: 3 }));
    expect((await channelSparks(page).evaluateAll(nodes => nodes.map(node => node.getAttribute("data-testid")!.replace("chart-diagnosis-channels-spark-", "")))).sort()).toEqual(["DTC", "MARKETPLACE", "SOCIAL"]);
    await expect(channelSpark(page, "LIVE")).toHaveCount(0);
    for (const channel of ["DTC", "MARKETPLACE", "SOCIAL"]) {
      await expect(channelSpark(page, channel)).toHaveAttribute("data-points", "3");
      await expect(channelSpark(page, channel).locator("circle[data-kind='hollow']"), `${channel}：最後一週未滿 7 天是空心點`).toHaveCount(1);
      await expect(channelSpark(page, channel).locator("circle[data-kind='hollow']")).toHaveAttribute("fill", chartColors.surface);
    }
    const groups = buildManagerSummary(snapshot).diagnosis;
    await expect(impactBars(page)).toHaveCount(groups.filter(hasImpactBar).length);
    for (const group of groups) await expect(impactBar(page, group.rule), group.rule).toHaveCount(hasImpactBar(group) ? 1 : 0);
    await expect(page.getByTestId("diagnosis-panel").locator("p.note.impact-note")).toHaveCount(groups.some(group => group.rule === IMPACT_BAR_TOTAL_RULE && hasImpactBar(group)) ? 1 : 0);
    await expectNoPageScrollX(page);
  });
});

test.describe("V4-3a 總覽「進階」管理損益表「佔淨營收 %」（D-V3-31＝B、D-V4-32＝A）", () => {
  test("13 格都是 number-link（pnl-share-{指標}）；點扣廣告後貢獻那格：大數字 L1 與精確值 L3 百分比、算式、組成＝分子與分母（金額）、不畫階梯、不帶號、contribution-v1；Esc 回到該格", async ({ page }) => {
    const snapshot = await datasetSnapshot("demo");
    const table = buildPnlTable(snapshot, "day");
    const metric = "contribution_after_marketing";
    const row = table.rows.find(item => item.metric === metric)!;
    await page.goto("/");
    await loadDemo(page);
    await openPnlTable(page);
    for (const item of table.rows) await expect(pnlShare(page, item.metric), item.metric).toHaveCount(1);
    await expect(page.getByTestId("pnl-table").locator("td[data-col='share'] button.number-link")).toHaveCount(table.rows.length);
    const link = pnlShare(page, metric);
    await expect(link).toHaveText(formatRateLayer(row.share.value, "L1"));
    await link.click();
    const drawer = evidenceDrawer(page);
    const label = metricDefinitions[metric].label, net = metricDefinitions.net_revenue.label;
    await expect(drawerHeading(page)).toHaveText(pnlEvidenceHeading(label, labels.overview.pnlV3.columns.share));
    await expect(drawerNumber(page)).toHaveText(formatRateLayer(row.share.value, "L1"));
    await expect(preciseValue(page)).toHaveText(formatRateLayer(row.share.value, "L3"));
    await expect(drawerNumber(page), "比率是水準值，不帶號").not.toHaveText(/^[+−-]/);
    await expect(drawer.locator(".evidence-formula")).toHaveText(fill(labels.evidence.chartsV4.percent.formula, { numerator: label, denominator: net }));
    await expect(drawer.locator(".evidence-components tbody th")).toHaveText([label, net]);
    await expect(drawer.locator(".evidence-components tbody td")).toHaveText([row.total.metric.value!, snapshot.report.current.metrics.net_revenue.value!].map(value => formatAmountL3(value)));
    await expect(drawer.locator(".ladder-table")).toHaveCount(0);
    await expect(drawer.getByTestId("evidence-rounding-note")).toHaveCount(0);
    const rows = await evidenceTechnicalRows(drawer);
    expect(rows.find(item => item.dt === labels.evidence.exactValue)?.dd).toBe(`${row.share.value}（${labels.evidence.ratioNote}）`);
    expect(rows.find(item => item.dt === "metric_version")?.dd).toBe("contribution-v1");
    await closeDrawer(page);
    await expect(link).toBeFocused();
  });
});

// ── V4-3b：G11 日 × 通路月曆熱表、G12 五項比率每週走勢 ──
const heatCopy = labels.diagnosis.chartsV4.heat;
const ratesCopy = labels.diagnosis.chartsV4.rates;
const MINUS = "−";
const TRANSPARENT = "rgba(0, 0, 0, 0)";
/** heatSectionModel 的格（依 DOM 順序；期間外的格沒有 testid，不列入）。 */
const modelCells = (model: HeatSectionModel) => model.tables.flatMap(table => table.rows.flatMap(row => row.cells.filter(cell => cell.tier !== "outside")));
/** 模型裡每一格的通路與 domain 值（testid → 格）。 */
function modelValueCells(model: HeatSectionModel): Map<string, { channel: string; cell: HeatValueCell }> {
  const out = new Map<string, { channel: string; cell: HeatValueCell }>();
  for (const channel of model.result.heatmap!.channels) for (const row of channel.rows) for (const cell of row.cells) if (cell.kind === "value") out.set(heatCellTestId(channel.channel, cell.key), { channel: channel.channel, cell });
  return out;
}
/** CSS 色值（例如 chartColors.heat1＝var(--chart-heat-1)）在頁面上算出來的 rgb()：放一個暫時的 span 讀 computed color 後移除（只在測試的瀏覽器內）。 */
const resolveColors = (page: Page, values: string[]) => page.evaluate(list => list.map(value => {
  const probe = document.createElement("span");
  probe.style.color = value;
  document.body.append(probe);
  const color = getComputedStyle(probe).color;
  probe.remove();
  return color;
}), values);
/** 抽屜原始明細：逐一點分段按鈕，讀每段的分段名稱與日期欄（td.evidence-date）。 */
async function sourceDatesByTab(page: Page): Promise<{ tab: string; dates: string[] }[]> {
  const buttons = evidenceDrawer(page).getByRole("group", { name: labels.evidence.drawer.sourceTabsAria, exact: true }).getByRole("button");
  const out: { tab: string; dates: string[] }[] = [];
  const count = await buttons.count();
  for (let index = 0; index < count; index++) {
    const button = buttons.nth(index);
    await button.click();
    await expect(button).toHaveAttribute("aria-pressed", "true");
    out.push({ tab: (await button.textContent())!.trim(), dates: await evidenceDrawer(page).locator("table.source-table td.evidence-date").allTextContents() });
  }
  return out;
}
/** 一格的來源列依分段的筆數（與抽屜的分段按鈕同一套：uniqueSources 去重、依銷售、通路費用、廣告、資料集設定的順序，筆數 0 的分段不出現）。 */
const SOURCE_TAB_FILES = { sales: "sales_daily.csv", costs: "channel_costs_daily.csv", ads: "ad_spend_daily.csv", manifest: "manifest.json" } as const;
function expectedSourceTabs(cell: HeatValueCell): string[] {
  const unique = uniqueSources(cell.sources);
  return (Object.keys(SOURCE_TAB_FILES) as (keyof typeof SOURCE_TAB_FILES)[]).map(tab => ({ tab, n: unique.filter(source => source.file === SOURCE_TAB_FILES[tab]).length })).filter(item => item.n > 0).map(item => fill(labels.evidence.drawer.tabWithCount, { tab: labels.evidence.sourceTabs[item.tab], n: item.n }));
}
/** 單日格的抽屜：標題、精確值、篩選片語（含日期與通路名）、技術細節的版本；原始明細每段每列的日期都等於該日（資料集設定那段寫「整體資料集」）。 */
async function expectDayDrawer(page: Page, channel: string, cell: HeatValueCell, alias: boolean, anchor: string) {
  const drawer = evidenceDrawer(page);
  await expect(drawer).toBeVisible();
  await expect(drawerHeading(page)).toHaveText(drawerTitle(metricDefinitions.contribution_after_marketing.label));
  await expect(preciseValue(page)).toHaveText(yuan(cell.metric.value!));
  const phrase = evidenceFilterText({ channel, date: cell.key }, { alias, anchor })!;
  await expect(drawer.getByTestId("evidence-filter").locator("span")).toHaveText(phrase);
  expect(phrase, "篩選片語含該日期").toContain(fill(labels.evidence.chartsV4.filter.date, { date: formatDateL1(cell.key, { anchor }) }));
  expect(phrase, "篩選片語含通路名").toContain(channelLabel(channel, alias));
  const tabs = await sourceDatesByTab(page);
  expect(tabs.map(item => item.tab), "分段與筆數＝該格自己的來源列（篩選後）").toEqual(expectedSourceTabs(cell));
  for (const item of tabs) {
    expect(item.dates.length, `${item.tab}：至少一列`).toBeGreaterThan(0);
    const expected = item.tab.startsWith(labels.evidence.sourceTabs.manifest) ? labels.evidence.wholeDataset : cell.key;
    expect(item.dates.filter(date => date !== expected), `${item.tab}：每列日期都等於 ${expected}`).toEqual([]);
  }
  const rows = await evidenceTechnicalRows(drawer);
  const version = rows.findIndex(row => row.dt === "metric_version");
  expect(rows[version]?.dd, "值直接取自 domain：contribution-v1").toBe("contribution-v1");
  expect(rows[version + 1], "metric_version 之後另列 daily-heatmap-v1").toEqual({ testId: "evidence-arrange-version", dt: labels.evidence.chartsV4.arrangeVersion, dd: DAILY_HEATMAP_VERSION });
  await expect(drawer.locator(".ladder-table"), "單日單一通路的證據不畫全通路階梯").toHaveCount(0);
}

test.describe("V4-3b 健檢 G11 日 × 通路月曆熱表", () => {
  test("G10 之後、G12 與通路寬表之前；主層獨立圖區塊＝2；mode=table 的框（lg、不設 aria-hidden）與捲動區（region、無 tabindex）；標題所指的通路排第一張；每格文字＝formatHeatCell、負值保留 U+2212；正值不上色、階 1／階 2 底色、階 2 框線；整張 1 個 tabindex=0；390 月曆表寬 ≤ 捲動區、第一張不捲動就在框內；頁面不橫向捲動", async ({ page }, testInfo) => {
    const snapshot = await datasetSnapshot("demo");
    const model = heatSectionModel(snapshot);
    const heatmap = model.result.heatmap!;
    expect(heatmap.mode).toBe("daily");
    await openDiagnosis(page);
    const section = heatSection(page);
    await expect(section).toBeVisible();
    const order = await page.evaluate(() => ["[data-testid='diagnosis-panel']", "[data-testid='chart-diagnosis-share']", "[data-testid='chart-diagnosis-heat']", "details.rates-more", "[data-testid='channel-compare']"].map(selector => document.querySelector(selector)!).map((node, index, all) => index === 0 || !!(all[index - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)));
    expect(order, "清單、G10、G11、G12、通路寬表的 DOM 順序").toEqual([true, true, true, true, true]);
    expect(await mainChartSections(page), "健檢頁主層獨立圖區塊＝2（G10、G11）").toEqual(["chart-diagnosis-share", "chart-diagnosis-heat"]);
    await expect(section).toHaveAttribute("aria-labelledby", "heat-title");
    await expect(section).toHaveAttribute("aria-describedby", "heat-sub");
    await expect(section.locator("#heat-title")).toHaveText(model.title);
    expect(model.title).toBe(fill(heatCopy.title.loss, { channel: channelLabel("MARKETPLACE", demoAlias(snapshot.report.dataset_id)), n: heatmap.headline!.losing, date: formatDateL1(heatmap.headline!.key, { anchor: snapshot.data_as_of }), amount: formatAmountL1(heatmap.headline!.value) }));
    const sub = await section.locator("#heat-sub").evaluate(node => [...node.childNodes].filter(child => !(child instanceof Element && child.classList.contains("heat-scroll-note"))).map(child => child.textContent ?? "").join(""));
    expect(sub, "副標（不含捲動說明）").toBe(model.subtitle);

    // 固定高框：table 模式不設 aria-hidden、lg 320；框內是 region 捲動區（以標題命名、不加 tabindex：格本身可聚焦）。
    const frame = heatFrame(page);
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveClass(/(^|\s)lg(\s|$)/);
    await expect(frame).toHaveClass(/(^|\s)heat(\s|$)/);
    await expect(frame).toHaveAttribute("data-mode", "table");
    expect(await frame.getAttribute("aria-hidden"), "table 模式的框不設 aria-hidden").toBeNull();
    expect((await boxOf(frame)).height, "框高＝chartHeights.lg").toBe(chartHeights.lg);
    const scroll = heatScroll(page);
    await expect(scroll).toHaveAttribute("role", "region");
    await expect(scroll).toHaveAttribute("aria-labelledby", "heat-title");
    expect(await scroll.getAttribute("tabindex"), "捲動區不加 tabindex").toBeNull();
    await expect(section.locator("details"), "表本身就是資料表，不另設 <details>").toHaveCount(0);

    // 月曆：每通路一張 role=grid，caption 依模型順序（標題所指的 MARKETPLACE 第一張），欄頭＝週＋星期。
    const tables = heatTables(page);
    await expect(tables).toHaveCount(model.tables.length);
    await expect(tables.locator("caption")).toHaveText(model.tables.map(table => table.caption));
    expect(model.tables[0].key, "第一張是標題所指的通路").toBe(heatmap.headline!.channel);
    for (let index = 0; index < model.tables.length; index++) {
      await expect(tables.nth(index)).toHaveAttribute("role", "grid");
      await expect(tables.nth(index).locator("thead th")).toHaveText([model.tables[index].corner, ...model.tables[index].columns.map(column => column.label)]);
    }
    await expect(heatGrid(page)).toHaveAttribute("data-layout", "calendar");

    // 格：testid、階、文字逐格同模型；負值（取位到元後仍為負）保留 U+2212；整張 1 個 tabindex=0（第一個有值的格），其餘 −1；沒有格在 aria-hidden 內。
    const expected = modelCells(model);
    const values = modelValueCells(model);
    const info = await heatCellInfo(page);
    expect(info.map(cell => cell.testId), "格的 testid 與 DOM 順序").toEqual(expected.map(cell => cell.testId));
    expect(info.map(cell => cell.tier), "格的階").toEqual(expected.map(cell => String(cell.tier)));
    expect(info.map(cell => cell.text), "格內文字＝formatHeatCell").toEqual(expected.map(cell => cell.text));
    for (const cell of info) {
      const { cell: value } = values.get(cell.testId)!;
      expect(cell.text, `${cell.testId}`).toBe(formatHeatCell(value.metric.value));
      expect(cell.text.startsWith(MINUS), `${cell.testId}：取位到元後仍為負才帶 U+2212`).toBe(negativeAfterYuan(value.metric.value));
      expect(cell.ariaHiddenAncestor, `${cell.testId}：不在 aria-hidden 內`).toBe(false);
    }
    expect(info.some(cell => cell.text.startsWith(MINUS)), "示範資料有負值格").toBe(true);
    expect(info.filter(cell => cell.tabIndex === "0").map(cell => cell.testId), "整張熱表 1 個 tabindex=0（第一個有值的格）").toEqual([expected.find(cell => cell.tier !== "missing")!.testId]);
    expect(info.filter(cell => cell.tabIndex !== "0" && cell.tabIndex !== "-1"), "其餘格 tabindex=-1").toEqual([]);
    for (const cell of expected) await expect(page.getByTestId(cell.testId!).locator("button.heat-link")).toHaveAccessibleName(cell.aria!);

    // 色：正值與取位到元後為 0 的格不上色（D-V3-7）；階 1、階 2 各自底色；階 2 另有 2px 不利色實線框；每通路階 2 ≤ 3 格。
    const [heat1, heat2, unfavorable] = await resolveColors(page, [chartColors.heat1, chartColors.heat2, chartColors.unfavorable]);
    expect(new Set([heat1, heat2, TRANSPARENT]).size, "兩階底色不同、也不是透明").toBe(3);
    for (const cell of info) {
      const background = cell.tier === "1" ? heat1 : cell.tier === "2" ? heat2 : TRANSPARENT;
      expect(cell.background, `${cell.testId}（階 ${cell.tier}）的底色`).toBe(background);
      if (cell.tier === "2") expect([cell.borderStyle, cell.borderColor], `${cell.testId}：階 2 框線`).toEqual(["solid", unfavorable]);
    }
    const positives = info.filter(cell => { const value = values.get(cell.testId)!.cell.metric.value; return value !== null && Number(value) > 0; });
    expect(positives.length, "示範資料有正值格（DTC 全部為正）").toBeGreaterThan(0);
    expect(positives.filter(cell => cell.tier !== "0" || cell.background !== TRANSPARENT).map(cell => cell.testId), "正值不上色").toEqual([]);
    for (const channel of heatmap.channels) expect(info.filter(cell => cell.tier === "2" && cell.testId.startsWith(heatCellTestId(channel.channel, ""))).length, `${channel.channel}：階 2 ≤ 3 格`).toBe(Math.min(3, channel.losing));

    // 捲動說明：框高放不下全部月曆（columnsNeeded > 1）時輸出；一列放得下 columnsNeeded 張時由 container query 隱藏，否則顯示。
    const note = section.locator("span.heat-scroll-note");
    await expect(note).toHaveCount(model.columnsNeeded > 1 ? 1 : 0);
    const perRow = await tables.evaluateAll(nodes => nodes.filter(node => Math.abs((node as HTMLElement).offsetTop - (nodes[0] as HTMLElement).offsetTop) < 1).length);
    if (model.columnsNeeded > 1) {
      await expect(note).toHaveAttribute("data-columns", String(model.columnsNeeded));
      await expect(note).toHaveText(fill(heatCopy.scrollNoteJoin, { note: heatCopy.scrollNote }));
      if (perRow >= model.columnsNeeded) await expect(note, `一列放得下 ${perRow} 張：不顯示捲動說明`).toBeHidden();
      else await expect(note, `一列只放得下 ${perRow} 張：顯示捲動說明`).toBeVisible();
    }

    // 月曆表寬 ≤ 所在捲動區的 clientWidth（390：設計 320）；第一張月曆（標題所指的通路）不捲動就整張在框內。
    const fit = await scroll.evaluate(node => {
      const tableWidths = [...node.querySelectorAll("table.heat-table")].map(table => Math.round(table.getBoundingClientRect().width * 10) / 10);
      const frameRect = node.parentElement!.getBoundingClientRect(), first = node.querySelector("table.heat-table")!.getBoundingClientRect();
      return { clientWidth: node.clientWidth, scrollTop: node.scrollTop, tableWidths, firstTop: first.top - frameRect.top, firstBottom: first.bottom - frameRect.top, frameHeight: frameRect.height };
    });
    for (const width of fit.tableWidths) expect(width, "月曆表寬 ≤ 捲動區 clientWidth").toBeLessThanOrEqual(fit.clientWidth);
    expect(fit.scrollTop).toBe(0);
    expect(fit.firstTop, "第一張月曆頂在框內").toBeGreaterThanOrEqual(0);
    expect(fit.firstBottom, "第一張月曆底在框內（不捲動就看得到整張）").toBeLessThanOrEqual(fit.frameHeight);
    if (isMobile(page)) expect(fit.tableWidths[0], "390：月曆寬＝週欄 40＋7 × 40").toBe(320);
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-3b-g11-layout", description: JSON.stringify({ ...fit, perRow, columnsNeeded: model.columnsNeeded }) });
  });

  test("鍵盤：從 G10 資料表 summary 按 Tab 進到熱表的停留格；方向鍵、Home／End（加 Ctrl 到整張首尾）移動且 tabindex 跟著走；Enter 開當日抽屜（篩選片語含日期與通路、原始明細每列日期等於該日、daily-heatmap-v1），記 chart_clicked；Esc 回到該格；再 Tab 就離開熱表（經過熱表 2 個 Tab）", async ({ page }, testInfo) => {
    const snapshot = await datasetSnapshot("demo");
    const model = heatSectionModel(snapshot);
    const values = modelValueCells(model);
    const alias = demoAlias(snapshot.report.dataset_id);
    const ids = modelCells(model).map(cell => cell.testId!);
    const first = ids[0];
    await stubAnalytics(page);
    await openDiagnosis(page);
    const before = shareSection(page).locator(":scope > details.data-alternative > summary");
    await before.focus();
    await page.keyboard.press("Tab");
    const focusedCell = () => page.evaluate(() => document.activeElement?.closest("td[data-testid]")?.getAttribute("data-testid") ?? null);
    expect(await focusedCell(), "Tab 進熱表：第一個有值的格").toBe(first);
    const tabStop = () => heatTabStop(page).evaluateAll(nodes => nodes.map(node => node.closest("td")!.getAttribute("data-testid")));
    // 示範資料：MARKETPLACE 月曆第 1 列是 7/13（週一）到 7/19，第 2 列 7/20 起；DTC 是第二張。
    const marketplace = (date: string) => heatCellTestId("MARKETPLACE", date);
    const moves: [string, string][] = [["ArrowRight", marketplace("2026-07-14")], ["ArrowDown", marketplace("2026-07-21")], ["End", marketplace("2026-07-26")], ["Home", marketplace("2026-07-20")], ["ArrowLeft", marketplace("2026-07-19")], ["Control+End", ids.at(-1)!], ["Control+Home", first], ["ArrowRight", marketplace("2026-07-14")]];
    for (const [key, target] of moves) {
      await page.keyboard.press(key);
      expect(await focusedCell(), `${key} 之後的格`).toBe(target);
      expect(await tabStop(), `${key} 之後 tabindex=0 只在這一格`).toEqual([target]);
    }
    const target = values.get(marketplace("2026-07-14"))!;
    await page.keyboard.press("Enter");
    await expect(evidenceDrawer(page)).toBeVisible();
    await expect.poll(() => analyticsCount(page, "chart_clicked"), { message: "Enter 開抽屜記 chart_clicked" }).toBe(1);
    await expect(drawerHeading(page)).toHaveText(drawerTitle(metricDefinitions.contribution_after_marketing.label));
    await expect(preciseValue(page)).toHaveText(yuan(target.cell.metric.value!));
    await expect(evidenceDrawer(page).getByTestId("evidence-filter").locator("span")).toHaveText(evidenceFilterText({ channel: "MARKETPLACE", date: target.cell.key }, { alias, anchor: snapshot.data_as_of })!);
    await closeDrawer(page);
    await expect(heatLink(page, "MARKETPLACE", "2026-07-14"), "Esc 回到開抽屜的格").toBeFocused();
    // 經過熱表：前一個停留點（G10 資料表 summary）按 Tab 進熱表、再按 Tab 就到熱表後的第一個停留點（G12 的 summary）——2 個 Tab（≤ 3）。
    await page.keyboard.press("Tab");
    await expect(ratesMore(page).locator(":scope > summary"), "熱表之後的停留點是 G12 的 summary").toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(heatLink(page, "MARKETPLACE", "2026-07-14"), "Shift+Tab 回到上次停留的格（roving tabindex 記住位置）").toBeFocused();
    expect(await analyticsCount(page, "chart_clicked")).toBe(1);
    testInfo.annotations.push({ type: "v4-3b-g11-keyboard", description: JSON.stringify({ first, moves }) });
  });

  test("點 DTC 第一個有值日期的格（滑鼠）：開當日抽屜，篩選片語含日期與通路名、原始明細每段每列日期都等於該日；標題所指那一天（MARKETPLACE 8/22）同樣；點過的格成為停留格", async ({ page }) => {
    const snapshot = await datasetSnapshot("demo");
    const model = heatSectionModel(snapshot);
    const values = modelValueCells(model);
    const alias = demoAlias(snapshot.report.dataset_id);
    const heatmap = model.result.heatmap!;
    const dtc = heatmap.channels.find(channel => channel.channel === "DTC")!;
    const dtcFirst = dtc.rows.flatMap(row => row.cells).find((cell): cell is HeatValueCell => cell.kind === "value" && cell.metric.value !== null)!;
    await stubAnalytics(page);
    await openDiagnosis(page);
    let clicks = 0;
    for (const [channel, key] of [["DTC", dtcFirst.key], [heatmap.headline!.channel, heatmap.headline!.key]] as const) {
      const link = heatLink(page, channel, key);
      await link.click();
      clicks++;
      await expect.poll(() => analyticsCount(page, "chart_clicked"), { message: `點 ${channel} ${key} 記 chart_clicked` }).toBe(clicks);
      await expectDayDrawer(page, channel, values.get(heatCellTestId(channel, key))!.cell, alias, snapshot.data_as_of);
      await closeDrawer(page);
      await expect(link).toHaveAttribute("tabindex", "0");
      await expect(heatTabStop(page)).toHaveCount(1);
    }
    expect(heatmap.headline!.key, "標題所指的一天").toBe("2026-08-22");
    await expect(heatCell(page, heatmap.headline!.channel, heatmap.headline!.key)).toHaveAttribute("data-tier", "2");
    await expect(heatLink(page, heatmap.headline!.channel, heatmap.headline!.key)).toHaveText(formatHeatCell(heatmap.headline!.value));
  });

  test("4 通路合成資料：四張月曆、MARKETPLACE（標題所指）第一張；LIVE 缺列的日子是虛線框「資料待補」（data-tier=missing、可及名稱 cellAriaMissing）；第 3 週的期間外格留白、不可聚焦；SOCIAL 沒有上色的格；頁面不橫向捲動", async ({ page }) => {
    const snapshot = await datasetSnapshot("synthetic");
    const model = heatSectionModel(snapshot);
    await page.goto("/");
    await importSynthetic(page);
    await navigateTo(page, "diagnosis");
    const section = heatSection(page);
    await expect(section).toBeVisible();
    await expect(section.locator("#heat-title")).toHaveText(model.title);
    await expect(heatTables(page)).toHaveCount(4);
    await expect(heatTables(page).locator("caption")).toHaveText(model.tables.map(table => table.caption));
    expect(model.tables.map(table => table.key)[0]).toBe("MARKETPLACE");
    const info = await heatCellInfo(page);
    expect(info.map(cell => cell.testId)).toEqual(modelCells(model).map(cell => cell.testId));
    const missing = info.filter(cell => cell.tier === "missing");
    expect(missing.map(cell => cell.testId), "資料待補的格都在 LIVE").toEqual(modelCells(model).filter(cell => cell.tier === "missing").map(cell => cell.testId));
    expect(missing.length, "LIVE 缺列 7 天").toBe(7);
    const [missingColor] = await resolveColors(page, [chartColors.missing]);
    for (const cell of missing) {
      expect(cell.testId.startsWith(heatCellTestId("LIVE", ""))).toBe(true);
      expect([cell.text, cell.borderStyle, cell.borderColor, cell.background], `${cell.testId}：虛線框「資料待補」、不上底色`).toEqual([status.missing, "dashed", missingColor, TRANSPARENT]);
    }
    const firstMissing = modelCells(model).find(cell => cell.tier === "missing")!;
    expect(firstMissing.aria).toContain(status.missing);
    await expect(page.getByTestId(firstMissing.testId!).locator("button.heat-link")).toHaveAccessibleName(firstMissing.aria!);
    // 期間外（本期 9/07–9/23，第 3 週 9/21–9/23 之後的週四到週日）：每張 4 格留白、沒有按鈕與 testid。
    const outside = heatGrid(page).locator("td[data-tier='outside']");
    await expect(outside).toHaveCount(4 * 4);
    await expect(outside.locator("button")).toHaveCount(0);
    expect(info.filter(cell => cell.testId.startsWith(heatCellTestId("SOCIAL", "")) && cell.background !== TRANSPARENT), "SOCIAL 全部為正、不上色").toEqual([]);
    await expect(heatTabStop(page)).toHaveCount(1);
    await expectNoPageScrollX(page);
  });
});

test.describe("V4-3b 健檢 G12 五項比率每週走勢", () => {
  test("收合時已掛載（M1）、不算主層圖區塊；展開後五張子圖依序、各自的 Y 刻度；圖容器 aria-hidden、裡面沒有 <details> 與按鈕；框高 ≥ 768 為 sm、≤ 767 為 sm × 5；切期間框高不變；頁面不橫向捲動", async ({ page }, testInfo) => {
    const snapshot = await datasetSnapshot("demo");
    const model = ratesModel(snapshot);
    await stubAnalytics(page);
    await openDiagnosis(page);
    const details = ratesMore(page);
    await expect(details).toHaveCount(1);
    await expect(details).not.toHaveAttribute("open", /.*/);
    await expect(details.locator(":scope > summary")).toHaveText(ratesCopy.summary);
    await expect(ratesSection(page), "M1：收合時區塊已在 DOM").toHaveCount(1);
    await expect(ratesSection(page)).toBeHidden();
    await expect(ratesTable(page), "M1：收合時資料表已在 DOM").toHaveCount(1);
    expect(await mainChartSections(page), "G12 在 <details> 內，不算主層獨立圖區塊").not.toContain("chart-diagnosis-rates");
    expect(await frameHeights(page), "收合時沒有 G12 的框").not.toHaveProperty("chart-diagnosis-rates");

    await openRates(page);
    const section = ratesSection(page);
    await expect(section.locator("#rates-title")).toHaveText(ratesCopy.title);
    await expect(section).toHaveAttribute("aria-describedby", "rates-sub");
    await expect(section.locator("#rates-sub")).toHaveText(model.subtitle);
    const frame = ratesFrame(page);
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveClass(/(^|\s)sm(\s|$)/);
    await expect(frame).toHaveClass(/(^|\s)multiples(\s|$)/);
    await expect(frame).toHaveAttribute("aria-hidden", "true");
    await expect(frame.locator("details, button, a, [tabindex]"), "圖容器內沒有 <details>、按鈕、連結、停留點").toHaveCount(0);
    await expect(ratesPanels(page)).toHaveCount(RATE_METRICS.length);
    const ticks = await ratesYTicks(page);
    expect(ticks.map(item => item.panel), "五張子圖的順序").toEqual([...RATE_METRICS]);
    await expect(frame.locator("svg.chart-multiple text.multiple-title")).toHaveText(RATE_METRICS.map(rate => metricDefinitions[rate].label));
    expect(ticks.map(item => item.ticks), "每張子圖的 Y 刻度＝該比率自己的軸").toEqual(model.panels.map(panel => [...panel.axis.labels]));
    expect(new Set(ticks.map(item => item.ticks.join("/"))).size, "不同比率不共用尺度（Y 範圍各自）").toBeGreaterThan(1);
    const expectedHeight = isMobile(page) ? chartHeights.sm * RATE_METRICS.length : chartHeights.sm;
    expect((await boxOf(frame)).height, "框高（≤ 767px 單欄 5 張）").toBe(expectedHeight);
    const panelBoxes = await ratesPanels(page).evaluateAll(nodes => nodes.map(node => { const rect = node.getBoundingClientRect(); return { x: Math.round(rect.x), y: Math.round(rect.y), width: Math.round(rect.width) }; }));
    if (isMobile(page)) expect(new Set(panelBoxes.map(box => box.x)).size, "390：單欄").toBe(1);
    else expect(new Set(panelBoxes.map(box => box.y)).size, "≥ 768：一列放全部子圖").toBe(1);
    // B4：展開狀態下切期間（近 7 天），框高不變。
    const heights = await frameHeights(page);
    expect(heights["chart-diagnosis-rates"]).toBe(expectedHeight);
    await choosePreset(page, "last7");
    await openRates(page);
    await expect(ratesPanels(page)).toHaveCount(RATE_METRICS.length);
    expect(await frameHeights(page), "近 7 天：健檢頁看得到的框高度都不變").toEqual(heights);
    await expectNoPageScrollX(page);
    testInfo.annotations.push({ type: "v4-3b-g12-layout", description: JSON.stringify({ heights, panelBoxes, ticks }) });
  });

  test("點子圖上的週點（記 chart_clicked）與資料表同一格開同一個抽屜（帶週篩選）；資料表收合時掛載、展開記 chart_table_opened，列＝上期＋本期各週、欄＝起訖日＋五項比率", async ({ page }) => {
    const snapshot = await datasetSnapshot("demo");
    const model = ratesModel(snapshot);
    const alias = demoAlias(snapshot.report.dataset_id);
    await stubAnalytics(page);
    await openDiagnosis(page);
    await openRates(page);
    const week = model.weeks.current[0];
    const rate = "gross_margin" as const;
    const point = ratesFrame(page).locator(`.multiple[data-panel='${rate}'] circle.chart-point-hit[data-series='current'][data-index='0']`);
    await expect(point).toHaveAttribute("data-key", week.start);
    await point.click({ force: true });
    await expect(evidenceDrawer(page)).toBeVisible();
    await expect.poll(() => analyticsCount(page, "chart_clicked"), { message: "點週點記 chart_clicked" }).toBe(1);
    await expect(drawerHeading(page)).toHaveText(drawerTitle(metricDefinitions[rate].label));
    const filter = evidenceFilterText({ week: { start: week.start, end: week.end, label: week.label } }, { alias, anchor: snapshot.data_as_of })!;
    await expect(evidenceDrawer(page).getByTestId("evidence-filter").locator("span")).toHaveText(filter);
    const fromPoint = (await preciseValue(page).textContent())!.trim();
    await closeDrawer(page);

    const table = ratesTable(page);
    const dataDetails = await openDataTable(ratesSection(page));
    await expect.poll(() => analyticsCount(page, "chart_table_opened"), { message: "展開資料表記 chart_table_opened" }).toBe(1);
    await expect(dataDetails.locator(":scope > summary")).toHaveText(fill(labels.overview.page.dataTable, { title: ratesCopy.title }));
    await expect(table.locator("caption")).toHaveText(model.caption);
    await expect(table.locator("thead th")).toHaveCount(2 + RATE_METRICS.length);
    await expect(table.locator("tbody tr"), "列＝上期各週＋本期各週（去年同期不可用）").toHaveCount(model.rows.length);
    await expect(table.locator("tbody th")).toHaveText(model.rows.map(row => row.label));
    const cell = table.locator("tbody tr").filter({ has: page.getByRole("rowheader", { name: week.label, exact: true }) }).locator("td").nth(1 + RATE_METRICS.indexOf(rate)).locator("button.number-link");
    await cell.click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(metricDefinitions[rate].label));
    await expect(preciseValue(page), "資料表格與週點同一個抽屜").toHaveText(fromPoint);
    await expect(evidenceDrawer(page).getByTestId("evidence-filter").locator("span")).toHaveText(filter);
    await closeDrawer(page);
    await expect(cell).toBeFocused();
    expect(await analyticsCount(page, "chart_clicked"), "資料表 number-link 不記 chart_clicked").toBe(1);
    await expectNoPageScrollX(page);
  });
});
