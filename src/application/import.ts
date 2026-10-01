import { AnalysisChannelLimitError, AnalysisPeriodLimitError, assertSupportedAnalysisChannels, assertSupportedAnalysisPeriods } from "./limits";
import { validateDataset } from "@/domain/validation";
import { COST_FIELDS, SALES_FIELDS } from "@/domain/types";
import type { DatasetInput, FileName, ValidationIssue, ValidationResult } from "@/domain/types";
import { CsvParseError, MAX_CSV_BYTES, parseCsv } from "@/lib/csv";
import type { ParsedCsv } from "@/lib/csv";

export type SourceAmountBasis = "standard" | "including_tax" | "net_after_deductions" | "unknown";
export interface LocalFilePayload { name: string; size: number; bytes: Uint8Array }
export interface ImportFileDraft {
  file: FileName;
  name: string;
  size: number;
  parsed: ParsedCsv | null;
  preview: ParsedCsv["rows"];
  mapping: Record<string, string>;
  mappingConfirmed: boolean;
  ignoredColumnsConfirmed: boolean;
  issues: ValidationIssue[];
}
export interface PreparedImport {
  input: DatasetInput | null;
  validation: ValidationResult;
  originalNames: Partial<Record<FileName, string>>;
  columnMappings: Partial<Record<FileName, Record<string, string>>>;
}
export interface ManifestInspection {
  manifest: Record<string, unknown> | null;
  issues: ValidationIssue[];
  amountBasisConfirmed: false;
  name: string;
}
export const importColumns: Record<FileName, readonly string[]> = {
  "sales_daily.csv": ["date", "channel", "sku", "category", "units_sold", ...SALES_FIELDS, "currency"],
  "channel_costs_daily.csv": ["date", "channel", ...COST_FIELDS, "currency"],
  "ad_spend_daily.csv": ["date", "channel", "ad_spend", "currency"],
};
const fileNames = Object.keys(importColumns) as FileName[];

function issue(file: FileName | "manifest.json", reason_code: string, message: string, field = "$file", line: number | null = null): ValidationIssue {
  return { file, reason_code, message, field, line, severity: "blocking" };
}
function fileIssues(file: FileName | "manifest.json", payload: LocalFilePayload, extension: "csv" | "json"): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (!payload.name.toLowerCase().endsWith(`.${extension}`)) issues.push(issue(file, "INVALID_FILE_EXTENSION", `請選擇副檔名為 .${extension} 的檔案。`));
  if (payload.size > MAX_CSV_BYTES || payload.bytes.byteLength > MAX_CSV_BYTES) {
    issues.push(issue(file, "FILE_TOO_LARGE", "每個匯入檔案最多 5 MiB，請先縮小檔案；不會截斷資料。"));
  } else if (!Number.isSafeInteger(payload.size) || payload.size < 0 || payload.size !== payload.bytes.byteLength) {
    issues.push(issue(file, "FILE_SIZE_MISMATCH", "檔案大小與完整讀取的內容不一致，請重新選取檔案。"));
  }
  return issues;
}

/** Pure inspection of already-read browser bytes. No fetch, filesystem, persistence or financial coercion. */
export function inspectImportFile(file: FileName, payload: LocalFilePayload): ImportFileDraft {
  const issues = fileIssues(file, payload, "csv");
  let parsed: ParsedCsv | null = null;
  if (issues.length === 0) {
    try { parsed = parseCsv(payload.bytes); }
    catch (error) {
      if (!(error instanceof CsvParseError)) throw error;
      issues.push(issue(file, error.reason_code, error.message, error.field, error.line));
    }
  }
  return {
    file, name: payload.name, size: payload.size, parsed,
    preview: parsed?.rows.slice(0, 10) ?? [],
    mapping: Object.fromEntries(importColumns[file].map(field => [field, parsed?.headers.includes(field) ? field : ""])),
    mappingConfirmed: false, ignoredColumnsConfirmed: false, issues,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Optional form prefill. Even a valid manifest cannot authorize amount-basis confirmation. */
export function inspectManifestFile(payload: LocalFilePayload): ManifestInspection {
  const issues = fileIssues("manifest.json", payload, "json");
  const result: ManifestInspection = { manifest: null, issues, amountBasisConfirmed: false, name: payload.name };
  if (issues.length > 0) return result;
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(payload.bytes); }
  catch { issues.push(issue("manifest.json", "INVALID_UTF8", "JSON 必須使用有效的 UTF-8 編碼。")); return result; }
  let manifest: unknown;
  try { manifest = JSON.parse(text); }
  catch { issues.push(issue("manifest.json", "INVALID_MANIFEST_JSON", "JSON 語法無法解析，請確認檔案內容。")); return result; }
  if (!isRecord(manifest)) {
    issues.push(issue("manifest.json", "INVALID_MANIFEST_STRUCTURE", "資料集設定必須是 JSON 物件。", "$manifest"));
    return result;
  }
  // Reuse the exact M1 contract. Missing CSVs are irrelevant to optional manifest prefill.
  issues.push(...validateDataset({ manifest, files: {} }).issues.filter(item => item.file === "manifest.json"));
  if (!issues.some(item => item.severity === "blocking")) result.manifest = manifest;
  return result;
}

/** The caller may commit only a non-blocking result, keeping any earlier successful dataset intact. */
export function prepareImport(
  manifest: unknown,
  drafts: Partial<Record<FileName, ImportFileDraft>>,
  options: { amountBasisConfirmed: boolean; sourceAmountBasis?: SourceAmountBasis },
): PreparedImport {
  const issues: ValidationIssue[] = [];
  const originalNames: PreparedImport["originalNames"] = {};
  const columnMappings: PreparedImport["columnMappings"] = {};
  const unknownColumns: ValidationResult["unknownColumns"] = {};
  const files: DatasetInput["files"] = {};
  // Local-file entry is user-provided, even when a synthetic manifest was used for prefill.
  // Currency, timezone, amount basis, dates and all monetary values remain unchanged.
  const localManifest = isRecord(manifest) ? { ...manifest, source_type: "user_provided" } : manifest;
  if (isRecord(localManifest) && Array.isArray(localManifest.channels)) {
    try { assertSupportedAnalysisChannels(localManifest.channels); }
    catch (error) {
      if (!(error instanceof AnalysisChannelLimitError)) throw error;
      issues.push(issue("manifest.json", error.reason_code, error.message, "channels"));
      return { input: null, originalNames, columnMappings, validation: { classification: "blocking", dataset: null, issues, unknownColumns } };
    }
  }
  if (!options.amountBasisConfirmed) issues.push(issue("manifest.json", "AMOUNT_BASIS_UNCONFIRMED", "請在本次匯入明確確認未稅商品收入與費用口徑，JSON 設定不能代替此確認。", "amount_basis"));

  if (options.sourceAmountBasis && options.sourceAmountBasis !== "standard") issues.push(issue("manifest.json", "SOURCE_AMOUNT_BASIS_UNSUPPORTED", "來源為含稅、已扣折扣／退款／費用的淨額，或口徑仍未知；請先在來源端整理並對帳為標準口徑。系統不換算稅率、不反推 gross_sales，也不重複扣款。", "amount_basis"));

  for (const file of fileNames) {
    const draft = drafts[file];
    if (!draft) { issues.push(issue(file, "MISSING_FILE", "請選取此必要的 CSV 檔案。")); continue; }
    originalNames[file] = draft.name;
    issues.push(...draft.issues);
    if (draft.file !== file) { issues.push(issue(file, "LOGICAL_FILE_MISMATCH", "檔案草稿與選取的資料類型不一致，請重新選取。")); continue; }
    if (!draft.parsed) {
      if (!draft.issues.some(item => item.severity === "blocking")) issues.push(issue(file, "INVALID_IMPORT_DRAFT", "此檔案尚未成功解析，請重新選取。"));
      continue;
    }
    const parsed = draft.parsed;
    const standardFields = importColumns[file];
    const fileMappingIssues: ValidationIssue[] = [];
    const mappingIssue = (reason: string, message: string, field: string) => fileMappingIssues.push(issue(file, reason, message, field, parsed.headerLine));
    for (const target of Object.keys(draft.mapping)) {
      if (!standardFields.includes(target)) mappingIssue("UNKNOWN_MAPPING_TARGET", "對照目標必須是此資料類型的標準欄位。", target);
    }
    const used = new Set<string>();
    let renamed = false;
    for (const field of standardFields) {
      const source = draft.mapping[field];
      if (!source) { mappingIssue("MISSING_COLUMN_MAPPING", "請明確選擇此標準欄位的來源欄位。", field); continue; }
      if (!parsed.headers.includes(source)) { mappingIssue("MISSING_SOURCE_COLUMN", "選取的來源欄位不存在於此 CSV。", field); continue; }
      if (used.has(source)) mappingIssue("DUPLICATE_SOURCE_MAPPING", "同一來源欄位不能同時對照多個標準欄位。", field);
      used.add(source);
      if (field !== source) renamed = true;
    }
    if (renamed && !draft.mappingConfirmed) mappingIssue("COLUMN_MAPPING_UNCONFIRMED", "請明確確認非標準欄名的欄位對照；系統不猜測收入或成本。", "$mapping");
    const ignored = parsed.headers.filter(header => !used.has(header));
    if (ignored.length > 0) {
      unknownColumns[file] = ignored;
      for (const field of ignored) {
        if (!draft.ignoredColumnsConfirmed) mappingIssue("UNKNOWN_COLUMN_UNCONFIRMED", "請明確確認忽略未使用的來源欄位。", field);
        else issues.push({ ...issue(file, "UNKNOWN_COLUMN_IGNORED", "已明確確認忽略此欄位；其內容不會進入提交的資料集。", field, parsed.headerLine), severity: "warning" });
      }
    }
    issues.push(...fileMappingIssues);
    if (fileMappingIssues.length === 0 && !draft.issues.some(item => item.severity === "blocking")) {
      files[file] = mappedCsv(parsed, standardFields, draft.mapping);
      columnMappings[file] = Object.fromEntries(standardFields.map(field => [field, draft.mapping[field]]));
    }
  }
  const input: DatasetInput = { manifest: localManifest, files };
  if (issues.some(item => item.severity === "blocking")) {
    const manifestIssues = validateDataset({ manifest: localManifest, files: {} }).issues.filter(item => item.file === "manifest.json");
    return { input: null, originalNames, columnMappings, validation: { classification: "blocking", dataset: null, issues: [...issues, ...manifestIssues], unknownColumns } };
  }
  const validation = validateDataset(input);
  if (validation.dataset) {
    try { assertSupportedAnalysisPeriods(validation.dataset.manifest.previous_period, validation.dataset.manifest.current_period); }
    catch (error) {
      if (!(error instanceof AnalysisPeriodLimitError)) throw error;
      const limitIssue = issue("manifest.json", error.reason_code, error.message, "periods");
      return { input: null, originalNames, columnMappings, validation: { ...validation, classification: "blocking", dataset: null, issues: [...issues, ...validation.issues, limitIssue], unknownColumns: { ...validation.unknownColumns, ...unknownColumns } } };
    }
  }
  const combinedIssues = [...issues, ...validation.issues];
  const dataset = validation.dataset ? { ...validation.dataset, issues: combinedIssues } : null;
  return {
    input: validation.classification === "blocking" ? null : input,
    originalNames, columnMappings,
    validation: { ...validation, dataset, issues: combinedIssues, unknownColumns: { ...validation.unknownColumns, ...unknownColumns } },
  };
}

function quoteCsv(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}
function physicalNewlines(text: string): number { return text.match(/\r\n|\r|\n/g)?.length ?? 0; }

/** Preserve each original record start line after mapping or dropping multiline columns. */
function mappedCsv(parsed: ParsedCsv, fields: readonly string[], mapping: Record<string, string>): string {
  let csv = "\n".repeat(parsed.headerLine - 1) + fields.join(",") + "\n";
  let nextLine = parsed.headerLine + 1;
  const sourceIndexes = fields.map(field => parsed.headers.indexOf(mapping[field]));
  for (const row of parsed.rows) {
    csv += "\n".repeat(Math.max(0, row.line - nextLine));
    const encoded = sourceIndexes.map(index => quoteCsv(row.values[index])).join(",");
    csv += encoded + "\n";
    nextLine = row.line + physicalNewlines(encoded) + 1;
  }
  return csv;
}
