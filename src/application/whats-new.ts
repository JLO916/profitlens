import { fill, labels } from "@/i18n";
import { hasLocalWorkspace, type LocalWorkspaceInfo } from "./local-store";

/**
 * V3-2a（F23，PRD §8.9）：「這版改了什麼」提示。
 * - 只對既有 v2 使用者顯示：這台電腦已有本機保存的工作區（IndexedDB），或剛還原了 v1–v4 備份檔。
 * - 新訪客第一次載入時不寫任何東西（localStorage 維持空白）；v3 自己存本機副本時才記為 fresh，之後不再因為本機副本而顯示；還原備份仍會觸發。
 * - 已讀與 fresh 記在 localStorage；讀寫都包 try/catch，讀不到就當作沒記過（最多再顯示一次，不影響功能）。
 */
export const WHATS_NEW_STORAGE_KEY = "profitlens-v3-whats-new";
export type WhatsNewMark = "dismissed" | "fresh";
export type WhatsNewStorage = Pick<Storage, "getItem" | "setItem">;

/** 目前產品讀得懂的 v1–v4 備份 schema（v3 仍寫 v4；V3-9 升 v5 時，v5 不列入）。 */
export const V2_BACKUP_SCHEMAS = ["profitlens-workspace-v1", "profitlens-workspace-v2", "profitlens-workspace-v3", "profitlens-workspace-v4"] as const;

export function isV2BackupSchema(schema: unknown): boolean {
  return typeof schema === "string" && (V2_BACKUP_SCHEMAS as readonly string[]).includes(schema);
}

/** window.localStorage；伺服器端或瀏覽器禁止存取（例如隱私模式、被封鎖的 site data）時回傳 null。 */
export function browserStorage(): WhatsNewStorage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function readWhatsNewMark(storage: WhatsNewStorage | null = browserStorage()): WhatsNewMark | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(WHATS_NEW_STORAGE_KEY);
    return value === "dismissed" || value === "fresh" ? value : null;
  } catch { return null; }
}

/** 寫入成功回傳 true；寫不進去回傳 false（不丟錯）。 */
export function writeWhatsNewMark(mark: WhatsNewMark, storage: WhatsNewStorage | null = browserStorage()): boolean {
  if (!storage) return false;
  try { storage.setItem(WHATS_NEW_STORAGE_KEY, mark); return true; } catch { return false; }
}

/** 本機 IndexedDB 是否已有保存的工作區；讀取失敗一律當作沒有。 */
export async function detectV2Workspace(probe: () => Promise<LocalWorkspaceInfo> = hasLocalWorkspace): Promise<boolean> {
  try { return (await probe()).exists === true; } catch { return false; }
}

/**
 * 首次載入時要不要顯示提示。已關閉或已記為 fresh 時不讀 IndexedDB；
 * 沒有本機工作區時不顯示，也不寫 localStorage（新訪客的瀏覽器維持空白）。
 */
export async function shouldShowWhatsNewOnLoad(storage: WhatsNewStorage | null = browserStorage(), probe: () => Promise<LocalWorkspaceInfo> = hasLocalWorkspace): Promise<boolean> {
  if (readWhatsNewMark(storage) !== null) return false;
  return detectV2Workspace(probe);
}

/**
 * v3 自己把工作區存到這台電腦（使用者已同意本機保存）之後呼叫：還沒有任何標記時記為 fresh，
 * 之後載入就不會把這份本機副本誤判成 v2 資料。已關閉（dismissed）不覆寫。
 */
export function markV3Save(storage: WhatsNewStorage | null = browserStorage()): void {
  if (readWhatsNewMark(storage) === null) writeWhatsNewMark("fresh", storage);
}

/**
 * 還原備份檔之後要不要顯示：備份是 v1–v4，而且使用者還沒關過提示（fresh 也會顯示，因為還原的可能是 v2 的備份）。
 * 還原流程只接受 v1–v4，所以呼叫端不帶 schema 時以 v4 計。
 */
export function shouldShowWhatsNewAfterRestore(schema: unknown = V2_BACKUP_SCHEMAS[V2_BACKUP_SCHEMAS.length - 1], storage: WhatsNewStorage | null = browserStorage()): boolean {
  return isV2BackupSchema(schema) && readWhatsNewMark(storage) !== "dismissed";
}

/** 提示文字：例子取名詞表的「扣廣告前貢獻」與它的第一個舊名（舊名只放在 labels 白名單的 oldNames）。 */
export function whatsNewText(): string {
  const example = labels.glossary.terms.find(term => term.englishKey === "contribution_before_marketing");
  return fill(labels.shell.whatsNew.text, { oldName: example?.oldNames[0] ?? "", newName: example?.term ?? "" });
}
