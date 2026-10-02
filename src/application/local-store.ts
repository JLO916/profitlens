import { restoreWorkspaceBackup, MAX_WORKSPACE_BYTES } from "./workspace-backup";
import type { MappingMemoryEntry } from "./mapping-memory";

const DATABASE_NAME = "profitlens-opt-in-workspace-v1";
// v1: "workspace" only. v2 (R3): adds "mapping-memory" (column-mapping recall, 04 §5).
const DATABASE_VERSION = 2;
const STORE_NAME = "workspace";
const MAPPING_STORE_NAME = "mapping-memory";
const RECORD_KEY = "explicitly-saved";

function factory(): IDBFactory {
  if (typeof indexedDB === "undefined") throw new Error("LOCAL_STORAGE_UNAVAILABLE");
  return indexedDB;
}
function openDatabase(): Promise<IDBDatabase> {
  // Deliberately called only from an explicit save/load operation, never at module import.
  return new Promise((resolve, reject) => {
    const request = factory().open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      // Additive upgrade: a v1 database keeps its "workspace" store and saved record untouched.
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME);
      if (!database.objectStoreNames.contains(MAPPING_STORE_NAME)) database.createObjectStore(MAPPING_STORE_NAME);
    };
    request.onerror = () => reject(new Error("LOCAL_STORAGE_UNAVAILABLE"));
    request.onblocked = () => reject(new Error("LOCAL_STORAGE_BLOCKED"));
    request.onsuccess = () => {
      // 另一個分頁升版時主動關閉，避免舊分頁卡住新版本（v1 → v2 只加 store，資料不動）。
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
function transact<T>(database: IDBDatabase, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>, storeName: string = STORE_NAME): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const request = operation(transaction.objectStore(storeName));
    transaction.oncomplete = () => { database.close(); resolve(request.result); };
    transaction.onerror = transaction.onabort = () => { database.close(); reject(new Error("LOCAL_STORAGE_WRITE_OR_READ_FAILED")); };
  });
}

/** No autosave: calling this is the UI's explicit, informed persistence action. */
export async function saveLocalWorkspace(text: string): Promise<void> {
  await restoreWorkspaceBackup(text);
  await transact(await openDatabase(), "readwrite", store => store.put(text, RECORD_KEY));
}

/** No auto-restore: returns inert bytes for preview + validation + explicit application. */
export async function loadLocalWorkspace(): Promise<string | null> {
  const value: unknown = await transact(await openDatabase(), "readonly", store => store.get(RECORD_KEY));
  if (value === undefined) return null;
  if (typeof value !== "string") throw new Error("INVALID_WORKSPACE_FORMAT");
  if (value.length > MAX_WORKSPACE_BYTES || new TextEncoder().encode(value).byteLength > MAX_WORKSPACE_BYTES) throw new Error("WORKSPACE_TOO_LARGE");
  return value;
}

/**
 * Removes the entire app-owned local database, including the saved CSV sources.
 * Because it drops the whole database, this also wipes the "mapping-memory" store (04 §5: 「刪除本機資料」同時清除記憶).
 */
export function deleteLocalWorkspace(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory().deleteDatabase(DATABASE_NAME);
    request.onerror = () => reject(new Error("LOCAL_STORAGE_DELETE_FAILED"));
    request.onblocked = () => reject(new Error("LOCAL_STORAGE_BLOCKED"));
    request.onsuccess = () => resolve();
  });
}

/** 使用者之前是否已建立本機資料庫（＝曾同意本機保存）；不會建立資料庫。瀏覽器不支援 databases() 時視為沒有。 */
export async function hasLocalDatabase(): Promise<boolean> {
  try {
    const list = await (factory() as IDBFactory & { databases?: () => Promise<{ name?: string }[]> }).databases?.();
    return Array.isArray(list) && list.some(item => item.name === DATABASE_NAME);
  } catch { return false; }
}

/**
 * Column-mapping memory (04 §5). Callers must only reach these after the user consented to local saving;
 * without consent mapping-memory.ts keeps entries in tab memory instead. Opens the DB only when called.
 * Entries are never part of workspace backups.
 */
export async function saveMappingMemory(entry: MappingMemoryEntry): Promise<void> {
  await transact(await openDatabase(), "readwrite", store => store.put(entry, entry.key), MAPPING_STORE_NAME);
}

/** Returns the raw stored value (or null); mapping-memory.ts validates its shape before use. */
export async function loadMappingMemory(key: string): Promise<unknown> {
  const value: unknown = await transact(await openDatabase(), "readonly", store => store.get(key), MAPPING_STORE_NAME);
  return value === undefined ? null : value;
}

export async function clearMappingMemory(): Promise<void> {
  await transact(await openDatabase(), "readwrite", store => store.clear(), MAPPING_STORE_NAME);
}
