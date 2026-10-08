import type { AiSnapshot, InsightOutput } from "../ai/contracts";
import { renderInsightOutput, validateInsightOutput } from "../ai/grounding";
import { labels } from "../i18n";

export interface AiCapability { available: boolean; reason: string; provider: "openai" }
export interface AiResponseMetadata {
  provider: "openai"; model: string; prompt_version: string; generated_at: string;
  attempts: number; latency_ms: number;
  usage: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | null;
}
export type AiClientResult = { status: "live"; snapshot_id: string; output: InsightOutput; metadata: AiResponseMetadata }
  | { status: "fallback"; reason: string }
  | { status: "cancelled" | "stale" };
export interface AiRequestOptions {
  payload: AiSnapshot; revision: number; consentBinding: string | null;
  signal?: AbortSignal; isCurrent: () => boolean; fetcher?: typeof fetch; timeoutMs?: number;
}
const SAFE_REASONS = new Set(["PUBLIC_DEMO", "DISABLED", "NO_KEY", "NO_MODEL", "LOCAL_ONLY", "INVALID_CONFIG", "TIMEOUT", "RATE_LIMIT", "REFUSED", "TRUNCATED", "SCHEMA_ERROR", "SEMANTIC_ERROR", "PROVIDER_ERROR", "INVALID_REQUEST", "CONSENT_REQUIRED", "INPUT_TOO_LARGE", "ABORTED", "NETWORK_ERROR", "INVALID_RESPONSE", "SNAPSHOT_MISMATCH", "STATUS_UNAVAILABLE"]);
const CONFIG_GATE_REASONS = new Set(["PUBLIC_DEMO", "DISABLED", "NO_KEY", "NO_MODEL", "LOCAL_ONLY", "INVALID_CONFIG"]);
const capabilityUnavailable: AiCapability = { available: false, reason: "STATUS_UNAVAILABLE", provider: "openai" };

export function createAiConsentBinding(payload: AiSnapshot, revision: number): string {
  if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError("INVALID_AI_REVISION");
  return JSON.stringify({ revision, request: createAiRequestBody(payload) });
}
export function createAiRequestBody(payload: AiSnapshot) {
  return { snapshot: payload, consent: { snapshot_id: payload.snapshot_id, accepted: true, recipient: "openai" } };
}
function record(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function safeReason(value: unknown): string { return typeof value === "string" && SAFE_REASONS.has(value) ? value : "PROVIDER_ERROR"; }

export async function getAiCapability(fetcher: typeof fetch = fetch, signal?: AbortSignal): Promise<AiCapability> {
  try {
    const response = await fetcher("/api/insights", { method: "GET", cache: "no-store", signal });
    if (!response.ok) return { ...capabilityUnavailable };
    const result: unknown = await response.json();
    if (!record(result) || typeof result.available !== "boolean" || result.provider !== "openai" || (result.available ? result.reason !== null && typeof result.reason !== "string" : typeof result.reason !== "string")) return { ...capabilityUnavailable };
    return { available: result.available, provider: "openai", reason: result.available ? "AVAILABLE" : safeReason(result.reason) };
  } catch { return { ...capabilityUnavailable }; }
}
function isMetadata(value: unknown): value is AiResponseMetadata {
  if (!record(value) || value.provider !== "openai" || typeof value.model !== "string" || !value.model.trim() || value.model.length > 200 || typeof value.prompt_version !== "string" || !value.prompt_version.trim() || value.prompt_version.length > 100 || typeof value.generated_at !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(value.generated_at) || !Number.isFinite(Date.parse(value.generated_at))) return false;
  if (!Number.isSafeInteger(value.attempts) || (value.attempts as number) < 1 || (value.attempts as number) > 2 || typeof value.latency_ms !== "number" || !Number.isFinite(value.latency_ms) || value.latency_ms < 0) return false;
  if (value.usage === null) return true;
  if (!record(value.usage)) return false;
  return ["input_tokens", "output_tokens", "total_tokens"].every(key => Number.isSafeInteger(value.usage && (value.usage as Record<string, unknown>)[key]) && (value.usage as Record<string, number>)[key] >= 0);
}

/** One explicit user-approved request; retries belong to the bounded server provider. */
export async function sendAiRequest(options: AiRequestOptions): Promise<AiClientResult> {
  const { signal, isCurrent } = options;
  if (signal?.aborted) return { status: "cancelled" };
  if (!isCurrent()) return { status: "stale" };
  const payload = structuredClone(options.payload);
  if (options.consentBinding !== createAiConsentBinding(payload, options.revision)) return { status: "fallback", reason: "CONSENT_REQUIRED" };
  const body = JSON.stringify(createAiRequestBody(payload));
  if (new TextEncoder().encode(body).byteLength > 64 * 1024) return { status: "fallback", reason: "INPUT_TOO_LARGE" };
  const controller = new AbortController();
  let cancelled = false;
  let timedOut = false;
  let finishInterrupt!: (result: AiClientResult) => void;
  const interrupted = new Promise<AiClientResult>(resolve => { finishInterrupt = resolve; });
  const abort = () => { cancelled = true; controller.abort(); finishInterrupt({ status: "cancelled" }); };
  signal?.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(() => { timedOut = true; controller.abort(); finishInterrupt({ status: "fallback", reason: "TIMEOUT" }); }, options.timeoutMs ?? 35_000);
  async function receive(): Promise<AiClientResult> {
    try {
      const response = await (options.fetcher ?? fetch)("/api/insights", { method: "POST", headers: { "Content-Type": "application/json" }, body, cache: "no-store", signal: controller.signal });
      if (cancelled) return { status: "cancelled" };
      if (timedOut) return { status: "fallback", reason: "TIMEOUT" };
      if (!isCurrent()) return { status: "stale" };
      if (response.status === 429 || response.status === 413) return { status: "fallback", reason: response.status === 429 ? "RATE_LIMIT" : "INPUT_TOO_LARGE" };
      let raw: unknown;
      try {
        const text = await response.text();
        if (new TextEncoder().encode(text).byteLength > 128 * 1024) return { status: "fallback", reason: "INVALID_RESPONSE" };
        raw = JSON.parse(text);
      } catch { return { status: "fallback", reason: response.ok ? "INVALID_RESPONSE" : "PROVIDER_ERROR" }; }
      if (cancelled) return { status: "cancelled" };
      if (timedOut) return { status: "fallback", reason: "TIMEOUT" };
      if (!isCurrent()) return { status: "stale" };
      // Config gates run before the server reads a body, so this bounded family
      // legitimately has no snapshot ID. Never apply this exception to live
      // output, a mismatched non-null ID, or a model/content validation failure.
      if (record(raw) && raw.status === "fallback" && raw.snapshot_id === null && typeof raw.reason === "string" && CONFIG_GATE_REASONS.has(raw.reason)) return { status: "fallback", reason: raw.reason };
      if (!response.ok) return { status: "fallback", reason: "PROVIDER_ERROR" };
      if (!record(raw) || (raw.status !== "live" && raw.status !== "fallback")) return { status: "fallback", reason: "INVALID_RESPONSE" };
      if (raw.snapshot_id !== payload.snapshot_id) return { status: "fallback", reason: "SNAPSHOT_MISMATCH" };
      if (raw.status === "fallback") return { status: "fallback", reason: safeReason(raw.reason) };
      if (!isMetadata(raw.metadata) || !record(raw.output)) return { status: "fallback", reason: "INVALID_RESPONSE" };
      let output: InsightOutput;
      try {
        const checked = validateInsightOutput(raw.output, payload);
        if (!checked.ok) return { status: "fallback", reason: "SEMANTIC_ERROR" };
        output = renderInsightOutput(checked.output, payload);
      } catch { return { status: "fallback", reason: "SEMANTIC_ERROR" }; }
      if (!isCurrent()) return { status: "stale" };
      const metadata: AiResponseMetadata = { provider: "openai", model: raw.metadata.model, prompt_version: raw.metadata.prompt_version, generated_at: raw.metadata.generated_at, attempts: raw.metadata.attempts, latency_ms: raw.metadata.latency_ms, usage: raw.metadata.usage === null ? null : { input_tokens: raw.metadata.usage.input_tokens, output_tokens: raw.metadata.usage.output_tokens, total_tokens: raw.metadata.usage.total_tokens } };
      return { status: "live", snapshot_id: payload.snapshot_id, output, metadata };
    } catch {
      if (cancelled) return { status: "cancelled" };
      if (timedOut) return { status: "fallback", reason: "TIMEOUT" };
      if (!isCurrent()) return { status: "stale" };
      return { status: "fallback", reason: "NETWORK_ERROR" };
    }
  }
  try { return await Promise.race([receive(), interrupted]); }
  finally { clearTimeout(timeout); signal?.removeEventListener("abort", abort); }
}

export function aiReasonMessage(reason: string): string {
  const messages: Record<string, string> = labels.shell.ai.client.reasons;
  return (Object.hasOwn(messages, reason) ? messages[reason] : undefined) ?? labels.shell.ai.client.reasonFallback;
}
