import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { labels } from "@/i18n";
import { guideLabels } from "@/i18n/guide.zh-TW";
import { GUIDE_AREA_CODES, GUIDE_AREA_STEPS, GUIDE_AREAS, GUIDE_GROUPS, GUIDE_QUICKSTART, GUIDE_UNIQUE, GUIDE_WHO, lookupUiRef, resolveUiRefs, uiRefParts } from "@/application/guide";
import { L1_KEY_PATTERNS, L1_MAX_CJK, channelAliasTerms, l1ClauseLengths, labelEntries } from "../scripts/lib/copy-scan.mjs";
import { labelsHash } from "../verification/guide-media/labels-hash";

// V41-1（docs/revamp-v4.1/06_BATCHES.md V41-1 第 9 項、01_PRD.md §3.4、§3.10）：說明頁文字 guideLabels（src/i18n/guide.zh-TW.ts）的內容護欄。
// (1) 每個 {ui:路徑} 都解析得到；(2) 標題 L1；(3) 最高級黑名單；(4) 介面字串不重打；(5) 工作台入口 shell.guideV41.* 不用問句；(6) 第一人稱骨架的〔〕不上線。
// V41-2a 起再加媒體同步檢查（PRD §3.5；D-V41-22＝A；最後一個 describe）。

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

// ── V41-2a 媒體同步檢查（06_BATCHES V41-2a 第 4 項；PRD §3.5「同步檢查」；D-V41-22＝A）──
// 不需要伺服器：讀媒體清單 src/application/guide-media.json、public/guide/** 的 WebP 與 verification/guide-media/baseline/** 的基準 PNG。
// 換了基準卻沒重轉 WebP（SHA-256 不符）、少檔、孤兒檔、太大、被引用的介面字串改了（labels_hash 不符）都在這裡失敗；修法是跑 GUIDE_MEDIA=write（verification/guide-media.config.ts）。
// 畫面本身有沒有過期由 GUIDE_MEDIA=check（toHaveScreenshot）判斷，不用位元組雜湊。

interface GuideMediaEntry { id: string; file: string; width: number; height: number; bytes: number; sha256: string; labels_hash: string }
const MEDIA_MANIFEST = resolve("src/application/guide-media.json");
const MEDIA_PUBLIC_DIR = resolve("public");
const MEDIA_PUBLIC_GUIDE_DIR = resolve("public/guide");
const MEDIA_BASELINE_DIR = resolve("verification/guide-media/baseline");
/** 單張 ≤ 200 KB、每個功能區頁合計 ≤ 1.5 MB（PRD §3.5「大小控制」、06 護欄表「說明頁媒體」）。 */
const MEDIA_MAX_BYTES = 200 * 1024;
const MEDIA_MAX_AREA_BYTES = 1.5 * 1024 * 1024;
const WRITE_HINT = "跑 GUIDE_MEDIA=write npx playwright test --config verification/guide-media.config.ts";
const mediaManifest = JSON.parse(readFileSync(MEDIA_MANIFEST, "utf8")) as { updated: string | null; media: GuideMediaEntry[] };
/** GUIDE_AREA_STEPS 攤平（＝清單 media 的順序）。 */
const PLANNED_MEDIA = Object.entries(GUIDE_AREA_STEPS).flatMap(([area, steps]) => (steps ?? []).map(step => ({ area, stepKey: step.key, mediaId: step.mediaId })));
const plannedMedia = (id: string) => PLANNED_MEDIA.find(step => step.mediaId === id);
/** 目錄下所有檔案（相對該目錄、以 / 分隔）；目錄不存在時是空陣列。 */
function listFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, encoding: "utf8" }).filter(name => statSync(join(directory, name)).isFile()).map(name => name.split("\\").join("/")).sort();
}
const sha256Hex = (data: Buffer) => createHash("sha256").update(data).digest("hex");

describe("V41-2a 說明頁媒體同步（清單、WebP、基準 PNG）", () => {
  it("清單格式：updated 是 YYYY-MM-DD（有媒體時）或 null；id 不重複、都在 GUIDE_AREA_STEPS、依它的順序；檔名＝guide/{area}/{mediaId}.webp", () => {
    expect(Object.keys(mediaManifest).sort()).toEqual(["media", "updated"]);
    if (mediaManifest.media.length > 0) expect(mediaManifest.updated).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    else expect(mediaManifest.updated === null || /^\d{4}-\d{2}-\d{2}$/.test(mediaManifest.updated)).toBe(true);
    const ids = mediaManifest.media.map(entry => entry.id);
    expect(new Set(ids).size, "id 重複").toBe(ids.length);
    expect(ids.filter(id => !plannedMedia(id)), "清單裡有 GUIDE_AREA_STEPS 沒有的 mediaId").toEqual([]);
    expect(ids, "清單要依 GUIDE_AREA_STEPS 的順序").toEqual(PLANNED_MEDIA.map(step => step.mediaId).filter(id => ids.includes(id)));
    for (const entry of mediaManifest.media) {
      expect(Object.keys(entry).sort(), entry.id).toEqual(["bytes", "file", "height", "id", "labels_hash", "sha256", "width"]);
      expect(entry.file, entry.id).toBe(`guide/${plannedMedia(entry.id)!.area}/${entry.id}.webp`);
      expect(entry.sha256, entry.id).toMatch(/^[0-9a-f]{64}$/);
      expect(entry.labels_hash, entry.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("已上線的功能區（GUIDE_AREAS）每一步的 mediaId 都在清單裡", () => {
    const ids = new Set(mediaManifest.media.map(entry => entry.id));
    const missing = GUIDE_AREAS.flatMap(area => area.steps.filter(step => !ids.has(step.mediaId)).map(step => `${area.area} › ${step.key}：${step.mediaId}`));
    expect(missing, WRITE_HINT).toEqual([]);
  });

  it("清單每一筆：WebP 與基準 PNG 都存在；基準 PNG 的 SHA-256＝sha256、寬高＝width／height；WebP 的大小＝bytes", () => {
    const problems: string[] = [];
    for (const entry of mediaManifest.media) {
      const webp = resolve(MEDIA_PUBLIC_DIR, entry.file);
      const png = resolve(MEDIA_BASELINE_DIR, `${entry.id}.png`);
      if (!existsSync(webp)) { problems.push(`${entry.id}：缺 public/${entry.file}`); continue; }
      if (!existsSync(png)) { problems.push(`${entry.id}：缺基準 ${relative(resolve("."), png)}`); continue; }
      const pngBytes = readFileSync(png);
      if (sha256Hex(pngBytes) !== entry.sha256) problems.push(`${entry.id}：基準 PNG 的 SHA-256 與清單不符（換了基準卻沒重轉 WebP）`);
      if (pngBytes.readUInt32BE(16) !== entry.width || pngBytes.readUInt32BE(20) !== entry.height) problems.push(`${entry.id}：基準 PNG ${pngBytes.readUInt32BE(16)}×${pngBytes.readUInt32BE(20)}，清單 ${entry.width}×${entry.height}`);
      const webpBytes = readFileSync(webp);
      if (webpBytes.length !== entry.bytes) problems.push(`${entry.id}：WebP ${webpBytes.length} bytes，清單 ${entry.bytes}`);
      if (webpBytes.subarray(0, 4).toString("latin1") !== "RIFF" || webpBytes.subarray(8, 12).toString("latin1") !== "WEBP") problems.push(`${entry.id}：public/${entry.file} 不是 WebP`);
    }
    expect(problems, WRITE_HINT).toEqual([]);
  });

  it("沒有孤兒檔：public/guide/ 與 verification/guide-media/baseline/ 的每個檔都屬於清單的一筆", () => {
    const webps = new Set(mediaManifest.media.map(entry => entry.file.replace(/^guide\//, "")));
    const pngs = new Set(mediaManifest.media.map(entry => `${entry.id}.png`));
    expect(listFiles(MEDIA_PUBLIC_GUIDE_DIR).filter(file => !webps.has(file)).map(file => `public/guide/${file}`)).toEqual([]);
    expect(listFiles(MEDIA_BASELINE_DIR).filter(file => !pngs.has(file)).map(file => `verification/guide-media/baseline/${file}`)).toEqual([]);
  });

  it("大小：單張 WebP ≤ 200 KB、每個功能區合計 ≤ 1.5 MB（讀清單的 bytes）", () => {
    expect(mediaManifest.media.filter(entry => entry.bytes > MEDIA_MAX_BYTES).map(entry => `${entry.id}：${entry.bytes}`)).toEqual([]);
    const perArea = new Map<string, number>();
    for (const entry of mediaManifest.media) { const area = plannedMedia(entry.id)?.area ?? entry.file; perArea.set(area, (perArea.get(area) ?? 0) + entry.bytes); }
    expect([...perArea].filter(([, bytes]) => bytes > MEDIA_MAX_AREA_BYTES).map(([area, bytes]) => `${area}：${bytes}`)).toEqual([]);
  });

  it("labels_hash＝這一步目前引用的介面字串的雜湊（被引用的字串改了就要重拍；圖相同時 write 只更新雜湊）", () => {
    const stale = mediaManifest.media.filter(entry => { const step = plannedMedia(entry.id); return step !== undefined && labelsHash(step.area, step.stepKey) !== entry.labels_hash; }).map(entry => entry.id);
    expect(stale, WRITE_HINT).toEqual([]);
    // 雜湊本身有作用：沒有步驟文字時是 JSON.stringify([]) 的雜湊；不存在的步驟同樣是空引用。
    expect(labelsHash("start", "not-a-step")).toBe(createHash("sha256").update("[]").digest("hex"));
  });
});

