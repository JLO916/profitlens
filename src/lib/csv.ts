/** Per-file product limits, not measured performance guarantees. */
export const MAX_CSV_BYTES = 5 * 1024 * 1024;
export const MAX_CSV_ROWS = 50_000;

export class CsvParseError extends Error {
  constructor(
    public readonly reason_code: string,
    message: string,
    public readonly line: number | null,
    public readonly field = "$record",
  ) {
    super(message);
    this.name = "CsvParseError";
  }
}

export interface ParsedCsv {
  headers: string[];
  headerLine: number;
  rows: { line: number; values: string[] }[];
}

/** Reads CSV as inert text. Line numbers refer to physical source lines, including quoted newlines. */
export function parseCsv(input: string | Uint8Array): ParsedCsv {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : input;
  if (bytes.byteLength > MAX_CSV_BYTES) {
    throw new CsvParseError("FILE_TOO_LARGE", "每份 CSV 不可超過 5 MiB，請縮小資料範圍。", null);
  }
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new CsvParseError("INVALID_UTF8", "CSV 必須使用有效的 UTF-8 編碼。", null);
  }
  if (text.startsWith("\uFEFF")) text = text.slice(1);
  const result: ParsedCsv = { headers: [], headerLine: 1, rows: [] };
  let state: "plain" | "quoted" | "closed" = "plain";
  let field = "";
  let values: string[] = [];
  let line = 1;
  let recordLine = 1;
  let touched = false;

  const finishField = () => {
    values.push(field);
    field = "";
    state = "plain";
  };
  const finishRecord = () => {
    // Blank physical lines are harmless, but quoted empty records remain records.
    if (!touched && values.length === 0 && field === "") return;
    finishField();
    if (result.headers.length === 0) {
      if (values.some((name) => name === "")) {
        throw new CsvParseError("INVALID_HEADER", "CSV 欄名不可空白。", recordLine, "$header");
      }
      const seen = new Set<string>();
      for (const name of values) {
        if (seen.has(name)) throw new CsvParseError("DUPLICATE_COLUMN", "CSV 有重複欄名。", recordLine, name);
        seen.add(name);
      }
      result.headers = values;
      result.headerLine = recordLine;
    } else {
      if (values.length !== result.headers.length) {
        throw new CsvParseError("COLUMN_COUNT_MISMATCH", "CSV 資料欄數與標題欄數不一致。", recordLine);
      }
      if (result.rows.length >= MAX_CSV_ROWS) {
        throw new CsvParseError("ROW_LIMIT_EXCEEDED", "每份 CSV 最多 50,000 筆資料，請縮小資料範圍。", recordLine);
      }
      result.rows.push({ values, line: recordLine });
    }
    values = [];
    touched = false;
  };

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    const isNewline = character === "\n" || character === "\r";
    if (state === "quoted") {
      if (character === '"') {
        if (text[index + 1] === '"') { field += '"'; index += 1; }
        else state = "closed";
      } else if (isNewline) {
        field += character;
        if (character === "\r" && text[index + 1] === "\n") { field += "\n"; index += 1; }
        line += 1;
      } else field += character;
      continue;
    }
    if (character === ",") {
      touched = true;
      finishField();
    } else if (isNewline) {
      finishRecord();
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      line += 1;
      recordLine = line;
    } else if (character === '"' && state === "plain" && field === "") {
      touched = true;
      state = "quoted";
    } else {
      if (state === "closed" || character === '"') {
        throw new CsvParseError("MALFORMED_CSV", "CSV 引號格式錯誤。", recordLine);
      }
      touched = true;
      field += character;
    }
  }
  if (state === "quoted") throw new CsvParseError("MALFORMED_CSV", "CSV 引號未閉合。", recordLine);
  finishRecord();
  if (result.headers.length === 0) throw new CsvParseError("EMPTY_CSV", "CSV 缺少標題列。", 1, "$header");
  return result;
}
