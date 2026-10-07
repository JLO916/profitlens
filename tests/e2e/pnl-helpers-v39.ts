import { expect, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { openDetails } from "./replacement-helpers";

// V3-9a F9 每日／每週管理損益表（總覽「進階」<details> 內、期間合計與日均之後的 <details data-testid="pnl-table">）。
// 每格沒有 testid（M6：同一控制只有一個 DOM 實例），一律用表格屬性定位：tr[data-row=<MetricName>]、td[data-col=<ISO 日期|週起日|total|share>]。
const copy = labels.overview.pnlV3;
export type PnlGranularityName = "day" | "week";

/** 管理損益表的 <details>（預設收合、內容保持掛載）。 */
export const pnlPanel = (page: Page) => page.getByTestId("pnl-table");
/** 報表型表格（帶 data-granularity="day"|"week"）。範圍限定在 pnl-table 內，不會撞到本期利潤結構（profit-waterfall）的 tr[data-row]。 */
export const pnlTable = (page: Page) => pnlPanel(page).locator("table.report-table");
/** 捲動容器（.table-scroll[role=region]）。 */
export const pnlScroll = (page: Page) => pnlPanel(page).locator(".table-scroll");
/** 一列：tr[data-row=<MetricName>]（class pnl-row-item／subtotal／total；零值列 data-zero="true"）。 */
export const pnlRow = (page: Page, row: string) => pnlTable(page).locator(`tbody > tr[data-row='${row}']`);
/** 一格：td[data-col=<ISO 日期|週起日|total|share>]。 */
export const pnlCell = (page: Page, row: string, col: string) => pnlRow(page, row).locator(`td[data-col='${col}']`);
/** 一格裡開「計算與來源」的 number-link（佔淨營收 % 與「無資料」格沒有）。 */
export const pnlCellButton = (page: Page, row: string, col: string) => pnlCell(page, row, col).locator("button.number-link");

/** 先展開外層「進階」（overview-advanced）再展開管理損益表（M4 兩層 <details>）；已展開就不點。回傳 pnl-table。 */
export async function openPnlTable(page: Page): Promise<Locator> {
  await openDetails(page.getByTestId("overview-advanced"));
  const panel = await openDetails(pnlPanel(page));
  await expect(panel).toHaveAttribute("open", "");
  await expect(pnlTable(page)).toBeVisible();
  return panel;
}
/** 切換日／週（分段按鈕 aria-pressed）；切完等表格的 data-granularity 跟著改。 */
export async function setPnlGranularity(page: Page, granularity: PnlGranularityName) {
  const button = page.getByTestId(`pnl-granularity-${granularity}`);
  if (await button.getAttribute("aria-pressed") !== "true") await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
  await expect(pnlTable(page)).toHaveAttribute("data-granularity", granularity);
}
/** 每格 number-link 的可及名稱：fill(cellAria, { date: 欄名, metric: 指標名, value: 畫面上的 L2 值 })。 */
export const pnlCellAria = (date: string, metric: string, value: string) => fill(copy.cellAria, { date, metric, value });
/** 抽屜 h2 的文字：fill(evidenceTitle, { metric, date }) 加上 sr-only 的「 · 計算與來源」。 */
export const pnlEvidenceHeading = (metric: string, date: string) => `${fill(copy.evidenceTitle, { metric, date })} · ${labels.sections.evidence}`;
/** 一列中各格的 data-col（依 DOM 順序）。 */
export const pnlRowColumns = (page: Page, row: string) => pnlRow(page, row).locator("td[data-col]").evaluateAll(cells => cells.map(cell => cell.getAttribute("data-col")));
/** 表頭各欄的 data-col（第一欄「項目」沒有 data-col）。 */
export const pnlHeadColumns = (page: Page) => pnlTable(page).locator("thead th[data-col]").evaluateAll(cells => cells.map(cell => cell.getAttribute("data-col")));
