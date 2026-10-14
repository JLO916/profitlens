// V41-1（docs/revamp-v4.1/01_PRD.md §3.4）：說明頁的 {ui:路徑} 渲染。伺服器元件（不加 "use client"）；只給 src/app/guide/**、src/components/guide/** 使用。
// 引用的介面字串取自 labels.zh-TW.ts 原字串（resolveUiRefs，路徑不存在就丟錯）；步驟內文（steps.*.body）渲染成粗體，其他欄位一律純文字。
import { Fragment } from "react";
import { labels } from "@/i18n";
import { resolveUiRefs, uiRefParts } from "@/application/guide";

/** 說明文字的純文字版（標題、alt、aria、metadata 等不能有標記的地方）：{ui:路徑} 換成 labels 原字串。 */
export function guideText(text: string): string {
  return resolveUiRefs(text, labels);
}

/** 渲染一段說明文字；emphasis 時引用的介面字串用 <strong>（只給步驟內文用），否則與 guideText 相同、輸出純文字。 */
export function GuideText({ text, emphasis = false }: { text: string; emphasis?: boolean }) {
  if (!emphasis) return guideText(text);
  return uiRefParts(text, labels).map((part, index) => part.ui ? <strong key={index}>{part.text}</strong> : <Fragment key={index}>{part.text}</Fragment>);
}
