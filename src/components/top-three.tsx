"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { contributionImpact, priorityEvidence } from "@/application/manager-summary";
import { diagnosisGroups, parseImportanceThreshold, TOP_PRIORITY_COUNT, type DiagnosisGroup, type DiagnosisScope } from "@/application/diagnosis-group";
import { channelsLabel, demoAlias, ruleCopy, scopeLabel } from "@/application/copy";
import { overlapping, type EventSet } from "@/application/events";
import { deltaTone, deltaToneLabel, formatAmountL3, formatSignedDelta, metricDefinitions, type DeltaTone, type Layer } from "@/application/presentation";
import { formatCents, parseCents } from "@/domain/money";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Diagnostic } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "./evidence-drawer";
import { ShellIcon } from "./shell/shell-icon";

const BURDEN = new Set<Diagnostic["code"]>(["DISCOUNT_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "MARKETING_BURDEN_UP"]);

/** 以「對貢獻影響」開啟抽屜：費用類規則把排序金額取負並說明，來源列與前後期事實不變。標題與通路名稱只做呈現（示範資料套 alias）。 */
export function impactEvidence(snapshot: Pick<WorkspaceSnapshot, "report">, diagnostic: Diagnostic): EvidenceSelection | null {
  const impact = contributionImpact(diagnostic);
  if (!impact) return null;
  const alias = demoAlias(snapshot.report.dataset_id);
  const base = priorityEvidence(snapshot, diagnostic);
  const values = { impact: labels.overview.sections.impact, metric: metricDefinitions[base.name].label };
  const formula = BURDEN.has(diagnostic.code) ? fill(labels.overview.notes.impactFormulaBurden, values) : base.formula ?? fill(labels.overview.notes.impactFormulaDefault, values);
  // V3-2a：抽屜標題只留結論句；影響金額與範圍放副標（抽屜的範圍行，§8.8 #15）。
  const title = fill(labels.overview.topThree.impactEvidenceTitle, { title: ruleCopy(snapshot, diagnostic, alias).headline });
  return { ...base, title, scopeLabel: fill(labels.overview.topThree.impactEvidenceSubtitle, { impact: labels.overview.sections.impact, scope: scopeLabel(diagnostic.scope, alias) }), metric: impact, formula };
}

/** 紅＝不利、綠＝有利；零與未知為中性（以分為單位比較，不看字串正負號）。V3-2b 起本檔與總覽、健檢改用 toneClass(deltaTone(...))；會議頁仍沿用。 */
export function amountTone(value: string | null): "negative" | "positive" | "neutral" {
  const cents = parseCents(value);
  return cents === null || cents === 0n ? "neutral" : cents < 0n ? "negative" : "positive";
}

/**
 * V3-2b（D-V3-7＝A）：只有不利上色。不利 → 既有的 negative（--unfavorable）；有利與持平 → positive（--favorable＝主文字色，不上色），
 * 但仍保留「+」或方向詞。顏色依 favorableDirection（presentation.deltaTone），不依數學正負號。
 */
export function toneClass(tone: DeltaTone): "negative" | "positive" {
  return tone === "unfavorable" ? "negative" : "positive";
}

/** 影響金額（對扣廣告後貢獻的影響，費用類已取負）：預設 L1「−118.8 萬」；展開列內的相關範圍傳 "L2"。 */
export function ImpactAmount({ snapshot, diagnostic, onEvidence, layer = "L1" }: { snapshot: Pick<WorkspaceSnapshot, "report">; diagnostic: Diagnostic; onEvidence: (evidence: EvidenceSelection) => void; layer?: Layer }) {
  const evidence = impactEvidence(snapshot, diagnostic);
  if (!evidence) return <span className="impact-amount neutral">{diagnostic.code === "MISSING_CRITICAL_DATA" ? labels.shell.status.missing : labels.shell.status.notApplicable}</span>;
  const value = evidence.metric.value;
  const tone = value === null ? "neutral" : toneClass(deltaTone("contribution_after_marketing", value, layer));
  return <button type="button" className={`number-link impact-amount ${tone}`} aria-label={evidence.title} onClick={() => onEvidence(evidence)}>{value === null ? labels.shell.status.missing : formatSignedDelta(value, layer)}</button>;
}

/**
 * C8 狀態標籤（警示列第一欄）：資料缺漏 → 資料待補（warning）；其餘依影響金額的 favorableDirection（扣廣告後貢獻，L1 取位後）→ 不利／有利。
 * 金額未知或取位後為 0 時沒有方向，不顯示標籤。
 */
export function alertStatus(group: Pick<DiagnosisGroup, "missing" | "impact_cents">): { tone: "warning" | DeltaTone; text: string } | null {
  if (group.missing) return { tone: "warning", text: labels.shell.status.missing };
  const tone = deltaTone("contribution_after_marketing", group.impact_cents, "L1");
  const text = deltaToneLabel(tone);
  return text ? { tone, text } : null;
}

/** 門檻初始值：合法時取到分（與表單套用後的顯示一致），不合法時退回 0.00（不讓畫面因為呼叫端傳錯值而壞掉）。 */
function safeThreshold(value: string | undefined): string {
  try { return formatCents(parseImportanceThreshold(value)); } catch { return formatCents(0n); }
}

/** C14／M3：彈出層開著時，Esc 關閉（焦點在裡面時回到觸發器）、點外面關閉；在 modal dialog（抽屜、對話框）裡的操作不算外面。 */
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

export interface TopThreeProps {
  events?: EventSet | null; snapshot: WorkspaceSnapshot; onEvidence: (evidence: EvidenceSelection) => void; onCreateAction?: (diagnostic: Diagnostic) => void;
  /** V3-4a：0 件時的「前往通路健檢」與區塊底部「查看全部 {n} 項健檢結果」；沒傳時兩顆按鈕仍渲染但停用。 */
  onOpenDiagnosis?: () => void;
  /** 門檻初始值（預設 0.00；不合法時用 0.00）。之後仍由區塊內的「調整門檻」表單改變，與會議門檻各自獨立。 */
  initialThreshold?: string;
}

const alerts = labels.overview.alerts;

/**
 * 總覽區塊 4「本期三件事」（V3-4a，PRD §7.1 第 4 點、§9.4 C9 摘要型）：目前檢視的前三個健檢群組，與通路健檢共用 diagnosisGroups（同一套合併、排序與門檻）。
 * 每一列：<li data-testid="overview-priority-{rule}"> 內放 <details class="alert">（summary＝展開指示、狀態標籤、L1 標題、第二行 L2 解讀「原因＋下一步」；
 * 展開內容＝限制、其餘範圍、檔期），以及同一列右側的影響金額（number-link，開抽屜）與「看明細」「加入待辦」。
 * 互動元件不放進 <summary>（summary 不放互動元件，同 diagnosis-list；避免巢狀互動），改由 CSS 格線疊在 summary 預留的影響金額欄與動作欄上。
 * 「調整門檻」是標題列右側的 <details> popover：表單、說明與錯誤訊息一直掛載（M1），Esc 關閉並回焦、點外面關閉。
 */
export function TopThree({ snapshot, onEvidence, onCreateAction, onOpenDiagnosis, initialThreshold, events = null }: TopThreeProps) {
  const [threshold, setThreshold] = useState(() => safeThreshold(initialThreshold));
  const [thresholdInput, setThresholdInput] = useState(threshold);
  const [error, setError] = useState("");
  const [thresholdOpen, setThresholdOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const thresholdRef = useRef<HTMLDetailsElement>(null);
  const thresholdSummaryRef = useRef<HTMLElement>(null);
  const helpRef = useRef<HTMLSpanElement>(null);
  const helpButtonRef = useRef<HTMLButtonElement>(null);
  const closeThreshold = useCallback(() => { if (thresholdRef.current) thresholdRef.current.open = false; setThresholdOpen(false); }, []);
  const closeHelp = useCallback(() => setHelpOpen(false), []);
  useDismiss(thresholdOpen, closeThreshold, thresholdRef, thresholdSummaryRef);
  useDismiss(helpOpen, closeHelp, helpRef, helpButtonRef);
  const summary = useMemo(() => diagnosisGroups(snapshot, { importanceThreshold: threshold }), [snapshot, threshold]);
  const alias = demoAlias(snapshot.report.dataset_id);
  const count = summary.priorities.length;
  const title = count > 0 && count < TOP_PRIORITY_COUNT ? fill(alerts.titleCount, { n: count }) : labels.overview.sections.topThree;
  // R4 檔期提示：本期與檔期重疊時，列內展開內容多一行「檔期」；不改任何數字。
  const eventNames = [...new Set(overlapping(events, snapshot.report.current.period).map(row => row.label))];
  const eventText = eventNames.length ? fill(alerts.eventValue, { label: eventNames.join(labels.events.joiner) }) : "";
  const member = (row: DiagnosisScope) => <li key={row.diagnostic.id}>{fill(labels.overview.topThree.memberRow, { scope: scopeLabel(row.scope, alias), amount: "" })}<ImpactAmount snapshot={snapshot} diagnostic={row.diagnostic} onEvidence={onEvidence} layer="L2" /></li>;
  const row = (item: DiagnosisGroup) => {
    const status = alertStatus(item);
    return <li key={item.rule} className="alert-row" data-testid={`overview-priority-${item.rule}`}>
      <details className="alert">
        <summary><ShellIcon name="chevron-right" size={16} className="alert-chev" />{status && <span className="alert-loz"><span className="ui-lozenge" data-tone={status.tone}>{status.text}</span></span>}<h3 className="alert-title">{item.headline}</h3><span className="alert-explain">{item.cause}{item.next_step}</span></summary>
        <div className="alert-body"><dl>
          <dt>{alerts.limitation}</dt><dd>{item.caution}</dd>
          {item.scopes.length > 1 && <><dt>{alerts.relatedScopes}</dt><dd><ul className="alert-scopes">{item.scopes.slice(1).map(member)}</ul></dd></>}
          {eventText && <><dt>{alerts.eventPeriod}</dt><dd>{eventText}</dd></>}
        </dl></div>
      </details>
      <p className="alert-impact"><span className="k">{labels.overview.sections.impact}</span><ImpactAmount snapshot={snapshot} diagnostic={item.primary} onEvidence={onEvidence} /></p>
      <div className="alert-actions"><button type="button" className="ui-btn ui-btn-secondary" onClick={() => onEvidence(impactEvidence(snapshot, item.primary) ?? priorityEvidence(snapshot, item.primary))}>{labels.evidence.buttons.viewEvidence}</button>{onCreateAction && <button type="button" className="ui-btn ui-btn-secondary" onClick={() => onCreateAction(item.primary)}>{labels.actions.buttons.addToActions}</button>}</div>
    </li>;
  };
  return <section className="top-three" aria-labelledby="top-three-title" data-testid="top-three">
    <div className="sec-head">
      <div className="sec-title"><h2 id="top-three-title">{title}</h2><span className="sec-scope">{channelsLabel(snapshot.report.scope.channels, alias)}</span></div>
      <div className="sec-tools">
        <span className="sort-legend" ref={helpRef}>{labels.overview.sections.impactLegend}<button ref={helpButtonRef} type="button" className="ui-help-trigger" title={labels.overview.sections.impactLegendHelp} aria-label={alerts.sortHelpAria} aria-expanded={helpOpen} aria-controls="top-three-sort-help" onClick={() => setHelpOpen(open => !open)}><ShellIcon name="help" size={16} /></button><span id="top-three-sort-help" className="sort-help ui-popover ui-help-content" hidden={!helpOpen}>{labels.overview.sections.impactLegendHelp}</span></span>
        <details ref={thresholdRef} className="threshold-popover" onToggle={event => setThresholdOpen(event.currentTarget.open)}><summary ref={thresholdSummaryRef} className="ui-btn ui-btn-text">{labels.overview.sections.adjustThreshold}</summary>
          <div className="popover ui-popover">
            <form className="threshold-form" data-testid="threshold-form-overview" onSubmit={event => { event.preventDefault(); try { const checked = diagnosisGroups(snapshot, { importanceThreshold: thresholdInput }); setThreshold(checked.importance_threshold); setThresholdInput(checked.importance_threshold); setError(""); } catch { setError(labels.overview.notes.thresholdInvalid); } }}>
              <label>{labels.meeting.form.threshold}<input aria-describedby="top-three-threshold-help" aria-invalid={error ? true : undefined} value={thresholdInput} onChange={event => setThresholdInput(event.target.value)} inputMode="decimal" maxLength={30} /></label><button type="submit" className="ui-btn ui-btn-secondary">{labels.shell.buttons.apply}</button>
            </form>
            <p className="note" id="top-three-threshold-help">{fill(labels.diagnosis.list.thresholdHelp, { amount: formatAmountL3(summary.importance_threshold) })}</p>
            {error && <p role="alert">{error}</p>}
          </div>
        </details>
      </div>
    </div>
    {count ? <ol className="alert-list">{summary.priorities.map(row)}</ol>
      : <div className="alert-empty"><p role="status">{alerts.empty}</p><button type="button" className="ui-btn ui-btn-text" onClick={onOpenDiagnosis} disabled={!onOpenDiagnosis}>{alerts.goDiagnosis}</button></div>}
    {count > 0 && summary.omitted_group_count > 0 && <p className="list-foot"><button type="button" className="ui-btn ui-btn-text" onClick={onOpenDiagnosis} disabled={!onOpenDiagnosis}>{fill(alerts.viewAll, { n: summary.groups.length })}</button></p>}
  </section>;
}
