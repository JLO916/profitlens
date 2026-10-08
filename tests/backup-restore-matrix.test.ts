// V3-10 上線檢查（06_BATCHES V3-10「v1–v5 備份還原」；PRD §11.8 相容性、docs/revamp/08_RELAUNCH.md §4 第 8 條）：golden 與 demo 各建 v1–v5 五個信封＋R0 前實際的 v3 備份檔，逐一還原並 round trip。
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { createDecisionSession, emptyDecisionWorkspace, saveScenario, type DecisionWorkspaceState } from "@/application/decision";
import { addActionDraft, emptyActionWorkspace, pinAction, setAdDecision, type ActionWorkspace } from "@/application/action-workspace";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext } from "@/application/scenario-workspace";
import { createReviewSession, rebuildReviewSnapshot, selectReviewScenario, syncReviewPins } from "@/application/review-session";
import { finalizeMeeting } from "@/application/meeting";
import { parseTargets } from "@/application/targets";
import { parseEvents } from "@/application/events";
import { exportWorkspaceBackup, restoreWorkspaceBackup, WORKSPACE_V4, WORKSPACE_VERSION, type RestoredWorkspace, type WorkspaceBackupSource } from "@/application/workspace-backup";
import type { DatasetInput } from "@/domain/types";
import { asV4, resign } from "./helpers/full-backup";
import { fixture } from "./helpers/fixtures";

/*
 * 每個信封的來源（v3–v5 由目前的 exportWorkspaceBackup 寫出再降版；v1／v2 依 tests/v2-backup.test.ts 的舊格式手寫）：
 * - 目前檢視：全部通路、manifest 預設期間（golden 本期扣廣告後貢獻 255.00、差額 −315.00；demo 1,269,792.73、差額 −598,833.95）。
 * - 試算：第一個通路（DTC）一個方案「履約單位成本 −10%」（golden＝284.00，PRD §2.3 C）；待辦一張（置頂）。
 * - v5 另有：待辦的廣告決策（pause）、目標、檔期、一筆會議紀錄、ui_prefs；v4＝v5 去掉 ad_decision（helpers/full-backup.ts 的 asV4）；
 *   v3＝v4 去掉 preprocessing／targets／events／meeting_history／ui_prefs 與 R5 之後的選填欄位。
 * 還原後再匯出一次（一定寫成 v5）並再還原（round trip）。矩陣寫到 BACKUP_MATRIX_OUT（沒給就不寫）。
 */
type Version = "v1" | "v2" | "v3" | "v4" | "v5";
type DatasetName = "golden" | "demo";
const VERSIONS: readonly Version[] = ["v1", "v2", "v3", "v4", "v5"];
const SCHEMA: Record<Version, string> = { v1: "profitlens-workspace-v1", v2: "profitlens-workspace-v2", v3: "profitlens-workspace-v3", v4: WORKSPACE_V4, v5: WORKSPACE_VERSION };
/** golden（fixtures/golden/expected.json）與 demo（fixtures/demo/computed_summary.json）的扣廣告後貢獻；差額由兩期相減。 */
const EXPECTED: Record<DatasetName, { current: string; previous: string; delta: string }> = {
  golden: { current: "255.00", previous: "570.00", delta: "-315.00" },
  demo: { current: "1269792.73", previous: "1868626.68", delta: "-598833.95" },
};
/** fixtures 的 manifest.dataset_id。 */
const DATASET_ID: Record<DatasetName, string> = { golden: "golden-v1", demo: "synthetic-demo-12w-v1" };
const PLAN_INPUTS = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "-10", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
const UI_PREFS = { last_preset: "last28", view: "list" as const };
const V4_KEYS = ["preprocessing", "targets", "events", "meeting_history", "ui_prefs"] as const;

/** 兩個到分的金額字串相減（以分為單位的整數運算），回傳到分字串。 */
function minus(current: string, previous: string): string {
  const cents = (value: string) => BigInt(value.replace(".", ""));
  const diff = cents(current) - cents(previous);
  const abs = (diff < 0n ? -diff : diff).toString().padStart(3, "0");
  return `${diff < 0n ? "-" : ""}${abs.slice(0, -2)}.${abs.slice(-2)}`;
}
const amountsOf = (snapshot: WorkspaceSnapshot) => {
  const current = snapshot.report.current.metrics.contribution_after_marketing.value!;
  const previous = snapshot.report.previous.metrics.contribution_after_marketing.value!;
  return { current, previous, delta: minus(current, previous) };
};

interface Built { input: DatasetInput; all: WorkspaceSnapshot; single: WorkspaceSnapshot; channel: string; decision: DecisionWorkspaceState; v5: string; classification: string }
async function build(name: DatasetName): Promise<Built> {
  const input = fixture(name);
  const validation = validateDataset(input);
  const dataset = validation.dataset!;
  const hash = await hashInput(input);
  const all = await createSnapshot(dataset, {}, hash);
  const channel = dataset.manifest.channels[0];
  const single = await createSnapshot(dataset, { channels: [channel] }, hash);
  const source = { input, dataset, snapshot: all, revision: 1 };
  const singleSource = { ...source, snapshot: single };
  const session = createDecisionSession(dataset, single, 1);
  const decision: DecisionWorkspaceState = { ...emptyDecisionWorkspace(), captured: session, source_input: input, scenarios: saveScenario(session, [], { id: "plan", name: "履約假設", inputs: PLAN_INPUTS }) };
  let scenarios = ensureScenarioContext(emptyScenarioWorkspace("epoch-1"), singleSource);
  const context = scenarios.contexts[0], contextDecision = scenarioContextDecision(context);
  contextDecision.scenarios = saveScenario(context.session, [], { id: "plan", name: "履約假設", inputs: PLAN_INPUTS });
  scenarios = updateScenarioContext(scenarios, context.id, contextDecision);
  let actions: ActionWorkspace = pinAction(addActionDraft(emptyActionWorkspace(), source, "a1", all.report.diagnostics[0]?.id), "a1", true);
  actions = setAdDecision(actions, "a1", "pause");
  const review = selectReviewScenario(syncReviewPins(createReviewSession(source, "epoch-1", "rev-1", "2026-10-08T00:00:00.000Z"), actions), scenarios, scenarioSelectionRef(scenarios.contexts[0], "plan"));
  const meeting = finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios, actions, date: "2026-10-08", now: "2026-10-08T06:00:00.000Z" });
  const period = all.report.current.period;
  const bytes = (text: string) => new TextEncoder().encode(text);
  const targets = parseTargets({ name: "targets.csv", bytes: bytes(`period_start,period_end,channel,metric,target\n${period.start},${period.end},ALL,net_revenue,1000.00\n`) }, dataset.manifest.channels).set;
  const events = parseEvents({ name: "events.csv", bytes: bytes(`start,end,label\n${period.start},${period.end},週年慶\n`) }).set;
  const backupSource: WorkspaceBackupSource = {
    input, filters: all.report.scope, id: name, revision: 1, filenames: {}, mappings: {}, decision, action_workspace: actions, scenario_workspace: scenarios, review_session: review,
    preprocessing: null, targets, events, meeting_history: [meeting], ui_prefs: UI_PREFS,
  };
  return { input, all, single, channel, decision, v5: await exportWorkspaceBackup(backupSource), classification: validation.classification };
}

/** v3：R4 之前寫出的形狀（沒有 v4 側邊資料、沒有 R5／V3-6／V3-9a 的選填欄位），重算校驗碼。 */
async function asV3(v5: string): Promise<string> {
  const body = JSON.parse(v5);
  body.schema_version = SCHEMA.v3;
  for (const key of V4_KEYS) delete body.payload[key];
  for (const item of body.payload.action_workspace.items) { delete item.ad_decision; delete item.status_updated_at; }
  delete body.payload.scenario_workspace.assumptions_acknowledged_at;
  for (const context of body.payload.scenario_workspace.contexts) for (const plan of context.plans) delete plan.sensitivity;
  for (const plan of body.payload.decision?.scenarios ?? []) delete plan.sensitivity;
  return resign(body);
}
/** v1／v2：R0 之前的舊格式（tests/v2-backup.test.ts 的 legacy()）；目前檢視是全部通路，試算與待辦綁在第一個通路。 */
async function asLegacy(version: "v1" | "v2", built: Built, name: DatasetName): Promise<string> {
  const { input, all, single } = built;
  const card = { id: "legacy-task", problem: "原稿", fact_ids: [], action: "", owner_role: "", validation_metric: "", deadline: "", stop_condition: "", required_data: "", origin: "manual", evidence_confirmed: false };
  const oldDecision = {
    source_input: input, filters: single.report.scope, filenames: {}, dataset_hash: single.dataset_hash, filter_hash: single.filter_hash, revision: 1, stale: false, stale_reasons: [],
    scenarios: [{ id: "plan", name: "履約假設", inputs: PLAN_INPUTS, calculated: true }], actions: [card],
  };
  const dataset = validateDataset(input).dataset!;
  const contextId = addActionDraft(emptyActionWorkspace(), { input, dataset, snapshot: single, revision: 1 }, "task").contexts[0].id;
  const actionContext = { ...oldDecision, id: contextId, scenarios: [], actions: [] };
  const item = { card, context_id: contextId, pinned: true, scope: { kind: "all", channels: single.report.scope.channels } };
  return resign({
    schema_version: SCHEMA[version], metric_version: "contribution-v1", scenario_version: "scenario-v1", saved_at: "2026-10-01T00:00:00.000Z",
    payload: { active: { input, filters: all.report.scope, id: name, revision: 1, filenames: {}, mappings: {} }, decision: oldDecision, ...(version === "v2" ? { action_workspace: { contexts: [actionContext], items: [item] } } : {}) },
  });
}
async function envelope(version: Version, built: Built, name: DatasetName): Promise<string> {
  if (version === "v5") return built.v5;
  if (version === "v4") return asV4(built.v5);
  if (version === "v3") return asV3(built.v5);
  return asLegacy(version, built, name);
}

/** 矩陣一列（寫進 backup-matrix.json）。 */
interface MatrixRow {
  dataset: string; version: string; source: "generated" | "real-file"; envelope_bytes: number; restored: boolean; restored_schema_version: string | undefined; classification: string;
  contribution_after_marketing: { current: string; previous: string; delta: string }; scenario_contribution: string | null; actions: number; ad_decisions: (string | null)[];
  side_data: { preprocessing: boolean; targets: number; events: number; meeting_history: number; ui_prefs: Record<string, unknown> }; review_session: boolean;
  round_trip: { schema_version: string; restored_schema_version: string | undefined; same_amounts: boolean; envelope_bytes: number }; ms: number;
}
const matrix: MatrixRow[] = [];

async function restoreAndRoundTrip(text: string): Promise<{ restored: RestoredWorkspace; again: RestoredWorkspace; againText: string }> {
  const restored = await restoreWorkspaceBackup(text);
  const againText = await exportWorkspaceBackup({ ...restored, filters: restored.snapshot.report.scope });
  return { restored, again: await restoreWorkspaceBackup(againText), againText };
}
function record(dataset: string, version: string, source: MatrixRow["source"], text: string, restored: RestoredWorkspace, again: RestoredWorkspace, againText: string, started: number) {
  const amounts = amountsOf(restored.snapshot);
  matrix.push({
    dataset, version, source, envelope_bytes: new TextEncoder().encode(text).byteLength, restored: true, restored_schema_version: restored.restored_schema_version, classification: restored.classification,
    contribution_after_marketing: amounts, scenario_contribution: restored.decision.scenarios[0]?.result?.contribution ?? null,
    actions: restored.action_workspace.items.length, ad_decisions: restored.action_workspace.items.map(item => item.ad_decision ?? null),
    side_data: { preprocessing: restored.preprocessing !== null, targets: restored.targets?.rows.length ?? 0, events: restored.events?.rows.length ?? 0, meeting_history: restored.meeting_history.length, ui_prefs: { ...restored.ui_prefs } },
    review_session: restored.review_session !== null,
    round_trip: { schema_version: JSON.parse(againText).schema_version, restored_schema_version: again.restored_schema_version, same_amounts: JSON.stringify(amountsOf(again.snapshot)) === JSON.stringify(amounts), envelope_bytes: new TextEncoder().encode(againText).byteLength },
    ms: Math.round(performance.now() - started),
  });
}

describe("V3-10 備份還原矩陣（v1–v5 × golden／demo）", () => {
  for (const name of ["golden", "demo"] as const) {
    describe(name, () => {
      let built: Promise<Built> | null = null;
      const ready = () => (built ??= build(name));
      it("目前檢視的金額與 fixtures 相同（矩陣的基準）", async () => {
        const { all, classification } = await ready();
        expect(amountsOf(all)).toEqual(EXPECTED[name]);
        expect(classification).toBe("valid");
      }, 120_000);
      for (const version of VERSIONS) {
        it(`${version} 信封：還原成功、金額不變、欄位依版本補預設值，再匯出成 v5 可再還原`, async () => {
          const started = performance.now();
          const b = await ready();
          const text = await envelope(version, b, name);
          expect(JSON.parse(text).schema_version).toBe(SCHEMA[version]);
          const { restored, again, againText } = await restoreAndRoundTrip(text);
          // 成功、分類、版本紀錄。
          expect(restored.classification).toBe(b.classification);
          expect(restored.restored_schema_version).toBe(SCHEMA[version]);
          expect(restored.dataset.manifest.dataset_id).toBe(DATASET_ID[name]);
          // 金額：目前檢視（全部通路）的扣廣告後貢獻與差額。
          expect(amountsOf(restored.snapshot)).toEqual(EXPECTED[name]);
          // 試算方案（DTC、履約 −10%）：golden＝284.00（PRD §2.3 C）；demo 與原工作區相同。
          const plan = restored.decision.scenarios.find(item => item.id === "plan");
          expect(plan?.result?.contribution).toBe(b.decision.scenarios[0].result!.contribution);
          if (name === "golden") expect(plan?.result?.contribution).toBe("284.00");
          // ad_decision：v5 才有；v4 以下一律 undefined（不標）。
          const decisions = restored.action_workspace.items.map(item => item.ad_decision);
          if (version === "v5") expect(decisions).toEqual(["pause"]);
          else expect(decisions.every(value => value === undefined)).toBe(true);
          expect(restored.action_workspace.items.length).toBeGreaterThan(0);
          // v4 側邊資料：v3 以下一律空；v4／v5 讀回原值（preprocessing 在 golden／demo 本來就是 null）。
          expect(restored.preprocessing).toBeNull();
          if (version === "v4" || version === "v5") {
            expect(restored.targets?.rows).toHaveLength(1);
            expect(restored.events?.rows).toHaveLength(1);
            expect(restored.meeting_history).toHaveLength(1);
            expect(restored.ui_prefs).toEqual(UI_PREFS);
          } else {
            expect(restored.targets).toBeNull();
            expect(restored.events).toBeNull();
            expect(restored.meeting_history).toEqual([]);
            expect(restored.ui_prefs).toEqual({});
          }
          // v1／v2 沒有會議稿；v3 起帶回。
          expect(restored.review_session !== null).toBe(version !== "v1" && version !== "v2");
          // round trip：再匯出一定是 v5，再還原金額、廣告決策與側邊資料都不變。
          expect(JSON.parse(againText).schema_version).toBe(WORKSPACE_VERSION);
          expect(again.restored_schema_version).toBe(WORKSPACE_VERSION);
          expect(amountsOf(again.snapshot)).toEqual(EXPECTED[name]);
          expect(again.action_workspace.items.map(item => item.ad_decision)).toEqual(decisions);
          expect(again.meeting_history).toHaveLength(restored.meeting_history.length);
          expect(again.targets?.rows.length ?? 0).toBe(restored.targets?.rows.length ?? 0);
          expect(again.ui_prefs).toEqual(restored.ui_prefs);
          expect(again.decision.scenarios.find(item => item.id === "plan")?.result?.contribution).toBe(plan?.result?.contribution);
          record(name, version, "generated", text, restored, again, againText, started);
        }, 240_000);
      }
    });
  }

  describe("R0 前實際的 v3 備份檔（verification/review-v2-a-workspace-*.json，golden）", () => {
    for (const size of ["desktop", "laptop", "tablet", "mobile"] as const) {
      it(`${size}：還原成功、255.00／−315.00、v4 側邊資料為空，再匯出成 v5 可再還原`, async () => {
        const started = performance.now();
        const text = readFileSync(resolve(`verification/review-v2-a-workspace-${size}.json`), "utf8");
        expect(JSON.parse(text).schema_version).toBe(SCHEMA.v3);
        const { restored, again, againText } = await restoreAndRoundTrip(text);
        expect(restored.classification).toBe("valid");
        expect(restored.restored_schema_version).toBe(SCHEMA.v3);
        expect(amountsOf(restored.snapshot)).toEqual(EXPECTED.golden);
        expect(restored).toMatchObject({ preprocessing: null, targets: null, events: null, meeting_history: [], ui_prefs: {} });
        expect(restored.action_workspace.items.every(item => item.ad_decision === undefined)).toBe(true);
        expect(JSON.parse(againText).schema_version).toBe(WORKSPACE_VERSION);
        expect(again.restored_schema_version).toBe(WORKSPACE_VERSION);
        expect(amountsOf(again.snapshot)).toEqual(EXPECTED.golden);
        expect(again.action_workspace.items).toHaveLength(restored.action_workspace.items.length);
        record("golden", `v3 (${size})`, "real-file", text, restored, again, againText, started);
      }, 240_000);
    }
  });

  afterAll(() => {
    const out = process.env.BACKUP_MATRIX_OUT;
    if (!out) return;
    mkdirSync(dirname(resolve(out)), { recursive: true });
    writeFileSync(resolve(out), `${JSON.stringify({ checked_at: new Date().toISOString(), restore_accepts: Object.values(SCHEMA).reverse(), rows: matrix }, null, 2)}\n`);
  });
});
