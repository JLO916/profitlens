import { describe, expect, it } from "vitest";
import { compareIssueReasons, ISSUE_DISTRIBUTION_VERSION, issueDistribution, isRowLevelIssue, type IssueDistribution } from "@/application/chart-issues";
import { ALL_IMPORT_ISSUE_REASON_CODES } from "@/application/import";
import type { DatasetInput, ValidationIssue } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

/*
 * V4-7a 代理 B：G21「問題分布（檔案 × 原因）」的整理函式 issueDistribution（issue-distribution-v1；PRD §4.2 G21、§6.4；CHART_CATALOG G21「單元測試」）。
 * 期望值全部是手算常數（逐列寫在旁邊），不由 application 函式算出；實際值才呼叫 issueDistribution。
 * golden：全部格加總＝列級問題筆數；列級＋範圍級＝輸入的問題筆數。
 */

const issuesOf = (input: DatasetInput): ValidationIssue[] => {
  const result = validateDataset(input);
  expect(result.classification).not.toBe("blocking");
  return result.dataset!.issues;
};
/** 矩陣的精簡形狀：每列 [檔案短名, 各格筆數, 各格 tier, 最多的原因]。 */
const matrix = (distribution: IssueDistribution) => distribution.rows.map(row => [row.fileKey, row.cells.map(cell => cell.count), row.cells.map(cell => cell.tier), row.top]);
const cellSum = (distribution: IssueDistribution) => distribution.rows.reduce((sum, row) => sum + row.cells.reduce((total, cell) => total + cell.count, 0), 0);
/** 共同的不變量：格加總＝列級；列級＋範圍級＝輸入筆數；每列 total＝該列格加總；每格與 reasons 同序；每檔最多一格 tier 2。 */
function invariants(distribution: IssueDistribution, issues: readonly ValidationIssue[]) {
  expect(distribution.version).toBe(ISSUE_DISTRIBUTION_VERSION);
  expect(cellSum(distribution)).toBe(distribution.rowLevel);
  expect(distribution.rowLevel + distribution.rangeLevel).toBe(issues.length);
  expect(distribution.rowLevel).toBe(issues.filter(isRowLevelIssue).length);
  for (const row of distribution.rows) {
    expect(row.total).toBe(row.cells.reduce((sum, cell) => sum + cell.count, 0));
    expect(row.cells.map(cell => cell.reason)).toEqual(distribution.reasons);
    expect(row.cells.filter(cell => cell.tier === 2).length).toBe(row.total > 0 ? 1 : 0);
    for (const cell of row.cells) expect(cell.tier === 0).toBe(cell.count === 0);
  }
}

/** golden 改成「各檔多種原因、同值」：銷售兩列缺商品成本、兩列缺原價收入；費用兩列缺平台抽成、一列缺金流手續費；
 *  廣告一列缺廣告投放費、少一列（2026-08-02 MARKETPLACE）；銷售涵蓋未確認（manifest.json 範圍級 1 筆）。 */
function mixedInput(): DatasetInput {
  const input = fixture("golden");
  input.manifest = { ...(input.manifest as object), sales_coverage_confirmed: false };
  input.files["sales_daily.csv"] = [
    "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency",
    "2026-08-01,DTC,A,HOME,2,1000.00,100.00,0.00,,TWD", // 第 2 行：MISSING_COGS
    "2026-08-01,DTC,B,CARE,1,500.00,0.00,50.00,,TWD", // 第 3 行：MISSING_COGS
    "2026-08-01,MARKETPLACE,A,HOME,2,,60.00,0.00,270.00,TWD", // 第 4 行：MISSING_GROSS_SALES
    "2026-08-01,MARKETPLACE,B,CARE,1,,40.00,0.00,180.00,TWD", // 第 5 行：MISSING_GROSS_SALES
    "2026-08-02,DTC,A,HOME,3,1400.00,210.00,70.00,580.00,TWD",
    "2026-08-02,DTC,B,CARE,1,400.00,20.00,20.00,160.00,TWD",
    "2026-08-02,MARKETPLACE,A,HOME,3,800.00,120.00,40.00,360.00,TWD",
    "2026-08-02,MARKETPLACE,B,CARE,1,500.00,100.00,50.00,225.00,TWD",
  ].join("\n");
  input.files["channel_costs_daily.csv"] = [
    "date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency",
    "2026-08-01,DTC,,40.00,100.00,10.00,TWD", // MISSING_PLATFORM_FEES
    "2026-08-01,MARKETPLACE,,20.00,60.00,10.00,TWD", // MISSING_PLATFORM_FEES
    "2026-08-02,DTC,0.00,,140.00,16.00,TWD", // MISSING_PAYMENT_FEES
    "2026-08-02,MARKETPLACE,120.00,22.00,85.00,13.00,TWD",
  ].join("\n");
  input.files["ad_spend_daily.csv"] = [
    "date,channel,ad_spend,currency",
    "2026-08-01,DTC,,TWD", // MISSING_AD_SPEND
    "2026-08-01,MARKETPLACE,100.00,TWD",
    "2026-08-02,DTC,270.00,TWD", // 2026-08-02 MARKETPLACE 沒有列：MISSING_AD_DAY（line null、有日期）
  ].join("\n");
  return input;
}

const base = (patch: Partial<ValidationIssue>): ValidationIssue => ({ file: "sales_daily.csv", line: 2, date: "2026-08-01", channel: "DTC", field: "cogs_net", severity: "partial", reason_code: "MISSING_COGS", message: "domain", ...patch });

describe("issueDistribution（issue-distribution-v1）", () => {
  it("版本常數；沒有任何問題時回傳 null（不渲染 G21）：空陣列、示範資料、golden、refund_only、zero_ad", () => {
    expect(ISSUE_DISTRIBUTION_VERSION).toBe("issue-distribution-v1");
    expect(issueDistribution([])).toBeNull();
    for (const name of ["demo", "golden", "refund_only", "zero_ad"]) {
      const issues = issuesOf(fixture(name));
      expect(issues, name).toEqual([]);
      expect(issueDistribution(issues), name).toBeNull();
    }
  });

  it("fixtures/errors/missing_ad_day：只有廣告檔 × MISSING_AD_DAY 一格（1 列），single，三份檔都有列、銷售與費用兩列留白", () => {
    const issues = issuesOf(fixture("errors/missing_ad_day"));
    const distribution = issueDistribution(issues)!;
    invariants(distribution, issues);
    expect(distribution.reasons).toEqual(["MISSING_AD_DAY"]);
    expect(matrix(distribution)).toEqual([
      ["sales", [0], [0], null],
      ["costs", [0], [0], null],
      ["ads", [1], [2], "MISSING_AD_DAY"],
    ]);
    expect(distribution.rows.map(row => row.file)).toEqual(["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"]);
    expect([distribution.rowLevel, distribution.rangeLevel, distribution.cellsWithIssues, distribution.single]).toEqual([1, 0, 1, true]);
    expect(distribution.top).toEqual({ file: "ad_spend_daily.csv", fileKey: "ads", reason: "MISSING_AD_DAY", count: 1, tier: 2 });
    expect(distribution.rangeReasons).toEqual([]);
  });

  it("fixtures/errors/missing_cogs：銷售檔 × MISSING_COGS 一格（第 6 行）", () => {
    const issues = issuesOf(fixture("errors/missing_cogs"));
    const distribution = issueDistribution(issues)!;
    invariants(distribution, issues);
    expect(distribution.reasons).toEqual(["MISSING_COGS"]);
    expect(matrix(distribution)).toEqual([["sales", [1], [2], "MISSING_COGS"], ["costs", [0], [0], null], ["ads", [0], [0], null]]);
    expect(distribution.single).toBe(true);
  });

  it("4 通路合成資料：費用缺列 6 天（LIVE 9/14–9/19）、廣告缺列 5 天（LIVE 8/30–9/2、9/22）；兩格都是各檔最多；全表最多是通路費用 × MISSING_CHANNEL_COST_DAY 6 列", () => {
    const issues = issuesOf(synthetic4ChannelInput());
    expect(issues).toHaveLength(11);
    const distribution = issueDistribution(issues)!;
    invariants(distribution, issues);
    // 欄依原因碼順序：MISSING_CHANNEL_COST_DAY 在 MISSING_AD_DAY 之前（IMPORT_ISSUE_REASON_CODES.row 的末兩項）。
    expect(distribution.reasons).toEqual(["MISSING_CHANNEL_COST_DAY", "MISSING_AD_DAY"]);
    expect(matrix(distribution)).toEqual([
      ["sales", [0, 0], [0, 0], null],
      ["costs", [6, 0], [2, 0], "MISSING_CHANNEL_COST_DAY"],
      ["ads", [0, 5], [0, 2], "MISSING_AD_DAY"],
    ]);
    expect([distribution.rowLevel, distribution.rangeLevel, distribution.cellsWithIssues, distribution.single]).toEqual([11, 0, 2, false]);
    expect(distribution.top).toMatchObject({ fileKey: "costs", reason: "MISSING_CHANNEL_COST_DAY", count: 6 });
  });

  it("手算 golden（各檔多種原因、同值、範圍級 1 筆）：銷售 2／2、費用 2／1、廣告 1／1；同檔同值取原因碼順序在前者，全表同值取檔案順序在前者", () => {
    const issues = issuesOf(mixedInput());
    // 列級 4＋3＋2＝9 筆；範圍級：manifest.json 的 SALES_COVERAGE_UNCONFIRMED 1 筆。
    expect(issues).toHaveLength(10);
    const distribution = issueDistribution(issues)!;
    invariants(distribution, issues);
    expect(distribution.reasons).toEqual(["MISSING_COGS", "MISSING_GROSS_SALES", "MISSING_PLATFORM_FEES", "MISSING_PAYMENT_FEES", "MISSING_AD_SPEND", "MISSING_AD_DAY"]);
    expect(matrix(distribution)).toEqual([
      ["sales", [2, 2, 0, 0, 0, 0], [2, 1, 0, 0, 0, 0], "MISSING_COGS"],
      ["costs", [0, 0, 2, 1, 0, 0], [0, 0, 2, 1, 0, 0], "MISSING_PLATFORM_FEES"],
      ["ads", [0, 0, 0, 0, 1, 1], [0, 0, 0, 0, 2, 1], "MISSING_AD_SPEND"],
    ]);
    expect(distribution.rows.map(row => row.total)).toEqual([4, 3, 2]);
    expect([distribution.rowLevel, distribution.rangeLevel, distribution.cellsWithIssues, distribution.single]).toEqual([9, 1, 6, false]);
    expect(distribution.rangeReasons).toEqual(["SALES_COVERAGE_UNCONFIRMED"]);
    // 全表最多 2 列有三格（銷售 × MISSING_COGS、銷售 × MISSING_GROSS_SALES、費用 × MISSING_PLATFORM_FEES）：檔案順序、再原因碼順序取第一格。
    expect(distribution.top).toMatchObject({ fileKey: "sales", reason: "MISSING_COGS", count: 2, tier: 2 });
  });

  it("同值的取捨與輸入順序無關（反轉輸入得到相同結果）", () => {
    const issues = issuesOf(mixedInput());
    expect(issueDistribution([...issues].reverse())).toEqual(issueDistribution(issues));
  });

  it("範圍級問題另成一列、不進格：沒有行號也沒有日期的（$coverage、manifest.json），以及不是三份核心 CSV 的問題", () => {
    const coverage = base({ file: "ad_spend_daily.csv", line: null, date: undefined, channel: undefined, field: "$coverage", reason_code: "MISSING_AD_DAY" });
    const manifest = base({ file: "manifest.json", line: null, date: undefined, channel: undefined, field: "sales_coverage_confirmed", reason_code: "SALES_COVERAGE_UNCONFIRMED" });
    const manifestWithLine = base({ file: "manifest.json", line: 3, date: undefined, channel: undefined, field: "periods", reason_code: "INVALID_PERIOD" });
    const row = base({});
    const day = base({ file: "channel_costs_daily.csv", line: null, date: "2026-08-02", field: "$row", reason_code: "MISSING_CHANNEL_COST_DAY" });
    for (const [issue, expected] of [[coverage, false], [manifest, false], [manifestWithLine, false], [row, true], [day, true]] as const) expect(isRowLevelIssue(issue), issue.field).toBe(expected);
    const issues = [coverage, row, manifest, day, manifestWithLine];
    const distribution = issueDistribution(issues)!;
    invariants(distribution, issues);
    expect(distribution.reasons).toEqual(["MISSING_COGS", "MISSING_CHANNEL_COST_DAY"]);
    expect(matrix(distribution)).toEqual([["sales", [1, 0], [2, 0], "MISSING_COGS"], ["costs", [0, 1], [0, 2], "MISSING_CHANNEL_COST_DAY"], ["ads", [0, 0], [0, 0], null]]);
    expect([distribution.rowLevel, distribution.rangeLevel]).toEqual([2, 3]);
    // 範圍級的原因碼依原因碼順序（manifest 組在 row 組之前）。
    expect(distribution.rangeReasons).toEqual(["INVALID_PERIOD", "SALES_COVERAGE_UNCONFIRMED", "MISSING_AD_DAY"]);
    // 兩格都是 1 列：同值取檔案順序在前的銷售。
    expect(distribution.top).toMatchObject({ fileKey: "sales", reason: "MISSING_COGS", count: 1 });
    expect(distribution.single).toBe(false);
  });

  it("只有範圍級問題：沒有欄、沒有列、top 為 null、不是 single（呼叫端只畫範圍級那一列）", () => {
    const issues = issuesOf({ ...fixture("golden"), manifest: { ...(fixture("golden").manifest as object), sales_coverage_confirmed: false } });
    expect(issues.map(issue => [issue.file, issue.line, issue.reason_code])).toEqual([["manifest.json", null, "SALES_COVERAGE_UNCONFIRMED"]]);
    const distribution = issueDistribution(issues)!;
    invariants(distribution, issues);
    expect(distribution).toMatchObject({ reasons: [], rows: [], rowLevel: 0, rangeLevel: 1, rangeReasons: ["SALES_COVERAGE_UNCONFIRMED"], top: null, cellsWithIssues: 0, single: false });
  });

  it("原因碼順序：IMPORT_ISSUE_REASON_CODES 的順序；清單外的排在後面、依代碼字串排序", () => {
    expect(["MISSING_AD_DAY", "ZZZ_LOCAL", "MISSING_COGS", "AAA_LOCAL", "INVALID_DATE"].sort(compareIssueReasons)).toEqual(["INVALID_DATE", "MISSING_COGS", "MISSING_AD_DAY", "AAA_LOCAL", "ZZZ_LOCAL"]);
    expect([...ALL_IMPORT_ISSUE_REASON_CODES].sort(compareIssueReasons)).toEqual([...ALL_IMPORT_ISSUE_REASON_CODES]);
    const issues = [base({ reason_code: "ZZZ_LOCAL" }), base({ reason_code: "AAA_LOCAL" }), base({ reason_code: "ZZZ_LOCAL", line: 3 }), base({})];
    const distribution = issueDistribution(issues)!;
    invariants(distribution, issues);
    expect(distribution.reasons).toEqual(["MISSING_COGS", "AAA_LOCAL", "ZZZ_LOCAL"]);
    expect(matrix(distribution)[0]).toEqual(["sales", [1, 1, 2], [1, 1, 2], "ZZZ_LOCAL"]);
  });

  it("可序列化（JSON 來回不變），不改輸入", () => {
    const issues = issuesOf(mixedInput());
    const before = JSON.stringify(issues);
    const distribution = issueDistribution(issues)!;
    expect(JSON.parse(JSON.stringify(distribution))).toEqual(distribution);
    expect(JSON.stringify(issues)).toBe(before);
  });
});
