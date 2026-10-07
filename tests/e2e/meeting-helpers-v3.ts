import { expect, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { formatPeriodExport } from "../../src/application/presentation";
import { openDetails } from "./replacement-helpers";

// V3-7（PRD §7.6、§7.9）會議紀錄頁與匯出版頭的 E2E 小工具（代理 E1）。共用的 replacement-helpers 不動；這裡只放 V3-7 新結構的定位與版頭組字。

/** 會議頁「匯出會議」的五項（testid meeting-export-{kind}）；可及名稱沿用 v2 輸出列的按鈕名稱（aria-label），畫面上另有一行 small 說明。 */
export const MEETING_EXPORTS = {
  pdf: labels.buttons.exportPdf,
  markdown: labels.buttons.exportMarkdown,
  csv: labels.downloads.channelTableCsv,
  excel: labels.buttons.exportExcel,
  pptx: labels.buttons.exportPptx,
} as const;
export type MeetingExportKind = keyof typeof MEETING_EXPORTS;

/**
 * V3-7：會議頁頁首動作列的「匯出會議」頁內下拉（details[data-testid=meeting-outputs]，summary testid export-page-meeting）。
 * 沒展開就點 summary；回傳展開後的 details。點任何一項後選單會關閉、焦點回到 summary，所以每次匯出前都要再開一次。
 */
export async function openMeetingExport(page: Page): Promise<Locator> {
  const menu = page.getByTestId("meeting-outputs");
  if (await menu.getAttribute("open") === null) await page.getByTestId("export-page-meeting").click();
  await expect(menu).toHaveAttribute("open", "");
  return menu;
}
/** 開「匯出會議」後回傳該項按鈕（先確認可及名稱仍是 v2 的按鈕名稱）。 */
export async function meetingExportItem(page: Page, kind: MeetingExportKind): Promise<Locator> {
  const menu = await openMeetingExport(page);
  const item = menu.getByTestId(`meeting-export-${kind}`);
  await expect(item).toHaveAccessibleName(MEETING_EXPORTS[kind]);
  return item;
}

/** 議程 2 的「調整門檻」收合（details.meeting-threshold，summary＝labels.sections.adjustThreshold）；summary 是議程 ol（data-testid=manager-summary）。已展開就不動。 */
export async function openThreshold(summary: Locator): Promise<Locator> {
  const details = summary.locator("details.meeting-threshold");
  await expect(details.locator(":scope > summary")).toHaveText(labels.sections.adjustThreshold);
  return openDetails(details);
}
/** 「與上次會議比較」預設收合（details[data-testid=meeting-compare]，summary 內是 h2 labels.sections.meetingCompare）；展開後回傳 details。 */
export async function openCompare(meeting: Locator): Promise<Locator> {
  const details = meeting.getByTestId("meeting-compare");
  await expect(details.locator(":scope > summary").getByRole("heading", { level: 2 })).toHaveText(labels.sections.meetingCompare);
  return openDetails(details);
}
/** 議程 3 的「完整通路寬表」收合（details.meeting-wide-table，summary＝labels.meeting.pageV3.fullChannelTable）；展開後回傳 details。 */
export async function openWideTable(summary: Locator): Promise<Locator> {
  const details = summary.locator("details.meeting-wide-table");
  await expect(details.locator(":scope > summary")).toHaveText(labels.meeting.pageV3.fullChannelTable);
  return openDetails(details);
}

const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 台北時間「YYYY-MM-DD hh:mm」（formatSavedDateTime 的輸出格式）。 */
export const TAIPEI_MINUTE = "\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}";

export interface ExportHeaderExpectation {
  /** 版頭第 1 行：畫面上的資料集名稱（labels.ui.dashboard.datasets.*）；會議資料與目前不同時是 dataset_id。 */
  datasetName: string;
  /** 兩期起訖（YYYY-MM-DD）；期間字串由 formatPeriodExport 組。 */
  previous: { start: string; end: string };
  current: { start: string; end: string };
  /** labels.exports.headerV3.unitExclusive／unitConverted。預設未稅。 */
  unit?: string;
  /** 指標版本；預設 contribution-v1。 */
  version?: string;
  /** 產出時間（台北時間 YYYY-MM-DD hh:mm）的 RegExp 原始碼；預設任意分鐘。 */
  time?: string;
}
/** 版頭第 2 行：報表名（扣廣告後貢獻兩期比較（管理報表））。 */
export const exportReportTitle = () => fill(labels.exports.headerV3.reportTitle, { metric: labels.metrics.contribution_after_marketing.label });
/** 版頭第 3 行前段：「本期 … ；上期 …」。 */
export const exportPeriodLine = (expected: Pick<ExportHeaderExpectation, "previous" | "current">) => fill(labels.exports.headerV3.periodLine, {
  current: formatPeriodExport(expected.current.start, expected.current.end),
  previous: formatPeriodExport(expected.previous.start, expected.previous.end),
});
/** 版頭第 3 行：期間 · 單位。 */
export const exportPeriodUnitLine = (expected: Pick<ExportHeaderExpectation, "previous" | "current" | "unit">) => fill(labels.exports.headerV3.periodUnitLine, { period: exportPeriodLine(expected), unit: expected.unit ?? labels.exports.headerV3.unitExclusive });
/** 版頭第 4 行（RegExp）：「指標版本 contribution-v1 · 產出時間 YYYY-MM-DD hh:mm（台北時間）」。 */
export function exportVersionLineRe(version = "contribution-v1", time = TAIPEI_MINUTE): RegExp {
  const [before, after] = labels.exports.headerV3.versionLine.split("{time}");
  return new RegExp(`^${escapeRe(fill(before, { version }))}${time}${escapeRe(after)}$`);
}
/**
 * 比對版頭四行（Markdown 開頭、Excel 摘要表前四列、列印版頭的文字）。
 * hardBreaks：Markdown 版的前三行行尾是兩個空白（硬換行），第 4 行沒有；其他格式不帶空白。
 */
export function expectExportHeader(lines: readonly string[], expected: ExportHeaderExpectation, options: { hardBreaks?: boolean } = {}) {
  expect(lines).toHaveLength(4);
  const breakSuffix = options.hardBreaks ? "  " : "";
  expect(lines[0]).toBe(`${expected.datasetName}${breakSuffix}`);
  expect(lines[1]).toBe(`${exportReportTitle()}${breakSuffix}`);
  expect(lines[2]).toBe(`${exportPeriodUnitLine(expected)}${breakSuffix}`);
  expect(lines[3]).toMatch(exportVersionLineRe(expected.version, expected.time));
}
