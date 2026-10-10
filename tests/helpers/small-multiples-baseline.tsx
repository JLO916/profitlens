import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createSnapshot, hashInput } from "@/application/workspace";
import { SmallMultiples, type SmallMultiplePanel } from "@/components/charts/small-multiples";
import { RatesSection } from "@/components/diagnosis/rates-section";
import type { DatasetInput } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./fixtures";
import { element } from "./markup";
import { synthetic4ChannelInput } from "./synthetic-4-channel";
import { yoyInput } from "./yoy-dataset";

// V4-6 代理 A：C26 SmallMultiples 向下相容的基準（G19 會議歷史擴充了 C26：每點小實心點、斷段間隙標、X 標依寬度取捨與不出框；健檢頁 G12 的輸出必須逐字不變）。
// tests/fixtures/small-multiples-v4-5.json 是用本檔在 V4-6 開工錨點（6142950，SmallMultiples 尚未擴充）上產生的輸出；tests/charts-meeting-g19.test.tsx 以擴充後的程式重新產生並逐字比對。
// 內容：（1）健檢頁 G12 五份資料（示範、golden、refund_only、4 通路合成、兩年 yoy）SSR 的 chart-diagnosis-rates 內的 div.multiples-grid（C26 的全部輸出）；
//      （2）SmallMultiples 以固定的子圖直接渲染：四種寬（80、211、324、560）× 選項（點擊熱區、斷線與孤立點、虛線、線尾標值、負值軸）。
// 色與字串只用固定的 ASCII 與 var() 字串（不經 labels、不經 chartColors），基準只隨 C26 的幾何與 markup 改變。

export const SMALL_MULTIPLES_BASELINE_FILE = "tests/fixtures/small-multiples-v4-5.json";
const WIDTHS = [80, 211, 324, 560] as const;
const noop = () => undefined;

const axis = (domain: [number, number], ticks: number[]): SmallMultiplePanel["axis"] => ({ domain, ticks, labels: ticks.map(tick => `${Math.round(tick * 100)}%`) });
const PANELS: SmallMultiplePanel[] = [
  {
    key: "discount_rate", title: "A", axis: axis([0, 0.2], [0, 0.1, 0.2]),
    series: [
      { key: "previous", color: "var(--x-previous)", strokeWidth: 1.5, values: [0.1, 0.12, null, 0.15, 0.11, 0.13], keys: ["2026-01-01", "2026-01-08", null, "2026-01-22", "2026-01-29", "2026-02-05"] },
      { key: "yoy", color: "var(--x-yoy)", strokeWidth: 1.5, dash: "4 3", values: [0.09, null, 0.1, null, 0.12, 0.14] },
      { key: "current", color: "var(--x-current)", strokeWidth: 2, values: [0.11, 0.18, 0.2, null, 0.19, 0.17], keys: ["2026-02-12", "2026-02-19", "2026-02-26", null, "2026-03-12", "2026-03-19"], lastDot: true, lastLabel: "17.0%" },
    ],
  },
  {
    key: "gross_margin", title: "B", axis: axis([-0.1, 0.5], [-0.1, 0, 0.1, 0.2, 0.3, 0.4, 0.5]),
    series: [
      { key: "current", color: "var(--x-current)", strokeWidth: 2, values: [-0.05, 0.4, 0.45, 0.42, null, null], lastDot: true, lastLabel: "42.0%" },
    ],
  },
];
const X_LABELS = ["1", "2", "3", "4", "5", "6"];
/** 只有一個位置（golden 兩期各 1 天的情形）：前後都斷的單一點。 */
const SINGLE: SmallMultiplePanel = { ...PANELS[1], series: [{ ...PANELS[1].series[0], values: [0.4] }] };

/** 產生基準（鍵依插入順序；JSON 檔以同一順序寫出）。 */
export async function smallMultiplesBaseline(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const inputs: [string, DatasetInput][] = [["demo", fixture("demo")], ["golden", fixture("golden")], ["refund_only", fixture("refund_only")], ["synthetic-4-channel", synthetic4ChannelInput()], ["yoy", yoyInput()]];
  for (const [name, input] of inputs) {
    const dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    const html = renderToStaticMarkup(createElement(RatesSection, { snapshot, onEvidence: noop }));
    out[`${name} chart-diagnosis-rates`] = element(element(html, 'data-testid="chart-diagnosis-rates"')!, 'class="multiples-grid"')!;
  }
  for (const width of WIDTHS) {
    out[`panels @${width}`] = renderToStaticMarkup(createElement(SmallMultiples, { panels: PANELS, xLabels: X_LABELS, width }));
    out[`panels-click @${width}`] = renderToStaticMarkup(createElement(SmallMultiples, { panels: PANELS, xLabels: X_LABELS, width, onPoint: noop }));
    out[`single @${width}`] = renderToStaticMarkup(createElement(SmallMultiples, { panels: [SINGLE], xLabels: ["1"], width }));
  }
  out["ssr-width"] = renderToStaticMarkup(createElement(SmallMultiples, { panels: PANELS, xLabels: X_LABELS }));
  return out;
}
