import { describe, expect, it } from "vitest";
import { labels } from "@/i18n";
import { guideLabels } from "@/i18n/guide.zh-TW";
import { GUIDE_AREA_CODES, GUIDE_AREAS, GUIDE_GROUPS, GUIDE_QUICKSTART, GUIDE_UNIQUE, GUIDE_WHO, lookupUiRef, resolveUiRefs, uiRefParts } from "@/application/guide";
import { L1_KEY_PATTERNS, L1_MAX_CJK, channelAliasTerms, l1ClauseLengths, labelEntries } from "../scripts/lib/copy-scan.mjs";

// V41-1（docs/revamp-v4.1/06_BATCHES.md V41-1 第 9 項、01_PRD.md §3.4、§3.10）：說明頁文字 guideLabels（src/i18n/guide.zh-TW.ts）的內容護欄。
// (1) 每個 {ui:路徑} 都解析得到；(2) 標題 L1；(3) 最高級黑名單；(4) 介面字串不重打；(5) 工作台入口 shell.guideV41.* 不用問句；(6) 第一人稱骨架的〔〕不上線。
// V41-2a 起再加媒體同步檢查（PRD §3.5）。

const GUIDE_ENTRIES = labelEntries(guideLabels) as [string, string][];
const LABEL_ENTRIES = labelEntries(labels) as [string, string][];
const UI_REF = /\{ui:[\w.]+\}/g;
/** {ui:路徑} 之外的可見文字（引用的介面字串本來就該和介面相同，不算重打）。 */
const outsideRefs = (text: string) => text.replace(UI_REF, " ");

/**
 * 「重打的介面字串」檢查的例外：說明文字可以用的通用詞（測試 (4)）。起始只有下面三個（06_BATCHES V41-1 第 9 項）；新增要在驗收文件說明理由。
 * 指標名（labels.metrics.*.headline，例如「商品毛利」）另外整批排除，不列在這裡。
 */
const GUIDE_PLAIN_TERMS = [
  "下一步", // 一般動詞片語（「下一步要調什麼」）；與通路健檢列的欄名 diagnosis.sections.nextStep 同字，說明文字不是在指那一欄。
  "影響金額", // 排序依據的一般說法（「按影響金額排好」）；與總覽區塊名 overview.sections.impact 同字，說明文字不是在指那個區塊。
  "關鍵數字", // 一般名詞（「五個關鍵數字」「與關鍵數字」）；與總覽區塊名 overview.sections.keyDeltas 同字，說明文字描述的是數字本身。
];

describe("V41-1 guideLabels：{ui:路徑} 引用", () => {
  it("guideLabels 頂層只有 guide，至少有說明首頁的各段（非空）", () => {
    expect(Object.keys(guideLabels)).toEqual(["guide"]);
    expect(GUIDE_ENTRIES.length).toBeGreaterThan(50);
    for (const key of ["hub", "sections", "why", "who", "unique", "tradeoffs", "quickstart", "groups", "areas"]) expect(Object.keys(guideLabels.guide), key).toContain(key);
  });

  it("(1) 每個 {ui:路徑} 都解析成 labels 的字串（沒有一個找不到或指到物件）", () => {
    const refs = GUIDE_ENTRIES.flatMap(([path, value]) => [...value.matchAll(/\{ui:([\w.]+)\}/g)].map(match => ({ path, ref: match[1] })));
    expect(refs.length).toBeGreaterThan(20);
    const broken = refs.filter(({ ref }) => { try { lookupUiRef(ref, labels); return false; } catch { return true; } }).map(({ path, ref }) => `${path}: {ui:${ref}}`);
    expect(broken).toEqual([]);
    for (const [, value] of GUIDE_ENTRIES) expect(resolveUiRefs(value, labels)).not.toMatch(/\{ui:/);
  });

  it("resolveUiRefs：換成 labels 原字串；路徑不存在或不是字串就丟錯；uiRefParts 標出引用的段落", () => {
    expect(resolveUiRefs("按{ui:shell.buttons.loadDemo}。", labels)).toBe(`按${labels.shell.buttons.loadDemo}。`);
    expect(resolveUiRefs("沒有引用", labels)).toBe("沒有引用");
    expect(() => resolveUiRefs("{ui:shell.buttons.notAKey}", labels)).toThrow(/shell\.buttons\.notAKey/);
    expect(() => resolveUiRefs("{ui:shell.buttons}", labels)).toThrow(/不是字串/);
    expect(() => resolveUiRefs("{ui:shell.nav.overview.headline.x}", labels)).toThrow();
    expect(uiRefParts("先看{ui:shell.nav.overview.headline}，再看{ui:shell.nav.diagnosis.headline}", labels)).toEqual([
      { text: "先看", ui: false }, { text: labels.shell.nav.overview.headline, ui: true }, { text: "，再看", ui: false }, { text: labels.shell.nav.diagnosis.headline, ui: true },
    ]);
  });
});

describe("V41-1 guideLabels：文案規則（copy-scan 同一套口徑）", () => {
  it("(2) L1：guide.sections.*、guide.areas.*.title、guide.areas.*.steps.*.title 去掉 {ui:…} 後每個子句 ≤ 14 字", () => {
    const titles = GUIDE_ENTRIES.filter(([path]) => L1_KEY_PATTERNS.some(re => re.test(path)));
    // 7 個段落標題＋11 個功能區標題（V41-2a 起再加步驟標題）。
    expect(titles.filter(([path]) => path.startsWith("guide.sections.")).length).toBeGreaterThanOrEqual(7);
    expect(titles.filter(([path]) => /^guide\.areas\.[^.]+\.title$/.test(path))).toHaveLength(GUIDE_AREA_CODES.length);
    const aliasTerms = channelAliasTerms(labels);
    const over = titles.map(([path, value]) => ({ path, value, lengths: l1ClauseLengths(value, aliasTerms) })).filter(({ lengths }) => lengths.some(length => length > L1_MAX_CJK)).map(({ path, value, lengths }) => `${path}: ${value}（${lengths.join("、")}）`);
    expect(over).toEqual([]);
  });

  it("(3) 不用最高級：guide.* 的可見文字沒有 唯一、最好、最快、最佳、最強、第一名、業界第一（「第一次」「第一項」這類序數可以用）", () => {
    const superlative = /唯一|最好|最快|最佳|最強|第一名|業界第一/;
    expect(GUIDE_ENTRIES.filter(([, value]) => superlative.test(outsideRefs(value))).map(([path, value]) => `${path}: ${value}`)).toEqual([]);
    expect(superlative.test("第一次匯入、第一項做法")).toBe(false);
  });

  it("(4) 不重打介面字串：{ui:…} 之外不含 shell.nav.*.headline、*.buttons.*、*.sections.* 的值（長度 ≥ 3；指標名與 GUIDE_PLAIN_TERMS 除外）", () => {
    const metricNames = new Set(Object.values(labels.metrics).map(metric => metric.headline));
    const forbidden = new Map<string, string>();
    for (const [path, value] of LABEL_ENTRIES) {
      if (!(/^shell\.nav\.[^.]+\.headline$/.test(path) || /(^|\.)buttons\./.test(path) || /(^|\.)sections\./.test(path))) continue;
      if ([...value].length < 3 || metricNames.has(value) || GUIDE_PLAIN_TERMS.includes(value)) continue;
      if (!forbidden.has(value)) forbidden.set(value, path);
    }
    // 檢查本身有作用：導覽頁名、按鈕、區塊名都在名單裡。
    expect(forbidden.get(labels.shell.nav.overview.headline)).toBe("shell.nav.overview.headline");
    expect(forbidden.has(labels.shell.buttons.loadDemo)).toBe(true);
    expect(forbidden.has(labels.evidence.sections.evidence)).toBe(true);
    // 例外：指標名（與頁名同字的「商品毛利」）與通用詞。
    expect(forbidden.has(labels.metrics.gross_profit.headline)).toBe(false);
    for (const term of GUIDE_PLAIN_TERMS) expect(LABEL_ENTRIES.some(([, value]) => value === term), `${term} 是介面字串，才需要列為例外`).toBe(true);
    const repeated = GUIDE_ENTRIES.flatMap(([path, value]) => [...forbidden].filter(([ui]) => outsideRefs(value).includes(ui)).map(([ui, uiPath]) => `${path} 重打了「${ui}」（${uiPath}），改用 {ui:${uiPath}}`));
    expect(repeated).toEqual([]);
  });

  it("(5) 工作台入口 shell.guideV41.* 不用問句（不含「？」或「?」）", () => {
    const entries = labelEntries(labels.shell.guideV41) as [string, string][];
    expect(entries.map(([path]) => path).sort()).toEqual(["entry", "homeHint", "newTab"]);
    expect(entries.filter(([, value]) => /[？?]/.test(value))).toEqual([]);
  });

  it("(6) guideLabels 沒有第一人稱骨架的「〔」「〕」（D-V41-9＝A：用 §1.1 產品口吻，不放提示問題）", () => {
    expect(GUIDE_ENTRIES.filter(([, value]) => /[〔〕]/.test(value)).map(([path]) => path)).toEqual([]);
    expect(Object.keys(guideLabels.guide)).not.toContain("whyFirstPerson");
  });
});

describe("V41-1 說明首頁的結構資料與 guideLabels 對得上", () => {
  it("11 個功能區代號＝guide.areas 的鍵，GUIDE_AREAS 只含這些代號、不重複", () => {
    expect(GUIDE_AREA_CODES).toEqual(["start", "import", "overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data", "evidence", "export"]);
    expect(Object.keys(guideLabels.guide.areas)).toEqual([...GUIDE_AREA_CODES]);
    const areas = GUIDE_AREAS.map(entry => entry.area);
    expect(areas.every(area => (GUIDE_AREA_CODES as readonly string[]).includes(area))).toBe(true);
    expect(new Set(areas).size).toBe(areas.length);
  });

  it("分組、角色、獨特性、30 秒上手的鍵都有文字", () => {
    expect(Object.keys(guideLabels.guide.groups)).toEqual([...GUIDE_GROUPS]);
    expect(Object.keys(guideLabels.guide.who.roles)).toEqual(GUIDE_WHO.map(row => row.role));
    expect(Object.keys(guideLabels.guide.unique.items)).toEqual(GUIDE_UNIQUE.map(item => item.key));
    expect(GUIDE_UNIQUE).toHaveLength(7);
    expect(Object.keys(guideLabels.guide.quickstart.steps)).toEqual(GUIDE_QUICKSTART.map(step => step.key));
    expect(GUIDE_QUICKSTART).toHaveLength(4);
  });
});
