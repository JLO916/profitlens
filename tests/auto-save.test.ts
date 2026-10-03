import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AUTO_SAVE_DELAY_MS, createAutoSaver, formatSavedDateTime, formatSavedTime, type AutoSaverOptions } from "@/application/auto-save";
import { createDecisionSession, emptyDecisionWorkspace } from "@/application/decision";
import { exportWorkspaceBackup } from "@/application/workspace-backup";
import { createSnapshot, hashInput } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";

/** 可以手動 resolve／reject 的 save，用來模擬「保存進行中」。 */
function deferredSave() {
  const pending: { version: number; resolve: () => void; reject: (error: unknown) => void }[] = [];
  const save = vi.fn((version: number) => new Promise<void>((resolve, reject) => { pending.push({ version, resolve, reject }); }));
  return { save, pending };
}
const AT = new Date("2026-10-03T06:32:00.000Z");
function saver(overrides: Partial<AutoSaverOptions> = {}) {
  const onSaved = vi.fn(); const onError = vi.fn();
  const save = vi.fn(async (version: number) => { void version; });
  const instance = createAutoSaver({ delayMs: AUTO_SAVE_DELAY_MS, save, onSaved, onError, now: () => AT, ...overrides });
  return { instance, save: (overrides.save ?? save) as ReturnType<typeof vi.fn>, onSaved, onError };
}
/** 讓已 resolve 的 promise 鏈（attempt → catch → finally）跑完。 */
const settle = () => vi.advanceTimersByTimeAsync(0);

describe("R6-6 createAutoSaver：debounce 2 秒、同版不重存、失敗不重試", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("uses the 05 §12 delay of 2000 ms", () => {
    expect(AUTO_SAVE_DELAY_MS).toBe(2000);
  });

  it("schedule：1999 ms 不存，第 2000 ms 存一次，並以 now() 回報保存時間", async () => {
    const { instance, save, onSaved, onError } = saver();
    instance.schedule(1);
    expect(instance.pending()).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenLastCalledWith(1);
    await settle();
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved).toHaveBeenCalledWith(1, AT);
    expect(onError).not.toHaveBeenCalled();
    expect(instance.pending()).toBe(false);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("連續 schedule 會重設計時，只存最後一個版本", async () => {
    const { instance, save, onSaved } = saver();
    instance.schedule(1);
    vi.advanceTimersByTime(1500);
    instance.schedule(2);
    vi.advanceTimersByTime(1500);
    instance.schedule(3);
    vi.advanceTimersByTime(1999);
    expect(save).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(save.mock.calls).toEqual([[3]]);
    await settle();
    expect(onSaved.mock.calls).toEqual([[3, AT]]);
  });

  it("保存進行中來了新版本：計時到時先等，前一次完成後立刻再存一次（只存最新版）", async () => {
    const { save, pending } = deferredSave();
    const onSaved = vi.fn();
    const instance = createAutoSaver({ delayMs: 2000, save, onSaved, now: () => AT });
    instance.schedule(1);
    vi.advanceTimersByTime(2000);
    expect(save.mock.calls).toEqual([[1]]);
    instance.schedule(2);
    instance.schedule(3);
    vi.advanceTimersByTime(2000);
    // 第 1 版還沒寫完：不能同時開第二個寫入。
    expect(save.mock.calls).toEqual([[1]]);
    expect(instance.pending()).toBe(true);
    pending[0].resolve();
    await settle();
    expect(save.mock.calls).toEqual([[1], [3]]);
    pending[1].resolve();
    await settle();
    expect(onSaved.mock.calls).toEqual([[1, AT], [3, AT]]);
    expect(instance.pending()).toBe(false);
  });

  it("保存進行中來了新版本、前一次先完成：新版本照自己的 2 秒計時存", async () => {
    const { save, pending } = deferredSave();
    const instance = createAutoSaver({ delayMs: 2000, save });
    instance.schedule(1);
    vi.advanceTimersByTime(2000);
    instance.schedule(2);
    vi.advanceTimersByTime(500);
    pending[0].resolve();
    await settle();
    expect(save.mock.calls).toEqual([[1]]);
    vi.advanceTimersByTime(1499);
    expect(save.mock.calls).toEqual([[1]]);
    vi.advanceTimersByTime(1);
    expect(save.mock.calls).toEqual([[1], [2]]);
    pending[1].resolve();
    await settle();
  });

  it("同一個版本不重存：已存過或正在存的版本再 schedule 都不會再寫", async () => {
    const { save, pending } = deferredSave();
    const instance = createAutoSaver({ delayMs: 2000, save });
    instance.schedule(5);
    vi.advanceTimersByTime(2000);
    instance.schedule(5);
    vi.advanceTimersByTime(5000);
    expect(save).toHaveBeenCalledTimes(1);
    pending[0].resolve();
    await settle();
    instance.schedule(5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(instance.pending()).toBe(false);
    // 正在等計時的新版本被「已存過的版本」取代時，不留下多餘的待存。
    instance.schedule(6);
    instance.schedule(5);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("保存失敗：onError 一次、不重試同一版；下次變更（新版本）再試", async () => {
    const failure = new Error("QUOTA");
    const save = vi.fn(async (version: number) => { if (version === 1) throw failure; });
    const onSaved = vi.fn(); const onError = vi.fn();
    const instance = createAutoSaver({ delayMs: 2000, save, onSaved, onError });
    instance.schedule(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith(failure);
    expect(onSaved).not.toHaveBeenCalled();
    instance.schedule(1);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(save).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledTimes(1);
    instance.schedule(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save.mock.calls).toEqual([[1], [2]]);
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("save 同步丟錯也算失敗（onError），保存器不會卡住", async () => {
    const save = vi.fn((version: number): Promise<void> => { if (version === 1) throw new Error("SYNC"); return Promise.resolve(); });
    const onError = vi.fn(); const onSaved = vi.fn();
    const instance = createAutoSaver({ delayMs: 10, save, onError, onSaved });
    instance.schedule(1);
    await vi.advanceTimersByTimeAsync(10);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(instance.pending()).toBe(false);
    instance.schedule(2);
    await vi.advanceTimersByTimeAsync(10);
    expect(onSaved).toHaveBeenCalledWith(2, expect.any(Date));
  });

  it("onSaved／onError 回呼丟錯不會留下未處理的 rejection，也不會讓後續保存停住", async () => {
    const onSaved = vi.fn(() => { throw new Error("CALLBACK"); });
    const save = vi.fn(async () => undefined);
    const instance = createAutoSaver({ delayMs: 10, save, onSaved });
    instance.schedule(1);
    await vi.advanceTimersByTimeAsync(10);
    instance.schedule(2);
    await vi.advanceTimersByTimeAsync(10);
    await expect(instance.flush()).resolves.toBeUndefined();
    expect(save.mock.calls).toEqual([[1], [2]]);
    expect(instance.pending()).toBe(false);
  });

  it("cancel 清掉計時與待存版本；之後仍可再排程", async () => {
    const { instance, save } = saver();
    instance.schedule(1);
    vi.advanceTimersByTime(1000);
    instance.cancel();
    expect(instance.pending()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
    instance.schedule(2);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save.mock.calls).toEqual([[2]]);
  });

  it("cancel 不中止已開始的寫入，但會丟掉它之後排隊的版本", async () => {
    const { save, pending } = deferredSave();
    const instance = createAutoSaver({ delayMs: 2000, save });
    instance.schedule(1);
    vi.advanceTimersByTime(2000);
    instance.schedule(2);
    vi.advanceTimersByTime(2000);
    instance.cancel();
    expect(instance.pending()).toBe(true);
    pending[0].resolve();
    await settle();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save.mock.calls).toEqual([[1]]);
    expect(instance.pending()).toBe(false);
  });

  it("flush 立刻存待存版本（不等計時）並等寫入完成；沒有待存時不寫", async () => {
    const { instance, save, onSaved } = saver();
    await instance.flush();
    expect(save).not.toHaveBeenCalled();
    instance.schedule(7);
    const flushed = instance.flush();
    expect(save.mock.calls).toEqual([[7]]);
    await flushed;
    expect(onSaved).toHaveBeenCalledWith(7, AT);
    expect(instance.pending()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flush 在保存進行中：等前一次寫完、接著存最新版，兩者都完成才 resolve", async () => {
    const { save, pending } = deferredSave();
    const instance = createAutoSaver({ delayMs: 2000, save });
    instance.schedule(1);
    vi.advanceTimersByTime(2000);
    instance.schedule(2);
    let done = false;
    const flushed = instance.flush().then(() => { done = true; });
    await settle();
    expect(save.mock.calls).toEqual([[1]]);
    pending[0].resolve();
    await settle();
    expect(save.mock.calls).toEqual([[1], [2]]);
    expect(done).toBe(false);
    pending[1].reject(new Error("DENIED"));
    await flushed;
    expect(done).toBe(true);
  });

  it("whenIdle 只等進行中的寫入，不觸發待存版本", async () => {
    const { save, pending } = deferredSave();
    const instance = createAutoSaver({ delayMs: 2000, save });
    await expect(instance.whenIdle()).resolves.toBeUndefined();
    instance.schedule(1);
    vi.advanceTimersByTime(2000);
    instance.schedule(2);
    let idle = false;
    const waiting = instance.whenIdle().then(() => { idle = true; });
    await settle();
    expect(idle).toBe(false);
    pending[0].resolve();
    await waiting;
    expect(idle).toBe(true);
    expect(save.mock.calls).toEqual([[1]]);
    instance.cancel();
  });

  it("不合法的版本號（負數、小數、NaN、超過安全整數）不排程", async () => {
    const { instance, save } = saver();
    for (const version of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1]) instance.schedule(version);
    expect(instance.pending()).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(save).not.toHaveBeenCalled();
    instance.schedule(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(save.mock.calls).toEqual([[0]]);
  });

  it("不合法的延遲時間在建立時就拒絕", () => {
    for (const delayMs of [-1, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => createAutoSaver({ delayMs, save: async () => undefined })).toThrow("AUTO_SAVE_INVALID_DELAY");
    expect(() => createAutoSaver({ delayMs: 0, save: async () => undefined })).not.toThrow();
  });

  it("沒給 now 時以呼叫當下時間回報", async () => {
    vi.setSystemTime(AT);
    const onSaved = vi.fn();
    const instance = createAutoSaver({ delayMs: 2000, save: async () => undefined, onSaved });
    instance.schedule(1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(onSaved).toHaveBeenCalledTimes(1);
    const [, at] = onSaved.mock.calls[0] as [number, Date];
    expect(at.getTime()).toBe(AT.getTime() + 2000);
  });
});

describe("R6-6 頂欄保存時間格式（臺北時間、24 小時制）", () => {
  it("UTC 06:32 → 臺北 14:32；跨午夜補零；23:59", () => {
    expect(formatSavedTime(new Date("2026-10-03T06:32:00Z"))).toBe("14:32");
    expect(formatSavedTime(new Date("2026-10-02T16:05:00Z"))).toBe("00:05");
    expect(formatSavedTime(new Date("2026-10-03T15:59:59Z"))).toBe("23:59");
    expect(formatSavedTime(new Date("2026-10-03T04:07:00Z"))).toBe("12:07");
  });
  it("可指定時區；不合法或不可信的時區字串退回臺北時間", () => {
    const date = new Date("2026-10-03T06:32:00Z");
    expect(formatSavedTime(date, "UTC")).toBe("06:32");
    expect(formatSavedTime(date, "Asia/Tokyo")).toBe("15:32");
    expect(formatSavedTime(date, "Not/AZone")).toBe("14:32");
    expect(formatSavedTime(date, "<img src=x onerror=alert(1)>")).toBe("14:32");
    expect(formatSavedTime(date, "")).toBe("14:32");
  });
  it("無效日期回傳空字串，不丟錯", () => {
    expect(formatSavedTime(new Date("not a date"))).toBe("");
    expect(formatSavedTime(new Date(Number.NaN))).toBe("");
    expect(formatSavedDateTime(new Date("not a date"))).toBe("");
  });
  it("formatSavedDateTime：YYYY-MM-DD hh:mm，跨日以臺北日期為準", () => {
    expect(formatSavedDateTime(new Date("2026-10-03T06:32:00Z"))).toBe("2026-10-03 14:32");
    expect(formatSavedDateTime(new Date("2026-10-02T16:05:00Z"))).toBe("2026-10-03 00:05");
    expect(formatSavedDateTime(new Date("2026-12-31T16:00:00Z"))).toBe("2027-01-01 00:00");
    expect(formatSavedDateTime(new Date("2026-10-03T06:32:00Z"), "UTC")).toBe("2026-10-03 06:32");
  });
});

// ---- local-store：保存時間（另一個 key）與 localWorkspaceSavedAt（不建立資料庫）----
const DATABASE_NAME = "profitlens-opt-in-workspace-v1";
type Listener = (() => void) | null;
interface FakeRequest { result: unknown; onsuccess: Listener; onerror: Listener; onupgradeneeded: Listener; onblocked: Listener }
/** 最小的 IndexedDB 替身：一個資料庫、多個 store；交易在 microtask 完成；唯讀交易寫入會丟錯。 */
function fakeIndexedDb(initial?: Record<string, Record<string, unknown>>) {
  let exists = initial !== undefined;
  const stores = new Map<string, Map<string, unknown>>(Object.entries(initial ?? {}).map(([name, values]) => [name, new Map(Object.entries(values))]));
  const writes: { store: string; key: string; mode: string }[] = [];
  const open = vi.fn((name: string) => {
    expect(name).toBe(DATABASE_NAME);
    const request: FakeRequest = { result: null, onsuccess: null, onerror: null, onupgradeneeded: null, onblocked: null };
    const database = {
      objectStoreNames: { contains: (store: string) => stores.has(store) },
      createObjectStore: (store: string) => { stores.set(store, new Map()); },
      onversionchange: null as Listener,
      close: vi.fn(),
      transaction(storeName: string, mode: string) {
        const transaction = { oncomplete: null as Listener, onerror: null as Listener, onabort: null as Listener, objectStore: () => store };
        const data = stores.get(storeName)!;
        const store = {
          put(value: unknown, key: string) { if (mode !== "readwrite") throw new Error("ReadOnlyError"); writes.push({ store: storeName, key, mode }); data.set(key, value); return { result: key }; },
          get(key: string) { return { result: data.get(key) }; },
          count(key: string) { return { result: data.has(key) ? 1 : 0 }; },
        };
        queueMicrotask(() => transaction.oncomplete?.());
        return transaction;
      },
    };
    request.result = database;
    queueMicrotask(() => {
      exists = true;
      if (!stores.has("workspace") || !stores.has("mapping-memory")) request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  });
  const factory = { open, deleteDatabase: vi.fn(), databases: vi.fn(async () => exists ? [{ name: DATABASE_NAME }] : []) };
  return { factory, stores, writes, open };
}
async function validBackup(): Promise<string> {
  const input = fixture(); const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
  const session = createDecisionSession(dataset, snapshot, 1);
  return exportWorkspaceBackup({ input, filters: snapshot.report.scope, id: "golden", revision: 1, decision: { ...emptyDecisionWorkspace(), captured: session, source_input: input } });
}

describe("R6-6 local-store：保存時間另存一個 key，讀取時不建立資料庫", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); vi.resetModules(); });

  it("沒有本機資料庫時回傳 null，而且不會開啟（建立）資料庫", async () => {
    const fake = fakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.factory);
    const { localWorkspaceSavedAt } = await import("@/application/local-store");
    await expect(localWorkspaceSavedAt()).resolves.toBeNull();
    expect(fake.open).not.toHaveBeenCalled();
  });

  it("瀏覽器不支援 IndexedDB 時回傳 null（不丟錯）", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const { localWorkspaceSavedAt } = await import("@/application/local-store");
    await expect(localWorkspaceSavedAt()).resolves.toBeNull();
  });

  it("saveLocalWorkspace 在同一筆交易寫入保存時間；原本的工作區紀錄內容與格式不變，讀回一致", async () => {
    const text = await validBackup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AT);
    const fake = fakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.factory);
    const { saveLocalWorkspace, loadLocalWorkspace, localWorkspaceSavedAt } = await import("@/application/local-store");
    await saveLocalWorkspace(text);
    expect(fake.writes).toEqual([
      { store: "workspace", key: "explicitly-saved-at", mode: "readwrite" },
      { store: "workspace", key: "explicitly-saved", mode: "readwrite" },
    ]);
    expect(fake.stores.get("workspace")!.get("explicitly-saved")).toBe(text);
    expect(fake.stores.get("workspace")!.get("explicitly-saved-at")).toBe("2026-10-03T06:32:00.000Z");
    await expect(loadLocalWorkspace()).resolves.toBe(text);
    await expect(localWorkspaceSavedAt()).resolves.toBe("2026-10-03T06:32:00.000Z");
    expect(formatSavedDateTime(new Date((await localWorkspaceSavedAt())!))).toBe("2026-10-03 14:32");
    // 讀取保存時間不寫入任何東西。
    expect(fake.writes).toHaveLength(2);
  });

  it("R6 以前存的副本（沒有保存時間）回傳 null", async () => {
    const fake = fakeIndexedDb({ workspace: { "explicitly-saved": "{}" }, "mapping-memory": {} });
    vi.stubGlobal("indexedDB", fake.factory);
    const { localWorkspaceSavedAt } = await import("@/application/local-store");
    await expect(localWorkspaceSavedAt()).resolves.toBeNull();
    expect(fake.open).toHaveBeenCalledTimes(1);
  });

  it("被改過或不可信的保存時間一律視為沒有", async () => {
    for (const value of ["<img src=x onerror=alert(1)>", "2026-10-03", "2026-10-03T06:32:00Z", "9999-99-99T99:99:99.999Z", 1759473120000, null, { at: "2026-10-03T06:32:00.000Z" }, "2026-10-03T06:32:00.000Z".repeat(2)]) {
      vi.resetModules();
      vi.stubGlobal("indexedDB", fakeIndexedDb({ workspace: { "explicitly-saved-at": value }, "mapping-memory": {} }).factory);
      const { localWorkspaceSavedAt } = await import("@/application/local-store");
      await expect(localWorkspaceSavedAt(), String(value)).resolves.toBeNull();
    }
  });

  it("hasLocalWorkspace：沒有本機資料庫時回傳沒有副本，而且不會開啟（建立）資料庫；不支援 IndexedDB 也不丟錯", async () => {
    const fake = fakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.factory);
    const { hasLocalWorkspace } = await import("@/application/local-store");
    await expect(hasLocalWorkspace()).resolves.toEqual({ exists: false, savedAt: null });
    expect(fake.open).not.toHaveBeenCalled();
    vi.resetModules();
    vi.stubGlobal("indexedDB", undefined);
    const again = await import("@/application/local-store");
    await expect(again.hasLocalWorkspace()).resolves.toEqual({ exists: false, savedAt: null });
  });

  it("hasLocalWorkspace：存過之後回傳有副本與保存時間；只讀不寫", async () => {
    const text = await validBackup();
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AT);
    const fake = fakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.factory);
    const { saveLocalWorkspace, hasLocalWorkspace } = await import("@/application/local-store");
    await saveLocalWorkspace(text);
    await expect(hasLocalWorkspace()).resolves.toEqual({ exists: true, savedAt: "2026-10-03T06:32:00.000Z" });
    expect(fake.writes).toHaveLength(2);
  });

  it("hasLocalWorkspace：R6 以前的副本（沒有保存時間）算有副本、時間不明；只有欄位對照記憶不算副本；不可信的時間視為不明", async () => {
    const cases: [Record<string, Record<string, unknown>>, { exists: boolean; savedAt: string | null }][] = [
      [{ workspace: { "explicitly-saved": "{}" }, "mapping-memory": {} }, { exists: true, savedAt: null }],
      [{ workspace: {}, "mapping-memory": { "sales:abc": { key: "sales:abc" } } }, { exists: false, savedAt: null }],
      // 只有時間、沒有紀錄（不應發生）：不算副本。
      [{ workspace: { "explicitly-saved-at": "2026-10-03T06:32:00.000Z" }, "mapping-memory": {} }, { exists: false, savedAt: null }],
      [{ workspace: { "explicitly-saved": "{}", "explicitly-saved-at": "<img src=x onerror=alert(1)>" }, "mapping-memory": {} }, { exists: true, savedAt: null }],
      [{ workspace: { "explicitly-saved": "{}", "explicitly-saved-at": "2026-10-01T06:32:00.000Z" }, "mapping-memory": {} }, { exists: true, savedAt: "2026-10-01T06:32:00.000Z" }],
    ];
    for (const [initial, expected] of cases) {
      vi.resetModules();
      const fake = fakeIndexedDb(initial);
      vi.stubGlobal("indexedDB", fake.factory);
      const { hasLocalWorkspace } = await import("@/application/local-store");
      await expect(hasLocalWorkspace(), JSON.stringify(initial)).resolves.toEqual(expected);
      expect(fake.writes).toEqual([]);
    }
  });

  it("不合法的備份在寫入前就被拒絕：不開資料庫、不寫保存時間", async () => {
    const fake = fakeIndexedDb();
    vi.stubGlobal("indexedDB", fake.factory);
    const { saveLocalWorkspace } = await import("@/application/local-store");
    await expect(saveLocalWorkspace("{")).rejects.toThrow("INVALID_WORKSPACE_JSON");
    expect(fake.open).not.toHaveBeenCalled();
    expect(fake.writes).toEqual([]);
  });
});
