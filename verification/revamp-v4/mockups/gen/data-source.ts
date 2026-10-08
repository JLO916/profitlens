import Decimal from "decimal.js";
import { channelLabel, channelsLabel, conversionSentence } from "@/application/copy";
import { parseEvents, type EventSet } from "@/application/events";
import { inspectImportFile, issueMessageParts, prepareImport } from "@/application/import";
import { periodPresets } from "@/application/period-presets";
import { formatAmountL3, formatCount, formatDateL1, formatPeriodL1, formatRateL2 } from "@/application/presentation";
import { DEFAULT_CONVERSION_FIELDS, DEFAULT_TAX_RATE, type TaxConversion } from "@/application/tax-basis";
import type { FileName, MetricName, ValidationIssue } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { responsive, type Breakpoint } from "./charts";
import { pairCell, timelineSvg, type DateRange, type TimelineGeometry, type TimelineTrack } from "./charts-c2";
import { pageDocument } from "./chrome";
import { addDays, esc, md } from "./format";
import { chartFrame, dataTable, ProposalBook, trialNote, v4 } from "./html";
import { PANEL_INNER, type PageOutput } from "./overview";
import { CSV_FILES, type MockupSource } from "./source";
import { colors } from "./theme";

// H5 設計稿：資料來源（4 通路合成資料；示範資料沒有缺列與問題）。由上到下依 PRD §5.7：資料狀態一行（v3）、G20 涵蓋時間軸（新增）、
// 資料完整性問題（v3）內的 G21 問題分布表（新增）與問題表（篩選片語與清除鈕為 V4-7a 新增）、範圍與金額基準、本次匯入的前處理（G22 成對條）、
// 選填資料、來源檔案、版本與來源資訊、匯入範本（後五段 v3 不變，只畫外觀當上下文）。

type FileKey = "sales" | "costs" | "ads";
const FILE_KEYS: Record<FileName, FileKey> = { "sales_daily.csv": "sales", "channel_costs_daily.csv": "costs", "ad_spend_daily.csv": "ads" };
/** 缺列的原因碼（src/domain/validation.ts 的逐日檢查；帶 date、channel、line: null）。 */
const MISSING_REASONS: Record<FileName, string | null> = { "sales_daily.csv": null, "channel_costs_daily.csv": "MISSING_CHANNEL_COST_DAY", "ad_spend_daily.csv": "MISSING_AD_DAY" };
/** G20 的軌道標籤與右端欄寬（px）：≤ 767 縮窄。 */
const TRACK_LABEL_WIDTH: Record<Breakpoint, number> = { xl: 72, lg: 72, md: 64, sm: 60 };
const TRACK_END_WIDTH: Record<Breakpoint, number> = { xl: 72, lg: 72, md: 64, sm: 60 };
/** G20「去年同期」示意狀態假設的檔案起日（合成資料與示範資料都沒有一年前的資料）。 */
const YOY_MOCK_COVERAGE_START = "2025-09-01";
/** 檔期軌示意：合成資料不帶 events.csv，依廣告檔 MARKETPLACE 的加碼日（9/11–9/13、9/18–9/20）假設兩段檔期。 */
const MOCK_EVENTS_CSV = "start,end,label\n2026-09-11,2026-09-13,秋季檔期一\n2026-09-18,2026-09-20,秋季檔期二\n";

const fileTitle = (file: FileName) => labels.importWizard.files[FILE_KEYS[file]];
const dataPanel = labels.data.panel;
const pageV3 = labels.data.pageV3;

/** 連續日期合併成區段（設計稿試算；正式由 V4-7a 的 coverageTimeline／coverage-timeline-v1 產生）。 */
export function mergeDates(dates: readonly string[]): DateRange[] {
  const sorted = [...new Set(dates)].sort();
  const ranges: DateRange[] = [];
  for (const date of sorted) {
    const last = ranges[ranges.length - 1];
    if (last && addDays(last.end, 1) === date) last.end = date;
    else ranges.push({ start: date, end: date });
  }
  return ranges;
}
const datesBetween = (start: string, end: string) => { const out: string[] = []; for (let date = start; date <= end; date = addDays(date, 1)) out.push(date); return out; };
const daysOf = (range: DateRange) => datesBetween(range.start, range.end).length;

export interface CoverageSegment { file: FileName; channel: string; reason: string; start: string; end: string; days: number }

/**
 * G20 設計稿試算（coverage-timeline-v1 到位前）：缺列問題（MISSING_CHANNEL_COST_DAY、MISSING_AD_DAY）依檔 × 通路合併成連續區段；
 * 銷售有列＝有任何銷售列的日期，其餘是「無列」；通路費用與廣告「有列」＝沒有任何通路缺列的日期。
 */
export function coverageTrial(source: MockupSource): { segments: CoverageSegment[]; salesRows: DateRange[]; salesNoRows: DateRange[]; fileRows: Record<"costs" | "ads", DateRange[]> } {
  const { dataset } = source;
  const { coverage_start: start, coverage_end: end } = dataset.manifest;
  const all = datesBetween(start, end);
  const segments: CoverageSegment[] = [];
  const missingDates: Record<"costs" | "ads", Set<string>> = { costs: new Set(), ads: new Set() };
  for (const file of CSV_FILES) {
    const reason = MISSING_REASONS[file];
    if (!reason) continue;
    const issues = dataset.issues.filter(issue => issue.file === file && issue.reason_code === reason && issue.date && issue.channel);
    for (const channel of [...new Set(issues.map(issue => issue.channel!))].sort()) {
      for (const range of mergeDates(issues.filter(issue => issue.channel === channel).map(issue => issue.date!))) segments.push({ file, channel, reason, ...range, days: daysOf(range) });
    }
    for (const issue of issues) missingDates[FILE_KEYS[file] as "costs" | "ads"].add(issue.date!);
  }
  const salesDates = new Set(dataset.sales.map(row => row.date));
  return {
    segments,
    salesRows: mergeDates(all.filter(date => salesDates.has(date))),
    salesNoRows: mergeDates(all.filter(date => !salesDates.has(date))),
    fileRows: { costs: mergeDates(all.filter(date => !missingDates.costs.has(date))), ads: mergeDates(all.filter(date => !missingDates.ads.has(date))) },
  };
}

/** G21 設計稿試算（issue-distribution-v1 到位前）：列級問題（有 line 或 date）依檔案 × 原因碼計數；範圍級另列；每檔最多的原因（同值依原因碼排序）。 */
export function distributionTrial(issues: readonly ValidationIssue[]): { reasons: string[]; cells: Record<string, Record<string, number>>; maxReason: Record<string, string | null>; rowLevel: number; rangeLevel: number } {
  const rowLevel = issues.filter(issue => issue.line !== null || issue.date !== undefined);
  const reasons = [...new Set(rowLevel.map(issue => issue.reason_code))];
  const cells: Record<string, Record<string, number>> = {};
  for (const file of CSV_FILES) cells[file] = Object.fromEntries(reasons.map(reason => [reason, rowLevel.filter(issue => issue.file === file && issue.reason_code === reason).length]));
  const maxReason = Object.fromEntries(CSV_FILES.map(file => {
    const ranked = Object.entries(cells[file]).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
    return [file, ranked[0]?.[0] ?? null];
  }));
  return { reasons, cells, maxReason, rowLevel: rowLevel.length, rangeLevel: issues.length - rowLevel.length };
}

/** G22 示意：把同一份合成資料當成「含稅 5%」匯入，用既有的 inspectImportFile 與 prepareImport 換算，取 TaxConversion.totals（含稅原值與未稅換算值）。 */
export function inclusiveConversionMock(source: MockupSource): TaxConversion | null {
  const drafts = Object.fromEntries(CSV_FILES.map(file => {
    const raw = source.input.files[file] ?? "";
    const bytes = typeof raw === "string" ? new TextEncoder().encode(raw) : raw;
    return [file, inspectImportFile(file, { name: file, bytes, size: bytes.length })];
  }));
  return prepareImport(source.input.manifest, drafts, { amountBasisConfirmed: true, sourceAmountBasis: "including_tax", conversion: { rate: DEFAULT_TAX_RATE, fields: DEFAULT_CONVERSION_FIELDS } }).conversion;
}

export function buildDataSource(source: MockupSource): PageOutput {
  const { snapshot, dataset } = source;
  const settings = dataset.manifest;
  const anchor = settings.data_as_of;
  const alias = source.alias;
  const book = new ProposalBook();
  const data: Record<string, unknown> = { source: source.spec.id };
  const issues = dataset.issues;
  const issueCountText = formatCount(issues.length, "L2");
  const sourceLabel = source.spec.imported ? labels.shell.status.local : labels.shell.status.demo;
  const coverageText = formatPeriodL1(settings.coverage_start, settings.coverage_end, { anchor });
  const reasonLabel = (reason: string) => reason === "MISSING_CHANNEL_COST_DAY"
    ? book.note("data.chartsV4.issues.reasons.MISSING_CHANNEL_COST_DAY", "缺費用列", "G21", "既有原因碼沒有短名稱（labels.errors.import 是整句），G21 欄名與標題需要新鍵")
    : reason === "MISSING_AD_DAY" ? book.note("data.chartsV4.issues.reasons.MISSING_AD_DAY", "缺廣告列", "G21") : reason;

  // ── 資料狀態一行（v3 不變）
  const statusLine = [sourceLabel, fill(labels.shell.status.ready, { date: formatDateL1(settings.data_as_of, { anchor }) }), fill(pageV3.statusLine.coverage, { range: coverageText }), fill(pageV3.statusLine.files, { n: CSV_FILES.length }), fill(pageV3.statusLine.basis, { basis: pageV3.statusLine.basisExclusive }), issues.length ? fill(pageV3.statusLine.issues, { n: issueCountText }) : pageV3.statusLine.noIssues].join(pageV3.separator);
  const statusHtml = `<p class="data-status-line" data-testid="data-status-line">${esc(statusLine)}</p>`;

  // ── G20 涵蓋時間軸（C30）
  const coverage = coverageTrial(source);
  const eventsParsed = parseEvents({ name: "events.csv", bytes: new TextEncoder().encode(MOCK_EVENTS_CSV) });
  const events: EventSet | null = eventsParsed.set ? { ...eventsParsed.set, filename: "events.csv" } : null;
  const longest = [...coverage.segments].sort((a, b) => b.days - a.days || CSV_FILES.indexOf(a.file) - CSV_FILES.indexOf(b.file) || (a.start < b.start ? -1 : 1))[0] ?? null;
  const trackName = (key: TimelineTrack["key"]) => key === "events"
    ? book.note("data.chartsV4.coverage.tracks.events", "檔期", "G20", "軌名；labels.events.entry 是「檔期（選填）」，不能直接沿用")
    : book.note(`data.chartsV4.coverage.tracks.${key}`, labels.importWizard.files[key], "G20", `沿用 importWizard.files.${key} 的字，不另立新字`);
  const noRowsText = book.note("data.chartsV4.coverage.noRows", "無列", "G20", "銷售檔那一天沒有任何一列；不等於零銷售（v4 GLOSSARY #5）");
  const gapDays = (n: number) => book.note("data.chartsV4.coverage.gapDays", fill("缺 {n} 天", { n }), "G20", "軌道右端：該檔缺列天數合計（檔 × 通路 × 日）");
  const noRowsDays = (n: number) => book.note("data.chartsV4.coverage.noRowsDays", fill("無列 {n} 天", { n }), "G20", "銷售軌右端");
  const segTestId = (segment: CoverageSegment) => `chart-data-coverage-seg-${FILE_KEYS[segment.file]}-${segment.channel}-${segment.start}`;
  const fileTrack = (file: FileName): TimelineTrack => {
    const key = FILE_KEYS[file];
    const segments = coverage.segments.filter(segment => segment.file === file);
    const total = segments.reduce((sum, segment) => sum + segment.days, 0);
    const noRowsTotal = coverage.salesNoRows.reduce((sum, range) => sum + daysOf(range), 0);
    return {
      key, label: trackName(key),
      rows: key === "sales" ? coverage.salesRows : coverage.fileRows[key],
      missing: segments.map(segment => ({ start: segment.start, end: segment.end, testId: segTestId(segment) })),
      noRows: key === "sales" ? coverage.salesNoRows : [],
      events: [],
      endLabel: key === "sales" ? (noRowsTotal ? noRowsDays(noRowsTotal) : "") : total ? gapDays(total) : "",
    };
  };
  const eventTrack: TimelineTrack = { key: "events", label: trackName("events"), rows: [], missing: [], noRows: [], events: (events?.rows ?? []).map(row => ({ start: row.start, end: row.end, label: row.label })), endLabel: "" };
  const tracks = [...CSV_FILES.map(fileTrack), eventTrack];
  const bands = [
    { ...snapshot.report.previous.period, label: labels.shell.periods.previous },
    { ...snapshot.report.current.period, label: labels.shell.periods.current },
  ];
  // 示意狀態：假設三份檔案從 2025-09-01 起都有列（沒有其他缺列），去年同期由既有的 periodPresets 依本期算出。
  const mockManifest = { ...settings, coverage_start: YOY_MOCK_COVERAGE_START };
  const yoyPreset = periodPresets(mockManifest, { previous: snapshot.report.previous.period, current: snapshot.report.current.period, comparison_mode: snapshot.report.scope.comparison_mode }).find(preset => preset.id === "yoy");
  const yoyRange = yoyPreset && yoyPreset.status === "ready" ? { start: yoyPreset.previous.start, end: yoyPreset.previous.end, label: labels.overview.trendYoyV3.legend } : null;
  const extendRows = (ranges: readonly DateRange[]) => ranges.length && ranges[0].start === settings.coverage_start ? [{ start: YOY_MOCK_COVERAGE_START, end: ranges[0].end }, ...ranges.slice(1)] : [{ start: YOY_MOCK_COVERAGE_START, end: addDays(settings.coverage_start, -1) }, ...ranges];
  const mockTracks = tracks.map(track => track.key === "events" ? track : { ...track, rows: extendRows(track.rows) });
  const g20Geometry: Record<"actual" | "yoy", Partial<Record<Breakpoint, TimelineGeometry>>> = { actual: {}, yoy: {} };
  const dateLabel = (iso: string) => formatDateL1(iso, { anchor });
  const timeline = (state: "actual" | "yoy") => responsive(bp => {
    const result = timelineSvg({
      width: PANEL_INNER[bp], labelWidth: TRACK_LABEL_WIDTH[bp], endWidth: TRACK_END_WIDTH[bp],
      domain: { start: state === "yoy" ? YOY_MOCK_COVERAGE_START : settings.coverage_start, end: settings.coverage_end },
      bands, yoy: state === "yoy" ? yoyRange : null, tracks: state === "yoy" ? mockTracks : tracks, noRowsText, halve: bp === "sm", dateLabel,
    });
    g20Geometry[state][bp] = result.geometry;
    return result.svg;
  });
  const fileShort = (file: FileName) => fileTitle(file);
  const coverageTitle = longest === null
    ? book.mark("data.chartsV4.coverage.title.none", fill("三份檔案涵蓋 {start} 到 {end}，沒有缺列", { start: md(settings.coverage_start), end: md(settings.coverage_end) }), "G20")
    : longest.days === 1
      ? book.mark("data.chartsV4.coverage.title.missingOneDay", fill("{file}缺 {date} 1 天（{channel}）", { file: fileShort(longest.file), date: md(longest.start), channel: channelLabel(longest.channel, alias) }), "G20")
      : book.mark("data.chartsV4.coverage.title.missing", fill("{file}缺 {start} 到 {end} 共 {n} 天（{channel}）", { file: fileShort(longest.file), start: md(longest.start), end: md(longest.end), n: longest.days, channel: channelLabel(longest.channel, alias) }), "G20", "取最長的缺列區段；只有 1 天時用 title.missingOneDay");
  book.note("data.chartsV4.coverage.title.missingOneDay", "{檔案}缺 {date} 1 天（{通路}）", "G20", "模板；最長缺列只有 1 天時（fixtures/errors/missing_ad_day）");
  book.note("data.chartsV4.coverage.title.none", "三份檔案涵蓋 {start} 到 {end}，沒有缺列", "G20", "模板；示範資料");
  const coverageSection = book.note("data.chartsV4.coverage.section", "涵蓋時間軸", "G20", "區塊標準名（v4 GLOSSARY #3）");
  const channelsText = channelsLabel(settings.channels, alias);
  const coverageSubtitle = (start: string) => book.mark("data.chartsV4.coverage.subtitle", fill("{section} · 檔案涵蓋 {range} · {channels}", { section: coverageSection, range: formatPeriodL1(start, settings.coverage_end, { anchor }), channels: channelsText }), "G20");
  const legendRows = book.mark("data.chartsV4.coverage.legend.rows", "有列", "G20", "圖例 line；期間區帶與去年同期改為直接標字");
  const legendMissing = book.mark("data.chartsV4.coverage.legend.missing", "缺列", "G20", "圖例 dash（--chart-missing）");
  const filterButton = book.note("data.chartsV4.coverage.filterButton", "篩選問題表", "G20", "資料表每列一個按鈕");
  const filterAria = (file: FileName, channel: string) => book.note("data.chartsV4.coverage.filterAria", fill("篩選問題表：{file} · {channel}", { file: fileTitle(file), channel: channelLabel(channel, alias) }), "G20", "按鈕可及名稱帶檔案與通路");
  const columns = {
    file: book.note("data.chartsV4.coverage.columns.file", pageV3.issueTable.columns.file, "G20", "沿用 data.pageV3.issueTable.columns.file"),
    channel: book.note("data.chartsV4.coverage.columns.channel", labels.overview.page.colChannel, "G20", "沿用 overview.page.colChannel"),
    start: book.note("data.chartsV4.coverage.columns.start", "缺列起日", "G20"),
    end: book.note("data.chartsV4.coverage.columns.end", "缺列訖日", "G20"),
    days: book.note("data.chartsV4.coverage.columns.days", "天數", "G20"),
    action: book.note("data.chartsV4.coverage.columns.action", "篩選", "G20"),
  };
  const filterKey = (kind: "seg" | "cell", file: FileName, reason: string, channel?: string) => [kind, FILE_KEYS[file], reason, channel ?? ""].join(":");
  const coverageTable = dataTable({
    caption: esc(coverageSection), numeric: [false, false, false, false, true, false],
    head: [esc(columns.file), esc(columns.channel), esc(columns.start), esc(columns.end), esc(columns.days), esc(columns.action)],
    rows: coverage.segments.map(segment => [esc(fileTitle(segment.file)), esc(channelLabel(segment.channel, alias)), esc(segment.start), esc(segment.end), esc(formatCount(segment.days, "L2")), `<button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" data-issue-filter="${filterKey("seg", segment.file, segment.reason, segment.channel)}" aria-label="${esc(filterAria(segment.file, segment.channel))}">${esc(filterButton)}</button>`]),
    testId: "chart-data-coverage-table",
  });
  const yoySwitch = `<div class="mockup-switch" role="group" aria-label="設計稿狀態切換"><span>設計稿狀態：</span><button type="button" data-switch="g20-yoy" data-value="actual" aria-pressed="true">合成資料（去年同期不可用）</button><button type="button" data-switch="g20-yoy" data-value="yoy" aria-pressed="false">示意：假設檔案從 ${esc(formatDateL1(YOY_MOCK_COVERAGE_START, { anchor }))} 起都有列（看去年同期細線）</button></div>`;
  const g20 = chartFrame({
    id: "data-coverage", testId: "chart-data-coverage", title: coverageTitle,
    subtitle: `<span data-switch-panel="g20-yoy" data-value="actual">${coverageSubtitle(settings.coverage_start)}</span><span data-switch-panel="g20-yoy" data-value="yoy" hidden>${esc(fill("{section} · 檔案涵蓋 {range} · {channels}", { section: coverageSection, range: formatPeriodL1(YOY_MOCK_COVERAGE_START, settings.coverage_end, { anchor }), channels: channelsText }))}</span>`,
    legend: [{ label: legendRows, color: colors.total }, { label: legendMissing, color: colors.missing, shape: "dash" }],
    v4Note: "G20：新增（C30 Timeline；三軌＋檔期軌；缺列虛線框、期間區帶、去年同期 1px 細線）",
    takeaways: yoySwitch,
    after: trialNote(`設計稿試算：缺列區段（依檔 × 通路合併連續日期）、銷售有列與無列、通路費用與廣告的有列日由產生器從 dataset.issues 與 dataset.sales 算出；正式由 V4-7a 的 B 級函式 coverageTimeline（coverage-timeline-v1）產生。設計稿假設：合成資料不帶 events.csv，檔期軌依廣告檔 MARKETPLACE 加碼日假設兩段；「去年同期」示意狀態假設檔案從 ${YOY_MOCK_COVERAGE_START} 起都有列，去年同期期間由既有 periodPresets 算出。`),
    dataTable: { title: coverageSection, content: coverageTable },
    body: `<div data-switch-panel="g20-yoy" data-value="actual">${timeline("actual")}</div><div data-switch-panel="g20-yoy" data-value="yoy" hidden>${timeline("yoy")}</div>`,
  });
  data.g20 = { segments: coverage.segments, salesNoRows: coverage.salesNoRows, longest, events: events?.rows ?? [], bands, yoyMock: { coverageStart: YOY_MOCK_COVERAGE_START, yoy: yoyRange }, geometry: g20Geometry };

  // ── G21 問題分布表（C28 matrix；ChartFrame inline、table 模式、h3；格內是篩選按鈕）＋問題表（v3）＋篩選片語與清除鈕（V4-7a）
  const distribution = distributionTrial(issues);
  let issuesBody = `<p class="data-section-empty">${esc(dataPanel.noIssues)}</p>`;
  if (issues.length > 0) {
    const ranked = CSV_FILES.flatMap(file => distribution.reasons.map(reason => ({ file, reason, n: distribution.cells[file][reason] }))).filter(cell => cell.n > 0).sort((a, b) => b.n - a.n || CSV_FILES.indexOf(a.file) - CSV_FILES.indexOf(b.file));
    const single = ranked.length === 1;
    const top = ranked[0];
    const issuesTitle = top === undefined ? esc(labels.data.sections.dataIssues) : single
      ? book.mark("data.chartsV4.issues.title.single", fill("{file}有 {n} 列{reason}", { file: fileTitle(top.file), n: top.n, reason: reasonLabel(top.reason) }), "G21")
      : book.mark("data.chartsV4.issues.title.most", fill("{file}的{reason}最多，{n} 列", { file: fileTitle(top.file), reason: reasonLabel(top.reason), n: top.n }), "G21", "全表最多的一格；同值依檔案順序");
    if (!single) book.note("data.chartsV4.issues.title.single", "{檔案}有 {n} 列{原因}", "G21", "模板；只有一格時（fixtures/errors/missing_ad_day），不寫「最多」");
    const issuesSection = book.note("data.chartsV4.issues.section", "問題分布（檔案 × 原因）", "G21", "區塊標準名（v4 GLOSSARY §3）");
    const issuesSubtitle = book.mark("data.chartsV4.issues.subtitle", fill("{section} · 列級問題 {n} 項 · 有底色的格可篩選問題表，加框的是各檔最多的原因", { section: issuesSection, n: formatCount(distribution.rowLevel, "L2") }), "G21", "顏色只輔助，格內永遠有數字");
    const cellAria = (file: FileName, reason: string, n: number) => book.note("data.chartsV4.issues.cellAria", fill("{file}有 {n} 列{reason}，篩選問題表", { file: fileTitle(file), n, reason: reasonLabel(reason) }), "G21", "格內按鈕的可及名稱");
    const caption = book.note("data.chartsV4.issues.caption", fill("{section}，格內是列數", { section: issuesSection }), "G21");
    const fileHead = pageV3.issueTable.columns.file;
    const matrixRows = CSV_FILES.map(file => `<tr><th scope="row">${esc(fileTitle(file))}</th>${distribution.reasons.map(reason => {
      const n = distribution.cells[file][reason];
      const tier = n === 0 ? 0 : distribution.maxReason[file] === reason ? 2 : 1;
      return `<td data-tier="${tier}" data-label="${esc(reasonLabel(reason))}"${n ? ` data-testid="chart-data-issues-cell-${FILE_KEYS[file]}-${reason}"` : ""}>${n ? `<button type="button" class="matrix-count" data-issue-filter="${filterKey("cell", file, reason)}" aria-label="${esc(cellAria(file, reason, n))}">${esc(formatCount(n, "L2"))}</button>` : ""}</td>`;
    }).join("")}</tr>`).join("");
    const rangeRow = distribution.rangeLevel > 0 ? `<tr><th scope="row">${esc(book.note("data.chartsV4.issues.rangeRow", "範圍級問題", "G21"))}</th><td colspan="${distribution.reasons.length}">${esc(formatCount(distribution.rangeLevel, "L2"))}</td></tr>` : "";
    if (distribution.rangeLevel === 0) book.note("data.chartsV4.issues.rangeRow", "範圍級問題", "G21", "模板；範圍級問題另列一行，不混進格（本資料 0 筆，不顯示）");
    const matrix = `<div class="table-scroll matrix-scroll" role="region" aria-labelledby="data-issues-dist-title"><table class="heat-matrix" data-testid="chart-data-issues-table"><caption>${esc(caption)}</caption><thead><tr><th scope="col">${esc(fileHead)}</th>${distribution.reasons.map(reason => `<th scope="col">${esc(reasonLabel(reason))}</th>`).join("")}</tr></thead><tbody>${matrixRows}${rangeRow}</tbody></table></div>`;
    const g21 = chartFrame({
      id: "data-issues-dist", testId: "chart-data-issues", variant: "inline", mode: "table", headingLevel: 3, title: issuesTitle, subtitle: issuesSubtitle,
      v4Note: "G21：新增（C28 matrix；ChartFrame inline＋table 模式；格內是篩選按鈕；390 改清單式）",
      after: trialNote("設計稿試算：檔案 × 原因碼的計數與「各檔最多」由產生器從 dataset.issues 算出；正式由 V4-7a 的 B 級函式 issueDistribution（issue-distribution-v1）產生。"),
      body: matrix,
    });
    // 問題表（v3 外觀）；篩選狀態各畫一份（全部、G20 每段、G21 每格），由頁內小段 script 切換，下載問題清單 CSV 仍是全部。
    const issueRow = (issue: ValidationIssue) => {
      const parts = issueMessageParts(issue);
      const where = [issue.date, issue.channel].filter(Boolean).join(" ");
      const tone = issue.severity === "blocking" ? "unfavorable" : issue.severity === "partial" ? "warning" : "";
      return `<tr><td class="issue-file"><span class="ui-mono">${esc(issue.file)}</span>${where ? `<small>${esc(where)}</small>` : ""}</td><td class="num ui-mono">${issue.line ?? ""}</td><td class="issue-field"><span class="ui-mono">${esc(issue.field)}</span></td><td class="issue-problem"><span class="ui-lozenge"${tone ? ` data-tone="${tone}"` : ""}>${esc(labels.data.issues.severity[issue.severity])}</span>${esc(parts.headline)}</td><td class="issue-fix">${esc(parts.explain)}</td><td class="issue-code" hidden><code>${esc(parts.code)}</code></td></tr>`;
    };
    const issueTable = (list: readonly ValidationIssue[]) => `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(labels.data.issues.regionAria)}"><table class="ui-table issue-table"><caption class="sr-only">${esc(fill(labels.data.issues.caption, { n: list.length }))}</caption><thead><tr><th scope="col">${esc(pageV3.issueTable.columns.file)}</th><th scope="col" class="num">${esc(pageV3.issueTable.columns.line)}</th><th scope="col">${esc(pageV3.issueTable.columns.field)}</th><th scope="col">${esc(pageV3.issueTable.columns.problem)}</th><th scope="col">${esc(pageV3.issueTable.columns.fix)}</th><th scope="col" class="issue-code" hidden>${esc(pageV3.issueTable.columns.code)}</th></tr></thead><tbody>${list.map(issueRow).join("")}</tbody></table></div>`;
    const toolbar = `<div class="ui-toolbar issue-toolbar"><span class="ui-btn ui-btn-text">${esc(pageV3.issueTable.showCodes)}</span><span class="ui-toolbar-end"><span class="issue-unit">${esc(pageV3.issueTable.unit)}</span><span class="ui-btn ui-btn-secondary" data-testid="data-issues-download">${esc(labels.exports.downloads.issuesCsv)}</span></span></div>`;
    const clearText = book.note("data.chartsV4.filter.clear", "清除篩選", "G20、G21", "與 products.pageV3.clearFilters 同字，可沿用");
    const phrase = (conditions: string[], n: number) => book.note("data.chartsV4.filter.phrase", fill("篩選：{conditions}（{n} 項）", { conditions: conditions.join(pageV3.separator), n }), "G20、G21", "role=status；按下篩選按鈕後焦點移到這裡");
    type FilterState = { key: string; conditions: string[]; list: ValidationIssue[] };
    const states: FilterState[] = [
      ...coverage.segments.filter((segment, index, all) => all.findIndex(other => other.file === segment.file && other.channel === segment.channel && other.reason === segment.reason) === index).map(segment => ({ key: filterKey("seg", segment.file, segment.reason, segment.channel), conditions: [fileTitle(segment.file), channelLabel(segment.channel, alias), reasonLabel(segment.reason)], list: issues.filter(issue => issue.file === segment.file && issue.channel === segment.channel && issue.reason_code === segment.reason) })),
      ...ranked.map(cell => ({ key: filterKey("cell", cell.file, cell.reason), conditions: [fileTitle(cell.file), reasonLabel(cell.reason)], list: issues.filter(issue => issue.file === cell.file && issue.reason_code === cell.reason) })),
    ];
    const filtered = states.map(state => `<div data-issue-state="${state.key}" hidden><div class="issue-filter"${v4("V4-7a：篩選片語（role=status）與清除鈕；下載內容不變")}><p class="issue-filter-phrase" role="status" tabindex="-1">${esc(phrase(state.conditions, state.list.length))}</p><button type="button" class="ui-btn ui-btn-secondary ui-btn-sm" data-issue-filter="all">${esc(clearText)}</button></div>${issueTable(state.list)}</div>`).join("");
    issuesBody = `${g21}<div class="issue-list">${toolbar}<div data-issue-state="all">${issueTable(issues)}</div>${filtered}</div>`;
    data.g21 = { reasons: distribution.reasons, cells: distribution.cells, maxReason: distribution.maxReason, rowLevel: distribution.rowLevel, rangeLevel: distribution.rangeLevel, title: top ?? null, filters: states.map(state => ({ key: state.key, rows: state.list.length })) };
  }
  const issuesPanel = `<section class="panel data-section" aria-labelledby="quality-heading" data-testid="data-issues"><div class="ui-section-head"><span class="data-section-title"><h2 class="ui-section-title" id="quality-heading">${esc(labels.data.sections.dataIssues)}</h2>${issues.length ? `<span class="ui-count-badge" role="img" aria-label="${esc(fill(pageV3.statusLine.issues, { n: issueCountText }))}">${esc(issueCountText)}</span>` : ""}</span><p class="ui-section-subtitle">${esc(dataPanel.issuesNote)}</p></div>${issuesBody}</section>`;

  // ── 資料範圍與金額基準（v3 不變）
  const period = (range: { start: string; end: string }) => formatPeriodL1(range.start, range.end, { anchor });
  const dl = (items: [string, string][]) => `<dl class="ui-dl">${items.map(([dt, dd]) => `<div><dt>${esc(dt)}</dt><dd>${esc(dd)}</dd></div>`).join("")}</dl>`;
  const scopePanel = `<section class="panel data-section" aria-labelledby="dataset-heading" data-testid="data-scope"><div class="ui-section-head"><h2 class="ui-section-title" id="dataset-heading">${esc(labels.data.sections.dataScope)}</h2><span class="ui-section-end"><span class="ui-lozenge">${esc(sourceLabel)}</span></span></div>${dl([
    [dataPanel.meta.datasetId, settings.dataset_id], [labels.shell.status.dataAsOf, formatDateL1(settings.data_as_of, { anchor })],
    [dataPanel.meta.coverage, coverageText], [labels.importWizard.basis.label, pageV3.statusLine.basisExclusive],
    [dataPanel.meta.currencyTimezone, `${settings.currency}${pageV3.separator}${settings.timezone}`], [dataPanel.meta.channels, channelsLabel(settings.channels, alias)],
    [dataPanel.meta.coverageConfirmed, settings.sales_coverage_confirmed ? dataPanel.meta.coverageYes : dataPanel.meta.coverageNo], [labels.shell.periods.previous, period(snapshot.report.previous.period)],
    [labels.shell.periods.current, period(snapshot.report.current.period)], [dataPanel.meta.scopeChannels, channelsLabel(snapshot.report.scope.channels, alias)],
  ])}<p class="note">${esc(dataPanel.datasetCaution)}</p><details><summary>${esc(labels.evidence.sections.technicalDetails)}</summary></details></section>`;

  // ── 本次匯入的前處理（v3）＋G22 成對條（C24 pair）。合成資料是未稅匯入、沒有換算；設計稿另畫「假設以含稅 5% 匯入」的示意狀態。
  const conversion = inclusiveConversionMock(source);
  const totals = conversion?.totals ?? {};
  const maxRaw = Object.values(totals).reduce((max, total) => Decimal.max(max, new Decimal(total.raw)), new Decimal(0));
  const preprocessColumns = pageV3.preprocessing.columns;
  const preprocessRows = (conversion?.fields ?? []).map(field => {
    const total = totals[field];
    const top = maxRaw.isZero() || !total ? 0 : new Decimal(total.raw).div(maxRaw).toNumber();
    const bottom = maxRaw.isZero() || !total ? 0 : new Decimal(total.converted).div(maxRaw).toNumber();
    const name = field in labels.metrics ? labels.metrics[field as MetricName].headline : field;
    return `<tr data-field="${esc(field)}"><th scope="row">${esc(name)}</th><td class="num">${esc(formatAmountL3(total?.raw))}</td><td class="num pair-cell"><span class="pair-cell-inner">${pairCell({ top, bottom, testId: `chart-data-preprocess-bar-${field}` })}<span>${esc(formatAmountL3(total?.converted))}</span></span></td><td class="num">${esc(formatRateL2(conversion?.rate))}</td></tr>`;
  }).join("");
  const preprocessTable = `<div class="table-scroll" tabindex="0" role="region" aria-label="${esc(pageV3.preprocessing.tableAria)}"><table class="ui-table data-preprocessing-table"><caption class="sr-only">${esc(pageV3.preprocessing.tableAria)}</caption><thead><tr><th scope="col">${esc(preprocessColumns.field)}</th><th scope="col" class="num">${esc(preprocessColumns.raw)}</th><th scope="col" class="num">${esc(preprocessColumns.converted)}</th><th scope="col" class="num">${esc(preprocessColumns.rate)}</th></tr></thead><tbody>${preprocessRows}</tbody></table></div>`;
  const preprocessSwitch = `<div class="mockup-switch" role="group" aria-label="設計稿狀態切換"><span>設計稿狀態：</span><button type="button" data-switch="g22" data-value="actual" aria-pressed="true">合成資料（未稅，沒有換算）</button><button type="button" data-switch="g22" data-value="mock" aria-pressed="false">示意：假設同一份檔案以含稅 5% 匯入（看 G22 成對條）</button></div>`;
  const preprocessPanel = `<section class="panel data-section" aria-labelledby="preprocessing-heading" data-testid="data-preprocessing"><div class="ui-section-head"><h2 class="ui-section-title" id="preprocessing-heading">${esc(labels.data.sections.dataPreprocessing)}</h2><p class="ui-section-subtitle" data-switch-panel="g22" data-value="mock" hidden>${esc(conversionSentence(conversion) ?? "")}</p></div>${preprocessSwitch}<div data-switch-panel="g22" data-value="actual"><p class="data-section-empty">${esc(labels.importWizard.noConversion)}</p></div><div data-switch-panel="g22" data-value="mock" hidden${v4("G22：前處理表「未稅合計」格內的成對條（上 4px 含稅原值、下 6px 換算值，共用尺度＝原值最大值）")}>${preprocessTable}${trialNote("設計稿假設：合成資料是未稅匯入，前處理表在 v3 只寫一句「未稅，沒有換算。」。這裡把同一份檔案當成含稅 5% 匯入，用既有的 inspectImportFile 與 prepareImport 換算（預設換算欄位，商品成本不換算），只為示意 G22 成對條；條長是含稅原值與換算值 ÷ 原值最大值，只用於長度。")}</div></section>`;
  data.g22 = { rate: conversion?.rate ?? null, fields: conversion?.fields ?? [], totals, maxRaw: maxRaw.toFixed(2), rowsConverted: conversion?.rows_converted ?? 0 };

  // ── 選填資料、來源檔案、版本與來源資訊、匯入範本（v3 不變；檔期依 G20 的示意假設寫「已讀取 2 個檔期」）
  const sideEntry = (testId: string, title: string, state: string, intro: string, controls: string[], table = "") => `<section class="side-entry" data-testid="${testId}"><div class="side-entry-head"><h3>${esc(title)}</h3><span class="side-entry-state">${esc(state)}</span></div><p class="side-entry-intro">${esc(intro)}</p><div class="ui-toolbar side-entry-controls">${controls.map((control, index) => index === 0 ? `<span class="ui-btn ui-btn-secondary">${esc(control)}</span>` : `<span class="ui-btn ui-btn-text">${esc(control)}</span>`).join("")}</div>${table}</section>`;
  const eventsTable = events ? `<div class="table-scroll" role="region" aria-label="${esc(labels.events.entry)}" tabindex="0"><table class="ui-table" data-testid="events-table"><thead><tr><th scope="col" class="num">${esc(labels.exports.csv.columns.line)}</th><th scope="col">${esc(labels.events.columns.start)}</th><th scope="col">${esc(labels.events.columns.end)}</th><th scope="col">${esc(labels.events.columns.label)}</th></tr></thead><tbody>${events.rows.map(row => `<tr><th scope="row" class="num ui-mono">${row.line}</th><td>${esc(row.start)}</td><td>${esc(row.end)}</td><td>${esc(row.label)}</td></tr>`).join("")}</tbody></table></div>` : "";
  const optionalPanel = `<section class="panel data-section" data-testid="data-optional"><div class="ui-section-head"><h2 class="ui-section-title">${esc(pageV3.optionalHeading)}</h2></div><div class="data-optional-grid">${sideEntry("targets-entry", labels.targets.entry, labels.targets.none, labels.targets.intro, [labels.targets.upload, labels.targets.template])}${sideEntry("events-entry", labels.events.entry, events ? fill(labels.events.loaded, { n: events.rows.length, name: events.filename ?? "" }) : labels.events.none, labels.events.intro, [labels.events.upload, labels.events.template, labels.events.download, labels.events.remove], eventsTable)}</div>${trialNote("設計稿假設：檔期是為了畫 G20 的檔期軌而假設的兩段（合成資料不帶 events.csv）。")}</section>`;
  const rowsOf: Record<FileName, number> = { "sales_daily.csv": dataset.sales.length, "channel_costs_daily.csv": dataset.costs.length, "ad_spend_daily.csv": dataset.ads.length };
  const previewPanel = `<section class="panel data-section" data-testid="data-preview"><div class="ui-section-head"><h2 class="ui-section-title">${esc(labels.data.sections.dataPreview)}</h2><p class="ui-section-subtitle">${esc(dataPanel.previewNote)}</p></div>${CSV_FILES.map(file => `<details class="data-preview-file" data-testid="data-preview-${file}"><summary>${esc(fileTitle(file))}${esc(pageV3.separator)}<span class="ui-mono">${esc(file)}</span>${esc(pageV3.separator)}${esc(fill(dataPanel.rowCount, { n: formatCount(rowsOf[file], "L2") }))}</summary><p class="note">${esc(dataPanel.fileGrain[FILE_KEYS[file]])}</p></details>`).join("")}</section>`;
  const versionPanel = `<details class="panel data-section data-version" data-testid="data-version-info"><summary><h2 class="ui-section-title">${esc(pageV3.version.heading)}</h2></summary></details>`;
  const topbar = labels.shell.topbarV3;
  const templatePanel = `<section class="panel data-section data-templates"><div class="ui-section-head"><h2 class="ui-section-title">${esc(labels.exports.downloads.templatesHeading)}</h2></div><table class="template-table"><thead><tr><th scope="col">${esc(topbar.templateColumns.file)}</th><th scope="col">${esc(topbar.templateColumns.blank)}</th><th scope="col">${esc(topbar.templateColumns.example)}</th></tr></thead><tbody>${CSV_FILES.map(file => `<tr><th scope="row">${esc(fileTitle(file))}</th><td><span class="ui-btn ui-btn-text">${esc(topbar.templateCell)}</span></td><td><span class="ui-btn ui-btn-text">${esc(topbar.templateCell)}</span></td></tr>`).join("")}</tbody></table></section>`;

  const script = `<script>
// 設計稿：G20 資料表的篩選按鈕與 G21 格內按鈕切換問題表的篩選狀態（產品由 DataWorkspace 的 issueFilter 狀態承擔；下載問題清單 CSV 仍是全部）。
document.querySelectorAll("[data-issue-filter]").forEach(function (button) {
  button.addEventListener("click", function () {
    var value = button.getAttribute("data-issue-filter");
    document.querySelectorAll("[data-issue-state]").forEach(function (panel) { panel.hidden = panel.getAttribute("data-issue-state") !== value; });
    var phrase = document.querySelector('[data-issue-state="' + value + '"] [role="status"]');
    var section = document.querySelector('[data-testid="data-issues"]');
    if (section) section.scrollIntoView({ block: "start" });
    if (phrase) phrase.focus();
  });
});
</script>`;
  const content = `${statusHtml}${g20}${issuesPanel}${scopePanel}${preprocessPanel}${optionalPanel}${previewPanel}${versionPanel}${templatePanel}${script}`;
  const html = pageDocument({
    page: "data", docTitle: "資料來源（4 通路合成資料）· H5 設計稿", source, content, proposals: book,
    headerAction: `<span class="page-actions"><span class="ui-btn ui-btn-primary">${esc(labels.shell.buttons.importData)}</span><span class="ui-btn ui-btn-secondary">${esc(labels.shell.buttons.loadDemo)}</span></span>`,
    bannerNote: "畫面當作經匯入精靈匯入（本機匯入）",
  });
  data.proposals = book.items;
  return { file: "data.html", html, data, proposals: book };
}
