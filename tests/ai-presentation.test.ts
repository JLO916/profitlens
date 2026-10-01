import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiPanel } from "../src/components/ai-panel";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { validateDataset } from "../src/domain/validation";
import { fixture } from "./helpers/fixtures";

async function golden() {
  const input = fixture("golden");
  return createSnapshot(validateDataset(input).dataset!, { channels: ["DTC"] }, await hashInput(input));
}

describe("PL-10 AI capability must be confirmed before presenting a request", () => {
  it.each(["golden", "errors/missing_cogs", "errors/missing_ad_day"])("initial %s render keeps rule diagnosis usable and contains no dormant upload flow", async name => {
    const input = fixture(name);
    const validated = validateDataset(input);
    expect(validated.dataset).not.toBeNull();
    const snapshot = await createSnapshot(validated.dataset!, {}, await hashInput(input));
    const html = renderToStaticMarkup(createElement(AiPanel, { snapshot, revision: 1, onEvidence: () => undefined }));
    expect(html).toContain("規則診斷可用");
    expect(html).toContain("正在確認");
    expect(html).not.toContain('data-testid="ai-payload-preview"');
    expect(html).not.toContain('data-testid="ai-request-preview"');
    expect(html).not.toContain('data-testid="ai-local-mapping"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("傳送已同意的彙總資料");
    expect(html).not.toContain("即時 AI 說明");
    expect(html).not.toContain("ai-v2:");
  });

  it.each(["PUBLIC_DEMO", "DISABLED", "NO_KEY", "NO_MODEL", "LOCAL_ONLY", "INVALID_CONFIG", "STATUS_UNAVAILABLE"])("%s explains the unavailable mode without rendering upload controls", async reason => {
    const html = renderToStaticMarkup(createElement(AiPanel, { snapshot: await golden(), revision: 1, onEvidence: () => undefined, capability: { available: false, reason, provider: "openai" } }));
    expect(html).toContain("規則診斷可用");
    expect(html).toContain(reason === "STATUS_UNAVAILABLE" ? "即時 AI 狀態未確認" : "即時 AI 未啟用");
    expect(html).not.toContain('data-testid="ai-payload-preview"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain("傳送已同意的彙總資料");
    expect(html).not.toContain("仍可預覽");
  });

  it("available mode preserves all exact facts in readable preview and places JSON in closed advanced disclosure", async () => {
    const html = renderToStaticMarkup(createElement(AiPanel, { snapshot: await golden(), revision: 1, onEvidence: () => undefined, capability: { available: true, reason: "AVAILABLE", provider: "openai" } }));
    expect(html).not.toContain("尚未傳送資料");
    expect(html).toContain('data-testid="ai-facts-preview"');
    expect(html).toContain("行銷後貢獻");
    expect(html).toContain("270.00");
    expect(html).toContain("400.00");
    expect(html).toContain("所選通路合計");
    expect(html).toContain("無法指出個別通路的驅動因素");
    expect(html).toContain('data-testid="ai-payload-preview"');
    expect(html).toContain('data-testid="ai-request-preview"');
    expect(html).toContain('data-testid="ai-local-mapping"');
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(/<details[^>]*data-testid="ai-advanced"[^>]*><summary>/);
    expect(html.match(/<details[^>]*data-testid="ai-advanced"[^>]*>/)?.[0]).not.toContain("open=");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>傳送已同意的彙總資料/);
  });
});
