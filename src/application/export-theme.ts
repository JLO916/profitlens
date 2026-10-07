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
} as const;

export type ExportThemeKey = keyof typeof EXPORT_THEME;

/** 每個顏色對應的 :root token（測試用；值要一一相符）。 */
export const EXPORT_THEME_TOKENS: Readonly<Record<ExportThemeKey, string>> = {
  brand: "--accent", ink: "--text-primary", muted: "--text-secondary", line: "--border-subtle", lineStrong: "--border-strong", paper: "--bg-subtle",
  surface: "--bg-surface", unfavorable: "--unfavorable", favorable: "--favorable", onBrand: "--on-accent", headerFill: "--gray-50",
};

/** OOXML 的 ARGB（不透明）：Excel 樣式的 rgb 屬性用。 */
export const argb = (hex: string): string => `FF${hex.toUpperCase()}`;
