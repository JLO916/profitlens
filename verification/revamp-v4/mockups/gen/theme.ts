import { chartColors } from "@/application/chart-theme";

// 設計稿的圖表色：既有 chartColors（src/application/chart-theme.ts）加上 PRD §6.5 尚未宣告的新 token（值在 ../tokens.css 的「設計稿用、尚未進 :root」區）。
// 正式宣告批次：--chart-target、--chart-h-xs 於 V4-2；--chart-seg-1..3 於 V4-3a；--chart-heat-1..2、--red-100、--chart-missing 於 V4-3b。
export const colors = {
  ...chartColors,
  target: "var(--chart-target)",
  seg1: "var(--chart-seg-1)",
  seg2: "var(--chart-seg-2)",
  seg3: "var(--chart-seg-3)",
  heat1: "var(--chart-heat-1)",
  heat2: "var(--chart-heat-2)",
  missing: "var(--chart-missing)",
} as const;

/** 依列計高的常數（PRD §6.5 的 chartRowHeights；V4-1 或 V4-2 才進 chart-theme.ts）。 */
export const rowHeights = { cell: 6, row16: 16, row24: 24 } as const;
