import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { emptyDecisionWorkspace } from "@/application/decision";
import { createSnapshot, hashInput } from "@/application/workspace";
import { exportWorkspaceBackup, type WorkspaceBackupSource } from "@/application/workspace-backup";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./fixtures";
import { fullBackup } from "./full-backup";

/*
 * V4-7c「既有匯出位元組不變」的基準（06_BATCHES V4-7c 驗收重點）：在 V4-7b 收尾的程式（1e195ba，還沒有 imported_at）以固定時間匯出四份備份，
 * 記下每份文字的 UTF-8 位元組數與 SHA-256（tests/fixtures/backup-bytes-v4-7b.json）；V4-7c 之後同樣的來源（沒有 imported_at）必須逐位元組相同。
 * - golden／demo：載入示範或 golden 後直接備份的最小工作區（全部通路、manifest 預設期間、沒有方案與待辦）。
 * - full／full-ad-increase：tests/helpers/full-backup.ts 的 fullBackup()（所有選填欄位都有值）與 fullBackup({ adDecision: "increase" })。
 * saved_at 與會議稿的 created_at 取系統時間：呼叫端先以 vi.useFakeTimers({ toFake: ["Date"] })＋vi.setSystemTime(BACKUP_BYTES_INSTANT) 固定。
 */
export const BACKUP_BYTES_FILE = resolve("tests/fixtures/backup-bytes-v4-7b.json");
export const BACKUP_BYTES_INSTANT = "2026-10-07T06:05:42.123Z";
export const BACKUP_BYTES_CASES = ["golden", "demo", "full", "full-ad-increase"] as const;
export type BackupBytesCase = typeof BACKUP_BYTES_CASES[number];
export interface BackupDigest { bytes: number; sha256: string }

/** 載入示範／golden 後直接備份的工作區（dashboard 的 backupSource 在沒有方案、待辦、會議與側邊資料時的形狀）。 */
export async function minimalSource(name: "golden" | "demo"): Promise<WorkspaceBackupSource> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
  return { input, filters: snapshot.report.scope, id: name, revision: 1, decision: emptyDecisionWorkspace() };
}

export async function backupTexts(): Promise<Record<BackupBytesCase, string>> {
  return {
    golden: await exportWorkspaceBackup(await minimalSource("golden")),
    demo: await exportWorkspaceBackup(await minimalSource("demo")),
    full: await fullBackup(),
    "full-ad-increase": await fullBackup({ adDecision: "increase" }),
  };
}

export function digest(text: string): BackupDigest {
  return { bytes: Buffer.byteLength(text, "utf8"), sha256: createHash("sha256").update(text, "utf8").digest("hex") };
}
