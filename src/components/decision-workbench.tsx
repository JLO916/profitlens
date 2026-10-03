"use client";

import { useId, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { AMOUNT_FIELDS, type Dataset, type DatasetInput, type MetricName, type SourceRef } from "@/domain/types";
import { SCENARIO_FORMULAS, type ScenarioInputs } from "@/domain/scenarios";
import {
  blankScenarioInputs, createDecisionSession, isDecisionStale, refreshDecisionSession,
  reconfirmDecision, saveScenario,
  type DecisionSession, type ScenarioPlan, type DecisionWorkspaceState, type ColumnMappings, type SensitivityInputs,
} from "@/application/decision";
import { exportDecisionCsv, exportDecisionJson, exportDecisionMarkdown } from "@/application/decision-export";
import { downloadText } from "@/application/download";
import { formatMoney, formatRate, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import { ABSOLUTE_FIELDS, SCENARIO_PRESETS, absoluteAvailability, absoluteContext, absoluteToRelative, applyPreset, rangeHint, relativeEquivalent, relativeToAbsolute, relativeToAbsoluteValue, type AbsoluteContext, type AbsoluteField, type ScenarioNumericField, type ScenarioPresetId } from "@/application/scenario-presets";
import type { VersionedScenarioPlan } from "@/application/scenario-workspace";
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
const form = labels.scenarioForm;
const isAbsoluteField = (key: ScenarioNumericField): key is AbsoluteField => (ABSOLUTE_FIELDS as readonly string[]).includes(key);
/** 方案若來自 scenario workspace 會帶版本號（VersionedScenarioPlan）；單獨使用時沒有版本號就不顯示徽章。 */
const revisionOf = (plan: ScenarioPlan) => (plan as Partial<VersionedScenarioPlan>).revision;
const groupDigits = (integer: string) => integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** 絕對值模式下輸入框的說明：帶出本期值（件數／折扣率／廣告費），讓使用者知道從哪裡改起。 */
function absoluteHelp(field: AbsoluteField, ctx: AbsoluteContext): string {
  if (field === "volume_change_pct") return fill(labels.scenario.volume.absoluteHint, { units: fill(labels.assist.units.count, { value: groupDigits(ctx.units_sold?.toString() ?? "") }) });
  if (field === "discount_change_pp") return fill(form.discountAbsoluteHint, { rate: formatRate(ctx.discount_rate) });
  return fill(labels.scenario.adSpend.absoluteHint, { ad: formatMoney(ctx.ad_spend) });
}
/**
 * 每個方案、每個欄位各自的絕對值輸入；有這個鍵就代表該格在絕對值模式（本頁暫存，不寫入方案）。
 * edited=false：切到絕對值時由目前相對值反推的預填值，使用者還沒改，方案的相對值與結果都不動。
 */
interface AbsoluteDraft { text: string; edited: boolean }
type AbsoluteDrafts = Record<string, Partial<Record<AbsoluteField, AbsoluteDraft>>>;


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
  const fieldId = useId();
  // R5-3 進頁即表單：還沒有方案時先顯示本地草稿「方案 1」，第一次編輯或計算才寫入 state（只是看頁面不會標成未保存）。
  const [draftId, setDraftId] = useState(() => crypto.randomUUID());
  const [absolute, setAbsolute] = useState<AbsoluteDrafts>({});
  const [applied, setApplied] = useState<Record<string, ScenarioPresetId>>({});
  // 範本兩步：先在選單選（只顯示用途），再按「套用範本」才覆寫五格；鍵盤上下鍵瀏覽選單不會改到假設。
  const [picked, setPicked] = useState<Record<string, ScenarioPresetId>>({});
  const draft: ScenarioPlan = { id: draftId, name: fill(ui.defaultPlanName, { n: 1 }), inputs: blankScenarioInputs(), result: null };
  const persisted = scenarios.length > 0;
  const plans = persisted || stale ? scenarios : [draft];
  const unitsSold = singleChannel ? snapshot.report.current.channels[session.scope.channels[0]]?.units_sold.value ?? null : null;
  const ctx = useMemo(() => absoluteContext(session.baseline, unitsSold), [session.baseline, unitsSold]);

  function capture() { if (!captured) setCaptured(session); setNotice(""); }
  function editScenario(id: string, patch: Partial<ScenarioPlan>) {
    if (stale) return;
    capture(); setScenarios(previous => (previous.length ? previous : [draft]).map(plan => plan.id === id ? { ...plan, ...patch, result: null } : plan));
  }
  function calculate(plan: ScenarioPlan) {
    if (stale) return;
    try { const next = saveScenario(session, scenarios, plan); capture(); setScenarios(next); setNotice(ui.noticeCalculated); }
    catch { setNotice(ui.noticeNotCalculated); }
  }
  function remove(id: string) {
    setScenarios(scenarios.filter(item => item.id !== id));
    if (id === draftId) setDraftId(crypto.randomUUID());
  }
  /** 敏感度三組輸入跟著方案保存；結果保持原值（不設 null），版本號不動。 */
  function setSensitivity(id: string, sensitivity: SensitivityInputs) {
    if (stale) return;
    setScenarios(previous => previous.map(plan => plan.id === id ? { ...plan, sensitivity } : plan));
  }
  function pickTemplate(plan: ScenarioPlan, value: string) {
    const id = SCENARIO_PRESETS.find(item => item.id === value)?.id;
    setPicked(previous => { const next = { ...previous }; if (id) next[plan.id] = id; else delete next[plan.id]; return next; });
  }
  function applyTemplate(plan: ScenarioPlan, id: ScenarioPresetId) {
    setAbsolute(previous => { const next = { ...previous }; delete next[plan.id]; return next; });
    setPicked(previous => { const next = { ...previous }; delete next[plan.id]; return next; });
    setApplied(previous => ({ ...previous, [plan.id]: id }));
    editScenario(plan.id, { inputs: applyPreset(plan.inputs, id) });
  }
  /**
   * 切到絕對值：只換輸入框的顯示，預填由目前相對值反推的數值；方案的相對值、結果與版本都不動。
   * 切回相對：保留目前的相對值（若在絕對值模式改過，就是換算後的值）。
   */
  function setMode(plan: ScenarioPlan, field: AbsoluteField, mode: "relative" | "absolute") {
    const own = absolute[plan.id] ?? {};
    if (mode === "absolute") {
      if (own[field] !== undefined || !absoluteAvailability(field, ctx).available) return;
      const text = relativeToAbsoluteValue(field, plan.inputs[field], ctx) ?? "";
      setAbsolute(previous => ({ ...previous, [plan.id]: { ...previous[plan.id], [field]: { text, edited: false } } }));
      return;
    }
    if (own[field] === undefined) return;
    setAbsolute(previous => { const next = { ...previous[plan.id] }; delete next[field]; return { ...previous, [plan.id]: next }; });
  }
  /** 使用者改了絕對值才換算成引擎要的相對值寫進方案；格式不合或不可用時寫空字串（引擎會要求補值）。 */
  function setAbsoluteText(plan: ScenarioPlan, field: AbsoluteField, text: string) {
    setAbsolute(previous => ({ ...previous, [plan.id]: { ...previous[plan.id], [field]: { text, edited: true } } }));
    editScenario(plan.id, { inputs: { ...plan.inputs, [field]: absoluteToRelative(field, text, ctx).relative ?? "" } });
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
    <details className="panel assumptions-panel" data-testid="scenario-assumptions">
      <summary id="assumptions-heading">{form.assumptionsSummary}</summary>
      <ol>{assumptionCopy.map((assumption, i) => <li key={i}>{assumption}</li>)}</ol>
      <p className="alert">{ui.assumptionsCaution}</p>
      <details><summary>{ui.techFormulasSummary}</summary><dl className="formula-list">{Object.entries(SCENARIO_FORMULAS).map(([key, formula]) => <div key={key}><dt>{key}</dt><dd>{formula}</dd></div>)}</dl><p className="note">每個中間值採高精度 Decimal；最後才取兩位小數 HALF_UP。明細的 G−D−R−C−P−Q−F−O−A−K，加上 rounding_adjustment，精確等於顯示的試算後貢獻。</p></details>
    </details>
    <div>
      <div className="section-heading"><div><h2>{labels.sections.scenarioCompare}</h2><p className="note">{ui.compareNote}</p></div><button className="button primary" disabled={stale || !session.baseline.eligible || plans.length >= 3} onClick={() => { capture(); setScenarios([...plans, { id: crypto.randomUUID(), name: fill(ui.defaultPlanName, { n: plans.length + 1 }), inputs: blankScenarioInputs(), result: null }]); }}>{labels.buttons.addScenario}</button></div>
      {!plans.length && <p className="empty-note">{ui.emptyPlans}</p>}
      <div className="scenario-grid">{plans.map((plan, index) => {
        const preset = applied[plan.id] ? SCENARIO_PRESETS.find(item => item.id === applied[plan.id]) : undefined;
        const pickedPreset = picked[plan.id] ? SCENARIO_PRESETS.find(item => item.id === picked[plan.id]) : undefined;
        const purpose = pickedPreset ? pickedPreset.purpose : preset ? fill(form.presetApplied, { name: preset.name, purpose: preset.purpose }) : null;
        const filled = inputFields.some(field => plan.inputs[field.key].trim() !== "");
        const revision = revisionOf(plan);
        return <article className="panel scenario-card" key={plan.id} data-testid={`scenario-${index + 1}`}>
        <fieldset disabled={stale || !session.baseline.eligible}><legend>{fill(ui.planLegend, { n: index + 1 })}</legend>
          <label>{ui.planName}<input aria-label={ui.planName} maxLength={100} value={plan.name} onChange={e => editScenario(plan.id, { name: e.target.value })} /></label>
          <div className="scenario-preset"><div className="scenario-preset-row"><label>{form.presetSelect}<select data-testid="scenario-preset" aria-label={form.presetSelect} value={pickedPreset?.id ?? ""} onChange={e => pickTemplate(plan, e.target.value)}><option value="">{labels.scenarioPresets.menuPlaceholder}</option>{SCENARIO_PRESETS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><button type="button" className="button quiet" data-testid="scenario-preset-apply" disabled={!pickedPreset} onClick={() => { if (pickedPreset) applyTemplate(plan, pickedPreset.id); }}>{labels.buttons.applyTemplate}</button>{filled && <span className="scenario-preset-overwrite" data-testid="scenario-preset-overwrite">{form.presetOverwrite}</span>}</div><p className="note" data-testid="scenario-template-note">{labels.scenario.templateNote}</p>{purpose && <p className="note scenario-preset-purpose" data-testid="scenario-preset-purpose">{purpose}</p>}</div>
          <div className="scenario-inputs">{inputFields.map(field => {
            const id = `${fieldId}-${index + 1}-${field.key}`;
            const absField = isAbsoluteField(field.key) ? field.key : null;
            const availability = absField ? absoluteAvailability(absField, ctx) : null;
            const entry = absField && availability?.available ? absolute[plan.id]?.[absField] : undefined;
            // 絕對值模式：改過才換算；預填值還沒改時，等值文字直接取方案目前的相對值。
            const conversion = absField && entry?.edited ? absoluteToRelative(absField, entry.text, ctx) : null;
            const equivalent = conversion ? conversion.equivalent : absField ? (entry ? relativeEquivalent(absField, plan.inputs[absField]) : relativeToAbsolute(absField, plan.inputs[absField], ctx)) : null;
            const prefillNote = absField === "volume_change_pct" && entry && !entry.edited && entry.text !== "" && !/^\d+$/.test(entry.text) ? fill(labels.scenarioPresets.absolute.nonIntegerUnits, { units: fill(labels.assist.units.count, { value: entry.text }) }) : null;
            const hint = rangeHint(field.key, plan.inputs[field.key], ctx);
            const described = [`${id}-help`, equivalent && `${id}-equivalent`, prefillNote && `${id}-prefill`, conversion?.error && `${id}-error`, hint && `${id}-range`].filter(Boolean).join(" ");
            return <div className="scenario-field" key={field.key}>
              <div className="scenario-field-head"><label htmlFor={id}>{field.label}</label>{absField && availability && <div className="scenario-mode" role="group" aria-label={fill(form.modeGroup, { field: field.label })} data-testid={`scenario-mode-${absField}`}><button type="button" className="button quiet" aria-pressed={!entry} onClick={() => setMode(plan, absField, "relative")}>{labels.scenario.modeRelative}</button><button type="button" className="button quiet" aria-pressed={!!entry} disabled={!availability.available} onClick={() => setMode(plan, absField, "absolute")}>{labels.scenario.modeAbsolute}</button></div>}</div>
              <input id={id} aria-label={field.label} aria-describedby={described} type="text" inputMode="decimal" maxLength={200} autoComplete="off" value={entry ? entry.text : plan.inputs[field.key]} onChange={e => absField && entry ? setAbsoluteText(plan, absField, e.target.value) : editScenario(plan.id, { inputs: { ...plan.inputs, [field.key]: e.target.value } })} />
              <small id={`${id}-help`}>{absField && entry ? absoluteHelp(absField, ctx) : field.help}</small>
              {availability && !availability.available && <small className="scenario-field-note" data-testid={`scenario-unavailable-${field.key}`}>{availability.reason}</small>}
              {equivalent && <small id={`${id}-equivalent`} className="scenario-equivalent" data-testid={`scenario-equivalent-${field.key}`}>{equivalent}</small>}
              {prefillNote && <small id={`${id}-prefill`} className="scenario-field-note" data-testid={`scenario-absolute-note-${field.key}`}>{prefillNote}</small>}
              {conversion?.error && <small id={`${id}-error`} className="scenario-field-error" role="status" data-testid={`scenario-absolute-error-${field.key}`}>{conversion.error}</small>}
              {hint && <small id={`${id}-range`} className="scenario-field-error" role="status" data-testid={`scenario-range-${field.key}`}>{hint}</small>}
            </div>;
          })}</div>
          <label className="check-label"><input type="checkbox" checked={plan.inputs.assumptions_accepted} onChange={e => editScenario(plan.id, { inputs: { ...plan.inputs, assumptions_accepted: e.target.checked } })} />{labels.scenario.acceptAssumptions}</label>
          <div className="button-row"><button className="button primary" onClick={() => calculate(plan)}>{labels.buttons.calculate}</button>{persisted && <button className="text-button" onClick={() => remove(plan.id)}>{labels.buttons.removeScenario}</button>}</div>
        </fieldset>
        <div aria-live="polite" className="scenario-result" data-testid="scenario-result">
          {stale && <p className="tag blocking">{ui.staleResultTag}</p>}
          {plan.result?.status === "valid" && revision !== undefined && <p className="scenario-version"><span className="tag valid" data-testid="scenario-version">{fill(form.version, { n: revision })}</span></p>}
          {!plan.result && <p className="scenario-version"><span className="tag partial" data-testid="scenario-draft">{labels.scenario.draft}</span></p>}
          {!plan.result && <p>{ui.noResult}</p>}
          {plan.result?.status !== "valid" && plan.result && <div><strong>{plan.inputs.assumptions_accepted ? ui.cannotCalculate : ui.planUnavailable}</strong><ul>{plan.result.reasons.map((reason, i) => <li key={i}>{inputFields.find(field => field.key === reason.field)?.label}{reason.field ? "：" : ""}{reason.message}</li>)}</ul></div>}
          {plan.result?.status === "valid" && <><span>{labels.scenario.resultTitle}</span><strong data-testid="scenario-contribution">{money(plan.result.contribution)}</strong><p>{labels.scenario.vsBaseline} <b data-testid="scenario-delta">{formatSignedMoney(plan.result.delta)}</b></p></>}
        </div>
        {plan.result?.status === "valid" && <ScenarioSensitivity baseline={session.baseline} inputs={plan.inputs} stale={stale} value={plan.sensitivity} onChange={next => setSensitivity(plan.id, next)} />}
      </article>;
      })}</div>
      {plans.length > 0 && <section className="panel"><h2>{fill(ui.compareTableHeading, { staleSuffix: stale ? staleSuffix : "" })}</h2><div className="table-scroll" role="region" aria-label={ui.compareTableAria} tabIndex={0}><table data-testid="scenario-comparison"><caption>{ui.compareTableCaption}</caption><thead><tr><th>{ui.compareColItem}</th><th>{ui.compareColBaseline}</th>{plans.map(plan => <th key={plan.id}>{plan.name}</th>)}</tr></thead><tbody>
        {AMOUNT_FIELDS.map(field => <tr key={field}><th>{metricDefinitions[field].label}</th><td>{money(session.baseline.amounts[field])}</td>{plans.map(plan => <td key={plan.id}>{money(plan.result?.amounts?.[field])}</td>)}</tr>)}
        <tr><th>{labels.scenario.oneOff.label}</th><td>{labels.status.notApplicable}</td>{plans.map(plan => <td key={plan.id}>{money(plan.result?.amounts?.one_time_cost)}</td>)}</tr>
        <tr><th>{ui.roundingAdjustment}</th><td>{labels.status.notApplicable}</td>{plans.map(plan => <td key={plan.id}>{money(plan.result?.rounding_adjustment)}</td>)}</tr>
        <tr className="scenario-total"><th>{metricDefinitions.contribution_after_marketing.label}</th><td>{money(session.baseline.amounts.contribution_after_marketing)}</td>{plans.map(plan => <td key={plan.id}>{money(plan.result?.contribution)}</td>)}</tr>
        <tr><th>{fill(ui.netRevenueSummaryRow, { metric: metricDefinitions.net_revenue.label })}</th><td>{money(session.baseline.amounts.net_revenue)}</td>{plans.map(plan => <td key={plan.id}>{money(plan.result?.amounts?.net_revenue)}</td>)}</tr>
      </tbody></table></div></section>}
    </div>
    <section className="panel decision-export"><h2>{fill(ui.exportHeading, { staleSuffix: stale ? staleSuffix : "" })}</h2><p className="note">{ui.exportNote}</p><div className="button-row"><button className="button quiet" onClick={() => download("md")}>{labels.downloads.decisionMd}</button><button className="button quiet" onClick={() => download("csv")}>{labels.downloads.decisionCsv}</button><button className="button quiet" onClick={() => download("json")}>{labels.downloads.decisionJson}</button></div></section>
    <p role="status" className="decision-notice" data-testid="decision-notice">{notice}</p>
  </div>;
}
