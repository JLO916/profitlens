import type { AiSnapshot } from "./contracts";

export const PROMPT_VERSION = "profitlens-insights-v2";
export interface AiUsage { input_tokens: number; output_tokens: number; total_tokens: number }
export type ProviderFailure = "TIMEOUT" | "RATE_LIMIT" | "PROVIDER_ERROR" | "ABORTED" | "SCHEMA_ERROR";
export class AiProviderError extends Error {
  constructor(readonly code: ProviderFailure) { super(code); this.name = "AiProviderError"; }
}
export type AiProviderReply =
  | { status: "completed"; output: unknown; usage: AiUsage | null }
  | { status: "refused" | "truncated"; usage: AiUsage | null };
export interface AiProvider {
  generate(snapshot: AiSnapshot, options: { signal: AbortSignal; repair: boolean }): Promise<AiProviderReply>;
}
