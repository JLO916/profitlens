import type { Metric } from "../domain/types";
import { fill, labels } from "../i18n";
import { MAX_PINNED_ACTIONS, type ActionWorkspace } from "./action-workspace";
import { channelLabel, channelsLabel, demoAlias, ruleCopy } from "./copy";
import { downloadBinary } from "./download";
import type { ManagerSummary } from "./manager-summary";
import { formatMoney, formatSignedMoney, metricDefinitions } from "./presentation";
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
 * 金額上限（24）大於任何 TWD 兩位小數金額的長度，金額字串實際上不會被截斷。
 */
export const PPTX_TEXT_LIMITS = {
  title: 36, subtitle: 120, keyLabel: 12, money: 24, headline: 40, impact: 24, nextStep: 40, channel: 16,
  decision: 60, problem: 26, owner: 10, deadline: 12, status: 16, footer: 70, technical: 60,
} as const;

export interface PptxMeetingInput { name: string; date: string; decision: string; notes: string }
export interface PptxOnePagerInput { summary: ManagerSummary; snapshot: WorkspaceSnapshot; actions: ActionWorkspace; meeting?: PptxMeetingInput | null }
export interface PptxOnePager {
  title: string;
  /** 資料到、兩期期間與天數、通路 */
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
  /** 指標版本與資料版本（可追溯性；小字） */
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

const money = (metric: Metric | null | undefined, signed = false): string =>
  !metric || metric.value === null ? labels.status.missing : signed ? formatSignedMoney(metric.value) : formatMoney(metric.value);

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
  const title = name ? pptxText(date ? fill(copy.titleMeeting, { name, date }) : name, limit.title) : fill(copy.title, { brand: labels.brand.name });
  const subtitle = pptxText(fill(copy.subtitle, {
    asOf: summary.data_as_of, previousStart: summary.scope.previous_period.start, previousEnd: summary.scope.previous_period.end, previousDays: summary.previous_days,
    currentStart: summary.scope.current_period.start, currentEnd: summary.scope.current_period.end, currentDays: summary.current_days, channels: channelsLabel(summary.scope.channels, alias),
  }), limit.subtitle);
  const key_deltas = summary.headlines.map(row => ({ label: metricDefinitions[row.metric].label, previous: money(row.previous), current: money(row.current), change: money(row.change, true) }));
  const priorities = summary.priorities.slice(0, PPTX_MAX_PRIORITIES).map(item => {
    const rule = ruleCopy(snapshot, item.primary, alias);
    return { headline: pptxText(rule.headline, limit.headline), impact: money(item.impact ?? item.ranking_amount, true), next_step: pptxText(rule.nextStep, limit.nextStep) };
  });
  const channels = summary.channels.map(row => ({ channel: pptxText(channelLabel(row.channel, alias), limit.channel), previous: money(row.contribution.previous), current: money(row.contribution.current), change: money(row.contribution.change, true) }));
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
  const technical = pptxText(fill(copy.technical, { metricVersion: summary.metric_version, datasetHash: summary.dataset_hash.slice(0, 12) }), limit.technical);
  return { title, subtitle, key_deltas, priorities, channels, decision, pinned_actions, footer, technical };
}

// 版面（英吋；LAYOUT_16x9 = 10 × 5.625）。字級一律 ≥ 10pt。顏色取自 globals.css 的品牌綠與正負色。
// 左欄：兩個關鍵差額 → 本期三件事；右欄：通路表 → 決議 → 置頂待辦；頁尾：口徑一句＋版本。
// 單位注意（pptxgenjs 4）：文字方塊 margin 是 pt；表格儲存格 margin 小於 1 時是英吋。
const FONT = "Microsoft JhengHei";
const COLOR = { brand: "214C45", onBrand: "FFFFFF", onBrandMuted: "D7E6DE", ink: "243C44", muted: "667978", positive: "177F6C", negative: "AD533A", line: "E2E9E6", paper: "F5F7F5" } as const;
const LEFT = { x: 0.4, w: 4.4 } as const, RIGHT = { x: 5.0, w: 4.6 } as const, FULL = { x: 0.4, w: 9.2 } as const;
const ROW_H = 0.24;
const CELL_MARGIN: [number, number, number, number] = [0.02, 0.06, 0.02, 0.06];
/** 金額欄 1.15 英吋：即使檢視器忽略儲存格邊距（Quick Look 會），「-12,345,678.90」10pt 仍是一行。 */
const CHANNEL_COL_W = [1.15, 1.15, 1.15, 1.15];
const changeColor = (value: string): string => value.startsWith("+") ? COLOR.positive : value.startsWith("-") ? COLOR.negative : COLOR.ink;

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
  slide.background = { color: "FFFFFF" };
  const base = { fontFace: FONT, color: COLOR.ink, margin: 0 } as const;
  const heading = (value: string, x: number, y: number, w: number) => slide.addText(text(value, limit.title), { ...base, x, y, w, h: 0.26, fontSize: 11, bold: true, color: COLOR.brand, valign: "middle" });
  const note = (value: string, x: number, y: number, w: number, h = 0.26) => slide.addText(value, { ...base, x, y, w, h, fontSize: 10, color: COLOR.muted, valign: "top" });
  const cell = (value: string, options: PptxCell["options"] = {}): PptxCell => ({ text: value, options: { fontFace: FONT, fontSize: 10, color: COLOR.ink, margin: CELL_MARGIN, valign: "middle", ...options } });
  const headerCell = (value: string, align: "left" | "right" = "left") => cell(value, { bold: true, color: COLOR.onBrand, fill: { color: COLOR.brand }, align });
  const border = { type: "solid", pt: 0.5, color: COLOR.line } as const;

  // 標題列：標題一行、副標（資料到、兩期、通路）最多兩行。
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.95, fill: { color: COLOR.brand }, line: { color: COLOR.brand } });
  slide.addText(text(model.title, limit.title), { ...base, x: FULL.x, y: 0.08, w: FULL.w, h: 0.38, fontSize: 18, bold: true, color: COLOR.onBrand, valign: "middle" });
  slide.addText(text(model.subtitle, limit.subtitle), { ...base, x: FULL.x, y: 0.5, w: FULL.w, h: 0.4, fontSize: 10, color: COLOR.onBrandMuted, valign: "top" });

  // 左欄上：兩個關鍵差額（差額大字，上期／本期各一行）
  heading(labels.sections.keyDeltas, LEFT.x, 1.05, LEFT.w);
  model.key_deltas.slice(0, 2).forEach((row, index) => {
    const x = LEFT.x + index * 2.25, y = 1.31, w = 2.15, h = 1.04;
    const change = text(row.change, limit.money);
    slide.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: COLOR.paper }, line: { color: COLOR.line, width: 0.75 } });
    slide.addText([
      { text: text(row.label, limit.keyLabel), options: { fontSize: 10, color: COLOR.muted, breakLine: true } },
      { text: change, options: { fontSize: 20, bold: true, color: changeColor(change), breakLine: true } },
      { text: `${labels.periods.previous} ${text(row.previous, limit.money)}`, options: { fontSize: 10, color: COLOR.muted, breakLine: true } },
      { text: `${labels.periods.current} ${text(row.current, limit.money)}`, options: { fontSize: 10, color: COLOR.muted } },
    ], { ...base, x, y, w, h, margin: 4, valign: "middle" });
  });

  // 左欄下：本期三件事（同一個文字方塊，依內容自然換行，不互相重疊）
  heading(labels.sections.topThree, LEFT.x, 2.45, LEFT.w);
  const priorities = model.priorities.slice(0, PPTX_MAX_PRIORITIES);
  if (!priorities.length) note(labels.notes.noPriorities, LEFT.x, 2.71, LEFT.w, 0.5);
  else slide.addText(priorities.flatMap((row, index): PptxRun[] => [
    { text: fill(copy.priorityRow, { n: index + 1, headline: text(row.headline, limit.headline) }), options: { fontSize: 11, bold: true, color: COLOR.ink, breakLine: true } },
    { text: fill(copy.priorityDetail, { impactLabel: labels.sections.impact, nextStepLabel: labels.sections.nextStep, impact: text(row.impact, limit.impact), nextStep: text(row.next_step, limit.nextStep) }), options: { fontSize: 10, color: COLOR.muted, paraSpaceAfter: 6, ...(index < priorities.length - 1 ? { breakLine: true } : {}) } },
  ]), { ...base, x: LEFT.x, y: 2.71, w: LEFT.w, h: 2.45, valign: "top" });

  // 右欄上：通路表（扣廣告後貢獻）；之後的區塊依估計的表格高度往下排。
  heading(fill(copy.channelTitle, { table: labels.sections.channelTable, metric: metricDefinitions.contribution_after_marketing.label }), RIGHT.x, 1.05, RIGHT.w);
  const channels = model.channels.map(row => ({ ...row, channel: text(row.channel, limit.channel) }));
  const { shown, omitted, height } = pptxChannelRows(channels);
  let y = 1.33;
  slide.addTable([
    [headerCell(labels.csvColumns.channel), headerCell(labels.periods.previous, "right"), headerCell(labels.periods.current, "right"), headerCell(labels.csvSuffix.change, "right")],
    ...shown.map(row => {
      const change = text(row.change, limit.money);
      return [cell(row.channel), cell(text(row.previous, limit.money), { align: "right" }), cell(text(row.current, limit.money), { align: "right" }), cell(change, { align: "right", color: changeColor(change) })];
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

  // 頁尾（全寬、最多兩行）：口徑一句（有含稅換算時加一句）＋指標與資料版本
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
