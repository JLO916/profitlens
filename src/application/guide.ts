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
 * 已有頁面的功能區（generateStaticParams、sitemap、說明首頁目錄都從這裡產生）。V41-1 是空陣列；V41-2a 加 start、import、overview、diagnosis、products，V41-2b 加其餘 6 個。
 * 不在這裡的功能區，說明首頁只顯示標題文字、不放連結（不產生 404 的連結）。
 */
export const GUIDE_AREAS: readonly GuideArea[] = [];

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
