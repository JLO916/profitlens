// scripts/lib/copy-scan.mjs 的型別宣告（tsconfig 未開 allowJs，測試匯入時需要）。
export interface CopyScanMetrics {
  noticePrefix: number;
  noticeAnywhere: number;
  arrows: number;
  circledNumbers: number;
  decorativeChars: number;
  exclamations: number;
  emoji: number;
  allCaps: number;
  pipes: number;
  blacklistSynonym: number;
  blacklistJargon: number;
  blacklistTone: number;
  blacklistEmotion: number;
  placeholderMalformed: number;
  placeholderVariantMismatch: number;
  l1ClauseOverLimit: number;
}

export interface CopyScanResult {
  metrics: CopyScanMetrics;
  details: Record<string, unknown>;
}

export const BLACKLIST: Record<"synonym" | "jargon" | "tone" | "emotion", [string, RegExp, { raw?: boolean }?][]>;
export const PLACEHOLDER_VARIANT_SUFFIXES: string[];
export const L1_KEY_PATTERNS: RegExp[];
export const L1_MAX_CJK: number;
export interface LabelScopeMeta {
  LABEL_GROUPS: readonly string[];
  LEGACY_SECTIONS: readonly string[];
  legacyAliases: Readonly<Record<string, string>>;
}

export function isWhitelisted(path: string): boolean;
export function labelScope(labels: unknown, meta?: LabelScopeMeta): { view: Record<string, unknown>; oldPathsOf: (path: string) => string[]; matches: (path: string, predicate: (path: string) => boolean) => boolean };
export function labelEntries(labels: unknown): [string, string][];
export function channelAliasTerms(labels: unknown): string[];
export function l1ClauseLengths(text: string, aliasTerms?: string[]): number[];
export function scanLabels(labels: unknown, meta?: LabelScopeMeta): CopyScanResult;
