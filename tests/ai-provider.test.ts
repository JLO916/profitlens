import { afterEach, describe, expect, it, vi } from "vitest";
import { createOpenAiProvider } from "@/ai/openai-provider";
import type { AiSnapshot } from "@/ai/contracts";

vi.mock("@/ai/grounding", () => ({ observationCatalog: () => [{ fact_ids: ["F001"], observation: "受限資料觀察", kind: "value" }] }));
const snapshot = { snapshot_id: `ai-v1:${"a".repeat(64)}:${"b".repeat(64)}:1`, facts: [] } as unknown as AiSnapshot;
const config = { available: true as const, apiKey: "sk-test-only-never-live", model: "server-configured-model", timeoutMs: 15000, maxOutputTokens: 4096 };
const usage = { input_tokens: 20, output_tokens: 40, total_tokens: 60 };
const fixture = (overrides: Record<string, unknown> = {}) => ({ id: "resp_mock", status: "completed", output: [{ type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text: '{"snapshot_id":"mock"}', annotations: [] }] }], usage, ...overrides });
const options = () => ({ signal: new AbortController().signal, repair: false });
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

describe("official OpenAI SDK transport mocked locally, never live", () => {
  it("uses Responses strict JSON Schema, env model, bounded output, no tools and no storage", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture()));
    const result = await createOpenAiProvider(config, transport).generate(snapshot, options());
    expect(result).toEqual({ status: "completed", output: { snapshot_id: "mock" }, usage });
    expect(transport).toHaveBeenCalledTimes(1);
    const [url, init] = transport.mock.calls[0];
    expect(String(url)).toBe("https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({ model: config.model, store: false, stream: false, max_output_tokens: 4096, tools: [], tool_choice: "none", text: { format: { type: "json_schema", name: "profitlens_insight_output", strict: true } } });
    expect(body.text.format.schema.required).toEqual(["snapshot_id", "insights", "limitations"]);
    expect(body.input).toHaveLength(1);
    expect(body.input[0].role).toBe("user");
    expect(JSON.parse(body.input[0].content).snapshot).toEqual(snapshot);
    expect(body.instructions).toContain("profitlens-insights-v2");
    expect(JSON.stringify(body)).not.toContain(config.apiKey);
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${config.apiKey}`);
  });
  it("never honors arbitrary OPENAI_BASE_URL or SDK debug logging", async () => {
    vi.stubEnv("OPENAI_BASE_URL", "https://unapproved.invalid"); vi.stubEnv("OPENAI_LOG", "debug");
    const logs = [vi.spyOn(console, "log"), vi.spyOn(console, "warn"), vi.spyOn(console, "error"), vi.spyOn(console, "debug")];
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture()));
    await createOpenAiProvider(config, transport).generate(snapshot, options());
    expect(String(transport.mock.calls[0][0])).toBe("https://api.openai.com/v1/responses");
    for (const log of logs) expect(log).not.toHaveBeenCalled();
  });
  it("classifies refusal without exposing refusal prose", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture({ output: [{ type: "message", content: [{ type: "refusal", refusal: "SECRET malicious refusal text" }] }] })));
    expect(await createOpenAiProvider(config, transport).generate(snapshot, options())).toEqual({ status: "refused", usage });
  });
  it("classifies incomplete/max tokens as truncation even with parseable partial JSON", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture({ status: "incomplete", incomplete_details: { reason: "max_output_tokens" } })));
    expect(await createOpenAiProvider(config, transport).generate(snapshot, options())).toEqual({ status: "truncated", usage });
  });
  it("returns malformed JSON as invalid raw data for bounded schema retry", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture({ output: [{ type: "message", content: [{ type: "output_text", text: "{bad" }] }] })));
    expect(await createOpenAiProvider(config, transport).generate(snapshot, options())).toEqual({ status: "completed", output: "{bad", usage });
  });
  it("429 is sanitized and SDK retries are disabled", async () => {
    const transport = vi.fn<typeof fetch>().mockImplementation(async () => Response.json({ error: { message: "PRIVATE ROW sk-test-only-never-live" } }, { status: 429 }));
    await expect(createOpenAiProvider(config, transport).generate(snapshot, options())).rejects.toMatchObject({ code: "RATE_LIMIT", message: "RATE_LIMIT" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("provider errors do not expose response body or key", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ error: { message: "PRIVATE ROW sk-test-only-never-live" } }, { status: 500 }));
    await expect(createOpenAiProvider(config, transport).generate(snapshot, options())).rejects.toMatchObject({ code: "PROVIDER_ERROR", message: "PROVIDER_ERROR" });
    expect(transport).toHaveBeenCalledTimes(1);
  });
  it("repair repeats only original facts with fixed repair instruction, no rejected output", async () => {
    const transport = vi.fn<typeof fetch>().mockResolvedValue(Response.json(fixture()));
    await createOpenAiProvider(config, transport).generate(snapshot, { ...options(), repair: true });
    const body = JSON.parse(String(transport.mock.calls[0][1]?.body));
    expect(body.instructions).toContain("重新產生一次"); expect(body.input).toHaveLength(1);
  });
});
