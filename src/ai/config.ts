import "server-only";

export type ConfigReason = "PUBLIC_DEMO" | "DISABLED" | "NO_KEY" | "NO_MODEL" | "INVALID_CONFIG";
export type AiConfig = { available: true; apiKey: string; model: string; timeoutMs: number; maxOutputTokens: number } | { available: false; reason: ConfigReason };
export function readAiConfig(env: Record<string, string | undefined> = process.env): AiConfig {
  if (env.APP_MODE === "PUBLIC_DEMO" || env.PUBLIC_DEMO?.trim().toLowerCase() === "true") return { available: false, reason: "PUBLIC_DEMO" };
  if (env.APP_MODE && !["LOCAL", "DEMO", "LIVE_AI"].includes(env.APP_MODE)) return { available: false, reason: "INVALID_CONFIG" };
  if (env.ENABLE_LIVE_AI !== "true") return { available: false, reason: "DISABLED" };
  const apiKey = env.OPENAI_API_KEY?.trim();
  if (!apiKey) return { available: false, reason: "NO_KEY" };
  const model = env.OPENAI_MODEL?.trim();
  if (!model) return { available: false, reason: "NO_MODEL" };
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,199}$/.test(model) || /^sk-/i.test(model)) return { available: false, reason: "INVALID_CONFIG" };
  return { available: true, apiKey, model, timeoutMs: 15_000, maxOutputTokens: 4096 };
}
export function isLocalRequest(request: Request, requireOrigin = false): boolean {
  try {
    const url = new URL(request.url);
    if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password) return false;
    const host = request.headers.get("host");
    // NextRequest rewrites 127.0.0.1 and [::1] URL hostnames to localhost,
    // while preserving the incoming HTTP Host and Origin headers. Validate
    // both local authorities without treating different browser origins as equal.
    let external = url;
    if (host !== null) {
      // Parse an authority only, never userinfo, a path/query, a forwarded host,
      // a comma-joined header, or alternative numeric representations of an IP.
      if (!/^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d{1,5})?$/i.test(host)) return false;
      external = new URL(`${url.protocol}//${host}`);
      if (external.port !== url.port) return false;
    }
    if (requireOrigin && request.headers.get("origin") !== external.origin) return false;
    return true;
  } catch { return false; }
}
