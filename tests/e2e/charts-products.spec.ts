// V4-4 代理 C（06_BATCHES V4-4「驗收重點」的瀏覽器部分；CHART_CATALOG G13、G14 的 E2E 草案；PRD §4.4–§4.7 G13、G14、§5.3 第 2 列；D-V4-38＝A、D-V4-39＝A）：
// 商品頁 .product-highlight-grid 的 G14（商品毛利為負的商品累計，只在有負值時渲染，after＝product-worst）與 G13（商品毛利兩期差額，after＝product-best）。
// 四個視窗都跑（1440×1000、1280×900、768×1024、390×844）；示範資料（沒有商品毛利為負）、4 通路合成資料（5 個為負）與 fixtures/refund_only（1 個為負、差額都是 0）各一條。
// 字串一律由 labels 組出、定位用 testid（PRD §4.7）；期待的列與數字在 Node 端以同一組 domain、application 函式算（不寫死）。
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { PRODUCT_PARETO_LIMIT, productPareto } from "../../src/application/chart-pareto";
import { chartColors } from "../../src/application/chart-theme";
import { channelLabel, demoAlias, formatHeadlineAmount } from "../../src/application/copy";
import { evidenceFilterText } from "../../src/application/evidence-filter";
import { formatAmountL1, formatAmountL2, formatCount, formatRateL1, formatRateL2, metricDefinitions } from "../../src/application/presentation";
import { productHighlights } from "../../src/application/product-highlights";
import { createSnapshot, hashInput } from "../../src/application/workspace";
import { compareProducts } from "../../src/domain/product-comparison";
import type { DatasetInput } from "../../src/domain/types";
import { validateDataset } from "../../src/domain/validation";
import { fixture } from "../helpers/fixtures";
import { synthetic4ChannelInput } from "../helpers/synthetic-4-channel";
import { analyticsCount, expectNoPageScrollX, importSynthetic, openDataTable, paretoBars, paretoExtra, paretoSection, paretoTable, productGridCells, stubAnalytics, varianceBars, varianceBlock, varianceSection, varianceTable } from "./chart-helpers-v4";
import { importViaWizard } from "./import-wizard-helpers";
import { evidenceDrawer, loadDemo } from "./launch-helpers-v310";
import { dismissSavePrompt, isMobile, navigateTo, openDetails } from "./replacement-helpers";

const copy = labels.products.chartsV4;
const METRIC = metricDefinitions.gross_profit.label;
const BLOCK_ROWS = 5;
const drawerHeading = (page: Page) => evidenceDrawer(page).getByRole("heading", { level: 2 });
const drawerNumber = (page: Page) => evidenceDrawer(page).locator(".evidence-body > p.number");
const drawerFilter = (page: Page) => evidenceDrawer(page).getByTestId("evidence-filter").locator("span");
/** 抽屜標題（h2 可及名稱）：「{title} · 計算與來源」。 */
const drawerTitle = (title: string) => `${title} · ${labels.evidence.sections.evidence}`;
const wide = (page: Page) => page.viewportSize()!.width > 900;

/** 期待值（Node 端，與瀏覽器載入的是同一份檔案）：商品比較的列、G13 的減少／增加、G14 的 Pareto。 */
async function expectations(input: DatasetInput) {
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
  const comparison = compareProducts(dataset, snapshot.report.scope);
  const alias = demoAlias(dataset.manifest.dataset_id);
  return { snapshot, alias, rows: comparison.rows, top: productHighlights(comparison.rows), all: productHighlights(comparison.rows, comparison.rows.length), pareto: productPareto(comparison.rows, "gross_profit", PRODUCT_PARETO_LIMIT) };
}
const product = (row: { sku: string; channel: string }, alias: boolean) => fill(copy.product, { sku: row.sku, channel: channelLabel(row.channel, alias) });
async function closeDrawer(page: Page) {
  await page.keyboard.press("Escape");
  await expect(evidenceDrawer(page)).toHaveCount(0);
}
/** D-V4-38＝A：各寬度都是減少段在上、增加段在下。 */
async function expectDecreaseAbove(page: Page) {
  const bars = (block: "decrease" | "increase") => varianceBlock(page, block).locator("rect.ranked-bar").evaluateAll(nodes => nodes.map(node => { const box = node.getBoundingClientRect(); return { top: box.top, bottom: box.bottom }; }));
  const decrease = await bars("decrease"), increase = await bars("increase");
  expect(decrease.length * increase.length, "兩段都有柱").toBeGreaterThan(0);
  expect(Math.max(...decrease.map(box => box.bottom)), "減少段的柱都在增加段的柱之上").toBeLessThanOrEqual(Math.min(...increase.map(box => box.top)));
}
/** PRD §5.3 第 2 列「兩格等高」：兩欄時（> 900px）兩格的高相同；單欄時各格各自的高。 */
async function expectEqualCells(page: Page) {
  const heights = await productGridCells(page).evaluateAll(nodes => nodes.map(node => Math.round(node.getBoundingClientRect().height)));
  expect(heights).toHaveLength(2);
  if (wide(page)) expect(heights[0], "兩格等高").toBe(heights[1]);
}

test.describe("V4-4 商品 G13、G14", () => {
  test("示範資料：沒有 G14，product-worst 照 v3 位置是第一格；G13 內 product-best 可見、條數＝兩段合計、減少段在上；點第一根減少條開抽屜（篩選片語含 SKU）並記 chart_clicked；資料表展開記 chart_table_opened", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const expected = await expectations(fixture("demo"));
    expect(expected.pareto.count).toBe(0);
    await stubAnalytics(page);
    await page.goto("/");
    await loadDemo(page);
    await navigateTo(page, "products");
    await expect(varianceSection(page)).toBeVisible();
    await expect(paretoSection(page)).toHaveCount(0);
    // 第一格照 v3：product-worst（section.product-highlight）本身，不在任何圖框內。
    await expect(productGridCells(page).first()).toHaveAttribute("data-testid", "product-worst");
    await expect(page.getByTestId("product-worst")).toBeVisible();
    await expect(page.locator(".chart-section [data-testid='product-worst']")).toHaveCount(0);
    await expect(varianceSection(page).getByTestId("product-best")).toBeVisible();
    // 標題：減少最多的一列（SKU-020 · 平台 · MARKETPLACE，−30,198.96）。
    const lead = expected.top.worstChange[0];
    await expect(varianceSection(page).locator("#products-variance-title")).toHaveText(fill(copy.variance.title.decrease, { product: product(lead, true), metric: METRIC, amount: formatHeadlineAmount(lead.changes.gross_profit.value) }));
    const decreaseRows = Math.min(BLOCK_ROWS, expected.top.worstChange.length), increaseRows = Math.min(BLOCK_ROWS, expected.top.bestChange.length);
    await expect(varianceBars(page)).toHaveCount(decreaseRows + increaseRows);
    await expect(varianceBlock(page, "decrease").locator("[data-testid^='chart-products-variance-bar-']")).toHaveCount(decreaseRows);
    await expectDecreaseAbove(page);
    await expectEqualCells(page);
    // 點第一根減少條：開商品毛利差額抽屜，篩選片語含該 SKU（filter { channel, sku }）。
    const before = await analyticsCount(page, "chart_clicked");
    await page.getByTestId(`chart-products-variance-bar-${lead.channel}-${lead.sku}`).click();
    await expect(evidenceDrawer(page)).toBeVisible();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(fill(labels.products.comparison.deltaEvidenceTitle, { sku: lead.sku, label: `${METRIC}${labels.exports.csv.suffix.change}` })));
    const phrase = evidenceFilterText({ channel: lead.channel, sku: lead.sku }, { alias: true, anchor: expected.snapshot.data_as_of })!;
    await expect(drawerFilter(page)).toHaveText(phrase);
    expect(phrase).toContain(fill(labels.evidence.chartsV4.filter.sku, { sku: lead.sku }));
    expect(await analyticsCount(page, "chart_clicked")).toBe(before + 1);
    await closeDrawer(page);
    // 資料表：展開記 chart_table_opened；列出全部差額 < 0 與 > 0 的列（示範 15＋25）。
    const opened = await analyticsCount(page, "chart_table_opened");
    await openDataTable(varianceSection(page));
    expect(await analyticsCount(page, "chart_table_opened")).toBe(opened + 1);
    await expect(varianceTable(page).locator("tbody tr")).toHaveCount(expected.all.worstChange.length + expected.all.bestChange.length);
    await expectNoPageScrollX(page);
    expect(errors).toEqual([]);
  });

  test("4 通路合成資料：G14 在第一格、product-worst 在它內可見；條數＝min(10, 負值數)；≤ 767px 不畫右側累計；資料表最後一列累計＝負值合計、累計佔比 100%；累計格抽屜大數字不帶「+」；點柱開抽屜（篩選片語含 SKU）", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const expected = await expectations(synthetic4ChannelInput());
    const { pareto } = expected;
    expect(pareto.count).toBe(5);
    await page.goto("/");
    await importSynthetic(page);
    await navigateTo(page, "products");
    await expect(paretoSection(page)).toBeVisible();
    await expect(productGridCells(page).first()).toHaveAttribute("data-testid", "chart-products-pareto");
    await expect(paretoSection(page).getByTestId("product-worst")).toBeVisible();
    await expect(varianceSection(page).getByTestId("product-best")).toBeVisible();
    const lead = pareto.allRows[2];
    await expect(paretoSection(page).locator("#products-pareto-title")).toHaveText(fill(copy.pareto.title, { n: formatCount(pareto.count, "L2"), metric: METRIC, k: formatCount(3, "L2"), pct: formatRateL1(lead.share.value) }));
    await expect(paretoBars(page)).toHaveCount(Math.min(PRODUCT_PARETO_LIMIT, pareto.count));
    // D-V4-39＝A：≤ 767px 不畫右側「累計 {pct}」（隱藏但掛載），寬螢幕畫在每根柱右側。
    if (isMobile(page)) await expect(paretoExtra(page)).toBeHidden();
    else {
      await expect(paretoExtra(page)).toBeVisible();
      await expect(paretoExtra(page).locator("text")).toHaveText(pareto.rows.map(entry => fill(copy.pareto.cumulative, { pct: formatRateL1(entry.share.value) })));
    }
    await expectDecreaseAbove(page);
    await expectEqualCells(page);
    // 點第一根柱：本期商品毛利抽屜，篩選片語含該 SKU。
    const first = pareto.rows[0].row;
    await page.getByTestId(`chart-products-pareto-bar-${first.channel}-${first.sku}`).click();
    await expect(evidenceDrawer(page)).toBeVisible();
    await expect(drawerFilter(page)).toHaveText(evidenceFilterText({ channel: first.channel, sku: first.sku }, { alias: false, anchor: expected.snapshot.data_as_of })!);
    await closeDrawer(page);
    // 資料表：全部負值列；最後一列累計＝負值合計、累計佔比＝ratioMetric(取反後的負值合計, 取反後的負值合計) 的 L2 字（100%）。
    await openDataTable(paretoSection(page));
    const rows = paretoTable(page).locator("tbody tr");
    await expect(rows).toHaveCount(pareto.count);
    const last = rows.last();
    await expect(last.locator("th")).toHaveText(product(pareto.allRows.at(-1)!.row, false));
    await expect(last.locator("td")).toHaveText([formatAmountL2(pareto.allRows.at(-1)!.value.value), formatAmountL2(pareto.total.value), formatRateL2(pareto.allRows.at(-1)!.share.value)]);
    expect(formatRateL2(pareto.allRows.at(-1)!.share.value)).toBe(formatRateL2("1.000000000000"));
    // 累計格：抽屜大數字是負值合計（L1），不帶「+」。
    await last.locator("td").nth(1).locator("button.number-link").click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(fill(copy.pareto.drawer.cumulativeTitle, { n: pareto.count, metric: METRIC })));
    await expect(drawerNumber(page)).toHaveText(formatAmountL1(pareto.total.value));
    expect(await drawerNumber(page).textContent()).not.toContain("+");
    await closeDrawer(page);
    // 累計佔比格：百分比抽屜（D-V4-32＝A）。
    await last.locator("td").nth(2).locator("button.number-link").click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(fill(copy.pareto.drawer.shareTitle, { n: pareto.count, metric: METRIC })));
    await expect(drawerNumber(page)).toHaveText(formatRateL1("1.000000000000"));
    await closeDrawer(page);
    await expectNoPageScrollX(page);
    expect(errors).toEqual([]);
  });

  test("fixtures/refund_only：G14 一根柱（1 個商品毛利為負，前 1 個佔 100%）；G13 差額都是 0，是空狀態（沒有柱與圖例），product-best 照樣在內", async ({ page }) => {
    const expected = await expectations(fixture("refund_only"));
    expect(expected.pareto.count).toBe(1);
    await page.goto("/");
    await importViaWizard(page, resolve("fixtures/refund_only"), { manifest: true });
    await dismissSavePrompt(page);
    await navigateTo(page, "products");
    await expect(paretoSection(page)).toBeVisible();
    await expect(paretoSection(page).locator("#products-pareto-title")).toHaveText(fill(copy.pareto.title, { n: "1", metric: METRIC, k: "1", pct: formatRateL1("1.000000000000") }));
    await expect(paretoBars(page)).toHaveCount(1);
    await expect(varianceSection(page).locator("#products-variance-title")).toHaveText(fill(copy.variance.title.none, { metric: METRIC }));
    await expect(varianceSection(page).locator(".chart-frame")).toHaveAttribute("data-state", "empty");
    await expect(varianceSection(page).locator(".chart-frame-message")).toHaveText(fill(copy.variance.empty, { metric: METRIC }));
    await expect(varianceBars(page)).toHaveCount(0);
    await expect(varianceSection(page).locator(".legend")).toHaveCount(0);
    await expect(varianceSection(page).getByTestId("product-best")).toBeVisible();
    await expectEqualCells(page);
    await expectNoPageScrollX(page);
  });
});

// ── V4-10 代理 D：G24 折扣率 × 商品毛利率散佈（CHART_CATALOG §8 G24 的 E2E 草案；PRD §4.5、§5.3 第 4 列、§8.2；D-V4-21＝A） ──
// 商品頁完整表之後的 <details class="chart-more products-scatter-more">；圖本體（Recharts ScatterChart）只在 src/components/charts/products-scatter-lazy.tsx，以 next/dynamic 載入。
// 首載證明以 build 產出的 chunk 檔名判定（不 grep 符號）：.next/react-loadable-manifest.json 中 import("../charts/products-scatter-lazy") 那一項的檔案都不在首頁 HTML，
// 商品頁載入後也還沒下載，第一次展開 <details> 才下載。四個視窗都跑；390 圖框不可見、資料表可見。
const scatterCopy = copy.scatter;
const RATE_X = metricDefinitions.discount_rate.label;
const RATE_Y = metricDefinitions.gross_margin.label;
const scatterMore = (page: Page) => page.locator("details.products-scatter-more");
const scatterSection = (page: Page) => page.getByTestId("chart-products-scatter");
const scatterFrame = (page: Page) => scatterSection(page).locator(".chart-frame");
const scatterSymbols = (page: Page) => scatterFrame(page).locator(".recharts-scatter-symbol");
const scatterTable = (page: Page) => page.getByTestId("chart-products-scatter-table");
/** 圖上的點與資料表的列（Node 端，同一個 compareProducts 結果）：本期折扣率、商品毛利率都有值的列，順序同 comparison.rows。 */
const scatterRows = (rows: Awaited<ReturnType<typeof expectations>>["rows"]) => rows.filter(row => row.current.metrics.discount_rate.value !== null && row.current.metrics.gross_margin.value !== null);
/** build 產出的散佈圖 chunk（URL 路徑）：react-loadable-manifest 中 scatter-section.tsx 的 import("../charts/products-scatter-lazy") 那一項。 */
function scatterChunks(): string[] {
  const manifest = JSON.parse(readFileSync(resolve(".next/react-loadable-manifest.json"), "utf8")) as Record<string, { files?: string[] }>;
  const entries = Object.entries(manifest).filter(([key]) => /-> \.\.\/charts\/products-scatter-lazy$/.test(key));
  expect(entries.map(([key]) => key), "loadable manifest 有散佈圖那一項").toHaveLength(1);
  const files = (entries[0][1].files ?? []).filter(file => file.endsWith(".js"));
  expect(files.length, "散佈圖的 chunk 檔").toBeGreaterThan(0);
  for (const file of files) expect(existsSync(resolve(".next", file)), file).toBe(true);
  return files.map(file => `/_next/${file}`);
}
/** 點第 index 個點（Recharts 依資料順序畫；示範資料有重疊的點，所以對指定的那個點派送 click，不用座標點擊）。 */
const clickSymbol = (page: Page, index: number) => scatterSymbols(page).nth(index).dispatchEvent("click");

test.describe("V4-10 商品 G24", () => {
  test("示範資料：首頁 HTML 沒有散佈圖的 chunk；商品頁載入後還沒下載，第一次展開才下載；展開後圖框 aria-hidden，≥ 768 畫 40 個點（沒有不利色）、390 圖框不可見；資料表 40 列、限制句在資料表內；點一個點開本期商品毛利率抽屜（篩選片語含 SKU）並記 chart_clicked", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    const chunks = scatterChunks();
    const home = await (await page.request.get("/")).text();
    for (const chunk of chunks) expect(home, `首頁 HTML 不含 ${chunk}`).not.toContain(chunk.replace(/^\/_next\//, ""));
    const requested: string[] = [];
    page.on("request", request => { const path = new URL(request.url()).pathname; if (chunks.includes(path)) requested.push(path); });
    const expected = await expectations(fixture("demo"));
    const rows = scatterRows(expected.rows);
    expect(rows).toHaveLength(40);
    await stubAnalytics(page);
    await page.goto("/");
    await loadDemo(page);
    await navigateTo(page, "products");
    await expect(scatterSection(page)).toBeAttached();
    await expect(scatterMore(page).locator(":scope > summary")).toHaveText(fill(scatterCopy.summary, { x: RATE_X, y: RATE_Y }));
    expect(await scatterMore(page).getAttribute("open"), "進階 <details> 預設收合").toBeNull();
    await expect(scatterSection(page)).toBeHidden();
    await expect(scatterFrame(page)).toHaveAttribute("data-state", "loading");
    expect(requested, "展開前不下載散佈圖的 chunk").toEqual([]);
    const downloaded = page.waitForResponse(response => chunks.includes(new URL(response.url()).pathname));
    await openDetails(scatterMore(page));
    await downloaded;
    await expect(scatterFrame(page)).toHaveAttribute("data-state", "ready");
    await expect(scatterFrame(page)).toHaveAttribute("aria-hidden", "true");
    await expect(scatterSection(page).locator("#products-scatter-title")).toHaveText(fill(scatterCopy.title, { n: formatCount(0, "L2"), metric: RATE_Y }));
    if (isMobile(page)) {
      await expect(scatterFrame(page)).toBeHidden();
    } else {
      await expect(scatterFrame(page)).toBeVisible();
      await expect(scatterSymbols(page)).toHaveCount(rows.length);
      await expect(scatterFrame(page).locator(`.recharts-scatter-symbol path[fill='${chartColors.unfavorable}']`)).toHaveCount(0);
      const before = await analyticsCount(page, "chart_clicked");
      const index = rows.length - 1, row = rows[index];
      await clickSymbol(page, index);
      await expect(evidenceDrawer(page)).toBeVisible();
      await expect(drawerHeading(page)).toHaveText(drawerTitle(fill(labels.products.comparison.evidenceTitle, { sku: row.sku, period: labels.shell.periods.current, label: metricDefinitions.gross_margin.shortLabel })));
      await expect(drawerFilter(page)).toHaveText(evidenceFilterText({ channel: row.channel, sku: row.sku }, { alias: true, anchor: expected.snapshot.data_as_of })!);
      expect(await analyticsCount(page, "chart_clicked")).toBe(before + 1);
      await closeDrawer(page);
    }
    // 資料表（每個寬度都看得到）：SKU · 通路｜本期折扣率｜本期毛利率；限制句在資料表 <details> 內。
    const opened = await analyticsCount(page, "chart_table_opened");
    const details = await openDataTable(scatterSection(page));
    expect(await analyticsCount(page, "chart_table_opened")).toBe(opened + 1);
    await expect(scatterTable(page)).toBeVisible();
    await expect(scatterTable(page).locator("tbody tr")).toHaveCount(rows.length);
    await expect(scatterTable(page).locator("tbody tr").first().locator("td")).toHaveText([formatRateL2(rows[0].current.metrics.discount_rate.value), formatRateL2(rows[0].current.metrics.gross_margin.value)]);
    await expect(details.locator(":scope p.note")).toHaveText(scatterCopy.limitNote);
    // 鍵盤經由資料表：第一列折扣率格開本期折扣率抽屜（與點同一個 builder）。
    await scatterTable(page).locator("tbody tr").first().locator("td").first().locator("button.number-link").click();
    await expect(drawerHeading(page)).toHaveText(drawerTitle(fill(labels.products.comparison.evidenceTitle, { sku: rows[0].sku, period: labels.shell.periods.current, label: metricDefinitions.discount_rate.shortLabel })));
    await closeDrawer(page);
    expect(requested.length, "展開後才下載").toBeGreaterThan(0);
    await expectNoPageScrollX(page);
    expect(errors).toEqual([]);
  });

  test("4 通路合成資料：標題「4 個商品毛利率為負」、副標寫 1 個待補或不適用；≥ 768 畫 11 個點、其中 4 個不利色；資料表 11 列", async ({ page }) => {
    const expected = await expectations(synthetic4ChannelInput());
    const rows = scatterRows(expected.rows);
    expect([rows.length, expected.rows.length - rows.length]).toEqual([11, 1]);
    const negative = rows.filter(row => Number(row.current.metrics.gross_margin.value) < 0).length;
    expect(negative).toBe(4);
    await page.goto("/");
    await importSynthetic(page);
    await navigateTo(page, "products");
    await openDetails(scatterMore(page));
    await expect(scatterSection(page).locator("#products-scatter-title")).toHaveText(fill(scatterCopy.title, { n: formatCount(negative, "L2"), metric: RATE_Y }));
    await expect(scatterSection(page).locator("#products-scatter-sub")).toContainText(fill(scatterCopy.nullNote, { subtitle: "", n: formatCount(1, "L2") }).trim());
    await expect(scatterFrame(page)).toHaveAttribute("data-state", "ready");
    if (isMobile(page)) await expect(scatterFrame(page)).toBeHidden();
    else {
      await expect(scatterSymbols(page)).toHaveCount(rows.length);
      await expect(scatterFrame(page).locator(`.recharts-scatter-symbol path[fill='${chartColors.unfavorable}']`)).toHaveCount(negative);
      await expect(scatterFrame(page).locator(`.recharts-scatter-symbol path[fill='${chartColors.total}']`)).toHaveCount(rows.length - negative);
    }
    await openDataTable(scatterSection(page));
    await expect(scatterTable(page).locator("tbody tr")).toHaveCount(rows.length);
    await expectNoPageScrollX(page);
  });
});
