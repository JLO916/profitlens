import Decimal from "decimal.js";
import { channelLabel, demoAlias, formatHeadlineAmount } from "@/application/copy";
import { deltaTone, formatAmountL1, formatEmpty, formatMetric, formatPeriodL1, periodDays } from "@/application/presentation";
import type { WeeklyRow, WorkspaceSnapshot } from "@/application/workspace";
import type { Metric } from "@/domain/types";
import { fill, labels } from "@/i18n";

// V3-4b 趨勢與各通路的結論標題與 takeaway 列（C16，PRD §7.1 第 7、8 點、§8.2 圖表標題與副標）。
// 純呈現：數字只從既有 snapshot 取出（report.current.metrics、report.previous／current.channels、snapshot.weeks），不重新計算；
// 比較一律用 decimal.js 從精確字串判斷，字串取自 labels（overview.trendV3、overview.channelsV3），數字經 presentation／copy 的格式化函式。

export interface TrendTakeaways {
  /** 本期淨營收期間合計（L1）。 */
  total: { label: string; metric: Metric; display: string };
  /** 本期最後一個滿 7 天的週：淨營收（L1）與起訖（主層 M/D）；沒有完整週時 week 為 null、display 為「不適用」。 */
  lastCompleteWeek: { label: string; week: WeeklyRow | null; display: string; range: string | null };
  /** 本期最後一週不滿 7 天。 */
  lastWeekIncomplete: boolean;
  incompleteNote: string | null;
  subtitle: string;
}

export interface ChannelConclusionRow {
  channel: string;
  label: string;
  /** 本期／上期扣廣告後貢獻，與扣廣告後貢獻率（本期）。 */
  current: Metric;
  previous: Metric;
  margin: Metric;
  /** 上期 > 0 且本期 < 0 → negative（「轉負」）；上期 ≤ 0 且本期 > 0 → positive（「轉正」）；其他 null。 */
  turned: "negative" | "positive" | null;
}
export interface ChannelConclusion {
  title: string;
  subtitle: string;
  /** 依 report.scope.channels 的順序。 */
  rows: ChannelConclusionRow[];
  /** 本期扣廣告後貢獻（L1 取位後）為負且最低的通路代碼；沒有虧損的通路時為 null。 */
  worst: string | null;
  /** 本期扣廣告後貢獻最高的通路代碼；全部缺值時為 null。 */
  best: string | null;
}

const MISSING_METRIC: Metric = { value: null, reason_codes: ["MISSING_VALUE"] };
const NUMERIC = /^[+-]?\d+(?:\.\d+)?$/;
const exact = (value: string | null | undefined): Decimal | null => value !== null && value !== undefined && NUMERIC.test(value.trim()) ? new Decimal(value.trim()) : null;
const periodText = (snapshot: WorkspaceSnapshot, period: { start: string; end: string }) => formatPeriodL1(period.start, period.end, { days: false, anchor: snapshot.data_as_of });
const isFullWeek = (week: WeeklyRow) => periodDays(week.start, week.end) === 7;

/** 每週趨勢的 takeaway 列：「淨營收期間合計」與「最近完整週淨營收」（PRD §7.1 第 7 點）；最後一週不滿 7 天時附註。 */
export function trendTakeaways(snapshot: WorkspaceSnapshot): TrendTakeaways {
  const copy = labels.overview.trendV3;
  const total = snapshot.report.current.metrics.net_revenue;
  const weeks = snapshot.weeks.filter(week => week.period === "current");
  const complete = weeks.filter(isFullWeek).at(-1) ?? null;
  const last = weeks.at(-1);
  const lastWeekIncomplete = last !== undefined && (periodDays(last.start, last.end) ?? 7) < 7;
  return {
    total: { label: copy.takeaways.total, metric: total, display: formatMetric("net_revenue", total, "L1") },
    lastCompleteWeek: {
      label: copy.takeaways.lastCompleteWeek,
      week: complete,
      display: complete === null ? formatEmpty("notApplicable") : formatMetric("net_revenue", complete.metrics.net_revenue, "L1"),
      range: complete === null ? null : periodText(snapshot, complete),
    },
    lastWeekIncomplete,
    incompleteNote: lastWeekIncomplete ? copy.incompleteNote : null,
    subtitle: labels.ui.overview.trendNote,
  };
}

/** 各通路扣廣告後貢獻的結論標題（PRD §7.1 第 8 點）：有虧損的通路時寫虧最多的一個，否則寫最高的一個。 */
export function channelConclusion(snapshot: WorkspaceSnapshot, options: { alias?: boolean } = {}): ChannelConclusion {
  const { report } = snapshot;
  const copy = labels.overview.channelsV3;
  const alias = options.alias ?? demoAlias(report.dataset_id);
  const metricsOf = (period: "previous" | "current", channel: string) => Object.hasOwn(report[period].channels, channel) ? report[period].channels[channel].metrics : null;
  const rows: ChannelConclusionRow[] = report.scope.channels.map(channel => {
    const current = metricsOf("current", channel)?.contribution_after_marketing ?? MISSING_METRIC;
    const previous = metricsOf("previous", channel)?.contribution_after_marketing ?? MISSING_METRIC;
    const margin = metricsOf("current", channel)?.contribution_margin ?? MISSING_METRIC;
    const now = exact(current.value), before = exact(previous.value);
    const turned = now === null || before === null ? null : before.gt(0) && now.lt(0) ? "negative" : before.lte(0) && now.gt(0) ? "positive" : null;
    return { channel, label: channelLabel(channel, alias), current, previous, margin, turned };
  });

  // 「虧」只在 L1 取位後仍為負時成立（與畫面上的金額一致，不會寫出「虧 0 元」）；同值時取 report.scope.channels 中較前面的通路。
  const known = rows.flatMap(row => { const value = exact(row.current.value); return value === null ? [] : [{ row, value }]; });
  const losing = known.filter(item => deltaTone("contribution_after_marketing", item.row.current.value, "L1") === "unfavorable");
  const worst = losing.reduce<typeof known[number] | null>((low, item) => low === null || item.value.lt(low.value) ? item : low, null);
  const best = known.reduce<typeof known[number] | null>((high, item) => high === null || item.value.gt(high.value) ? item : high, null);

  const title = worst !== null ? fill(copy.title.negative, { channel: worst.row.label, amount: formatHeadlineAmount(worst.row.current.value) })
    : best !== null ? fill(copy.title.best, { channel: best.row.label, amount: formatAmountL1(best.row.current.value) })
      : labels.overview.sections.channelMix;
  return {
    title,
    subtitle: fill(copy.subtitle, { section: labels.overview.sections.channelMix, period: periodText(snapshot, report.current.period) }),
    rows,
    worst: worst?.row.channel ?? null,
    best: best?.row.channel ?? null,
  };
}
