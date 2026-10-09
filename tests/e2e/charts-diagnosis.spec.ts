// V4-3a 代理 E（06_BATCHES V4-3a「驗收重點」的瀏覽器部分；CHART_CATALOG G7（b）、G9、G10 的 E2E 草案；PRD §2.2 B3、B4、§4.4–4.7、§7.2、§7.4、§8.7）：
// 通路健檢 G9 健檢清單內嵌影響金額條、G10 每 100 元淨營收去向（C27 ShareStack）、G7b 通路寬表「近 {n} 週」與「各通路每週」，
// 以及同批的總覽「進階」管理損益表「佔淨營收 %」number-link（D-V3-31＝B、D-V4-32＝A）。
// 四個視窗都跑（1440×1000、1280×900、768×1024、390×844）；示範資料（fixtures/demo），另有 4 通路合成資料與 fixtures/refund_only 各一條。
// 字串一律由 labels 組出、定位用 testid（PRD §4.7）；期待的數字與文字由 Node 端以同一組 application 函式算（chart-helpers-v4 的 datasetSnapshot），不寫死。
// G9 的條依 PRD §4.5 與 CHART_CATALOG G9「條不另設點擊」（代理 C 偏差 1）：點條等於點 summary（展開或收合），抽屜由展開內容第一行的影響金額 number-link 開。
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
import { formatAmountL3, formatPeriodL1, formatRateLayer, metricDefinitions } from "../../src/application/presentation";
import { profitWaterfall } from "../../src/application/waterfall";
import { CHANNEL_FEE_FIELDS } from "../../src/application/chart-structure";
import type { RuleCode } from "../../src/domain/types";
import { IMPACT_BAR_RULES, IMPACT_BAR_TOTAL_RULE, hasImpactBar } from "../../src/components/diagnosis-list";
import { sharePerHundredText, shareSectionModel, type ShareSectionModel } from "../../src/components/diagnosis/share-section";
import { evidenceDrawer, loadDemo } from "./launch-helpers-v310";
import { importViaWizard } from "./import-wizard-helpers";
import { openPnlTable, pnlEvidenceHeading } from "./pnl-helpers-v39";
import { choosePreset, dismissSavePrompt, isMobile, navigateTo, openDetails } from "./replacement-helpers";
import { analyticsCount, channelSpark, channelSparks, channelWeeksDetails, channelWeeksTable, channelWideTable, clickChartShape, datasetSnapshot, diagnosisRuleOrder, evidenceTechnicalRows, expectNoPageScrollX, frameBox, frameHeights, impactBar, impactBarInfo, impactBars, importSynthetic, openDataTable, pnlShare, shareSection, shareSeg, shareSegInfo, shareSegs, shareTable, shareTableLink, stubAnalytics } from "./chart-helpers-v4";

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
  test("清單之後、通路寬表之前；標題與副標由 labels 組出；圖例四項；.chart-frame.sm aria-hidden、svg 高＝（列數＋2）× 24 ≤ 固定高；示範資料 12 段（MARKETPLACE 超過 100 照常畫、不利色）；右端標值與合計「剩 16.2 元」；主層獨立圖區塊＝1；切期間框高不變；390 頁面不橫向捲動", async ({ page }, testInfo) => {
    const snapshot = await datasetSnapshot("demo");
    const model = shareSectionModel(snapshot);
    await openDiagnosis(page);
    const section = shareSection(page);
    // DOM 順序：健檢清單 → G10 → 通路寬表。
    const order = await page.evaluate(() => ["diagnosis-panel", "chart-diagnosis-share", "channel-compare"].map(id => document.querySelector(`[data-testid='${id}']`)!).map((node, index, all) => index === 0 || !!(all[index - 1].compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING)));
    expect(order, "清單、G10、通路寬表的 DOM 順序").toEqual([true, true, true]);
    expect(await mainChartSections(page), "健檢頁主層獨立圖區塊只有 G10（CL-9＝1）").toEqual(["chart-diagnosis-share"]);
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
    expect(before).toEqual({ "chart-diagnosis-share": chartHeights.sm });
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
