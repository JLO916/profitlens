"use client";

import { useMemo, useState } from "react";
import { AMOUNT_FIELDS, type Dataset, type Fact, type MetricName, type SourceRef } from "@/domain/types";
import { SCENARIO_ASSUMPTIONS, SCENARIO_FORMULAS, type ScenarioInputs } from "@/domain/scenarios";
import {
  blankScenarioInputs, createDecisionSession, isDecisionStale, refreshDecisionSession,
  reconfirmDecision, saveScenario, saveAction, reorderActions,
  type DecisionSession, type ScenarioPlan, type ActionCard,
} from "@/application/decision";
import { exportDecisionCsv, exportDecisionJson, exportDecisionMarkdown } from "@/application/decision-export";
import { downloadText } from "@/application/download";
import { formatMoney, formatRate, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { EvidenceSelection } from "./evidence-drawer";

const inputFields: { key: Exclude<keyof ScenarioInputs, "assumptions_accepted">; label: string; help: string }[] = [
  { key: "volume_change_pct", label: "售出量變化（相對 %）", help: "必填，−90 至 +100；0 也須明確輸入。" },
  { key: "discount_change_pp", label: "折扣率變化（百分點）", help: "例如 10% 加 2 百分點為 12%，不是 10.2%。新折扣率須介於 0%（含）與 100%（不含）。" },
  { key: "fulfillment_change_pct", label: "單位履約成本變化（相對 %）", help: "−100 至 +100；套用在隨量變動後的履約成本。" },
  { key: "ad_change_pct", label: "總廣告支出變化（相對 %）", help: "−100 至 +200；此欄不推算銷量，必須另填售出量變化。" },
  { key: "one_time_cost", label: "一次性投入（TWD）", help: "非負金額，最多兩位小數；本次條件結果扣除一次。" },
];
const actionFields = [
  ["problem", "問題"], ["action", "具體動作"], ["owner_role", "負責角色"],
  ["validation_metric", "驗證指標"], ["deadline", "期限"], ["stop_condition", "停止條件"], ["required_data", "所需額外資料"],
] as const;
const money = (value: string | null | undefined) => formatMoney(value ?? null);
const factValue = (fact: Fact) => metricDefinitions[fact.metric].unit === "money" ? formatMoney(fact.value) : metricDefinitions[fact.metric].unit === "percent" ? formatRate(fact.value) : fact.value ?? "未知";

export function DecisionWorkbench({ dataset, snapshot, revision, filenames, view, onEvidence }: {
  dataset: Dataset; snapshot: WorkspaceSnapshot; revision: number;
  filenames?: Partial<Record<SourceRef["file"], string>>;
  view: "scenarios" | "actions";
  onEvidence: (selection: EvidenceSelection) => void;
}) {
  const current = useMemo(() => createDecisionSession(dataset, snapshot, revision, filenames), [dataset, snapshot, revision, filenames]);
  const [captured, setCaptured] = useState<DecisionSession | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioPlan[]>([]);
  const [actions, setActions] = useState<ActionCard[]>([]);
  const [notice, setNotice] = useState("");
  const session = captured ?? current;
  const stale = isDecisionStale(session, snapshot, revision);
  const singleChannel = session.scope.channels.length === 1;

  function capture() { if (!captured) setCaptured(session); setNotice(""); }
  function editScenario(id: string, patch: Partial<ScenarioPlan>) {
    if (stale) return;
    capture(); setScenarios(previous => previous.map(plan => plan.id === id ? { ...plan, ...patch, result: null } : plan));
  }
  function calculate(plan: ScenarioPlan) {
    if (stale) return;
    try { setScenarios(saveScenario(session, scenarios, plan)); setNotice("已依本方案明示假設檢核；各方案皆從相同 baseline 重算。"); }
    catch { setNotice("尚未計算：請填寫方案名稱、檢查輸入與目前範圍。"); }
  }
  function editAction(id: string, patch: Partial<ActionCard>) {
    if (stale) return;
    capture(); setActions(previous => previous.map(card => card.id === id ? { ...card, ...patch, evidence_confirmed: false } : card));
  }
  function confirmAction(card: ActionCard) {
    if (stale) return;
    if (actionFields.some(([key]) => !card[key].trim()) || !card.fact_ids.length) {
      setNotice("行動尚未確認：請填完七個欄位並選擇至少一項本快照證據；無需補充資料時可明填「無」。"); return;
    }
    try { setActions(saveAction(session, actions, card)); setNotice("行動與證據已由使用者確認；不是已執行或已達成成果。"); }
    catch { setNotice("行動尚未確認：請檢查期限、欄位與本快照中的證據。"); }
  }
  function rebuild() {
    const next = reconfirmDecision(session, scenarios, actions, dataset, snapshot, revision, filenames);
    setCaptured(next.session); setScenarios(next.scenarios); setActions(next.actions);
    setNotice("已採用目前快照。所有數值假設與同意已清空；行動文字保留，證據須重新選擇並確認。");
  }
  function download(format: "md" | "csv" | "json") {
    try {
      const record = refreshDecisionSession(session, snapshot, revision);
      const body = format === "md" ? exportDecisionMarkdown(record, scenarios, actions) : format === "csv" ? exportDecisionCsv(record, scenarios, actions) : exportDecisionJson(record, scenarios, actions);
      downloadText(body, `profitlens-decision.${format}`, format === "json" ? "application/json;charset=utf-8" : format === "md" ? "text/markdown;charset=utf-8" : "text/csv;charset=utf-8");
      setNotice(stale ? "已下載標示過期的歷史工作稿，不可當作目前範圍的結果。" : "已下載本機工作稿；草稿、假設與確認狀態一併保留。");
    } catch { setNotice("無法匯出：方案或行動內容尚未通過檢核，請重新計算／確認後重試。"); }
  }
  function evidence(fact: Fact) {
    if (stale) return;
    onEvidence({ title: `行動證據 · ${metricDefinitions[fact.metric].label}`, name: fact.metric, metric: fact, period: fact.period, channels: fact.scope.channels, sources: fact.sources, scopeLabel: fact.scope.sku ? `SKU ${fact.scope.sku} · 僅商品毛利口徑` : "單一通路完整商品集合" });
  }
  function baselineEvidence(name: MetricName) {
    if (stale || !singleChannel) return;
    onEvidence({ title: `基準 · ${metricDefinitions[name].label}`, name, metric: { value: session.baseline.amounts[name as keyof typeof session.baseline.amounts] ?? null, reason_codes: session.baseline.reasons.map(reason => reason.code) }, period: session.period, channels: session.scope.channels, sources: session.sources });
  }
  return <div className="decision-workbench" data-testid="decision-workbench">
    <div className={`alert ${stale ? "error" : ""}`} role="status" data-testid="decision-freshness">
      <strong>{stale ? "情境與行動已過期" : "使用目前快照"}</strong>
      <span>{stale ? "資料、期間或通路已變更。下方保留舊工作稿供查閱，停止計算與證據連結；不會自動套用到新範圍。" : "條件試算不是預測；行動是使用者工作稿，尚未執行。"}</span>
      {stale && <button className="button quiet" onClick={rebuild}>以目前快照重建並清空假設</button>}
    </div>
    <section className="panel decision-baseline" aria-labelledby="baseline-heading">
      <div className="section-heading"><div><p className="eyebrow">BASELINE / CURRENT CHANNEL</p><h2 id="baseline-heading">本期通路基準</h2><p className="note">{session.dataset_id} · {session.period.start} — {session.period.end} · {session.scope.channels.join("、")} · 資料截至 {session.data_as_of}</p></div><span className={`tag ${stale ? "blocking" : ""}`}>{stale ? "歷史快照" : "不可變更的基準"}</span></div>
      <div className="baseline-metrics">{(["net_revenue", "contribution_after_marketing"] as const).map(name => <div key={name}><span>{metricDefinitions[name].label}</span><button className="baseline-number" data-testid={`baseline-${name}`} disabled={stale || !singleChannel} onClick={() => baselineEvidence(name)}>{money(session.baseline.amounts[name])}</button></div>)}<div><span>歷史折扣率／退款金額比</span><strong>{formatRate(session.baseline.rates.discount_rate)} ／ {formatRate(session.baseline.rates.refund_ratio)}</strong></div><div><span>原有效平台費率／金流費率（占淨營收）</span><strong>{formatRate(session.baseline.rates.platform_rate)} ／ {formatRate(session.baseline.rates.payment_rate)}</strong></div></div>
      {!session.baseline.eligible && <div className="alert partial" data-testid="scenario-unavailable"><strong>此範圍暫不適用情境模型</strong><ul>{session.baseline.reasons.map((reason, i) => <li key={`${reason.code}-${i}`}>{reason.message}</li>)}</ul><p>實際金額仍可在經營總覽與診斷查看；請使用上方通路篩選選取一個完整通路。</p></div>}
      <details><summary>快照版本與範圍</summary><dl className="decision-metadata"><dt>快照格式／公式</dt><dd>{session.schema_version} / {session.scenario_version} / {session.metric_version}</dd><dt>資料版本</dt><dd>{session.dataset_hash}</dd><dt>篩選版本</dt><dd>{session.filter_hash}</dd><dt>工作區修訂</dt><dd>{session.revision}</dd></dl></details>
    </section>
    <section className="panel assumptions-panel" aria-labelledby="assumptions-heading">
      <h2 id="assumptions-heading">每個方案都必須接受的固定假設</h2>
      <ol>{SCENARIO_ASSUMPTIONS.map((assumption, i) => <li key={i}>{assumption}</li>)}</ol>
      <p className="alert">按入帳日退款金額比不等於 cohort 退貨機率。實際平台計價、最低收費、階梯費率或履約固定成本若不符合模型，請不要勾選接受：此方案暫不適用。</p>
      <p className="note">減少廣告不會自動帶出銷量或收入；五個數值皆須明示，0 也不是自動假設。輸入界限是產品防呆，不是業務可能性的估計。各方案不可相加為總增益。</p>
      <details><summary>逐項閉合公式與四捨五入方式</summary><dl className="formula-list">{Object.entries(SCENARIO_FORMULAS).map(([key, formula]) => <div key={key}><dt>{key}</dt><dd>{formula}</dd></div>)}</dl><p className="note">每個中間值採高精度 Decimal；最後才取兩位小數 HALF_UP。取分明細的 G−D−R−C−P−Q−F−O−A−K，加上 rounding_adjustment，精確等於顯示的條件貢獻。</p></details>
    </section>
    <div hidden={view !== "scenarios"}>
      <div className="section-heading"><div><h2>方案比較</h2><p className="note">最多三個方案；先填假設，再計算。修改後舊結果立即撤下。</p></div><button className="button primary" disabled={stale || !session.baseline.eligible || scenarios.length >= 3} onClick={() => { capture(); setScenarios([...scenarios, { id: crypto.randomUUID(), name: `方案 ${scenarios.length + 1}`, inputs: blankScenarioInputs(), result: null }]); }}>新增方案</button></div>
      {!scenarios.length && <p className="empty-note">尚無方案。選擇單一完整通路後，按「新增方案」。</p>}
      <div className="scenario-grid">{scenarios.map((plan, index) => <article className="panel scenario-card" key={plan.id} data-testid={`scenario-${index + 1}`}>
        <fieldset disabled={stale || !session.baseline.eligible}><legend>方案 {index + 1}</legend>
          <label>方案名稱<input aria-label="方案名稱" maxLength={100} value={plan.name} onChange={e => editScenario(plan.id, { name: e.target.value })} /></label>
          <div className="scenario-inputs">{inputFields.map(field => <label key={field.key}>{field.label}<input aria-label={field.label} type="text" inputMode="decimal" maxLength={200} autoComplete="off" value={plan.inputs[field.key]} onChange={e => editScenario(plan.id, { inputs: { ...plan.inputs, [field.key]: e.target.value } })} /><small>{field.help}</small></label>)}</div>
          <button className="text-button" onClick={() => editScenario(plan.id, { inputs: { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: false } })}>填入零變動假設</button>
          <label className="check-label"><input type="checkbox" checked={plan.inputs.assumptions_accepted} onChange={e => editScenario(plan.id, { inputs: { ...plan.inputs, assumptions_accepted: e.target.checked } })} />我接受此方案的全部固定假設</label>
          <div className="button-row"><button className="button primary" onClick={() => calculate(plan)}>計算方案</button><button className="text-button" onClick={() => setScenarios(scenarios.filter(item => item.id !== plan.id))}>移除方案</button></div>
        </fieldset>
        <div aria-live="polite" className="scenario-result" data-testid="scenario-result">
          {stale && <p className="tag blocking">已過期 · 舊快照條件結果</p>}
          {!plan.result && <p>待填寫／重新計算，尚無條件結果。</p>}
          {plan.result?.status !== "valid" && plan.result && <div><strong>{plan.inputs.assumptions_accepted ? "尚不可計算" : "此方案暫不適用"}</strong><ul>{plan.result.reasons.map((reason, i) => <li key={i}>{inputFields.find(field => field.key === reason.field)?.label}{reason.field ? "：" : ""}{reason.message}</li>)}</ul></div>}
          {plan.result?.status === "valid" && <><span>條件行銷後貢獻（含一次性投入）</span><strong data-testid="scenario-contribution">{money(plan.result.contribution)}</strong><p>相對本方案 baseline 差額 <b data-testid="scenario-delta">{formatSignedMoney(plan.result.delta)}</b></p><p className="note">基於明示假設，非預測或已實現效益。</p></>}
        </div>
      </article>)}</div>
      {scenarios.length > 0 && <section className="panel"><h2>基準與條件明細比較{stale ? "（已過期）" : ""}</h2><div className="table-scroll" role="region" aria-label="方案精確金額比較，可水平捲動" tabIndex={0}><table data-testid="scenario-comparison"><caption>金額 TWD；方案各自從同一基準重算，不相加。— 表示尚無可用結果。</caption><thead><tr><th>項目／重算方式</th><th>基準</th>{scenarios.map(plan => <th key={plan.id}>{plan.name}</th>)}</tr></thead><tbody>
        {AMOUNT_FIELDS.map(field => <tr key={field}><th>{metricDefinitions[field].label}<small>{SCENARIO_FORMULAS[field]}</small></th><td>{money(session.baseline.amounts[field])}</td>{scenarios.map(plan => <td key={plan.id}>{money(plan.result?.amounts?.[field])}</td>)}</tr>)}
        <tr><th>一次性投入 K</th><td>不適用</td>{scenarios.map(plan => <td key={plan.id}>{money(plan.result?.amounts?.one_time_cost)}</td>)}</tr>
        <tr><th>取分調整 rounding_adjustment</th><td>不適用</td>{scenarios.map(plan => <td key={plan.id}>{money(plan.result?.rounding_adjustment)}</td>)}</tr>
        <tr className="scenario-total"><th>行銷後貢獻</th><td>{money(session.baseline.amounts.contribution_after_marketing)}</td>{scenarios.map(plan => <td key={plan.id}>{money(plan.result?.contribution)}</td>)}</tr>
        <tr><th>商品淨營收（另列摘要）</th><td>{money(session.baseline.amounts.net_revenue)}</td>{scenarios.map(plan => <td key={plan.id}>{money(plan.result?.amounts?.net_revenue)}</td>)}</tr>
      </tbody></table></div></section>}
    </div>
    <div hidden={view !== "actions"}>
      <div className="section-heading"><div><h2>優先行動工作稿</h2><p className="note">最多三項，可編輯與調整順序；選擇本快照 fact IDs 作為證據。情境結果不等於既有事實。</p></div><button className="button primary" disabled={stale || !singleChannel || actions.length >= 3} onClick={() => { capture(); setActions([...actions, { id: crypto.randomUUID(), problem: "", fact_ids: [], action: "", owner_role: "", validation_metric: "", deadline: "", stop_condition: "", required_data: "", origin: "manual", evidence_confirmed: false }]); }}>新增行動</button></div>
      {!singleChannel && <p className="alert">請先選取一個通路，建立範圍明確的行動工作稿。</p>}
      {!actions.length && <p className="empty-note">尚無行動。以觀察到的問題與證據建立第一項工作。</p>}
      {actions.map((card, index) => <article className="panel action-card" key={card.id} data-testid={`action-${index + 1}`}>
        <div className="section-heading"><h3>優先 {index + 1}</h3><span className={`tag ${stale ? "blocking" : ""}`}>{stale ? "已過期" : card.evidence_confirmed ? "使用者已確認" : "草稿／證據待確認"}</span></div>
        <fieldset disabled={stale}><legend className="sr-only">編輯優先 {index + 1} 行動</legend><div className="action-inputs">{actionFields.map(([key, label]) => <label key={key}>{label}{key === "deadline" ? <input aria-label={label} type="date" value={card[key]} onChange={e => editAction(card.id, { [key]: e.target.value })} /> : <textarea aria-label={label} rows={2} maxLength={2000} value={card[key]} onChange={e => editAction(card.id, { [key]: e.target.value })} />}</label>)}</div>
          <label>本快照證據（可複選）<select aria-label="本快照證據（可複選）" multiple size={5} value={card.fact_ids} onChange={e => editAction(card.id, { fact_ids: Array.from(e.target.selectedOptions, option => option.value) })}>{session.facts.map(fact => <option value={fact.id} key={fact.id}>{fact.period.start}–{fact.period.end} · {metricDefinitions[fact.metric].label} · {fact.scope.sku ?? fact.scope.channels.join("、")} · {factValue(fact)} · {fact.id}</option>)}</select></label>
          <div className="button-row"><button className="button primary" onClick={() => confirmAction(card)}>確認行動與證據</button><button className="button quiet" disabled={index === 0} onClick={() => { const ids = actions.map(item => item.id); [ids[index - 1], ids[index]] = [ids[index], ids[index - 1]]; setActions(reorderActions(actions, ids)); }}>提高優先序</button><button className="text-button" onClick={() => setActions(actions.filter(item => item.id !== card.id))}>移除行動</button></div>
        </fieldset>
        <div className="action-evidence">{card.fact_ids.map(id => session.facts.find(fact => fact.id === id)).filter((fact): fact is Fact => !!fact).map(fact => <button key={fact.id} className="text-button" disabled={stale} onClick={() => evidence(fact)}>查看證據 {fact.id}</button>)}</div>
      </article>)}
    </div>
    <section className="panel decision-export"><h2>下載決策工作稿{stale ? "（已過期）" : ""}</h2><p className="note">包含基準、最多三方案與三行動、快照版本、期間／範圍、五個數值與全部固定假設、fact IDs 與來源。草稿與過期狀態一併保留；本機下載，不呼叫模型、不執行行動。</p><div className="button-row"><button className="button quiet" onClick={() => download("md")}>下載決策 Markdown</button><button className="button quiet" onClick={() => download("csv")}>下載決策 CSV</button><button className="button quiet" onClick={() => download("json")}>下載決策 JSON</button></div></section>
    <p role="status" className="decision-notice" data-testid="decision-notice">{notice}</p>
  </div>;
}
