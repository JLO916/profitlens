import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { AD_DECISIONS, addActionDraft, emptyActionWorkspace } from "@/application/action-workspace";
import { createDecisionSession } from "@/application/decision";
import { createSnapshot, hashInput } from "@/application/workspace";
import { exportWorkspaceBackup, restoreWorkspaceBackup, WORKSPACE_V4, WORKSPACE_VERSION } from "@/application/workspace-backup";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";
import { asV4, fullBackup, keyPaths, resign } from "./helpers/full-backup";

/*
 * V3-9a（PRD §10.1 F13、§6.3 #59／#60、§11.8）：備份 v5 的欄位清單。V4-7c（D-V3-30＝A）起目前的清單是 verification/revamp-v4/backup-schema-v5.json
 * （v3 版 verification/revamp-v3/backup-schema-v5.json 保留為歷史紀錄：兩份只差 payload.active.imported_at 與說明區塊）。
 * - v5＝v4 信封＋待辦 items[].ad_decision（選填）＋V4-7c 的 active.imported_at（選填）；清單的 key_paths 必須與「所有選填欄位都有值（含廣告決策與匯入時間）」的實際匯出一致。
 * - v4 檔（沒有 ad_decision）還原後為 undefined；v5 來回保留；v1–v4 信封帶 ad_decision 一律 INVALID_WORKSPACE_FORMAT。
 * BACKUP_SCHEMA_DUMP=<路徑> 時把本次 v5 匯出的路徑寫出，供更新清單時使用。
 */
const SCHEMA = resolve("verification/revamp-v4/backup-schema-v5.json");
/** V3-9a 的 v5 清單（歷史紀錄，不再更新）：沒有 imported_at 的 v5 匯出仍與它一致。 */
const V3_SCHEMA = resolve("verification/revamp-v3/backup-schema-v5.json");
const V4_SCHEMA = resolve("verification/revamp-v3/backup-schema-v4.json");
const IMPORTED_AT = "2026-10-07T06:05Z";
const readJson = (path: string) => JSON.parse(readFileSync(path, "utf8"));

describe("V3-9a 備份 v5 欄位清單（backup-schema-v5.json；V4-7c 起是 revamp-v4 版）", () => {
  it("清單的 key_paths 與實際匯出（v5，所有選填欄位都有值，含 V4-7c 的匯入時間）完全一致；schema_version 與可還原版本 v1–v5", async () => {
    const text = await fullBackup({ adDecision: "increase", importedAt: IMPORTED_AT });
    expect(JSON.parse(text).payload.active.imported_at).toBe(IMPORTED_AT);
    const paths = [...keyPaths(JSON.parse(text))].sort();
    const dump = process.env.BACKUP_SCHEMA_DUMP;
    if (dump) writeFileSync(dump, JSON.stringify(paths, null, 2));
    const schema = readJson(SCHEMA);
    expect(WORKSPACE_VERSION).toBe("profitlens-workspace-v5");
    expect(schema.schema_version).toBe(WORKSPACE_VERSION);
    expect(JSON.parse(text).schema_version).toBe(WORKSPACE_VERSION);
    expect(schema.restore_accepts).toEqual(["profitlens-workspace-v5", "profitlens-workspace-v4", "profitlens-workspace-v3", "profitlens-workspace-v2", "profitlens-workspace-v1"]);
    expect(paths).toEqual([...schema.key_paths].sort());
    expect(paths.filter(path => !path.includes("."))).toEqual([...schema.top_level_keys].sort());
    expect(paths.filter(path => /^payload\.[^.[]+$/.test(path)).map(path => path.slice("payload.".length)).sort()).toEqual([...schema.payload_keys].sort());
  }, 60_000);

  it("V4-7c：revamp-v4 的 v5 清單與 V3-9a 的 v5 清單只差 payload.active.imported_at（鍵路徑、active.keys）與說明（$comment、source、restore_migration、active.note、active_imported_at 區塊）；沒有匯入時間的匯出仍與 V3-9a 清單一致", async () => {
    const current = readJson(SCHEMA), historical = readJson(V3_SCHEMA);
    expect((current.key_paths as string[]).filter(path => !(historical.key_paths as string[]).includes(path))).toEqual(["payload.active.imported_at"]);
    expect((historical.key_paths as string[]).filter(path => !(current.key_paths as string[]).includes(path))).toEqual([]);
    expect(current.key_paths).toEqual([...current.key_paths].sort());
    const described = new Set(["$comment", "source", "restore_migration", "payload", "key_paths", "active_imported_at", "integrity"]);
    expect(Object.keys(current).filter(key => !described.has(key))).toEqual(Object.keys(historical).filter(key => !described.has(key)));
    for (const key of Object.keys(historical).filter(key => !described.has(key))) expect(current[key], key).toEqual(historical[key]);
    expect(historical).not.toHaveProperty("active_imported_at");
    // V4-7c 審查 R1-V4-7c-1：restoreWorkspaceBackup 先 schema.safeParse 再比對 checksum；revamp-v3 清單寫反，revamp-v4 清單更正。
    expect(current.integrity.indexOf("strict schema")).toBeLessThan(current.integrity.indexOf("重算 checksum"));
    expect(current.active_imported_at).toMatchObject({ path: "payload.active.imported_at", type: "iso-datetime-minute-utc", example: IMPORTED_AT, optional: true, v4_7c_addition: true });
    expect(new RegExp(current.active_imported_at.pattern).test(current.active_imported_at.example)).toBe(true);
    expect(current.active_imported_at.written_when).toContain("performCommitImport");
    expect(current.key_paths).toContain(current.active_imported_at.path);
    expect(current.source).toEqual(expect.arrayContaining(historical.source));
    expect(current.restore_migration.startsWith(historical.restore_migration)).toBe(true);
    expect(current.restore_migration).toContain("imported_at");
    const { active: currentActive, ...currentPayload } = current.payload, { active: historicalActive, ...historicalPayload } = historical.payload;
    expect(currentPayload).toEqual(historicalPayload);
    expect(currentActive.keys).toEqual([...historicalActive.keys, "imported_at"]);
    expect(currentActive.type).toBe(historicalActive.type);
    expect(currentActive.note.startsWith(historicalActive.note)).toBe(true);
    // 沒有匯入時間（示範、golden、還原舊備份）的匯出與 V3-9a 的清單完全一致。
    const paths = [...keyPaths(JSON.parse(await fullBackup({ adDecision: "increase" })))].sort();
    expect(paths).toEqual([...historical.key_paths].sort());
  }, 60_000);

  it("v5 與 v4 的差別只有 items[].ad_decision（V3-9a 的歷史清單）：其餘鍵路徑、上限、頂層與 payload 鍵、ui_prefs 欄位都相同；說明區塊標 v3_9a_addition", () => {
    const v5 = readJson(V3_SCHEMA), v4 = readJson(V4_SCHEMA);
    expect((v5.key_paths as string[]).filter(path => !(v4.key_paths as string[]).includes(path))).toEqual(["payload.action_workspace.items[].ad_decision"]);
    expect((v4.key_paths as string[]).filter(path => !(v5.key_paths as string[]).includes(path))).toEqual([]);
    for (const key of ["limits", "top_level_keys", "payload_keys", "ui_prefs", "metric_version", "scenario_version", "opaque_records"]) expect(v5[key], key).toEqual(v4[key]);
    expect(v5.action_ad_decision).toMatchObject({ path: "payload.action_workspace.items[].ad_decision", type: "enum", values: [...AD_DECISIONS], optional: true, v3_9a_addition: true });
    expect(v5.restore_migration).toContain("ad_decision");
    expect(v5.key_paths).toContain(v5.action_ad_decision.path);
  });

  it("v5 來回：廣告決策寫入 items[].ad_decision、還原後讀回，再存一次待辦內容不變", async () => {
    const text = await fullBackup({ adDecision: "pause" });
    expect(JSON.parse(text).payload.action_workspace.items[0].ad_decision).toBe("pause");
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.action_workspace.items[0].ad_decision).toBe("pause");
    const again = JSON.parse(await exportWorkspaceBackup({ ...restored, filters: restored.snapshot.report.scope }));
    expect(again.payload.action_workspace).toEqual(JSON.parse(text).payload.action_workspace);
    // 沒標時不寫這個欄位（舊檔與新檔都一樣是「不標」）。
    const plain = JSON.parse(await fullBackup());
    expect(plain.payload.action_workspace.items[0]).not.toHaveProperty("ad_decision");
  }, 60_000);

  it("v4 檔（R4–V3-8 寫出）還原後 ad_decision 為 undefined，其他欄位照常讀回", async () => {
    const v4Text = await asV4(await fullBackup({ adDecision: "increase" }));
    expect(JSON.parse(v4Text).schema_version).toBe(WORKSPACE_V4);
    expect(JSON.parse(v4Text).payload.action_workspace.items[0]).not.toHaveProperty("ad_decision");
    const restored = await restoreWorkspaceBackup(v4Text);
    expect(restored.action_workspace.items[0].ad_decision).toBeUndefined();
    expect(restored.action_workspace.items[0].status_updated_at).toBe("2026-10-01");
    expect(restored.ui_prefs).toEqual({ last_preset: "last28", view: "list" });
    // 讀回後再存：寫成 v5，仍然沒有 ad_decision。
    const again = JSON.parse(await exportWorkspaceBackup({ ...restored, filters: restored.snapshot.report.scope }));
    expect(again.schema_version).toBe(WORKSPACE_VERSION);
    expect(again.payload.action_workspace.items[0]).not.toHaveProperty("ad_decision");
  }, 60_000);

  it("v4 與 v3 信封帶 ad_decision 一律 INVALID_WORKSPACE_FORMAT（即使重算校驗碼）；v5 的值只能是三種之一、而且只能放在 items[]", async () => {
    const text = await fullBackup({ adDecision: "adjust" });
    const v4 = JSON.parse(text); v4.schema_version = WORKSPACE_V4;
    await expect(restoreWorkspaceBackup(await resign(v4))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    const v3 = JSON.parse(text); v3.schema_version = "profitlens-workspace-v3";
    for (const key of ["preprocessing", "targets", "events", "meeting_history", "ui_prefs"]) delete v3.payload[key];
    // v3 沒有 R5／V3-6 的選填欄位：先拿掉，確定被拒的原因只剩 ad_decision。
    for (const item of v3.payload.action_workspace.items) delete item.status_updated_at;
    delete v3.payload.scenario_workspace.assumptions_acknowledged_at;
    for (const context of v3.payload.scenario_workspace.contexts) for (const plan of context.plans) delete plan.sensitivity;
    for (const plan of v3.payload.decision?.scenarios ?? []) delete plan.sensitivity;
    const withoutDecision = structuredClone(v3);
    for (const item of withoutDecision.payload.action_workspace.items) delete item.ad_decision;
    await expect(restoreWorkspaceBackup(await resign(withoutDecision))).resolves.toBeTruthy();
    await expect(restoreWorkspaceBackup(await resign(v3))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    for (const [label, mutate] of [
      ["unknown value", (body: { payload: { action_workspace: { items: Record<string, unknown>[] } } }) => { body.payload.action_workspace.items[0].ad_decision = "stop"; }],
      ["null value", (body: { payload: { action_workspace: { items: Record<string, unknown>[] } } }) => { body.payload.action_workspace.items[0].ad_decision = null; }],
      ["on the card", (body: { payload: { action_workspace: { items: { card: Record<string, unknown> }[] } } }) => { (body.payload.action_workspace.items[0].card as Record<string, unknown>).ad_decision = "pause"; }],
    ] as const) {
      const body = JSON.parse(text);
      mutate(body);
      await expect(restoreWorkspaceBackup(await resign(body)), label).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    }
  }, 60_000);

  it("v1／v2 信封帶 ad_decision 一律 INVALID_WORKSPACE_FORMAT；同一份檔案沒有此欄位時可以還原", async () => {
    const input = fixture(); const dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
    const session = createDecisionSession(dataset, snapshot, 1);
    const contextId = addActionDraft(emptyActionWorkspace(), { input, dataset, snapshot, revision: 1 }, "task").contexts[0].id;
    const card = { id: "legacy-task", problem: "原稿", fact_ids: [], action: "", owner_role: "", validation_metric: "", deadline: "", stop_condition: "", required_data: "", origin: "manual", evidence_confirmed: false };
    const decision = { source_input: input, filters: snapshot.report.scope, filenames: {}, dataset_hash: snapshot.dataset_hash, filter_hash: snapshot.filter_hash, revision: 1, stale: false, stale_reasons: [], scenarios: [], actions: [card] };
    const envelope = (version: "profitlens-workspace-v1" | "profitlens-workspace-v2", payload: Record<string, unknown>) => ({ schema_version: version, metric_version: "contribution-v1", scenario_version: "scenario-v1", saved_at: "2026-10-01T00:00:00.000Z", payload: { active: { input, filters: snapshot.report.scope, id: "golden", revision: 1, filenames: {}, mappings: {} }, ...payload } });
    const item = (extra: Record<string, unknown> = {}) => ({ card, context_id: contextId, pinned: true, scope: { kind: "all", channels: session.scope.channels }, ...extra });
    const v2 = (extra?: Record<string, unknown>) => envelope("profitlens-workspace-v2", { decision, action_workspace: { contexts: [{ ...decision, id: contextId, scenarios: [], actions: [] }], items: [item(extra)] } });
    await expect(restoreWorkspaceBackup(await resign(v2()))).resolves.toBeTruthy();
    await expect(restoreWorkspaceBackup(await resign(v2({ ad_decision: "pause" })))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    await expect(restoreWorkspaceBackup(await resign(envelope("profitlens-workspace-v1", { decision })))).resolves.toBeTruthy();
    await expect(restoreWorkspaceBackup(await resign(envelope("profitlens-workspace-v1", { decision: { ...decision, actions: [{ ...card, ad_decision: "pause" }] } })))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    // v1／v2 還原後的待辦都是「不標」。
    const restored = await restoreWorkspaceBackup(await resign(v2()));
    expect(restored.action_workspace.items.map(entry => entry.ad_decision)).toEqual([undefined]);
  }, 60_000);
});
