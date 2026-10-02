"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { observationCatalog } from "@/ai/grounding";
import { prepareAiSnapshot } from "@/application/ai-snapshot";
import { aiReasonMessage, createAiConsentBinding, createAiRequestBody, getAiCapability, sendAiRequest, type AiCapability, type AiClientResult } from "@/application/ai-client";
import { channelLabel, demoAlias } from "@/application/copy";
import { metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";

export interface AiPanelProps { snapshot: WorkspaceSnapshot; revision: number; onEvidence: (selection: EvidenceSelection) => void; capability?: AiCapability | null }

const copy = labels.ui.aiPanel;

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
  const alias = demoAlias(snapshot.report.dataset_id);
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
  const mode = result?.status === "live" ? copy.modeLive : pending || result?.status === "fallback" || result?.status === "cancelled" ? copy.modeIncomplete : copy.modeRules;
  const statusMessage = pending ? copy.statusPending
    : result?.status === "live" ? copy.statusLive
      : result?.status === "fallback" ? aiReasonMessage(result.reason)
        : result?.status === "cancelled" ? copy.statusCancelled
          : !prepared ? copy.statusNoPreview
            : !capability ? copy.statusChecking
              : capability.available ? copy.statusAvailable
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
  function evidence(factAlias: string) {
    const fact = prepared?.localFacts[factAlias];
    if (!fact) return;
    onEvidence({ title: fill(copy.evidenceTitle, { metric: metricDefinitions[fact.metric].label }), name: fact.metric, metric: fact, period: fact.period, channels: fact.scope.channels, sources: fact.sources, scopeLabel: copy.evidenceScope });
  }
  const live = result?.status === "live" ? result : null;
  const requestAvailable = prepared !== null && capability?.available === true;
  function evidenceLabel(factAlias: string) {
    const fact = prepared?.localFacts[factAlias];
    return fact ? fill(copy.evidenceLabel, { metric: metricDefinitions[fact.metric].label, start: fact.period.start, end: fact.period.end }) : labels.buttons.viewEvidence;
  }
  const periodLabel = (period: "previous" | "current") => period === "previous" ? labels.periods.previous : labels.periods.current;
  const factValue = (value: string | null, unit: string) => value === null ? labels.status.missing : fill(unit === "money" ? copy.unitMoney : unit === "percent" ? copy.unitPercent : copy.unitRatio, { value });

  return <section className="panel ai-panel" data-testid="ai-panel" aria-labelledby="ai-panel-heading">
    <div className="section-heading"><div><h2 id="ai-panel-heading">{labels.sections.aiExplain}</h2><p className="note">{copy.intro}</p></div><span className={`tag ${live ? "ready" : ""}`} data-testid="ai-mode">{mode}</span></div>
    <p className="ai-status" role="status" aria-live="polite" data-testid="ai-status">{statusMessage}</p>
    <p className="note"><strong>{copy.rulesAvailable}</strong>{copy.rulesAvailableNote}{!capability ? copy.liveChecking : !capability.available ? capability.reason === "STATUS_UNAVAILABLE" ? copy.liveStatusUnknown : copy.liveOff : copy.liveConsentOnly}</p>
    {requestAvailable && prepared && <>
      <div className="ai-privacy"><h3>{copy.privacyHeading}</h3><p>{copy.privacyRecipient}</p><p>{copy.privacyExcluded}</p><p>{copy.privacyRetention}</p></div>
      <div className="ai-readable-preview" data-testid="ai-readable-preview"><h3>{copy.previewHeading}</h3>
        <p>{fill(copy.previewScope, { n: prepared.payload.filters.channels.length })}</p>
        <p>{fill(copy.previewPeriods, { asOf: prepared.payload.data_as_of, prevStart: prepared.payload.periods.previous.start, prevEnd: prepared.payload.periods.previous.end, prevDays: prepared.payload.comparison.previous_days, curStart: prepared.payload.periods.current.start, curEnd: prepared.payload.periods.current.end, curDays: prepared.payload.comparison.current_days, mode: prepared.payload.comparison.mode === "calendar_months" ? labels.periods.calendarMonths : labels.periods.sameDays })}</p>
        <p>{copy.previewValuesNote}</p>
        <div className="table-wrap" tabIndex={0} role="region" aria-label={copy.previewTableAria}><table data-testid="ai-facts-preview"><caption>{copy.previewTableCaption}</caption><thead><tr><th scope="col">{labels.csvColumns.period}</th><th scope="col">{labels.csvColumns.metric}</th><th scope="col">{copy.colValue}</th><th scope="col">{copy.colSource}</th></tr></thead><tbody>{prepared.payload.facts.map(fact => <tr key={fact.id}><th scope="row">{periodLabel(fact.period)}</th><td>{metricDefinitions[fact.metric].label}</td><td className="number">{factValue(fact.value, metricDefinitions[fact.metric].unit)}</td><td><button className="text-button" onClick={() => evidence(fact.id)} aria-label={fill(copy.viewSourceAria, { period: periodLabel(fact.period), metric: metricDefinitions[fact.metric].label })}>{labels.buttons.viewEvidence}</button></td></tr>)}</tbody></table></div>
      </div>
      <details className="ai-preview" data-testid="ai-advanced"><summary>{copy.advancedSummary}</summary>
      <p className="note">{copy.advancedNote}</p>
      <details className="ai-preview"><summary>{copy.payloadSummary}</summary><pre tabIndex={0} role="region" aria-label={copy.payloadAria} data-testid="ai-payload-preview">{JSON.stringify({ snapshot: prepared.payload, observation_catalog: prepared.catalog }, null, 2)}</pre></details>
      <details className="ai-preview"><summary>{copy.requestSummary}</summary><p className="note">{copy.requestNote}</p><pre tabIndex={0} aria-label={copy.requestAria} data-testid="ai-request-preview">{JSON.stringify(createAiRequestBody(prepared.payload), null, 2)}</pre></details>
      <details className="ai-local-mapping" data-testid="ai-local-mapping"><summary>{copy.localMappingSummary}</summary>
        <dl>{Object.entries(prepared.localChannels).map(([channelAlias, name]) => <div key={channelAlias}><dt>{channelAlias}</dt><dd>{channelLabel(name, alias)}</dd></div>)}</dl>
        <div className="ai-fact-mapping">{Object.entries(prepared.localFacts).map(([factAlias, fact]) => <button key={factAlias} className="text-button" onClick={() => evidence(factAlias)}>{factAlias} · {metricDefinitions[fact.metric].label} · {fact.period.start}—{fact.period.end}<span>{fact.id}</span></button>)}</div>
      </details>
      </details>
      <label className="check-label ai-consent"><input type="checkbox" checked={consented} disabled={pending || !capability?.available} onChange={event => setConsentBinding(event.target.checked ? binding : null)} />{copy.consentLabel}</label>
      <p className="note">{copy.consentNote}</p>
      <div className="button-row"><button className="button primary" disabled={!capability?.available || !consented || pending} onClick={() => void send()}>{copy.sendButton}</button>{pending && <button className="button quiet" onClick={cancel}>{copy.cancelButton}</button>}</div>
    </>}
    {live && <div className="ai-live-result" data-testid="ai-live-result">
      <h3>{copy.liveHeading}</h3>
      <p className="note">{copy.liveNote}</p>
      <details className="ai-preview" data-testid="ai-response-details"><summary>{copy.metadataSummary}</summary><dl className="ai-response-metadata"><div><dt>{copy.metadata.provider}</dt><dd>{live.metadata.provider} / {live.metadata.model}</dd></div><div><dt>{copy.metadata.promptVersion}</dt><dd>{live.metadata.prompt_version}</dd></div><div><dt>{copy.metadata.generatedAt}</dt><dd>{live.metadata.generated_at}</dd></div><div><dt>{copy.metadata.attempts}</dt><dd>{live.metadata.attempts} 次 / {live.metadata.latency_ms} ms</dd></div>{live.metadata.usage && <div><dt>{copy.metadata.usage}</dt><dd>{fill(copy.metadata.usageValue, { input: live.metadata.usage.input_tokens, output: live.metadata.usage.output_tokens, total: live.metadata.usage.total_tokens })}；未估算費用</dd></div>}</dl></details>
      <div className="ai-insight-grid">{live.output.insights.map((insight, index) => <article className="ai-insight" key={index}>
        <h4>{copy.insightObservation}</h4><p>{insight.observation}</p>
        <div className="ai-evidence-links">{insight.fact_ids.map(factAlias => <button key={factAlias} className="text-button" onClick={() => evidence(factAlias)}>{fill(copy.viewEvidenceLink, { label: evidenceLabel(factAlias) })}</button>)}</div>
        <h4>{copy.insightHypotheses}</h4>{insight.hypotheses.length ? <ul>{insight.hypotheses.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul> : <p>{copy.noHypotheses}</p>}
        <h4>{copy.insightAction}</h4><p>{insight.recommended_action}</p>
        <dl><div><dt>{labels.actions.owner}</dt><dd>{insight.owner_role}</dd></div><div><dt>{labels.actions.metric}</dt><dd>{insight.verification_metric}</dd></div><div><dt>{labels.actions.stop}</dt><dd>{insight.stop_condition}</dd></div></dl>
        <h4>{labels.actions.extraData}</h4><ul>{insight.additional_data_needed.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
        <h4>{copy.insightLimitations}</h4><ul>{insight.limitations.map((item, itemIndex) => <li key={itemIndex}>{item}</li>)}</ul>
      </article>)}</div>
      {live.output.limitations.length > 0 && <div className="ai-result-limitations"><h4>{copy.overallLimitations}</h4><ul>{live.output.limitations.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
    </div>}
  </section>;
}
