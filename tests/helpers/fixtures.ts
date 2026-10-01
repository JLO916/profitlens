import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { DatasetInput, FileName } from "@/domain/types";

export const csvFiles: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
export function fixture(name = "golden"): DatasetInput {
  const root = resolve("fixtures", name);
  return {
    manifest: JSON.parse(readFileSync(resolve(root, "manifest.json"), "utf8")),
    files: Object.fromEntries(csvFiles.map(file => [file, readFileSync(resolve(root, file), "utf8")])),
  };
}
export function expected(name = "golden") {
  return JSON.parse(readFileSync(resolve("fixtures", name, "expected.json"), "utf8"));
}
