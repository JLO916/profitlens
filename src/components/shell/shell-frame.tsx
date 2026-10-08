"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { fill, labels } from "@/i18n";
import { diagnosisGroups } from "@/application/diagnosis-group";
import { diagnosisCounts } from "../diagnosis-list";
import type { WorkspaceSnapshot } from "@/application/workspace";
import { DataStatus, type DataStatusProps } from "./data-status";
import { ShellIcon } from "./shell-icon";

export type ShellPanel = "overview" | "diagnosis" | "products" | "data" | "scenarios" | "actions" | "meeting" | "validation";
type GroupId = "results" | "causes" | "decisions" | "data";

/** D-V3-14＝A：頁面順序維持 v2（總覽、健檢、商品、試算、待辦、會議、資料），只加分組標題；開發者組只在 #validation 出現。 */
export const NAV_GROUPS: { id: GroupId; items: ShellPanel[] }[] = [
  { id: "results", items: ["overview"] },
  { id: "causes", items: ["diagnosis", "products"] },
  { id: "decisions", items: ["scenarios", "actions", "meeting"] },
  { id: "data", items: ["data"] },
];
/** 手機底部分頁列前四格；其餘頁面在「更多」面板。 */
const TABS = ["overview", "diagnosis", "actions", "meeting"] as const;
const MORE_ITEMS: ShellPanel[] = ["products", "scenarios", "data", "validation"];

export interface ShellFrameProps {
  panel: ShellPanel;
  showValidation: boolean;
  onNavigate: (panel: ShellPanel) => void;
  dataStatus: DataStatusProps;
  ai: { headline: string; detail: string; open: boolean; onToggle: () => void };
  /** Dashboard 的全站 Esc／點外面處理器要用這兩個 ref 關閉 AI popover 並回焦（v2 行為不變）。 */
  aiContainerRef: RefObject<HTMLDivElement | null>;
  aiButtonRef: RefObject<HTMLButtonElement | null>;
  onBasis: () => void;
  /** 儲存選單（WorkspaceStorage）與匯出選單：頂欄同一份元件；手機由「更多」以 CSS 重新定位（M6）。 */
  storage: ReactNode;
  exportMenu: ReactNode;
  /** 側欄徽章：健檢的不利列數（與健檢清單同一份分組，缺資料列不算）、資料問題數、會議稿是否為草稿。snapshot 只在有可看的資料時給。 */
  badges: { snapshot: Pick<WorkspaceSnapshot, "report"> | null; issues: number; meetingDraft: boolean };
}

const navLabel = (id: ShellPanel) => labels.shell.nav[id].headline;

/**
 * V3-3 A1 殼層：頂欄（48px 單列）、側欄（220px，四組）、手機底部分頁列與「更多」面板。
 * - 頂欄右側：資料狀態｜AI 狀態｜指標定義（icon）｜儲存｜匯出；≤ 767px 時 AI、指標定義、儲存、匯出收進 topbar-more（同一份 DOM，CSS 重新定位，M1／M6）。
 * - 側欄 `nav[aria-label=主要導覽]`；手機改用 `mobile-tabbar`（aria-label「手機導覽」，第二個 nav，§6.3 #2 的 M6 選項）。
 * - 「更多」面板常駐掛載（hidden 切換）；Esc 關閉並回焦，點外面關閉；選了頁面就關閉。
 */
export function ShellFrame({ panel, showValidation, onNavigate, dataStatus, ai, aiContainerRef, aiButtonRef, onBasis, storage, exportMenu, badges }: ShellFrameProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  // V3-5：與健檢頁標題列的計數徽章同一個口徑（alertStatus 的不利色調），不再把所有非資料缺漏的群組都算成不利。
  const unfavorable = useMemo(() => badges.snapshot ? diagnosisCounts(diagnosisGroups(badges.snapshot).groups).unfavorable : 0, [badges.snapshot]);
  const moreTrigger = useRef<HTMLButtonElement | null>(null);
  const topbarMoreRef = useRef<HTMLButtonElement>(null);
  const tabMoreRef = useRef<HTMLButtonElement>(null);
  const clusterRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      // 用捕獲階段先於 Dashboard 的 keydown 判斷：開著的頂欄選單、AI popover 或任何 dialog（指標定義、抽屜）要先由各自的處理器關閉並回焦；
      // 只有在沒有任何內層浮層時，這次 Esc 才收起「更多」（V3-3 修正：原本一次 Esc 會同時關閉內層與「更多」，焦點掉到 body）。
      const target = event.target instanceof Element ? event.target : null;
      if (target?.closest("dialog, [role=dialog]")) return;
      if (clusterRef.current?.querySelector(".topbar-menu[open]") || ai.open) return;
      setMoreOpen(false);
      moreTrigger.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target instanceof Node ? event.target : null;
      if (target instanceof Element && target.closest("dialog, .local-save-prompt")) return;
      if (!target) return;
      if ([clusterRef, sheetRef, topbarMoreRef, tabMoreRef].some(ref => ref.current?.contains(target))) return;
      setMoreOpen(false);
    };
    document.addEventListener("keydown", onKey, true); document.addEventListener("mousedown", onPointer);
    return () => { document.removeEventListener("keydown", onKey, true); document.removeEventListener("mousedown", onPointer); };
  }, [moreOpen, ai.open]);
  const toggleMore = (trigger: HTMLButtonElement | null) => { moreTrigger.current = trigger; setMoreOpen(open => !open); };
  const go = (id: ShellPanel) => { setMoreOpen(false); onNavigate(id); };
  // 計數徽章與草稿標籤：可見字由 CSS 從 data-mark 畫出（不進 textContent），按鈕的可及名稱維持頁名（E2E 以頁名定位），
  // 完整意思（「3 項不利」）以 aria-describedby 指向徽章的 aria-label。
  const end = (id: ShellPanel) => {
    const mark = id === "diagnosis" && unfavorable > 0 ? { text: String(unfavorable), label: fill(labels.shell.sidebarV3.unfavorableBadge, { n: unfavorable }), className: "ui-count-badge" }
      : id === "data" && badges.issues > 0 ? { text: String(badges.issues), label: fill(labels.shell.sidebarV3.issuesBadge, { n: badges.issues }), className: "ui-count-badge" }
        : id === "meeting" && badges.meetingDraft ? { text: labels.shell.sidebarV3.meetingDraft, label: labels.shell.sidebarV3.meetingDraft, className: "ui-lozenge" }
          : null;
    return mark;
  };
  const navItem = (id: ShellPanel) => {
    const mark = end(id);
    return <Fragment key={id}>
      <button type="button" className="nav-item" aria-current={panel === id ? "page" : undefined} aria-describedby={mark ? `nav-mark-${id}` : undefined} onClick={() => go(id)}><ShellIcon name={id} /><span>{navLabel(id)}</span>{mark && <span className={`${mark.className} nav-end`} data-tone={mark.className === "ui-lozenge" ? "accent" : undefined} data-mark={mark.text} data-testid={`nav-mark-${id}`} aria-hidden="true" />}</button>
      {mark && <span id={`nav-mark-${id}`} hidden>{mark.label}</span>}
    </Fragment>;
  };
  const moreActive = MORE_ITEMS.includes(panel);
  const groups = labels.shell.sidebarV3.groups;
  return <>
    <header className="topbar" data-more-open={moreOpen || undefined}>
      <a className="brand" href="#main-content"><span className="brand-mark"><ShellIcon name="lens" size={16} /></span><span className="brand-name">{labels.brand.name}</span></a>
      <div className="topbar-right">
        <DataStatus {...dataStatus} />
        <div className="topbar-cluster" id="topbar-cluster" ref={clusterRef} role="group" aria-label={labels.shell.topbarV3.clusterAria}>
          <div className="ai-availability" data-testid="ai-availability" role="status" aria-live="polite" ref={aiContainerRef}>
            <button ref={aiButtonRef} type="button" className="ai-label" aria-label={ai.headline} aria-expanded={ai.open} aria-controls="ai-availability-detail" onClick={ai.onToggle}><ShellIcon name="ai" size={18} className="ai-icon" /><strong className="ai-text">{fill(labels.shell.topbar.aiLabel, { ai: ai.headline })}</strong></button>
            <div id="ai-availability-detail" className="ai-popover ui-popover" role="region" aria-label={labels.shell.sections.aiDetail} hidden={!ai.open}><p>{ai.detail}</p></div>
          </div>
          <button type="button" className="ui-btn ui-btn-secondary ui-btn-icon basis-button" onClick={onBasis} aria-haspopup="dialog" aria-label={labels.shell.buttons.basis}><ShellIcon name="book" size={18} /></button>
          {storage}
          {exportMenu}
        </div>
        <button ref={topbarMoreRef} type="button" className="ui-btn ui-btn-secondary ui-btn-icon topbar-more" data-testid="topbar-more" aria-label={labels.shell.mobileNav.moreAria} aria-expanded={moreOpen} aria-controls="topbar-cluster mobile-more" onClick={event => toggleMore(event.currentTarget)}><ShellIcon name="more" size={20} /></button>
      </div>
    </header>
    <aside className="sidebar">
      <nav aria-label={labels.shell.sidebar.mainNavAria}>
        {NAV_GROUPS.map(group => <div key={group.id} className="nav-group" role="group" aria-labelledby={`nav-group-title-${group.id}`} data-testid={`nav-group-${group.id}`}><p className="nav-group-title" id={`nav-group-title-${group.id}`}>{groups[group.id]}</p>{group.items.map(navItem)}</div>)}
        {showValidation && <div className="nav-group nav-group-developer" role="group" aria-labelledby="nav-group-title-developer" data-testid="nav-group-developer"><p className="nav-group-title" id="nav-group-title-developer">{groups.developer}</p>{navItem("validation")}</div>}
      </nav>
    </aside>
    <nav className="mobile-tabbar" aria-label={labels.shell.mobileNav.aria} data-testid="mobile-tabbar" data-more-open={moreOpen || undefined}>
      {TABS.map(id => <button key={id} type="button" className="tab-item" aria-label={navLabel(id)} aria-current={panel === id ? "page" : undefined} onClick={() => go(id)}><ShellIcon name={id} /><span>{labels.shell.mobileNav.tabs[id]}</span></button>)}
      <button ref={tabMoreRef} type="button" className="tab-item" data-testid="mobile-tabbar-more" data-active={moreActive || undefined} aria-expanded={moreOpen} aria-controls="mobile-more topbar-cluster" onClick={event => toggleMore(event.currentTarget)}><ShellIcon name="more" /><span>{labels.shell.mobileNav.more}</span></button>
      <div className="mobile-more" id="mobile-more" ref={sheetRef} role="region" aria-label={labels.shell.mobileNav.moreAria} data-testid="mobile-more" hidden={!moreOpen}>
        {MORE_ITEMS.filter(id => id !== "validation" || showValidation).map(id => <button key={id} type="button" className="more-item" aria-current={panel === id ? "page" : undefined} onClick={() => go(id)}><ShellIcon name={id} /><span>{navLabel(id)}</span></button>)}
      </div>
    </nav>
  </>;
}
