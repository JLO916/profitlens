import { saveScenario } from "@/application/decision";
import { createReviewSession, selectReviewScenario, type ReviewSession } from "@/application/review-session";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext, type ScenarioSource, type ScenarioWorkspace } from "@/application/scenario-workspace";
import { createSnapshot, hashInput } from "@/application/workspace";
import type { ScenarioInputs } from "@/domain/scenarios";
import type { AnalysisFilters, DatasetInput, Manifest } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./fixtures";

// V4-6 代理 B 的 7 通路會議（原在 tests/charts-meeting-scenarios-v4.test.tsx，V4-6 整合時原樣搬到這裡，給 tests/helpers/page-states.tsx 的
// 「meeting-seven-channels」頁面狀態共用；資料只在記憶體，不寫檔、不新增 fixtures/）。G15 會議實例「7 個通路各選一個方案時只畫 6 根、資料表 7 列」（06_BATCHES V4-6 驗收重點）。

/** 7 個通路的合成資料：golden 的 DTC 三份 CSV 原樣複製到 7 個通路，每個通路的現況扣廣告後貢獻都是 270.00、本期物流費 140.00。 */
export const CHANNELS = ["DTC", "MARKETPLACE", "SOCIAL", "LIVE", "B2B", "POPUP", "WHOLESALE"] as const;
export type SevenChannel = (typeof CHANNELS)[number];
export function sevenChannelInput(): DatasetInput {
  const golden = fixture("golden");
  const replicate = (csv: string) => {
    const [header, ...lines] = csv.trim().split("\n");
    const dtc = lines.filter(line => line.split(",")[1] === "DTC");
    return `${[header, ...CHANNELS.flatMap(channel => dtc.map(line => line.replace(",DTC,", `,${channel},`)))].join("\n")}\n`;
  };
  return { manifest: { ...(golden.manifest as Manifest), dataset_id: "seven-channel-v1", channels: [...CHANNELS] }, files: Object.fromEntries(Object.entries(golden.files).map(([name, csv]) => [name, replicate(csv as string)])) as DatasetInput["files"] };
}
export async function source(input: DatasetInput, filters: AnalysisFilters = {}): Promise<ScenarioSource> {
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)), revision: 1 };
}
export const accepted = (patch: Partial<ScenarioInputs> = {}): ScenarioInputs => ({ volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true, ...patch });
/** 每個通路一個方案：物流費增減（%）→ 差額＝−140 × 增減（DTC golden：−10% → 284.00、+14.00）。 */
export const FULFILLMENT: Record<SevenChannel, string> = { DTC: "-10", MARKETPLACE: "-20", SOCIAL: "10", LIVE: "0", B2B: "-30", POPUP: "20", WHOLESALE: "-40" };
export const DELTA: Record<SevenChannel, string> = { DTC: "14.00", MARKETPLACE: "28.00", SOCIAL: "-14.00", LIVE: "0.00", B2B: "42.00", POPUP: "-28.00", WHOLESALE: "56.00" };
export const planName = (channel: string) => `方案${channel}`;
export const planId = (channel: string) => `plan-${channel}`;

export interface Meeting7 { all: ScenarioSource; ws: ScenarioWorkspace; review: ReviewSession }
/** 7 個通路各建一個單通路試算並選入會議；選入順序與通路順序相反（圖與資料表依會議範圍的通路順序）。 */
export async function sevenChannelMeeting(): Promise<Meeting7> {
  const input = sevenChannelInput();
  const all = await source(input);
  let ws: ScenarioWorkspace = emptyScenarioWorkspace("e");
  for (const channel of CHANNELS) {
    ws = ensureScenarioContext(ws, await source(input, { channels: [channel] }));
    const context = ws.contexts[ws.contexts.length - 1];
    const decision = scenarioContextDecision(context);
    decision.scenarios = saveScenario(context.session, [], { id: planId(channel), name: planName(channel), inputs: accepted({ fulfillment_change_pct: FULFILLMENT[channel] }) });
    ws = updateScenarioContext(ws, context.id, decision);
  }
  let review = createReviewSession(all, "e", "rev-7");
  for (const channel of [...CHANNELS].reverse()) {
    const context = ws.contexts.find(row => row.session.scope.channels[0] === channel)!;
    review = selectReviewScenario(review, ws, scenarioSelectionRef(context, planId(channel)));
  }
  return { all, ws, review };
}
/** 讓一個通路的方案過期：同一個方案 id 再存一次（新的修訂），會議選的是舊修訂。 */
export function supersede(ws: ScenarioWorkspace, channel: string): ScenarioWorkspace {
  const context = ws.contexts.find(row => row.session.scope.channels[0] === channel)!;
  const decision = scenarioContextDecision(context);
  decision.scenarios = saveScenario(context.session, decision.scenarios, { id: planId(channel), name: planName(channel), inputs: accepted({ fulfillment_change_pct: "-50" }) });
  return updateScenarioContext(ws, context.id, decision);
}
