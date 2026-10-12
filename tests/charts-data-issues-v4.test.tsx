import { readFileSync } from "node:fs";
import { createElement, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { issueDistribution } from "@/application/chart-issues";
import { chartHeights } from "@/application/chart-theme";
import { issueFileTitle, issueReasonLabel } from "@/application/issue-filter";
import { formatCount } from "@/application/presentation";
import { HeatMatrix, type HeatMatrixProps } from "@/components/charts/heat-table";
import { ISSUES_TABLE_TESTID, IssuesChart, issuesCellFilter, issuesCellTestId, issuesChartModel } from "@/components/data/issues-chart";
import type { DatasetInput, ValidationIssue } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { HEAT_TABLE_BASELINE_FILE, heatTableBaseline } from "./helpers/heat-table-baseline";
import { byTestId, element, escapeAttr, openTag, textOf } from "./helpers/markup";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

/*
 * V4-7a 代理 B：G21 問題分布表（檔案 × 原因）的 SSR 結構測試（PRD §4.1–§4.7 G21、§6.1 mode／variant／headingLevel、§6.3 C28 matrix；CHART_CATALOG G21；06_BATCHES V4-7a 驗收重點），
 * 以及 C28 HeatTable 向下相容（V4-7a 在 heat-table.tsx 加了 HeatMatrix；健檢頁 G11 的輸出與 V4-6 逐字相同）。
 * 斷言只用 testid、labels 與格式化函式（數字不寫死成顯示字）；G21 尚未接到資料來源頁（由整合代理接到 DataWorkspace），這裡直接渲染 IssuesChart。
 */

vi.mock("@/application/analytics", () => ({ track: vi.fn() }));

const copy = labels.data.chartsV4.issues;
const n = (value: number) => formatCount(value, "L2");
const issuesOf = (input: DatasetInput): ValidationIssue[] => validateDataset(input).dataset!.issues;
const render = (issues: readonly ValidationIssue[]) => renderToStaticMarkup(createElement(IssuesChart, { issues }));
const sectionOf = (html: string) => byTestId(html, "chart-data-issues");
const count = (html: string, needle: string) => html.split(needle).length - 1;
const buttons = (html: string) => [...html.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)].map(match => ({ attrs: match[1], text: match[2] }));
/** 以 golden 為底：只有範圍級問題（銷售涵蓋未確認）。 */
const rangeOnlyInput = (): DatasetInput => ({ ...fixture("golden"), manifest: { ...(fixture("golden").manifest as object), sales_coverage_confirmed: false } });

type TreeElement = ReactElement<Record<string, unknown>>;
/** 元素樹（不經 React 渲染；HeatMatrix 沒有 hook，可直接呼叫）中符合條件的元素。 */
function findElements(node: ReactNode, match: (item: TreeElement) => boolean): TreeElement[] {
  if (Array.isArray(node)) return node.flatMap(child => findElements(child, match));
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  if (typeof node.type === "function") return findElements((node.type as (props: unknown) => ReactNode)(node.props), match);
  return [...(match(node) ? [node] : []), ...findElements(node.props.children as ReactNode, match)];
}

describe("C28 向下相容（V4-7a 加 HeatMatrix；健檢頁 G11 逐字不變）", () => {
  it("以 V4-7a 開工錨點（e905189）產生的基準逐字比對：G11 五份資料（含週 × 通路）的 chart-diagnosis-heat 區塊、直接渲染的 calendar 與 matrix", async () => {
    const expected = JSON.parse(readFileSync(HEAT_TABLE_BASELINE_FILE, "utf8")) as Record<string, string>;
    const actual = await heatTableBaseline();
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected)) expect(actual[key], key).toBe(expected[key]);
    // 基準確實涵蓋 calendar、matrix 兩種排法與 roving tabindex（每張熱表 1 個 tabindex=0）。
    expect(expected["synthetic-4-channel chart-diagnosis-heat"]).toContain('data-layout="calendar"');
    expect(expected["weekly-2x93 chart-diagnosis-heat"]).toContain('data-layout="matrix"');
    for (const html of Object.values(expected)) expect(html).not.toMatch(/heat-matrix|heat-count/);
  }, 60_000);
});

describe("C28 HeatMatrix（matrix 排法的按鈕版）", () => {
  const props: HeatMatrixProps = {
    caption: "cap", corner: "file",
    columns: [{ key: "R1", label: "Reason one" }, { key: "R2", label: "Reason two" }],
    rows: [
      { key: "a", head: "File A", cells: [{ key: "R1", tier: 2, text: "3", aria: "A R1 3", testId: "chart-data-issues-cell-a-R1" }, { key: "R2", tier: 0, text: "" }] },
      { key: "b", head: "File B", cells: [{ key: "R1", tier: 0, text: "" }, { key: "R2", tier: 0, text: "" }] },
      { key: "c", head: "File C", cells: [{ key: "R1", tier: 1, text: "1", aria: "C R1 1" }, { key: "R2", tier: 2, text: "2", aria: "C R2 2" }] },
    ],
    footer: { head: "Range", text: "4 items", columnLabel: "Problem" },
    testId: "chart-data-issues-table",
    onCell: () => undefined,
  };

  it("原生 table（不是 grid、沒有 roving tabindex）：明確標 role（≤ 767px 改清單式後仍是表格語意）、caption、th scope；0 格留白沒有按鈕；格的 data-label 是欄名；整列都是 0 的列標 data-empty", () => {
    const html = renderToStaticMarkup(createElement(HeatMatrix, props));
    expect(openTag(html, "<table")).toBe('<table class="heat-matrix" role="table" data-testid="chart-data-issues-table">');
    expect(html).not.toContain("role=\"grid\"");
    expect(html).not.toContain("tabindex");
    expect(html).toContain("<caption>cap</caption>");
    expect(element(html, "<thead")).toBe('<thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">file</th><th role="columnheader" scope="col">Reason one</th><th role="columnheader" scope="col">Reason two</th></tr></thead>');
    expect(element(html, 'data-testid="chart-data-issues-cell-a-R1"')).toBe('<td role="cell" data-tier="2" data-label="Reason one" data-testid="chart-data-issues-cell-a-R1"><button type="button" class="heat-count" aria-label="A R1 3">3</button></td>');
    expect(html).toContain('<td role="cell" data-tier="0" data-label="Reason two"></td>');
    expect(html).toContain('<tr role="row" data-empty="true"><th role="rowheader" scope="row">File B</th>');
    expect(count(html, "data-empty")).toBe(1);
    expect(buttons(html).map(button => button.text)).toEqual(["3", "1", "2"]);
    // 範圍級那一列：列頭＋一格橫跨全部欄。
    expect(html).toContain('<tr role="row" class="heat-matrix-footer"><th role="rowheader" scope="row">Range</th><td role="cell" colSpan="2">4 items</td></tr>');
    expect(html).not.toContain("Problem");
  });

  it("沒有任何欄、只有範圍級那一列時，欄頭寫 columnLabel（表頭與表身同欄數）", () => {
    const html = renderToStaticMarkup(createElement(HeatMatrix, { ...props, columns: [], rows: [] }));
    expect(element(html, "<thead")).toBe('<thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">file</th><th role="columnheader" scope="col">Problem</th></tr></thead>');
    expect(element(html, "<tbody")).toBe('<tbody role="rowgroup"><tr role="row" class="heat-matrix-footer"><th role="rowheader" scope="row">Range</th><td role="cell" colSpan="1">4 items</td></tr></tbody>');
  });

  it("按格內按鈕（按鈕原生的 Enter／空白鍵同一個 onClick）：onCell 收到列的 key 與欄的 key", () => {
    const onCell = vi.fn();
    const found = findElements(HeatMatrix({ ...props, onCell }), item => item.type === "button");
    expect(found).toHaveLength(3);
    for (const button of found) (button.props.onClick as () => void)();
    expect(onCell.mock.calls.map(call => call[0])).toEqual([{ row: "a", column: "R1" }, { row: "c", column: "R1" }, { row: "c", column: "R2" }]);
  });
});

describe("G21 問題分布表（IssuesChart）", () => {
  it("沒有任何問題時不渲染（示範資料、golden、refund_only、zero_ad）：model 為 null、輸出空字串", () => {
    for (const name of ["demo", "golden", "refund_only", "zero_ad"]) {
      const issues = issuesOf(fixture(name));
      expect(issuesChartModel(issues), name).toBeNull();
      expect(render(issues), name).toBe("");
    }
  });

  it("fixtures/errors/missing_ad_day：inline 區塊（沒有 .panel）、h3、table 模式 sm 框（不設 aria-hidden）；標題用單格模板（不寫「最多」）；只有廣告 × MISSING_AD_DAY 一個按鈕", () => {
    const issues = issuesOf(fixture("errors/missing_ad_day"));
    const section = sectionOf(render(issues));
    expect(openTag(section, "<section")).toBe('<section class="chart-section is-inline issues-chart" aria-labelledby="data-issues-dist-title" aria-describedby="data-issues-dist-sub" data-testid="chart-data-issues">');
    expect(section).not.toMatch(/class="[^"]*\bpanel\b/);
    const title = fill(copy.title.single, { file: labels.importWizard.files.ads, n: n(1), reason: copy.reasons.MISSING_AD_DAY });
    expect(element(section, 'id="data-issues-dist-title"')).toBe(`<h3 id="data-issues-dist-title">${title}</h3>`);
    expect(title).not.toContain("最多");
    expect(textOf(element(section, 'id="data-issues-dist-sub"')!)).toBe(fill(copy.subtitle, { section: copy.section, n: n(1) }));
    expect(openTag(section, 'class="chart-frame')).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" data-state="ready" data-mode="table">`);
    expect(openTag(section, 'class="table-scroll"')).toBe('<div class="table-scroll" role="region" aria-labelledby="data-issues-dist-title">');
    expect(section).not.toContain("aria-hidden");
    expect(section).not.toContain("data-alternative");
    expect(element(section, "<caption")).toBe(`<caption>${fill(copy.caption, { section: copy.section })}</caption>`);
    expect(element(section, "<thead")).toContain(`<th role="columnheader" scope="col">${labels.data.pageV3.issueTable.columns.file}</th><th role="columnheader" scope="col">${copy.reasons.MISSING_AD_DAY}</th>`);
    const cell = byTestId(section, issuesCellTestId("ads", "MISSING_AD_DAY"));
    expect(cell).toBe(`<td role="cell" data-tier="2" data-label="${copy.reasons.MISSING_AD_DAY}" data-testid="chart-data-issues-cell-ads-MISSING_AD_DAY"><button type="button" class="heat-count" aria-label="${escapeAttr(fill(copy.cellAria, { file: labels.importWizard.files.ads, n: n(1), reason: copy.reasons.MISSING_AD_DAY }))}">${n(1)}</button></td>`);
    expect(buttons(section)).toHaveLength(1);
    // 三份檔都有列：銷售、通路費用整列留白（≤ 767px 清單式不列）。
    expect([...section.matchAll(/<th role="rowheader" scope="row">([^<]*)<\/th>/g)].map(match => match[1])).toEqual([labels.importWizard.files.sales, labels.importWizard.files.costs, labels.importWizard.files.ads]);
    expect(count(section, 'data-empty="true"')).toBe(2);
    expect(section).not.toContain("heat-matrix-footer");
  });

  it("4 通路合成資料：標題「通路費用的缺費用列最多，6 列」；欄＝缺費用列、缺廣告列；兩格都是各檔最多（data-tier=2）；格內數字加總＝列級問題筆數（11）", () => {
    const issues = issuesOf(synthetic4ChannelInput());
    const model = issuesChartModel(issues)!;
    expect(model.title).toBe(fill(copy.title.most, { file: labels.importWizard.files.costs, reason: copy.reasons.MISSING_CHANNEL_COST_DAY, n: n(6) }));
    expect(model.subtitle).toBe(fill(copy.subtitle, { section: copy.section, n: n(11) }));
    expect(model.columns).toEqual([{ key: "MISSING_CHANNEL_COST_DAY", label: copy.reasons.MISSING_CHANNEL_COST_DAY }, { key: "MISSING_AD_DAY", label: copy.reasons.MISSING_AD_DAY }]);
    const section = sectionOf(render(issues));
    expect(textOf(element(section, 'id="data-issues-dist-title"')!)).toBe(model.title);
    expect(openTag(byTestId(section, issuesCellTestId("costs", "MISSING_CHANNEL_COST_DAY")), "<td")).toContain('data-tier="2"');
    expect(openTag(byTestId(section, issuesCellTestId("ads", "MISSING_AD_DAY")), "<td")).toContain('data-tier="2"');
    expect(buttons(section).map(button => button.text)).toEqual([n(6), n(5)]);
    expect(buttons(section).reduce((sum, button) => sum + Number(button.text.replace(/,/g, "")), 0)).toBe(issueDistribution(issues)!.rowLevel);
    expect(count(section, 'data-tier="0"')).toBe(4);
    expect(count(section, 'data-empty="true"')).toBe(1);
  });

  it("多種原因與範圍級：同檔有兩階（tier 1、2）；範圍級另成一列（data.panel.itemCount）不進格；原因名取 errors.import 的 L1（去掉位置前綴）", () => {
    const base = issuesOf(fixture("errors/missing_cogs"))[0];
    const issues: ValidationIssue[] = [
      base, { ...base, line: 7 }, { ...base, line: 8, reason_code: "MISSING_GROSS_SALES", field: "gross_sales" },
      { file: "ad_spend_daily.csv", line: null, field: "$coverage", severity: "partial", reason_code: "MISSING_AD_DAY", message: "domain" },
    ];
    const model = issuesChartModel(issues)!;
    expect(model.columns.map(column => column.label)).toEqual([issueReasonLabel("MISSING_COGS"), issueReasonLabel("MISSING_GROSS_SALES")]);
    // MISSING_COGS「{file} 第 {line} 行：商品成本空白。…」→「商品成本空白」（與問題表「問題」欄同一句）。
    const cogs = labels.errors.import.MISSING_COGS;
    expect(issueReasonLabel("MISSING_COGS")).toBe(cogs.slice(cogs.indexOf("：") + 1, cogs.indexOf("。")));
    expect(model.title).toBe(fill(copy.title.most, { file: labels.importWizard.files.sales, reason: issueReasonLabel("MISSING_COGS"), n: n(2) }));
    expect(model.subtitle).toBe(fill(copy.subtitle, { section: copy.section, n: n(3) }));
    const section = sectionOf(render(issues));
    expect(openTag(byTestId(section, issuesCellTestId("sales", "MISSING_COGS")), "<td")).toContain('data-tier="2"');
    expect(openTag(byTestId(section, issuesCellTestId("sales", "MISSING_GROSS_SALES")), "<td")).toContain('data-tier="1"');
    expect(element(section, 'class="heat-matrix-footer"')).toBe(`<tr role="row" class="heat-matrix-footer"><th role="rowheader" scope="row">${copy.rangeRow}</th><td role="cell" colSpan="2">${fill(labels.data.panel.itemCount, { n: n(1) })}</td></tr>`);
    expect(buttons(section)).toHaveLength(2);
  });

  it("只有範圍級問題（銷售涵蓋未確認）：標題 title.rangeOnly、副標 subtitleRangeOnly；沒有原因欄與按鈕，只剩範圍級那一列（欄頭沿用問題表的「問題」）", () => {
    const issues = issuesOf(rangeOnlyInput());
    const model = issuesChartModel(issues)!;
    expect(model.title).toBe(fill(copy.title.rangeOnly, { n: n(1) }));
    expect(model.subtitle).toBe(fill(copy.subtitleRangeOnly, { section: copy.section, n: n(1) }));
    const section = sectionOf(render(issues));
    expect(element(section, "<thead")).toBe(`<thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">${labels.data.pageV3.issueTable.columns.file}</th><th role="columnheader" scope="col">${labels.data.pageV3.issueTable.columns.problem}</th></tr></thead>`);
    expect(buttons(section)).toHaveLength(0);
    expect(section).toContain(fill(labels.data.panel.itemCount, { n: n(1) }));
  });

  it("點格：issuesCellFilter 把（檔案短名、原因碼）換成問題表篩選 { file：標準檔名, reason }；不是表上的格時回傳 null", () => {
    const distribution = issueDistribution(issuesOf(synthetic4ChannelInput()))!;
    expect(issuesCellFilter(distribution, { row: "ads", column: "MISSING_AD_DAY" })).toEqual({ file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" });
    expect(issuesCellFilter(distribution, { row: "costs", column: "MISSING_CHANNEL_COST_DAY" })).toEqual({ file: "channel_costs_daily.csv", reason: "MISSING_CHANNEL_COST_DAY" });
    expect(issuesCellFilter(distribution, { row: "manifest", column: "MISSING_AD_DAY" })).toBeNull();
    expect(issuesCellFilter(distribution, { row: "ads", column: "MISSING_COGS" })).toBeNull();
  });

  it("chart-lint（SSR）：放在 .panel 內時 CL-1（table 模式）、CL-2（testid 命名）、CL-9、CL-11（aria-describedby）都沒有違規；主層圖區塊 1 個；testid 都以 chart-data-issues 開頭", () => {
    for (const input of [fixture("errors/missing_ad_day"), synthetic4ChannelInput(), rangeOnlyInput()]) {
      const html = `<main id="main-content"><section class="panel data-section" data-testid="data-issues">${render(issuesOf(input))}</section></main>`;
      const result = checkChartMarkup(html, { page: "data" });
      expect(result.violations).toEqual({ "CL-1": [], "CL-2": [], "CL-9": [], "CL-11": [] });
      expect(result.mainSections).toEqual(["chart-data-issues"]);
      expect(result.chartTestIds.every(id => id === "chart-data-issues" || id === ISSUES_TABLE_TESTID || id.startsWith("chart-data-issues-cell-"))).toBe(true);
    }
  });

  it("標題、欄名與可及名稱只用 labels：檔案角色名沿用 importWizard.files，原因名經 issueReasonLabel", () => {
    expect(issueFileTitle("sales")).toBe(labels.importWizard.files.sales);
    const model = issuesChartModel(issuesOf(synthetic4ChannelInput()))!;
    expect(model.rows.map(row => row.head)).toEqual([labels.importWizard.files.sales, labels.importWizard.files.costs, labels.importWizard.files.ads]);
    expect(model.rows[1].cells[0].aria).toBe(fill(copy.cellAria, { file: labels.importWizard.files.costs, n: n(6), reason: copy.reasons.MISSING_CHANNEL_COST_DAY }));
  });
});
