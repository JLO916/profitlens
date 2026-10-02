"use client";

import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { AMOUNT_FIELDS, type Dataset, type DatasetInput, type MetricName, type SourceRef } from "@/domain/types";
import { SCENARIO_FORMULAS, type ScenarioInputs } from "@/domain/scenarios";
import {
  blankScenarioInputs, createDecisionSession, isDecisionStale, refreshDecisionSession,
  reconfirmDecision, saveScenario,
  type DecisionSession, type ScenarioPlan, type DecisionWorkspaceState, type ColumnMappings,
} from "@/application/decision";
import { exportDecisionCsv, exportDecisionJson, exportDecisionMarkdown } from "@/application/decision-export";
import { downloadText } from "@/application/download";
import { formatMoney, formatRate, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { channelsLabel, demoAlias } from "@/application/copy";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { ScenarioSensitivity } from "./scenario-sensitivity";

const ui = labels.ui.decisionWorkbench;
const inputFields: { key: Exclude<keyof ScenarioInputs, "assumptions_accepted">; label: string; help: string }[] = [
  { key: "volume_change_pct", label: labels.scenario.volume.label, help: ui.volumeHelp },
  { key: "discount_change_pp", label: labels.scenario.discount.label, help: ui.discountHelp },
  { key: "fulfillment_change_pct", label: labels.scenario.fulfillmentUnit.label, help: ui.fulfillmentHelp },
  { key: "ad_change_pct", label: labels.scenario.adSpend.label, help: ui.adHelp },
  { key: "one_time_cost", label: labels.scenario.oneOff.label, help: labels.scenario.oneOff.hint },
];
// 呈現層九條白話假設（labels 以 JSON 陣列字串保存）；匯出仍用 domain 的 SCENARIO_ASSUMPTIONS 原文。
const assumptionCopy: string[] = JSON.parse(ui.assumptions) as string[];
const staleSuffix = `（${ui.baselineTagStale}）`;
const money = (value: string | null | undefined) => formatMoney(value ?? null);


export function DecisionWorkbench({ dataset, snapshot, revision, filenames, onEvidence, state, setState, input, mappings, onExport }: {
  dataset: Dataset; snapshot: WorkspaceSnapshot; revision: number;
  filenames?: Partial<Record<SourceRef["file"], string>>;
  onExport?: (format: "md" | "csv" | "json") => void;
  onEvidence: (selection: EvidenceSelection) => void;
  state: DecisionWorkspaceState;
  setState: Dispatch<SetStateAction<DecisionWorkspaceState>>;
  input: DatasetInput;
  mappings?: ColumnMappings;
}) {
  const current = useMemo(() => createDecisionSession(dataset, snapshot, revision, filenames), [dataset, snapshot, revision, filenames]);
  const { captured, scenarios, actions } = state;
  const setCaptured = (next: DecisionSession) => setState(previous => ({ ...previous, captured: next, source_input: structuredClone(input), source_mappings: structuredClone(mappings) }));
  const setScenarios: Dispatch<SetStateAction<ScenarioPlan[]>> = next => setState(previous => ({ ...previous, scenarios: typeof next === "function" ? next(previous.scenarios) : next }));
  const [notice, setNotice] = useState("");
  const session = captured ?? current;
  const stale = isDecisionStale(session, snapshot, revision);
  const singleChannel = session.scope.channels.length === 1;
  const alias = demoAlias(session.dataset_id);

  function capture() { if (!captured) setCaptured(session); setNotice(""); }
  function editScenario(id: string, patch: Partial<ScenarioPlan>) {
    if (stale) return;
    capture(); setScenarios(previous => previous.map(plan => plan.id === id ? { ...plan, ...patch, result: null } : plan));
  }
  function calculate(plan: ScenarioPlan) {
    if (stale) return;
    try { setScenarios(saveScenario(session, scenarios, plan)); setNotice(ui.noticeCalculated); }
    catch { setNotice(ui.noticeNotCalculated); }
  }
  function rebuild() {
    const next = reconfirmDecision(session, scenarios, actions, dataset, snapshot, revision, filenames);
    setCaptured(next.session); setScenarios(next.scenarios);
    setNotice(ui.noticeRebuilt);
  }
  function download(format: "md" | "csv" | "json") {
    try {
      if (onExport) { onExport(format); setNotice(ui.noticeDownloadedActions); return; }
      const record = refreshDecisionSession(session, snapshot, revision);
      const body = format === "md" ? exportDecisionMarkdown(record, scenarios, actions) : format === "csv" ? exportDecisionCsv(record, scenarios, actions) : exportDecisionJson(record, scenarios, actions);
      downloadText(body, `profitlens-decision.${format}`, format === "json" ? "application/json;charset=utf-8" : format === "md" ? "text/markdown;charset=utf-8" : "text/csv;charset=utf-8");
      setNotice(stale ? ui.noticeDownloadedStale : ui.noticeDownloaded);
    } catch { setNotice(ui.noticeExportFailed); }
  }
  function baselineEvidence(name: MetricName) {
    if (stale || !singleChannel) return;
    onEvidence({ title: fill(ui.baselineEvidenceTitle, { metric: metricDefinitions[name].label }), name, metric: { value: session.baseline.amounts[name as keyof typeof session.baseline.amounts] ?? null, reason_codes: session.baseline.reasons.map(reason => reason.code) }, period: session.period, channels: session.scope.channels, sources: session.sources });
  }
  return <div className="decision-workbench" data-testid="decision-workbench">
    <div className={`alert ${stale ? "error" : ""}`} role="status" data-testid="decision-freshness">
      <strong>{stale ? ui.staleTitle : ui.freshTitle}</strong>
      {stale && <span>{ui.staleBody}</span>}
      {stale && <button className="button quiet" onClick={rebuild}>{ui.rebuildButton}</button>}
    </div>
    <section className="panel decision-baseline" aria-labelledby="baseline-heading">
      <div className="section-heading"><div><p className="eyebrow">{ui.baselineEyebrow}</p><h2 id="baseline-heading">{labels.sections.scenarioBaseline}</h2><p className="note">{fill(ui.baselineMeta, { start: session.period.start, end: session.period.end, channels: channelsLabel(session.scope.channels, alias), asOf: session.data_as_of })}</p></div><span className={`tag ${stale ? "blocking" : ""}`}>{stale ? ui.baselineTagStale : ui.baselineTagFixed}</span></div>
      <div className="baseline-metrics">{(["net_revenue", "contribution_after_marketing"] as const).map(name => <div key={name}><span>{metricDefinitions[name].label}</span><button className="baseline-number" data-testid={`baseline-${name}`} disabled={stale || !singleChannel} onClick={() => baselineEvidence(name)}>{money(session.baseline.amounts[name])}</button></div>)}<div><span>{fill(ui.baselineRates, { discountRate: metricDefinitions.discount_rate.shortLabel, refundRatio: metricDefinitions.refund_ratio.shortLabel })}</span><strong>{formatRate(session.baseline.rates.discount_rate)} ／ {formatRate(session.baseline.rates.refund_ratio)}</strong></div><div><span>{ui.baselineFeeRates}</span><strong>{formatRate(session.baseline.rates.platform_rate)} ／ {formatRate(session.baseline.rates.payment_rate)}</strong></div></div>
      {!session.baseline.eligible && <div className="alert partial" data-testid="scenario-unavailable"><strong>{ui.unavailableTitle}</strong><ul>{session.baseline.reasons.map((reason, i) => <li key={`${reason.code}-${i}`}>{reason.message}</li>)}</ul><p>{ui.unavailableHelp}</p></div>}
      <details><summary>{labels.sections.technicalDetails}</summary><dl className="decision-metadata"><dt>{labels.csvColumns.dataset_id}</dt><dd>{session.dataset_id}</dd><dt>{ui.techVersions}</dt><dd>{session.schema_version} / {session.scenario_version} / {session.metric_version}</dd><dt>{labels.csvColumns.dataset_hash}</dt><dd>{session.dataset_hash}</dd><dt>{labels.csvColumns.filter_hash}</dt><dd>{session.filter_hash}</dd><dt>{labels.csvColumns.revision}</dt><dd>{session.revision}</dd></dl></details>
    </section>
    <section className="panel assumptions-panel" aria-labelledby="assumptions-heading">
      <h2 id="assumptions-heading">{labels.sections.scenarioAssumptions}</h2>
      <ol>{assumptionCopy.map((assumption, i) => <li key={i}>{assumption}</li>)}</ol>
      <p className="alert">{ui.assumptionsCaution}</p>
      <details><summary>{ui.techFormulasSummary}</summary><dl className="formula-list">{Object.entries(SCENARIO_FORMULAS).map(([key, formula]) => <div key={key}><dt>{key}</dt><dd>{formula}</dd></div>)}</dl><p className="note">每個中間值採高精度 Decimal；最後才取兩位小數 HALF_UP。明細的 G−D−R−C−P−Q−F−O−A−K，加上 rounding_adjustment，精確等於顯示的試算後貢獻。</p></details>
    </section>
    <div>
      <div className="section-heading"><div><h2>{labels.sections.scenarioCompare}</h2><p className="note">{ui.compareNote}</p></div><button className="button primary" disabled={stale || !session.baseline.eligible || scenarios.length >= 3} onClick={() => { capture(); setScenarios([...scenarios, { id: crypto.randomUUID(), name: fill(ui.defaultPlanName, { n: scenarios.length + 1 }), inputs: blankScenarioInputs(), result: null }]); }}>{labels.buttons.addScenario}</button></div>
      {!scenarios.length && <p className="empty-note">{ui.emptyPlans}</p>}
      <div className="scenario-grid">{scenarios.map((plan, index) => <article className="panel scenario-card" key={plan.id} data-testid={`scenario-${index + 1}`}>
        <fieldset disabled={stale || !session.baseline.eligible}><legend>{fill(ui.planLegend, { n: index + 1 })}</legend>
          <label>{ui.planName}<input aria-label={ui.planName} maxLength={100} value={plan.name} onChange={e => editScenario(plan.id, { name: e.target.value })} /></label>
          <div className="scenario-inputs">{inputFields.map(field => <label key={field.key}>{field.label}<input aria-label={field.label} type="text" inputMode="decimal" maxLength={200} autoComplete="off" value={plan.inputs[field.key]} onChange={e => editScenario(plan.id, { inputs: { ...plan.inputs, [field.key]: e.target.value } })} /><small>{field.help}</small></label>)}</div>
          <button className="text-button" onClick={() => editScenario(plan.id, { inputs: { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: false } })}>{labels.buttons.fillZero}</button>
          <label className="check-label"><input type="checkbox" checked={plan.inputs.assumptions_accepted} onChange={e => editScenario(plan.id, { inputs: { ...plan.inputs, assumptions_accepted: e.target.checked } })} />{labels.scenario.acceptAssumptions}</label>
          <div className="button-row"><button className="button primary" onClick={() => calculate(plan)}>{labels.buttons.calculate}</button><button className="text-button" onClick={() => setScenarios(scenarios.filter(item => item.id !== plan.id))}>{labels.buttons.removeScenario}</button></div>
        </fieldset>
        <div aria-live="polite" className="scenario-result" data-testid="scenario-result">
          {stale && <p className="tag blocking">{ui.staleResultTag}</p>}
          {!plan.result && <p>{ui.noResult}</p>}
          {plan.result?.status !== "valid" && plan.result && <div><strong>{plan.inputs.assumptions_accepted ? ui.cannotCalculate : ui.planUnavailable}</strong><ul>{plan.result.reasons.map((reason, i) => <li key={i}>{inputFields.find(field => field.key === reason.field)?.label}{reason.field ? "：" : ""}{reason.message}</li>)}</ul></div>}
          {plan.result?.status === "valid" && <><span>{labels.scenario.resultTitle}</span><strong data-testid="scenario-contribution">{money(plan.result.contribution)}</strong><p>{labels.scenario.vsBaseline} <b data-testid="scenario-delta">{formatSignedMoney(plan.result.delta)}</b></p></>}
        </div>
        {plan.result?.status === "valid" && <ScenarioSensitivity baseline={session.baseline} inputs={plan.inputs} stale={stale} />}
      </article>)}</div>
      {scenarios.length > 0 && <section className="panel"><h2>{fill(ui.compareTableHeading, { staleSuffix: stale ? staleSuffix : "" })}</h2><div className="table-scroll" role="region" aria-label={ui.compareTableAria} tabIndex={0}><table data-testid="scenario-comparison"><caption>{ui.compareTableCaption}</caption><thead><tr><th>{ui.compareColItem}</th><th>{ui.compareColBaseline}</th>{scenarios.map(plan => <th key={plan.id}>{plan.name}</th>)}</tr></thead><tbody>
        {AMOUNT_FIELDS.map(field => <tr key={field}><th>{metricDefinitions[field].label}</th><td>{money(session.baseline.amounts[field])}</td>{scenarios.map(plan => <td key={plan.id}>{money(plan.result?.amounts?.[field])}</td>)}</tr>)}
        <tr><th>{labels.scenario.oneOff.label}</th><td>{labels.status.notApplicable}</td>{scenarios.map(plan => <td key={plan.id}>{money(plan.result?.amounts?.one_time_cost)}</td>)}</tr>
        <tr><th>{ui.roundingAdjustment}</th><td>{labels.status.notApplicable}</td>{scenarios.map(plan => <td key={plan.id}>{money(plan.result?.rounding_adjustment)}</td>)}</tr>
        <tr className="scenario-total"><th>{metricDefinitions.contribution_after_marketing.label}</th><td>{money(session.baseline.amounts.contribution_after_marketing)}</td>{scenarios.map(plan => <td key={plan.id}>{money(plan.result?.contribution)}</td>)}</tr>
        <tr><th>{fill(ui.netRevenueSummaryRow, { metric: metricDefinitions.net_revenue.label })}</th><td>{money(session.baseline.amounts.net_revenue)}</td>{scenarios.map(plan => <td key={plan.id}>{money(plan.result?.amounts?.net_revenue)}</td>)}</tr>
      </tbody></table></div></section>}
    </div>
    <section className="panel decision-export"><h2>{fill(ui.exportHeading, { staleSuffix: stale ? staleSuffix : "" })}</h2><p className="note">{ui.exportNote}</p><div className="button-row"><button className="button quiet" onClick={() => download("md")}>{labels.downloads.decisionMd}</button><button className="button quiet" onClick={() => download("csv")}>{labels.downloads.decisionCsv}</button><button className="button quiet" onClick={() => download("json")}>{labels.downloads.decisionJson}</button></div></section>
    <p role="status" className="decision-notice" data-testid="decision-notice">{notice}</p>
  </div>;
}
