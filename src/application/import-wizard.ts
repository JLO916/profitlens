import type { ComparisonMode, FileName, ValidationIssue } from "@/domain/types";
import { dayCount } from "@/domain/date";
import { importColumns, inspectImportFile, prepareImport, type ImportFileDraft, type LocalFilePayload, type PreparedImport } from "./import";
import { proposeImportSettings } from "./import-guidance";
import { indexedDbMappingStore, MemoryMappingStore, recallMapping, rememberMapping, type MappingMemoryEntry, type MappingMemoryInput, type MappingStore } from "./mapping-memory";
import { hasLocalDatabase } from "./local-store";
import { detectPreset, isOrderLevel, suggestMapping, type PresetDetection } from "./source-presets";
import { CONVERTIBLE_FIELDS, DEFAULT_CONVERSION_FIELDS, DEFAULT_TAX_RATE, percentToRate, rateToPercent, type AmountBasisChoice } from "./tax-basis";

// R3 匯入精靈的狀態與純函式：四步（選檔 → 對照欄位 → 口徑與期間 → 檢核與套用）。
// 元件只負責讀檔與渲染；這裡不碰 DOM、不保存任何使用者資料。對外仍透過 PreparedImport 交給 onCommit。

export const FILE_ROLES: readonly FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
export type WizardStep = 1 | 2 | 3 | 4;
export type MappingOrigin = "exact" | "memory" | "preset" | "dictionary" | "manual" | "none";
export type WizardRole = FileName | "manifest.json";

export interface WizardFile {
  draft: ImportFileDraft;
  encoding: "utf8" | "bom";
  origins: Record<string, MappingOrigin>;
  preset: PresetDetection | null;
  memory: MappingMemoryEntry | null;
}
export interface WizardSettings {
  dataset_id: string; data_as_of: string; coverage_start: string; coverage_end: string;
  previous_start: string; previous_end: string; current_start: string; current_end: string;
  comparison_mode: ComparisonMode; channels: string[]; sales_coverage_confirmed: boolean;
}
export interface WizardState {
  step: WizardStep;
  /** 三份檔案欄名全符合標準且沒有多餘欄位時，第 2 步自動完成。 */
  mappingSkipped: boolean;
  files: Partial<Record<FileName, WizardFile>>;
  reading: Partial<Record<WizardRole, boolean>>;
  readIssues: Partial<Record<WizardRole, ValidationIssue[]>>;
  manifestName: string | null;
  basis: AmountBasisChoice | null;
  /** 表單輸入的整數百分比；稅率字串由 percentToRate 推得，不合法時不能確認。 */
  ratePercent: string;
  convertFields: Record<FileName, string[]>;
  settings: WizardSettings;
  settingsSource: "none" | "proposal" | "manifest" | "manual";
  availableChannels: string[];
  confirmed: boolean;
  candidate: PreparedImport | null;
  checking: boolean;
}
export type WizardAction =
  | { type: "reading"; role: WizardRole }
  | { type: "fileRead"; role: FileName; draft: ImportFileDraft; encoding: "utf8" | "bom"; memory: MappingMemoryEntry | null }
  | { type: "fileFailed"; role: WizardRole; issues: ValidationIssue[] }
  | { type: "removeFile"; role: FileName }
  | { type: "manifestRead"; name: string; manifest: Record<string, unknown> }
  | { type: "manifestCleared" }
  | { type: "mapField"; role: FileName; field: string; source: string }
  | { type: "ignoreConfirmed"; role: FileName; value: boolean }
  | { type: "basis"; basis: AmountBasisChoice }
  | { type: "ratePercent"; percent: string }
  | { type: "convertField"; role: FileName; field: string; checked: boolean }
  | { type: "setting"; key: Exclude<keyof WizardSettings, "channels" | "sales_coverage_confirmed">; value: string }
  | { type: "channel"; channel: string; checked: boolean }
  | { type: "monthShortcut" }
  | { type: "goto"; step: WizardStep }
  | { type: "next" }
  | { type: "back" }
  | { type: "confirm" }
  | { type: "checked"; candidate: PreparedImport }
  | { type: "reset" };

const blankSettings = (): WizardSettings => ({ dataset_id: "", data_as_of: "", coverage_start: "", coverage_end: "", previous_start: "", previous_end: "", current_start: "", current_end: "", comparison_mode: "same_days", channels: [], sales_coverage_confirmed: false });
export function initialWizardState(): WizardState {
  return {
    step: 1, mappingSkipped: false, files: {}, reading: {}, readIssues: {}, manifestName: null,
    basis: null, ratePercent: rateToPercent(DEFAULT_TAX_RATE),
    convertFields: Object.fromEntries(FILE_ROLES.map(role => [role, [...DEFAULT_CONVERSION_FIELDS[role]]])) as Record<FileName, string[]>,
    settings: blankSettings(), settingsSource: "none", availableChannels: [], confirmed: false, candidate: null, checking: false,
  };
}

/** 檔名含 sales／cost／ad（或 銷售／費用／廣告）就自動歸位；看不出來回 null。 */
export function roleForFilename(name: string): FileName | null {
  const lower = name.toLowerCase();
  if (/sales|銷售|商品/.test(lower)) return "sales_daily.csv";
  if (/cost|fee|費用|通路/.test(lower)) return "channel_costs_daily.csv";
  if (/(^|[^a-z])ads?([^a-z]|$)|廣告|spend/.test(lower)) return "ad_spend_daily.csv";
  return null;
}
export function detectEncoding(bytes: Uint8Array): "utf8" | "bom" {
  return bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf ? "bom" : "utf8";
}
export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(2)} MB`;
}

/** 預選順序：① 標準欄名完全相同 ② 對照記憶 ③ 來源預設 ④ 中文欄名字典；同一來源欄不重複使用。 */
export function suggestFileMapping(role: FileName, headers: string[], memory: MappingMemoryEntry | null): { mapping: Record<string, string>; origins: Record<string, MappingOrigin>; preset: PresetDetection | null } {
  const preset = detectPreset(headers);
  const suggestion = suggestMapping(role, headers, importColumns[role], preset?.preset);
  const mapping: Record<string, string> = {};
  const origins: Record<string, MappingOrigin> = {};
  const used = new Set<string>();
  const take = (field: string, source: string, origin: MappingOrigin) => { mapping[field] = source; origins[field] = origin; used.add(source); };
  // ① 只有欄名「完全相同」才算 exact；大小寫／空白不同的視為系統建議，仍要確認（04 §2）。
  for (const field of importColumns[role]) if (suggestion.origin[field] === "exact" && suggestion.mapping[field] === field) take(field, suggestion.mapping[field], "exact");
  const same = (left: string, right: string) => left.trim().normalize("NFC") === right.trim().normalize("NFC");
  for (const field of importColumns[role]) {
    if (field in mapping) continue;
    const remembered = memory?.mapping[field];
    const header = remembered ? headers.find(candidate => same(candidate, remembered)) : undefined;
    if (header && !used.has(header)) take(field, header, "memory");
  }
  for (const field of importColumns[role]) {
    if (field in mapping) continue;
    const origin = suggestion.origin[field], source = suggestion.mapping[field];
    if (origin === "exact" && source && !used.has(source)) take(field, source, "dictionary");
    else if ((origin === "preset" || origin === "dictionary") && source && !used.has(source)) take(field, source, origin);
    else { mapping[field] = ""; origins[field] = "none"; }
  }
  return { mapping, origins, preset };
}

export function inspectWizardFile(role: FileName, payload: LocalFilePayload, memory: MappingMemoryEntry | null): WizardFile {
  const draft = inspectImportFile(role, payload);
  const encoding = detectEncoding(payload.bytes);
  if (!draft.parsed) return { draft, encoding, origins: {}, preset: null, memory };
  const suggested = suggestFileMapping(role, draft.parsed.headers, memory);
  return { draft: { ...draft, mapping: suggested.mapping }, encoding, origins: suggested.origins, preset: suggested.preset, memory };
}

export function unusedHeaders(file: WizardFile): string[] {
  if (!file.draft.parsed) return [];
  const used = new Set(Object.values(file.draft.mapping).filter(Boolean));
  return file.draft.parsed.headers.filter(header => !used.has(header));
}
export function missingFields(file: WizardFile): string[] {
  return importColumns[file.draft.file].filter(field => !file.draft.mapping[field]);
}
export function fileBlocked(state: WizardState, role: WizardRole): boolean {
  return (state.readIssues[role] ?? []).some(issue => issue.severity === "blocking") || (role !== "manifest.json" && (state.files[role]?.draft.issues.some(issue => issue.severity === "blocking") ?? false));
}
export function canLeaveFiles(state: WizardState): boolean {
  return FILE_ROLES.every(role => state.files[role]?.draft.parsed && !fileBlocked(state, role)) && !Object.values(state.reading).some(Boolean);
}
/** 第 2 步有事要確認：非完全相同的預選、必填未對、多餘欄位、或偵測到訂單級來源。 */
export function needsMappingStep(state: WizardState): boolean {
  return FILE_ROLES.some(role => {
    const file = state.files[role];
    if (!file?.draft.parsed) return true;
    return Object.values(file.origins).some(origin => origin !== "exact") || missingFields(file).length > 0 || unusedHeaders(file).length > 0 || file.preset !== null;
  });
}
export function canLeaveMapping(state: WizardState): boolean {
  return FILE_ROLES.every(role => { const file = state.files[role]; return !!file?.draft.parsed && missingFields(file).length === 0 && (unusedHeaders(file).length === 0 || file.draft.ignoredColumnsConfirmed); });
}
export function orderLevelFiles(state: WizardState): FileName[] {
  return FILE_ROLES.filter(role => { const preset = state.files[role]?.preset; return preset ? isOrderLevel(preset.preset) : false; });
}

export function shiftDate(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);
}
/** 涵蓋範圍內最後兩個相鄰的完整月份；不足兩個月回 null。 */
export function monthShortcut(coverage: { start: string; end: string }): { previous: { start: string; end: string }; current: { start: string; end: string } } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(coverage.start) || !/^\d{4}-\d{2}-\d{2}$/.test(coverage.end) || coverage.start > coverage.end) return null;
  const months: { start: string; end: string }[] = [];
  let cursor = coverage.start.slice(0, 7) + "-01";
  while (cursor <= coverage.end) {
    const next = new Date(`${cursor}T00:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1, 1);
    const nextStart = next.toISOString().slice(0, 10), end = shiftDate(nextStart, -1);
    if (cursor >= coverage.start && end <= coverage.end) months.push({ start: cursor, end });
    cursor = nextStart;
  }
  if (months.length < 2) return null;
  return { previous: months[months.length - 2], current: months[months.length - 1] };
}
export function proposeSettings(state: WizardState): { settings: WizardSettings; channels: string[] } | null {
  const drafts = Object.fromEntries(FILE_ROLES.flatMap(role => state.files[role] ? [[role, state.files[role]!.draft]] : []));
  const { proposal } = proposeImportSettings(drafts);
  if (!proposal) return null;
  return {
    channels: proposal.channels,
    settings: {
      ...state.settings,
      coverage_start: proposal.coverage_start, coverage_end: proposal.coverage_end,
      // 資料截至日預設＝三檔最大日期＋1 天（04 §2），可改。
      data_as_of: shiftDate(proposal.coverage_end, 1),
      previous_start: proposal.previous_period?.start ?? "", previous_end: proposal.previous_period?.end ?? "",
      current_start: proposal.current_period?.start ?? "", current_end: proposal.current_period?.end ?? "",
      comparison_mode: proposal.comparison_mode, channels: proposal.channels,
      dataset_id: state.settings.dataset_id || defaultDatasetId(proposal.coverage_start, proposal.coverage_end),
    },
  };
}
export function defaultDatasetId(start: string, end: string): string {
  return `import-${start}-${end}`;
}
export function settingsFromManifest(manifest: Record<string, unknown>): WizardSettings {
  const period = (value: unknown): { start: string; end: string } => value && typeof value === "object" ? { start: String((value as { start?: unknown }).start ?? ""), end: String((value as { end?: unknown }).end ?? "") } : { start: "", end: "" };
  const previous = period(manifest.previous_period), current = period(manifest.current_period);
  return {
    dataset_id: String(manifest.dataset_id ?? ""), data_as_of: String(manifest.data_as_of ?? ""), coverage_start: String(manifest.coverage_start ?? ""), coverage_end: String(manifest.coverage_end ?? ""),
    previous_start: previous.start, previous_end: previous.end, current_start: current.start, current_end: current.end,
    comparison_mode: manifest.comparison_mode === "calendar_months" ? "calendar_months" : "same_days",
    channels: Array.isArray(manifest.channels) ? manifest.channels.map(String) : [], sales_coverage_confirmed: manifest.sales_coverage_confirmed === true,
  };
}
export function buildManifest(settings: WizardSettings): Record<string, unknown> {
  return {
    schema_version: "1.0", source_type: "user_provided", currency: "TWD", timezone: "Asia/Taipei",
    dataset_id: settings.dataset_id, data_as_of: settings.data_as_of, coverage_start: settings.coverage_start, coverage_end: settings.coverage_end,
    previous_period: { start: settings.previous_start, end: settings.previous_end }, current_period: { start: settings.current_start, end: settings.current_end },
    channels: settings.channels, sales_coverage_confirmed: settings.sales_coverage_confirmed, comparison_mode: settings.comparison_mode,
    amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income",
  };
}
export function taxRate(state: Pick<WizardState, "ratePercent">): string | null {
  return percentToRate(state.ratePercent);
}
export function conversionFieldsSelected(state: Pick<WizardState, "convertFields">): boolean {
  return FILE_ROLES.some(role => state.convertFields[role].length > 0);
}
export function canConfirm(state: WizardState): boolean {
  return state.basis !== null && state.basis !== "unknown" && (state.basis === "exclusive" || (taxRate(state) !== null && conversionFieldsSelected(state))) && state.settings.channels.length > 0 && canLeaveMapping(state) && !Object.values(state.reading).some(Boolean);
}

/** 檢核：含稅時逐列換算後再交給既有 prepareImport；讀檔錯誤併入問題清單。 */
export function runCheck(state: WizardState): PreparedImport {
  const drafts = Object.fromEntries(FILE_ROLES.flatMap(role => state.files[role] ? [[role, state.files[role]!.draft]] : []));
  const inclusive = state.basis === "inclusive";
  const prepared = prepareImport(buildManifest(state.settings), drafts, {
    amountBasisConfirmed: state.confirmed,
    sourceAmountBasis: inclusive ? "including_tax" : state.basis === "unknown" ? "unknown" : "standard",
    ...(inclusive ? { conversion: { rate: taxRate(state) ?? state.ratePercent, fields: state.convertFields } } : {}),
  });
  const readIssues = Object.values(state.readIssues).flatMap(value => value ?? []);
  if (readIssues.length) {
    prepared.input = null;
    prepared.validation = { ...prepared.validation, dataset: null, classification: "blocking", issues: [...readIssues, ...prepared.validation.issues] };
  }
  return prepared;
}

/** 套用後要記住的對照（每份檔案一筆）；未同意本機保存時由分頁記憶體保存。 */
export function memoryEntries(state: WizardState, usedAt: string): MappingMemoryInput[] {
  return FILE_ROLES.flatMap(role => {
    const file = state.files[role];
    if (!file?.draft.parsed) return [];
    return [{ role, headers: [...file.draft.parsed.headers], mapping: { ...file.draft.mapping }, preset_id: file.preset?.preset.id ?? null, basis: state.basis === "inclusive" ? "inclusive" : "exclusive", rate: state.basis === "inclusive" ? taxRate(state) : null, convert_fields: state.basis === "inclusive" ? [...state.convertFields[role]] : [], used_at: usedAt }];
  });
}
/** 分頁記憶體永遠有一份；使用者已同意本機保存時再寫進 IndexedDB。讀取先查記憶體，再查 IndexedDB（只在本次已同意、或之前已建立本機資料庫時，不會為了讀取新建資料庫）。 */
export function wizardMappingStore(consented: () => boolean, memory: MappingStore = sharedMemoryStore, persistent: MappingStore = indexedDbMappingStore(), persisted: () => Promise<boolean> = hasLocalDatabase): MappingStore {
  return {
    async get(key) { return (await memory.get(key)) ?? (consented() || await persisted() ? await persistent.get(key).catch(() => null) : null); },
    async put(entry) { await memory.put(entry); if (consented()) await persistent.put(entry).catch(() => undefined); },
    async clear() { await memory.clear(); if (consented()) await persistent.clear().catch(() => undefined); },
  };
}
const sharedMemoryStore = new MemoryMappingStore();
/** 「刪除本機資料」時一併清掉分頁記憶體裡的對照記憶（IndexedDB 由 deleteLocalWorkspace 整庫刪除）。 */
export function clearWizardMemory(): Promise<void> { return sharedMemoryStore.clear(); }
export async function recallForRole(store: MappingStore, role: FileName, headers: string[]): Promise<MappingMemoryEntry | null> {
  try { return await recallMapping(store, role, headers); } catch { return null; }
}
export async function rememberAll(store: MappingStore, entries: MappingMemoryInput[]): Promise<void> {
  for (const entry of entries) { try { await rememberMapping(store, entry); } catch { /* 記憶失敗不影響匯入 */ } }
}

/** 第 4 步的前處理摘要。 */
export function mappingSourceSummary(state: WizardState): MappingOrigin[] {
  const origins = new Set<MappingOrigin>();
  for (const role of FILE_ROLES) for (const origin of Object.values(state.files[role]?.origins ?? {})) if (origin !== "none") origins.add(origin);
  return [...origins];
}
export function conversionExample(rate: string): { raw: string; converted: string } {
  return { raw: `${100 + Number(rateToPercent(rate))}.00`, converted: "100.00" };
}

export function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case "reset": return initialWizardState();
    case "reading": return { ...state, reading: { ...state.reading, [action.role]: true }, readIssues: { ...state.readIssues, [action.role]: [] }, candidate: null, confirmed: false };
    case "fileRead": {
      const files = { ...state.files, [action.role]: { draft: action.draft, encoding: action.encoding, origins: {}, preset: null, memory: action.memory } as WizardFile };
      if (action.draft.parsed) { const suggested = suggestFileMapping(action.role, action.draft.parsed.headers, action.memory); files[action.role] = { ...files[action.role]!, draft: { ...action.draft, mapping: suggested.mapping }, origins: suggested.origins, preset: suggested.preset }; }
      return { ...state, files, reading: { ...state.reading, [action.role]: false }, readIssues: { ...state.readIssues, [action.role]: [] }, candidate: null, confirmed: false, settingsSource: state.settingsSource === "proposal" ? "none" : state.settingsSource };
    }
    case "fileFailed": {
      const files = { ...state.files };
      if (action.role !== "manifest.json") delete files[action.role];
      return { ...state, files, reading: { ...state.reading, [action.role]: false }, readIssues: { ...state.readIssues, [action.role]: action.issues }, candidate: null, confirmed: false };
    }
    case "removeFile": {
      const files = { ...state.files }; delete files[action.role];
      return { ...state, files, readIssues: { ...state.readIssues, [action.role]: [] }, candidate: null, confirmed: false, settingsSource: state.settingsSource === "proposal" ? "none" : state.settingsSource };
    }
    case "manifestRead": return { ...state, manifestName: action.name, settings: settingsFromManifest(action.manifest), settingsSource: "manifest", availableChannels: Array.isArray(action.manifest.channels) ? action.manifest.channels.map(String) : state.availableChannels, reading: { ...state.reading, "manifest.json": false }, readIssues: { ...state.readIssues, "manifest.json": [] }, candidate: null, confirmed: false };
    case "manifestCleared": return { ...state, manifestName: null, settingsSource: "none", readIssues: { ...state.readIssues, "manifest.json": [] }, reading: { ...state.reading, "manifest.json": false }, candidate: null, confirmed: false };
    case "mapField": {
      const file = state.files[action.role];
      if (!file) return state;
      const mapping = { ...file.draft.mapping };
      // 同一來源欄只能對一個標準欄位：被搶走的欄位清空。
      for (const [field, source] of Object.entries(mapping)) if (action.source && source === action.source && field !== action.field) { mapping[field] = ""; }
      mapping[action.field] = action.source;
      const origins = { ...file.origins, [action.field]: action.source ? "manual" as const : "none" as const };
      for (const field of Object.keys(mapping)) if (!mapping[field]) origins[field] = "none";
      return { ...state, files: { ...state.files, [action.role]: { ...file, draft: { ...file.draft, mapping, mappingConfirmed: false, ignoredColumnsConfirmed: false }, origins } }, candidate: null, confirmed: false, settingsSource: state.settingsSource === "proposal" ? "none" : state.settingsSource };
    }
    case "ignoreConfirmed": {
      const file = state.files[action.role];
      return file ? { ...state, files: { ...state.files, [action.role]: { ...file, draft: { ...file.draft, ignoredColumnsConfirmed: action.value } } }, candidate: null } : state;
    }
    case "basis": return { ...state, basis: action.basis, candidate: null, confirmed: false };
    case "ratePercent": return { ...state, ratePercent: action.percent, candidate: null, confirmed: false };
    case "convertField": {
      const current = state.convertFields[action.role].filter(field => field !== action.field);
      const next = action.checked ? CONVERTIBLE_FIELDS[action.role].filter(field => field === action.field || current.includes(field)) : current;
      return { ...state, convertFields: { ...state.convertFields, [action.role]: next }, candidate: null, confirmed: false };
    }
    case "setting": return { ...state, settings: { ...state.settings, [action.key]: action.value }, settingsSource: "manual", candidate: null, confirmed: false };
    case "channel": {
      const channels = state.settings.channels.filter(channel => channel !== action.channel);
      const ordered = state.availableChannels.filter(channel => channel === action.channel ? action.checked : channels.includes(channel));
      return { ...state, settings: { ...state.settings, channels: ordered.length ? ordered : action.checked ? [...channels, action.channel] : channels }, settingsSource: "manual", candidate: null, confirmed: false };
    }
    case "monthShortcut": {
      const months = monthShortcut({ start: state.settings.coverage_start, end: state.settings.coverage_end });
      if (!months) return state;
      return { ...state, settings: { ...state.settings, comparison_mode: "calendar_months", previous_start: months.previous.start, previous_end: months.previous.end, current_start: months.current.start, current_end: months.current.end }, settingsSource: "manual", candidate: null, confirmed: false };
    }
    case "goto": return { ...state, step: action.step, candidate: action.step === 4 ? state.candidate : null, checking: false };
    case "back": return state.step === 1 ? state : { ...state, step: (state.step - 1) as WizardStep, candidate: null, checking: false, confirmed: false };
    case "next": {
      if (state.step === 1) {
        if (!canLeaveFiles(state)) return state;
        const skip = !needsMappingStep(state);
        const files = { ...state.files };
        if (skip) for (const role of FILE_ROLES) files[role] = { ...files[role]!, draft: { ...files[role]!.draft, mappingConfirmed: true, ignoredColumnsConfirmed: true } };
        return enterSettings({ ...state, files, mappingSkipped: skip, step: skip ? 3 : 2 });
      }
      if (state.step === 2) {
        if (!canLeaveMapping(state)) return state;
        // 「確認對照，下一步」本身就是對照確認；忽略欄位另有勾選（canLeaveMapping 已檢查）。
        const files = { ...state.files };
        for (const role of FILE_ROLES) files[role] = { ...files[role]!, draft: { ...files[role]!.draft, mappingConfirmed: true } };
        return enterSettings({ ...state, files, mappingSkipped: false, step: 3 });
      }
      return state;
    }
    case "confirm": return canConfirm(state) ? { ...state, confirmed: true, settings: { ...state.settings, sales_coverage_confirmed: true }, step: 4, checking: true, candidate: null } : state;
    case "checked": return { ...state, candidate: action.candidate, checking: false };
  }
}
/** 進入第 3 步：沒有設定檔也沒手改過時，直接把檔案提議填進表單；手改過或讀了設定檔時只更新可勾選的通路清單。 */
function enterSettings(state: WizardState): WizardState {
  const proposed = proposeSettings(state);
  if (state.settingsSource === "manifest" || state.settingsSource === "manual") {
    const channels = [...new Set([...(proposed?.channels ?? []), ...state.settings.channels, ...state.availableChannels])];
    return { ...state, availableChannels: channels };
  }
  return proposed ? { ...state, settings: proposed.settings, availableChannels: proposed.channels, settingsSource: "proposal" } : { ...state, settingsSource: "none" };
}

export { plainIssueMessage } from "./copy";
export function coverageDays(settings: WizardSettings): number | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(settings.coverage_start) && /^\d{4}-\d{2}-\d{2}$/.test(settings.coverage_end) && settings.coverage_start <= settings.coverage_end ? dayCount({ start: settings.coverage_start, end: settings.coverage_end }) : null;
}

/** 訂單明細整理工具說明（docs/ORDER_AGGREGATION.md）；精靈偵測到訂單級檔案時導向這裡。 */
export const ORDER_AGGREGATION_DOC_PATH = "docs/ORDER_AGGREGATION.md";
/** 由 public/docs 提供（與 docs/ 同步，tests/templates.test.ts 把關），公開站與本機都連得到。 */
export const ORDER_AGGREGATION_DOC_URL = "/docs/ORDER_AGGREGATION.md";
/** 含三列示範的範本（public/templates/examples 與 templates/examples 同步，由 tests/templates.test.ts 把關）。 */
export function exampleTemplateUrl(file: FileName | "manifest.json"): string {
  return `/templates/examples/${file}`;
}
