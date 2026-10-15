import { createHash } from "node:crypto";
import { GUIDE_VIDEOS, lookupUiRef, resolveUiRefs, UI_REF_PATTERN, type GuideVideo } from "../../src/application/guide";
import { guideLabels } from "../../src/i18n/guide.zh-TW";
import { labels } from "../../src/i18n/labels.zh-TW";

// V41-3 示範影片的字幕（WebVTT）與清單欄位（docs/revamp-v4.1/01_PRD.md §3.5「影片」「字幕與逐字稿」；D-V41-7＝A、D-V41-8）。
// 字幕檔 public/guide/video/{id}.vtt 的唯一來源是 buildVtt(清單的這支影片, 目前 guideLabels 的 cue 文字)：
// 時間點取自 src/application/guide-media.json 的 videos[].cues（錄影時記錄），文字取自 guideLabels.guide.videos.{id}.cues.{key}（{ui:…} 換成 labels 原字串、純文字）。
// GUIDE_MEDIA=write 用它寫檔（文字改了只重寫 .vtt，不重錄）；tests/guide-content.test.ts 斷言提交的 .vtt 與它的輸出逐字相同。
// 純 TS：只用相對路徑 import（Playwright 與 Vitest 都能直接載入），不讀檔、不依賴伺服器。

/** 影片與 cue 擷取的視窗（＝影片尺寸），deviceScaleFactor 1。 */
export const VIDEO_SIZE = { width: 1280, height: 800 } as const;
/** 每支影片 ≤ 2 MB、≤ 45 秒（06_BATCHES 護欄表「說明頁媒體」、PRD §3.5）。 */
export const VIDEO_MAX_BYTES = 2 * 1024 * 1024;
export const VIDEO_MAX_MS = 45_000;

/** 清單 videos[] 的一段字幕：startMs／endMs 是影片時間（毫秒，相鄰 cue 首尾相接，最後一段到影片結尾）；sha256 是 cue 比對基準 PNG 的雜湊。 */
export interface GuideVideoCueEntry {
  key: string;
  startMs: number;
  endMs: number;
  sha256: string;
}
/** 清單 videos[] 的一支影片（只記內容欄位）：file／vtt／poster 是 public/ 之下的路徑；bytes 是 MP4、posterBytes 是 poster WebP 的大小。 */
export interface GuideVideoEntry {
  id: string;
  file: string;
  vtt: string;
  poster: string;
  width: number;
  height: number;
  bytes: number;
  posterBytes: number;
  durationMs: number;
  cues: GuideVideoCueEntry[];
  labels_hash: string;
}

/** 公開檔（相對 public/）與 cue 比對基準（相對 verification/guide-media/baseline/）的路徑。 */
export const videoFile = (id: string) => `guide/video/${id}.mp4`;
export const videoVttFile = (id: string) => `guide/video/${id}.vtt`;
export const videoPosterFile = (id: string) => `guide/video/${id}-poster.webp`;
export const videoCueBaseline = (id: string, key: string) => `video/${id}-${key}.png`;

/** GUIDE_VIDEOS 的一支（找不到時丟錯）。 */
export function guideVideo(id: string): GuideVideo {
  const video = GUIDE_VIDEOS.find(item => item.id === id);
  if (!video) throw new Error(`GUIDE_VIDEOS 沒有 ${id}`);
  return video;
}

/** guideLabels.guide.videos.{id} 的 title 與 cues（還沒寫文字時是 undefined；V41-3 的文字由 guide.zh-TW.ts 提供）。 */
function videoLabels(id: string): { title?: unknown; cues?: Record<string, unknown> } | undefined {
  const videos = (guideLabels.guide as unknown as { videos?: Record<string, { title?: unknown; cues?: Record<string, unknown> } | undefined> }).videos;
  return videos?.[id];
}

/** 這支影片的原始文字（含 {ui:…}）：title 與每個 cue；不是字串的不列。 */
function rawVideoTexts(id: string): string[] {
  const entry = videoLabels(id);
  if (!entry) return [];
  return [entry.title, ...Object.values(entry.cues ?? {})].filter((value): value is string => typeof value === "string");
}

/** 目前 guideLabels 的 cue 文字（{ui:…} 換成 labels 原字串的純文字），依 cue key；沒有文字的 cue 不在結果裡（buildVtt 會丟錯）。 */
export function videoCueTexts(id: string): Record<string, string> {
  const cues = videoLabels(id)?.cues ?? {};
  const texts: Record<string, string> = {};
  for (const [key, value] of Object.entries(cues)) if (typeof value === "string") texts[key] = resolveUiRefs(value, labels);
  return texts;
}

/** 這支影片的 title 與字幕引用的介面字串路徑（去重、依路徑排序）。 */
export function videoUiRefs(id: string): string[] {
  const paths = new Set<string>();
  for (const text of rawVideoTexts(id)) for (const match of text.matchAll(UI_REF_PATTERN)) paths.add(match[1]);
  return [...paths].sort();
}

/** labels_hash（同 labels-hash.ts 的 labelsHash）：sha256 hex of JSON.stringify([[路徑, labels 原字串], …])；沒有引用時是 JSON.stringify([]) 的雜湊。 */
export function videoLabelsHash(id: string): string {
  const pairs = videoUiRefs(id).map(path => [path, lookupUiRef(path, labels)]);
  return createHash("sha256").update(JSON.stringify(pairs)).digest("hex");
}

/** 毫秒 → WebVTT 時間（HH:MM:SS.mmm）。 */
export function vttTimestamp(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0) throw new Error(`字幕時間要是非負整數毫秒：${ms}`);
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(Math.floor(ms / 3_600_000))}:${pad(Math.floor(ms / 60_000) % 60)}:${pad(Math.floor(ms / 1000) % 60)}.${pad(ms % 1000, 3)}`;
}

/** cue 文字的 WebVTT 跳脫：& < > 換成字元參照；換行收成一行（空白行會截斷 cue）。 */
const escapeCueText = (text: string) => text.replace(/\s*\n\s*/g, " ").trim().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * WebVTT 字幕檔（純函式）：WEBVTT 標頭，之後每個 cue 一段——識別碼＝cue key、時間＝清單的 startMs --> endMs、文字＝cueTexts[key]。結尾一個換行。
 * 任何一個 cue 沒有文字（或是空字串）就丟錯並列出缺哪些：字幕不允許漏字（tests/guide-content.test.ts 因此失敗，修法是補 guideLabels 再跑 GUIDE_MEDIA=write）。
 */
export function buildVtt(video: Pick<GuideVideoEntry, "id" | "cues">, cueTexts: Readonly<Record<string, string>>): string {
  const missing = video.cues.filter(cue => !(typeof cueTexts[cue.key] === "string" && cueTexts[cue.key].trim() !== "")).map(cue => `guide.videos.${video.id}.cues.${cue.key}`);
  if (missing.length) throw new Error(`字幕缺文字：${missing.join("、")}`);
  const blocks = video.cues.map(cue => {
    if (!(cue.endMs > cue.startMs)) throw new Error(`${video.id}.${cue.key}：endMs（${cue.endMs}）要大於 startMs（${cue.startMs}）`);
    return `${cue.key}\n${vttTimestamp(cue.startMs)} --> ${vttTimestamp(cue.endMs)}\n${escapeCueText(cueTexts[cue.key])}`;
  });
  return `WEBVTT\n\n${blocks.join("\n\n")}\n`;
}

/** 字幕檔的 cue 數（「-->」時間行的數目）。 */
export const vttCueCount = (vtt: string) => vtt.split("\n").filter(line => line.includes(" --> ")).length;

// ── MP4 檔頭（不加依賴：用 Node Buffer 讀 ISO BMFF 的 box）──────────────────────────────

interface Mp4Box {
  type: string;
  start: number;
  end: number;
}
/** buffer[start, end) 之間依序排列的 box（size＝1 時讀 64 位元 largesize，size＝0 到結尾）。 */
function mp4Boxes(buffer: Buffer, start: number, end: number): Mp4Box[] {
  const result: Mp4Box[] = [];
  let offset = start;
  while (offset + 8 <= end) {
    let size = buffer.readUInt32BE(offset);
    const type = buffer.toString("latin1", offset + 4, offset + 8);
    let header = 8;
    if (size === 1) { size = Number(buffer.readBigUInt64BE(offset + 8)); header = 16; }
    else if (size === 0) size = end - offset;
    if (size < header || offset + size > end) throw new Error(`MP4 的 ${type} box 大小不對（${size}）`);
    result.push({ type, start: offset + header, end: offset + size });
    offset += size;
  }
  return result;
}
const childBox = (buffer: Buffer, parent: Mp4Box, type: string) => mp4Boxes(buffer, parent.start, parent.end).find(box => box.type === type);

export interface Mp4Info {
  /** 頂層 box 的順序（+faststart 時 moov 在 mdat 之前）。 */
  topLevel: string[];
  /** mvhd 的 duration／timescale，換成毫秒（四捨五入）。 */
  durationMs: number;
  /** 第一條有畫面的軌（tkhd 寬高 16.16 定點數）。 */
  width: number;
  height: number;
  /** 每條軌的 hdlr handler_type（vide、soun…）。 */
  handlers: string[];
  /** moov 裡有 H.264 的 sample entry（avc1）。 */
  h264: boolean;
}

/** 讀 MP4 的 moov：影片長度（mvhd）、畫面寬高（tkhd）、各軌類型（hdlr）。不是 MP4 或缺 box 時丟錯。 */
export function mp4Info(buffer: Buffer): Mp4Info {
  const top = mp4Boxes(buffer, 0, buffer.length);
  const moov = top.find(box => box.type === "moov");
  if (!moov) throw new Error("MP4 沒有 moov box");
  const mvhd = childBox(buffer, moov, "mvhd");
  if (!mvhd) throw new Error("MP4 沒有 mvhd box");
  const version = buffer.readUInt8(mvhd.start);
  const timescale = version === 1 ? buffer.readUInt32BE(mvhd.start + 20) : buffer.readUInt32BE(mvhd.start + 12);
  const duration = version === 1 ? Number(buffer.readBigUInt64BE(mvhd.start + 24)) : buffer.readUInt32BE(mvhd.start + 16);
  let width = 0;
  let height = 0;
  const handlers: string[] = [];
  for (const trak of mp4Boxes(buffer, moov.start, moov.end).filter(box => box.type === "trak")) {
    const tkhd = childBox(buffer, trak, "tkhd");
    if (tkhd && width === 0) {
      // tkhd：version＋flags 4、時間欄位（v0 20／v1 32）、reserved 8、layer／alternate_group／volume／reserved 8、matrix 36，之後是寬、高（16.16）。
      const base = tkhd.start + 4 + (buffer.readUInt8(tkhd.start) === 1 ? 32 : 20) + 8 + 8 + 36;
      width = buffer.readUInt32BE(base) / 65536;
      height = buffer.readUInt32BE(base + 4) / 65536;
    }
    const mdia = childBox(buffer, trak, "mdia");
    const hdlr = mdia && childBox(buffer, mdia, "hdlr");
    if (hdlr) handlers.push(buffer.toString("latin1", hdlr.start + 8, hdlr.start + 12));
  }
  return { topLevel: top.map(box => box.type), durationMs: Math.round((duration / timescale) * 1000), width, height, handlers, h264: buffer.subarray(moov.start, moov.end).includes("avc1", 0, "latin1") };
}
