import { z } from "zod";
import { isBusinessDate } from "../domain/date";
import { formatCents, parseCents } from "../domain/money";
import type { ComparisonMode, Period, RuleCode } from "../domain/types";
import { fill, labels } from "../i18n";
import { ACTION_EXECUTION_STATUSES, actionDocuments, type ActionExecutionStatus, type ActionWorkspace } from "./action-workspace";
import { formatSavedDateTime } from "./auto-save";
import { channelLabel, channelsLabel, conversionSentence, demoAlias } from "./copy";
import { decisionSignature } from "./decision";
import { diagnosisScopeLabel } from "./diagnosis-group";
import { buildManagerSummary, type ManagerSummary } from "./manager-summary";
import { formatAmount, formatPeriodExport, formatSignedDelta, metricDefinitions } from "./presentation";
import { buildReviewDecisionContext, REVIEW_DECISION_LABELS, type ReviewDecisionState, type ReviewSession } from "./review-session";
import { resolveScenarioReference, type ScenarioSelectionRef, type ScenarioWorkspace } from "./scenario-workspace";
import type { TargetSet } from "./targets";
import type { TaxConversion } from "./tax-basis";
import type { WorkspaceSnapshot } from "./workspace";

/**
 * R6-1 會議紀錄（承接 ReviewSession）。finalize 之後整份紀錄深層凍結、只讀；寫入 meeting_history（備份 v4）。
 * 金額一律是兩位小數的 TWD 字串（domain/money 的 parseCents／formatCents），不經過 Number。
 */
export const MEETING_SCHEMA_VERSION = "meeting-v1";
export const MAX_MEETING_HISTORY = 100;
/** 一份紀錄最多保留幾筆決議（一次 finalize 一筆；保留為陣列以便日後補記）。 */
export const MAX_MEETING_DECISIONS = 20;

export type MeetingKpiMetric = "net_revenue" | "contribution_after_marketing";
export interface MeetingKpi { metric: MeetingKpiMetric; previous: string | null; current: string | null; change: string | null }
export interface MeetingPriority { rule: RuleCode; headline: string; scope: string; impact: string | null; next_step: string }
export interface MeetingChannelRow {
  channel: string; previous_net_revenue: string | null; current_net_revenue: string | null; net_revenue_change: string | null;
  previous_contribution: string | null; current_contribution: string | null; contribution_change: string | null;
}
export interface MeetingScenario { channel: string; plan_id: string; revision: number; name: string; baseline: string | null; contribution: string | null; delta: string | null; assumptions: string[] }
export interface MeetingPinnedAction { action_id: string; problem: string; action: string; owner: string; deadline: string; execution_status: ActionExecutionStatus; status_updated_at: string | null; scope: string }
export interface MeetingDecision { state: ReviewDecisionState; notes: string; confirmed_revision: number | null }
export interface Meeting {
  schema_version: typeof MEETING_SCHEMA_VERSION; id: string; review_id: string; review_revision: number; name: string;
  /** YYYY-MM-DD，臺北日曆日。 */
  date: string;
  source_fixed: {
    dataset_id: string; dataset_hash: string; filter_hash: string; metric_version: string; data_as_of: string;
    periods: { previous: Period; current: Period; comparison_mode: ComparisonMode }; channels: string[];
    /** 結束會議時的含稅換算一句（conversionSentence）；沒有換算為 null。 */
    preprocessing: string | null;
    /** 結束會議時的口徑說明（labels.basis.items 快照），日後文案改版也保留當時的口徑。 */
    basis: string[];
  };
  agenda: { kpis: MeetingKpi[]; priorities: MeetingPriority[]; channels: MeetingChannelRow[]; scenarios: MeetingScenario[]; pinned_actions: MeetingPinnedAction[] };
  decisions: MeetingDecision[];
  pinned_action_ids: string[]; selected_scenarios: ScenarioSelectionRef[]; notes: string; thresholds: { importance: string };
  /** 「④ 上次決議追蹤」與「上次會議比較」：結束會議時凍結，還原備份後照樣可輸出。 */
  follow_up: MeetingFollowUp;
  /** ISO；呼叫端給的建立時間，否則取會議稿（review）的建立時間，都沒有才等於 finalized_at。 */
  created_at: string;
  finalized_at: string;
  /** V3-7（D-V3-22＝A）：v3 結束的紀錄寫 "v3"；v2 結束的紀錄（含還原的舊備份）沒有這個欄位，畫面頂部加註「本紀錄建立於 v2」。 */
  copy_version?: "v3";
}
export type MeetingComparisonKind = "none" | "same_scope" | "different_periods" | "different_dataset";
/** 結束會議時由 compareWithLastMeeting 凍結的比較結果；沒有上次會議時 kind 為 "none"、其餘欄位為 null 或空陣列。 */
export interface MeetingFollowUp {
  last_meeting_id: string | null; last_name: string | null; last_date: string | null;
  kind: MeetingComparisonKind; note: string;
  /** 只在 same_scope／different_periods 有值：上次會議的本期 vs 本次的本期（current 就是本次議程的本期）。 */
  kpis: MeetingComparison["kpis"];
  /** 只在 same_scope／different_periods 有值；本次三件事就是 agenda.priorities。 */
  last_priorities: MeetingPriority[];
  last_decisions: MeetingDecision[];
  actions: MeetingActionFollowUp[];
}
export interface MeetingActionFollowUp { action_id: string; problem: string; last_status: ActionExecutionStatus; current_status: ActionExecutionStatus | null; status_updated_at: string | null }
export interface MeetingComparison {
  kind: MeetingComparisonKind; last: Meeting | null;
  /** labels.meetingRecord 文案；期間不同時含兩次會議的本期（本期相同則改列上期），比較方式不同再加一句。 */
  note: string;
  /** 只在 same_scope／different_periods 有值：上次會議的本期 vs 本次的本期，change＝本次 − 上次。 */
  kpis: { metric: MeetingKpiMetric; last: string | null; current: string | null; change: string | null }[];
  /** 只在 same_scope／different_periods 有值；其餘兩種為空陣列。 */
  priorities: { last: MeetingPriority[]; current: MeetingPriority[] };
  decisions: MeetingDecision[];
  actions: MeetingActionFollowUp[];
}
type MeetingTargets = { set: TargetSet | null; allChannels: readonly string[] } | null;
export interface FinalizeMeetingInput {
  review: ReviewSession;
  /** 由 rebuildReviewSnapshot(review) 重建，與會議固定範圍一致。 */
  snapshot: WorkspaceSnapshot;
  scenarios: ScenarioWorkspace; actions: ActionWorkspace;
  conversion?: TaxConversion | null; targets?: MeetingTargets;
  /** YYYY-MM-DD 臺北日曆日（例如 taipeiToday()）。 */
  date: string;
  /** ISO 時間，由呼叫端傳入（測試可控）。 */
  now: string;
  /** 選填：建立時間；沒有就用 review.created_at（晚於 now 時改用 now），再沒有就用 now。 */
  created_at?: string;
  /** 目前的會議歷史：以 lastMeeting(history) 算上次比較並凍結進 follow_up；沒有就視為沒有上次會議。 */
  history?: readonly Meeting[];
}
/** 議程的金額部分（兩個關鍵差額、通路表、三件事）只由快照與門檻決定；finalize 與還原核對共用。 */
export interface MeetingAgendaOptions { importanceThreshold: string; conversion?: TaxConversion | null; targets?: MeetingTargets }

const copy = labels.meetingRecord;
const KPI_METRICS = ["net_revenue", "contribution_after_marketing"] as const satisfies readonly MeetingKpiMetric[];
const COMPARISON_KINDS = ["none", "same_scope", "different_periods", "different_dataset"] as const satisfies readonly MeetingComparisonKind[];
const RULE_CODES = ["REV_UP_CM_DOWN", "NEGATIVE_CHANNEL_CM", "DISCOUNT_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "MARKETING_BURDEN_UP", "SKU_NEGATIVE_GP", "MISSING_CRITICAL_DATA"] as const satisfies readonly RuleCode[];
const DECISION_STATES = ["draft", "adopted", "needs_data", "not_adopted"] as const satisfies readonly ReviewDecisionState[];
const EXECUTION_LABELS: Record<ActionExecutionStatus, string> = { not_started: labels.actions.statuses.not_started, in_progress: labels.actions.statuses.in_progress, blocked: labels.actions.statuses.blocked, completed: labels.actions.statuses.done };
/** 範圍標籤上限：最多 1,000 個通路 × 500 字（含分隔）再加模板。 */
const MAX_SCOPE_TEXT = 1000 * 501 + 500;
/** 比較說明上限：通路不同時含兩次的通路清單，再加模板。 */
const MAX_COMPARISON_NOTE = 2 * MAX_SCOPE_TEXT + 1000;

// 與 workspace-backup.ts 的 v4 欄位同一套格式：金額 ≤ 2 位小數的字串、日期 YYYY-MM-DD、ISO 時間。
const amount = z.string().max(200).regex(/^-?\d+(?:\.\d{1,2})?$/);
const isoDate = z.string().max(10).regex(/^\d{4}-\d{2}-\d{2}$/);
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const identifier = z.string().min(1).max(500);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const channel = z.string().min(1).max(500);
const period = z.strictObject({ start: isoDate, end: isoDate });
const meetingId = z.string().min(1).max(600);
const meetingName = z.string().min(1).max(200);
const priority = z.strictObject({ rule: z.enum(RULE_CODES), headline: z.string().max(2000), scope: z.string().max(2000), impact: amount.nullable(), next_step: z.string().max(2000) });
const decision = z.strictObject({ state: z.enum(DECISION_STATES), notes: z.string().max(8000), confirmed_revision: revision.nullable() });
const executionStatus = z.enum(ACTION_EXECUTION_STATUSES);
/** 備份 v4 的 meeting_history 每一筆都用這個 schema（strict：多一個欄位就拒絕）。 */
export const meetingSchema = z.strictObject({
  schema_version: z.literal(MEETING_SCHEMA_VERSION), id: meetingId, review_id: identifier, review_revision: revision,
  name: meetingName, date: isoDate,
  source_fixed: z.strictObject({
    dataset_id: z.string().min(1).max(2000), dataset_hash: hash, filter_hash: hash, metric_version: z.literal("contribution-v1"), data_as_of: isoDate,
    periods: z.strictObject({ previous: period, current: period, comparison_mode: z.enum(["same_days", "calendar_months"]) }),
    channels: z.array(channel).min(1).max(1000),
    preprocessing: z.string().min(1).max(2000).nullable(),
    basis: z.array(z.string().min(1).max(2000)).min(1).max(50),
  }),
  agenda: z.strictObject({
    kpis: z.array(z.strictObject({ metric: z.enum(KPI_METRICS), previous: amount.nullable(), current: amount.nullable(), change: amount.nullable() })).max(KPI_METRICS.length),
    priorities: z.array(priority).max(3),
    channels: z.array(z.strictObject({
      channel, previous_net_revenue: amount.nullable(), current_net_revenue: amount.nullable(), net_revenue_change: amount.nullable(),
      previous_contribution: amount.nullable(), current_contribution: amount.nullable(), contribution_change: amount.nullable(),
    })).max(1000),
    scenarios: z.array(z.strictObject({ channel, plan_id: identifier, revision, name: z.string().max(100), baseline: amount.nullable(), contribution: amount.nullable(), delta: amount.nullable(), assumptions: z.array(z.string().max(2000)).max(50) })).max(1000),
    pinned_actions: z.array(z.strictObject({
      action_id: identifier, problem: z.string().max(2000), action: z.string().max(2000), owner: z.string().max(2000), deadline: z.string().max(2000),
      execution_status: executionStatus, status_updated_at: isoDate.nullable(), scope: z.string().max(MAX_SCOPE_TEXT),
    })).max(3),
  }),
  decisions: z.array(decision).min(1).max(MAX_MEETING_DECISIONS),
  pinned_action_ids: z.array(identifier).max(3),
  selected_scenarios: z.array(z.strictObject({ context_id: identifier, plan_id: identifier, plan_revision: revision, channel })).max(1000),
  notes: z.string().max(8000),
  thresholds: z.strictObject({ importance: z.string().max(30).regex(/^(?:0|[1-9]\d*)\.\d{2}$/) }),
  follow_up: z.strictObject({
    last_meeting_id: meetingId.nullable(), last_name: meetingName.nullable(), last_date: isoDate.nullable(),
    kind: z.enum(COMPARISON_KINDS), note: z.string().max(MAX_COMPARISON_NOTE),
    kpis: z.array(z.strictObject({ metric: z.enum(KPI_METRICS), last: amount.nullable(), current: amount.nullable(), change: amount.nullable() })).max(KPI_METRICS.length),
    last_priorities: z.array(priority).max(3),
    last_decisions: z.array(decision).max(MAX_MEETING_DECISIONS),
    actions: z.array(z.strictObject({ action_id: identifier, problem: z.string().max(2000), last_status: executionStatus, current_status: executionStatus.nullable(), status_updated_at: isoDate.nullable() })).max(3),
  }),
  created_at: z.iso.datetime(), finalized_at: z.iso.datetime(),
  // V3-7（D-V3-22）：選填；舊紀錄沒有這個欄位時讀回 undefined。
  copy_version: z.literal("v3").optional(),
});

function invalid(): never { throw new Error("INVALID_MEETING"); }
/** b − a（兩位小數字串）；任一方未知就是 null。 */
function difference(before: string | null, after: string | null): string | null {
  const a = parseCents(before), b = parseCents(after);
  return a === null || b === null ? null : formatCents(b - a);
}
const unique = (values: readonly string[]) => new Set(values).size === values.length;
const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && unique(a) && unique(b) && a.every(value => b.includes(value));
const samePeriods = (a: Meeting["source_fixed"]["periods"], b: Meeting["source_fixed"]["periods"]) => decisionSignature(a) === decisionSignature(b);
function validPeriod(value: Period): boolean { return isBusinessDate(value.start) && isBusinessDate(value.end) && value.start <= value.end; }

/** 結構、日期、金額格式與長度上限；不合法一律擲 INVALID_MEETING。 */
export function validateMeeting(meeting: unknown): asserts meeting is Meeting {
  const parsed = meetingSchema.safeParse(meeting);
  if (!parsed.success) invalid();
  const value = parsed.data;
  const fixed = value.source_fixed;
  if (!value.id.trim() || !value.review_id.trim() || !value.name.trim() || !isBusinessDate(value.date) || !isBusinessDate(fixed.data_as_of)) invalid();
  if (!fixed.dataset_id.trim() || !validPeriod(fixed.periods.previous) || !validPeriod(fixed.periods.current) || fixed.periods.previous.end >= fixed.periods.current.start || !unique(fixed.channels)) invalid();
  if (Date.parse(value.created_at) > Date.parse(value.finalized_at)) invalid();
  const { kpis, priorities, channels, scenarios, pinned_actions: pinned } = value.agenda;
  // 差額必須等於 本期 − 上期（任一方未知則差額也未知）：竄改其中一格會被擋下。
  if (kpis.length !== KPI_METRICS.length || kpis.some((row, index) => row.metric !== KPI_METRICS[index] || row.change !== difference(row.previous, row.current))) invalid();
  if (decisionSignature(channels.map(row => row.channel)) !== decisionSignature(fixed.channels)) invalid();
  if (channels.some(row => row.net_revenue_change !== difference(row.previous_net_revenue, row.current_net_revenue) || row.contribution_change !== difference(row.previous_contribution, row.current_contribution))) invalid();
  if (!unique(priorities.map(row => row.rule))) invalid();
  const selected = value.selected_scenarios;
  if (selected.length > fixed.channels.length || !unique(selected.map(row => row.channel)) || selected.some(row => !fixed.channels.includes(row.channel))) invalid();
  if (scenarios.length !== selected.length || scenarios.some((row, index) => row.channel !== selected[index].channel || row.plan_id !== selected[index].plan_id || row.revision !== selected[index].plan_revision)) invalid();
  if (!unique(value.pinned_action_ids) || decisionSignature(pinned.map(row => row.action_id)) !== decisionSignature(value.pinned_action_ids)) invalid();
  if (pinned.some(row => row.deadline !== "" && !isBusinessDate(row.deadline) || row.status_updated_at !== null && !isBusinessDate(row.status_updated_at))) invalid();
  if (value.decisions.some(row => (row.state === "draft") !== (row.confirmed_revision === null))) invalid();
  if (fixed.preprocessing !== null && !fixed.preprocessing.trim() || fixed.basis.some(text => !text.trim())) invalid();
  // follow_up：沒有上次會議時全部為空；有上次會議時要有名稱、日期與至少一筆決議，且不可指向自己。
  const follow = value.follow_up;
  if (follow.kind === "none") {
    if (follow.last_meeting_id !== null || follow.last_name !== null || follow.last_date !== null || follow.kpis.length || follow.last_priorities.length || follow.last_decisions.length || follow.actions.length) invalid();
  } else {
    if (follow.last_meeting_id === null || !follow.last_meeting_id.trim() || follow.last_meeting_id === value.id || follow.last_name === null || !follow.last_name.trim() || follow.last_date === null || !isBusinessDate(follow.last_date) || !follow.last_decisions.length) invalid();
    // 只有同資料同通路（same_scope／different_periods）才比 KPI 與三件事；本次的值就是本次議程的本期，差額＝本次 − 上次。
    const comparable = follow.kind === "same_scope" || follow.kind === "different_periods";
    if (comparable ? follow.kpis.length !== KPI_METRICS.length || follow.kpis.some((row, index) => row.metric !== KPI_METRICS[index] || row.current !== kpis[index].current || row.change !== difference(row.last, row.current)) : follow.kpis.length || follow.last_priorities.length) invalid();
  }
  if (!unique(follow.last_priorities.map(row => row.rule)) || follow.last_decisions.some(row => (row.state === "draft") !== (row.confirmed_revision === null))) invalid();
  if (!unique(follow.actions.map(row => row.action_id)) || follow.actions.some(row => row.status_updated_at !== null && !isBusinessDate(row.status_updated_at))) invalid();
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const entry of Object.values(value)) deepFreeze(entry);
    Object.freeze(value);
  }
  return value;
}
/** 深層凍結的副本（不動原物件）：已結束的會議紀錄一律只讀，寫入任何欄位都擲 TypeError。 */
export function freezeMeeting(meeting: Meeting): Meeting {
  return deepFreeze(structuredClone(meeting));
}
function meetingKpis(summary: ManagerSummary): MeetingKpi[] {
  return summary.headlines.map(row => ({ metric: row.metric, previous: row.previous.value, current: row.current.value, change: row.change.value }));
}
/** 三件事：summary.priorities（diagnosisGroups 門檻後前三），標題與下一步就是 ruleCopy 的 headline／nextStep。 */
function meetingPriorities(snapshot: WorkspaceSnapshot, summary: ManagerSummary): MeetingPriority[] {
  const alias = demoAlias(snapshot.report.dataset_id);
  return summary.priorities.map(row => ({ rule: row.code, headline: row.title, scope: diagnosisScopeLabel(row.primary.scope, alias), impact: row.impact_cents, next_step: row.recommendation }));
}
/**
 * 議程的金額部分：兩個關鍵差額、通路表、三件事（門檻後前三）。finalize 用它組議程；還原備份時用同一個函式以來源資料重算核對。
 * 含稅換算與目標不影響這三項（只影響摘要的口徑句與目標列），一併接受只為與 buildManagerSummary 同一套選項。
 */
export function meetingAgendaFromSnapshot(snapshot: WorkspaceSnapshot, options: MeetingAgendaOptions): Pick<Meeting["agenda"], "kpis" | "channels" | "priorities"> {
  const summary = buildManagerSummary(snapshot, { importanceThreshold: options.importanceThreshold, conversion: options.conversion, targets: options.targets ?? undefined });
  return {
    kpis: meetingKpis(summary),
    priorities: meetingPriorities(snapshot, summary),
    channels: summary.channels.map(row => ({
      channel: row.channel, previous_net_revenue: row.revenue.previous.value, current_net_revenue: row.revenue.current.value, net_revenue_change: row.revenue.change.value,
      previous_contribution: row.contribution.previous.value, current_contribution: row.contribution.current.value, contribution_change: row.contribution.change.value,
    })),
  };
}
/** 把上次比較凍結成 follow_up（compareWithLastMeeting 已經複製過上次會議的資料）。 */
function frozenFollowUp(comparison: MeetingComparison): MeetingFollowUp {
  const last = comparison.last;
  return {
    last_meeting_id: last?.id ?? null, last_name: last?.name ?? null, last_date: last?.date ?? null, kind: comparison.kind, note: comparison.note,
    kpis: comparison.kpis, last_priorities: comparison.priorities.last, last_decisions: comparison.decisions, actions: comparison.actions,
  };
}

/**
 * 「結束會議」：用 review 的固定範圍組出議程、以 history 的最近一筆算上次比較，一併凍結。
 * 來源不符擲 MEETING_SOURCE_MISMATCH；日期不合法擲 INVALID_MEETING_DATE；同一版已結束過擲 DUPLICATE_MEETING；歷史已滿擲 MEETING_HISTORY_FULL。
 */
export function finalizeMeeting(input: FinalizeMeetingInput): Meeting {
  const { review, snapshot } = input;
  if (review.status !== "current" || snapshot.dataset_hash !== review.dataset_hash || snapshot.filter_hash !== review.filter_hash) throw new Error("MEETING_SOURCE_MISMATCH");
  if (!isBusinessDate(input.date)) throw new Error("INVALID_MEETING_DATE");
  const history = input.history ?? [];
  const id = `meeting-${review.id}-r${review.revision}`;
  // 與 appendMeeting 相同的檢查與順序，讓畫面在結束前就能對應錯誤（可先 removeMeeting 騰出空間）。
  if (history.some(row => row.id === id)) throw new Error("DUPLICATE_MEETING");
  if (history.length >= MAX_MEETING_HISTORY) throw new Error("MEETING_HISTORY_FULL");
  const targets = input.targets ?? null;
  const agenda = meetingAgendaFromSnapshot(snapshot, { importanceThreshold: review.importance_threshold, conversion: input.conversion, targets });
  const context = buildReviewDecisionContext(review, input.scenarios, input.actions);
  const documents = new Map(actionDocuments(input.actions).map(doc => [doc.id, doc]));
  const scope = review.meeting_filters;
  // 只凍結仍是目前版本的選入方案：已被取代或屬於較早資料的方案不進紀錄（selected_scenarios 一併過濾，與 agenda.scenarios 一一對應）。
  // context.scenarios 與 review.selected_scenarios 依索引一一對應；名稱取所選版本的原名（版本號另存）。
  const selected = review.selected_scenarios.flatMap((ref, index) => {
    const { version, status } = resolveScenarioReference(input.scenarios, ref);
    return status === "current" ? [{ ref, name: version.name, row: context.scenarios[index] }] : [];
  });
  const comparison = compareWithLastMeeting({ snapshot, review, actions: input.actions, conversion: input.conversion, targets }, lastMeeting(history));
  const reviewCreated = review.created_at !== undefined && Date.parse(review.created_at) <= Date.parse(input.now) ? review.created_at : input.now;
  const meeting: Meeting = {
    schema_version: MEETING_SCHEMA_VERSION, id, review_id: review.id, review_revision: review.revision, name: review.name, date: input.date,
    source_fixed: {
      dataset_id: snapshot.report.dataset_id, dataset_hash: review.dataset_hash, filter_hash: review.filter_hash, metric_version: review.metric_version, data_as_of: review.data_as_of,
      periods: { previous: scope.previous_period, current: scope.current_period, comparison_mode: scope.comparison_mode }, channels: scope.channels,
      preprocessing: conversionSentence(input.conversion), basis: [...labels.basis.items],
    },
    agenda: {
      ...agenda,
      scenarios: selected.map(({ ref, name, row }) => ({ channel: ref.channel, plan_id: ref.plan_id, revision: ref.plan_revision, name, baseline: row.baseline ?? null, contribution: row.contribution ?? null, delta: row.delta ?? null, assumptions: [...row.assumptions] })),
      pinned_actions: review.pinned_action_ids.map(id => {
        const row = context.actions.find(action => action.id === id)!;
        const doc = documents.get(id);
        return { action_id: id, problem: row.problem, action: row.action, owner: row.owner, deadline: row.deadline, execution_status: doc?.execution_status ?? "not_started", status_updated_at: doc?.status_updated_at ?? null, scope: row.scopeLabel };
      }),
    },
    decisions: [{ state: review.decision_state, notes: review.notes, confirmed_revision: review.confirmed_revision }],
    pinned_action_ids: review.pinned_action_ids, selected_scenarios: selected.map(({ ref }) => ref), notes: review.notes, thresholds: { importance: review.importance_threshold },
    follow_up: frozenFollowUp(comparison),
    created_at: input.created_at ?? reviewCreated, finalized_at: input.now,
    copy_version: "v3",
  };
  const frozen = freezeMeeting(meeting);
  validateMeeting(frozen);
  return frozen;
}

const byFinalizedAt = (a: Meeting, b: Meeting) => Date.parse(a.finalized_at) - Date.parse(b.finalized_at);
/** 加一筆到歷史（不改原陣列）：id 重複擲 DUPLICATE_MEETING；超過上限擲 MEETING_HISTORY_FULL；依 finalized_at 由舊到新。 */
export function appendMeeting(history: readonly Meeting[], meeting: Meeting): Meeting[] {
  validateMeeting(meeting);
  if (history.some(row => row.id === meeting.id)) throw new Error("DUPLICATE_MEETING");
  if (history.length >= MAX_MEETING_HISTORY) throw new Error("MEETING_HISTORY_FULL");
  // Array.prototype.sort 是穩定排序：同一時間的紀錄保留加入順序。
  return [...history, meeting].sort(byFinalizedAt);
}
/** 從歷史移除一筆（不改原陣列）：找不到擲 UNKNOWN_MEETING。歷史已滿 MAX_MEETING_HISTORY 筆時，先移除舊紀錄才能再結束會議。 */
export function removeMeeting(history: readonly Meeting[], id: string): Meeting[] {
  if (!history.some(row => row.id === id)) throw new Error("UNKNOWN_MEETING");
  return history.filter(row => row.id !== id);
}
/** 最近一次結束的會議（finalized_at 最大；同時間取後加入者）。 */
export function lastMeeting(history: readonly Meeting[]): Meeting | null {
  let latest: Meeting | null = null;
  for (const row of history) if (!latest || byFinalizedAt(row, latest) >= 0) latest = row;
  return latest;
}

function shortDate(date: string, withYear: boolean): string {
  const [year, month, day] = date.split("-");
  return fill(withYear ? copy.shortDateWithYear : copy.shortDate, { year, month: Number(month), day: Number(day) });
}
/** 幾段期間的短日期（7/13–8/23）；任兩段跨年度時全部帶年份，避免看錯。 */
function shortRanges(...periods: Period[]): string[] {
  const withYear = new Set(periods.flatMap(value => [value.start, value.end]).map(date => date.slice(0, 4))).size > 1;
  return periods.map(value => fill(copy.dateRange, { start: shortDate(value.start, withYear), end: shortDate(value.end, withYear) }));
}
const comparisonModeLabel = (mode: ComparisonMode): string => mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays;
/**
 * 期間不同的說明：本期不同時列兩次的本期；本期相同時改列兩次的上期；比較方式不同時再加一句。
 * （samePeriods 為 false 時至少有一項不同；萬一都相同就退回列兩次的本期。）
 */
function differentPeriodsNote(last: Meeting["source_fixed"]["periods"], current: Meeting["source_fixed"]["periods"]): string {
  const same = (a: Period, b: Period) => a.start === b.start && a.end === b.end;
  const parts: string[] = [];
  if (!same(last.current, current.current)) {
    const [lastRange, currentRange] = shortRanges(last.current, current.current);
    parts.push(fill(copy.differentPeriods, { last: lastRange, current: currentRange }));
  } else if (!same(last.previous, current.previous)) {
    const [lastPrevious, currentPrevious, range] = shortRanges(last.previous, current.previous, current.current);
    parts.push(fill(copy.differentPreviousPeriods, { current: range, lastPrevious, currentPrevious }));
  }
  if (last.comparison_mode !== current.comparison_mode) parts.push(fill(copy.differentComparisonMode, { last: comparisonModeLabel(last.comparison_mode), current: comparisonModeLabel(current.comparison_mode) }));
  if (parts.length) return parts.join(copy.noteSeparator);
  const [lastRange, currentRange] = shortRanges(last.current, current.current);
  return fill(copy.differentPeriods, { last: lastRange, current: currentRange });
}
function followUp(last: Meeting, actions: ActionWorkspace): MeetingActionFollowUp[] {
  return last.agenda.pinned_actions.map(row => {
    const item = actions.items.find(entry => entry.card.id === row.action_id);
    const current = item ? (ACTION_EXECUTION_STATUSES.includes(item.execution_status as ActionExecutionStatus) ? item.execution_status! : "not_started") : null;
    return { action_id: row.action_id, problem: row.problem, last_status: row.execution_status, current_status: current, status_updated_at: item?.status_updated_at ?? null };
  });
}

/**
 * 上次會議比較（05 §10）：同 dataset_hash 且同通路集合才比 KPI 與三件事；期間不同照樣比並在 note 標出兩次的期間（differentPeriodsNote）；
 * dataset 不同或通路不同只列上次決議與待辦狀態。snapshot 應是本次會議的固定範圍（有 review 時用 rebuildReviewSnapshot）。
 */
export function compareWithLastMeeting(current: { snapshot: WorkspaceSnapshot; review: ReviewSession | null; actions: ActionWorkspace; conversion?: TaxConversion | null; targets?: MeetingTargets }, last: Meeting | null): MeetingComparison {
  if (!last) return { kind: "none", last: null, note: copy.noLastMeeting, kpis: [], priorities: { last: [], current: [] }, decisions: [], actions: [] };
  const { snapshot } = current;
  const scope = snapshot.report.scope;
  const tracked = { decisions: structuredClone(last.decisions) as MeetingDecision[], actions: followUp(last, current.actions) };
  const notComparable = { kpis: [], priorities: { last: [], current: [] } };
  if (snapshot.dataset_hash !== last.source_fixed.dataset_hash) return { kind: "different_dataset", last, note: labels.meeting.noComparable, ...notComparable, ...tracked };
  if (!sameSet(scope.channels, last.source_fixed.channels)) {
    const alias = demoAlias(snapshot.report.dataset_id);
    return { kind: "different_dataset", last, note: fill(copy.differentChannels, { last: channelsLabel(last.source_fixed.channels, alias), current: channelsLabel(scope.channels, alias) }), ...notComparable, ...tracked };
  }
  const summary = buildManagerSummary(snapshot, { importanceThreshold: current.review?.importance_threshold, conversion: current.conversion, targets: current.targets ?? undefined });
  const kpis = meetingKpis(summary).map(row => {
    const before = last.agenda.kpis.find(kpi => kpi.metric === row.metric)?.current ?? null;
    return { metric: row.metric, last: before, current: row.current, change: difference(before, row.current) };
  });
  const periods = { previous: scope.previous_period, current: scope.current_period, comparison_mode: scope.comparison_mode };
  const same = samePeriods(periods, last.source_fixed.periods);
  return {
    kind: same ? "same_scope" : "different_periods", last, note: same ? copy.sameScope : differentPeriodsNote(last.source_fixed.periods, periods),
    kpis, priorities: { last: structuredClone(last.agenda.priorities) as MeetingPriority[], current: meetingPriorities(snapshot, summary) }, ...tracked,
  };
}

/** Neutralize user-controlled Markdown/HTML, including links and embedded line breaks（與 manager-summary.ts 相同規則）。 */
const md = (text: string): string => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")
  .replace(/[\\`*_{}\[\]()#+!|~]/g, character => `\\${character}`).replace(/\r\n|\r|\n/g, "&#10;");
/** V3-2b §3.3：會議紀錄 Markdown 主文用 L2 整數元（U+2212、正的差額加「+」）；單位寫在表頭「（元）」或「金額單位：元」，儲存格內不重複。 */
const money = (value: string | null, signed = false): string => value === null ? labels.status.missing : signed ? formatSignedDelta(value, "L2") : formatAmount(value, "L2");
const moneyColumn = (label: string): string => fill(labels.ui.export.moneyColumn, { label });
const decisionText = (row: MeetingDecision): string => row.confirmed_revision === null
  ? fill(copy.decisionUnconfirmed, { decision: REVIEW_DECISION_LABELS[row.state] })
  : fill(copy.decisionConfirmed, { decision: REVIEW_DECISION_LABELS[row.state], revision: row.confirmed_revision });
const updatedText = (date: string | null): string => date ? fill(copy.statusUpdatedAt, { date }) : copy.statusNotUpdated;

/**
 * 會議紀錄 Markdown：標題／固定範圍／口徑／議程六段／決議／上次比較／技術細節；所有不可信文字都經過 md()。
 * ④ 與「上次會議比較」一律讀結束當時凍結的 meeting.follow_up（還原備份後輸出相同）。comparison 為舊呼叫方式保留：
 * 只在它指向同一筆上次會議時，於技術細節補上上次會議的 dataset_hash，其餘忽略。
 */
export function exportMeetingMarkdown(meeting: Meeting, comparison?: MeetingComparison): string {
  const fixed = meeting.source_fixed, follow = meeting.follow_up;
  const alias = demoAlias(fixed.dataset_id);
  const latest = meeting.decisions.at(-1)!;
  const contribution = metricDefinitions.contribution_after_marketing.shortLabel, revenue = metricDefinitions.net_revenue.shortLabel;
  // 主文用臺北時間 YYYY-MM-DD hh:mm；ISO 原值只放技術細節。
  const finalizedAt = formatSavedDateTime(new Date(meeting.finalized_at)) || meeting.finalized_at;
  const lines = [
    fill(copy.mdTitle, { brand: labels.brand.name, name: md(meeting.name) }), "",
    fill(copy.mdMeta, { date: labels.meeting.date, value: meeting.date, decision: labels.meeting.decision, state: decisionText(latest), finalizedAt }), "",
    copy.mdScope, "",
    fill(copy.mdField, { field: labels.status.dataAsOf, value: fixed.data_as_of }),
    fill(copy.mdPeriod, { period: labels.periods.previous, range: formatPeriodExport(fixed.periods.previous.start, fixed.periods.previous.end) }),
    fill(copy.mdPeriod, { period: labels.periods.current, range: formatPeriodExport(fixed.periods.current.start, fixed.periods.current.end) }),
    fill(copy.mdField, { field: labels.csvColumns.comparison_mode, value: comparisonModeLabel(fixed.periods.comparison_mode) }),
    fill(copy.mdField, { field: labels.csvColumns.channels, value: md(channelsLabel(fixed.channels, alias)) }),
    // 門檻是使用者設定的精確值，取到分（L3）。
    fill(copy.mdThreshold, { field: labels.meeting.threshold, amount: formatAmount(meeting.thresholds.importance, "L3") }), "",
    copy.mdBasis, "", ...fixed.basis.map(text => `- ${md(text)}`), ...(fixed.preprocessing ? [`- ${md(fixed.preprocessing)}`] : []), "",
    `## ${labels.sections.meetingAgenda}`, "", `### ${copy.agenda.kpis}`, "", labels.ui.export.amountUnitNote, "",
  ];
  for (const row of meeting.agenda.kpis) lines.push(fill(copy.mdKpiRow, { metric: metricDefinitions[row.metric].label, previous: money(row.previous), current: money(row.current), change: money(row.change, true) }));
  lines.push("", `### ${copy.agenda.priorities}`, "");
  if (!meeting.agenda.priorities.length) lines.push(labels.notes.noPriorities);
  for (const [index, row] of meeting.agenda.priorities.entries()) lines.push(
    fill(copy.mdPriorityRow, { n: index + 1, headline: md(row.headline), scope: md(row.scope), impact: labels.sections.impact, amount: money(row.impact, true) }),
    fill(copy.mdNextStep, { label: labels.sections.nextStep, step: md(row.next_step) }));
  lines.push("", `### ${copy.agenda.channels}`, "",
    `| ${labels.csvColumns.channel} | ${[`${labels.periods.previous}${revenue}`, `${labels.periods.current}${revenue}`, labels.csvSuffix.change, `${labels.periods.previous}${contribution}`, `${labels.periods.current}${contribution}`, labels.csvSuffix.change].map(moneyColumn).join(" | ")} |`,
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: |");
  for (const row of meeting.agenda.channels) lines.push(`| ${md(channelLabel(row.channel, alias))} | ${money(row.previous_net_revenue)} | ${money(row.current_net_revenue)} | ${money(row.net_revenue_change, true)} | ${money(row.previous_contribution)} | ${money(row.current_contribution)} | ${money(row.contribution_change, true)} |`);
  lines.push("", `### ${copy.agenda.followUp}`, "");
  if (follow.kind === "none" || follow.last_name === null) lines.push(copy.noLastMeeting);
  else {
    lines.push(fill(copy.mdLastMeeting, { name: md(follow.last_name), date: follow.last_date }));
    for (const row of follow.last_decisions) lines.push(fill(copy.mdLastDecision, { decision: decisionText(row), notes: labels.meeting.notes, text: md(row.notes) }));
    for (const row of follow.actions) lines.push(fill(copy.mdFollowUpRow, { problem: md(row.problem), last: EXECUTION_LABELS[row.last_status], current: row.current_status ? EXECUTION_LABELS[row.current_status] : copy.actionMissing, updated: updatedText(row.status_updated_at) }));
  }
  lines.push("", `### ${copy.agenda.scenarios}`, "");
  if (!meeting.agenda.scenarios.length) lines.push(copy.noScenarios);
  for (const row of meeting.agenda.scenarios) lines.push(
    fill(copy.mdScenarioRow, { name: md(fill(copy.scenarioRevision, { name: row.name, revision: row.revision })), channel: md(channelLabel(row.channel, alias)), baseline: money(row.baseline), contribution: money(row.contribution), delta: money(row.delta, true) }),
    ...row.assumptions.map(text => fill(copy.mdAssumption, { text: md(text) })));
  lines.push("", `### ${copy.agenda.actions}`, "");
  if (!meeting.agenda.pinned_actions.length) lines.push(copy.noPinnedActions);
  for (const row of meeting.agenda.pinned_actions) lines.push(fill(copy.mdActionRow, {
    problem: md(row.problem), action: md(row.action), owner: labels.actions.owner, ownerValue: md(row.owner || labels.ui.managerSummary.ownerUnset), due: labels.actions.due, dueValue: md(row.deadline || labels.ui.managerSummary.dueUnset),
    status: labels.actions.status, statusValue: EXECUTION_LABELS[row.execution_status], updated: updatedText(row.status_updated_at), scope: md(row.scope),
  }));
  lines.push("", `## ${labels.sections.meetingDecision}`, "", ...meeting.decisions.map(row => `- ${decisionText(row)}`), fill(copy.mdField, { field: labels.meeting.notes, value: md(meeting.notes) }), "",
    `## ${labels.sections.meetingCompare}`, "", md(follow.kind === "none" ? copy.noLastMeeting : follow.note));
  if (follow.kpis.length) {
    const columns = copy.compareColumns;
    lines.push("", `| ${columns.metric} | ${moneyColumn(columns.last)} | ${moneyColumn(columns.current)} | ${moneyColumn(columns.change)} |`, "| --- | ---: | ---: | ---: |");
    for (const row of follow.kpis) lines.push(`| ${metricDefinitions[row.metric].label} | ${money(row.last)} | ${money(row.current)} | ${money(row.change, true)} |`);
  }
  // 三件事只在同資料同通路時比較；本次三件事就是本次議程的 ②。
  const comparable = follow.kind === "same_scope" || follow.kind === "different_periods";
  if (comparable && (follow.last_priorities.length || meeting.agenda.priorities.length)) {
    for (const [title, rows] of [[copy.lastPriorities, follow.last_priorities], [copy.currentPriorities, meeting.agenda.priorities]] as const) {
      lines.push("", `${title}：`);
      if (!rows.length) lines.push(labels.notes.noPriorities);
      for (const [index, row] of rows.entries()) lines.push(fill(copy.mdPriorityRow, { n: index + 1, headline: md(row.headline), scope: md(row.scope), impact: labels.sections.impact, amount: money(row.impact, true) }));
    }
  }
  lines.push("", "---", "", `## ${labels.sections.technicalDetails}`, "",
    `- meeting_id：${md(meeting.id)}`, `- schema_version：${meeting.schema_version}`, `- review_id：${md(meeting.review_id)}`, `- review_revision：${meeting.review_revision}`,
    `- dataset_id：${md(fixed.dataset_id)}`, `- dataset_hash：${fixed.dataset_hash}`, `- filter_hash：${fixed.filter_hash}`, `- metric_version：${md(fixed.metric_version)}`,
    `- created_at：${meeting.created_at}`, `- finalized_at：${meeting.finalized_at}`,
    `- pinned_action_ids：${md(JSON.stringify(meeting.pinned_action_ids))}`, `- selected_scenarios：${md(JSON.stringify(meeting.selected_scenarios))}`);
  if (follow.last_meeting_id !== null) {
    const lastHash = comparison?.last && comparison.last.id === follow.last_meeting_id ? `；last_dataset_hash：${comparison.last.source_fixed.dataset_hash}` : "";
    lines.push(`- comparison：${follow.kind}；last_meeting_id：${md(follow.last_meeting_id)}${lastHash}`);
  }
  return `${lines.join("\n")}\n`;
}
