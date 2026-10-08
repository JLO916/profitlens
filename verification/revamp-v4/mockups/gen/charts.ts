import { colors, rowHeights } from "./theme";
import { waterfallToneColor, type WaterfallBar } from "@/application/waterfall";
import { splitWaterfallLabel, waterfallTextWidth } from "@/components/overview/charts/waterfall-svg";
import { coordinate, esc, formatAxisWan, r1 } from "./format";

// 設計稿的 inline SVG 圖（C17 瀑布、折線、長條、C24 內嵌條、C19 sparkline、C27 堆疊條）。
// 幾何比照產品：瀑布沿用 waterfall-svg.tsx 的版面常數與標值避讓，但加上 v4 的共同尺度（domain）；字級一律 12px（--text-12），色一律 chartColors 的 var()。
// 只做座標換算（coordinate），標值文字一律由呼叫端用 domain 的精確字串經格式化函式產生。

/** 版面斷點（設計稿依 1440、1280、768、390 四個寬度各畫一份，CSS 只顯示對應的那一份，字級維持 12px）。 */
export type Breakpoint = "xl" | "lg" | "md" | "sm";
export const BREAKPOINTS: readonly Breakpoint[] = ["xl", "lg", "md", "sm"];

/** 每個斷點只顯示一份（.rv-xl：≥ 1281；.rv-lg：1024–1280；.rv-md：768–1023；.rv-sm：≤ 767）。 */
export function responsive(render: (bp: Breakpoint) => string): string {
  return BREAKPOINTS.map(bp => `<div class="rv rv-${bp}">${render(bp)}</div>`).join("");
}

export interface Scale { lo: number; hi: number; step: number; ticks: number[] }

const WF_MARGIN = { top: 24, right: 8, bottom: 40, left: 64 } as const;
const LABEL_GAP = 6, LABEL_LINE = 13, LABEL_PAD = 2, LABEL_TOP_MIN = 12, X_LABEL_FIRST = 15, X_LABEL_LINE = 13, BAR_RATIO = 0.6;

/**
 * C17 瀑布（v4：共同尺度 scale 由呼叫端給，兩張瀑布同頁同尺度；刻度用 formatAxisWan）。
 * 回傳 svg 字串與量測值（最高柱的像素高，供 measured 比較共同尺度對 G1 的壓縮）。
 */
export function waterfallSvg(bars: readonly WaterfallBar[], options: { width: number; height: number; scale: Scale; testId?: string; barTestIdPrefix?: string }): { svg: string; tallest: number } {
  const { width, height, scale } = options;
  const plot = { left: WF_MARGIN.left, right: width - WF_MARGIN.right, top: WF_MARGIN.top, bottom: height - WF_MARGIN.bottom };
  const y = (value: number) => plot.top + ((scale.hi - value) / (scale.hi - scale.lo)) * (plot.bottom - plot.top);
  const zeroY = r1(y(0));
  const tickText = formatAxisWan(scale.ticks, scale.step);
  const slot = (plot.right - plot.left) / Math.max(bars.length, 1);
  const barWidth = slot * BAR_RATIO;
  let tallest = 0;
  const shapes = bars.map((bar, index) => {
    const x = plot.left + index * slot + (slot - barWidth) / 2;
    const cx = x + barWidth / 2;
    const start = coordinate(bar.start), end = coordinate(bar.end);
    if (start === null || end === null) return { bar, x, cx, rect: null as null | { y: number; h: number }, labelY: null as number | null, tone: "missing" };
    const [a, b] = bar.kind === "delta" ? [start, end] : [0, end];
    const top = y(Math.max(a, b)), bottom = y(Math.min(a, b));
    const rect = bottom - top < 1 ? { y: top - 0.5, h: 1 } : { y: top, h: bottom - top };
    tallest = Math.max(tallest, rect.h);
    const tone = bar.kind === "delta" ? (bar.tone === "unfavorable" ? "neg" : "muted") : end < 0 ? "neg" : "strong";
    return { bar, x, cx, rect, labelY: Math.min(top, rect.y) - LABEL_GAP, tone };
  });
  // 標值避讓（同 waterfall-svg.tsx）：與前一個標值水平重疊、高度相近時，往下的段改標在柱底下方，其餘往上移一行。
  let previous: { x2: number; y: number } | null = null;
  for (const shape of shapes) {
    if (shape.labelY === null || shape.rect === null) continue;
    const half = waterfallTextWidth(shape.bar.display) / 2;
    let labelY = shape.labelY;
    if (previous && shape.cx - half < previous.x2 + LABEL_PAD && Math.abs(labelY - previous.y) < LABEL_LINE) {
      const start = coordinate(shape.bar.start), end = coordinate(shape.bar.end);
      const downward = shape.bar.kind === "delta" && start !== null && end !== null && end < start;
      const below = downward ? shape.rect.y + shape.rect.h + LABEL_LINE : null;
      if (below !== null && below <= plot.bottom - 2) labelY = below;
      else if (previous.y - LABEL_LINE >= LABEL_TOP_MIN) labelY = Math.min(labelY, previous.y - LABEL_LINE);
      shape.labelY = labelY;
    }
    previous = { x2: shape.cx + half, y: labelY };
  }
  const grid = scale.ticks.map(tick => `<line x1="${plot.left}" x2="${plot.right}" y1="${r1(y(tick))}" y2="${r1(y(tick))}" stroke="${colors.grid}" stroke-width="1" shape-rendering="crispEdges"/>`).join("");
  const axis = scale.ticks.map((tick, index) => `<text x="${plot.left - 8}" y="${r1(y(tick) + 4)}" text-anchor="end">${esc(tickText[index])}</text>`).join("");
  const connectors: string[] = [];
  for (let index = 1; index < shapes.length; index++) {
    const before = shapes[index - 1], now = shapes[index];
    const level = coordinate(before.bar.end);
    if (!before.rect || !now.rect || level === null || now.bar.start === null) continue;
    connectors.push(`<line x1="${r1(before.x + barWidth)}" x2="${r1(now.x)}" y1="${r1(y(level))}" y2="${r1(y(level))}" stroke="${colors.connector}" stroke-width="1" shape-rendering="crispEdges"/>`);
  }
  const rects = shapes.map(shape => shape.rect ? `<rect class="wf-bar"${options.barTestIdPrefix ? ` data-testid="${options.barTestIdPrefix}${shape.bar.metric}"` : ""} x="${r1(shape.x)}" y="${r1(shape.rect.y)}" width="${r1(barWidth)}" height="${r1(shape.rect.h)}" fill="${waterfallToneColor[shape.bar.tone]}"/>` : "").join("");
  const values = shapes.map(shape => shape.labelY === null ? "" : `<text class="wf-value is-${shape.tone}" x="${r1(shape.cx)}" y="${r1(shape.labelY)}" text-anchor="middle">${esc(shape.bar.display)}</text>`).join("");
  const xLabels = shapes.map(shape => { const lines = splitWaterfallLabel(shape.bar.shortLabel, slot); return `<text x="${r1(shape.cx)}" y="${plot.bottom + X_LABEL_FIRST}" text-anchor="middle">${lines.map((line, index) => `<tspan x="${r1(shape.cx)}" dy="${index === 0 ? 0 : X_LABEL_LINE}">${esc(line)}</tspan>`).join("")}</text>`; }).join("");
  const svg = `<svg class="waterfall-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false"${options.testId ? ` data-testid="${options.testId}"` : ""}>
<g class="wf-grid">${grid}</g><g class="wf-axis">${axis}</g><g class="wf-connectors">${connectors.join("")}</g><g class="wf-bars">${rects}</g><g class="wf-values">${values}</g><g class="wf-x">${xLabels}</g>
<line class="wf-zero" x1="${plot.left}" x2="${plot.right}" y1="${zeroY}" y2="${zeroY}" stroke="${colors.connector}" stroke-width="1" shape-rendering="crispEdges"/></svg>`;
  return { svg, tallest: r1(tallest) };
}

export interface LineSeries {
  key: string;
  values: readonly (number | null)[];
  color: string;
  width: number;
  dash?: string;
  /** 最後一個有值的點：標值文字（呼叫端格式化）；強調時字重 600。 */
  lastLabel?: string;
  lastStrong?: boolean;
  /** 最後一點畫 3px 實心圓點（本期）。 */
  lastDot?: boolean;
}

/** 折線（G3、G12 子圖）：x＝等距的序號，y＝scale；缺值斷線（不內插、不當 0）。 */
export function lineSvg(options: { width: number; height: number; series: readonly LineSeries[]; scale: Scale; tickLabels: readonly string[]; xLabels: readonly string[]; xLabelEvery?: number; margin?: { top: number; right: number; bottom: number; left: number } }): string {
  const margin = options.margin ?? { top: 22, right: 12, bottom: 22, left: 56 };
  const { width, height, scale } = options;
  const count = options.xLabels.length;
  const plot = { left: margin.left, right: width - margin.right, top: margin.top, bottom: height - margin.bottom };
  const x = (index: number) => plot.left + (count <= 1 ? (plot.right - plot.left) / 2 : ((index + 0.5) / count) * (plot.right - plot.left));
  const y = (value: number) => plot.top + ((scale.hi - value) / (scale.hi - scale.lo)) * (plot.bottom - plot.top);
  const grid = scale.ticks.map(tick => `<line x1="${plot.left}" x2="${plot.right}" y1="${r1(y(tick))}" y2="${r1(y(tick))}" stroke="${colors.grid}" stroke-width="1" shape-rendering="crispEdges"/>`).join("");
  const axis = scale.ticks.map((tick, index) => `<text class="chart-axis" x="${plot.left - 8}" y="${r1(y(tick) + 4)}" text-anchor="end">${esc(options.tickLabels[index] ?? "")}</text>`).join("");
  const every = options.xLabelEvery ?? 1;
  const xLabels = options.xLabels.map((label, index) => index % every === 0 ? `<text class="chart-axis" x="${r1(x(index))}" y="${plot.bottom + 16}" text-anchor="middle">${esc(label)}</text>` : "").join("");
  const lines = options.series.map(series => {
    const segments: string[][] = [];
    let current: string[] = [];
    series.values.forEach((value, index) => {
      if (value === null) { if (current.length) segments.push(current); current = []; return; }
      current.push(`${r1(x(index))},${r1(y(value))}`);
    });
    if (current.length) segments.push(current);
    const paths = segments.map(points => points.length === 1 ? "" : `<polyline points="${points.join(" ")}" fill="none" stroke="${series.color}" stroke-width="${series.width}"${series.dash ? ` stroke-dasharray="${series.dash}"` : ""} stroke-linejoin="round" stroke-linecap="round"/>`).join("");
    const lastIndex = series.values.reduce<number>((last, value, index) => value === null ? last : index, -1);
    let last = "";
    if (lastIndex >= 0) {
      const cx = x(lastIndex), cy = y(series.values[lastIndex]!);
      if (series.lastDot) last += `<circle cx="${r1(cx)}" cy="${r1(cy)}" r="3" fill="${series.color}"/>`;
      if (series.lastLabel) last += `<text class="chart-value${series.lastStrong ? " is-strong" : ""}" x="${r1(cx - 6)}" y="${r1(cy - 8)}" text-anchor="end">${esc(series.lastLabel)}</text>`;
    }
    return `<g data-series="${series.key}">${paths}${last}</g>`;
  }).join("");
  return `<svg class="line-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false"><g>${grid}</g><g>${axis}</g><g>${xLabels}</g>${lines}</svg>`;
}

export interface HBarRow { label: string; previous: number | null; current: number | null; previousLabel: string; currentLabel: string; currentUnfavorable: boolean }

/** G4 各通路雙長條（Recharts BarChart 的設計稿版）：上期 8px、本期 18px；x 含 0、負值往左；末端直接標值；刻度用 formatAxisWan。 */
export function channelBarsSvg(rows: readonly HBarRow[], options: { width: number; height: number; scale: Scale }): string {
  const { width, height, scale } = options;
  const plot = { left: 136, right: width - 88, top: 4, bottom: height - 22 };
  const x = (value: number) => plot.left + ((value - scale.lo) / (scale.hi - scale.lo)) * (plot.right - plot.left);
  const band = (plot.bottom - plot.top) / Math.max(rows.length, 1);
  const ticks = formatAxisWan(scale.ticks, scale.step);
  const grid = scale.ticks.map(tick => `<line x1="${r1(x(tick))}" x2="${r1(x(tick))}" y1="${plot.top}" y2="${plot.bottom}" stroke="${colors.grid}" stroke-width="1" shape-rendering="crispEdges"/>`).join("");
  const axis = scale.ticks.map((tick, index) => `<text class="chart-axis" x="${r1(x(tick))}" y="${plot.bottom + 16}" text-anchor="middle">${esc(ticks[index])}</text>`).join("");
  const bars = rows.map((row, index) => {
    const mid = plot.top + band * index + band / 2;
    const bar = (value: number | null, thickness: number, top: number, color: string, label: string, tone: string) => {
      if (value === null) return "";
      const x0 = x(0), x1 = x(value);
      const left = Math.min(x0, x1), w = Math.max(Math.abs(x1 - x0), 1);
      const end = Math.max(x0, x1);
      return `<rect x="${r1(left)}" y="${r1(top)}" width="${r1(w)}" height="${thickness}" fill="${color}"/><text class="chart-value${tone}" x="${r1(end + 6)}" y="${r1(top + thickness / 2 + 4)}">${esc(label)}</text>`;
    };
    const previousTop = mid - 12, currentTop = mid - 2;
    const name = row.label.split(" · ");
    const nameText = name.length === 2 ? `<text class="chart-axis" x="${plot.left - 8}" y="${r1(mid - 2)}" text-anchor="end">${esc(name[0])} ·</text><text class="chart-axis" x="${plot.left - 8}" y="${r1(mid + 12)}" text-anchor="end">${esc(name[1])}</text>` : `<text class="chart-axis" x="${plot.left - 8}" y="${r1(mid + 4)}" text-anchor="end">${esc(row.label)}</text>`;
    return `${nameText}${bar(row.previous, 8, previousTop, colors.previous, row.previousLabel, "")}${bar(row.current, 18, currentTop, row.currentUnfavorable ? colors.unfavorable : colors.current, row.currentLabel, row.currentUnfavorable ? " is-unfavorable" : " is-strong")}`;
  }).join("");
  return `<svg class="bars-svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" aria-hidden="true" focusable="false"><g>${grid}</g><g>${axis}</g><line x1="${r1(x(0))}" x2="${r1(x(0))}" y1="${plot.top}" y2="${plot.bottom}" stroke="${colors.connector}" stroke-width="1"/>${bars}</svg>`;
}

/**
 * C24 BarCell variance（表格內嵌條）：高 6、最大寬 96（390 為 64，由 CSS 換寬，preserveAspectRatio="none" 只拉長度）；零線 1px --chart-axis；
 * 共用零線在中間：負往左、正往右；ratio＝|值| ÷ 共用最大值（只用於長度）。outline＝空心條（G9 的 REV_UP_CM_DOWN）。tick＝門檻刻度位置（同一把尺的比例）。
 */
export function barCell(options: { ratio: number; negative: boolean; color: string; outline?: boolean; tick?: number | null; testId: string; mode?: "variance" | "share" }): string {
  const W = 96, H = 12, mid = options.mode === "share" ? 0 : W / 2, half = options.mode === "share" ? W : W / 2;
  const length = Math.max(Math.min(options.ratio, 1), 0) * half;
  const x = options.mode === "share" ? 0 : options.negative ? mid - length : mid;
  const bar = length <= 0 ? "" : options.outline
    ? `<rect x="${r1(x + 1)}" y="4" width="${r1(Math.max(length - 2, 0.5))}" height="4" fill="none" stroke="${options.color}" stroke-width="2" vector-effect="non-scaling-stroke"/>`
    : `<rect x="${r1(x)}" y="3" width="${r1(length)}" height="6" fill="${options.color}"/>`;
  const tick = options.tick === null || options.tick === undefined ? "" : (() => { const tx = options.negative ? mid - Math.min(options.tick, 1) * half : mid + Math.min(options.tick, 1) * half; return `<rect x="${r1(tx - 1)}" y="0" width="2" height="12" fill="${colors.target}"/>`; })();
  const zero = options.mode === "share" ? "" : `<line x1="${mid}" x2="${mid}" y1="0" y2="${H}" stroke="${colors.axis}" stroke-width="1" vector-effect="non-scaling-stroke"/>`;
  return `<svg class="bar-cell" data-chart-kind="cell" data-testid="${options.testId}" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${zero}${bar}${tick}</svg>`;
}

/** C19 sparkline 16×64：線 --chart-total 1.5px、最後一點 3px --chart-current；未滿 7 天的點空心（hollow）；null 斷線；無軸無框。 */
export function sparkline(points: readonly { value: number | null; hollow: boolean }[], testId: string): string {
  const W = 64, H = 16, pad = 3;
  const finite = points.flatMap(point => point.value === null ? [] : [point.value]);
  if (finite.length === 0) return `<svg class="spark" data-chart-kind="spark" data-testid="${testId}" viewBox="0 0 ${W} ${H}" aria-hidden="true" focusable="false"></svg>`;
  const min = Math.min(...finite), max = Math.max(...finite);
  const x = (index: number) => pad + (points.length <= 1 ? (W - 2 * pad) / 2 : (index / (points.length - 1)) * (W - 2 * pad));
  const y = (value: number) => max === min ? H / 2 : pad + ((max - value) / (max - min)) * (H - 2 * pad);
  const segments: string[][] = [];
  let current: string[] = [];
  points.forEach((point, index) => {
    if (point.value === null) { if (current.length) segments.push(current); current = []; return; }
    current.push(`${r1(x(index))},${r1(y(point.value))}`);
  });
  if (current.length) segments.push(current);
  const lines = segments.map(segment => segment.length > 1 ? `<polyline points="${segment.join(" ")}" fill="none" stroke="${colors.total}" stroke-width="1.5" stroke-linejoin="round"/>` : "").join("");
  const lastIndex = points.reduce<number>((last, point, index) => point.value === null ? last : index, -1);
  const hollow = points.map((point, index) => point.value !== null && point.hollow && index !== lastIndex ? `<circle cx="${r1(x(index))}" cy="${r1(y(point.value))}" r="2" fill="${colors.surface}" stroke="${colors.total}" stroke-width="1"/>` : "").join("");
  const lastPoint = points[lastIndex];
  const last = lastPoint.hollow
    ? `<circle cx="${r1(x(lastIndex))}" cy="${r1(y(lastPoint.value!))}" r="3" fill="${colors.surface}" stroke="${colors.current}" stroke-width="1.5"/>`
    : `<circle cx="${r1(x(lastIndex))}" cy="${r1(y(lastPoint.value!))}" r="3" fill="${colors.current}"/>`;
  return `<svg class="spark" data-chart-kind="spark" data-testid="${testId}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" aria-hidden="true" focusable="false">${lines}${hollow}${last}</svg>`;
}

export interface ShareRow {
  key: string;
  label: string;
  /** 三段（商品成本、通路費用合計、廣告費）的每 100 元（呼叫端以精確值算好再轉座標）；null＝不適用列。 */
  segments: { key: "cogs" | "fees" | "ad"; value: number; color: string }[] | null;
  /** 剩（≥ 0）或虧（< 0）的每 100 元。 */
  remain: number | null;
  /** 右端標字：「剩 16.2 元」「虧 1.5 元」「不適用」。 */
  endLabel: string;
  endUnfavorable: boolean;
  /** 合計列（字重 600、上方分隔線）。 */
  total?: boolean;
}

/**
 * C27 ShareStack（G10 每 100 元淨營收去向）：每列 row24；x 0 到 max(100, 最大扣項合計)；三段灰階＋空心剩餘；超過 100 的部分 --chart-unfavorable；
 * 100 處參考線 --chart-axis；段間 1px colors.surface（D-V4-19）。svg 高＝（列數＋軸列）× 24。
 */
export function shareStackSvg(rows: readonly ShareRow[], options: { width: number; labelWidth: number; endWidth: number; testIdPrefix: string; xMax: number; axisLabel: (value: number) => string }): string {
  const ROW = rowHeights.row24;
  const height = (rows.length + 1) * ROW;
  const plot = { left: options.labelWidth, right: options.width - options.endWidth };
  const x = (value: number) => plot.left + (value / options.xMax) * (plot.right - plot.left);
  const barH = 14;
  const body = rows.map((row, index) => {
    const top = index * ROW + (ROW - barH) / 2;
    const name = `<text class="chart-axis${row.total ? " is-strong" : ""}" x="${plot.left - 8}" y="${index * ROW + 16}" text-anchor="end">${esc(row.label)}</text>`;
    const end = `<text class="chart-value${row.endUnfavorable ? " is-unfavorable" : row.total ? " is-strong" : ""}" x="${r1(plot.right + 8)}" y="${index * ROW + 16}">${esc(row.endLabel)}</text>`;
    if (row.segments === null) return `${name}<text class="chart-axis" x="${plot.left}" y="${index * ROW + 16}">${esc(row.endLabel)}</text>`;
    let cursor = 0;
    const parts: string[] = [];
    for (const segment of row.segments) {
      const from = cursor, to = cursor + segment.value;
      // 超過 100 的部分改塗不利色（同一段跨過 100 時拆成兩塊）。
      const inside = Math.min(to, 100) - from, over = to - Math.max(from, 100);
      if (inside > 0) parts.push(`<rect data-testid="${options.testIdPrefix}${row.key}-${segment.key}" x="${r1(x(from))}" y="${r1(top)}" width="${r1(x(from + inside) - x(from))}" height="${barH}" fill="${segment.color}" stroke="${colors.surface}" stroke-width="1"/>`);
      if (over > 0) parts.push(`<rect data-testid="${options.testIdPrefix}${row.key}-over" x="${r1(x(Math.max(from, 100)))}" y="${r1(top)}" width="${r1(x(to) - x(Math.max(from, 100)))}" height="${barH}" fill="${colors.unfavorable}" stroke="${colors.surface}" stroke-width="1"/>`);
      cursor = to;
    }
    if (row.remain !== null && row.remain > 0) parts.push(`<rect data-testid="${options.testIdPrefix}${row.key}-remain" x="${r1(x(cursor) + 0.75)}" y="${r1(top + 0.75)}" width="${r1(Math.max(x(cursor + row.remain) - x(cursor) - 1.5, 0.5))}" height="${barH - 1.5}" fill="none" stroke="${colors.total}" stroke-width="1.5"/>`);
    const rule = row.total ? `<line x1="0" x2="${options.width}" y1="${index * ROW + 0.5}" y2="${index * ROW + 0.5}" stroke="${colors.grid}" stroke-width="1"/>` : "";
    return `${rule}${name}${parts.join("")}${end}`;
  }).join("");
  const axisY = rows.length * ROW;
  const ticks = [0, 25, 50, 75, 100, ...(options.xMax > 100 ? [options.xMax] : [])].filter((value, index, all) => all.indexOf(value) === index && value <= options.xMax);
  const axis = ticks.map(tick => `<text class="chart-axis" x="${r1(x(tick))}" y="${axisY + 16}" text-anchor="middle">${esc(options.axisLabel(tick))}</text>`).join("");
  const hundred = `<line x1="${r1(x(100))}" x2="${r1(x(100))}" y1="0" y2="${axisY + 4}" stroke="${colors.axis}" stroke-width="1" stroke-dasharray="3 2"/>`;
  return `<svg class="share-svg" viewBox="0 0 ${options.width} ${height}" width="${options.width}" height="${height}" aria-hidden="true" focusable="false">${body}${hundred}${axis}</svg>`;
}
