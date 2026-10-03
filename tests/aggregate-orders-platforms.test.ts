import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { validateDataset } from "../src/domain/validation";

/**
 * 三個平台的去識別化樣本（tests/fixtures/source-samples）跑 scripts/aggregate_orders.py ＋ scripts/rules/*.rules.json，
 * 比對手算（含稅 5%，逐列 ÷ 1.05 ROUND_HALF_UP）。手算過程寫在每個案例的註解。
 */
const script = resolve("scripts/aggregate_orders.py");
const samples = resolve("tests/fixtures/source-samples");
const rules = resolve("scripts/rules");
function run(orders: string, rulesFile: string) {
  const out = mkdtempSync(join(tmpdir(), "profitlens-agg-"));
  const result = spawnSync("python3", [script, "--orders", orders, "--rules", rulesFile, "--out", out], { encoding: "utf8" });
  if (result.error) throw result.error;
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0);
  const text = readFileSync(join(out, "sales_daily.csv"), "utf8").replace(/^﻿/, "");
  const [header, ...lines] = text.trim().split(/\r?\n/);
  const keys = header.split(",");
  const rows = lines.map(line => Object.fromEntries(keys.map((key, index) => [key, line.split(",")[index]])));
  const find = (date: string, sku: string) => rows.find(row => row.date === date && row.sku === sku)!;
  return { out, rows, find };
}

describe("scripts/aggregate_orders.py — platform samples (hand-computed)", () => {
  it("Shopee 訂單匯出：單價×數量、訂單層優惠券兩欄相加後按比例分攤、不成立排除", () => {
    // 訂單 2608010A1B2C3D：烏龍 520×2=1040、玻璃杯 350×1=350，優惠券 50+0：1040/1390×50=37.41，餘 12.59 給最後一列。
    //   換算：1040/1.05=990.476→990.48；350/1.05=333.33；37.41/1.05=35.63；12.59/1.05=11.99。
    // 訂單 E5F6G7H：綠茶 399×3=1197 → 1140.00，無折扣。J8K9L0M 不成立 → 排除。
    // 訂單 N1P2Q3R：玻璃杯 315×2=630、綠茶 399×1=399，折扣 30：630/1029×30=18.37，餘 11.63 → 600.00／17.50、380.00／11.08。
    // 08-03：S4T5U6V 烏龍 520×2=1040 → 990.48；W7X8Y9Z 玻璃杯 350×1 → 333.33、綠茶 399×2=798 → 760.00（運送中仍計入）。
    const { rows, find } = run(join(samples, "shopee_orders.csv"), join(rules, "shopee_orders.rules.json"));
    expect(rows).toHaveLength(8);
    expect(rows.every(row => row.channel === "蝦皮" && row.currency === "TWD" && row.cogs_net === "")).toBe(true);
    expect(find("2026-08-01", "TEA-OOLONG-150G")).toMatchObject({ units_sold: "2", gross_sales: "990.48", discounts: "35.63", refunds: "0.00" });
    expect(find("2026-08-01", "CUP-GLASS-350")).toMatchObject({ units_sold: "1", gross_sales: "333.33", discounts: "11.99" });
    expect(find("2026-08-01", "TEA-GREEN-100G")).toMatchObject({ units_sold: "3", gross_sales: "1140.00", discounts: "0.00" });
    expect(find("2026-08-02", "CUP-GLASS-350")).toMatchObject({ units_sold: "2", gross_sales: "600.00", discounts: "17.50" });
    expect(find("2026-08-02", "TEA-GREEN-100G")).toMatchObject({ units_sold: "1", gross_sales: "380.00", discounts: "11.08" });
    expect(find("2026-08-03", "TEA-OOLONG-150G")).toMatchObject({ units_sold: "2", gross_sales: "990.48", discounts: "0.00" });
    expect(find("2026-08-03", "CUP-GLASS-350")).toMatchObject({ units_sold: "1", gross_sales: "333.33", discounts: "0.00" });
    expect(find("2026-08-03", "TEA-GREEN-100G")).toMatchObject({ units_sold: "2", gross_sales: "760.00", discounts: "0.00" });
  });

  it("momo 店+ 對帳明細：單筆售價×數量、總折扣金額逐列、退貨列排除、以商品原廠編號當 SKU", () => {
    // 08-01：SYN-CUP-500 690×2=1380（折 100）＋ 690×1=690 → 1314.29＋657.14＝1971.43，折 95.24；SYN-BAG-01 890 → 847.62；SYN-DRIP-02 1280（折 128）→ 1219.05／121.90。
    // 08-02：SYN-DRIP-02 1280×2=2560（折 256）→ 2438.10／243.81；SYN-BAG-01 890（折 89）→ 847.62／84.76；W7X8Y9Z 退貨 → 排除。
    // 08-03：SYN-CUP-500 690×3=2070（折 207）→ 1971.43／197.14；SYN-BAG-01 890×2=1780 → 1695.24；SYN-DRIP-02 1280 → 1219.05。
    const { rows, find } = run(join(samples, "momo_store_plus.csv"), join(rules, "momo_store_plus.rules.json"));
    expect(rows).toHaveLength(8);
    expect(rows.every(row => row.channel === "momo")).toBe(true);
    expect(find("2026-08-01", "SYN-CUP-500")).toMatchObject({ units_sold: "3", gross_sales: "1971.43", discounts: "95.24" });
    expect(find("2026-08-01", "SYN-BAG-01")).toMatchObject({ units_sold: "1", gross_sales: "847.62", discounts: "0.00" });
    expect(find("2026-08-01", "SYN-DRIP-02")).toMatchObject({ units_sold: "1", gross_sales: "1219.05", discounts: "121.90" });
    expect(find("2026-08-02", "SYN-DRIP-02")).toMatchObject({ units_sold: "2", gross_sales: "2438.10", discounts: "243.81" });
    expect(find("2026-08-02", "SYN-BAG-01")).toMatchObject({ units_sold: "1", gross_sales: "847.62", discounts: "84.76" });
    expect(find("2026-08-03", "SYN-CUP-500")).toMatchObject({ units_sold: "3", gross_sales: "1971.43", discounts: "197.14" });
    expect(find("2026-08-03", "SYN-BAG-01")).toMatchObject({ units_sold: "2", gross_sales: "1695.24", discounts: "0.00" });
    expect(find("2026-08-03", "SYN-DRIP-02")).toMatchObject({ units_sold: "1", gross_sales: "1219.05", discounts: "0.00" });
  });

  it("91APP 訂單匯出：商品總金額當列金額、負數訂單總折扣取絕對值、已取消排除、商品總成本當未稅成本", () => {
    // 08-01：A01-TEE 1180（折 −118，成本 420）→ 1123.81／112.38；B02-CAP 450（折 −95，成本 160）→ 428.57／90.48；C03-SOCK 897（折 −20，成本 285）→ 854.29／19.05；X00004 已取消 → 排除。
    // 08-02：B02-CAP 900（折 90）→ 857.14／85.71，成本 320；C03-SOCK 299（折 30）＋ 598（折 0）→ 284.76＋569.52＝854.28／28.57，成本 95＋190；A01-TEE 590（折 59，已確認待出貨保留）→ 561.90／56.19，成本 210。
    // 08-03：A01-TEE 1770（折 327）→ 1685.71／311.43，成本 630；B02-CAP 450（折 45）＋ 450 → 857.14／42.86，成本 320。
    const { out, rows, find } = run(join(samples, "91app_orders.csv"), join(rules, "91app_orders.rules.json"));
    expect(rows).toHaveLength(8);
    expect(find("2026-08-01", "A01-TEE")).toMatchObject({ units_sold: "2", gross_sales: "1123.81", discounts: "112.38", cogs_net: "420.00" });
    expect(find("2026-08-01", "B02-CAP")).toMatchObject({ units_sold: "1", gross_sales: "428.57", discounts: "90.48", cogs_net: "160.00" });
    expect(find("2026-08-01", "C03-SOCK")).toMatchObject({ units_sold: "3", gross_sales: "854.29", discounts: "19.05", cogs_net: "285.00" });
    expect(find("2026-08-02", "B02-CAP")).toMatchObject({ units_sold: "2", gross_sales: "857.14", discounts: "85.71", cogs_net: "320.00" });
    expect(find("2026-08-02", "C03-SOCK")).toMatchObject({ units_sold: "3", gross_sales: "854.28", discounts: "28.57", cogs_net: "285.00" });
    expect(find("2026-08-02", "A01-TEE")).toMatchObject({ units_sold: "1", gross_sales: "561.90", discounts: "56.19", cogs_net: "210.00" });
    expect(find("2026-08-03", "A01-TEE")).toMatchObject({ units_sold: "3", gross_sales: "1685.71", discounts: "311.43", cogs_net: "630.00" });
    expect(find("2026-08-03", "B02-CAP")).toMatchObject({ units_sold: "2", gross_sales: "857.14", discounts: "42.86", cogs_net: "320.00" });
    // 三份輸出可直接通過 validateDataset（費用／廣告為 0 佔位，成本齊全 → valid）。
    const files = Object.fromEntries(["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"].map(name => [name, readFileSync(join(out, name), "utf8")]));
    const manifest = { schema_version: "1.0", dataset_id: "91app-sample", source_type: "user_provided", currency: "TWD", timezone: "Asia/Taipei", data_as_of: "2026-08-04", coverage_start: "2026-08-01", coverage_end: "2026-08-03", channels: ["官網"], previous_period: { start: "2026-08-01", end: "2026-08-01" }, current_period: { start: "2026-08-02", end: "2026-08-02" }, sales_coverage_confirmed: true, comparison_mode: "same_days", amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income" };
    expect(validateDataset({ manifest, files }).classification).toBe("valid");
  });

  it("rejects rules that give both line_amount and unit_price, or both discount kinds", () => {
    const base = JSON.parse(readFileSync(join(rules, "91app_orders.rules.json"), "utf8")) as { columns: Record<string, unknown> };
    for (const extra of [{ unit_price: "商品單價" }, { order_discount: "折價券折扣金額" }]) {
      const dir = mkdtempSync(join(tmpdir(), "profitlens-agg-bad-"));
      const file = join(dir, "rules.json");
      writeFileSync(file, JSON.stringify({ ...base, columns: { ...base.columns, ...extra } }));
      const result = spawnSync("python3", [script, "--orders", join(samples, "91app_orders.csv"), "--rules", file, "--out", dir], { encoding: "utf8" });
      expect(result.status).toBe(2);
      expect(result.stderr).toMatch(/二擇一/);
    }
  });
});
