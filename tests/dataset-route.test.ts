import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, runtime } from "@/app/api/datasets/[id]/route";
import type { DatasetInput } from "@/domain/types";
import { validateDataset } from "@/domain/validation";

vi.mock("node:fs/promises", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:fs/promises")>();
  return { ...original, readFile: vi.fn(original.readFile) };
});
const readFileMock = vi.mocked(readFile);
const request = new Request("http://127.0.0.1:3000/api/datasets/golden");
const names = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"] as const;
const load = (id: string) => GET(request, { params: Promise.resolve({ id }) });

beforeEach(async () => {
  const original = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  readFileMock.mockReset();
  readFileMock.mockImplementation(original.readFile);
});

describe("read-only synthetic dataset endpoint", () => {
  it("serves exact golden CSV bytes and manifest; it does not send golden expected answers", async () => {
    const response = await load("golden");
    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Content-Type")).toContain("application/json");
    const body = await response.json() as DatasetInput;
    expect(Object.keys(body).sort()).toEqual(["files", "manifest"]);
    expect(Object.keys(body.files).sort()).toEqual([...names].sort());
    const dir = join(process.cwd(), "fixtures", "golden");
    expect(body.manifest).toEqual(JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")));
    for (const name of names) expect(body.files[name]).toBe(readFileSync(join(dir, name), "utf8"));
    expect(body.files["sales_daily.csv"]).toContain("2026-08-01,DTC,A,HOME,2,1000.00,100.00,0.00,400.00,TWD\r\n");
    expect(body).not.toHaveProperty("expected");
    expect(body).not.toHaveProperty("computed_summary");
    expect(readFileMock).toHaveBeenCalledTimes(4);
    expect(readFileMock.mock.calls.map(([path]) => String(path).split("/").at(-1)).sort())
      .toEqual(["manifest.json", ...names].sort());
    expect(validateDataset(body).classification).toBe("valid");
  });

  it.each([
    ["demo", "demo", "valid"],
    ["missing-cogs", "errors/missing_cogs", "partial"],
    ["missing-ad", "errors/missing_ad_day", "partial"],
    ["duplicate", "errors/duplicate_sales_key", "blocking"],
  ])("maps %s to existing synthetic fixture without repairing its data", async (id, folder, classification) => {
    const response = await load(id);
    expect(response.status).toBe(200);
    const body = await response.json() as DatasetInput;
    expect(body.manifest).toEqual(expect.objectContaining({ source_type: "synthetic" }));
    for (const name of names) expect(body.files[name]).toBe(readFileSync(join(process.cwd(), "fixtures", folder, name), "utf8"));
    expect(validateDataset(body).classification).toBe(classification);
    expect(readFileMock).toHaveBeenCalledTimes(4);
    expect(readFileMock.mock.calls.some(([path]) => /expected|computed_summary/.test(String(path)))).toBe(false);
  });

  it.each(["unknown", "../golden", "../../.env.local", "%2e%2e%2fgolden", "golden/expected.json", "__proto__", "constructor", "toString", "", "/etc/passwd"])
    ("rejects non-whitelisted ID %j before filesystem access", async (id) => {
      const response = await load(id);
      expect(response.status).toBe(404);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      expect(await response.json()).toEqual({ error: "找不到這份示範資料。" });
      expect(readFileMock).not.toHaveBeenCalled();
    });

  it("sanitizes filesystem failures without exposing local paths or error details", async () => {
    readFileMock.mockRejectedValueOnce(new Error("EACCES /Users/private/.env.local SECRET_CONTENT"));
    const response = await load("golden");
    expect(response.status).toBe(500);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ error: "示範資料暫時無法載入，請稍後再試。" });
  });

  it.each([
    '{"source_type":"user_provided","private":"must-not-escape"}',
    "null",
    "[]",
    "{broken-json",
  ])("refuses non-synthetic or malformed manifest %s", async (manifest) => {
    readFileMock.mockResolvedValueOnce(manifest);
    const response = await load("golden");
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "示範資料暫時無法載入，請稍後再試。" });
  });
});
