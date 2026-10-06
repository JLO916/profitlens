// V3-2b：CSV／JSON 匯出是機器可讀的 L3，數值欄不因呈現層的格式化（萬、U+2212、千分位）改變。
// 這裡把匯出內容投影成「識別鍵 → 數值」，標題列與說明文字（V3-2a 起可能改名）不納入比較。
import { csvHeaderKey } from "@/application/copy";
import { blankScenarioInputs, createDecisionSession, saveScenario } from "@/application/decision";
import { exportDecisionCsv, exportDecisionJson } from "@/application/decision-export";
import { exportProductsCsv, exportSnapshotCsv } from "@/application/export";
import { buildManagerSummary, exportChannelComparisonCsv } from "@/application/manager-summary";
import { createSnapshot, hashInput } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import { parseCsv } from "@/lib/csv";
import { fixture } from "./fixtures";

const NUMERIC = /^-?\d+(?:\.\d+)?$/;
function rows(csv: string): Record<string, string>[] {
  const result = parseCsv(csv);
  return result.rows.map(row => Object.fromEntries(result.headers.map((header, index) => [csvHeaderKey(header), row.values[index]])));
}
/** 每列以 keyColumns 組成識別鍵，只留數值欄（或空值）；同鍵重複時加序號。 */
function project(csv: string, keyColumns: readonly string[], valueColumns: readonly string[], numericOnly = false): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const row of rows(csv)) {
    // numericOnly：value 欄是文字（假設、公式、限制等說明）的列不納入，那些是 labels 文案。
    if (numericOnly && row.value !== "" && !NUMERIC.test(row.value)) continue;
    const base = keyColumns.map(column => row[column] ?? "").join("|");
    let key = base;
    for (let n = 2; key in out; n++) key = `${base}#${n}`;
    out[key] = Object.fromEntries(valueColumns.map(column => [column, row[column] ?? ""]));
  }
  return out;
}
/** JSON：收集所有數值葉節點（數字或十進位字串）的路徑。 */
function numericLeaves(value: unknown, path = "$", out: Record<string, string> = {}): Record<string, string> {
  if (typeof value === "number") out[path] = String(value);
  else if (typeof value === "string") { if (NUMERIC.test(value)) out[path] = value; }
  else if (Array.isArray(value)) value.forEach((item, index) => numericLeaves(item, `${path}[${index}]`, out));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) numericLeaves(item, `${path}.${key}`, out);
  return out;
}

/** 試算 golden：DTC、履約單位成本 −10% → 284.00（一次性成本 20 → 264.00）。 */
export const SCENARIO_GOLDEN = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };

/** golden 資料的五種機器可讀匯出（分析 CSV、商品 CSV、通路寬表 CSV、決策 CSV、決策 JSON）的數值投影。 */
export async function goldenExportNumerics() {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  const hash = await hashInput(input);
  const snapshot = await createSnapshot(dataset, {}, hash);
  const dtc = await createSnapshot(dataset, { channels: ["DTC"] }, hash);
  const session = createDecisionSession(dataset, dtc, 1);
  const plans = [
    ...saveScenario(session, [], { id: "p", name: "p", inputs: SCENARIO_GOLDEN, sensitivity: { volumes: ["-10", "0", "10"] } }),
    ...saveScenario(session, [], { id: "q", name: "q", inputs: { ...SCENARIO_GOLDEN, one_time_cost: "20" } }),
    { id: "d", name: "d", inputs: blankScenarioInputs(), result: null },
  ];
  const json = JSON.parse(exportDecisionJson(session, plans, []));
  return {
    snapshot_csv: project(exportSnapshotCsv(dataset, snapshot), ["row_type", "period", "channel", "metric", "period_start", "period_end"], ["unit", "value", "reason_codes", "previous_days", "current_days", "bridge_reconciled"]),
    products_csv: project(exportProductsCsv(dataset, snapshot, snapshot.products.rows, {}), ["channel", "sku", "metric"], ["unit", "value", "reason_codes"]),
    channel_csv: project(exportChannelComparisonCsv(buildManagerSummary(snapshot)), ["channel"], ["previous_net_revenue", "current_net_revenue", "net_revenue_change", "previous_contribution_after_marketing", "current_contribution_after_marketing", "contribution_after_marketing_change", "previous_days", "current_days"]),
    decision_csv: project(exportDecisionCsv(session, plans, []), ["row_type", "item_id", "field"], ["value", "reason_codes", "plan_revision"], true),
    decision_json: numericLeaves({ session: { baseline: json.session.baseline, facts: json.session.facts, comparison: json.session.comparison }, scenarios: json.scenarios }),
  };
}
