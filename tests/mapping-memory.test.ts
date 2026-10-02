import { afterEach, describe, expect, it, vi } from "vitest";
import {
  isMappingMemoryEntry, mappingMemoryDate, mappingMemoryKey, MemoryMappingStore, normalizeHeaders, recallMapping, rememberMapping,
  type MappingMemoryInput,
} from "@/application/mapping-memory";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

const salesHeaders = ["日期", "通路", "商品編號", "類別", "數量", "商品原價", "折扣", "退款", "成本"];
const input = (overrides: Partial<MappingMemoryInput> = {}): MappingMemoryInput => ({
  role: "sales_daily.csv",
  headers: [...salesHeaders],
  mapping: { 日期: "date", 通路: "channel", 商品編號: "sku", 類別: "category", 數量: "units_sold", 商品原價: "gross_sales", 折扣: "discounts", 退款: "refunds", 成本: "cogs_net" },
  preset_id: null,
  basis: "inclusive",
  rate: "0.05",
  convert_fields: ["gross_sales", "discounts", "refunds"],
  used_at: "2026-09-28",
  ...overrides,
});

describe("mappingMemoryKey (04 §5)", () => {
  it("is a 64-char SHA-256 hex and stable across header order and surrounding whitespace/BOM", async () => {
    const key = await mappingMemoryKey("sales_daily.csv", salesHeaders);
    expect(key).toMatch(/^[0-9a-f]{64}$/);
    const shuffled = [...salesHeaders].reverse().map((header, index) => index === 0 ? ` ${header} ` : header);
    shuffled[shuffled.length - 1] = `﻿${shuffled[shuffled.length - 1]}`;
    expect(await mappingMemoryKey("sales_daily.csv", shuffled)).toBe(key);
  });
  it("changes when one extra header is present, when one is missing, or when the role differs", async () => {
    const key = await mappingMemoryKey("sales_daily.csv", salesHeaders);
    expect(await mappingMemoryKey("sales_daily.csv", [...salesHeaders, "備註"])).not.toBe(key);
    expect(await mappingMemoryKey("sales_daily.csv", salesHeaders.slice(1))).not.toBe(key);
    expect(await mappingMemoryKey("channel_costs_daily.csv", salesHeaders)).not.toBe(key);
  });
  it("is not fooled by joining ambiguity between adjacent headers", async () => {
    expect(await mappingMemoryKey("ad_spend_daily.csv", ["a,b", "c"])).not.toBe(await mappingMemoryKey("ad_spend_daily.csv", ["a", "b,c"]));
  });
  it("normalizeHeaders trims and sorts without mutating the input", () => {
    const headers = [" b", "a "];
    expect(normalizeHeaders(headers)).toEqual(["a", "b"]);
    expect(headers).toEqual([" b", "a "]);
  });
});

describe("MemoryMappingStore + recall/remember", () => {
  it("roundtrips a remembered mapping and recalls it for the same headers in another order", async () => {
    const store = new MemoryMappingStore();
    const stored = await rememberMapping(store, input());
    expect(stored.key).toBe(await mappingMemoryKey("sales_daily.csv", salesHeaders));
    const recalled = await recallMapping(store, "sales_daily.csv", [...salesHeaders].reverse());
    expect(recalled).toEqual(stored);
    expect(recalled).not.toBe(stored);
  });
  it("returns null for unknown headers, an extra column, or another role", async () => {
    const store = new MemoryMappingStore();
    await rememberMapping(store, input());
    expect(await recallMapping(store, "sales_daily.csv", ["date", "channel", "ad_spend"])).toBeNull();
    expect(await recallMapping(store, "sales_daily.csv", [...salesHeaders, "備註"])).toBeNull();
    expect(await recallMapping(store, "ad_spend_daily.csv", salesHeaders)).toBeNull();
    expect(await recallMapping(new MemoryMappingStore(), "sales_daily.csv", salesHeaders)).toBeNull();
  });
  it("preserves used_at exactly as given and overwrites with the newer confirmation", async () => {
    const store = new MemoryMappingStore();
    await rememberMapping(store, input({ used_at: "2026-09-28" }));
    expect((await recallMapping(store, "sales_daily.csv", salesHeaders))?.used_at).toBe("2026-09-28");
    await rememberMapping(store, input({ used_at: "2026-10-03", basis: "exclusive", rate: null, convert_fields: [] }));
    const latest = await recallMapping(store, "sales_daily.csv", salesHeaders);
    expect(latest).toMatchObject({ used_at: "2026-10-03", basis: "exclusive", rate: null, convert_fields: [] });
  });
  it("recomputes the key from role + headers instead of trusting a caller-supplied key", async () => {
    const store = new MemoryMappingStore();
    const stored = await rememberMapping(store, input({ key: "0".repeat(64) }));
    expect(stored.key).toBe(await mappingMemoryKey("sales_daily.csv", salesHeaders));
  });
  it("stores copies so later mutation by the caller cannot change the memory", async () => {
    const store = new MemoryMappingStore();
    const entry = input();
    await rememberMapping(store, entry);
    entry.mapping["日期"] = "channel"; entry.headers.push("x");
    const recalled = await recallMapping(store, "sales_daily.csv", salesHeaders);
    expect(recalled?.mapping["日期"]).toBe("date");
    recalled!.mapping["日期"] = "sku";
    expect((await recallMapping(store, "sales_daily.csv", salesHeaders))?.mapping["日期"]).toBe("date");
  });
  it("clear() forgets everything", async () => {
    const store = new MemoryMappingStore();
    await rememberMapping(store, input());
    await store.clear();
    expect(await recallMapping(store, "sales_daily.csv", salesHeaders)).toBeNull();
  });
  it("rejects malformed entries (bad used_at, unknown role, bad basis)", async () => {
    const store = new MemoryMappingStore();
    await expect(rememberMapping(store, input({ used_at: "9/28" }))).rejects.toThrow("INVALID_MAPPING_MEMORY");
    await expect(rememberMapping(store, input({ role: "orders.csv" as never }))).rejects.toThrow("INVALID_MAPPING_MEMORY");
    await expect(rememberMapping(store, input({ basis: "gross" as never }))).rejects.toThrow("INVALID_MAPPING_MEMORY");
  });
});

describe("isMappingMemoryEntry / mappingMemoryDate", () => {
  it("accepts a stored entry and rejects non-objects or missing fields", async () => {
    const entry = await rememberMapping(new MemoryMappingStore(), input());
    expect(isMappingMemoryEntry(entry)).toBe(true);
    expect(isMappingMemoryEntry(null)).toBe(false);
    expect(isMappingMemoryEntry("x")).toBe(false);
    const { used_at: _omit, ...missing } = entry; void _omit;
    expect(isMappingMemoryEntry(missing)).toBe(false);
    expect(isMappingMemoryEntry({ ...entry, mapping: { a: 1 } })).toBe(false);
  });
  it("formats the local calendar date as YYYY-MM-DD", () => {
    expect(mappingMemoryDate(new Date(2026, 8, 5, 23, 59))).toBe("2026-09-05");
  });
});

describe("IndexedDB-backed store boundary (real IndexedDB is browser-only)", () => {
  it("importing mapping-memory does not open the database", async () => {
    const open = vi.fn(); const deleteDatabase = vi.fn();
    vi.stubGlobal("indexedDB", { open, deleteDatabase });
    const mod = await import("@/application/mapping-memory");
    mod.indexedDbMappingStore();
    expect(open).not.toHaveBeenCalled();
    expect(deleteDatabase).not.toHaveBeenCalled();
  });
  it("reports unavailable storage instead of silently succeeding", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const { indexedDbMappingStore } = await import("@/application/mapping-memory");
    const store = indexedDbMappingStore();
    await expect(store.get("0".repeat(64))).rejects.toThrow("LOCAL_STORAGE_UNAVAILABLE");
    await expect(store.clear()).rejects.toThrow("LOCAL_STORAGE_UNAVAILABLE");
  });
  it("opens database version 2 and creates the mapping-memory store alongside workspace on upgrade", async () => {
    const created: string[] = [];
    const existing = new Set(["workspace"]);
    const open = vi.fn((_name: string, version: number) => {
      const database = {
        objectStoreNames: { contains: (name: string) => existing.has(name) },
        createObjectStore: (name: string) => { created.push(name); existing.add(name); },
        transaction: () => { throw new Error("stop"); },
        close: vi.fn(),
      };
      const request: Record<string, unknown> = { result: database, version };
      queueMicrotask(() => { (request.onupgradeneeded as () => void)(); (request.onsuccess as () => void)(); });
      return request;
    });
    vi.stubGlobal("indexedDB", { open });
    const { loadMappingMemory } = await import("@/application/local-store");
    await expect(loadMappingMemory("k")).rejects.toThrow("stop");
    expect(open).toHaveBeenCalledWith("profitlens-opt-in-workspace-v1", 2);
    expect(created).toEqual(["mapping-memory"]);
  });
});
