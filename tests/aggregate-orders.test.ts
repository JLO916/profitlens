import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { validateDataset } from "../src/domain/validation";

// R3 §4.3 / D5：訂單明細 → 日 × 通路 × SKU 的 CLI 彙總（scripts/aggregate_orders.py）。
// python3 不存在時 spawnSync 會回傳 error，測試直接失敗，不 skip。
//
// Fixture：tests/fixtures/orders_sample/orders.csv（9 列訂單明細，含稅 5%）＋ rules.json
//   官網 → DTC、蝦皮 → MARKETPLACE；已取消的訂單丟棄；成本為未稅單位成本（cogs 不換算）。
//
// 手算（含稅 ÷ 1.05，逐列 ROUND_HALF_UP 2 位後才加總）：
//   第 2 行 O1001 DTC A001 ×2 1050.00，第 3 行 O1001 DTC B002 ×1 525.00，訂單折扣 100.00（兩列重複同一值）
//     分攤：A001 100 × 1050 / 1575 = 66.666… → 66.67；最後一列 B002 = 100 − 66.67 = 33.33
//     換算：gross 1050 / 1.05 = 1000.00；525 / 1.05 = 500.00
//           disc 66.67 / 1.05 = 63.495238… → 63.50；33.33 / 1.05 = 31.742857… → 31.74
//     成本：A001 2 × 400 = 800.00；B002 1 × 300 = 300.00
//   第 4 行 O1002 DTC A001 ×1 525.00 → 500.00；成本 400.00
//   第 5 行 O1003 MARKETPLACE B002 ×3 "1,575.00" → 1575 / 1.05 = 1500.00；成本 900.00
//           退款 315.00（退款日 2026/08/02）→ 300.00，記在 2026-08-02 MARKETPLACE B002
//   第 6 行 O1004 已取消 → 丟棄
//   第 7 行 O1005 DTC A001 ×1 499.00 → 475.238095… → 475.24；成本 400.00
//   第 8 行 O1005 DTC B002 ×1 199.00 → 189.523809… → 189.52；成本 300.00
//   第 9 行 O1006 MARKETPLACE A001 ×2 1000.00 → 952.380952… → 952.38；成本空白（未知）
//   第 10 行 O1007 MARKETPLACE A001 ×1 500.00 → 476.190476… → 476.19；成本 400.00
//
// 彙總後 sales_daily.csv：
//   2026-08-01 DTC A001：件數 2+1=3；gross 1000.00+500.00=1500.00；disc 63.50；refund 0.00；cogs 800+400=1200.00
//   2026-08-01 DTC B002：1；500.00；31.74；0.00；300.00
//   2026-08-01 MARKETPLACE B002：3；1500.00；0.00；0.00（退款不在訂單日）；900.00
//   2026-08-02 DTC A001：1；475.24；0.00；0.00；400.00
//   2026-08-02 DTC B002：1；189.52；0.00；0.00；300.00
//   2026-08-02 MARKETPLACE A001：2+1=3；952.38+476.19=1428.57；0.00；0.00；cogs 留白（第 9 行未知，不當 0）
//   2026-08-02 MARKETPLACE B002：0；0.00；0.00；300.00（退款日入帳）；0.00（有成本規則、當日無銷售）
// 合計：件數 12；gross 5593.33（含稅原值 5873.00）；disc 95.24（原值 100.00）；refund 300.00（原值 315.00）
// 費用與廣告：日 × 通路 4 列，全部 0 佔位。

const repoRoot = resolve(__dirname, "..");
const script = join(repoRoot, "scripts", "aggregate_orders.py");
const fixtureDir = join(repoRoot, "tests", "fixtures", "orders_sample");
const workDir = mkdtempSync(join(tmpdir(), "profitlens-aggregate-"));

afterAll(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function runAggregate(orders: string, rules: string, out: string) {
  const result = spawnSync("python3", [script, "--orders", orders, "--rules", rules, "--out", out], { encoding: "utf8", cwd: repoRoot });
  if (result.error) throw new Error(`python3 could not be started: ${result.error.message}`);
  return result;
}

function writeCase(name: string, orders: string, rules: object) {
  const dir = join(workDir, name);
  rmSync(dir, { recursive: true, force: true });
  const ordersPath = join(workDir, `${name}.orders.csv`);
  const rulesPath = join(workDir, `${name}.rules.json`);
  writeFileSync(ordersPath, orders, "utf8");
  writeFileSync(rulesPath, JSON.stringify(rules), "utf8");
  return { ordersPath, rulesPath, outDir: dir };
}

const baseRules = JSON.parse(readFileSync(join(fixtureDir, "rules.json"), "utf8")) as Record<string, unknown>;
const ordersHeader = "訂單號碼,訂單日期,訂單狀態,銷售通路,商品貨號,分類,數量,商品小計,訂單折扣,退款金額,退款日期,單位成本";

describe("scripts/aggregate_orders.py — hand-computed fixture", () => {
  const outDir = join(workDir, "sample");
  const run = runAggregate(join(fixtureDir, "orders.csv"), join(fixtureDir, "rules.json"), outDir);
  const read = (file: string) => readFileSync(join(outDir, file), "utf8");

  it("exits 0 and reports read/kept/dropped counts", () => {
    expect(run.stderr).toBe("");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("9");
    expect(run.stdout).toContain("8");
  });

  it("writes sales_daily.csv aggregated by date × channel × sku with the hand-computed amounts", () => {
    expect(read("sales_daily.csv")).toBe([
      "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency",
      "2026-08-01,DTC,A001,保養,3,1500.00,63.50,0.00,1200.00,TWD",
      "2026-08-01,DTC,B002,彩妝,1,500.00,31.74,0.00,300.00,TWD",
      "2026-08-01,MARKETPLACE,B002,彩妝,3,1500.00,0.00,0.00,900.00,TWD",
      "2026-08-02,DTC,A001,保養,1,475.24,0.00,0.00,400.00,TWD",
      "2026-08-02,DTC,B002,彩妝,1,189.52,0.00,0.00,300.00,TWD",
      "2026-08-02,MARKETPLACE,A001,保養,3,1428.57,0.00,0.00,,TWD",
      "2026-08-02,MARKETPLACE,B002,彩妝,0,0.00,0.00,300.00,0.00,TWD",
      "",
    ].join("\n"));
  });

  it("writes zero placeholder rows for every date × channel in sales", () => {
    expect(read("channel_costs_daily.csv")).toBe([
      "date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency",
      "2026-08-01,DTC,0.00,0.00,0.00,0.00,TWD",
      "2026-08-01,MARKETPLACE,0.00,0.00,0.00,0.00,TWD",
      "2026-08-02,DTC,0.00,0.00,0.00,0.00,TWD",
      "2026-08-02,MARKETPLACE,0.00,0.00,0.00,0.00,TWD",
      "",
    ].join("\n"));
    expect(read("ad_spend_daily.csv")).toBe([
      "date,channel,ad_spend,currency",
      "2026-08-01,DTC,0.00,TWD",
      "2026-08-01,MARKETPLACE,0.00,TWD",
      "2026-08-02,DTC,0.00,TWD",
      "2026-08-02,MARKETPLACE,0.00,TWD",
      "",
    ].join("\n"));
  });

  it("writes aggregation_log.md with drops, reconciliation, tax summary and the placeholder warning", () => {
    const log = read("aggregation_log.md");
    expect(log).toContain("讀取資料列：9");
    expect(log).toContain("保留：8");
    expect(log).toContain("丟棄：1");
    expect(log).toContain("訂單狀態＝已取消（exclude_status）：1 列（第 6 行）");
    expect(log).toContain("| units_sold | 12 | 12 | 是 |");
    expect(log).toContain("| gross_sales | 5593.33 | 5593.33 | 是 |");
    expect(log).toContain("| discounts | 95.24 | 95.24 | 是 |");
    expect(log).toContain("| refunds | 300.00 | 300.00 | 是 |");
    expect(log).toContain("第 9 行");
    expect(log).toContain("| gross_sales | 8 | 5873.00 | 5593.33 | 5593.33 | 0.00 |");
    expect(log).toContain("| discounts | 2 | 100.00 | 95.24 | 95.24 | 0.00 |");
    expect(log).toContain("| refunds | 1 | 315.00 | 300.00 | 300.00 | 0.00 |");
    expect(log).toContain("**金額全部是 0**");
  });

  it("produces files the domain validator accepts (only the unknown-cost row is partial)", () => {
    const result = validateDataset({
      manifest: {
        schema_version: "1.0", dataset_id: "aggregate-orders-test", source_type: "user_provided", currency: "TWD", timezone: "Asia/Taipei",
        data_as_of: "2026-08-03", coverage_start: "2026-08-01", coverage_end: "2026-08-02", channels: ["DTC", "MARKETPLACE"],
        previous_period: { start: "2026-08-01", end: "2026-08-01" }, current_period: { start: "2026-08-02", end: "2026-08-02" },
        sales_coverage_confirmed: true, amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income",
      },
      files: { "sales_daily.csv": read("sales_daily.csv"), "channel_costs_daily.csv": read("channel_costs_daily.csv"), "ad_spend_daily.csv": read("ad_spend_daily.csv") },
    });
    expect(result.issues.filter(issue => issue.severity === "blocking")).toEqual([]);
    expect(result.classification).toBe("partial");
    expect(result.issues.map(issue => issue.reason_code)).toContain("MISSING_COGS");
  });
});

describe("scripts/aggregate_orders.py — rounding remainder and inputs", () => {
  it("puts the discount rounding remainder on the last line of the order (exclusive amounts, no tax)", () => {
    // 訂單 X1 三列各 100.00，訂單折扣 10.00：前兩列 10 × 100 / 300 = 3.333… → 3.33；最後一列 10 − 6.66 = 3.34
    // 三列同 SKU 同日同通路 → discounts 3.33 + 3.33 + 3.34 = 10.00；gross 300.00；件數 3
    const orders = [ordersHeader,
      "X1,2026-08-05,已完成,官網,A001,保養,1,100.00,10.00,,,",
      "X1,2026-08-05,已完成,官網,A001,保養,1,100.00,10.00,,,",
      "X1,2026-08-05,已完成,官網,A001,保養,1,100.00,,,,",
      ""].join("\n");
    const { ordersPath, rulesPath, outDir } = writeCase("remainder", orders, { ...baseRules, inclusive_tax: false });
    const run = runAggregate(ordersPath, rulesPath, outDir);
    expect(run.status).toBe(0);
    expect(readFileSync(join(outDir, "sales_daily.csv"), "utf8")).toBe(
      "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency\n2026-08-05,DTC,A001,保養,3,300.00,10.00,0.00,,TWD\n",
    );
    const log = readFileSync(join(outDir, "aggregation_log.md"), "utf8");
    expect(log).toContain("inclusive_tax = false");
  });

  it("shows the per-line vs whole conversion difference in the tax summary", () => {
    // 三列各含稅 1.00：逐列 0.95 × 3 = 2.85；合計後 3.00 / 1.05 = 2.857… → 2.86；差 −0.01
    const orders = [ordersHeader,
      "Y1,2026-08-05,已完成,官網,A001,保養,1,1.00,,,,1",
      "Y2,2026-08-05,已完成,官網,A001,保養,1,1.00,,,,1",
      "Y3,2026-08-05,已完成,官網,A001,保養,1,1.00,,,,1",
      ""].join("\n");
    const { ordersPath, rulesPath, outDir } = writeCase("per-line", orders, baseRules);
    const run = runAggregate(ordersPath, rulesPath, outDir);
    expect(run.status).toBe(0);
    expect(readFileSync(join(outDir, "sales_daily.csv"), "utf8")).toContain("2026-08-05,DTC,A001,保養,3,2.85,0.00,0.00,3.00,TWD");
    expect(readFileSync(join(outDir, "aggregation_log.md"), "utf8")).toContain("| gross_sales | 3 | 3.00 | 2.85 | 2.86 | -0.01 |");
  });
});

describe("scripts/aggregate_orders.py — bad input exits non-zero with a clear message", () => {
  it("exits 2 when rules point to a column that is not in the order file", () => {
    const { ordersPath, rulesPath, outDir } = writeCase("missing-column", `${ordersHeader}\n`, { ...baseRules, columns: { ...(baseRules.columns as object), sku: "商品代碼" } });
    const run = runAggregate(ordersPath, rulesPath, outDir);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("columns.sku");
    expect(run.stderr).toContain("商品代碼");
  });

  it("exits 2 when inclusive_tax is missing", () => {
    const rules: Record<string, unknown> = { ...baseRules };
    delete rules.inclusive_tax;
    const { ordersPath, rulesPath, outDir } = writeCase("no-tax-flag", `${ordersHeader}\n`, rules);
    const run = runAggregate(ordersPath, rulesPath, outDir);
    expect(run.status).toBe(2);
    expect(run.stderr).toContain("inclusive_tax");
  });

  it("exits 1 with line numbers for bad dates, bad amounts and refunds without a refund date, and writes nothing", () => {
    const orders = [ordersHeader,
      "Z1,2026-13-40,已完成,官網,A001,保養,1,100.00,,,,",
      "Z2,2026-08-05,已完成,官網,A001,保養,1,$1x0,,,,",
      "Z3,2026-08-05,已完成,官網,A001,保養,1,100.00,,50.00,,",
      ""].join("\n");
    const { ordersPath, rulesPath, outDir } = writeCase("bad-rows", orders, baseRules);
    const run = runAggregate(ordersPath, rulesPath, outDir);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("第 2 行");
    expect(run.stderr).toContain("第 3 行");
    expect(run.stderr).toContain("第 4 行");
    expect(() => readFileSync(join(outDir, "sales_daily.csv"), "utf8")).toThrow();
  });

  it("exits 1 when one order carries two different order discounts", () => {
    const orders = [ordersHeader,
      "W1,2026-08-05,已完成,官網,A001,保養,1,100.00,10.00,,,",
      "W1,2026-08-05,已完成,官網,B002,彩妝,1,100.00,20.00,,,",
      ""].join("\n");
    const { ordersPath, rulesPath, outDir } = writeCase("discount-conflict", orders, baseRules);
    const run = runAggregate(ordersPath, rulesPath, outDir);
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("W1");
  });
});
