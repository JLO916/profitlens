import { restoreWorkspaceBackup, MAX_WORKSPACE_BYTES } from "./workspace-backup";

const DATABASE_NAME = "profitlens-opt-in-workspace-v1";
const STORE_NAME = "workspace";
const RECORD_KEY = "explicitly-saved";

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
    request.onsuccess = () => resolve(request.result);
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
