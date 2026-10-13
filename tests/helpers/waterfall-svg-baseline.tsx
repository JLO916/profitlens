import { createHash } from "node:crypto";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chartHeights } from "@/application/chart-theme";
import { bridgeWaterfall, overviewWaterfallDomain, profitWaterfall, profitWaterfallScopes } from "@/application/waterfall";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { BridgeSection } from "@/components/overview/charts/bridge-section";
import { ProfitSection } from "@/components/overview/charts/profit-section";
import { WaterfallSvg } from "@/components/overview/charts/waterfall-svg";
import type { DatasetInput } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fixture } from "./fixtures";
import { element } from "./markup";
import { synthetic4ChannelInput } from "./synthetic-4-channel";

// V4-8a 代理 A：C17 WaterfallSvg 在一般模式（12px）的輸出逐字不變的基準。D-V4-9 投影把 --text-12 對應到 14px，瀑布的標值避讓與 x 標籤改用量到的字級；
// 只有量到的字級不是 12px 時才換算，所以一般模式與 SSR 必須與開工錨點 03dc3a8 逐字相同。
// tests/fixtures/waterfall-svg-v4-8a.json 是用本檔在 03dc3a8（瀑布只有 12px 排版）上產生的輸出；tests/overview-charts-waterfall.test.tsx 以改版後的程式重新產生並比對。
// 內容：（1）sections：總覽兩個區塊在六份資料上的 SSR（BridgeSection、ProfitSection 預設合計），取出 svg.waterfall-svg，存全文；
//      （2）sweep：WaterfallSvg 以 width 直接渲染（G1 與 G2 每個範圍＝合計＋各通路；寬 520、560、600＝最小寬，670≈768 投影，800＝SSR，1100，1182≈1280／1440 投影；
//      帶共同尺度，670 與 800 另加不帶），全文太大（約 1.4MB），只存 UTF-8 位元組數與 SHA-256（同 backup-bytes-v4-7b.json 的做法）。
// 字串來自 waterfall.ts 的 bar.display 與 shortLabel（labels 不改），基準只隨瀑布的幾何與 markup 改變。

export const WATERFALL_SVG_BASELINE_FILE = "tests/fixtures/waterfall-svg-v4-8a.json";
const noop = () => undefined;
const WIDTHS = [520, 560, 600, 670, 800, 1100, 1182] as const;

export interface WaterfallDigest { bytes: number; sha256: string }
export interface WaterfallSvgBaseline { sections: Record<string, string>; sweep: Record<string, WaterfallDigest> }
const digest = (text: string): WaterfallDigest => ({ bytes: Buffer.byteLength(text, "utf8"), sha256: createHash("sha256").update(text, "utf8").digest("hex") });

/** 產生基準（鍵依插入順序；JSON 檔以同一順序寫出）。 */
export async function waterfallSvgBaseline(): Promise<WaterfallSvgBaseline> {
  const sections: Record<string, string> = {}, sweep: Record<string, WaterfallDigest> = {};
  const inputs: [string, DatasetInput][] = [
    ["demo", fixture("demo")], ["golden", fixture("golden")], ["zero_ad", fixture("zero_ad")], ["refund_only", fixture("refund_only")],
    ["missing_cogs", fixture("errors/missing_cogs")], ["synthetic-4-channel", synthetic4ChannelInput()],
  ];
  for (const [name, input] of inputs) {
    const snapshot: WorkspaceSnapshot = await createSnapshot(validateDataset(input).dataset!, {}, await hashInput(input));
    sections[`${name} G1`] = element(renderToStaticMarkup(createElement(BridgeSection, { snapshot, onEvidence: noop })), '<svg class="waterfall-svg"')!;
    sections[`${name} G2`] = element(renderToStaticMarkup(createElement(ProfitSection, { snapshot, onEvidence: noop })), '<svg class="waterfall-svg"')!;
    const domain = overviewWaterfallDomain(snapshot);
    const charts: [string, ReturnType<typeof bridgeWaterfall>["bars"], number][] = [["G1", bridgeWaterfall(snapshot).bars, 520], ...profitWaterfallScopes(snapshot).map(scope => [`G2 ${scope.id}`, profitWaterfall(snapshot, scope.id).bars, 600] as [string, ReturnType<typeof bridgeWaterfall>["bars"], number])];
    for (const [chart, bars, minWidth] of charts) for (const width of WIDTHS) {
      sweep[`${name} ${chart} ${width} shared`] = digest(renderToStaticMarkup(createElement(WaterfallSvg, { bars, height: chartHeights.lg, width, minWidth, domain, bare: true })));
      if (width === 670 || width === 800) sweep[`${name} ${chart} ${width} own`] = digest(renderToStaticMarkup(createElement(WaterfallSvg, { bars, height: chartHeights.lg, width, minWidth })));
    }
  }
  return { sections, sweep };
}
