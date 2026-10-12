import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSnapshot, hashInput } from "@/application/workspace";
import { HeatTable, type HeatTableSpec } from "@/components/charts/heat-table";
import { HeatSection } from "@/components/diagnosis/heat-section";
import type { DatasetInput, Manifest } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./fixtures";
import { byTestId } from "./markup";
import { synthetic4ChannelInput } from "./synthetic-4-channel";

// V4-7a 代理 B：C28 HeatTable 向下相容的基準（V4-7a 加了 matrix 排法的 G21 問題分布表，健檢頁 G11 的輸出必須逐字不變）。
// tests/fixtures/heat-table-v4-6.json 是用本檔在 V4-7a 開工錨點（e905189，heat-table.tsx 尚未擴充）上產生的輸出；tests/charts-data-issues-v4.test.tsx 以擴充後的程式重新產生並逐字比對。
// 內容：（1）健檢頁 G11 五份資料（示範、golden、refund_only、4 通路合成、2 通路 × 93 天的週 × 通路）SSR 的 chart-diagnosis-heat 區塊（ChartFrame＋C28 的全部輸出）；
//      （2）HeatTable 以固定的表直接渲染：calendar（兩張、期間外、資料待補、兩階、列頭小字）與 matrix（一張、欄頭換行）。
// 字串只用固定的 ASCII 與數字（不經 labels），直接渲染的部分只隨 C28 的 markup 改變。

export const HEAT_TABLE_BASELINE_FILE = "tests/fixtures/heat-table-v4-6.json";
const noop = () => undefined;

const DAY_MS = 86_400_000;
const shift = (date: string, days: number) => new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
/** 2 通路 × 93 天的記憶體合成資料（同 tests/charts-diagnosis-v4.test.tsx 的 manyChannelsInput(2, 93)）：本期超過 92 天，G11 改週 × 通路的 matrix 排法。 */
function weeklyInput(): DatasetInput {
  const base = fixture("golden").manifest as Manifest;
  const start = "2026-01-01", days = 93;
  const channels = ["CH01", "CH02"];
  const dates = Array.from({ length: days * 2 }, (_, at) => shift(start, at));
  const sales = dates.flatMap((date, day) => channels.map((channel, at) => `${date},${channel},SKU-${at + 1},HOME,2,${(1000 + day + at).toFixed(2)},50.00,0.00,400.00,TWD`));
  const costs = dates.flatMap(date => channels.map(channel => `${date},${channel},30.00,10.00,20.00,5.00,TWD`));
  const ads = dates.flatMap(date => channels.map(channel => `${date},${channel},100.00,TWD`));
  return {
    manifest: {
      ...base, dataset_id: `synthetic-many-channels-2x${days}`, data_as_of: shift(start, days * 2), coverage_start: start, coverage_end: shift(start, days * 2 - 1),
      channels, previous_period: { start, end: shift(start, days - 1) }, current_period: { start: shift(start, days), end: shift(start, days * 2 - 1) },
    },
    files: {
      "sales_daily.csv": ["date,channel,sku,category,units_sold,gross_sales,discounts,refunds,cogs_net,currency", ...sales].join("\n"),
      "channel_costs_daily.csv": ["date,channel,platform_fees,payment_fees,fulfillment_costs,other_variable_costs,currency", ...costs].join("\n"),
      "ad_spend_daily.csv": ["date,channel,ad_spend,currency", ...ads].join("\n"),
    },
  };
}

const CALENDAR: HeatTableSpec[] = ["A", "B"].map(channel => ({
  key: channel, caption: `cap ${channel}`, corner: "wk",
  columns: ["d1", "d2", "d3"].map(key => ({ key, label: key.toUpperCase() })),
  rows: [
    { key: `${channel}-r1`, head: "1/1", cells: [{ key: "c1", tier: "outside" as const, text: "" }, { key: "c2", tier: 0 as const, text: "1.20", aria: `${channel} c2`, testId: `chart-x-heat-cell-${channel}-c2` }, { key: "c3", tier: 2 as const, text: "-3.40", aria: `${channel} c3`, testId: `chart-x-heat-cell-${channel}-c3` }] },
    { key: `${channel}-r2`, head: "1/8", note: "part", cells: [{ key: "c1", tier: "missing" as const, text: "MISSING", aria: `${channel} m` }, { key: "c2", tier: 1 as const, text: "-0.50", aria: `${channel} c2b` }, { key: "c3", tier: "outside" as const, text: "" }] },
  ],
}));
const MATRIX: HeatTableSpec[] = [{
  key: "weekly", caption: "cap weekly", corner: "wk",
  columns: [{ key: "CH01", label: "CH01 long header" }, { key: "CH02", label: "CH02" }],
  rows: [
    { key: "w1", head: "1/1", note: "part", cells: [{ key: "CH01", tier: 0, text: "2.00", aria: "w1 CH01" }, { key: "CH02", tier: 1, text: "-1.00", aria: "w1 CH02" }] },
    { key: "w2", head: "1/8", cells: [{ key: "CH01", tier: "missing", text: "MISSING", aria: "w2 CH01" }, { key: "CH02", tier: 2, text: "-9.00", aria: "w2 CH02", testId: "chart-x-heat-cell-CH02-w2" }] },
  ],
}];

/** 產生基準（鍵依插入順序；JSON 檔以同一順序寫出）。 */
export async function heatTableBaseline(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const inputs: [string, DatasetInput][] = [["demo", fixture("demo")], ["golden", fixture("golden")], ["refund_only", fixture("refund_only")], ["synthetic-4-channel", synthetic4ChannelInput()], ["weekly-2x93", weeklyInput()]];
  for (const [name, input] of inputs) {
    const dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    const html = renderToStaticMarkup(createElement(HeatSection, { snapshot, onEvidence: noop }));
    out[`${name} chart-diagnosis-heat`] = byTestId(html, "chart-diagnosis-heat");
  }
  out["direct calendar"] = renderToStaticMarkup(createElement(HeatTable, { tables: CALENDAR, layout: "calendar", onActivate: noop }));
  out["direct matrix"] = renderToStaticMarkup(createElement(HeatTable, { tables: MATRIX, layout: "matrix", onActivate: noop }));
  return out;
}
