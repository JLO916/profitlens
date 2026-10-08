import { expect, type Locator, type Page } from "@playwright/test";
import { fill, labels } from "../../src/i18n";
import { splitIssueTemplate } from "../../src/application/import";

/**
 * V3-8 資料來源頁（PRD §7.7.1）的 E2E helper（代理 E2）。
 * 區塊依 1–9 的順序：資料狀態一行 → 資料問題 → 範圍與金額基準 → 本次匯入的前處理 → 選填資料 → 來源檔案預覽（三個 details）→ 版本與來源資訊（details）→ 範本下載。
 * 收合的內容保持掛載（M1），要「看得見」再斷言時先展開 summary。
 */
const v3 = labels.data.pageV3;
const issueCopy = labels.data.issues;
/** 問題表「問題」欄去掉的位置前綴以全形冒號結尾（「{file} 第 {line} 行：」）。 */
const COLON = "：";

/** §7.7.1 區塊的 data-testid，依畫面由上到下的順序。 */
export const dataPageBlocks = ["data-status-line", "data-issues", "data-scope", "data-preprocessing", "data-optional", "data-preview", "data-version-info", "data-templates"] as const;
export type PreviewFile = "sales_daily.csv" | "channel_costs_daily.csv" | "ad_spend_daily.csv";
export const previewFiles: readonly PreviewFile[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];

/** 展開一個 <details>（已展開就不點，不會把它關掉）；先把 summary 捲到畫面中間，避免被 sticky 列蓋住。 */
async function expand(details: Locator) {
  if (await details.getAttribute("open") === null) {
    const summary = details.locator(":scope > summary");
    await summary.evaluate(element => element.scrollIntoView({ block: "center" }));
    await summary.click();
  }
  await expect(details).toHaveAttribute("open", "");
  return details;
}

/** 來源檔案預覽的 <details>（data-preview-{file}，預設收合）。 */
export const previewDetails = (page: Page, file: PreviewFile) => page.getByTestId(`data-preview-${file}`);
/** 展開某一份檔案的來源預覽，回傳該 <details>。 */
export const openPreview = (page: Page, file: PreviewFile) => expand(previewDetails(page, file));
/** 來源預覽的表格：caption（sr-only）＝ fill(ui.workspacePanels.previewCaption, { fileName })。 */
export const previewTable = (page: Page, file: PreviewFile) => previewDetails(page, file).getByRole("table", { name: fill(labels.data.panel.previewCaption, { fileName: file }), exact: true });
/** 「版本與來源資訊」<details>（data-version-info，預設收合）。 */
export const versionInfo = (page: Page) => page.getByTestId("data-version-info");
export const openVersionInfo = (page: Page) => expand(versionInfo(page));

/** 資料問題表（IssueList 的 table.issue-table）；scope 是包住它的區塊（data-issues、targets-issues、events-issues、error-issues）。 */
export const issueTable = (scope: Locator) => scope.locator("table.issue-table");
/** 表頭工具列的「顯示原因碼」切換（aria-pressed）。 */
export const reasonCodeToggle = (scope: Locator) => scope.getByRole("button", { name: v3.issueTable.showCodes, exact: true });
/** 六欄表頭（檔案｜行號｜欄位｜問題｜修法｜原因碼）；原因碼欄預設 hidden。 */
export const issueColumns = [v3.issueTable.columns.file, v3.issueTable.columns.line, v3.issueTable.columns.field, v3.issueTable.columns.problem, v3.issueTable.columns.fix, v3.issueTable.columns.code] as const;
/** 按「顯示原因碼」（已按下就不再按），等到原因碼欄看得見。 */
export async function showReasonCodes(scope: Locator) {
  const toggle = reasonCodeToggle(scope);
  if (await toggle.getAttribute("aria-pressed") !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
  await expect(issueTable(scope).locator("thead th.issue-code")).toBeVisible();
}

/**
 * 一句「L1。L2」拆成問題表的兩欄：「問題」只放 L1 去掉位置前綴（「{file} 第 {line} 行：」）之後的部分，「修法」放 L2。
 * 句子由 labels 樣板帶入（labels.errors.import、labels.targets.errors、labels.events.errors），拆句沿用 application 的 splitIssueTemplate。
 */
export function issueCells(message: string): { problem: string; fix: string } {
  const { headline, explain } = splitIssueTemplate(message);
  const colon = headline.indexOf(COLON);
  return { problem: colon < 0 ? headline : headline.slice(colon + COLON.length), fix: explain };
}

export interface ExpectedIssueRow {
  file: string;
  line: number | null;
  field: string;
  problem: string;
  fix: string;
  /** 核心三份 CSV 的問題有嚴重程度標籤（ui-lozenge，labels.data.issues.severity）；選填檔沒有。 */
  severity?: keyof typeof issueCopy.severity;
  /** 有給時，順便斷言原因碼格的文字（要先 showReasonCodes 才看得見）。 */
  code?: string;
}
/** 問題表一列（tbody tr）的六格內容。 */
export async function expectIssueRow(row: Locator, expected: ExpectedIssueRow) {
  const cells = row.locator(":scope > td");
  await expect(cells).toHaveCount(6);
  await expect(cells.nth(0).locator(".ui-mono")).toHaveText(expected.file);
  await expect(cells.nth(1)).toHaveText(expected.line === null ? "" : String(expected.line));
  await expect(cells.nth(2).locator(".ui-mono")).toHaveText(expected.field);
  const severity = cells.nth(3).locator(".ui-lozenge");
  if (expected.severity) {
    await expect(severity).toHaveText(issueCopy.severity[expected.severity]);
    await expect(cells.nth(3)).toHaveText(`${issueCopy.severity[expected.severity]}${expected.problem}`);
  } else {
    await expect(severity).toHaveCount(0);
    await expect(cells.nth(3)).toHaveText(expected.problem);
  }
  await expect(cells.nth(4)).toHaveText(expected.fix);
  if (expected.code !== undefined) {
    await expect(cells.nth(5)).toBeVisible();
    await expect(cells.nth(5).locator("code")).toHaveText(expected.code);
  }
}

/** 資料來源頁頁首的「匯入資料／載入示範資料」按鈕，依 DOM 順序。 */
export const pageLoadControls = (page: Page) => page.locator(".page-heading .load-controls > button");
/**
 * §7.7.1 第 1 點主次：有資料時「匯入資料」（page-import）主要在前、「載入示範資料」次要在後；沒有資料時對調。
 * 主要按鈕永遠是第一顆，而且只有一顆。
 */
export async function expectHeaderOrder(page: Page, hasData: boolean) {
  const buttons = pageLoadControls(page);
  await expect(buttons).toHaveCount(2);
  const [primary, secondary] = hasData ? [labels.shell.buttons.importData, labels.shell.buttons.loadDemo] : [labels.shell.buttons.loadDemo, labels.shell.buttons.importData];
  await expect(buttons).toHaveText([primary, secondary]);
  await expect(buttons.nth(0)).toHaveClass(/\bui-btn-primary\b/);
  await expect(buttons.nth(1)).toHaveClass(/\bui-btn-secondary\b/);
  await expect(page.locator(".page-heading .load-controls .ui-btn-primary")).toHaveCount(1);
  await expect(page.getByTestId("page-import")).toHaveText(labels.shell.buttons.importData);
  await expect(page.getByTestId("page-import")).toHaveClass(hasData ? /\bui-btn-primary\b/ : /\bui-btn-secondary\b/);
}

/** 各區塊是否依序出現在 DOM（compareDocumentPosition），以及各自頂端的 y（boundingBox；收合的 details 也有框）。 */
export async function blockPositions(page: Page, testIds: readonly string[]) {
  const domOrdered = await page.evaluate(ids => {
    const elements = ids.map(id => document.querySelector(`[data-testid="${id}"]`));
    if (elements.some(element => !element)) return false;
    return elements.slice(1).every((element, index) => !!(elements[index]!.compareDocumentPosition(element!) & Node.DOCUMENT_POSITION_FOLLOWING));
  }, [...testIds]);
  const tops: number[] = [];
  for (const id of testIds) tops.push((await page.getByTestId(id).boundingBox())?.y ?? Number.NaN);
  return { domOrdered, tops };
}
