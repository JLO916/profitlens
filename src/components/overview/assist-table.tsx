"use client";

import { Fragment, useMemo, type ReactNode } from "react";
import { ASSIST_KPI_VERSION, assistKpis, type AssistKpi } from "@/application/assist-kpi";
import type { WorkspaceSnapshot } from "@/application/workspace";
import type { Period } from "@/domain/types";
import { fill, labels } from "@/i18n";
import type { EvidenceSelection } from "../evidence-drawer";
import { ShellIcon } from "../shell/shell-icon";

const ui = labels.overview.assistTable;
/** 兩欄緊湊表的分欄：左欄 4 列、右欄 3 列，順序同 ASSIST_KPI_IDS。 */
const SPLIT = 4;

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
    </div>
  </section>;
}
