#!/usr/bin/env node
// V3-10 上線檢查（06_BATCHES V3-10「沿用 R7 的 13 項 HTTP 上線檢查」；docs/revamp/08_RELAUNCH.md §4 第 3 條、verification/deployment-acceptance.md）：verification/revamp-R7-smoke.py 的 Node 版（不加依賴，用內建 fetch），另加補充檢查。
//
// 13 項（與 R7 Python 腳本逐項相同，結果決定結束碼）：
//   1 GET / → 200 且 HTML 含 ProfitLens；
//   2–6 GET /api/datasets/{demo,golden,missing-cogs,missing-ad,duplicate} → 200、manifest.source_type=synthetic、manifest 與 fixtures/ 下的 manifest.json 深度相等、三份 CSV 的原始位元組與本機檔案全等（記 SHA-256）；
//   7 GET /api/insights → 200、available=false、reason=PUBLIC_DEMO；
//   8 POST /api/insights（空 JSON）→ 403、reason=PUBLIC_DEMO（伺服器在讀本文前就擋下，不建立 provider）；
//   9–13 GET /api/datasets/not-allowed、/.env、/.git/config、/verification/app-acceptance.md、/fixtures/golden/sales_daily.csv → 404。
// 補充（R7 checks.spec.ts 的 metadata／OG／icon／robots／sitemap 與標頭；不計入 13 項，失敗時結束碼 2）：
//   HTML lang／title／description／canonical／og:image；/robots.txt 指向 sitemap；/sitemap.xml 單一網址；og.png 1200×630；icon；
//   /api/* 的 Cache-Control: no-store；/api/insights 的 X-Content-Type-Options: nosniff；沒有 X-Powered-By；首頁引用的 /_next/static 腳本 200 且可長期快取（immutable）。
//   安全標頭（HSTS、CSP、X-Frame-Options、Referrer-Policy）只記錄現值、不判定（專案沒有設定，正式站由 Vercel 補 HSTS）。
//
// 用法（在 repo 根目錄執行；fixtures 以目前工作目錄的 fixtures/ 為準）：
//   node scripts/launch-check.mjs --base http://127.0.0.1:3100 --out verification/revamp-v3/V3-10/launch-check-local.json
//   node scripts/launch-check.mjs <out.json> <base>            （與 revamp-R7-smoke.py 相同的位置參數）
// 結束碼：0＝13 項與補充全部通過；1＝13 項有失敗；2＝13 項通過但補充有失敗。
// 注意：對 next dev 跑只能驗證腳本本身（dev 的快取標頭、/_next/static 路徑與正式產物不同）；上線判定一律對 production（next start 或正式站）。
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { isDeepStrictEqual } from "node:util";

const args = process.argv.slice(2);
const option = (name) => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : undefined; };
const positional = args.filter((value, index) => !value.startsWith("--") && !(index > 0 && args[index - 1].startsWith("--")));
const base = (option("--base") ?? positional[1] ?? "https://profitlens-tau.vercel.app").replace(/\/$/, "");
const out = option("--out") ?? positional[0] ?? null;
const fixturesRoot = resolve(option("--fixtures") ?? "fixtures");
const SITE_URL = "https://profitlens-tau.vercel.app";
const TIMEOUT_MS = 30_000;

const checks = [];
const extras = [];
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

/** 一次請求：回傳狀態、標頭與本文（Buffer）；網路錯誤記為 status null。 */
async function request(path, { method = "GET", body } = {}) {
  try {
    const response = await fetch(base + path, { method, body, headers: body === undefined ? {} : { "Content-Type": "application/json" }, redirect: "follow", signal: AbortSignal.timeout(TIMEOUT_MS) });
    const bytes = Buffer.from(await response.arrayBuffer());
    return { status: response.status, headers: response.headers, bytes, error: null };
  } catch (error) {
    return { status: null, headers: new Headers(), bytes: Buffer.alloc(0), error: String(error?.message ?? error) };
  }
}
const record = (list, path, method, response, extra) => {
  const item = { path, method, status: response.status, cache_control: response.headers.get("cache-control"), content_type: response.headers.get("content-type"), ...(response.error ? { error: response.error } : {}), ...extra };
  list.push(item);
  return item;
};
const json = (response) => { try { return JSON.parse(response.bytes.toString("utf8")); } catch { return null; } };

// ── 13 項 ──
{
  const response = await request("/");
  record(checks, "/", "GET", response, { pass: response.status === 200 && response.bytes.toString("utf8").includes("ProfitLens") });
}
for (const [name, folder] of [["demo", "demo"], ["golden", "golden"], ["missing-cogs", "errors/missing_cogs"], ["missing-ad", "errors/missing_ad_day"], ["duplicate", "errors/duplicate_sales_key"]]) {
  const response = await request(`/api/datasets/${name}`);
  const data = json(response) ?? {};
  const root = join(fixturesRoot, folder);
  const files = data.files ?? {};
  const csvMatches = Object.fromEntries(Object.entries(files).map(([file, text]) => [file, Buffer.from(String(text), "utf8").equals(readFileSync(join(root, file)))]));
  const synthetic = data.manifest?.source_type === "synthetic";
  const manifestMatches = isDeepStrictEqual(data.manifest, JSON.parse(readFileSync(join(root, "manifest.json"), "utf8")));
  record(checks, `/api/datasets/${name}`, "GET", response, {
    synthetic, manifest_matches_local: manifestMatches, csv_matches_local: csvMatches,
    csv_sha256: Object.fromEntries(Object.entries(files).map(([file, text]) => [file, sha256(Buffer.from(String(text), "utf8"))])),
    pass: response.status === 200 && synthetic && manifestMatches && Object.keys(csvMatches).length === 3 && Object.values(csvMatches).every(Boolean),
  });
}
{
  const response = await request("/api/insights");
  const body = json(response);
  record(checks, "/api/insights", "GET", response, { body, pass: response.status === 200 && body?.reason === "PUBLIC_DEMO" && body?.available === false });
}
{
  const response = await request("/api/insights", { method: "POST", body: "{}" });
  const body = json(response);
  record(checks, "/api/insights", "POST", response, { body, pass: response.status === 403 && body?.reason === "PUBLIC_DEMO" });
}
for (const path of ["/api/datasets/not-allowed", "/.env", "/.git/config", "/verification/app-acceptance.md", "/fixtures/golden/sales_daily.csv"]) {
  const response = await request(path);
  record(checks, path, "GET", response, { pass: response.status === 404 });
}

// ── 補充 ──
const home = await request("/");
const html = home.bytes.toString("utf8");
const meta = (attr, name) => html.match(new RegExp(`<meta[^>]*${attr}="${name}"[^>]*content="([^"]*)"`))?.[1] ?? html.match(new RegExp(`<meta[^>]*content="([^"]*)"[^>]*${attr}="${name}"`))?.[1] ?? null;
{
  const tags = {
    lang: html.match(/<html[^>]*lang="([^"]*)"/)?.[1] ?? null, title: html.match(/<title>([^<]*)<\/title>/)?.[1] ?? null, description: meta("name", "description"),
    canonical: html.match(/<link[^>]*rel="canonical"[^>]*href="([^"]*)"/)?.[1] ?? null, og_image: meta("property", "og:image"), og_title: meta("property", "og:title"), twitter_card: meta("name", "twitter:card"),
    icon: html.match(/<link[^>]*rel="icon"[^>]*href="([^"]*)"/)?.[1] ?? null,
  };
  extras.push({ name: "html-metadata", path: "/", status: home.status, tags, pass: home.status === 200 && Object.values(tags).every(Boolean) && tags.og_image.startsWith(SITE_URL) });
  if (tags.og_image) {
    const response = await request(new URL(tags.og_image).pathname);
    const png = response.bytes;
    const size = png.length >= 24 && png.subarray(1, 4).toString("latin1") === "PNG" ? { width: png.readUInt32BE(16), height: png.readUInt32BE(20) } : null;
    record(extras, new URL(tags.og_image).pathname, "GET", response, { name: "og-image", size, bytes: png.length, pass: response.status === 200 && (response.headers.get("content-type") ?? "").includes("image/png") && size?.width === 1200 && size?.height === 630 });
  }
  if (tags.icon) {
    const path = tags.icon.startsWith("http") ? new URL(tags.icon).pathname : tags.icon.split("?")[0];
    const response = await request(path);
    record(extras, path, "GET", response, { name: "icon", pass: response.status === 200 });
  }
}
{
  const robots = await request("/robots.txt");
  const text = robots.bytes.toString("utf8");
  record(extras, "/robots.txt", "GET", robots, { name: "robots", body: text, pass: robots.status === 200 && text.includes(`Sitemap: ${SITE_URL}/sitemap.xml`) });
  const sitemap = await request("/sitemap.xml");
  const xml = sitemap.bytes.toString("utf8");
  record(extras, "/sitemap.xml", "GET", sitemap, { name: "sitemap", urls: (xml.match(/<url>/g) ?? []).length, pass: sitemap.status === 200 && (xml.match(/<url>/g) ?? []).length === 1 && xml.includes(`<loc>${SITE_URL}`) });
}
{
  const apiNoStore = checks.filter(item => item.path.startsWith("/api/") && item.status !== null);
  extras.push({ name: "api-cache-control-no-store", paths: apiNoStore.map(item => `${item.method} ${item.path} → ${item.cache_control}`), pass: apiNoStore.length > 0 && apiNoStore.every(item => (item.cache_control ?? "").includes("no-store")) });
  const insights = await request("/api/insights");
  extras.push({ name: "insights-nosniff", path: "/api/insights", value: insights.headers.get("x-content-type-options"), pass: insights.headers.get("x-content-type-options") === "nosniff" });
  extras.push({ name: "no-x-powered-by", path: "/", value: home.headers.get("x-powered-by"), pass: home.headers.get("x-powered-by") === null });
  const security = Object.fromEntries(["strict-transport-security", "content-security-policy", "x-frame-options", "referrer-policy", "x-content-type-options", "permissions-policy"].map(name => [name, home.headers.get(name)]));
  extras.push({ name: "security-headers-recorded", path: "/", headers: security, pass: true, note: "只記錄現值、不判定（專案沒有設定安全標頭；正式站由 Vercel 補 HSTS）" });
  const scripts = [...html.matchAll(/<script[^>]*src="([^"]*\/_next\/static\/[^"]*)"/g)].map(match => match[1]);
  if (scripts.length) {
    const path = scripts[0].startsWith("http") ? new URL(scripts[0]).pathname : scripts[0];
    const response = await request(path);
    record(extras, path, "GET", response, { name: "static-asset", scripts_on_home: scripts.length, bytes: response.bytes.length, pass: response.status === 200 && (response.headers.get("cache-control") ?? "").includes("immutable") });
  } else extras.push({ name: "static-asset", path: null, pass: false, note: "首頁沒有引用 /_next/static 腳本" });
}

const output = {
  checked_at: new Date().toISOString(), url: base, script: "scripts/launch-check.mjs", fixtures_root: fixturesRoot,
  note: /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(base) ? "本機伺服器：next start（PUBLIC_DEMO 設定）才是上線判定；對 next dev 跑只驗證腳本（快取標頭與 /_next/static 不同）" : "遠端網址",
  checks, all_passed: checks.length === 13 && checks.every(item => item.pass), extras, extras_passed: extras.every(item => item.pass), live_ai_called: false,
};
if (out) {
  await mkdir(dirname(resolve(out)), { recursive: true });
  await writeFile(resolve(out), `${JSON.stringify(output, null, 2)}\n`);
}
const line = (item, index) => {
  const target = item.path ? `${item.method ?? "GET"} ${item.path} → ${item.status ?? item.value ?? "—"}` : (item.paths ?? []).join("；");
  return `${item.pass ? "PASS" : "FAIL"}  ${String(index + 1).padStart(2)}  ${item.name ? `${item.name}：` : ""}${target}${item.note ? `（${item.note}）` : ""}`;
};
console.log(`EC ProfitLens 上線檢查：${base}`);
console.log(`13 項：${checks.filter(item => item.pass).length}/${checks.length} 通過`);
checks.forEach((item, index) => console.log(line(item, index)));
console.log(`補充：${extras.filter(item => item.pass).length}/${extras.length} 通過`);
extras.forEach((item, index) => console.log(line(item, index)));
if (out) console.log(`JSON：${resolve(out)}`);
process.exitCode = !output.all_passed ? 1 : !output.extras_passed ? 2 : 0;
