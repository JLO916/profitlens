"use client";

import type { ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis, type LabelProps } from "recharts";
import { channelConclusion, type ChannelConclusionRow } from "@/application/chart-takeaways";
import { chartColors, chartFontSize, chartHeights } from "@/application/chart-theme";
import { channelLabel, demoAlias } from "@/application/copy";
import { deltaTone, formatAmountL1, metricDefinitions, type Layer } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { MetricName } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "../../evidence-drawer";
import { axisTicks, ChartFrame, coordinate, metricText, type ChartLegendItem } from "./chart-frame";

// V3-4b 區塊 8 各通路扣廣告後貢獻（C16，PRD §7.1 第 8 點、§9.5）。
// 標題是結論句（chart-takeaways.ts channelConclusion），副標是標準名稱與本期期間；水平長條從 0 開始：上期細條 8px、本期粗條 18px，負值往左並用不利色，
// 數值直接印在長條末端；長條可點開抽屜，鍵盤經由下方緊湊表（本期金額、貢獻率）與收合的資料表。

const ui = labels.ui.overview;
const copy = labels.overview.channelsV3;
const frame = labels.overview.chartFrame;

// 圖軸刻度只是座標，用 L1 尺度顯示；金額本身一律來自 domain 字串。
const axis = (value: number) => Number.isFinite(value) ? formatAmountL1(String(value)) : "";
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

export function ChannelSection({ snapshot, onEvidence }: ChannelSectionProps) {
  const { report } = snapshot;
  const alias = demoAlias(report.dataset_id);
  const conclusion = channelConclusion(snapshot, { alias });
  const openChannel = (channel: string, period: "previous" | "current", name: MetricName = "contribution_after_marketing") => onEvidence(channelEvidence(snapshot, channel, period, name));
  /** 資料表的金額（v2 的 number-link，L2）：抽屜內容同 channelEvidence。 */
  const number = (channel: string, period: "previous" | "current", name: MetricName) => { const evidence = channelEvidence(snapshot, channel, period, name); return <button className="number-link" onClick={() => onEvidence(evidence)}>{metricText(name, evidence.metric, "L2")}</button>; };
  const rows: ChannelRow[] = conclusion.rows.map(row => ({ ...row, previousValue: coordinate(row.previous), currentValue: coordinate(row.current) }));
  // 長條從 0 開始：範圍＝[min(0, 最小值), max(0, 最大值)]，刻度是整齊步長（萬）的倍數。
  const scale = axisTicks(rows.flatMap(row => [row.previousValue, row.currentValue]));
  const legend: ChartLegendItem[] = [{ key: "current", label: frame.legend.current, color: chartColors.current }, { key: "previous", label: frame.legend.previous, color: chartColors.previous }];
  const rowAt = (index: unknown) => typeof index === "number" ? rows[index] : undefined;
  const barRow = (item: { payload?: unknown }) => item.payload as ChannelRow | undefined;

  /** 長條末端的標值：一律放在長條的右端（負值時就是零線）外 6px；本期粗條印 L1 金額（負值不利色），上期細條印「上期 {L1}」。 */
  const endLabel = (period: "previous" | "current") => function EndLabel(props: LabelProps): ReactElement | null {
    const row = rowAt(props.index);
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
    <thead><tr><th scope="col">{copy.table.channel}</th><th scope="col" className="num">{copy.table.current}</th><th scope="col" className="num">{copy.table.margin}</th></tr></thead>
    <tbody>{conclusion.rows.map(row => {
      const amount = metricText("contribution_after_marketing", row.current, "L2"), rate = metricText("contribution_margin", row.margin, "L2");
      return <tr key={row.channel}>
        <th scope="row">{row.label}{row.turned !== null && <span className="ui-lozenge" data-tone={row.turned === "negative" ? "unfavorable" : undefined}>{row.turned === "negative" ? copy.turnedNegative : copy.turnedPositive}</span>}</th>
        <td className={`num${unfavorable("contribution_after_marketing", row.current.value, "L2") ? " negative" : ""}`}><button type="button" className="number-link" aria-label={fill(row.current.value === null ? copy.marginAria : copy.amountAria, { channel: row.label, metric: metricDefinitions.contribution_after_marketing.label, value: amount })} onClick={() => openChannel(row.channel, "current")}>{amount}</button></td>
        <td className={`num${unfavorable("contribution_margin", row.margin.value, "L2") ? " negative" : ""}`}><button type="button" className="number-link" aria-label={fill(copy.marginAria, { channel: row.label, metric: metricDefinitions.contribution_margin.label, value: rate })} onClick={() => openChannel(row.channel, "current", "contribution_margin")}>{rate}</button></td>
      </tr>;
    })}</tbody>
  </table>;

  const table = <div className="table-scroll" tabIndex={0} role="region" aria-label={ui.channelTableAria}><table><caption>{fill(ui.captionWithUnit, { caption: ui.channelCaption })}</caption><thead><tr><th>{ui.colChannel}</th><th>{labels.periods.current}{metricDefinitions.net_revenue.label}</th><th>{labels.periods.previous}{metricDefinitions.contribution_after_marketing.shortLabel}</th><th>{labels.periods.current}{metricDefinitions.contribution_after_marketing.shortLabel}</th><th>{labels.periods.current}{metricDefinitions.contribution_margin.shortLabel}</th></tr></thead><tbody>{Object.keys(report.current.channels).map(channel => <tr key={channel}><th>{channelLabel(channel, alias)}</th><td>{number(channel, "current", "net_revenue")}</td><td>{number(channel, "previous", "contribution_after_marketing")}</td><td>{number(channel, "current", "contribution_after_marketing")}</td><td>{number(channel, "current", "contribution_margin")}</td></tr>)}</tbody></table></div>;

  return <ChartFrame id="channel" testId="channel-mix" title={conclusion.title} subtitle={conclusion.subtitle} legend={legend} height="sm" state={rows.length === 0 ? "empty" : "ready"} after={kv}
    dataTable={{ summary: fill(ui.dataTable, { title: labels.sections.channelMix }), content: table }}>
    <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 520, height: chartHeights.sm }}>
      <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 88, bottom: 4, left: 0 }} barGap={4} accessibilityLayer={false}>
        <CartesianGrid horizontal={false} stroke={chartColors.grid} />
        <XAxis type="number" domain={scale.domain} ticks={scale.ticks} tickFormatter={axis} allowDecimals={false} tickLine={false} axisLine={false} tick={{ fontSize: chartFontSize, fill: chartColors.axis }} />
        <YAxis type="category" dataKey="label" width={136} tickLine={false} axisLine={false} tick={{ fontSize: chartFontSize, fill: chartColors.axis }} />
        <ReferenceLine x={0} stroke={chartColors.connector} />
        <Tooltip cursor={false} content={({ active, payload }) => { const row = payload?.[0]?.payload as ChannelRow | undefined; return active && row ? <div className="chart-tooltip"><strong>{row.label}</strong><p>{metricValue(labels.periods.previous, metricText("contribution_after_marketing", row.previous, "L1"))}</p><p>{metricValue(labels.periods.current, metricText("contribution_after_marketing", row.current, "L1"))}</p></div> : null; }} />
        <Bar dataKey="previousValue" className="chart-bar-link" barSize={8} fill={chartColors.previous} isAnimationActive={false} onClick={item => { const row = barRow(item); if (row) openChannel(row.channel, "previous"); }}>
          <LabelList dataKey="previousValue" content={endLabel("previous")} />
        </Bar>
        <Bar dataKey="currentValue" className="chart-bar-link" barSize={18} fill={chartColors.current} isAnimationActive={false} onClick={item => { const row = barRow(item); if (row) openChannel(row.channel, "current"); }}>
          {rows.map(row => <Cell key={row.channel} fill={unfavorable("contribution_after_marketing", row.current.value, "L1") ? chartColors.unfavorable : chartColors.current} />)}
          <LabelList dataKey="currentValue" content={endLabel("current")} />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  </ChartFrame>;
}
