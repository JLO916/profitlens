import { AnalysisChannelLimitError, AnalysisPeriodLimitError, assertSupportedAnalysisChannels, assertSupportedAnalysisPeriods } from "./limits";
import { validateDataset } from "@/domain/validation";
import { COST_FIELDS, SALES_FIELDS } from "@/domain/types";
import type { DatasetInput, FileName, ValidationIssue, ValidationResult } from "@/domain/types";
import { CsvParseError, MAX_CSV_BYTES, parseCsv } from "@/lib/csv";
import type { ParsedCsv } from "@/lib/csv";
import { fill, labels } from "@/i18n";
import { metricDefinitions } from "./presentation";
import { convertInclusiveRows, isValidTaxRate, type RawValues, type RawValuesByFile, type TaxConversion } from "./tax-basis";

const copy = labels.ui.import;

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
  /** R3 含稅換算摘要；未稅匯入為 null。 */
  conversion: TaxConversion | null;
  /** 換算前的含稅原值（檔案 → 原始行號 → 標準欄位），供來源抽屜顯示「原值 → 換算值」。 */
  raw_values: RawValuesByFile;
}
/** R3：含稅來源的逐列換算設定；fields 以標準欄位名指定，實際換算的是對照到的來源欄。 */
export interface InclusiveConversionOptions { rate: string; fields: Partial<Record<FileName, readonly string[]>> }
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
  if (!payload.name.toLowerCase().endsWith(`.${extension}`)) issues.push(issue(file, "INVALID_FILE_EXTENSION", fill(copy.invalidFileExtension, { extension })));
  if (payload.size > MAX_CSV_BYTES || payload.bytes.byteLength > MAX_CSV_BYTES) {
    issues.push(issue(file, "FILE_TOO_LARGE", copy.fileTooLarge));
  } else if (!Number.isSafeInteger(payload.size) || payload.size < 0 || payload.size !== payload.bytes.byteLength) {
    issues.push(issue(file, "FILE_SIZE_MISMATCH", copy.fileSizeMismatch));
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
  catch { issues.push(issue("manifest.json", "INVALID_UTF8", copy.manifestInvalidUtf8)); return result; }
  let manifest: unknown;
  try { manifest = JSON.parse(text); }
  catch { issues.push(issue("manifest.json", "INVALID_MANIFEST_JSON", copy.manifestNotParsable)); return result; }
  if (!isRecord(manifest)) {
    issues.push(issue("manifest.json", "INVALID_MANIFEST_STRUCTURE", copy.manifestNotObject, "$manifest"));
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
  options: { amountBasisConfirmed: boolean; sourceAmountBasis?: SourceAmountBasis; conversion?: InclusiveConversionOptions },
): PreparedImport {
  const issues: ValidationIssue[] = [];
  const originalNames: PreparedImport["originalNames"] = {};
  const columnMappings: PreparedImport["columnMappings"] = {};
  const unknownColumns: ValidationResult["unknownColumns"] = {};
  const files: DatasetInput["files"] = {};
  const raw_values: RawValuesByFile = {};
  // 含稅來源只有在帶了換算設定時才接受；換算在應用層逐列完成，domain 收到的已是未稅字串。
  const conversion = options.sourceAmountBasis === "including_tax" && options.conversion ? options.conversion : null;
  let rows_converted = 0;
  const convertedFields: string[] = [];
  const conversionTotals: NonNullable<TaxConversion["totals"]> = {};
  const blocked = (): PreparedImport => ({ input: null, originalNames, columnMappings, conversion: null, raw_values: {}, validation: { classification: "blocking", dataset: null, issues, unknownColumns } });
  // Local-file entry is user-provided, even when a synthetic manifest was used for prefill.
  // Currency, timezone, amount basis, dates and all monetary values remain unchanged.
  const localManifest = isRecord(manifest) ? { ...manifest, source_type: "user_provided" } : manifest;
  if (isRecord(localManifest) && Array.isArray(localManifest.channels)) {
    try { assertSupportedAnalysisChannels(localManifest.channels); }
    catch (error) {
      if (!(error instanceof AnalysisChannelLimitError)) throw error;
      issues.push(issue("manifest.json", error.reason_code, error.message, "channels"));
      return blocked();
    }
  }
  if (!options.amountBasisConfirmed) issues.push(issue("manifest.json", "AMOUNT_BASIS_UNCONFIRMED", copy.amountBasisUnconfirmed, "amount_basis"));

  if (options.sourceAmountBasis && options.sourceAmountBasis !== "standard" && !conversion) issues.push(issue("manifest.json", "SOURCE_AMOUNT_BASIS_UNSUPPORTED", fill(copy.sourceAmountBasisUnsupported, { grossSales: metricDefinitions.gross_sales.shortLabel }), "amount_basis"));
  if (conversion && !isValidTaxRate(conversion.rate)) { issues.push(issue("manifest.json", "INVALID_TAX_RATE", copy.invalidTaxRate, "amount_basis")); return blocked(); }

  for (const file of fileNames) {
    const draft = drafts[file];
    if (!draft) { issues.push(issue(file, "MISSING_FILE", copy.missingFile)); continue; }
    originalNames[file] = draft.name;
    issues.push(...draft.issues);
    if (draft.file !== file) { issues.push(issue(file, "LOGICAL_FILE_MISMATCH", copy.logicalFileMismatch)); continue; }
    if (!draft.parsed) {
      if (!draft.issues.some(item => item.severity === "blocking")) issues.push(issue(file, "INVALID_IMPORT_DRAFT", copy.invalidImportDraft));
      continue;
    }
    const parsed = draft.parsed;
    const standardFields = importColumns[file];
    const fileMappingIssues: ValidationIssue[] = [];
    const mappingIssue = (reason: string, message: string, field: string) => fileMappingIssues.push(issue(file, reason, message, field, parsed.headerLine));
    for (const target of Object.keys(draft.mapping)) {
      if (!standardFields.includes(target)) mappingIssue("UNKNOWN_MAPPING_TARGET", copy.unknownMappingTarget, target);
    }
    const used = new Set<string>();
    let renamed = false;
    for (const field of standardFields) {
      const source = draft.mapping[field];
      if (!source) { mappingIssue("MISSING_COLUMN_MAPPING", copy.missingColumnMapping, field); continue; }
      if (!parsed.headers.includes(source)) { mappingIssue("MISSING_SOURCE_COLUMN", copy.missingSourceColumn, field); continue; }
      if (used.has(source)) mappingIssue("DUPLICATE_SOURCE_MAPPING", copy.duplicateSourceMapping, field);
      used.add(source);
      if (field !== source) renamed = true;
    }
    if (renamed && !draft.mappingConfirmed) mappingIssue("COLUMN_MAPPING_UNCONFIRMED", copy.columnMappingUnconfirmed, "$mapping");
    const ignored = parsed.headers.filter(header => !used.has(header));
    if (ignored.length > 0) {
      unknownColumns[file] = ignored;
      for (const field of ignored) {
        if (!draft.ignoredColumnsConfirmed) mappingIssue("UNKNOWN_COLUMN_UNCONFIRMED", fill(copy.unknownColumnUnconfirmed, { ignoreConfirm: labels.importWizard.ignoreConfirm }), field);
        else issues.push({ ...issue(file, "UNKNOWN_COLUMN_IGNORED", copy.unknownColumnIgnored, field, parsed.headerLine), severity: "warning" });
      }
    }
    issues.push(...fileMappingIssues);
    if (fileMappingIssues.length === 0 && !draft.issues.some(item => item.severity === "blocking")) {
      let source: ParsedCsv = parsed;
      const fields = conversion ? (conversion.fields[file] ?? []).filter(field => standardFields.includes(field) && draft.mapping[field]) : [];
      if (conversion && fields.length > 0) {
        // 逐列換算對照到的來源欄；raw 以標準欄位名記錄，行號維持原始 CSV 行號。
        const converted = convertInclusiveRows(parsed, fields.map(field => draft.mapping[field]), conversion.rate);
        source = { ...parsed, rows: converted.rows };
        const fieldOfColumn = Object.fromEntries(fields.map(field => [draft.mapping[field], field]));
        const raw: RawValues = {};
        for (const [line, cells] of Object.entries(converted.raw)) raw[Number(line)] = Object.fromEntries(Object.entries(cells).map(([column, value]) => [fieldOfColumn[column], value]));
        raw_values[file] = raw;
        rows_converted += converted.rows_converted;
        for (const field of fields) {
          const index = parsed.headers.indexOf(draft.mapping[field]);
          conversionTotals[field] = sumColumn(parsed.rows, converted.rows, index);
          convertedFields.push(field);
        }
      }
      files[file] = mappedCsv(source, standardFields, draft.mapping);
      columnMappings[file] = Object.fromEntries(standardFields.map(field => [field, draft.mapping[field]]));
    }
  }
  const input: DatasetInput = { manifest: localManifest, files };
  const conversionSummary: TaxConversion | null = conversion ? { basis: "inclusive", rate: conversion.rate, fields: convertedFields, rows_converted, totals: conversionTotals } : null;
  if (issues.some(item => item.severity === "blocking")) {
    const manifestIssues = validateDataset({ manifest: localManifest, files: {} }).issues.filter(item => item.file === "manifest.json");
    return { input: null, originalNames, columnMappings, conversion: conversionSummary, raw_values, validation: { classification: "blocking", dataset: null, issues: [...issues, ...manifestIssues], unknownColumns } };
  }
  const validation = validateDataset(input);
  if (validation.dataset) {
    try { assertSupportedAnalysisPeriods(validation.dataset.manifest.previous_period, validation.dataset.manifest.current_period); }
    catch (error) {
      if (!(error instanceof AnalysisPeriodLimitError)) throw error;
      const limitIssue = issue("manifest.json", error.reason_code, error.message, "periods");
      return { input: null, originalNames, columnMappings, conversion: conversionSummary, raw_values, validation: { ...validation, classification: "blocking", dataset: null, issues: [...issues, ...validation.issues, limitIssue], unknownColumns: { ...validation.unknownColumns, ...unknownColumns } } };
    }
  }
  const combinedIssues = [...issues, ...validation.issues];
  const dataset = validation.dataset ? { ...validation.dataset, issues: combinedIssues } : null;
  return {
    input: validation.classification === "blocking" ? null : input,
    originalNames, columnMappings, conversion: conversionSummary, raw_values,
    validation: { ...validation, dataset, issues: combinedIssues, unknownColumns: { ...validation.unknownColumns, ...unknownColumns } },
  };
}

/** 換算前後的欄位合計（只加合法金額字串，空白與非數字略過），供前處理摘要對帳。 */
function sumColumn(before: ParsedCsv["rows"], after: ParsedCsv["rows"], index: number): { raw: string; converted: string } {
  const pattern = /^-?\d+(?:\.\d{1,2})?$/;
  let raw = 0n, converted = 0n;
  const cents = (value: string) => { const [whole, fraction = ""] = value.replace("-", "").split("."); const total = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")); return value.startsWith("-") ? -total : total; };
  const format = (value: bigint) => { const abs = value < 0n ? -value : value; return `${value < 0n ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`; };
  for (let row = 0; row < before.length; row++) {
    const original = before[row].values[index] ?? "";
    if (!pattern.test(original)) continue;
    raw += cents(original);
    converted += cents(after[row].values[index]);
  }
  return { raw: format(raw), converted: format(converted) };
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
