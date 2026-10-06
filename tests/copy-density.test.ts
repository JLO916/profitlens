import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { emptyDecisionWorkspace } from "../src/application/decision";
import { emptyScenarioWorkspace } from "../src/application/scenario-workspace";
import { emptyActionWorkspace } from "../src/application/action-workspace";
import { createReviewSession, rebuildReviewSnapshot, updateReviewSession } from "../src/application/review-session";
import { finalizeMeeting, freezeMeeting } from "../src/application/meeting";
import { DecisionWorkbench } from "../src/components/decision-workbench";
import { MeetingPage } from "../src/components/meeting-page";
import { Overview } from "../src/components/overview";
import { DataWorkspace, Diagnosis } from "../src/components/workspace-panels";
import { validateDataset } from "../src/domain/validation";
import { labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// 03_GLOSSARY_COPY.md §8-4：總覽、健檢、試算三頁（V3-2a 起加上會議紀錄與資料來源，共五頁）主層（排除 <details>）含「不是／不代表／不等於／不可」的句子各 ≤ 3。
// 規則卡的「注意」句（labels.rules[*].caution）是 §7 規定的每張卡一句內容，不算免責樣板；重複句只算一次。
const RULE_CAUTIONS = new Set(Object.values(labels.rules).map(rule => rule.caution.replace(/[。；]$/, "")));
async function context(name = "golden") {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
  return { input, dataset, snapshot };
}
/** 移除「收合」的 <details>（沒有 open 屬性），以巢狀深度配對：展開的 <details>（例如健檢前三列）算主層，只拿掉其中再收合的子區塊（技術細節等）。 */
export function withoutDetails(html: string): string {
  const tag = /<details(\s[^>]*)?>|<\/details>/g;
  const stack: { start: number; open: boolean }[] = [];
  const ranges: [number, number][] = [];
  for (let match = tag.exec(html); match; match = tag.exec(html)) {
    if (match[0] !== "</details>") { stack.push({ start: match.index, open: /\sopen(?:=|\s|$)/.test(match[1] ?? "") }); continue; }
    const node = stack.pop();
    if (!node) throw new Error("unbalanced </details>");
    // 只記最外層的收合區塊（祖先都展開）；被它包住的子區塊一起拿掉。
    if (!node.open && stack.every(parent => parent.open)) ranges.push([node.start, match.index + match[0].length]);
  }
  if (stack.length) throw new Error("unclosed <details>");
  let kept = "", last = 0;
  for (const [start, end] of ranges) { kept += html.slice(last, start); last = end; }
  return kept + html.slice(last);
}
/** 以標籤邊界切成文字節點，再以句號／分號切句；這樣每張卡片的句子各自獨立計算。 */
const textNodes = (html: string) => withoutDetails(html).split(/<[^>]*>/).map(node => node.replace(/&[a-z]+;|&#\d+;/g, " "));
export function disclaimerSentences(html: string): string[] {
  const sentences = textNodes(html).flatMap(node => node.split(/[。；;\n]/)).map(sentence => sentence.replace(/\s+/g, " ").trim()).filter(sentence => /不是|不代表|不等於|不可/.test(sentence));
  return [...new Set(sentences.map(sentence => sentence.replace(/^.*?注意[:：]\s*/, "")).filter(sentence => !RULE_CAUTIONS.has(sentence)))];
}

describe("withoutDetails keeps what is visible at first glance", () => {
  it("keeps open <details> (and their summary), drops collapsed ones with everything nested inside", () => {
    const html = '<p>a</p><details open=""><summary>row</summary><p>body</p><details class="tech"><summary>tech</summary><p>hidden</p><details open=""><summary>inner</summary>x</details></details><p>after</p></details><details><summary>closed</summary><details open="">y</details></details><p>z</p>';
    expect(withoutDetails(html)).toBe('<p>a</p><details open=""><summary>row</summary><p>body</p><p>after</p></details><p>z</p>');
    expect(withoutDetails("<details>a</details>")).toBe("");
    expect(withoutDetails('<details data-open="x">a</details><b>c</b>')).toBe("<b>c</b>");
    expect(() => withoutDetails("<details open>")).toThrow();
  });
  it("the diagnosis page's open rows count as the main layer, their technical details do not", async () => {
    const { snapshot } = await context();
    const main = withoutDetails(renderToStaticMarkup(createElement(Diagnosis, { snapshot, onEvidence: () => undefined })));
    expect(main).toContain(`<dt>${labels.sections.nextStep}</dt>`);
    expect(main).not.toContain(`<summary>${labels.sections.technicalDetails}</summary>`);
  });
});

describe("R2 copy density: at most three limitation sentences per page outside technical details", () => {
  it("overview", async () => {
    const { snapshot } = await context();
    const sentences = disclaimerSentences(renderToStaticMarkup(createElement(Overview, { snapshot, onEvidence: () => undefined, datasetName: "golden", missingItems: 0, actionsSummary: { pending: 0, pinned: [] } })));
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
  it("meeting record (draft with one finished meeting in history)", async () => {
    const golden = { ...(await context()), revision: 1 };
    const noop = () => undefined;
    const scenarios = emptyScenarioWorkspace("e"), actions = emptyActionWorkspace();
    const finished = updateReviewSession(createReviewSession(golden, "e", "rev-1"), { name: "M1", decision_state: "adopted", notes: "N", meeting_date: "2026-10-03" });
    const meeting = freezeMeeting(finalizeMeeting({ review: finished, snapshot: await rebuildReviewSnapshot(finished), scenarios, actions, date: "2026-10-03", now: "2026-10-03T06:00:00.000Z" }));
    const html = renderToStaticMarkup(createElement(MeetingPage, { source: golden, scenarioWorkspace: scenarios, actionWorkspace: actions, review: createReviewSession(golden, "e", "rev-2"), history: [meeting], onChange: noop, onEvidence: noop, onFinalize: async () => undefined, onRemoveMeeting: noop, onCreateAction: noop }));
    expect(html).toContain('data-testid="meeting-page"');
    const sentences = disclaimerSentences(html);
    expect(sentences, sentences.join("\n")).toHaveLength(Math.min(sentences.length, 3));
  });
  it("data sources (complete data, and partial data with the issue list)", async () => {
    for (const name of ["golden", "errors/missing_cogs"]) {
      const { dataset, snapshot } = await context(name);
      const html = renderToStaticMarkup(createElement(DataWorkspace, { dataset, snapshot }));
      expect(html, name).toContain('data-testid="targets-entry"');
      const sentences = disclaimerSentences(html);
      expect(sentences, `${name}\n${sentences.join("\n")}`).toHaveLength(Math.min(sentences.length, 3));
    }
  });
});
