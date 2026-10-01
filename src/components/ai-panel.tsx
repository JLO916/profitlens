"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { observationCatalog } from "@/ai/grounding";
import { prepareAiSnapshot } from "@/application/ai-snapshot";
import { aiReasonMessage, createAiConsentBinding, createAiRequestBody, getAiCapability, sendAiRequest, type AiCapability, type AiClientResult } from "@/application/ai-client";
import { metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { EvidenceSelection } from "./evidence-drawer";

export interface AiPanelProps { snapshot: WorkspaceSnapshot; revision: number; onEvidence: (selection: EvidenceSelection) => void; capability?: AiCapability | null }

/** Remount before paint on every successful data reload/scope change, including identical bytes. */
export function AiPanel(props: AiPanelProps) {
  const identity = JSON.stringify([props.revision, props.snapshot.dataset_hash, props.snapshot.filter_hash, props.snapshot.metric_version, props.snapshot.data_as_of, props.snapshot.report.scope]);
  return <BoundAiPanel key={identity} {...props} />;
}

function BoundAiPanel({ snapshot, revision, onEvidence, capability: sharedCapability }: AiPanelProps) {
  const prepared = useMemo(() => {
    try {
      const preview = prepareAiSnapshot(snapshot, revision);
      return { ...preview, catalog: observationCatalog(preview.payload) };
    } catch { return null; }
  }, [snapshot, revision]);
  const [localCapability, setLocalCapability] = useState<AiCapability | null>(null);
  const capability = sharedCapability === undefined ? localCapability : sharedCapability;
  const [consentBinding, setConsentBinding] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<AiClientResult | null>(null);
  const requests = useRef({ id: 0, controller: null as AbortController | null });
  useEffect(() => {
    if (sharedCapability !== undefined) return;
    const abort = new AbortController();
    let active = true;
    void getAiCapability(fetch, abort.signal).then(status => { if (active) setLocalCapability(status); });
    return () => { active = false; abort.abort(); };
  }, [sharedCapability]);
  useEffect(() => {
    const requestState = requests.current;
    return () => { requestState.id++; requestState.controller?.abort(); };
  }, []);
  const binding = prepared ? createAiConsentBinding(prepared.payload, revision) : null;
  const consented = binding !== null && consentBinding === binding;
  const mode = result?.status === "live" ? "即時 AI" : pending || result?.status === "fallback" || result?.status === "cancelled" ? "AI 未完成" : "規則診斷";
  const statusMessage = pending ? "正在請求可核查的說明；計算與規則診斷仍可使用。"
    : result?.status === "live" ? "已完成模型回應與本機引用檢核。請人工確認解釋是否受事實支持；通過檢核不代表因果成立。"
      : result?.status === "fallback" ? aiReasonMessage(result.reason)
        : result?.status === "cancelled" ? "已取消請求並撤銷本次同意；若資料已送出，取消無法收回已傳送內容。"
          : !prepared ? "目前快照無法建立受限彙總預覽，未傳送任何資料；規則診斷仍可使用。"
            : !capability ? "正在確認本機伺服器的 AI 設定；尚未傳送分析資料。"
              : capability.available ? "即時 AI 可用。每次傳送前，請先閱讀下方內容並明確同意。"
                : aiReasonMessage(capability.reason);

  async function send() {
    if (!prepared || !capability?.available || !consented || pending) return;
    requests.current.controller?.abort();
    const abort = new AbortController(); requests.current.controller = abort;
    const ticket = ++requests.current.id;
    setPending(true); setResult(null);
    const reply = await sendAiRequest({ payload: prepared.payload, revision, consentBinding, signal: abort.signal, isCurrent: () => ticket === requests.current.id });
    if (ticket !== requests.current.id || reply.status === "stale") return;
    setResult(reply); setPending(false); setConsentBinding(null);
  }
  function cancel() {
    requests.current.id++; requests.current.controller?.abort(); setPending(false); setConsentBinding(null); setResult({ status: "cancelled" });
  }
  function evidence(alias: string) {
    const fact = prepared?.localFacts[alias];
    if (!fact) return;
    onEvidence({ title: `AI 引用證據 · ${metricDefinitions[fact.metric].label}`, name: fact.metric, metric: fact, period: fact.period, channels: fact.scope.channels, sources: fact.sources, scopeLabel: "目前選取通路的完整商品集合；來源對照只留本機" });
  }
  const live = result?.status === "live" ? result : null;
  const requestAvailable = prepared !== null && capability?.available === true;
  function evidenceLabel(alias: string) {
    const fact = prepared?.localFacts[alias];
    return fact ? `${metricDefinitions[fact.metric].label} · ${fact.period.start}—${fact.period.end}` : "查看原始證據";
  }

  return <section className="panel ai-panel" data-testid="ai-panel" aria-labelledby="ai-panel-heading">
    <div className="section-heading"><div><h2 id="ai-panel-heading">選配的 AI 解釋</h2><p className="note">模型只整理說明、待驗證假說與候選行動；金額、比較及可用性由程式計算。</p></div><span className={`tag ${live ? "ready" : ""}`} data-testid="ai-mode">{mode}</span></div>
    <p className="ai-status" role="status" aria-live="polite" data-testid="ai-status">{statusMessage}</p>
    <p className="note"><strong>規則診斷可用</strong>：計算、診斷、試算與行動整理都不需要 AI。{!capability ? "正在確認即時 AI 設定。" : !capability.available ? capability.reason === "STATUS_UNAVAILABLE" ? "即時 AI 狀態未確認，暫停傳送。" : "即時 AI 未啟用。" : "即時 AI 僅在你同意後協助整理說明。"}頁面不接收金鑰，也不會自動呼叫模型或執行建議。</p>
    {requestAvailable && prepared && <>
      <div className="ai-privacy"><h3>傳送前確認</h3><p>接收端：<strong>OpenAI API</strong>，由本機伺服器轉送。只傳送下方彙總快照與程式產生的觀察候選；另附固定的用途與輸出規則，不加入其他使用者資料。</p><p>資料可能受到供應商保留政策影響，不能承諾絕不儲存。原始 CSV、SKU、資料集名稱、實際檔名與通路名稱不會加入模型請求；以下對照只留在目前分頁記憶體。</p></div>
      <div className="ai-readable-preview" data-testid="ai-readable-preview"><h3>將傳送的彙總內容</h3>
        <p>範圍：所選通路合計；共 {prepared.payload.filters.channels.length} 個匿名通路。本次不傳個別通路拆解，因此模型無法指出個別通路的驅動因素；請以本頁通路規則診斷核對。</p>
        <p>資料截至 {prepared.payload.data_as_of}。前期 {prepared.payload.periods.previous.start} 至 {prepared.payload.periods.previous.end}（{prepared.payload.comparison.previous_days} 天）；本期 {prepared.payload.periods.current.start} 至 {prepared.payload.periods.current.end}（{prepared.payload.comparison.current_days} 天）。比較方式：{prepared.payload.comparison.mode === "calendar_months" ? "完整自然月" : "相同天數"}。</p>
        <p>下表為實際傳送值，不是日均金額。金額以新臺幣未稅表示；比率保留小數原值（1 代表 100%），未知值不補零。另傳送來源種類／列數／缺列數、缺漏原因與程式觀察候選；完整格式可在進階資料核對。</p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label="將傳送的前後期彙總指標"><table data-testid="ai-facts-preview"><caption>傳送內容：所選通路合計的前後期指標</caption><thead><tr><th scope="col">期間</th><th scope="col">指標</th><th scope="col">實際傳送值</th><th scope="col">來源</th></tr></thead><tbody>{prepared.payload.facts.map(fact => <tr key={fact.id}><th scope="row">{fact.period === "previous" ? "前期" : "本期"}</th><td>{metricDefinitions[fact.metric].label}</td><td className="number">{fact.value === null ? "未知／不可計算" : `${fact.value} ${metricDefinitions[fact.metric].unit === "money" ? "元" : metricDefinitions[fact.metric].unit === "percent" ? "（比率）" : "倍"}`}</td><td><button className="text-button" onClick={() => evidence(fact.id)} aria-label={`查看${fact.period === "previous" ? "前期" : "本期"}${metricDefinitions[fact.metric].label}來源`}>核對來源</button></td></tr>)}</tbody></table></div>
      </div>
      <details className="ai-preview" data-testid="ai-advanced"><summary>進階資料：完整傳送格式、版本與本機來源對照</summary>
      <details className="ai-preview"><summary>實際傳送給 OpenAI 的完整資料 JSON</summary><pre tabIndex={0} role="region" aria-label="傳送給 OpenAI 的彙總 JSON 預覽" data-testid="ai-payload-preview">{JSON.stringify({ snapshot: prepared.payload, observation_catalog: prepared.catalog }, null, 2)}</pre></details>
      <details className="ai-preview"><summary>本機 API 請求與同意格式</summary><p className="note">只有勾選同意並按下傳送，才會送出這份請求；預覽中的 accepted 不代表已傳送。</p><pre tabIndex={0} aria-label="本機 API 請求 JSON 預覽" data-testid="ai-request-preview">{JSON.stringify(createAiRequestBody(prepared.payload), null, 2)}</pre></details>
      <details className="ai-local-mapping" data-testid="ai-local-mapping"><summary>僅本機的別名與來源對照（不傳送）</summary>
        <dl>{Object.entries(prepared.localChannels).map(([alias, name]) => <div key={alias}><dt>{alias}</dt><dd>{name}</dd></div>)}</dl>
        <div className="ai-fact-mapping">{Object.entries(prepared.localFacts).map(([alias, fact]) => <button key={alias} className="text-button" onClick={() => evidence(alias)}>{alias} · {metricDefinitions[fact.metric].label} · {fact.period.start}—{fact.period.end}<span>{fact.id}</span></button>)}</div>
      </details>
      </details>
      <label className="check-label ai-consent"><input type="checkbox" checked={consented} disabled={pending || !capability?.available} onChange={event => setConsentBinding(event.target.checked ? binding : null)} />我已檢查預覽，並同意將這份彙總資料傳送至 OpenAI</label>
      <p className="note">同意僅適用於這份快照與此次操作。重新載入、換期間或換通路後會撤銷同意與舊回應；即使資料相同或切回原範圍，也須重新確認。</p>
      <div className="button-row"><button className="button primary" disabled={!capability?.available || !consented || pending} onClick={() => void send()}>傳送已同意的彙總資料</button>{pending && <button className="button quiet" onClick={cancel}>取消 AI 請求</button>}</div>
    </>}
    {live && <div className="ai-live-result" data-testid="ai-live-result">
      <h3>即時 AI 說明</h3>
      <p className="note">以下為模型整理的說明，所有數值皆由目前資料填入。假說仍需驗證，候選行動不會自動建立、執行或取代人工行動工作稿。</p>
      <details className="ai-preview" data-testid="ai-response-details"><summary>產生紀錄：接收端、模型與版本</summary><dl className="ai-response-metadata"><div><dt>接收端／模型</dt><dd>{live.metadata.provider} / {live.metadata.model}</dd></div><div><dt>提示版本</dt><dd>{live.metadata.prompt_version}</dd></div><div><dt>產生時間</dt><dd>{live.metadata.generated_at}</dd></div><div><dt>呼叫次數／延遲</dt><dd>{live.metadata.attempts} 次 / {live.metadata.latency_ms} ms</dd></div>{live.metadata.usage && <div><dt>實際 token 用量</dt><dd>輸入 {live.metadata.usage.input_tokens} / 輸出 {live.metadata.usage.output_tokens} / 合計 {live.metadata.usage.total_tokens}；未估算費用</dd></div>}</dl></details>
      <div className="ai-insight-grid">{live.output.insights.map((insight, index) => <article className="ai-insight" key={index}>
        <h4>資料已顯示</h4><p>{insight.observation}</p>
        <div className="ai-evidence-links">{insight.fact_ids.map(alias => <button key={alias} className="text-button" onClick={() => evidence(alias)}>查看證據：{evidenceLabel(alias)}</button>)}</div>
        <h4>待驗證假說</h4>{insight.hypotheses.length ? <ul>{insight.hypotheses.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul> : <p>未提供假說。</p>}
        <h4>候選行動（需人工確認）</h4><p>{insight.recommended_action}</p>
        <dl><div><dt>負責角色</dt><dd>{insight.owner_role}</dd></div><div><dt>驗證指標</dt><dd>{insight.verification_metric}</dd></div><div><dt>停止條件</dt><dd>{insight.stop_condition}</dd></div></dl>
        <h4>所需額外資料</h4><ul>{insight.additional_data_needed.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
        <h4>限制</h4><ul>{insight.limitations.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
      </article>)}</div>
      {live.output.limitations.length > 0 && <div className="ai-result-limitations"><h4>整體限制</h4><ul>{live.output.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    </div>}
  </section>;
}
