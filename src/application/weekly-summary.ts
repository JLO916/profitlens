import Decimal from "decimal.js";
import { channelsLabel, demoAlias, formatHeadlineAmount } from "@/application/copy";
import { diagnosisGroups, type DiagnosisGroup } from "@/application/diagnosis-group";
import { deltaTone, deltaWord, formatAmountL1, formatDateL1, formatGrowth, formatMetric, formatPeriodL1, formatRatePoints, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { compareMoney, percentagePointChange } from "@/domain/metrics";
import type { RuleCode } from "@/domain/types";
import { fill, labels } from "@/i18n";

// V3-4a 本期一句話（PRD §7.1 區塊 2）與 F1 週會摘要（PRD §10.2）。
// 純呈現：所有數字都來自既有 snapshot（report.previous／current.metrics、diagnosisGroups），差額用 domain 的 compareMoney／percentagePointChange，
// 與 KPI 帶同源；不新增任何計算，也不碰 React。字串全部取自 labels（overview.snapshot、summary.weekly）。

export type SnapshotKind = "revenueUpContributionDown" | "bothUp" | "bothDown" | "revenueDownContributionUp" | "flat" | "turned" | "missing";
export interface SnapshotSentence { kind: SnapshotKind; text: string; topHeadline: string | null }

export interface WeeklySummaryInput { snapshot: WorkspaceSnapshot; datasetName: string; importanceThreshold?: string; missingItems?: number; actions: { pending: number; pinned: { problem: string; owner: string; deadline: string }[] } }
export interface WeeklySummary { text: string; markdown: string; sentence: SnapshotSentence }

const sentences = labels.overview.snapshot.sentence;
const weekly = labels.summary.weekly;
/** 置頂待辦最多列幾項（PRD §10.2）。 */
const PINNED_LIMIT = 3;
/**
 * 「最大一項是{top}」不取這兩條規則：REV_UP_CM_DOWN 的標題就是「淨營收多…卻少賺…」，和本句重複；
 * MISSING_CRITICAL_DATA 沒有金額，不是「一項」。其餘依本期三件事的順序（依影響金額排序）取第一個。
 */
const NOT_AN_ITEM: ReadonlySet<RuleCode> = new Set<RuleCode>(["REV_UP_CM_DOWN", "MISSING_CRITICAL_DATA"]);

/** 本期三件事（與總覽同一個 diagnosisGroups）。門檻不合法時沿用預設門檻：總覽的門檻表單已先檢核，這裡不讓摘要因此中斷。 */
function priorities(snapshot: Pick<WorkspaceSnapshot, "report">, importanceThreshold?: string): DiagnosisGroup[] {
  try { return diagnosisGroups(snapshot, { importanceThreshold }).priorities; } catch { return diagnosisGroups(snapshot).priorities; }
}
/** 非負整數；其他一律視為 0。 */
const count = (value: number | undefined) => value !== undefined && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
const isTurned = (word: string | null) => word === labels.format.turnedPositive || word === labels.format.turnedLoss;

/** 本期一句話：數字全部來自既有 snapshot（report.previous／current.metrics、diagnosisGroups），不新增任何計算。 */
export function snapshotSentence(snapshot: WorkspaceSnapshot, options?: { importanceThreshold?: string; missingItems?: number }): SnapshotSentence {
  const { previous, current } = snapshot.report;
  const revenue = { previous: previous.metrics.net_revenue, current: current.metrics.net_revenue };
  const contribution = { previous: previous.metrics.contribution_after_marketing, current: current.metrics.contribution_after_marketing };
  const revenueChange = compareMoney(revenue.previous, revenue.current).absolute_change.value;
  const contributionChange = compareMoney(contribution.previous, contribution.current).absolute_change.value;
  if (revenueChange === null || contributionChange === null || [revenue.previous, revenue.current, contribution.previous, contribution.current].some(metric => metric.value === null)) {
    const n = count(options?.missingItems);
    return { kind: "missing", text: n > 0 ? fill(sentences.missing, { n }) : sentences.missingNoCount, topHeadline: null };
  }
  const contributionWord = deltaWord("contribution_after_marketing", contributionChange, { previous: contribution.previous.value, layer: "L1" });
  if (isTurned(contributionWord)) return { kind: "turned", text: fill(sentences.turned, { word: contributionWord, contribution: formatAmountL1(contribution.current.value) }), topHeadline: null };

  // 方向依取位後的 L1 差額判斷（與 KPI 帶的方向詞相同）：取位後為 0 視為持平。
  const revenueTone = deltaTone("net_revenue", revenueChange, "L1");
  const contributionTone = deltaTone("contribution_after_marketing", contributionChange, "L1");
  if (revenueTone === "neutral" || contributionTone === "neutral") {
    const side = (flat: boolean, word: string | null, change: string) => flat ? { word: labels.format.flat, delta: "" } : { word: word ?? "", delta: ` ${formatHeadlineAmount(change)}` };
    const revenueSide = side(revenueTone === "neutral", deltaWord("net_revenue", revenueChange, { layer: "L1" }), revenueChange);
    const contributionSide = side(contributionTone === "neutral", contributionWord, contributionChange);
    return { kind: "flat", text: fill(sentences.flat, { revenueWord: revenueSide.word, revenueDelta: revenueSide.delta, contributionWord: contributionSide.word, contributionDelta: contributionSide.delta }), topHeadline: null };
  }

  const values = { revenueDelta: formatHeadlineAmount(revenueChange), contributionDelta: formatHeadlineAmount(contributionChange) };
  const revenueUp = revenueTone === "favorable", contributionUp = contributionTone === "favorable";
  if (revenueUp && contributionUp) return { kind: "bothUp", text: fill(sentences.bothUp, values), topHeadline: null };
  if (!revenueUp && contributionUp) return { kind: "revenueDownContributionUp", text: fill(sentences.revenueDownContributionUp, values), topHeadline: null };
  const top = priorities(snapshot, options?.importanceThreshold).find(group => !NOT_AN_ITEM.has(group.rule))?.headline ?? null;
  const kind = revenueUp ? "revenueUpContributionDown" : "bothDown";
  const template = top === null ? (revenueUp ? sentences.revenueUpContributionDownNoTop : sentences.bothDownNoTop) : sentences[kind];
  return { kind, text: fill(template, { ...values, top }), topHeadline: top };
}

/** 摘要中的使用者文字（資料集名、待辦、規則標題中的通路與 SKU）：換行收成一個空格，避免打亂摘要的行。 */
const oneLine = (text: string) => text.replace(/\s*[\r\n]+\s*/g, " ").trim();
/** Markdown 版：再把會變成格式的字元加上反斜線（只處理行內格式；不建立連結）。 */
const markdownText = (text: string) => oneLine(text).replace(/[\\`*_[\]<>|~#]/g, character => `\\${character}`);

/** F1 週會摘要（PRD §10.2）：純文字版與 Markdown 版。 */
export function buildWeeklySummary(input: WeeklySummaryInput): WeeklySummary {
  const { snapshot } = input;
  const { report } = snapshot;
  const sentence = snapshotSentence(snapshot, { importanceThreshold: input.importanceThreshold, missingItems: input.missingItems });
  const anchor = snapshot.data_as_of;
  const span = (period: { start: string; end: string }, days: number) => `${formatPeriodL1(period.start, period.end, { days: false })}${fill(labels.format.units.periodDays, { days })}`;

  // 三行關鍵數字：沿用 manager-summary 的 headlineChangeText（方向詞＋L1 絕對值＋成長率；上期 ≤ 0 不附成長率；持平只寫持平）。
  const moneyLine = (metric: "net_revenue" | "contribution_after_marketing") => {
    const previous = report.previous.metrics[metric], current = report.current.metrics[metric];
    const values = { metric: metricDefinitions[metric].label, value: formatMetric(metric, current, "L1") };
    const change = compareMoney(previous, current).absolute_change.value;
    const word = deltaWord(metric, change, { previous: previous.value, layer: "L1" });
    if (change === null || word === null) return fill(weekly.keyLineValueOnly, values);
    if (word === labels.format.flat) return fill(weekly.keyLineFlat, values);
    if (isTurned(word)) return fill(weekly.keyLineTurned, { ...values, word });
    const growth = formatGrowth(current.value, previous.value, "L1");
    return fill(growth === null ? weekly.keyLineNoGrowth : weekly.keyLine, { ...values, word, amount: formatHeadlineAmount(change), growth });
  };
  // 貢獻率：domain 的 percentagePointChange 單位是百分點，÷ 100 換回比率小數再交給 formatRatePoints（與 KPI 帶的比率格相同）。
  const rateLine = () => {
    const previous = report.previous.metrics.contribution_margin, current = report.current.metrics.contribution_margin;
    const values = { metric: metricDefinitions.contribution_margin.label, value: formatMetric("contribution_margin", current, "L1") };
    const points = percentagePointChange(previous, current).value;
    if (points === null) return fill(weekly.keyLineValueOnly, values);
    const delta = new Decimal(points).div(100).toFixed();
    if (deltaWord("contribution_margin", delta, { layer: "L1" }) === labels.format.flat) return fill(weekly.keyLineFlat, values);
    return fill(weekly.rateLine, { ...values, points: formatRatePoints(delta, "L1") });
  };
  const keyLines = sentence.kind === "missing" ? [sentence.text] : [moneyLine("net_revenue"), moneyLine("contribution_after_marketing"), rateLine()];

  const groups = priorities(snapshot, input.importanceThreshold);
  const topHeading = groups.length > 0 && groups.length < 3 ? fill(weekly.topThreeFew, { n: groups.length }) : labels.overview.sections.topThree;
  const footer = fill(weekly.footer, { date: formatDateL1(anchor, { anchor }), brand: labels.brand.name });
  const alias = demoAlias(report.dataset_id);

  /** 依輸出格式處理使用者文字後組出各段；數字由格式化函式產生，不需要跳脫。 */
  const parts = (text: (value: string) => string) => {
    const pinned = input.actions.pinned.slice(0, PINNED_LIMIT).map(item => fill(weekly.pinnedItem, {
      problem: text(item.problem) || weekly.problemUntitled,
      owner: text(item.owner) || weekly.ownerUnassigned,
      deadline: item.deadline.trim() ? text(formatDateL1(item.deadline.trim(), { anchor })) : weekly.deadlineUnassigned,
    }));
    const pending = count(input.actions.pending);
    return {
      datasetName: text(input.datasetName),
      period: fill(weekly.period, { current: span(report.current.period, report.comparison.current_days), previous: span(report.previous.period, report.comparison.previous_days), channels: text(channelsLabel(report.scope.channels, alias)) }),
      items: groups.map((group, index) => fill(weekly.topThreeItem, { n: index + 1, headline: text(group.headline), nextStep: text(group.next_step) })),
      actions: pinned.length ? fill(weekly.actionsPinned, { pending, pinned: pinned.join(weekly.pinnedSeparator) }) : fill(weekly.actions, { pending }),
    };
  };

  const plain = parts(oneLine);
  const text = [
    weekly.title, ...(plain.datasetName ? [plain.datasetName] : []), plain.period, "",
    ...keyLines, "",
    topHeading, ...(plain.items.length ? plain.items : [weekly.topThreeNone]), "",
    plain.actions, footer,
  ].join("\n");

  const md = parts(markdownText);
  const markdown = [
    `## ${weekly.title}`, "", ...(md.datasetName ? [md.datasetName, ""] : []), md.period, "",
    ...keyLines.map(line => `- ${line}`), "",
    `## ${topHeading}`, "", ...(md.items.length ? md.items : [weekly.topThreeNone]), "",
    md.actions, "", footer,
  ].join("\n");

  return { text, markdown, sentence };
}
