// scripts/lib/ui-scan.mjs 的型別宣告（tsconfig 未開 allowJs，測試匯入時需要）。
export interface UiScanMetrics {
  hexOutsideRoot: number;
  borderRadiusValues: number;
  fontSizeValues: number;
  letterSpacingNonZero: number;
  decorativeRotate: number;
  jsxArrowTextNodes: number;
  jsxAllCapsEyebrow: number;
  jsxDecorativeChars: number;
  cssDecorativeContent: number;
  buttonRowCentered: number;
  nestedCardSelectors: number;
  linearGradient: number;
  boxShadow: number;
  jsxCjkTextNodes: number;
  cjkStringLiterals: number;
}

export interface UiScanInfo {
  hexGlobalsCss: number;
  hexComponentCss: number;
  hexTsx: number;
  tokenHexDistinct: number;
  borderRadiusValuesExcludingPrint: number;
  fontSizeValuesExcludingPrint: number;
  staticTestIdsDistinct: number;
  staticTestIdOccurrences: number;
  dynamicTestIdAttributes: number;
  staticTestIdProps: number;
  classSelectorsDistinct: number;
  filesScanned: { css: number; tsx: number };
}

export interface UiScanResult {
  metrics: UiScanMetrics;
  info: UiScanInfo;
  details: Record<string, unknown[]>;
}

export const SCAN_SCOPE: { globalsCss: string; componentsDir: string };
export const ROTATE_EXEMPT: { keyframes: string[]; selectors: RegExp[] };
export const NESTED_CARD_EXEMPT_CLASSES: string[];
export const BOX_SHADOW_ALLOWED: string[];
export function parseCss(text: string): { selector: string; context: string[]; declarations: { prop: string; value: string }[] }[];
export function splitSelectors(selector: string): string[];
export function scanCssText(text: string, file: string): Record<string, unknown[]>;
export function scanTsxText(text: string, file: string): Record<string, unknown[]>;
export function scanUi(options?: { root?: string }): UiScanResult;
