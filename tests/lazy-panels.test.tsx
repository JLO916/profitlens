import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import * as meetingPage from "@/components/meeting-page";
import * as meetingEntry from "@/components/meeting-entry";
import { createChunkLoader, recoveringPanel } from "@/components/lazy-panels";
import { fixture } from "./helpers/fixtures";

// V4-3c（D-V4-42＝A，首載瘦身）：lazy-panels.tsx 的同名包裝元件、dashboard 只改 import 行、預先載入（資料就緒後、只有一次、一個 chunk 一個閒置回呼）。

const PANELS = ["Diagnosis", "DataWorkspace", "AiPanel", "MeetingPage", "ProductComparisonPanel", "ActionsWorkbench"] as const;
/** 隨頁載入的面板模組（lazy-panels.tsx 的 PRELOAD_CHUNKS 前五項）與各模組的同名元件。 */
const CHUNKS = [
  { path: "@/components/workspace-panels", exports: ["Diagnosis", "DataWorkspace"] },
  { path: "@/components/ai-panel", exports: ["AiPanel"] },
  { path: "@/components/product-comparison-panel", exports: ["ProductComparisonPanel"] },
  { path: "@/components/meeting-page", exports: ["MeetingPage"] },
  { path: "@/components/actions-workbench", exports: ["ActionsWorkbench"] },
] as const;
/** 預先載入也帶上決策匯出程式（試算頁、待辦頁與下載選單的決策工作稿；離線時與 v3 一樣能匯出）。 */
const DECISION_EXPORT = { path: "@/application/workspace-decision-export", exports: ["exportWorkspaceDecision"] } as const;
const PRELOADED = [...CHUNKS, DECISION_EXPORT] as const;
/** 首載不得靜態匯入的模組：頁面面板與匯出程式（V4-3c 範圍第 1、2 項）。 */
const SPLIT_FROM_DASHBOARD = ["./workspace-panels", "./meeting-page", "./product-comparison-panel", "./actions-workbench", "./ai-panel", "@/application/excel-export", "@/application/pptx-export", "@/application/workspace-decision-export"];

const source = (file: string) => readFileSync(resolve(file), "utf8");
/** 原始碼裡的靜態值匯入與再匯出（`import type`／`export type` 不算，打包時會被拿掉）。這幾個檔的 import 都是單行。 */
function staticSpecifiers(text: string): string[] {
  return text.split("\n").filter(line => /^(import|export)\s.*\sfrom\s+"/.test(line) && !/^(import|export)\s+type\s/.test(line)).map(line => /\sfrom\s+"([^"]+)"/.exec(line)![1]);
}

/** 用 vi.doMock 換掉五個面板模組與決策匯出程式：被 import() 時記下模組路徑；gate 讓測試控制第一個 chunk 什麼時候載入完。 */
function mockChunks(options: { gate?: Promise<void>; failing?: string } = {}) {
  const calls: string[] = [];
  for (const chunk of PRELOADED) {
    vi.doMock(chunk.path, async () => {
      calls.push(chunk.path);
      if (chunk.path === options.failing) throw new Error(`CHUNK_LOAD_FAILED ${chunk.path}`);
      if (chunk === CHUNKS[0] && options.gate) await options.gate;
      return Object.fromEntries(chunk.exports.map(name => [name, () => null]));
    });
  }
  return calls;
}
const freshLazyPanels = async () => { vi.resetModules(); return import("@/components/lazy-panels"); };

/**
 * 首載的模組圖（B-F2）：從 src/app/page.tsx 與 layout.tsx 沿「靜態值匯入與再匯出」走訪（`import type`、只匯入型別的具名匯入、`export type` 不算；
 * import() 不算——那就是隨頁載入）。只匯入型別卻沒寫 type 的匯入也算進來（寧可多算），所以這裡不可達，打包後的首載就一定沒有。
 */
function firstLoadGraph(entries: readonly string[]) {
  const files = new Set<string>(), packages = new Set<string>();
  const queue = entries.map(entry => resolve(entry));
  const resolveSpecifier = (from: string, specifier: string): string | null => {
    const base = specifier.startsWith("@/") ? resolve("src", specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : null;
    if (!base) { packages.add(specifier.startsWith("@") ? specifier.split("/").slice(0, 2).join("/") : specifier.split("/")[0]); return null; }
    for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
    throw new Error(`解析不到 ${specifier}（${relative(".", from)}）`);
  };
  while (queue.length) {
    const file = queue.shift()!;
    if (files.has(file)) continue;
    files.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, false, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    for (const statement of source.statements) {
      let specifier: string | null = null;
      if (ts.isImportDeclaration(statement)) {
        const clause = statement.importClause;
        const typeOnlyNames = !!clause && !clause.name && !!clause.namedBindings && ts.isNamedImports(clause.namedBindings) && clause.namedBindings.elements.length > 0 && clause.namedBindings.elements.every(element => element.isTypeOnly);
        if (!clause?.isTypeOnly && !typeOnlyNames) specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
      } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
        const typeOnlyNames = !!statement.exportClause && ts.isNamedExports(statement.exportClause) && statement.exportClause.elements.length > 0 && statement.exportClause.elements.every(element => element.isTypeOnly);
        if (!statement.isTypeOnly && !typeOnlyNames) specifier = (statement.moduleSpecifier as ts.StringLiteral).text;
      }
      const target = specifier === null ? null : resolveSpecifier(file, specifier);
      if (target) queue.push(target);
    }
  }
  return { files: new Set([...files].map(file => relative(".", file))), packages };
}

afterEach(() => {
  for (const chunk of PRELOADED) vi.doUnmock(chunk.path);
  vi.resetModules();
  vi.useRealTimers();
});

describe("V4-3c 同名包裝元件與 dashboard 的匯入", () => {
  it("lazy-panels 匯出與原模組同名的包裝元件；dashboard.tsx 從 lazy-panels 匯入這六個名字", async () => {
    const lazyPanels = await import("@/components/lazy-panels");
    const originals = Object.assign({}, ...await Promise.all(CHUNKS.map(chunk => import(chunk.path)))) as Record<string, unknown>;
    for (const name of PANELS) {
      expect(typeof lazyPanels[name], name).toBe("function");
      expect(typeof originals[name], name).toBe("function");
      expect(lazyPanels[name], `${name} 是包裝元件，不是原元件`).not.toBe(originals[name]);
    }
    const line = source("src/components/dashboard.tsx").split("\n").find(text => text.includes('from "./lazy-panels"'))!;
    for (const name of PANELS) expect(line, name).toMatch(new RegExp(`[{ ,]${name}[ ,}]`));
  });

  it("dashboard.tsx 不再靜態匯入面板與匯出程式；匯出改成按下時 import()；JSX 的面板標籤仍各一個", () => {
    const dashboard = source("src/components/dashboard.tsx");
    const specifiers = staticSpecifiers(dashboard);
    for (const banned of SPLIT_FROM_DASHBOARD) expect(specifiers, banned).not.toContain(banned);
    expect(specifiers).toContain("./lazy-panels");
    expect(specifiers).toContain("./meeting-entry");
    for (const specifier of ["@/application/excel-export", "@/application/pptx-export", "@/application/workspace-decision-export"]) expect(dashboard, specifier).toContain(`await import("${specifier}")`);
    for (const name of PANELS) expect(dashboard.match(new RegExp(`<${name}[\\s/>]`, "g"))?.length ?? 0, name).toBe(1);
  });

  it("下載選單與會議頁也不靜態匯入匯出程式（會議頁只留 type 匯入）；選單打開時以 import() 預熱 Excel", () => {
    const menu = source("src/components/shell/export-menu.tsx"), meeting = source("src/components/meeting-page.tsx");
    expect(staticSpecifiers(menu)).not.toContain("@/application/excel-export");
    expect(menu).toContain('import("@/application/excel-export").then(module => module.preloadExcelWriter()');
    for (const banned of ["@/application/excel-export", "@/application/pptx-export"]) expect(staticSpecifiers(meeting), banned).not.toContain(banned);
    expect(meeting).toContain('import type { ExcelMeeting } from "@/application/excel-export";');
    for (const specifier of ["@/application/excel-export", "@/application/pptx-export"]) expect(meeting, specifier).toContain(`await import("${specifier}")`);
  });

  it("通路健檢與資料來源共用同一個 import(\"./workspace-panels\")", () => {
    const text = source("src/components/lazy-panels.tsx");
    // 只數執行期的 import()（`typeof import(...)` 是型別，打包時拿掉）。
    expect(text.match(/(?<!typeof )import\("\.\/workspace-panels"\)/g)).toHaveLength(1);
    for (const chunk of CHUNKS.slice(1)) expect(text.match(new RegExp(`(?<!typeof )import\\("\\./${chunk.path.split("/").pop()}"\\)`, "g")), chunk.path).toHaveLength(1);
  });

  it("meeting-page 再匯出搬到 meeting-entry 的小工具（同一個參照，既有匯入路徑不變）", () => {
    for (const name of ["MeetingEntry", "currentViewDecisionContext", "downloadMeetingMarkdown", "DECISION_LABEL_KEY", "meetingMarkdownFilename"] as const) {
      expect(meetingPage[name], name).toBeDefined();
      expect(meetingPage[name], name).toBe(meetingEntry[name]);
    }
  });

  it("首載元件只用到的小函式搬到小模組並由原模組再匯出：試算頁的 toneClass、側欄徽章的 diagnosisCounts（主管摘要元件與健檢清單不進首載）", async () => {
    const [managerSummary, toneModule, diagnosisList, countsModule] = await Promise.all([import("@/components/manager-summary"), import("@/components/tone-class"), import("@/components/diagnosis-list"), import("@/components/diagnosis-counts")]);
    expect(managerSummary.toneClass).toBe(toneModule.toneClass);
    expect(diagnosisList.diagnosisCounts).toBe(countsModule.diagnosisCounts);
    for (const [file, banned, allowed] of [["src/components/decision-workbench.tsx", "./manager-summary", "./tone-class"], ["src/components/product-comparison-panel.tsx", "./manager-summary", "./tone-class"], ["src/components/shell/shell-frame.tsx", "../diagnosis-list", "../diagnosis-counts"]] as const) {
      expect(staticSpecifiers(source(file)), file).not.toContain(banned);
      expect(staticSpecifiers(source(file)), file).toContain(allowed);
    }
  });

  it("首載模組圖（page.tsx、layout.tsx 起的靜態值匯入，不限單行、含間接匯入）走不到隨頁載入的面板、匯出程式與只有它們用到的模組，也走不到 xlsx、pptxgenjs", () => {
    const graph = firstLoadGraph(["src/app/page.tsx", "src/app/layout.tsx"]);
    for (const file of ["src/components/dashboard.tsx", "src/components/lazy-panels.tsx", "src/components/meeting-entry.tsx", "src/components/overview.tsx", "src/components/multi-scenario-workbench.tsx"]) expect(graph.files.has(file), `${file} 應在首載`).toBe(true);
    const split = ["src/components/workspace-panels.tsx", "src/components/ai-panel.tsx", "src/components/product-comparison-panel.tsx", "src/components/meeting-page.tsx", "src/components/actions-workbench.tsx", "src/components/diagnosis-list.tsx", "src/components/manager-summary.tsx", "src/components/channel-table.tsx", "src/application/excel-export.ts", "src/application/pptx-export.ts", "src/application/workspace-decision-export.ts",
      // V4-4：只有商品頁用到的圖表模組（G13、G14 區塊、productPareto、商品抽屜 builder）。C25 ranked-bars.tsx 不列：V4-5 的 G15 在首載的試算頁使用。
      "src/components/products/highlight-charts.tsx", "src/application/chart-pareto.ts", "src/components/product-evidence.ts",
      // V4-6 代理 A：只有會議紀錄頁用到的 G19 區塊與 meetingSeries（C26 small-multiples.tsx 已隨健檢頁隨頁載入）。
      "src/components/meeting/history-chart.tsx", "src/application/chart-meeting.ts",
      // V4-6 代理 B：只有會議頁用到的 G15 會議實例（議程 5）。它匯入的 C25 ranked-bars.tsx、試算頁 variance-chart.tsx 本來就在首載（試算頁），不列。
      "src/components/meeting/scenarios-chart.tsx",
      // V4-7a 代理 A：只有資料來源頁用到的 G20 區塊、C30 Timeline 與 coverageTimeline（隨健檢與資料來源的 chunk 載入）。
      "src/components/data/coverage-chart.tsx", "src/components/charts/timeline.tsx", "src/application/chart-coverage.ts",
      // V4-7a 代理 B：只有資料來源頁用到的 G21 區塊與 issueDistribution。問題表的篩選（src/application/issue-filter.ts）隨 IssueList 在首載（匯入精靈也用），不列；
      // C28 heat-table.tsx 已隨健檢頁隨頁載入。
      "src/components/data/issues-chart.tsx", "src/application/chart-issues.ts"];
    for (const file of split) {
      expect(existsSync(file), file).toBe(true);
      expect(graph.files.has(file), `${file} 不得在首載`).toBe(false);
    }
    for (const name of ["xlsx", "pptxgenjs"]) expect(graph.packages.has(name), `${name} 不得在首載`).toBe(false);
  });
});

describe("V4-3c 載入與預先載入", () => {
  it("預先載入前包裝元件只渲染空的 fallback；預先載入後同步渲染真正的面板（與直接渲染原元件相同，不閃空白）", async () => {
    const lazyPanels = await freshLazyPanels();
    const { Diagnosis } = await import("@/components/workspace-panels");
    const input = fixture("golden"), dataset = validateDataset(input).dataset!;
    const props = { snapshot: await createSnapshot(dataset, {}, await hashInput(input)), onEvidence: () => undefined, onCreateAction: () => undefined };
    expect(renderToStaticMarkup(createElement(lazyPanels.Diagnosis, props))).toBe("");
    await lazyPanels.preloadPanels();
    const direct = renderToStaticMarkup(createElement(Diagnosis, props));
    expect(direct).toContain('data-testid="diagnosis-panel"');
    expect(renderToStaticMarkup(createElement(lazyPanels.Diagnosis, props))).toBe(direct);
  });

  it("preloadPanels 只跑一次：各頁的 chunk 與決策匯出程式同時開始載入（不必等前一個），全部載入完才 resolve；重複呼叫回傳同一個 promise、不再 import()", async () => {
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    const calls = mockChunks({ gate });
    const lazyPanels = await freshLazyPanels();
    const first = lazyPanels.preloadPanels();
    expect(lazyPanels.preloadPanels()).toBe(first);
    let settled = false;
    void first.then(() => { settled = true; });
    await vi.waitFor(() => expect([...calls].sort()).toEqual(PRELOADED.map(chunk => chunk.path).sort()));
    await new Promise(done => setTimeout(done, 30));
    expect(settled, "第一個 chunk 還沒載入完，預先載入還沒結束").toBe(false);
    release();
    await first;
    await lazyPanels.preloadPanels();
    expect(lazyPanels.preloadPanels()).toBe(first);
    expect(calls).toHaveLength(PRELOADED.length);
  });

  it("一個 chunk 載入失敗：預先載入照樣完成其他 chunk、promise 不 reject、沒有未處理的 rejection", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", listener);
    try {
      const calls = mockChunks({ failing: "@/components/ai-panel" });
      const lazyPanels = await freshLazyPanels();
      await expect(lazyPanels.preloadPanels()).resolves.toBeUndefined();
      expect([...calls].sort()).toEqual(PRELOADED.map(chunk => chunk.path).sort());
      await new Promise(done => setTimeout(done, 10));
      expect(unhandled).toEqual([]);
    } finally { process.off("unhandledRejection", listener); }
  });

  it("載入器：同時呼叫共用一次 import()；失敗不永久快取（下次重新 import()）；成功後留參照、不再 import()", async () => {
    let attempts = 0;
    const loader = createChunkLoader(async () => { attempts++; if (attempts === 1) throw new Error("CHUNK_LOAD_FAILED"); return { value: attempts }; });
    expect(loader.current()).toBeNull();
    const a = loader.load(), b = loader.load();
    expect(b).toBe(a);
    await expect(a).rejects.toThrow("CHUNK_LOAD_FAILED");
    expect(attempts).toBe(1);
    expect(loader.current()).toBeNull();
    await expect(loader.load()).resolves.toEqual({ value: 2 });
    expect(attempts).toBe(2);
    expect(loader.current()).toEqual({ value: 2 });
    await loader.load();
    expect(attempts).toBe(2);
  });

  it("schedulePanelPreload：等 PANEL_PRELOAD_DELAY_MS 再於閒置時載入；延遲到之前取消就不載入；開始之後再排程不會重複載入", async () => {
    vi.useFakeTimers();
    const calls = mockChunks();
    const lazyPanels = await freshLazyPanels();
    expect(lazyPanels.PANEL_PRELOAD_DELAY_MS).toBeGreaterThan(0);
    const cancel = lazyPanels.schedulePanelPreload();
    await vi.advanceTimersByTimeAsync(lazyPanels.PANEL_PRELOAD_DELAY_MS - 1);
    expect(calls).toEqual([]);
    cancel();
    await vi.advanceTimersByTimeAsync(lazyPanels.PANEL_PRELOAD_DELAY_MS * 5);
    expect(calls, "取消後不載入").toEqual([]);
    lazyPanels.schedulePanelPreload();
    await vi.advanceTimersByTimeAsync(lazyPanels.PANEL_PRELOAD_DELAY_MS - 1);
    expect(calls).toEqual([]);
    await vi.waitFor(() => expect([...calls].sort()).toEqual(PRELOADED.map(chunk => chunk.path).sort()));
    await lazyPanels.preloadPanels();
    const again = lazyPanels.schedulePanelPreload();
    await vi.advanceTimersByTimeAsync(lazyPanels.PANEL_PRELOAD_DELAY_MS * 5);
    again();
    expect(calls).toHaveLength(PRELOADED.length);
  });

  it("preparePanel：不需要 chunk 或 chunk 已載入時回傳 null（同步切頁）；否則載入該頁的 chunk（健檢連同 AI 解釋），失敗也 resolve", async () => {
    const calls = mockChunks({ failing: "@/components/meeting-page" });
    const lazyPanels = await freshLazyPanels();
    for (const panel of ["overview", "scenarios", "validation"]) expect(lazyPanels.preparePanel(panel), panel).toBeNull();
    const diagnosis = lazyPanels.preparePanel("diagnosis");
    expect(diagnosis).toBeInstanceOf(Promise);
    await expect(diagnosis).resolves.toBeUndefined();
    expect(calls).toEqual(["@/components/workspace-panels", "@/components/ai-panel"]);
    expect(lazyPanels.preparePanel("diagnosis"), "已載入就同步切頁").toBeNull();
    expect(lazyPanels.preparePanel("data"), "資料來源與健檢同一個 chunk").toBeNull();
    await expect(lazyPanels.preparePanel("meeting"), "載入失敗也 resolve（切過去由包裝元件再試）").resolves.toBeUndefined();
    expect(lazyPanels.preparePanel("meeting"), "失敗不快取：下次切頁再載入").toBeInstanceOf(Promise);
  });

  it("preparePanel 等這一頁需要的每個 chunk 都有結果才 resolve：AI 解釋先失敗時，仍等健檢的 chunk 載入完（不提早切頁閃空白）", async () => {
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    mockChunks({ gate, failing: "@/components/ai-panel" });
    const lazyPanels = await freshLazyPanels();
    let resolved = false;
    const pending = lazyPanels.preparePanel("diagnosis")!;
    void pending.then(() => { resolved = true; });
    await new Promise(done => setTimeout(done, 30));
    expect(resolved, "AI 解釋已失敗、健檢的 chunk 還在載入：不切頁").toBe(false);
    release();
    await expect(pending).resolves.toBeUndefined();
    expect(resolved).toBe(true);
    expect(lazyPanels.preparePanel("data"), "健檢與資料來源的 chunk 已載入").toBeNull();
  });

  it("載入器的訂閱：載入成功時通知（失敗不通知），取消訂閱後不再通知", async () => {
    let attempts = 0;
    const loader = createChunkLoader(async () => { attempts++; if (attempts === 1) throw new Error("CHUNK_LOAD_FAILED"); return { value: attempts }; });
    const listener = vi.fn(), other = vi.fn();
    const unsubscribe = loader.subscribe(listener);
    const unsubscribeOther = loader.subscribe(other);
    await expect(loader.load()).rejects.toThrow("CHUNK_LOAD_FAILED");
    expect(listener).not.toHaveBeenCalled();
    unsubscribeOther();
    await loader.load();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(other).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("載入失敗的實例（recoveringPanel）先渲染空白；同一個 chunk 之後載入成功（再按一次這一頁、或預先載入）就渲染真正的面板，props 照傳", async () => {
    let attempts = 0;
    const Panel = ({ label }: { label: string }) => createElement("p", { "data-testid": "recovered" }, label);
    const loader = createChunkLoader(async () => { attempts++; if (attempts === 1) throw new Error("CHUNK_LOAD_FAILED"); return { Panel }; });
    await expect(loader.load()).rejects.toThrow("CHUNK_LOAD_FAILED");
    const Recovering = recoveringPanel(loader, module => module.Panel);
    expect(renderToStaticMarkup(createElement(Recovering, { label: "x" }))).toBe("");
    const notified = vi.fn();
    loader.subscribe(notified);
    await loader.load();
    // useSyncExternalStore 訂閱 loader.subscribe：成功時通知，已掛載的實例就地重新渲染成真正的面板（不必離開再回到這一頁）。
    expect(notified).toHaveBeenCalledTimes(1);
    expect(renderToStaticMarkup(createElement(Recovering, { label: "x" }))).toBe('<p data-testid="recovered">x</p>');
    expect(readFileSync(resolve("src/components/lazy-panels.tsx"), "utf8")).toContain("useSyncExternalStore(loader.subscribe, loader.current, loader.current)");
  });

  it("dashboard 的 setPanel（V4-8b，D-V4-56＝A）：按下就切頁（同步 showPanel，不是 transition），有資料時同時 preparePanel；載入結束仍不能顯示這一頁才記為失敗；連續切頁只有最後一次生效", () => {
    const dashboard = source("src/components/dashboard.tsx");
    expect(dashboard).toContain('const [panel, showPanel] = useState<Panel>("overview");');
    expect(dashboard).toContain("const pending = hasData.current ? preparePanel(next) : null;");
    expect(dashboard).toContain("pendingPanel.current = pending ? next : null; setPanelLoadFailed(null); showPanel(next);");
    expect(dashboard).toContain("if (request !== panelRequest.current) return;");
    expect(dashboard).toContain("pendingPanel.current = null; if (!panelReady(next)) setPanelLoadFailed(next);");
    expect(dashboard).not.toMatch(/startTransition/);
    // 其餘地方一律經過 setPanel，不直接呼叫 showPanel（V4-8b 起 setPanel 內只剩一處）。
    expect(dashboard.match(/showPanel\(/g)).toHaveLength(1);
    // V4-3c 的 immediate（開匯入精靈不等 chunk）已不需要：一律按下就切頁；匯入中不顯示骨架與錯誤狀態。
    expect(dashboard).toContain('setPanel("data"); setShowImport(true);');
    expect(dashboard).not.toMatch(/setPanel\("[a-z]+", true\)/);
    // 切到待辦還在等 chunk 時，加入待辦不重複新增（總覽／健檢與會議頁兩條路徑；V4-3c 的守門保留）。
    expect(dashboard.match(/if \(!active \|\| pendingPanel\.current === "actions"\) return;/g)).toHaveLength(2);
    // 等待與失敗的畫面：頁面內容等 usePanelReady 才掛載；骨架與錯誤狀態在 .view-content 外、匯入中不顯示；main 只在等待中標 aria-busy；「再試一次」再走一次 setPanel（preparePanel）。
    expect(dashboard).toContain("const ready = usePanelReady(panel);");
    expect(dashboard).toContain("const panelWaiting = !!visible && !importing && !ready;");
    expect(dashboard).toContain('<main id="main-content" tabIndex={-1} aria-busy={(panelWaiting && panelLoadFailed !== panel) || undefined}>');
    expect(dashboard).toContain("{panelWaiting && panelLoadFailed !== panel && <PanelLoadingState />}");
    expect(dashboard).toContain("{panelWaiting && panelLoadFailed === panel && <PanelErrorState onRetry={() => setPanel(panel)} />}");
    // V41-4 O2：內容區的 key 加上頁（切頁換新節點，不算版面位移）。
    expect(dashboard).toContain('{visible && ready && <div key={`${active.id}:${panel}`} className="view-content" ');
    expect(dashboard).toContain('{visible && ready && panel === "actions" && <ActionsWorkbench ');
  });

  it("V4-8b panelReady：只看這一頁本身的 chunk（選配的 AI 解釋不算，D-V4-58＝A）；不需要 chunk 的頁一律 true；健檢與資料來源共用一個 chunk", async () => {
    mockChunks({ failing: "@/components/ai-panel" });
    const lazyPanels = await freshLazyPanels();
    for (const panel of ["overview", "scenarios", "validation"]) expect(lazyPanels.panelReady(panel), panel).toBe(true);
    for (const panel of ["diagnosis", "data", "products", "meeting", "actions"]) expect(lazyPanels.panelReady(panel), panel).toBe(false);
    await lazyPanels.preparePanel("diagnosis");
    expect(lazyPanels.panelReady("diagnosis"), "AI 解釋載入失敗、健檢的 chunk 已載入：健檢頁照常顯示").toBe(true);
    expect(lazyPanels.panelReady("data"), "資料來源與健檢同一個 chunk").toBe(true);
    expect(lazyPanels.preparePanel("diagnosis"), "選配的 AI 解釋還沒載入：再切到健檢時仍會再試").toBeInstanceOf(Promise);
    expect(lazyPanels.panelReady("products")).toBe(false);
  });

  it("V4-8b panelReady：這一頁的 chunk 載入失敗時仍是 false（dashboard 據此顯示錯誤狀態），之後再 preparePanel 成功就變 true", async () => {
    let attempts = 0;
    vi.doMock("@/components/product-comparison-panel", async () => { attempts++; if (attempts === 1) throw new Error("CHUNK_LOAD_FAILED"); return { ProductComparisonPanel: () => null }; });
    const lazyPanels = await freshLazyPanels();
    await expect(lazyPanels.preparePanel("products")).resolves.toBeUndefined();
    expect(lazyPanels.panelReady("products")).toBe(false);
    await expect(lazyPanels.preparePanel("products")).resolves.toBeUndefined();
    expect(attempts).toBe(2);
    expect(lazyPanels.panelReady("products")).toBe(true);
    expect(lazyPanels.preparePanel("products")).toBeNull();
  });

  it("V4-8b usePanelReady：SSR 用同一個判斷（getServerSnapshot），預先載入前後各自反映 panelReady", async () => {
    mockChunks();
    const lazyPanels = await freshLazyPanels();
    const Probe = ({ panel }: { panel: string }) => createElement("p", null, String(lazyPanels.usePanelReady(panel)));
    expect(renderToStaticMarkup(createElement(Probe, { panel: "overview" }))).toBe("<p>true</p>");
    expect(renderToStaticMarkup(createElement(Probe, { panel: "meeting" }))).toBe("<p>false</p>");
    await lazyPanels.preloadPanels();
    expect(renderToStaticMarkup(createElement(Probe, { panel: "meeting" }))).toBe("<p>true</p>");
    expect(source("src/components/lazy-panels.tsx")).toContain("return useSyncExternalStore(subscribe, ready, ready);");
  });

  it("dashboard 在資料第一次就緒（ready／partial）後才排程，effect 的 cleanup 會取消還沒開始的排程", () => {
    const dashboard = source("src/components/dashboard.tsx");
    expect(dashboard).toContain('const dataReady = status === "ready" || status === "partial";');
    expect(dashboard).toMatch(/useEffect\(\(\) => \{\s*if \(!dataReady\) return;\s*return schedulePanelPreload\(\);\s*\}, \[dataReady\]\);/);
    expect(dashboard.match(/schedulePanelPreload\(/g)).toHaveLength(1);
  });
});

// V4-10 代理 D（D-V4-21＝A；06_BATCHES V4-10「散佈圖 chunk 不在首頁 HTML 腳本清單」；PRD §8.2「散佈圖只能用 next/dynamic」、§7.9 CL-6）：
// G24 的圖本體 src/components/charts/products-scatter-lazy.tsx 只經 next/dynamic 載入。這裡驗靜態部分（模組圖與匯入寫法）；
// 「build 產出的散佈圖 chunk 不在首頁 HTML」由 tests/e2e/charts-products.spec.ts 讀 .next/react-loadable-manifest.json 的 chunk 檔名判定。
describe("V4-10 G24 散佈圖只經 next/dynamic 載入", () => {
  const LAZY = "src/components/charts/products-scatter-lazy.tsx";
  const SECTION = "src/components/products/scatter-section.tsx";
  const srcFiles = () => ts.sys.readDirectory(resolve("src"), [".ts", ".tsx"]).filter(file => !file.endsWith(".d.ts")).map(file => relative(".", file)).sort();
  /** 檔案裡的匯入宣告（含再匯出）：模組名、是不是只有型別、匯入的名字。 */
  function importsOf(file: string) {
    const source = ts.createSourceFile(file, readFileSync(resolve(file), "utf8"), ts.ScriptTarget.Latest, false, file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
    const out: { specifier: string; typeOnly: boolean; names: string[] }[] = [];
    for (const statement of source.statements) {
      if (ts.isImportDeclaration(statement)) {
        const clause = statement.importClause;
        const named = clause?.namedBindings && ts.isNamedImports(clause.namedBindings) ? clause.namedBindings.elements : [];
        const typeOnly = !!clause?.isTypeOnly || (!!clause && !clause.name && named.length > 0 && named.every(element => element.isTypeOnly));
        out.push({ specifier: (statement.moduleSpecifier as ts.StringLiteral).text, typeOnly, names: named.filter(element => !element.isTypeOnly).map(element => (element.propertyName ?? element.name).text) });
      } else if (ts.isExportDeclaration(statement) && statement.moduleSpecifier) {
        const named = statement.exportClause && ts.isNamedExports(statement.exportClause) ? statement.exportClause.elements : [];
        out.push({ specifier: (statement.moduleSpecifier as ts.StringLiteral).text, typeOnly: statement.isTypeOnly || (named.length > 0 && named.every(element => element.isTypeOnly)), names: [] });
      }
    }
    return out;
  }

  it("首載（page.tsx、layout.tsx 起）與商品頁的 chunk（product-comparison-panel.tsx 起）的靜態模組圖都走不到散佈圖本體；G24 的區塊隨商品頁的 chunk、不在首載", () => {
    const first = firstLoadGraph(["src/app/page.tsx", "src/app/layout.tsx"]);
    for (const file of [LAZY, SECTION]) {
      expect(existsSync(file), file).toBe(true);
      expect(first.files.has(file), `${file} 不得在首載`).toBe(false);
    }
    const products = firstLoadGraph(["src/components/product-comparison-panel.tsx"]);
    expect(products.files.has(SECTION), "G24 區塊隨商品頁的 chunk").toBe(true);
    expect(products.files.has(LAZY), "散佈圖本體不在商品頁的 chunk（只經 next/dynamic）").toBe(false);
    expect(products.packages.has("next"), "商品頁的 chunk 用 next/dynamic").toBe(true);
  });

  it("src 內沒有任何檔案以值匯入（含再匯出）products-scatter-lazy（import type 例外）；import(\"…/products-scatter-lazy\") 全站只有一處：scatter-section.tsx 的 dynamic(() => import(…), { ssr: false })；chart-scan 認得它是延遲載入的模組", async () => {
    const { lazyLoadedModules } = await import("../scripts/lib/chart-scan.mjs");
    const files = srcFiles();
    expect(files).toContain(LAZY);
    for (const file of files) for (const entry of importsOf(file).filter(item => /(^|\/)products-scatter-lazy$/.test(item.specifier))) expect(entry.typeOnly, `${file} 以值匯入 ${entry.specifier}`).toBe(true);
    const dynamicImports = files.flatMap(file => [...source(file).matchAll(/(?<!typeof )import\(\s*"([^"]*products-scatter-lazy)"\s*\)/g)].map(match => `${file}:${match[1]}`));
    expect(dynamicImports).toEqual([`${SECTION}:../charts/products-scatter-lazy`]);
    expect(source(SECTION)).toMatch(/= dynamic\(\(\) => import\("\.\.\/charts\/products-scatter-lazy"\)\.catch\([^\n]*\{ ssr: false, loading: /);
    expect(importsOf(SECTION).find(item => item.specifier === "next/dynamic")).toMatchObject({ typeOnly: false });
    expect(lazyLoadedModules(files.map(path => ({ path, text: source(path) })))).toContain("products-scatter-lazy");
  });

  it("Recharts 的 ScatterChart、Scatter 只在 products-scatter-lazy.tsx 匯入（CL-6）；它的預設匯出是圖本體", () => {
    const users = srcFiles().filter(file => importsOf(file).some(item => item.specifier === "recharts" && item.names.some(name => name === "ScatterChart" || name === "Scatter")));
    expect(users).toEqual([LAZY]);
    expect(source(LAZY)).toMatch(/^export default function ProductsScatterChart\(/m);
  });
});
