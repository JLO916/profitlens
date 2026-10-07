"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ASSIST_KPI_VERSION, assistKpis, type AssistKpi } from "@/application/assist-kpi";
import { BREAKEVEN_MER_VERSION, breakevenEvidenceFormula, breakevenMer, breakevenNote, type BreakevenMer } from "@/application/breakeven-mer";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Period } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "../evidence-drawer";
import { ShellIcon } from "../shell/shell-icon";

const ui = labels.overview.assistTable;
const be = labels.assist.breakevenV3;
/** 兩欄緊湊表的分欄：左欄 4 列、右欄 3 列，順序同 ASSIST_KPI_IDS。 */
const SPLIT = 4;
/** F12 `?` 說明的內容區 id（AssistTable 每頁只有一份，M6）。 */
const BREAKEVEN_HELP_ID = "assist-breakeven-help";

export interface AssistTableProps {
  snapshot: WorkspaceSnapshot;
  onEvidence: (evidence: EvidenceSelection) => void;
  onBasis?: () => void;
  /** 廣告預算達成（kpi-target-ad_spend，含 C18 細條或期間不符提示），放在「廣告佔淨營收」列下方；沒有目標時不給。 */
  budget?: ReactNode;
}

/**
 * 總覽區塊 9「其他常用指標」（C2 兩欄緊湊表，assist-kpi-v1）：本期與上期都是 number-link，抽屜內容同 v2；不加差額欄（PRD §7.1 區塊 9）。
 * 不適用／資料待補的數值用第三色。
 */
export function AssistTable({ snapshot, onEvidence, onBasis, budget = null }: AssistTableProps) {
  const { report } = snapshot;
  const { previous: previousSummary, current: currentSummary } = report;
  const assist = useMemo(() => ({ previous: assistKpis(previousSummary), current: assistKpis(currentSummary) }), [previousSummary, currentSummary]);
  const channels = report.scope.channels;
  const open = (item: AssistKpi, period: Period) => () => onEvidence({ title: item.label, name: item.metric ?? "net_revenue", metric: { value: item.value, reason_codes: item.reason_codes }, period, channels, sources: item.sources, formula: item.formula, formulaTechnical: item.formulaTechnical, metricVersion: item.metric ? undefined : ASSIST_KPI_VERSION, nullDisplay: item.status === "not_applicable" ? labels.assist.notApplicable : undefined, unitOverride: item.unit === "count" ? "count" : item.unit === "money_per_unit" ? "money_per_unit" : undefined });
  const rows = assist.current.map((kpi, index) => ({ kpi, previous: assist.previous[index] }));
  const breakeven = useMemo(() => ({ previous: breakevenMer(previousSummary), current: breakevenMer(currentSummary) }), [previousSummary, currentSummary]);
  const section = labels.overview.sections.assistKpis;
  const cell = (item: AssistKpi, period: Period, periodLabel: string) => <button type="button" className="number-link" aria-label={fill(ui.cellAria, { metric: item.label, period: periodLabel, value: item.display })} onClick={open(item, period)}>{item.display}</button>;
  return <section className="assist" aria-labelledby="assist-title" data-testid="assist-kpis">
    <div className="assist-head"><h2 id="assist-title">{section}</h2><button type="button" className="btn-help" aria-label={fill(ui.helpAria, { section })} title={labels.assist.intro} onClick={onBasis}><ShellIcon name="help" size={16} /></button></div>
    <div className="panel assist-panel">
      <div className="assist-grid">
        {[rows.slice(0, SPLIT), rows.slice(SPLIT)].map((group, index) => <table className="kv" key={index} aria-labelledby="assist-title">
          <thead><tr><th scope="col">{ui.columns.metric}</th><th scope="col" className="num">{ui.columns.current}</th><th scope="col" className="num">{ui.columns.previous}</th></tr></thead>
          <tbody>{group.map(({ kpi, previous }) => <Fragment key={kpi.id}>
            <tr data-testid={`assist-${kpi.id}`}>
              <th scope="row" title={kpi.plain}>{kpi.label}</th>
              <td className={`num ${kpi.status}`}>{cell(kpi, report.current.period, ui.columns.current)}</td>
              <td className={`num prev ${previous.status}`}>{cell(previous, report.previous.period, ui.columns.previous)}</td>
            </tr>
            {kpi.id === "marketing_burden" && budget !== null && <tr className="kv-target"><td colSpan={3}>{budget}</td></tr>}
          </Fragment>)}</tbody>
        </table>)}
      </div>
      <BreakevenRow breakeven={breakeven} report={report} onEvidence={onEvidence} />
    </div>
  </section>;
}

/**
 * F12「計算與來源」（PRD §11.6）：name 用既有 MetricName "mer"（倍數格式）；components 給空陣列，抽屜不畫 MER 的「淨營收 ÷ 廣告費」比率表，
 * 兩個輸入金額（L3）寫在公式行；技術公式與版本 breakeven-mer-v1 自帶；不適用時大數字寫「不適用」。來源是銷售檔與通路費用檔（不含廣告檔）。
 */
export function breakevenEvidence(item: BreakevenMer, period: Period, channels: string[]): EvidenceSelection {
  return { title: item.label, name: "mer", metric: { value: item.value, reason_codes: [...item.reason_codes] }, period, channels, sources: item.sources, formula: breakevenEvidenceFormula(item), formulaTechnical: item.formulaTechnical, definition: item.plain, metricVersion: BREAKEVEN_MER_VERSION, components: [], nullDisplay: item.status === "not_applicable" ? labels.assist.notApplicable : undefined };
}

/**
 * F12 損益兩平 MER（PRD §10.1 F12、D-V3-17＝C）：其他常用指標兩欄表下方的獨立段，版本 breakeven-mer-v1（不屬於 assist-kpi-v1）。
 * 一列「損益兩平 MER」本期／上期各一個 number-link（不適用／資料待補用第三色，同上方各列）＋一句 L1 結論（不上色，D-V3-7）＋`?` 說明（M1：hidden 保持掛載；M3：Esc 關閉回焦）。
 * 數字可開「計算與來源」（breakevenEvidence）。
 */
function BreakevenRow({ breakeven, report, onEvidence }: { breakeven: { previous: BreakevenMer; current: BreakevenMer }; report: AssistTableProps["snapshot"]["report"]; onEvidence: AssistTableProps["onEvidence"] }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!helpOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setHelpOpen(false);
      trigger.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [helpOpen]);
  const { previous, current } = breakeven;
  const open = (item: BreakevenMer, period: Period) => () => onEvidence(breakevenEvidence(item, period, report.scope.channels));
  const cell = (item: BreakevenMer, period: Period, periodLabel: string, testId: string) => <button type="button" className="number-link" data-testid={testId} aria-label={fill(ui.cellAria, { metric: item.label, period: periodLabel, value: item.display })} onClick={open(item, period)}>{item.display}</button>;
  const helpLabel = fill(be.helpAria, { metric: current.label });
  return <div className="assist-breakeven" data-testid="assist-breakeven-mer">
    <table className="kv assist-breakeven-table" aria-labelledby="assist-breakeven-name">
      <thead><tr><th scope="col">{ui.columns.metric}</th><th scope="col" className="num">{ui.columns.current}</th><th scope="col" className="num">{ui.columns.previous}</th></tr></thead>
      <tbody><tr>
        <th scope="row" title={current.plain}><span className="assist-breakeven-name"><span id="assist-breakeven-name">{current.label}</span><button ref={trigger} type="button" className="ui-help-trigger" aria-label={helpLabel} aria-expanded={helpOpen} aria-controls={BREAKEVEN_HELP_ID} data-testid="assist-breakeven-help-trigger" onClick={() => setHelpOpen(value => !value)}><ShellIcon name="help" size={16} /></button></span></th>
        <td className={`num ${current.status}`}>{cell(current, report.current.period, ui.columns.current, "assist-breakeven-current")}</td>
        <td className={`num prev ${previous.status}`}>{cell(previous, report.previous.period, ui.columns.previous, "assist-breakeven-previous")}</td>
      </tr></tbody>
    </table>
    <p className="assist-breakeven-note" data-testid="assist-breakeven-note">{breakevenNote(current)}</p>
    <div id={BREAKEVEN_HELP_ID} role="region" aria-label={helpLabel} className="ui-popover ui-help-content assist-breakeven-help" data-testid="assist-breakeven-help" hidden={!helpOpen}><p>{be.help.definition}</p><p>{fill(be.help.version, { version: BREAKEVEN_MER_VERSION })}</p></div>
  </div>;
}
