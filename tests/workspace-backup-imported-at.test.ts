import { readFileSync, writeFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { importedAtMinute } from "@/application/imported-at";
import { exportWorkspaceBackup, restoreWorkspaceBackup, WORKSPACE_V4, WORKSPACE_VERSION } from "@/application/workspace-backup";
import { BACKUP_BYTES_CASES, BACKUP_BYTES_FILE, BACKUP_BYTES_INSTANT, backupTexts, digest, minimalSource } from "./helpers/backup-bytes";
import { asV4, fullBackup, resign } from "./helpers/full-backup";

/*
 * V4-7c（D-V3-30＝A）匯入時間寫進備份：v5 信封加選填 payload.active.imported_at（UTC 到分 "YYYY-MM-DDTHH:MMZ"），版本字串仍是 profitlens-workspace-v5。
 * - 既有匯出位元組不變：tests/fixtures/backup-bytes-v4-7b.json 是 V4-7b 收尾（1e195ba）的程式在固定時間匯出的四份備份（golden、demo、fullBackup、fullBackup＋廣告決策）；
 *   BACKUP_BYTES_WRITE=1 時重寫基準（只在 1e195ba 產生過一次，之後不得重寫）。
 * - 帶匯入時間的匯出與沒有時只差 active.imported_at 一個鍵與 checksum；還原原樣讀回，再匯出不變；沒有此欄位的 v5 與 v1–v4 還原為 null。
 * - 竄改不重算校驗碼 → WORKSPACE_CHECKSUM_MISMATCH；重算校驗碼但格式不對（秒、毫秒、時區位移、不存在的日期、空字串、null、數字），或 v1–v4 信封帶此欄位 → INVALID_WORKSPACE_FORMAT。
 */
const MINUTE = "2026-10-07T06:05Z";
type Body = { schema_version: string; checksum: string; payload: Record<string, unknown> & { active: Record<string, unknown> } };
const parse = (text: string) => JSON.parse(text) as Body;
/** 拿掉 checksum 與 active.imported_at 之後的信封（比對「只差這兩處」用）。 */
function strip(text: string): Body {
  const body = parse(text);
  delete (body as Partial<Body>).checksum;
  delete body.payload.active.imported_at;
  return body;
}

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date(BACKUP_BYTES_INSTANT)); });
afterEach(() => { vi.useRealTimers(); });

describe("V4-7c 既有匯出位元組不變（backup-bytes-v4-7b.json）", () => {
  it("沒有匯入時間的四份備份與 V4-7b 的基準逐位元組相同（位元組數＋SHA-256）", async () => {
    const texts = await backupTexts();
    const cases = Object.fromEntries(BACKUP_BYTES_CASES.map(name => [name, digest(texts[name])]));
    if (process.env.BACKUP_BYTES_WRITE === "1") {
      writeFileSync(BACKUP_BYTES_FILE, `${JSON.stringify({ $comment: "V4-7c 開工前在 V4-7b 收尾的程式（1e195ba，還沒有 imported_at）以固定時間匯出的四份備份：UTF-8 位元組數與 SHA-256。產生方式見 tests/helpers/backup-bytes.ts；tests/workspace-backup-imported-at.test.ts 斷言之後同樣的來源（沒有 imported_at）逐位元組相同。", generated_at_commit: "1e195ba", saved_at: BACKUP_BYTES_INSTANT, cases }, null, 2)}\n`);
    }
    const baseline = JSON.parse(readFileSync(BACKUP_BYTES_FILE, "utf8"));
    expect(baseline.saved_at).toBe(BACKUP_BYTES_INSTANT);
    expect(Object.keys(baseline.cases)).toEqual([...BACKUP_BYTES_CASES]);
    expect(cases).toEqual(baseline.cases);
    for (const name of BACKUP_BYTES_CASES) {
      expect(JSON.parse(texts[name]).saved_at, name).toBe(BACKUP_BYTES_INSTANT);
      expect(JSON.parse(texts[name]).payload.active, name).not.toHaveProperty("imported_at");
    }
  }, 180_000);

  it("imported_at 是 null、空字串或格式不對時不寫這個鍵：golden 的匯出仍與基準逐位元組相同", async () => {
    const baseline = JSON.parse(readFileSync(BACKUP_BYTES_FILE, "utf8"));
    const source = await minimalSource("golden");
    for (const value of [null, undefined, "", "not a date", "2026-10-07T06:05:00", "2026-02-30T06:05Z"]) {
      const text = await exportWorkspaceBackup({ ...source, imported_at: value });
      expect(digest(text), String(value)).toEqual(baseline.cases.golden);
    }
  }, 60_000);
});

describe("V4-7c importedAtMinute：只記到分（UTC）", () => {
  it("秒與毫秒往前捨去到分；時區位移換成 UTC；已是到分的字串原樣（冪等）；Date 也可以", () => {
    expect(importedAtMinute("2026-10-07T06:05:42.123Z")).toBe(MINUTE);
    expect(importedAtMinute("2026-10-07T06:05:59.999Z")).toBe(MINUTE);
    expect(importedAtMinute("2026-10-07T06:05:00Z")).toBe(MINUTE);
    expect(importedAtMinute("2026-10-07T14:05:30+08:00")).toBe(MINUTE);
    expect(importedAtMinute("2026-10-07T14:05+08:00")).toBe(MINUTE);
    expect(importedAtMinute("2026-10-07T02:35:59-03:30")).toBe(MINUTE);
    expect(importedAtMinute("2027-01-01T07:59:59.999+08:00")).toBe("2026-12-31T23:59Z");
    expect(importedAtMinute(MINUTE)).toBe(MINUTE);
    expect(importedAtMinute(importedAtMinute("2026-10-07T14:05:30+08:00")!)).toBe(MINUTE);
    expect(importedAtMinute(new Date(Date.UTC(2026, 9, 7, 6, 5, 42, 123)))).toBe(MINUTE);
    expect(importedAtMinute(new Date(BACKUP_BYTES_INSTANT))).toBe(MINUTE);
    expect(importedAtMinute("2028-02-29T06:05Z")).toBe("2028-02-29T06:05Z");
    expect(importedAtMinute(new Date(Date.UTC(1969, 11, 31, 23, 59, 30)))).toBe("1969-12-31T23:59Z");
  });

  it("無效、空值、沒有時區、不存在的日期或時間、超出四位數年份 → null", () => {
    for (const value of ["", " ", "not a date", "2026-10-07", "2026-10-07T06:05", "2026-10-07T06:05:00", "2026-10-07 06:05Z", "2026-02-30T06:05Z", "2026-02-29T06:05Z", "2026-13-01T06:05Z", "2026-10-07T24:00Z", "2026-10-07T06:60Z", "2026-10-07T06:05:60Z", "2026-10-07T06:05+24:00", "+010000-01-01T00:00Z"]) {
      expect(importedAtMinute(value), JSON.stringify(value)).toBeNull();
    }
    expect(importedAtMinute(new Date(Number.NaN))).toBeNull();
    expect(importedAtMinute(new Date(8.64e15))).toBeNull();
    expect(importedAtMinute(null as unknown as string)).toBeNull();
    expect(importedAtMinute(1696658700000 as unknown as string)).toBeNull();
  });
});

describe("V4-7c 匯出與還原 payload.active.imported_at（v5，選填）", () => {
  it("匯出時正規化到分並寫在 active 的最後一個鍵；還原原樣讀回；再匯出整份逐位元組相同", async () => {
    const source = await minimalSource("golden");
    const text = await exportWorkspaceBackup({ ...source, imported_at: "2026-10-07T14:05:59.999+08:00" });
    const body = parse(text);
    expect(body.schema_version).toBe(WORKSPACE_VERSION);
    expect(body.schema_version).toBe("profitlens-workspace-v5");
    expect(body.payload.active.imported_at).toBe(MINUTE);
    expect(Object.keys(body.payload.active)).toEqual(["source_hash", "filters", "id", "revision", "filenames", "mappings", "imported_at"]);
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.imported_at).toBe(MINUTE);
    expect(restored.restored_schema_version).toBe(WORKSPACE_VERSION);
    const againText = await exportWorkspaceBackup({ ...restored, filters: restored.snapshot.report.scope });
    expect(parse(againText).payload.active).toEqual(body.payload.active);
    expect(againText).toBe(text);
    expect((await restoreWorkspaceBackup(againText)).imported_at).toBe(MINUTE);
  }, 60_000);

  it("沒有匯入時間：不寫這個鍵，還原為 null；再匯出仍沒有", async () => {
    const source = await minimalSource("golden");
    const text = await exportWorkspaceBackup(source);
    expect(parse(text).payload.active).not.toHaveProperty("imported_at");
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.imported_at).toBeNull();
    const again = parse(await exportWorkspaceBackup({ ...restored, filters: restored.snapshot.report.scope }));
    expect(again.payload.active).not.toHaveProperty("imported_at");
  }, 60_000);

  it("帶匯入時間的匯出與基準（同一個固定時間、沒有匯入時間）只差 active.imported_at 與 checksum：golden 與 fullBackup（所有選填欄位都有值）", async () => {
    const baseline = JSON.parse(readFileSync(BACKUP_BYTES_FILE, "utf8"));
    const source = await minimalSource("golden");
    const pairs = [
      { name: "golden", without: await exportWorkspaceBackup(source), with: await exportWorkspaceBackup({ ...source, imported_at: MINUTE }) },
      { name: "full", without: await fullBackup(), with: await fullBackup({ importedAt: "2026-10-07T06:05:42.123Z" }) },
      { name: "full-ad-increase", without: await fullBackup({ adDecision: "increase" }), with: await fullBackup({ adDecision: "increase", importedAt: MINUTE }) },
    ] as const;
    for (const pair of pairs) {
      expect(digest(pair.without), pair.name).toEqual(baseline.cases[pair.name]);
      expect(parse(pair.with).payload.active.imported_at, pair.name).toBe(MINUTE);
      expect(strip(pair.with), pair.name).toEqual(strip(pair.without));
      // 位元組層級：拿掉插入的鍵、換回原本的 checksum，就是基準那份文字。
      const withChecksum = parse(pair.with).checksum, withoutChecksum = parse(pair.without).checksum;
      expect(withChecksum, pair.name).not.toBe(withoutChecksum);
      expect(pair.with.replace(`,"imported_at":"${MINUTE}"`, "").replace(withChecksum, withoutChecksum), pair.name).toBe(pair.without);
    }
  }, 120_000);

  it("竄改匯入時間（或拿掉）而不重算校驗碼 → WORKSPACE_CHECKSUM_MISMATCH；重算校驗碼的合法值可還原", async () => {
    const text = await exportWorkspaceBackup({ ...await minimalSource("golden"), imported_at: MINUTE });
    const changed = parse(text); changed.payload.active.imported_at = "2026-10-07T06:06Z";
    await expect(restoreWorkspaceBackup(JSON.stringify(changed))).rejects.toThrow("WORKSPACE_CHECKSUM_MISMATCH");
    const removed = parse(text); delete removed.payload.active.imported_at;
    await expect(restoreWorkspaceBackup(JSON.stringify(removed))).rejects.toThrow("WORKSPACE_CHECKSUM_MISMATCH");
    expect((await restoreWorkspaceBackup(await resign(changed))).imported_at).toBe("2026-10-07T06:06Z");
    expect((await restoreWorkspaceBackup(await resign(removed))).imported_at).toBeNull();
  }, 60_000);

  it("重算校驗碼但格式不對（秒、毫秒、時區位移、沒有 Z、不存在的日期、空字串、null、數字），或放在 active 以外 → INVALID_WORKSPACE_FORMAT", async () => {
    const text = await exportWorkspaceBackup({ ...await minimalSource("golden"), imported_at: MINUTE });
    for (const value of ["2026-10-07T06:05:00Z", "2026-10-07T06:05:00.000Z", "2026-10-07T14:05+08:00", "2026-10-07T06:05", "2026-02-30T06:05Z", "", null, 1696658700000]) {
      const body = parse(text); body.payload.active.imported_at = value;
      await expect(restoreWorkspaceBackup(await resign(body)), JSON.stringify(value)).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    }
    const misplaced = parse(text); delete misplaced.payload.active.imported_at; misplaced.payload.imported_at = MINUTE;
    await expect(restoreWorkspaceBackup(await resign(misplaced))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    const topLevel = parse(text) as Body & Record<string, unknown>; delete topLevel.payload.active.imported_at; topLevel.imported_at = MINUTE;
    await expect(restoreWorkspaceBackup(await resign(topLevel))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  }, 60_000);
});

describe("V4-7c 舊版本信封：v1–v4 沒有 imported_at（還原為 null），帶此欄位一律 INVALID_WORKSPACE_FORMAT", () => {
  it("v4（R4–V3-8 寫出的檔）：沒有此欄位時還原為 null；重算校驗碼後帶此欄位 → INVALID_WORKSPACE_FORMAT", async () => {
    const v4Text = await asV4(await fullBackup({ importedAt: MINUTE }));
    const v4 = parse(v4Text);
    expect(v4.schema_version).toBe(WORKSPACE_V4);
    expect(v4.payload.active).not.toHaveProperty("imported_at");
    const restored = await restoreWorkspaceBackup(v4Text);
    expect(restored.imported_at).toBeNull();
    expect(restored.restored_schema_version).toBe(WORKSPACE_V4);
    v4.payload.active.imported_at = MINUTE;
    await expect(restoreWorkspaceBackup(await resign(v4))).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
  }, 60_000);

  it("v3、v2、v1：沒有此欄位時還原為 null；重算校驗碼後帶此欄位 → INVALID_WORKSPACE_FORMAT", async () => {
    const source = await minimalSource("golden");
    const v5 = parse(await exportWorkspaceBackup({ ...source, imported_at: MINUTE }));
    // v3：v5 去掉 v4 側邊資料（golden 的最小工作區沒有 R5 之後的選填欄位）。
    const v3 = structuredClone(v5);
    v3.schema_version = "profitlens-workspace-v3";
    for (const key of ["preprocessing", "targets", "events", "meeting_history", "ui_prefs"]) delete v3.payload[key];
    // v1／v2：R0 前的舊格式（active 直接帶 input）。
    const legacy = (version: string) => ({ schema_version: version, metric_version: "contribution-v1", scenario_version: "scenario-v1", saved_at: "2026-10-01T00:00:00.000Z", payload: { active: { input: source.input, filters: source.filters, id: "golden", revision: 1, filenames: {}, mappings: {} } as Record<string, unknown>, decision: null } });
    const envelopes: [string, Body | ReturnType<typeof legacy>][] = [["v3", v3], ["v2", legacy("profitlens-workspace-v2")], ["v1", legacy("profitlens-workspace-v1")]];
    for (const [label, envelope] of envelopes) {
      const without = structuredClone(envelope); delete without.payload.active.imported_at;
      const restored = await restoreWorkspaceBackup(await resign(without as unknown as Record<string, unknown>));
      expect(restored.imported_at, label).toBeNull();
      expect(restored.restored_schema_version, label).toBe(envelope.schema_version);
      const carrying = structuredClone(without); carrying.payload.active.imported_at = MINUTE;
      await expect(restoreWorkspaceBackup(await resign(carrying as unknown as Record<string, unknown>)), label).rejects.toThrow("INVALID_WORKSPACE_FORMAT");
    }
  }, 60_000);
});
