import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Decimal from "decimal.js";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPnlTable, PNL_DAY_COLUMN_LIMIT, PNL_NO_DAILY_ROWS, PNL_ROWS, type PnlMetric, type PnlTable } from "../src/application/pnl-table";
import { formatRateL1 } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { validateDataset } from "../src/domain/validation";
import { expected, fixture } from "./helpers/fixtures";

/*
 * V3-9a F9 每日／每週管理損益表（PRD §10.1 F9、§9.3；D-V3-19＝A）：只重新呈現既有彙總，所以每日、每週各欄加總都必須等於期間合計（golden 到分）。
 * golden（fixtures/golden/expected.json，本期 2026-08-02 一天、兩個通路）手算：
 *   原價收入 1400＋400＋800＋500＝3100.00；折扣 210＋20＋120＋100＝450.00；退款 70＋20＋40＋50＝180.00；淨營收 3100 − 450 − 180＝2470.00
 *   商品成本 580＋160＋360＋225＝1325.00；商品毛利 2470 − 1325＝1145.00
 *   平台抽成 0＋120＝120.00；金流 44＋22＝66.00；物流 140＋85＝225.00；其他 16＋13＝29.00；扣廣告前貢獻 1145 − 120 − 66 − 225 − 29＝705.00
 *   廣告 270＋180＝450.00；扣廣告後貢獻 705 − 450＝255.00
 * 佔淨營收 %（合計 ÷ 淨營收合計，HALF_UP 4 位）：
 *   扣廣告後貢獻 255.00 ÷ 2470.00 ＝ 0.103238866… → 0.1032（畫面 L1 從精確值取一位：10.3%）
 *   商品毛利 1145.00 ÷ 2470.00 ＝ 0.463562753… → 0.4636；廣告投放費 450.00 ÷ 2470.00 ＝ 0.182186234… → 0.1822；淨營收 2470 ÷ 2470 ＝ 1.0000
 */

const csvMoney = (value: string) => new Decimal(value);
async function load(name: string): Promise<WorkspaceSnapshot> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}
/** 一列各欄（日或週）相加，到分字串；有任何空格就回傳 null（缺的不是零）。 */
function columnSum(table: PnlTable, metric: PnlMetric): string | null {
  const row = table.rows.find(item => item.metric === metric)!;
  if (row.cells.some(cell => cell.metric.value === null)) return null;
  return row.cells.reduce((total, cell) => total.plus(cell.metric.value!), new Decimal(0)).toFixed(2);
}
const ROW_ORDER: PnlMetric[] = ["gross_sales", "discounts", "refunds", "net_revenue", "cogs_net", "gross_profit", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "contribution_before_marketing", "ad_spend", "contribution_after_marketing"];

let golden: WorkspaceSnapshot, demo: WorkspaceSnapshot;
beforeAll(async () => { [golden, demo] = await Promise.all([load("golden"), load("demo")]); });

describe("F9 列與欄的結構", () => {
  it("列的順序固定（四層與費用項），kind 與「減：」標記依 §9.3", () => {
    const table = buildPnlTable(golden, "day");
    expect(table.rows.map(row => row.metric)).toEqual(ROW_ORDER);
    expect(PNL_ROWS.map(row => row.metric)).toEqual(ROW_ORDER);
    const kinds = Object.fromEntries(table.rows.map(row => [row.metric, row.kind]));
    expect(Object.entries(kinds).filter(([, kind]) => kind === "subtotal").map(([metric]) => metric)).toEqual(["net_revenue", "gross_profit", "contribution_before_marketing"]);
    expect(Object.entries(kinds).filter(([, kind]) => kind === "total").map(([metric]) => metric)).toEqual(["contribution_after_marketing"]);
    expect(table.rows.filter(row => row.deduct).map(row => row.metric)).toEqual(["discounts", "refunds", "cogs_net", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"]);
    for (const row of table.rows) expect(row.deduct, row.metric).toBe(row.kind === "item" && row.metric !== "gross_sales");
  });

  it("日欄＝本期每一天（ISO 日期），週欄＝snapshot.weeks 的本期週（標籤與起訖沿用既有 WeeklyRow）", () => {
    expect(buildPnlTable(golden, "day").columns).toEqual([{ id: "2026-08-02", granularity: "day", period: { start: "2026-08-02", end: "2026-08-02" }, label: "2026-08-02", hasData: true }]);
    const demoDays = buildPnlTable(demo, "day");
    expect(demoDays.columns).toHaveLength(42);
    expect(demoDays.columns[0].period).toEqual({ start: "2026-07-13", end: "2026-07-13" });
    expect(demoDays.columns.at(-1)!.period).toEqual({ start: "2026-08-23", end: "2026-08-23" });
    expect(demoDays.columns.every(column => column.hasData)).toBe(true);
    const demoWeeks = buildPnlTable(demo, "week");
    const currentWeeks = demo.weeks.filter(week => week.period === "current");
    expect(currentWeeks).toHaveLength(6);
    expect(demoWeeks.columns.map(column => [column.label, column.period])).toEqual(currentWeeks.map(week => [week.label, { start: week.start, end: week.end }]));
    expect(demoWeeks.period).toEqual(demo.report.current.period);
  });

  it("日欄上限約一季（92 天）；buildPnlTable 本身不截斷", () => {
    expect(PNL_DAY_COLUMN_LIMIT).toBe(92);
  });
});

describe("F9 golden：每日、每週加總＝期間合計（到分）", () => {
  it("每日各欄加總＝expected.json 本期（13 列）", () => {
    const current = expected().current as Record<PnlMetric, string>;
    const table = buildPnlTable(golden, "day");
    for (const metric of ROW_ORDER) expect(columnSum(table, metric), metric).toBe(current[metric]);
    // 指定的四層與廣告（本期 2470.00／1145.00／705.00／255.00／450.00）。
    expect(["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing", "ad_spend"].map(metric => columnSum(table, metric as PnlMetric))).toEqual(["2470.00", "1145.00", "705.00", "255.00", "450.00"]);
  });

  it("每週各欄加總也相同；合計欄直接用 report.current.metrics（不重算）", () => {
    const current = expected().current as Record<PnlMetric, string>;
    for (const granularity of ["day", "week"] as const) {
      const table = buildPnlTable(golden, granularity);
      for (const row of table.rows) {
        expect(columnSum(table, row.metric), `${granularity} ${row.metric}`).toBe(current[row.metric]);
        expect(row.total.metric, `${granularity} ${row.metric}`).toEqual(golden.report.current.metrics[row.metric]);
        expect(row.total.period).toEqual(golden.report.current.period);
        expect(row.total.sources).toEqual(golden.report.current.sources);
      }
    }
  });

  it("上期不進表：欄只有本期（上期 2250.00／1200.00／870.00／570.00／300.00 不出現在任何格子）", () => {
    const table = buildPnlTable(golden, "day");
    const values = table.rows.flatMap(row => row.cells.map(cell => cell.metric.value));
    for (const previous of ["2250.00", "1200.00", "870.00", "570.00", "300.00"]) expect(values, previous).not.toContain(previous);
  });

  it("佔淨營收 %：合計 ÷ 淨營收合計（精確比率；HALF_UP 4 位為 1.0000、0.4636、0.1822、0.1032），畫面 L1 從精確值取位", () => {
    const table = buildPnlTable(golden, "day");
    const share = (metric: PnlMetric) => table.rows.find(row => row.metric === metric)!.share;
    const four = (metric: PnlMetric) => new Decimal(share(metric).value!).toDecimalPlaces(4, Decimal.ROUND_HALF_UP).toFixed(4);
    expect(four("net_revenue")).toBe("1.0000");
    expect(four("gross_profit")).toBe("0.4636");
    expect(four("ad_spend")).toBe("0.1822");
    // 255.00 ÷ 2470.00 ＝ 0.103238866…
    expect(four("contribution_after_marketing")).toBe("0.1032");
    expect(share("contribution_after_marketing")).toEqual({ value: "0.103238866397", reason_codes: [] });
    expect(formatRateL1(share("contribution_after_marketing").value)).toBe(formatRateL1("0.1032"));
    // 與 domain 的扣廣告後貢獻率（同一個分子分母）一致。
    expect(share("contribution_after_marketing").value).toBe(golden.report.current.metrics.contribution_margin.value);
  });

  it("每日格子帶那一天的期間與兩個通路的來源列（銷售第 6–9 行、通路費用與廣告第 4–5 行）", () => {
    const cell = buildPnlTable(golden, "day").rows.find(row => row.metric === "net_revenue")!.cells[0];
    expect(cell.period).toEqual({ start: "2026-08-02", end: "2026-08-02" });
    const lines = (file: string) => cell.sources.filter(source => source.file === file).map(source => source.line);
    expect(lines("sales_daily.csv")).toEqual([6, 7, 8, 9]);
    expect(lines("channel_costs_daily.csv")).toEqual([4, 5]);
    expect(lines("ad_spend_daily.csv")).toEqual([4, 5]);
    expect(new Set(cell.sources.map(source => source.channel))).toEqual(new Set(["DTC", "MARKETPLACE"]));
  });

  it("每週格子帶該週的期間與 WeeklyRow 的來源列", () => {
    const table = buildPnlTable(demo, "week");
    const weeks = demo.weeks.filter(week => week.period === "current");
    const row = table.rows.find(item => item.metric === "contribution_after_marketing")!;
    row.cells.forEach((cell, index) => {
      expect(cell.metric).toEqual(weeks[index].metrics.contribution_after_marketing);
      expect(cell.period).toEqual({ start: weeks[index].start, end: weeks[index].end });
      expect(cell.sources).toEqual(weeks[index].sources);
    });
  });
});

describe("F9 demo（42 天、6 週）：加總＝fixtures/demo/computed_summary.json 本期", () => {
  const summary = () => JSON.parse(readFileSync(resolve("fixtures/demo/computed_summary.json"), "utf8")).current as Record<PnlMetric, string>;
  it("每日 42 欄加總＝期間合計（13 列，到分）", () => {
    const table = buildPnlTable(demo, "day");
    for (const metric of ROW_ORDER) {
      expect(columnSum(table, metric), metric).toBe(summary()[metric]);
      expect(csvMoney(columnSum(table, metric)!).eq(demo.report.current.metrics[metric].value!), metric).toBe(true);
    }
  });
  it("每週 6 欄加總＝期間合計（13 列，到分）", () => {
    const table = buildPnlTable(demo, "week");
    for (const metric of ROW_ORDER) expect(columnSum(table, metric), metric).toBe(summary()[metric]);
  });
  it("同一天的格子＝該日各通路 daily 的同名指標相加（只加總，不寫新公式）", () => {
    const table = buildPnlTable(demo, "day");
    const date = "2026-07-20";
    const index = table.columns.findIndex(column => column.id === date);
    const rows = demo.report.current.daily.filter(row => row.date === date);
    expect(rows).toHaveLength(2);
    for (const metric of ROW_ORDER) {
      const sum = rows.reduce((total, row) => total.plus(row.metrics[metric].value!), new Decimal(0)).toFixed(2);
      expect(table.rows.find(row => row.metric === metric)!.cells[index].metric.value, metric).toBe(sum);
    }
  });
});

describe("F9 空值：缺的不是零", () => {
  it("daily 沒有那一天：整欄 null（PNL_NO_DAILY_ROWS），不是 0；其他欄與合計不變", () => {
    const date = "2026-07-20";
    const current = { ...demo.report.current, daily: demo.report.current.daily.filter(row => row.date !== date) };
    const sparse: WorkspaceSnapshot = { ...demo, report: { ...demo.report, current } };
    const full = buildPnlTable(demo, "day"), table = buildPnlTable(sparse, "day");
    const index = table.columns.findIndex(column => column.id === date);
    expect(table.columns).toHaveLength(42);
    expect(table.columns[index]).toMatchObject({ hasData: false, period: { start: date, end: date } });
    for (const row of table.rows) {
      expect(row.cells[index].metric, row.metric).toEqual({ value: null, reason_codes: [PNL_NO_DAILY_ROWS] });
      expect(row.cells[index].sources).toEqual([]);
      expect(row.total.metric).toEqual(demo.report.current.metrics[row.metric]);
      // 其他 41 欄與完整資料相同：缺的那一天不會被當成 0 平均或補值。
      const fullRow = full.rows.find(item => item.metric === row.metric)!;
      expect(row.cells.filter((_, at) => at !== index)).toEqual(fullRow.cells.filter((_, at) => at !== index));
      // 缺的那一天的原值＋其餘 41 欄＝期間合計（到分）。
      const rest = row.cells.filter((_, at) => at !== index).reduce((total, cell) => total.plus(cell.metric.value!), new Decimal(0));
      expect(rest.plus(fullRow.cells[index].metric.value!).toFixed(2), row.metric).toBe(demo.report.current.metrics[row.metric].value);
    }
  });

  it("缺廣告日（errors/missing_ad_day）：廣告與扣廣告後貢獻是 null＋MISSING_AD_DAY（資料待補），不是 0，也不是零值列", async () => {
    const snapshot = await load("errors/missing_ad_day");
    const table = buildPnlTable(snapshot, "day");
    for (const metric of ["ad_spend", "contribution_after_marketing"] as const) {
      const row = table.rows.find(item => item.metric === metric)!;
      expect(row.cells[0].metric).toEqual({ value: null, reason_codes: ["MISSING_AD_DAY"] });
      expect(row.total.metric.value).toBeNull();
      expect(row.share.value).toBeNull();
      expect(row.isZero).toBe(false);
    }
    // 缺列也是來源（抽屜列「缺列」）：MARKETPLACE 當天沒有廣告列。
    const sources = table.rows.find(item => item.metric === "ad_spend")!.cells[0].sources;
    expect(sources).toContainEqual({ file: "ad_spend_daily.csv", line: null, date: "2026-08-02", channel: "MARKETPLACE" });
    // 其他列照常加總：扣廣告前貢獻仍是 705.00（golden 同一天）。
    expect(table.rows.find(item => item.metric === "contribution_before_marketing")!.cells[0].metric.value).toBe("705.00");
  });

  it("淨營收 ≤ 0（refund_only，本期 −100.00）：佔淨營收 % 全部 null＋NON_POSITIVE_DENOMINATOR（不適用），金額照常", async () => {
    const snapshot = await load("refund_only");
    const table = buildPnlTable(snapshot, "day");
    expect(table.rows.find(row => row.metric === "net_revenue")!.cells[0].metric.value).toBe("-100.00");
    expect(table.rows.find(row => row.metric === "contribution_after_marketing")!.cells[0].metric.value).toBe("-60.00");
    for (const row of table.rows) expect(row.share, row.metric).toEqual({ value: null, reason_codes: ["NON_POSITIVE_DENOMINATOR"] });
  });
});

describe("F9 零值列判定", () => {
  it("zero_ad：廣告投放費整列為 0 → isZero；其他列不是", async () => {
    const snapshot = await load("zero_ad");
    const table = buildPnlTable(snapshot, "day");
    expect(table.rows.filter(row => row.isZero).map(row => row.metric)).toEqual(["ad_spend"]);
    // 廣告 0 時扣廣告後貢獻＝扣廣告前貢獻 705.00（zero_ad expected.json）。
    expect(table.rows.find(row => row.metric === "contribution_after_marketing")!.total.metric.value).toBe(expected("zero_ad").current_contribution_after_marketing);
  });

  it("refund_only：原價收入、折扣、四項費用、廣告都是 0 → 7 列零值；退款、商品成本（−40.00）與四層不是", async () => {
    const table = buildPnlTable(await load("refund_only"), "day");
    expect(table.rows.filter(row => row.isZero).map(row => row.metric)).toEqual(["gross_sales", "discounts", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"]);
  });

  it("golden 沒有零值列（平台抽成 DTC 0＋MARKETPLACE 120＝120.00 不是 0）", () => {
    expect(buildPnlTable(golden, "day").rows.filter(row => row.isZero)).toEqual([]);
    expect(buildPnlTable(golden, "week").rows.filter(row => row.isZero)).toEqual([]);
  });

  it("無資料的欄不影響判定：合計為 0 且其餘欄都是 0 才算零值列；資料待補（null＋原因碼）不算 0", async () => {
    const snapshot = await load("zero_ad");
    const sparse: WorkspaceSnapshot = { ...snapshot, report: { ...snapshot.report, current: { ...snapshot.report.current, daily: [] } } };
    const table = buildPnlTable(sparse, "day");
    expect(table.columns.every(column => !column.hasData)).toBe(true);
    expect(table.rows.filter(row => row.isZero).map(row => row.metric)).toEqual(["ad_spend"]);
    const missing = buildPnlTable(await load("errors/missing_ad_day"), "day");
    expect(missing.rows.filter(row => row.isZero)).toEqual([]);
  });
});

describe("F9 不動財務核心", () => {
  it("buildPnlTable 不改動 snapshot（純函式）", () => {
    const before = structuredClone(demo);
    buildPnlTable(demo, "day");
    buildPnlTable(demo, "week");
    expect(demo).toEqual(before);
  });

  it("只呼叫 domain 既有的純函式（sumTotals、calculateMetrics、ratioMetric），不經過浮點數", () => {
    const source = readFileSync(resolve("src/application/pnl-table.ts"), "utf8");
    for (const name of ["sumTotals", "calculateMetrics", "ratioMetric", "uniqueSources", "dateRange", "parseCents"]) expect(source, name).toContain(name);
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(code).not.toMatch(/\bNumber\(|parseFloat|parseInt|Math\.|toFixed\(/);
  });
});
