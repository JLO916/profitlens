// V4-7a 代理 C（06_BATCHES V4-7a「驗收重點」的瀏覽器部分；CHART_CATALOG §7 開頭、G20、G21 的 E2E 草案；PRD §5.7、§6.4；D-V4-40＝A）：
// 資料來源頁的 G20 涵蓋時間軸（狀態一行之下）、G21 問題分布表（data-issues 內、問題表之上）與問題表篩選（DataWorkspace 持有 issueFilter）。
// 四個視窗都跑（1440×1000、1280×900、768×1024、390×844）：fixtures/errors/missing_ad_day 與 4 通路合成資料經四步精靈匯入，示範資料由「載入示範資料」。
// 字串一律由 labels 組出、定位用 testid（PRD §4.7）；期待的標題、列數與片語在 Node 端以同一組 application 函式算（不寫死）。
// D-V4-51＝（a）A、（b）B（2026-10-12）：同檔多通路重疊的缺列合成一框（通路段 all）由 tests/charts-data-coverage-overlap-v4.test.tsx 與 page:data-overlap 覆蓋；這裡的資料都沒有重疊，框與點擊條件不變。
import { resolve } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { coverageTimeline } from "../../src/application/chart-coverage";
import { issueDistribution } from "../../src/application/chart-issues";
import { exportIssuesCsv } from "../../src/application/export";
import { issueFilterPhrase, issueReasonLabel, type IssueFilter } from "../../src/application/issue-filter";
import { coverageChartModel } from "../../src/components/data/coverage-chart";
import type { DatasetInput, ValidationIssue } from "../../src/domain/types";
import { validateDataset } from "../../src/domain/validation";
import { fixture } from "../helpers/fixtures";
import { synthetic4ChannelInput } from "../helpers/synthetic-4-channel";
import { downloadText } from "./breakeven-helpers-v39";
import { INCLUSIVE_TAX_DIR, analyticsCount, cellBarInfo, datasetSnapshot, importSynthetic, ladderBars, openDataTable, preprocessBars, stubAnalytics, wizardCheck } from "./chart-helpers-v4";
import { issueTable, showReasonCodes } from "./data-page-helpers-v3";
import { importViaWizard } from "./import-wizard-helpers";
import { evidenceDrawer, kpiLink, loadDemo } from "./launch-helpers-v310";
import { closePeriodSheet, dismissSavePrompt, navigateTo, openPeriodSheet } from "./replacement-helpers";
import { chartColors } from "../../src/application/chart-theme";
import { barCellPairGeometry, barCellScale } from "../../src/components/charts/bar-cell";
import { formatAmountL1, formatAmountL3, formatCount, formatDateL1, formatRateL2 } from "../../src/application/presentation";

const coverage = labels.data.chartsV4.coverage;
const issuesCopy = labels.data.chartsV4.issues;
const MISSING_AD_DAY_DIR = resolve("fixtures/errors/missing_ad_day");
const AD_DAY_SEGMENT = "chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02";
const AD_DAY_FILTER = { file: "ad_spend_daily.csv", channel: "MARKETPLACE", reason: "MISSING_AD_DAY" } as const satisfies IssueFilter;

const g20 = (page: Page) => page.getByTestId("chart-data-coverage");
const g21 = (page: Page) => page.getByTestId("chart-data-issues");
const dataIssues = (page: Page) => page.getByTestId("data-issues");
const phrase = (page: Page) => page.getByTestId("data-issues-filter");
const clearButton = (page: Page) => page.getByTestId("data-issues-filter-clear");
const issueRows = (page: Page) => issueTable(dataIssues(page)).locator("tbody tr");
/** 問題表的捲動區（role=region，清除篩選後焦點移到這裡）。 */
const issueRegion = (page: Page) => dataIssues(page).locator(".issue-list > .table-scroll[role='region']");
/** G20 資料表某列的「篩選問題表」按鈕（可及名稱帶檔案與通路）。 */
const filterButton = (page: Page, file: string, channel: string) => g20(page).getByRole("button", { name: fill(coverage.filterName, { file, channel }), exact: true });
/** G21 某格的計數按鈕。 */
const cellButton = (page: Page, fileKey: string, reason: string) => page.getByTestId(`chart-data-issues-cell-${fileKey}-${reason}`).getByRole("button");

/** 期待值（Node 端；與瀏覽器匯入的是同一份檔案）：問題清單、G20 的模型（標題）、G21 的分布。 */
function expectations(input: DatasetInput) {
  const dataset = validateDataset(input).dataset!;
  return { dataset, issues: dataset.issues, coverage: coverageChartModel(coverageTimeline(dataset)), distribution: issueDistribution(dataset.issues) };
}
const matching = (issues: readonly ValidationIssue[], filter: IssueFilter) => issues.filter(issue => (filter.file === undefined || issue.file === filter.file) && (filter.channel === undefined || issue.channel === filter.channel) && (filter.reason === undefined || issue.reason_code === filter.reason));

/** 經四步精靈匯入 fixtures/errors/missing_ad_day（帶 manifest 取兩期；缺 2026-08-02 MARKETPLACE 的廣告列，檢核結果 partial），關掉首次保存提示後到資料來源頁。 */
async function importMissingAdDay(page: Page) {
  await importViaWizard(page, MISSING_AD_DAY_DIR, { manifest: true, classification: "partial" });
  await dismissSavePrompt(page);
  await expect(page.getByTestId("local-save-prompt")).toHaveCount(0);
  await navigateTo(page, "data");
  await expect(g20(page)).toBeVisible();
}
/** 問題表每一列：檔名（第一欄的等寬字）、日期與通路（第一欄的 small）、原因碼（「顯示原因碼」後的最後一欄）。 */
async function rowsOf(page: Page): Promise<{ file: string; where: string; code: string }[]> {
  await showReasonCodes(dataIssues(page));
  return issueRows(page).evaluateAll(rows => rows.map(row => ({
    file: row.querySelector("td.issue-file > span.ui-mono")?.textContent ?? "",
    where: row.querySelector("td.issue-file > small:last-of-type")?.textContent ?? "",
    code: row.querySelector("td.issue-code code")?.textContent ?? "",
  })));
}
/** 資料問題區塊的頂端捲到可視範圍內、停在頂欄與期間列之下（main section 的 scroll-margin-top 120px）。 */
async function expectIssuesScrolledIn(page: Page) {
  await expect(dataIssues(page)).toBeInViewport();
  const top = await dataIssues(page).evaluate(node => node.getBoundingClientRect().top);
  expect(top, "data-issues 的頂端在頂欄與期間列之下（scroll-margin-top），不被蓋住、也不在畫面下方").toBeGreaterThanOrEqual(0);
  expect(top).toBeLessThanOrEqual(130);
}
/** 篩選片語：看得到、在可視範圍、取得焦點，文字＝issueFilterPhrase（n＝篩選後筆數）。 */
async function expectPhrase(page: Page, filter: IssueFilter, n: number) {
  await expect(phrase(page)).toBeVisible();
  await expect(phrase(page)).toHaveText(issueFilterPhrase(filter, n)!);
  await expect(phrase(page)).toHaveAttribute("role", "status");
  await expect(phrase(page)).toBeInViewport();
  await expect(phrase(page)).toBeFocused();
}
/** 資料來源頁主層（<details> 與 hidden 之外）的獨立圖區塊 section.chart-section 的 testid。 */
const mainChartSections = (page: Page) => page.locator(".view-content section.chart-section").evaluateAll(nodes => nodes.filter(node => !node.closest("details:not([open])") && !node.closest("[hidden]")).map(node => node.getAttribute("data-testid")));
/** 把焦點放到某個元素再按 Enter（鍵盤路徑；不用滑鼠）。 */
async function pressEnterOn(target: Locator) {
  await target.focus();
  await expect(target).toBeFocused();
  await target.press("Enter");
}

test.describe("V4-7a 資料來源 G20、G21 與問題表篩選", () => {
  test("missing_ad_day：G20 標題用單日模板、G21 用單格模板；點缺列段 → 問題表只剩廣告檔 MARKETPLACE 缺廣告列、data-issues 捲進畫面、篩選片語可見且取得焦點、記 chart_clicked；清除 → 回到全部、焦點到問題表", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const expected = expectations(fixture("errors/missing_ad_day"));
    const anchor = expected.dataset.manifest.data_as_of, date = formatDateL1("2026-08-02", { anchor });
    await stubAnalytics(page);
    await page.goto("/");
    await importMissingAdDay(page);
    // 標題：G20「廣告投放缺 8/2 1 天（MARKETPLACE）」（不寫「8/2 到 8/2 共 1 天」）；G21「廣告投放有 1 列缺廣告列」（不寫「最多」）。
    const g20Title = fill(coverage.title.missingOneDay, { file: labels.importWizard.files.ads, date, channel: "MARKETPLACE" });
    expect(expected.coverage.title).toBe(g20Title);
    await expect(g20(page).locator("#data-coverage-title")).toHaveText(g20Title);
    await expect(g20(page).locator("#data-coverage-title")).not.toContainText(`${date} ${coverage.title.missing.split("{start} ")[1].split(" {end}")[0]} ${date}`);
    await expect(g21(page).locator("#data-issues-dist-title")).toHaveText(fill(issuesCopy.title.single, { file: labels.importWizard.files.ads, n: formatCount(1, "L2"), reason: issueReasonLabel("MISSING_AD_DAY") }));
    await expect(g21(page).locator("#data-issues-dist-title")).not.toContainText(issuesCopy.title.most.split("{reason}")[1].split("，")[0]);
    // 主層獨立圖區塊：有問題時 2（G20、G21）；G21 在 data-issues 內。
    expect(await mainChartSections(page)).toEqual(["chart-data-coverage", "chart-data-issues"]);
    await expect(dataIssues(page).getByTestId("chart-data-issues")).toHaveCount(1);
    // 格加總＝列級問題筆數。
    const cellTotal = (await g21(page).locator("button.heat-count").allTextContents()).reduce((sum, text) => sum + Number(text.replace(/,/g, "")), 0);
    expect(cellTotal).toBe(expected.distribution!.rowLevel);
    const all = expected.issues.length;
    await expect(issueRows(page)).toHaveCount(all);

    // 先捲到頁尾，確定點擊後真的會捲回 data-issues。
    await page.evaluate(() => window.scrollTo(0, document.scrollingElement!.scrollHeight));
    await g20(page).scrollIntoViewIfNeeded();
    await page.getByTestId(AD_DAY_SEGMENT).click();
    const want = matching(expected.issues, AD_DAY_FILTER);
    expect(want).toHaveLength(1);
    await expectPhrase(page, AD_DAY_FILTER, want.length);
    await expectIssuesScrolledIn(page);
    const rows = await rowsOf(page);
    expect(rows).toHaveLength(want.length);
    for (const row of rows) {
      expect(row.file).toBe(AD_DAY_FILTER.file);
      expect(row.where).toContain(AD_DAY_FILTER.channel);
      expect(row.code).toBe(AD_DAY_FILTER.reason);
    }
    await expect.poll(() => analyticsCount(page, "chart_clicked")).toBe(1);

    // 清除：片語與清除鈕消失、列數回到全部，焦點移到問題表的捲動區。
    await clearButton(page).click();
    await expect(phrase(page)).toHaveCount(0);
    await expect(clearButton(page)).toHaveCount(0);
    await expect(issueRows(page)).toHaveCount(all);
    await expect(issueRegion(page)).toBeFocused();

    // G21 的格（catalog G21 的 E2E 草案）：原因碼欄（「顯示原因碼」之後）每列都是 MISSING_AD_DAY。
    await cellButton(page, "ads", "MISSING_AD_DAY").click();
    const cellFilter: IssueFilter = { file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" };
    await expectPhrase(page, cellFilter, matching(expected.issues, cellFilter).length);
    await expectIssuesScrolledIn(page);
    expect((await rowsOf(page)).map(row => row.code)).toEqual(matching(expected.issues, cellFilter).map(issue => issue.reason_code));
    await expect.poll(() => analyticsCount(page, "chart_clicked")).toBe(2);
    expect(errors).toEqual([]);
  });

  test("4 通路合成資料：缺費用列段（通路費用 LIVE 9/14 起）篩到 6 列、缺廣告列段篩到 5 列；G21 格加總＝列級問題筆數；換篩選回到該篩選的列數，清除回到全部", async ({ page }) => {
    const expected = expectations(synthetic4ChannelInput());
    await page.goto("/");
    await importSynthetic(page);
    await navigateTo(page, "data");
    await expect(g20(page)).toBeVisible();
    // 標題取最長的缺列區段（通路費用 LIVE 9/14–9/19 共 6 天）。
    await expect(g20(page).locator("#data-coverage-title")).toHaveText(expected.coverage.title);
    expect(expected.coverage.titleKind).toBe("missing");
    expect(await mainChartSections(page)).toEqual(["chart-data-coverage", "chart-data-issues"]);
    const cellTotal = (await g21(page).locator("button.heat-count").allTextContents()).reduce((sum, text) => sum + Number(text.replace(/,/g, "")), 0);
    expect(cellTotal).toBe(expected.distribution!.rowLevel);
    expect(cellTotal).toBe(expected.issues.length);
    await expect(issueRows(page)).toHaveCount(expected.issues.length);

    for (const [testId, filter] of [
      ["chart-data-coverage-seg-costs-LIVE-2026-09-14", { file: "channel_costs_daily.csv", channel: "LIVE", reason: "MISSING_CHANNEL_COST_DAY" }],
      ["chart-data-coverage-seg-ads-LIVE-2026-08-30", { file: "ad_spend_daily.csv", channel: "LIVE", reason: "MISSING_AD_DAY" }],
    ] as const) {
      await g20(page).scrollIntoViewIfNeeded();
      await page.getByTestId(testId).click();
      const want = matching(expected.issues, filter);
      expect(want.length, testId).toBeGreaterThan(0);
      await expectPhrase(page, filter, want.length);
      await expectIssuesScrolledIn(page);
      const rows = await rowsOf(page);
      expect(rows, testId).toHaveLength(want.length);
      for (const row of rows) {
        expect(row.file, testId).toBe(filter.file);
        expect(row.where, testId).toContain(filter.channel);
        expect(row.code, testId).toBe(filter.reason);
      }
    }
    expect(matching(expected.issues, { file: "channel_costs_daily.csv", channel: "LIVE", reason: "MISSING_CHANNEL_COST_DAY" })).toHaveLength(6);
    // G21 的格：通路費用 × 缺費用列。
    await cellButton(page, "costs", "MISSING_CHANNEL_COST_DAY").click();
    const costs: IssueFilter = { file: "channel_costs_daily.csv", reason: "MISSING_CHANNEL_COST_DAY" };
    await expectPhrase(page, costs, matching(expected.issues, costs).length);
    expect((await rowsOf(page)).every(row => row.code === "MISSING_CHANNEL_COST_DAY")).toBe(true);
    await clearButton(page).click();
    await expect(issueRows(page)).toHaveCount(expected.issues.length);
  });

  test("鍵盤：G20 資料表的「篩選問題表」按 Enter → 焦點在篩選片語、data-issues 捲進畫面；再按同一顆（同一組條件）焦點仍移到片語（審查 B-2）；G21 的格按 Enter 同樣；缺列框本身不可聚焦", async ({ page }) => {
    const expected = expectations(fixture("errors/missing_ad_day"));
    await page.goto("/");
    await importMissingAdDay(page);
    // 缺列框在 aria-hidden 的圖框內、不可聚焦（鍵盤走資料表的按鈕）。
    await expect(page.getByTestId(AD_DAY_SEGMENT)).not.toHaveAttribute("tabindex", /.*/);
    expect(await page.getByTestId(AD_DAY_SEGMENT).evaluate(node => node.closest("[aria-hidden='true']") !== null)).toBe(true);
    await openDataTable(g20(page));
    const button = filterButton(page, labels.importWizard.files.ads, "MARKETPLACE");
    await expect(button).toBeVisible();
    await pressEnterOn(button);
    const n = matching(expected.issues, AD_DAY_FILTER).length;
    await expectPhrase(page, AD_DAY_FILTER, n);
    await expectIssuesScrolledIn(page);
    // 同一組條件再按一次：鍵沒變，焦點仍要移到片語。
    await pressEnterOn(button);
    await expectPhrase(page, AD_DAY_FILTER, n);
    await expectIssuesScrolledIn(page);
    // G21 的格（計數按鈕，每格一個 Tab 停留點）：Enter；同一格再按一次也一樣。
    const cell = cellButton(page, "ads", "MISSING_AD_DAY");
    const cellFilter: IssueFilter = { file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" };
    await pressEnterOn(cell);
    await expectPhrase(page, cellFilter, matching(expected.issues, cellFilter).length);
    await pressEnterOn(cell);
    await expectPhrase(page, cellFilter, matching(expected.issues, cellFilter).length);
    // 清除鈕也是鍵盤可達：Enter 後焦點到問題表的捲動區。
    await pressEnterOn(clearButton(page));
    await expect(phrase(page)).toHaveCount(0);
    await expect(issueRegion(page)).toBeFocused();
  });

  test("篩選中按「下載問題清單 CSV」仍是全部問題：與沒有篩選時位元組相同（exportIssuesCsv(全部問題)）", async ({ page }) => {
    const expected = expectations(synthetic4ChannelInput());
    await page.goto("/");
    await importSynthetic(page);
    await navigateTo(page, "data");
    const download = page.getByTestId("data-issues-download");
    const before = await downloadText(page, download, "profitlens-issues.csv");
    await g20(page).scrollIntoViewIfNeeded();
    await page.getByTestId("chart-data-coverage-seg-costs-LIVE-2026-09-14").click();
    await expect(phrase(page)).toBeVisible();
    const filtered = await downloadText(page, download, "profitlens-issues.csv");
    expect(filtered).toBe(before);
    // 精靈匯入的檔名就是標準檔名（實際檔名與標準檔名相同），內容＝exportIssuesCsv(全部問題)。
    expect(filtered).toBe(exportIssuesCsv(expected.issues));
    expect(filtered.trim().split(/\r?\n/)).toHaveLength(1 + expected.issues.length);
  });

  test("示範資料：沒有問題時不渲染 G21（data-issues 的「沒有問題」照舊）、G20 標題＝title.none；主層獨立圖區塊＝1；1440 時 G20 頂 ≤ 900（B1）", async ({ page }) => {
    const expected = expectations(fixture("demo"));
    const manifest = expected.dataset.manifest, md = (iso: string) => formatDateL1(iso, { anchor: manifest.data_as_of });
    await page.goto("/");
    await loadDemo(page);
    await navigateTo(page, "data");
    await expect(g20(page)).toBeVisible();
    await expect(g21(page)).toHaveCount(0);
    await expect(dataIssues(page)).toContainText(labels.data.panel.noIssues);
    await expect(g20(page).locator("#data-coverage-title")).toHaveText(fill(coverage.title.none, { start: md(manifest.coverage_start), end: md(manifest.coverage_end) }));
    await expect(page.locator(`[data-testid^='chart-data-coverage-seg-']`)).toHaveCount(0);
    expect(await mainChartSections(page)).toEqual(["chart-data-coverage"]);
    // G20 在狀態一行之下、data-issues 之上。
    const tops = await Promise.all(["data-status-line", "chart-data-coverage", "data-issues"].map(id => page.getByTestId(id).evaluate(node => node.getBoundingClientRect().top + window.scrollY)));
    expect([...tops].sort((a, b) => a - b)).toEqual(tops);
    if (page.viewportSize()!.width === 1440) {
      await page.evaluate(() => window.scrollTo(0, 0));
      const top = await g20(page).evaluate(node => node.getBoundingClientRect().top + window.scrollY);
      expect(top, "B1：資料來源 G20 頂 ≤ 900（V4-7a 起）").toBeLessThanOrEqual(900);
    }
    // 390 不橫向捲動。
    const width = page.viewportSize()!.width;
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth)).toBeLessThanOrEqual(width);
  });

  test("審查 R2-A11Y-1、R2-A11Y-2：G21 每一格都在無障礙樹（≤ 767px 清單式的 0 格只在畫面上藏起來，後面的格不會對到前一欄的欄頭）；換篩選時篩選片語是新節點、取得焦點", async ({ page }) => {
    const expected = expectations(synthetic4ChannelInput());
    await page.goto("/");
    await importSynthetic(page);
    await navigateTo(page, "data");
    await expect(g21(page)).toBeVisible();
    // 合成資料：欄＝缺費用列、缺廣告列；廣告投放那一列的第一格（缺費用列）是 0 格。≤ 767px 整列都是 0 的檔（銷售）照設計整列不列（tr[data-empty]），
    // 其餘列的每一格（含 0 格）都要在無障礙樹裡；≥ 768px 每一列、每一格都在。
    const narrow = page.viewportSize()!.width < 768;
    const rows = narrow ? "tr:not([data-empty])" : "tr";
    const cells = g21(page).locator(`${rows} > td`);
    const blank = g21(page).locator(`${rows} > td[data-tier='0']`);
    expect(await blank.count()).toBeGreaterThan(0);
    await expect(g21(page).getByRole("cell")).toHaveCount(await cells.count());
    const blankStyles = await blank.evaluateAll(nodes => nodes.map(node => ({ display: getComputedStyle(node).display, width: node.getBoundingClientRect().width })));
    for (const style of blankStyles) expect(style.display).not.toBe("none");
    if (narrow) for (const style of blankStyles) expect(style.width, "≤ 767px：0 格只在畫面上藏起來").toBeLessThanOrEqual(1);
    // 篩選片語：每次套用都是新節點（role=status 不因文字改變再排一次播報），焦點移過去。
    await g20(page).scrollIntoViewIfNeeded();
    await page.getByTestId("chart-data-coverage-seg-costs-LIVE-2026-09-14").click();
    const segment: IssueFilter = { file: "channel_costs_daily.csv", channel: "LIVE", reason: "MISSING_CHANNEL_COST_DAY" };
    await expectPhrase(page, segment, matching(expected.issues, segment).length);
    await phrase(page).evaluate(node => { (node as HTMLElement & { probe?: boolean }).probe = true; });
    await cellButton(page, "ads", "MISSING_AD_DAY").click();
    const cellFilter: IssueFilter = { file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" };
    await expectPhrase(page, cellFilter, matching(expected.issues, cellFilter).length);
    expect(await phrase(page).evaluate(node => (node as HTMLElement & { probe?: boolean }).probe ?? false), "換篩選後片語是新節點").toBe(false);
  });
});

// V4-7b 代理 C（06_BATCHES V4-7b「驗收重點」的瀏覽器部分；CHART_CATALOG G22、G23 的 E2E 草案；PRD §4.2、§4.5、§6.3 C24、§8.7）：
// 資料來源頁前處理表的 G22 成對條（含稅匯入後）、計算與來源抽屜階梯表的 G23 佔比條（示範資料的 KPI 抽屜；4 通路合成資料只選 SOCIAL、MARKETPLACE）。
// 精靈步驟 4 對帳表的 G22 差額條在 tests/e2e/import-wizard.spec.ts（含稅匯入的點擊數測試）。條都在既有表格內、aria-hidden、不可聚焦、不可點；期待值在 Node 端以同一組 application 函式算。
test.describe("V4-7b 前處理表 G22、抽屜階梯表 G23", () => {
  /** 條的顯示寬（「V4-1 B」：≥ 768 為 96px、≤ 767 為 64px）。 */
  const barWidth = (page: Page) => page.viewportSize()!.width < 768 ? 64 : 96;
  /** 抽屜寬度規則（globals.css .evidence-drawer：≥ 1440 為 --drawer-w-wide 640、1280–1439 為 --drawer-w 560、768–1279 為 --drawer-w-narrow 480、≤ 767 為 100vw）；V4-7b 不變。 */
  const drawerWidth = (page: Page) => { const width = page.viewportSize()!.width; return width >= 1440 ? 640 : width >= 1280 ? 560 : width >= 768 ? 480 : width; };
  /** 期間列的通路下拉（手機在底部面板裡，選完按「完成」）。 */
  async function selectChannel(page: Page, channel: string) {
    await openPeriodSheet(page);
    await page.getByLabel(labels.shell.periodBar.filter.channel, { exact: true }).selectOption(channel);
    await closePeriodSheet(page);
  }

  test("含稅匯入（inclusive_tax）後資料來源頁：前處理表每個換算欄位一條成對條，在換算值格、數字之前；上條含稅原值、下條換算值，共用尺度＝含稅原值最大值；三格文字不變；條 aria-hidden、不可聚焦", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const { conversion } = wizardCheck(INCLUSIVE_TAX_DIR, "inclusive").candidate;
    const fields = conversion!.fields, totals = conversion!.totals!;
    const scale = barCellScale(fields.map(field => totals[field].raw));
    await page.goto("/");
    await importViaWizard(page, INCLUSIVE_TAX_DIR, { basis: "inclusive" });
    await dismissSavePrompt(page);
    await navigateTo(page, "data");
    const preprocessing = page.getByTestId("data-preprocessing");
    await expect(preprocessing).toBeVisible();
    await expect(preprocessBars(page)).toHaveCount(fields.length);
    const bars = await cellBarInfo(preprocessBars(page), "chart-data-preprocess-bar-");
    expect(bars.map(bar => bar.key)).toEqual(fields);
    for (const bar of bars) {
      const { raw, converted } = totals[bar.key];
      const geometry = barCellPairGeometry({ value: converted, previous: raw, max: scale });
      expect(bar.classes, bar.key).toEqual(["bar-cell", "is-pair"]);
      expect([bar.ariaHidden, bar.focusable, bar.tabIndex], bar.key).toEqual(["true", "false", null]);
      expect(bar.boxWidth, `${bar.key}：顯示寬`).toBe(barWidth(page));
      expect(bar.cellClass, bar.key).toBe("num");
      expect(bar.nextText, `${bar.key}：條之後是換算值`).toBe(formatAmountL3(converted));
      expect(bar.rects.map(rect => [rect.cls, rect.x, rect.width, rect.fill]), bar.key).toEqual([
        ...(geometry.previous.bar ? [["bar-cell-previous", geometry.previous.bar.x, geometry.previous.bar.width, chartColors.previous]] : []),
        ...(geometry.value.bar ? [["bar-cell-bar", geometry.value.bar.x, geometry.value.bar.width, chartColors.total]] : []),
      ]);
      // 含稅合計、未稅合計、稅率三格的文字照 v3（條沒有文字）。
      await expect(preprocessing.locator(`tr[data-field=${bar.key}] td`), bar.key).toHaveText([formatAmountL3(raw), formatAmountL3(converted), formatRateL2(conversion!.rate)]);
    }
    // 含稅原值最大的欄（原價收入）上條滿寬；畫面上就是整個條寬。
    const top = bars.find(bar => Number(totals[bar.key].raw) === Number(scale))!;
    expect(top.key).toBe("gross_sales");
    expect(top.rects.find(rect => rect.cls === "bar-cell-previous")!.boxWidth).toBe(barWidth(page));
    // 條不可聚焦：Tab 不會停在條上（條在 aria-hidden 的 svg 內、沒有 tabindex）。
    expect(await preprocessBars(page).evaluateAll(nodes => nodes.filter(node => node.closest("[aria-hidden='true']") === null || node.querySelector("[tabindex], a, button") !== null).length)).toBe(0);
    expect(await page.evaluate(() => document.scrollingElement!.scrollWidth)).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(errors).toEqual([]);
  });

  test("示範資料：總覽 KPI 扣廣告後貢獻的抽屜——階梯表淨營收起 10 條佔比條，淨營收那條最寬、原價收入（以及折扣、退款）沒有；條 aria-hidden、不可聚焦；抽屜寬度與高度規則不變、沒有橫向溢出；Esc 關閉並回焦", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const metrics = (await datasetSnapshot("demo")).report.current.metrics;
    await page.goto("/");
    await loadDemo(page);
    await kpiLink(page).click();
    const drawer = evidenceDrawer(page);
    await expect(drawer).toBeVisible();
    const bars = ladderBars(drawer);
    await expect(bars).toHaveCount(10);
    await expect(drawer.getByTestId("chart-evidence-ladder-bar-net_revenue")).toHaveCount(1);
    for (const name of ["gross_sales", "discounts", "refunds"]) await expect(drawer.getByTestId(`chart-evidence-ladder-bar-${name}`), name).toHaveCount(0);
    const info = await cellBarInfo(bars, "chart-evidence-ladder-bar-");
    expect(info.map(bar => bar.key)).toEqual(["net_revenue", "cogs_net", "gross_profit", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "contribution_before_marketing", "ad_spend", "contribution_after_marketing"]);
    const widthOf = (key: string) => info.find(bar => bar.key === key)!.rects.find(rect => rect.cls === "bar-cell-bar")?.boxWidth ?? 0;
    const net = widthOf("net_revenue");
    expect(net, "淨營收的條滿寬（基準）").toBe(barWidth(page));
    for (const bar of info.filter(item => item.key !== "net_revenue")) expect(widthOf(bar.key), `${bar.key} 比淨營收短`).toBeLessThan(net);
    for (const bar of info) {
      expect([bar.ariaHidden, bar.focusable, bar.tabIndex], bar.key).toEqual(["true", "false", null]);
      expect(bar.classes, bar.key).toEqual(["bar-cell", "is-share"]);
      expect(bar.tone, `${bar.key}：示範資料各列都是正值`).toBe("total");
      expect(bar.boxWidth, bar.key).toBe(barWidth(page));
      expect(bar.cellClass, bar.key).toBe("ladder-amount");
      expect(bar.nextText, `${bar.key}：條之後是同格的金額`).toBe(fill(labels.format.units.yuan, { value: formatAmountL3(metrics[bar.key as keyof typeof metrics].value) }));
    }
    // 抽屜寬度與高度規則不變（V4-7b 只在既有格內加條），抽屜內沒有橫向溢出。
    const box = (await drawer.boundingBox())!;
    expect(Math.round(box.width)).toBe(drawerWidth(page));
    expect(Math.round(box.height)).toBe(page.viewportSize()!.height);
    expect(await drawer.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(0);
    // 條不可點（PRD §8.7：G23 不另設點擊）：點了抽屜照舊開著、內容不變。
    await drawer.getByTestId("chart-evidence-ladder-bar-cogs_net").click({ force: true });
    await expect(drawer).toBeVisible();
    await expect(bars).toHaveCount(10);
    // 焦點圈與 Esc 回焦照舊。
    await page.keyboard.press("Escape");
    await expect(drawer).toHaveCount(0);
    await expect(kpiLink(page)).toBeFocused();
    expect(errors).toEqual([]);
  });

  test("4 通路合成資料：只選 SOCIAL（本期平台抽成沖回、扣項為負）時抽屜該列條為有利色、往左；只選 MARKETPLACE（本期扣廣告後貢獻為負）時結果列條為不利色、往左", async ({ page }) => {
    const channels = (await datasetSnapshot("synthetic")).report.current.channels;
    await page.goto("/");
    await importSynthetic(page);
    for (const [channel, metric, tone, color] of [["SOCIAL", "platform_fees", "favorable", chartColors.favorable], ["MARKETPLACE", "contribution_after_marketing", "unfavorable", chartColors.unfavorable]] as const) {
      await selectChannel(page, channel);
      // 換了通路的 KPI 帶＝該通路本期的扣廣告後貢獻（等它更新再開抽屜）。
      await expect(page.getByTestId("kpi-contribution_after_marketing").locator(".kpi-value")).toHaveText(formatAmountL1(channels[channel].metrics.contribution_after_marketing.value));
      await kpiLink(page).click();
      const drawer = evidenceDrawer(page);
      await expect(drawer).toBeVisible();
      const bar = (await cellBarInfo(ladderBars(drawer), "chart-evidence-ladder-bar-")).find(item => item.key === metric)!;
      expect(Number(channels[channel].metrics[metric].value), `${channel} ${metric} 為負`).toBeLessThan(0);
      expect(bar.tone, `${channel} ${metric}`).toBe(tone);
      expect(bar.classes, channel).toEqual(["bar-cell", "is-share", "is-signed"]);
      const rect = bar.rects.find(item => item.cls === "bar-cell-bar")!;
      expect(rect.fill, `${channel} ${metric}`).toBe(color);
      expect(rect.x + rect.width, `${channel} ${metric}：往左（從零線 ${bar.zeroX} 往左）`).toBeLessThanOrEqual(bar.zeroX!);
      await page.keyboard.press("Escape");
      await expect(drawer).toHaveCount(0);
    }
  });
});
