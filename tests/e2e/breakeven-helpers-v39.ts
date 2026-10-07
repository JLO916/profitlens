import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { BREAKEVEN_MER_VERSION } from "../../src/application/breakeven-mer";
import { formatAmountL3, formatMultiple, metricDefinitions } from "../../src/application/presentation";
import { importViaWizard } from "./import-wizard-helpers";
import { clickReplacing, closeDownloads, dismissSavePrompt, navigateTo, openDownloads, openValidation } from "./replacement-helpers";

// V3-9a F12 損益兩平 MER（breakeven-mer-v1，D-V3-17＝C）E2E 共用 helper：字串一律由 labels 取字，數字一律交給 presentation 的格式化函式。
// 期待值來自 fixtures/golden/expected.json（淨營收 ÷ 扣廣告前貢獻），由本檔獨立的 12 位 HALF_UP 比率計算核對，不呼叫 app 的計算。

export const be = labels.assist.breakevenV3;
const assistTable = labels.overview.assistTable;
export type BreakevenPeriod = "previous" | "current";

/** golden expected.json 用到的欄位（兩期的淨營收、扣廣告前貢獻、廣告費）。 */
export interface GoldenPeriodAmounts { net_revenue: string; contribution_before_marketing: string; ad_spend: string }
export interface GoldenExpected { previous: GoldenPeriodAmounts; current: GoldenPeriodAmounts }
export async function readGoldenExpected(): Promise<GoldenExpected> {
  return JSON.parse(await readFile(resolve("fixtures/golden/expected.json"), "utf8")) as GoldenExpected;
}

/**
 * 獨立的比率：兩個正的、到分的金額字串相除，ROUND_HALF_UP 到 12 位小數（與 domain ratioMetric 相同精度規則，但不呼叫它）。
 * 例：2470.00 ÷ 705.00 → "3.503546099291"。
 */
export function ratio12(numerator: string, denominator: string): string {
  const cents = (value: string) => {
    const match = /^(\d+)\.(\d{2})$/.exec(value);
    expect(match, `${value} 必須是正的到分金額`).not.toBeNull();
    return BigInt(`${match![1]}${match![2]}`);
  };
  const n = cents(numerator), d = cents(denominator);
  expect(d > 0n).toBe(true);
  const scaled = (n * 10n ** 13n) / d;
  const rounded = (scaled + 5n) / 10n;
  const digits = rounded.toString().padStart(13, "0");
  return `${digits.slice(0, -12)}.${digits.slice(-12)}`;
}

/** golden 的損益兩平 MER（任務給定的已知值；readGoldenExpected＋ratio12 會再核對一次）。 */
export const GOLDEN_BREAKEVEN = { previous: "2.586206896552", current: "3.503546099291" } as const;

/** 總覽「其他常用指標」下方的 F12 段與其中的元素（testid 皆唯一，M6）。 */
export const breakevenSection = (page: Page) => page.getByTestId("assist-breakeven-mer");
export const breakevenCell = (page: Page, period: BreakevenPeriod) => page.getByTestId(`assist-breakeven-${period}`);
export const breakevenNote = (page: Page) => page.getByTestId("assist-breakeven-note");
export const breakevenHelpTrigger = (page: Page) => page.getByTestId("assist-breakeven-help-trigger");
export const breakevenHelp = (page: Page) => page.getByTestId("assist-breakeven-help");
/** number-link 的可及名稱：「損益兩平 MER本期 3.5 倍，看明細」（assistTable.cellAria）。 */
export const breakevenCellName = (period: BreakevenPeriod, display: string) => fill(assistTable.cellAria, { metric: be.label, period: assistTable.columns[period], value: display });
/** 本期一句結論（above／below）：{mer} 是 metricDefinitions.mer.label，兩個倍數都是 L1。 */
export const breakevenComparisonNote = (kind: "above" | "below", actualMer: string, breakeven: string) => fill(be.note[kind], { mer: metricDefinitions.mer.label, actual: formatMultiple(actualMer, "L1"), breakeven: formatMultiple(breakeven, "L1") });
/** 抽屜公式行：兩個輸入金額是 L3（到分）＋「元」。 */
export const breakevenFormulaLine = (netRevenue: string, contributionBefore: string) => fill(be.evidenceFormula, { revenue: fill(labels.format.units.yuan, { value: formatAmountL3(netRevenue) }), contribution: fill(labels.format.units.yuan, { value: formatAmountL3(contributionBefore) }) });
/** 「計算與來源」抽屜：標題「{指標} · 計算與來源」（後半是 sr-only）。 */
export const evidenceDialog = (page: Page, title: string) => page.getByRole("dialog", { name: `${title} · ${labels.sections.evidence}`, exact: true });

/** 開發者驗證頁載入內建資料集（golden／demo），關掉首次保存提示，回到總覽。 */
export async function loadValidationDataset(page: Page, id: "golden" | "demo") {
  await page.goto("/");
  await openValidation(page);
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption(id);
  await clickReplacing(page, page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true }));
  await expect(page.getByTestId("kpi-net_revenue")).toBeVisible();
  await dismissSavePrompt(page);
  await navigateTo(page, "overview");
}

/** repo 內的 fixtures 目錄（zero_ad、refund_only 不在驗證頁的選單裡）：經匯入精靈帶入三份 CSV 與資料集設定檔，套用後回到總覽。 */
export async function importFixtureDirectory(page: Page, directory: string) {
  const manifest = JSON.parse(await readFile(resolve(directory, "manifest.json"), "utf8")) as { data_as_of: string };
  await page.goto("/");
  await importViaWizard(page, resolve(directory), { manifest: true });
  await expect(page.getByTestId("workspace-status")).toContainText(fill(labels.status.ready, { date: manifest.data_as_of }));
  await dismissSavePrompt(page);
  await navigateTo(page, "overview");
}

/** 下載並讀成文字（檢查檔名）。 */
export async function downloadText(page: Page, button: Locator, expectedName: string) {
  const [download] = await Promise.all([page.waitForEvent("download"), button.click()]);
  expect(download.suggestedFilename()).toBe(expectedName);
  const path = await download.path();
  expect(path).not.toBeNull();
  return readFile(path!, "utf8");
}

/** 頂欄「匯出」→ 分析 CSV（profitlens-analysis.csv），讀成以英文 key 為欄名的列。 */
export async function downloadAnalysisRows(page: Page) {
  const menu = await openDownloads(page);
  const text = await downloadText(page, menu.getByRole("button", { name: labels.downloads.analysisCsv, exact: true }), "profitlens-analysis.csv");
  await closeDownloads(page);
  return csvRecords(text);
}

/** 頂欄「匯出」→ 一頁摘要 Markdown（profitlens-manager-summary.md，exportManagerSummaryMarkdown）。 */
export async function downloadSummaryMarkdown(page: Page) {
  const menu = await openDownloads(page);
  const text = await downloadText(page, menu.getByRole("button", { name: labels.meetingPage.menuMarkdown, exact: true }), "profitlens-manager-summary.md");
  await closeDownloads(page);
  return text;
}

/** Markdown「其他常用指標」表的 F12 列（倍數是 L1，與畫面相同）。 */
export const markdownBreakevenRow = (previous: string, current: string) => `| ${be.label} | ${formatMultiple(previous, "L1")} | ${formatMultiple(current, "L1")} |`;
/** Markdown 技術細節的版本行。 */
export const markdownBreakevenVersion = `- ${be.technicalVersion}：${BREAKEVEN_MER_VERSION}`;
/** Markdown 的「## 其他常用指標」段（到下一個 ## 為止）的各行。 */
export function markdownAssistSection(markdown: string): string[] {
  const lines = markdown.split("\n");
  const start = lines.indexOf(`## ${labels.sections.assistKpis}`);
  expect(start, "Markdown 要有其他常用指標段").toBeGreaterThanOrEqual(0);
  const end = lines.findIndex((line, index) => index > start && line.startsWith("## "));
  return lines.slice(start + 1, end === -1 ? undefined : end);
}
/** Markdown 技術細節段（「## 技術細節」之後）的各行。 */
export function markdownTechnicalLines(markdown: string): string[] {
  const parts = markdown.split(`## ${labels.sections.technicalDetails}`);
  expect(parts.length, "Markdown 要有技術細節段").toBeGreaterThanOrEqual(2);
  return parts.slice(1).join("").split("\n");
}

/** 獨立、會處理引號的 CSV 讀取（不呼叫 app 的解析或匯出）；標題「中文 (english_key)」只留英文 key。 */
export function csvRecords(input: string): Record<string, string>[] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [], value = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (!quoted && character === ",") { row.push(value); value = ""; }
    else if (!quoted && (character === "\n" || character === "\r")) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(value); rows.push(row); row = []; value = "";
    } else value += character;
  }
  expect(quoted, "下載 CSV 的引號須閉合").toBe(false);
  if (value || row.length) { row.push(value); rows.push(row); }
  const headers = (rows.shift() ?? []).map(header => /\(([^()]+)\)\s*$/.exec(header)?.[1] ?? header);
  expect(headers.length).toBeGreaterThan(0);
  return rows.map(values => {
    expect(values.length).toBe(headers.length);
    return Object.fromEntries(headers.map((header, index) => [header, values[index]]));
  });
}
