/**
 * V4-7c（D-V3-30＝A）：匯入時間只記到分（UTC，"YYYY-MM-DDTHH:MMZ"，例如 "2026-10-07T06:05Z"），只寫進使用者自己的備份檔（payload.active.imported_at，選填）。
 * 獨立的小模組、不依賴 zod：dashboard 在精靈套用時直接呼叫，首載不必帶進 workspace-backup。
 * 字串只接受帶 Z 或 ±hh:mm 的 ISO 日期時間（沒有時區的字串會隨執行環境的時區變動，一律不收），日期要真的存在（不接受 2 月 30 日）；
 * 秒與毫秒捨去（往前取整到分）。無效或空值回傳 null。
 */
const ISO_DATETIME = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?(Z|[+-]\d{2}:\d{2})$/;
const MINUTE_MS = 60_000;

function daysInMonth(year: number, month: number): number {
  if (month === 2) return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

export function importedAtMinute(value: Date | string): string | null {
  let time: number;
  if (value instanceof Date) time = value.getTime();
  else {
    const match = typeof value === "string" ? ISO_DATETIME.exec(value) : null;
    if (!match) return null;
    const [year, month, day, hour, minute, second] = match.slice(1, 7).map(part => Number(part ?? "0"));
    const zone = match[7], offsetHours = zone === "Z" ? 0 : Number(zone.slice(1, 3)), offsetMinutes = zone === "Z" ? 0 : Number(zone.slice(4, 6));
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month) || hour > 23 || minute > 59 || second > 59 || offsetHours > 23 || offsetMinutes > 59) return null;
    const utc = new Date(0);
    utc.setUTCFullYear(year, month - 1, day);
    utc.setUTCHours(hour, minute, 0, 0);
    time = utc.getTime() - (zone.startsWith("-") ? -1 : 1) * (offsetHours * 60 + offsetMinutes) * MINUTE_MS;
  }
  if (!Number.isFinite(time)) return null;
  const text = new Date(Math.floor(time / MINUTE_MS) * MINUTE_MS).toISOString();
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:/.test(text) ? `${text.slice(0, 16)}Z` : null;
}
