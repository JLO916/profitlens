import { describe, expect, it } from "vitest";
import { channelLabel, channelsLabel, csvHeader, csvHeaderKey, demoAlias, formatHeadlineAmount, ruleCopy, scopeLabel } from "../src/application/copy";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

async function snapshot(name = "golden") {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}

describe("R2 headline amounts use 萬 above 10,000 and whole yuan below", () => {
  it("rounds half up at one decimal of 萬 and at whole yuan", () => {
    expect(formatHeadlineAmount("1188365.10")).toBe("118.8 萬");
    expect(formatHeadlineAmount("598833.95")).toBe("59.9 萬");
    expect(formatHeadlineAmount("10000.00")).toBe("1.0 萬");
    expect(formatHeadlineAmount("9999.99")).toBe("1.0 萬"); // 先取整到 10,000 元，再依 ≥ 10,000 顯示萬
    expect(formatHeadlineAmount("250.00")).toBe("250 元");
    expect(formatHeadlineAmount("250.50")).toBe("251 元");
    expect(formatHeadlineAmount("-315.00")).toBe("315 元");
    expect(formatHeadlineAmount("-315.00", true)).toBe("−315 元");
    expect(formatHeadlineAmount("0.00", true)).toBe("0 元");
    expect(formatHeadlineAmount("-0.40", true)).toBe("0 元");
    // V3-2b §8.5 規則 7：4 位數以上加千分位；L1 ≥ 1 億改用「億」兩位小數。
    expect(formatHeadlineAmount("9999.49")).toBe("9,999 元");
    expect(formatHeadlineAmount("125034120.37")).toBe("1.25 億");
    expect(formatHeadlineAmount("-125034120.37", true)).toBe("−1.25 億");
    expect(formatHeadlineAmount("1709082.18", true)).toBe("+170.9 萬");
    expect(formatHeadlineAmount(null)).toBe(labels.shell.status.missing);
  });
});

describe("R2 demo channel alias applies only to the demo dataset", () => {
  it("maps DTC/MARKETPLACE for synthetic-demo ids and leaves everything else alone", () => {
    expect(demoAlias("synthetic-demo-12w-v1")).toBe(true);
    expect(demoAlias("golden-v1")).toBe(false);
    expect(demoAlias("alternative-manual-v1")).toBe(false);
    expect(channelLabel("DTC", true)).toBe(labels.data.demoChannelAlias.DTC);
    expect(channelLabel("DTC", false)).toBe("DTC");
    expect(channelLabel("SHOPEE", true)).toBe("SHOPEE");
    expect(channelsLabel(["DTC", "MARKETPLACE"], true)).toBe(`${labels.data.demoChannelAlias.DTC}、${labels.data.demoChannelAlias.MARKETPLACE}`);
    expect(scopeLabel({ kind: "all", channels: ["DTC", "MARKETPLACE"] }, false)).toBe(`${labels.overview.sections.total}（DTC、MARKETPLACE）`);
    expect(scopeLabel({ kind: "channel", channels: ["DTC"] }, false)).toBe("DTC");
    expect(scopeLabel({ kind: "sku", channels: ["DTC"], sku: "SKU-1" }, false)).toBe("DTC／SKU-1");
  });
});

describe("R2 rule copy fills the glossary templates from the diagnostic's own facts", () => {
  // Golden (fixtures/golden/expected.json): net 2250→2470 (+220), CM 570→255 (−315), discounts 200→450 (+250),
  // discount rate 200/2500=8.00% → 450/3100=14.52%, MARKETPLACE current CM −15.00.
  it("uses hand-computed golden values", async () => {
    const { report } = await snapshot();
    const find = (code: string, kind: string) => report.diagnostics.find(row => row.code === code && row.scope.kind === kind)!;
    const revenue = ruleCopy({ report }, find("REV_UP_CM_DOWN", "all"), false);
    expect(revenue.headline).toBe(fill(labels.rules.REV_UP_CM_DOWN.headline, { dNet: "220 元", dCM: "315 元" }));
    expect(revenue.cause).toBe(labels.rules.REV_UP_CM_DOWN.explain.cause);
    expect(revenue.nextStep).toBe(labels.rules.REV_UP_CM_DOWN.explain.nextStep);
    expect(revenue.caution).toBe(labels.rules.REV_UP_CM_DOWN.caution);
    // V3-2a：比率移到 cause（PRD §8.8 #3），標題只留金額。
    const discount = ruleCopy({ report }, find("DISCOUNT_BURDEN_UP", "all"), false);
    expect(discount.headline).toBe(fill(labels.rules.DISCOUNT_BURDEN_UP.headline, { dAmount: "250 元" }));
    expect(discount.cause).toBe(fill(labels.rules.DISCOUNT_BURDEN_UP.explain.cause, { prevRate: "8.00%", curRate: "14.52%" }));
    const negative = report.diagnostics.find(row => row.code === "NEGATIVE_CHANNEL_CM" && row.scope.channels[0] === "MARKETPLACE")!;
    expect(ruleCopy({ report }, negative, false).headline).toBe(fill(labels.rules.NEGATIVE_CHANNEL_CM.headline, { channel: "MARKETPLACE", cm: "15 元" }));
    expect(ruleCopy({ report }, negative, true).headline).toBe(fill(labels.rules.NEGATIVE_CHANNEL_CM.headline, { channel: labels.data.demoChannelAlias.MARKETPLACE, cm: "15 元" }));
  });

  it("names the missing metrics for data gaps without inventing amounts", async () => {
    const { report } = await snapshot("errors/missing_cogs");
    const missing = report.diagnostics.find(row => row.code === "MISSING_CRITICAL_DATA")!;
    const copy = ruleCopy({ report }, missing, false);
    expect(copy.headline).toContain(labels.metrics.cogs_net.short);
    expect(copy.headline).toBe(fill(labels.rules.MISSING_CRITICAL_DATA.headline, { channel: labels.overview.sections.total, missing: labels.metrics.cogs_net.short }));
    expect(copy.caution).toBe(labels.rules.MISSING_CRITICAL_DATA.caution);
  });
});

describe("R2 CSV headers read 「中文 (key)」 while keys stay machine-readable", () => {
  it("derives metric, period and reason columns and round-trips the key", () => {
    expect(csvHeader("net_revenue")).toBe(`${labels.metrics.net_revenue.headline} (net_revenue)`);
    expect(csvHeader("previous_gross_profit")).toBe(`${labels.shell.periods.previous}${labels.metrics.gross_profit.headline} (previous_gross_profit)`);
    expect(csvHeader("gross_profit_change_reasons")).toBe(`${labels.metrics.gross_profit.headline}${labels.exports.csv.suffix.change}${labels.exports.csv.suffix.reasons} (gross_profit_change_reasons)`);
    expect(csvHeader("row_type")).toBe(`${labels.exports.csv.columns.row_type} (row_type)`);
    expect(csvHeader("unknown_column")).toBe("unknown_column");
    expect(csvHeaderKey(csvHeader("net_revenue"))).toBe("net_revenue");
    expect(csvHeaderKey("plain")).toBe("plain");
  });
});
