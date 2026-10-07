import type { Metric } from "../domain/types";
import type { ExportVariant } from "./export-variants";
import { fill, labels } from "../i18n";
import { MAX_PINNED_ACTIONS, type ActionWorkspace } from "./action-workspace";
import { channelLabel, channelsLabel, demoAlias, ruleCopy } from "./copy";
import { downloadBinary } from "./download";
import { buildExportHeader } from "./export-header";
import { EXPORT_THEME } from "./export-theme";
import type { ManagerSummary } from "./manager-summary";
import { formatAmount, formatPeriodExport, formatSignedDelta, metricDefinitions, MINUS, type Layer } from "./presentation";
import type { WorkspaceSnapshot } from "./workspace";

// R6-5 PPT 一頁式（docs/revamp/05_FEATURES.md §11、06_BATCHES.md R6-5；D4＝A：pptxgenjs 4.0.1）。
// 只做呈現：金額全部來自 ManagerSummary（src/domain 的結果），這裡只格式化成字串；不新增財務指標。
// pptxgenjs 以動態 import 載入（不進首屏 bundle）；不用任何圖片 API（其 image-size 依賴有 DoS 漏洞）。

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
export const PPTX_FILENAME = "profitlens-onepager.pptx";
/** 三件事最多幾列。 */
export const PPTX_MAX_PRIORITIES = 3;
/** 通路表在一頁內最多畫幾列；放不下（或超過）時改畫放得下的前幾列並加一行「另有 n 個通路」（見 pptxChannelRows）。 */
export const PPTX_MAX_CHANNEL_ROWS = 4;
/**
 * 各欄位截斷長度（以字元計，含結尾「…」），確保一頁放得下且版面固定（10pt 中文約 6.5 字／英吋）。
 * 金額上限（24）大於任何 L1（萬／億）或 L2（整數元）金額字串的長度，金額字串實際上不會被截斷。
 */
export const PPTX_TEXT_LIMITS = {
  title: 36, subtitle: 120, header: 100, keyLabel: 12, money: 24, headline: 40, impact: 24, nextStep: 40, channel: 16,
  decision: 60, problem: 26, owner: 10, deadline: 12, status: 16, footer: 70, technical: 60,
} as const;

export interface PptxMeetingInput { name: string; date: string; decision: string; notes: string }
export interface PptxOnePagerInput {
  /** V3-9b 開工錨點（F14）：匯出範本變體；B 代理實作版面差異，預設 standard。 */
  variant?: ExportVariant;
  summary: ManagerSummary; snapshot: WorkspaceSnapshot; actions: ActionWorkspace; meeting?: PptxMeetingInput | null;
  /** V3-7 版頭的產出時間（預設現在；測試注入固定時間）。 */
  generatedAt?: Date;
  /** V3-7 版頭第 1 行；預設 dataset_id。 */
  datasetName?: string;
}
export interface PptxOnePager {
  /** 沒有會議：版頭第 2 行（報表名）；有會議：會議名稱（日期）。28pt，放不下時縮小。 */
  title: string;
  /** V3-7 §7.9 版頭的副標（最多三行，10pt）：沒有會議是第 1／3／4 行；有會議時第 1、2 行併成一行。 */
  header: string[];
  /** 資料到、兩期期間與天數、通路：寫進檔案屬性（主旨），不畫在投影片上（版頭已有兩期與單位）。 */
  subtitle: string;
  /** 兩個：淨營收、扣廣告後貢獻（已格式化） */
  key_deltas: { label: string; previous: string; current: string; change: string }[];
  /** ≤ 3 */
  priorities: { headline: string; impact: string; next_step: string }[];
  /** 扣廣告後貢獻（全部通路；畫面最多 PPTX_MAX_CHANNEL_ROWS 列） */
  channels: { channel: string; previous: string; current: string; change: string }[];
  /** 決議狀態＋備註；沒有會議時用 labels.pptxExport.noMeeting */
  decision: string;
  /** ≤ 3 */
  pinned_actions: { problem: string; owner: string; deadline: string; status: string }[];
  /** labels.basis.footer（有含稅換算時加上換算一句） */
  footer: string;
  /** 資料版本（可追溯性；小字）。指標版本已在版頭第 4 行。 */
  technical: string;
}

/** XML 1.0 不允許的控制字元與落單的代理字元，以及會反轉顯示順序的 bidi 控制字元。 */
const UNSAFE_TEXT = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\uFFFE\uFFFF\u202A-\u202E\u2066-\u2069]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;
/**
 * 不可信文字 → 投影片純文字：移除 XML 不合法字元與 bidi 控制字元、換行與連續空白收成一個空白、超過 max 個字元截斷並補「…」。
 * XML 跳脫（& < > " '）由 pptxgenjs 寫出時處理，這裡不重複跳脫。
 */
export function pptxText(value: unknown, max: number = PPTX_TEXT_LIMITS.footer): string {
  const text = (typeof value === "string" ? value : value === null || value === undefined ? "" : String(value)).replace(UNSAFE_TEXT, "").replace(/\s+/g, " ").trim();
  const characters = Array.from(text);
  const limit = Math.max(1, Math.floor(max));
  return characters.length > limit ? `${characters.slice(0, limit - 1).join("")}${labels.pptxExport.ellipsis}` : text;
}

/**
 * V3-2b §3.3：PPT 一頁式只有 L1＋L2。關鍵差額卡與三件事的影響金額用 L1（萬／億、一位小數；同一張卡只用一種尺度），
 * 通路表用 L2 整數元（單位寫在表格標題「（元）」）。負號 U+2212，正的差額加「+」。
 */
const money = (metric: Metric | null | undefined, layer: Layer, signed = false): string =>
  !metric || metric.value === null ? labels.status.missing : signed ? formatSignedDelta(metric.value, layer) : formatAmount(metric.value, layer);

/** 會議決議：接受狀態代碼（labels.meeting.decisions 與 review-session 的舊代碼）或已翻好的文字；未知值原樣顯示。 */
const DECISION_LABELS: Record<string, string> = { ...labels.meeting.decisions, needs_data: labels.meeting.decisions.need_data, not_adopted: labels.meeting.decisions.rejected };
function decisionLabel(value: string): string {
  const key = pptxText(value, PPTX_TEXT_LIMITS.decision);
  return Object.hasOwn(DECISION_LABELS, key) ? DECISION_LABELS[key] : key || labels.meeting.decisions.draft;
}
const EXECUTION_LABELS: Record<string, string> = { not_started: labels.actions.statuses.not_started, in_progress: labels.actions.statuses.in_progress, blocked: labels.actions.statuses.blocked, completed: labels.actions.statuses.done };

/** 純資料層：ManagerSummary＋快照＋待辦（＋會議）→ 一頁式的字串模型。summary 與 snapshot 必須是同一份資料與範圍。 */
export function buildPptxOnePager(input: PptxOnePagerInput): PptxOnePager {
  const { summary, snapshot, actions, meeting } = input;
  if (snapshot.dataset_hash !== summary.dataset_hash || snapshot.filter_hash !== summary.filter_hash) throw new Error("PPTX_SOURCE_MISMATCH");
  const copy = labels.pptxExport;
  const limit = PPTX_TEXT_LIMITS;
  const alias = demoAlias(summary.dataset_id);
  const name = meeting ? pptxText(meeting.name, limit.title) : "";
  const date = meeting ? pptxText(meeting.date, limit.deadline) : "";
  // V3-7 §7.9：版頭四行。標題用第 2 行（有會議時用會議名稱），其餘放副標（最多三行）。
  const exportHeader = buildExportHeader({
    datasetName: input.datasetName ?? summary.dataset_id, metricVersion: summary.metric_version, generatedAt: input.generatedAt ?? new Date(), amountBasis: summary.conversion_note ? "inclusive" : "exclusive",
    scope: { previous: summary.scope.previous_period, current: summary.scope.current_period, previousDays: summary.previous_days, currentDays: summary.current_days },
  });
  const title = name ? pptxText(date ? fill(copy.titleMeeting, { name, date }) : name, limit.title) : pptxText(exportHeader.title, limit.title);
  const [datasetLine, titleLine, periodLine, versionLine] = exportHeader.lines;
  const header = (name ? [`${datasetLine}${copy.separator}${titleLine}`, periodLine, versionLine] : [datasetLine, periodLine, versionLine]).map(line => fitLine(pptxText(line, limit.header), HEADER_LINE_CAPACITY));
  const subtitle = pptxText(fill(copy.subtitle, {
    // 版頭的期間用匯出格式「2026-07-13 至 2026-08-23（42 天）」（§8.6）。
    asOf: summary.data_as_of, previous: formatPeriodExport(summary.scope.previous_period.start, summary.scope.previous_period.end),
    current: formatPeriodExport(summary.scope.current_period.start, summary.scope.current_period.end), channels: channelsLabel(summary.scope.channels, alias),
  }), limit.subtitle);
  const key_deltas = summary.headlines.map(row => ({ label: metricDefinitions[row.metric].label, previous: money(row.previous, "L1"), current: money(row.current, "L1"), change: money(row.change, "L1", true) }));
  const priorities = summary.priorities.slice(0, PPTX_MAX_PRIORITIES).map(item => {
    const rule = ruleCopy(snapshot, item.primary, alias);
    return { headline: pptxText(rule.headline, limit.headline), impact: money(item.impact ?? item.ranking_amount, "L1", true), next_step: pptxText(rule.nextStep, limit.nextStep) };
  });
  const channels = summary.channels.map(row => ({ channel: pptxText(channelLabel(row.channel, alias), limit.channel), previous: money(row.contribution.previous, "L2"), current: money(row.contribution.current, "L2"), change: money(row.contribution.change, "L2", true) }));
  const notes = meeting ? pptxText(meeting.notes, limit.decision) : "";
  const decision = meeting ? pptxText([fill(copy.decision, { decision: decisionLabel(meeting.decision) }), notes ? fill(copy.decisionNotes, { notes }) : ""].filter(Boolean).join(copy.separator), limit.decision) : copy.noMeeting;
  const pinned_actions = actions.items.filter(item => item.pinned).slice(0, MAX_PINNED_ACTIONS).map(item => {
    const context = actions.contexts.find(entry => entry.id === item.context_id);
    const historical = !context || context.session.dataset_hash !== snapshot.dataset_hash;
    const execution = item.execution_status && Object.hasOwn(EXECUTION_LABELS, item.execution_status) ? EXECUTION_LABELS[item.execution_status] : EXECUTION_LABELS.not_started;
    return {
      problem: pptxText(item.card.problem, limit.problem) || labels.actionBoard.untitled,
      owner: pptxText(item.card.owner_role, limit.owner) || labels.actionBoard.unassigned,
      deadline: pptxText(item.card.deadline, limit.deadline) || labels.actionBoard.noDeadline,
      status: historical ? fill(copy.statusHistorical, { status: execution, badge: labels.actions.staleBadge }) : execution,
    };
  });
  const footer = pptxText(summary.conversion_note ? `${labels.basis.footer} ${summary.conversion_note}` : labels.basis.footer, limit.footer);
  const technical = pptxText(fill(labels.exports.headerV3.pptxDataVersion, { datasetHash: summary.dataset_hash.slice(0, 12) }), limit.technical);
  return { title, header, subtitle, key_deltas, priorities, channels, decision, pinned_actions, footer, technical };
}

// 版面（英吋；LAYOUT_16x9 = 10 × 5.625）。字級一律 ≥ 10pt。V3-7 §9.6：背景白、不放裝飾圖形；強調色只用在本期資料與 4pt 頂線；
// 不利差額用 #b03a2e，有利不上色（D-V3-7）；顏色全部取自 export-theme（與 globals.css :root 一一對應）。
// 版頭：4pt 頂線 → 標題（28pt）→ 副標最多三行（10pt）。左欄：兩個關鍵差額（36pt）→ 本期三件事；右欄：通路表 → 決議 → 置頂待辦；頁尾：口徑一句＋資料版本。
// 單位注意（pptxgenjs 4）：文字方塊 margin 是 pt；表格儲存格 margin 小於 1 時是英吋。
/** 中文用微軟正黑體（PPT 內建；pptxgenjs 對同一段文字的 latin／ea 寫同一個字型）；純數字的表格金額用 Arial。 */
const FONT = "Microsoft JhengHei";
const NUMBER_FONT = "Arial";
const COLOR = EXPORT_THEME;
const LEFT = { x: 0.4, w: 4.4 } as const, RIGHT = { x: 5.0, w: 4.6 } as const, FULL = { x: 0.4, w: 9.2 } as const;
const ROW_H = 0.24;
const CELL_MARGIN: [number, number, number, number] = [0.02, 0.06, 0.02, 0.06];
/** 金額欄 1.15 英吋：即使檢視器忽略儲存格邊距（Quick Look 會），L2「−123,456,789」10pt 仍是一行。 */
const CHANNEL_COL_W = [1.15, 1.15, 1.15, 1.15];
/** 兩個關鍵指標（淨營收、扣廣告後貢獻）與通路差額都是往上有利：U+2212 用不利色，其餘（含「+」）用主文字色；顏色一定搭配正負號（§8.5 規則 8）。 */
const changeColor = (value: string): string => value.startsWith(MINUS) || value.startsWith("-") ? COLOR.unfavorable : COLOR.favorable;
/** 版頭：頂線 4pt（線條中心在 2pt）、標題 28pt（放不下一行時依序縮成 24／20／18pt）、副標 10pt 每行一列。 */
const TOP_RULE_PT = 4;
const TITLE_SIZES = [28, 24, 20, 18] as const;
const TITLE_Y = 0.1, TITLE_H = 0.44, HEADER_Y = 0.56, HEADER_LINE_H = 0.17;
/** 副標一行（全寬 9.2 英吋）10pt 約可放 66 個全形字；超過就截斷，確保最多三行、版面固定。 */
const HEADER_LINE_CAPACITY = 66;
/** 內容區從版頭之下開始（三行副標約到 1.15 英吋，留一點間距）。 */
const BODY_TOP = 1.26;
/** 關鍵差額卡：差額數字 36pt、單位（元／萬／億）20pt；估計寬度放不下時數字縮小（最小 24pt），不折行。 */
const KPI_SIZE = 36, KPI_MIN_SIZE = 24, KPI_UNIT_SIZE = 20;
const KPI_CARD = { w: 2.15, gap: 0.1, h: 1.0 } as const;

/**
 * 估計行數（只用來排後續區塊位置，不影響內容）：全形字算 1、半形字算 0.6，capacity 是一行可放的全形字數。
 * 依檢視器的斷行習慣：連續的半形字（英數單字）不拆開，放不下就整個移到下一行；比一整行還長才硬斷；中文逐字可斷；空白不單獨造成換行。
 */
export function estimatedLines(value: string, capacity: number): number {
  const lineCapacity = Math.max(1, capacity);
  const widthOf = (token: string) => Array.from(token).reduce((sum, character) => sum + (character.charCodeAt(0) <= 0xff ? 0.6 : 1), 0);
  let lines = 1, used = 0;
  for (const token of value.match(/\s|[\u0021-\u007e\u00a1-\u00ff]+|[^\s]/gu) ?? []) {
    let width = widthOf(token);
    if (/^\s$/u.test(token)) { used = Math.min(lineCapacity, used + width); continue; }
    if (used + width <= lineCapacity + 1e-9) { used += width; continue; }
    if (used > 0) { lines += 1; used = 0; }
    while (width > lineCapacity + 1e-9) { lines += 1; width -= lineCapacity; }
    used = width;
  }
  return lines;
}
/** 通路名欄（1.15 英吋扣邊距）10pt 約可放 6 個全形字（取 Quick Look／PingFang 與 PowerPoint／微軟正黑體較窄的一方）。 */
const CHANNEL_NAME_CAPACITY = 6;
/** 右欄全寬（4.6 英吋）10pt 約可放 31 個全形字。 */
const RIGHT_TEXT_CAPACITY = 31;
/**
 * 表格列高估計：微軟正黑體行高 1.33em（字型檔 hhea 2203＋521／2048），10pt 一行約 0.185 英吋＋上下邊距；
 * Quick Look 以 PingFang 繪製會再高一些，這裡取兩者之間並在表格後留 0.16 英吋緩衝。
 */
const estimatedRowHeight = (lines: number): number => 0.08 + lines * 0.2;
/** 通路表（含「另有 n 個通路」那一列）可用的高度：表頭 1.33 起，到決議、置頂待辦需要的空間之前。 */
const CHANNEL_TABLE_BUDGET = 1.43;
const CHANNEL_TABLE_GAP = 0.16;
/** 內容區下緣（頁尾從 5.2 起）。 */
const PAGE_BODY_BOTTOM = 5.18;
/**
 * 一頁內畫哪些通路列：全部（≤ PPTX_MAX_CHANNEL_ROWS 且放得下）就全畫；否則畫放得下的前幾列（至少 1 列），
 * 表格最後加一列「另有 n 個通路」。height 是估計的表格總高（含表頭與那一列）。只依通路名長度估計列高；金額欄寬固定。
 */
export function pptxChannelRows<T extends { channel: string }>(channels: readonly T[]): { shown: T[]; omitted: number; height: number } {
  const single = estimatedRowHeight(1);
  const heights = channels.map(row => estimatedRowHeight(estimatedLines(row.channel, CHANNEL_NAME_CAPACITY)));
  const height = (count: number) => single + heights.slice(0, count).reduce((sum, value) => sum + value, 0);
  if (channels.length <= PPTX_MAX_CHANNEL_ROWS && height(channels.length) <= CHANNEL_TABLE_BUDGET + 1e-9) return { shown: [...channels], omitted: 0, height: height(channels.length) };
  let count = Math.min(channels.length, PPTX_MAX_CHANNEL_ROWS);
  while (count > 1 && height(count) + single > CHANNEL_TABLE_BUDGET + 1e-9) count--;
  return { shown: channels.slice(0, count), omitted: channels.length - count, height: height(count) + single };
}

/** 估計的字寬（em）：全形字 1、數字 0.56、逗號句點 0.28、正負號 0.58、空白 0.28、其他半形 0.6（只用來決定字級，不影響內容）。 */
function emWidth(value: string): number {
  return Array.from(value).reduce((sum, character) => sum + (/\d/.test(character) ? 0.56 : /[,.]/.test(character) ? 0.28 : /[+\-−]/.test(character) ? 0.58 : /\s/.test(character) ? 0.28 : character.charCodeAt(0) > 0xff ? 1 : 0.6), 0);
}
/** 截到估計一行放得下（capacity 個全形字寬）；放不下時以「…」結尾。 */
export function fitLine(value: string, capacity: number): string {
  let text = value;
  while (Array.from(text).length > 1 && estimatedLines(text, capacity) > 1) text = pptxText(text, Array.from(text).length - 1);
  return text;
}
/** 標題字級：28pt 放得下一行就用 28，否則依序 24／20／18（PRD §9.6 標題 28pt；很長的會議名稱不折行壓到副標）。 */
export function pptxTitleSize(title: string): number {
  return TITLE_SIZES.find(size => estimatedLines(title, Math.floor((FULL.w * 72) / size)) <= 1) ?? TITLE_SIZES[TITLE_SIZES.length - 1];
}
/**
 * 關鍵差額大字：數字 36pt、單位（最後一段非數字，例如「 元」「 萬」）20pt；兩段串起來就是原字串。
 * 估計寬度超過卡片寬時數字縮小（最小 24pt），避免在卡片內折行。
 */
export function pptxKpiRuns(change: string): { text: string; size: number }[] {
  const match = /^(.*\d)(\s+\D+)$/u.exec(change);
  const [number, unit] = match ? [match[1], match[2]] : [change, ""];
  const available = KPI_CARD.w * 72 - 4;
  const fit = Math.floor((available - emWidth(unit) * KPI_UNIT_SIZE) / Math.max(emWidth(number), 0.1));
  const size = Math.max(KPI_MIN_SIZE, Math.min(KPI_SIZE, fit));
  return unit ? [{ text: number, size }, { text: unit, size: KPI_UNIT_SIZE }] : [{ text: number, size }];
}

type PptxGenJSClass = typeof import("pptxgenjs").default;
type PptxCell = import("pptxgenjs").default.TableCell;
type PptxRun = import("pptxgenjs").default.TextProps;
async function loadPptxGenJS(): Promise<PptxGenJSClass> {
  // ESM（Next／Vitest）與 Node 原生 import 的 default 都是類別本身；CJS 互通時 module.exports 也會落在 default。
  const imported = await import("pptxgenjs");
  const Ctor = (imported as unknown as { default?: unknown }).default;
  if (typeof Ctor !== "function") throw new Error("PPTX_LIBRARY_UNAVAILABLE");
  return Ctor as PptxGenJSClass;
}
function toBytes(data: unknown): Uint8Array {
  if (data instanceof Uint8Array) return data;
  if (Object.prototype.toString.call(data) === "[object ArrayBuffer]") return new Uint8Array(data as ArrayBuffer);
  throw new Error("PPTX_WRITE_FAILED");
}

/** 寫出 16:9 單張投影片的 .pptx（bytes）。所有字串在寫出前再清一次（防外部組的 model），XML 跳脫交給 pptxgenjs。 */
export async function writePptx(model: PptxOnePager): Promise<Uint8Array> {
  const PptxGenJS = await loadPptxGenJS();
  const pptx = new PptxGenJS();
  const copy = labels.pptxExport;
  const limit = PPTX_TEXT_LIMITS;
  const text = pptxText;
  pptx.layout = "LAYOUT_16x9";
  pptx.author = labels.brand.name;
  pptx.company = labels.brand.name;
  pptx.title = text(model.title, limit.title);
  pptx.subject = text(model.subtitle, limit.subtitle);
  const slide = pptx.addSlide();
  slide.background = { color: COLOR.surface };
  const base = { fontFace: FONT, color: COLOR.ink, margin: 0 } as const;
  const heading = (value: string, x: number, y: number, w: number) => slide.addText(text(value, limit.title), { ...base, x, y, w, h: 0.26, fontSize: 11, bold: true, color: COLOR.ink, valign: "middle" });
  const note = (value: string, x: number, y: number, w: number, h = 0.26) => slide.addText(value, { ...base, x, y, w, h, fontSize: 10, color: COLOR.muted, valign: "top" });
  const cell = (value: string, options: PptxCell["options"] = {}): PptxCell => ({ text: value, options: { fontFace: FONT, fontSize: 10, color: COLOR.ink, margin: CELL_MARGIN, valign: "middle", ...options } });
  /** 表頭：粗體主文字色、淺灰底（export-theme headerFill），不用品牌色塊。 */
  const headerCell = (value: string, align: "left" | "right" = "left") => cell(value, { bold: true, color: COLOR.ink, fill: { color: COLOR.headerFill }, align });
  const amountCell = (value: string, color: string = COLOR.ink) => cell(value, { align: "right", fontFace: NUMBER_FONT, color });
  const border = { type: "solid", pt: 0.5, color: COLOR.line } as const;

  // V3-7 §9.6 版頭：一條 4pt 強調色頂線（不放色塊或其他裝飾圖形）、標題、副標（版頭第 1／3／4 行，最多三行）。
  slide.addShape(pptx.ShapeType.line, { x: 0, y: TOP_RULE_PT / 2 / 72, w: 10, h: 0, line: { color: COLOR.brand, width: TOP_RULE_PT } });
  const title = text(model.title, limit.title);
  slide.addText(title, { ...base, x: FULL.x, y: TITLE_Y, w: FULL.w, h: TITLE_H, fontSize: pptxTitleSize(title), bold: true, color: COLOR.ink, valign: "middle" });
  const header = model.header.slice(0, 3).map(line => fitLine(text(line, limit.header), HEADER_LINE_CAPACITY));
  if (header.length) slide.addText(header.map((line, index): PptxRun => ({ text: line, options: index < header.length - 1 ? { breakLine: true } : {} })),
    { ...base, x: FULL.x, y: HEADER_Y, w: FULL.w, h: HEADER_LINE_H * 3, fontSize: 10, color: COLOR.muted, valign: "top" });

  // 左欄上：兩個關鍵差額（差額 36pt；上期、本期同一行，本期用強調色）。不畫卡片底色與外框。
  heading(labels.sections.keyDeltas, LEFT.x, BODY_TOP, LEFT.w);
  const kpiY = BODY_TOP + 0.26;
  model.key_deltas.slice(0, 2).forEach((row, index) => {
    const x = LEFT.x + index * (KPI_CARD.w + KPI_CARD.gap);
    const change = text(row.change, limit.money);
    slide.addText([
      { text: text(row.label, limit.keyLabel), options: { fontSize: 10, color: COLOR.muted, breakLine: true } },
      ...pptxKpiRuns(change).map((run, part, runs): PptxRun => ({ text: run.text, options: { fontSize: run.size, bold: true, color: changeColor(change), ...(part === runs.length - 1 ? { breakLine: true } : {}) } })),
      { text: `${labels.periods.previous} ${text(row.previous, limit.money)}`, options: { fontSize: 10, color: COLOR.muted } },
      { text: copy.separator, options: { fontSize: 10, color: COLOR.muted } },
      { text: `${labels.periods.current} ${text(row.current, limit.money)}`, options: { fontSize: 10, color: COLOR.brand } },
    ], { ...base, x, y: kpiY, w: KPI_CARD.w, h: KPI_CARD.h, margin: 2, valign: "top" });
  });

  // 左欄下：本期三件事（同一個文字方塊，依內容自然換行，不互相重疊）
  const topThreeY = kpiY + KPI_CARD.h + 0.1;
  heading(labels.sections.topThree, LEFT.x, topThreeY, LEFT.w);
  const priorities = model.priorities.slice(0, PPTX_MAX_PRIORITIES);
  if (!priorities.length) note(labels.notes.noPriorities, LEFT.x, topThreeY + 0.26, LEFT.w, 0.5);
  else slide.addText(priorities.flatMap((row, index): PptxRun[] => [
    { text: fill(copy.priorityRow, { n: index + 1, headline: text(row.headline, limit.headline) }), options: { fontSize: 11, bold: true, color: COLOR.ink, breakLine: true } },
    { text: fill(copy.priorityDetail, { impactLabel: labels.sections.impact, nextStepLabel: labels.sections.nextStep, impact: text(row.impact, limit.impact), nextStep: text(row.next_step, limit.nextStep) }), options: { fontSize: 10, color: COLOR.muted, paraSpaceAfter: 6, ...(index < priorities.length - 1 ? { breakLine: true } : {}) } },
  ]), { ...base, x: LEFT.x, y: topThreeY + 0.26, w: LEFT.w, h: Math.max(0.5, PAGE_BODY_BOTTOM - topThreeY - 0.26), valign: "top" });

  // 右欄上：通路表（扣廣告後貢獻）；本期欄是本期資料（強調色），差額欄只有不利上色。之後的區塊依估計的表格高度往下排。
  heading(fill(copy.channelTitle, { table: labels.sections.channelTable, metric: metricDefinitions.contribution_after_marketing.label }), RIGHT.x, BODY_TOP, RIGHT.w);
  const channels = model.channels.map(row => ({ ...row, channel: text(row.channel, limit.channel) }));
  const { shown, omitted, height } = pptxChannelRows(channels);
  let y = BODY_TOP + 0.28;
  slide.addTable([
    [headerCell(labels.csvColumns.channel), headerCell(labels.periods.previous, "right"), headerCell(labels.periods.current, "right"), headerCell(labels.csvSuffix.change, "right")],
    ...shown.map(row => {
      const change = text(row.change, limit.money);
      return [cell(row.channel), amountCell(text(row.previous, limit.money)), amountCell(text(row.current, limit.money), COLOR.brand), amountCell(change, changeColor(change))];
    }),
    ...(omitted ? [[cell(fill(copy.channelsMore, { n: omitted }), { colspan: 4, color: COLOR.muted })]] : []),
  ], { x: RIGHT.x, y, w: RIGHT.w, colW: CHANNEL_COL_W, rowH: ROW_H, border, autoPage: false });
  y += height + CHANNEL_TABLE_GAP;

  // 右欄中：決議（狀態＋備註，最多兩行；一行時下面的區塊跟著上移）
  heading(labels.sections.meetingDecision, RIGHT.x, y, RIGHT.w);
  const decision = text(model.decision, limit.decision);
  const decisionHeight = 0.06 + Math.min(2, estimatedLines(decision, RIGHT_TEXT_CAPACITY)) * 0.19;
  slide.addText(decision, { ...base, x: RIGHT.x, y: y + 0.26, w: RIGHT.w, h: decisionHeight, fontSize: 10, valign: "top" });
  y += 0.26 + decisionHeight + 0.04;

  // 右欄下：置頂待辦（最多三項；每項兩行：問題／負責人・期限・狀態），排到頁尾之前。
  heading(copy.pinnedTitle, RIGHT.x, y, RIGHT.w);
  y += 0.28;
  const pinned = model.pinned_actions.slice(0, MAX_PINNED_ACTIONS);
  if (!pinned.length) note(copy.pinnedEmpty, RIGHT.x, y, RIGHT.w);
  else slide.addText(pinned.flatMap((row, index): PptxRun[] => [
    { text: fill(copy.pinnedRow, { n: index + 1, problem: text(row.problem, limit.problem) }), options: { fontSize: 10, bold: true, color: COLOR.ink, breakLine: true } },
    { text: fill(copy.pinnedMeta, { ownerLabel: labels.actions.owner, owner: text(row.owner, limit.owner), dueLabel: labels.actions.due, deadline: text(row.deadline, limit.deadline), status: text(row.status, limit.status) }),
      options: { fontSize: 10, color: COLOR.muted, paraSpaceAfter: 3, ...(index < pinned.length - 1 ? { breakLine: true } : {}) } },
  ]), { ...base, x: RIGHT.x, y, w: RIGHT.w, h: Math.max(0.3, PAGE_BODY_BOTTOM - y), valign: "top" });

  // 頁尾（全寬、最多兩行）：口徑一句（有含稅換算時加一句）＋資料版本（指標版本已在版頭）
  slide.addText([
    { text: text(model.footer, limit.footer), options: {} },
    { text: `${copy.separator}${text(model.technical, limit.technical)}`, options: {} },
  ], { ...base, x: FULL.x, y: 5.2, w: FULL.w, h: 0.36, fontSize: 10, color: COLOR.muted, valign: "bottom" });

  return toBytes(await pptx.write({ outputType: "arraybuffer", compression: true }));
}

/** 建模型 → 寫出 → 下載。回傳 bytes 方便呼叫端測試或記錄大小。 */
export async function exportPptx(input: PptxOnePagerInput, filename: string = PPTX_FILENAME): Promise<Uint8Array> {
  const bytes = await writePptx(buildPptxOnePager(input));
  // 只在使用者點擊時於瀏覽器本機產生並下載（download.ts 的共用 downloadBinary）；不送到任何伺服器。
  downloadBinary(bytes, filename, PPTX_MIME);
  return bytes;
}
