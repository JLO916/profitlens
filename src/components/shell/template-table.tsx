"use client";
import { downloadText } from "@/application/download";
import { standardCsvTemplate } from "@/application/import-guidance";
import { exampleTemplateUrl, FILE_ROLES } from "@/application/import-wizard";
import { fill, labels } from "@/i18n";

const fileLabel = (role: (typeof FILE_ROLES)[number]) => labels.importWizard.files[role === "sales_daily.csv" ? "sales" : role === "channel_costs_daily.csv" ? "costs" : "ads"];

/**
 * V3-8 開工錨點：匯入範本 3×3 表（§6.5「檔案｜空白範本｜範例檔」）自 shell/export-menu.tsx 原樣搬出（markup 不變），
 * 給頂欄匯出選單（layout="menu"）、空狀態「需要的檔案」表、資料來源頁「範本下載」與匯入精靈步驟 1 共用。
 * layout="guide"（§7.10）多一欄「內容」（descriptions 由呼叫端從 labels 取），範本欄兩個文字按鈕並排、可見文字寫出「空白範本」「範例檔」。
 * 可及名稱沿用 v2：fill(labels.downloads.blankTemplate／exampleTemplate, { file })。
 */
export function TemplateTable({ layout = "menu", descriptions, className, labelledBy }: { layout?: "menu" | "guide"; descriptions?: Partial<Record<(typeof FILE_ROLES)[number], string>>; className?: string; /** V3-8 C（guide 版）：表格的可及名稱指向呼叫端的小標（例如空狀態的「需要的檔案」）。 */ labelledBy?: string }) {
  const copy = labels.shell.topbarV3;
  if (layout === "guide") {
    // V3-8 C（§7.10「需要的檔案」）：檔案欄兩行（檔案名稱＋等寬字的標準檔名，§8.5 第 6 點）；範本欄的兩個文字按鈕包在 .template-links 並排（td 本身維持 table-cell）。
    return <table className={className ?? "template-table template-guide"} aria-labelledby={labelledBy}><thead><tr><th scope="col">{copy.templateColumns.file}</th><th scope="col">{labels.exports.excel.columns.summary.detail}</th><th scope="col">{labels.downloads.templatesHeading}</th></tr></thead>
      <tbody>{FILE_ROLES.map(role => { const file = fileLabel(role); return <tr key={role}><th scope="row"><span className="template-file-label">{file}</span><code className="template-file-name">{role}</code></th><td>{descriptions?.[role] ?? labels.importWizard.fileHints[role === "sales_daily.csv" ? "sales" : role === "channel_costs_daily.csv" ? "costs" : "ads"]}</td>
        <td><span className="template-links"><button type="button" className="ui-btn ui-btn-text" aria-label={fill(labels.downloads.blankTemplate, { file })} onClick={() => downloadText(standardCsvTemplate(role), role)}>{copy.templateColumns.blank}</button><a className="ui-btn ui-btn-text" href={exampleTemplateUrl(role)} download={role} aria-label={fill(labels.downloads.exampleTemplate, { file })}>{copy.templateColumns.example}</a></span></td></tr>; })}</tbody></table>;
  }
  return <table className={className ?? "template-table"}><thead><tr><th scope="col">{copy.templateColumns.file}</th><th scope="col">{copy.templateColumns.blank}</th><th scope="col">{copy.templateColumns.example}</th></tr></thead>
    <tbody>{FILE_ROLES.map(role => { const file = fileLabel(role); return <tr key={role}><th scope="row">{file}</th>
      <td><button type="button" className="ui-btn ui-btn-text" aria-label={fill(labels.downloads.blankTemplate, { file })} onClick={() => downloadText(standardCsvTemplate(role), role)}>{copy.templateCell}</button></td>
      <td><a className="ui-btn ui-btn-text" href={exampleTemplateUrl(role)} download={role} aria-label={fill(labels.downloads.exampleTemplate, { file })}>{copy.templateCell}</a></td></tr>; })}</tbody></table>;
}
