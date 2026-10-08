import type { ReactNode } from "react";
import { labels } from "@/i18n";
import { ShellIcon } from "./shell-icon";

/**
 * V3-3 A1 頁首（56px）：h1 20／600＋選填的一行 13px 描述＋右側本頁動作。不放 eyebrow（X1／X2；labels.brand.tagline 保留給 <title>）。
 * 「匯入資料」（§6.3 #23，`page-import`）只留在資料來源頁；其他頁從頂欄資料狀態的「匯入新資料」或空狀態進入（≤ 2 次點擊）。
 * 資料來源頁的「載入示範資料」維持 v2 的出現條件（已有資料或匯入中）；V3-8 起主次依 hasData 決定（已有資料時「匯入資料」主要，沒有資料時對調；每個容器最多 1 顆主要按鈕）。
 * V3-5：右側固定一個動作插槽 #page-actions（每頁都渲染；沒有內容時不佔高度）。各頁的「匯出本頁」由頁面元件以 portal 放進來（例如商品毛利），
 * 也可以直接用 actions 傳入。
 * V3-6：h1 旁再加一個插槽 #page-title-addon（每頁都渲染；空時不佔位），待辦頁的計數徽章「12 · 置頂 3」與 ? 說明由頁面元件 portal 放進來（或用 titleAddon 傳入）。
 * V3-9b C（F22，PRD §9.7）：「投影模式」按鈕（總覽與會議頁才有）在本頁動作之前；投影中 h1 下方多一行期間文字（期間列隱藏時只剩這一行），不在投影中時不渲染。
 */
export function PageHeader({ title, description, isData, showLoadDemo, onLoadDemo, onImport, actions, titleAddon, hasData = true, importing, presentToggle, presentPeriod }: { title: string; description: string; isData: boolean; showLoadDemo: boolean; onLoadDemo: () => void; onImport: () => void; actions?: ReactNode; titleAddon?: ReactNode; /** V3-8（§7.7.1 第 1 點）：資料來源頁已有資料時「匯入資料」主要、「載入示範資料」次要；沒有資料時對調。省略時視為已有資料（v2 的排法）。 */ hasData?: boolean; /** V3-8 開工錨點（§7.7.2）：匯入中「匯入資料／載入示範資料」保持掛載但 hidden（M1；page-import testid 不消失）。 */ importing?: boolean; /** V3-9b 開工錨點（F22）：總覽與會議頁的「投影模式」按鈕（C 代理實作樣式與行為細節）。 */ presentToggle?: ReactNode; /** V3-9b C（F22）：投影中的一行期間文字（dashboard 依 presentPeriodText 傳入；不在投影中時不傳）。 */ presentPeriod?: string }) {
  return <div className="page-heading">
    <div className="page-heading-text"><h1>{title}</h1>{description && <p className="subtitle">{description}</p>}{presentPeriod && <p className="present-period" data-testid="present-period">{presentPeriod}</p>}</div>
    <div className="page-title-addon" id="page-title-addon" data-testid="page-title-addon">{titleAddon}</div>
    {/* V3-8（§7.7.1 第 1 點）：已有資料時「匯入資料」主要在前、「載入示範資料」次要在後；沒有資料時對調（主要按鈕永遠在最前）。page-import 永遠在「匯入資料」上。 */}
    {isData && <div className="load-controls" hidden={importing || undefined}>
      {!hasData && showLoadDemo && <button type="button" className="ui-btn ui-btn-primary" onClick={onLoadDemo}>{labels.shell.buttons.loadDemo}</button>}
      <button type="button" className={`ui-btn ${hasData ? "ui-btn-primary" : "ui-btn-secondary"}`} data-testid="page-import" onClick={onImport}><ShellIcon name="import" size={16} />{labels.shell.buttons.importData}</button>
      {hasData && showLoadDemo && <button type="button" className="ui-btn ui-btn-secondary" onClick={onLoadDemo}>{labels.shell.buttons.loadDemo}</button>}
    </div>}
    {presentToggle && <div className="page-present">{presentToggle}</div>}
    <div className="page-actions" id="page-actions" data-testid="page-actions">{actions}</div>
  </div>;
}

/** V3-3 A1 頁尾（§7.0）：「扣廣告後貢獻不含固定費與稅。［指標定義］ · 新台幣 · 台北時間」，正式站再加使用分析揭露（D9）。 */
export function ShellFooter({ analytics, onBasis }: { analytics: boolean; onBasis: () => void }) {
  return <footer className="main-footer"><p>{labels.glossary.basis.footer}<button type="button" className="ui-btn ui-btn-text footer-basis" onClick={onBasis}>{labels.shell.buttons.basis}</button><span aria-hidden="true"> · </span>{labels.shell.sidebar.sidebarFooter}</p>{analytics && <p className="analytics-note" data-testid="analytics-note">{labels.relaunch.analyticsNote}</p>}</footer>;
}
