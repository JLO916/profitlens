"use client";

import { useMemo, useState } from "react";
import { formatMoney, formatSignedMoney, metricDefinitions } from "@/application/presentation";
import { analyzeScenarioSensitivity, type ContributionThreshold } from "@/domain/scenario-sensitivity";
import type { ScenarioBaseline, ScenarioInputs } from "@/domain/scenarios";
import { MAX_SENSITIVITY_INPUT_LENGTH, blankSensitivity, type SensitivityInputs } from "@/application/decision";
import { scenarioReasonText } from "@/application/decision-export";
import { fill, labels } from "@/i18n";

const copy = labels.ui.scenarioSensitivity;

/** 主層文案：門檻說明一句話；精確分數與取分說明移到技術細節。 */
function thresholdDescription(target: ContributionThreshold): string {
  if (target.status === "constant_equal") return copy.thresholdConstantEqual;
  if (target.status === "constant_above") return copy.thresholdConstantAbove;
  if (target.status === "constant_below") return copy.thresholdConstantBelow;
  const direction = target.meets_target_when === "at_or_above" ? copy.directionAtOrAbove : copy.directionAtOrBelow;
  if (target.status === "outside_range") return fill(copy.thresholdOutsideRange, { outcome: target.range_outcome === "all_at_or_above" ? copy.outcomeAllAtOrAbove : copy.outcomeAllBelow });
  return fill(copy.thresholdExact, { direction });
}

/** domain 的 reason.message 含技術口吻；主層一律依 code 用標籤字典（與匯出共用 scenarioReasonText），不退回 domain 訊息。 */
const reasonText = scenarioReasonText;

const letter = (index: number) => String.fromCharCode(65 + index);
const targetLabel = (id: ContributionThreshold["id"]) => id === "zero_contribution" ? fill(copy.targetZero, { metric: metricDefinitions.contribution_after_marketing.label }) : copy.targetMaintain;

/**
 * Inputs are inherited only from a validated parent plan. R5-4：三組銷量假設是受控值（plan.sensitivity，沒有時為空白），
 * 每次輸入都經 onChange 寫回方案；只有「計算三個假設」的結果（submitted）留在本元件。三格都已填的既有值（例如讀入備份）直接帶出結果。
 */
export function ScenarioSensitivity({ baseline, inputs, stale = false, value, onChange }: { baseline: ScenarioBaseline; inputs: ScenarioInputs; stale?: boolean; value?: SensitivityInputs; onChange: (next: SensitivityInputs) => void }) {
  const volumes = (value ?? blankSensitivity()).volumes;
  const [submitted, setSubmitted] = useState<readonly string[] | null>(() => volumes.every(entry => entry.trim() !== "") ? [...volumes] : null);
  const analysis = useMemo(() => analyzeScenarioSensitivity(baseline, inputs, submitted ?? ["", "", ""], { stale }), [baseline, inputs, submitted, stale]);
  return <details className="scenario-sensitivity" data-testid="scenario-sensitivity">
    <summary>{labels.sections.scenarioBreakeven}</summary>
    <p className="note">{labels.sections.caution}：{labels.basis.items[6]}</p>
    {analysis.status !== "valid" ? <div className="alert" role="status">{analysis.reasons.map(reason => <p key={`${reason.code}-${reason.field ?? ""}`}>{reasonText(reason)}</p>)}</div> : <>
      <h4>{copy.targetsHeading}</h4>
      {analysis.targets.map(target => <section className="threshold-target" data-testid={`threshold-${target.id}`} key={target.id}>
        <h5>{fill(copy.targetHeading, { target: targetLabel(target.id), amount: formatMoney(target.target) })}</h5>
        {target.threshold_pct !== null && <p>{copy.thresholdPctLabel} <strong data-testid="threshold-pct">{target.threshold_pct}%</strong></p>}
        <p>{thresholdDescription(target)}</p>
        {target.threshold_fraction && <details><summary>{copy.exactFractionSummary}</summary><p className="formula">{fill(copy.exactFractionTechnical, { numerator: target.threshold_fraction.numerator, denominator: target.threshold_fraction.denominator })}</p></details>}
      </section>)}
      <details className="sensitivity-formula"><summary>{labels.sections.technicalDetails}</summary>
        <p className="formula">{analysis.formula}</p>
        <p>{fill(copy.coefficientsTechnical, { volume: formatMoney(analysis.coefficients!.volume_coefficient), fixed: formatMoney(analysis.coefficients!.fixed_outflow), numerator: analysis.coefficients!.volume_coefficient_fraction.numerator, denominator: analysis.coefficients!.volume_coefficient_fraction.denominator })}</p>
        <p>{analysis.coefficients!.slope === "positive" ? copy.slopePositiveTechnical : analysis.coefficients!.slope === "negative" ? copy.slopeNegativeTechnical : copy.slopeZeroTechnical}</p>
        <p>{copy.fixedAssumptionsTechnical}</p>
        <p>{copy.thresholdPrecisionTechnical}</p>
      </details>
      <h4>{copy.inputsHeading}</h4>
      <p className="note">{copy.inputsHint}</p>
      <fieldset disabled={stale}><legend className="sr-only">{copy.inputsLegend}</legend>
        <div className="sensitivity-inputs">{volumes.map((entry, index) => <label key={index}>{fill(copy.inputLabel, { letter: letter(index) })}<input type="text" inputMode="decimal" maxLength={MAX_SENSITIVITY_INPUT_LENGTH} value={entry} onChange={event => { onChange({ volumes: volumes.map((item, position) => position === index ? event.target.value : item) as SensitivityInputs["volumes"] }); setSubmitted(null); }} /></label>)}</div>
        <button className="button quiet" onClick={() => setSubmitted([...volumes])}>{copy.recalc}</button>
      </fieldset>
      <div aria-live="polite" data-testid="sensitivity-result">
        {analysis.sensitivity.status !== "valid" ? <p className={analysis.sensitivity.status === "invalid" ? "alert" : "note"}>{analysis.sensitivity.reasons.map(reasonText).join(" ")}</p> : <div className="table-scroll" role="region" aria-label={copy.tableAria} tabIndex={0}><table>
          <caption>{copy.tableCaption}</caption>
          <thead><tr><th>{copy.colAssumption}</th><th>{labels.scenario.volume.label}（%）</th><th>{labels.scenario.resultTitle}</th><th>{labels.scenario.vsBaseline}</th></tr></thead>
          <tbody>{analysis.sensitivity.rows.map((row, index) => <tr key={index}><th>{fill(copy.rowLabel, { letter: letter(index) })}</th><td>{row.volume_change_pct}%</td><td>{formatMoney(row.result.contribution)}</td><td>{formatSignedMoney(row.result.delta)}</td></tr>)}</tbody>
        </table></div>}
      </div>
    </>}
  </details>;
}
