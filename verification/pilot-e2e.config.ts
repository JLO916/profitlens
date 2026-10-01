import { defineConfig } from "@playwright/test";
import base from "../playwright.config";
export default defineConfig({
  ...base,
  testDir: "./pilot-e2e",
  outputDir: "../test-results-pilot",
  reporter: [["list"], ["json", { outputFile: "pilot-e2e-results.json" }]],
  use: { ...base.use, baseURL: "http://127.0.0.1:3200" },
  webServer: undefined,
});
