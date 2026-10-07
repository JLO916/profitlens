import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { restoreWorkspaceBackup, WORKSPACE_V4, WORKSPACE_VERSION } from "@/application/workspace-backup";
import { asV4, fullBackup, keyPaths } from "./helpers/full-backup";

/*
 * V3-0（PRD §6.3 #59／#60、§11.8）：備份 v4 的欄位清單 verification/revamp-v3/backup-schema-v4.json。
 * V3-9a 起目前版本是 v5（見 backup-schema-v5.json 與 tests/backup-schema-v5.test.ts）；v4 是歷史版本：清單保留不動，
 * 這裡改成驗證「R4–V3-8 寫出的 v4 檔（所有選填欄位都有值）」的欄位仍與清單一致，而且仍可還原。
 * v4 檔由目前的匯出改寫而成（tests/helpers/full-backup.ts 的 asV4：拿掉 v5 才有的 items[].ad_decision、schema_version 改 v4、重算 checksum）。
 * BACKUP_SCHEMA_DUMP=<路徑> 時把本次 v4 檔的路徑寫出。
 */
const SCHEMA = resolve("verification/revamp-v3/backup-schema-v4.json");

describe("V3-0 備份 v4 欄位清單（backup-schema-v4.json；V3-9a 起為歷史版本）", () => {
  it("清單仍標示 v4（歷史版本），目前寫出的是 v5；v4 清單的 key_paths 與一份 v4 檔的欄位完全一致", async () => {
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
    expect(schema.schema_version).toBe(WORKSPACE_V4);
    expect(schema.schema_version).toBe("profitlens-workspace-v4");
    expect(WORKSPACE_VERSION).not.toBe(WORKSPACE_V4);
    expect(schema.restore_accepts).toEqual(["profitlens-workspace-v4", "profitlens-workspace-v3", "profitlens-workspace-v2", "profitlens-workspace-v1"]);
    const text = await asV4(await fullBackup());
    expect(JSON.parse(text).schema_version).toBe(WORKSPACE_V4);
    const paths = [...keyPaths(JSON.parse(text))].sort();
    const dump = process.env.BACKUP_SCHEMA_DUMP;
    if (dump) writeFileSync(dump, JSON.stringify(paths, null, 2));
    expect(paths).toEqual([...schema.key_paths].sort());
    const top = paths.filter(path => !path.includes("."));
    expect(top).toEqual([...schema.top_level_keys].sort());
    expect(paths.filter(path => /^payload\.[^.[]+$/.test(path)).map(path => path.slice("payload.".length)).sort()).toEqual([...schema.payload_keys].sort());
  }, 60_000);

  it("v4 檔仍可還原：ui_prefs 只有 view 與 last_preset 兩欄並原樣讀回；試算敏感度、記住的聲明與待辦狀態日也讀回；沒有廣告決策（undefined）", async () => {
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
    expect(Object.keys(schema.ui_prefs.fields).sort()).toEqual(["last_preset", "view"]);
    const restored = await restoreWorkspaceBackup(await asV4(await fullBackup()));
    expect(restored.ui_prefs).toEqual({ last_preset: "last28", view: "list" });
    expect(restored.scenario_workspace.contexts[0].plans[0].sensitivity).toEqual({ volumes: ["5", "10", "20"] });
    expect(restored.scenario_workspace.assumptions_acknowledged_at).toBe("2026-10-02T06:00:00.000Z");
    expect(schema.scenario_assumptions_acknowledged.path).toBe("payload.scenario_workspace.assumptions_acknowledged_at");
    expect(restored.action_workspace.items[0].status_updated_at).toBe("2026-10-01");
    expect(restored.action_workspace.items[0].ad_decision).toBeUndefined();
    expect(restored.action_workspace.items[0]).not.toHaveProperty("ad_decision");
    expect(restored.meeting_history).toHaveLength(1);
  }, 60_000);

  it("V3-7（D-V3-22）：會議紀錄的 copy_version 是選填的 \"v3\"，finalizeMeeting 寫入、v4 檔還原後讀回", async () => {
    const schema = JSON.parse(readFileSync(SCHEMA, "utf8"));
    expect(schema.meeting_copy_version).toMatchObject({ path: "payload.meeting_history[].copy_version", optional: true, v3_7_addition: true });
    expect(schema.key_paths).toContain(schema.meeting_copy_version.path);
    const restored = await restoreWorkspaceBackup(await asV4(await fullBackup()));
    expect(restored.meeting_history[0].copy_version).toBe("v3");
  }, 60_000);
});
