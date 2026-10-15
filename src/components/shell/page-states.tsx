"use client";
import { useEffect, useRef } from "react";
import type { ValidationIssue } from "@/domain/types";
import { labels } from "@/i18n";
import { IssueList } from "../issue-list";
import { TemplateTable } from "./template-table";

/*
 * V3-8 C（PRD §7.10、§9.4 C10 頁面型）：首次進入、載入中、錯誤三種全頁狀態共用同一個容器 section.ui-empty-page.state-page——
 * 靠左、寬上限 640px、padding 24px，高度＝有資料時的總覽首屏（globals.css 的 --empty-min-h），切換狀態時頁尾一直在首屏之外，
 * 載入示範資料前後不跳動（CLS < 0.05）。不放插圖、eyebrow、步驟列、箭頭與問句；主要按鈕放最前面（C12）。
 */
const copy = labels.empty.stateV3;
const fileDescriptions = { "sales_daily.csv": copy.fileDescriptions.sales, "channel_costs_daily.csv": copy.fileDescriptions.costs, "ad_spend_daily.csv": copy.fileDescriptions.ads };

// §7.10 首次進入（Geist empty state 的 Guide 型）：h2＋一句說明＋「載入示範資料」（主要）「匯入資料」（次要）＋「需要的檔案」範本表（多一欄內容）。頁面 h1 由 PageHeader 提供（M6 一個 h1）。
export function FirstRunState({ onLoadDemo, onImport, showActions = true }: { onLoadDemo: () => void; onImport: () => void; /** V3-8 收尾（M6）：資料來源頁的頁首已有「載入示範資料／匯入資料」（§7.7.1 主次對調），該頁的空狀態不再重複按鈕列。 */ showActions?: boolean }) {
  return <section className="ui-empty-page state-page first-run-state" data-testid="empty-state" aria-labelledby="empty-state-title">
    <h2 id="empty-state-title">{labels.empty.title}</h2>
    <p>{labels.empty.body}</p>
    {showActions && <div className="state-actions">
      <button type="button" className="ui-btn ui-btn-primary" data-testid="empty-load-demo" onClick={onLoadDemo}>{labels.shell.buttons.loadDemo}</button>
      <button type="button" className="ui-btn ui-btn-secondary" data-testid="empty-import" onClick={onImport}>{labels.shell.buttons.importData}</button>
    </div>}
    {/* V41-1（D-V41-5）：按鈕列下方一行「操作導覽：每一頁怎麼用」連結（homeHint，陳述句；另開分頁；V41-6 改名、不加圖示）；只跟著按鈕列出現。容器高度仍是 --empty-min-h，這一行收在既有高度內。 */}
    {showActions && <a className="ui-btn ui-btn-text state-guide" href="/guide" target="_blank" rel="noopener" data-testid="guide-entry-home">{labels.shell.guideV41.homeHint}<span className="sr-only">{labels.shell.guideV41.newTab}</span></a>}
    <h3 className="state-files-title" id="empty-state-files">{copy.filesHeading}</h3>
    <TemplateTable layout="guide" descriptions={fileDescriptions} labelledBy="empty-state-files" />
  </section>;
}

// §7.10、C1「載入中」：同一個容器與高度；spinner（沿用 @keyframes spin）＋標題＋一句說明＋骨架（一行＋四格，--bg-subtle 色塊，不做 pulse／shimmer）。
export function LoadingState() {
  return <section className="ui-empty-page state-page loading-state" data-testid="loading-state" aria-busy="true">
    <div className="spinner" aria-hidden="true" />
    <h2>{labels.shell.state.loading.heading}</h2>
    <p>{labels.shell.state.loading.body}</p>
    <div className="state-skeleton" aria-hidden="true">
      <div className="ui-skeleton-line state-skeleton-line" />
      <div className="state-skeleton-grid">{[0, 1, 2, 3].map(index => <div className="ui-skeleton-block" key={index} />)}</div>
    </div>
  </section>;
}

// §7.10 錯誤：同一個容器；h2「資料無法載入。」＋一行原因（role=alert）＋動作列（重新載入 主要、回到上次成功的資料 次要、查看問題清單 文字）；問題清單留在下方。
export function ErrorState({ error, issues, onRetry, onBack }: { error: string; issues: ValidationIssue[]; onRetry: () => void; /** 有上次成功的資料時才給（才出現「回到上次成功的資料」）。 */ onBack?: () => void }) {
  const issuesRef = useRef<HTMLDivElement>(null);
  // 「查看問題清單」：焦點移到問題清單的 region（IssueList 的 .table-scroll，role=region、tabIndex=0）並捲過去；找不到 region 時退回外層容器。
  const viewIssues = () => {
    const region = issuesRef.current?.querySelector<HTMLElement>('[role="region"]') ?? issuesRef.current;
    if (!region) return;
    region.scrollIntoView({ block: "start" });
    region.focus({ preventScroll: true });
  };
  return <section className="ui-empty-page state-page error-state" data-testid="error-state" aria-labelledby="error-state-title">
    <h2 id="error-state-title">{copy.errorTitle}</h2>
    <p role="alert">{error}</p>
    <div className="state-actions">
      <button type="button" className="ui-btn ui-btn-primary" data-testid="error-retry" onClick={onRetry}>{labels.shell.state.errorState.retry}</button>
      {onBack && <button type="button" className="ui-btn ui-btn-secondary" data-testid="error-back" onClick={onBack}>{labels.shell.state.errorState.back}</button>}
      {issues.length > 0 && <button type="button" className="ui-btn ui-btn-text" data-testid="error-view-issues" onClick={viewIssues}>{copy.viewIssues}</button>}
    </div>
    {issues.length > 0 && <div ref={issuesRef} className="state-issues" data-testid="error-issues" tabIndex={-1}><IssueList issues={issues} /></div>}
  </section>;
}

/*
 * V4-8b（D-V4-44 B、D-V4-56＝A、D-V4-57＝A）：隨頁載入的等待與失敗。切頁時導覽標示與頁標題立刻換成新頁；這一頁的程式還沒載入時，內容區先放骨架，
 * 載入失敗時放錯誤狀態。兩者都是 main 的直接子元素（不在 .view-content 內，投影白名單不會把它藏起來），沿用同一個頁面型容器與高度（--empty-min-h），
 * 期間列不位移。testid 與資料載入的 loading-state／error-state 分開（那兩個講的是檢核資料）。
 */
// 等待：同 LoadingState 的 spinner＋標題＋骨架（一行＋四格）；main 由 dashboard 標 aria-busy。
export function PanelLoadingState() {
  return <section className="ui-empty-page state-page loading-state" data-testid="panel-loading" aria-busy="true" aria-labelledby="panel-loading-title">
    <div className="spinner" aria-hidden="true" />
    <h2 id="panel-loading-title">{labels.shell.chartsV4.panelLoad.loading}</h2>
    <div className="state-skeleton" aria-hidden="true">
      <div className="ui-skeleton-line state-skeleton-line" />
      <div className="state-skeleton-grid">{[0, 1, 2, 3].map(index => <div className="ui-skeleton-block" key={index} />)}</div>
    </div>
  </section>;
}

// 失敗：標題（tabIndex=-1，可用程式聚焦、不是 Tab 停留點）＋一句說明（role=alert）＋「再試一次」。
// 出現時焦點移到標題（焦點在 body 或 main 時才移，不搶走使用者正在操作的控制）；消失時焦點若掉到 body（例如按了「再試一次」、或預先載入成功換成內容），交回 main。
export function PanelErrorState({ onRetry }: { onRetry: () => void }) {
  const titleRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    const focused = document.activeElement;
    if (!focused || focused === document.body || focused.id === "main-content") titleRef.current?.focus();
    return () => { if (!document.activeElement || document.activeElement === document.body) document.getElementById("main-content")?.focus({ preventScroll: true }); };
  }, []);
  return <section className="ui-empty-page state-page error-state" data-testid="panel-load-error" aria-labelledby="panel-load-error-title">
    <h2 id="panel-load-error-title" ref={titleRef} tabIndex={-1}>{labels.shell.chartsV4.panelLoad.errorTitle}</h2>
    <p role="alert">{labels.shell.chartsV4.panelLoad.errorBody}</p>
    <div className="state-actions">
      <button type="button" className="ui-btn ui-btn-primary" data-testid="panel-load-retry" onClick={onRetry}>{labels.shell.chartsV4.panelLoad.retry}</button>
    </div>
  </section>;
}
