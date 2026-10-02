import { describe, expect, it } from "vitest";
import { addActionDraft, confirmBoundAction, editBoundAction, emptyActionWorkspace, pinAction, type ActionSource } from "@/application/action-workspace";
import { csvHeaderKey } from "@/application/copy";
import { createDecisionSession } from "@/application/decision";
import { exportDecisionCsv, exportDecisionJson, exportDecisionMarkdown } from "@/application/decision-export";
import { createSnapshot, hashInput } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import type { DatasetInput } from "@/domain/types";
import { fixture } from "./helpers/fixtures";

async function source(channel: string, revision: number): Promise<ActionSource> {
  let input = fixture();
  if (revision === 2) input = JSON.parse(JSON.stringify(input).replaceAll("2026-08-", "2026-09-")) as DatasetInput;
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, { channels: [channel] }, await hashInput(input));
  return { input, dataset, snapshot, revision, filenames: { "sales_daily.csv": revision === 1 ? "原始八月.csv" : "新九月.csv", "ad_spend_daily.csv": revision === 1 ? "八月廣告.csv" : "九月廣告.csv" } };
}
const content = { problem: "核對貢獻差異", action: "核對來源帳單", owner_role: "營運", validation_metric: "行銷後貢獻", deadline: "2026-10-08", stop_condition: "口徑不符即停止", required_data: "未稅費用帳單" };
async function setup() {
  const oldSource = await source("DTC", 1), currentSource = await source("MARKETPLACE", 2);
  let workspace = addActionDraft(emptyActionWorkspace(), oldSource, "old-dtc");
  const oldFact = workspace.contexts[0].session.facts.find(fact => fact.metric === "contribution_after_marketing" && fact.scope.kind === "channel" && fact.period.start === "2026-08-02")!;
  workspace = editBoundAction(workspace, "old-dtc", { ...content, fact_ids: [oldFact.id] });
  workspace = confirmBoundAction(workspace, "old-dtc");
  workspace = pinAction(workspace, "old-dtc", true);
  for (let index = 1; index <= 4; index++) workspace = addActionDraft(workspace, currentSource, `new-${index}`);
  const currentContext = workspace.contexts.find(context => context.session.revision === 2)!;
  const currentFact = currentContext.session.facts.find(fact => fact.metric === "contribution_after_marketing" && fact.scope.kind === "channel" && fact.period.start === "2026-09-02")!;
  workspace = editBoundAction(workspace, "new-1", { ...content, fact_ids: [currentFact.id] });
  workspace = confirmBoundAction(workspace, "new-1");
  return { workspace, oldSource, currentSource, oldFact, currentFact, session: createDecisionSession(currentSource.dataset, currentSource.snapshot, 2, currentSource.filenames) };
}

/** Independent quote-aware reader so assertions inspect actual CSV cells, not substrings. Header cells are「中文 (key)」; records are keyed by the english key. */
function records(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  const value = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '"') {
      if (quoted && value[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted;
    } else if (character === "," && !quoted) { row.push(cell); cell = ""; }
    else if (!quoted && (character === "\r" || character === "\n")) {
      if (character === "\r" && value[index + 1] === "\n") index++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  expect(quoted).toBe(false);
  const headers = rows.shift()!.map(csvHeaderKey);
  return rows.map(values => { expect(values).toHaveLength(headers.length); return Object.fromEntries(headers.map((key, index) => [key, values[index]])); });
}

describe("PL-05 independent action ledger audited exports", () => {
  it("exports more than three actions and keeps historical bindings separate from the current scenario session", async () => {
    const { session, workspace, oldSource, oldFact, currentFact } = await setup();
    const saved = structuredClone(workspace);
    const document = JSON.parse(exportDecisionJson(session, [], [], workspace));
    expect(document.actions).toHaveLength(5);
    expect(document.actions[0]).toMatchObject({ id: "old-dtc", pinned: true, status: "confirmed", evidence_confirmed: true, evidence_relation: "historical", binding: { status: "current", revision: 1, dataset_hash: oldSource.snapshot.dataset_hash, filter_hash: oldSource.snapshot.filter_hash, period: { start: "2026-08-02", end: "2026-08-02" }, scope: { channels: ["DTC"] }, analysis_scope: { channels: ["DTC"] }, filenames: { "sales_daily.csv": "原始八月.csv" } } });
    expect(document.actions[0].evidence).toEqual([oldFact]);
    expect(document.actions[0].evidence[0].value).toBe("270.00");
    expect(document.actions[1]).toMatchObject({ id: "new-1", status: "confirmed", binding: { status: "current", revision: 2, period: { start: "2026-09-02", end: "2026-09-02" }, scope: { channels: ["MARKETPLACE"] } } });
    expect(document.actions[1].evidence).toEqual([currentFact]);
    expect(document.actions[1].evidence[0].value).toBe("-15.00");
    expect(document.actions[4]).toMatchObject({ status: "draft", evidence: [] });
    expect(JSON.stringify(document)).not.toContain("source_input");
    expect(workspace).toEqual(saved);
  });
  it("every CSV action field uses its own captured metadata, period, scope and source filenames", async () => {
    const { session, workspace, oldSource } = await setup();
    const rows = records(exportDecisionCsv(session, [], [], workspace));
    const oldRows = rows.filter(row => row.row_type === "manual_action" && row.item_id === "old-dtc");
    expect(oldRows.length).toBeGreaterThan(10);
    for (const row of oldRows) {
      expect(row).toMatchObject({ dataset_hash: oldSource.snapshot.dataset_hash, filter_hash: oldSource.snapshot.filter_hash, revision: "1", snapshot_status: "current", status: "confirmed", as_of: "2026-08-03" });
      expect(JSON.parse(row.period)).toEqual({ start: "2026-08-02", end: "2026-08-02" });
      expect(JSON.parse(row.scope).channels).toEqual(["DTC"]);
      expect(JSON.parse(row.analysis_scope).channels).toEqual(["DTC"]);
      expect(row.context_id).toBe(workspace.items[0].context_id);
      expect(row.source_refs).toContain("原始八月.csv");
      expect(row.source_refs).not.toContain("新九月.csv");
    }
    expect(new Set(rows.filter(row => row.row_type === "manual_action").map(row => row.item_id)).size).toBe(5);
  });
  it("CSV has per-action numeric fact rows with the fact's own period, scope, reasons and sources", async () => {
    const { session, workspace, oldFact, currentFact } = await setup();
    const rows = records(exportDecisionCsv(session, [], [], workspace));
    const oldEvidence = rows.find(row => row.row_type === "action_fact" && row.item_id === "old-dtc")!;
    expect(oldEvidence).toMatchObject({ field: "contribution_after_marketing", value: "270.00", snapshot_status: "current", revision: "1" });
    expect(JSON.parse(oldEvidence.fact_ids)).toEqual([oldFact.id]);
    expect(JSON.parse(oldEvidence.period)).toEqual(oldFact.period);
    expect(JSON.parse(oldEvidence.scope)).toEqual(oldFact.scope);
    expect(JSON.parse(oldEvidence.reason_codes)).toEqual([]);
    expect(JSON.parse(oldEvidence.source_refs).some((entry: { actual_filename: string }) => entry.actual_filename === "原始八月.csv")).toBe(true);
    const currentEvidence = rows.find(row => row.row_type === "action_fact" && row.item_id === "new-1")!;
    expect(currentEvidence).toMatchObject({ value: "-15.00", snapshot_status: "current", revision: "2" });
    expect(JSON.parse(currentEvidence.fact_ids)).toEqual([currentFact.id]);
    expect(JSON.parse(currentEvidence.scope)).toEqual(currentFact.scope);
  });
  it("a channel diagnostic created in an all-channel view keeps both its narrow evidence scope and full analysis scope", async () => {
    const input = fixture(), dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    const src: ActionSource = { input, dataset, snapshot, revision: 1 };
    const diagnostic = snapshot.report.diagnostics.find(item => item.code === "NEGATIVE_CHANNEL_CM")!;
    const workspace = addActionDraft(emptyActionWorkspace(), src, "negative-market", diagnostic.id);
    const session = createDecisionSession(dataset, snapshot, 1);
    const rows = records(exportDecisionCsv(session, [], [], workspace));
    const row = rows.find(item => item.row_type === "manual_action" && item.field === "problem")!;
    expect(JSON.parse(row.scope)).toEqual({ kind: "channel", channels: ["MARKETPLACE"] });
    expect(JSON.parse(row.analysis_scope).channels).toEqual(["DTC", "MARKETPLACE"]);
    const evidence = rows.find(item => item.row_type === "action_fact")!;
    expect(evidence.value).toBe("-15.00");
    expect(JSON.parse(evidence.scope).channels).toEqual(["MARKETPLACE"]);
  });
  it("previous and current evidence keep their own dates instead of all receiving the action's current period", async () => {
    const src = await source("DTC", 1);
    let workspace = addActionDraft(emptyActionWorkspace(), src, "compare");
    const session = createDecisionSession(src.dataset, src.snapshot, 1);
    const facts = session.facts.filter(fact => fact.metric === "net_revenue" && fact.scope.kind === "channel");
    workspace = editBoundAction(workspace, "compare", { ...content, fact_ids: facts.map(fact => fact.id) });
    const rows = records(exportDecisionCsv(session, [], [], workspace)).filter(row => row.row_type === "action_fact");
    expect(rows).toHaveLength(2);
    expect(rows.find(row => JSON.parse(row.period).start === "2026-08-01")?.value).toBe("1350.00");
    expect(rows.find(row => JSON.parse(row.period).start === "2026-08-02")?.value).toBe("1480.00");
  });
  it("unknown fact money exports as blank/null with its reasons and never becomes zero", async () => {
    const input = fixture("errors/missing_cogs"), dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
    const src: ActionSource = { input, dataset, snapshot, revision: 1 };
    const session = createDecisionSession(dataset, snapshot, 1);
    const fact = session.facts.find(item => item.metric === "contribution_after_marketing" && item.value === null && item.scope.kind === "channel")!;
    let workspace = addActionDraft(emptyActionWorkspace(), src, "missing-cost");
    workspace = editBoundAction(workspace, "missing-cost", { ...content, fact_ids: [fact.id] });
    const row = records(exportDecisionCsv(session, [], [], workspace)).find(item => item.row_type === "action_fact")!;
    expect(row.value).toBe("");
    expect(JSON.parse(row.reason_codes)).toEqual(fact.reason_codes);
    expect(fact.reason_codes.length).toBeGreaterThan(0);
    expect(JSON.parse(exportDecisionJson(session, [], [], workspace)).actions[0].evidence[0].value).toBeNull();
  });
  it("safe Markdown includes each binding and actual cited values without executing manual text", async () => {
    const { session, workspace } = await setup();
    workspace.items[1].card.problem = "<img src=x onerror=alert(1)>";
    workspace.items[1].card.action = "[開啟](javascript:alert(1))\n# 注入";
    workspace.items[1].card.owner_role = "+cmd";
    workspace.items[1].card.required_data = "=HYPERLINK(1)";
    workspace.contexts[0].session.filenames["sales_daily.csv"] = "<script>歷史.csv";
    const markdown = exportDecisionMarkdown(session, [], [], workspace);
    expect(markdown).toContain("binding"); expect(markdown).toContain("analysis\\_scope");
    expect(markdown).toContain("270\\.00"); expect(markdown).toContain("\\-15\\.00");
    expect(markdown).toContain("historical"); expect(markdown).toContain("&lt;script&gt;歷史\\.csv");
    expect(markdown).not.toContain("<img"); expect(markdown).not.toContain("[開啟](javascript:"); expect(markdown).not.toContain("\n# 注入");
    const csv = records(exportDecisionCsv(session, [], [], workspace));
    expect(csv.find(row => row.row_type === "manual_action" && row.item_id === "new-1" && row.field === "owner_role")?.value).toBe("'+cmd");
    expect(csv.find(row => row.row_type === "manual_action" && row.item_id === "new-1" && row.field === "required_data")?.value).toBe("'=HYPERLINK(1)");
  });
  it("rejects invented historical fact references at every export boundary", async () => {
    const { session, workspace } = await setup();
    workspace.items[0].card.fact_ids = ["fabricated-fact"];
    for (const exporter of [exportDecisionJson, exportDecisionCsv, exportDecisionMarkdown]) expect(() => exporter(session, [], [], workspace)).toThrow("UNKNOWN_FACT_ID");
  });
  it("an explicit empty ledger is authoritative and does not silently revive legacy actions", async () => {
    const { session, workspace } = await setup();
    expect(JSON.parse(exportDecisionJson(session, [], [workspace.items[1].card], emptyActionWorkspace())).actions).toEqual([]);
  });
});
