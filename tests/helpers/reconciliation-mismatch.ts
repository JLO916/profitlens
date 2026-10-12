import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Decimal from "decimal.js";
import { inspectImportFile } from "@/application/import";
import { initialWizardState, runCheck, wizardReducer, type WizardState } from "@/application/import-wizard";
import type { FileName } from "@/domain/types";

/*
 * V4-7b G22（CHART_CATALOG G22、06_BATCHES V4-7b「對帳表差額 ≠ 0 的列才有條」）：精靈步驟 4 對帳表有差額的狀態，只在記憶體裡組，不新增資料檔。
 * 實際資料（golden、示範、含稅、合成…）的對帳差額都是 0（來源合計與標準合計同一份列），所以這裡先照常檢核 fixtures/golden（未稅、valid），
 * 再把精靈手上「來源檔」的第一列改掉幾個金額：buildImportReconciliation 的來源合計讀 state.files 的原始列、標準合計讀檢核時的 candidate，
 * 兩者就差出固定的金額（差額＝標準合計 − 來源合計）。只改測試用的狀態，不動 application 與 domain。
 */

const ROLES: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];

/** 在來源檔第一列某個金額欄加上 delta（精確字串）。 */
export interface SourceOffset { role: FileName; field: string; delta: string }

/**
 * golden 改動後的三個差額（標準合計 − 來源合計）：原價收入 5,600.00 − 5,610.00＝−10.00、折扣 650.00 − 645.00＝+5.00、廣告費 750.00 − 752.50＝−2.50；其餘 6 列差額 0（相符）。
 * |差額| 最大值 10.00 是對帳表差額條的共同尺度：原價收入的條滿半寬（48）往左、折扣 24 往右、廣告費 12 往左。
 */
export const MISMATCH_OFFSETS: readonly SourceOffset[] = [
  { role: "sales_daily.csv", field: "gross_sales", delta: "10.00" },
  { role: "sales_daily.csv", field: "discounts", delta: "-5.00" },
  { role: "ad_spend_daily.csv", field: "ad_spend", delta: "2.50" },
];
export const MISMATCH_DIFFERENCES: Readonly<Record<string, string>> = { gross_sales: "-10.00", discounts: "5.00", ad_spend: "-2.50" };

/** 已檢核的步驟 4 狀態：把來源檔第一列的金額依 offsets 改掉（candidate 不變）。 */
export function withSourceOffsets(state: WizardState, offsets: readonly SourceOffset[]): WizardState {
  const mappings = state.candidate?.columnMappings ?? {};
  let files = state.files;
  for (const { role, field, delta } of offsets) {
    const file = files[role];
    const parsed = file?.draft.parsed;
    const column = mappings[role]?.[field];
    if (!file || !parsed || !column) throw new Error(`沒有 ${role} 的 ${field}`);
    const index = parsed.headers.indexOf(column);
    if (index < 0) throw new Error(`${role} 沒有欄 ${column}`);
    const rows = parsed.rows.map((row, at) => at === 0 ? { ...row, values: row.values.map((value, column) => column === index ? new Decimal(value).plus(delta).toFixed(2) : value) } : row);
    files = { ...files, [role]: { ...file, draft: { ...file.draft, parsed: { ...parsed, rows } } } };
  }
  return { ...state, files };
}

/** fixtures/golden 未稅匯入檢核後（valid）的步驟 4，來源檔改成 MISMATCH_OFFSETS：對帳表 3 列有差額、6 列相符。 */
export function reconciliationMismatchState(): WizardState {
  let state = initialWizardState();
  for (const role of ROLES) {
    const content = new Uint8Array(readFileSync(resolve("fixtures/golden", role)));
    state = wizardReducer(state, { type: "fileRead", role, draft: inspectImportFile(role, { name: role, size: content.byteLength, bytes: content }), encoding: "utf8", memory: null });
  }
  const confirmed = wizardReducer(wizardReducer(wizardReducer(state, { type: "next" }), { type: "basis", basis: "exclusive" }), { type: "confirm" });
  const checked = wizardReducer(confirmed, { type: "checked", candidate: runCheck(confirmed) });
  return withSourceOffsets(checked, MISMATCH_OFFSETS);
}
