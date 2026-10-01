import { describe, expect, it } from "vitest";
import { parseCents, formatCents, sumAmounts, subtractAmounts, ratioMetric } from "@/domain/money";
import { isBusinessDate, dateRange, validatePeriods } from "@/domain/date";

describe("C13/C15 精確金額與未知", () => {
  it("十進位以分精確相加，排列不改合計", () => {
    const cents = ["0.10", "0.20", "-0.05"].map(value => ({ cents: parseCents(value), reason_codes: [] }));
    expect(formatCents(sumAmounts(cents).cents!)).toBe("0.25");
    expect(sumAmounts([...cents].reverse())).toEqual(sumAmounts(cents));
    expect(formatCents(sumAmounts(cents.slice(0, 2)).cents!)).toBe("0.30");
    expect(formatCents(parseCents("-0.01")!)).toBe("-0.01");
    expect(formatCents(parseCents("-0.00")!)).toBe("0.00");
  });
  it("超過 Number 安全整數的大金額仍精確到分", () => {
    const big = parseCents("999999999999999999999999999999999999999.99")!;
    expect(formatCents(sumAmounts([{ cents: big, reason_codes: [] }, { cents: 1n, reason_codes: [] }]).cents!))
      .toBe("1000000000000000000000000000000000000000.00");
  });
  it.each([null, undefined, "", "  "])("%s 保留未知", input => expect(parseCents(input)).toBeNull());
  it.each([NaN, Infinity, 0.1, "NaN", "Infinity", "1e3", "1,000", "$1", "1.001", "--1", ".1", "1.", " 1.00 "])("拒絕無效金額 %s", input => {
    expect(() => parseCents(input)).toThrow();
  });
  it("null 連同原因向上傳遞，不能變成有效子集總計", () => {
    expect(sumAmounts([{ cents: 10n, reason_codes: [] }, { cents: null, reason_codes: ["MISSING_COGS"] }]))
      .toEqual({ cents: null, reason_codes: ["MISSING_COGS"] });
    expect(subtractAmounts({ cents: 100n, reason_codes: [] }, { cents: null, reason_codes: ["MISSING_AD_DAY"] }).cents).toBeNull();
    expect(ratioMetric({ cents: 1n, reason_codes: [] }, { cents: 0n, reason_codes: [] }).value).toBeNull();
    expect(ratioMetric({ cents: 1n, reason_codes: [] }, { cents: 3n, reason_codes: [] }).value).toBe("0.333333333333");
  });
});

describe("C16 真實商業日期", () => {
  it("驗證閏年、格式，日期枚舉不受時區或DST影響", () => {
    expect(isBusinessDate("2024-02-29")).toBe(true);
    for (const value of ["2026-02-29", "2026-04-31", "2026-9-01", "2026-09-01T00:00:00Z", "not-a-date", null]) expect(isBusinessDate(value)).toBe(false);
    expect(dateRange("2026-03-07", "2026-03-09")).toEqual(["2026-03-07", "2026-03-08", "2026-03-09"]);
    expect(() => dateRange("2026-02-30", "2026-03-01")).toThrow();
    expect(validatePeriods({ coverage_start: "2026-08-01", coverage_end: "2026-08-03", previous_period: { start: "2026-08-01", end: "2026-08-02" }, current_period: { start: "2026-08-02", end: "2026-08-03" } })).not.toEqual([]);
  });
});
