import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { FileName } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { decisionSignature, saveScenario } from "@/application/decision";
import { inspectImportFile } from "@/application/import";
import { initialWizardState, runCheck, wizardReducer } from "@/application/import-wizard";
import { acknowledgeScenarioAssumptions, emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext } from "@/application/scenario-workspace";
import { addActionDraft, editActionManagement, emptyActionWorkspace, pinAction, setAdDecision, type AdDecision } from "@/application/action-workspace";
import { createReviewSession, rebuildReviewSnapshot, selectReviewScenario, syncReviewPins } from "@/application/review-session";
import { finalizeMeeting } from "@/application/meeting";
import { parseTargets } from "@/application/targets";
import { parseEvents } from "@/application/events";
import { exportWorkspaceBackup, WORKSPACE_V4 } from "@/application/workspace-backup";

/*
 * 備份欄位清單測試共用（V3-0 backup-schema-v4、V3-9a backup-schema-v5；PRD §6.3 #59／#60、§11.8）。
 * fullBackup：一份「所有選填欄位都有值」的工作區（含稅換算、目標、檔期、試算敏感度、記住的試算聲明、待辦狀態日、會議稿、會議歷史、ui_prefs 兩欄）
 * 匯出成目前版本（v5）；adDecision 有值時第 1 項待辦另標廣告決策（F13，v5 才有的欄位）。
 * keyPaths：把 JSON 的鍵攤平成路徑（陣列寫成 []，以雜湊或行號為鍵的紀錄寫成 {*}，manifest／欄位對照等開放紀錄不再往下展開）。
 */
const OPAQUE = new Set(["manifest", "files", "filenames", "mappings", "source_mappings", "raw_values", "totals", "confirmedUnknownColumns"]);
export function keyPaths(value: unknown, path = "", out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) { for (const item of value) keyPaths(item, `${path}[]`, out); return out; }
  if (value === null || typeof value !== "object") return out;
  for (const [key, child] of Object.entries(value)) {
    const segment = /^[a-f0-9]{64}$/.test(key) || /^\d+$/.test(key) ? "{*}" : key;
    const next = path ? `${path}.${segment}` : segment;
    out.add(next);
    if (!OPAQUE.has(key)) keyPaths(child, next, out);
  }
  return out;
}

/** 重新計算 checksum（與 workspace-backup.ts 相同規則：SHA-256(decisionSignature(信封去掉 checksum))），模擬「格式正確、校驗碼也對」的檔案。 */
export async function resign(value: Record<string, unknown>): Promise<string> {
  const { checksum: _checksum, ...body } = value;
  void _checksum;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(decisionSignature(body)));
  return JSON.stringify({ ...body, checksum: Array.from(new Uint8Array(hash), n => n.toString(16).padStart(2, "0")).join("") });
}

/** 把目前版本（v5）的備份改寫成 R4–V3-8 真正寫出的 v4 檔：拿掉 items[].ad_decision、schema_version 改 v4、重算 checksum。 */
export async function asV4(text: string): Promise<string> {
  const body = JSON.parse(text);
  for (const item of body.payload.action_workspace.items as Record<string, unknown>[]) delete item.ad_decision;
  body.schema_version = WORKSPACE_V4;
  return resign(body);
}

export async function fullBackup(options: { adDecision?: AdDecision } = {}): Promise<string> {
  const dir = resolve("tests/fixtures/inclusive_tax");
  let state = initialWizardState();
  for (const role of ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"] as FileName[]) {
    const bytes = new Uint8Array(readFileSync(resolve(dir, role)));
    state = wizardReducer(state, { type: "fileRead", role, draft: inspectImportFile(role, { name: role, size: bytes.byteLength, bytes }), encoding: "utf8", memory: null });
  }
  state = wizardReducer(wizardReducer(wizardReducer(state, { type: "next" }), { type: "basis", basis: "inclusive" }), { type: "confirm" });
  const prepared = runCheck(state);
  const input = prepared.input!, dataset = validateDataset(input).dataset!;
  const hash = await hashInput(input);
  const source = { input, dataset, snapshot: await createSnapshot(dataset, {}, hash), revision: 1, filenames: { "sales_daily.csv": "銷售.csv" }, mappings: prepared.columnMappings };
  const channel = dataset.manifest.channels[0];
  const single = { ...source, snapshot: await createSnapshot(dataset, { channels: [channel] }, hash) };
  let scenarios = ensureScenarioContext(emptyScenarioWorkspace("epoch-1"), single);
  const context = scenarios.contexts[0], draft = scenarioContextDecision(context);
  draft.scenarios = saveScenario(context.session, [], { id: "p", name: "履約", inputs: { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true } }).map(plan => ({ ...plan, sensitivity: { volumes: ["5", "10", "20"] as [string, string, string] } }));
  scenarios = updateScenarioContext(scenarios, context.id, draft);
  // V3-6（D-V3-12＝B）：記住「我了解這是試算」的時間（選填）。
  scenarios = acknowledgeScenarioAssumptions(scenarios, "2026-10-02T06:00:00.000Z");
  const diagnostic = source.snapshot.report.diagnostics[0];
  let actions = addActionDraft(emptyActionWorkspace(), source, "a1", diagnostic?.id);
  actions = editActionManagement(pinAction(actions, "a1", true), "a1", { execution_status: "in_progress" }, "2026-10-01");
  // V3-9a（F13）：廣告決策標籤（選填，v5 才有）。
  if (options.adDecision) actions = setAdDecision(actions, "a1", options.adDecision);
  const review = selectReviewScenario(syncReviewPins(createReviewSession(source, "epoch-1", "rev-1"), actions), scenarios, scenarioSelectionRef(scenarios.contexts[0], "p"));
  const meeting = finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios, actions, date: "2026-10-03", now: "2026-10-03T06:00:00.000Z" });
  const period = source.snapshot.report.current.period;
  const bytes = (text: string) => new TextEncoder().encode(text);
  const targets = parseTargets({ name: "targets.csv", bytes: bytes(`period_start,period_end,channel,metric,target\n${period.start},${period.end},ALL,net_revenue,1000.00\n`) }, dataset.manifest.channels).set;
  const events = parseEvents({ name: "events.csv", bytes: bytes(`start,end,label\n${period.start},${period.end},週年慶\n`) }).set;
  return exportWorkspaceBackup({
    input, filters: source.snapshot.report.scope, id: "imported", revision: 1, filenames: source.filenames, mappings: source.mappings,
    decision: scenarioContextDecision(scenarios.contexts[0]), action_workspace: actions, scenario_workspace: scenarios, review_session: review,
    preprocessing: { conversion: prepared.conversion!, raw_values: prepared.raw_values }, targets, events, meeting_history: [meeting], ui_prefs: { last_preset: "last28", view: "list" },
  });
}
