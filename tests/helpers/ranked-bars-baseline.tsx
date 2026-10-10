import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSnapshot, hashInput } from "@/application/workspace";
import { RankedBars, type RankedBarBlock, type RankedBarRow, type RankedBarRowHeight, type RankedBarsMode, type RankedBarTone } from "@/components/charts/ranked-bars";
import { ProductComparisonPanel } from "@/components/product-comparison-panel";
import type { DatasetInput } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./fixtures";
import { element } from "./markup";
import { synthetic4ChannelInput } from "./synthetic-4-channel";

// V4-5 代理 B：C25 RankedBars 向下相容的基準（G15 加了「現況」軸列，商品頁 G13、G14 的輸出必須逐字不變）。
// tests/fixtures/ranked-bars-v4-4.json 是用本檔在 V4-5 開工錨點（db0f401，RankedBars 尚未擴充）上產生的輸出；tests/charts-scenarios-v4.test.tsx 以擴充後的程式重新產生並逐字比對。
// 內容：（1）商品頁四份資料（示範、golden、refund_only、4 通路合成）SSR 的 div.ranked-bars（G13、G14 各自所在的區塊；沒有的就不列）；
//      （2）RankedBars 以固定的列直接渲染：三種模式 × 量到的三種寬（324、560、1000）× 選項（點擊熱區、分隔線、累計欄窄螢幕隱藏、row24）。
// 字串只用固定的 ASCII 與數字（不經 labels），基準只隨 RankedBars 的幾何與 markup 改變。

export const RANKED_BARS_BASELINE_FILE = "tests/fixtures/ranked-bars-v4-4.json";
const PRODUCT_SECTIONS = ["chart-products-variance", "chart-products-pareto"] as const;
const WIDTHS = [324, 560, 1000] as const;

const row = (key: string, value: string, tone: RankedBarTone, extra?: string): RankedBarRow<string> => ({ key, label: `${key} · CH`, value, tone, display: value, evidence: key, extra });
const DECREASE = [row("A-1", "-8600.00", "unfavorable"), row("A-2", "-8500.00", "unfavorable"), row("A-3", "-3060.00", "unfavorable")];
const INCREASE = [row("B-1", "9350.00", "favorable"), row("B-2", "6800.00", "favorable"), row("B-3", "0.00", "total")];
const BLOCKS: RankedBarBlock<string>[] = [{ key: "decrease", rows: DECREASE }, { key: "increase", rows: INCREASE }];
const PARETO = [row("P-1", "-3400.00", "unfavorable", "38.0%"), row("P-2", "-2040.00", "unfavorable", "60.9%"), row("P-3", "-850.00", "unfavorable", "100.0%")];
const MIXED = [row("M-1", "-120.50", "unfavorable"), row("M-2", "14.00", "favorable"), row("M-3", "", "total"), row("A-VERY-LONG-LABEL-THAT-MUST-BE-TRUNCATED-1234567890", "40.00", "favorable")];
const noop = () => undefined;

type Variant = { name: string; mode: RankedBarsMode; rows?: RankedBarRow<string>[]; blocks?: RankedBarBlock<string>[]; more?: string; rowHeight?: RankedBarRowHeight; click?: boolean; separator?: boolean; hideExtraOnNarrow?: boolean };
const VARIANTS: Variant[] = [
  { name: "variance-blocks", mode: "variance", blocks: BLOCKS },
  { name: "variance-blocks-click-separator", mode: "variance", blocks: BLOCKS, click: true, separator: true },
  { name: "variance-mixed-row24", mode: "variance", rows: MIXED, rowHeight: "row24" },
  { name: "variance-mixed-row24-click", mode: "variance", rows: MIXED, rowHeight: "row24", click: true },
  { name: "ranked", mode: "ranked", rows: INCREASE },
  { name: "pareto-more", mode: "pareto", rows: PARETO, more: "+7", hideExtraOnNarrow: true, click: true },
  { name: "pareto-plain", mode: "pareto", rows: PARETO },
  { name: "empty", mode: "variance", rows: [] },
];

/** 產生基準（鍵依插入順序；JSON 檔以同一順序寫出）。 */
export async function rankedBarsBaseline(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const inputs: [string, DatasetInput][] = [["demo", fixture("demo")], ["golden", fixture("golden")], ["refund_only", fixture("refund_only")], ["synthetic-4-channel", synthetic4ChannelInput()]];
  for (const [name, input] of inputs) {
    const dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    const html = renderToStaticMarkup(createElement(ProductComparisonPanel, { dataset, snapshot, onEvidence: noop }));
    for (const id of PRODUCT_SECTIONS) {
      const section = element(html, `data-testid="${id}"`);
      if (section === null) continue;
      const bars = element(section, '<div class="ranked-bars');
      if (bars !== null) out[`${name} ${id}`] = bars;
    }
  }
  for (const variant of VARIANTS) for (const width of WIDTHS) {
    out[`${variant.name} @${width}`] = renderToStaticMarkup(createElement(RankedBars<string>, {
      mode: variant.mode, rows: variant.rows, blocks: variant.blocks, more: variant.more, rowHeight: variant.rowHeight, width,
      testIdPrefix: "chart-products-variance-bar-", onBarClick: variant.click ? noop : undefined, separator: variant.separator, hideExtraOnNarrow: variant.hideExtraOnNarrow,
    }));
  }
  return out;
}
