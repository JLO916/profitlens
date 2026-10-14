// V41-2a（docs/revamp-v4.1/01_PRD.md §3.3）：功能區的連結或純文字——頁面已上線（在 GUIDE_AREAS）時是連到 /guide/{area}（可帶頁內錨點）的連結，還沒上線時只顯示標題文字（不產生 404 的連結）。
// 伺服器元件（不加 "use client"）；說明首頁（獨特性、三種角色、30 秒上手以外的連結）與功能區頁（要注意、下一步）共用。文字是功能區標題（guide.areas.{area}.title，已解析 {ui:…}）。
import { guideLabels } from "@/i18n/guide.zh-TW";
import { guideAreaHref, type GuideAreaCode } from "@/application/guide";
import { guideText } from "./guide-text";

export function GuideAreaRef({ area, hash }: { area: GuideAreaCode; hash?: string }) {
  const href = guideAreaHref(area, hash);
  const title = guideText(guideLabels.guide.areas[area].title);
  return href ? <a className="guide-link" href={href}>{title}</a> : <span>{title}</span>;
}
