// V41-1（D-V41-4＝A、D-V41-19＝A；docs/revamp-v4.1/01_PRD.md §3.1、§3.3、§3.4）：說明頁（/guide、/guide/{area}）的結構資料與 {ui:路徑} 解析。
// 純資料＋純函式，不含使用者看得到的文字（文字在 src/i18n/guide.zh-TW.ts 的 guideLabels）。只給伺服器模組與 src/app/sitemap.ts import；
// 任何 "use client" 模組都不 import 這個檔（tests/guide-routes.test.tsx 斷言）。
// 不 import 任何模組（沒有 @/ 路徑別名、沒有省略副檔名的相對匯入）：scripts/*.mjs 可以直接用 Node 載入；resolveUiRefs 由呼叫端傳入 labels。

/** 11 個功能區的代號（＝網址片段 /guide/{area}），依說明首頁目錄的順序（D-V41-19；PRD §3.3 表）。 */
export const GUIDE_AREA_CODES = ["start", "import", "overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data", "evidence", "export"] as const;
export type GuideAreaCode = (typeof GUIDE_AREA_CODES)[number];

/** 功能區目錄的分組順序：開始使用、側欄四組（看結果、找原因、做決定、管資料）、跨頁工具（GUIDE_CONTENT §1.6）。 */
export const GUIDE_GROUPS = ["start", "results", "causes", "decisions", "data", "tools"] as const;
export type GuideGroup = (typeof GUIDE_GROUPS)[number];

/** 每個功能區所在的分組。 */
export const GUIDE_AREA_GROUP: Readonly<Record<GuideAreaCode, GuideGroup>> = {
  start: "start",
  import: "start",
  overview: "results",
  diagnosis: "causes",
  products: "causes",
  scenarios: "decisions",
  actions: "decisions",
  meeting: "decisions",
  data: "data",
  evidence: "tools",
  export: "tools",
};

/** 功能區頁的一個步驟：key＝guideLabels.guide.areas.{area}.steps.{key}，mediaId＝src/application/guide-media.json 的截圖代號（V41-2a 起）。 */
export interface GuideStep {
  key: string;
  mediaId: string;
}
/** 已上線的功能區頁。 */
export interface GuideArea {
  area: GuideAreaCode;
  steps: readonly GuideStep[];
}

/**
 * V41-2a 錨點：各功能區規劃好的步驟（GUIDE_CONTENT.md §2；key＝guideLabels.guide.areas.{area}.steps.{key}，mediaId＝src/application/guide-media.json 的截圖代號，
 * 檔名 public/guide/{area}/{mediaId}.webp、基準 verification/guide-media/baseline/{mediaId}.png；-m 結尾是手機 390×844）。
 * 截圖管線（verification/guide-media/capture.spec.ts）依這裡擷取；頁面上線與否看 GUIDE_PUBLISHED_AREAS。V41-2b 加其餘 6 個功能區（11 區 44 步）。
 */
export const GUIDE_AREA_STEPS: Readonly<Partial<Record<GuideAreaCode, readonly GuideStep[]>>> = {
  start: [{ key: "load", mediaId: "start-load" }, { key: "nav", mediaId: "start-nav" }, { key: "period", mediaId: "start-period" }, { key: "mobile", mediaId: "start-mobile-m" }],
  import: [{ key: "files", mediaId: "import-files" }, { key: "mapping", mediaId: "import-mapping" }, { key: "basis", mediaId: "import-basis" }, { key: "review", mediaId: "import-review" }, { key: "issues", mediaId: "import-issues" }],
  overview: [{ key: "snapshot", mediaId: "overview-snapshot" }, { key: "top-three", mediaId: "overview-top-three" }, { key: "bridge", mediaId: "overview-bridge" }, { key: "trend", mediaId: "overview-trend" }, { key: "bridge-mobile", mediaId: "overview-bridge-m" }],
  diagnosis: [{ key: "list", mediaId: "diagnosis-list" }, { key: "add-action", mediaId: "diagnosis-add-action" }, { key: "share", mediaId: "diagnosis-share" }, { key: "heat", mediaId: "diagnosis-heat" }],
  products: [{ key: "variance", mediaId: "products-variance" }, { key: "table", mediaId: "products-table" }, { key: "pareto", mediaId: "products-pareto" }],
  // ── V41-2b 錨點：後 6 個功能區（GUIDE_CONTENT §2.6–2.11，23 步）；頁面上線時由 V41-2b 加進 GUIDE_PUBLISHED_AREAS。
  scenarios: [{ key: "setup", mediaId: "scenarios-setup" }, { key: "inputs", mediaId: "scenarios-inputs" }, { key: "compare", mediaId: "scenarios-compare" }, { key: "threshold", mediaId: "scenarios-threshold" }],
  actions: [{ key: "board", mediaId: "actions-board" }, { key: "edit", mediaId: "actions-edit" }, { key: "pin", mediaId: "actions-pin" }],
  meeting: [{ key: "agenda", mediaId: "meeting-agenda" }, { key: "decision", mediaId: "meeting-decision" }, { key: "present", mediaId: "meeting-present" }, { key: "finalize", mediaId: "meeting-finalize" }, { key: "copy", mediaId: "meeting-copy" }],
  data: [{ key: "scope", mediaId: "data-scope" }, { key: "coverage", mediaId: "data-coverage" }, { key: "issues", mediaId: "data-issues" }, { key: "preview", mediaId: "data-preview" }],
  evidence: [{ key: "drawer", mediaId: "evidence-drawer" }, { key: "sources", mediaId: "evidence-sources" }, { key: "basis", mediaId: "evidence-basis" }],
  export: [{ key: "export", mediaId: "export-menu" }, { key: "save", mediaId: "export-save" }, { key: "backup", mediaId: "export-backup" }, { key: "delete", mediaId: "export-delete" }],
};

/** 已上線（有 /guide/{area} 頁面）的功能區，依 GUIDE_AREA_CODES 的順序。V41-1 是空的；V41-2a 加 start、import、overview、diagnosis、products；V41-2b 加其餘 6 個（11 區全部上線）。 */
export const GUIDE_PUBLISHED_AREAS: readonly GuideAreaCode[] = ["start", "import", "overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data", "evidence", "export"];

/**
 * 已有頁面的功能區（generateStaticParams、sitemap、說明首頁目錄都從這裡產生）。V41-1 是空陣列；V41-2a 加 start、import、overview、diagnosis、products，V41-2b 加其餘 6 個。
 * 不在這裡的功能區，說明首頁只顯示標題文字、不放連結（不產生 404 的連結）。
 */
export const GUIDE_AREAS: readonly GuideArea[] = GUIDE_PUBLISHED_AREAS.map(area => ({ area, steps: GUIDE_AREA_STEPS[area] ?? [] }));

/** 功能區頁的路徑。 */
export const guideAreaPath = (area: GuideAreaCode): string => `/guide/${area}`;

/** 功能區頁的連結；頁面還沒上線（不在 GUIDE_AREAS）時回傳 null，呼叫端改顯示純文字。hash 是頁內錨點（例如 overview 的 bridge）。 */
export function guideAreaHref(area: GuideAreaCode, hash?: string): string | null {
  if (!GUIDE_AREAS.some(entry => entry.area === area)) return null;
  return hash ? `${guideAreaPath(area)}#${hash}` : guideAreaPath(area);
}

/** 說明首頁的段落（頁內錨點 id，依閱讀順序）；areas 只在 GUIDE_AREAS 不是空的時候出現。 */
export const GUIDE_HUB_SECTIONS = ["why", "who", "unique", "quickstart", "areas"] as const;
export type GuideHubSection = (typeof GUIDE_HUB_SECTIONS)[number];

/** 「這套服務幫哪些人解決哪些問題？」三種角色與「從哪裡開始」的功能區（GUIDE_CONTENT §1.3）。 */
export const GUIDE_WHO = [
  { role: "boss", start: ["overview", "meeting"] },
  { role: "manager", start: ["diagnosis", "products", "scenarios", "actions"] },
  { role: "operator", start: ["import", "data"] },
] as const satisfies readonly { role: string; start: readonly GuideAreaCode[] }[];
export type GuideWhoRole = (typeof GUIDE_WHO)[number]["role"];

/** 「這套服務有什麼獨特性？」7 項做法與「在哪裡看得到」的功能區（GUIDE_CONTENT §1.4；bridge 連到總覽頁的 #bridge）。 */
export const GUIDE_UNIQUE = [
  { key: "evidence", area: "evidence" },
  { key: "bridge", area: "overview", hash: "bridge" },
  { key: "rules", area: "diagnosis" },
  { key: "scenarios", area: "scenarios" },
  { key: "meeting", area: "meeting" },
  { key: "local", area: "export" },
  { key: "taiwan", area: "import" },
] as const satisfies readonly { key: string; area: GuideAreaCode; hash?: string }[];
export type GuideUniqueKey = (typeof GUIDE_UNIQUE)[number]["key"];

/** 「30 秒上手」4 步的連結：第 1 步是工作台（/，同分頁），其餘連到功能區頁（GUIDE_CONTENT §1.5）。 */
export const GUIDE_QUICKSTART = [
  { key: "step1", href: "/" },
  { key: "step2", area: "overview" },
  { key: "step3", area: "evidence" },
  { key: "step4", area: "import" },
] as const satisfies readonly ({ key: string; href: string } | { key: string; area: GuideAreaCode })[];
export type GuideQuickstartKey = (typeof GUIDE_QUICKSTART)[number]["key"];

/** {ui:路徑}：說明文字引用 labels.zh-TW.ts 既有介面字串的寫法（與 scripts/lib/copy-scan.mjs 的 UI_REF_RE 同一種）。 */
export const UI_REF_PATTERN = /\{ui:([\w.]+)\}/g;

/** 一段說明文字切成「一般文字」與「引用的介面字串」；ui 為 true 的段落是 labels 的原字串（步驟內文渲染成粗體）。 */
export interface UiRefPart {
  text: string;
  ui: boolean;
}

/** 依點分路徑取 labels 的字串；路徑不存在或不是字串時丟錯（說明頁不允許漏字，build 與 tests/guide-content.test.ts 都會失敗）。 */
export function lookupUiRef(path: string, labels: unknown): string {
  let node: unknown = labels;
  for (const key of path.split(".")) {
    if (node === null || typeof node !== "object" || !Object.hasOwn(node, key)) throw new Error(`{ui:${path}} 在 labels 裡找不到`);
    node = (node as Record<string, unknown>)[key];
  }
  if (typeof node !== "string") throw new Error(`{ui:${path}} 不是字串`);
  return node;
}

/** 把 {ui:路徑} 換成 labels 字串，回傳切好的段落（空字串段落不回傳）。 */
export function uiRefParts(text: string, labels: unknown): UiRefPart[] {
  const parts: UiRefPart[] = [];
  let last = 0;
  for (const match of text.matchAll(UI_REF_PATTERN)) {
    if (match.index > last) parts.push({ text: text.slice(last, match.index), ui: false });
    parts.push({ text: lookupUiRef(match[1], labels), ui: true });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push({ text: text.slice(last), ui: false });
  return parts;
}

/** 把 {ui:路徑} 全部換成 labels 字串（純文字；用於標題、alt、metadata 等不能有標記的地方）。路徑不存在或不是字串時丟錯。 */
export function resolveUiRefs(text: string, labels: unknown): string {
  return uiRefParts(text, labels).map(part => part.text).join("");
}

// ── V41-2a 錨點：功能區頁（/guide/{area}）的資料——截圖的資料來源註記、「開始前」的文件連結、「要注意」的功能區連結、「下一步」（GUIDE_CONTENT.md §0、§2.1–2.5）。

/** 截圖的資料來源註記（圖說後另起一行）：none＝不加（S0 首頁空狀態）、demo＝guide.common.demoCaption（S1、S6–S8）、synthetic＝guide.common.syntheticCaption（S3、S4、S5；D-V41-21＝A：含稅換算、缺列與資料問題、商品毛利為負都用 repo 內既有的合成檔，圖說註明「虛構的合成資料」）。 */
export type GuideDataNote = "none" | "demo" | "synthetic";
/**
 * 不是 demo 的截圖（mediaId → 註記）；沒列在這裡的都是 demo。start-load 是 S0；import-files／mapping／basis／review 是 S3（tests/fixtures/inclusive_tax）；import-issues 是 S4（fixtures/errors/missing_ad_day）；
 * products-pareto 是 S5（tests/fixtures/synthetic-4-channel）。V41-2b：data-coverage、data-issues 是 S4；其餘 21 張（S1、S6–S8）是 demo。
 */
export const GUIDE_MEDIA_DATA_NOTE: Readonly<Record<string, GuideDataNote>> = { "start-load": "none", "import-files": "synthetic", "import-mapping": "synthetic", "import-basis": "synthetic", "import-review": "synthetic", "import-issues": "synthetic", "products-pareto": "synthetic", "data-coverage": "synthetic", "data-issues": "synthetic" };
/** 一張截圖的資料來源註記。 */
export const guideDataNote = (mediaId: string): GuideDataNote => Object.hasOwn(GUIDE_MEDIA_DATA_NOTE, mediaId) ? GUIDE_MEDIA_DATA_NOTE[mediaId] : "demo";

/** 「開始前」後附的文件連結（同網域、同分頁）：匯入資料頁連到訂單明細整理成每日資料的說明（public/docs/ORDER_AGGREGATION.md，與匯入精靈的 ORDER_AGGREGATION_DOC_URL 相同）。連結文字是 guide.areas.{area}.beforeLink。 */
export const GUIDE_AREA_BEFORE_LINKS: Readonly<Partial<Record<GuideAreaCode, string>>> = { import: "/docs/ORDER_AGGREGATION.md" };

/** 連到一個功能區頁（hash 是該頁的步驟錨點，例如 diagnosis 的 add-action）。 */
export interface GuideAreaLink {
  area: GuideAreaCode;
  hash?: string;
}

/** 「要注意」第 note 點（guide.areas.{area}.notes 的索引）後附的功能區連結（GUIDE_CONTENT 的「（連到 …）」；V41-2b 起也含要注意裡點名的其他功能區）；同一點可以有多個，依序列在「相關說明：」之後。 */
export const GUIDE_AREA_NOTE_LINKS: Readonly<Partial<Record<GuideAreaCode, readonly ({ note: number } & GuideAreaLink)[]>>> = {
  start: [{ note: 0, area: "export" }],
  overview: [{ note: 0, area: "evidence" }],
  actions: [{ note: 0, area: "diagnosis", hash: "add-action" }, { note: 0, area: "meeting", hash: "decision" }],
};

/** V41-2b：「開始前」要先到其他功能區做的事（S7：試算並選入會議、把健檢結果加入待辦），在開始前那一行後面列出「相關說明：」連結。 */
export const GUIDE_AREA_BEFORE_AREAS: Readonly<Partial<Record<GuideAreaCode, readonly GuideAreaLink[]>>> = {
  actions: [{ area: "diagnosis", hash: "add-action" }],
  meeting: [{ area: "scenarios" }, { area: "diagnosis", hash: "add-action" }],
  export: [{ area: "scenarios" }, { area: "diagnosis", hash: "add-action" }],
};

/** 「下一步」的功能區（最多 2 個，GUIDE_CONTENT 各區的「下一步」）；最後另加「開啟工作台」。功能區頁還沒上線時只顯示標題文字、不放連結。 */
export const GUIDE_AREA_NEXT: Readonly<Partial<Record<GuideAreaCode, readonly GuideAreaCode[]>>> = {
  start: ["overview", "import"],
  import: ["data", "overview"],
  overview: ["diagnosis", "evidence"],
  diagnosis: ["actions", "products"],
  products: ["scenarios", "overview"],
  // V41-2b（GUIDE_CONTENT §2.6–2.11 的「下一步」）。
  scenarios: ["meeting", "actions"],
  actions: ["meeting"],
  meeting: ["export", "actions"],
  data: ["import", "evidence"],
  evidence: ["overview", "data"],
  export: ["meeting", "start"],
};

/** src/application/guide-media.json 的一張媒體（只記內容欄位；PRD §3.5）：file 是 public/ 之下的路徑（guide/{area}/{mediaId}.webp），sha256 是基準 PNG 的雜湊。 */
export interface GuideMediaEntry {
  id: string;
  file: string;
  width: number;
  height: number;
  bytes: number;
  sha256: string;
  labels_hash: string;
}
/** 媒體清單：updated 是最後一次實際更新媒體的日期（YYYY-MM-DD，台北），還沒有媒體時是 null。 */
export interface GuideMediaManifest {
  updated: string | null;
  media: readonly GuideMediaEntry[];
}
