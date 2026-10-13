"use client";

import { chartFontSize, chartHeights, chartRowHeights } from "@/application/chart-theme";
import { EXPORT_THEME, type ExportThemeKey } from "@/application/export-theme";
import type { ExportChartId } from "@/application/export-variants";
import { formatPeriodL1 } from "@/application/presentation";
import { bridgeWaterfall, profitWaterfall, type WaterfallBar, type WaterfallTone } from "@/application/waterfall";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { fill, labels } from "@/i18n";
import { bridgeRowText } from "../overview/charts/bridge-section";
import { profitRowAmount, profitRowLabel, profitRowShare } from "../overview/charts/profit-section";
import { waterfallGeometry, waterfallTextWidth } from "../overview/charts/waterfall-svg";

// V4-9a 代理 A：C31 PrintChart 列印用圖（PRD §6.3 C31、§5.10、§7.7；CHART_CATALOG G1、G2 的「匯出」列；D-V4-11＝B）。
// 只放在 PrintSummary 內（列印與匯出 PDF 共用）：inline SVG、固定寬 170mm（viewBox 640）、不用 ResponsiveContainer；幾何沿用 C17 的 waterfallGeometry，
// 柱上標值、刻度與 x 標籤與畫面同一套字串（bars[].display、formatAxisWan、shortLabel），不產生任何新數字。
// 一律灰階，色只取 export-theme.ts：起訖、小計與結果＝paper 底加 0.5pt ink 外框；有利＝chartFavorable 實心；不利＝ink 實心（標值帶「−」）；
// 資料待補＝ink 虛線框不填色。圖例是 SVG 圖形（與柱同樣的填色與外框），不用 CSS background（列印會清掉底色）。
// svg 帶 data-print-chart="{id}"（bridge＝G1、profit＝G2 合計），E2E 以它計數；圖 aria-hidden，結論句與副標在 figcaption。

/** 列印圖的柱樣式：起訖、小計與結果（level）、有利、不利三種，灰階兩兩可辨（tests/export-theme.test.ts）。 */
export type PrintBarStyle = "level" | "favorable" | "unfavorable";
/** 三種柱樣式的填色與外框（EXPORT_THEME 的鍵）；外框 null＝不描邊。 */
export const PRINT_BAR_STYLES: Readonly<Record<PrintBarStyle, { fill: ExportThemeKey; stroke: ExportThemeKey | null }>> = {
  level: { fill: "paper", stroke: "ink" },
  favorable: { fill: "chartFavorable", stroke: null },
  unfavorable: { fill: "ink", stroke: null },
};
/** 圖例順序：起訖與小計、有利、不利。 */
export const PRINT_LEGEND_ORDER: readonly PrintBarStyle[] = ["level", "favorable", "unfavorable"];
/** 柱的語意色（WaterfallTone）→ 列印樣式；資料待補（missing）畫虛線框，回傳 null。結果柱（result）在列印不用品牌色，與起訖同一種。 */
export const printBarStyle = (tone: WaterfallTone): PrintBarStyle | null => tone === "missing" ? null : tone === "favorable" || tone === "unfavorable" ? tone : "level";

/** 固定寬 170mm、viewBox 寬 640（PRD §6.3 C31）。 */
export const PRINT_CHART_WIDTH_MM = 170;
export const PRINT_CHART_VIEW_WIDTH = 640;
/** 圖例一列（chartRowHeights.row16）在上，瀑布（chartHeights.sm）在下（內層 svg 的 y＝圖例列高）。 */
const LEGEND_HEIGHT = chartRowHeights.row16;
const PLOT_HEIGHT = chartHeights.sm;
export const PRINT_CHART_VIEW_HEIGHT = LEGEND_HEIGHT + PLOT_HEIGHT;
/** 列印高（mm）＝viewBox 高 × 170 ÷ 640（196 → 約 52.1mm；老闆一頁版上限 60mm）。 */
export const PRINT_CHART_HEIGHT_MM = (PRINT_CHART_VIEW_HEIGHT * PRINT_CHART_WIDTH_MM) / PRINT_CHART_VIEW_WIDTH;
/** 框線、格線與外框一律 0.5pt。 */
const STROKE = "0.5pt";
/** 圖例記號 12×8（同畫面圖例的 rect 記號），字在記號右邊 4，項目間隔 12。 */
const LEGEND_MARK = { width: 12, height: 8, top: 4, gap: 4, spacing: 12, baseline: 12 } as const;
/** 資料待補的虛線（同畫面）。 */
const MISSING_DASH = "4 3";

const color = (key: ExportThemeKey) => `#${EXPORT_THEME[key]}`;
const strokeOf = (style: PrintBarStyle) => PRINT_BAR_STYLES[style].stroke;

/** 列印圖只讀 report 與 data_as_of（期間文字的年份錨點）；兩個瀑布函式的其他欄位都用不到。 */
export type PrintChartSource = Pick<WorkspaceSnapshot, "report" | "data_as_of">;
const asSnapshot = (source: PrintChartSource) => source as WorkspaceSnapshot;

/** 圖的結論句、副標（圖說）與柱：G1＝bridgeWaterfall；G2＝profitWaterfall 的合計（副標去掉畫面上「切換範圍只影響這張圖」一句）。 */
export function printChartData(id: ExportChartId, source: PrintChartSource): { title: string; subtitle: string; bars: WaterfallBar[] } {
  if (id === "bridge") {
    const data = bridgeWaterfall(asSnapshot(source));
    return { title: data.title, subtitle: data.subtitle, bars: data.bars };
  }
  const data = profitWaterfall(asSnapshot(source), "all");
  const period = formatPeriodL1(source.report.current.period.start, source.report.current.period.end, { days: false, anchor: source.data_as_of });
  return { title: data.title, subtitle: fill(labels.exports.chartsV4.print.profitSubtitle, { section: labels.overview.profit.section, period, scope: data.scopeLabel }), bars: data.bars };
}

const legendLabel = (style: PrintBarStyle) => style === "level" ? labels.exports.chartsV4.print.legend.level : style === "favorable" ? labels.format.favorable : labels.format.unfavorable;

/** 圖例各項的位置：從繪圖區左緣排起，每項＝記號＋間隔＋字寬（12px 估寬）＋項目間隔。 */
function legendItems(left: number): { style: PrintBarStyle; label: string; x: number }[] {
  return PRINT_LEGEND_ORDER.reduce<{ style: PrintBarStyle; label: string; x: number }[]>((items, style) => {
    const previous = items.at(-1);
    const x = previous ? previous.x + LEGEND_MARK.width + LEGEND_MARK.gap + waterfallTextWidth(previous.label) + LEGEND_MARK.spacing : left;
    return [...items, { style, label: legendLabel(style), x }];
  }, []);
}

/** 圖例（SVG 記號＋字）。 */
function PrintLegend({ left }: { left: number }) {
  return <g>{legendItems(left).map(item => {
    const stroke = strokeOf(item.style);
    return <g key={item.style} data-legend={item.style}>
      <rect x={item.x} y={LEGEND_MARK.top} width={LEGEND_MARK.width} height={LEGEND_MARK.height} fill={color(PRINT_BAR_STYLES[item.style].fill)} stroke={stroke ? color(stroke) : undefined} strokeWidth={stroke ? STROKE : undefined} />
      <text x={item.x + LEGEND_MARK.width + LEGEND_MARK.gap} y={LEGEND_MARK.baseline}>{item.label}</text>
    </g>;
  })}</g>;
}

/** C31：一張列印用瀑布（figure＋figcaption 結論句與副標＋固定寬 svg）。 */
export function PrintChart({ id, source, className }: { id: ExportChartId; source: PrintChartSource; className?: string }) {
  const { title, subtitle, bars } = printChartData(id, source);
  const { plot, ticks, shapes, connectors, zeroY, text } = waterfallGeometry(bars, PRINT_CHART_VIEW_WIDTH, PLOT_HEIGHT);
  return <figure className={className} data-print-figure={id}>
    <figcaption><strong>{title}</strong><br />{subtitle}</figcaption>
    <svg viewBox={`0 0 ${PRINT_CHART_VIEW_WIDTH} ${PRINT_CHART_VIEW_HEIGHT}`} width={`${PRINT_CHART_WIDTH_MM}mm`} height={`${PRINT_CHART_HEIGHT_MM}mm`} aria-hidden="true" focusable="false" fontSize={chartFontSize} fill={color("ink")} data-print-chart={id}>
      <PrintLegend left={plot.left} />
      <svg y={LEGEND_HEIGHT} width={PRINT_CHART_VIEW_WIDTH} height={PLOT_HEIGHT} overflow="visible">
        <g>{ticks.map(tick => <line key={tick.value} x1={plot.left} x2={plot.right} y1={tick.y} y2={tick.y} stroke={color("line")} strokeWidth={STROKE} />)}</g>
        <g>{ticks.map(tick => <text key={tick.value} x={plot.left - 8} y={tick.y + text.tickDy} textAnchor="end">{tick.label}</text>)}</g>
        <g>{connectors.map(line => <line key={line.key} x1={line.x1} x2={line.x2} y1={line.y} y2={line.y} stroke={color("lineStrong")} strokeWidth={STROKE} />)}</g>
        <g>{shapes.map(shape => {
          if (!shape.rect) return null;
          const style = shape.rect.dashed ? null : printBarStyle(shape.bar.tone);
          if (style === null) return <rect key={shape.bar.id} data-bar={shape.bar.id} data-fill="missing" x={shape.x} y={shape.rect.y} width={shape.width} height={shape.rect.height} fill="none" stroke={color("ink")} strokeWidth={STROKE} strokeDasharray={MISSING_DASH} />;
          const stroke = strokeOf(style);
          return <rect key={shape.bar.id} data-bar={shape.bar.id} data-fill={style} x={shape.x} y={shape.rect.y} width={shape.width} height={shape.rect.height} fill={color(PRINT_BAR_STYLES[style].fill)} stroke={stroke ? color(stroke) : undefined} strokeWidth={stroke ? STROKE : undefined} />;
        })}</g>
        <g>{shapes.map(shape => shape.value && <text key={shape.bar.id} data-bar={shape.bar.id} x={shape.cx} y={shape.value.y} textAnchor="middle">{shape.bar.display}</text>)}</g>
        <g>{shapes.map(shape => <text key={shape.bar.id} x={shape.cx} y={plot.bottom + text.xFirst} textAnchor="middle">{shape.xLabel.map((line, index) => <tspan key={index} x={shape.cx} dy={index === 0 ? 0 : text.xLine}>{line}</tspan>)}</text>)}</g>
        <line x1={plot.left} x2={plot.right} y1={zeroY} y2={zeroY} stroke={color("lineStrong")} strokeWidth={STROKE} />
      </svg>
    </svg>
  </figure>;
}

/**
 * 附錄的圖資料表（標準與客戶版，D-V4-11＝B）：與畫面同一套列與格式。
 * G1＝橋接表（上期、九項、本期、總差額，L3 到分；最後一列平衡檢核）；G2＝本期利潤結構表（合計；項目、金額 L3、佔淨營收 L2）。
 */
export function PrintChartTable({ id, source }: { id: ExportChartId; source: PrintChartSource }) {
  const page = labels.overview.page;
  if (id === "bridge") {
    const data = bridgeWaterfall(asSnapshot(source));
    const copy = labels.overview.bridgeV3;
    return <table data-print-chart-table={id}><caption>{fill(page.dataTable, { title: labels.overview.sections.bridge })}</caption>
      <thead><tr><th scope="col">{copy.table.item}</th><th scope="col">{copy.table.amount}</th></tr></thead>
      <tbody>{data.rows.map(row => <tr key={row.id} data-row={row.id}><th scope="row">{row.label}</th><td>{bridgeRowText(row)}</td></tr>)}
        <tr data-row="balance"><th scope="row">{copy.balance.label}</th><td>{data.balanceText}</td></tr></tbody>
    </table>;
  }
  const data = profitWaterfall(asSnapshot(source), "all");
  const copy = labels.overview.profit;
  const netRevenue = data.rows.find(row => row.metric === "net_revenue")!.value;
  return <table data-print-chart-table={id}><caption>{fill(page.dataTable, { title: copy.section })}</caption>
    <thead><tr><th scope="col">{copy.table.item}</th><th scope="col">{copy.table.amount}</th><th scope="col">{copy.table.share}</th></tr></thead>
    <tbody>{data.rows.map(row => <tr key={row.id} data-row={row.metric}><th scope="row">{profitRowLabel(row)}</th><td>{profitRowAmount(row)}</td><td>{profitRowShare(row, netRevenue)}</td></tr>)}</tbody>
  </table>;
}
