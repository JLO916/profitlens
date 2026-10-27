import { describe, expect, it } from "vitest";
import { makeResolver, type ResolvedChannelGroup } from "../src/application/channel-settings";
import { channelLabel, channelsLabel, csvHeader, csvHeaderKey, formatHeadlineAmount, ruleCopy, scopeChannelsLabel, scopeDetailText, scopeLabel, snapshotResolver } from "../src/application/copy";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// V42-1a：名稱函式只收解析器；示範別名是 synthetic-demo* 沒有 channel_names 時的隱含預設，其他資料集是代碼。
const demo = makeResolver(undefined, "synthetic-demo-12w-v1"), plain = makeResolver(undefined, "golden-v1");

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
    expect(demo.names).toEqual(labels.data.demoChannelAlias);
    expect(plain.names).toEqual({});
    expect(makeResolver(undefined, "alternative-manual-v1").names).toEqual({});
    expect(channelLabel("DTC", demo)).toBe(labels.data.demoChannelAlias.DTC);
    expect(channelLabel("DTC", plain)).toBe("DTC");
    expect(channelLabel("SHOPEE", demo)).toBe("SHOPEE");
    expect(channelsLabel(["DTC", "MARKETPLACE"], demo)).toBe(`${labels.data.demoChannelAlias.DTC}、${labels.data.demoChannelAlias.MARKETPLACE}`);
    expect(scopeLabel({ kind: "all", channels: ["DTC", "MARKETPLACE"] }, plain)).toBe(`${labels.overview.sections.total}（DTC、MARKETPLACE）`);
    expect(scopeLabel({ kind: "channel", channels: ["DTC"] }, plain)).toBe("DTC");
    expect(scopeLabel({ kind: "sku", channels: ["DTC"], sku: "SKU-1" }, plain)).toBe("DTC／SKU-1");
  });
});

describe("R2 rule copy fills the glossary templates from the diagnostic's own facts", () => {
  // Golden (fixtures/golden/expected.json): net 2250→2470 (+220), CM 570→255 (−315), discounts 200→450 (+250),
  // discount rate 200/2500=8.00% → 450/3100=14.52%, MARKETPLACE current CM −15.00.
  it("uses hand-computed golden values", async () => {
    const { report } = await snapshot();
    const find = (code: string, kind: string) => report.diagnostics.find(row => row.code === code && row.scope.kind === kind)!;
    const revenue = ruleCopy({ report }, find("REV_UP_CM_DOWN", "all"), plain);
    expect(revenue.headline).toBe(fill(labels.rules.REV_UP_CM_DOWN.headline, { dNet: "220 元", dCM: "315 元" }));
    expect(revenue.cause).toBe(labels.rules.REV_UP_CM_DOWN.explain.cause);
    expect(revenue.nextStep).toBe(labels.rules.REV_UP_CM_DOWN.explain.nextStep);
    expect(revenue.caution).toBe(labels.rules.REV_UP_CM_DOWN.caution);
    // V3-2a：比率移到 cause（PRD §8.8 #3），標題只留金額。
    const discount = ruleCopy({ report }, find("DISCOUNT_BURDEN_UP", "all"), plain);
    expect(discount.headline).toBe(fill(labels.rules.DISCOUNT_BURDEN_UP.headline, { dAmount: "250 元" }));
    expect(discount.cause).toBe(fill(labels.rules.DISCOUNT_BURDEN_UP.explain.cause, { prevRate: "8.00%", curRate: "14.52%" }));
    const negative = report.diagnostics.find(row => row.code === "NEGATIVE_CHANNEL_CM" && row.scope.channels[0] === "MARKETPLACE")!;
    expect(ruleCopy({ report }, negative, plain).headline).toBe(fill(labels.rules.NEGATIVE_CHANNEL_CM.headline, { channel: "MARKETPLACE", cm: "15 元" }));
    expect(ruleCopy({ report }, negative, demo).headline).toBe(fill(labels.rules.NEGATIVE_CHANNEL_CM.headline, { channel: labels.data.demoChannelAlias.MARKETPLACE, cm: "15 元" }));
  });

  it("names the missing metrics for data gaps without inventing amounts", async () => {
    const { report } = await snapshot("errors/missing_cogs");
    const missing = report.diagnostics.find(row => row.code === "MISSING_CRITICAL_DATA")!;
    const copy = ruleCopy({ report }, missing, plain);
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

// ── V42-2a（PRD §4.1、§4.2；GLOSSARY #8；docs/revamp-v4.2/06_BATCHES.md V42-2a 第 2 項）：範圍文字認得群組——群組範圍、群組內單一通路、無對應群組的子集；沒有群組時逐字不變。
describe("V42-2a 範圍文字認得群組（scopeChannelsLabel、scopeDetailText、scopeLabel）", () => {
  const groups: ResolvedChannelGroup[] = [{ id: "own", label: "自有", members: ["DTC", "SOCIAL"] }, { id: "platform", label: "平台", members: ["LIVE", "MARKETPLACE"] }];
  const names = { DTC: "官網", SOCIAL: "社群", MARKETPLACE: "蝦皮", LIVE: "直播" };
  const grouped = makeResolver(names, "synthetic-4-channel-v1", groups);
  const member = fill(labels.shell.scopeV42.memberOfGroup, { group: "自有", channel: "官網" });

  it("群組範圍：scopeChannelsLabel 與 scopeLabel（kind all）只寫群組名；scopeDetailText 寫「{群組名}（成員）」；通路順序無關", () => {
    expect(scopeChannelsLabel(["DTC", "SOCIAL"], grouped)).toBe("自有");
    expect(scopeChannelsLabel(["SOCIAL", "DTC"], grouped)).toBe("自有");
    expect(scopeLabel({ kind: "all", channels: ["DTC", "SOCIAL"] }, grouped)).toBe("自有");
    expect(scopeLabel({ kind: "all", channels: ["MARKETPLACE", "LIVE"] }, grouped)).toBe("平台");
    expect(scopeDetailText(["DTC", "SOCIAL"], grouped)).toBe(fill(labels.shell.scopeV42.groupWithMembers, { group: "自有", members: "官網、社群" }));
    expect(scopeDetailText(["SOCIAL", "DTC"], grouped)).toBe("自有（官網、社群）");
    expect(scopeDetailText(["LIVE", "MARKETPLACE"], grouped)).toBe("平台（直播、蝦皮）");
  });

  it("群組內的單一通路：「{群組名} · {通路名}」（半形空格＋U+00B7＋半形空格）；SKU 仍接「／{sku}」；kind all 的單一通路仍寫合計（…）", () => {
    expect(member).toBe("自有 · 官網");
    expect(scopeChannelsLabel(["DTC"], grouped)).toBe(member);
    expect(scopeChannelsLabel(["LIVE"], grouped)).toBe("平台 · 直播");
    expect(scopeLabel({ kind: "channel", channels: ["DTC"] }, grouped)).toBe(member);
    expect(scopeLabel({ kind: "sku", channels: ["DTC"], sku: "SKU-1" }, grouped)).toBe(`${member}／SKU-1`);
    expect(scopeDetailText(["DTC"], grouped)).toBe(member);
    expect(scopeLabel({ kind: "all", channels: ["DTC"] }, grouped)).toBe(`${labels.overview.sections.total}（官網）`);
  });

  it("沒有對應群組的子集：維持成員清單；kind all 寫合計（…）；全部通路也是合計（…）", () => {
    expect(scopeChannelsLabel(["DTC", "LIVE"], grouped)).toBe("官網、直播");
    expect(scopeLabel({ kind: "all", channels: ["DTC", "LIVE"] }, grouped)).toBe(`${labels.overview.sections.total}（官網、直播）`);
    expect(scopeDetailText(["DTC", "LIVE"], grouped)).toBe("官網、直播");
    expect(scopeLabel({ kind: "all", channels: ["DTC", "LIVE", "MARKETPLACE", "SOCIAL"] }, grouped)).toBe(`${labels.overview.sections.total}（官網、直播、蝦皮、社群）`);
    // 不在任何群組的單一通路：通路名。
    const partial = makeResolver(names, "synthetic-4-channel-v1", [groups[0]]);
    expect(scopeChannelsLabel(["LIVE"], partial)).toBe("直播");
    expect(scopeLabel({ kind: "channel", channels: ["LIVE"] }, partial)).toBe("直播");
    expect(scopeDetailText(["LIVE"], partial)).toBe("直播");
  });

  it("只有一個成員的群組：範圍是那個通路時寫群組名（findGroupByMembers 先於 memberOfGroup）", () => {
    const solo = makeResolver(names, "synthetic-4-channel-v1", [{ id: "solo", label: "只有直播", members: ["LIVE"] }]);
    expect(scopeChannelsLabel(["LIVE"], solo)).toBe("只有直播");
    expect(scopeLabel({ kind: "channel", channels: ["LIVE"] }, solo)).toBe("只有直播");
    expect(scopeLabel({ kind: "all", channels: ["LIVE"] }, solo)).toBe("只有直播");
    expect(scopeDetailText(["LIVE"], solo)).toBe("只有直播（直播）");
  });

  it("沒有群組時每個函式的輸出與 v4.1.3 逐字相同（groups 未給＝[]；示範別名與代碼兩種解析器）", () => {
    for (const resolver of [demo, plain, makeResolver(undefined, "golden-v1", []), makeResolver({ DTC: "官網" }, "golden-v1")]) {
      expect(resolver.groups).toEqual([]);
      for (const channels of [["DTC"], ["DTC", "MARKETPLACE"], ["MARKETPLACE", "DTC"], ["SHOPEE"]]) {
        expect(scopeChannelsLabel(channels, resolver)).toBe(channelsLabel(channels, resolver));
        expect(scopeDetailText(channels, resolver)).toBe(channelsLabel(channels, resolver));
        expect(scopeLabel({ kind: "all", channels }, resolver)).toBe(`${labels.overview.sections.total}（${channelsLabel(channels, resolver)}）`);
      }
      expect(scopeLabel({ kind: "channel", channels: ["DTC"] }, resolver)).toBe(channelLabel("DTC", resolver));
      expect(scopeLabel({ kind: "sku", channels: ["DTC"], sku: "SKU-1" }, resolver)).toBe(`${channelLabel("DTC", resolver)}／SKU-1`);
    }
  });

  it("snapshotResolver 讀快照的 channel_groups：沒有時 groups 是 []（golden 的範圍文字不變）；有時範圍文字認得群組", async () => {
    const base = await snapshot();
    const all = { kind: "all" as const, channels: base.report.scope.channels };
    expect(snapshotResolver(base).groups).toEqual([]);
    expect(scopeLabel(all, snapshotResolver(base))).toBe(`${labels.overview.sections.total}（DTC、MARKETPLACE）`);
    const everything: ResolvedChannelGroup[] = [{ id: "g1", label: "全部平台", members: ["DTC", "MARKETPLACE"] }];
    const resolver = snapshotResolver({ ...base, channel_groups: everything });
    expect(resolver.groups).toBe(everything);
    expect(scopeLabel(all, resolver)).toBe("全部平台");
    expect(scopeLabel({ kind: "channel", channels: ["DTC"] }, resolver)).toBe(fill(labels.shell.scopeV42.memberOfGroup, { group: "全部平台", channel: "DTC" }));
    expect(scopeDetailText(base.report.scope.channels, resolver)).toBe("全部平台（DTC、MARKETPLACE）");
  });
});
