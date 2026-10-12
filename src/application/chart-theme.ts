// V3-4b 圖表色與尺寸的單一來源（PRD §9.5「圖表色集中在 chart-theme.ts，用 getComputedStyle 讀 token，元件內不得出現 hex」）。
// 值一律是 globals.css :root 的語意 token（var(--chart-*)），淺色、深色主題由 CSS 切換；這裡不寫任何色碼。
// SVG 的 fill／stroke 可以直接用 var() 字串；Recharts 等需要實際色值的地方（例如輸出圖片）才呼叫 readChartColors。

/** 圖表語意色：本期、上期、去年同期、起訖與小計柱、不利段、有利段（D-V3-7）、「其他」類別、格線、軸、檔期區帶、瀑布連接線、圖底色。 */
export const chartColors = {
  current: "var(--chart-current)",
  previous: "var(--chart-previous)",
  yoy: "var(--chart-yoy)",
  total: "var(--chart-total)",
  unfavorable: "var(--chart-unfavorable)",
  favorable: "var(--chart-favorable)",
  other: "var(--chart-other)",
  grid: "var(--chart-grid)",
  axis: "var(--chart-axis)",
  band: "var(--chart-band)",
  /** V4-2（PRD §6.5）：目標刻度、門檻點、目標線。 */
  target: "var(--chart-target)",
  /** V4-3a（PRD §6.5）：G10 每 100 元去向的三段（商品成本、四項通路費用、廣告費）。 */
  seg1: "var(--chart-seg-1)",
  seg2: "var(--chart-seg-2)",
  seg3: "var(--chart-seg-3)",
  /** V4-3b（PRD §6.5，D-V4-17）：G11 熱表兩階的底色（只有兩階，X33）與新圖的資料待補虛線框。 */
  heat1: "var(--chart-heat-1)",
  heat2: "var(--chart-heat-2)",
  missing: "var(--chart-missing)",
  connector: "var(--border-strong)",
  surface: "var(--bg-surface)",
} as const;
export type ChartColorKey = keyof typeof chartColors;

/** 通路等類別色（PRD §7.1 第 8 點：最多 4 個類別色，超過的合併成「其他」並用 chartColors.other）。 */
export const chartCategoryColors = ["var(--chart-cat-1)", "var(--chart-cat-2)", "var(--chart-cat-3)", "var(--chart-cat-4)"] as const;

/** 圖高（px），對應 --chart-h-sm（總覽並列圖）、--chart-h-lg（瀑布、詳圖）與 V4-2 的 --chart-h-xs（sparkline）；同一列等高，四種狀態等高。 */
export const chartHeights = { sm: 180, lg: 320, xs: 16 } as const;
/**
 * V4-1 依列計高的 inline SVG 列高（px；PRD §6.5）：cell＝C24 表格內嵌條的條高，row16、row24＝C25、C27、C30 每列的高。
 * 不是 CSS token；依列計高的 svg 高度一律寫成它的整數倍或其和（例如 rows * chartRowHeights.row24），不得寫數字常值（CL-10、X34）。
 * V4-7a：axis＝C30 涵蓋時間軸（G20）最下方日期軸列的高（刻度線 4px＋12px 日期字，H5 設計稿 data.html 取 24）；C35 啞鈴的 row28 只在 D-V4-16 選 B 時加。
 */
export const chartRowHeights = { cell: 6, row16: 16, row24: 24, axis: 24 } as const;
/** 軸標與柱上標值的字級（12px）。 */
export const chartFontSize = "var(--text-12)";

const TOKEN = /^var\((--[\w-]+)\)$/;
/** 從「var(--chart-current)」取出「--chart-current」；不是單一 var() 時回傳 null。 */
export function chartTokenName(value: string): string | null {
  return TOKEN.exec(value.trim())?.[1] ?? null;
}

/**
 * 讀出圖表色的實際值（瀏覽器端）：getComputedStyle(root ?? document.documentElement).getPropertyValue(token).trim()。
 * 沒有 document（伺服器端、單元測試）、getComputedStyle 失敗或讀不到值時，該色回傳 var() 字串本身，畫面照常由 CSS 解析。
 */
export function readChartColors(root?: Element | null): Record<ChartColorKey, string> {
  const fallback = { ...chartColors } as Record<ChartColorKey, string>;
  if (typeof document === "undefined" || typeof getComputedStyle !== "function") return fallback;
  const target = root ?? document.documentElement;
  if (!target) return fallback;
  let style: CSSStyleDeclaration;
  try { style = getComputedStyle(target); } catch { return fallback; }
  return Object.fromEntries((Object.keys(chartColors) as ChartColorKey[]).map(key => {
    const name = chartTokenName(chartColors[key]);
    let value = "";
    try { value = name ? style.getPropertyValue(name).trim() : ""; } catch { value = ""; }
    return [key, value || chartColors[key]];
  })) as Record<ChartColorKey, string>;
}
