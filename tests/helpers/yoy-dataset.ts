import type { DatasetInput, Manifest } from "@/domain/types";
import { fixture } from "./fixtures";

// V3-9b F8 測試用的合成資料（只在 tests 使用，不是 fixture、不進禁區）：涵蓋兩年，讓「去年同期」可用。
// 兩個通路（DTC、MARKETPLACE）、每天每通路一列銷售、一列通路費用、一列廣告；金額是日序的簡單整數，方便獨立手算。
// 預設：涵蓋 2025-07-01–2026-08-23；上期 2026-06-01–2026-07-12、本期 2026-07-13–2026-08-23（各 42 天，等天數）→ 去年同期 2025-07-13–2025-08-23。

export const YOY_COVERAGE = { start: "2025-07-01", end: "2026-08-23" } as const;
export const YOY_PREVIOUS = { start: "2026-06-01", end: "2026-07-12" } as const;
export const YOY_CURRENT = { start: "2026-07-13", end: "2026-08-23" } as const;
/** 預設兩期的去年同期（本期各減一年，等天數 42 天）。 */
export const YOY_EXPECTED_PERIOD = { start: "2025-07-13", end: "2025-08-23" } as const;

const DAY_MS = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
function days(start: string, end: string): string[] {
  const out: string[] = [];
  for (let date = start; date <= end; date = shift(date, 1)) out.push(date);
  return out;
}

/** 每天每通路的銷售金額：原價收入＝基數＋日序，折扣固定，退款 0。 */
export function yoyDailySales(date: string, channel: "DTC" | "MARKETPLACE"): { gross: number; discount: number; refund: number; cogs: number } {
  const index = Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${YOY_COVERAGE.start}T00:00:00Z`)) / DAY_MS);
  return channel === "DTC" ? { gross: 100 + index, discount: 10, refund: 0, cogs: 40 } : { gross: 50 + index, discount: 5, refund: 0, cogs: 20 };
}

export interface YoyInputOptions {
  /** 這些日期不寫通路費用與廣告列（扣廣告後貢獻缺資料，用來測斷線）。 */
  missingCostDates?: readonly string[];
}

/** 兩年合成資料的 DatasetInput（manifest 以 golden 為底，改涵蓋、兩期與資料集代號）。 */
export function yoyInput(options: YoyInputOptions = {}): DatasetInput {
  const base = fixture("golden").manifest as Manifest;
  const missing = new Set(options.missingCostDates ?? []);
  const all = days(YOY_COVERAGE.start, YOY_COVERAGE.end);
  const channels = ["DTC", "MARKETPLACE"] as const;
  const money = (value: number) => value.toFixed(2);
  const sales = all.flatMap(date => channels.map(channel => { const row = yoyDailySales(date, channel); return `${date},${channel},A,HOME,1,${money(row.gross)},${money(row.discount)},${money(row.refund)},${money(row.cogs)},TWD`; }));
  const costs = all.filter(date => !missing.has(date)).flatMap(date => channels.map(channel => channel === "DTC" ? `${date},DTC,0.00,2.00,5.00,1.00,TWD` : `${date},MARKETPLACE,3.00,1.00,4.00,1.00,TWD`));
  const ads = all.filter(date => !missing.has(date)).flatMap(date => channels.map(channel => `${date},${channel},${channel === "DTC" ? "8.00" : "6.00"},TWD`));
  return {
    manifest: {
      ...base, dataset_id: "synthetic-yoy-test-v1", data_as_of: shift(YOY_COVERAGE.end, 1), coverage_start: YOY_COVERAGE.start, coverage_end: YOY_COVERAGE.end,
      channels: [...channels], previous_period: { ...YOY_PREVIOUS }, current_period: { ...YOY_CURRENT },
    },
    files: {
      "sales_daily.csv": ["date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency", ...sales].join("\n"),
      "channel_costs_daily.csv": ["date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency", ...costs].join("\n"),
      "ad_spend_daily.csv": ["date,channel,ad_spend,currency", ...ads].join("\n"),
    },
  };
}
