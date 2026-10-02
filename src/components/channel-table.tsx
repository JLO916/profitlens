"use client";

import type { ManagerSummary as SummaryData, SummaryEvidence } from "@/application/manager-summary";
import { channelLabel, demoAlias } from "@/application/copy";
import { formatMoney, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import { labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { amountTone } from "./top-three";
import styles from "./manager-summary.module.css";

/** 通路寬表（上期／本期／差額）。R1 起同時用於通路健檢頁頂與會議摘要；數字一律可開「怎麼算的」。欄名由 labels.periods 與 metricDefinitions 組成，示範資料的通路名僅在顯示層套 alias。 */
export function ChannelWideTable({ summary, onEvidence, ariaLabel, caption }: { summary: SummaryData; onEvidence: (evidence: EvidenceSelection) => void; ariaLabel: string; caption: string }) {
  const alias = demoAlias(summary.dataset_id);
  const columnHeaders = (["net_revenue", "contribution_after_marketing"] as const).flatMap(name => [`${labels.periods.previous}${metricDefinitions[name].shortLabel}`, `${labels.periods.current}${metricDefinitions[name].shortLabel}`, `${metricDefinitions[name].shortLabel}${labels.csvSuffix.change}`]);
  const amount = (evidence: SummaryEvidence, signed = false) => <button type="button" className="number-link" onClick={() => onEvidence(evidence)} aria-label={evidence.title}>{evidence.metric.value === null ? labels.status.missing : signed ? formatSignedMoney(evidence.metric.value) : formatMoney(evidence.metric.value)}</button>;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={ariaLabel}><table><caption>{caption}</caption><thead><tr><th scope="col">{labels.ui.channelTable.channelHeader}</th>{columnHeaders.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead><tbody>{summary.channels.map(row => <tr key={row.channel}><th scope="row">{channelLabel(row.channel, alias)}{row.contribution.transition === "turned_negative" && <span className={styles.transition}>{labels.ui.channelTable.turnedNegative}</span>}{row.contribution.transition === "turned_positive" && <span className={styles.transition}>{labels.ui.channelTable.turnedPositive}</span>}</th>{([row.revenue, row.contribution]).flatMap((metric) => (["previous", "current", "change"] as const).map(period => <td key={`${metric.metric}-${period}`} className={period === "change" ? amountTone(metric.evidence[period].metric.value) : ""}>{amount(metric.evidence[period], period === "change")}</td>))}</tr>)}</tbody></table></div>;
}
