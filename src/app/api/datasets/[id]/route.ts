import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DatasetInput } from "@/domain/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Static synthetic examples only. An incoming ID never becomes a filesystem path.
const fixtureDirectories = new Map([
  ["demo", "demo"],
  ["golden", "golden"],
  ["missing-cogs", "errors/missing_cogs"],
  ["missing-ad", "errors/missing_ad_day"],
  ["duplicate", "errors/duplicate_sales_key"],
]);
const headers = { "Cache-Control": "no-store" };

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await context.params;
  const directory = fixtureDirectories.get(id);
  if (!directory) {
    return Response.json({ error: "找不到這份示範資料。" }, { status: 404, headers });
  }

  try {
    const root = join(process.cwd(), "fixtures", directory);
    const [manifestText, sales, costs, ads] = await Promise.all([
      readFile(join(root, "manifest.json"), "utf8"),
      readFile(join(root, "sales_daily.csv"), "utf8"),
      readFile(join(root, "channel_costs_daily.csv"), "utf8"),
      readFile(join(root, "ad_spend_daily.csv"), "utf8"),
    ]);
    const manifest: unknown = JSON.parse(manifestText);
    if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)
      || !("source_type" in manifest) || manifest.source_type !== "synthetic") {
      return unavailable();
    }
    const input: DatasetInput = {
      manifest,
      files: {
        "sales_daily.csv": sales,
        "channel_costs_daily.csv": costs,
        "ad_spend_daily.csv": ads,
      },
    };
    // Send source data only; the browser must calculate through the M1 engine.
    return Response.json(input, { headers });
  } catch {
    return unavailable();
  }
}

function unavailable(): Response {
  return Response.json(
    { error: "示範資料暫時無法載入，請稍後再試。" },
    { status: 500, headers },
  );
}
