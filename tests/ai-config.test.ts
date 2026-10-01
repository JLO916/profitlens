import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { readAiConfig, isLocalRequest } from "@/ai/config";

const enabled = { ENABLE_LIVE_AI: "true", OPENAI_API_KEY: "test-only-secret", OPENAI_MODEL: "configured-structured-model" };
describe("M5 opt-in server configuration", () => {
  it("defaults disabled without reading/returning secrets", () => expect(readAiConfig({})).toEqual({ available: false, reason: "DISABLED" }));
  it("PUBLIC_DEMO overrides enabled/key/model", () => expect(readAiConfig({ ...enabled, APP_MODE: "PUBLIC_DEMO" })).toEqual({ available: false, reason: "PUBLIC_DEMO" }));
  it("PUBLIC_DEMO=true also blocks the backend", () => expect(readAiConfig({ ...enabled, PUBLIC_DEMO: "true" })).toEqual({ available: false, reason: "PUBLIC_DEMO" }));
  it("rejects missing key without asking for one in UI", () => expect(readAiConfig({ ...enabled, OPENAI_API_KEY: " " })).toEqual({ available: false, reason: "NO_KEY" }));
  it("has no hardcoded model fallback", () => expect(readAiConfig({ ...enabled, OPENAI_MODEL: "" })).toEqual({ available: false, reason: "NO_MODEL" }));
  it("model comes only from server env with bounded output and timeout", () => expect(readAiConfig(enabled)).toEqual({ available: true, apiKey: "test-only-secret", model: "configured-structured-model", timeoutMs: 15000, maxOutputTokens: 4096 }));
  it.each(["true ", "TRUE", "1", "yes"])("opt-in is strict: %s does not enable", value => expect(readAiConfig({ ...enabled, ENABLE_LIVE_AI: value })).toEqual({ available: false, reason: "DISABLED" }));
  it.each(["PUBLIC", "production", "unknown"])("unknown APP_MODE %s is closed", APP_MODE => expect(readAiConfig({ ...enabled, APP_MODE })).toEqual({ available: false, reason: "INVALID_CONFIG" }));
  it("does not accept a key-shaped model string", () => expect(readAiConfig({ ...enabled, OPENAI_MODEL: "sk-not-a-model" })).toEqual({ available: false, reason: "INVALID_CONFIG" }));
});
describe("M5 localhost and same-origin boundary", () => {
  it.each(["http://127.0.0.1:3000", "http://localhost:3100", "http://[::1]:3000"])("permits explicit same origin %s", origin => expect(isLocalRequest(new Request(`${origin}/api/insights`, { headers: { Origin: origin } }), true)).toBe(true));
  it("status GET does not require Origin", () => expect(isLocalRequest(new Request("http://127.0.0.1:3000/api/insights"))).toBe(true));
  it.each(["https://attacker.invalid", "http://127.0.0.1:3001", "null", ""])("refuses cross-site/missing POST origin %s", origin => expect(isLocalRequest(new Request("http://127.0.0.1:3000/api/insights", { headers: { Origin: origin } }), true)).toBe(false));
  it("refuses public host even if its Origin matches", () => expect(isLocalRequest(new Request("https://profitlens.example/api/insights", { headers: { Origin: "https://profitlens.example" } }), true)).toBe(false));
  it("ignores attacker-controlled forwarded host and rejects remote Host header", () => expect(isLocalRequest(new Request("http://127.0.0.1:3000/api/insights", { headers: { Origin: "http://127.0.0.1:3000", Host: "attacker.invalid", "X-Forwarded-Host": "localhost" } }), true)).toBe(false));
});

describe("NextRequest normalization keeps the external Host/Origin boundary", () => {
  it.each(["127.0.0.1:3205", "[::1]:3205", "localhost:3205"])("permits actual NextRequest for %s after Next normalizes its URL", authority => {
    const externalOrigin = `http://${authority}`;
    const request = new NextRequest(`${externalOrigin}/api/insights`, { headers: { Host: authority, Origin: externalOrigin } });
    expect(request.url).toBe("http://localhost:3205/api/insights");
    expect(request.headers.get("host")).toBe(authority);
    expect(isLocalRequest(request)).toBe(true);
    expect(isLocalRequest(request, true)).toBe(true);
  });
  it("allows status GET without Origin using the real NextRequest Host", () => {
    const request = new NextRequest("http://127.0.0.1:3205/api/insights", { headers: { Host: "127.0.0.1:3205" } });
    expect(isLocalRequest(request)).toBe(true);
    expect(isLocalRequest(request, true)).toBe(false);
  });
  it.each([
    ["127.0.0.1:3205", "http://localhost:3205"],
    ["localhost:3205", "http://127.0.0.1:3205"],
    ["[::1]:3205", "http://127.0.0.1:3205"],
    ["127.0.0.1:3205", "http://127.0.0.1:3206"],
    ["127.0.0.1:3205", "https://127.0.0.1:3205"],
  ])("rejects Origin %s %s even when both names can resolve to loopback", (host, origin) => {
    const request = new NextRequest("http://127.0.0.1:3205/api/insights", { headers: { Host: host, Origin: origin } });
    expect(isLocalRequest(request, true)).toBe(false);
  });
  it.each([
    "127.0.0.1:3206", "localhost:3206", "[::1]:3206", "remote.invalid:3205", "127.0.0.2:3205", "127.1:3205",
    "user@localhost:3205", "localhost:3205/path", "localhost:3205?secret", "localhost:3205#fragment", "localhost:3205,remote.invalid",
    "local host:3205", "localhost:99999", "localhost:", "localhost:3205\\remote.invalid",
  ])("rejects malformed/nonlocal/mismatched-port Host %s", host => {
    const request = new NextRequest("http://127.0.0.1:3205/api/insights", { headers: { Host: host, Origin: `http://${host}`, "X-Forwarded-Host": "127.0.0.1:3205", "X-Forwarded-Proto": "http" } });
    expect(isLocalRequest(request)).toBe(false);
    expect(isLocalRequest(request, true)).toBe(false);
  });
  it("does not accept forwarded loopback metadata for a remote URL", () => {
    const request = new NextRequest("https://remote.invalid/api/insights", { headers: { Host: "127.0.0.1", Origin: "https://127.0.0.1", "X-Forwarded-Host": "localhost", "X-Forwarded-For": "127.0.0.1" } });
    expect(isLocalRequest(request, true)).toBe(false);
  });
  it("rejects credentials in the URL itself", () => {
    const request = { url: "http://user:password@localhost:3205/api/insights", headers: new Headers({ Host: "localhost:3205", Origin: "http://localhost:3205" }) } as Request;
    expect(isLocalRequest(request, true)).toBe(false);
  });
  it("treats default ports canonically but does not normalize a supplied Origin", () => {
    const request = new NextRequest("http://127.0.0.1:80/api/insights", { headers: { Host: "127.0.0.1:80", Origin: "http://127.0.0.1" } });
    expect(isLocalRequest(request, true)).toBe(true);
    request.headers.set("origin", "http://127.0.0.1:80");
    expect(isLocalRequest(request, true)).toBe(false);
  });
});
