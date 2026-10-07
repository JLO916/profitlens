/**
 * V3-9b 開工錨點（F14 匯出範本變體，PRD §10.1 F14）：standard＝現況；boss＝老闆一頁版（只留 L1）；client＝代營運客戶報告版。
 * 只是型別與常數；各管線（列印／PDF、Excel、PPT）依變體改版面由 B 代理在各自的 builder 實作，數值與 metric_version 標記不變。
 */
export const EXPORT_VARIANTS = ["standard", "boss", "client"] as const;
export type ExportVariant = typeof EXPORT_VARIANTS[number];
export const DEFAULT_EXPORT_VARIANT: ExportVariant = "standard";
