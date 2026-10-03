/**
 * R6-6 預設保存（05 §12、D7＝A）：使用者同意本機保存後，每次變更在 delayMs 內自動保存一次。
 * 純邏輯、不碰 DOM／IndexedDB：實際寫入由呼叫端的 save(version) 負責（workspace-storage.tsx → saveLocalWorkspace），
 * 因此可以用 fake timers 測時序。版本號沿用 Dashboard 的單調遞增 version。
 */

/** 05 §12：每次變更 2 秒內自動保存。 */
export const AUTO_SAVE_DELAY_MS = 2000;

export interface AutoSaverOptions {
  delayMs: number;
  /** 把「目前」工作區存起來，並以 version 標示存的是哪一版；拒絕（reject）視為這次保存失敗。 */
  save: (version: number) => Promise<void>;
  onSaved?: (version: number, at: Date) => void;
  onError?: (error: unknown) => void;
  now?: () => Date;
}

export interface AutoSaver {
  /** 排程保存 version：delayMs 內再呼叫會重設計時（debounce），只存最後一版；同一版不重存（含失敗過的版本，等下次變更再試）。 */
  schedule(version: number): void;
  /** 立刻存目前待存的版本（不等計時），並等到所有進行中與後續保存結束；從不 reject。 */
  flush(): Promise<void>;
  /** 清掉計時與待存版本；已開始的寫入無法中止，會照常完成。之後仍可再 schedule。 */
  cancel(): void;
  /** 有待存版本或保存進行中。 */
  pending(): boolean;
  /** 等到沒有進行中的保存（不觸發新的保存）；「刪除本機資料」先等它，避免刪除後又被寫回。從不 reject。 */
  whenIdle(): Promise<void>;
}

const validVersion = (version: number) => Number.isSafeInteger(version) && version >= 0;

export function createAutoSaver(options: AutoSaverOptions): AutoSaver {
  const { delayMs, save, onSaved, onError, now = () => new Date() } = options;
  if (!Number.isFinite(delayMs) || delayMs < 0) throw new RangeError("AUTO_SAVE_INVALID_DELAY");
  let timer: ReturnType<typeof setTimeout> | null = null;
  /** 最新一個還沒開始存的版本。 */
  let wanted: number | null = null;
  /** 計時已到、但前一次保存還在進行：完成後立刻接著存。 */
  let due = false;
  let inFlight: { version: number; promise: Promise<void> } | null = null;
  /** 最後一次「嘗試過」的版本（成功或失敗都算），同一版不重存。 */
  let lastAttempted: number | null = null;

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }
  async function attempt(version: number): Promise<void> {
    try { await save(version); } catch (error) { onError?.(error); return; }
    onSaved?.(version, now());
  }
  function run(version: number) {
    clearTimer(); wanted = null; due = false; lastAttempted = version;
    // 回呼本身丟錯也不能讓保存器卡住或產生未處理的 rejection。
    const promise: Promise<void> = attempt(version).catch(() => undefined).finally(() => {
      if (inFlight?.promise === promise) inFlight = null;
      if (wanted !== null && due) run(wanted);
    });
    inFlight = { version, promise };
  }
  function fire() {
    timer = null;
    if (wanted === null) return;
    if (inFlight) { due = true; return; }
    run(wanted);
  }
  async function idle(): Promise<void> {
    while (inFlight) await inFlight.promise;
  }
  return {
    schedule(version) {
      if (!validVersion(version)) return;
      // 這一版已在存或已存過（含失敗）：取消較舊的待存計時，什麼都不做。
      if (inFlight ? inFlight.version === version : lastAttempted === version) { clearTimer(); wanted = null; due = false; return; }
      wanted = version; due = false;
      clearTimer();
      timer = setTimeout(fire, delayMs);
    },
    async flush() {
      clearTimer();
      if (wanted !== null) {
        if (inFlight) due = true;
        else run(wanted);
      }
      await idle();
    },
    cancel() { clearTimer(); wanted = null; due = false; },
    pending() { return wanted !== null || inFlight !== null; },
    whenIdle: idle,
  };
}

function timeParts(date: Date, timeZone: string, withDate: boolean): Record<string, string> | null {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  const options: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(withDate ? { year: "numeric", month: "2-digit", day: "2-digit" } : {}) };
  let format: Intl.DateTimeFormat;
  // 不合法的時區字串（例如來自不可信設定）退回臺北時間，不讓畫面因格式化而中斷。
  try { format = new Intl.DateTimeFormat("en-US", { ...options, timeZone }); } catch { format = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "Asia/Taipei" }); }
  return Object.fromEntries(format.formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
}

/** 頂欄「已保存 14:32」的時間：24 小時制 hh:mm（預設臺北時間）。無效日期回傳空字串。 */
export function formatSavedTime(date: Date, timeZone = "Asia/Taipei"): string {
  const parts = timeParts(date, timeZone, false);
  return parts ? `${parts.hour}:${parts.minute}` : "";
}

/** 同意對話框提醒「這台電腦已有 2026-10-01 14:32 保存的工作區」：YYYY-MM-DD hh:mm（預設臺北時間）。無效日期回傳空字串。 */
export function formatSavedDateTime(date: Date, timeZone = "Asia/Taipei"): string {
  const parts = timeParts(date, timeZone, true);
  return parts ? `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}` : "";
}
