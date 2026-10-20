"use client";

import { useMemo, type ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type LabelProps } from "recharts";
import { track } from "@/application/analytics";
import { channelConclusion, type ChannelConclusionRow } from "@/application/chart-takeaways";
import { chartColors, chartFontSize, chartHeights } from "@/application/chart-theme";
import { channelLabel, snapshotResolver } from "@/application/copy";
import { metricComparison } from "@/application/manager-summary";
import { deltaTone, emptyKindOf, formatAmountL1, formatAxisWan, formatEmpty, formatSignedDelta, metricDefinitions, type Layer } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Metric, MetricName } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { BarCell, barCellScale } from "../../charts/bar-cell";
import type { EvidenceSelection } from "../../evidence-drawer";
import { axisTicks, ChartFrame, coordinate, metricText, type ChartLegendItem } from "./chart-frame";

// V3-4b 區塊 8 各通路扣廣告後貢獻（C16，PRD §7.1 第 8 點、§9.5）。
// 標題是結論句（chart-takeaways.ts channelConclusion），副標是標準名稱與本期期間；水平長條從 0 開始：上期細條 8px、本期粗條 18px，負值往左並用不利色，
// 數值直接印在長條末端；長條可點開抽屜，鍵盤經由下方緊湊表（本期金額、貢獻率）與收合的資料表。
// V4-2 代理 B（G4；PRD §4.1–4.7 G4、§7.1、§7.2、§8.7；CHART_CATALOG G4；D-V4-16＝A）：雙長條不變，刻度文字改呼叫 formatAxisWan（整數萬）；
// 緊湊表多一欄「差額（元）」：L2 帶號的 number-link，前面是 C24 variance 差額條（條長＝|差額| ÷ 各通路 |差額| 最大值；不利 chartColors.unfavorable、
// 有利 chartColors.total——同框的上期長條已是 gray-400，不用同色的 chartColors.favorable）。條 aria-hidden、不可聚焦，點條記 chart_clicked 並開同列差額的抽屜。
// 兩個 builder 分開：長條、本期金額與五欄表沿用 channelEvidence（該期水準值，不帶 components，抽屜大數字不帶正負號、畫四層階梯）；
// 差額條與差額 number-link 用 channelChangeEvidence（manager-summary 的 metricComparison 的 evidence.change：差額公式、兩期 components）。

const ui = labels.overview.page;
const copy = labels.overview.channelsV3;
const chartsCopy = labels.overview.chartsV4.channels;
const frame = labels.overview.chartFrame;

/**
 * V4-2 G4：長條的數值軸（只是圖形座標；金額本身一律來自 domain 字串）。範圍與刻度沿用 axisTicks（含 0、不向外延伸），
 * 刻度文字改呼叫 formatAxisWan（整數萬）；步長＝相鄰兩刻度的差（只有一個刻度時為 1）。
 */
export function channelAxis(values: readonly (number | null)[]): { domain: [number, number]; ticks: number[]; step: number; labels: string[] } {
  const scale = axisTicks(values);
  const step = scale.ticks.length > 1 ? Number((scale.ticks[1] - scale.ticks[0]).toPrecision(12)) : 1;
  return { ...scale, step, labels: formatAxisWan(scale.ticks, step) };
}
const metricValue = (metric: string, value: string) => `${metric} ${value}`;
/** 本期扣廣告後貢獻為負（L1 取位後）時用不利色；有利不上色（D-V3-7＝A）。 */
const unfavorable = (name: MetricName, value: string | null, layer: Layer) => deltaTone(name, value, layer) === "unfavorable";

type ChannelRow = ChannelConclusionRow & { previousValue: number | null; currentValue: number | null };

export interface ChannelSectionProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
}

/**
 * 長條與表格共用的抽屜內容：該通路該期的扣廣告後貢獻（與 v2 通路摘要的 number() 相同：指標名為標題、範圍是單一通路、來源是該通路該期的列）。
 * 點本期粗條、點上期細條、點緊湊表與資料表的金額，都經由這一個函式。
 * V3-9b F10 下鑽（PRD §9.5 互動 P1）：帶 filter.channel，抽屜的原始明細篩到該通路並顯示篩選片語（鍵盤經由表格得到同一個抽屜）。
 */
export function channelEvidence(snapshot: WorkspaceSnapshot, channel: string, period: "previous" | "current", name: MetricName = "contribution_after_marketing"): EvidenceSelection {
  const summary = snapshot.report[period];
  const row = Object.hasOwn(summary.channels, channel) ? summary.channels[channel] : null;
  return { name, metric: row?.metrics[name] ?? { value: null, reason_codes: ["MISSING_VALUE"] }, period: summary.period, sources: row?.sources ?? [], channels: [channel], title: metricDefinitions[name].label, filter: { channel } };
}

const MISSING_CHANGE: Metric = { value: null, reason_codes: ["MISSING_VALUE"] };
/**
 * V4-2 G4：差額條與緊湊表差額 number-link 共用的抽屜內容（同一個 builder）：metricComparison(snapshot, "contribution_after_marketing", channel) 的 evidence.change
 * （標題「{通路} {指標}差額」、差額公式、components＝[上期, 本期]、期間＝上期起日到本期迄日、來源＝兩期的列）再加 filter.channel（原始明細篩到該通路）。
 * 通路不在某一期的 report 時（domain 的 aggregatePeriod 對範圍內每個通路都會輸出，只是防呆，比照 channelEvidence 的未知通路）回傳缺值的差額，不呼叫 metricComparison。
 */
export function channelChangeEvidence(snapshot: WorkspaceSnapshot, channel: string): EvidenceSelection {
  const { report } = snapshot;
  if (!Object.hasOwn(report.previous.channels, channel) || !Object.hasOwn(report.current.channels, channel)) {
    return { name: "contribution_after_marketing", metric: MISSING_CHANGE, period: { start: report.previous.period.start, end: report.current.period.end }, sources: [], channels: [channel], title: metricDefinitions.contribution_after_marketing.label, filter: { channel } };
  }
  return { ...metricComparison(snapshot, "contribution_after_marketing", channel).evidence.change, filter: { channel } };
}
/** 差額格的顯示字：L2 帶號（「+183,437」「−782,271」）；缺值依原因碼寫「資料待補」或「不適用」。 */
export function channelChangeText(metric: Metric): string {
  return metric.value === null ? formatEmpty(emptyKindOf(metric.reason_codes)) : formatSignedDelta(metric.value, "L2");
}

export function ChannelSection({ snapshot, onEvidence }: ChannelSectionProps) {
  const { report } = snapshot;
  const resolver = snapshotResolver(snapshot);
  const conclusion = channelConclusion(snapshot, { resolver });
  // V4-2 G4：各通路的差額（同一個 builder 給條與 number-link），差額條共用一把尺（PRD §7.2：同一張表的內嵌條共用最大值）。
  const changes = useMemo(() => new Map(report.scope.channels.map(channel => [channel, channelChangeEvidence(snapshot, channel)])), [report.scope.channels, snapshot]);
  const changeScale = useMemo(() => barCellScale([...changes.values()].map(evidence => evidence.metric.value)), [changes]);
  const openChange = (channel: string) => { const evidence = changes.get(channel); if (evidence) onEvidence(evidence); };
  const onChangeBar = (channel: string) => { track("chart_clicked"); openChange(channel); };
  const openChannel = (channel: string, period: "previous" | "current", name: MetricName = "contribution_after_marketing") => onEvidence(channelEvidence(snapshot, channel, period, name));
  /** 資料表的金額（v2 的 number-link，L2）：抽屜內容同 channelEvidence。 */
  const number = (channel: string, period: "previous" | "current", name: MetricName) => { const evidence = channelEvidence(snapshot, channel, period, name); return <button className="number-link" onClick={() => onEvidence(evidence)}>{metricText(name, evidence.metric, "L2")}</button>; };
  const rows: ChannelRow[] = conclusion.rows.map(row => ({ ...row, previousValue: coordinate(row.previous), currentValue: coordinate(row.current) }));
  // 長條從 0 開始：範圍＝[min(0, 最小值), max(0, 最大值)]，刻度是整齊步長（萬）的倍數。
  const scale = channelAxis(rows.flatMap(row => [row.previousValue, row.currentValue]));
  const axisText = new Map(scale.ticks.map((tick, index) => [tick, scale.labels[index]]));
  const legend: ChartLegendItem[] = [{ key: "current", label: frame.legend.current, color: chartColors.current }, { key: "previous", label: frame.legend.previous, color: chartColors.previous }];
  const barRow = (item: { payload?: unknown }) => item.payload as ChannelRow | undefined;
  /**
   * V4-8b（D-V4-59 (5)）：標值依長條自己的資料列找列——LabelList 的 valueAccessor 回傳該長條 payload 的通路代號，EndLabel 以它在 rows 找列。
   * v3 用 LabelList 的 index 取 rows[index]，但 Recharts 只為有畫出的長條編號（null 與寬 0 的長條不在清單內），有 null 通路時其後每一列的標值都錯位一列。
   * 沒有 null 通路時每個 index 都對到同一列，輸出與 v3 逐字相同。
   */
  const labelChannel = (entry: { payload?: unknown }) => barRow(entry)?.channel;
  const rowOf = (channel: unknown) => typeof channel === "string" ? rows.find(row => row.channel === channel) : undefined;

  /** 長條末端的標值：一律放在長條的右端（負值時就是零線）外 6px；本期粗條印 L1 金額（負值不利色），上期細條印「上期 {L1}」。 */
  const endLabel = (period: "previous" | "current") => function EndLabel(props: LabelProps): ReactElement | null {
    const row = rowOf(props.value);
    if (row === undefined) return null;
    const metric = period === "current" ? row.current : row.previous;
    if (metric.value === null) return null;
    const x = Number(props.x ?? 0), width = Number(props.width ?? 0), y = Number(props.y ?? 0), height = Number(props.height ?? 0);
    const right = Math.max(x, x + width);
    const shown = formatAmountL1(metric.value);
    const tone = period === "current" ? unfavorable("contribution_after_marketing", metric.value, "L1") ? " is-unfavorable" : " is-strong" : "";
    return <text className={`chart-value${tone}`} x={right + 6} y={y + height / 2} dominantBaseline="central">{period === "current" ? shown : fill(copy.previousValue, { value: shown })}</text>;
  };

  const kv = <table className="kv channel-kv" aria-label={copy.tableAria}>
    <thead><tr><th scope="col">{copy.table.channel}</th><th scope="col" className="num">{copy.table.current}</th><th scope="col" className="num">{copy.table.margin}</th><th scope="col" className="num">{copy.dataTable.change}</th></tr></thead>
    <tbody>{conclusion.rows.map(row => {
      const amount = metricText("contribution_after_marketing", row.current, "L2"), rate = metricText("contribution_margin", row.margin, "L2");
      const change = changes.get(row.channel)?.metric ?? MISSING_CHANGE;
      const changeShown = channelChangeText(change);
      const changeTone = change.value === null ? null : deltaTone("contribution_after_marketing", change.value, "L2");
      return <tr key={row.channel}>
        <th scope="row">{row.label}{row.turned !== null && <span className="ui-lozenge" data-tone={row.turned === "negative" ? "unfavorable" : undefined}>{row.turned === "negative" ? copy.turnedNegative : copy.turnedPositive}</span>}</th>
        <td className={`num${unfavorable("contribution_after_marketing", row.current.value, "L2") ? " negative" : ""}`}><button type="button" className="number-link" aria-label={fill(row.current.value === null ? copy.marginAria : copy.amountAria, { channel: row.label, metric: metricDefinitions.contribution_after_marketing.label, value: amount })} onClick={() => openChannel(row.channel, "current")}>{amount}</button></td>
        <td className={`num${unfavorable("contribution_margin", row.margin.value, "L2") ? " negative" : ""}`}><button type="button" className="number-link" aria-label={fill(copy.marginAria, { channel: row.label, metric: metricDefinitions.contribution_margin.label, value: rate })} onClick={() => openChannel(row.channel, "current", "contribution_margin")}>{rate}</button></td>
        <td className={`num channel-change${changeTone === "unfavorable" ? " negative" : ""}`}>{changeTone !== null && <BarCell mode="variance" value={change.value} max={changeScale} tone={changeTone} favorableFill="total" testId={`chart-overview-channels-bar-${row.channel}`} onClick={() => onChangeBar(row.channel)} />}<button type="button" className="number-link" aria-label={fill(change.value === null ? chartsCopy.changeEmptyAria : chartsCopy.changeAria, { channel: row.label, metric: metricDefinitions.contribution_after_marketing.label, value: changeShown })} onClick={() => openChange(row.channel)}>{changeShown}</button></td>
      </tr>;
    })}</tbody>
  </table>;

  const table = <div className="table-scroll" tabIndex={0} role="region" aria-label={ui.channelTableAria}><table><caption>{fill(ui.captionWithUnit, { caption: ui.channelCaption })}</caption><thead><tr><th>{ui.colChannel}</th><th>{labels.shell.periods.current}{metricDefinitions.net_revenue.label}</th><th>{labels.shell.periods.previous}{metricDefinitions.contribution_after_marketing.shortLabel}</th><th>{labels.shell.periods.current}{metricDefinitions.contribution_after_marketing.shortLabel}</th><th>{labels.shell.periods.current}{metricDefinitions.contribution_margin.shortLabel}</th></tr></thead><tbody>{Object.keys(report.current.channels).map(channel => <tr key={channel}><th>{channelLabel(channel, resolver)}</th><td>{number(channel, "current", "net_revenue")}</td><td>{number(channel, "previous", "contribution_after_marketing")}</td><td>{number(channel, "current", "contribution_after_marketing")}</td><td>{number(channel, "current", "contribution_margin")}</td></tr>)}</tbody></table></div>;

  return <ChartFrame id="channel" testId="channel-mix" title={conclusion.title} subtitle={conclusion.subtitle} legend={legend} height="sm" state={rows.length === 0 ? "empty" : "ready"} after={kv}
    dataTable={{ summary: fill(ui.dataTable, { title: labels.overview.sections.channelMix }), content: table }}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: chartHeights.sm }}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 88, bottom: 4, left: 0 }} barGap={4} accessibilityLayer={false}>
        <CartesianGrid horizontal={false} stroke={chartColors.grid} />
        <XAxis type="number" domain={scale.domain} ticks={scale.ticks} tickFormatter={(value: number) => axisText.get(value) ?? ""} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: chartFontSize, fill: chartColors.axis }} />
        <YAxis type="category" dataKey="label" width={136} tickLine={false} axisLine={false} tick={{ fontSize: chartFontSize, fill: chartColors.axis }} />
        <ReferenceLine x={0} stroke={chartColors.connector} />
        <Tooltip cursor={false} content={({ active, payload }) => { const row = payload?.[0]?.payload as ChannelRow | undefined; return active && row ? <div className="chart-tooltip"><strong>{row.label}</strong><p>{metricValue(labels.shell.periods.previous, metricText("contribution_after_marketing", row.previous, "L1"))}</p><p>{metricValue(labels.shell.periods.current, metricText("contribution_after_marketing", row.current, "L1"))}</p></div> : null; }} />
        <Bar dataKey="previousValue" className="chart-bar-link" barSize={8} fill={chartColors.previous} isAnimationActive={false} onClick={item => { const row = barRow(item); if (row) openChannel(row.channel, "previous"); }}>
          <LabelList valueAccessor={labelChannel} content={endLabel("previous")} />
        </Bar>
        <Bar dataKey="currentValue" className="chart-bar-link" barSize={18} fill={chartColors.current} isAnimationActive={false} onClick={item => { const row = barRow(item); if (row) openChannel(row.channel, "current"); }}>
          {rows.map(row => <Cell key={row.channel} fill={unfavorable("contribution_after_marketing", row.current.value, "L1") ? chartColors.unfavorable : chartColors.current} />)}
          <LabelList valueAccessor={labelChannel} content={endLabel("current")} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </ChartFrame>;
}
