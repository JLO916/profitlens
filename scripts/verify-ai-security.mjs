// Local M6 acceptance only. Uses a visibly fake canary, never a user's API key.
import { readFile, readdir, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import assert from "node:assert/strict";

const canary = "sk-PROFITLENS-M6-NONSECRET-BUNDLE-CANARY";
async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(resolve(directory, entry.name)) : resolve(directory, entry.name)))).flat();
}
const staticFiles = await files(resolve(".next/static"));
assert(staticFiles.length > 0, "Run the production build first");
const violations = [];
for (const path of staticFiles) {
  const contents = await readFile(path);
  for (const pattern of [canary, "OPENAI_API_KEY", "OPENAI_MODEL", "dangerouslyAllowBrowser", "api.openai.com/v1"]) {
    if (contents.includes(Buffer.from(pattern))) violations.push({ path, pattern });
  }
}
assert.equal(violations.length, 0, "Secret or server-only SDK markers found in client assets");

const results = [];
const endpoint = "http://127.0.0.1:3205/api/insights";
for (const mode of ["PUBLIC_DEMO", "NO_KEY", "DISABLED", "NO_CONSENT"]) {
  let log = "";
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "3205"], {
    env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1", APP_MODE: mode === "PUBLIC_DEMO" ? "PUBLIC_DEMO" : "LOCAL", PUBLIC_DEMO: "false",
      ENABLE_LIVE_AI: mode === "DISABLED" ? "false" : "true", OPENAI_API_KEY: mode === "NO_KEY" ? "" : canary, OPENAI_MODEL: "verification-only-never-called" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", data => { log += data.toString(); });
  server.stderr.on("data", data => { log += data.toString(); });
  try {
    let capability;
    for (let attempt = 0; attempt < 100; attempt++) {
      if (server.exitCode !== null) throw new Error(`Local verification server exited: ${server.exitCode}`);
      try { capability = await fetch(endpoint, { signal: AbortSignal.timeout(500) }); break; }
      catch { await new Promise(resolve => setTimeout(resolve, 100)); }
    }
    assert(capability, "Local server did not become ready");
    const getBody = await capability.json();
    assert.deepEqual(getBody, { available: mode === "NO_CONSENT", reason: mode === "NO_CONSENT" ? null : mode, provider: "openai" });
    // Invalid/unapproved body proves the mode gate precedes parsing and any provider creation.
    const response = await fetch(endpoint, { method: "POST", body: mode === "NO_CONSENT" ? JSON.stringify({ snapshot: {} }) : "deliberately invalid JSON", headers: { "Content-Type": "application/json", Origin: "http://127.0.0.1:3205" } });
    const postBody = await response.json();
    assert.equal(response.status, mode === "PUBLIC_DEMO" ? 403 : mode === "NO_CONSENT" ? 400 : 200);
    assert.deepEqual(postBody, { status: "fallback", snapshot_id: null, reason: mode === "NO_CONSENT" ? "CONSENT_REQUIRED" : mode });
    assert.equal(response.headers.get("cache-control"), "no-store");
    results.push({ mode, get_status: capability.status, get_body: getBody, post_status: response.status, post_body: postBody, cache_control: response.headers.get("cache-control") });
  } finally {
    if (server.exitCode === null) { const stopped = once(server, "exit"); server.kill("SIGTERM"); await stopped; }
  }
  assert(!log.includes(canary), "Canary leaked into server logs");
  assert(!log.includes("profitlens_ai"), "Disabled endpoint unexpectedly reached model orchestration");
}
const report = { recorded_at: new Date().toISOString(), mode: "production_build_local_http_no_live_call", static_assets_scanned: staticFiles.length,
  canary_is_fake: true, build_canary_source: "playwright.config.ts webServer.env (live disabled)", static_violations: violations,
  secret_in_server_logs: false, live_tests: "未執行", endpoints: results };
await writeFile("verification/m6-security.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
