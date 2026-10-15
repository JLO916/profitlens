// V41-3（D-V41-6＝A、D-V41-7＝A、D-V41-8；docs/revamp-v4.1/01_PRD.md §3.3 第 7 項、§3.5「影片」「字幕與逐字稿」、§3.6、§3.7；GUIDE_CONTENT.md §3）：說明頁的示範影片。
// 伺服器元件（不加 "use client"）。<figure>（testid guide-video-{id}）：圖說（guide.videos.{id}.title）→ <video>（原生 controls、preload="none"、playsInline、poster；
// 不自動播放、不循環、沒有靜音自動播放）內一個 MP4 <source> 與一條預設開啟的中文字幕 <track kind="captions">（axe video-caption）→ 一行 guide.common.videoNote →
// <ol> 逐字稿（與字幕檔同一組 cue 文字，{ui:…} 換成純文字；WCAG 1.2.1 純影像的替代）。檔案都在自家網域 public/guide/video/（不嵌第三方平台）。
// 影片、字幕檔與 poster 由媒體管線產生（verification/guide-media/），寫進 src/application/guide-media.json 的 videos；清單沒有這支影片時不渲染（只有文字）。
// <video> 的寬高取自清單，並以同一組寬高設 aspect-ratio：poster 或影片載入前後外框高度不變（沒有版面位移）。
import guideMedia from "@/application/guide-media.json";
import { GUIDE_VIDEOS, type GuideVideo as GuideVideoData, type GuideVideoPage } from "@/application/guide";
import { guideLabels } from "@/i18n/guide.zh-TW";
import { guideText } from "./guide-text";

/** 媒體清單 videos 的一段 cue：時間點（毫秒）與該 cue 擷取的基準 PNG 的 SHA-256（verification/guide-media/baseline/video/{id}-{key}.png）。 */
export interface GuideVideoCueEntry {
  key: string;
  startMs: number;
  endMs: number;
  sha256: string;
}
/** 媒體清單 videos 的一支影片（只記內容欄位）：file、vtt、poster 是 public/ 之下的路徑（guide/video/{id}.mp4、.vtt、-poster.webp）。 */
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
  cues: readonly GuideVideoCueEntry[];
  labels_hash: string;
}

/** 媒體清單的 videos；還沒有影片時清單沒有這一欄，回傳空陣列。 */
export function manifestVideos(manifest: unknown): readonly GuideVideoEntry[] {
  const videos = manifest !== null && typeof manifest === "object" ? (manifest as { videos?: unknown }).videos : undefined;
  return Array.isArray(videos) ? videos as GuideVideoEntry[] : [];
}

const MANIFEST_VIDEOS = manifestVideos(guideMedia);

/** 放在某一頁的影片（GUIDE_VIDEOS 的順序；hub＝說明首頁「30 秒上手」，其餘是功能區頁），只留清單裡有的。 */
export function guideVideosFor(page: GuideVideoPage, entries: readonly GuideVideoEntry[]): { video: GuideVideoData; entry: GuideVideoEntry }[] {
  return GUIDE_VIDEOS.filter(video => video.pages.includes(page)).flatMap(video => {
    const entry = entries.find(item => item.id === video.id);
    return entry ? [{ video, entry }] : [];
  });
}

/** 一支影片的文字（guide.videos.{id}）；少了標題或任何一個 cue 就丟錯（build 失敗，不上線缺字幕的影片）。 */
interface GuideVideoCopy {
  title: string;
  cues: Readonly<Record<string, string>>;
}
function videoCopy(video: GuideVideoData): GuideVideoCopy {
  const copy = (guideLabels.guide.videos as Readonly<Record<string, GuideVideoCopy | undefined>>)[video.id];
  if (!copy) throw new Error(`guide.videos.${video.id}: missing`);
  const missing = video.cues.filter(cue => !Object.hasOwn(copy.cues, cue.key)).map(cue => cue.key);
  if (missing.length) throw new Error(`guide.videos.${video.id}.cues: missing ${missing.join(", ")}`);
  return copy;
}

const common = guideLabels.guide.common;

export function GuideVideo({ video, entry }: { video: GuideVideoData; entry: GuideVideoEntry }) {
  const copy = videoCopy(video);
  const title = guideText(copy.title);
  return <figure className="guide-video" data-testid={`guide-video-${video.id}`}>
    <figcaption>{title}</figcaption>
    <video controls preload="none" playsInline poster={`/${entry.poster}`} width={entry.width} height={entry.height} style={{ aspectRatio: `${entry.width} / ${entry.height}` }} aria-label={title}>
      <source src={`/${entry.file}`} type="video/mp4" />
      <track kind="captions" srcLang="zh-Hant-TW" label={guideText(common.captionsLabel)} src={`/${entry.vtt}`} default />
    </video>
    <p className="guide-video-note">{guideText(common.videoNote)}</p>
    <ol className="guide-video-transcript">
      {video.cues.map(cue => <li key={cue.key}>{guideText(copy.cues[cue.key])}</li>)}
    </ol>
  </figure>;
}

/** 某一頁的全部影片（清單裡沒有的不渲染；一支都沒有時什麼都不輸出）。entries 預設是 src/application/guide-media.json 的 videos。 */
export function GuideVideos({ page, entries = MANIFEST_VIDEOS }: { page: GuideVideoPage; entries?: readonly GuideVideoEntry[] }) {
  return guideVideosFor(page, entries).map(({ video, entry }) => <GuideVideo key={video.id} video={video} entry={entry} />);
}
