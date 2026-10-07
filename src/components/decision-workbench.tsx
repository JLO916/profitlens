"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from "react";
import { createPortal } from "react-dom";
import { AMOUNT_FIELDS, type Dataset, type DatasetInput, type MetricName, type SourceRef } from "@/domain/types";
import { SCENARIO_FORMULAS, type ScenarioInputs } from "@/domain/scenarios";
import {
  blankScenarioInputs, createDecisionSession, isDecisionStale, refreshDecisionSession,
  reconfirmDecision, saveScenario,
  type DecisionSession, type ScenarioPlan, type DecisionWorkspaceState, type ColumnMappings, type SensitivityInputs,
} from "@/application/decision";
import { exportDecisionCsv, exportDecisionJson, exportDecisionMarkdown, scenarioReasonText } from "@/application/decision-export";
import { downloadText } from "@/application/download";
import { deltaTone, formatAmountL1, formatAmountL2, formatAmountL3, formatPeriodL1, formatRateL1, formatRateL3, formatSignedDelta, metricDefinitions } from "@/application/presentation";
import { ABSOLUTE_FIELDS, SCENARIO_PRESETS, absoluteAvailability, absoluteContext, absoluteToRelative, applyPreset, rangeHint, relativeEquivalent, relativeToAbsolute, relativeToAbsoluteValue, type AbsoluteContext, type AbsoluteField, type ScenarioNumericField, type ScenarioPresetId } from "@/application/scenario-presets";
import type { VersionedScenarioPlan } from "@/application/scenario-workspace";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { channelsLabel, demoAlias } from "@/application/copy";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { ScenarioSensitivity } from "./scenario-sensitivity";
import { toneClass } from "./manager-summary";
import { usePageSlot } from "./shell/page-slot";
import { ShellIcon } from "./shell/shell-icon";

const ui = labels.ui.decisionWorkbench;
const page = labels.scenarios.pageV3;
/** 基準不能試算的原因：依 code 取 labels 文案（不顯示 domain 訊息）；逐欄位的原因碼前面加上指標名稱，才分得出是哪一項。 */
const FIELD_REASON_CODES = new Set(["BASELINE_MISSING_AMOUNT", "BASELINE_NEGATIVE_COST"]);
function baselineReasonText(reason: { code: string; message: string; field?: string }): string {
  const text = scenarioReasonText(reason);
  return reason.field && FIELD_REASON_CODES.has(reason.code) && Object.hasOwn(metricDefinitions, reason.field) ? fill(ui.baselineReasonField, { field: metricDefinitions[reason.field as MetricName].label, reason: text }) : text;
}
const inputFields: { key: Exclude<keyof ScenarioInputs, "assumptions_accepted">; label: string; help: string; note?: string }[] = [
  { key: "volume_change_pct", label: labels.scenario.volume.label, help: ui.volumeHelp },
  { key: "discount_change_pp", label: labels.scenario.discount.label, help: ui.discountHelp },
  { key: "fulfillment_change_pct", label: labels.scenario.fulfillmentUnit.label, help: ui.fulfillmentHelp },
  { key: "ad_change_pct", label: labels.scenario.adSpend.label, help: ui.adHelp, note: ui.adVolumeNote },
  { key: "one_time_cost", label: labels.scenario.oneOff.label, help: labels.scenario.oneOff.hint },
];
// 呈現層九條白話假設（labels 以 JSON 陣列字串保存）；匯出仍用 domain 的 SCENARIO_ASSUMPTIONS 原文。
const assumptionCopy: string[] = JSON.parse(ui.assumptions) as string[];
const staleSuffix = `（${ui.baselineTagStale}）`;
// V3-2b：本期基準與試算結果的大字用 L1（萬），方案比較表用 L2（整數元，表頭標「（元）」）；輸入框與絕對值提示維持原樣。
const amountL1 = (value: string | null | undefined) => formatAmountL1(value ?? null);
/** 方案比較表的一格：方案還沒有有效結果時寫「尚未試算」，有結果才用 L2（取位調整列只有幾分錢，用 L3 才看得到）。 */
const planCell = (plan: ScenarioPlan, value: string | null | undefined, format: (value: string | null) => string = formatAmountL2) => plan.result?.status === "valid" ? format(value ?? null) : ui.notCalculated;
const form = labels.scenarioForm;
const isAbsoluteField = (key: ScenarioNumericField): key is AbsoluteField => (ABSOLUTE_FIELDS as readonly string[]).includes(key);
/** 方案若來自 scenario workspace 會帶版本號（VersionedScenarioPlan）；單獨使用時沒有版本號就不顯示徽章。 */
const revisionOf = (plan: ScenarioPlan) => (plan as Partial<VersionedScenarioPlan>).revision;
const groupDigits = (integer: string) => integer.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
/** 絕對值模式下輸入框的說明：帶出本期值（件數／折扣率／廣告費），讓使用者知道從哪裡改起。 */
function absoluteHelp(field: AbsoluteField, ctx: AbsoluteContext): string {
  if (field === "volume_change_pct") return fill(labels.scenario.volume.absoluteHint, { units: fill(labels.assist.units.count, { value: groupDigits(ctx.units_sold?.toString() ?? "") }) });
  if (field === "discount_change_pp") return fill(form.discountAbsoluteHint, { rate: formatRateL3(ctx.discount_rate) });
  return fill(labels.scenario.adSpend.absoluteHint, { ad: formatAmountL3(ctx.ad_spend) });
}
/**
 * 每個方案、每個欄位各自的絕對值輸入；有這個鍵就代表該格在絕對值模式（本頁暫存，不寫入方案）。
 * edited=false：切到絕對值時由目前相對值反推的預填值，使用者還沒改，方案的相對值與結果都不動。
 */
interface AbsoluteDraft { text: string; edited: boolean }
type AbsoluteDrafts = Record<string, Partial<Record<AbsoluteField, AbsoluteDraft>>>;
/** 技術細節的一行：方案名稱、plan_id 與 revision（其他通路、歷史方案與本通路的技術細節共用）。 */
export const technicalPlanLine = (plans: readonly { id: string; name: string; revision: number }[]) => plans.map(plan => `${plan.name} · plan_id ${plan.id} · revision ${plan.revision}`).join("；");
/** V3-6（PRD §7.4）：每格輸入的單位後綴；絕對值模式（改成）時換成該格的絕對單位。 */
function unitOf(key: ScenarioNumericField, absolute: boolean): string {
  if (key === "one_time_cost") return page.unitYuan;
  if (key === "discount_change_pp") return absolute ? page.unitPercent : page.unitPoints;
  if (absolute && key === "volume_change_pct") return page.unitCount;
  if (absolute && key === "ad_change_pct") return page.unitYuan;
  return page.unitPercent;
}
/** V3-6（D-V3-12＝B）：勾選後勾選框會換成一行說明；焦點移到同一方案的「試算」，鍵盤使用者不會掉到頁首。 */
const focusById = (id: string) => { if (typeof document !== "undefined") document.getElementById(id)?.focus(); };
/** V3-6（PRD §7.4 頁首「匯出本頁」）：三項決策輸出，名稱與 handler 同 v2 的「匯出」區。 */
const EXPORT_FORMATS = [["md", labels.downloads.decisionMd], ["csv", labels.downloads.decisionCsv], ["json", labels.downloads.decisionJson]] as const;

/** C14／M3：彈出層開著時，Esc 關閉（焦點在裡面時回到觸發器）、點外面關閉；在 modal dialog（抽屜、對話框）裡的操作不算外面（同 product-comparison-panel.tsx）。 */
function useDismiss(open: boolean, close: () => void, rootRef: RefObject<HTMLElement | null>, triggerRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!open) return;
    const inDialog = (target: EventTarget | null) => target instanceof Element && target.closest("dialog") !== null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || inDialog(event.target)) return;
      const inside = rootRef.current?.contains(document.activeElement) ?? false;
      close();
      if (inside) triggerRef.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      if (inDialog(event.target)) return;
      const target = event.target instanceof Node ? event.target : null;
      if (!target || !rootRef.current?.contains(target)) close();
    };
    document.addEventListener("keydown", onKey); document.addEventListener("mousedown", onPointer);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onPointer); };
  }, [open, close, rootRef, triggerRef]);
}

/** V3-6（PRD §7.4、C14、M1／M3）：`?` 說明——16×16 icon 按鈕（aria-expanded／aria-controls）＋說明 popover；關著時用 hidden 保持掛載，Esc 回焦、點外面關閉。 */
export function HelpPopover({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useDismiss(open, close, rootRef, triggerRef);
  return <div className="scenario-help" ref={rootRef}>
    <button ref={triggerRef} type="button" className="ui-help-trigger" aria-label={label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}><ShellIcon name="help" size={16} /></button>
    <div id={id} role="region" aria-label={label} className="ui-popover ui-help-content scenario-help-panel" hidden={!open}>{children}</div>
  </div>;
}

/**
 * V3-6（PRD §7.4 頁首）：本頁動作（試算通路、匯出本頁）。本頁正顯示（active）且頁首插槽存在時 portal 進 #page-actions；
 * SSR、hydration 當下或本頁沒顯示時渲染在工作台頂端的 div.scenario-page-actions-inline。同一時間只有一份（M6）。
 */
export function ScenarioPageActions({ active, children }: { active?: boolean; children: ReactNode }) {
  const slot = usePageSlot("page-actions");
  return active && slot ? createPortal(children, slot) : <div className="scenario-page-actions-inline">{children}</div>;
}

export function DecisionWorkbench({ dataset, snapshot, revision, filenames, onEvidence, state, setState, input, mappings, onExport, active, acknowledged = false, onAcknowledge, onSelectPlan, children }: {
  dataset: Dataset; snapshot: WorkspaceSnapshot; revision: number;
  filenames?: Partial<Record<SourceRef["file"], string>>;
  onExport?: (format: "md" | "csv" | "json") => void;
  onEvidence: (selection: EvidenceSelection) => void;
  state: DecisionWorkspaceState;
  setState: Dispatch<SetStateAction<DecisionWorkspaceState>>;
  input: DatasetInput;
  mappings?: ColumnMappings;
  /** V3-6：本頁是否正顯示；只有 active 時「匯出本頁」才 portal 進頁首。 */
  active?: boolean;
  /** V3-6（D-V3-12＝B）：同一工作區已記住「我了解這是試算」——不再顯示勾選框，試算時聲明直接視為已勾。 */
  acknowledged?: boolean;
  /** V3-6（D-V3-12＝B）：第一次勾選任何方案的聲明時呼叫（記住，寫入備份）。 */
  onAcknowledge?: () => void;
  /** V3-6（PRD §7.4 結果）：每個有效方案結果下的「選入會議」；只有已寫入工作區的方案才有。 */
  onSelectPlan?: (planId: string) => void;
  /** V3-6：方案比較表之後、通知之前的區塊（其他通路的方案、之前的試算）。 */
  children?: ReactNode;
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
  // V3-6（D-V3-12＝B）：已記住聲明時，新方案（含進頁草稿）的聲明直接視為已勾。
  const draft: ScenarioPlan = { id: draftId, name: fill(ui.defaultPlanName, { n: 1 }), inputs: { ...blankScenarioInputs(), assumptions_accepted: acknowledged }, result: null };
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
    // V3-6（D-V3-12＝B）：已記住聲明時，聲明以 true 計算並寫回方案。
    const next = acknowledged && !plan.inputs.assumptions_accepted ? { ...plan, inputs: { ...plan.inputs, assumptions_accepted: true } } : plan;
    try { const saved = saveScenario(session, scenarios, next); capture(); setScenarios(saved); setNotice(ui.noticeCalculated); }
    catch { setNotice(ui.noticeNotCalculated); }
  }
  function addPlan() {
    capture(); setScenarios([...plans, { id: crypto.randomUUID(), name: fill(ui.defaultPlanName, { n: plans.length + 1 }), inputs: { ...blankScenarioInputs(), assumptions_accepted: acknowledged }, result: null }]);
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
  const ids = { baseline: `${fieldId}-baseline`, compare: `${fieldId}-compare` };
  const period = formatPeriodL1(session.period.start, session.period.end, { days: false, anchor: session.data_as_of });
  const calculated = plans.flatMap(plan => { const n = revisionOf(plan); return plan.result?.status === "valid" && n !== undefined ? [{ id: plan.id, name: plan.name, revision: n }] : []; });
  // V3-6（PRD §7.4 頁首、§6.3 #39）：「匯出本頁」頁內下拉，三項呼叫 v2「匯出」區的同一個 download(format)；Esc／點外面關閉沿用 Dashboard 的 `.topbar-menu.auto-close`。
  const exportMenu = <details className="topbar-menu auto-close export-page scenario-export" data-testid="scenario-export-menu">
    <summary className="ui-btn ui-btn-secondary" data-testid="export-page-scenarios">{labels.products.pageV3.exportPage}<ShellIcon name="chevron" size={16} className="chevron" /></summary>
    <div className="menu-panel ui-menu">{EXPORT_FORMATS.map(([format, label]) => <button key={format} type="button" className="ui-menu-item" data-testid={`scenario-export-${format}`} onClick={() => download(format)}>{label}</button>)}</div>
  </details>;
  return <div className="decision-workbench" data-testid="decision-workbench">
    <ScenarioPageActions active={active}>{exportMenu}</ScenarioPageActions>
    {/* V3-6（PRD §7.4 基準列）：一列定義列表，不用卡片；新鮮度在同一列右側，只有過期時改 warning 色並出現「改用目前資料並清空輸入」。 */}
    <section className="scenario-baseline" aria-labelledby={ids.baseline}>
      <div className="baseline-row">
        <h2 id={ids.baseline} className="baseline-title">{fill(page.baselineTitle, { channels: channelsLabel(session.scope.channels, alias), period })}</h2>
        <dl className="baseline-list">
          {(["net_revenue", "contribution_after_marketing"] as const).map(name => <div key={name}><dt>{metricDefinitions[name].label}</dt><dd><button type="button" className="number-link" data-testid={`baseline-${name}`} disabled={stale || !singleChannel} onClick={() => baselineEvidence(name)}>{amountL1(session.baseline.amounts[name])}</button></dd></div>)}
          <div><dt>{fill(ui.baselineRates, { discountRate: metricDefinitions.discount_rate.shortLabel, refundRatio: metricDefinitions.refund_ratio.shortLabel })}</dt><dd>{formatRateL1(session.baseline.rates.discount_rate)} ／ {formatRateL1(session.baseline.rates.refund_ratio)}</dd></div>
          <div><dt>{ui.baselineFeeRates}</dt><dd>{formatRateL1(session.baseline.rates.platform_rate)} ／ {formatRateL1(session.baseline.rates.payment_rate)}</dd></div>
        </dl>
        <div className={stale ? "baseline-freshness ui-notice" : "baseline-freshness"} data-tone={stale ? "warning" : undefined} role="status" data-testid="decision-freshness">
          {stale ? <><span className="ui-lozenge" data-tone="warning">{ui.staleTitle}</span><span>{ui.staleBody}</span><button type="button" className="ui-btn ui-btn-secondary" onClick={rebuild}>{ui.rebuildButton}</button></> : <span>{ui.freshTitle}</span>}
        </div>
      </div>
      {!session.baseline.eligible && <div className="ui-notice scenario-unavailable" data-tone="warning" data-testid="scenario-unavailable"><strong>{ui.unavailableTitle}</strong><ul>{session.baseline.reasons.map((reason, i) => <li key={`${reason.code}-${i}`}>{baselineReasonText(reason)}</li>)}</ul><p>{ui.unavailableHelp}</p></div>}
      <details className="scenario-assumptions" data-testid="scenario-assumptions">
        <summary id="assumptions-heading">{form.assumptionsSummary}</summary>
        <ol>{assumptionCopy.map((assumption, i) => <li key={i}>{assumption}</li>)}</ol>
        <p className="scenario-assumptions-caution">{ui.assumptionsCaution}</p>
        <details><summary>{ui.techFormulasSummary}</summary><dl className="formula-list">{Object.entries(SCENARIO_FORMULAS).map(([key, formula]) => <div key={key}><dt>{key}</dt><dd>{formula}</dd></div>)}</dl><p className="note">{ui.roundingTechnical}</p></details>
      </details>
      <details className="scenario-technical"><summary>{labels.sections.technicalDetails}</summary><dl className="decision-metadata"><dt>{labels.csvColumns.dataset_id}</dt><dd>{session.dataset_id}</dd><dt>{ui.techVersions}</dt><dd>{session.schema_version} / {session.scenario_version} / {session.metric_version}</dd><dt>{labels.csvColumns.dataset_hash}</dt><dd>{session.dataset_hash}</dd><dt>{labels.csvColumns.filter_hash}</dt><dd>{session.filter_hash}</dd><dt>{labels.csvColumns.revision}</dt><dd>{session.revision}</dd></dl>{calculated.length > 0 && <p className="scenario-technical-plans">{technicalPlanLine(calculated)}</p>}</details>
    </section>
    {!plans.length && <p className="empty-note">{ui.emptyPlans}</p>}
    {/* V3-6（PRD §7.4 方案欄）：≥ 1280 最多 3 欄並排，1 個方案時 8/12＋右側 4/12 的新增區；< 1280 單欄。不用分頁，每個方案都保持掛載（M2）。 */}
    <div className="scenario-columns" data-testid="scenario-columns" data-count={plans.length}>{plans.map((plan, index) => {
      const n = index + 1, base = `${fieldId}-${n}`;
      const preset = applied[plan.id] ? SCENARIO_PRESETS.find(item => item.id === applied[plan.id]) : undefined;
      const pickedPreset = picked[plan.id] ? SCENARIO_PRESETS.find(item => item.id === picked[plan.id]) : undefined;
      const purpose = pickedPreset ? pickedPreset.purpose : preset ? fill(form.presetApplied, { name: preset.name, purpose: preset.purpose }) : null;
      const filled = inputFields.some(field => plan.inputs[field.key].trim() !== "");
      const planRevision = revisionOf(plan);
      const valid = plan.result?.status === "valid";
      return <article className="scenario-card" key={plan.id} data-testid={`scenario-${n}`}>
        {/* 方案表單（PRD §7.4「方案表單」）：Enter 在任一輸入框等於按「試算」（隱式送出走「試算」按鈕的 onClick）。 */}
        <form className="scenario-form" noValidate onSubmit={event => event.preventDefault()}>
        <fieldset disabled={stale || !session.baseline.eligible}><legend className="sr-only">{fill(ui.planLegend, { n })}</legend>
          <div className="ui-field"><label className="ui-field-label" htmlFor={`${base}-name`}>{ui.planName}</label><input id={`${base}-name`} aria-label={ui.planName} className="ui-field-control" maxLength={100} value={plan.name} onChange={e => editScenario(plan.id, { name: e.target.value })} /></div>
          {/* 範本列：select＋「套用範本」＋ ? 說明（用途與「只是起點」收進 popover，hidden 保持掛載，M1）；會覆寫時下方一行警示。 */}
          <div className="ui-field scenario-template">
            <label className="ui-field-label" htmlFor={`${base}-preset`}>{form.presetSelect}</label>
            <div className="scenario-template-row">
              <select id={`${base}-preset`} className="ui-field-control" data-testid="scenario-preset" aria-label={form.presetSelect} value={pickedPreset?.id ?? ""} onChange={e => pickTemplate(plan, e.target.value)}><option value="">{labels.scenarioPresets.menuPlaceholder}</option>{SCENARIO_PRESETS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
              <button type="button" className="ui-btn ui-btn-secondary" data-testid="scenario-preset-apply" disabled={!pickedPreset} onClick={() => { if (pickedPreset) applyTemplate(plan, pickedPreset.id); }}>{labels.buttons.applyTemplate}</button>
              <HelpPopover id={`${base}-template-help`} label={page.templateHelpAria}><p data-testid="scenario-template-note">{labels.scenario.templateNote}</p><p className="scenario-preset-purpose" data-testid="scenario-preset-purpose">{purpose ?? page.templatePurposeEmpty}</p></HelpPopover>
            </div>
            {filled && <span className="ui-field-error scenario-preset-overwrite" data-testid="scenario-preset-overwrite">{form.presetOverwrite}</span>}
          </div>
          <div className="scenario-inputs">{inputFields.map(field => {
            const id = `${base}-${field.key}`;
            const absField = isAbsoluteField(field.key) ? field.key : null;
            const availability = absField ? absoluteAvailability(absField, ctx) : null;
            const entry = absField && availability?.available ? absolute[plan.id]?.[absField] : undefined;
            // 絕對值模式：改過才換算；預填值還沒改時，等值文字直接取方案目前的相對值。
            const conversion = absField && entry?.edited ? absoluteToRelative(absField, entry.text, ctx) : null;
            const equivalent = conversion ? conversion.equivalent : absField ? (entry ? relativeEquivalent(absField, plan.inputs[absField]) : relativeToAbsolute(absField, plan.inputs[absField], ctx)) : null;
            const prefillNote = absField === "volume_change_pct" && entry && !entry.edited && entry.text !== "" && !/^\d+$/.test(entry.text) ? fill(labels.scenarioPresets.absolute.nonIntegerUnits, { units: fill(labels.assist.units.count, { value: entry.text }) }) : null;
            const hint = rangeHint(field.key, plan.inputs[field.key], ctx);
            const error = conversion?.error ?? null;
            // 等值換算只在「改成」模式顯示；範圍提示與換算錯誤一律掛載，沒有內容時 hidden（M1）。aria-describedby 只列看得到（或給輔助科技）的說明。
            const showEquivalent = !!entry && !!equivalent;
            const help = absField && entry ? absoluteHelp(absField, ctx) : field.help;
            const described = [`${id}-help`, showEquivalent && `${id}-equivalent`, prefillNote && `${id}-prefill`, error && `${id}-error`, hint && `${id}-range`].filter(Boolean).join(" ");
            return <div className="ui-field scenario-field" key={field.key}>
              <label className="ui-field-label" htmlFor={id}>{field.label}</label>
              <div className="scenario-input-row">
                <input id={id} aria-label={field.label} aria-describedby={described} aria-invalid={error || hint ? true : undefined} className="ui-field-control" type="text" inputMode="decimal" maxLength={200} autoComplete="off" placeholder={help} value={entry ? entry.text : plan.inputs[field.key]} onChange={e => absField && entry ? setAbsoluteText(plan, absField, e.target.value) : editScenario(plan.id, { inputs: { ...plan.inputs, [field.key]: e.target.value } })} />
                <span className="scenario-unit">{unitOf(field.key, !!entry)}</span>
                {absField && availability && <div className="ui-segmented scenario-mode" role="group" aria-label={fill(form.modeGroup, { field: field.label })} data-testid={`scenario-mode-${absField}`}><button type="button" aria-pressed={!entry} onClick={() => setMode(plan, absField, "relative")}>{page.modeRelative}</button><button type="button" aria-pressed={!!entry} disabled={!availability.available} onClick={() => setMode(plan, absField, "absolute")}>{page.modeAbsolute}</button></div>}
              </div>
              <small id={`${id}-help`} className={entry ? "ui-field-hint" : "sr-only"}>{help}</small>
              {field.note && <small className="ui-field-hint scenario-ad-note">{field.note}</small>}
              {availability && !availability.available && <small className="ui-field-hint" data-testid={`scenario-unavailable-${field.key}`}>{availability.reason}</small>}
              {absField && <small id={`${id}-equivalent`} className="ui-field-hint scenario-equivalent" data-testid={`scenario-equivalent-${field.key}`} hidden={!showEquivalent}>{equivalent}</small>}
              {prefillNote && <small id={`${id}-prefill`} className="ui-field-hint" data-testid={`scenario-absolute-note-${field.key}`}>{prefillNote}</small>}
              {absField && <small id={`${id}-error`} className="ui-field-error" role="status" data-testid={`scenario-absolute-error-${field.key}`} hidden={!error}>{error}</small>}
              <small id={`${id}-range`} className="ui-field-error" role="status" data-testid={`scenario-range-${field.key}`} hidden={!hint}>{hint}</small>
            </div>;
          })}</div>
          {/* 聲明（D-V3-12＝B）：同一工作區勾一次就記住；記住之前每個方案都顯示勾選框，記住之後只留一行說明。 */}
          {acknowledged ? <p className="scenario-acknowledged" data-testid="scenario-acknowledged">{page.acknowledged}</p>
            : <label className="ui-check-label scenario-accept"><input type="checkbox" className="ui-check" data-testid="scenario-accept" checked={plan.inputs.assumptions_accepted} onChange={e => { editScenario(plan.id, { inputs: { ...plan.inputs, assumptions_accepted: e.target.checked } }); if (e.target.checked && onAcknowledge) { onAcknowledge(); focusById(`${base}-calculate`); } }} />{labels.scenario.acceptAssumptions}</label>}
          <div className="ui-actions scenario-actions"><button id={`${base}-calculate`} type="submit" className="ui-btn ui-btn-primary" onClick={event => { event?.preventDefault(); calculate(plan); }}>{labels.buttons.calculate}</button>{persisted && <button type="button" className="ui-btn ui-btn-text" onClick={() => remove(plan.id)}>{labels.buttons.removeScenario}</button>}</div>
        </fieldset>
        </form>
        {/* 結果（PRD §7.4，每欄底部對齊）：試算後扣廣告後貢獻（24px）、與現況相比（依方向上色並加符號）、版本或草稿、「選入會議」；下方是該方案自己的「要賣到多少才划算」。 */}
        <div className="scenario-outcome">
          <div aria-live="polite" className="scenario-result" data-testid="scenario-result">
            {stale && <p><span className="ui-lozenge" data-tone="warning">{ui.staleResultTag}</span></p>}
            {valid && plan.result && <><p className="scenario-result-label">{labels.scenario.resultTitle}</p><strong className="scenario-result-value" data-testid="scenario-contribution">{amountL1(plan.result.contribution)}</strong><p className="scenario-result-delta">{labels.scenario.vsBaseline} <b data-testid="scenario-delta" className={toneClass(deltaTone("contribution_after_marketing", plan.result.delta, "L1"))}>{formatSignedDelta(plan.result.delta, "L1")}</b></p></>}
            {!plan.result && <p className="scenario-result-empty">{ui.noResult}</p>}
            {plan.result && !valid && <div className="scenario-result-reasons"><strong>{plan.inputs.assumptions_accepted ? ui.cannotCalculate : ui.planUnavailable}</strong><ul>{plan.result.reasons.map((reason, i) => <li key={i}>{inputFields.find(field => field.key === reason.field)?.label}{reason.field ? "：" : ""}{scenarioReasonText(reason)}</li>)}</ul></div>}
            {valid && planRevision !== undefined && <p className="scenario-result-tag"><span className="ui-lozenge" data-tone="accent" data-testid="scenario-version">{fill(form.version, { n: planRevision })}</span></p>}
            {!plan.result && <p className="scenario-result-tag"><span className="ui-lozenge" data-tone="warning" data-testid="scenario-draft">{labels.scenario.draft}</span></p>}
          </div>
          {valid && onSelectPlan && <button type="button" className="ui-btn ui-btn-secondary scenario-select" data-testid={`scenario-select-${n}`} aria-label={fill(labels.ui.multiScenarioWorkbench.selectPlanButton, { selectForMeeting: labels.buttons.selectForMeeting, plan: plan.name })} onClick={() => onSelectPlan(plan.id)}>{labels.buttons.selectForMeeting}</button>}
          {valid && <ScenarioSensitivity baseline={session.baseline} inputs={plan.inputs} stale={stale} value={plan.sensitivity} onChange={next => setSensitivity(plan.id, next)} />}
        </div>
      </article>;
    })}
      {plans.length < 3 && <div className="scenario-add ui-empty-block"><button type="button" className="ui-btn ui-btn-secondary" data-testid="scenario-add" disabled={stale || !session.baseline.eligible} onClick={addPlan}>{labels.buttons.addScenario}</button><p>{page.addNote}</p></div>}
    </div>
    {/* V3-6（PRD §7.4 方案欄之後）：方案比較表（預設展開）→ 其他通路的方案 → 之前的試算 → 通知。 */}
    {plans.length > 0 && <section className="ui-section scenario-compare" aria-labelledby={ids.compare}>
      <div className="ui-section-head"><h2 className="ui-section-title" id={ids.compare}>{fill(ui.compareTableHeading, { staleSuffix: stale ? staleSuffix : "" })}</h2><p className="ui-section-subtitle">{ui.compareNote}</p></div>
      <div className="table-scroll" role="region" aria-label={ui.compareTableAria} tabIndex={0}><table className="ui-table scenario-compare-table" data-testid="scenario-comparison"><caption>{ui.compareTableCaption}</caption><thead><tr><th>{fill(labels.units.yuanColumn, { label: ui.compareColItem })}</th><th className="num">{ui.compareColBaseline}</th>{plans.map(plan => <th className="num" key={plan.id}>{plan.name}</th>)}</tr></thead><tbody>
        {AMOUNT_FIELDS.map(field => <tr key={field}><th>{metricDefinitions[field].label}</th><td className="num">{formatAmountL2(session.baseline.amounts[field])}</td>{plans.map(plan => <td className="num" key={plan.id}>{planCell(plan, plan.result?.amounts?.[field])}</td>)}</tr>)}
        <tr><th>{labels.scenario.oneOff.label}</th><td className="num">{labels.status.notApplicable}</td>{plans.map(plan => <td className="num" key={plan.id}>{planCell(plan, plan.result?.amounts?.one_time_cost)}</td>)}</tr>
        <tr><th>{ui.roundingAdjustment}</th><td className="num">{labels.status.notApplicable}</td>{plans.map(plan => <td className="num" key={plan.id}>{planCell(plan, plan.result?.rounding_adjustment, formatAmountL3)}</td>)}</tr>
        <tr className="scenario-total total"><th>{metricDefinitions.contribution_after_marketing.label}</th><td className="num">{formatAmountL2(session.baseline.amounts.contribution_after_marketing)}</td>{plans.map(plan => <td className="num" key={plan.id}>{planCell(plan, plan.result?.contribution)}</td>)}</tr>
        <tr><th>{fill(ui.netRevenueSummaryRow, { metric: metricDefinitions.net_revenue.label })}</th><td className="num">{formatAmountL2(session.baseline.amounts.net_revenue)}</td>{plans.map(plan => <td className="num" key={plan.id}>{planCell(plan, plan.result?.amounts?.net_revenue)}</td>)}</tr>
      </tbody></table></div>
    </section>}
    {children}
    <p role="status" className="decision-notice" data-testid="decision-notice">{notice}</p>
  </div>;
}
