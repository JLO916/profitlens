"use client";

import Decimal from "decimal.js";
import { useMemo } from "react";
import { track } from "@/application/analytics";
import { CHANNEL_FEE_FIELDS, CHANNEL_STRUCTURE_MAX, CHANNEL_STRUCTURE_SM_MAX, CHANNEL_STRUCTURE_VERSION, channelStructure, type ChannelStructure, type ChannelStructureRow } from "@/application/chart-structure";
import { chartColors } from "@/application/chart-theme";
import { channelLabel, channelsLabel, snapshotResolver } from "@/application/copy";
import type { NameResolver } from "@/application/channel-settings";
import { deltaTone, formatPeriodL1, metricDefinitions } from "@/application/presentation";
import { profitWaterfall } from "@/application/waterfall";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Metric, MetricName } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { chartDataTable, type ChartDataCell, type ChartDataColumn } from "../charts/chart-data-table";
import { ShareStack, type ShareStackRowInput, type ShareStackSegment } from "../charts/share-stack";
import type { EvidenceSelection } from "../evidence-drawer";
import { ChartFrame, type ChartLegendItem } from "../overview/charts/chart-frame";
import { channelEvidence } from "../overview/charts/channel-section";
import { profitEvidence } from "../overview/charts/profit-section";

// V4-3a 代理 A：G10 每 100 元淨營收去向（PRD §4.1–§4.7 G10、§5.2 第 3 列、§7.4；CHART_CATALOG G10；D-V4-19＝B、D-V4-32＝A）。
// 健檢頁清單之後、通路寬表之前（src/components/workspace-panels.tsx 的 Diagnosis）。主層常駐獨立圖區塊 1 張（CL-9）。
// 資料：各通路（與合計）的「剩」與商品成本、廣告費、扣廣告後貢獻三段的比率直接呼叫 profitWaterfall(snapshot, scope)（A 級，contribution-v1，和 G2 切到該通路時同一個實作）；
// 四項通路費用合計與超過 100 的幾何來自 channelStructure（B 級，channel-structure-v1）。不做「其他」合併、不跨通路加總（X38）：合計列是 report.current.metrics。
// 通路 ≤ 5 用 chartHeights.sm、6 到 8 用 lg、超過 8 只留資料表（state="empty"，message 指向資料表與通路寬表，不畫段）。
// 段的點擊與資料表 number-link 呼叫同一個 builder（PRD §2.2 C7）：商品成本、廣告費、剩／虧（剩餘段與超過 100 的部分）開 channelEvidence（合計列開 profitEvidence 的合計）；
// 四項費用段開「通路費用合計」證據（valueKind level、metricVersion channel-structure-v1，自帶標題、定義與技術算式）；每 100 元開扣廣告後貢獻率（unitOverride percent，D-V4-32＝A）。

const copy = labels.diagnosis.chartsV4.share;
const SEG_TESTID_PREFIX = "chart-diagnosis-share-seg-";
const MISSING: Metric = { value: null, reason_codes: ["MISSING_VALUE"] };
const TABLE_AMOUNTS_BEFORE_FEES: readonly MetricName[] = ["net_revenue", "cogs_net", ...CHANNEL_FEE_FIELDS];
const TABLE_AMOUNTS_AFTER_FEES: readonly MetricName[] = ["ad_spend", "contribution_after_marketing"];

/** 一列（一個通路或合計）：A 級的值取自 profitWaterfall，B 級的值取自 channelStructure 的同一列。 */
export interface ShareRowModel {
  /** 通路代碼或 CHANNEL_STRUCTURE_TOTAL_KEY（testid 用）。 */
  key: string;
  /** 通路代碼；合計列為 null。 */
  channel: string | null;
  label: string;
  total: boolean;
  /** profitWaterfall(snapshot, scope).perHundred（一位小數；淨營收 ≤ 0 或缺值為 null）。 */
  perHundred: string | null;
  /** profitWaterfall(snapshot, scope).rows[].share（12 位比率小數，逐字沿用）：商品成本、廣告投放費、扣廣告後貢獻。 */
  shares: { cogs: string | null; ad: string | null; remain: string | null };
  structure: ChannelStructureRow;
}
export interface ShareSectionModel {
  /** report.scope.channels 的順序，最後一列是合計。 */
  rows: ShareRowModel[];
  structure: ChannelStructure;
  /** 通路數 ≤ CHANNEL_STRUCTURE_MAX 才畫圖。 */
  chartable: boolean;
  height: "sm" | "lg";
  titleKind: "loss" | "least" | "notApplicable";
  title: string;
  subtitle: string;
  /** 不適用（扣項為負或淨營收 ≤ 0）的通路代碼。 */
  notApplicable: string[];
}

const isLoss = (perHundred: string | null) => perHundred !== null && new Decimal(perHundred).isNegative() && !new Decimal(perHundred).isZero();
const absText = (perHundred: string) => new Decimal(perHundred).abs().toFixed(1);
/** 列右端與資料表「每 100 元淨營收」欄的字：剩 {n} 元／虧 {n} 元；沒有值時為 null（由呼叫端寫不適用或資料待補）。 */
export function sharePerHundredText(perHundred: string | null): string | null {
  return perHundred === null ? null : fill(isLoss(perHundred) ? copy.loss : copy.remain, { n: absText(perHundred) });
}

/** G10 的資料與文字（純函式，tests/chart-structure.test.ts）。 */
export function shareSectionModel(snapshot: WorkspaceSnapshot, options: { resolver?: NameResolver } = {}): ShareSectionModel {
  const { report } = snapshot;
  const resolver = options.resolver ?? snapshotResolver(snapshot);
  const channels = report.scope.channels;
  const structure = channelStructure(snapshot, "current");
  const scoped = (row: ChannelStructureRow): ShareRowModel => {
    const waterfall = profitWaterfall(snapshot, row.channel ?? "all", { resolver });
    const share = (metric: MetricName) => waterfall.rows.find(item => item.metric === metric)?.share ?? null;
    return {
      key: row.key, channel: row.channel, label: row.channel === null ? labels.overview.sections.total : channelLabel(row.channel, resolver), total: row.channel === null,
      perHundred: waterfall.perHundred, shares: { cogs: share("cogs_net"), ad: share("ad_spend"), remain: share("contribution_after_marketing") }, structure: row,
    };
  };
  const rows = [...structure.rows.map(scoped), scoped(structure.total)];

  // 標題（PRD §4.2 G10）：只看可畫的通路（ready 且有每 100 元）；有虧損時取虧最多，否則取剩最少；同值依通路代碼。
  const candidates = rows.filter(row => !row.total && row.structure.status === "ready" && row.perHundred !== null);
  const losses = candidates.filter(row => isLoss(row.perHundred));
  const pool = losses.length ? losses : candidates;
  const pick = pool.reduce<ShareRowModel | null>((best, row) => {
    if (best === null) return row;
    const order = new Decimal(row.perHundred!).comparedTo(best.perHundred!);
    return order < 0 || (order === 0 && row.channel! < best.channel!) ? row : best;
  }, null);
  const titleKind: ShareSectionModel["titleKind"] = pick === null ? "notApplicable" : losses.length ? "loss" : "least";
  const title = pick === null ? copy.title.notApplicable : fill(titleKind === "loss" ? copy.title.loss : copy.title.least, { channel: pick.label, n: absText(pick.perHundred!) });

  const notApplicable = rows.filter(row => !row.total && row.structure.status === "notApplicable").map(row => row.channel!);
  const { period } = report.current;
  const base = fill(copy.subtitle, { section: copy.section, period: formatPeriodL1(period.start, period.end, { days: false, anchor: snapshot.data_as_of }), scope: channelsLabel(channels, resolver) });
  const subtitle = notApplicable.length ? fill(copy.subtitleNote, { subtitle: base, channels: channelsLabel(notApplicable, resolver) }) : base;
  return { rows, structure, chartable: channels.length <= CHANNEL_STRUCTURE_MAX, height: channels.length <= CHANNEL_STRUCTURE_SM_MAX ? "sm" : "lg", titleKind, title, subtitle, notApplicable };
}

/** 金額的「計算與來源」：通路列沿用 channelEvidence（帶 filter.channel），合計列沿用 profitEvidence 的合計（本期、範圍內全部通路）。值直接取自 domain，contribution-v1。 */
export function shareAmountEvidence(snapshot: WorkspaceSnapshot, channel: string | null, name: MetricName): EvidenceSelection {
  if (channel !== null) return channelEvidence(snapshot, channel, "current", name);
  return profitEvidence(snapshot, "all", { metric: name, value: snapshot.report.current.metrics[name] });
}
/**
 * 四項費用段與資料表「通路費用合計」欄的「計算與來源」（CHART_CATALOG G10 抽屜；PRD §8.7 第 1、3、4 點）：
 * name 只借 platform_fees 的金額單位（MetricName 沒有費用合計），標題、定義、技術算式由證據自帶；組成項目是四項費用；水準值不帶正負號；版本 channel-structure-v1。
 * 來源只列通路費用檔（channelStructure 的 sources）；通路列另帶 filter.channel。
 */
export function shareFeesEvidence(row: ChannelStructureRow): EvidenceSelection {
  return {
    title: copy.feesTitle, name: "platform_fees", metric: row.fees, period: row.period, channels: row.channels, sources: row.sources,
    formula: fill(copy.feesFormula, { platform: metricDefinitions.platform_fees.label, payment: metricDefinitions.payment_fees.label, fulfillment: metricDefinitions.fulfillment_costs.label, other: metricDefinitions.other_variable_costs.label }),
    formulaTechnical: copy.feesTechnical, definition: copy.feesDefinition,
    components: row.feeItems.map(item => ({ label: metricDefinitions[item.field].label, metric: item.metric })),
    valueKind: "level", metricVersion: CHANNEL_STRUCTURE_VERSION,
    ...(row.channel === null ? {} : { filter: { channel: row.channel } }),
  };
}
/**
 * 每 100 元的「計算與來源」（D-V4-32＝A）：值是 domain 的扣廣告後貢獻率（contribution_margin，12 位比率小數；每 100 元＝它 × 100），
 * unitOverride percent 顯示百分比，組成是扣廣告後貢獻與淨營收兩個金額；值取自 domain，不加版本（contribution-v1）。
 */
export function sharePerHundredEvidence(snapshot: WorkspaceSnapshot, channel: string | null): EvidenceSelection {
  const { current } = snapshot.report;
  const metrics = channel === null ? current.metrics : Object.hasOwn(current.channels, channel) ? current.channels[channel].metrics : null;
  return {
    ...shareAmountEvidence(snapshot, channel, "contribution_margin"),
    unitOverride: "percent", valueKind: "level", formula: metricDefinitions.contribution_margin.formula,
    components: [{ label: metricDefinitions.contribution_after_marketing.label, metric: metrics?.contribution_after_marketing ?? MISSING }, { label: metricDefinitions.net_revenue.label, metric: metrics?.net_revenue ?? MISSING }],
  };
}
/** 段的點擊：與資料表同欄 number-link 同一個 builder（剩餘與超過 100 的部分都開扣廣告後貢獻）。 */
export function shareSegmentEvidence(snapshot: WorkspaceSnapshot, row: ShareRowModel, segment: ShareStackSegment): EvidenceSelection {
  if (segment === "cogs") return shareAmountEvidence(snapshot, row.channel, "cogs_net");
  if (segment === "fees") return shareFeesEvidence(row.structure);
  if (segment === "ad") return shareAmountEvidence(snapshot, row.channel, "ad_spend");
  return shareAmountEvidence(snapshot, row.channel, "contribution_after_marketing");
}

/** ShareStack 的列（比率逐字沿用 profitWaterfall 與 channelStructure；顯示字取自 labels）。 */
export function shareStackRows(model: ShareSectionModel): ShareStackRowInput[] {
  return model.rows.map(row => {
    const status = row.structure.status;
    const loss = isLoss(row.perHundred);
    return {
      key: row.key, label: row.label, status, total: row.total,
      cogs: row.shares.cogs, fees: row.structure.feesShare.value, ad: row.shares.ad, remain: row.shares.remain, over: row.structure.overShare,
      value: status === "ready" ? sharePerHundredText(row.perHundred) ?? labels.shell.status.missing : status === "missing" ? labels.shell.status.missing : labels.shell.status.notApplicable,
      tone: status !== "ready" ? "muted" : loss ? "loss" : "remain",
    };
  });
}

type ShareColumn = { kind: "amount"; name: MetricName } | { kind: "fees" } | { kind: "perHundred" };
const amountColumn = (name: MetricName): ChartDataColumn<ShareColumn> => ({ key: name, label: fill(labels.format.units.yuanColumn, { label: metricDefinitions[name].label }), unit: "money", layer: "L2", data: { kind: "amount", name } });
/** 資料表欄（CHART_CATALOG G10）：淨營收、商品成本、四項費用、通路費用合計（四項費用段的 number-link）、廣告投放費、扣廣告後貢獻、每 100 元淨營收。 */
export const SHARE_TABLE_COLUMNS: readonly ChartDataColumn<ShareColumn>[] = [
  ...TABLE_AMOUNTS_BEFORE_FEES.map(amountColumn),
  { key: "fees", label: fill(labels.format.units.yuanColumn, { label: copy.feesTitle }), unit: "money", layer: "L2", data: { kind: "fees" } },
  ...TABLE_AMOUNTS_AFTER_FEES.map(amountColumn),
  { key: "perHundred", label: copy.columns.perHundred, unit: "text", data: { kind: "perHundred" } },
];
function metricsOf(snapshot: WorkspaceSnapshot, channel: string | null) {
  const { current } = snapshot.report;
  return channel === null ? current.metrics : Object.hasOwn(current.channels, channel) ? current.channels[channel].metrics : null;
}
/**
 * 資料表格的值（純函式）：金額 L2、每 100 元用「剩／虧 {n} 元」；空值依原因碼寫資料待補或不適用。
 * V4-8a（D-V4-45＝B）：只有扣廣告後貢獻與每 100 元淨營收兩欄在不利時帶 C33 的 unfavorable（D-V3-7 只有不利上色）：
 * 扣廣告後貢獻用 deltaTone(…, "L2")（同 G4 緊湊表）；每 100 元用列右端「虧 n 元」同一個判斷 isLoss（同 deltaTone("contribution_margin", …, "L2") 的一位小數 HALF_UP，但從精確值取位，紅字一定寫「虧」）。
 */
export function shareTableCell(snapshot: WorkspaceSnapshot, row: ShareRowModel, column: ChartDataColumn<ShareColumn>): ChartDataCell {
  const spec = column.data;
  if (spec.kind === "fees") return { value: row.structure.fees.value, reasonCodes: row.structure.fees.reason_codes };
  if (spec.kind === "perHundred") return { value: sharePerHundredText(row.perHundred), reasonCodes: metricsOf(snapshot, row.channel)?.contribution_margin.reason_codes ?? MISSING.reason_codes, unfavorable: isLoss(row.perHundred) };
  const metric = metricsOf(snapshot, row.channel)?.[spec.name] ?? MISSING;
  return { value: metric.value, reasonCodes: metric.reason_codes, unfavorable: spec.name === "contribution_after_marketing" && deltaTone(spec.name, metric.value, "L2") === "unfavorable" };
}
/** 資料表格的抽屜（與段的點擊同一組 builder）。 */
export function shareTableEvidence(snapshot: WorkspaceSnapshot, row: ShareRowModel, column: ChartDataColumn<ShareColumn>): EvidenceSelection {
  const spec = column.data;
  if (spec.kind === "fees") return shareFeesEvidence(row.structure);
  if (spec.kind === "perHundred") return sharePerHundredEvidence(snapshot, row.channel);
  return shareAmountEvidence(snapshot, row.channel, spec.name);
}

export interface ShareSectionProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
}

/** 健檢頁 G10：ChartFrame（id share、testid chart-diagnosis-share）＋C27 ShareStack＋C33 資料表。 */
export function ShareSection({ snapshot, onEvidence }: ShareSectionProps) {
  const model = useMemo(() => shareSectionModel(snapshot), [snapshot]);
  const stackRows = useMemo(() => shareStackRows(model), [model]);
  const byKey = new Map(model.rows.map(row => [row.key, row]));
  const { period } = snapshot.report.current;
  const channelCount = snapshot.report.scope.channels.length;
  const legend: ChartLegendItem[] = [
    { key: "cogs", label: metricDefinitions.cogs_net.label, color: chartColors.seg1 },
    { key: "fees", label: copy.feesTitle, color: chartColors.seg2 },
    { key: "ad", label: metricDefinitions.ad_spend.shortLabel, color: chartColors.seg3 },
    { key: "remain", label: copy.segments.remain, color: chartColors.total, shape: "rect" },
  ];
  const onSegment = (input: ShareStackRowInput, segment: ShareStackSegment) => {
    const row = byKey.get(input.key);
    if (!row) return;
    track("chart_clicked");
    onEvidence(shareSegmentEvidence(snapshot, row, segment));
  };
  const dataTable = chartDataTable<ShareRowModel, ShareColumn>({
    title: copy.section,
    testId: "chart-diagnosis-share-table",
    caption: fill(copy.caption, { section: copy.section, period: formatPeriodL1(period.start, period.end, { days: false, anchor: snapshot.data_as_of }) }),
    rowHeaderLabel: labels.overview.channelsV3.table.channel,
    rows: model.rows,
    rowKey: row => row.key,
    rowHeader: row => ({ label: row.label }),
    columns: SHARE_TABLE_COLUMNS,
    valueOf: (row, column) => shareTableCell(snapshot, row, column),
    evidenceOf: (row, column) => shareTableEvidence(snapshot, row, column),
    onEvidence,
    cellAria: (row, column, text) => {
      const spec = column.data;
      const metric = spec.kind === "fees" ? copy.feesTitle : spec.kind === "perHundred" ? copy.columns.perHundred : metricDefinitions[spec.name].label;
      const money = spec.kind !== "perHundred" && shareTableCell(snapshot, row, column).value !== null;
      return fill(money ? labels.overview.channelsV3.amountAria : labels.overview.channelsV3.marginAria, { channel: row.label, metric, value: text });
    },
    className: "share-data-table",
  });
  return <ChartFrame id="share" page="diagnosis" className="share-section" title={model.title} subtitle={model.subtitle} legend={model.chartable ? legend : undefined} height={model.height}
    state={model.chartable ? undefined : "empty"} message={model.chartable ? undefined : fill(copy.tooMany, { count: channelCount, n: CHANNEL_STRUCTURE_MAX })} dataTable={dataTable}>
    {model.chartable ? <ShareStack rows={stackRows} axisMax={model.structure.axisMax} testIdPrefix={SEG_TESTID_PREFIX} onSegmentClick={onSegment} /> : null}
  </ChartFrame>;
}
