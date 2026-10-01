import "server-only";
import { z } from "zod";
import { AiSnapshotSchema } from "@/ai/contracts";
import { isLocalRequest, readAiConfig } from "@/ai/config";
import { runInsights } from "@/ai/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES = 65_536;
const EnvelopeSchema = z.object({ snapshot: z.unknown(), consent: z.object({ snapshot_id: z.string(), accepted: z.literal(true), recipient: z.literal("openai") }).strict().optional() }).strict();
function json(body: unknown, status = 200) { return Response.json(body, { status, headers: { "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } }); }
function fallback(reason: string, status: number) { return json({ status: "fallback", snapshot_id: null, reason }, status); }
export async function GET(request: Request) {
  const config = readAiConfig();
  if (!config.available) return json({ available: false, reason: config.reason, provider: "openai" });
  return json({ available: isLocalRequest(request), reason: isLocalRequest(request) ? null : "LOCAL_ONLY", provider: "openai" });
}
async function readBoundedJson(request: Request): Promise<unknown> {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > MAX_BYTES)) throw new Error("INPUT_TOO_LARGE");
  if (!request.body) throw new Error("INVALID_REQUEST");
  const reader = request.body.getReader(), chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new Error("INPUT_TOO_LARGE"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
}
export async function POST(request: Request) {
  // Gate before reading any body or constructing a provider; PUBLIC_DEMO is enforced server-side.
  const config = readAiConfig();
  if (!config.available) return fallback(config.reason, config.reason === "PUBLIC_DEMO" ? 403 : 200);
  if (!isLocalRequest(request, true)) return fallback("LOCAL_ONLY", 403);
  if (request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") return fallback("INVALID_REQUEST", 415);
  let body: unknown;
  try { body = await readBoundedJson(request); }
  catch (error) { return fallback(error instanceof Error && error.message === "INPUT_TOO_LARGE" ? "INPUT_TOO_LARGE" : "INVALID_REQUEST", error instanceof Error && error.message === "INPUT_TOO_LARGE" ? 413 : 400); }
  const envelope = EnvelopeSchema.safeParse(body);
  if (!envelope.success) return fallback("INVALID_REQUEST", 400);
  if (!envelope.data.consent) return fallback("CONSENT_REQUIRED", 400);
  const snapshot = AiSnapshotSchema.safeParse(envelope.data.snapshot);
  if (!snapshot.success) return fallback("INVALID_REQUEST", 400);
  if (envelope.data.consent.snapshot_id !== snapshot.data.snapshot_id) return fallback("CONSENT_REQUIRED", 400);
  return json(await runInsights(snapshot.data, config, { signal: request.signal }));
}
