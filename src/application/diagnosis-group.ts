import { formatCents, parseCents } from "../domain/money";
import type { Diagnostic, Fact, Metric, RuleCode, Scope } from "../domain/types";
import { labels } from "../i18n";
import { demoAlias, ruleCopy, scopeLabel } from "./copy";
import type { WorkspaceSnapshot } from "./workspace";

// R5-1／R5-2 健檢清單化（docs/revamp/05_FEATURES.md §7）：把 Diagnostic[] 合併成「一個規則一列」。
// 只做呈現與排序；規則、事實、金額與財務公式全部沿用 src/domain，不新增財務指標。

/** 三件事最多幾組。 */
export const TOP_PRIORITY_COUNT = 3;
/** 健檢列 summary 最多顯示幾個範圍標籤，其餘以「等 n 個」帶過。 */
export const SUMMARY_SCOPE_LIMIT = 8;

const BURDEN_RULES: ReadonlySet<RuleCode> = new Set<RuleCode>(["DISCOUNT_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "MARKETING_BURDEN_UP"]);
const MISSING_RULE: RuleCode = "MISSING_CRITICAL_DATA";

/**
 * R1 呈現用「對貢獻影響」：負＝不利、正＝有利；不是新財務指標，定義見 docs/DECISIONS.md（Revamp v2 R1）。
 * 費用類規則的排序金額是「本期費用 − 前期費用」，費用增加對貢獻的影響為其負值；缺漏規則沒有金額。
 * （R5 由 manager-summary.ts 搬來，manager-summary.ts 仍以同名 re-export，對外簽名不變。）
 */
export function contributionImpact(diagnostic: Pick<Diagnostic, "code" | "ranking_amount">): Metric | null {
  if (!diagnostic.ranking_amount || diagnostic.code === MISSING_RULE) return null;
  const cents = parseCents(diagnostic.ranking_amount.value);
  if (cents === null) return { value: null, reason_codes: [...diagnostic.ranking_amount.reason_codes] };
  return { value: formatCents(BURDEN_RULES.has(diagnostic.code) ? -cents : cents), reason_codes: [...diagnostic.ranking_amount.reason_codes] };
}

/** 一個規則在某個範圍（合計／單一通路／單一 SKU）的命中。label 是畫面上的範圍標籤。 */
export interface DiagnosisScope { scope: Scope; label: string; diagnostic: Diagnostic; facts: Fact[]; impact: Metric | null }
/** 同一 RuleCode 合併成的一列；primary＝合計成員，沒有合計時取 |impact| 最大的範圍。 */
export interface DiagnosisGroup {
  rule: RuleCode; headline: string;
  /** primary 的「對貢獻影響」（兩位小數 TWD 字串，負＝不利）；資料缺漏或金額未知為 null。 */
  impact_cents: string | null; impact: Metric | null;
  scopes: DiagnosisScope[]; primary: Diagnostic;
  cause: string; next_step: string; caution: string;
  missing: boolean; fact_ids: string[];
  /** 技術細節用：primary 的排序用已觀察金額差（沿用 diagnostic.ranking_amount）。 */
  ranking_amount: Metric;
}
export interface DiagnosisGroupResult {
  /** 健檢頁：全部 group，資料缺漏置頂，其餘依 |impact_cents| 由大到小，同值依規則代號。 */
  groups: DiagnosisGroup[];
  /** 通過門檻的 group（資料缺漏永遠保留）。 */
  eligible: DiagnosisGroup[];
  /** 三件事：eligible 的前三個。 */
  priorities: DiagnosisGroup[];
  omitted_group_count: number;
  importance_threshold: string;
}

/** 門檻：≥ 0、最多兩位小數的 TWD 金額字串；未提供時為 0.00。不合法一律擲 INVALID_IMPORTANCE_THRESHOLD。 */
export function parseImportanceThreshold(value?: string): bigint {
  let threshold: bigint | null;
  try { threshold = parseCents(value ?? "0.00"); } catch { throw new Error("INVALID_IMPORTANCE_THRESHOLD"); }
  if (threshold === null || threshold < 0n) throw new Error("INVALID_IMPORTANCE_THRESHOLD");
  return threshold;
}

const compareText = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
const abs = (value: bigint) => value < 0n ? -value : value;
const cents = (metric: Metric | null): bigint | null => metric ? parseCents(metric.value) : null;
/** 排序與門檻用的金額：|impact|；未知為 null。 */
export function impactMagnitude(group: Pick<DiagnosisGroup, "impact_cents">): bigint | null {
  const value = parseCents(group.impact_cents);
  return value === null ? null : abs(value);
}

/** 範圍內排序：合計第一，其餘依 |impact| 由大到小，同值依 diagnostic id。 */
function scopeOrder(a: DiagnosisScope, b: DiagnosisScope): number {
  const all = Number(b.scope.kind === "all") - Number(a.scope.kind === "all");
  if (all) return all;
  const aa = abs(cents(a.impact) ?? 0n), bb = abs(cents(b.impact) ?? 0n);
  return aa > bb ? -1 : aa < bb ? 1 : compareText(a.diagnostic.id, b.diagnostic.id);
}
/** 列排序：資料缺漏第一，其餘依 |impact_cents| 由大到小（未知視為 0），同值依規則代號。 */
function groupOrder(a: DiagnosisGroup, b: DiagnosisGroup): number {
  const missing = Number(b.missing) - Number(a.missing);
  if (missing) return missing;
  const aa = impactMagnitude(a) ?? 0n, bb = impactMagnitude(b) ?? 0n;
  return aa > bb ? -1 : aa < bb ? 1 : compareText(a.rule, b.rule);
}

/** 畫面範圍標籤：合計顯示「合計」，通路顯示通路名，SKU 顯示「通路／SKU」（示範資料套 alias）。 */
export function diagnosisScopeLabel(scope: Scope, alias: boolean): string {
  return scope.kind === "all" ? labels.overview.sections.total : scopeLabel(scope, alias);
}

/** summary 只列前 limit 個範圍標籤；more＝其餘個數（0 表示全部列出）。 */
export function summaryScopes(group: Pick<DiagnosisGroup, "scopes">, limit = SUMMARY_SCOPE_LIMIT): { shown: DiagnosisScope[]; more: number } {
  const size = Math.max(0, Math.floor(limit));
  return { shown: group.scopes.slice(0, size), more: Math.max(0, group.scopes.length - size) };
}

/** Presentation-only grouping. Rules, totals, facts and financial formulas stay unchanged. */
export function diagnosisGroups(snapshot: Pick<WorkspaceSnapshot, "report">, options: { importanceThreshold?: string } = {}): DiagnosisGroupResult {
  const threshold = parseImportanceThreshold(options.importanceThreshold);
  const { report } = snapshot;
  const alias = demoAlias(report.dataset_id);
  const factsById = new Map(report.facts.map(fact => [fact.id, fact]));
  const grouped = new Map<RuleCode, Diagnostic[]>();
  for (const diagnostic of report.diagnostics) {
    const members = grouped.get(diagnostic.code) ?? [];
    // A single-channel all-scope signal repeats the very same channel facts.
    const same = members.findIndex(row => row.scope.sku === diagnostic.scope.sku && JSON.stringify(row.scope.channels) === JSON.stringify(diagnostic.scope.channels));
    if (same < 0) members.push(diagnostic);
    else if (diagnostic.scope.kind === "all") members[same] = diagnostic;
    grouped.set(diagnostic.code, members);
  }
  const groups: DiagnosisGroup[] = [...grouped].map(([rule, members]) => {
    const scopes = members.map((diagnostic): DiagnosisScope => ({
      scope: diagnostic.scope, label: diagnosisScopeLabel(diagnostic.scope, alias), diagnostic,
      facts: diagnostic.fact_ids.flatMap(id => factsById.get(id) ?? []), impact: contributionImpact(diagnostic),
    })).sort(scopeOrder);
    const primary = scopes[0];
    const copy = ruleCopy(snapshot, primary.diagnostic, alias);
    const impact = cents(primary.impact);
    return {
      rule, headline: copy.headline, impact_cents: impact === null ? null : formatCents(impact), impact: primary.impact,
      scopes, primary: primary.diagnostic, cause: copy.cause, next_step: copy.nextStep, caution: copy.caution,
      missing: rule === MISSING_RULE, fact_ids: [...new Set(scopes.flatMap(scope => scope.diagnostic.fact_ids))],
      ranking_amount: primary.diagnostic.ranking_amount ?? { value: null, reason_codes: [MISSING_RULE] },
    };
  }).sort(groupOrder);
  const eligible = groups.filter(group => group.missing || (impactMagnitude(group) ?? -1n) >= threshold);
  const priorities = eligible.slice(0, TOP_PRIORITY_COUNT);
  return { groups, eligible, priorities, omitted_group_count: groups.length - priorities.length, importance_threshold: formatCents(threshold) };
}
