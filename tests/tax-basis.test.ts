import { describe, expect, it } from "vitest";
import { convertInclusiveAmount, convertInclusiveRows, DEFAULT_TAX_RATE, sumConvertedRows } from "../src/application/tax-basis";

// 含稅 → 未稅：excl = incl ÷ (1 + rate)，逐列 ROUND_HALF_UP 到兩位小數；空白與非數字原樣保留。
// 手算（rate = 0.05，除以 1.05）：
//   105.00 ÷ 1.05 = 100.000000…           → 100.00
//     1.00 ÷ 1.05 =   0.952380…           →   0.95
//  1050.37 ÷ 1.05 = 1000.352380…          → 1000.35
//     0.01 ÷ 1.05 =   0.009523…           →   0.01
// 另外三例（本批自行加算）：
//   315.00 ÷ 1.05 = 300.000000…           → 300.00（整除）
//    10.49 ÷ 1.05 =   9.990476…           →   9.99（第三位 0，不進位）
//     2.10 ÷ 1.05 =   2.000000…           →   2.00
//    99.99 ÷ 1.05 =  95.228571…           →  95.23（第三位 8，進位）
//   -21.00 ÷ 1.05 = -20.000000…           → -20.00（負值：來源沖回）
//  第二稅率 0.10：110.00 ÷ 1.10 = 100.00；1.00 ÷ 1.10 = 0.909090… → 0.91
// 逐列 vs 合計後換算（證明可差一分）：
//   列 1.00、1.00、1.00（含稅合計 3.00）：逐列 0.95 + 0.95 + 0.95 = 2.85；合計後 3.00 ÷ 1.05 = 2.857142… → 2.86（差 0.01）
//   列 105.00、210.00、1.00（含稅合計 316.00）：逐列 100.00 + 200.00 + 0.95 = 300.95；合計後 316 ÷ 1.05 = 300.952380… → 300.95（本例相等）

describe("R3 tax-basis: per-row inclusive → exclusive conversion", () => {
  it("uses 5% as the default Taiwanese VAT rate", () => {
    expect(DEFAULT_TAX_RATE).toBe("0.05");
  });

  it("matches the spec golden values at 5%", () => {
    expect(convertInclusiveAmount("105.00", "0.05")).toBe("100.00");
    expect(convertInclusiveAmount("1.00", "0.05")).toBe("0.95");
    expect(convertInclusiveAmount("1050.37", "0.05")).toBe("1000.35");
    expect(convertInclusiveAmount("0.01", "0.05")).toBe("0.01");
    expect(convertInclusiveAmount("", "0.05")).toBe("");
    expect(convertInclusiveAmount("abc", "0.05")).toBe("abc");
  });

  it("matches three more hand-computed cases, a negative value and a second rate", () => {
    expect(convertInclusiveAmount("315.00", "0.05")).toBe("300.00");
    expect(convertInclusiveAmount("10.49", "0.05")).toBe("9.99");
    expect(convertInclusiveAmount("2.10", "0.05")).toBe("2.00");
    expect(convertInclusiveAmount("99.99", "0.05")).toBe("95.23");
    expect(convertInclusiveAmount("-21.00", "0.05")).toBe("-20.00");
    expect(convertInclusiveAmount("110.00", "0.10")).toBe("100.00");
    expect(convertInclusiveAmount("1.00", "0.10")).toBe("0.91");
  });

  it("keeps whitespace-only and malformed values untouched so validation still reports them", () => {
    expect(convertInclusiveAmount("  ", "0.05")).toBe("  ");
    expect(convertInclusiveAmount("1,050.00", "0.05")).toBe("1,050.00");
    expect(convertInclusiveAmount("$105", "0.05")).toBe("$105");
    expect(convertInclusiveAmount("105.123", "0.05")).toBe("105.123");
  });

  it("rejects rates outside 0–20% or with more than two decimals", () => {
    expect(() => convertInclusiveAmount("105.00", "0.25")).toThrow("INVALID_TAX_RATE");
    expect(() => convertInclusiveAmount("105.00", "-0.05")).toThrow("INVALID_TAX_RATE");
    expect(() => convertInclusiveAmount("105.00", "0.055")).toThrow("INVALID_TAX_RATE");
    expect(convertInclusiveAmount("105.00", "0.00")).toBe("105.00");
    expect(convertInclusiveAmount("120.00", "0.20")).toBe("100.00");
  });

  it("converts only the selected columns of parsed rows, counts converted rows and keeps raw values", () => {
    const headers = ["date", "channel", "gross_sales", "cogs_net", "currency"];
    const rows = [
      { line: 2, values: ["2026-08-01", "DTC", "105.00", "52.50", "TWD"] },
      { line: 3, values: ["2026-08-02", "DTC", "", "", "TWD"] },
      { line: 4, values: ["2026-08-03", "DTC", "abc", "10.50", "TWD"] },
    ];
    const result = convertInclusiveRows({ headers, rows }, ["gross_sales"], "0.05");
    expect(result.rows.map(row => row.values)).toEqual([
      ["2026-08-01", "DTC", "100.00", "52.50", "TWD"],
      ["2026-08-02", "DTC", "", "", "TWD"],
      ["2026-08-03", "DTC", "abc", "10.50", "TWD"],
    ]);
    expect(result.rows_converted).toBe(1);
    expect(result.raw).toEqual({ 2: { gross_sales: "105.00" } });
    expect(rows[0].values[2], "input rows are not mutated").toBe("105.00");
    expect(() => convertInclusiveRows({ headers, rows }, ["missing_column"], "0.05")).toThrow("UNKNOWN_CONVERSION_COLUMN");
  });

  it("sums per-row conversions, which can differ from converting the total by one cent", () => {
    expect(sumConvertedRows(["1.00", "1.00", "1.00"], "0.05")).toEqual({ perRow: "2.85", afterTotal: "2.86" });
    expect(sumConvertedRows(["105.00", "210.00", "1.00"], "0.05")).toEqual({ perRow: "300.95", afterTotal: "300.95" });
  });
});
