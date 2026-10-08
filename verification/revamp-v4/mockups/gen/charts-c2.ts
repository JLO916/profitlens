import { MINUS } from "@/application/presentation";
import { esc, r1 } from "./format";
import { colors, rowHeights } from "./theme";

// 設計稿的 inline SVG 圖（代理 C2：商品毛利與資料來源兩頁）：C25 RankedBars（G13 variance、G14 pareto）、C24 pair 模式（G22）、C30 Timeline（G20）。
// 與 charts.ts 同一套約定：字級一律 12px（--text-12），色一律 chartColors 的 var()；只做座標換算，標值文字由呼叫端用 domain 的精確字串經格式化函式產生。

/**
 * 12px 字級的文字寬估計（設計稿排版用，只決定標籤欄與標值欄的寬度）：比 waterfallTextWidth 保守（英文大寫 8、小寫與數字 6.7、中日文 12、空白與標點 3.5）。
 * 實際寬由 shoot.mjs 在瀏覽器量（measure.json 的 g13、g14）。
 */
export function textWidth12(text: string): number {
  return Array.from(text).reduce((sum, char) => {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x2e80) return sum + 12;
    if (char >= "A" && char <= "Z") return sum + 8;
    if ((char >= "a" && char <= "z") || (char >= "0" && char <= "9")) return sum + 6.7;
    if (char === "+" || char === MINUS || char === "%" || char === "-") return sum + 7;
    return sum + 3.5;
  }, 0);
}

/** C25 的一根柱：key 是 testid 尾段（{channel}-{sku}）；value 只用於長度（座標），標值 valueText 由呼叫端用精確字串格式化。 */
export interface RankedBar { key: string; label: string; value: number; valueText: string; unfavorable: boolean; extraText?: string }
/** 一欄：direction left＝從 0 往左（減少、商品毛利為負），right＝從 0 往右（增加）；more＝「另 n 個」文字列（不畫柱，X38）。 */
export interface RankedColumn { id: string; rows: readonly RankedBar[]; direction: "left" | "right"; more?: string }
export interface RankedGeometry { width: number; layout: "side" | "stack"; columnWidth: number; labelWidth: number; valueWidth: number; extraWidth: number; plotWidth: number; barMaxPx: number; height: number; rows: number }

/**
 * C25 RankedBars（variance 與 pareto 模式；inline SVG）：每列 rowHeights.row16，柱高 10；標籤（SKU · 通路）在左、標值在柱端、pareto 的「累計 n%」在右。
 * 多欄共用尺度（max＝各欄已畫的列 |值| 最大值）、各自從 0；layout side＝並排（≥ 768），stack＝上下（≤ 767，第一欄在上）。
 * 回傳 svg 與幾何（標籤欄、標值欄、繪圖區寬與最長柱的像素），寫進 mockup-data.json 供審查與實作對照。
 */
export function rankedBarsSvg(columns: readonly RankedColumn[], options: { width: number; layout: "side" | "stack"; max: number; gap?: number; testIdPrefix: string }): { svg: string; geometry: RankedGeometry } {
  const ROW = rowHeights.row16, BAR = 10, PAD = 6;
  const gap = options.layout === "side" && columns.length > 1 ? options.gap ?? 16 : 0;
  const columnWidth = options.layout === "side" ? (options.width - gap * (columns.length - 1)) / columns.length : options.width;
  const all = columns.flatMap(column => column.rows);
  const labelWidth = Math.ceil(Math.max(0, ...all.map(row => textWidth12(row.label)), ...columns.map(column => column.more ? textWidth12(column.more) : 0))) + PAD + 2;
  const valueWidth = Math.ceil(Math.max(0, ...all.map(row => textWidth12(row.valueText)))) + PAD;
  const extraWidth = all.some(row => row.extraText) ? Math.ceil(Math.max(0, ...all.map(row => row.extraText ? textWidth12(row.extraText) : 0))) + PAD + 4 : 0;
  const plotWidth = Math.max(columnWidth - labelWidth - valueWidth - extraWidth, 0);
  const length = (value: number) => options.max > 0 ? Math.abs(value) / options.max * plotWidth : 0;
  const rowsOf = (column: RankedColumn) => column.rows.length + (column.more ? 1 : 0);
  const totalRows = options.layout === "side" ? Math.max(0, ...columns.map(rowsOf)) : columns.reduce((sum, column) => sum + rowsOf(column), 0);
  const height = totalRows * ROW;
  let stackOffset = 0, barMaxPx = 0;
  const body = columns.map((column, columnIndex) => {
    const x0 = options.layout === "side" ? columnIndex * (columnWidth + gap) : 0;
    const y0 = options.layout === "side" ? 0 : stackOffset;
    stackOffset += rowsOf(column) * ROW;
    const plotLeft = column.direction === "left" ? x0 + labelWidth + valueWidth : x0 + labelWidth;
    const zero = column.direction === "left" ? plotLeft + plotWidth : plotLeft;
    const bars = column.rows.map((row, index) => {
      const top = y0 + index * ROW;
      const w = row.value === 0 ? 0 : Math.max(length(row.value), 1);
      barMaxPx = Math.max(barMaxPx, w);
      const x = column.direction === "left" ? zero - w : zero;
      const valueX = column.direction === "left" ? x - 4 : x + w + 4;
      const tone = row.unfavorable ? " is-unfavorable" : "";
      const extra = row.extraText ? `<text class="chart-value" x="${r1(x0 + columnWidth)}" y="${top + 12}" text-anchor="end">${esc(row.extraText)}</text>` : "";
      return `<text class="chart-label" x="${r1(x0)}" y="${top + 12}">${esc(row.label)}</text><rect data-testid="${options.testIdPrefix}${row.key}" x="${r1(x)}" y="${top + (ROW - BAR) / 2}" width="${r1(w)}" height="${BAR}" fill="${row.unfavorable ? colors.unfavorable : colors.favorable}"/><text class="chart-value${tone}" x="${r1(valueX)}" y="${top + 12}" text-anchor="${column.direction === "left" ? "end" : "start"}">${esc(row.valueText)}</text>${extra}`;
    }).join("");
    const more = column.more ? `<text class="chart-axis" x="${r1(x0)}" y="${y0 + column.rows.length * ROW + 12}">${esc(column.more)}</text>` : "";
    const zeroLine = column.rows.length ? `<line x1="${r1(zero)}" x2="${r1(zero)}" y1="${y0}" y2="${y0 + column.rows.length * ROW}" stroke="${colors.axis}" stroke-width="1" shape-rendering="crispEdges"/>` : "";
    return `<g data-column="${column.id}">${bars}${zeroLine}${more}</g>`;
  }).join("");
  const svg = `<svg class="ranked-svg" viewBox="0 0 ${r1(options.width)} ${height}" width="${r1(options.width)}" height="${height}" aria-hidden="true" focusable="false">${body}</svg>`;
  return { svg, geometry: { width: options.width, layout: options.layout, columnWidth: r1(columnWidth), labelWidth, valueWidth, extraWidth, plotWidth: r1(plotWidth), barMaxPx: r1(barMaxPx), height, rows: totalRows } };
}

/**
 * C24 BarCell pair（G22 前處理表）：上 4px 含稅原值（--chart-previous）、下 6px 換算值（--chart-total）；共用尺度＝原值最大值，ratio 由呼叫端以精確值算（只用於長度）。
 * 寬 96（≤ 767 由 CSS 改 64，preserveAspectRatio="none" 只拉長度）。
 */
export function pairCell(options: { top: number; bottom: number; testId: string }): string {
  const W = 96, H = 12;
  const clamp = (ratio: number) => Math.max(Math.min(ratio, 1), 0) * W;
  return `<svg class="bar-cell" data-chart-kind="cell" data-testid="${options.testId}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false"><rect x="0" y="0.5" width="${r1(clamp(options.top))}" height="4" fill="${colors.previous}"/><rect x="0" y="5.5" width="${r1(clamp(options.bottom))}" height="6" fill="${colors.total}"/></svg>`;
}

/** 含頭含尾的日期區段（ISO）。 */
export interface DateRange { start: string; end: string }
/** C30 的一軌（銷售、通路費用、廣告、檔期）。 */
export interface TimelineTrack {
  key: "sales" | "costs" | "ads" | "events";
  label: string;
  /** 有列的連續區段（--chart-total 細條）。 */
  rows: readonly DateRange[];
  /** 缺列區段（--chart-missing 虛線框）；testId＝chart-data-coverage-seg-{file}-{channel}-{start}。 */
  missing: readonly (DateRange & { testId: string })[];
  /** 無列區段（只標「無列」，不等於零銷售）。 */
  noRows: readonly DateRange[];
  /** 檔期（--chart-axis 細線＋名稱）。 */
  events: readonly (DateRange & { label: string })[];
  /** 右端文字（缺列天數、無列天數）。 */
  endLabel: string;
}
export interface TimelineGeometry { width: number; height: number; plotLeft: number; plotWidth: number; dayWidth: number; days: number; ticksAll: string[]; ticksShown: string[]; bandLabelsShown: string[]; yoyDrawn: boolean; yoyWidth: number | null; segments: { testId: string; x: number; width: number }[]; noRowsLabelled: number; eventLabelsShown: string[] }

const dayIndex = (from: string, iso: string) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * C30 Timeline（G20 涵蓋時間軸；inline SVG）：第一列是區帶名與去年同期細線（時間軸上方 1px --chart-yoy，直接標字，不用虛線框），
 * 之後每軌一列（rowHeights.row24），最後是日期軸（rowHeights.axis）：區段起訖兩端與每月 1 日的刻度；halve 時每月刻度只留一半（390）。
 * 期間區帶 --chart-band，相鄰區帶中間留 2px 白縫；缺列 --chart-missing 1px 虛線框（3 2）；有列 --chart-total 6px 細條；檔期 --chart-axis 2px 細線。
 */
export function timelineSvg(options: { width: number; labelWidth: number; endWidth: number; domain: DateRange; bands: readonly (DateRange & { label: string })[]; yoy: (DateRange & { label: string }) | null; tracks: readonly TimelineTrack[]; noRowsText: string; halve: boolean; dateLabel: (iso: string) => string }): { svg: string; geometry: TimelineGeometry } {
  const ROW = rowHeights.row24, AXIS = rowHeights.axis;
  const days = dayIndex(options.domain.start, options.domain.end) + 1;
  const plotLeft = options.labelWidth, plotWidth = options.width - options.labelWidth - options.endWidth;
  const dayWidth = plotWidth / days;
  const x = (iso: string) => plotLeft + Math.min(Math.max(dayIndex(options.domain.start, iso), 0), days) * dayWidth;
  const xEnd = (iso: string) => plotLeft + Math.min(Math.max(dayIndex(options.domain.start, iso) + 1, 0), days) * dayWidth;
  const inDomain = (range: DateRange) => range.end >= options.domain.start && range.start <= options.domain.end;
  const trackTop = (index: number) => ROW * (index + 1);
  const bodyHeight = ROW * (options.tracks.length + 1);
  const height = bodyHeight + AXIS;
  const geometry: TimelineGeometry = { width: options.width, height, plotLeft, plotWidth: r1(plotWidth), dayWidth: Math.round(dayWidth * 1000) / 1000, days, ticksAll: [], ticksShown: [], bandLabelsShown: [], yoyDrawn: false, yoyWidth: null, segments: [], noRowsLabelled: 0, eventLabelsShown: [] };
  // 期間區帶：相鄰兩段各內縮 1px，中間留 2px 白縫，兩段同色也分得出界線；區帶寬放得下時直接標「上期」「本期」。
  const visibleBands = options.bands.filter(inDomain);
  const bands = visibleBands.map((band, index) => {
    const left = x(band.start) + (index > 0 && dayIndex(visibleBands[index - 1].end, band.start) === 1 ? 1 : 0);
    const right = xEnd(band.end) - (index < visibleBands.length - 1 && dayIndex(band.end, visibleBands[index + 1].start) === 1 ? 1 : 0);
    const fits = right - left >= textWidth12(band.label) + 8;
    if (fits) geometry.bandLabelsShown.push(band.label);
    const label = fits ? `<text class="chart-axis" x="${r1((left + right) / 2)}" y="16" text-anchor="middle">${esc(band.label)}</text>` : "";
    return `<rect data-kind="band" x="${r1(left)}" y="0" width="${r1(Math.max(right - left, 0))}" height="${bodyHeight}" fill="${colors.band}"/>${label}`;
  }).join("");
  // 去年同期：時間軸上方 1px 細線＋文字（--chart-yoy 與 --chart-missing 同為 gray-400，所以不用虛線框，位置也在軌道之外）。
  let yoy = "";
  if (options.yoy && inDomain(options.yoy)) {
    const left = x(options.yoy.start), right = xEnd(options.yoy.end);
    const textW = textWidth12(options.yoy.label);
    const after = right + 4 + textW <= options.width;
    yoy = `<line data-kind="yoy" x1="${r1(left)}" x2="${r1(right)}" y1="11.5" y2="11.5" stroke="${colors.yoy}" stroke-width="1"/><text class="chart-axis" x="${r1(after ? right + 4 : left - 4)}" y="16" text-anchor="${after ? "start" : "end"}">${esc(options.yoy.label)}</text>`;
    geometry.yoyDrawn = true;
    geometry.yoyWidth = r1(right - left);
  }
  const tracks = options.tracks.map((track, index) => {
    const top = trackTop(index);
    const name = `<text class="chart-label" x="${r1(plotLeft - 8)}" y="${top + 16}" text-anchor="end">${esc(track.label)}</text>`;
    const rows = track.rows.filter(inDomain).map(range => `<rect data-kind="rows" x="${r1(x(range.start))}" y="${top + 9}" width="${r1(Math.max(xEnd(range.end) - x(range.start), 0.5))}" height="6" fill="${colors.total}"/>`).join("");
    const missing = track.missing.filter(inDomain).map(range => {
      const left = x(range.start), w = Math.max(xEnd(range.end) - left, 1);
      geometry.segments.push({ testId: range.testId, x: r1(left), width: r1(w) });
      return `<rect data-kind="missing" data-testid="${range.testId}" x="${r1(left + 0.5)}" y="${top + 5.5}" width="${r1(Math.max(w - 1, 0.5))}" height="13" fill="none" stroke="${colors.missing}" stroke-width="1" stroke-dasharray="3 2"/>`;
    }).join("");
    const noRows = track.noRows.filter(inDomain).map(range => {
      const left = x(range.start), right = xEnd(range.end);
      if (right - left < textWidth12(options.noRowsText) + 2) return "";
      geometry.noRowsLabelled += 1;
      return `<text class="chart-axis" data-kind="no-rows" x="${r1((left + right) / 2)}" y="${top + 16}" text-anchor="middle">${esc(options.noRowsText)}</text>`;
    }).join("");
    const events = track.events.filter(inDomain).map(range => {
      const left = x(range.start), right = xEnd(range.end);
      const fits = right - left >= textWidth12(range.label) + 4;
      if (fits) geometry.eventLabelsShown.push(range.label);
      const label = fits ? `<text class="chart-axis" x="${r1((left + right) / 2)}" y="${top + 11}" text-anchor="middle">${esc(range.label)}</text>` : "";
      return `<line data-kind="event" x1="${r1(left + 1)}" x2="${r1(Math.max(right - 1, left + 1.5))}" y1="${top + 17}" y2="${top + 17}" stroke="${colors.axis}" stroke-width="2"/>${label}`;
    }).join("");
    const end = track.endLabel ? `<text class="chart-value" x="${r1(options.width - options.endWidth + 8)}" y="${top + 16}">${esc(track.endLabel)}</text>` : "";
    return `${name}${rows}${missing}${noRows}${events}${end}`;
  }).join("");
  // 日期軸：區段起訖兩端＋每月 1 日；標字與已放的字重疊時略過；halve 時每月刻度只留一半（390「月份刻度減半」）。
  const axisTop = bodyHeight;
  const months: string[] = [];
  for (let cursor = options.domain.start; cursor <= options.domain.end;) {
    const [year, month] = cursor.split("-").map(Number);
    const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    if (next <= options.domain.end) months.push(next);
    cursor = next;
  }
  geometry.ticksAll = months.map(options.dateLabel);
  const startText = options.dateLabel(options.domain.start), endText = options.dateLabel(options.domain.end);
  const kept: { left: number; right: number }[] = [{ left: plotLeft, right: plotLeft + textWidth12(startText) }, { left: plotLeft + plotWidth - textWidth12(endText), right: plotLeft + plotWidth }];
  const ticks = months.filter((_, index) => !options.halve || months.length < 2 || index % 2 === 1).map(iso => {
    const tx = x(iso), text = options.dateLabel(iso), w = textWidth12(text);
    const box = { left: tx - w / 2 - 4, right: tx + w / 2 + 4 };
    const fits = !kept.some(other => box.left < other.right && box.right > other.left);
    if (fits) { kept.push(box); geometry.ticksShown.push(text); }
    return `<line x1="${r1(tx)}" x2="${r1(tx)}" y1="${axisTop}" y2="${axisTop + 4}" stroke="${colors.axis}" stroke-width="1"/>${fits ? `<text class="chart-axis" x="${r1(tx)}" y="${axisTop + 16}" text-anchor="middle">${esc(text)}</text>` : ""}`;
  }).join("");
  const axis = `<line x1="${plotLeft}" x2="${r1(plotLeft + plotWidth)}" y1="${axisTop + 0.5}" y2="${axisTop + 0.5}" stroke="${colors.grid}" stroke-width="1"/><text class="chart-axis" x="${plotLeft}" y="${axisTop + 16}">${esc(startText)}</text><text class="chart-axis" x="${r1(plotLeft + plotWidth)}" y="${axisTop + 16}" text-anchor="end">${esc(endText)}</text>${ticks}`;
  const svg = `<svg class="timeline-svg" viewBox="0 0 ${options.width} ${height}" width="${options.width}" height="${height}" aria-hidden="true" focusable="false"><g>${bands}</g><g>${yoy}</g><g>${tracks}</g><g>${axis}</g></svg>`;
  return { svg, geometry };
}
