import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AiPanel } from "../src/components/ai-panel";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { validateDataset } from "../src/domain/validation";
import { fixture } from "./helpers/fixtures";
import { fill, labels } from "../src/i18n";

const copy = labels.shell.ai.panel;
// R2 spec moved the "no per-channel breakdown" caveat into the technical <details> (ai-advanced); the sentence is still hardcoded in ai-panel.tsx.
const noChannelBreakdownNote = "本次不傳個別通路拆解，模型無法指出是哪個通路";

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
    expect(html).toContain(copy.rulesAvailable);
    expect(html).toContain(copy.statusChecking);
    expect(html).toContain(copy.liveChecking);
    expect(html).not.toContain('data-testid="ai-payload-preview"');
    expect(html).not.toContain('data-testid="ai-request-preview"');
    expect(html).not.toContain('data-testid="ai-local-mapping"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain(`>${copy.sendButton}</button>`);
    expect(html).not.toContain(copy.consentLabel);
    expect(html).not.toContain(`<h3>${copy.liveHeading}</h3>`);
    expect(html).not.toContain('data-testid="ai-live-result"');
    expect(html).not.toContain("ai-v2:");
  });

  it.each(["PUBLIC_DEMO", "DISABLED", "NO_KEY", "NO_MODEL", "LOCAL_ONLY", "INVALID_CONFIG", "STATUS_UNAVAILABLE"])("%s explains the unavailable mode without rendering upload controls", async reason => {
    const html = renderToStaticMarkup(createElement(AiPanel, { snapshot: await golden(), revision: 1, onEvidence: () => undefined, capability: { available: false, reason, provider: "openai" } }));
    expect(html).toContain(copy.rulesAvailable);
    expect(html).toContain(reason === "STATUS_UNAVAILABLE" ? copy.liveStatusUnknown : copy.liveOff);
    expect(html).toContain(labels.shell.ai.client.reasons[reason as keyof typeof labels.shell.ai.client.reasons]);
    expect(html).not.toContain('data-testid="ai-payload-preview"');
    expect(html).not.toContain('type="checkbox"');
    expect(html).not.toContain(`>${copy.sendButton}</button>`);
    expect(html).not.toContain(copy.consentLabel);
    expect(html).not.toContain(copy.previewHeading);
    expect(html).not.toContain(copy.liveConsentOnly);
  });

  it("available mode preserves all exact facts in readable preview and places JSON in closed advanced disclosure", async () => {
    const html = renderToStaticMarkup(createElement(AiPanel, { snapshot: await golden(), revision: 1, onEvidence: () => undefined, capability: { available: true, reason: "AVAILABLE", provider: "openai" } }));
    expect(html).not.toContain(copy.statusChecking);
    expect(html).toContain(copy.statusAvailable);
    expect(html).toContain('data-testid="ai-facts-preview"');
    expect(html).toContain(`${labels.metrics.contribution_after_marketing.headline}`);
    expect(html).toContain("270.00");
    expect(html).toContain("400.00");
    expect(html).toContain(fill(copy.previewScope, { n: 1 }));
    expect(html).toContain(copy.previewTableCaption);
    const advanced = html.match(/<details[^>]*data-testid="ai-advanced"[^>]*>[\s\S]*<\/details>/)?.[0] ?? "";
    expect(advanced).toContain(noChannelBreakdownNote);
    expect(html).toContain('data-testid="ai-payload-preview"');
    expect(html).toContain('data-testid="ai-request-preview"');
    expect(html).toContain('data-testid="ai-local-mapping"');
    expect(html).toContain('type="checkbox"');
    expect(html).toMatch(/<details[^>]*data-testid="ai-advanced"[^>]*><summary>/);
    expect(html.match(/<details[^>]*data-testid="ai-advanced"[^>]*>/)?.[0]).not.toContain("open=");
    expect(html).toMatch(new RegExp(`<button[^>]*disabled=""[^>]*>${copy.sendButton}</button>`));
  });
});
