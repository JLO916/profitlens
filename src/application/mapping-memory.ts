import type { FileName } from "@/domain/types";
import { clearMappingMemory, loadMappingMemory, saveMappingMemory } from "./local-store";

/**
 * Column-mapping memory (docs/revamp/04_IMPORT_TW.md §5).
 * Key = SHA-256 over the file role + the normalised header row (trimmed, sorted), so the same headers in a
 * different order recall the same mapping while one extra column is a different file shape.
 * Persisted to IndexedDB only after local-save consent; otherwise MemoryMappingStore keeps it for this tab.
 * Workspace backups never include it (avoids carrying a wrong mapping to another computer).
 * Recall is a suggestion only: the wizard must still require the user to confirm the mapping.
 */
export interface MappingMemoryEntry {
  key: string;
  role: FileName;
  headers: string[];
  /** standard field -> source header（與 ImportFileDraft.mapping 同方向） */
  mapping: Record<string, string>;
  preset_id: string | null;
  basis: "exclusive" | "inclusive" | null;
  rate: string | null;
  convert_fields: string[];
  /** YYYY-MM-DD, local date of the last confirmed use */
  used_at: string;
}

export type MappingMemoryInput = Omit<MappingMemoryEntry, "key"> & { key?: string };

export interface MappingStore {
  get(key: string): Promise<MappingMemoryEntry | null>;
  put(entry: MappingMemoryEntry): Promise<void>;
  clear(): Promise<void>;
}

const FILE_ROLES: readonly FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** Trim (also drops a UTF-8 BOM), NFC-normalise and sort by code unit; deterministic across locales. */
export function normalizeHeaders(headers: readonly string[]): string[] {
  return headers.map(header => header.normalize("NFC").trim()).sort();
}

export async function mappingMemoryKey(role: FileName, headers: readonly string[]): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify([role, normalizeHeaders(headers)]));
  const result = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(result), byte => byte.toString(16).padStart(2, "0")).join("");
}

/** Local calendar date as YYYY-MM-DD for `used_at`. */
export function mappingMemoryDate(now: Date = new Date()): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(item => typeof item === "string");
}

/** Shape check for values read back from storage; anything malformed is treated as "no memory". */
export function isMappingMemoryEntry(value: unknown): value is MappingMemoryEntry {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const entry = value as Record<string, unknown>;
  const mapping = entry.mapping;
  return typeof entry.key === "string" && /^[0-9a-f]{64}$/.test(entry.key)
    && typeof entry.role === "string" && (FILE_ROLES as readonly string[]).includes(entry.role)
    && isStringArray(entry.headers)
    && typeof mapping === "object" && mapping !== null && !Array.isArray(mapping)
    && Object.values(mapping).every(target => typeof target === "string")
    && (entry.preset_id === null || typeof entry.preset_id === "string")
    && (entry.basis === null || entry.basis === "exclusive" || entry.basis === "inclusive")
    && (entry.rate === null || typeof entry.rate === "string")
    && isStringArray(entry.convert_fields)
    && typeof entry.used_at === "string" && ISO_DATE.test(entry.used_at);
}

function cloneEntry(entry: MappingMemoryEntry): MappingMemoryEntry {
  return {
    key: entry.key, role: entry.role, headers: [...entry.headers], mapping: { ...entry.mapping },
    preset_id: entry.preset_id, basis: entry.basis, rate: entry.rate, convert_fields: [...entry.convert_fields], used_at: entry.used_at,
  };
}

/** Tab-memory store: used when the user has not consented to local saving, and in tests. */
export class MemoryMappingStore implements MappingStore {
  private readonly entries = new Map<string, MappingMemoryEntry>();
  async get(key: string): Promise<MappingMemoryEntry | null> {
    const entry = this.entries.get(key);
    return entry === undefined ? null : cloneEntry(entry);
  }
  async put(entry: MappingMemoryEntry): Promise<void> {
    if (!isMappingMemoryEntry(entry)) throw new Error("INVALID_MAPPING_MEMORY");
    this.entries.set(entry.key, cloneEntry(entry));
  }
  async clear(): Promise<void> {
    this.entries.clear();
  }
}

/** IndexedDB-backed store (consented local saving). Opens the database lazily on each call. */
export function indexedDbMappingStore(): MappingStore {
  return {
    async get(key) {
      const value = await loadMappingMemory(key);
      return isMappingMemoryEntry(value) && value.key === key ? cloneEntry(value) : null;
    },
    async put(entry) {
      if (!isMappingMemoryEntry(entry)) throw new Error("INVALID_MAPPING_MEMORY");
      await saveMappingMemory(cloneEntry(entry));
    },
    clear: clearMappingMemory,
  };
}

function sameHeaderSet(left: readonly string[], right: readonly string[]): boolean {
  const a = normalizeHeaders(left); const b = normalizeHeaders(right);
  return a.length === b.length && a.every((header, index) => header === b[index]);
}

/** Returns the remembered mapping for this role + header row, or null when none / mismatched / malformed. */
export async function recallMapping(store: MappingStore, role: FileName, headers: readonly string[]): Promise<MappingMemoryEntry | null> {
  const key = await mappingMemoryKey(role, headers);
  const entry = await store.get(key);
  if (entry === null || entry.key !== key || entry.role !== role || !sameHeaderSet(entry.headers, headers)) return null;
  return entry;
}

/** Stores a confirmed mapping. The key is always recomputed from role + headers; used_at is kept as given. */
export async function rememberMapping(store: MappingStore, entry: MappingMemoryInput): Promise<MappingMemoryEntry> {
  const stored: MappingMemoryEntry = {
    key: await mappingMemoryKey(entry.role, entry.headers),
    role: entry.role, headers: [...entry.headers], mapping: { ...entry.mapping },
    preset_id: entry.preset_id, basis: entry.basis, rate: entry.rate, convert_fields: [...entry.convert_fields], used_at: entry.used_at,
  };
  await store.put(stored);
  return stored;
}
