import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { emptyDecisionWorkspace } from "../src/application/decision";
import { DataWorkspace, Diagnosis } from "../src/components/workspace-panels";
import { DecisionWorkbench } from "../src/components/decision-workbench";
import { IssueList } from "../src/components/issue-list";
import { ManagerSummary } from "../src/components/manager-summary";
import { buildManagerSummary } from "../src/application/manager-summary";
import { validateDataset } from "../src/domain/validation";
import { fixture } from "./helpers/fixtures";
import { fill, labels } from "../src/i18n";
import { plainIssueMessage } from "../src/application/copy";

async function context(name = "golden") {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
  return { input, dataset, snapshot };
}
const withoutClosedDetails = (html: string) => html.replace(/<details(?:\s[^>]*)?>[\s\S]*?<\/details>/g, "");
const technicalSummary = `<summary>${labels.sections.technicalDetails}</summary>`;
/** R5：健檢列本身是 <details>（前三列預設展開）。由內而外移除「收合」的 <details>，保留展開列，模擬第一眼看得到的內容。 */
function withoutCollapsedDetails(html: string): string {
  const innermost = /<details(\s[^>]*)?>((?:(?!<details[\s>])[\s\S])*?)<\/details>/g;
  let current = html;
  for (;;) {
    const next = current.replace(innermost, (_match, attrs: string | undefined, body: string) => /\sopen(?:=|\s|$)/.test(attrs ?? "") ? `<open-details${attrs}>${body}</open-details>` : "");
    if (next === current) break;
    current = next;
  }
  return current.replaceAll("<open-details", "<details").replaceAll("</open-details>", "</details>");
}

describe("PL-10 manager language keeps technical evidence available on demand", () => {
  it("diagnosis presents readable period, metric and scope before collapsed audit identifiers", async () => {
    const { snapshot } = await context();
    const html = renderToStaticMarkup(createElement(Diagnosis, { snapshot, onEvidence: () => undefined }));
    // R5：只選 DTC 時「合計」與 DTC 是同一組數字，合併成一列並以合計為主（範圍文字為「所選通路合計（DTC）」）。
    const main = withoutCollapsedDetails(html);
    const scope = fill(labels.ui.workspacePanels.scopeAllWith, { channels: "DTC" });
    expect(main).toContain(`${labels.periods.previous} · ${labels.metrics.net_revenue.label} · ${scope}`);
    expect(main).toContain(`${labels.periods.current} · ${labels.metrics.contribution_after_marketing.label} · ${scope}`);
    expect(main).toContain("270.00");
    expect(main).toContain(labels.sections.evidence);
    // 規則代號只出現在 data-testid（E2E 錨點）與收合的技術細節。
    expect(main.replace(/data-testid="[^"]*"/g, "")).not.toContain("REV_UP_CM_DOWN");
    expect(main).not.toContain("&quot;fact&quot;");
    expect(html).toContain(technicalSummary);
    expect(html).toContain("REV_UP_CM_DOWN");
    expect(html).toContain("&quot;fact&quot;");
    // 技術細節永遠收合；健檢列只有前三列預設展開。
    expect(html).not.toMatch(new RegExp(`<details[^>]*open[^>]*>${technicalSummary}`));
    const rows = [...html.matchAll(/<details([^>]*)data-testid="diagnosis-row-[A-Z_]+"([^>]*)>/g)].map(match => /\sopen(?:=|\s|>|$)/.test(`${match[1]} ${match[2]}`));
    expect(rows.length).toBeGreaterThan(3);
    expect(rows).toEqual(rows.map((_, index) => index < 3));
  });

  it("manager summary labels every priority amount 對貢獻影響 and states the ranking in the same words", async () => {
    const { snapshot } = await context();
    const html = renderToStaticMarkup(createElement(ManagerSummary, { snapshot, onEvidence: () => undefined }));
    const priorities = buildManagerSummary(snapshot).priorities;
    expect(priorities.length).toBeGreaterThan(0);
    // 做法同總覽三件事：金額前有「對貢獻影響」標籤，金額可開抽屜。
    expect(html.match(new RegExp(`<p class="top-three-impact"><span>${labels.sections.impact}</span><button[^>]*class="number-link impact-amount `, "g"))).toHaveLength(priorities.length);
    expect(labels.ui.managerSummary.rankingNote).toContain(labels.sections.impact);
    expect(html.split(labels.ui.managerSummary.rankingNote)).toHaveLength(priorities.length + 1);
  });

  it("workspace keeps filenames, line numbers and mappings visible while versions are folded", async () => {
    const { dataset, snapshot } = await context();
    const originalColumn = "商品折扣前收入";
    const html = renderToStaticMarkup(createElement(DataWorkspace, { dataset, snapshot, filenames: { "sales_daily.csv": "經營銷售.csv" }, mappings: { "sales_daily.csv": { gross_sales: originalColumn } } }));
    const main = withoutClosedDetails(html);
    expect(main).toContain("經營銷售.csv");
    expect(main).toContain(labels.ui.workspacePanels.lineNumber);
    expect(main).toContain(labels.metrics.gross_sales.short);
    expect(main).not.toContain("contribution-v1");
    expect(main).not.toContain(snapshot.dataset_hash);
    expect(html).toContain(technicalSummary);
    expect(html).toContain("contribution-v1");
    expect(html).toContain(snapshot.dataset_hash);
    expect(html).toContain(`<summary>${labels.ui.workspacePanels.mappingsSummary}</summary>`);
    expect(html).toContain("gross_sales");
    expect(html).toContain(originalColumn);
  });

  it("scenario primary copy uses baseline and refund terms in Chinese, with all assumptions retained", async () => {
    const { input, dataset, snapshot } = await context();
    const html = renderToStaticMarkup(createElement(DecisionWorkbench, { dataset, snapshot, revision: 1, input, state: emptyDecisionWorkspace(), setState: () => undefined, onEvidence: () => undefined }));
    const main = withoutClosedDetails(html);
    const assumptions = JSON.parse(labels.ui.decisionWorkbench.assumptions) as string[];
    const refundAssumption = assumptions.find(text => text.includes("退貨率"));
    expect(main).toContain(labels.sections.scenarioBaseline);
    expect(main).toContain("270.00");
    // R5-3（02 §6）：固定假設改為收合的 <details data-testid="scenario-assumptions">「這個試算假設了什麼（必讀）」；九條全文仍在，點開即見。
    const start = html.indexOf('data-testid="scenario-assumptions"');
    expect(start).toBeGreaterThan(-1);
    const block = html.slice(html.lastIndexOf("<details", start), html.indexOf("</ol>", start) + "</ol>".length);
    expect(block).toMatch(/^<details(?![^>]*\sopen)[^>]*>/);
    expect(block).toContain(`>${labels.scenarioForm.assumptionsSummary}</summary>`);
    expect(labels.scenarioForm.assumptionsSummary).toContain(labels.sections.scenarioAssumptions);
    expect(refundAssumption).toContain("同批訂單");
    expect(block).toContain(refundAssumption);
    expect(main).toContain(labels.ui.decisionWorkbench.baselineTagFixed);
    expect(main).toContain(`從${labels.sections.scenarioBaseline}算起`);
    expect(main.replace(/<[^>]*>/g, "")).not.toMatch(/BASELINE|baseline|cohort|fact IDs/);
    expect(html).toContain("scenario-v1");
    expect(html).toContain("rounding_adjustment");
    expect(html).toContain("每個中間值");
    expect(assumptions).toHaveLength(9);
    for (const text of assumptions) expect(block).toContain(text);
    expect(block.match(/<li>/g)).toHaveLength(9);
    expect(main).not.toContain("golden-v1");
    expect(html).toContain("golden-v1");
  });

  it("partial data problems preserve actionable source metadata and fold machine reason codes", async () => {
    const { dataset } = await context("errors/missing_cogs");
    const html = renderToStaticMarkup(createElement(IssueList, { issues: dataset.issues }));
    const main = withoutClosedDetails(html);
    const issue = dataset.issues[0];
    expect(main).toContain(issue.file);
    expect(main).toContain(issue.field);
    // R3：主層顯示 labels.importErrors 的白話句；原始技術訊息與 reason code 收在「問題代碼」收合區。
    expect(main).toContain(plainIssueMessage(issue));
    expect(plainIssueMessage(issue)).toBe(fill(labels.importErrors.MISSING_COGS, { line: issue.line }));
    expect(main).toContain(fill(labels.ui.issueList.lineRef, { line: issue.line, date: issue.date, channel: issue.channel }).trim());
    expect(main).not.toContain(issue.reason_code);
    expect(main).not.toContain(issue.message);
    expect(html).toContain(`<summary>${labels.ui.issueList.reasonCodeSummary}</summary><code>${issue.reason_code}</code>`);
    expect(html).toContain(issue.message);
  });
});
