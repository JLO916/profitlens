import { afterEach, describe, expect, it, vi } from "vitest";
import { runInsights, type AuditRecord } from "@/ai/service";
import { AiProviderError, type AiProvider, type AiProviderReply } from "@/ai/provider";
import { serverSnapshot, serverOutput } from "./helpers/ai-server";

const config = { available: true as const, apiKey: "sk-TEST-NEVER-LIVE", model: "unit-test-model", timeoutMs: 20, maxOutputTokens: 4096 };
const usage = { input_tokens: 30, output_tokens: 50, total_tokens: 80 };
const provider = (reply: AiProviderReply) => ({ generate: vi.fn<AiProvider["generate"]>().mockResolvedValue(reply) });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
describe("M5 provider orchestration with injected mocks only", () => {
  it.each(["NO_KEY", "NO_MODEL", "DISABLED", "PUBLIC_DEMO", "INVALID_CONFIG"] as const)("%s skips every provider call and returns explicit rules fallback", async reason => {
    const mock = provider({ status: "refused", usage: null });
    const result = await runInsights(serverSnapshot(), { available: false, reason }, { provider: mock, audit: vi.fn() });
    expect(result).toMatchObject({ status: "fallback", reason, metadata: { attempts: 0, model: null, usage: null } }); expect(mock.generate).not.toHaveBeenCalled();
  });
  it("accepts only grounded structured output and records bounded non-content metadata", async () => {
    const s = serverSnapshot(), output = serverOutput(s), mock = provider({ status: "completed", output, usage });
    const records: AuditRecord[] = [];
    const result = await runInsights(s, config, { provider: mock, audit: record => records.push(record) });
    expect(result).toMatchObject({ status: "live", snapshot_id: s.snapshot_id, output, metadata: { provider: "openai", model: config.model, prompt_version: "profitlens-insights-v2", attempts: 1, usage } });
    expect(records).toHaveLength(1); expect(records[0].latency_ms).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(records)).not.toMatch(/sk-TEST|2250|2470|fact_ids|observation|snapshot_id/);
  });
  it.each(["refused", "truncated"] as const)("%s response falls back without retry or partial rendering", async status => {
    const mock = provider({ status, usage });
    const result = await runInsights(serverSnapshot(), config, { provider: mock, audit: vi.fn() });
    expect(result).toMatchObject({ status: "fallback", reason: status === "refused" ? "REFUSED" : "TRUNCATED" });
    expect(result).not.toHaveProperty("output"); expect(mock.generate).toHaveBeenCalledTimes(1);
  });
  it.each(["RATE_LIMIT", "TIMEOUT", "PROVIDER_ERROR"] as const)("%s failure is safe and not retried", async code => {
    const generate = vi.fn<AiProvider["generate"]>().mockRejectedValue(new AiProviderError(code));
    expect(await runInsights(serverSnapshot(), config, { provider: { generate }, audit: vi.fn() })).toMatchObject({ status: "fallback", reason: code });
    expect(generate).toHaveBeenCalledTimes(1);
  });
  it("unknown exception does not leak key, raw rows, prompt or provider details", async () => {
    const records: AuditRecord[] = [], generate = vi.fn<AiProvider["generate"]>().mockRejectedValue(new Error("sk-TEST-NEVER-LIVE raw user@example.invalid"));
    const result = await runInsights(serverSnapshot(), config, { provider: { generate }, audit: record => records.push(record) });
    expect(result).toMatchObject({ status: "fallback", reason: "PROVIDER_ERROR" });
    expect(JSON.stringify([result, records])).not.toMatch(/sk-TEST|user@example|raw/);
  });
  it("schema failure retries once then succeeds with summed actual usage", async () => {
    const generate = vi.fn<AiProvider["generate"]>().mockResolvedValueOnce({ status: "completed", output: "{invalid", usage }).mockResolvedValueOnce({ status: "completed", output: serverOutput(), usage });
    const result = await runInsights(serverSnapshot(), config, { provider: { generate }, audit: vi.fn() });
    expect(result).toMatchObject({ status: "live", metadata: { attempts: 2, usage: { input_tokens: 60, output_tokens: 100, total_tokens: 160 } } });
    expect(generate.mock.calls.map(call => call[1].repair)).toEqual([false, true]);
    expect(generate.mock.calls[0][0]).toEqual(generate.mock.calls[1][0]);
  });
  it("second invalid schema stops after two attempts", async () => {
    const mock = provider({ status: "completed", output: { unknown: true }, usage });
    expect(await runInsights(serverSnapshot(), config, { provider: mock, audit: vi.fn() })).toMatchObject({ status: "fallback", reason: "SCHEMA_ERROR", metadata: { attempts: 2 } });
    expect(mock.generate).toHaveBeenCalledTimes(2);
  });
  it.each(["causal", "numeric", "wrong-reference", "stale"])("%s known invalid output is never rendered and gets at most one repair", async kind => {
    const output = serverOutput();
    if (kind === "causal") output.insights[0].observation = "廣告支出導致營收提升。";
    if (kind === "numeric") output.insights[0].recommended_action = "保證增加營收 999 元。";
    if (kind === "wrong-reference") output.insights[0].fact_ids = ["F999"];
    if (kind === "stale") output.snapshot_id = "old-snapshot";
    const mock = provider({ status: "completed", output, usage });
    const result = await runInsights(serverSnapshot(), config, { provider: mock, audit: vi.fn() });
    expect(result).toMatchObject({ status: "fallback", reason: "SEMANTIC_ERROR", metadata: { attempts: 2 } }); expect(result).not.toHaveProperty("output");
  });
  it("deadline aborts even a provider which never resolves", async () => {
    vi.useFakeTimers();
    const generate = vi.fn<AiProvider["generate"]>().mockImplementation(() => new Promise(() => {}));
    const pending = runInsights(serverSnapshot(), config, { provider: { generate }, audit: vi.fn() });
    await vi.advanceTimersByTimeAsync(21);
    expect(await pending).toMatchObject({ status: "fallback", reason: "TIMEOUT", metadata: { attempts: 1 } });
    expect(generate.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("cancelled request aborts provider and does not retry", async () => {
    const controller = new AbortController();
    const generate = vi.fn<AiProvider["generate"]>().mockImplementation(() => new Promise(() => {}));
    const pending = runInsights(serverSnapshot(), config, { provider: { generate }, signal: controller.signal, audit: vi.fn() });
    controller.abort();
    expect(await pending).toMatchObject({ status: "fallback", reason: "ABORTED" }); expect(generate.mock.calls[0][1].signal.aborted).toBe(true);
  });
  it("raw CSV/extra input fields never reach provider", async () => {
    const snapshot = { ...serverSnapshot(), raw_csv: "SECRET" };
    const mock = provider({ status: "refused", usage });
    expect(await runInsights(snapshot, config, { provider: mock, audit: vi.fn() })).toMatchObject({ status: "fallback", reason: "INVALID_REQUEST" }); expect(mock.generate).not.toHaveBeenCalled();
  });
});
