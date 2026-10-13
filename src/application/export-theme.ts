// V3-7 PRD §9.6：PDF、PPT、Excel 用到的色碼集中在這裡（pptxgenjs／SheetJS 要 hex，不帶 #）。
// 每個值都對應 src/app/globals.css :root 的一個語意 token（EXPORT_THEME_TOKENS），tests/export-theme.test.ts 解析 :root 逐一比對；
// 匯出程式碼的其他地方不得出現 hex。D-V3-7＝A：有利不上色（favorable＝主文字色），只有不利用 --unfavorable。

export const EXPORT_THEME = {
  /** 品牌主色：PPT 只用在本期資料與 4pt 頂線（§9.6）。 */
  brand: "1F5A4F",
  /** 主文字。 */
  ink: "1B2426",
  /** 次要文字（標籤、說明）。 */
  muted: "4A5558",
  /** 表格細線。 */
  line: "E4E7E7",
  /** 列印表格線（0.5pt）。 */
  lineStrong: "A9B1B1",
  /** 淺底（PPT、Excel 不當裝飾底色用；保留給表頭以外的淺底需求）。 */
  paper: "F1F3F3",
  /** 白底。 */
  surface: "FFFFFF",
  /** 不利差額（#b03a2e）。 */
  unfavorable: "B03A2E",
  /** 有利差額：不上色，同主文字（D-V3-7）。 */
  favorable: "1B2426",
  /** 強調色上的文字。 */
  onBrand: "FFFFFF",
  /** Excel 表頭底色（#f1f3f3）。 */
  headerFill: "F1F3F3",
  // ── V4-9a 錨點：圖表色（C31 PrintChart、C32 pptChart；PRD §6.5、§5.10）。值與畫面的 --chart-* 相同；
  // PDF 一律灰階：起訖與小計＝paper 底加 ink 外框、有利＝chartFavorable、不利＝ink（chartTotal 與 chartSeg1 同為 gray-700，不拿來區分小計與不利）。
  /** 本期資料（#1f5a4f，同 brand）。 */
  chartCurrent: "1F5A4F",
  /** 上期（gray-400）。 */
  chartPrevious: "7F898B",
  /** 起訖、小計與中性量（gray-700）。 */
  chartTotal: "4A5558",
  /** 不利（#b03a2e，唯一語意色）。 */
  chartUnfavorable: "B03A2E",
  /** 有利：灰實心，不用綠（D-V3-7；gray-400）。 */
  chartFavorable: "7F898B",
  /** 堆疊條第 1–3 段（gray-700、gray-500、gray-400）。 */
  chartSeg1: "4A5558",
  chartSeg2: "5F6A6D",
  chartSeg3: "7F898B",
} as const;

export type ExportThemeKey = keyof typeof EXPORT_THEME;

/** 每個顏色對應的 :root token（測試用；值要一一相符）。 */
export const EXPORT_THEME_TOKENS: Readonly<Record<ExportThemeKey, string>> = {
  brand: "--accent", ink: "--text-primary", muted: "--text-secondary", line: "--border-subtle", lineStrong: "--border-strong", paper: "--bg-subtle",
  surface: "--bg-surface", unfavorable: "--unfavorable", favorable: "--favorable", onBrand: "--on-accent", headerFill: "--gray-50",
  // V4-9a 圖表色
  chartCurrent: "--chart-current", chartPrevious: "--chart-previous", chartTotal: "--chart-total", chartUnfavorable: "--chart-unfavorable", chartFavorable: "--chart-favorable",
  chartSeg1: "--chart-seg-1", chartSeg2: "--chart-seg-2", chartSeg3: "--chart-seg-3",
};

/** OOXML 的 ARGB（不透明）：Excel 樣式的 rgb 屬性用。 */
export const argb = (hex: string): string => `FF${hex.toUpperCase()}`;
