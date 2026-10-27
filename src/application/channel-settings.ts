import { labels } from "@/i18n";

// V42-1a（PRD §3.1、D-V42-9、13、14）：通路設定的型別、驗證、正規化與名稱解析。純函式、不碰 domain、不含中文字串（示範別名只從 labels 取）。
// 設定只進人讀的文字：CSV 的 channel 欄、AI facts、備份的 active.filters、filter_hash、dataset_hash 一律維持通路代碼。

/** 設定格式的版本（不是算式版本）。 */
export const CHANNEL_SETTINGS_VERSION = "channel-settings-v1";
export interface ChannelSetting { code: string; label?: string; group?: string; order?: number }
export interface ChannelGroup { id: string; label: string; order: number }
export interface ChannelSettings { version: typeof CHANNEL_SETTINGS_VERSION; channels: ChannelSetting[]; groups: ChannelGroup[] }
/** 代碼 → 顯示名稱；只放有顯示名稱的代碼，沒有的由呼叫端退回代碼。 */
export type ChannelNames = Readonly<Record<string, string>>;
/** 群組在快照裡的身分是成員代碼的集合（members 已排序）；id 是設定裡的穩定值，改名不改 id。 */
export interface ResolvedChannelGroup { id: string; label: string; members: string[] }
/** V42-2a：groups＝快照的 channel_groups（沒有設定時 []），讓範圍文字認得群組（copy.ts 的 scopeChannelsLabel、scopeLabel、scopeDetailText）。 */
export interface NameResolver { channel(code: string): string; category(code: string): string; names: ChannelNames; groups: readonly ResolvedChannelGroup[] }
export interface ChannelSettingsValidation { settings: ChannelSettings; droppedCodes: string[]; invalidNames: string[] }

/** v4.1.2 copy.ts 的 demoAlias 的同一條規則（整合後只剩這裡）：dataset_id 以 synthetic-demo 開頭才套示範別名。 */
export function isDemoDataset(datasetId: string): boolean {
  return datasetId.startsWith("synthetic-demo");
}

/** 顯示名稱與群組名沿用通路代碼的四條規則（import-guidance.ts:58）：去頭尾空白後非空、前後沒有空格、≤ 200 字、沒有控制字元。 */
export function isValidChannelName(name: string): boolean {
  return name.trim().length > 0 && name === name.trim() && name.length <= 200 && !/[\u0000-\u001f\u007f]/.test(name);
}
/** V42-2a（PRD §4.1）：通路代碼含控制字元時視為不可分組（精靈不接受這種代碼；手寫 manifest 帶進來的只能單獨看）。群組選項值的前綴是控制字元，所以兩者不會碰撞。 */
export function isGroupableChannelCode(code: string): boolean {
  return !/[\u0000-\u001f\u007f]/.test(code);
}
const nfc = (value: string) => value.normalize("NFC");

/** 示範資料（synthetic-demo*）的隱含預設＝既有 demoChannelAlias；其他資料集沒有顯示名稱；一律不預設群組（D-V42-13）。永遠不寫進備份。 */
export function defaultChannelSettings(datasetId: string, manifestChannels: readonly string[]): ChannelSettings {
  const demo = isDemoDataset(datasetId);
  return {
    version: CHANNEL_SETTINGS_VERSION,
    channels: manifestChannels.map(code => { const label = demo ? labels.data.demoChannelAlias[code] : undefined; return label ? { code, label } : { code }; }),
    groups: [],
  };
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const integerOrUndefined = (value: unknown): number | undefined => typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : undefined;

/**
 * 對 manifest.channels 驗證並清理設定（不受信任的輸入：備份、之後的編輯器）。
 * - 不在 manifest 的代碼整筆丟掉並回報（droppedCodes）；重複的代碼與群組 id 只留第一筆。
 * - 顯示名稱與群組名依四條規則驗證、存成 NFC；不合規則的名稱回報（invalidNames）：通路只丟掉 label，群組整個丟掉（群組沒有名稱就沒有意義）。
 * - 不重複：先把每個 manifest 代碼當成已占用（名稱可以等於自己的代碼，但不可等於別的通路代碼），再依輸入順序接受通路 label、最後是群組名；撞到的丟掉並回報。
 * - group 指到不存在的群組就丟掉；order 強制成整數，不是有限數字就丟掉（群組的 order 缺時用位置）。
 * - V42-2a：代碼含控制字元的通路不可分組，group 丟掉（代碼不是名稱，不列入 invalidNames）。
 */
export function validateChannelSettings(input: unknown, manifestChannels: readonly string[]): ChannelSettingsValidation {
  const droppedCodes: string[] = [], invalidNames: string[] = [];
  const known = new Set(manifestChannels);
  const source = isRecord(input) ? input : {};
  const rawGroups = Array.isArray(source.groups) ? source.groups : [];
  const rawChannels = Array.isArray(source.channels) ? source.channels : [];
  // 第一輪：結構與四條規則。
  const groups: ChannelGroup[] = [];
  const groupIds = new Set<string>();
  rawGroups.forEach((item, index) => {
    if (!isRecord(item) || typeof item.id !== "string" || !item.id.trim() || groupIds.has(item.id)) return;
    if (typeof item.label !== "string" || !isValidChannelName(item.label)) { if (typeof item.label === "string") invalidNames.push(item.label); return; }
    groupIds.add(item.id);
    groups.push({ id: item.id, label: nfc(item.label), order: integerOrUndefined(item.order) ?? index });
  });
  const channels: ChannelSetting[] = [];
  const seen = new Set<string>();
  for (const item of rawChannels) {
    if (!isRecord(item) || typeof item.code !== "string") continue;
    if (!known.has(item.code)) { droppedCodes.push(item.code); continue; }
    if (seen.has(item.code)) continue;
    seen.add(item.code);
    const entry: ChannelSetting = { code: item.code };
    if (typeof item.label === "string") { if (isValidChannelName(item.label)) entry.label = nfc(item.label); else invalidNames.push(item.label); }
    if (typeof item.group === "string" && groupIds.has(item.group) && isGroupableChannelCode(item.code)) entry.group = item.group;
    const order = integerOrUndefined(item.order);
    if (order !== undefined) entry.order = order;
    channels.push(entry);
  }
  // 第二輪：通路與群組之間不重複（NFC 比對）。
  const owners = new Map<string, string>(manifestChannels.map(code => [nfc(code), `channel:${code}`]));
  for (const entry of channels) {
    if (entry.label === undefined) continue;
    const owner = owners.get(entry.label);
    if (owner !== undefined && owner !== `channel:${entry.code}`) { invalidNames.push(entry.label); delete entry.label; continue; }
    owners.set(entry.label, `channel:${entry.code}`);
  }
  const keptGroups = groups.filter(group => {
    if (owners.has(group.label)) { invalidNames.push(group.label); return false; }
    owners.set(group.label, `group:${group.id}`);
    return true;
  });
  const keptIds = new Set(keptGroups.map(group => group.id));
  for (const entry of channels) if (entry.group !== undefined && !keptIds.has(entry.group)) delete entry.group;
  return { settings: { version: CHANNEL_SETTINGS_VERSION, channels, groups: keptGroups }, droppedCodes, invalidNames };
}

/**
 * 與預設比對後的正規化（備份寫出前用）：等於預設的欄位去掉、只剩 code 的通路去掉、沒有成員的群組去掉；什麼都不剩就回 null＝「沒有設定」。
 * 通路依預設（manifest）順序輸出，往返後位元組穩定。
 */
export function normalizeChannelSettings(settings: ChannelSettings, defaults: ChannelSettings): ChannelSettings | null {
  const defaultByCode = new Map(defaults.channels.map(entry => [entry.code, entry]));
  const position = new Map(defaults.channels.map((entry, index) => [entry.code, index]));
  const groupIds = new Set(settings.groups.map(group => group.id));
  const ordered = settings.channels.map((entry, index) => ({ entry, index })).sort((a, b) => (position.get(a.entry.code) ?? Number.POSITIVE_INFINITY) - (position.get(b.entry.code) ?? Number.POSITIVE_INFINITY) || a.index - b.index).map(row => row.entry);
  const channels: ChannelSetting[] = [];
  for (const entry of ordered) {
    const base = defaultByCode.get(entry.code);
    const next: ChannelSetting = { code: entry.code };
    if (entry.label !== undefined && entry.label !== base?.label) next.label = entry.label;
    if (entry.group !== undefined && groupIds.has(entry.group) && entry.group !== base?.group) next.group = entry.group;
    if (entry.order !== undefined && entry.order !== base?.order) next.order = entry.order;
    if (Object.keys(next).length > 1) channels.push(next);
  }
  const used = new Set(channels.flatMap(entry => entry.group === undefined ? [] : [entry.group]));
  const groups = settings.groups.filter(group => used.has(group.id)).map(group => ({ id: group.id, label: group.label, order: group.order }));
  if (channels.length === 0 && groups.length === 0) return null;
  return { version: CHANNEL_SETTINGS_VERSION, channels, groups };
}

/** 代碼 → 顯示名稱：預設（示範別名）疊上設定的 label；只放有名稱的代碼，呼叫端沒有名稱時退回代碼。 */
export function resolveChannelNames(settings: ChannelSettings | null | undefined, datasetId: string, manifestChannels: readonly string[]): ChannelNames {
  const names: Record<string, string> = {};
  for (const entry of defaultChannelSettings(datasetId, manifestChannels).channels) if (entry.label) names[entry.code] = entry.label;
  const known = new Set(manifestChannels);
  for (const entry of settings?.channels ?? []) if (entry.label && known.has(entry.code)) names[entry.code] = entry.label;
  return names;
}

/** 群組依成員集合解析（成員排序，與輸入順序無關）；沒有成員的群組不出現；依 order 再 id 排序。V42-2a：代碼含控制字元的通路不列為成員。 */
export function resolveChannelGroups(settings: ChannelSettings | null | undefined, manifestChannels: readonly string[]): ResolvedChannelGroup[] {
  if (!settings) return [];
  const known = new Set(manifestChannels);
  return [...settings.groups]
    .sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map(group => ({ id: group.id, label: group.label, members: settings.channels.filter(entry => entry.group === group.id && known.has(entry.code) && isGroupableChannelCode(entry.code)).map(entry => entry.code).sort() }))
    .filter(group => group.members.length > 0);
}

/** manifest 的通路依 order 穩定排序（沒有 order 的排在有 order 的後面），同序時依代碼。 */
export function orderedChannels(settings: ChannelSettings | null | undefined, manifestChannels: readonly string[]): string[] {
  const order = new Map<string, number>();
  for (const entry of settings?.channels ?? []) if (entry.order !== undefined) order.set(entry.code, entry.order);
  const key = (code: string) => order.get(code) ?? Number.POSITIVE_INFINITY;
  return [...manifestChannels].sort((a, b) => key(a) - key(b) || (a < b ? -1 : a > b ? 1 : 0));
}

/** 名稱解析器：channel(code)＝names[code] 或代碼；category 只有示範資料套既有 demoCategoryAlias。names 沒給時用該資料集的隱含預設。V42-2a：第 3 個參數 groups（快照的 channel_groups；預設 []）。 */
export function makeResolver(names: ChannelNames | undefined, datasetId: string, groups: readonly ResolvedChannelGroup[] = []): NameResolver {
  const demo = isDemoDataset(datasetId);
  const map: ChannelNames = names ?? (demo ? labels.data.demoChannelAlias : {});
  return {
    names: map,
    groups,
    channel: code => map[code] || code,
    category: code => (demo && labels.data.demoCategoryAlias[code]) || code,
  };
}

/**
 * 給 createSnapshot 用：設定先對 manifest 驗證、再與預設正規化；與預設沒有差就回 null（快照不帶 channel_names／channel_groups，與 v4.1.2 相同），
 * 否則回解析好的名稱與群組。
 */
export function snapshotChannelFields(settings: ChannelSettings | null | undefined, datasetId: string, manifestChannels: readonly string[]): { channel_names: ChannelNames; channel_groups: ResolvedChannelGroup[] } | null {
  if (!settings) return null;
  const normalized = normalizeChannelSettings(validateChannelSettings(settings, manifestChannels).settings, defaultChannelSettings(datasetId, manifestChannels));
  if (!normalized) return null;
  return { channel_names: resolveChannelNames(normalized, datasetId, manifestChannels), channel_groups: resolveChannelGroups(normalized, manifestChannels) };
}

// ── V42-2a（PRD §4.1、§4.2；D-V42-10）：群組查找、期間列選項值的編碼與選取值。純函式、不含中文；沒有 Scope.kind "group"（D-V42-12），群組只是成員代碼的集合。

/** channels 的集合恰好等於某群組 members 的集合（排序後逐一比對；空陣列回 null）。 */
export function findGroupByMembers(groups: readonly ResolvedChannelGroup[], channels: readonly string[]): ResolvedChannelGroup | null {
  const wanted = [...new Set(channels)].sort();
  if (wanted.length === 0) return null;
  return groups.find(group => { const members = [...new Set(group.members)].sort(); return members.length === wanted.length && members.every((code, index) => code === wanted[index]); }) ?? null;
}
/** 成員含 code 的群組（一個通路至多屬於一個群組）；不在任何群組回 null。 */
export function findGroupOfChannel(groups: readonly ResolvedChannelGroup[], code: string): ResolvedChannelGroup | null {
  return groups.find(group => group.members.includes(code)) ?? null;
}
/** 期間列群組選項值的前綴（控制字元；通路代碼不含控制字元——isValidChannelName、isGroupableChannelCode——所以不會與任何代碼碰撞）。 */
export const GROUP_OPTION_PREFIX = "\u0001";
/** 範圍是子集但沒有對應群組時的只讀選項值（同樣以控制字元開頭）。 */
export const SUBSET_OPTION_VALUE = "\u0002subset";
export function groupOptionValue(groupId: string): string {
  return GROUP_OPTION_PREFIX + groupId;
}
/** 有前綴才回群組 id；通路代碼、空字串（全部通路）與子集選項值都回 null。 */
export function groupIdOfOption(value: string): string | null {
  if (!value.startsWith(GROUP_OPTION_PREFIX)) return null;
  const id = value.slice(GROUP_OPTION_PREFIX.length);
  return id.length > 0 ? id : null;
}
/** 期間列的選取值：範圍的通路集合對到全部、單一通路、某個群組，或都不是的子集（count＝通路數）。 */
export type ChannelSelection = { kind: "all" } | { kind: "channel"; code: string } | { kind: "group"; group: ResolvedChannelGroup } | { kind: "subset"; count: number };
/**
 * 優先順序（PRD §4.1）：(1) 恰好一個 → channel（就算該通路自己是只有一個成員的群組；只有一個通路的資料集也顯示那個通路，與 v4.1.3 相同——說明媒體 import-wizard 的 apply 畫格靠這條不變）；
 * (2) 集合等於 allChannels 的集合 → all（就算有群組包含全部通路）；(3) findGroupByMembers 命中 → group；(4) 其餘 → subset。
 */
export function channelSelection(channels: readonly string[], allChannels: readonly string[], groups: readonly ResolvedChannelGroup[]): ChannelSelection {
  const selected = new Set(channels);
  const everything = new Set(allChannels);
  if (selected.size === 1) return { kind: "channel", code: [...selected][0] };
  if (selected.size > 0 && selected.size === everything.size && [...everything].every(code => selected.has(code))) return { kind: "all" };
  const group = findGroupByMembers(groups, channels);
  if (group) return { kind: "group", group };
  return { kind: "subset", count: selected.size };
}
