import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { labels } from "@/i18n";
import * as labelModule from "@/i18n/labels.zh-TW";
import { isWhitelisted, l1ClauseLengths, scanLabels, type CopyScanMetrics } from "../scripts/lib/copy-scan.mjs";

// V3-0 護欄（PRD §5.4、§8.4）：只掃 labels 的字串值，不渲染頁面。量測與 scripts/ui-audit.mjs 共用 scripts/lib/copy-scan.mjs。
// 白名單：鍵名為 technical（或以 technical 開頭／Technical 結尾）的子樹、glossary.aliases（v2 basis.aliases）。
// V3-2c 起只掃新分組（LABEL_GROUPS），同一個字串只算一次；V3-10 移除 v2 舊鍵 alias 後，labels 頂層就是 LABEL_GROUPS（scripts/lib/copy-scan.mjs labelScope 會擋下其他區段）。
// 頁面層的否定句計數由 tests/copy-density.test.ts 負責，這裡不重複（§5.4）。
// L1 子句長度：PRD 沒有把「頁面、區塊、列的標題」對應到 labels 鍵，V3-0 先限定 rules.*.title、sections.*、nav.*.label、buttons.*（V3-2c 新位置 rules.*.headline、<分組>.sections.*、shell.nav.*.headline、<分組>.buttons.*）。

const CEILING_FILE = resolve("tests/fixtures/copy-style-ceiling.json");
const readCeilings = () => (JSON.parse(readFileSync(CEILING_FILE, "utf8")) as { ceilings: Record<string, unknown> }).ceilings;

/** V3-0 實測的 v2 基準（2026-10-05）。上限檔永遠不得高於這裡；這份常數只在 V3-0 寫一次，之後不改。V3-2 目標全部為 0。 */
const V3_0_BASELINE: CopyScanMetrics = {
  noticePrefix: 29, noticeAnywhere: 42, arrows: 21, circledNumbers: 8, decorativeChars: 1, exclamations: 0, emoji: 0, allCaps: 0, pipes: 32,
  blacklistSynonym: 132, blacklistJargon: 6, blacklistTone: 0, blacklistEmotion: 0, placeholderMalformed: 0, placeholderVariantMismatch: 0, l1ClauseOverLimit: 0,
};

describe("copy-style 棘輪（labels 值）", () => {
  const { metrics, details } = scanLabels(labels, labelModule);

  it.each(Object.keys(V3_0_BASELINE) as (keyof CopyScanMetrics)[])("%s 不超過上限", key => {
    const ceiling = readCeilings()[key];
    const list = key.startsWith("blacklist") ? (details.blacklist as Record<string, string[]>)[key.slice(9, 10).toLowerCase() + key.slice(10)] : details[key];
    expect(metrics[key], `${key} 實測 ${metrics[key]}，上限 ${String(ceiling)}；違規清單：\n${(list as string[]).join("\n")}`).toBeLessThanOrEqual(ceiling as number);
  });

  it("上限檔只含數字、涵蓋每個指標，且每個上限 ≥ 目前實測、≤ V3-0 基準（棘輪只能往下）", () => {
    const ceilings = readCeilings();
    expect(Object.keys(ceilings).sort()).toEqual(Object.keys(metrics).sort());
    for (const [key, value] of Object.entries(ceilings)) {
      expect(Number.isInteger(value) && (value as number) >= 0, `${key} 必須是非負整數`).toBe(true);
      expect(value as number, `${key} 上限低於實測`).toBeGreaterThanOrEqual(metrics[key as keyof CopyScanMetrics]);
      expect(value as number, `${key} 上限不得高於 V3-0 基準`).toBeLessThanOrEqual(V3_0_BASELINE[key as keyof CopyScanMetrics]);
    }
  });
});

describe("copy-scan 口徑（合成輸入）", () => {
  it("technical 子樹與 glossary.aliases 列入白名單，其他不列", () => {
    expect(isWhitelisted("exports.pptx.technical")).toBe(true);
    expect(isWhitelisted("data.panel.meta.formatVersionTechnical")).toBe(true);
    expect(isWhitelisted("assist.technicalVersion")).toBe(true);
    expect(isWhitelisted("glossary.aliases.contribution_after_marketing.0")).toBe(true);
    expect(isWhitelisted("metrics.mer.technical.formula")).toBe(true);
    expect(isWhitelisted("glossary.basis.items.1")).toBe(false);
    // V3-10：v2 舊鍵 basis.aliases 已移除，不再列入白名單。
    expect(isWhitelisted("basis.aliases.contribution_after_marketing.0")).toBe(false);
  });

  it("逐項計數：注意：、箭頭、圈數字、驚嘆號、全大寫、｜、黑名單、占位符、L1 子句", () => {
    const sample = {
      a: "注意：資料到 {date}", b: "看 3 項資料問題 →", c: "① 兩個關鍵差額", d: "立即體驗！", e: "CHANNEL MIX", f: "資料版本｜{hash}",
      g: "這是數據變化", h: "缺 {name", i: { title: "{n} 筆", titleAria: "{count} 筆" },
      technical: "注意：→ ｜ ① ！", glossary: { aliases: { x: ["數據"] } },
      overview: { sections: { long: "這是一個超過十四個中文字的很長很長的區塊標題，第二句短" } },
      data: { demoChannelAlias: { DTC: "官網 · DTC" } },
    };
    const { metrics } = scanLabels(sample);
    expect(metrics).toMatchObject({ noticePrefix: 1, arrows: 1, circledNumbers: 1, exclamations: 1, allCaps: 1, pipes: 1, blacklistSynonym: 2, blacklistTone: 1, placeholderMalformed: 1, placeholderVariantMismatch: 1, l1ClauseOverLimit: 1 });
  });

  it("V4-0a：<分組>.chartsV4.<圖>.title（含子鍵）計入 L1 子句長度，副標不計；products.chartsV4.* 的「賠錢」「虧損」計入同義詞，其他路徑不計", () => {
    const long = "這是一個超過十四個中文字的很長很長的圖表標題結論";
    const sample = {
      overview: { chartsV4: { bridge: { title: { decrease: long }, subtitle: long } } },
      diagnosis: { chartsV4: { share: { title: long, table: { title: long } } } },
      products: { chartsV4: { pareto: { title: "{n} 個商品賠錢", subtitle: "虧損商品", columns: { note: "賠錢、虧損" }, technical: "賠錢" } }, sections: { lossNote: "商品虧損" } },
      format: { turnedLoss: "轉為虧損" },
    };
    const { metrics, details } = scanLabels(sample);
    // L1：只有 overview.chartsV4.bridge.title.decrease 與 diagnosis.chartsV4.share.title；subtitle、table.title 不是圖表標題。
    expect(metrics.l1ClauseOverLimit).toBe(2);
    // 同義詞：products.chartsV4 下 title 1、subtitle 1、columns.note 2；technical 子樹在白名單、products.sections 與 format 不在範圍內。
    expect(metrics.blacklistSynonym).toBe(4);
    expect((details.blacklist as Record<string, string[]>).synonym.every(line => line.includes("products.chartsV4."))).toBe(true);
  });

  it("V41-0：{ui:路徑} 當占位符（不計字、不掃黑名單、不算格式錯誤或變體不一致）；guide.areas 的功能區與步驟標題計入 L1；guide.* 擋最高級、不擋序數；額外 view 的指標相加", () => {
    const long = "這是一個超過十四個中文字的很長很長的功能區標題";
    const labelsSample = { shell: { buttons: { open: "開啟 {ui:shell.nav.overview.headline}" }, note: "最好的工作台" } };
    const guide = {
      guide: {
        hub: { lead: "按 {ui:shell.nav.overview.headline} 看數據", leadAria: "按 {ui:overview.buttons.export}" },
        areas: { start: { title: long, intro: long, steps: { load: { title: long, body: "第一次載入、第一項就是唯一最好的做法，不是第一名也不是業界第一" } } } },
        sections: { why: long },
      },
    };
    const alone = scanLabels(labelsSample);
    expect(alone.metrics).toMatchObject({ placeholderMalformed: 0, placeholderVariantMismatch: 0, blacklistTone: 0, l1ClauseOverLimit: 0 });
    expect(l1ClauseLengths("開啟 {ui:shell.nav.overview.headline}")).toEqual([2]);
    const { metrics, details } = scanLabels(labelsSample, undefined, guide);
    // L1：guide.areas.start.title、steps.load.title、guide.sections.why；intro 不是標題。
    expect(metrics.l1ClauseOverLimit).toBe(3);
    // 最高級只在 guide.*：唯一、最好、第一名、業界第一（shell.note 的「最好」不在範圍；「第一次」「第一項」不算）。
    expect(metrics.blacklistTone).toBe(4);
    expect((details.blacklist as Record<string, string[]>).tone.every(line => line.includes("guide."))).toBe(true);
    // 「數據」在 {ui:…} 之外照樣計入同義詞；占位符本身不算格式錯誤，lead 與 leadAria 沒有 {名稱} 占位符，變體一致。
    expect(metrics).toMatchObject({ blacklistSynonym: 1, placeholderMalformed: 0, placeholderVariantMismatch: 0 });
    expect(() => scanLabels(labelsSample, undefined, { shell: {} })).toThrow(/shell/);
  });

  it("L1 字數不計數字、單位、正負號、占位符與通路 alias", () => {
    expect(l1ClauseLengths("官網 · DTC 扣完廣告虧 6.1 萬", ["DTC", "官網"])).toEqual([5]);
    expect(l1ClauseLengths("扣廣告後少賺 {amount}，折扣率 +14.3 個百分點")).toEqual([6, 3]);
  });
});
