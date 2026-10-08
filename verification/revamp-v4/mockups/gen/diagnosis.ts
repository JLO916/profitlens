import Decimal from "decimal.js";
import { channelLabel, channelsLabel } from "@/application/copy";
import { diagnosisGroups, type DiagnosisGroup } from "@/application/diagnosis-group";
import { buildManagerSummary } from "@/application/manager-summary";
import { deltaTone, formatAmountL1, formatAmountL2, formatPeriodL1, formatRateL1, formatRateL2, formatSignedDelta, metricDefinitions, periodDays } from "@/application/presentation";
import { profitWaterfall } from "@/application/waterfall";
import { alertStatus } from "@/components/top-three";
import { aggregatePeriod } from "@/domain/aggregation";
import { parseCents, ratioMetric, sumAmounts } from "@/domain/money";
import { COST_FIELDS, type DailyChannel, type MetricName, type RuleCode } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { barCell, lineSvg, responsive, shareStackSvg, sparkline, type Breakpoint, type ShareRow } from "./charts";
import { pageDocument } from "./chrome";
import { addDays, coordinate, esc, formatHeatCell, md, negativeAfterYuan, rateScale, weekdayOf } from "./format";
import { chartFrame, dataTable, numberLink, ProposalBook, trialNote, v4 } from "./html";
import { PANEL_INNER, type PageOutput } from "./overview";
import type { MockupSource } from "./source";
import { colors } from "./theme";

// H5 設計稿：通路健檢（示範資料）。由上到下依 PRD §5.2：頁首與計數、健檢清單（G9 內嵌影響金額條）、G10 每 100 元淨營收去向、
// G11 日 × 通路月曆熱表、<details>「五項比率走勢」（G12，設計稿畫展開狀態）、通路寬表（G7b「近 n 週」）＋<details>「各通路每週」、AI 收合。

const CM: MetricName = "contribution_after_marketing";
const CM_NAME = "contribution_after_marketing" as const;
const Exact = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });
/** 差額類規則（G9 只對這些畫條；水準類 NEGATIVE_CHANNEL_CM、SKU_NEGATIVE_GP 不畫，PRD §4.3 G9）。 */
const VARIANCE_RULES: ReadonlySet<RuleCode> = new Set<RuleCode>(["REV_UP_CM_DOWN", "DISCOUNT_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "MARKETING_BURDEN_UP"]);
/** G9 門檻刻度的示意狀態（使用者在總覽「調整門檻」設定；示範資料預設 0.00 時刻度與零線重疊，所以另畫一個示意值）。 */
const THRESHOLD_DEMO = "300000.00";
/** G12 五項比率（PRD §4.3 G12）。 */
const RATES = ["discount_rate", "refund_ratio", "fulfillment_burden", "marketing_burden", "gross_margin"] as const satisfies readonly MetricName[];
/** G12 子圖寬（一列 5 張、間距 16；768 寬 12；≤ 767 單欄）。 */
const MULTIPLE_WIDTH: Record<Breakpoint, number> = { xl: Math.floor((1122 - 4 * 16) / 5), lg: Math.floor((962 - 4 * 16) / 5), md: Math.floor((450 - 4 * 12) / 5), sm: 324 };
const SM = 180;

const status = (tone: string, text: string) => `<span class="ui-lozenge" data-tone="${tone}">${esc(text)}</span>`;

export function buildDiagnosis(source: MockupSource): PageOutput {
  const { snapshot, dataset } = source;
  const { report } = snapshot;
  const book = new ProposalBook();
  const data: Record<string, unknown> = { source: source.spec.id };
  const channels = report.scope.channels;
  const scopeText = channelsLabel(channels, source.alias);
  const periodText = formatPeriodL1(report.current.period.start, report.current.period.end, { days: false, anchor: snapshot.data_as_of });

  // ── 健檢清單＋G9（C24 variance＋門檻刻度）：差額類規則共用尺度；REV_UP_CM_DOWN 空心條；水準類規則不畫條。
  const result = diagnosisGroups(snapshot);
  const varianceGroups = result.groups.filter(group => VARIANCE_RULES.has(group.rule) && group.impact_cents !== null);
  const maxImpact = varianceGroups.reduce((max, group) => Decimal.max(max, new Exact(group.impact_cents!).abs()), new Exact(0));
  const impactBar = (group: DiagnosisGroup, threshold: string) => {
    if (!VARIANCE_RULES.has(group.rule) || group.impact_cents === null || maxImpact.isZero()) return "";
    const value = new Exact(group.impact_cents);
    const unfavorable = deltaTone(CM, group.impact_cents) === "unfavorable";
    const tick = new Exact(threshold).isZero() ? null : new Exact(threshold).div(maxImpact).toNumber();
    return barCell({ ratio: value.abs().div(maxImpact).toNumber(), negative: value.isNegative(), color: unfavorable ? colors.unfavorable : colors.favorable, outline: group.rule === "REV_UP_CM_DOWN", tick, testId: `chart-diagnosis-impact-bar-${group.rule}` });
  };
  const unfavorableCount = result.groups.filter(group => alertStatus(group)?.tone === "unfavorable").length;
  const listRows = result.groups.map(group => {
    const state = alertStatus(group);
    const impact = group.impact_cents === null ? labels.shell.status.missing : formatSignedDelta(group.impact_cents, "L1");
    const tone = group.impact_cents !== null && deltaTone(CM, group.impact_cents, "L1") === "unfavorable" ? "negative" : undefined;
    const chip = group.primary.scope.kind === "all" ? "" : `<span class="scope-chip">${esc(channelsLabel(group.primary.scope.channels, source.alias))}</span>`;
    const bars = !VARIANCE_RULES.has(group.rule) ? `<span class="impact-bar is-empty" aria-hidden="true"></span>` : `<span class="impact-bar"${v4("G9：差額類規則的影響金額條（同一把尺；空心＝總差額）")}><span data-switch-panel="g9-threshold" data-value="0">${impactBar(group, "0.00")}</span><span data-switch-panel="g9-threshold" data-value="demo" hidden>${impactBar(group, THRESHOLD_DEMO)}</span></span>`;
    return `<li><details class="alert diagnosis-row" data-testid="diagnosis-row-${group.rule}"><summary><span class="chev" aria-hidden="true"></span>${state ? status(state.tone, state.text) : ""}<span class="diagnosis-headline">${esc(group.headline)}</span>${chip}<span class="diagnosis-impact">${numberLink(impact, tone)}${bars}</span></summary><div class="diagnosis-body"><p>${esc(group.cause)}</p><p>${esc(group.next_step)}</p></div></details></li>`;
  }).join("");
  const totalNote = book.mark("diagnosis.chartsV4.impact.totalNote", "空心條是扣廣告後貢獻的總差額，實心條是各項費用的差額", "G9");
  const switcher = `<div class="mockup-switch" role="group" aria-label="設計稿狀態切換"><span>設計稿狀態：</span><button type="button" data-switch="g9-threshold" data-value="0" aria-pressed="true">門檻 ${esc(formatAmountL2(result.importance_threshold))} 元（示範預設，刻度與零線重疊）</button><button type="button" data-switch="g9-threshold" data-value="demo" aria-pressed="false">門檻 ${esc(formatAmountL2(THRESHOLD_DEMO))} 元（示意，看門檻刻度）</button></div>`;
  const listHtml = `<section class="panel diagnosis-panel" aria-labelledby="diagnosis-heading"><div class="sec-head"><div class="sec-title"><h2 id="diagnosis-heading">${esc(labels.diagnosis.sections.diagnosisList)}<span class="diagnosis-badge">${status("unfavorable", labels.format.unfavorable)} ${unfavorableCount}</span></h2><p class="sub">${esc(labels.diagnosis.panel.diagnosisNote)}</p></div><span class="section-scope">${esc(scopeText)}</span></div>${switcher}<ol class="alert-list diagnosis-list" data-testid="diagnosis-list">${listRows}</ol><p class="note impact-note"${v4("G9：清單下方註明空心與實心條")}>${totalNote}</p><p class="note">設計稿只畫收合列；產品預設展開前 3 列（v3 既有，不變），展開內容不加圖。</p></section>`;
  data.g9 = { threshold: result.importance_threshold, max: maxImpact.toFixed(2), rows: result.groups.map(group => ({ rule: group.rule, impact: group.impact_cents, bar: VARIANCE_RULES.has(group.rule) && group.impact_cents !== null ? new Exact(group.impact_cents).abs().div(maxImpact).toFixed(4) : null, outline: group.rule === "REV_UP_CM_DOWN" })) };

  // ── G10 每 100 元淨營收去向：各通路的剩與段比率直接取 profitWaterfall(snapshot, channel)（A 級）；通路費用合計與超過 100 的幾何是設計稿試算（V4-3a 的 channelStructure）。
  const feesTitle = book.mark("diagnosis.chartsV4.share.feesTitle", "通路費用合計", "G10", "平台抽成、金流手續費、物流與包材費、其他變動費用四項相加（v4 GLOSSARY #16）");
  type ShareData = { key: string; label: string; netRevenue: string | null; cogs: string | null; fees: string | null; ad: string | null; perHundred: string | null; applicable: boolean; total: boolean; feeAmount: string | null };
  const shareOf = (scope: string, total: boolean): ShareData => {
    const waterfall = profitWaterfall(snapshot, scope, { allChannels: dataset.manifest.channels });
    const summaryOf = scope === "all" ? report.current : report.current.channels[scope];
    const share = (metric: MetricName) => waterfall.rows.find(row => row.metric === metric)?.share ?? null;
    const net = summaryOf.metrics.net_revenue;
    const fees = sumAmounts(COST_FIELDS.map(field => summaryOf.totals[field]));
    const feeShare = ratioMetric(fees, { cents: parseCents(net.value), reason_codes: net.reason_codes }).value;
    const deductions = ["cogs_net", ...COST_FIELDS, "ad_spend"] as const;
    const anyNegative = deductions.some(field => { const cents = parseCents(summaryOf.metrics[field].value); return cents !== null && cents < 0n; });
    const netCents = parseCents(net.value);
    const applicable = !anyNegative && netCents !== null && netCents > 0n;
    return { key: scope === "all" ? "total" : scope, label: scope === "all" ? labels.overview.sections.total : channelLabel(scope, source.alias), netRevenue: net.value, cogs: share("cogs_net"), fees: feeShare, ad: share("ad_spend"), perHundred: waterfall.perHundred, applicable, total, feeAmount: fees.cents === null ? null : new Exact(fees.cents.toString()).div(100).toFixed(2) };
  };
  const shares = [...channels.map(channel => shareOf(channel, false)), shareOf("all", true)];
  const per100 = (ratio: string | null) => ratio === null ? 0 : new Exact(ratio).times(100).toNumber();
  const remainLabel = (value: string) => new Exact(value).isNegative() ? book.note("diagnosis.chartsV4.share.loss", fill("虧 {n} 元", { n: new Exact(value).abs().toFixed(1) }), "G10") : book.note("diagnosis.chartsV4.share.remain", fill("剩 {n} 元", { n: value }), "G10");
  const notApplicable = book.note("diagnosis.chartsV4.share.notApplicableRow", labels.shell.status.notApplicable, "G10", "沿用 labels.shell.status.notApplicable，不另立新鍵");
  const shareSection = book.note("diagnosis.chartsV4.share.section", "每 100 元淨營收去向", "G10", "區塊標準名（v4 GLOSSARY #1），資料表 summary 與 caption 用");
  const shareRows: ShareRow[] = shares.map(item => ({
    key: item.key, label: item.label, total: item.total,
    segments: item.applicable ? [{ key: "cogs" as const, value: per100(item.cogs), color: colors.seg1 }, { key: "fees" as const, value: per100(item.fees), color: colors.seg2 }, { key: "ad" as const, value: per100(item.ad), color: colors.seg3 }] : null,
    remain: item.perHundred === null ? null : Number(item.perHundred),
    endLabel: !item.applicable || item.perHundred === null ? notApplicable : remainLabel(item.perHundred),
    endUnfavorable: item.perHundred !== null && new Exact(item.perHundred).isNegative(),
  }));
  const xMax = Math.max(100, ...shareRows.map(row => row.segments ? row.segments.reduce((sum, segment) => sum + segment.value, 0) : 0));
  const losing = shares.filter(item => !item.total && item.perHundred !== null && new Exact(item.perHundred).isNegative()).sort((a, b) => new Exact(a.perHundred!).comparedTo(b.perHundred!) || a.key.localeCompare(b.key));
  const least = shares.filter(item => !item.total && item.perHundred !== null).sort((a, b) => new Exact(a.perHundred!).comparedTo(b.perHundred!) || a.key.localeCompare(b.key));
  const shareTitle = losing.length > 0
    ? book.mark("diagnosis.chartsV4.share.title.loss", fill("{channel} 每 100 元淨營收，扣完廣告虧 {n} 元", { channel: losing[0].label, n: new Exact(losing[0].perHundred!).abs().toFixed(1) }), "G10", "取每 100 元虧最多的通路")
    : least.length > 0 ? book.mark("diagnosis.chartsV4.share.title.least", fill("{channel} 每 100 元淨營收，扣完廣告剩 {n} 元，最少", { channel: least[0].label, n: least[0].perHundred! }), "G10")
      : book.mark("diagnosis.chartsV4.share.title.notApplicable", "每 100 元淨營收去向，各通路都不適用", "G10");
  const shareSubtitle = book.mark("diagnosis.chartsV4.share.subtitle", fill("{section} · 本期 {period} · {scope}", { section: "每 100 元淨營收去向", period: periodText, scope: scopeText }), "G10");
  const remainLegend = book.mark("diagnosis.chartsV4.share.segments.remain", "扣完剩下", "G10", "圖例的空心框；超過 100 的部分沒有圖例，由右端「虧 n 元」與不利色承擔");
  const shareHeight = channels.length <= 5 ? "sm" : "lg";
  const shareWidth = (bp: Breakpoint) => PANEL_INNER[bp];
  const shareBody = responsive(bp => shareStackSvg(shareRows, { width: shareWidth(bp), labelWidth: bp === "sm" ? 136 : 160, endWidth: bp === "sm" ? 64 : 88, testIdPrefix: "chart-diagnosis-share-seg-", xMax, axisLabel: value => value === 100 || value === 0 || value % 25 === 0 ? String(value) : "" }));
  const shareTable = dataTable({
    caption: esc(fill(labels.overview.page.captionWithUnit, { caption: shareSection })),
    head: [esc(labels.overview.page.colChannel), ...(["net_revenue", "cogs_net", ...COST_FIELDS, "ad_spend", CM] as const).map(name => esc(metricDefinitions[name].label)), book.mark("diagnosis.chartsV4.share.columns.perHundred", "每 100 元剩", "G10")],
    rows: shares.map(item => {
      const summaryOf = item.key === "total" ? report.current : report.current.channels[item.key];
      return [esc(item.label), ...(["net_revenue", "cogs_net", ...COST_FIELDS, "ad_spend", CM] as const).map(name => numberLink(formatAmountL2(summaryOf.metrics[name].value), name === CM && deltaTone(CM, summaryOf.metrics[name].value, "L2") === "unfavorable" ? "negative" : undefined)), esc(item.perHundred === null ? labels.shell.status.notApplicable : item.perHundred)];
    }),
    testId: "chart-diagnosis-share-table",
  });
  const g10 = chartFrame({
    id: "share", testId: "chart-diagnosis-share", title: shareTitle, subtitle: shareSubtitle, height: shareHeight,
    legend: [{ label: esc(metricDefinitions.cogs_net.label), color: colors.seg1 }, { label: feesTitle, color: colors.seg2 }, { label: esc(metricDefinitions.ad_spend.shortLabel), color: colors.seg3 }, { label: remainLegend, color: colors.total, shape: "rect" }],
    v4Note: "G10：新增（C27 ShareStack；三段灰階＋空心剩下；超過 100 的部分塗不利色）",
    after: trialNote("設計稿試算：「通路費用合計」以 sumAmounts 加總四項、佔淨營收以 ratioMetric 計算，超過 100 的幾何由產生器算；正式數字由 V4-3a 的 B 級函式 channelStructure（channel-structure-v1）產生。各通路的剩與商品成本、廣告段的比率直接取自 profitWaterfall（contribution-v1）。"),
    dataTable: { title: shareSection, content: shareTable },
    body: shareBody,
  });
  data.g10 = { xMax, rows: shares.map(item => ({ key: item.key, netRevenue: item.netRevenue, cogsShare: item.cogs, feesAmount: item.feeAmount, feesShare: item.fees, adShare: item.ad, perHundred: item.perHundred, applicable: item.applicable })) };

  // ── G11 日 × 通路月曆熱表：列＝snapshot 週（從期間起日每 7 天），欄＝該週第 1 到 7 天（欄頭標星期）；階 1＝取位到元後仍為負，階 2＝該通路最差 3 天。
  const start = report.current.period.start;
  const days = periodDays(report.current.period.start, report.current.period.end) ?? 0;
  const weekCount = Math.ceil(days / 7);
  const weekdayNames = ["日", "一", "二", "三", "四", "五", "六"];
  const dayHeads = Array.from({ length: 7 }, (_, offset) => book.note(`diagnosis.chartsV4.heat.weekdays.${["sun", "mon", "tue", "wed", "thu", "fri", "sat"][weekdayOf(addDays(start, offset))]}`, weekdayNames[weekdayOf(addDays(start, offset))], "G11"));
  const byChannel = new Map<string, Map<string, DailyChannel>>();
  for (const day of report.current.daily) {
    const map = byChannel.get(day.channel) ?? new Map<string, DailyChannel>();
    map.set(day.date, day);
    byChannel.set(day.channel, map);
  }
  type HeatChannel = { channel: string; label: string; losing: { date: string; value: string }[]; worst3: Set<string>; lowest: { date: string; value: string } | null };
  const heat: HeatChannel[] = channels.map(channel => {
    const daysOf = [...(byChannel.get(channel)?.values() ?? [])].filter(day => day.metrics[CM].value !== null).sort((a, b) => a.date.localeCompare(b.date));
    const losing = daysOf.filter(day => negativeAfterYuan(day.metrics[CM].value)).map(day => ({ date: day.date, value: day.metrics[CM].value! }));
    const ranked = [...losing].sort((a, b) => new Exact(a.value).comparedTo(b.value) || a.date.localeCompare(b.date));
    const lowestDay = [...daysOf].sort((a, b) => new Exact(a.metrics[CM].value!).comparedTo(b.metrics[CM].value!) || a.date.localeCompare(b.date))[0];
    return { channel, label: channelLabel(channel, source.alias), losing, worst3: new Set(ranked.slice(0, 3).map(item => item.date)), lowest: lowestDay ? { date: lowestDay.date, value: lowestDay.metrics[CM].value! } : null };
  });
  const allLosing = heat.flatMap(item => item.losing.map(day => ({ ...day, item })));
  const worstDay = [...allLosing].sort((a, b) => new Exact(a.value).comparedTo(b.value) || a.date.localeCompare(b.date))[0] ?? null;
  const lowest = [...heat].filter(item => item.lowest !== null).sort((a, b) => new Exact(a.lowest!.value).comparedTo(b.lowest!.value))[0] ?? null;
  const titled = worstDay?.item ?? lowest;
  const ordered = titled ? [titled, ...heat.filter(item => item !== titled)] : heat;
  const heatTitle = worstDay
    ? book.mark("diagnosis.chartsV4.heat.title.loss", fill("{channel} 有 {n} 天虧，最差 {date} {amount}", { channel: worstDay.item.label, n: worstDay.item.losing.length, date: md(worstDay.date), amount: formatAmountL1(worstDay.value) }), "G11", "「虧」＝取位到元後仍為負")
    : book.mark("diagnosis.chartsV4.heat.title.none", fill("沒有虧損日，最低 {channel} {date} {amount}", { channel: lowest?.label ?? "", date: lowest?.lowest ? md(lowest.lowest.date) : "", amount: lowest?.lowest ? formatAmountL1(lowest.lowest.value) : "" }), "G11");
  const heatSubtitle = book.mark("diagnosis.chartsV4.heat.subtitle", fill("各通路每天的扣廣告後貢獻 · 本期 {period} · 格內單位萬元；有底色的是虧的日子，加框的是各通路最差 3 天", { period: periodText }), "G11", "顏色只輔助，負值由格內 U+2212 承擔");
  const scrollNote = book.mark("diagnosis.chartsV4.heat.scrollNote", "其餘通路在框內捲動", "G11", "只在一列放不下全部月曆時顯示（390 與 768）");
  const weekHead = book.note("diagnosis.chartsV4.heat.weekHead", "週", "G11", "列頭寫該週起日（M/D）");
  const calendars = ordered.map(item => {
    const map = byChannel.get(item.channel) ?? new Map<string, DailyChannel>();
    const rows = Array.from({ length: weekCount }, (_, week) => {
      const cells = Array.from({ length: 7 }, (_, offset) => {
        const index = week * 7 + offset;
        if (index >= days) return `<td data-tier="outside"></td>`;
        const date = addDays(start, index);
        const day = map.get(date);
        const value = day?.metrics[CM].value ?? null;
        if (value === null) return `<td data-tier="missing" data-testid="chart-diagnosis-heat-cell-${item.channel}-${date}"><span class="heat-missing">${esc(labels.shell.status.missing)}</span></td>`;
        const tier = item.worst3.has(date) ? 2 : negativeAfterYuan(value) ? 1 : 0;
        const aria = book.note("diagnosis.chartsV4.heat.cellAria", fill("{channel} {date} 扣廣告後貢獻 {value} 元，看明細", { channel: item.label, date: md(date), value: formatAmountL2(value) }), "G11", "number-link 的可及名稱帶 L2");
        return `<td data-tier="${tier}" data-testid="chart-diagnosis-heat-cell-${item.channel}-${date}"><span class="number-link heat-link" title="${esc(aria)}">${esc(formatHeatCell(value) ?? "")}</span></td>`;
      }).join("");
      return `<tr><th scope="row">${esc(md(addDays(start, week * 7)))}</th>${cells}</tr>`;
    }).join("");
    const caption = book.note("diagnosis.chartsV4.heat.caption", fill("{channel}（萬元）", { channel: item.label }), "G11");
    return `<table class="heat-table" role="grid" aria-label="${esc(caption)}"><caption>${esc(caption)}</caption><thead><tr><th scope="col">${esc(weekHead)}</th>${dayHeads.map(head => `<th scope="col">${esc(head)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
  const g11 = chartFrame({
    id: "heat", testId: "chart-diagnosis-heat", title: heatTitle, subtitle: `${heatSubtitle}<span class="heat-scroll-note">；${scrollNote}</span>`, height: "lg", mode: "table",
    v4Note: "G11：新增（C28 calendar，ChartFrame table 模式：不設 aria-hidden，整張熱表 1 個 Tab 停留點）",
    after: trialNote("設計稿試算：分階（階 1＝取位到元後仍為負、階 2＝各通路最差 3 天）與格內格式由產生器照 PRD 規則算；正式由 V4-3b 的 dailyHeatmap（daily-heatmap-v1）與 formatHeatCell 產生。格值直接取自 report.current.daily（contribution-v1）。"),
    body: `<div class="table-scroll heat-scroll" role="region" aria-labelledby="heat-title" tabindex="0"><div class="heat-grid">${calendars}</div></div>`,
  });
  data.g11 = { weekCount, weekdays: dayHeads, order: ordered.map(item => item.channel), channels: heat.map(item => ({ channel: item.channel, losingDays: item.losing.length, worst3: [...item.worst3], worst: item.losing.length ? [...item.losing].sort((a, b) => new Exact(a.value).comparedTo(b.value))[0] : null })), worstDay: worstDay ? { channel: worstDay.item.channel, date: worstDay.date, value: worstDay.value, cell: formatHeatCell(worstDay.value) } : null };

  // ── G12 五項比率走勢（<details> 內；設計稿畫展開狀態）：每張子圖各自的 Y；本期、上期以第 n 週對齊。
  const weeks = snapshot.weeks;
  const currentWeeks = weeks.filter(week => week.period === "current");
  const previousWeeks = weeks.filter(week => week.period === "previous");
  const length = Math.max(currentWeeks.length, previousWeeks.length);
  const multiples = (bp: Breakpoint) => RATES.map(rate => {
    const current = Array.from({ length }, (_, i) => coordinate(currentWeeks[i]?.metrics[rate].value ?? null));
    const previous = Array.from({ length }, (_, i) => coordinate(previousWeeks[i]?.metrics[rate].value ?? null));
    const scale = rateScale([...current, ...previous]);
    const tickLabels = scale.ticks.map(tick => `${Number((tick * 100).toFixed(4))}%`);
    const lastCurrent = [...currentWeeks].reverse().find(week => week.metrics[rate].value !== null);
    const height = SM - 20;
    const svg = lineSvg({ width: MULTIPLE_WIDTH[bp], height, scale, tickLabels, xLabels: Array.from({ length }, (_, i) => bp === "md" ? (i === 0 || i === length - 1 ? String(i + 1) : "") : String(i + 1)), margin: { top: 18, right: bp === "md" ? 4 : 8, bottom: 20, left: bp === "md" ? 30 : 38 }, series: [
      { key: "previous", values: previous, color: colors.previous, width: 1.5 },
      { key: "current", values: current, color: colors.current, width: 2, lastDot: true, lastStrong: true, lastLabel: lastCurrent ? formatRateL1(lastCurrent.metrics[rate].value) : undefined },
    ] });
    return `<figure class="multiple"><figcaption>${esc(metricDefinitions[rate].label)}</figcaption>${svg}</figure>`;
  }).join("");
  const ratesSummary = book.mark("diagnosis.chartsV4.rates.summary", "五項比率走勢", "G12", "<details> 的 summary");
  const ratesTitle = book.mark("diagnosis.chartsV4.rates.title", "五項比率每週走勢", "G12", "區塊名，不寫結論句、不做跨比率排名");
  const ratesSubtitle = book.mark("diagnosis.chartsV4.rates.subtitle", fill("本期 {period} 與上期各 {n} 週，以第幾週對齊 · 每張圖的刻度各自不同", { period: periodText, n: length }), "G12");
  const ratesTable = dataTable({ caption: esc(ratesTitle.replace(/<[^>]+>/g, "")), head: [esc(labels.overview.page.colPeriod), esc(labels.overview.page.colRange), ...RATES.map(rate => esc(metricDefinitions[rate].label))], numeric: [false, false, true, true, true, true, true], rows: weeks.map(week => [esc(week.label), esc(`${md(week.start)}–${md(week.end)}`), ...RATES.map(rate => numberLink(formatRateL2(week.metrics[rate].value)))]), testId: "chart-diagnosis-rates-table" });
  const g12 = `<details class="chart-more" open${v4("G12：新增，在 <details> 內（設計稿畫展開狀態）；子圖各自 Y；390 單欄 5 張、框高 180 × 5")}><summary>${ratesSummary}</summary>${chartFrame({
    id: "rates", testId: "chart-diagnosis-rates", title: ratesTitle, subtitle: ratesSubtitle, height: "sm", frameClassName: "multiples",
    legend: [{ label: esc(labels.overview.trendV3.legend.current), color: colors.current }, { label: esc(labels.overview.trendV3.legend.previous), color: colors.previous }, { label: esc(labels.overview.trendYoyV3.legend), color: colors.yoy, shape: "dash", note: snapshot.yoy?.status === "ready" ? undefined : esc(labels.overview.chartFrame.noData) }],
    dataTable: { title: "五項比率每週走勢", content: ratesTable },
    body: responsive(bp => `<div class="multiples-grid">${multiples(bp)}</div>`),
  })}</details>`;
  data.g12 = RATES.map(rate => { const values = weeks.map(week => coordinate(week.metrics[rate].value)); const scale = rateScale(values); return { rate, lo: scale.lo, hi: scale.hi, ticks: scale.ticks }; });

  // ── 通路寬表（v3 既有）＋G7b「近 n 週」sparkline 與 <details>「各通路每週」
  const summary = buildManagerSummary(snapshot);
  const sorted = [...summary.channels].sort((a, b) => { const x = parseCents(a.contribution.current.value), y = parseCents(b.contribution.current.value); if (x === null || y === null) return 0; return x < y ? -1 : x > y ? 1 : 0; });
  // 設計稿試算：每通路逐週再呼叫一次 aggregatePeriod（V4-3a 的 channelWeeks 會在健檢頁元件內以 useMemo 計算，通路 ≤ 8）。
  const channelWeeks = new Map(channels.map(channel => [channel, currentWeeks.slice(-8).map(week => ({ week, value: aggregatePeriod(dataset, { start: week.start, end: week.end }, [channel]).metrics[CM].value }))]));
  const sparkText = fill("近 {n} 週", { n: Math.min(currentWeeks.length, 8) });
  const sparkHead = book.mark("diagnosis.chartsV4.channelsSpark.head", sparkText, "G7b");
  const diagnosisOf = (channel: string) => result.groups.find(group => group.scopes.some(({ scope }) => scope.channels.includes(channel) && (scope.kind !== "all" || scope.channels.length === 1)));
  const wideRows = sorted.map(item => {
    const name = channelLabel(item.channel, source.alias);
    const label = (name: "net_revenue" | "contribution_after_marketing", period: "current" | "previous" | "change") => esc(period === "change" ? fill(labels.diagnosis.tableV3.changeLabel, { metric: metricDefinitions[name].shortLabel }) : fill(labels.diagnosis.tableV3.cellLabel, { period: labels.shell.periods[period], metric: metricDefinitions[name].shortLabel }));
    const cell = (value: string | null, name: "net_revenue" | "contribution_after_marketing", period: "current" | "previous" | "change") => { const signed = period === "change"; const unfavorable = value !== null && (signed ? deltaTone(CM, value, "L2") === "unfavorable" : negativeAfterYuan(value)); return `<td class="num${period === "previous" ? " prev" : ""}" data-label="${label(name, period)}">${numberLink(signed ? formatSignedDelta(value, "L2") : formatAmountL2(value), unfavorable ? "negative" : undefined)}</td>`; };
    const turned = item.contribution.transition === "turned_negative" ? status("unfavorable", labels.overview.channelsV3.turnedNegative) : "";
    const group = diagnosisOf(item.channel);
    const points = (channelWeeks.get(item.channel) ?? []).map(point => ({ value: coordinate(point.value), hollow: periodDays(point.week.start, point.week.end) !== 7 }));
    return `<tr><th scope="row">${esc(name)}</th>${cell(item.revenue.current.value, "net_revenue", "current")}${cell(item.revenue.previous.value, "net_revenue", "previous")}${cell(item.revenue.change.value, "net_revenue", "change")}${cell(item.contribution.current.value, CM_NAME, "current")}${cell(item.contribution.previous.value, CM_NAME, "previous")}${cell(item.contribution.change.value, CM_NAME, "change")}<td class="spark-cell" data-label="${esc(sparkText)}">${sparkline(points, `chart-diagnosis-channels-spark-${item.channel}`)}</td><td class="note-cell" data-label="${esc(labels.diagnosis.tableV3.note)}">${turned}${group ? `<span class="text-link">${esc(group.headline)}</span>` : ""}</td></tr>`;
  }).join("");
  const groupHead = (name: "net_revenue" | "contribution_after_marketing") => `<th scope="colgroup" colspan="3" class="group-head">${esc(fill(labels.format.units.yuanColumn, { label: metricDefinitions[name].label }))}</th>`;
  const sub = `<th scope="col" class="num">${esc(labels.shell.periods.current)}</th><th scope="col" class="num prev">${esc(labels.shell.periods.previous)}</th><th scope="col" class="num">${esc(labels.diagnosis.tableV3.change)}</th>`;
  const wideTable = `<div class="table-scroll channel-table-scroll" role="region" tabindex="0" aria-label="${esc(labels.overview.sections.channelTableAria)}"><table class="ui-table channel-table-v3"><caption>${esc(labels.overview.sections.channelTableCaption)}</caption><thead><tr><th scope="col" rowspan="2">${esc(labels.overview.page.colChannel)}</th>${groupHead("net_revenue")}${groupHead(CM_NAME)}<th scope="col" rowspan="2" class="spark-head"${v4("G7b：新增「近 n 週」sparkline 欄")}>${sparkHead}</th><th scope="col" rowspan="2">${esc(labels.diagnosis.tableV3.note)}</th></tr><tr>${sub}${sub}</tr></thead><tbody>${wideRows}</tbody></table></div>`;
  const weeklyTitle = book.mark("diagnosis.chartsV4.channelsSpark.tableTitle", "各通路每週", "G7b");
  const lastWeeks = currentWeeks.slice(-8);
  const weeklyTable = dataTable({ caption: book.mark("diagnosis.chartsV4.channelsSpark.caption", fill("各通路每週扣廣告後貢獻（本期最後 {n} 週，元）", { n: lastWeeks.length }), "G7b"), head: [esc(labels.overview.page.colChannel), ...lastWeeks.map(week => esc(`${week.label} ${md(week.start)}–${md(week.end)}`))], rows: sorted.map(item => [esc(channelLabel(item.channel, source.alias)), ...(channelWeeks.get(item.channel) ?? []).map(point => numberLink(formatAmountL2(point.value), point.value !== null && new Exact(point.value).isNegative() ? "negative" : undefined))]), testId: "chart-diagnosis-channels-table" });
  const channelSection = `<section class="panel channel-compare" data-testid="channel-compare" aria-labelledby="channel-compare-title"><div class="sec-head"><div class="sec-title"><h2 id="channel-compare-title">${esc(labels.diagnosis.tableV3.heading)}</h2><p class="sub">${esc(labels.diagnosis.panel.channelTableCaution)}</p></div><span class="section-scope">${esc(scopeText)}</span></div>${wideTable}${trialNote("設計稿試算：「近 n 週」由產生器每通路逐週呼叫 aggregatePeriod；正式數字由 V4-3a 的 B 級函式 channelWeeks（channel-weeks-v1）產生，不放進快照，通路 > 8 時不計算。")}<details class="data-alternative"${v4("G7b：新增資料表「各通路每週」")}><summary>${esc(fill(labels.overview.page.dataTable, { title: "" }))}${weeklyTitle}</summary>${weeklyTable}</details></section>`;
  data.g7b = Object.fromEntries([...channelWeeks].map(([channel, points]) => [channel, points.map(point => ({ start: point.week.start, end: point.week.end, value: point.value }))]));

  const ai = `<details class="panel ai-collapse"><summary>${esc(fill(labels.diagnosis.aiCollapse.summary, { status: labels.diagnosis.aiCollapse.status.off }))} <small>${esc(labels.diagnosis.aiCollapse.publicNote)}</small></summary></details>`;

  const content = `${listHtml}${g10}${g11}${g12}${channelSection}${ai}`;
  const html = pageDocument({ page: "diagnosis", docTitle: "通路健檢 · H5 設計稿", source, content, proposals: book, diagnosisBadge: unfavorableCount });
  data.proposals = book.items;
  return { file: "diagnosis.html", html, data, proposals: book };
}
