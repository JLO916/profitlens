import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { emptyDecisionWorkspace } from "../src/application/decision";
import { DataWorkspace, Diagnosis } from "../src/components/workspace-panels";
import { DecisionWorkbench } from "../src/components/decision-workbench";
import { IssueList } from "../src/components/issue-list";
import { validateDataset } from "../src/domain/validation";
import { fixture } from "./helpers/fixtures";

async function context(name = "golden") {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input));
  return { input, dataset, snapshot };
}
const withoutClosedDetails = (html: string) => html.replace(/<details(?:\s[^>]*)?>[\s\S]*?<\/details>/g, "");

describe("PL-10 manager language keeps technical evidence available on demand", () => {
  it("diagnosis presents readable period, metric and scope before collapsed audit identifiers", async () => {
    const { snapshot } = await context();
    const html = renderToStaticMarkup(createElement(Diagnosis, { snapshot, onEvidence: () => undefined }));
    const main = withoutClosedDetails(html);
    expect(main).toContain("前期 · 商品淨營收 · DTC");
    expect(main).toContain("本期 · 行銷後貢獻 · DTC");
    expect(main).toContain("270.00");
    expect(main).toContain("公式與來源");
    expect(main).not.toContain("REV_UP_CM_DOWN");
    expect(main).not.toContain("&quot;fact&quot;");
    expect(html).toContain("<summary>稽核資訊：事實識別與規則</summary>");
    expect(html).toContain("REV_UP_CM_DOWN");
    expect(html).toContain("&quot;fact&quot;");
    expect(html).not.toMatch(/<details[^>]*open/);
  });

  it("workspace keeps filenames, line numbers and mappings visible while versions are folded", async () => {
    const { dataset, snapshot } = await context();
    const html = renderToStaticMarkup(createElement(DataWorkspace, { dataset, snapshot, filenames: { "sales_daily.csv": "經營銷售.csv" }, mappings: { "sales_daily.csv": { gross_sales: "商品折扣前收入" } } }));
    const main = withoutClosedDetails(html);
    expect(main).toContain("經營銷售.csv");
    expect(main).toContain("原始行號");
    expect(main).toContain("折扣前收入");
    expect(main).not.toContain("contribution-v1");
    expect(main).not.toContain(snapshot.dataset_hash);
    expect(html).toContain("contribution-v1");
    expect(html).toContain(snapshot.dataset_hash);
    expect(html).toContain("gross_sales");
    expect(html).toContain("商品折扣前收入");
  });

  it("scenario primary copy uses baseline and refund terms in Chinese, with all assumptions retained", async () => {
    const { input, dataset, snapshot } = await context();
    const html = renderToStaticMarkup(createElement(DecisionWorkbench, { dataset, snapshot, revision: 1, input, state: emptyDecisionWorkspace(), setState: () => undefined, onEvidence: () => undefined }));
    const main = withoutClosedDetails(html);
    expect(main).toContain("本期通路基準");
    expect(main).toContain("270.00");
    expect(main).toContain("每個方案都必須接受的固定假設");
    expect(main).toContain("同批訂單的最終退貨機率");
    expect(main).toContain("原始基準");
    expect(main.replace(/<[^>]*>/g, "")).not.toMatch(/BASELINE|baseline|cohort|fact IDs/);
    expect(html).toContain("scenario-v1");
    expect(html).toContain("rounding_adjustment");
    expect(html).toContain("每個中間值");
    expect(main.match(/<li>/g)).toHaveLength(9);
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
    expect(main).toContain(issue.message);
    expect(main).toContain(`第 ${issue.line} 行`);
    expect(main).not.toContain(issue.reason_code);
    expect(html).toContain(`<summary>問題代碼</summary><code>${issue.reason_code}</code>`);
  });
});
