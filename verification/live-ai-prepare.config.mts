import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Explicit offline preparation only. The default test command does not include this file.
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL("../src", import.meta.url)) } },
  test: { environment: "node", include: ["verification/live-ai-prepare.test.ts"] },
});
