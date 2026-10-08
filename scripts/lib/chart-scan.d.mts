// scripts/lib/chart-scan.mjs 的型別宣告（tsconfig 未開 allowJs，測試匯入時需要；比照 ui-scan.d.mts、copy-scan.d.mts）。
export type ChartLintRule = "CL-1" | "CL-2" | "CL-3" | "CL-4" | "CL-5" | "CL-6" | "CL-7" | "CL-8" | "CL-9" | "CL-10" | "CL-11";
export type AstRule = "CL-2" | "CL-3" | "CL-4" | "CL-5" | "CL-6" | "CL-7" | "CL-8" | "CL-10";
export type SsrRule = "CL-1" | "CL-2" | "CL-9" | "CL-11";

export interface MarkupNode {
  tag: string;
  attrs: Record<string, string>;
  children: MarkupNode[];
  parent: MarkupNode | null;
  text?: string;
}

export const CHART_LINT_RULES: ChartLintRule[];
export const AST_RULES: AstRule[];
export const SSR_RULES: SsrRule[];
export const CHART_SCAN_SCOPE: { chartDirs: string[]; componentsDir: string; sourceDir: string };
export const CHART_PAGES: string[];
export const CHART_PARTS: string[];
export const CHART_TESTID_RE: RegExp;
export const LEGACY_CHART_TESTIDS: string[];
export const LEGACY_CHART_TESTID_PREFIXES: string[];
export function isLegacyChartTestId(id: string): boolean;
export const BANNED_CHART_IMPORTS: string[];
export const LAZY_ONLY_IMPORTS: string[];
export const RECHARTS_SERIES: string[];
export const CHART_SECTION_LIMITS: Record<string, number>;
export const DEFAULT_CHART_SECTION_LIMIT: number;
export const ARIA_HIDDEN_FRAGMENTS: string[];

export function scanChartTsx(text: string, file: string, options?: { lazyLoaded?: Set<string> }): Record<AstRule, string[]>;
export function scanChartVarLiterals(text: string, file: string): string[];
export function lazyLoadedModules(files: { path: string; text: string }[]): Set<string>;
export function scanChartSource(options?: { root?: string }): { violations: Record<AstRule, string[]>; files: { chartDirs: number; components: number }; lazyLoaded: string[] };
export function parseMarkup(html: string): MarkupNode;
export function checkChartMarkup(html: string, context: { page: string }): { violations: Record<SsrRule, string[]>; mainSections: string[]; chartTestIds: string[] };
