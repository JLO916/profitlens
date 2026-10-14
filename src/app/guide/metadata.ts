import type { Metadata } from "next";
import { fill, labels } from "@/i18n";
import { guideLabels } from "@/i18n/guide.zh-TW";

/** 說明頁的 <title>：該頁標題（已解析 {ui:…}）接上品牌名（guide.common.pageTitle；品牌名取 labels.brand.name，不寫死）。 */
export function guidePageTitle(page: string): string {
  return fill(guideLabels.guide.common.pageTitle, { page, brand: labels.brand.name });
}

/**
 * V41-1（D-V41-13＝A；docs/revamp-v4.1/01_PRD.md §3.8）：每個說明頁的 metadata 都由這個 helper 產生（title 傳 guidePageTitle(…) 的結果）。
 * Next 合併 metadata 時巢狀欄位整組覆蓋：子頁只設 openGraph.url 會把根 layout（src/app/layout.tsx）的分享圖、站名、locale、type 全部蓋掉，
 * 不覆寫 canonical 又會全部指回首頁（根 layout 是 "/"），所以 openGraph、twitter、alternates.canonical 一次給齊；分享圖沿用 /og.png。
 * path 是該頁路徑（例如 "/guide"），由根 layout 的 metadataBase 補成正式站網址。
 */
export function guideMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      siteName: labels.brand.name,
      locale: "zh_TW",
      type: "website",
      images: [{ url: "/og.png", width: 1200, height: 630, alt: labels.brand.title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: ["/og.png"],
    },
  };
}
