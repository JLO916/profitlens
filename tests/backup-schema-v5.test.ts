import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AD_DECISIONS, addActionDraft, emptyActionWorkspace } from "@/application/action-workspace";
import { CHANNEL_SETTINGS_VERSION, defaultChannelSettings, type ChannelSettings } from "@/application/channel-settings";
import { channelsLabel, scopeLabel, snapshotResolver } from "@/application/copy";
import { createDecisionSession, emptyDecisionWorkspace } from "@/application/decision";
import { createSnapshot, hashInput } from "@/application/workspace";
import { exportWorkspaceBackup, restoreWorkspaceBackup, WORKSPACE_V4, WORKSPACE_VERSION } from "@/application/workspace-backup";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { BACKUP_BYTES_FILE, BACKUP_BYTES_INSTANT, digest, minimalSource } from "./helpers/backup-bytes";
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

/*
 * V42-1a（D-V42-9＝A；06_BATCHES V42-1a 第 3 項；PRD §3.3、§3.4、§11.1 備份矩陣列）：v5 信封加選填 payload.channel_settings，版本字串仍是 profitlens-workspace-v5。
 * - 「沒有設定」＝與預設沒有差：示範別名是由 dataset_id 推出的隱含預設、永遠不寫；寫出前先驗證（未知代碼丟棄）、再去掉等於預設的欄位，剩空就不寫鍵。
 * - 位元組基準：tests/fixtures/backup-bytes-v4-7b.json 在 1e195ba 產生；exportWorkspaceBackup、tests/helpers/backup-bytes.ts、full-backup.ts 與基準檔在 v4.1.2（e256154）之後到本批開工前
 *   沒有改動（git diff --stat e256154 -- 這四個檔為空），而 tests/workspace-backup-imported-at.test.ts 斷言目前程式沒有設定的匯出等於基準，所以「等於基準」就是「等於 v4.1.2」。
 * - 還原：先讀出 payload.channel_settings 對還原後的 manifest.channels 驗證（不在資料集的代碼丟棄、列在 dropped_channel_codes，提示字串 storage.v42.droppedChannels）才建快照；
 *   v1–v4 信封帶 channel_settings 一律 INVALID_WORKSPACE_FORMAT（與 ad_decision、imported_at 相同）。
 */
const GOLDEN_SETTINGS: ChannelSettings = { version: CHANNEL_SETTINGS_VERSION, channels: [{ code: "DTC", label: "官網", group: "g1", order: 1 }, { code: "MARKETPLACE", group: "g1", order: 0 }], groups: [{ id: "g1", label: "全部平台", order: 0 }] };
const CHANNEL_SETTINGS_PATHS = ["payload.channel_settings", "payload.channel_settings.channels", "payload.channel_settings.channels[].code", "payload.channel_settings.channels[].group", "payload.channel_settings.channels[].label", "payload.channel_settings.channels[].order", "payload.channel_settings.groups", "payload.channel_settings.groups[].id", "payload.channel_settings.groups[].label", "payload.channel_settings.groups[].order", "payload.channel_settings.version"];
type Body = { schema_version: string; checksum: string; payload: Record<string, unknown> & { active: Record<string, unknown> } };

describe("V42-1a 備份 v5 的通路設定（payload.channel_settings，選填）", () => {
  beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(BACKUP_BYTES_INSTANT)); });
  afterEach(() => { vi.useRealTimers(); });

  it("示範資料與 golden 未改設定時備份文字逐位元組等於 v4.1.2：沒有設定、null、示範別名寫成明確的 label、只剩代碼、群組沒有成員、只有未知代碼，六種都不寫 channel_settings 鍵、與基準相同；還原後 channel_settings 為 null", async () => {
    const baseline = JSON.parse(readFileSync(BACKUP_BYTES_FILE, "utf8"));
    for (const name of ["golden", "demo"] as const) {
      const source = await minimalSource(name);
      const manifest = validateDataset(source.input).dataset!.manifest;
      const defaults = defaultChannelSettings(manifest.dataset_id, manifest.channels);
      if (name === "demo") expect(defaults.channels.map(entry => entry.label)).toEqual(manifest.channels.map(code => labels.data.demoChannelAlias[code]));
      else expect(defaults.channels).toEqual(manifest.channels.map(code => ({ code })));
      const untouched: (ChannelSettings | null | undefined)[] = [
        undefined, null, defaults,
        { version: CHANNEL_SETTINGS_VERSION, channels: manifest.channels.map(code => ({ code })), groups: [] },
        { version: CHANNEL_SETTINGS_VERSION, channels: [{ code: "DTC" }], groups: [{ id: "g1", label: "沒有成員", order: 0 }] },
        { version: CHANNEL_SETTINGS_VERSION, channels: [{ code: "NOT_A_CHANNEL", label: "不在資料集", group: "g1", order: 0 }], groups: [{ id: "g1", label: "只剩未知代碼", order: 0 }] },
      ];
      for (const [index, settings] of untouched.entries()) {
        const text = await exportWorkspaceBackup({ ...source, channel_settings: settings });
        expect(digest(text), `${name} #${index}`).toEqual(baseline.cases[name]);
        expect(JSON.parse(text).payload, `${name} #${index}`).not.toHaveProperty("channel_settings");
        const restored = await restoreWorkspaceBackup(text);
        expect(restored.channel_settings, `${name} #${index}`).toBeNull();
        expect(restored.dropped_channel_codes, `${name} #${index}`).toEqual([]);
        expect("channel_names" in restored.snapshot, `${name} #${index}`).toBe(false);
      }
    }
  }, 180_000);

  it("帶設定的 v5（所有選填欄位都有值）：鍵路徑只比 V4-7c 清單多 payload.channel_settings.*，寫在 payload 的最後一個鍵；還原讀回、再匯出 payload 相同；與沒有設定的那份只差這個鍵與 checksum", async () => {
    const settings: ChannelSettings = { version: CHANNEL_SETTINGS_VERSION, channels: [{ code: "官網", label: "官方網站", group: "g1", order: 0 }], groups: [{ id: "g1", label: "自有", order: 0 }] };
    const text = await fullBackup({ adDecision: "increase", importedAt: IMPORTED_AT, channelSettings: settings });
    const body = JSON.parse(text) as Body;
    expect(body.schema_version).toBe(WORKSPACE_VERSION);
    expect(body.payload.channel_settings).toEqual(settings);
    expect(Object.keys(body.payload).at(-1)).toBe("channel_settings");
    const schema = readJson(SCHEMA);
    const paths = [...keyPaths(body)].sort();
    expect(paths.filter(path => !(schema.key_paths as string[]).includes(path))).toEqual(CHANNEL_SETTINGS_PATHS);
    expect((schema.key_paths as string[]).filter(path => !paths.includes(path))).toEqual([]);
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.channel_settings).toEqual(settings);
    expect(restored.dropped_channel_codes).toEqual([]);
    expect(restored.snapshot.channel_names).toEqual({ 官網: "官方網站" });
    expect(restored.snapshot.channel_groups).toEqual([{ id: "g1", label: "自有", members: ["官網"] }]);
    expect(restored.imported_at).toBe(IMPORTED_AT);
    const again = JSON.parse(await exportWorkspaceBackup({ ...restored, filters: restored.snapshot.report.scope })) as Body;
    expect(again.payload).toEqual(body.payload);
    // 位元組層級：拿掉插入的鍵、換回原本的 checksum，就是沒有設定的那份文字（同一個固定時間）。
    const without = await fullBackup({ adDecision: "increase", importedAt: IMPORTED_AT });
    expect(text.replace(`,"channel_settings":${JSON.stringify(settings)}`, "").replace(body.checksum, (JSON.parse(without) as Body).checksum)).toBe(without);
  }, 120_000);

  it("還原時不在資料集裡的通路代碼被略過並回報（dropped_channel_codes、storage.v42.droppedChannels）；其餘設定照常讀回；再匯出不含它", async () => {
    const source = await minimalSource("golden");
    const body = JSON.parse(await exportWorkspaceBackup({ ...source, channel_settings: GOLDEN_SETTINGS })) as Body;
    expect(body.payload.channel_settings).toEqual(GOLDEN_SETTINGS);
    (body.payload.channel_settings as ChannelSettings).channels.push({ code: "LEGACY", label: "舊通路", group: "g1", order: 2 }, { code: "SHOPEE", order: 3 });
    const restored = await restoreWorkspaceBackup(await resign(body));
    expect(restored.dropped_channel_codes).toEqual(["LEGACY", "SHOPEE"]);
    expect(restored.channel_settings).toEqual(GOLDEN_SETTINGS);
    expect(restored.snapshot.channel_names).toEqual({ DTC: "官網" });
    expect(restored.snapshot.channel_groups).toEqual([{ id: "g1", label: "全部平台", members: ["DTC", "MARKETPLACE"] }]);
    const notice = fill(labels.storage.v42.droppedChannels, { n: restored.dropped_channel_codes.length, codes: restored.dropped_channel_codes.join("、") });
    expect(notice).toContain("2");
    for (const code of restored.dropped_channel_codes) expect(notice).toContain(code);
    expect(notice).not.toContain("{");
    const again = JSON.parse(await exportWorkspaceBackup({ ...restored, filters: restored.snapshot.report.scope })) as Body;
    expect(again.payload.channel_settings).toEqual(GOLDEN_SETTINGS);
    expect(JSON.stringify(again)).not.toContain("LEGACY");
  }, 60_000);

  it("PRD §3.4 第二半：試算頁式的單一通路備份還原後，scopeLabel 與範圍文字等於設定的顯示名稱；沒有設定的同一份備份還原後仍是代碼", async () => {
    const input = fixture("golden"), dataset = validateDataset(input).dataset!;
    const single = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
    const base = { input, filters: single.report.scope, id: "golden", revision: 1, decision: emptyDecisionWorkspace() };
    const restored = await restoreWorkspaceBackup(await exportWorkspaceBackup({ ...base, channel_settings: GOLDEN_SETTINGS }));
    expect(restored.snapshot.report.scope.channels).toEqual(["DTC"]);
    expect(restored.snapshot.filter_hash).toBe(single.filter_hash);
    const resolver = snapshotResolver(restored.snapshot);
    expect(scopeLabel({ kind: "channel", channels: ["DTC"] }, resolver)).toBe("官網");
    expect(channelsLabel(restored.snapshot.report.scope.channels, resolver)).toBe("官網");
    expect(resolver.channel("MARKETPLACE")).toBe("MARKETPLACE");
    const plain = await restoreWorkspaceBackup(await exportWorkspaceBackup(base));
    expect(scopeLabel({ kind: "channel", channels: ["DTC"] }, snapshotResolver(plain.snapshot))).toBe("DTC");
    expect(plain.channel_settings).toBeNull();
  }, 60_000);

  it("v5 的 channel_settings 形狀不對（版本字串、未知鍵、名稱超過 200 字、order 不是整數、少 groups、null）→ INVALID_WORKSPACE_FORMAT；竄改不重算校驗碼 → WORKSPACE_CHECKSUM_MISMATCH", async () => {
    const source = await minimalSource("golden");
    const text = await exportWorkspaceBackup({ ...source, channel_settings: GOLDEN_SETTINGS });
    const tampered = JSON.parse(text) as Body; (tampered.payload.channel_settings as ChannelSettings).channels[0].label = "改過";
    await expect(restoreWorkspaceBackup(JSON.stringify(tampered))).rejects.toThrow("WORKSPACE_CHECKSUM_MISMATCH");
    for (const [label, mutate] of [
      ["version", (value: Record<string, unknown>) => { value.version = "channel-settings-v2"; }],
      ["unknown key", (value: Record<string, unknown>) => { value.names = {}; }],
      ["unknown channel key", (value: Record<string, unknown>) => { (value.channels as Record<string, unknown>[])[0].color = "red"; }],
      ["label too long", (value: Record<string, unknown>) => { (value.channels as Record<string, unknown>[])[0].label = "官".repeat(201); }],
      ["group label too long", (value: Record<string, unknown>) => { (value.groups as Record<string, unknown>[])[0].label = "平".repeat(201); }],
      ["order float", (value: Record<string, unknown>) => { (value.channels as Record<string, unknown>[])[0].order = 1.5; }],
      ["group order missing", (value: Record<string, unknown>) => { delete (value.groups as Record<string, unknown>[])[0].order; }],
      ["group label missing", (value: Record<string, unknown>) => { delete (value.groups as Record<string, unknown>[])[0].label; }],
      ["groups missing", (value: Record<string, unknown>) => { delete value.groups; }],
      ["empty code", (value: Record<string, unknown>) => { (value.channels as Record<string, unknown>[])[0].code = ""; }],
    ] as const) {
      const body = JSON.parse(text) as Body;
      mutate(body.payload.channel_settings as Record<string, unknown>);
      await expect(restoreWorkspaceBackup(await resign(body)), label).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    }
    const nulled = JSON.parse(text) as Body; nulled.payload.channel_settings = null;
    await expect(restoreWorkspaceBackup(await resign(nulled))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    const misplaced = JSON.parse(text) as Body; misplaced.payload.active.channel_settings = misplaced.payload.channel_settings; delete misplaced.payload.channel_settings;
    await expect(restoreWorkspaceBackup(await resign(misplaced))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  }, 60_000);

  it("v1–v4 信封帶 channel_settings 一律 INVALID_WORKSPACE_FORMAT（即使重算校驗碼）；同一份沒有此鍵時可以還原、channel_settings 為 null", async () => {
    const source = await minimalSource("golden");
    const v5 = JSON.parse(await exportWorkspaceBackup({ ...source, channel_settings: GOLDEN_SETTINGS })) as Body;
    const v4 = structuredClone(v5); v4.schema_version = WORKSPACE_V4;
    const v3 = structuredClone(v5); v3.schema_version = "profitlens-workspace-v3";
    for (const key of ["preprocessing", "targets", "events", "meeting_history", "ui_prefs"]) delete v3.payload[key];
    const legacy = (version: string) => ({ schema_version: version, metric_version: "contribution-v1", scenario_version: "scenario-v1", saved_at: "2026-10-01T00:00:00.000Z", payload: { active: { input: source.input, filters: source.filters, id: "golden", revision: 1, filenames: {}, mappings: {} }, decision: null, channel_settings: GOLDEN_SETTINGS } as Record<string, unknown> });
    for (const [label, envelope] of [["v4", v4], ["v3", v3], ["v2", legacy("profitlens-workspace-v2")], ["v1", legacy("profitlens-workspace-v1")]] as const) {
      await expect(restoreWorkspaceBackup(await resign(envelope as unknown as Record<string, unknown>)), label).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
      const without = structuredClone(envelope); delete without.payload.channel_settings;
      const restored = await restoreWorkspaceBackup(await resign(without as unknown as Record<string, unknown>));
      expect(restored.restored_schema_version, label).toBe(envelope.schema_version);
      expect(restored.channel_settings, label).toBeNull();
      expect(restored.dropped_channel_codes, label).toEqual([]);
    }
    // asV4（降版 helper）會拿掉 channel_settings：v4 檔還原後 channel_settings 為 null，再存成 v5 也沒有這個鍵。
    const v4Text = await asV4(JSON.stringify(v5));
    expect(JSON.parse(v4Text).payload).not.toHaveProperty("channel_settings");
    const fromV4 = await restoreWorkspaceBackup(v4Text);
    expect(fromV4.channel_settings).toBeNull();
    expect(JSON.parse(await exportWorkspaceBackup({ ...fromV4, filters: fromV4.snapshot.report.scope })).payload).not.toHaveProperty("channel_settings");
  }, 120_000);
});
