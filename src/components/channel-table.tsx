"use client";

import type { ManagerSummary as SummaryData, SummaryEvidence } from "@/application/manager-summary";
import { formatMoney, formatSignedMoney } from "@/application/presentation";
import type { EvidenceSelection } from "./evidence-drawer";
import { amountTone } from "./top-three";
import styles from "./manager-summary.module.css";

/** 通路寬表（前期／本期／差額）。R1 起同時用於通路診斷頁頂與會議摘要；數字一律可開公式與來源。 */
export function ChannelWideTable({ summary, onEvidence, ariaLabel, caption }: { summary: SummaryData; onEvidence: (evidence: EvidenceSelection) => void; ariaLabel: string; caption: string }) {
  const amount = (evidence: SummaryEvidence, signed = false) => <button type="button" className="number-link" onClick={() => onEvidence(evidence)} aria-label={evidence.title}>{evidence.metric.value === null ? "資料待補" : signed ? formatSignedMoney(evidence.metric.value) : formatMoney(evidence.metric.value)}</button>;
  return <div className="table-scroll" tabIndex={0} role="region" aria-label={ariaLabel}><table><caption>{caption}</caption><thead><tr><th scope="col">通路</th><th scope="col">前期淨營收</th><th scope="col">本期淨營收</th><th scope="col">營收差額</th><th scope="col">前期貢獻</th><th scope="col">本期貢獻</th><th scope="col">貢獻差額</th></tr></thead><tbody>{summary.channels.map(row => <tr key={row.channel}><th scope="row">{row.channel}{row.contribution.transition === "turned_negative" && <span className={styles.transition}>轉負</span>}{row.contribution.transition === "turned_positive" && <span className={styles.transition}>轉正</span>}</th>{([row.revenue, row.contribution]).flatMap((metric) => (["previous", "current", "change"] as const).map(period => <td key={`${metric.metric}-${period}`} className={period === "change" ? amountTone(metric.evidence[period].metric.value) : ""}>{amount(metric.evidence[period], period === "change")}</td>))}</tr>)}</tbody></table></div>;
}
