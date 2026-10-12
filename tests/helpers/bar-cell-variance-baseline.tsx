import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { buildManagerSummary } from "@/application/manager-summary";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { BarCell, type BarCellFavorableFill, type BarCellTone } from "@/components/charts/bar-cell";
import { DiagnosisList } from "@/components/diagnosis-list";
import { BridgeSection } from "@/components/overview/charts/bridge-section";
import { ChannelSection } from "@/components/overview/charts/channel-section";
import type { DatasetInput } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./fixtures";
import { element } from "./markup";
import { synthetic4ChannelInput } from "./synthetic-4-channel";

// V4-7b 代理 A：C24 BarCell variance 模式向下相容的基準（本批加 share、pair 兩種模式，variance 的輸出必須逐字不變）。
// tests/fixtures/bar-cell-variance-v4-7a.json 是用本檔在 V4-7b 開工錨點（3ea161b，BarCell 只有 variance）上產生的輸出；tests/bar-cell.test.ts 以擴充後的程式重新產生並逐字比對。
// 內容：（1）三個使用 variance 的頁面元件在六份資料上的 SSR，取出每一個 svg.bar-cell（G6 橋接表 BridgeSection、G4 各通路 ChannelSection、
//      G9 健檢清單 DiagnosisList；G9 另加 golden 門檻 100.00 與 0.00 兩種刻度狀態）；
//      （2）BarCell 以固定的輸入直接渲染：幾何掃描＝值（正、負、0、缺值、無法解析、超出尺度、比例極小）× 尺度（有效、負、0、缺值、數值）；
//      選項掃描＝四個代表值 × 三種 tone × 選項（favorableFill、outline、tick 的各種狀態、className、onClick、testId）。
// 字串只用固定的 ASCII 與數字（不經 labels），基準只隨 BarCell 的幾何與 markup 改變。

export const BAR_CELL_VARIANCE_BASELINE_FILE = "tests/fixtures/bar-cell-variance-v4-7a.json";
const noop = () => undefined;

/** 取出 html 內所有 C24 根 svg（依出現順序），鍵用它的 data-testid。 */
function barCells(html: string): [string, string][] {
  const out: [string, string][] = [];
  let at = html.indexOf('<svg class="bar-cell');
  while (at >= 0) {
    const svg = element(html.slice(at), '<svg class="bar-cell')!;
    const testId = /data-testid="([^"]*)"/.exec(svg)?.[1] ?? `#${out.length}`;
    out.push([testId, svg]);
    at = html.indexOf('<svg class="bar-cell', at + svg.length);
  }
  return out;
}

type Direct = { value: string | number | null | undefined; max: string | number | null | undefined; tick?: string | number | null; outline?: boolean; tone: BarCellTone; favorableFill?: BarCellFavorableFill; className?: string; click?: boolean; testId?: string };
const VALUES: (string | number | null | undefined)[] = ["3161970.00", "-1575080.55", "-8545.42", "0.01", "0.00", "-0.00", null, undefined, "", "n/a", "-500", 50, -50];
const MAXES: (string | number | null | undefined)[] = ["3161970.00", "-315", "0", null, 200];
const OPTION_VALUES: (string | null)[] = ["-1575080.55", "3161970.00", "0.00", null];
const TONES: BarCellTone[] = ["unfavorable", "favorable", "neutral"];
const OPTIONS: Omit<Direct, "value" | "max" | "tone">[] = [
  {},
  { favorableFill: "total" },
  { outline: true },
  { tick: "300000.00" },
  { tick: "0.00" },
  { tick: "-25" },
  { tick: "9999999999" },
  { outline: true, tick: "300000.00", className: "impact-bar" },
  { className: "bridge-bar-cell", click: true, testId: "chart-overview-bridge-bar-cogs_net" },
];

/** 產生基準（鍵依插入順序；JSON 檔以同一順序寫出）。 */
export async function barCellVarianceBaseline(): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const inputs: [string, DatasetInput][] = [
    ["demo", fixture("demo")], ["golden", fixture("golden")], ["zero_ad", fixture("zero_ad")], ["refund_only", fixture("refund_only")],
    ["missing_cogs", fixture("errors/missing_cogs")], ["synthetic-4-channel", synthetic4ChannelInput()],
  ];
  for (const [name, input] of inputs) {
    const snapshot: WorkspaceSnapshot = await createSnapshot(validateDataset(input).dataset!, {}, await hashInput(input));
    const pages: [string, string][] = [
      ["G6", renderToStaticMarkup(createElement(BridgeSection, { snapshot, onEvidence: noop }))],
      ["G4", renderToStaticMarkup(createElement(ChannelSection, { snapshot, onEvidence: noop }))],
      ["G9", renderToStaticMarkup(createElement(DiagnosisList, { snapshot, onEvidence: noop }))],
    ];
    if (name === "golden") for (const threshold of ["100.00", "0.00"]) {
      const groups = buildManagerSummary(snapshot, { importanceThreshold: threshold }).diagnosis;
      pages.push([`G9 threshold ${threshold}`, renderToStaticMarkup(createElement(DiagnosisList, { snapshot, onEvidence: noop, groups, importanceThreshold: threshold }))]);
    }
    for (const [page, html] of pages) for (const [testId, svg] of barCells(html)) out[`${name} ${page} ${testId}`] = svg;
  }
  const direct = (key: string, props: Direct) => {
    out[`direct ${key}`] = renderToStaticMarkup(createElement(BarCell, {
      mode: "variance", value: props.value, max: props.max, tick: props.tick, outline: props.outline, tone: props.tone, favorableFill: props.favorableFill,
      className: props.className, testId: props.testId, onClick: props.click ? noop : undefined,
    }));
  };
  for (const value of VALUES) for (const max of MAXES) direct(`geometry ${String(value)} / ${String(max)}`, { value, max, tone: "unfavorable" });
  for (const value of OPTION_VALUES) for (const tone of TONES) for (const [index, option] of OPTIONS.entries()) direct(`option ${String(value)} ${tone} #${index}`, { value, max: "3161970.00", tone, ...option });
  return out;
}
