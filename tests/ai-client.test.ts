import { beforeAll, describe, expect, it, vi } from "vitest";
import { aiReasonMessage, createAiConsentBinding, createAiRequestBody, getAiCapability, sendAiRequest } from "@/application/ai-client";
import type { AiSnapshot, InsightOutput } from "@/ai/contracts";
import { observationCatalog } from "@/ai/grounding";
import { prepareAiSnapshot } from "@/application/ai-snapshot";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";

// A minimal transport fixture suffices for preflight and fallback tests: no model
// response is allowed to reach grounding in these cases.
const payload = { snapshot_id: "snapshot-A" } as AiSnapshot;
const consent = () => createAiConsentBinding(payload, 1);
const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const request = (fetcher: typeof fetch, extras = {}) => sendAiRequest({ payload, revision: 1, consentBinding: consent(), isCurrent: () => true, fetcher, ...extras });

describe("AI client consent and freshness", () => {
  it("binds consent to exact payload and revision including identical-data reloads", () => {
    expect(consent()).toBe(createAiConsentBinding(payload, 1));
    expect(consent()).not.toBe(createAiConsentBinding(payload, 2));
    expect(consent()).not.toBe(createAiConsentBinding({ ...payload, snapshot_id: "snapshot-B" }, 1));
    expect(consent()).not.toBe(createAiConsentBinding({ ...payload, currency: "changed" } as unknown as AiSnapshot, 1));
  });
  it("only constructs the strict snapshot+consent envelope", () => {
    expect(createAiRequestBody(payload)).toEqual({ snapshot: payload, consent: { snapshot_id: "snapshot-A", accepted: true, recipient: "openai" } });
  });
  it.each([null, "older-consent"])("never calls fetch without matching consent %s", async consentBinding => {
    const fetcher = vi.fn();
    expect(await request(fetcher, { consentBinding })).toEqual({ status: "fallback", reason: "CONSENT_REQUIRED" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("never sends when request is already stale or cancelled", async () => {
    const fetcher = vi.fn();
    expect(await request(fetcher, { isCurrent: () => false })).toEqual({ status: "stale" });
    const abort = new AbortController(); abort.abort();
    expect(await request(fetcher, { signal: abort.signal })).toEqual({ status: "cancelled" });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("sends only the approved envelope via same-origin POST with no-store", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ status: "fallback", snapshot_id: payload.snapshot_id, reason: "NO_KEY" }));
    expect(await request(fetcher)).toEqual({ status: "fallback", reason: "NO_KEY" });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe("/api/insights");
    expect(init).toMatchObject({ method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" } });
    expect(JSON.parse(init.body)).toEqual(createAiRequestBody(payload));
  });
  it("discards a response that finishes after the current binding changes", async () => {
    let current = true;
    let release!: (response: Response) => void;
    const fetcher = vi.fn(() => new Promise<Response>(resolve => { release = resolve; }));
    const pending = request(fetcher, { isCurrent: () => current });
    current = false;
    release(response({ status: "fallback", snapshot_id: payload.snapshot_id, reason: "NO_KEY" }));
    expect(await pending).toEqual({ status: "stale" });
  });
  it("cancels even if a fetch implementation ignores its AbortSignal", async () => {
    const abort = new AbortController();
    const pending = request(vi.fn(() => new Promise<Response>(() => {})), { signal: abort.signal });
    abort.abort();
    expect(await pending).toEqual({ status: "cancelled" });
  });
});

describe("AI client safe fallbacks", () => {
  it("handles timeout without a provider retry or exposing raw errors", async () => {
    const fetcher = vi.fn(() => new Promise<Response>(() => {}));
    expect(await request(fetcher, { timeoutMs: 5 })).toEqual({ status: "fallback", reason: "TIMEOUT" });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([[429, "RATE_LIMIT"], [500, "PROVIDER_ERROR"], [413, "INPUT_TOO_LARGE"]] as const)("maps HTTP %s to safe reason %s", async (status, reason) => {
    expect(await request(vi.fn().mockResolvedValue(response({ secret: "must-never-render" }, status)))).toEqual({ status: "fallback", reason });
  });
  it("maps network and malformed JSON errors to fixed local explanations", async () => {
    expect(await request(vi.fn().mockRejectedValue(new Error("secret-key-provider-error")))).toEqual({ status: "fallback", reason: "NETWORK_ERROR" });
    expect(await request(vi.fn().mockResolvedValue(new Response("<html>secret</html>")))).toEqual({ status: "fallback", reason: "INVALID_RESPONSE" });
    expect(aiReasonMessage("secret-key-provider-error")).not.toContain("secret");
  });
  it("does not trust HTTP200 live flags with unrelated snapshot or absent output", async () => {
    expect(await request(vi.fn().mockResolvedValue(response({ status: "live", snapshot_id: "another" })))).toEqual({ status: "fallback", reason: "SNAPSHOT_MISMATCH" });
    expect(await request(vi.fn().mockResolvedValue(response({ status: "live", snapshot_id: payload.snapshot_id })))).toEqual({ status: "fallback", reason: "INVALID_RESPONSE" });
  });
  it("does not display arbitrary reason text from a server", async () => {
    expect(await request(vi.fn().mockResolvedValue(response({ status: "fallback", snapshot_id: payload.snapshot_id, reason: "<script>sk-secret</script>" })))).toEqual({ status: "fallback", reason: "PROVIDER_ERROR" });
  });
  it.each(["PUBLIC_DEMO", "DISABLED", "NO_KEY", "NO_MODEL", "LOCAL_ONLY", "INVALID_CONFIG"])("retains safe config reason %s if server closes access after preview", async reason => {
    const status = reason === "PUBLIC_DEMO" || reason === "LOCAL_ONLY" ? 403 : 200;
    expect(await request(vi.fn().mockResolvedValue(response({ status: "fallback", snapshot_id: null, reason }, status)))).toEqual({ status: "fallback", reason });
  });
  it.each([
    { status: "live", snapshot_id: null, reason: "NO_KEY" },
    { status: "fallback", snapshot_id: "another-snapshot", reason: "NO_KEY" },
    { status: "fallback", snapshot_id: null, reason: "SEMANTIC_ERROR" },
    { status: "fallback", snapshot_id: null, reason: "arbitrary-server-message" },
  ])("does not weaken snapshot binding for non-config response %j", async body => {
    expect(await request(vi.fn().mockResolvedValue(response(body)))).toEqual({ status: "fallback", reason: "SNAPSHOT_MISMATCH" });
  });
  it("reads config through GET without sending snapshot or looking for client keys", async () => {
    const fetcher = vi.fn().mockResolvedValue(response({ available: false, provider: "openai", reason: "NO_KEY" }));
    expect(await getAiCapability(fetcher)).toEqual({ available: false, provider: "openai", reason: "NO_KEY" });
    expect(fetcher.mock.calls[0][0]).toBe("/api/insights");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ method: "GET", cache: "no-store" });
    expect(fetcher.mock.calls[0][1]).not.toHaveProperty("body");
  });
  it("never enables sending on malformed or failed config responses", async () => {
    expect(await getAiCapability(vi.fn().mockResolvedValue(response({ available: "true", provider: "openai", reason: "OK" })))).toEqual({ available: false, provider: "openai", reason: "STATUS_UNAVAILABLE" });
    expect(await getAiCapability(vi.fn().mockRejectedValue(new Error("raw-secret")))).toEqual({ available: false, provider: "openai", reason: "STATUS_UNAVAILABLE" });
  });
  it("accepts the real enabled GET contract with null reason", async () => {
    expect(await getAiCapability(vi.fn().mockResolvedValue(response({ available: true, provider: "openai", reason: null })))).toEqual({ available: true, provider: "openai", reason: "AVAILABLE" });
  });
  it("refuses oversized approved body before any network call", async () => {
    const oversized = { ...payload, snapshot_id: "a".repeat(66_000) };
    const fetcher = vi.fn();
    expect(await sendAiRequest({ payload: oversized, revision: 1, consentBinding: createAiConsentBinding(oversized, 1), isCurrent: () => true, fetcher })).toEqual({ status: "fallback", reason: "INPUT_TOO_LARGE" });
    expect(fetcher).not.toHaveBeenCalled();
  });
});

describe("HTTP200 output is grounded again locally, with program-rendered numbers", () => {
  let snapshot: WorkspaceSnapshot;
  beforeAll(async () => {
    const input = fixture();
    snapshot = await createSnapshot(validateDataset(input).dataset!, {}, await hashInput(input));
  });
  const metadata = { provider: "openai", model: "unit-test-model", prompt_version: "profitlens-insights-v2", generated_at: "2026-10-01T08:00:00.000Z", attempts: 1, latency_ms: 10, usage: { input_tokens: 20, output_tokens: 30, total_tokens: 50 } };
  function setup() {
    const prepared = prepareAiSnapshot(snapshot, 1);
    const selected = observationCatalog(prepared.payload).find(entry => entry.kind === "value" && entry.fact_ids.some(id => prepared.payload.facts.find(fact => fact.id === id)?.metric === "contribution_after_marketing" && prepared.payload.facts.find(fact => fact.id === id)?.period === "current"))!;
    const output: InsightOutput = { snapshot_id: prepared.payload.snapshot_id, insights: [{ fact_ids: [...selected.fact_ids], observation: selected.observation, hypotheses: ["待驗證假說：商品組合可能改變，需核對來源。"], recommended_action: "核對收入與成本來源，確認商品組合是否改變。", owner_role: "營運與財務", verification_metric: "行銷後貢獻及來源完整性", stop_condition: "來源尚未確認時停止採用結論。", additional_data_needed: ["同範圍來源彙總"], limitations: ["原因仍待驗證，不代表因果關係。"] }], limitations: ["行銷後貢獻不是公司淨利。"] };
    const options = { payload: prepared.payload, revision: 1, consentBinding: createAiConsentBinding(prepared.payload, 1), isCurrent: () => true };
    return { prepared, output, options, envelope: { status: "live", snapshot_id: prepared.payload.snapshot_id, output, metadata } };
  }
  it("fills accepted fact placeholders with the fixed golden current contribution", async () => {
    const { options, envelope } = setup();
    const result = await sendAiRequest({ ...options, fetcher: vi.fn().mockResolvedValue(response(envelope)) });
    expect(result.status).toBe("live");
    if (result.status !== "live") throw new Error("Expected mock live envelope");
    expect(result.output.insights[0].observation).toContain("255.00");
    expect(result.output.insights[0].observation).not.toContain("{{fact:");
    expect(result.metadata).toEqual(metadata);
  });
  it.each(["numeric", "fact", "snapshot", "html"])("rejects unsafe %s output even when the server claims live success", async kind => {
    const { options, envelope } = setup();
    if (kind === "numeric") envelope.output.insights[0].observation = "當期行銷後貢獻為 999999.99。";
    if (kind === "fact") envelope.output.insights[0].fact_ids = ["F999"];
    if (kind === "snapshot") envelope.output.snapshot_id = "different-snapshot";
    if (kind === "html") envelope.output.insights[0].observation = "<img src=x onerror=alert(1)>";
    expect(await sendAiRequest({ ...options, fetcher: vi.fn().mockResolvedValue(response(envelope)) })).toEqual({ status: "fallback", reason: "SEMANTIC_ERROR" });
  });
  it("rejects fake or incomplete live metadata rather than display a live badge", async () => {
    const { options, envelope } = setup();
    expect(await sendAiRequest({ ...options, fetcher: vi.fn().mockResolvedValue(response({ ...envelope, metadata: { provider: "mock" } })) })).toEqual({ status: "fallback", reason: "INVALID_RESPONSE" });
  });
  it("drops a response if the snapshot changes while its JSON body is pending", async () => {
    const { options, envelope } = setup();
    let current = true;
    let release!: (body: string) => void;
    const received = response(null);
    vi.spyOn(received, "text").mockImplementation(() => new Promise(resolve => { release = resolve; }));
    const pending = sendAiRequest({ ...options, isCurrent: () => current, fetcher: vi.fn().mockResolvedValue(received) });
    await Promise.resolve();
    current = false;
    release(JSON.stringify(envelope));
    expect(await pending).toEqual({ status: "stale" });
  });
  it("uses the captured approved payload if the caller later mutates its local object", async () => {
    const { options, envelope } = setup();
    const result = await sendAiRequest({ ...options, fetcher: vi.fn(async () => {
      options.payload.facts.find(fact => fact.metric === "contribution_after_marketing" && fact.period === "current")!.value = "999999.00";
      return response(envelope);
    }) });
    expect(result.status).toBe("live");
    if (result.status === "live") expect(result.output.insights[0].observation).toContain("255.00");
  });
});
