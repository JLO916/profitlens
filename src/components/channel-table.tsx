"use client";

import type { ManagerSummary as SummaryData, SummaryEvidence } from "@/application/manager-summary";
import { channelLabel, demoAlias } from "@/application/copy";
import { deltaTone, formatAmountL2, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { toneClass } from "./top-three";
import styles from "./manager-summary.module.css";

/**
 * 通路寬表（上期／本期／差額）。R1 起同時用於通路健檢頁頂與會議摘要；數字一律可開「怎麼算的」。欄名由 labels.periods 與 metricDefinitions 組成，示範資料的通路名僅在顯示層套 alias。
 * V3-2b：L2（整數元、千分位、U+2212）；單位「元」只在 caption 標一次；差額欄只有不利上色（依 favorableDirection）。
 */
export function ChannelWideTable({ summary, onEvidence, ariaLabel, caption }: { summary: SummaryData; onEvidence: (evidence: EvidenceSelection) => void; ariaLabel: string; caption: string }) {
  const alias = demoAlias(summary.dataset_id);
  const columnHeaders = (["net_revenue", "contribution_after_marketing"] as const).flatMap(name => [`${labels.periods.previous}${metricDefinitions[name].shortLabel}`, `${labels.periods.current}${metricDefinitions[name].shortLabel}`, `${metricDefinitions[name].shortLabel}${labels.csvSuffix.change}`]);
  const amount = (evidence: SummaryEvidence, signed = false) => <button type="button" className="number-link" onClick={() => onEvidence(evidence)} aria-label={evidence.title}>{evidence.metric.value === null ? labels.status.missing : signed ? formatSignedDelta(evidence.metric.value, "L2") : formatAmountL2(evidence.metric.value)}</button>;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={ariaLabel}><table><caption>{fill(labels.ui.channelTable.unitCaption, { caption })}</caption><thead><tr><th scope="col">{labels.ui.channelTable.channelHeader}</th>{columnHeaders.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{summary.channels.map(row => <tr key={row.channel}><th scope="row">{channelLabel(row.channel, alias)}{row.contribution.transition === "turned_negative" && <span className={styles.transition}>{labels.ui.channelTable.turnedNegative}</span>}{row.contribution.transition === "turned_positive" && <span className={styles.transition}>{labels.ui.channelTable.turnedPositive}</span>}</th>{([row.revenue, row.contribution]).flatMap((metric) => (["previous", "current", "change"] as const).map(period => <td key={`${metric.metric}-${period}`} className={period === "change" ? metric.evidence.change.metric.value === null ? "neutral" : toneClass(deltaTone(metric.metric, metric.evidence.change.metric.value, "L2")) : ""}>{amount(metric.evidence[period], period === "change")}</td>))}</tr>)}</tbody></table></div>;
}
