/* eslint-disable @next/next/no-html-link-for-pages -- 說明頁刻意用 <a> 整頁載入工作台 /：next/link 會把用戶端路由元件帶進說明頁，頁面 JS 要維持只有框架（06_BATCHES V41-1 B2）。 */
import type { ReactNode } from "react";
import { labels } from "@/i18n";
import { guideLabels } from "@/i18n/guide.zh-TW";
import { analyticsEnabled } from "@/application/analytics";
import { ShellIcon } from "@/components/shell/shell-icon";

// V41-1（D-V41-4＝A；docs/revamp-v4.1/01_PRD.md §3.1、§3.3、§3.6）：說明頁外框——跳至主要內容、品牌（連到工作台 /）、「開啟工作台」、頁尾。
// 伺服器元件、靜態產生；不用工作台殼層，也不 import dashboard、圖表、Recharts、pptxgenjs、xlsx（tests/guide-routes.test.tsx）。
// 連結一律用 <a>（不用 next/link），頁面 JS 只有框架本身；說明頁沒有輸入、表單，不讀寫 localStorage，不呼叫 /api/*。
export default function GuideLayout({ children }: { children: ReactNode }) {
  // D9＝B、D-V41-23：頁尾的使用分析揭露只在實際載入分析腳本時顯示（與 src/app/layout.tsx 同一判斷）。
  const analytics = analyticsEnabled({ VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_DISABLE_ANALYTICS: process.env.NEXT_PUBLIC_DISABLE_ANALYTICS });
  return <div className="guide-shell">
    <a className="skip-link" href="#main-content">{labels.shell.sidebar.skipLink}</a>
    <header className="guide-header">
      <a className="guide-brand" href="/"><span className="brand-mark"><ShellIcon name="lens" size={16} /></span><span>{labels.brand.name}</span></a>
      <a className="ui-btn ui-btn-secondary" href="/">{guideLabels.guide.hub.openApp}</a>
    </header>
    <main id="main-content" className="guide-main" tabIndex={-1}>{children}</main>
    <footer className="guide-footer">
      <div className="guide-footer-inner">
        <p>{labels.shell.sidebar.sidebarNote.demo}</p>
        <p>{labels.shell.sidebar.sidebarNote.local}</p>
        {analytics && <p>{labels.relaunch.analyticsNote}</p>}
      </div>
    </footer>
  </div>;
}
