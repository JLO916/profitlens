"use client";
import { useRef } from "react";
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
    <h2 id="empty-state-title">{labels.emptyState.title}</h2>
    <p>{labels.emptyState.body}</p>
    {showActions && <div className="state-actions">
      <button type="button" className="ui-btn ui-btn-primary" data-testid="empty-load-demo" onClick={onLoadDemo}>{labels.buttons.loadDemo}</button>
      <button type="button" className="ui-btn ui-btn-secondary" data-testid="empty-import" onClick={onImport}>{labels.buttons.importData}</button>
    </div>}
    <h3 className="state-files-title" id="empty-state-files">{copy.filesHeading}</h3>
    <TemplateTable layout="guide" descriptions={fileDescriptions} labelledBy="empty-state-files" />
  </section>;
}

// §7.10、C1「載入中」：同一個容器與高度；spinner（沿用 @keyframes spin）＋標題＋一句說明＋骨架（一行＋四格，--bg-subtle 色塊，不做 pulse／shimmer）。
export function LoadingState() {
  return <section className="ui-empty-page state-page loading-state" data-testid="loading-state" aria-busy="true">
    <div className="spinner" aria-hidden="true" />
    <h2>{labels.ui.dashboard.loading.heading}</h2>
    <p>{labels.ui.dashboard.loading.body}</p>
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
      <button type="button" className="ui-btn ui-btn-primary" data-testid="error-retry" onClick={onRetry}>{labels.ui.dashboard.errorState.retry}</button>
      {onBack && <button type="button" className="ui-btn ui-btn-secondary" data-testid="error-back" onClick={onBack}>{labels.ui.dashboard.errorState.back}</button>}
      {issues.length > 0 && <button type="button" className="ui-btn ui-btn-text" data-testid="error-view-issues" onClick={viewIssues}>{copy.viewIssues}</button>}
    </div>
    {issues.length > 0 && <div ref={issuesRef} className="state-issues" data-testid="error-issues" tabIndex={-1}><IssueList issues={issues} /></div>}
  </section>;
}
