/* eslint-disable @next/next/no-img-element -- 說明頁的截圖刻意用 <img>：靜態 WebP 已在擷取時轉好、寬高取自媒體清單，不需要伺服器端圖片處理（PRD §3.7 不用 next/image）。 */
// V41-2a（docs/revamp-v4.1/01_PRD.md §3.3 第 4 項、§3.5、§3.6、§3.7）：功能區頁的一個步驟——h2 標題（動詞開頭）、操作文字（引用的介面字串粗體）、截圖與圖說。
// 伺服器元件（不加 "use client"）。截圖：<figure> 內一個連到原尺寸檔的 <a>（同一個 WebP；是導覽不是下載），可及名稱＝alt＋guide.common.fullSize（sr-only）；
// <img> 寫 width／height（取自 src/application/guide-media.json）與 decoding="async"，頁面第一張圖不 lazy、其餘 loading="lazy"。
// 圖說＝這一步的結果，另起一行加資料來源註記（guideDataNote：demo／synthetic；none 不加）。媒體清單沒有這張圖時不渲染 figure（只有文字）。
import { guideLabels } from "@/i18n/guide.zh-TW";
import { guideDataNote, type GuideAreaCode, type GuideMediaEntry, type GuideStep as GuideStepData } from "@/application/guide";
import { GuideText, guideText } from "./guide-text";

/** 一個步驟的文字（guide.areas.{area}.steps.{key}）。 */
export interface GuideStepCopy {
  title: string;
  body: string;
  alt: string;
  caption: string;
}

const common = guideLabels.guide.common;

export function GuideStep({ area, step, copy, media, eager = false }: { area: GuideAreaCode; step: GuideStepData; copy: GuideStepCopy; media?: GuideMediaEntry; eager?: boolean }) {
  const note = guideDataNote(step.mediaId);
  const src = media ? `/${media.file}` : "";
  return <li id={step.key} className="guide-step" data-testid={`guide-step-${area}-${step.key}`}>
    <h2>{guideText(copy.title)}</h2>
    <p><GuideText text={copy.body} emphasis /></p>
    {media && <figure className="guide-shot" data-testid={`guide-shot-${step.mediaId}`}>
      <a className="guide-shot-link" href={src}><img src={src} alt={guideText(copy.alt)} width={media.width} height={media.height} loading={eager ? undefined : "lazy"} decoding="async" /><span className="sr-only">{guideText(common.fullSize)}</span></a>
      <figcaption><span>{guideText(copy.caption)}</span>{note !== "none" && <span className="guide-shot-note">{guideText(note === "synthetic" ? common.syntheticCaption : common.demoCaption)}</span>}</figcaption>
    </figure>}
  </li>;
}
