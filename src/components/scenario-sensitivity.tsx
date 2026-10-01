"use client";

import { useMemo, useState } from "react";
import { formatMoney, formatSignedMoney } from "@/application/presentation";
import { analyzeScenarioSensitivity, type ContributionThreshold } from "@/domain/scenario-sensitivity";
import type { ScenarioBaseline, ScenarioInputs } from "@/domain/scenarios";

function thresholdDescription(target: ContributionThreshold): string {
  if (target.status === "constant_equal") return "銷量變動不改變此條件貢獻；範圍內所有銷量假設皆恰等於目標，沒有單一門檻。";
  if (target.status === "constant_above") return "銷量變動不改變此條件貢獻；範圍內皆高於目標，沒有單一門檻。";
  if (target.status === "constant_below") return "銷量變動不改變此條件貢獻；範圍內皆低於目標，沒有可達成門檻。";
  const direction = target.meets_target_when === "at_or_above" ? "大於或等於" : "小於或等於";
  if (target.status === "outside_range") return `等式門檻超出支援的 −90% 至 +100% 範圍。支援範圍內${target.range_outcome === "all_at_or_above" ? "皆可維持目標或更高" : "皆低於目標"}；不在範圍外產生新方案。`;
  return `售出量變化${direction}精確門檻時，條件貢獻可維持目標或更高。門檻以未取分數求得；畫面小數為近似值，臨界處請以精確分數核對。`;
}

/** Inputs are inherited only from a validated parent plan; sensitivity drafts stay local to this view. */
export function ScenarioSensitivity({ baseline, inputs, stale = false }: { baseline: ScenarioBaseline; inputs: ScenarioInputs; stale?: boolean }) {
  const [drafts, setDrafts] = useState<[string, string, string]>(["", "", ""]);
  const [submitted, setSubmitted] = useState<readonly string[] | null>(null);
  const analysis = useMemo(() => analyzeScenarioSensitivity(baseline, inputs, submitted ?? ["", "", ""], { stale }), [baseline, inputs, submitted, stale]);
  return <details className="scenario-sensitivity" data-testid="scenario-sensitivity">
    <summary>銷量門檻與三組敏感度</summary>
    <p className="note">同一期間、同一通路，延用此方案已確認的折扣百分點、履約成本、廣告及一次性投入。只重算條件，不是因果、銷量預測或最適預算；不提供成功機率。</p>
    <p className="note">平均牌價、商品組合、退款金額比與每售出量淨成本固定，平台／金流維持原有效淨營收費率；不涵蓋最低費、階梯費率或按折扣前 GMV 計價。不接受上述固定假設時，此分析不適用。</p>
    {analysis.status !== "valid" ? <div className="alert" role="status">{analysis.reasons.map(reason => <p key={`${reason.code}-${reason.field ?? ""}`}>{reason.message}</p>)}</div> : <>
      <h4>兩個不同的目標</h4>
      <p className="note">這裡的損益兩平僅指本模型條件行銷後貢獻為零；不包含未輸入固定費與所得稅，並非公司淨利損益兩平。</p>
      {analysis.targets.map(target => <section className="threshold-target" data-testid={`threshold-${target.id}`} key={target.id}>
        <h5>{target.id === "zero_contribution" ? "條件貢獻達到零" : "維持原 baseline 貢獻"} · 目標 TWD {formatMoney(target.target)}</h5>
        {target.threshold_pct !== null && <p>售出量變化等式門檻（相對 %，約） <strong data-testid="threshold-pct">{target.threshold_pct}%</strong></p>}
        <p>{thresholdDescription(target)}</p>
        {target.threshold_fraction && <details><summary>查看門檻的精確分數</summary><p className="formula">售出量變化百分比 = {target.threshold_fraction.numerator} ÷ {target.threshold_fraction.denominator}（%）。比較門檻使用此未取分分數；不從已取分金額倒算。</p></details>}
      </section>)}
      <details className="sensitivity-formula"><summary>查看條件門檻公式與係數</summary>
        <p className="formula">{analysis.formula}</p>
        <p>L（量變係數）約 TWD {formatMoney(analysis.coefficients!.volume_coefficient)}；B（本方案廣告＋一次性投入）約 TWD {formatMoney(analysis.coefficients!.fixed_outflow)}。L 的未取分分數 = {analysis.coefficients!.volume_coefficient_fraction.numerator} ÷ {analysis.coefficients!.volume_coefficient_fraction.denominator}。</p>
        <p>{analysis.coefficients!.slope === "positive" ? "本假設下 L 為正，銷量增加時條件貢獻增加。" : analysis.coefficients!.slope === "negative" ? "本假設下 L 為負，銷量增加時條件貢獻反而減少；不可套用「銷量至少多少」的方向。" : "本假設下 L 為零，銷量變化不改變條件貢獻。"}</p>
      </details>
      <h4>由你明填三個銷量假設</h4>
      <p className="note">A／B／C 僅為標籤，不預設保守、中性、積極或機率。三項都必須明填，範圍 −90% 至 +100%，0 也不可留白。每組獨立從同一 baseline 重算，不可相加改善額。敏感度為本頁暫存分析，尚未加入方案或工作區備份。</p>
      <fieldset disabled={stale}><legend className="sr-only">三個敏感度售出量變化</legend>
        <div className="sensitivity-inputs">{drafts.map((value, index) => <label key={index}>敏感度 {String.fromCharCode(65 + index)} 售出量變化（相對 %）<input type="text" inputMode="decimal" value={value} onChange={event => { setDrafts(previous => previous.map((item, position) => position === index ? event.target.value : item) as [string, string, string]); setSubmitted(null); }} /></label>)}</div>
        <button className="button quiet" onClick={() => setSubmitted([...drafts])}>重算三組敏感度</button>
      </fieldset>
      <div aria-live="polite" data-testid="sensitivity-result">
        {analysis.sensitivity.status !== "valid" ? <p className={analysis.sensitivity.status === "invalid" ? "alert" : "note"}>{analysis.sensitivity.reasons.map(reason => reason.message).join(" ")}</p> : <div className="table-scroll" role="region" aria-label="三組敏感度條件比較，可水平捲動" tabIndex={0}><table>
          <caption>同一 baseline，僅替換明填售出量 v；其餘 δ（百分點）、f、a、K 及全部固定假設完全沿用本方案。金額 TWD。</caption>
          <thead><tr><th>使用者假設</th><th>售出量變化（相對 %）</th><th>條件貢獻</th><th>相對原 baseline 差額</th></tr></thead>
          <tbody>{analysis.sensitivity.rows.map((row, index) => <tr key={index}><th>假設 {String.fromCharCode(65 + index)}</th><td>{row.volume_change_pct}%</td><td>{formatMoney(row.result.contribution)}</td><td>{formatSignedMoney(row.result.delta)}</td></tr>)}</tbody>
        </table></div>}
      </div>
    </>}
  </details>;
}
