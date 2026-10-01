import "server-only";
import { AiSnapshotSchema, InsightOutputSchema, type AiSnapshot, type InsightOutput } from "./contracts";
import type { AiConfig } from "./config";
import { AiProviderError, PROMPT_VERSION, type AiProvider, type AiProviderReply, type AiUsage } from "./provider";
import { createOpenAiProvider } from "./openai-provider";
import { validateInsightOutput } from "./grounding";

export interface InsightMetadata {
  provider: "openai"; model: string | null; prompt_version: string; generated_at: string;
  attempts: number; latency_ms: number; usage: AiUsage | null;
}
export type InsightResult = { status: "live"; snapshot_id: string; output: InsightOutput; metadata: InsightMetadata }
  | { status: "fallback"; snapshot_id: string | null; reason: string; metadata: InsightMetadata };
export type AuditRecord = InsightMetadata & { event: "profitlens_ai"; status: "live" | "fallback"; error_code: string | null };
export interface InsightDependencies { provider?: AiProvider; signal?: AbortSignal; audit?: (record: AuditRecord) => void }
async function boundedAttempt(provider: AiProvider, snapshot: AiSnapshot, timeoutMs: number, repair: boolean, signal?: AbortSignal): Promise<AiProviderReply> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let onAbort: (() => void) | undefined;
  try {
    return await new Promise<AiProviderReply>((resolve, reject) => {
      onAbort = () => { controller.abort(); reject(new AiProviderError("ABORTED")); };
      if (signal?.aborted) { onAbort(); return; }
      signal?.addEventListener("abort", onAbort, { once: true });
      timer = setTimeout(() => { controller.abort(); reject(new AiProviderError("TIMEOUT")); }, timeoutMs);
      provider.generate(snapshot, { signal: controller.signal, repair }).then(resolve, reject);
    });
  } finally { clearTimeout(timer); if (onAbort) signal?.removeEventListener("abort", onAbort); }
}
export async function runInsights(snapshot: AiSnapshot, config: AiConfig, dependencies: InsightDependencies = {}): Promise<InsightResult> {
  const started = performance.now();
  let attempts = 0, knownUsage = true, replies = 0;
  const usage: AiUsage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
  function finish(status: "live" | "fallback", reason: string | null, output?: InsightOutput): InsightResult {
    const metadata: InsightMetadata = { provider: "openai", model: attempts && config.available ? config.model : null,
      prompt_version: PROMPT_VERSION, generated_at: new Date().toISOString(), attempts,
      latency_ms: Math.round(performance.now() - started), usage: knownUsage && replies === attempts && replies > 0 ? { ...usage } : null };
    const record: AuditRecord = { event: "profitlens_ai", ...metadata, status, error_code: reason };
    // Only explicitly constructed metadata can enter logs; never errors, bodies, facts or keys.
    try { (dependencies.audit ?? (entry => console.info(JSON.stringify(entry))))(record); } catch { /* Logging cannot affect core functionality. */ }
    if (status === "live" && output) return { status, snapshot_id: snapshot.snapshot_id, output, metadata };
    return { status: "fallback", snapshot_id: typeof snapshot?.snapshot_id === "string" && /^ai-v2:[a-f0-9]{64}:[a-f0-9]{64}:\d+$/.test(snapshot.snapshot_id) ? snapshot.snapshot_id : null, reason: reason ?? "PROVIDER_ERROR", metadata };
  }
  if (!config.available) return finish("fallback", config.reason);
  const parsed = AiSnapshotSchema.safeParse(snapshot);
  if (!parsed.success) return finish("fallback", "INVALID_REQUEST");
  if (dependencies.signal?.aborted) return finish("fallback", "ABORTED");
  try {
    const provider = dependencies.provider ?? createOpenAiProvider(config);
    for (let attempt = 0; attempt < 2; attempt++) {
      attempts++;
      const reply = await boundedAttempt(provider, parsed.data, config.timeoutMs, attempt === 1, dependencies.signal);
      replies++;
      if (!reply.usage) knownUsage = false;
      else for (const key of ["input_tokens", "output_tokens", "total_tokens"] as const) usage[key] += reply.usage[key];
      if (reply.status === "refused") return finish("fallback", "REFUSED");
      if (reply.status === "truncated") return finish("fallback", "TRUNCATED");
      if (reply.status !== "completed") return finish("fallback", "PROVIDER_ERROR");
      const shape = InsightOutputSchema.safeParse(reply.output);
      const grounded = shape.success ? validateInsightOutput(shape.data, parsed.data) : null;
      if (grounded?.ok) return finish("live", null, grounded.output);
      if (attempt === 1) return finish("fallback", shape.success ? "SEMANTIC_ERROR" : "SCHEMA_ERROR");
    }
  } catch (error) { return finish("fallback", error instanceof AiProviderError ? error.code : "PROVIDER_ERROR"); }
  return finish("fallback", "PROVIDER_ERROR");
}
