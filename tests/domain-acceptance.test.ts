import { describe, expect, it } from "vitest";
import { validateDataset } from "@/domain/validation";
import { analyzeDataset, analyzeProducts } from "@/domain/analysis";
import type { Dataset, DatasetInput } from "@/domain/types";
import { fixture, expected } from "./helpers/fixtures";

function load(input: DatasetInput = fixture()): Dataset {
  const result = validateDataset(input);
  expect(result.classification).not.toBe("blocking");
  expect(result.dataset).not.toBeNull();
  return result.dataset!;
}
const gold = expected(); // 僅讀取原檔固定答案，永不寫入或以 production 函式產生 expected。

describe("M1 C01–C18 golden 與獨立固定答案", () => {
  it.each(["previous", "current"] as const)("C01/C02 %s 每個原始金額與衍生金額均符合 expected.json", period => {
    const report = analyzeDataset(load());
    for (const [key, value] of Object.entries(gold[period])) {
      expect(report[period].metrics[key as keyof typeof report.current.metrics].value, key).toBe(value);
    }
    expect(report.metric_version).toBe("contribution-v1");
  });
  it("C03/C05 多 SKU 先聚合再 join，通路費用只扣一次", () => {
    const report = analyzeDataset(load());
    for (const [channel, metrics] of Object.entries(gold.current_channels)) {
      for (const [metric, amount] of Object.entries(metrics as Record<string,string>)) {
        expect(report.current.channels[channel].metrics[metric as keyof typeof report.current.metrics].value).toBe(amount);
      }
    }
    expect(report.current.daily).toHaveLength(2);
    expect(report.current.metrics.ad_spend.value).toBe("450.00");
    expect(report.current.metrics.fulfillment_costs.value).toBe("225.00");
    expect(report.current.daily[0].sources.some(source => source.file === "sales_daily.csv" && source.line !== null)).toBe(true);
  });
  it("C04 九項 bridge 精確加回 -315.00", () => {
    const bridge = analyzeDataset(load()).bridge;
    for (const [key, value] of Object.entries(gold.bridge)) {
      expect(key === "sum" ? bridge.sum.value : bridge.components[key as keyof typeof bridge.components].value).toBe(value);
    }
    expect(bridge.reconciled).toBe(true);
    expect(bridge.contribution_change.value).toBe("-315.00");
    expect(bridge.interpretation).toBe("observed_amount_changes_not_causality");
  });
  it("C06 缺成本保留收入，SKU/通路/全體毛利與貢獻不得補零", () => {
    const ds = load(fixture("errors/missing_cogs"));
    const report = analyzeDataset(ds);
    expect(report.current.metrics.net_revenue.value).toBe("2470.00");
    for (const field of ["gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const) {
      expect(report.current.metrics[field].value).toBeNull();
      expect(report.current.metrics[field].reason_codes).toContain("MISSING_COGS");
    }
    expect(report.bridge.sum.value).toBeNull();
    expect(report.bridge.reconciled).toBeNull();
    const missing = ds.sales.find(row => row.cogs_net === null)!;
    const products = analyzeProducts(ds, { period: ds.manifest.current_period, channels: [missing.channel], sku: missing.sku });
    expect(products.metrics.gross_profit.value).toBeNull();
    expect(report.diagnostics.some(item => item.code === "MISSING_CRITICAL_DATA")).toBe(true);
    const unaffected = analyzeDataset(ds, { channels: ["MARKETPLACE"] });
    expect(unaffected.current.metrics.contribution_after_marketing.value).toBe("-15.00");
    expect(unaffected.diagnostics.some(item => item.code === "MISSING_CRITICAL_DATA")).toBe(false);
  });
  it("C07/C09 拒絕刻意不良資料，完全不回傳可分析 dataset", () => {
    for (const name of ["errors/duplicate_sales_key", "errors/mixed_currency"]) {
      const result = validateDataset(fixture(name));
      expect(result.classification).toBe("blocking");
      expect(result.dataset).toBeNull();
    }
  });
  it("C08 缺廣告日，收入毛利仍可算，貢獻與 MER 未知", () => {
    const ds = load(fixture("errors/missing_ad_day"));
    const report = analyzeDataset(ds);
    expect(report.current.metrics.net_revenue.value).toBe("2470.00");
    expect(report.current.metrics.gross_profit.value).toBe("1145.00");
    expect(report.current.metrics.contribution_before_marketing.value).toBe("705.00");
    expect(report.current.metrics.contribution_after_marketing.value).toBeNull();
    expect(report.current.metrics.contribution_after_marketing.reason_codes).toContain("MISSING_AD_DAY");
    expect(report.current.metrics.mer.value).toBeNull();
    const unaffected = analyzeDataset(ds, { channels: ["DTC"] });
    expect(unaffected.current.metrics.contribution_after_marketing.value).toBe("270.00");
    expect(unaffected.diagnostics.some(item => item.code === "MISSING_CRITICAL_DATA")).toBe(false);
  });
  it("C10 零廣告貢獻 705.00，MER 不是零或Infinity", () => {
    const report = analyzeDataset(load(fixture("zero_ad")));
    expect(report.current.metrics.contribution_after_marketing.value).toBe(expected("zero_ad").current_contribution_after_marketing);
    expect(report.current.metrics.mer.value).toBeNull();
  });
  it("C11/C12/C14 純退款、負cogs依來源已入帳淨額，負營收仍保留金額", () => {
    const report = analyzeDataset(load(fixture("refund_only")));
    expect(report.current.metrics.net_revenue.value).toBe("-100.00");
    expect(report.current.metrics.cogs_net.value).toBe("-40.00");
    expect(report.current.metrics.gross_profit.value).toBe("-60.00");
    expect(report.current.metrics.contribution_after_marketing.value).toBe("-60.00");
    for (const key of ["gross_margin", "contribution_margin", "mer", "refund_ratio"] as const) expect(report.current.metrics[key].value).toBeNull();
  });
  it("C16 未確認銷售 coverage 不把沒有銷售列視為零", () => {
    const input = fixture();
    input.manifest = { ...(input.manifest as object), sales_coverage_confirmed: false };
    input.files["sales_daily.csv"] = (input.files["sales_daily.csv"] as string).split(/\r?\n/).filter(line => !line.startsWith("2026-08-02,DTC")).join("\n");
    const report = analyzeDataset(load(input));
    expect(report.current.metrics.net_revenue.value).toBeNull();
    expect(report.current.metrics.net_revenue.reason_codes).toContain("SALES_COVERAGE_UNCONFIRMED");
  });
  it("確認完整coverage而無銷售活動仍列入當日通路費用", () => {
    const input = fixture();
    input.files["sales_daily.csv"] = (input.files["sales_daily.csv"] as string).split(/\r?\n/).filter(line => !line.startsWith("2026-08-02,DTC")).join("\n");
    const report = analyzeDataset(load(input));
    expect(report.current.channels.DTC.metrics.net_revenue.value).toBe("0.00");
    expect(report.current.channels.DTC.metrics.contribution_after_marketing.value).toBe("-470.00");
    expect(report.current.metrics.contribution_after_marketing.value).toBe("-485.00");
  });
  it("C17 比率依合計分子分母，不平均通路百分比", () => {
    const report = analyzeDataset(load());
    expect(report.current.metrics.discount_rate.value).toBe("0.145161290323");
    expect(report.current.metrics.contribution_margin.value).toBe("0.103238866397");
  });
  it("C18 SKU/category 僅有商品毛利；通路貢獻入口拒絕商品篩選", () => {
    const ds = load();
    const product = analyzeProducts(ds, { period: ds.manifest.current_period, channels: ["DTC"], sku: "A", category: "HOME" });
    expect(product.metrics.net_revenue.value).toBe("1120.00");
    expect(product.metrics.gross_profit.value).toBe("540.00");
    expect(product.metrics).not.toHaveProperty("contribution_after_marketing");
    expect(product.metrics).not.toHaveProperty("ad_spend");
    // 未受 TypeScript 保護的呼叫也不能繞過商品/通路 scope 分界。
    expect(() => analyzeDataset(ds, { sku: "A" } as never)).toThrow();
    expect(() => analyzeDataset(ds, { category: "HOME" } as never)).toThrow();
    expect(analyzeDataset(ds, { channels: ["DTC"] }).current.metrics.contribution_after_marketing.value).toBe("270.00");
  });
  it("無效篩選及不等長/重疊期間在計算前拒絕", () => {
    const ds = load();
    expect(() => analyzeDataset(ds, { channels: [] })).toThrow();
    expect(() => analyzeDataset(ds, { channels: ["UNKNOWN"] })).toThrow();
    expect(() => analyzeDataset(ds, { current_period: ds.manifest.previous_period })).toThrow();
    expect(() => analyzeProducts(ds, { period: { start: "2026-07-01", end: "2026-07-02" } })).toThrow();
  });
  it("對不同排序產生相同 totals，不改動輸入或跨次共用 dataset", () => {
    const ds = load();
    const before = structuredClone(ds);
    const a = analyzeDataset(ds);
    const b = analyzeDataset({ ...ds, sales: [...ds.sales].reverse(), costs: [...ds.costs].reverse(), ads: [...ds.ads].reverse() });
    expect(a.current.metrics).toEqual(b.current.metrics);
    expect(a.diagnostics.map(d => d.id)).toEqual(b.diagnostics.map(d => d.id));
    expect(ds).toEqual(before);
    analyzeDataset(load(fixture("zero_ad")));
    expect(analyzeDataset(ds).current.metrics.ad_spend.value).toBe("450.00");
  });
});

describe("Deterministic rules / 事實來源與缺漏", () => {
  it("golden 找到營收上升貢獻下降及負貢獻通路，引用可解析的facts", () => {
    const report = analyzeDataset(load());
    expect(report.diagnostics.map(d => d.code)).toContain("REV_UP_CM_DOWN");
    expect(report.diagnostics.some(d => d.code === "NEGATIVE_CHANNEL_CM" && d.scope.channels[0] === "MARKETPLACE")).toBe(true);
    for (const rule of report.diagnostics) {
      expect(rule.fact_ids.length).toBeGreaterThan(0);
      for (const id of rule.fact_ids) expect(report.facts.some(f => f.id === id)).toBe(true);
      expect(rule.hypothesis).toBeTruthy();
      expect(rule.recommendation).toBeTruthy();
      expect(rule.limitations.length).toBeGreaterThan(0);
    }
    expect(report.facts.find(f => f.metric === "contribution_after_marketing" && f.period.start === "2026-08-02" && f.scope.kind === "all")?.value).toBe("255.00");
  });
  it("缺值先產生補資料任務，不產生依賴未知貢獻的異常", () => {
    const report = analyzeDataset(load(fixture("errors/missing_cogs")));
    expect(report.diagnostics[0].code).toBe("MISSING_CRITICAL_DATA");
    expect(report.diagnostics.filter(d => d.scope.kind === "all").map(d => d.code)).not.toContain("REV_UP_CM_DOWN");
  });
  it("SKU只判商品毛利，不產生假SKU行銷後貢獻", () => {
    const report = analyzeDataset(load(fixture("refund_only")));
    const rule = report.diagnostics.find(d => d.code === "SKU_NEGATIVE_GP");
    expect(rule).toBeDefined();
    expect(rule?.scope.kind).toBe("sku");
    for (const id of rule!.fact_ids) expect(report.facts.find(f => f.id === id)?.metric).not.toBe("contribution_after_marketing");
  });
});
