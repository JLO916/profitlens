import { beforeAll, describe, expect, it } from "vitest";
import { PRODUCT_PARETO_LEAD, PRODUCT_PARETO_LIMIT, PRODUCT_PARETO_VERSION, productPareto, productParetoLead, type ProductPareto } from "@/application/chart-pareto";
import { productHighlights } from "@/application/product-highlights";
import { createSnapshot, hashInput } from "@/application/workspace";
import { compareProducts, type ProductComparisonRow } from "@/domain/product-comparison";
import type { Dataset, DatasetInput } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

/*
 * V4-4 代理 A：G14「商品毛利為負的商品累計」的整理函式 productPareto（product-pareto-v1；PRD §6.4、CHART_CATALOG G14）。
 * 期望值全部是手算常數（算式寫在旁邊），不由 domain 或 application 函式算出；實際值才呼叫 productPareto。
 * 累計佔比（佔商品毛利為負合計）＝|累計| ÷ |負值合計|，12 位小數 HALF_UP（domain ratioMetric 的取位）；末筆恰為 1。
 * 輸入與商品頁相同：compareProducts(dataset, snapshot.report.scope).rows（src/components/product-comparison-panel.tsx）。
 */

async function productRows(input: DatasetInput): Promise<{ dataset: Dataset; rows: ProductComparisonRow[] }> {
  const result = validateDataset(input);
  expect(result.classification).not.toBe("blocking");
  const dataset = result.dataset!;
  const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
  return { dataset, rows: compareProducts(dataset, snapshot.report.scope).rows };
}
const id = (row: ProductComparisonRow) => `${row.sku} · ${row.channel}`;
/** 只看金額與原因碼的精簡形狀（逐列比對手算值）。 */
const shape = (pareto: ProductPareto, which: "rows" | "allRows" = "allRows") => pareto[which].map(entry => [id(entry.row), entry.value.value, entry.cumulative.value, entry.magnitude.value, entry.share.value]);

function withSales(rows: string[]): DatasetInput {
  const input = fixture();
  input.manifest = { ...(input.manifest as object), sales_coverage_confirmed: true };
  input.files["sales_daily.csv"] = "date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency\n" + rows.join("\n") + "\n";
  return input;
}
const sale = (date: string, sku: string, gross: string, cogs: string, channel = "DTC", refund = "0") => `${date},${channel},${sku},HOME,1,${gross},0,${refund},${cogs},TWD`;
const aug1 = "2026-08-01";
const aug2 = "2026-08-02";

let refundOnly: ProductComparisonRow[];
let synthetic: ProductComparisonRow[];
let golden: ProductComparisonRow[];
let demo: ProductComparisonRow[];
beforeAll(async () => {
  [refundOnly, synthetic, golden, demo] = (await Promise.all([productRows(fixture("refund_only")), productRows(synthetic4ChannelInput()), productRows(fixture("golden")), productRows(fixture("demo"))])).map(item => item.rows);
});

describe("V4-4 productPareto：版本與常數", () => {
  it("版本常數 product-pareto-v1；柱數上限 10、標題 k 上限 3", () => {
    expect(PRODUCT_PARETO_VERSION).toBe("product-pareto-v1");
    expect(PRODUCT_PARETO_LIMIT).toBe(10);
    expect(PRODUCT_PARETO_LEAD).toBe(3);
    expect(productPareto(golden, "gross_profit", 10).version).toBe("product-pareto-v1");
  });
});

describe("V4-4 productPareto：refund_only（手算 1 筆）", () => {
  it("本期 DTC · A：淨營收 0 − 0 − 100＝−100.00，商品毛利 −100.00 −（−40.00）＝−60.00 → 1 筆、累計 −60.00、佔比 60 ÷ 60＝100%", () => {
    const pareto = productPareto(refundOnly, "gross_profit", PRODUCT_PARETO_LIMIT);
    expect(pareto.count).toBe(1);
    expect(pareto.more).toBe(0);
    expect(pareto.total).toEqual({ value: "-60.00", reason_codes: [] });
    expect(pareto.totalMagnitude).toEqual({ value: "60.00", reason_codes: [] });
    expect(shape(pareto)).toEqual([["A · DTC", "-60.00", "-60.00", "60.00", "1.000000000000"]]);
    expect(shape(pareto, "rows")).toEqual(shape(pareto));
    // 末筆累計＝負值合計；末筆累計佔比 100%（不是 null）。
    expect(pareto.allRows.at(-1)!.cumulative).toEqual(pareto.total);
    expect(pareto.allRows.at(-1)!.share).toEqual({ value: "1.000000000000", reason_codes: [] });
    expect(productParetoLead(pareto)).toEqual({ k: 1, entry: pareto.allRows[0] });
  });
});

describe("V4-4 productPareto：4 通路合成資料（逐筆手算，tests/fixtures/synthetic-4-channel/README.md §5.1）", () => {
  /*
   * 本期 17 天（9/07–9/23）的商品毛利為負列（每日商品毛利＝折扣前收入 − 折扣 − 退款 − 商品成本）：
   *   SKU-201 · MARKETPLACE：17 ×（1,000 − 400 − 0 − 800）＝17 × −200＝−3,400.00
   *   SKU-301 · SOCIAL     ：17 ×（600 − 120 − 0 − 600）＝17 × −120＝−2,040.00
   *   SKU-203 · MARKETPLACE：只在 9/08、9/15、9/22 各一列（0 − 0 − 600 − 0）＝3 × −600＝−1,800.00
   *   SKU-202 · MARKETPLACE：17 ×（500 − 100 − 0 − 450）＝17 × −50＝−850.00
   *   SKU-302 · SOCIAL     ：17 ×（300 − 30 − 0 − 320）＝17 × −50＝−850.00（與 SKU-202 同值，依通路 MARKETPLACE < SOCIAL 排後）
   * 其餘 7 列本期商品毛利為正（DTC 37,400／23,800／15,300、LIVE 12,750／20,400、MARKETPLACE SKU-101 25,500、SOCIAL SKU-103 15,300），不列入、不補入。
   * 累計：−3,400；−3,400 − 2,040＝−5,440；−5,440 − 1,800＝−7,240；−7,240 − 850＝−8,090；−8,090 − 850＝−8,940（＝負值合計）。
   * 累計佔比＝取反後累計 ÷ 8,940（12 位小數 HALF_UP）：
   *   3,400 ÷ 8,940＝170 ÷ 447＝0.380313199105|1… → 0.380313199105
   *   5,440 ÷ 8,940＝272 ÷ 447＝0.608501118568|2… → 0.608501118568
   *   7,240 ÷ 8,940＝362 ÷ 447＝0.809843400447|4… → 0.809843400447
   *   8,090 ÷ 8,940＝809 ÷ 894＝0.904921700223|7… → 0.904921700224（第 13 位 7 進位）
   *   8,940 ÷ 8,940＝1.000000000000
   */
  const EXPECTED = [
    ["SKU-201 · MARKETPLACE", "-3400.00", "-3400.00", "3400.00", "0.380313199105"],
    ["SKU-301 · SOCIAL", "-2040.00", "-5440.00", "5440.00", "0.608501118568"],
    ["SKU-203 · MARKETPLACE", "-1800.00", "-7240.00", "7240.00", "0.809843400447"],
    ["SKU-202 · MARKETPLACE", "-850.00", "-8090.00", "8090.00", "0.904921700224"],
    ["SKU-302 · SOCIAL", "-850.00", "-8940.00", "8940.00", "1.000000000000"],
  ];

  it("5 筆、負值合計 −8,940.00；逐筆值、累計、取反後累計與累計佔比等於手算", () => {
    expect(synthetic).toHaveLength(12);
    const pareto = productPareto(synthetic, "gross_profit", PRODUCT_PARETO_LIMIT);
    expect(pareto.count).toBe(5);
    expect(pareto.more).toBe(0);
    expect(pareto.total).toEqual({ value: "-8940.00", reason_codes: [] });
    expect(pareto.totalMagnitude).toEqual({ value: "8940.00", reason_codes: [] });
    expect(shape(pareto)).toEqual(EXPECTED);
    expect(shape(pareto, "rows")).toEqual(EXPECTED);
    for (const entry of pareto.allRows) {
      expect(entry.share.value, id(entry.row)).not.toBeNull();
      expect(entry.cumulative.reason_codes).toEqual([]);
      // value 逐字取自 domain 的本期商品毛利。
      expect(entry.value).toEqual(entry.row.current.metrics.gross_profit);
    }
    // 末筆累計＝負值合計；末筆累計佔比 100%。
    expect(pareto.allRows.at(-1)!.cumulative).toEqual(pareto.total);
    expect(pareto.allRows.at(-1)!.share.value).toBe("1.000000000000");
    // 標題「5 個商品毛利為負，前 3 個佔 81.0%」：k＝min(3, 5)＝3，第 3 筆的累計佔比 0.809843400447。
    const lead = productParetoLead(pareto)!;
    expect(lead.k).toBe(3);
    expect(lead.entry.share.value).toBe("0.809843400447");
  });

  it("limit 小於筆數：rows 只取前 limit 筆（allRows 的前段），more＝其餘筆數；allRows 仍是全部，末筆累計佔比 100%", () => {
    const pareto = productPareto(synthetic, "gross_profit", 2);
    expect(shape(pareto, "rows")).toEqual(EXPECTED.slice(0, 2));
    expect(pareto.rows.every((entry, index) => entry === pareto.allRows[index])).toBe(true);
    expect(pareto.count).toBe(5);
    expect(pareto.more).toBe(3);
    expect(shape(pareto)).toEqual(EXPECTED);
    expect(productPareto(synthetic, "gross_profit", 0)).toMatchObject({ rows: [], count: 5, more: 5 });
    expect(productPareto(synthetic, "gross_profit", 999).more).toBe(0);
  });

  it("不補入非負的列（product-worst 的 worstCurrent 會補），輸出沒有任何合計列：每筆都是輸入中的原列、商品毛利 < 0", () => {
    const pareto = productPareto(synthetic, "gross_profit", PRODUCT_PARETO_LIMIT);
    // worstCurrent 取 10 個（含 5 個非負）；Pareto 只有 5 個。
    expect(productHighlights(synthetic).worstCurrent).toHaveLength(10);
    expect(pareto.allRows.map(entry => entry.row)).toEqual(productHighlights(synthetic).worstCurrent.slice(0, 5));
    for (const entry of pareto.allRows) {
      expect(synthetic.includes(entry.row)).toBe(true);
      expect(entry.value.value!.startsWith("-")).toBe(true);
    }
    expect(new Set(pareto.allRows.map(entry => entry.row)).size).toBe(pareto.allRows.length);
  });
});

describe("V4-4 productPareto：沒有商品毛利為負（golden、示範資料）", () => {
  it("golden 本期 540.00／200.00／280.00／125.00 都 > 0；示範資料本期也沒有負值 → count＝0、沒有列、合計 0.00、沒有標題那一筆", () => {
    for (const rows of [golden, demo]) {
      expect(rows.length).toBeGreaterThan(0);
      const pareto = productPareto(rows, "gross_profit", PRODUCT_PARETO_LIMIT);
      expect(pareto).toEqual({ version: PRODUCT_PARETO_VERSION, metric: "gross_profit", rows: [], allRows: [], total: { value: "0.00", reason_codes: [] }, totalMagnitude: { value: "0.00", reason_codes: [] }, count: 0, more: 0 });
      expect(productParetoLead(pareto)).toBeNull();
    }
    expect(productPareto([], "gross_profit", 10).count).toBe(0);
  });
});

describe("V4-4 productPareto：排序、排除與輸入檢查", () => {
  it("同值依通路、SKU；商品毛利 0、正值、待補（缺成本）與只在上期出現（本期確認為 0）的列不列入", () => {
    // 本期（8/02）：DTC/Z 10 − 60＝−50.00；DTC/B、DTC/A、MARKETPLACE/A 各 10 − 30＝−20.00；DTC/ZERO 30 − 30＝0.00；DTC/UP 100 − 40＝60.00；
    // DTC/NULL 缺成本（商品毛利待補）；DTC/EXIT 只在 8/01 有列（本期確認為 0.00）。
    const rows = compareProducts(validateDataset(withSales([
      sale(aug2, "B", "10", "30"), sale(aug2, "A", "10", "30", "MARKETPLACE"), sale(aug2, "A", "10", "30"), sale(aug2, "Z", "10", "60"),
      sale(aug2, "ZERO", "30", "30"), sale(aug2, "UP", "100", "40"), sale(aug2, "NULL", "100", ""), sale(aug1, "EXIT", "100", "40"),
    ])).dataset!).rows;
    expect(rows.find(row => row.sku === "NULL")!.current.metrics.gross_profit.value).toBeNull();
    const pareto = productPareto(rows, "gross_profit", PRODUCT_PARETO_LIMIT);
    // 累計：−50；−70；−90；−110（負值合計）。佔比：50 ÷ 110＝0.454545454545|45… → 0.454545454545；70 ÷ 110＝0.636363636363|63… → 0.636363636364；
    // 90 ÷ 110＝0.818181818181|81… → 0.818181818182；110 ÷ 110＝1。
    expect(shape(pareto)).toEqual([
      ["Z · DTC", "-50.00", "-50.00", "50.00", "0.454545454545"],
      ["A · DTC", "-20.00", "-70.00", "70.00", "0.636363636364"],
      ["B · DTC", "-20.00", "-90.00", "90.00", "0.818181818182"],
      ["A · MARKETPLACE", "-20.00", "-110.00", "110.00", "1.000000000000"],
    ]);
    expect(pareto.total.value).toBe("-110.00");
    // 輸入順序不影響輸出；不改原陣列。
    const before = structuredClone(rows);
    expect(shape(productPareto([...rows].reverse(), "gross_profit", 10))).toEqual(shape(pareto));
    expect(rows).toEqual(before);
  });

  it("用 bigint 分位比較與加總，超過 Number 精度的金額仍排對、累計到分", () => {
    // 本期 A：0 − 9,007,199,254,740,993.02＝−9007199254740993.02；Z：0 − 9,007,199,254,740,993.01＝−9007199254740993.01。
    const rows = compareProducts(validateDataset(withSales([sale(aug2, "Z", "0", "9007199254740993.01"), sale(aug2, "A", "0", "9007199254740993.02")])).dataset!).rows;
    const pareto = productPareto(rows, "gross_profit", 10);
    expect(pareto.allRows.map(entry => [entry.row.sku, entry.value.value, entry.cumulative.value])).toEqual([
      ["A", "-9007199254740993.02", "-9007199254740993.02"],
      ["Z", "-9007199254740993.01", "-18014398509481986.03"],
    ]);
    expect(pareto.allRows.at(-1)!.share.value).toBe("1.000000000000");
  });

  it("limit 必須是 ≥ 0 的整數；只支援商品毛利", () => {
    for (const limit of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) expect(() => productPareto(golden, "gross_profit", limit)).toThrow(RangeError);
    expect(() => productPareto(golden, "net_revenue" as "gross_profit", 10)).toThrow(TypeError);
  });

  it("輸出可序列化（JSON 來回相同）", () => {
    const pareto = productPareto(synthetic, "gross_profit", 3);
    expect(JSON.parse(JSON.stringify(pareto))).toEqual(pareto);
  });
});
