import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { plainIssueMessage } from "@/application/copy";
import {
  ALL_IMPORT_ISSUE_REASON_CODES, SUPPORTED_ISSUE_PLACEHOLDERS, importIssueMessage, inspectImportFile, issueContextFromDrafts, issueMessageParts, issuePlaceholderValues,
  issueTemplate, prepareImport, renderIssueTemplate, splitIssueTemplate, templatePlaceholders, type ImportFileDraft, type IssueTemplate,
} from "@/application/import";
import type { FileName, ValidationIssue } from "@/domain/types";
import { parseCsv } from "@/lib/csv";

// V3-2a §7.7.3：匯入錯誤句型「{file} 第 {line} 行：{問題}。{修法}。」；原因碼只放 L3。
// 同一組檢查跑兩次：docs/revamp-v3/copy-rewrite.csv 的 v3_text（期望的現稿），以及執行期的 labels.importErrors。
// labels 還是 v2 文案時，執行期那一組會失敗——那是文案尚未落地，不是放寬測試的理由。

/** 檔案層級（沒有行號）：L1 是「{file}：…」。 */
const FILE_LEVEL = [
  "FILE_TOO_LARGE", "INVALID_UTF8", "DUPLICATE_COLUMN", "EMPTY_CSV", "FILE_READ_FAILED", "INVALID_FILE_EXTENSION", "FILE_SIZE_MISMATCH", "LOGICAL_FILE_MISMATCH", "INVALID_IMPORT_DRAFT",
  "UNKNOWN_MAPPING_TARGET", "MISSING_COLUMN_MAPPING", "MISSING_SOURCE_COLUMN", "DUPLICATE_SOURCE_MAPPING", "COLUMN_MAPPING_UNCONFIRMED", "UNKNOWN_COLUMN_UNCONFIRMED", "UNKNOWN_COLUMN_IGNORED",
  "SOURCE_AMOUNT_BASIS_UNSUPPORTED", "INVALID_MANIFEST_JSON", "INVALID_MANIFEST_STRUCTURE", "MISSING_COLUMN",
];
/** 缺整列（MISSING_CHANNEL_COST_DAY／MISSING_AD_DAY）：沒有原始行號與檔名，L1 是「{date} {channel}：…」。 */
const DATE_CHANNEL = ["MISSING_CHANNEL_COST_DAY", "MISSING_AD_DAY"];
/** 資料集或設定層級：沒有單一檔名，也沒有行號（檔案還沒選、稅率、期間、跨三份檔案的提議）。 */
const NO_FILE = [
  "MISSING_FILE", "AMOUNT_BASIS_UNCONFIRMED", "INVALID_TAX_RATE", "PROPOSAL_KEYS_INVALID", "INVALID_MANIFEST", "INVALID_PERIOD", "PERIOD_ORDER_INVALID", "OVERLAPPING_PERIODS", "PERIOD_OUTSIDE_COVERAGE",
  "INVALID_DATA_AS_OF", "PERIOD_AFTER_DATA_AS_OF", "UNEQUAL_PERIOD_LENGTH", "INCOMPLETE_CALENDAR_MONTH", "INVALID_COMPARISON_MODE", "SALES_COVERAGE_UNCONFIRMED", "ANALYSIS_PERIOD_TOO_LARGE", "ANALYSIS_CHANNEL_LIMIT",
];
/** 其餘都是逐行問題：L1 是「{file} 第 {line} 行：…」。 */
const LINE_LEVEL = ALL_IMPORT_ISSUE_REASON_CODES.filter(code => ![...FILE_LEVEL, ...DATE_CHANNEL, ...NO_FILE].includes(code));

const L1_LINE = /^\{file\} 第 \{line\} 行：[^。]+$/;
const L1_FILE = /^\{file\}：[^。]+$/;
const L1_DATE_CHANNEL = /^\{date\} \{channel\}：[^。]+$/;
const L1_NO_FILE = /^[^。]+$/;
const l1Pattern = (code: string) => FILE_LEVEL.includes(code) ? L1_FILE : DATE_CHANNEL.includes(code) ? L1_DATE_CHANNEL : NO_FILE.includes(code) ? L1_NO_FILE : L1_LINE;

/** 每句字數：與 copy-style 的口徑一致，只數 CJK 字，不計數字、英文、標點與占位符。 */
const cjkLength = (sentence: string) => (sentence.replace(/\{\w+\}/g, "").match(/[㐀-䶿一-鿿]/g) ?? []).length;
const sentencesOf = (text: string) => text.split("。").map(part => part.trim()).filter(Boolean);

function csvTemplates(): Map<string, IssueTemplate> {
  const parsed = parseCsv(readFileSync(join(process.cwd(), "docs/revamp-v3/copy-rewrite.csv")));
  const key = parsed.headers.indexOf("key_path"), text = parsed.headers.indexOf("v3_text");
  const templates = new Map<string, IssueTemplate>();
  for (const row of parsed.rows) {
    const path = row.values[key];
    if (path.startsWith("importErrors.")) templates.set(path.slice("importErrors.".length), splitIssueTemplate(row.values[text]));
  }
  return templates;
}
function runtimeTemplates(): Map<string, IssueTemplate> {
  return new Map(ALL_IMPORT_ISSUE_REASON_CODES.flatMap(code => { const template = issueTemplate(code); return template ? [[code, template] as const] : []; }));
}

describe("原因碼分類（文件化的例外）", () => {
  it("四類剛好涵蓋全部原因碼，彼此不重疊", () => {
    const all = [...FILE_LEVEL, ...DATE_CHANNEL, ...NO_FILE, ...LINE_LEVEL];
    expect(new Set(all).size).toBe(all.length);
    expect([...all].sort()).toEqual([...ALL_IMPORT_ISSUE_REASON_CODES].sort());
    expect(DATE_CHANNEL).toEqual(["MISSING_CHANNEL_COST_DAY", "MISSING_AD_DAY"]);
  });
  it("占位符清單就是 application 帶得出值的那幾個", () => {
    expect(Object.keys(SUPPORTED_ISSUE_PLACEHOLDERS).sort()).toEqual(["channel", "column", "date", "field", "file", "line", "value"]);
  });
});

describe.each([
  ["copy-rewrite.csv 的 v3_text", csvTemplates],
  ["執行期的 labels.importErrors", runtimeTemplates],
])("importErrors 句型（%s）", (_source, load) => {
  const templates = load();

  it("每個原因碼都有樣板，沒有多出來的原因碼", () => {
    expect(ALL_IMPORT_ISSUE_REASON_CODES.filter(code => !templates.has(code))).toEqual([]);
    expect([...templates.keys()].filter(code => !ALL_IMPORT_ISSUE_REASON_CODES.includes(code))).toEqual([]);
  });

  it.each(ALL_IMPORT_ISSUE_REASON_CODES)("%s：L1 句型、L2 句號與句長、占位符", code => {
    const template = templates.get(code);
    expect(template, `${code} 沒有樣板`).toBeDefined();
    const { headline, explain, full } = template!;
    expect(headline, `${code} L1`).toMatch(l1Pattern(code));
    if (NO_FILE.includes(code)) expect(templatePlaceholders(headline), `${code} 沒有檔名與行號可帶`).not.toEqual(expect.arrayContaining(["file"]));
    if (explain) {
      expect(explain, `${code} L2 要以「。」結尾`).toMatch(/。$/);
      for (const sentence of sentencesOf(explain)) expect(cjkLength(sentence), `${code} L2「${sentence}」超過 30 字`).toBeLessThanOrEqual(30);
    }
    // 原因碼只放 L3：主層文字不得出現原因碼本身。
    expect(full).not.toContain(code);
    const placeholders = templatePlaceholders(full);
    expect(placeholders.filter(key => !Object.hasOwn(SUPPORTED_ISSUE_PLACEHOLDERS, key)), `${code} 用了 application 帶不出的占位符`).toEqual([]);
    // {line}／{value} 需要原始行號：只有逐行問題可以用。
    if (!LINE_LEVEL.includes(code)) expect(placeholders.filter(key => key === "line" || key === "value"), `${code} 沒有行號`).toEqual([]);
  });
});

// —— application 接線：{file}{line} 取自 SourceRef，{value} 取自已讀入的原始 CSV 列，{column} 取自欄位對照 ——

const names: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
const encoder = new TextEncoder();
const payload = (name: string, text: string) => { const bytes = encoder.encode(text); return { name, bytes, size: bytes.byteLength }; };
const fixture = (name: string) => readFileSync(join(process.cwd(), "fixtures", "golden", name), "utf8");
const manifest = () => JSON.parse(readFileSync(join(process.cwd(), "fixtures", "golden", "manifest.json"), "utf8")) as Record<string, unknown>;

/** 銷售檔：日期欄改名「訂單日期」、通路欄改名「銷售通路」；第 3 行日期寫成 2026/8/1，第 4 行通路空白。 */
function brokenImport() {
  const lines = fixture("sales_daily.csv").split("\n");
  lines[0] = lines[0].replace("date", "訂單日期").replace("channel", "銷售通路");
  lines[2] = lines[2].replace("2026-08-01", "2026/8/1");
  lines[3] = lines[3].replace(",MARKETPLACE,", ",,");
  const sales = inspectImportFile("sales_daily.csv", payload("營運銷售.csv", lines.join("\n")));
  const drafts: Partial<Record<FileName, ImportFileDraft>> = {
    "sales_daily.csv": { ...sales, mapping: { ...sales.mapping, date: "訂單日期", channel: "銷售通路" }, mappingConfirmed: true },
  };
  for (const name of names.slice(1)) drafts[name] = inspectImportFile(name, payload(name, fixture(name)));
  const prepared = prepareImport(manifest(), drafts, { amountBasisConfirmed: true });
  return { drafts, prepared };
}
const CSV_TEXT = csvTemplates();

describe("占位符由 application 帶入（不改 domain）", () => {
  const { drafts, prepared } = brokenImport();
  const context = issueContextFromDrafts(drafts);
  const find = (code: string) => prepared.validation.issues.find(issue => issue.reason_code === code)!;

  it("INVALID_DATE：{file}{line} 取自 SourceRef、{value} 取自原始列、{column} 取自欄位對照", () => {
    const issue = find("INVALID_DATE");
    expect(issue).toMatchObject({ file: "sales_daily.csv", line: 3, field: "date" });
    expect(issuePlaceholderValues(issue, context)).toMatchObject({ file: "sales_daily.csv", line: "3", value: "2026/8/1", column: "訂單日期" });
    expect(renderIssueTemplate(CSV_TEXT.get("INVALID_DATE")!.full, issue, context)).toBe("sales_daily.csv 第 3 行：日期格式不對。這一行的日期是「2026/8/1」，請改成 2026-08-01 這種格式，再重新選檔。");
  });

  it("MISSING_KEY：{column} 換成來源欄名；沒有對照時退回標準欄位名", () => {
    const issue = find("MISSING_KEY");
    expect(issue).toMatchObject({ file: "sales_daily.csv", line: 4, field: "channel" });
    expect(renderIssueTemplate(CSV_TEXT.get("MISSING_KEY")!.full, issue, context)).toBe("sales_daily.csv 第 4 行：缺少 銷售通路。請補上 銷售通路；這一欄用來對應通路與商品。");
    expect(issuePlaceholderValues(issue).column).toBe("channel");
  });

  it("沒有原始列時，日期欄的 {value} 退回 SourceRef.date；拿不到的占位符顯示「—」，不印空白", () => {
    const issue = find("INVALID_DATE");
    expect(issuePlaceholderValues(issue).value).toBe("2026/8/1");
    const coverage: ValidationIssue = { file: "channel_costs_daily.csv", line: null, field: "$coverage", severity: "partial", reason_code: "MISSING_CHANNEL_COST_DAY", message: "domain" };
    expect(renderIssueTemplate(CSV_TEXT.get("MISSING_CHANNEL_COST_DAY")!.headline, coverage)).toBe("— —：沒有費用列");
  });

  it("畫面與匯出只用 labels 樣板：每一筆問題的主層文字都不含 domain 的 message", () => {
    const issues = prepared.validation.issues;
    expect(issues.length).toBeGreaterThan(0);
    for (const issue of issues) {
      const parts = issueMessageParts(issue, context);
      expect(parts.mapped, issue.reason_code).toBe(true);
      expect(importIssueMessage(issue, context)).toBe(renderIssueTemplate(issueTemplate(issue.reason_code)!.full, issue, context));
      expect(importIssueMessage(issue, context), issue.reason_code).not.toContain(issue.message);
      expect(plainIssueMessage(issue, context)).toBe(importIssueMessage(issue, context));
    }
  });

  it("labels 沒有的原因碼顯示帶標籤的原因碼，不退回 domain 訊息", () => {
    const unknown: ValidationIssue = { file: "sales_daily.csv", line: 2, field: "x", severity: "blocking", reason_code: "NOT_A_REAL_CODE", message: "domain 中文訊息" };
    const parts = issueMessageParts(unknown);
    expect(parts.mapped).toBe(false);
    expect(parts.message).toContain("NOT_A_REAL_CODE");
    expect(parts.message).not.toContain(unknown.message);
  });
});
