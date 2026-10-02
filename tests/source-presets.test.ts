import { describe, expect, it } from "vitest";
import { importColumns } from "@/application/import";
import { HEADER_DICTIONARY, SOURCE_PRESETS, detectPreset, dictionaryField, getPreset, headerKey, isOrderLevel, suggestMapping, type SourcePreset } from "@/application/source-presets";
import type { FileName } from "@/domain/types";

const SALES: FileName = "sales_daily.csv";
const COSTS: FileName = "channel_costs_daily.csv";
const ADS: FileName = "ad_spend_daily.csv";

/** One plausible header row per preset (fingerprints plus unrelated columns). */
const SAMPLE_HEADERS: Record<string, string[]> = {
  shopline_orders: ["訂單號碼", "訂單日期", "顧客", "商品名稱", "商品貨號", "數量", "商品原價小計", "優惠折扣"],
  "91app_orders": ["訂單編號", "交易日期", "商品名稱", "SKU", "數量", "商品金額"],
  cyberbiz_orders: ["訂單編號", "建立時間", "商品代碼", "商品名稱", "數量", "小計"],
  shopee_orders: ["訂單編號", "訂單成立日期", "商品名稱", "商品選項貨號", "數量", "商品原價", "買家支付金額"],
  shopee_income: ["訂單編號", "撥款完成日期", "成交手續費", "金流與系統處理費", "活動服務費"],
  momo_settlement: ["對帳期間", "商品編號", "商品名稱", "銷售數量", "銷售金額"],
  pchome_settlement: ["訂單編號", "結帳日", "商品編號", "銷售金額", "手續費"],
  meta_ads: ["Reporting starts", "Day", "Campaign name", "Impressions", "Amount spent (TWD)"],
  google_ads: ["Day", "Campaign", "Impr.", "Clicks", "Cost", "Currency code"],
};

describe("R3 source presets are honest candidates", () => {
  it("ships exactly the nine spec presets, all unverified with a verification method", () => {
    expect(SOURCE_PRESETS.map(p => p.id)).toEqual(["shopline_orders", "91app_orders", "cyberbiz_orders", "shopee_orders", "shopee_income", "momo_settlement", "pchome_settlement", "meta_ads", "google_ads"]);
    for (const preset of SOURCE_PRESETS) {
      expect(preset.verified, preset.id).toBe(false);
      expect(preset.verifiedAt, preset.id).toBeNull();
      expect(preset.verification.trim(), preset.id).not.toBe("");
      expect(preset.fingerprint.length, preset.id).toBeGreaterThanOrEqual(2);
      expect(preset.fingerprint.length, preset.id).toBeLessThanOrEqual(3);
      expect(preset.targets.length, preset.id).toBeGreaterThan(0);
      for (const target of preset.targets) {
        const columns = preset.columns[target];
        expect(columns, `${preset.id} ${target}`).toBeDefined();
        for (const field of Object.keys(columns ?? {})) expect(importColumns[target], `${preset.id} ${field}`).toContain(field);
      }
    }
  });

  it("marks order and settlement exports as order level and campaign reports as not", () => {
    for (const preset of SOURCE_PRESETS) expect(isOrderLevel(preset), preset.id).toBe(preset.grain !== "daily_campaign");
    expect(isOrderLevel(getPreset("shopee_orders") as SourcePreset)).toBe(true);
    expect(isOrderLevel(getPreset("momo_settlement") as SourcePreset)).toBe(true);
    expect(isOrderLevel(getPreset("meta_ads") as SourcePreset)).toBe(false);
    expect(getPreset("nope")).toBeNull();
  });
});

describe("R3 detectPreset", () => {
  it("detects every preset from a sample header row", () => {
    for (const preset of SOURCE_PRESETS) {
      const result = detectPreset(SAMPLE_HEADERS[preset.id]);
      expect(result?.preset.id, preset.id).toBe(preset.id);
      expect(result?.matched.length, preset.id).toBeGreaterThanOrEqual(2);
    }
  });

  it("returns null for the three standard headers and for a single fingerprint hit", () => {
    for (const role of [SALES, COSTS, ADS]) expect(detectPreset([...importColumns[role]])).toBeNull();
    expect(detectPreset(["訂單編號", "foo", "bar"])).toBeNull();
    expect(detectPreset([])).toBeNull();
  });

  it("is case, whitespace and full-width insensitive", () => {
    expect(detectPreset(["  day ", "CAMPAIGN NAME", "Amount spent（TWD）"])?.preset.id).toBe("meta_ads");
    expect(detectPreset(["﻿訂單號碼 ", " 訂單日期"])?.preset.id).toBe("shopline_orders");
  });

  it("prefers the preset with the most fingerprint matches", () => {
    // 訂單編號 + 結帳日 hit pchome (2); 訂單編號 + 成交手續費 + 金流與系統處理費 hit shopee_income (3).
    const result = detectPreset(["訂單編號", "結帳日", "成交手續費", "金流與系統處理費"]);
    expect(result?.preset.id).toBe("shopee_income");
    expect(result?.matched).toEqual(["訂單編號", "成交手續費", "金流與系統處理費"]);
  });
});

describe("R3 suggestMapping", () => {
  it("keeps exact standard names as the first choice and leaves standard files untouched", () => {
    const fields = importColumns[SALES];
    const { mapping, origin } = suggestMapping(SALES, [...fields], fields);
    for (const field of fields) { expect(mapping[field]).toBe(field); expect(origin[field]).toBe("exact"); }
  });

  it("applies exact → preset → dictionary precedence and reports the origin", () => {
    const preset = getPreset("shopline_orders");
    // "sku" is exact; 訂單日期 is a preset candidate for date (dictionary would want 日期);
    // 數量 is both preset and dictionary → preset; 退貨金額 is dictionary only.
    const headers = ["日期", "訂單日期", "sku", "商品貨號", "數量", "退貨金額", "備註"];
    const { mapping, origin } = suggestMapping(SALES, headers, importColumns[SALES], preset);
    expect(mapping.sku).toBe("sku"); expect(origin.sku).toBe("exact");
    expect(mapping.date).toBe("訂單日期"); expect(origin.date).toBe("preset");
    expect(mapping.units_sold).toBe("數量"); expect(origin.units_sold).toBe("preset");
    expect(mapping.refunds).toBe("退貨金額"); expect(origin.refunds).toBe("dictionary");
    expect(mapping.cogs_net).toBe(""); expect(origin.cogs_net).toBe("none");
    expect(Object.keys(mapping)).toEqual([...importColumns[SALES]]);
  });

  it("falls back to the dictionary without a preset, and ignores preset columns for other roles", () => {
    const headers = ["入帳日", "店別", "商品代碼", "類別", "銷售數量", "銷售金額", "折價券", "退款", "銷貨成本", "幣別"];
    const { mapping, origin } = suggestMapping(SALES, headers, importColumns[SALES]);
    expect(mapping).toEqual({ date: "入帳日", channel: "店別", sku: "商品代碼", category: "類別", units_sold: "銷售數量", gross_sales: "銷售金額", discounts: "折價券", refunds: "退款", cogs_net: "銷貨成本", currency: "幣別" });
    expect(new Set(Object.values(origin))).toEqual(new Set(["dictionary"]));
    // google_ads has no sales columns, so only the dictionary applies to a sales file.
    expect(suggestMapping(SALES, headers, importColumns[SALES], getPreset("google_ads"))).toEqual({ mapping, origin });
  });

  it("maps ad reports through the preset", () => {
    const meta = suggestMapping(ADS, SAMPLE_HEADERS.meta_ads, importColumns[ADS], getPreset("meta_ads"));
    expect(meta.mapping).toEqual({ date: "Day", channel: "", ad_spend: "Amount spent (TWD)", currency: "" });
    expect(meta.origin).toEqual({ date: "preset", channel: "none", ad_spend: "preset", currency: "none" });
    const google = suggestMapping(ADS, SAMPLE_HEADERS.google_ads, importColumns[ADS], getPreset("google_ads"));
    expect(google.mapping).toEqual({ date: "Day", channel: "", ad_spend: "Cost", currency: "Currency code" });
  });

  it("never uses one source header for two standard fields", () => {
    // A preset that lists the same header for two fields must still use it once.
    const twice: SourcePreset = { ...(getPreset("shopline_orders") as SourcePreset), columns: { [SALES]: { gross_sales: ["金額"], discounts: ["金額"] } } };
    const { mapping, origin } = suggestMapping(SALES, ["金額"], importColumns[SALES], twice);
    expect(mapping.gross_sales).toBe("金額"); expect(origin.gross_sales).toBe("preset");
    expect(mapping.discounts).toBe(""); expect(origin.discounts).toBe("none");
    // An exact match consumes the header before the dictionary could reuse it.
    const exact = suggestMapping(ADS, ["date", "Cost", "花費"], importColumns[ADS]);
    expect(exact.mapping).toEqual({ date: "date", channel: "", ad_spend: "Cost", currency: "" });
    const values = Object.values(exact.mapping).filter(Boolean);
    expect(new Set(values).size).toBe(values.length);
  });

  it("does not mutate the inputs", () => {
    const headers = [...SAMPLE_HEADERS.shopline_orders]; const copy = [...headers];
    suggestMapping(SALES, headers, importColumns[SALES], getPreset("shopline_orders"));
    expect(headers).toEqual(copy);
  });
});

describe("R3 generic header dictionary", () => {
  it("resolves the spec examples and returns null for unknown headers", () => {
    expect(dictionaryField("入帳日")).toBe("date");
    expect(dictionaryField("商品貨號")).toBe("sku");
    expect(dictionaryField("Amount spent")).toBe("ad_spend");
    expect(dictionaryField("Cost")).toBe("ad_spend");
    expect(dictionaryField("顧客姓名")).toBeNull();
    expect(dictionaryField("")).toBeNull();
    expect(dictionaryField("   ")).toBeNull();
  });

  it("trims, ignores case and parenthesised content in either width", () => {
    expect(dictionaryField("  運費 ")).toBe("fulfillment_costs");
    expect(dictionaryField("amount SPENT (TWD)")).toBe("ad_spend");
    expect(dictionaryField("銷售金額（含稅）")).toBe("gross_sales");
    expect(dictionaryField("ＳＫＵ")).toBe("sku");
    expect(headerKey(" Amount spent (TWD) ")).toBe("amountspent");
  });

  it("maps every listed alias to its field with no alias claimed twice", () => {
    const seen = new Map<string, string>();
    for (const [field, aliases] of Object.entries(HEADER_DICTIONARY)) {
      for (const alias of aliases) {
        expect(dictionaryField(alias), alias).toBe(field);
        expect(seen.has(headerKey(alias)), alias).toBe(false);
        seen.set(headerKey(alias), field);
      }
    }
    const standard = new Set(Object.values(importColumns).flat());
    for (const field of Object.keys(HEADER_DICTIONARY)) expect(standard.has(field), field).toBe(true);
    expect(seen.size).toBe(53);
  });
});
