import type { AiSnapshot, InsightOutput } from "@/ai/contracts";
import { observationCatalog } from "@/ai/grounding";
import { prepareAiSnapshot } from "@/application/ai-snapshot";
import { createSnapshot, hashInput } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./fixtures";

const input = fixture();
const workspace = await createSnapshot(validateDataset(input).dataset!, {}, await hashInput(input));

export function serverSnapshot(): AiSnapshot {
  return prepareAiSnapshot(workspace, 1).payload;
}
export function serverOutput(snapshot = serverSnapshot()): InsightOutput {
  const observation = observationCatalog(snapshot).find(item => item.kind === "value")!;
  return { snapshot_id: snapshot.snapshot_id, insights: [{ fact_ids: observation.fact_ids, observation: observation.observation,
    hypotheses: ["待驗證假說：可能與商品組合變動有關，仍待核對。"], recommended_action: "請核對商品組合與入帳資料。", owner_role: "營運主管",
    verification_metric: "商品淨營收", stop_condition: "若資料口徑不一致，停止比較。", additional_data_needed: ["商品組合說明"], limitations: ["僅為待核對的說明。"] }], limitations: ["行銷後貢獻不等於公司淨利。"] };
}
