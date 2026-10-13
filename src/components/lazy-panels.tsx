"use client";

import { createElement, lazy, Suspense, useCallback, useState, useSyncExternalStore, type ComponentProps, type ComponentType } from "react";

// V4-3c（D-V4-42＝A，首載瘦身）：通路健檢、資料來源、商品毛利、會議紀錄、待辦與 AI 解釋改成隨頁載入。
// 這裡匯出與原模組同名的包裝元件，dashboard.tsx 的 JSX 一字不改（原始碼比對測試照舊）。
// - 每個 chunk 一個載入器：已載入的模組留一份參照（這是程式碼，不是使用者資料）；載入中共用同一個 import()；失敗就清掉，下次再試。
// - 包裝元件在掛載時決定一次要渲染什麼：模組已載入（預先載入過、或之前開過這一頁）就直接渲染真正的元件，不經過 React.lazy，
//   所以不會閃一次空白；還沒載入才用 React.lazy＋Suspense（fallback 為空）。同一個實例的元件型別不變，換 props 不會重新掛載。
// - 載入失敗時那一個實例先渲染空白（不擲錯、不留未處理的 rejection）；之後同一個 chunk 載入成功（再按一次這一頁、或預先載入），就地換成真正的面板。
// - preloadPanels()：資料就緒後由 dashboard（schedulePanelPreload）在閒置時呼叫，各頁的 chunk 與決策匯出程式同時開始載入（每個 chunk 各自一個載入完成的工作）。
// - preparePanel()：dashboard 切頁時呼叫；chunk 還沒載入時開始載入。V4-8b（D-V4-56＝A）起按下就切頁：等待中內容區放骨架，panelReady()／usePanelReady() 判斷頁面能不能顯示，
//   載入失敗時顯示錯誤狀態與「再試一次」（取代 V4-3c「等載好才在同一次更新換導覽標示與內容」）。

export interface ChunkLoader<M> {
  /** 已載入的模組；還沒載入或上次失敗時是 null。 */
  current(): M | null;
  /** 載入（或取得已載入的）模組；失敗時 reject，並清掉這次的 promise，下次呼叫會重新 import()。 */
  load(): Promise<M>;
  /** 模組載入成功時通知（useSyncExternalStore 用；載入失敗的實例靠它在之後成功時換成真正的面板）。回傳取消訂閱。 */
  subscribe(listener: () => void): () => void;
}

/** 一個 chunk 的載入器（匯出給 tests/lazy-panels.test.tsx 直接測重試語意）。 */
export function createChunkLoader<M>(importer: () => Promise<M>): ChunkLoader<M> {
  let loaded: M | null = null;
  let pending: Promise<M> | null = null;
  const listeners = new Set<() => void>();
  return {
    current: () => loaded,
    load() {
      if (loaded) return Promise.resolve(loaded);
      pending ??= importer().then(module => { loaded = module; pending = null; for (const listener of [...listeners]) listener(); return module; }, (error: unknown) => { pending = null; throw error; });
      return pending;
    },
    subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; },
  };
}

const workspacePanels = createChunkLoader(() => import("./workspace-panels"));
const aiPanel = createChunkLoader(() => import("./ai-panel"));
const productPanel = createChunkLoader(() => import("./product-comparison-panel"));
const meetingPage = createChunkLoader(() => import("./meeting-page"));
const actionsWorkbench = createChunkLoader(() => import("./actions-workbench"));

/**
 * 載入失敗時代替面板的元件：模組還沒載入時不渲染任何東西（與 Suspense 的 fallback 一樣）；
 * 之後同一個 chunk 載入成功（使用者再按一次這一頁時 preparePanel 重試、或預先載入），就地渲染真正的面板，不必離開再回到這一頁。
 * 同一個模組的 pick 回傳同一個元件，換 props 不會重新掛載。（匯出給 tests/lazy-panels.test.tsx。）
 */
export function recoveringPanel<M, P extends object>(loader: ChunkLoader<M>, pick: (module: M) => ComponentType<P>): ComponentType<P> {
  return function RecoveringPanel(props: P) {
    const loaded = useSyncExternalStore(loader.subscribe, loader.current, loader.current);
    return loaded ? createElement(pick(loaded), props) : null;
  };
}

/** 掛載時決定一次：已載入就回傳真正的元件；否則回傳一個 React.lazy（失敗時解析成 recoveringPanel，不擲到錯誤邊界）。 */
function panelComponent<M, P extends object>(loader: ChunkLoader<M>, pick: (module: M) => ComponentType<P>): ComponentType<P> {
  const ready = loader.current();
  if (ready) return pick(ready);
  return lazy(() => loader.load().then(module => ({ default: pick(module) }), () => ({ default: recoveringPanel(loader, pick) })));
}

type WorkspacePanelsModule = typeof import("./workspace-panels");
type AiPanelModule = typeof import("./ai-panel");
type ProductPanelModule = typeof import("./product-comparison-panel");
type MeetingPageModule = typeof import("./meeting-page");
type ActionsWorkbenchModule = typeof import("./actions-workbench");

export function Diagnosis(props: ComponentProps<WorkspacePanelsModule["Diagnosis"]>) {
  const [Panel] = useState(() => panelComponent(workspacePanels, module => module.Diagnosis));
  return <Suspense fallback={null}><Panel {...props} /></Suspense>;
}
export function DataWorkspace(props: ComponentProps<WorkspacePanelsModule["DataWorkspace"]>) {
  const [Panel] = useState(() => panelComponent(workspacePanels, module => module.DataWorkspace));
  return <Suspense fallback={null}><Panel {...props} /></Suspense>;
}
export function AiPanel(props: ComponentProps<AiPanelModule["AiPanel"]>) {
  const [Panel] = useState(() => panelComponent(aiPanel, module => module.AiPanel));
  return <Suspense fallback={null}><Panel {...props} /></Suspense>;
}
export function ProductComparisonPanel(props: ComponentProps<ProductPanelModule["ProductComparisonPanel"]>) {
  const [Panel] = useState(() => panelComponent(productPanel, module => module.ProductComparisonPanel));
  return <Suspense fallback={null}><Panel {...props} /></Suspense>;
}
export function MeetingPage(props: ComponentProps<MeetingPageModule["MeetingPage"]>) {
  const [Panel] = useState(() => panelComponent(meetingPage, module => module.MeetingPage));
  return <Suspense fallback={null}><Panel {...props} /></Suspense>;
}
export function ActionsWorkbench(props: ComponentProps<ActionsWorkbenchModule["ActionsWorkbench"]>) {
  const [Panel] = useState(() => panelComponent(actionsWorkbench, module => module.ActionsWorkbench));
  return <Suspense fallback={null}><Panel {...props} /></Suspense>;
}

/**
 * 各頁需要的 chunk（總覽、假設試算與開發者驗證都在首載裡，不需要）：required 是頁面本身；optional 是頁面裡的選配區塊——
 * 通路健檢頁底收合的 AI 解釋（V4-8b，D-V4-58＝A：只有它載入失敗時健檢頁照常顯示，AI 那格照 V4-3c 不顯示，不整頁報錯）。
 */
const PANEL_CHUNKS: Readonly<Record<string, { required: readonly ChunkLoader<unknown>[]; optional?: readonly ChunkLoader<unknown>[] }>> = { diagnosis: { required: [workspacePanels], optional: [aiPanel] }, data: { required: [workspacePanels] }, products: { required: [productPanel] }, meeting: { required: [meetingPage] }, actions: { required: [actionsWorkbench] } };

/**
 * 切頁時的準備：這一頁需要的 chunk（含選配）都已載入（或這一頁不需要 chunk）時回傳 null，不必等；
 * 否則開始載入，回傳一個 promise，這一頁需要的每個 chunk 都載入完或失敗（allSettled）才 resolve（永不 reject）。
 * V4-8b（D-V4-56＝A）：呼叫端照 v3 按下就切頁，等待中內容區放骨架；resolve 後以 panelReady() 判斷頁面能不能顯示，不能就顯示錯誤狀態與「再試一次」（再呼叫一次本函式）。
 */
export function preparePanel(panel: string): Promise<void> | null {
  const chunks = PANEL_CHUNKS[panel];
  const missing = [...chunks?.required ?? [], ...chunks?.optional ?? []].filter(loader => !loader.current());
  if (missing.length === 0) return null;
  return Promise.allSettled(missing.map(loader => loader.load())).then(() => undefined);
}

/** V4-8b：這一頁本身（required）的 chunk 都已載入，或這一頁不需要 chunk；選配的 AI 解釋不算。 */
export function panelReady(panel: string): boolean {
  return (PANEL_CHUNKS[panel]?.required ?? []).every(loader => loader.current() !== null);
}

/**
 * V4-8b：訂閱 panelReady(panel)——這一頁的 chunk 載入成功時（切頁的 preparePanel、「再試一次」或預先載入）重新渲染，內容一掛載就是真正的面板，不經過 Suspense。
 * 伺服器端（SSR）與首次渲染都用同一個判斷（getServerSnapshot 必給：測試會 SSR Dashboard）。
 */
export function usePanelReady(panel: string): boolean {
  const subscribe = useCallback((listener: () => void) => {
    const unsubscribes = (PANEL_CHUNKS[panel]?.required ?? []).map(loader => loader.subscribe(listener));
    return () => { for (const unsubscribe of unsubscribes) unsubscribe(); };
  }, [panel]);
  const ready = () => panelReady(panel);
  return useSyncExternalStore(subscribe, ready, ready);
}

/**
 * 預先載入的 chunk：通路健檢與資料來源（同一個 chunk）、AI 解釋（在健檢頁內）、商品毛利、會議紀錄、待辦，
 * 以及決策匯出程式（試算頁、待辦頁與下載選單的決策工作稿；按下時的 import() 用同一個 chunk，載入過就不再連網，離線時與 v3 一樣能匯出）。
 */
const PRELOAD_CHUNKS: readonly ChunkLoader<unknown>[] = [workspacePanels, aiPanel, productPanel, meetingPage, actionsWorkbench, createChunkLoader(() => import("@/application/workspace-decision-export"))];
/** 閒置回呼的逾時：頁面一直忙（例如量測工具在頁內執行稽核）時，最晚這麼久之後仍會開始預先載入。 */
const PRELOAD_IDLE_TIMEOUT_MS = 1000;

/** requestIdleCallback 不是每個瀏覽器都有（例如 Safari），型別上當成選填。 */
type IdleApi = { requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number; cancelIdleCallback?: (handle: number) => void };
const idleApi = (): IdleApi => typeof window === "undefined" ? {} : window;

/** 在下一個閒置時段執行（沒有 requestIdleCallback 的瀏覽器用 setTimeout）；回傳取消函式。 */
function whenIdle(run: () => void, timeout: number): () => void {
  const api = idleApi();
  if (api.requestIdleCallback && api.cancelIdleCallback) {
    const handle = api.requestIdleCallback(run, { timeout });
    return () => api.cancelIdleCallback?.(handle);
  }
  const handle = setTimeout(run, 0);
  return () => clearTimeout(handle);
}

let preloading: Promise<void> | null = null;

/**
 * 預先載入各頁的 chunk 與決策匯出程式：同時開始 import()（瀏覽器各自下載；每個 chunk 載入完成時各自在一個工作裡執行，不合成一個長任務），
 * 整段在幾十毫秒內結束，不會一路拖進之後的切頁（V4-3c 量測：390 的 Lighthouse 流程中全部落在總覽 snapshot 期間）。
 * 只會跑一次（之後的呼叫回傳同一個 promise）；這個 promise 永遠 resolve，個別 chunk 失敗不影響其他 chunk，切到那一頁時會再試。
 */
export function preloadPanels(): Promise<void> {
  preloading ??= Promise.allSettled(PRELOAD_CHUNKS.map(loader => loader.load())).then(() => undefined);
  return preloading;
}

/** 資料就緒到開始預先載入的等待時間（毫秒）：要晚於「載入示範資料」到總覽畫好、拒絕本機保存提示的那一段（Lighthouse 該 timespan 的結束點），
 * 又要早於使用者第一次切頁。依 V4-3c 的量測決定（批次驗收文件記錄實測）。 */
export const PANEL_PRELOAD_DELAY_MS = 2000;

/**
 * 資料就緒後的預先載入排程：先等 delayMs（讓「載入示範資料」到總覽畫好的那一段先結束），再在閒置時呼叫 preloadPanels()。
 * 回傳取消函式（dashboard 的 effect cleanup 用）；已經開始預先載入就什麼都不排。
 */
export function schedulePanelPreload(delayMs: number = PANEL_PRELOAD_DELAY_MS): () => void {
  if (preloading) return () => undefined;
  let cancelIdle: (() => void) | null = null;
  const timer = setTimeout(() => { cancelIdle = whenIdle(() => { void preloadPanels(); }, PRELOAD_IDLE_TIMEOUT_MS); }, delayMs);
  return () => { clearTimeout(timer); cancelIdle?.(); };
}
