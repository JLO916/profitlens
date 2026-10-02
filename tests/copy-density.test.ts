import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { emptyDecisionWorkspace } from "../src/application/decision";
import { DecisionWorkbench } from "../src/components/decision-workbench";
import { Overview } from "../src/components/overview";
import { Diagnosis } from "../src/components/workspace-panels";
import { validateDataset } from "../src/domain/validation";
import { labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// 03_GLOSSARY_COPY.md §8-4：總覽、健檢、試算三頁主層（排除 <details>）含「不是／不代表／不等於／不可」的句子各 ≤ 3。
// 規則卡的「注意」句（labels.rules[*].caution）是 §7 規定的每張卡一句內容，不算免責樣板；重複句只算一次。
const RULE_CAUTIONS = new Set(Object.values(labels.rules).map(rule => rule.caution.replace(/[。；]$/, "")));
async function context() {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
  return { input, dataset, snapshot };
}
const withoutDetails = (html: string) => html.replace(/<details(?:\s[^>]*)?>[\s\S]*?<\/details>/g, "");
/** 以標籤邊界切成文字節點，再以句號／分號切句；這樣每張卡片的句子各自獨立計算。 */
const textNodes = (html: string) => withoutDetails(html).split(/<[^>]*>/).map(node => node.replace(/&[a-z]+;|&#\d+;/g, " "));
export function disclaimerSentences(html: string): string[] {
  const sentences = textNodes(html).flatMap(node => node.split(/[。；;\n]/)).map(sentence => sentence.replace(/\s+/g, " ").trim()).filter(sentence => /不是|不代表|不等於|不可/.test(sentence));
  return [...new Set(sentences.map(sentence => sentence.replace(/^.*?注意[:：]\s*/, "")).filter(sentence => !RULE_CAUTIONS.has(sentence)))];
}

describe("R2 copy density: at most three limitation sentences per page outside technical details", () => {
  it("overview", async () => {
    const { snapshot } = await context();
    const sentences = disclaimerSentences(renderToStaticMarkup(createElement(Overview, { snapshot, onEvidence: () => undefined })));
    expect(sentences, sentences.join("\n")).toHaveLength(Math.min(sentences.length, 3));
  });
  it("diagnosis", async () => {
    const { snapshot } = await context();
    const sentences = disclaimerSentences(renderToStaticMarkup(createElement(Diagnosis, { snapshot, onEvidence: () => undefined })));
    expect(sentences, sentences.join("\n")).toHaveLength(Math.min(sentences.length, 3));
  });
  it("scenario", async () => {
    const { input, dataset, snapshot } = await context();
    const sentences = disclaimerSentences(renderToStaticMarkup(createElement(DecisionWorkbench, { dataset, snapshot, revision: 1, input, state: emptyDecisionWorkspace(), setState: () => undefined, onEvidence: () => undefined })));
    expect(sentences, sentences.join("\n")).toHaveLength(Math.min(sentences.length, 3));
  });
});
