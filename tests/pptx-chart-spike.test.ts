import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import Decimal from "decimal.js";
import PptxGenJS from "pptxgenjs";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { addActionDraft, editBoundAction, emptyActionWorkspace, pinAction, type ActionSource, type ActionWorkspace } from "@/application/action-workspace";
import { EXPORT_THEME, type ExportThemeKey } from "@/application/export-theme";
import { buildManagerSummary, type ManagerSummary } from "@/application/manager-summary";
import { buildPptxOnePager, estimatedLines, pptxChannelRows, pptxKpiRuns, pptxText, pptxTitleSize, writePptx, type PptxMeetingInput, type PptxOnePager } from "@/application/pptx-export";
import { MINUS } from "@/application/presentation";
import { bridgeWaterfall, type BridgeWaterfall, type WaterfallBar } from "@/application/waterfall";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { axisTicks } from "@/components/overview/charts/chart-frame";
import { AMOUNT_FIELDS, type AmountField, type Metric } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";

// V4-0b 第 1 項（D-V4-10、D-V4-34）：pptxgenjs 4.0.1 addChart spike。只在記憶體中產生、解壓、解析，不接線（src/application/pptx-export.ts 一個字都不改）。
// 測試只斷言「產生得出檔案、解析得出 XML 與內嵌活頁簿」；各檢查項的 true／false 與證據字串只在給環境變數 PPTX_SPIKE_OUT 時寫成 JSON，
// 同一個目錄另寫三個 .pptx 供人工開檔（版面 A、版面 B、合成橋接的瀑布）。成立與否由 V4-0b 驗收文件判讀，不由測試成敗決定。
// 不帶 PPTX_SPIKE_OUT 時不寫任何檔（之後每批跑 npm test 都不會改寫 V4-0b 的證據檔）。
// 輔助系列名與證據字串一律用 ASCII（正式名稱到 V4-9a 才以 exports.chartsV4.* 進 labels）；畫面上的中文只取自 labels。
// 解 Office 壓縮檔沿用 tests/excel-export.test.ts 的 XLSX.CFB.read；內嵌活頁簿用 XLSX.read。

const OUT = process.env.PPTX_SPIKE_OUT;
const FONT = "Microsoft JhengHei";
const NUMBER_FONT = "Arial";
const COLOR = EXPORT_THEME;
const copy = labels.exports.pptx;
const EMU_PER_INCH = 914400;
/** 內容區下緣（pptx-export.ts 的 PAGE_BODY_BOTTOM；頁尾從 5.2 起）。 */
const PAGE_BODY_BOTTOM = 5.18;
/** PPT 字級下限（pptx-export.ts「字級一律 ≥ 10pt」與 tests/pptx-export.test.ts 的斷言；OOXML 以百分之一 pt 記）。 */
const MIN_FONT_PT = 10;
/** v3 PRD §9.6 的 PPT 規格：標題 28pt、KPI 數字 36pt。 */
const SPEC_TITLE_PT = 28, SPEC_KPI_PT = 36;
/** 固定的產出時間（版頭第 4 行），輸出可重現。 */
const GENERATED_AT = new Date("2026-10-05T06:32:00.000Z");
/** 會議（使用者輸入，ASCII）：讓第一張有決議與備註。 */
const MEETING: PptxMeetingInput = { name: "Weekly review", date: "2026-10-05", decision: "adopted", notes: "Keep the channel plan" };

// ── 瀑布的系列（堆疊長條；透明底段＋起訖與小計＋有利＋不利；跨 0 或整段在 0 以下的部分另放「0 以下」輔助系列） ──
type SeriesKey = "base" | "level" | "favorable" | "unfavorable" | "favorableBelowZero" | "unfavorableBelowZero";
const SERIES_ORDER: readonly SeriesKey[] = ["base", "level", "favorable", "unfavorable", "favorableBelowZero", "unfavorableBelowZero"];
/** 系列名（ASCII；V4-9a 改成 labels 的 exports.chartsV4.*）。有利與不利存的是柱高（絕對值），名稱寫明。 */
const SERIES_NAME: Record<SeriesKey, string> = {
  base: "Base offset (for drawing, not an amount)",
  level: "Start, subtotal and end (amount)",
  favorable: "Favorable change (abs, for drawing)",
  unfavorable: "Unfavorable change (abs, for drawing)",
  favorableBelowZero: "Favorable part below 0 (for drawing, not an amount)",
  unfavorableBelowZero: "Unfavorable part below 0 (for drawing, not an amount)",
};
const AUXILIARY: readonly SeriesKey[] = ["base", "favorableBelowZero", "unfavorableBelowZero"];
const ABSOLUTE: readonly SeriesKey[] = ["favorable", "unfavorable"];
/** 系列色（EXPORT_THEME 的鍵；底段無填色）。起訖與小計＝muted（同 --chart-total 的 gray-700）、有利＝lineStrong（V4-9a 加 chartFavorable 前最接近 --chart-favorable 的淺灰）、不利＝unfavorable。 */
const SERIES_COLOR: Record<SeriesKey, ExportThemeKey | "transparent"> = {
  base: "transparent", level: "muted", favorable: "lineStrong", unfavorable: "unfavorable", favorableBelowZero: "lineStrong", unfavorableBelowZero: "unfavorable",
};
/** 資料標籤格式：正數、負數（U+2212）、零（空白＝不顯示）。pptxgenjs 只有一個 dataLabelFormatCode，套用到全部系列。 */
const LABEL_FORMAT = `#,##0.00;"${MINUS}"#,##0.00;`;
const AXIS_FORMAT = `#,##0;"${MINUS}"#,##0`;
/** LABEL_FORMAT 顯示出來的字（只用來估計標籤寬度）：千分位、兩位小數、負數加 U+2212。 */
const dataLabelText = (value: string) => { const amount = new Decimal(value); return `${amount.isNegative() ? MINUS : ""}${amount.abs().toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`; };

interface Series { key: SeriesKey; name: string; exact: string[]; values: number[] }
interface WaterfallChart { categories: string[]; series: Series[]; axis: { min: number; max: number; step: number; dataMin: string; dataMax: string } }

/** bars（精確字串）→ 堆疊系列：一律用 decimal.js 由 start／end 換算，不用浮點累加；Number() 只在交給 pptxgenjs 時做一次。 */
function waterfallChart(bars: readonly WaterfallBar[]): WaterfallChart {
  const zero = new Decimal(0);
  const cells = Object.fromEntries(SERIES_ORDER.map(key => [key, bars.map(() => zero)])) as Record<SeriesKey, Decimal[]>;
  const extents: Decimal[] = [zero];
  bars.forEach((bar, index) => {
    if (bar.start === null || bar.end === null) throw new Error("SPIKE_BAR_WITHOUT_POSITION");
    const start = new Decimal(bar.start), end = new Decimal(bar.end);
    extents.push(start, end);
    if (bar.kind !== "delta") { cells.level[index] = end; return; }
    if (start.eq(end)) return;
    const lo = Decimal.min(start, end), hi = Decimal.max(start, end);
    const up: SeriesKey = end.gt(start) ? "favorable" : "unfavorable";
    const below: SeriesKey = up === "favorable" ? "favorableBelowZero" : "unfavorableBelowZero";
    // 堆疊長條：正值從 0 往上疊、負值從 0 往下疊（各自依系列順序）。整段在 0 以上：底段＝lo；整段在 0 以下：底段＝hi（負）；跨 0：不需要底段，拆成上下兩段。
    if (lo.gte(0)) { cells.base[index] = lo; cells[up][index] = hi.minus(lo); }
    else if (hi.lte(0)) { cells.base[index] = hi; cells[below][index] = lo.minus(hi); }
    else { cells[up][index] = hi; cells[below][index] = lo; }
  });
  const used = SERIES_ORDER.filter(key => !AUXILIARY.slice(1).includes(key) || cells[key].some(value => !value.isZero()));
  const series = used.map(key => ({ key, name: SERIES_NAME[key], exact: cells[key].map(value => value.isZero() ? "0" : value.toFixed(2)), values: cells[key].map(value => Number(value.toFixed(2))) }));
  const dataMin = Decimal.min(...extents), dataMax = Decimal.max(...extents);
  const scale = axisTicks([dataMin.toNumber(), dataMax.toNumber()]);
  const step = scale.ticks.length > 1 ? scale.ticks[1] - scale.ticks[0] : 1;
  // 軸範圍依資料（含 0），往外取到刻度步長的整數倍，負柱與最高柱都不被切。
  const axis = { min: Math.floor(scale.domain[0] / step) * step, max: Math.ceil(scale.domain[1] / step) * step, step, dataMin: dataMin.toFixed(2), dataMax: dataMax.toFixed(2) };
  return { categories: bars.map(bar => bar.shortLabel), series, axis };
}

interface Rect { x: number; y: number; w: number; h: number }
function addWaterfallChart(pptx: PptxGenJS, slide: PptxGenJS.Slide, chart: WaterfallChart, rect: Rect, objectName: string, overrides: PptxGenJS.IChartOpts = {}) {
  slide.addChart(pptx.ChartType.bar, chart.series.map(series => ({ name: series.name, labels: chart.categories, values: series.values })), {
    ...rect, objectName,
    barDir: "col", barGrouping: "stacked", barGapWidthPct: 60,
    chartColors: chart.series.map(series => { const color = SERIES_COLOR[series.key]; return color === "transparent" ? color : COLOR[color]; }),
    showLegend: false, showTitle: false,
    showValue: true, dataLabelFormatCode: LABEL_FORMAT, dataLabelFontSize: MIN_FONT_PT, dataLabelFontFace: NUMBER_FONT, dataLabelColor: COLOR.ink,
    valAxisMinVal: chart.axis.min, valAxisMaxVal: chart.axis.max, valAxisMajorUnit: chart.axis.step, valAxisLabelFormatCode: AXIS_FORMAT,
    valAxisLabelFontSize: MIN_FONT_PT, valAxisLabelFontFace: NUMBER_FONT, valAxisLabelColor: COLOR.muted, valGridLine: { color: COLOR.line, size: 0.5 },
    catAxisLabelFontSize: MIN_FONT_PT, catAxisLabelFontFace: FONT, catAxisLabelColor: COLOR.muted, catAxisLabelPos: "low",
    ...overrides,
  });
}

async function toBytes(pptx: PptxGenJS): Promise<Uint8Array> {
  return new Uint8Array(await pptx.write({ outputType: "arraybuffer", compression: true }) as ArrayBuffer);
}
function newDeck(): PptxGenJS {
  const pptx = new PptxGenJS();
  pptx.layout = "LAYOUT_16x9";
  return pptx;
}
/** 一張只有瀑布的投影片（沒有其他物件）。 */
async function chartOnlyDeck(chart: WaterfallChart, overrides: PptxGenJS.IChartOpts = {}): Promise<Uint8Array> {
  const pptx = newDeck();
  const slide = pptx.addSlide();
  slide.background = { color: COLOR.surface };
  addWaterfallChart(pptx, slide, chart, { x: 0.4, y: 0.4, w: 9.2, h: 4.8 }, "spike|waterfall|chart", overrides);
  return toBytes(pptx);
}

// ── 解壓與解析 ──
/** .pptx／.xlsx（zip）→ 路徑 → 內容；只收檔案（CFB type 2），目錄項不收。 */
function unzip(bytes: Uint8Array): { files: Map<string, Uint8Array>; entries: string[] } {
  const container = XLSX.CFB.read(bytes, { type: "array" });
  const files = new Map<string, Uint8Array>();
  const entries: string[] = [];
  (container.FullPaths as string[]).forEach((path: string, index: number) => {
    const name = path.replace(/^Root Entry\//, "");
    entries.push(name);
    const entry = container.FileIndex[index];
    if (entry.type === 2) files.set(name, new Uint8Array(entry.content as ArrayLike<number>));
  });
  return { files, entries };
}
const text = (files: Map<string, Uint8Array>, name: string): string => {
  const data = files.get(name);
  if (!data) throw new Error(`SPIKE_PART_MISSING ${name}`);
  return new TextDecoder().decode(data);
};
/** 圖的 part（pptxgenjs 以模組層級的計數器編號：同一個執行環境裡第二份檔的圖是 chart2.xml，不一定是 chart1.xml）。 */
const chartPartsOf = (files: Map<string, Uint8Array>) => [...files.keys()].filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name)).sort();
const xmlUnescape = (value: string) => value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
const fontSizes = (xml: string): number[] => [...xml.matchAll(/ sz="(\d+)"/g)].map(match => Number(match[1]) / 100);
const slideRuns = (xml: string): string[] => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(match => xmlUnescape(match[1]));

interface ParsedSeries { name: string; fill: string; noFill: boolean; color: string | null; values: string[]; formatCodes: string[]; showVal: boolean }
function parseChart(xml: string) {
  const series: ParsedSeries[] = [...xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map(match => {
    const body = match[1];
    const name = xmlUnescape(/<c:tx>[\s\S]*?<c:v>([^<]*)<\/c:v>[\s\S]*?<\/c:tx>/.exec(body)?.[1] ?? "");
    const fill = /<\/c:tx>\s*<c:spPr>([\s\S]*?)<\/c:spPr>/.exec(body)?.[1] ?? "";
    const values = [...(/<c:val>([\s\S]*?)<\/c:val>/.exec(body)?.[1] ?? "").matchAll(/<c:pt idx="\d+"><c:v>([^<]*)<\/c:v><\/c:pt>/g)].map(point => point[1]);
    return {
      name, fill, noFill: fill.includes("<a:noFill/>") && !fill.includes("<a:solidFill>"), color: /<a:srgbClr val="(\w+)"/.exec(fill)?.[1] ?? null, values,
      formatCodes: [...body.matchAll(/<c:dLbls>[\s\S]*?<c:numFmt formatCode="([^"]*)"/g)].map(code => xmlUnescape(code[1])),
      showVal: /<c:dLbls>[\s\S]*?<c:showVal val="1"\/>/.test(body),
    };
  });
  const valAx = /<c:valAx>([\s\S]*?)<\/c:valAx>/.exec(xml)?.[1] ?? "";
  const number = (pattern: RegExp, source: string) => { const found = pattern.exec(source); return found ? Number(found[1]) : null; };
  return {
    series,
    grouping: /<c:barChart>[\s\S]*?<c:grouping val="(\w+)"\/>/.exec(xml)?.[1] ?? null,
    overlap: number(/<c:overlap val="(-?\d+)"\/>/, xml),
    barDir: /<c:barDir val="(\w+)"\/>/.exec(xml)?.[1] ?? null,
    axisMin: number(/<c:min val="(-?[\d.]+)"\/>/, valAx), axisMax: number(/<c:max val="(-?[\d.]+)"\/>/, valAx),
    fontSizes: fontSizes(xml),
  };
}
/** 內嵌活頁簿第一張工作表 → 列（第一列是系列名）。 */
function embeddedRows(bytes: Uint8Array): (string | number | null)[][] {
  const book = XLSX.read(bytes, { type: "array" });
  return XLSX.utils.sheet_to_json<(string | number | null)[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: null, raw: true });
}
/** 投影片上的物件（文字方塊、表格、圖）：名稱與位置（英吋）。 */
function slideObjects(xml: string): { name: string; kind: string; x: number; y: number; w: number; h: number }[] {
  return [...xml.matchAll(/<p:(sp|graphicFrame)>([\s\S]*?)<\/p:\1>/g)].map(match => {
    const name = xmlUnescape(/<p:cNvPr id="\d+" name="([^"]*)"/.exec(match[2])?.[1] ?? "");
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(match[2]), ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(match[2]);
    const kind = match[1] === "sp" ? (match[2].includes('prst="line"') ? "line" : "text") : match[2].includes("drawingml/2006/chart") ? "chart" : "table";
    const inch = (value: string | undefined) => Number(value ?? 0) / EMU_PER_INCH;
    return { name, kind, x: inch(off?.[1]), y: inch(off?.[2]), w: inch(ext?.[1]), h: inch(ext?.[2]) };
  });
}

interface Check { pass: boolean; evidence: string }
const check = (pass: boolean, evidence: string): Check => ({ pass, evidence });
const exact = (value: string | number | null | undefined) => new Decimal(value === null || value === undefined || value === "" ? 0 : value);
const themeValues = new Set<string>(Object.values(EXPORT_THEME));

/** 一份 chart-only .pptx 的全部檢查項（D-V4-10 清單）。 */
function chartChecks(bytes: Uint8Array, bars: readonly WaterfallBar[], chart: WaterfallChart) {
  const { files, entries } = unzip(bytes);
  const chartParts = chartPartsOf(files);
  const chartXml = text(files, chartParts[0]);
  const parsed = parseChart(chartXml);
  const embeddings = [...files.keys()].filter(name => /^ppt\/embeddings\/.+\.xlsx$/.test(name));
  const rows = embeddedRows(files.get(embeddings[0])!);
  const header = rows[0].map(cell => (cell === null ? "" : String(cell)));
  const byName = new Map(parsed.series.map(series => [series.name, series]));
  const keyOf = (name: string) => SERIES_ORDER.find(key => SERIES_NAME[key] === name);
  const valueOf = (key: SeriesKey, index: number) => exact(byName.get(SERIES_NAME[key])?.values[index]);
  const media = [...files.entries()].filter(([name, data]) => name.startsWith("ppt/media/") && data.length > 0).map(([name]) => name);
  const rels = [...files.keys()].filter(name => name.endsWith(".rels")).map(name => text(files, name));

  // 系列數值：由圖的快取值反推每根柱的起點與終點，與 bars 的精確字串逐柱比對。
  const perBar = bars.map((bar, index) => {
    let start: Decimal, end: Decimal, series: string;
    if (bar.kind !== "delta") { start = end = valueOf("level", index); series = "level"; }
    else {
      const base = valueOf("base", index);
      const up = valueOf("favorable", index).plus(valueOf("unfavorable", index));
      const down = valueOf("favorableBelowZero", index).plus(valueOf("unfavorableBelowZero", index));
      const favorable = !valueOf("favorable", index).plus(valueOf("favorableBelowZero", index)).isZero();
      const [lo, hi] = base.gt(0) ? [base, base.plus(up)] : base.lt(0) ? [base.plus(down), base] : [down, up];
      if (lo.eq(hi)) { start = end = exact(bar.start); series = "none (zero change, nothing drawn)"; }
      else { [start, end] = favorable ? [lo, hi] : [hi, lo]; series = favorable ? "favorable" : "unfavorable"; }
    }
    const pass = start.eq(exact(bar.start)) && end.eq(exact(bar.end));
    return { id: bar.id, start: bar.start, end: bar.end, fromChart: `${start.toFixed(2)}..${end.toFixed(2)}`, series, pass };
  });
  // 內嵌活頁簿的格子與圖的快取值相同（pptxgenjs 把 0 寫成空白格）。
  const workbookMismatch = parsed.series.flatMap((series, column) => series.values.map((value, row) => {
    const cell = rows[row + 1]?.[column + 1] ?? null;
    return exact(cell).eq(exact(value)) ? null : `${series.name}[${row}] cache=${value} cell=${cell}`;
  }).filter((item): item is string => item !== null));
  const blankZeroCells = parsed.series.reduce((count, series, column) => count + series.values.filter((value, row) => exact(value).isZero() && (rows[row + 1]?.[column + 1] ?? null) === null).length, 0);

  const base = byName.get(SERIES_NAME.base);
  const visible = parsed.series.filter(series => series.name !== SERIES_NAME.base);
  // 「編輯資料」裡的不利系列：優先舉商品成本那一列（示範資料），沒有值時舉第一個有值的列。
  const unfavorableColumn = header.indexOf(SERIES_NAME.unfavorable);
  const cellOf = (index: number) => (index >= 0 && unfavorableColumn >= 0 ? rows[index + 1]?.[unfavorableColumn] ?? null : null);
  const cogsIndex = bars.findIndex(bar => bar.id === "cogs_net");
  const sampleIndex = cellOf(cogsIndex) !== null ? cogsIndex : bars.findIndex((_, index) => cellOf(index) !== null);
  const negatives = parsed.series.flatMap(series => series.values.map(Number)).filter(value => value < 0);
  const stackBottom = Math.min(0, ...bars.map((_, index) => parsed.series.filter(series => Number(series.values[index]) < 0).reduce((sum, series) => sum + Number(series.values[index]), 0)));
  const stackTop = Math.max(0, ...bars.map((_, index) => parsed.series.filter(series => Number(series.values[index]) > 0).reduce((sum, series) => sum + Number(series.values[index]), 0)));
  const labelCodes = [...new Set(parsed.series.flatMap(series => series.formatCodes))];
  const unfavorableLabelValues = (byName.get(SERIES_NAME.unfavorable)?.values ?? []).filter(value => !exact(value).isZero());

  const checks: Record<string, Check> = {
    stackedBarChart: check(parsed.grouping === "stacked" && parsed.overlap === 100 && parsed.barDir === "col",
      `c:barChart barDir=${parsed.barDir} grouping=${parsed.grouping} overlap=${parsed.overlap}`),
    baseSeriesNoFill: check(!!base?.noFill, `base series spPr=${base?.fill.replace(/\s+/g, "") ?? "missing"}`),
    seriesColorsInExportTheme: check(visible.every(series => series.color !== null && themeValues.has(series.color)),
      visible.map(series => `${keyOf(series.name)}=${series.color}`).join(", ")),
    valueAxisFromDataWithZero: check(parsed.axisMin !== null && parsed.axisMax !== null && parsed.axisMin <= 0 && parsed.axisMax >= 0 && parsed.axisMin <= Number(chart.axis.dataMin) && parsed.axisMax >= Number(chart.axis.dataMax),
      `c:valAx min=${parsed.axisMin} max=${parsed.axisMax} step=${chart.axis.step}; data range ${chart.axis.dataMin}..${chart.axis.dataMax}`),
    negativeNotClipped: check(parsed.axisMin !== null && parsed.axisMax !== null && parsed.axisMin <= stackBottom && parsed.axisMax >= stackTop,
      `stack extent ${stackBottom}..${stackTop}; negative cached values ${negatives.length}; axis ${parsed.axisMin}..${parsed.axisMax}`),
    noMediaParts: check(media.length === 0 && !rels.some(rel => rel.includes("relationships/image")) && !entries.some(name => /^ppt\/media\/.+/.test(name)),
      `ppt/media files=${media.length}; image relationships=${rels.filter(rel => rel.includes("relationships/image")).length}`),
    embeddedWorkbookHasAuxiliaryNames: check(parsed.series.filter(series => AUXILIARY.includes(keyOf(series.name)!)).every(series => header.includes(series.name)),
      `${embeddings[0]} sheet header=${JSON.stringify(header)}`),
    favorableUnfavorableNamedAbsolute: check(ABSOLUTE.every(key => SERIES_NAME[key].includes("abs, for drawing")) && ABSOLUTE.every(key => !byName.has(SERIES_NAME[key]) || header.includes(SERIES_NAME[key])),
      sampleIndex >= 0 ? `Edit Data shows ${bars[sampleIndex].id} in "${SERIES_NAME.unfavorable}" = ${cellOf(sampleIndex)}; bridge component = ${bars[sampleIndex].value}` : `series names ${ABSOLUTE.map(key => SERIES_NAME[key]).join(" / ")}`),
    dataLabelFormatHasMinus: check(labelCodes.length > 0 && labelCodes.every(code => code.includes(MINUS)),
      `dataLabelFormatCode set=${JSON.stringify(LABEL_FORMAT)}; c:numFmt formatCode in XML=${JSON.stringify(labelCodes)} (U+2212 kept=${labelCodes.every(code => code.includes(MINUS))})`),
    valuesMatchBarsExactly: check(perBar.every(item => item.pass), perBar.filter(item => !item.pass).map(item => item.id).join(",") || `${perBar.length} bars rebuilt from chart cache equal bars[].start/end`),
    embeddedValuesMatchChartCache: check(workbookMismatch.length === 0, workbookMismatch.slice(0, 3).join("; ") || `all cells equal the chart cache; ${blankZeroCells} zero values are blank cells`),
    fontsAtLeast10pt: check(parsed.fontSizes.length > 0 && Math.min(...parsed.fontSizes) >= MIN_FONT_PT, `chart sz (pt)=${JSON.stringify([...new Set(parsed.fontSizes)])}`),
  };
  // 以下不是清單上的「是否成立」，而是判讀需要的事實：pptxgenjs 的資料標籤設定只有一份，套用到每個系列。
  const labelScope = {
    formatCodeScope: `one dataLabelFormatCode for all ${parsed.series.length} series (per-series c:dLbls all carry ${JSON.stringify(labelCodes)})`,
    baseSeriesLabelsShown: !!base?.showVal,
    unfavorableLabelsShowMinus: unfavorableLabelValues.length > 0 && unfavorableLabelValues.every(value => value.startsWith("-")),
    unfavorableLabelEvidence: `unfavorable cached values are positive heights ${JSON.stringify(unfavorableLabelValues.slice(0, 3))}; positive section of the format has no minus`,
  };
  return { chartParts, embeddings, seriesNames: parsed.series.map(series => series.name), axis: chart.axis, checks, labelScope, perBar };
}

// ── 資料：示範資料與合成橋接（含跨 0 與負的本期） ──
async function load(name: string): Promise<ActionSource> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), revision: 1 };
}
const money = (value: string): Metric => ({ value, reason_codes: [] });
/** 合成橋接（只改呈現層的 snapshot 副本，與 tests/waterfall.test.ts 的 bridgeVariant 同法）：上期 80,000.00 → 九項 → 本期 −14,500.25。 */
const SYNTHETIC_PREVIOUS = "80000.00";
const SYNTHETIC_COMPONENTS: readonly string[] = ["25000.00", "-60000.00", "-75500.50", "-12000.00", "8000.25", "50000.00", "-20000.00", "0.00", "-10000.00"];
function syntheticSnapshot(base: WorkspaceSnapshot): WorkspaceSnapshot {
  const snapshot = structuredClone(base);
  const sum = SYNTHETIC_COMPONENTS.reduce((total, value) => total.plus(value), new Decimal(0));
  const current = new Decimal(SYNTHETIC_PREVIOUS).plus(sum);
  snapshot.report.previous.metrics.contribution_after_marketing = money(SYNTHETIC_PREVIOUS);
  snapshot.report.current.metrics.contribution_after_marketing = money(current.toFixed(2));
  AMOUNT_FIELDS.forEach((field: AmountField, index) => { snapshot.report.bridge.components[field] = money(SYNTHETIC_COMPONENTS[index]); });
  snapshot.report.bridge.sum = money(sum.toFixed(2));
  snapshot.report.bridge.contribution_change = money(sum.toFixed(2));
  snapshot.report.bridge.reconciled = true;
  return snapshot;
}
/** 三個置頂待辦（取示範資料前三個健檢項目當問題；負責人與期限是 ASCII 使用者輸入）。 */
function pinnedActions(source: ActionSource): ActionWorkspace {
  let actions = emptyActionWorkspace();
  source.snapshot.report.diagnostics.slice(0, 3).forEach((diagnostic, index) => {
    const id = `spike-${index + 1}`;
    actions = addActionDraft(actions, source, id, diagnostic.id);
    actions = editBoundAction(actions, id, { owner_role: "Ops", deadline: `2026-10-1${index + 2}` });
    actions = pinAction(actions, id, true);
  });
  return actions;
}

// ── 版面 A：現有一頁式（writePptx 原樣）之後加第二張，只放瀑布（加單位與期間） ──
function addBridgeSlide(pptx: PptxGenJS, bridge: BridgeWaterfall, chart: WaterfallChart) {
  const slide = pptx.addSlide();
  slide.background = { color: COLOR.surface };
  slide.addShape(pptx.ShapeType.line, { x: 0, y: 2 / 72, w: 10, h: 0, line: { color: COLOR.brand, width: 4 }, objectName: "A2|rule|line" });
  slide.addText(bridge.title, { x: 0.4, y: 0.1, w: 9.2, h: 0.44, fontFace: FONT, fontSize: pptxTitleSize(bridge.title), bold: true, color: COLOR.ink, margin: 0, valign: "middle", objectName: "A2|title|text" });
  slide.addText(fill(labels.exports.headerV3.periodUnitLine, { period: bridge.subtitle, unit: labels.exports.headerV3.unitExclusive }), { x: 0.4, y: 0.56, w: 9.2, h: 0.2, fontFace: FONT, fontSize: MIN_FONT_PT, color: COLOR.muted, margin: 0, valign: "top", objectName: "A2|subtitle|text" });
  addWaterfallChart(pptx, slide, chart, { x: 0.4, y: 0.9, w: 9.2, h: 4.25 }, "A2|waterfall|chart");
}
/** writePptx 不能改；在它呼叫 write() 之前（只攔一次）加上第二張，第一張就是現行程式產生的那一張。 */
async function writeLayoutA(model: PptxOnePager, bridge: BridgeWaterfall, chart: WaterfallChart): Promise<Uint8Array> {
  const original = PptxGenJS.prototype.write;
  const spy = vi.spyOn(PptxGenJS.prototype, "write").mockImplementationOnce(function (this: PptxGenJS, props) {
    addBridgeSlide(this, bridge, chart);
    return original.call(this, props);
  });
  try { return await writePptx(model); } finally { spy.mockRestore(); }
}

/** 第一張的區塊與各自一定要出現的文字（v3 一頁式的既有區塊）。 */
function onePagerBlocks(model: PptxOnePager): Record<string, string[]> {
  const blocks: Record<string, string[]> = {
    kpi: [labels.overview.sections.keyDeltas, ...model.key_deltas.flatMap(row => [row.label, ...pptxKpiRuns(row.change).map(run => run.text)])],
    topThree: [labels.overview.sections.topThree, ...model.priorities.map((row, index) => fill(copy.priorityRow, { n: index + 1, headline: row.headline }))],
    decision: model.decision ? [labels.meeting.sections.meetingDecision, model.decision] : [],
  };
  if (model.one_liner) blocks.oneLiner = [model.one_liner];
  if (model.channels.length) blocks.channels = model.channels.flatMap(row => [row.channel, row.previous, row.current, row.change]);
  if (model.variant !== "boss") blocks.pinned = [copy.pinnedTitle, ...model.pinned_actions.map((row, index) => fill(copy.pinnedRow, { n: index + 1, problem: row.problem }))];
  return blocks;
}
const runsContain = (runs: readonly string[], value: string) => runs.includes(value) || runs.some(run => run.includes(value)) || runs.join("").includes(value);

async function layoutAChecks(model: PptxOnePager, bridge: BridgeWaterfall, chart: WaterfallChart) {
  const baseline = unzip(await writePptx(model));
  const bytes = await writeLayoutA(model, bridge, chart);
  const { files } = unzip(bytes);
  const slides = [...files.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)).sort();
  const slide1 = text(files, "ppt/slides/slide1.xml"), slide2 = text(files, "ppt/slides/slide2.xml");
  const runs1 = slideRuns(slide1);
  const blocks = Object.entries(onePagerBlocks(model)).map(([block, values]) => ({ block, missing: values.filter(value => !runsContain(runs1, value)) }));
  const objects2 = slideObjects(slide2);
  const chartXml = text(files, chartPartsOf(files)[0]);
  const slide2Rels = text(files, "ppt/slides/_rels/slide2.xml.rels");
  const media = [...files.entries()].filter(([name, data]) => name.startsWith("ppt/media/") && data.length > 0);
  const sizes = [...fontSizes(slide1), ...fontSizes(slide2), ...fontSizes(chartXml)];
  return {
    bytes,
    checks: {
      twoSlides: check(slides.length === 2, `slides=${JSON.stringify(slides)}`),
      slide1Unchanged: check(slide1 === text(baseline.files, "ppt/slides/slide1.xml"), `slide1.xml ${slide1.length} chars; identical to writePptx() without the second slide=${slide1 === text(baseline.files, "ppt/slides/slide1.xml")}`),
      slide1BlocksPresent: check(blocks.every(item => item.missing.length === 0), blocks.map(item => `${item.block}:${item.missing.length ? `missing ${item.missing.length}` : "ok"}`).join(", ")),
      slide2OnlyWaterfall: check(objects2.filter(object => object.kind === "chart").length === 1 && objects2.every(object => object.kind !== "table") && slide2Rels.includes("relationships/chart"),
        objects2.map(object => `${object.kind}:${object.name}`).join(", ")),
      slide2UnitAndPeriod: check(runsContain(slideRuns(slide2), labels.exports.headerV3.unitExclusive) && runsContain(slideRuns(slide2), bridge.subtitle), `slide2 runs=${JSON.stringify(slideRuns(slide2))}`),
      noMediaParts: check(media.length === 0 && !slide2.includes("<p:pic"), `ppt/media files=${media.length}`),
      fontsAtLeast10pt: check(Math.min(...sizes) >= MIN_FONT_PT, `min sz=${Math.min(...sizes)}pt over slide1, slide2 and chart`),
    },
  };
}

// ── 版面 B：單張內縮排，把一句話、KPI、三件事、通路表、決議、置頂待辦與瀑布全部放進去（只為試排） ──
/** 估計需要的高度（英吋）：行數 × 字級 × 1.33em（微軟正黑體行高，同 pptx-export.ts 的估計）。 */
const linesHeight = (lines: number, sizePt: number) => lines * sizePt * 1.33 / 72;
const capacityOf = (widthIn: number, sizePt: number) => Math.floor((widthIn * 72) / sizePt);
function fitLines(value: string, capacity: number, maxLines: number): string {
  let result = value;
  while (Array.from(result).length > 1 && estimatedLines(result, capacity) > maxLines) result = pptxText(result, Array.from(result).length - 1);
  return result;
}
/** neededH：依估計行數與字級算出的文字高度（英吋），和框高比較。 */
interface BBox { name: string; text: string; full: string; rect: Rect; neededH: number }
const B_RULES = {
  /** 表格後的緩衝（pptx-export.ts 的 CHANNEL_TABLE_GAP：PowerPoint 依內容撐高列，Quick Look 以 PingFang 繪製更高）。 */
  tableGap: 0.16,
  titlePt: 18, oneLinerPt: 11, kpiNumberPt: 24, kpiUnitPt: 14, bodyPt: MIN_FONT_PT, headingPt: 11,
  headingH: 0.24, gap: 0.04, kpiCardH: 0.82, kpiCardW: 2.15, kpiGap: 0.1, maxChannelRows: 2,
  left: { x: 0.4, w: 4.4 }, right: { x: 5.0, w: 4.6 }, full: { x: 0.4, w: 9.2 },
} as const;

async function writeLayoutB(model: PptxOnePager, oneLiner: string, bridge: BridgeWaterfall, chart: WaterfallChart) {
  const pptx = newDeck();
  const slide = pptx.addSlide();
  slide.background = { color: COLOR.surface };
  const R = B_RULES;
  const boxes: BBox[] = [];
  const base = { fontFace: FONT, color: COLOR.ink, margin: 0, valign: "top" as const };
  const addBox = (name: string, full: string, sizePt: number, rect: Rect, maxLines: number, options: Partial<PptxGenJS.TextPropsOptions> = {}) => {
    const fitted = fitLines(full, capacityOf(rect.w, sizePt), maxLines);
    slide.addText(fitted, { ...base, ...rect, fontSize: sizePt, objectName: name, ...options });
    boxes.push({ name, text: fitted, full, rect, neededH: linesHeight(estimatedLines(fitted, capacityOf(rect.w, sizePt)), sizePt) });
  };
  const heading = (name: string, value: string, x: number, y: number, w: number) => addBox(name, value, R.headingPt, { x, y, w, h: R.headingH }, 1, { bold: true, valign: "middle" });

  // 版頭：頂線、標題（B：18pt）、版頭三行 10pt。
  slide.addShape(pptx.ShapeType.line, { x: 0, y: 2 / 72, w: 10, h: 0, line: { color: COLOR.brand, width: 4 }, objectName: "B|rule|line" });
  addBox("B|header|title", model.title, R.titlePt, { x: R.full.x, y: 0.08, w: R.full.w, h: 0.34 }, 1, { bold: true, valign: "middle" });
  const headerLines = model.header.slice(0, 3);
  slide.addText(headerLines.map((line, index) => ({ text: line, options: index < headerLines.length - 1 ? { breakLine: true } : {} })), { ...base, x: R.full.x, y: 0.44, w: R.full.w, h: 0.51, fontSize: R.bodyPt, color: COLOR.muted, objectName: "B|header|lines" });
  boxes.push({ name: "B|header|lines", text: headerLines.join(""), full: headerLines.join(""), rect: { x: R.full.x, y: 0.44, w: R.full.w, h: 0.51 }, neededH: linesHeight(headerLines.length, R.bodyPt) });

  // 一句話（11pt 粗體，最多兩行）。
  const oneLinerLines = Math.min(2, estimatedLines(oneLiner, capacityOf(R.full.w, R.oneLinerPt)));
  const oneLinerH = 0.04 + linesHeight(oneLinerLines, R.oneLinerPt);
  addBox("B|oneLiner|text", oneLiner, R.oneLinerPt, { x: R.full.x, y: 1.0, w: R.full.w, h: oneLinerH }, 2, { bold: true });
  const bodyTop = 1.0 + oneLinerH + R.gap;

  // 左欄：KPI（數字 24pt、單位 14pt）→ 三件事（每項一行，下一步截斷）。
  let left = bodyTop;
  heading("B|kpi|heading", labels.overview.sections.keyDeltas, R.left.x, left, R.left.w);
  left += R.headingH;
  model.key_deltas.slice(0, 2).forEach((row, index) => {
    const runs = pptxKpiRuns(row.change).map((run, part, all) => ({ text: run.text, options: { fontSize: part === 0 ? R.kpiNumberPt : R.kpiUnitPt, bold: true, color: row.change.startsWith(MINUS) ? COLOR.unfavorable : COLOR.favorable, ...(part === all.length - 1 ? { breakLine: true } : {}) } }));
    const rect = { x: R.left.x + index * (R.kpiCardW + R.kpiGap), y: left, w: R.kpiCardW, h: R.kpiCardH };
    slide.addText([
      { text: row.label, options: { fontSize: R.bodyPt, color: COLOR.muted, breakLine: true } },
      ...runs,
      { text: `${labels.shell.periods.previous} ${row.previous}${copy.separator}${labels.shell.periods.current} ${row.current}`, options: { fontSize: R.bodyPt, color: COLOR.muted } },
    ], { ...base, ...rect, objectName: `B|kpi|card${index + 1}` });
    const meta = `${labels.shell.periods.previous} ${row.previous}${copy.separator}${labels.shell.periods.current} ${row.current}`;
    boxes.push({ name: `B|kpi|card${index + 1}`, text: `${row.label}${row.change}${meta}`, full: `${row.label}${row.change}${meta}`, rect, neededH: linesHeight(1, R.bodyPt) + linesHeight(1, R.kpiNumberPt) + linesHeight(estimatedLines(meta, capacityOf(R.kpiCardW, R.bodyPt)), R.bodyPt) });
  });
  left += R.kpiCardH + R.gap;
  heading("B|topThree|heading", labels.overview.sections.topThree, R.left.x, left, R.left.w);
  left += R.headingH;
  model.priorities.forEach((row, index) => {
    const full = `${fill(copy.priorityRow, { n: index + 1, headline: row.headline })}${copy.separator}${fill(copy.priorityDetail, { impactLabel: labels.overview.sections.impact, nextStepLabel: labels.diagnosis.sections.nextStep, impact: row.impact, nextStep: row.next_step })}`;
    const h = 0.02 + linesHeight(1, R.bodyPt);
    addBox(`B|topThree|item${index + 1}`, full, R.bodyPt, { x: R.left.x, y: left, w: R.left.w, h }, 1);
    left += h;
  });

  // 右欄：通路表（最多 2 列＋「另有 n 個通路」）→ 決議一行 → 置頂待辦（每項一行）。
  let right = bodyTop;
  heading("B|channels|heading", fill(copy.channelTitle, { table: labels.overview.sections.channelTable, metric: labels.metrics.contribution_after_marketing.headline }), R.right.x, right, R.right.w);
  right += R.headingH;
  const shown = model.channels.slice(0, R.maxChannelRows), omitted = model.channels.length - shown.length;
  const table = pptxChannelRows(shown);
  const cell = (value: string, options: PptxGenJS.TableCellProps = {}): PptxGenJS.TableCell => ({ text: value, options: { fontFace: FONT, fontSize: R.bodyPt, color: COLOR.ink, margin: [0.02, 0.06, 0.02, 0.06], valign: "middle", ...options } });
  slide.addTable([
    [cell(labels.exports.csv.columns.channel, { bold: true, fill: { color: COLOR.headerFill } }), cell(labels.shell.periods.previous, { bold: true, align: "right", fill: { color: COLOR.headerFill } }), cell(labels.shell.periods.current, { bold: true, align: "right", fill: { color: COLOR.headerFill } }), cell(labels.exports.csv.suffix.change, { bold: true, align: "right", fill: { color: COLOR.headerFill } })],
    ...shown.map(row => [cell(row.channel), cell(row.previous, { align: "right", fontFace: NUMBER_FONT }), cell(row.current, { align: "right", fontFace: NUMBER_FONT, color: COLOR.brand }), cell(row.change, { align: "right", fontFace: NUMBER_FONT, color: row.change.startsWith(MINUS) ? COLOR.unfavorable : COLOR.favorable })]),
    ...(omitted ? [[cell(fill(copy.channelsMore, { n: omitted }), { colspan: 4, color: COLOR.muted })]] : []),
  ], { x: R.right.x, y: right, w: R.right.w, colW: [1.15, 1.15, 1.15, 1.15], rowH: 0.24, border: { type: "solid", pt: 0.5, color: COLOR.line }, autoPage: false, objectName: "B|channels|table" });
  const tableH = table.height + (omitted ? 0.28 : 0);
  boxes.push({ name: "B|channels|table", text: shown.map(row => row.channel).join(""), full: model.channels.map(row => row.channel).join(""), rect: { x: R.right.x, y: right, w: R.right.w, h: tableH }, neededH: tableH });
  right += tableH + R.tableGap;
  heading("B|decision|heading", labels.meeting.sections.meetingDecision, R.right.x, right, R.right.w);
  right += R.headingH;
  const decisionH = 0.02 + linesHeight(1, R.bodyPt);
  addBox("B|decision|text", model.decision, R.bodyPt, { x: R.right.x, y: right, w: R.right.w, h: decisionH }, 1);
  right += decisionH + R.gap;
  heading("B|pinned|heading", copy.pinnedTitle, R.right.x, right, R.right.w);
  right += R.headingH;
  model.pinned_actions.forEach((row, index) => {
    const full = `${fill(copy.pinnedRow, { n: index + 1, problem: row.problem })}${copy.separator}${fill(copy.pinnedMeta, { ownerLabel: labels.actions.form.owner, owner: row.owner, dueLabel: labels.actions.form.due, deadline: row.deadline, status: row.status })}`;
    const h = 0.02 + linesHeight(1, R.bodyPt);
    addBox(`B|pinned|item${index + 1}`, full, R.bodyPt, { x: R.right.x, y: right, w: R.right.w, h }, 1);
    right += h;
  });

  // 瀑布：兩欄之下的全寬帶，高度＝內容區下緣以上剩下的空間。
  const bandTop = Math.max(left, right) + R.gap;
  heading("B|waterfall|heading", bridge.title, R.full.x, bandTop, R.full.w);
  const chartRect = { x: R.full.x, y: bandTop + R.headingH, w: R.full.w, h: Math.max(0.2, PAGE_BODY_BOTTOM - bandTop - R.headingH) };
  addWaterfallChart(pptx, slide, chart, chartRect, "B|waterfall|chart");
  addBox("B|footer|text", `${model.footer}${model.technical ? `${copy.separator}${model.technical}` : ""}`, R.bodyPt, { x: R.full.x, y: 5.2, w: R.full.w, h: 0.36 }, 2, { color: COLOR.muted, valign: "bottom" });
  return { bytes: await toBytes(pptx), boxes, chartRect, bodyTop, columns: { left, right } };
}

async function layoutBChecks(model: PptxOnePager, oneLiner: string, bridge: BridgeWaterfall, chart: WaterfallChart, layoutAChartH: number) {
  const written = await writeLayoutB(model, oneLiner, bridge, chart);
  const { files } = unzip(written.bytes);
  const slides = [...files.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name));
  const slide = text(files, "ppt/slides/slide1.xml");
  const chartXml = text(files, chartPartsOf(files)[0]);
  const runs = slideRuns(slide);
  const required: Record<string, string[]> = {
    oneLiner: [oneLiner],
    kpi: model.key_deltas.flatMap(row => [row.label, ...pptxKpiRuns(row.change).map(run => run.text), row.previous, row.current]),
    topThree: model.priorities.flatMap((row, index) => [fill(copy.priorityRow, { n: index + 1, headline: row.headline }), row.impact, row.next_step]),
    channels: model.channels.flatMap(row => [row.channel, row.previous, row.current, row.change]),
    decision: [model.decision],
    pinned: model.pinned_actions.flatMap((row, index) => [fill(copy.pinnedRow, { n: index + 1, problem: row.problem }), row.owner, row.deadline, row.status]),
  };
  const presence = Object.fromEntries(Object.entries(required).map(([block, values]) => [block, { present: values.filter(value => runsContain(runs, value)).length, total: values.length, missing: values.filter(value => !runsContain(runs, value)) }]));
  const objects = slideObjects(slide).filter(object => object.kind !== "line");
  const blockOf = (name: string) => name.split("|")[1];
  const blockRects = new Map<string, Rect>();
  for (const object of objects) {
    const block = blockOf(object.name);
    const known = blockRects.get(block);
    const box = written.boxes.find(item => item.name === object.name);
    // 表格的框高以 pptx-export 的列高估計為準（PowerPoint 會依內容撐高列）。
    const h = object.kind === "table" && box ? box.rect.h : object.h;
    const rect = { x: object.x, y: object.y, w: object.w, h };
    blockRects.set(block, known ? { x: Math.min(known.x, rect.x), y: Math.min(known.y, rect.y), w: Math.max(known.x + known.w, rect.x + rect.w) - Math.min(known.x, rect.x), h: Math.max(known.y + known.h, rect.y + rect.h) - Math.min(known.y, rect.y) } : rect);
  }
  const overlaps: string[] = [];
  const entries = [...blockRects.entries()];
  entries.forEach(([a, ra], i) => entries.slice(i + 1).forEach(([b, rb]) => {
    const epsilon = 1e-6;
    if (ra.x < rb.x + rb.w - epsilon && rb.x < ra.x + ra.w - epsilon && ra.y < rb.y + rb.h - epsilon && rb.y < ra.y + ra.h - epsilon) overlaps.push(`${a}x${b}`);
  }));
  const outside = entries.filter(([block, rect]) => block !== "footer" && block !== "header" && rect.y + rect.h > PAGE_BODY_BOTTOM + 1e-6).map(([block, rect]) => `${block} bottom ${(rect.y + rect.h).toFixed(2)}`);
  const truncated = written.boxes.filter(box => box.text !== box.full).map(box => box.name);
  const overflow = written.boxes.filter(box => box.neededH > box.rect.h + 0.02).map(box => `${box.name} needs ${box.neededH.toFixed(2)}in > ${box.rect.h.toFixed(2)}in`);
  const sizes = [...fontSizes(slide), ...fontSizes(chartXml)];
  const pitch = written.chartRect.w / chart.categories.length;
  const longestLabel = Math.max(...chart.series.flatMap(series => series.exact.filter(value => value !== "0").map(value => Array.from(dataLabelText(value)).length)));
  const blocksKeptFully = Object.values(presence).every(item => item.missing.length === 0);
  // 同一個估計套在現行一頁式（版頭三行 0.51 英吋、KPI 卡 1.0 英吋、數字 36pt）上的結果，作為 estimatedTextFitsBoxes 的對照。
  const currentKpiNeeds = Math.max(...model.key_deltas.map(row => linesHeight(1, MIN_FONT_PT) + linesHeight(1, Math.max(...pptxKpiRuns(row.change).map(run => run.size)))
    + linesHeight(estimatedLines(`${labels.shell.periods.previous} ${row.previous}${copy.separator}${labels.shell.periods.current} ${row.current}`, capacityOf(B_RULES.kpiCardW, MIN_FONT_PT)), MIN_FONT_PT)));
  return {
    bytes: written.bytes,
    checks: {
      singleSlide: check(slides.length === 1, `slides=${slides.length}`),
      allBlocksPresent: check(Object.values(presence).every(item => item.present > 0) && objects.some(object => object.kind === "chart"),
        Object.entries(presence).map(([block, item]) => `${block} ${item.present}/${item.total}`).join(", ") + `; waterfall chart=${objects.some(object => object.kind === "chart")}`),
      allBlockTextKeptInFull: check(blocksKeptFully, Object.entries(presence).filter(([, item]) => item.missing.length).map(([block, item]) => `${block} lost ${item.missing.length}: ${JSON.stringify(item.missing.map(value => Array.from(value).length > 24 ? `${Array.from(value).slice(0, 24).join("")}...` : value))}`).join("; ") || "every block string present"),
      blocksDoNotOverlap: check(overlaps.length === 0, overlaps.join(", ") || `${entries.length} block rectangles from slide XML, pairwise disjoint`),
      blocksInsideBody: check(outside.length === 0, outside.join(", ") || `every block bottom <= ${PAGE_BODY_BOTTOM}in (footer excluded)`),
      fontsAtLeast10pt: check(Math.min(...sizes) >= MIN_FONT_PT, `min sz=${Math.min(...sizes)}pt over slide and chart`),
      estimatedTextFitsBoxes: check(overflow.length === 0, overflow.join("; ") || "estimated lines x 1.33em fit every text box"),
    },
    compressionRules: [
      `title ${B_RULES.titlePt}pt (v3 PRD 9.6 spec ${SPEC_TITLE_PT}pt)`,
      `one-liner ${B_RULES.oneLinerPt}pt bold, at most 2 lines (boss variant uses 16pt)`,
      `KPI change ${B_RULES.kpiNumberPt}pt number + ${B_RULES.kpiUnitPt}pt unit (spec ${SPEC_KPI_PT}pt / 20pt)`,
      "three things: one line per item (headline, impact and next step joined, cut at the box width)",
      `channel table: at most ${B_RULES.maxChannelRows} rows plus a remainder row (standard layout allows 4)`,
      "decision: one line; pinned actions: one line per item (problem, owner, due, status joined, cut at the box width)",
      "waterfall: full-width band below both columns, height = space left above the 5.18in body bottom",
    ],
    measured: {
      truncatedBoxes: truncated,
      chartHeightIn: Number(written.chartRect.h.toFixed(2)),
      layoutAChartHeightIn: layoutAChartH,
      chartHeightVsLayoutA: Number((written.chartRect.h / layoutAChartH).toFixed(2)),
      chartTopIn: Number(written.chartRect.y.toFixed(2)),
      categoryPitchIn: Number(pitch.toFixed(2)),
      longestDataLabelChars: longestLabel,
      dataLabelWidthIn10pt: Number((longestLabel * 0.56 * MIN_FONT_PT / 72).toFixed(2)),
      columnBottomsIn: { left: Number(written.columns.left.toFixed(2)), right: Number(written.columns.right.toFixed(2)) },
      // 另一種放法（不另產生檔案，只算尺寸）：瀑布放在左欄三件事之下。
      alternativeLeftColumnChart: (() => {
        const h = PAGE_BODY_BOTTOM - written.columns.left - B_RULES.gap - B_RULES.headingH;
        return { wIn: B_RULES.left.w, hIn: Number(h.toFixed(2)), categoryPitchIn: Number((B_RULES.left.w / chart.categories.length).toFixed(2)) };
      })(),
      deviationsFromV3Spec: [`title ${B_RULES.titlePt}pt < ${SPEC_TITLE_PT}pt`, `KPI ${B_RULES.kpiNumberPt}pt < ${SPEC_KPI_PT}pt`],
      estimateOnCurrentOnePager: { headerNeedsIn: Number(linesHeight(3, MIN_FONT_PT).toFixed(2)), headerBoxIn: 0.51, kpiCardNeedsIn: Number(currentKpiNeeds.toFixed(2)), kpiCardBoxIn: 1.0 },
    },
  };
}

// ── 測試 ──
let demo: ActionSource;
let summary: ManagerSummary;
let actions: ActionWorkspace;
const report: Record<string, unknown> = {};
beforeAll(async () => {
  demo = await load("demo");
  summary = buildManagerSummary(demo.snapshot);
  actions = pinnedActions(demo);
});
afterEach(() => { vi.restoreAllMocks(); });

describe("V4-0b pptxgenjs addChart spike（D-V4-10、D-V4-34；只產生與解析，不接線）", () => {
  const decks: Record<string, Uint8Array> = {};

  it("demo data: a chart-only waterfall slide is generated and its chart XML and embedded workbook parse", async () => {
    const bridge = bridgeWaterfall(demo.snapshot);
    const chart = waterfallChart(bridge.bars);
    const bytes = await chartOnlyDeck(chart);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    const result = chartChecks(bytes, bridge.bars, chart);
    expect(result.chartParts.length).toBeGreaterThan(0);
    expect(result.embeddings.length).toBeGreaterThan(0);
    expect(result.seriesNames.length).toBeGreaterThan(0);
    // 資料標籤的替代作法探針：關掉 showValue、用 layout 固定繪圖區（manualLayout inner），之後才能在圖上用文字方塊標值。
    const probeFiles = unzip(await chartOnlyDeck(chart, { showValue: false, layout: { x: 0.08, y: 0.04, w: 0.9, h: 0.84 } })).files;
    const probeXml = text(probeFiles, chartPartsOf(probeFiles)[0]);
    const probe = parseChart(probeXml);
    report.demo = {
      dataset: demo.snapshot.report.dataset_id, bars: bridge.bars.length,
      labelWorkaroundProbe: {
        options: "showValue false, layout { x: 0.08, y: 0.04, w: 0.9, h: 0.84 }",
        allSeriesLabelsOff: probe.series.every(series => !series.showVal),
        manualInnerPlotLayout: /<c:manualLayout>\s*<c:layoutTarget val="inner" \/>/.test(probeXml),
      },
      crossesZero: bridge.bars.some(bar => bar.kind === "delta" && new Decimal(bar.start!).times(new Decimal(bar.end!)).lt(0)),
      negativeCurrent: new Decimal(bridge.bars[bridge.bars.length - 1].end!).lt(0),
      ...result,
    };
  });

  it("synthetic bridge (crossing 0, below 0, negative current): generated and parsed", async () => {
    const bridge = bridgeWaterfall(syntheticSnapshot(demo.snapshot));
    expect(bridge.balanced).toBe(true);
    const chart = waterfallChart(bridge.bars);
    const bytes = await chartOnlyDeck(chart);
    decks.synthetic = bytes;
    const result = chartChecks(bytes, bridge.bars, chart);
    expect(result.chartParts.length).toBeGreaterThan(0);
    expect(result.embeddings.length).toBeGreaterThan(0);
    report.synthetic = {
      previous: SYNTHETIC_PREVIOUS, components: Object.fromEntries(AMOUNT_FIELDS.map((field, index) => [field, SYNTHETIC_COMPONENTS[index]])), current: bridge.bars[bridge.bars.length - 1].end,
      crossesZero: bridge.bars.filter(bar => bar.kind === "delta" && new Decimal(bar.start!).times(new Decimal(bar.end!)).lt(0)).map(bar => bar.id),
      negativeCurrent: new Decimal(bridge.bars[bridge.bars.length - 1].end!).lt(0),
      ...result,
    };
  });

  it("layout A (D-V4-34 A): the existing one-pager plus a second slide with only the waterfall is generated and parsed", async () => {
    const bridge = bridgeWaterfall(demo.snapshot);
    const chart = waterfallChart(bridge.bars);
    const variants = {} as Record<string, unknown>;
    for (const variant of ["standard", "boss", "client"] as const) {
      // V4-9a 起 writePptx 依 model.charts 自己加第二張（C32）；spike 重現的是 v3 一頁式之後再加一張，所以 charts 清空。
      const model = { ...buildPptxOnePager({ variant, summary, snapshot: demo.snapshot, actions, meeting: MEETING, generatedAt: GENERATED_AT }), charts: [] };
      const result = await layoutAChecks(model, bridge, chart);
      expect(String.fromCharCode(result.bytes[0], result.bytes[1])).toBe("PK");
      expect(Object.keys(result.checks).length).toBeGreaterThan(0);
      if (variant === "standard") decks.A = result.bytes;
      variants[variant] = result.checks;
    }
    // writePptx 之後 write() 回到原樣（沒有殘留的第二張）。
    const plain = unzip(await writePptx({ ...buildPptxOnePager({ summary, snapshot: demo.snapshot, actions, generatedAt: GENERATED_AT }), charts: [] }));
    expect([...plain.files.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toEqual(["ppt/slides/slide1.xml"]);
    report.layoutA = { file: "pptx-spike-A.pptx", slide2: { chart: { x: 0.4, y: 0.9, w: 9.2, h: 4.25 }, categoryPitchIn: Number((9.2 / chart.categories.length).toFixed(2)) }, variants };
  });

  it("layout B (D-V4-34 B): one slide with every block and the waterfall is generated and parsed", async () => {
    const bridge = bridgeWaterfall(demo.snapshot);
    const chart = waterfallChart(bridge.bars);
    const model = buildPptxOnePager({ summary, snapshot: demo.snapshot, actions, meeting: MEETING, generatedAt: GENERATED_AT });
    const boss = buildPptxOnePager({ variant: "boss", summary, snapshot: demo.snapshot, actions, meeting: MEETING, generatedAt: GENERATED_AT });
    const result = await layoutBChecks(model, boss.one_liner!, bridge, chart, 4.25);
    expect(String.fromCharCode(result.bytes[0], result.bytes[1])).toBe("PK");
    expect(Object.keys(result.checks).length).toBeGreaterThan(0);
    decks.B = result.bytes;
    report.layoutB = { file: "pptx-spike-B.pptx", base: "standard variant blocks plus the boss one-liner (union of all six blocks)", checks: result.checks, compressionRules: result.compressionRules, measured: result.measured };
  });

  it("writes the evidence JSON and the decks only when PPTX_SPIKE_OUT is set", () => {
    if (!OUT) { expect(OUT).toBeFalsy(); return; }
    const out = resolve(OUT);
    const dir = dirname(out);
    mkdirSync(dir, { recursive: true });
    const files = { A: "pptx-spike-A.pptx", B: "pptx-spike-B.pptx", synthetic: "pptx-spike-synthetic.pptx" } as const;
    for (const [key, name] of Object.entries(files)) writeFileSync(join(dir, name), decks[key]);
    const evidence = {
      spike: "V4-0b item 1: pptxgenjs addChart waterfall (D-V4-10) and slide placement trial (D-V4-34)",
      command: "PPTX_SPIKE_OUT=verification/revamp-v4/V4-0b/pptx-spike.json npx vitest run tests/pptx-chart-spike.test.ts",
      library: "pptxgenjs 4.0.1 (addChart bar, barGrouping stacked); parsed with xlsx 0.18.5 XLSX.CFB.read and XLSX.read",
      decks: files,
      seriesNames: SERIES_NAME,
      seriesColors: Object.fromEntries(SERIES_ORDER.map(key => [key, SERIES_COLOR[key] === "transparent" ? "noFill" : `EXPORT_THEME.${SERIES_COLOR[key]}`])),
      dataLabelFormatCode: LABEL_FORMAT,
      valueAxisFormatCode: AXIS_FORMAT,
      ...report,
    };
    writeFileSync(out, `${JSON.stringify(evidence, null, 2)}\n`);
    expect(decks.A && decks.B && decks.synthetic).toBeTruthy();
  });
});
