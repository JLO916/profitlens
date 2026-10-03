/**
 * HF-05 autosave consent. The consent flag lives in localStorage so that the
 * app can check it on open without creating an IndexedDB database for users
 * who never agreed. Workspace data itself is only written after consent.
 */
export const AUTOSAVE_CONSENT_KEY = "profitlens-autosave-consent";
const GRANTED = "granted-v1";

function storage(): Storage | null {
  try { return typeof localStorage === "undefined" ? null : localStorage; } catch { return null; }
}

export function readAutosaveConsent(): boolean {
  try { return storage()?.getItem(AUTOSAVE_CONSENT_KEY) === GRANTED; } catch { return false; }
}

/** Returns false when the browser refuses storage, so the UI never claims a save it cannot make. */
export function grantAutosaveConsent(): boolean {
  const target = storage();
  if (!target) return false;
  try { target.setItem(AUTOSAVE_CONSENT_KEY, GRANTED); return target.getItem(AUTOSAVE_CONSENT_KEY) === GRANTED; } catch { return false; }
}

export function revokeAutosaveConsent(): void {
  try { storage()?.removeItem(AUTOSAVE_CONSENT_KEY); } catch { /* storage already unavailable: nothing persisted */ }
}

/** "已保存 08:02" style clock text in Asia/Taipei, the app's business timezone. */
export function formatSavedClock(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "--:--";
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Taipei", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date);
  const hour = parts.find(part => part.type === "hour")?.value ?? "--";
  const minute = parts.find(part => part.type === "minute")?.value ?? "--";
  return `${hour}:${minute}`;
}
