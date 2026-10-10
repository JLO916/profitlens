import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { saveScenario, type ScenarioPlan } from "@/application/decision";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, updateScenarioContext, type ScenarioSource, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { createSnapshot, hashInput } from "@/application/workspace";
import { RankedBars, type RankedBarRow } from "@/components/charts/ranked-bars";
import { MultiScenarioWorkbench } from "@/components/multi-scenario-workbench";
import { ScenarioVarianceSection, scenarioVarianceModel, type ScenarioVarianceInput } from "@/components/scenarios/variance-chart";
import type { ScenarioInputs, ScenarioResult } from "@/domain/scenarios";
import type { AnalysisFilters } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./fixtures";
import { element } from "./markup";

// V4-6 代理 B：試算頁 G15（chart-scenarios-variance）向下相容的基準。
// G15 會議實例（chart-meeting-scenarios）沿用 C25 RankedBars，並在 RankedBars 加了選用的 axisWithMore（軸列與「另 n 個」列共用一列）；
// 試算頁 G15 的輸出必須逐字不變。tests/fixtures/scenarios-variance-v4-5.json 是用本檔在 V4-6 開工錨點（6142950，RankedBars 尚未擴充）上產生的輸出；
// tests/charts-meeting-scenarios-v4.test.tsx 以擴充後的程式重新產生並逐字比對。內容：
//   （1）試算頁 SSR（MultiScenarioWorkbench，golden DTC）的 section[data-testid=chart-scenarios-variance]：三個方案（兩個有效、一個不能試算）、只有履約、還沒有方案（空狀態）；
//   （2）ScenarioVarianceSection 以固定模型直接渲染：全為少賺、正負都有、持平、過期副標、自訂空狀態說明、方案名很長；
//   （3）RankedBars variance row24 帶軸列（G15 的呼叫方式）：只有軸列、軸列＋「另 n 個」（預設：各自一列）× 量到的三種寬（324、560、1000）。
// 第（3）項的字串只用固定的 ASCII 與數字（不經 labels）。

export const SCENARIOS_VARIANCE_BASELINE_FILE = "tests/fixtures/scenarios-variance-v4-5.json";
const WIDTHS = [324, 560, 1000] as const;
const noop = () => undefined;

async function source(filters: AnalysisFilters = { channels: ["DTC"] }): Promise<ScenarioSource> {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)), revision: 1 };
}
const accepted = (patch: Partial<ScenarioInputs> = {}): ScenarioInputs => ({ volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true, ...patch });
const PLANS: Omit<ScenarioPlan, "result">[] = [
  { id: "p", name: "履約", inputs: accepted({ fulfillment_change_pct: "-10" }) },
  { id: "q", name: "一次性", inputs: accepted({ fulfillment_change_pct: "-10", one_time_cost: "20" }) },
  { id: "r", name: "超出範圍", inputs: accepted({ volume_change_pct: "250" }) },
];
function withPlans(src: ScenarioSource, plans: Omit<ScenarioPlan, "result">[]): ScenarioWorkspace {
  let ws = ensureScenarioContext(emptyScenarioWorkspace("e"), src);
  const context = ws.contexts[ws.contexts.length - 1];
  const decision = scenarioContextDecision(context);
  for (const plan of plans) decision.scenarios = saveScenario(context.session, decision.scenarios, plan);
  ws = updateScenarioContext(ws, context.id, decision);
  return ws;
}
const valid = (contribution: string, delta: string) => ({ status: "valid", contribution, delta } as unknown as ScenarioResult);
const plan = (id: string, name: string, result: ScenarioResult | null): Pick<ScenarioPlan, "id" | "name" | "result"> => ({ id, name, result });
const input = (plans: ScenarioVarianceInput["plans"], patch: Partial<ScenarioVarianceInput> = {}): ScenarioVarianceInput => ({ plans, baseline: "270.00", channels: "DTC", period: "8/2", staleSuffix: "", ...patch });
const MODELS: [string, ScenarioVarianceInput, string?][] = [
  ["all-less", input([plan("a", "A", valid("250.00", "-20.00")), plan("b", "B", valid("264.00", "-6.00"))])],
  ["mixed", input([plan("a", "A", valid("250.00", "-20.00")), plan("b", "B", valid("284.00", "14.00")), plan("c", "C", null)])],
  ["flat", input([plan("a", "A", valid("270.40", "0.40"))])],
  ["stale", input([plan("a", "A", valid("284.00", "14.00"))], { staleSuffix: "（已過期）" })],
  ["empty-custom", input([plan("a", "A", null)]), "custom empty"],
  ["long-names", input([plan("a", "A-VERY-LONG-PLAN-NAME-THAT-MUST-BE-TRUNCATED-1234567890", valid("1270.00", "1000.00")), plan("b", "B", valid("-730.00", "-1000.00"))], { baseline: "-30198.96" })],
];
const axisRows: RankedBarRow<null>[] = [["p", "14.00", "favorable"], ["q", "-6.00", "unfavorable"], ["r", "0.00", "total"]].map(([key, value, tone]) => ({ key, label: `${key} plan`, value, tone: tone as RankedBarRow<null>["tone"], display: value, evidence: null }));

/** 產生基準（鍵依插入順序；JSON 檔以同一順序寫出）。 */
export async function scenariosVarianceBaseline(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const src = await source();
  const page = (ws: ScenarioWorkspace) => element(renderToStaticMarkup(createElement(MultiScenarioWorkbench, { source: src, state: ws, setState: noop, onEvidence: noop, onSelectForReview: noop, onExport: noop })), 'data-testid="chart-scenarios-variance"') ?? "";
  out["page golden-dtc three-plans"] = page(withPlans(src, PLANS));
  out["page golden-dtc one-plan"] = page(withPlans(src, PLANS.slice(0, 1)));
  out["page golden-dtc first-visit"] = page(emptyScenarioWorkspace("e"));
  for (const [name, model, emptyMessage] of MODELS) out[`section ${name}`] = renderToStaticMarkup(createElement(ScenarioVarianceSection, { model: scenarioVarianceModel(model), emptyMessage }));
  for (const width of WIDTHS) {
    out[`ranked axis @${width}`] = renderToStaticMarkup(createElement(RankedBars<null>, { mode: "variance", rows: axisRows, rowHeight: "row24", axis: "base 270", width, testIdPrefix: "chart-scenarios-variance-bar-" }));
    out[`ranked axis-more @${width}`] = renderToStaticMarkup(createElement(RankedBars<null>, { mode: "variance", rows: axisRows, rowHeight: "row24", axis: "base 270", more: "+2", width, testIdPrefix: "chart-scenarios-variance-bar-" }));
  }
  return out;
}
