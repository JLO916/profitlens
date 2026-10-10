import type { AnalysisFilters, Period } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { emptyActionWorkspace } from "@/application/action-workspace";
import { finalizeMeeting, freezeMeeting, type Meeting } from "@/application/meeting";
import { createReviewSession, rebuildReviewSnapshot, updateReviewSession } from "@/application/review-session";
import { emptyScenarioWorkspace } from "@/application/scenario-workspace";
import { createSnapshot, hashInput } from "@/application/workspace";
import { fixture } from "./fixtures";

// V4-6 代理 A：G19 會議歷史小倍數的測試資料（tests/chart-meeting.test.ts、tests/charts-meeting-g19.test.tsx、tests/helpers/page-states.tsx 共用）。
// 一律用 finalizeMeeting 結束真的會議（固定的資料與範圍、凍結、validateMeeting 通過），不手寫 Meeting；
// 需要「另一份資料」「另一組通路」這類 finalize 做不出來的組合時，才以 meetingVariant 從真的會議複製後改 source_fixed（測試斷段規則用）。

/** 一次會議的資料與範圍：fixture 名稱與篩選（期間、比較方式、通路）。 */
export interface MeetingSpec { id: string; name: string; date: string; now: string; fixture?: string; filters?: AnalysisFilters }

/** 以 fixture＋篩選結束一次會議（沒有選入方案、沒有置頂待辦）；回傳凍結的 Meeting。 */
export async function finalizedMeeting(spec: MeetingSpec): Promise<Meeting> {
  const input = fixture(spec.fixture ?? "golden");
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, spec.filters ?? {}, await hashInput(input));
  const review = updateReviewSession(createReviewSession({ input, dataset, snapshot, revision: 1 }, "e", spec.id), { name: spec.name, meeting_date: spec.date });
  return freezeMeeting(finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios: emptyScenarioWorkspace("e"), actions: emptyActionWorkspace(), date: spec.date, now: spec.now }));
}

/** 示範資料的一週（同天數比較：上期＝本期前 7 天）。 */
export const demoWeek = (previous: Period, current: Period): AnalysisFilters => ({ previous_period: previous, current_period: current, comparison_mode: "same_days" });
/** 示範資料的三個連續週（本期各 7 天，資料到 2026-08-23）。 */
export const DEMO_WEEKS = [
  { previous: { start: "2026-07-27", end: "2026-08-02" }, current: { start: "2026-08-03", end: "2026-08-09" } },
  { previous: { start: "2026-08-03", end: "2026-08-09" }, current: { start: "2026-08-10", end: "2026-08-16" } },
  { previous: { start: "2026-08-10", end: "2026-08-16" }, current: { start: "2026-08-17", end: "2026-08-23" } },
] as const;

/**
 * 會議頁 G19 的示範歷史（6 次結束的會議，依會議日期）：
 * 1. golden 預設範圍（本期 8/2，1 天）——第 0 段；
 * 2. 示範資料預設範圍（本期 7/13–8/23，42 天）——資料集不同，第 1 段（不同資料集）；
 * 3–5. 示範資料三個連續週（本期各 7 天）——本期天數不同，第 2 段（期間不同），三點相連；
 * 6. 第 5 次的重複會議（本期相同、較晚結束）——只畫最新一筆，第 5 次省略。
 * 圖上 5 點、3 段、2 個間隙；標題取最新一段（3 次週會）。
 */
export async function g19History(): Promise<Meeting[]> {
  return Promise.all([
    finalizedMeeting({ id: "g19-golden", name: "八月初例會", date: "2026-08-03", now: "2026-08-03T06:00:00.000Z" }),
    finalizedMeeting({ id: "g19-demo-42", name: "八月月會", date: "2026-08-24", now: "2026-08-24T06:00:00.000Z", fixture: "demo" }),
    ...DEMO_WEEKS.map((week, index) => finalizedMeeting({ id: `g19-week-${index + 1}`, name: `週會 ${index + 1}`, date: `2026-08-${25 + index}`, now: `2026-08-${25 + index}T06:00:00.000Z`, fixture: "demo", filters: demoWeek(week.previous, week.current) })),
    finalizedMeeting({ id: "g19-week-3-again", name: "週會 3（重開）", date: "2026-08-27", now: "2026-08-27T09:00:00.000Z", fixture: "demo", filters: demoWeek(DEMO_WEEKS[2].previous, DEMO_WEEKS[2].current) }),
  ]);
}

/** 從真的會議複製一份並改識別與範圍（不重算議程；只給斷段、排序、去重規則的測試用）。 */
export function meetingVariant(base: Meeting, patch: { id: string; date?: string; finalized_at?: string; dataset_hash?: string; channels?: string[]; current?: Period; previous?: Period; comparison_mode?: Meeting["source_fixed"]["periods"]["comparison_mode"]; net_revenue?: string | null; contribution?: string | null }): Meeting {
  const copy = structuredClone(base) as Meeting;
  copy.id = patch.id;
  if (patch.date !== undefined) copy.date = patch.date;
  if (patch.finalized_at !== undefined) copy.finalized_at = patch.finalized_at;
  const fixed = copy.source_fixed;
  if (patch.dataset_hash !== undefined) fixed.dataset_hash = patch.dataset_hash;
  if (patch.channels !== undefined) fixed.channels = patch.channels;
  if (patch.current !== undefined) fixed.periods.current = patch.current;
  if (patch.previous !== undefined) fixed.periods.previous = patch.previous;
  if (patch.comparison_mode !== undefined) fixed.periods.comparison_mode = patch.comparison_mode;
  for (const kpi of copy.agenda.kpis) {
    if (kpi.metric === "net_revenue" && patch.net_revenue !== undefined) kpi.current = patch.net_revenue;
    if (kpi.metric === "contribution_after_marketing" && patch.contribution !== undefined) kpi.current = patch.contribution;
  }
  return copy;
}
