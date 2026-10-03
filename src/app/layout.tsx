import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { labels } from "@/i18n";
import { ANALYTICS_QUEUE_SNIPPET, ANALYTICS_SCRIPT_SRC, analyticsEnabled } from "@/application/analytics";
import { SITE_URL } from "./site";

// R7-3（08 §3）：分享卡片與搜尋摘要。favicon 由 src/app/icon.svg 自動提供；robots.ts／sitemap.ts 同目錄。
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: labels.brand.title,
  description: labels.brand.description,
  openGraph: {
    title: labels.brand.title,
    description: labels.brand.description,
    url: "/",
    siteName: labels.brand.name,
    locale: "zh_TW",
    type: "website",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: labels.brand.title }],
  },
  twitter: {
    card: "summary_large_image",
    title: labels.brand.title,
    description: labels.brand.description,
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // D9＝B：只在 Vercel production 載入 Web Analytics（只記頁面瀏覽與事件名，不含資料內容）；本機、preview、E2E 不載入。
  const analytics = analyticsEnabled({ VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_DISABLE_ANALYTICS: process.env.NEXT_PUBLIC_DISABLE_ANALYTICS });
  return (
    <html lang="zh-Hant-TW">
      <body>
        {children}
        {analytics && <script dangerouslySetInnerHTML={{ __html: ANALYTICS_QUEUE_SNIPPET }} />}
        {analytics && <script defer src={ANALYTICS_SCRIPT_SRC} />}
      </body>
    </html>
  );
}
