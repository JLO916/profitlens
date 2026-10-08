import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test as base } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { BREAKEVEN_MER_VERSION } from "../../src/application/breakeven-mer";
import { formatMultiple, metricDefinitions } from "../../src/application/presentation";
import {
  be, breakevenCell, breakevenCellName, breakevenComparisonNote, breakevenFormulaLine, breakevenHelp, breakevenHelpTrigger, breakevenNote, breakevenSection,
  downloadAnalysisRows, downloadSummaryMarkdown, evidenceDialog, GOLDEN_BREAKEVEN, importFixtureDirectory, loadValidationDataset, markdownAssistSection,
  markdownBreakevenRow, markdownBreakevenVersion, markdownTechnicalLines, ratio12, readGoldenExpected,
} from "./breakeven-helpers-v39";

// V3-9a F12 損益兩平 MER（PRD §10.1 F12、D-V3-17＝C；application/breakeven-mer.ts，版本 breakeven-mer-v1）。
// 損益兩平 MER＝淨營收 ÷ 扣廣告前貢獻（扣廣告後貢獻等於 0 時的最低 MER）。手算（fixtures/golden/expected.json）：
//   上期 2,250.00 ÷ 870.00 ＝ 2.586206896552（L1 2.6 倍、L3 2.59 倍）；本期 2,470.00 ÷ 705.00 ＝ 3.503546099291（L1 3.5 倍、L3 3.50 倍）。
//   本期實際 MER 2,470.00 ÷ 450.00 ＝ 5.488888888889（L1 5.5 倍）→ 高於損益兩平。
// fixtures/zero_ad：銷售、通路費用與 golden 相同、廣告費全為 0 → 損益兩平 MER 照算（本期 3.5 倍），實際 MER 不適用，結論句是「廣告費為 0，無法比較」。
// fixtures/refund_only：兩期淨營收都是 −100.00 → 不適用。

const test = base.extend<{ audit: string[] }>({
  audit: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(`pageerror:${error.message}`));
    page.on("console", message => { if (message.type() === "error") errors.push(`console:${message.text()}`); });
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});

test("golden 總覽：其他常用指標下方的損益兩平 MER（本期 3.5 倍、上期 2.6 倍）、結論句、計算與來源抽屜與 ? 說明", async ({ page }) => {
  const golden = await readGoldenExpected();
  // 已知值與 expected.json 的淨營收 ÷ 扣廣告前貢獻一致（獨立計算，不呼叫 app）。
  expect(ratio12(golden.previous.net_revenue, golden.previous.contribution_before_marketing)).toBe(GOLDEN_BREAKEVEN.previous);
  expect(ratio12(golden.current.net_revenue, golden.current.contribution_before_marketing)).toBe(GOLDEN_BREAKEVEN.current);
  const actualMer = ratio12(golden.current.net_revenue, golden.current.ad_spend);
  await loadValidationDataset(page, "golden");

  // 位置：assist-kpis 面板裡、兩欄表（.assist-grid 兩張 table.kv，7 列有 testid）之後的獨立段；F12 的列沒有 testid，不算進 7 列。
  const assist = page.getByTestId("assist-kpis");
  const section = breakevenSection(page);
  await expect(assist.locator(".assist-panel > .assist-grid + [data-testid='assist-breakeven-mer']")).toHaveCount(1);
  await expect(assist.locator(".assist-grid > table.kv")).toHaveCount(2);
  await expect(assist.locator("tr[data-testid^='assist-']")).toHaveCount(7);
  await section.scrollIntoViewIfNeeded();
  await expect(section).toBeVisible();
  const table = section.locator("table.kv.assist-breakeven-table");
  await expect(table).toHaveCount(1);
  await expect(table.locator("thead th")).toHaveText([labels.overview.assistTable.columns.metric, labels.overview.assistTable.columns.current, labels.overview.assistTable.columns.previous]);
  await expect(table.locator("tbody tr")).toHaveCount(1);
  await expect(table.locator("tbody th[scope=row]")).toHaveText(be.label);

  // 本期／上期都是 number-link（L1），可及名稱「損益兩平 MER本期 3.5 倍，看明細」。
  const current = breakevenCell(page, "current"), previous = breakevenCell(page, "previous");
  await expect(current).toHaveText(formatMultiple(GOLDEN_BREAKEVEN.current, "L1"));
  await expect(previous).toHaveText(formatMultiple(GOLDEN_BREAKEVEN.previous, "L1"));
  await expect(current).toHaveAccessibleName(breakevenCellName("current", formatMultiple(GOLDEN_BREAKEVEN.current, "L1")));
  await expect(previous).toHaveAccessibleName(breakevenCellName("previous", formatMultiple(GOLDEN_BREAKEVEN.previous, "L1")));
  await expect(current).toHaveClass(/number-link/);
  // 結論句（不上色）：本期 MER 5.5 倍，高於損益兩平（3.5 倍）。
  await expect(breakevenNote(page)).toHaveText(breakevenComparisonNote("above", actualMer, GOLDEN_BREAKEVEN.current));

  // 「計算與來源」抽屜：標題、L1 大數字＋L3 精確值、公式行（兩個輸入到分）、指標定義是 F12 自己的（不是 MER 的）＋版本 breakeven-mer-v1、沒有比率階梯表與組成表。
  await current.click();
  const dialog = evidenceDialog(page, be.label);
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { level: 2 })).toHaveText(`${be.label} · ${labels.evidence.sections.evidence}`);
  await expect(dialog.locator(".evidence-body > p.number")).toHaveText(formatMultiple(GOLDEN_BREAKEVEN.current, "L1"));
  await expect(dialog.getByTestId("evidence-precise-value")).toHaveText(formatMultiple(GOLDEN_BREAKEVEN.current, "L3"));
  await expect(dialog.locator(".evidence-formula")).toHaveText(breakevenFormulaLine(golden.current.net_revenue, golden.current.contribution_before_marketing));
  await expect(dialog.locator(".ladder-table")).toHaveCount(0);
  await expect(dialog.locator(".evidence-components")).toHaveCount(0);
  const definition = dialog.locator(".evidence-definition");
  await expect(definition.locator(".evidence-version")).toHaveText(fill(labels.evidence.drawerV3.version, { version: BREAKEVEN_MER_VERSION }));
  expect(await definition.locator("p").evaluate(element => element.firstChild?.textContent ?? "")).toBe(be.plain);
  await expect(definition).not.toContainText(metricDefinitions.mer.plain);
  // 來源只有銷售檔與通路費用檔（本期 golden：銷售 4 列、通路費用 2 列），沒有廣告檔。
  const tabs = dialog.getByRole("group", { name: labels.evidence.drawer.sourceTabsAria, exact: true }).getByRole("button");
  await expect(tabs).toHaveText([
    fill(labels.evidence.drawer.tabWithCount, { tab: labels.evidence.sourceTabs.sales, n: 4 }),
    fill(labels.evidence.drawer.tabWithCount, { tab: labels.evidence.sourceTabs.costs, n: 2 }),
  ]);
  await expect(dialog).not.toContainText("ad_spend_daily.csv");
  // 技術細節的系統原值是 12 位小數比率。
  await expect(dialog.locator("dd code").filter({ hasText: GOLDEN_BREAKEVEN.current })).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(current).toBeFocused();

  // 上期也能開，精確值 2.59 倍。
  await previous.click();
  await expect(dialog).toBeVisible();
  await expect(dialog.getByTestId("evidence-precise-value")).toHaveText(formatMultiple(GOLDEN_BREAKEVEN.previous, "L3"));
  await expect(dialog.locator(".evidence-formula")).toHaveText(breakevenFormulaLine(golden.previous.net_revenue, golden.previous.contribution_before_marketing));
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(previous).toBeFocused();

  // ? 說明：關著時 hidden 但保持掛載（M1）；點開後兩句（定義、版本），Esc 關閉並回焦到觸發器（M3）。
  const trigger = breakevenHelpTrigger(page), help = breakevenHelp(page);
  await expect(trigger).toHaveAccessibleName(fill(be.helpAria, { metric: be.label }));
  await expect(trigger).toHaveAttribute("aria-controls", "assist-breakeven-help");
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(help).toHaveCount(1);
  await expect(help).toBeHidden();
  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  await expect(help).toBeVisible();
  await expect(help.locator("p")).toHaveText([be.help.definition, fill(be.help.version, { version: BREAKEVEN_MER_VERSION })]);
  await page.keyboard.press("Escape");
  await expect(help).toBeHidden();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await expect(trigger).toBeFocused();
  // 再點一次開、再點一次關（切換）。
  await trigger.click();
  await expect(help).toBeVisible();
  await trigger.click();
  await expect(help).toBeHidden();
});

test("golden 匯出：分析 CSV 每期一列 breakeven_mer（12 位比率、breakeven-mer-v1、來源不含廣告檔）；一頁摘要 Markdown 多一列與版本行", async ({ page }) => {
  await loadValidationDataset(page, "golden");
  const analysis = await downloadAnalysisRows(page);
  const rows = analysis.filter(row => row.row_type === "breakeven_mer");
  expect(rows).toHaveLength(2);
  expect(rows.map(row => row.period)).toEqual(["previous", "current"]);
  for (const row of rows) {
    expect(row).toMatchObject({ metric: "breakeven_mer", metric_label: be.label, unit: "multiple", metric_version: BREAKEVEN_MER_VERSION, reason_codes: "[]" });
    expect(row.value).toMatch(/^\d+\.\d{12}$/);
    const sources = JSON.parse(row.source_refs) as { file: string }[];
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.some(source => source.file === "sales_daily.csv")).toBe(true);
    expect(sources.some(source => source.file === "ad_spend_daily.csv")).toBe(false);
  }
  expect(rows.map(row => row.value)).toEqual([GOLDEN_BREAKEVEN.previous, GOLDEN_BREAKEVEN.current]);
  // 接在 14 列 assist_kpi 之後；其餘列的版本不變。
  const types = analysis.map(row => row.row_type);
  expect(types.lastIndexOf("assist_kpi") + 1).toBe(types.indexOf("breakeven_mer"));
  expect(analysis.filter(row => row.row_type === "assist_kpi")).toHaveLength(14);

  const markdown = await downloadSummaryMarkdown(page);
  const assistLines = markdownAssistSection(markdown).filter(line => line.startsWith("| "));
  // 表頭＋分隔列＋7 個輔助指標＋F12 一列；F12 是最後一列（L1，與畫面相同）。
  expect(assistLines).toHaveLength(10);
  expect(assistLines.at(-1)).toBe(markdownBreakevenRow(GOLDEN_BREAKEVEN.previous, GOLDEN_BREAKEVEN.current));
  const technical = markdownTechnicalLines(markdown);
  const assistVersion = technical.findIndex(line => line.startsWith(`- ${labels.assist.technicalVersion}：`));
  expect(assistVersion).toBeGreaterThanOrEqual(0);
  expect(technical[assistVersion + 1]).toBe(markdownBreakevenVersion);
});

test("zero_ad：廣告費為 0 時損益兩平 MER 照算，結論句是無法比較", async ({ page }) => {
  const golden = await readGoldenExpected();
  const zeroAd = JSON.parse(await readFile(resolve("fixtures/zero_ad/expected.json"), "utf8")) as { current_contribution_after_marketing: string; current_mer: string | null };
  // zero_ad 的銷售與通路費用檔與 golden 相同（廣告費全 0 → 本期扣廣告後貢獻＝扣廣告前貢獻 705.00），所以淨營收沿用 golden 的 2,470.00。
  for (const file of ["sales_daily.csv", "channel_costs_daily.csv"]) expect(await readFile(resolve("fixtures/zero_ad", file), "utf8")).toBe(await readFile(resolve("fixtures/golden", file), "utf8"));
  expect(zeroAd.current_mer).toBeNull();
  const current = ratio12(golden.current.net_revenue, zeroAd.current_contribution_after_marketing);
  expect(current).toBe(GOLDEN_BREAKEVEN.current);
  await importFixtureDirectory(page, "fixtures/zero_ad");
  const section = breakevenSection(page);
  await section.scrollIntoViewIfNeeded();
  await expect(breakevenCell(page, "current")).toHaveText(formatMultiple(current, "L1"));
  await expect(breakevenCell(page, "previous")).toHaveText(formatMultiple(GOLDEN_BREAKEVEN.previous, "L1"));
  await expect(breakevenNote(page)).toHaveText(be.note.zeroAds);
});

test("refund_only：兩期淨營收為負，損益兩平 MER 不適用（不顯示 0 或無限大），抽屜大數字也是不適用", async ({ page }) => {
  await importFixtureDirectory(page, "fixtures/refund_only");
  const section = breakevenSection(page);
  await section.scrollIntoViewIfNeeded();
  const current = breakevenCell(page, "current");
  await expect(current).toHaveText(labels.assist.notApplicable);
  await expect(breakevenCell(page, "previous")).toHaveText(labels.assist.notApplicable);
  await expect(current).toHaveAccessibleName(breakevenCellName("current", labels.assist.notApplicable));
  await expect(section.locator("td.num.not_applicable")).toHaveCount(2);
  await expect(breakevenNote(page)).toHaveText(be.note.nonPositiveRevenue);
  await current.click();
  const dialog = evidenceDialog(page, be.label);
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".evidence-body > p.number")).toHaveText(labels.assist.notApplicable);
  await expect(dialog.getByTestId("evidence-precise-value")).toHaveCount(0);
  await expect(dialog.locator(".evidence-version")).toHaveText(fill(labels.evidence.drawerV3.version, { version: BREAKEVEN_MER_VERSION }));
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(current).toBeFocused();
  // 分析 CSV：值是空字串，原因碼寫淨營收為負（NON_POSITIVE_NET_REVENUE）。
  const rows = (await downloadAnalysisRows(page)).filter(row => row.row_type === "breakeven_mer");
  expect(rows).toHaveLength(2);
  for (const row of rows) {
    expect(row.value).toBe("");
    expect(row.metric_version).toBe(BREAKEVEN_MER_VERSION);
    expect(JSON.parse(row.reason_codes)).toContain("NON_POSITIVE_NET_REVENUE");
  }
});
