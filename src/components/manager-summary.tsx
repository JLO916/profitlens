"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown, priorityEvidence, summaryDecisionState, summaryScopeLabel, withSummaryScenarioSelection, type ManagerSummary as SummaryData, type SummaryDecisionContext, type SummaryEvidence } from "@/application/manager-summary";
import { downloadText } from "@/application/download";
import { formatMoney, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Diagnostic } from "@/domain/types";
import type { EvidenceSelection } from "./evidence-drawer";
import styles from "./manager-summary.module.css";

export interface ManagerSummaryProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  decisionContext?: SummaryDecisionContext;
  onCreateAction?: (diagnostic: Diagnostic) => void;
}

export function ManagerSummary({ snapshot, onEvidence, decisionContext, onCreateAction }: ManagerSummaryProps) {
  const [thresholdInput, setThresholdInput] = useState("0.00");
  const [threshold, setThreshold] = useState("0.00");
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [printing, setPrinting] = useState(false);
  const summary = useMemo(() => buildManagerSummary(snapshot, { importanceThreshold: threshold }), [snapshot, threshold]);
  const effectiveContext = withSummaryScenarioSelection(decisionContext, selected);
  const decisions = summaryDecisionState(summary, effectiveContext);
  const amount = (evidence: SummaryEvidence, signed = false) => <button type="button" className="number-link" onClick={() => onEvidence(evidence)} aria-label={evidence.title}>{evidence.metric.value === null ? "資料待補" : signed ? formatSignedMoney(evidence.metric.value) : formatMoney(evidence.metric.value)}</button>;
  useEffect(() => {
    if (!printing) return;
    const stop = () => setPrinting(false);
    window.addEventListener("afterprint", stop);
    window.print();
    return () => window.removeEventListener("afterprint", stop);
  }, [printing]);

  return <section className={`panel ${styles.summary}`} data-testid="manager-summary" aria-labelledby="manager-summary-title">
    <div className="section-heading"><div><p className="eyebrow">主管會議工作稿</p><h2 id="manager-summary-title">本期經營摘要</h2></div><span className="tag">草稿・待人工決策</span></div>
    <p className={styles.context}>資料截至 {summary.data_as_of} · {summary.scope.channels.join("、")} · TWD</p>
    <p className="note">前期 {summary.scope.previous_period.start} — {summary.scope.previous_period.end}（{summary.previous_days} 天）；本期 {summary.scope.current_period.start} — {summary.scope.current_period.end}（{summary.current_days} 天）。{summary.scope.comparison_mode === "calendar_months" ? "完整自然月" : "相同天數"}比較，以下為完整期間合計。</p>
    <div className={styles.headlines}>{summary.headlines.map(row => <div key={row.metric}><h3>{metricDefinitions[row.metric].label}</h3><p className={styles.change}>{amount(row.evidence.change, true)}</p><p className="note">{amount(row.evidence.previous)} → {amount(row.evidence.current)}</p></div>)}</div>
    <p className="note">已觀察金額差異，非改善收益。合計與通路包含相同交易，各範圍不可相加。</p>
    <div className={styles.priorityHeader}><h3>本期最值得先查的三件事</h3><form className={styles.threshold} onSubmit={event => { event.preventDefault(); try { const checked = buildManagerSummary(snapshot, { importanceThreshold: thresholdInput }); setThreshold(checked.importance_threshold); setThresholdInput(checked.importance_threshold); setError(""); } catch { setError("重要性門檻須為大於或等於零、最多兩位小數的 TWD 金額。"); } }}><label>金額重要性門檻（TWD）<input aria-describedby="manager-threshold-help" value={thresholdInput} onChange={event => setThresholdInput(event.target.value)} inputMode="decimal" maxLength={30} /></label><button type="submit" className="button quiet">套用摘要門檻</button></form></div>
    <p className="note" id="manager-threshold-help">缺漏一律優先；同一規則的合計與子通路合為一組，以組內最大絕對排序金額比較門檻（不相加）。只改摘要優先序，完整診斷保留。已套用 {formatMoney(summary.importance_threshold)} TWD。</p>
    {error && <p role="alert">{error}</p>}
    {summary.priorities.length ? <ol className={styles.priorities}>{summary.priorities.map(item => <li key={item.code} data-testid={`manager-priority-${item.code}`}><div className={styles.priorityTitle}><h4>{item.title}</h4>{amount(item.evidence, true)}</div><p className="note">{summaryScopeLabel(item.primary.scope)} · {item.code === "MISSING_CRITICAL_DATA" ? "資料品質：待補，不能估算金額" : "已知的排序金額；不是改善機會加總"}</p><p>{item.recommendation}</p>{item.members.length > 1 && <details><summary>相關子問題與證據（{item.members.length - 1} 個範圍）</summary><ul>{item.members.slice(1).map(member => <li key={member.id}>{summaryScopeLabel(member.scope)}：{amount(priorityEvidence(snapshot, member), true)}</li>)}</ul><p className="note">上述各層範圍不可相加。</p></details>}{onCreateAction && <button type="button" className="button quiet" onClick={() => onCreateAction(item.primary)}>建立行動草稿</button>}</li>)}</ol> : <p role="status">沒有達到此門檻的規則訊號；不代表沒有營運風險，仍可檢閱完整通路診斷。</p>}
    <p className="note">另有 {summary.omitted_group_count} 組未在此優先清單列出；可至通路診斷查看全部規則。</p>
    <details className={styles.wideTable} open><summary>通路寬表・前期／本期／差額</summary><div className="table-scroll" tabIndex={0} role="region" aria-label="主管摘要通路寬表"><table><caption>目前範圍通路合計，TWD；未知不補零，通路廣告不分攤至 SKU。</caption><thead><tr><th scope="col">通路</th><th scope="col">前期淨營收</th><th scope="col">本期淨營收</th><th scope="col">營收差額</th><th scope="col">前期貢獻</th><th scope="col">本期貢獻</th><th scope="col">貢獻差額</th></tr></thead><tbody>{summary.channels.map(row => <tr key={row.channel}><th scope="row">{row.channel}{row.contribution.transition === "turned_negative" && <span className={styles.transition}>轉負</span>}{row.contribution.transition === "turned_positive" && <span className={styles.transition}>轉正</span>}</th>{([row.revenue, row.contribution]).flatMap((metric) => (["previous", "current", "change"] as const).map(period => <td key={`${metric.metric}-${period}`}>{amount(metric.evidence[period], period === "change")}</td>))}</tr>)}</tbody></table></div></details>
    <div className={styles.decisions}><h3>會議方案與交辦</h3>{decisions.scenarios.length > 0 && <label>本次摘要所選方案<select aria-label="本次摘要所選方案" value={decisions.selected?.id ?? ""} onChange={event => setSelected(event.target.value)}><option value="">尚未選擇</option>{decisions.scenarios.map(plan => <option key={plan.id} value={plan.id} disabled={plan.status !== "current"}>{plan.name}（{plan.status === "current" ? plan.scopeLabel : plan.status === "stale" ? "過期" : "草稿"}）</option>)}</select></label>}{decisions.selected ? <><p>{decisions.selected.name} · {decisions.selected.scopeLabel} · 條件貢獻 {formatMoney(decisions.selected.contribution ?? null)}；相對基準差額 {formatSignedMoney(decisions.selected.delta ?? null)} TWD。方案差額不可相加，不是預測。</p><details><summary>所選方案假設</summary><ul>{decisions.selected.assumptions.map((assumption, index) => <li key={index}>{assumption}</li>)}</ul></details></> : <p className="note">未選擇可沿用的方案；草稿及過期方案不作為本期決策。</p>}{decisions.actions.length ? <ul>{decisions.actions.map(action => <li key={action.id}><strong>{action.problem}</strong> · {action.status === "current" ? "已確認" : action.status === "stale" ? "過期／歷史證據" : "草稿待確認"} · {action.scopeLabel}<p>{action.action}</p><p className="note">負責人：{action.owner || "待指定"} · 期限：{action.deadline || "待設定"} · 風險／停止條件：{action.risk || "待補"}</p></li>)}</ul> : <p className="note">行動尚未建立；待指定負責人、期限與風險／停止條件。</p>}</div>
    <details><summary>固定口徑與限制</summary><ul>{summary.assumptions.map(item => <li key={item}>{item}</li>)}</ul></details>
    <div className={styles.controls}><button type="button" className="button quiet" onClick={() => downloadText(exportManagerSummaryMarkdown(summary, effectiveContext), "profitlens-manager-summary.md", "text/markdown;charset=utf-8")}>下載主管摘要 Markdown</button><button type="button" className="button quiet" onClick={() => downloadText(exportChannelComparisonCsv(summary), "profitlens-channel-comparison.csv")}>下載通路寬表 CSV</button><button type="button" className="button quiet" onClick={() => setPrinting(true)}>列印主管摘要</button>{printing && <button type="button" className="button quiet" onClick={() => setPrinting(false)}>結束列印檢視</button>}</div>
    <p className="note">金額重要性門檻與本次摘要所選方案只用於此頁檢閱，不存入工作區備份；切換頁籤或重新整理後須重新設定。下載的摘要保留當次設定。</p>
    <p className="note">以上在本機產生；摘要 Markdown 的技術來源置於附錄，原完整分析／決策稽核匯出保留。列印稿適合一頁會議閱讀；通路或行動較多時依篇幅續頁，不截斷資料。</p>
    {printing && createPortal(<PrintSummary summary={summary} decisionContext={effectiveContext} />, document.body)}
  </section>;
}

function PrintSummary({ summary, decisionContext }: { summary: SummaryData; decisionContext?: SummaryDecisionContext }) {
  const decisions = summaryDecisionState(summary, decisionContext);
  return <article className={styles.printSurface} data-testid="manager-summary-print"><header><h1>ProfitLens 主管會議摘要</h1><p>草稿・待人工決策｜截至 {summary.data_as_of}｜{summary.scope.channels.join("、")}｜TWD</p><p>前期 {summary.scope.previous_period.start}～{summary.scope.previous_period.end}（{summary.previous_days} 天）；本期 {summary.scope.current_period.start}～{summary.scope.current_period.end}（{summary.current_days} 天）；{summary.scope.comparison_mode === "calendar_months" ? "完整自然月" : "相同天數"}。</p></header><div className={styles.printHeadlines}>{summary.headlines.map(row => <p key={row.metric}><strong>{metricDefinitions[row.metric].label}</strong><br />{formatMoney(row.previous.value)} → {formatMoney(row.current.value)}；差額 {row.change.value === null ? "資料待補" : formatSignedMoney(row.change.value)}</p>)}</div><h2>本期最值得先查的三件事</h2><p>門檻 {formatMoney(summary.importance_threshold)} TWD；缺漏優先，重複規則分組，金額不可跨層相加。</p><ol>{summary.priorities.map(item => <li key={item.code}><strong>{item.title}</strong>｜{summaryScopeLabel(item.primary.scope)}｜{item.ranking_amount.value === null ? "資料待補" : formatSignedMoney(item.ranking_amount.value)}<p>{item.recommendation}</p></li>)}</ol>{!summary.priorities.length && <p>沒有達到此門檻的規則訊號，不代表沒有營運風險。</p>}<table><caption>通路行銷後貢獻</caption><thead><tr><th>通路</th><th>前期</th><th>本期</th><th>差額</th></tr></thead><tbody>{summary.channels.map(row => <tr key={row.channel}><th>{row.channel}</th><td>{formatMoney(row.contribution.previous.value)}</td><td>{formatMoney(row.contribution.current.value)}</td><td>{row.contribution.change.value === null ? "資料待補" : formatSignedMoney(row.contribution.change.value)}</td></tr>)}</tbody></table><h2>所選方案與行動</h2>{decisions.selected ? <><p>{decisions.selected.name}｜{decisions.selected.scopeLabel}｜條件貢獻 {formatMoney(decisions.selected.contribution ?? null)}；差額 {formatSignedMoney(decisions.selected.delta ?? null)}。</p><p>{decisions.selected.assumptions.join("；")}</p></> : <p>未選擇可沿用的方案，草稿／過期不作為本期決策。</p>}{decisions.actions.length ? <ul>{decisions.actions.map(action => <li key={action.id}><strong>{action.problem}</strong>（{action.status === "stale" ? "過期" : action.status === "current" ? "已確認" : "草稿"}；{action.scopeLabel}）<p>{action.action}｜負責人 {action.owner || "待指定"}｜期限 {action.deadline || "待設定"}｜風險／停止條件 {action.risk || "待補"}</p></li>)}</ul> : <p>尚未建立行動；負責人、期限與風險待補。</p>}<footer>{summary.assumptions.map(item => <p key={item}>{item}</p>)}<p>公式版本 {summary.metric_version}；技術來源與快照識別見同次下載的 Markdown 稽核附錄。</p></footer></article>;
}
