import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { labels } from "@/i18n";
import { guideLabels } from "@/i18n/guide.zh-TW";
import { GUIDE_AREA_CODES, GUIDE_AREA_STEPS, GUIDE_AREAS, GUIDE_GROUPS, GUIDE_QUICKSTART, GUIDE_UNIQUE, GUIDE_VIDEOS, GUIDE_WHO, lookupUiRef, resolveUiRefs, uiRefParts, type GuideAreaLink } from "@/application/guide";
import { GUIDE_HUB_CLAIMS, GUIDE_HUB_PREMISE, GUIDE_HUB_UNIQUE_KEYS, GUIDE_TRADEOFF_KEYS, GUIDE_TRADEOFF_LINKS } from "@/components/guide/guide-hub-data";
import { L1_KEY_PATTERNS, L1_MAX_CJK, channelAliasTerms, l1ClauseLengths, labelEntries } from "../scripts/lib/copy-scan.mjs";
import { labelsHash } from "../verification/guide-media/labels-hash";
import { VIDEO_MAX_BYTES, VIDEO_MAX_MS, VIDEO_SIZE, buildVtt, mp4Info, videoCueBaseline, videoCueTexts, videoFile, videoLabelsHash, videoPosterFile, videoVttFile, vttCueCount, vttTimestamp, type GuideVideoEntry } from "../verification/guide-media/vtt";

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

  it("分組、角色、獨特性（V42-G1：3 主張＋1 前提）、刻意不做的事、30 秒上手的鍵都有文字", () => {
    expect(Object.keys(guideLabels.guide.groups)).toEqual([...GUIDE_GROUPS]);
    expect(Object.keys(guideLabels.guide.who.roles)).toEqual(GUIDE_WHO.map(row => row.role));
    // V42-G1（docs/revamp-v4.2/06_BATCHES.md V42-G1）：說明首頁的獨特性由 src/components/guide/guide-hub-data.ts 的 GUIDE_HUB_CLAIMS＋GUIDE_HUB_PREMISE 驅動；
    // src/application/guide.ts 的 GUIDE_UNIQUE（v4.1 的 7 項）因本批對 src/application 零改動而留著，V42-G1 起沒有任何頁面讀它。
    expect(Object.keys(guideLabels.guide.unique.items)).toEqual([...GUIDE_HUB_UNIQUE_KEYS]);
    expect(GUIDE_HUB_CLAIMS.map(item => item.key)).toEqual(["traceable", "judgment", "loop"]);
    expect(GUIDE_HUB_PREMISE.key).toBe("premise");
    expect(GUIDE_UNIQUE).toHaveLength(7);
    // 「在哪裡看得到」：每項至少 2 個功能區、代號都在 GUIDE_AREA_CODES、錨點在該頁的步驟裡；traceable 連到總覽頁的 #bridge（說明首頁必須有這個連結）。
    for (const item of [...GUIDE_HUB_CLAIMS, GUIDE_HUB_PREMISE]) {
      const links: readonly GuideAreaLink[] = item.where;
      expect(links.length, item.key).toBeGreaterThanOrEqual(2);
      for (const link of links) {
        expect(GUIDE_AREA_CODES, `${item.key}：${link.area}`).toContain(link.area);
        if (link.hash) expect(GUIDE_AREA_STEPS[link.area]!.map(step => step.key), `${item.key}：${link.area}#${link.hash}`).toContain(link.hash);
      }
    }
    expect(GUIDE_HUB_CLAIMS.find(item => item.key === "traceable")!.where).toContainEqual({ area: "overview", hash: "bridge" });
    // 每個主張固定四段（title、before、after 3 點、meaning）；前提沒有 before、after 2 點；欄名三個。
    for (const claim of GUIDE_HUB_CLAIMS) {
      const copy = guideLabels.guide.unique.items[claim.key];
      expect(Object.keys(copy).sort(), claim.key).toEqual(["after", "before", "meaning", "title"]);
      expect(copy.after, claim.key).toHaveLength(3);
      for (const value of [copy.title, copy.before, ...copy.after, copy.meaning]) expect(value.trim().length, claim.key).toBeGreaterThan(0);
    }
    const premise = guideLabels.guide.unique.items.premise;
    expect(Object.keys(premise).sort()).toEqual(["after", "meaning", "title"]);
    expect(premise.after).toHaveLength(2);
    expect(Object.keys(guideLabels.guide.unique.fields)).toEqual(["before", "after", "meaning"]);
    // 刻意不做的事：引言、三點（鍵＝GUIDE_TRADEOFF_KEYS）、結語；只有 sync 附功能區連結（匯入資料頁）。
    expect(Object.keys(guideLabels.guide.tradeoffs)).toEqual(["lead", "items", "closing"]);
    expect(Object.keys(guideLabels.guide.tradeoffs.items)).toEqual([...GUIDE_TRADEOFF_KEYS]);
    expect(Object.keys(GUIDE_TRADEOFF_LINKS)).toEqual(["sync"]);
    expect(GUIDE_TRADEOFF_LINKS.sync).toEqual([{ area: "import" }]);
    // 30 秒上手：一行引言＋四步。
    expect(guideLabels.guide.quickstart.lead.trim().length).toBeGreaterThan(0);
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
const mediaManifest = JSON.parse(readFileSync(MEDIA_MANIFEST, "utf8")) as { updated: string | null; media: GuideMediaEntry[]; videos?: GuideVideoEntry[] };
/** V41-3：清單裡的示範影片（MP4、字幕、poster 在 public/guide/video/，cue 比對基準在 baseline/video/）。 */
const manifestVideos = mediaManifest.videos ?? [];
/** GUIDE_AREA_STEPS 攤平（＝清單 media 的順序）。 */
const PLANNED_MEDIA = Object.entries(GUIDE_AREA_STEPS).flatMap(([area, steps]) => (steps ?? []).map(step => ({ area, stepKey: step.key, mediaId: step.mediaId })));
const plannedMedia = (id: string) => PLANNED_MEDIA.find(step => step.mediaId === id);
/**
 * 目錄下所有檔案（相對該目錄、以 / 分隔）；目錄不存在時是空陣列。
 * 以 . 開頭的檔（Finder 的 .DS_Store 等，.gitignore 已排除、不會提交）不算：V41-2b 驗收時本機 public/guide/.DS_Store 讓孤兒檔檢查誤報。
 */
function listFiles(directory: string): string[] {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { recursive: true, encoding: "utf8" }).map(name => name.split("\\").join("/")).filter(name => !name.split("/").some(part => part.startsWith(".")) && statSync(join(directory, name)).isFile()).sort();
}
const sha256Hex = (data: Buffer) => createHash("sha256").update(data).digest("hex");

describe("V41-2a 說明頁媒體同步（清單、WebP、基準 PNG）", () => {
  it("清單格式：updated 是 YYYY-MM-DD（有媒體時）或 null；id 不重複、都在 GUIDE_AREA_STEPS、依它的順序；檔名＝guide/{area}/{mediaId}.webp", () => {
    // V41-3：清單另有 videos（示範影片；格式在下面的「示範影片同步」檢查）。
    expect(Object.keys(mediaManifest).sort()).toEqual(["media", "updated", "videos"]);
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

  it("沒有孤兒檔：public/guide/ 與 verification/guide-media/baseline/ 的每個檔都屬於清單的一筆（V41-3：含 video/ 的 MP4、字幕、poster 與 cue 比對基準）", () => {
    const videoFiles = manifestVideos.flatMap(entry => [entry.file, entry.vtt, entry.poster]);
    const publicFiles = new Set([...mediaManifest.media.map(entry => entry.file), ...videoFiles].map(file => file.replace(/^guide\//, "")));
    const pngs = new Set([...mediaManifest.media.map(entry => `${entry.id}.png`), ...manifestVideos.flatMap(entry => entry.cues.map(cue => videoCueBaseline(entry.id, cue.key)))]);
    expect(listFiles(MEDIA_PUBLIC_GUIDE_DIR).filter(file => !publicFiles.has(file)).map(file => `public/guide/${file}`)).toEqual([]);
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

// ── V41-3 示範影片同步（06_BATCHES V41-3 第 4 項；PRD §3.5「影片」「字幕與逐字稿」；D-V41-7＝A、D-V41-8）──
// 不需要伺服器：讀清單 videos[]、public/guide/video/ 的 MP4（用 Buffer 讀 mvhd／tkhd／hdlr，不加依賴）、字幕與 poster、baseline/video/ 的 cue 比對基準。
// 影片畫面有沒有過期由 GUIDE_MEDIA=check 照流程重跑、逐 cue 比對判斷；這裡只檢查檔案、門檻與字幕是否與目前的 guideLabels 一致（不一致就跑 GUIDE_MEDIA=write：圖相同時只重寫字幕與 labels_hash，不重錄）。

const MEDIA_VIDEO_KEYS = ["bytes", "cues", "durationMs", "file", "height", "id", "labels_hash", "poster", "posterBytes", "vtt", "width"];
/** 清單時間與 MP4 檔頭（mvhd）的長度最多差 100 ms。 */
const VIDEO_DURATION_TOLERANCE_MS = 100;
/** 每段字幕至少 3 秒（讀得完；錄影時每個 cue 至少停 5 秒）。 */
const VIDEO_MIN_CUE_MS = 3_000;
const manifestVideo = (id: string) => manifestVideos.find(entry => entry.id === id);

describe("V41-3 示範影片同步（清單、MP4、字幕、poster、cue 比對基準）", () => {
  it("每支 GUIDE_VIDEOS 都在清單 videos 裡（依 GUIDE_VIDEOS 的順序、沒有多的）；欄位齊全、路徑固定、1280×800", () => {
    expect(manifestVideos.map(entry => entry.id), WRITE_HINT).toEqual(GUIDE_VIDEOS.map(video => video.id));
    for (const entry of manifestVideos) {
      expect(Object.keys(entry).sort(), entry.id).toEqual(MEDIA_VIDEO_KEYS);
      expect([entry.file, entry.vtt, entry.poster], entry.id).toEqual([videoFile(entry.id), videoVttFile(entry.id), videoPosterFile(entry.id)]);
      expect([entry.width, entry.height], entry.id).toEqual([VIDEO_SIZE.width, VIDEO_SIZE.height]);
      expect(entry.labels_hash, entry.id).toMatch(/^[0-9a-f]{64}$/);
    }
  });

  it("MP4：檔案存在、大小＝bytes 且 ≤ 2 MB；H.264、只有畫面軌（無音軌）、moov 在 mdat 之前（+faststart）、1280×800；mvhd 長度＝durationMs（±100 ms）且 ≤ 45 秒", () => {
    const problems: string[] = [];
    for (const entry of manifestVideos) {
      const path = resolve(MEDIA_PUBLIC_DIR, entry.file);
      if (!existsSync(path)) { problems.push(`${entry.id}：缺 public/${entry.file}`); continue; }
      const mp4 = readFileSync(path);
      if (mp4.length !== entry.bytes) problems.push(`${entry.id}：MP4 ${mp4.length} bytes，清單 ${entry.bytes}`);
      if (mp4.length > VIDEO_MAX_BYTES) problems.push(`${entry.id}：MP4 ${mp4.length} bytes > ${VIDEO_MAX_BYTES}`);
      if (entry.durationMs > VIDEO_MAX_MS) problems.push(`${entry.id}：${entry.durationMs} ms > ${VIDEO_MAX_MS}`);
      const info = mp4Info(mp4);
      if (!info.h264) problems.push(`${entry.id}：不是 H.264`);
      if (JSON.stringify(info.handlers) !== JSON.stringify(["vide"])) problems.push(`${entry.id}：軌道 ${info.handlers.join("、")}（只能有畫面軌）`);
      if (info.topLevel.indexOf("moov") > info.topLevel.indexOf("mdat")) problems.push(`${entry.id}：moov 在 mdat 之後（沒有 +faststart）`);
      if (info.width !== VIDEO_SIZE.width || info.height !== VIDEO_SIZE.height) problems.push(`${entry.id}：畫面 ${info.width}×${info.height}`);
      if (Math.abs(info.durationMs - entry.durationMs) > VIDEO_DURATION_TOLERANCE_MS) problems.push(`${entry.id}：mvhd ${info.durationMs} ms，清單 ${entry.durationMs} ms`);
    }
    expect(problems, WRITE_HINT).toEqual([]);
  });

  /** WebP 的寬高（只讀檔頭，不加依賴）：VP8（有損）、VP8L（無損）、VP8X（延伸）三種。 */
  const webpSize = (file: Buffer) => {
    const chunk = file.subarray(12, 16).toString("latin1");
    if (chunk === "VP8 ") return { width: file.readUInt16LE(26) & 0x3fff, height: file.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") { const bits = file.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; }
    if (chunk === "VP8X") return { width: file.readUIntLE(24, 3) + 1, height: file.readUIntLE(27, 3) + 1 };
    return null;
  };

  it("poster：WebP 存在、大小＝posterBytes、寬 ≤ 800（V41-3 驗收：原尺寸 poster 拉長手機 LCP）、比例同影片", () => {
    const problems: string[] = [];
    for (const entry of manifestVideos) {
      const path = resolve(MEDIA_PUBLIC_DIR, entry.poster);
      if (!existsSync(path)) { problems.push(`${entry.id}：缺 public/${entry.poster}`); continue; }
      const poster = readFileSync(path);
      if (poster.length !== entry.posterBytes) problems.push(`${entry.id}：poster ${poster.length} bytes，清單 ${entry.posterBytes}`);
      if (poster.subarray(0, 4).toString("latin1") !== "RIFF" || poster.subarray(8, 12).toString("latin1") !== "WEBP") { problems.push(`${entry.id}：poster 不是 WebP`); continue; }
      const size = webpSize(poster);
      if (!size) problems.push(`${entry.id}：讀不到 poster 的寬高`);
      else if (size.width > 800 || Math.abs(size.width / size.height - entry.width / entry.height) > 0.01) problems.push(`${entry.id}：poster ${size.width}×${size.height}（寬要 ≤ 800、比例同影片 ${entry.width}×${entry.height}）`);
    }
    expect(problems, WRITE_HINT).toEqual([]);
  });

  it("cue：key 與順序＝GUIDE_VIDEOS；從 0 開始、首尾相接、最後一段到影片結尾、每段 ≥ 3 秒；cue 比對基準存在、1280×800、SHA-256＝清單", () => {
    const problems: string[] = [];
    for (const video of GUIDE_VIDEOS) {
      const entry = manifestVideo(video.id);
      if (!entry) { problems.push(`${video.id}：清單沒有這支影片`); continue; }
      expect(entry.cues.map(cue => cue.key), video.id).toEqual(video.cues.map(cue => cue.key));
      entry.cues.forEach((cue, index) => {
        const label = `${video.id} › ${cue.key}`;
        const expectedStart = index === 0 ? 0 : entry.cues[index - 1].endMs;
        if (cue.startMs !== expectedStart) problems.push(`${label}：startMs ${cue.startMs}，應為 ${expectedStart}`);
        if (cue.endMs - cue.startMs < VIDEO_MIN_CUE_MS) problems.push(`${label}：只有 ${cue.endMs - cue.startMs} ms`);
        const png = resolve(MEDIA_BASELINE_DIR, videoCueBaseline(video.id, cue.key));
        if (!existsSync(png)) { problems.push(`${label}：缺基準 ${relative(resolve("."), png)}`); return; }
        const bytes = readFileSync(png);
        if (sha256Hex(bytes) !== cue.sha256) problems.push(`${label}：基準 PNG 的 SHA-256 與清單不符`);
        if (bytes.readUInt32BE(16) !== VIDEO_SIZE.width || bytes.readUInt32BE(20) !== VIDEO_SIZE.height) problems.push(`${label}：基準 ${bytes.readUInt32BE(16)}×${bytes.readUInt32BE(20)}`);
      });
      if (entry.cues.at(-1)?.endMs !== entry.durationMs) problems.push(`${video.id}：最後一段結束在 ${entry.cues.at(-1)?.endMs} ms，影片長 ${entry.durationMs} ms`);
    }
    expect(problems, WRITE_HINT).toEqual([]);
  });

  // 字幕文字（guideLabels.guide.videos.{id}.cues）還沒寫或改過時，這兩項失敗；補字後跑 GUIDE_MEDIA=write（cue 畫面相同時只重寫 .vtt 與 labels_hash，不重錄）。
  it("字幕檔＝buildVtt（清單的時間＋目前 guideLabels 的 cue 文字，{ui:…} 換成介面原字串），段數＝cue 數", () => {
    for (const entry of manifestVideos) {
      const path = resolve(MEDIA_PUBLIC_DIR, entry.vtt);
      expect(existsSync(path), `缺 public/${entry.vtt}`).toBe(true);
      const vtt = readFileSync(path, "utf8");
      expect(vttCueCount(vtt), entry.id).toBe(guideVideoCueCount(entry.id));
      expect(vtt, `${entry.id}：${WRITE_HINT}`).toBe(buildVtt(entry, videoCueTexts(entry.id)));
    }
  });

  it("labels_hash＝這支影片的標題與字幕目前引用的介面字串的雜湊", () => {
    expect(manifestVideos.filter(entry => entry.labels_hash !== videoLabelsHash(entry.id)).map(entry => entry.id), WRITE_HINT).toEqual([]);
  });

  it("buildVtt：WEBVTT 標頭、每段「key／時間／文字」、& < > 跳脫、換行收成一行；缺文字就丟錯並列出缺哪些", () => {
    const video = { id: "demo", cues: [{ key: "a", startMs: 0, endMs: 4_200, sha256: "" }, { key: "b", startMs: 4_200, endMs: 61_005, sha256: "" }] };
    expect(buildVtt(video, { a: "按 <套用> & 確認", b: "第一行\n第二行" })).toBe("WEBVTT\n\na\n00:00:00.000 --> 00:00:04.200\n按 &lt;套用&gt; &amp; 確認\n\nb\n00:00:04.200 --> 00:01:01.005\n第一行 第二行\n");
    expect(() => buildVtt(video, { a: "只有一段" })).toThrow(/guide\.videos\.demo\.cues\.b/);
    expect(() => buildVtt(video, { a: " ", b: "x" })).toThrow(/guide\.videos\.demo\.cues\.a/);
    expect(vttTimestamp(3_723_004)).toBe("01:02:03.004");
    expect(vttCueCount(buildVtt(video, { a: "x", b: "y" }))).toBe(2);
  });
});

/** GUIDE_VIDEOS 裡這支影片的 cue 數。 */
function guideVideoCueCount(id: string): number {
  return GUIDE_VIDEOS.find(video => video.id === id)?.cues.length ?? -1;
}

