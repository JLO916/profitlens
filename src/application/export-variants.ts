import { compareMoney } from "../domain/metrics";
import type { Metric } from "../domain/types";
import { clientHeaderLine, type ExportHeader } from "./export-header";
import type { ManagerSummary } from "./manager-summary";
import { snapshotSentence } from "./weekly-summary";
import type { WorkspaceSnapshot } from "./workspace";

/**
 * V3-9b 開工錨點（F14 匯出範本變體，PRD §10.1 F14）：standard＝現況；boss＝老闆一頁版（只留 L1）；client＝代營運客戶報告版。
 * 只是型別與常數；各管線（列印／PDF、Excel、PPT）依變體改版面由 B 代理在各自的 builder 實作，數值與 metric_version 標記不變。
 */
export const EXPORT_VARIANTS = ["standard", "boss", "client"] as const;
export type ExportVariant = typeof EXPORT_VARIANTS[number];
export const DEFAULT_EXPORT_VARIANT: ExportVariant = "standard";

/** Excel 工作表的代號（名稱在 labels：excelExport.sheets.* 與 exports.variantsV3.pnlSheet）。 */
export type ExcelSheetKey = "summary" | "channels" | "bridge" | "products" | "actions" | "basis" | "pnl";

/**
 * V3-9b F14（PRD §10.1 F14、§7.9、§9.6、D-V3-8）：三個變體的版面規則，列印／PDF、Excel、PPT 三個管線都只讀這一份。
 * 只決定「放不放、放在哪」，不改任何數字：三個變體用同一個 ManagerSummary／snapshot，數值逐格相同。
 */
export interface ExportVariantSpec {
  variant: ExportVariant;
  /** 版頭（§7.9 四行）：clientLine＝第 1 行之後加「客戶：{資料集名稱} · 製表：EC ProfitLens」一行。 */
  header: { clientLine: boolean };
  /** 第一頁（列印第一頁、PPT 投影片、Excel 摘要工作表）的區塊。 */
  sections: {
    /** 本期一句話（總覽同一句，weekly-summary.ts 的 snapshotSentence）。 */
    oneLiner: boolean;
    /** headlines＝既有兩個關鍵數字（淨營收、扣廣告後貢獻）；four＝四層（淨營收、商品毛利、扣廣告前貢獻、扣廣告後貢獻）。 */
    kpis: "headlines" | "four";
    /** 資料範圍（Excel 的資料範圍列、列印版頭後的會議與範圍一行、門檻一行）。 */
    scope: boolean;
    /** 三件事的範圍與下一步（false＝只留標題與影響金額）。 */
    priorityDetail: boolean;
    /** 其他常用指標（V3-9a 損益兩平 MER 一列）。 */
    assist: boolean;
    /** 通路寬表。 */
    channels: boolean;
    /** 方案與待辦（列印的選入方案與置頂待辦、PPT 的置頂待辦）。 */
    decisions: boolean;
    /** 口徑一句（列印頁尾、PPT 頁尾）。 */
    footer: boolean;
  };
  /** 內部備註：決策備註、待辦進度紀錄（執行狀態的備註、狀態更新日）、引用歷史（引用較早資料、待辦的確認狀態）。 */
  internal: { decisionNotes: boolean; actionProgress: boolean; citationHistory: boolean };
  /** 附錄（列印從新的一頁開始）：方案假設全文、備註全文、其他待辦、每週管理損益表、技術細節（含 Excel 指標定義的技術列、PPT 的資料版本）。 */
  appendix: { assumptions: boolean; notes: boolean; otherActions: boolean; pnl: boolean; technical: boolean };
  /** Excel 工作表與順序；管理損益表（D-V3-8 括號負數）三個變體都有，放在最後。 */
  excelSheets: readonly ExcelSheetKey[];
}

const ALL_SECTIONS: ExportVariantSpec["sections"] = { oneLiner: false, kpis: "headlines", scope: true, priorityDetail: true, assist: true, channels: true, decisions: true, footer: true };
const STANDARD_SHEETS: readonly ExcelSheetKey[] = ["summary", "channels", "bridge", "products", "actions", "basis", "pnl"];
const SPECS: Readonly<Record<ExportVariant, ExportVariantSpec>> = {
  // 標準版＝現況（V3-7 正規化基準逐字相同）；只多每週管理損益表（列印附錄、Excel 最後一張工作表）與 Excel 待辦工作表最後的廣告決策欄。
  standard: {
    variant: "standard", header: { clientLine: false }, sections: ALL_SECTIONS,
    internal: { decisionNotes: true, actionProgress: true, citationHistory: true },
    appendix: { assumptions: true, notes: true, otherActions: true, pnl: true, technical: true },
    excelSheets: STANDARD_SHEETS,
  },
  // 老闆一頁版：只留 L1——版頭四行、本期一句話、四個關鍵數字（本期／上期／差額）、三件事的標題與影響金額、決議一行（有會議時）。
  boss: {
    variant: "boss", header: { clientLine: false },
    sections: { oneLiner: true, kpis: "four", scope: false, priorityDetail: false, assist: false, channels: false, decisions: false, footer: false },
    internal: { decisionNotes: false, actionProgress: false, citationHistory: false },
    appendix: { assumptions: false, notes: false, otherActions: false, pnl: false, technical: false },
    excelSheets: ["summary", "pnl"],
  },
  // 代營運客戶報告版：標準版的內容＋客戶行；拿掉內部備註與技術細節，附上每週管理損益表。
  client: {
    variant: "client", header: { clientLine: true }, sections: ALL_SECTIONS,
    internal: { decisionNotes: false, actionProgress: false, citationHistory: false },
    appendix: { assumptions: true, notes: false, otherActions: true, pnl: true, technical: false },
    excelSheets: STANDARD_SHEETS,
  },
};

/** V3-9b F14：變體的版面規則（不認得的值一律當標準版）。 */
export function variantSpec(variant: ExportVariant | undefined = DEFAULT_EXPORT_VARIANT): ExportVariantSpec {
  return Object.hasOwn(SPECS, variant) ? SPECS[variant] : SPECS[DEFAULT_EXPORT_VARIANT];
}

/** V3-9b F14 §7.9：依變體排出版頭各行——標準版與老闆一頁版是原本四行；客戶報告版在第 1 行之後多一行客戶行。 */
export function variantHeaderLines(header: ExportHeader, spec: ExportVariantSpec): string[] {
  const [dataset, ...rest] = header.lines;
  return spec.header.clientLine ? [dataset, clientHeaderLine(header), ...rest] : [...header.lines];
}

/** 老闆一頁版的四個關鍵數字（PRD §10.1 F14、§7.1 KPI 帶的四層）。 */
export const VARIANT_KPI_METRICS = ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"] as const;
export type VariantKpiMetric = typeof VARIANT_KPI_METRICS[number];
export interface VariantKpi { metric: VariantKpiMetric; previous: Metric; current: Metric; change: Metric }
/**
 * V3-9b F14：四個關鍵數字的上期／本期／差額。淨營收與扣廣告後貢獻直接用 summary.headlines（與標準版同一格）；
 * 商品毛利與扣廣告前貢獻取同一個 snapshot 的 report.previous／current.metrics，差額用 domain 的 compareMoney（與 headlines 同一個函式，只是多呼叫一次）。
 * report 必須和 summary 來自同一個 snapshot（呼叫端已比對 dataset_hash／filter_hash）；沒給 report 時只回 headlines 的兩個。
 */
export function variantKpis(summary: ManagerSummary, report?: Pick<WorkspaceSnapshot["report"], "previous" | "current">): VariantKpi[] {
  return VARIANT_KPI_METRICS.flatMap((metric): VariantKpi[] => {
    const headline = summary.headlines.find(row => row.metric === metric);
    if (headline) return [{ metric, previous: headline.previous, current: headline.current, change: headline.change }];
    if (!report) return [];
    const previous = report.previous.metrics[metric], current = report.current.metrics[metric];
    return [{ metric, previous, current, change: compareMoney(previous, current).absolute_change }];
  });
}

/**
 * V3-9b F14：老闆一頁版的本期一句話——與總覽同一個 snapshotSentence（同一份 snapshot、摘要的重要性門檻）。
 * snapshotSentence 只讀 snapshot.report（diagnosisGroups 也只讀 report），所以列印版只拿得到 report 時也能用。
 */
export function variantOneLiner(summary: Pick<ManagerSummary, "importance_threshold">, snapshot: Pick<WorkspaceSnapshot, "report">): string {
  return snapshotSentence(snapshot as WorkspaceSnapshot, { importanceThreshold: summary.importance_threshold }).text;
}
