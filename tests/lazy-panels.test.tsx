import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import * as meetingPage from "@/components/meeting-page";
import * as meetingEntry from "@/components/meeting-entry";
import { createChunkLoader } from "@/components/lazy-panels";
import { fixture } from "./helpers/fixtures";

// V4-3c（D-V4-42＝A，首載瘦身）：lazy-panels.tsx 的同名包裝元件、dashboard 只改 import 行、預先載入（資料就緒後、只有一次、一個 chunk 一個閒置回呼）。

const PANELS = ["Diagnosis", "DataWorkspace", "AiPanel", "MeetingPage", "ProductComparisonPanel", "ActionsWorkbench"] as const;
/** 預先載入的順序（lazy-panels.tsx 的 PRELOAD_ORDER）與各模組的同名元件。 */
const CHUNKS = [
  { path: "@/components/workspace-panels", exports: ["Diagnosis", "DataWorkspace"] },
  { path: "@/components/ai-panel", exports: ["AiPanel"] },
  { path: "@/components/product-comparison-panel", exports: ["ProductComparisonPanel"] },
  { path: "@/components/meeting-page", exports: ["MeetingPage"] },
  { path: "@/components/actions-workbench", exports: ["ActionsWorkbench"] },
] as const;
/** 首載不得靜態匯入的模組：頁面面板與匯出程式（V4-3c 範圍第 1、2 項）。 */
const SPLIT_FROM_DASHBOARD = ["./workspace-panels", "./meeting-page", "./product-comparison-panel", "./actions-workbench", "./ai-panel", "@/application/excel-export", "@/application/pptx-export", "@/application/workspace-decision-export"];

const source = (file: string) => readFileSync(resolve(file), "utf8");
/** 原始碼裡的靜態值匯入與再匯出（`import type`／`export type` 不算，打包時會被拿掉）。這幾個檔的 import 都是單行。 */
function staticSpecifiers(text: string): string[] {
  return text.split("\n").filter(line => /^(import|export)\s.*\sfrom\s+"/.test(line) && !/^(import|export)\s+type\s/.test(line)).map(line => /\sfrom\s+"([^"]+)"/.exec(line)![1]);
}

/** 用 vi.doMock 換掉五個面板模組：被 import() 時記下模組路徑；gate 讓測試控制第一個 chunk 什麼時候載入完。 */
function mockChunks(options: { gate?: Promise<void>; failing?: string } = {}) {
  const calls: string[] = [];
  for (const chunk of CHUNKS) {
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

afterEach(() => {
  for (const chunk of CHUNKS) vi.doUnmock(chunk.path);
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

  it("preloadPanels 只跑一次：依序一次載入一個 chunk（前一個載入完才開始下一個），重複呼叫回傳同一個 promise", async () => {
    let release!: () => void;
    const gate = new Promise<void>(done => { release = done; });
    const calls = mockChunks({ gate });
    const lazyPanels = await freshLazyPanels();
    const first = lazyPanels.preloadPanels();
    expect(lazyPanels.preloadPanels()).toBe(first);
    await vi.waitFor(() => expect(calls).toEqual([CHUNKS[0].path]));
    await new Promise(done => setTimeout(done, 30));
    expect(calls, "第一個 chunk 還沒載入完，不開始下一個").toEqual([CHUNKS[0].path]);
    release();
    await first;
    expect(calls).toEqual(CHUNKS.map(chunk => chunk.path));
    await lazyPanels.preloadPanels();
    expect(lazyPanels.preloadPanels()).toBe(first);
    expect(calls).toHaveLength(CHUNKS.length);
  });

  it("一個 chunk 載入失敗：預先載入照樣完成其他 chunk、promise 不 reject、沒有未處理的 rejection", async () => {
    const unhandled: unknown[] = [];
    const listener = (reason: unknown) => { unhandled.push(reason); };
    process.on("unhandledRejection", listener);
    try {
      const calls = mockChunks({ failing: "@/components/ai-panel" });
      const lazyPanels = await freshLazyPanels();
      await expect(lazyPanels.preloadPanels()).resolves.toBeUndefined();
      expect(calls).toEqual(CHUNKS.map(chunk => chunk.path));
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
    await vi.waitFor(() => expect(calls).toEqual(CHUNKS.map(chunk => chunk.path)));
    await lazyPanels.preloadPanels();
    const again = lazyPanels.schedulePanelPreload();
    await vi.advanceTimersByTimeAsync(lazyPanels.PANEL_PRELOAD_DELAY_MS * 5);
    again();
    expect(calls).toHaveLength(CHUNKS.length);
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

  it("dashboard 的 setPanel：有資料且 chunk 未載入時先 preparePanel 再切頁（同一次更新換導覽標示與內容）；連續切頁只有最後一次生效", () => {
    const dashboard = source("src/components/dashboard.tsx");
    expect(dashboard).toContain('const [panel, showPanel] = useState<Panel>("overview");');
    expect(dashboard).toContain("const pending = hasData.current ? preparePanel(next) : null;");
    expect(dashboard).toContain("if (!pending) { showPanel(next); return; }");
    expect(dashboard).toContain("void pending.then(() => { if (request === panelRequest.current) showPanel(next); });");
    expect(dashboard).not.toMatch(/startTransition/);
    // 其餘地方一律經過 setPanel，不直接呼叫 showPanel。
    expect(dashboard.match(/showPanel\(/g)).toHaveLength(2);
  });

  it("dashboard 在資料第一次就緒（ready／partial）後才排程，effect 的 cleanup 會取消還沒開始的排程", () => {
    const dashboard = source("src/components/dashboard.tsx");
    expect(dashboard).toContain('const dataReady = status === "ready" || status === "partial";');
    expect(dashboard).toMatch(/useEffect\(\(\) => \{\s*if \(!dataReady\) return;\s*return schedulePanelPreload\(\);\s*\}, \[dataReady\]\);/);
    expect(dashboard.match(/schedulePanelPreload\(/g)).toHaveLength(1);
  });
});
