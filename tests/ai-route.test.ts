import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/insights/route";
import { AiProviderError } from "@/ai/provider";
import { serverOutput, serverSnapshot } from "./helpers/ai-server";

const { createProvider, generate } = vi.hoisted(() => ({ createProvider: vi.fn(), generate: vi.fn() }));
vi.mock("@/ai/openai-provider", () => ({ createOpenAiProvider: createProvider }));
const usage = { input_tokens: 12, output_tokens: 24, total_tokens: 36 };
const secret = "sk-ROUTE-TEST-NEVER-LIVE";
let audit: ReturnType<typeof vi.spyOn>;
let network: ReturnType<typeof vi.fn>;

function envelope() {
  const snapshot = serverSnapshot();
  return { snapshot, consent: { snapshot_id: snapshot.snapshot_id, accepted: true, recipient: "openai" } };
}
function request(body: unknown = envelope(), init: RequestInit = {}, url = "http://127.0.0.1:3000/api/insights"): Request {
  const headers = new Headers({ "Content-Type": "application/json", Origin: new URL(url).origin });
  new Headers(init.headers).forEach((value, key) => headers.set(key, value));
  return new Request(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), ...init,
    headers,
  });
}
async function expectFallback(input: Request, reason: string, status: number) {
  const result = await POST(input);
  expect(result.status).toBe(status);
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(result.headers.get("x-content-type-options")).toBe("nosniff");
  const body = await result.json();
  expect(body).toMatchObject({ status: "fallback", reason });
  expect(body).not.toHaveProperty("output");
  return body;
}
beforeEach(() => {
  vi.stubEnv("APP_MODE", "LOCAL"); vi.stubEnv("PUBLIC_DEMO", "false"); vi.stubEnv("ENABLE_LIVE_AI", "true");
  vi.stubEnv("OPENAI_API_KEY", secret); vi.stubEnv("OPENAI_MODEL", "unit-test-model");
  createProvider.mockReset().mockReturnValue({ generate });
  generate.mockReset().mockResolvedValue({ status: "completed", output: serverOutput(), usage });
  audit = vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  network = vi.fn(() => { throw new Error("REAL_NETWORK_FORBIDDEN_IN_ROUTE_TEST"); });
  vi.stubGlobal("fetch", network);
});
afterEach(() => {
  expect(network).not.toHaveBeenCalled();
  vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals();
});

describe("actual insights route gates with permanently mocked provider", () => {
  it("PUBLIC_DEMO rejects POST before reading the body or constructing a provider", async () => {
    vi.stubEnv("APP_MODE", "PUBLIC_DEMO");
    const input = request("untrusted-body");
    const bodyGetter = vi.fn(() => { throw new Error("BODY_MUST_NOT_BE_READ"); });
    Object.defineProperty(input, "body", { get: bodyGetter });
    expect(await expectFallback(input, "PUBLIC_DEMO", 403)).toEqual({ status: "fallback", snapshot_id: null, reason: "PUBLIC_DEMO" });
    expect(bodyGetter).not.toHaveBeenCalled(); expect(createProvider).not.toHaveBeenCalled(); expect(audit).not.toHaveBeenCalled();
    const status = await GET(new Request("http://127.0.0.1:3000/api/insights"));
    expect(await status.json()).toEqual({ available: false, reason: "PUBLIC_DEMO", provider: "openai" });
  });
  it("PUBLIC_DEMO=true also overrides otherwise enabled local configuration", async () => {
    vi.stubEnv("PUBLIC_DEMO", "true");
    await expectFallback(request(), "PUBLIC_DEMO", 403);
    expect(createProvider).not.toHaveBeenCalled();
  });
  it.each([["ENABLE_LIVE_AI", "false", "DISABLED"], ["OPENAI_API_KEY", "", "NO_KEY"], ["OPENAI_MODEL", "", "NO_MODEL"], ["OPENAI_MODEL", "sk-accidental-secret", "INVALID_CONFIG"]] as const)("%s=%s disables both route methods without body disclosure", async (key, value, reason) => {
    vi.stubEnv(key, value);
    const input = request("raw-private-data");
    const bodyGetter = vi.fn(() => { throw new Error("BODY_MUST_NOT_BE_READ"); });
    Object.defineProperty(input, "body", { get: bodyGetter });
    const fallback = await expectFallback(input, reason, 200);
    expect(bodyGetter).not.toHaveBeenCalled(); expect(createProvider).not.toHaveBeenCalled();
    const status = await GET(new Request("http://127.0.0.1:3000/api/insights"));
    expect(await status.json()).toEqual({ available: false, reason, provider: "openai" });
    expect(JSON.stringify(fallback)).not.toMatch(/sk-|raw-private|unit-test-model/);
  });
  it("GET returns only public capability and never the configured key or model", async () => {
    const result = await GET(new Request("http://127.0.0.1:3000/api/insights"));
    expect(await result.json()).toEqual({ available: true, reason: null, provider: "openai" });
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(createProvider).not.toHaveBeenCalled(); expect(audit).not.toHaveBeenCalled();
  });
  it.each([
    ["http://remote.invalid/api/insights", "http://remote.invalid", "remote.invalid"],
    ["http://127.0.0.1:3000/api/insights", "https://evil.invalid", "127.0.0.1:3000"],
    ["http://127.0.0.1:3000/api/insights", "http://127.0.0.1:3001", "127.0.0.1:3000"],
    ["http://127.0.0.1:3000/api/insights", "null", "127.0.0.1:3000"],
    ["http://127.0.0.1:3000/api/insights", "http://127.0.0.1:3000", "remote.invalid"],
  ])("rejects remote origin/host boundary %s %s %s before body read", async (url, origin, host) => {
    const input = request({}, { headers: { Origin: origin, Host: host } }, url);
    const bodyGetter = vi.fn(() => { throw new Error("BODY_MUST_NOT_BE_READ"); });
    Object.defineProperty(input, "body", { get: bodyGetter });
    await expectFallback(input, "LOCAL_ONLY", 403);
    expect(bodyGetter).not.toHaveBeenCalled(); expect(createProvider).not.toHaveBeenCalled();
  });
  it("rejects missing POST Origin and does not trust forwarded loopback headers", async () => {
    const noOrigin = request(); noOrigin.headers.delete("origin");
    await expectFallback(noOrigin, "LOCAL_ONLY", 403);
    await expectFallback(request({}, { headers: { "X-Forwarded-Host": "127.0.0.1:3000", "X-Forwarded-For": "127.0.0.1" } }, "https://remote.invalid/api/insights"), "LOCAL_ONLY", 403);
    const result = await GET(new Request("https://remote.invalid/api/insights"));
    expect(await result.json()).toEqual({ available: false, reason: "LOCAL_ONLY", provider: "openai" });
    expect(createProvider).not.toHaveBeenCalled();
  });
});

describe("strict bounded request body and consent", () => {
  it.each(["text/plain", "text/csv", "application/x-www-form-urlencoded"])("rejects content type %s", async type => {
    await expectFallback(request({}, { headers: { "Content-Type": type } }), "INVALID_REQUEST", 415);
    expect(createProvider).not.toHaveBeenCalled();
  });
  it("rejects invalid JSON, empty input and invalid UTF-8 without echoing bytes", async () => {
    for (const body of ["{broken-private", "", new Uint8Array([0xc3, 0x28])]) {
      const input = typeof body === "string" ? request(body) : new Request("http://127.0.0.1:3000/api/insights", { method: "POST", body, headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3000" } });
      const fallback = await expectFallback(input, "INVALID_REQUEST", 400);
      expect(JSON.stringify(fallback)).not.toContain("private");
    }
    expect(createProvider).not.toHaveBeenCalled();
  });
  it("requires consent matching this snapshot exactly", async () => {
    await expectFallback(request({ snapshot: serverSnapshot() }), "CONSENT_REQUIRED", 400);
    const wrong = envelope(); wrong.consent.snapshot_id = "other-snapshot";
    await expectFallback(request(wrong), "CONSENT_REQUIRED", 400);
    expect(createProvider).not.toHaveBeenCalled();
  });
  it.each([{ accepted: false }, { accepted: "true" }, { recipient: "other-provider" }, { raw_note: "send-private-data" }])("rejects non-contract consent %j", async patch => {
    const input = envelope();
    await expectFallback(request({ ...input, consent: { ...input.consent, ...patch } }), "INVALID_REQUEST", 400);
    expect(createProvider).not.toHaveBeenCalled();
  });
  it.each(["raw_csv", "customer_email", "prompt", "source_filename"])("rejects extra top-level %s before provider construction", async field => {
    await expectFallback(request({ ...envelope(), [field]: "PRIVATE_OR_PROMPT_INJECTION" }), "INVALID_REQUEST", 400);
    expect(createProvider).not.toHaveBeenCalled();
  });
  it("rejects raw extra fields anywhere in snapshot, facts, sources and filters", async () => {
    for (const scope of ["snapshot", "fact", "source", "filters"]) {
      const input = envelope();
      if (scope === "snapshot") Object.assign(input.snapshot, { raw_csv: "private" });
      if (scope === "fact") Object.assign(input.snapshot.facts[0], { sku: "private" });
      if (scope === "source") Object.assign(input.snapshot.facts[0].source_refs[0], { file: "orders-private.csv" });
      if (scope === "filters") Object.assign(input.snapshot.filters, { raw_channel: "private" });
      await expectFallback(request(input), "INVALID_REQUEST", 400);
    }
    expect(createProvider).not.toHaveBeenCalled();
  });
  it.each(["65537", "NaN", "-1", "1.5"])("rejects invalid or excessive declared byte length %s before body read", async length => {
    const input = request({}, { headers: { "Content-Length": length } });
    const bodyGetter = vi.fn(() => { throw new Error("BODY_MUST_NOT_BE_READ"); });
    Object.defineProperty(input, "body", { get: bodyGetter });
    await expectFallback(input, "INPUT_TOO_LARGE", 413);
    expect(bodyGetter).not.toHaveBeenCalled(); expect(createProvider).not.toHaveBeenCalled();
  });
  it("bounds actual streamed UTF-8 bytes even with no or misleading length", async () => {
    await expectFallback(request(`"${"你".repeat(22_000)}"`, { headers: { "Content-Length": "1" } }), "INPUT_TOO_LARGE", 413);
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(40_000)); controller.enqueue(new Uint8Array(26_000)); }, cancel });
    const input = new Request("http://127.0.0.1:3000/api/insights", { method: "POST", body: stream, duplex: "half", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3000" } } as RequestInit & { duplex: "half" });
    await expectFallback(input, "INPUT_TOO_LARGE", 413);
    expect(cancel).toHaveBeenCalledOnce(); expect(createProvider).not.toHaveBeenCalled();
  });
  it("accepts a valid JSON body at the inclusive 65536-byte boundary", async () => {
    const original = JSON.stringify(envelope());
    const exact = original + " ".repeat(65_536 - new TextEncoder().encode(original).byteLength);
    const result = await POST(request(exact, { headers: { "Content-Length": "65536", "Content-Type": "application/json; charset=utf-8" } }));
    expect(result.status).toBe(200);
    expect(await result.json()).toMatchObject({ status: "live" });
    expect(generate).toHaveBeenCalledOnce();
  });
});

describe("route success, cancellation and non-content logs with mocked model", () => {
  it("passes only the schema-approved aggregate snapshot into the mock provider", async () => {
    const result = await POST(request());
    const body = await result.json();
    expect(body).toMatchObject({ status: "live", snapshot_id: serverSnapshot().snapshot_id, output: serverOutput(), metadata: { provider: "openai", model: "unit-test-model", attempts: 1, usage } });
    expect(createProvider).toHaveBeenCalledOnce(); expect(generate).toHaveBeenCalledOnce();
    expect(generate.mock.calls[0][0]).toEqual(serverSnapshot());
    expect(generate.mock.calls[0][1]).toMatchObject({ repair: false });
    expect(JSON.stringify(generate.mock.calls[0][0])).not.toMatch(/DTC|MARKETPLACE|sales_daily\.csv|sku|raw_csv|customer_email/);
    expect(result.headers.get("cache-control")).toBe("no-store");
  });
  it("rejects pre-aborted requests before constructing the mock provider", async () => {
    const abort = new AbortController(); abort.abort();
    const result = await POST(request(envelope(), { signal: abort.signal }));
    expect(await result.json()).toMatchObject({ status: "fallback", reason: "ABORTED", metadata: { attempts: 0 } });
    expect(createProvider).not.toHaveBeenCalled();
  });
  it("keeps output validation and the one-repair maximum on real POST", async () => {
    generate.mockResolvedValue({ status: "completed", output: { unsupported: "secret text" }, usage });
    const result = await POST(request());
    const body = await result.json();
    expect(body).toMatchObject({ status: "fallback", reason: "SCHEMA_ERROR", metadata: { attempts: 2 } });
    expect(body).not.toHaveProperty("output"); expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls.map(call => call[1].repair)).toEqual([false, true]);
  });
  it("provider error text never appears in response or bounded audit logs", async () => {
    generate.mockRejectedValue(new Error(`${secret} customer@example.invalid RAW_ORDER_DATA`));
    const result = await POST(request());
    const body = await result.json();
    expect(body).toMatchObject({ status: "fallback", reason: "PROVIDER_ERROR", metadata: { attempts: 1 } });
    expect(audit).toHaveBeenCalledOnce();
    const records = audit.mock.calls.map((call: unknown[]) => JSON.parse(String(call[0])));
    expect(Object.keys(records[0]).sort()).toEqual(["attempts", "error_code", "event", "generated_at", "latency_ms", "model", "prompt_version", "provider", "status", "usage"].sort());
    expect(JSON.stringify([body, records])).not.toMatch(/sk-|customer@|RAW_ORDER|facts|fact_ids|observation|source_refs/);
    expect(console.error).not.toHaveBeenCalled(); expect(console.warn).not.toHaveBeenCalled();
  });
  it("returns a bounded rate-limit fallback without network retry", async () => {
    generate.mockRejectedValue(new AiProviderError("RATE_LIMIT"));
    const result = await POST(request());
    expect(await result.json()).toMatchObject({ status: "fallback", reason: "RATE_LIMIT", metadata: { attempts: 1 } });
    expect(generate).toHaveBeenCalledOnce();
  });
});
