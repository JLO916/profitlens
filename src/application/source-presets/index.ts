/**
 * Source preset detection and mapping suggestions for the import wizard (04_IMPORT_TW §4).
 * Pure functions: no I/O, no module-level user data. Suggestions are pre-selections only;
 * the wizard still requires the user to confirm the mapping.
 */
import type { FileName } from "@/domain/types";
import { dictionaryField, headerKey } from "./dictionary";
import { SOURCE_PRESETS, type SourcePreset } from "./presets";

export { HEADER_DICTIONARY, dictionaryField, headerKey, type StandardField } from "./dictionary";
export { SOURCE_PRESETS, type PresetGrain, type SourcePreset, type SourcePresetId } from "./presets";

export type MappingOrigin = "exact" | "preset" | "dictionary" | "none";

export interface PresetDetection {
  preset: SourcePreset;
  /** Fingerprint names (as written in the preset) found in the header row. */
  matched: string[];
}

export interface MappingSuggestion {
  /** standard field → source header ("" when unmapped). */
  mapping: Record<string, string>;
  origin: Record<string, MappingOrigin>;
}

export function getPreset(id: string): SourcePreset | null {
  return SOURCE_PRESETS.find(preset => preset.id === id) ?? null;
}

/**
 * Returns the preset whose fingerprint has at least two names in `headers`
 * (case / whitespace / full-width insensitive). Several hits → most matches wins,
 * then the larger share of its fingerprint, then list order.
 */
/** 指紋比對用：在 headerKey 之外再去掉【註】、冒號後的說明與 TG／TM／TS 單號標記（「購物車編號 TG:單號」「賣場負擔優惠券【註1】」也要命中）。 */
export function fingerprintKey(header: string): string {
  return headerKey(header.replace(/【[^】]*】/g, "").replace(/[:：].*$/, "").replace(/\s+\(?(TG|TM|TS)\)?\s*$/i, ""));
}

export function detectPreset(headers: string[]): PresetDetection | null {
  const keys = new Set(headers.map(fingerprintKey).filter(Boolean));
  let best: (PresetDetection & { share: number }) | null = null;
  for (const preset of SOURCE_PRESETS) {
    const matched = preset.fingerprint.filter(name => keys.has(fingerprintKey(name)));
    // 第一個指紋欄（訂單編號／主單編號／商品編號／Day）必須命中，避免日粒度檔案只因「結帳日＋手續費」之類的常見欄名被誤判為訂單級。
    if (matched.length < 2 || !keys.has(fingerprintKey(preset.fingerprint[0]))) continue;
    const share = matched.length / preset.fingerprint.length;
    if (!best || matched.length > best.matched.length || (matched.length === best.matched.length && share > best.share)) best = { preset, matched, share };
  }
  return best ? { preset: best.preset, matched: best.matched } : null;
}

/** Order and settlement exports must be aggregated before import; daily campaign reports need channel assignment only. */
export function isOrderLevel(preset: SourcePreset): boolean {
  return preset.grain !== "daily_campaign";
}

/**
 * Suggests a standard-field → source-header mapping.
 * Precedence: exact standard name → preset candidate → generic dictionary.
 * A source header is never used for two standard fields; unmapped fields get "" / "none".
 */
export function suggestMapping(role: FileName, headers: string[], standardFields: readonly string[], preset?: SourcePreset | null): MappingSuggestion {
  const mapping: Record<string, string> = Object.fromEntries(standardFields.map(field => [field, ""]));
  const origin: Record<string, MappingOrigin> = Object.fromEntries(standardFields.map(field => [field, "none" as MappingOrigin]));
  const used = new Set<number>();
  const assign = (field: string, index: number, how: MappingOrigin) => { mapping[field] = headers[index]; origin[field] = how; used.add(index); };
  const free = (predicate: (header: string) => boolean) => headers.findIndex((header, index) => !used.has(index) && predicate(header));

  // ① exact standard name: strict match first, then the normalized key.
  for (const field of standardFields) {
    let index = free(header => header === field);
    if (index < 0) index = free(header => headerKey(header) === headerKey(field));
    if (index >= 0) assign(field, index, "exact");
  }
  // ② preset candidates, in the preset's preference order.
  const candidates = preset?.columns[role] ?? {};
  for (const field of standardFields) {
    if (origin[field] !== "none") continue;
    for (const candidate of candidates[field] ?? []) {
      const index = free(header => headerKey(header) === headerKey(candidate));
      if (index >= 0) { assign(field, index, "preset"); break; }
    }
  }
  // ③ generic Chinese header dictionary.
  for (const field of standardFields) {
    if (origin[field] !== "none") continue;
    const index = free(header => dictionaryField(header) === field);
    if (index >= 0) assign(field, index, "dictionary");
  }
  return { mapping, origin };
}
