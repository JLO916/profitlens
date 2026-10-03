import { restoreWorkspaceBackup, MAX_WORKSPACE_BYTES } from "./workspace-backup";

const DATABASE_NAME = "profitlens-opt-in-workspace-v1";
const STORE_NAME = "workspace";
const RECORD_KEY = "explicitly-saved";
/** HF-05: separate record so the consented autosave never overwrites a manual copy. */
const AUTOSAVE_KEY = "autosave-current";

export interface AutosaveRecord { schema_version: "profitlens-autosave-v1"; saved_at: string; text: string }

function factory(): IDBFactory {
  if (typeof indexedDB === "undefined") throw new Error("LOCAL_STORAGE_UNAVAILABLE");
  return indexedDB;
}
function openDatabase(): Promise<IDBDatabase> {
  // Deliberately called only from an explicit save/load operation, never at module import.
  return new Promise((resolve, reject) => {
    const request = factory().open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onerror = () => reject(new Error("LOCAL_STORAGE_UNAVAILABLE"));
    request.onblocked = () => reject(new Error("LOCAL_STORAGE_BLOCKED"));
    request.onsuccess = () => {
      // Let an explicit delete proceed instead of being blocked by a short-lived write.
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}
function transact<T>(database: IDBDatabase, mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, mode);
    const request = operation(transaction.objectStore(STORE_NAME));
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

/** Removes the entire app-owned local database, including the saved CSV sources. */
export function deleteLocalWorkspace(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory().deleteDatabase(DATABASE_NAME);
    request.onerror = () => reject(new Error("LOCAL_STORAGE_DELETE_FAILED"));
    request.onblocked = () => reject(new Error("LOCAL_STORAGE_BLOCKED"));
    request.onsuccess = () => resolve();
  });
}

/**
 * HF-05 autosave. Callers must only invoke these after the user granted the
 * autosave consent; nothing here runs at import time or on mount by itself.
 */
export async function saveAutosaveWorkspace(text: string, savedAt: Date = new Date()): Promise<AutosaveRecord> {
  if (new TextEncoder().encode(text).byteLength > MAX_WORKSPACE_BYTES) throw new Error("WORKSPACE_TOO_LARGE");
  const record: AutosaveRecord = { schema_version: "profitlens-autosave-v1", saved_at: savedAt.toISOString(), text };
  await transact(await openDatabase(), "readwrite", store => store.put(record, AUTOSAVE_KEY));
  return record;
}

/** Returns inert bytes; the caller validates them with restoreWorkspaceBackup before use. */
export async function loadAutosaveWorkspace(): Promise<AutosaveRecord | null> {
  const value: unknown = await transact(await openDatabase(), "readonly", store => store.get(AUTOSAVE_KEY));
  if (value === undefined) return null;
  const record = value as Partial<AutosaveRecord> | null;
  if (!record || record.schema_version !== "profitlens-autosave-v1" || typeof record.text !== "string" || typeof record.saved_at !== "string" || Number.isNaN(Date.parse(record.saved_at))) throw new Error("INVALID_WORKSPACE_FORMAT");
  if (record.text.length > MAX_WORKSPACE_BYTES || new TextEncoder().encode(record.text).byteLength > MAX_WORKSPACE_BYTES) throw new Error("WORKSPACE_TOO_LARGE");
  return { schema_version: record.schema_version, saved_at: record.saved_at, text: record.text };
}

/** Mirrors an emptied workspace: removes only the autosave record, keeping any manual copy. */
export async function clearAutosaveWorkspace(): Promise<void> {
  await transact(await openDatabase(), "readwrite", store => store.delete(AUTOSAVE_KEY));
}
