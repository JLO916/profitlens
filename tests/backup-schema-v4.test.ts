import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import type { FileName } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { saveScenario } from "@/application/decision";
import { inspectImportFile } from "@/application/import";
import { initialWizardState, runCheck, wizardReducer } from "@/application/import-wizard";
import { acknowledgeScenarioAssumptions, emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext } from "@/application/scenario-workspace";
import { addActionDraft, editActionManagement, emptyActionWorkspace, pinAction } from "@/application/action-workspace";
import { createReviewSession, rebuildReviewSnapshot, selectReviewScenario, syncReviewPins } from "@/application/review-session";
import { finalizeMeeting } from "@/application/meeting";
import { parseTargets } from "@/application/targets";
import { parseEvents } from "@/application/events";
import { exportWorkspaceBackup, restoreWorkspaceBackup, WORKSPACE_VERSION } from "@/application/workspace-backup";

/*
 * V3-0（PRD §6.3 #59／#60、§11.8）：備份 v4 的欄位清單 verification/revamp-v3/backup-schema-v4.json 必須與 exportWorkspaceBackup 實際寫出的欄位一致。
 * 用一份「所有選填欄位都有值」的工作區（含稅換算、目標、檔期、試算敏感度、待辦狀態日、會議稿、會議歷史、ui_prefs 兩欄）匯出，
 * 把 JSON 的鍵攤平成路徑（陣列寫成 []，以雜湊或行號為鍵的紀錄寫成 {*}，manifest／欄位對照等開放紀錄不再往下展開），與清單的 key_paths 比對。
 * BACKUP_SCHEMA_DUMP=<路徑> 時把本次的路徑寫出，供更新清單時使用。
 */
const SCHEMA = resolve("verification/revamp-v3/backup-schema-v4.json");
const OPAQUE = new Set(["manifest", "files", "filenames", "mappings", "source_mappings", "raw_values", "totals", "confirmedUnknownColumns"]);
function keyPaths(value: unknown, path = "", out = new Set<string>()): Set<string> {
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

async function fullBackup() {
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
  const review = selectReviewScenario(syncReviewPins(createReviewSession(source, "epoch-1", "rev-1"), actions), scenarios, scenarioSelectionRef(scenarios.contexts[0], "p"));
  const meeting = finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios, actions, date: "2026-10-03", now: "2026-10-03T06:00:00.000Z" });
  const period = source.snapshot.report.current.period;
  const bytes = (text: string) => new TextEncoder().encode(text);
  const targets = parseTargets({ name: "targets.csv", bytes: bytes(`period_start,period_end,channel,metric,target\n${period.start},${period.end},ALL,net_revenue,1000.00\n`) }, dataset.manifest.channels).set;
  const events = parseEvents({ name: "events.csv", bytes: bytes(`start,end,label\n${period.start},${period.end},週年慶\n`) }).set;
  const text = await exportWorkspaceBackup({
    input, filters: source.snapshot.report.scope, id: "imported", revision: 1, filenames: source.filenames, mappings: source.mappings,
    decision: scenarioContextDecision(scenarios.contexts[0]), action_workspace: actions, scenario_workspace: scenarios, review_session: review,
    preprocessing: { conversion: prepared.conversion!, raw_values: prepared.raw_values }, targets, events, meeting_history: [meeting], ui_prefs: { last_preset: "last28", view: "list" },
  });
  return text;
}

describe("V3-0 備份 v4 欄位清單（backup-schema-v4.json）", () => {
  it("清單的 key_paths 與實際匯出的欄位完全一致", async () => {
    const text = await fullBackup();
    const paths = [...keyPaths(JSON.parse(text))].sort();
    const dump = process.env.BACKUP_SCHEMA_DUMP;
    if (dump) writeFileSync(dump, JSON.stringify(paths, null, 2));
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
    expect(schema.schema_version).toBe(WORKSPACE_VERSION);
    expect(paths).toEqual([...schema.key_paths].sort());
    const top = paths.filter(path => !path.includes("."));
    expect(top).toEqual([...schema.top_level_keys].sort());
    expect(paths.filter(path => /^payload\.[^.[]+$/.test(path)).map(path => path.slice("payload.".length)).sort()).toEqual([...schema.payload_keys].sort());
  }, 60_000);

  it("ui_prefs 只有 view 與 last_preset 兩欄，還原後原樣讀回；試算敏感度與待辦狀態日也讀回", async () => {
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
    expect(Object.keys(schema.ui_prefs.fields).sort()).toEqual(["last_preset", "view"]);
    const restored = await restoreWorkspaceBackup(await fullBackup());
    expect(restored.ui_prefs).toEqual({ last_preset: "last28", view: "list" });
    expect(restored.scenario_workspace.contexts[0].plans[0].sensitivity).toEqual({ volumes: ["5", "10", "20"] });
    expect(restored.scenario_workspace.assumptions_acknowledged_at).toBe("2026-10-02T06:00:00.000Z");
    expect(schema.scenario_assumptions_acknowledged.path).toBe("payload.scenario_workspace.assumptions_acknowledged_at");
    expect(restored.action_workspace.items[0].status_updated_at).toBe("2026-10-01");
    expect(restored.meeting_history).toHaveLength(1);
  }, 60_000);
});
