import "server-only";
import OpenAI from "openai";
import outputSchema from "../../spec/insight-output.schema.json";
import type { AiConfig } from "./config";
import { AiProviderError, type AiProvider, type AiUsage } from "./provider";
import { observationCatalog } from "./grounding";
import { INSIGHT_INSTRUCTIONS, REPAIR_INSTRUCTION } from "./prompt";

function safeUsage(value: { input_tokens?: number; output_tokens?: number; total_tokens?: number } | undefined): AiUsage | null {
  if (!value || ![value.input_tokens, value.output_tokens, value.total_tokens].every(n => Number.isSafeInteger(n) && n! >= 0)) return null;
  return { input_tokens: value.input_tokens!, output_tokens: value.output_tokens!, total_tokens: value.total_tokens! };
}

export function createOpenAiProvider(config: Extract<AiConfig, { available: true }>, transport?: typeof fetch): AiProvider {
  // Explicit endpoint/logging/retries prevent environment overrides from expanding disclosure.
  // A new request-local client is used; no user data or responses live in module globals.
  const client = new OpenAI({ apiKey: config.apiKey, baseURL: "https://api.openai.com/v1", maxRetries: 0,
    timeout: config.timeoutMs, logLevel: "off", dangerouslyAllowBrowser: false, ...(transport ? { fetch: transport } : {}) });
  return { generate: async (snapshot, { signal, repair }) => {
    try {
      const response = await client.responses.create({
        model: config.model, store: false, stream: false, max_output_tokens: config.maxOutputTokens,
        tools: [], tool_choice: "none",
        instructions: `${INSIGHT_INSTRUCTIONS}${repair ? `\n${REPAIR_INSTRUCTION}` : ""}`,
        input: [{ role: "user", content: JSON.stringify({ snapshot, observation_catalog: observationCatalog(snapshot) }) }],
        text: { format: { type: "json_schema", name: "profitlens_insight_output", strict: true,
          schema: Object.fromEntries(Object.entries(outputSchema).filter(([key]) => key !== "$schema")) } },
      }, { signal });
      const usage = safeUsage(response.usage);
      if (response.output.some(item => item.type === "message" && item.content.some(content => content.type === "refusal"))) return { status: "refused", usage };
      if (response.status === "incomplete" || response.output.some(item => item.type === "message" && item.status === "incomplete")) return { status: "truncated", usage };
      if (response.status !== "completed") throw new AiProviderError("PROVIDER_ERROR");
      const raw = response.output.filter(item => item.type === "message")
        .flatMap(item => item.content.filter(content => content.type === "output_text").map(content => content.text)).join("\n");
      // Never render or log this raw value. The application schema/grounding layer owns acceptance.
      let output: unknown = null;
      if (typeof raw === "string" && new TextEncoder().encode(raw).byteLength <= 65_536) {
        try { output = JSON.parse(raw); } catch { output = raw; }
      }
      return { status: "completed", output, usage };
    } catch (error) {
      if (error instanceof AiProviderError) throw error;
      if (signal.aborted) throw new AiProviderError("ABORTED");
      if (error instanceof OpenAI.APIConnectionTimeoutError) throw new AiProviderError("TIMEOUT");
      if (error instanceof OpenAI.RateLimitError) throw new AiProviderError("RATE_LIMIT");
      throw new AiProviderError("PROVIDER_ERROR");
    }
  } };
}
