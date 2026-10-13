import { isBusinessDate } from "@/domain/date";
import { ACTION_EXECUTION_STATUSES, boardColumns, taipeiToday, type ActionWorkspace } from "./action-workspace";

// V4-10 代理 B：G17「待辦期限分布」的整理函式 actionDueBuckets（PRD §4.1–§4.7 G17、§6.4；CHART_CATALOG G17、§9.2；D-V4-15）。
// B 級，版本 action-due-buckets-v1。只數件數，不碰金額與財務口徑：
// - 讀 boardColumns(workspace)（看板四欄的同一個分欄規則：沒有狀態或無法辨識的舊資料算未開始），已完成欄不計。
// - 期限判定與看板卡 board-card-due[data-overdue] 相同（src/components/actions-workbench.tsx）：期限是 YYYY-MM-DD 字串，以字串比大小；
//   逾期＝有期限、早於台北今天；7 天內＝今天到今天＋6 天（含今天，共 7 天）；之後＝今天＋7 天起；未填期限＝期限為空字串。
// - today 是台北日曆日（taipeiToday()，Asia/Taipei；UTC 16:00 起已是隔天），由呼叫端傳入以便測試日期邊界。
// golden：四桶加總＝未完成待辦數（open）。純函式、可序列化；新算出的數字只有計數與四桶最大值（C24 count 的共用尺度）。

export const ACTION_DUE_BUCKETS_VERSION = "action-due-buckets-v1" as const;
/** 四桶的固定順序（小表的列序）：逾期、7 天內、之後、未填期限。 */
export const ACTION_DUE_BUCKET_KEYS = ["overdue", "week", "later", "none"] as const;
export type ActionDueBucketKey = typeof ACTION_DUE_BUCKET_KEYS[number];
/** 「7 天內」涵蓋的天數（今天到今天＋6 天）。 */
export const ACTION_DUE_WEEK_DAYS = 7;

export interface ActionDueBucket {
  key: ActionDueBucketKey;
  /** 這一桶的未完成待辦數。 */
  count: number;
}
export interface ActionDueBuckets {
  version: typeof ACTION_DUE_BUCKETS_VERSION;
  /** 台北今天（YYYY-MM-DD）。 */
  today: string;
  /** 「7 天內」的最後一天（今天＋6 天，YYYY-MM-DD）。 */
  weekEnd: string;
  /** 四桶，依 ACTION_DUE_BUCKET_KEYS 的順序。 */
  buckets: ActionDueBucket[];
  /** 未完成待辦數（＝四桶加總）。 */
  open: number;
  /** 四桶最大值（C24 count 的共用尺度；全部為 0 時為 0）。 */
  max: number;
}

/** YYYY-MM-DD 加 n 天（UTC 日曆運算，不受執行環境時區影響）。 */
function addDays(date: string, days: number): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

/** 一個期限落在哪一桶（today、weekEnd 為 YYYY-MM-DD）。 */
export function actionDueBucketOf(deadline: string, today: string, weekEnd: string): ActionDueBucketKey {
  if (!deadline) return "none";
  if (deadline < today) return "overdue";
  return deadline <= weekEnd ? "week" : "later";
}

/** G17：未完成待辦依期限分四桶（action-due-buckets-v1）。today 不是有效的 YYYY-MM-DD 時丟 RangeError。 */
export function actionDueBuckets(workspace: ActionWorkspace, today: string = taipeiToday()): ActionDueBuckets {
  if (!isBusinessDate(today)) throw new RangeError("INVALID_TODAY");
  const weekEnd = addDays(today, ACTION_DUE_WEEK_DAYS - 1);
  const counts: Record<ActionDueBucketKey, number> = { overdue: 0, week: 0, later: 0, none: 0 };
  const columns = boardColumns(workspace);
  for (const status of ACTION_EXECUTION_STATUSES) {
    if (status === "completed") continue;
    for (const item of columns[status]) counts[actionDueBucketOf(item.card.deadline, today, weekEnd)]++;
  }
  const buckets = ACTION_DUE_BUCKET_KEYS.map(key => ({ key, count: counts[key] }));
  return {
    version: ACTION_DUE_BUCKETS_VERSION, today, weekEnd, buckets,
    open: buckets.reduce((sum, bucket) => sum + bucket.count, 0),
    max: buckets.reduce((top, bucket) => Math.max(top, bucket.count), 0),
  };
}
