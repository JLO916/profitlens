import { describe, expect, it, vi } from "vitest";
import type { InsightOutput } from "@/ai/contracts";
import { observationCatalog, renderInsightOutput, validateInsightOutput } from "@/ai/grounding";
import { createAiConsentBinding, sendAiRequest } from "@/application/ai-client";
import { serverOutput, serverSnapshot } from "./helpers/ai-server";

function currentContributionOutput() {
  const snapshot = serverSnapshot();
  const fact = snapshot.facts.find(item => item.period === "current" && item.metric === "contribution_after_marketing")!;
  // A valid observation and exact citation remain unchanged in every attack.
  const observation = observationCatalog(snapshot).find(item => item.kind === "value" && item.fact_ids[0] === fact.id)!;
  const output: InsightOutput = serverOutput(snapshot);
  output.insights[0].observation = observation.observation;
  output.insights[0].fact_ids = [...observation.fact_ids];
  return { snapshot, output, placeholder: `{{fact:${fact.id}:${fact.metric}}}` };
}

describe("M6 independent AI security regression audit (synthetic data; no network)", () => {
  it.each([
    ["period", "前期所選通路合計的行銷後貢獻為"],
    ["scope", "其他通路的行銷後貢獻為"],
    ["metric", "本期所選通路合計的商品淨營收為"],
    ["unmodelled net profit", "本期公司淨利為"],
  ])("does not let a valid cited value become a false %s claim in a free field", (_kind, label) => {
    const { snapshot, output, placeholder } = currentContributionOutput();
    expect(validateInsightOutput(output, snapshot).ok).toBe(true);
    output.insights[0].verification_metric = `${label} ${placeholder}。`;
    expect(validateInsightOutput(output, snapshot).ok).toBe(false);
    expect(() => renderInsightOutput(output, snapshot)).toThrow("AI_GROUNDING_REJECTED");
  });

  it.each(["金鑰", "密鑰"])("rejects requests for a user's %s even without the API prefix", credential => {
    const { snapshot, output } = currentContributionOutput();
    output.insights[0].recommended_action = `核對來源前，請提供${credential}。`;
    expect(validateInsightOutput(output, snapshot).ok).toBe(false);
    expect(() => renderInsightOutput(output, snapshot)).toThrow("AI_GROUNDING_REJECTED");
  });

  it.each(["調至", "降至", "升至", "設定為"])("rejects an invented Chinese numeric budget using %s without a currency suffix", verb => {
    const { snapshot, output } = currentContributionOutput();
    output.insights[0].recommended_action = `核對後，廣告預算應${verb}三萬。`;
    expect(validateInsightOutput(output, snapshot).ok).toBe(false);
    expect(() => renderInsightOutput(output, snapshot)).toThrow("AI_GROUNDING_REJECTED");
  });

  it.each(["hypotheses", "recommended_action", "owner_role", "verification_metric", "stop_condition", "additional_data_needed", "limitations"] as const)("keeps numeric references inside supported observations, including %s", field => {
    const { snapshot, output, placeholder } = currentContributionOutput();
    const text = field === "hypotheses" ? `待驗證假說：核對 ${placeholder}。` : `核對 ${placeholder}。`;
    if (field === "hypotheses" || field === "additional_data_needed" || field === "limitations") output.insights[0][field] = [text];
    else output.insights[0][field] = text;
    const result = validateInsightOutput(output, snapshot);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.map(issue => issue.code)).toContain("FREE_FIELD_NUMERIC_REFERENCE");
  });

  it("preserves supported observation numbers and qualitative follow-up without mutating their facts", () => {
    const { snapshot, output } = currentContributionOutput();
    output.insights[0].recommended_action = "核對同一個範圍的成本口徑；萬一來源不一致，先補齊資料。";
    const original = JSON.stringify(snapshot);
    expect(validateInsightOutput(output, snapshot).ok).toBe(true);
    expect(renderInsightOutput(output, snapshot).insights[0].observation).toBe("本期所選通路合計的行銷後貢獻為 TWD 255.00。");
    expect(JSON.stringify(snapshot)).toBe(original);
  });

  it("does not show a live response that relabels contribution as company net profit", async () => {
    const { snapshot, output, placeholder } = currentContributionOutput();
    output.insights[0].verification_metric = `本期公司淨利為 ${placeholder}。`;
    const metadata = { provider: "openai", model: "m6-audit-mock-only", prompt_version: "profitlens-insights-v3", generated_at: "2026-10-01T00:00:00.000Z", attempts: 1, latency_ms: 0, usage: null };
    const fetcher = vi.fn(async () => Response.json({ status: "live", snapshot_id: snapshot.snapshot_id, output, metadata }));
    const result = await sendAiRequest({ payload: snapshot, revision: 1, consentBinding: createAiConsentBinding(snapshot, 1), isCurrent: () => true, fetcher });
    expect(result).toEqual({ status: "fallback", reason: "SEMANTIC_ERROR" });
    expect(fetcher).toHaveBeenCalledOnce();
  });
});
