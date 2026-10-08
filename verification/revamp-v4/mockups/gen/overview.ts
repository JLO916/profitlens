import Decimal from "decimal.js";
import { assistKpis, netRevenuePerUnit, type AssistKpiId } from "@/application/assist-kpi";
import { breakevenMer, breakevenNote } from "@/application/breakeven-mer";
import { channelConclusion, trendTakeaways } from "@/application/chart-takeaways";
import { channelsLabel } from "@/application/copy";
import { diagnosisGroups } from "@/application/diagnosis-group";
import { buildManagerSummary } from "@/application/manager-summary";
import { deltaTone, favorableDirectionOf, formatAmountL1, formatAmountL2, formatCount, formatMetric, formatPerUnit, formatSignedDelta, metricDefinitions, periodDays } from "@/application/presentation";
import { achievement, achievementText, matchTargets, TARGET_METRICS, type TargetMetric } from "@/application/targets";
import { bridgeWaterfall, profitWaterfall, profitWaterfallScopes } from "@/application/waterfall";
import { snapshotSentence } from "@/application/weekly-summary";
import { bridgeRowText, bridgeUnitNote } from "@/components/overview/charts/bridge-section";
import { axisTicks } from "@/components/overview/charts/chart-frame";
import { profitRowLabel } from "@/components/overview/charts/profit-section";
import { KPI_BAND_METRICS, KPI_KEY_METRIC, kpiDelta } from "@/components/overview/kpi-band";
import { snapshotMeta } from "@/components/overview/weekly-snapshot";
import { alertStatus, toneClass } from "@/components/top-three";
import { aggregatePeriod } from "@/domain/aggregation";
import type { Metric, MetricName } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { barCell, channelBarsSvg, lineSvg, responsive, sparkline, waterfallSvg, type Breakpoint, type Scale } from "./charts";
import { pageDocument } from "./chrome";
import { coordinate, esc, formatAxisWan, niceScale, niceStep } from "./format";
import { chartFrame, dataTable, numberLink, ProposalBook, trialNote, v4 } from "./html";
import type { MockupSource } from "./source";
import { colors } from "./theme";

// H5 設計稿：經營總覽（示範資料）。由上到下依 PRD §5.1：頁首與期間列、本期一句話、KPI 帶（G5 細條）、本期三件事、
// G1 貢獻變化拆解（ChartFrame＋aside 橋接表＋G6）、G2 本期利潤結構（與 G1 共同尺度）、.pair（G3、G4）、其他常用指標（G7a、G5 MER 列）、進階。

/** 各斷點的面板內寬（px）：主內容寬 −（面板框線 2）−（面板內距 48；≤ 767 為 32）。主內容寬＝視窗 − 側欄 220（≤ 767 沒有）− 左右 gutter。 */
export const PANEL_INNER: Record<Breakpoint, number> = { xl: 1122, lg: 962, md: 450, sm: 324 };
/** .pair 兩欄（≥ 1281）時每個面板的內寬；1280 以下單欄。 */
const PAIR_INNER: Record<Breakpoint, number> = { xl: 524, lg: 962, md: 450, sm: 324 };
/** G1 左欄寬（7fr／5fr、間距 24；≤ 1023 單欄）與最小寬 520（BRIDGE_MIN_WIDTH）。 */
const G1_WIDTH: Record<Breakpoint, number> = { xl: Math.floor((1122 - 24) * 7 / 12), lg: Math.floor((962 - 24) * 7 / 12), md: 520, sm: 520 };
/** G2 最小寬 600（PROFIT_MIN_WIDTH）。 */
const G2_WIDTH: Record<Breakpoint, number> = { xl: 1122, lg: 962, md: 600, sm: 600 };
const LG = 320, SM = 180;
const CM: MetricName = "contribution_after_marketing";
const Exact = Decimal.clone({ precision: 60, rounding: Decimal.ROUND_HALF_UP });

export interface PageOutput { file: string; html: string; data: Record<string, unknown>; proposals: ProposalBook }

const status = (tone: "warning" | "favorable" | "unfavorable" | "neutral", text: string) => `<span class="ui-lozenge" data-tone="${tone}">${esc(text)}</span>`;

export function buildOverview(source: MockupSource): PageOutput {
  const { snapshot, dataset } = source;
  const { report } = snapshot;
  const book = new ProposalBook();
  const data: Record<string, unknown> = { source: source.spec.id, period: { previous: report.previous.period, current: report.current.period } };

  // ── 本期一句話（v3 既有，不變）
  const sentence = snapshotSentence(snapshot, { missingItems: dataset.issues.length });
  const snapshotHtml = `<section class="snapshot" aria-label="${esc(labels.overview.snapshotUi.heading)}"><div class="snapshot-text"><h2 class="snapshot-sentence">${esc(sentence.text)}</h2><p class="snapshot-meta">${esc(snapshotMeta(snapshot, dataset.manifest.channels))}</p></div><div class="snapshot-actions"><span class="ui-btn ui-btn-secondary">${esc(labels.overview.snapshotUi.copy)}</span><span class="text-link">${esc(fill(labels.overview.snapshotUi.meetingEntry, { state: labels.shell.sidebarV3.meetingDraft }))}</span></div></section>`;
  data.sentence = sentence.text;

  // ── KPI 帶（v3 既有；G5 目標細條改用 C18 共用元件與 --chart-target，外觀與高度不變）
  const targetMatches = matchTargets(source.targets, { current_period: report.current.period, channels: report.scope.channels, allChannels: dataset.manifest.channels });
  const kpiData: Record<string, unknown>[] = [];
  const kpis = KPI_BAND_METRICS.map(name => {
    const before = report.previous.metrics[name], current = report.current.metrics[name];
    const change = kpiDelta(name, before, current);
    const tone = change.delta === null ? "" : toneClass(deltaTone(name, change.delta, "L1"));
    let target = "";
    if ((TARGET_METRICS as readonly string[]).includes(name)) {
      const match = targetMatches[name as TargetMetric];
      if (match.status === "matched") {
        const result = achievement(current, match.row.target);
        const ratio = result.rate === null ? null : new Exact(current.value ?? "0").div(match.row.target);
        const behind = ratio !== null && (favorableDirectionOf(name) === "up" ? ratio.lt(1) : ratio.gt(1));
        const width = ratio === null ? 0 : Decimal.min(Decimal.max(ratio, 0), 1).times(100).toFixed(1);
        target = `<p class="kpi-target" data-testid="kpi-target-${name}"${v4("G5：細條抽成 C18 Bullet，色改引用 --chart-total／--chart-unfavorable／--chart-target，外觀不變")}><span class="kpi-bullet${behind ? " is-behind" : ""}" aria-hidden="true"><span class="kpi-bullet-bar" style="width: ${width}%"></span><span class="kpi-bullet-target"></span></span>${numberLink(achievementText(match.row, current, "L1"))}</p>`;
        kpiData.push({ metric: name, target: match.row.target, actual: current.value, rate: result.display, behind });
      }
    }
    const deltaHtml = change.text === null ? `<span>${esc(labels.overview.page.changePending)}</span>` : `${change.long ? `<span class="dl-long">${esc(labels.overview.kpiBand.vsPrevious)}</span>` : ""}${numberLink(change.text)}${change.growth ? `<span class="pct">${esc(change.growth)}</span>` : ""}`;
    return `<div class="kpi${name === KPI_KEY_METRIC ? " is-key" : ""}" data-testid="kpi-${name}"><div class="kpi-name"><span>${esc(metricDefinitions[name].label)}</span><span class="btn-help" aria-hidden="true">?</span></div><div class="kpi-value">${numberLink(formatMetric(name, current, "L1"))}</div><div class="kpi-delta ${tone}">${deltaHtml}</div><p class="kpi-prev">${esc(labels.shell.periods.previous)} ${numberLink(formatMetric(name, before, "L1"))}</p>${target}</div>`;
  }).join("");
  const kpiHtml = `<section class="kpi-section" aria-label="${esc(labels.overview.sections.kpis)}"><div class="kpi-head"><span class="unit-note">${esc(labels.overview.page.kpiHint)}</span></div><div class="kpi-band" data-testid="kpi-band">${kpis}</div></section>`;
  data.kpiTargets = kpiData;

  // ── 本期三件事（v3 既有，不變）
  const groups = diagnosisGroups(snapshot);
  const topRows = groups.priorities.map(group => {
    const state = alertStatus(group);
    const impact = group.impact_cents === null ? labels.shell.status.missing : formatSignedDelta(group.impact_cents, "L1");
    const impactTone = group.impact_cents !== null && deltaTone(CM, group.impact_cents, "L1") === "unfavorable" ? "negative" : undefined;
    return `<li class="alert-row"><div class="alert-main"><span class="chev" aria-hidden="true"></span>${state ? status(state.tone, state.text) : ""}<div class="alert-text"><strong>${esc(group.headline)}</strong><p>${esc(`${group.cause}${group.next_step}`)}</p></div></div><div class="alert-side"><span class="impact-label">${esc(labels.overview.sections.impact)}</span>${numberLink(impact, impactTone)}<span class="ui-btn ui-btn-secondary ui-btn-sm">${esc(labels.evidence.buttons.viewEvidence)}</span><span class="ui-btn ui-btn-secondary ui-btn-sm">${esc(labels.actions.buttons.addToActions)}</span></div></li>`;
  }).join("");
  const topHtml = `<section class="top-three" aria-labelledby="top-three-title"><div class="section-head"><h2 id="top-three-title">${esc(labels.overview.sections.topThree)}</h2><span class="section-scope">${esc(channelsLabel(report.scope.channels, source.alias))}</span><span class="section-end">${esc(labels.overview.sections.impactLegend)}<span class="btn-help" aria-hidden="true">?</span><span class="text-link">${esc(labels.overview.sections.adjustThreshold)}</span></span></div><ol class="alert-list">${topRows}</ol><p class="view-all"><span class="text-link">${esc(fill(labels.overview.alerts.viewAll, { n: groups.groups.length }))}</span></p></section>`;

  // ── G1、G2 共同尺度：G1 的 bars 加上 profitWaterfallScopes 全部範圍的 G2 bars（PRD §4.4 G1、G2；CHART_CATALOG G2）。
  const bridge = bridgeWaterfall(snapshot);
  const scopes = profitWaterfallScopes(snapshot);
  const profits = scopes.map(scope => ({ scope, data: profitWaterfall(snapshot, scope.id, { allChannels: dataset.manifest.channels }) }));
  const levels = (bars: readonly { start: string | null; end: string | null }[]) => bars.flatMap(bar => [coordinate(bar.start), coordinate(bar.end)]);
  const common = niceScale([...levels(bridge.bars), ...profits.flatMap(item => levels(item.data.bars))]);
  const own = niceScale(levels(bridge.bars));
  const g1Tallest = { common: waterfallSvg(bridge.bars, { width: G1_WIDTH.xl, height: LG, scale: common }).tallest, own: waterfallSvg(bridge.bars, { width: G1_WIDTH.xl, height: LG, scale: own }).tallest };
  data.waterfallScale = { common, g1Only: own, commonTicks: formatAxisWan(common.ticks, common.step), g1TallestBarPx1440: g1Tallest };

  // G6：九項差額列的變異條（≤ 767 才顯示；≥ 768 以 CSS 隱藏但掛載）。條長＝|值| ÷ 九項 |值| 最大值。
  const deltas = bridge.rows.filter(row => row.kind === "delta");
  const maxDelta = deltas.reduce((max, row) => row.metric.value === null ? max : Decimal.max(max, new Exact(row.metric.value).abs()), new Exact(0));
  const bridgeRows = bridge.rows.map(row => {
    let cell = "";
    if (row.kind === "delta" && row.metric.value !== null && !maxDelta.isZero()) {
      const value = new Exact(row.metric.value);
      const unfavorable = deltaTone(CM, row.metric.value) === "unfavorable";
      cell = barCell({ ratio: value.abs().div(maxDelta).toNumber(), negative: value.isNegative(), color: unfavorable ? colors.unfavorable : colors.favorable, testId: `chart-overview-bridge-bar-${row.field}` });
    }
    const tone = row.metric.value !== null && row.kind !== "start" && row.kind !== "end" && deltaTone(CM, row.metric.value, "L3") === "unfavorable" ? "negative" : undefined;
    const cls = row.kind === "end" ? "is-subtotal" : row.kind === "total" ? "is-total" : row.kind === "start" ? "" : "";
    return `<tr class="${cls}" data-row="${row.id}"><th scope="row">${esc(row.label)}</th><td class="num">${cell ? `<span class="g6-cell"${v4("G6：≤ 767 顯示的變異條，條長＝|值| ÷ 九項 |值| 最大值")}>${cell}</span>` : ""}${numberLink(bridgeRowText(row), tone)}</td></tr>`;
  }).join("");
  const bridgeTable = `<div class="bridge-table-wrap"><table class="kv l3 bridge-table" data-testid="bridge-table"><caption class="sr-only">${esc(labels.overview.page.bridgeCaption)}</caption><thead><tr><th scope="col">${esc(labels.overview.bridgeV3.table.item)}</th><th scope="col" class="num">${esc(labels.overview.bridgeV3.table.amount)}</th></tr></thead><tbody>${bridgeRows}<tr class="balance"><th scope="row">${esc(labels.overview.bridgeV3.balance.label)}</th><td class="num" data-testid="bridge-balance-check">${esc(bridge.balanceText)}</td></tr></tbody></table></div>`;
  data.bridge = { title: bridge.title, bars: bridge.bars.map(bar => ({ id: bar.id, start: bar.start, end: bar.end, display: bar.display })), g6: deltas.map(row => ({ field: row.field, value: row.metric.value, ratio: row.metric.value === null || maxDelta.isZero() ? null : new Exact(row.metric.value).abs().div(maxDelta).toFixed(4) })) };
  const v2Rows = deltas.map(row => [esc(metricDefinitions[row.field!].label), numberLink(formatAmountL2(report.previous.metrics[row.field!].value)), numberLink(formatAmountL2(report.current.metrics[row.field!].value)), numberLink(formatSignedDelta(row.metric.value, "L2"))]);
  const g1 = chartFrame({
    id: "bridge", testId: "bridge-section", className: "bridge-section",
    title: esc(bridge.title), subtitle: esc(fill(labels.overview.bridgeV3.subtitleWithNote, { subtitle: bridge.subtitle, note: bridge.note })),
    unitNote: esc(bridgeUnitNote(bridge.bars)), height: "lg", frameClassName: "waterfall",
    aside: bridgeTable,
    v4Note: "G1：搬進 ChartFrame（aside 橋接表在 DOM 前、unitNote、frameClassName=waterfall）；與 G2 共同尺度；刻度 formatAxisWan；390 時橋接表在前、瀑布在框內水平捲動",
    dataTable: { title: labels.overview.sections.bridge, content: dataTable({ caption: esc(fill(labels.overview.page.captionWithUnit, { caption: labels.overview.sections.bridge })), head: [esc(labels.overview.page.colItem), esc(labels.shell.periods.previous), esc(labels.shell.periods.current), esc(labels.overview.sections.impact)], rows: v2Rows }) },
    body: responsive(bp => waterfallSvg(bridge.bars, { width: G1_WIDTH[bp], height: LG, scale: common, testId: bp === "xl" ? "bridge-waterfall" : undefined }).svg),
  });

  // ── G2：範圍切換只影響本圖，沿用共同尺度（柱較短是刻意的，切換範圍時可比）。設計稿用少量 JS 切換三個範圍。
  const seg = `<div class="seg" role="group" aria-label="${esc(labels.overview.profit.scope.aria)}" data-testid="profit-waterfall-scope">${scopes.map((scope, index) => `<button type="button" data-switch="profit" data-value="${esc(scope.id)}" aria-pressed="${index === 0}">${esc(scope.label)}</button>`).join("")}</div>`;
  const panels = (render: (item: typeof profits[number]) => string) => profits.map((item, index) => `<div data-switch-panel="profit" data-value="${esc(item.scope.id)}"${index === 0 ? "" : " hidden"}>${render(item)}</div>`).join("");
  const profitTable = (item: typeof profits[number]) => dataTable({ caption: esc(fill(labels.overview.page.captionWithUnit, { caption: labels.overview.profit.section })), head: [esc(labels.overview.profit.table.item), esc(labels.overview.profit.table.amount), esc(labels.overview.profit.table.share)], rows: item.data.rows.map(row => [esc(profitRowLabel(row)), numberLink(formatAmountL2(row.value.value)), esc(row.share === null ? labels.shell.status.notApplicable : `${new Exact(row.share).times(100).toFixed(1)}%`)]) });
  const g2 = chartFrame({
    id: "profit", testId: "profit-waterfall", className: "profit-section",
    title: panels(item => esc(item.data.title)), subtitle: panels(item => esc(item.data.subtitle)),
    extra: seg, height: "lg", frameClassName: "waterfall",
    v4Note: "G2：搬進 ChartFrame；與 G1 共同尺度（含每個通路範圍的柱），切到虧損通路時負值柱仍在範圍內、刻度含負值",
    dataTable: { title: labels.overview.profit.section, content: panels(profitTable) },
    body: panels(item => responsive(bp => waterfallSvg(item.data.bars, { width: G2_WIDTH[bp], height: LG, scale: common, barTestIdPrefix: bp === "xl" ? "profit-waterfall-bar-" : undefined }).svg)),
  });
  data.profit = profits.map(item => ({ scope: item.scope.id, title: item.data.title, perHundred: item.data.perHundred, bars: item.data.bars.map(bar => ({ id: bar.id, start: bar.start, end: bar.end })) }));

  // ── G3 每週趨勢：既有折線，只改刻度（formatAxisWan，修正「50.0 萬」）。上期 6 週接本期 6 週，同一條時間軸。
  const weeks = snapshot.weeks;
  const trend = trendTakeaways(snapshot);
  const seriesOf = (metric: MetricName, period: "previous" | "current") => weeks.map(week => week.period === period ? coordinate(week.metrics[metric].value) : null);
  const lastOf = (period: "previous" | "current") => [...weeks].reverse().find(week => week.period === period)!;
  const trendScale: Scale = (() => { const values = weeks.flatMap(week => [coordinate(week.metrics.net_revenue.value), coordinate(week.metrics[CM].value)]); const max = Math.max(0, ...values.filter((v): v is number => v !== null)); const step = niceStep(max / 3); const hi = Math.ceil(max / step) * step; const ticks: number[] = []; for (let t = 0; t <= hi + 1e-6; t += step) ticks.push(t); return { lo: 0, hi, step, ticks }; })();
  const trendSeries = [
    { key: "revenuePrevious", values: seriesOf("net_revenue", "previous"), color: colors.previous, width: 1.5, lastLabel: fill(labels.overview.trendV3.previousPoint, { value: formatAmountL1(lastOf("previous").metrics.net_revenue.value) }) },
    { key: "contributionPrevious", values: seriesOf(CM, "previous"), color: colors.previous, width: 1.5, lastLabel: fill(labels.overview.trendV3.previousPoint, { value: formatAmountL1(lastOf("previous").metrics[CM].value) }) },
    { key: "revenueCurrent", values: seriesOf("net_revenue", "current"), color: colors.current, width: 2, lastDot: true, lastStrong: true, lastLabel: fill(labels.overview.trendV3.lastPoint, { metric: metricDefinitions.net_revenue.shortLabel, value: formatAmountL1(lastOf("current").metrics.net_revenue.value) }) },
    { key: "contributionCurrent", values: seriesOf(CM, "current"), color: colors.current, width: 2, lastDot: true, lastStrong: true, lastLabel: fill(labels.overview.trendV3.lastPoint, { metric: metricDefinitions[CM].shortLabel, value: formatAmountL1(lastOf("current").metrics[CM].value) }) },
  ];
  const ticksText = formatAxisWan(trendScale.ticks, trendScale.step);
  const trendXLabels = weeks.map((week, index) => index % 2 === 1 ? week.start.slice(5).replace("-", "/") : "");
  const yoyNote = snapshot.yoy?.status === "unavailable" ? `<p class="note trend-yoy-note" data-testid="trend-yoy-note">${esc(fill(labels.overview.trendYoyV3.unavailable, { reason: snapshot.yoy.reason }))}</p>` : "";
  const takeaways = `<dl class="takeaways"><div class="takeaway"><dt>${esc(trend.total.label)}</dt><dd>${numberLink(trend.total.display)}</dd></div><div class="takeaway"><dt>${esc(trend.lastCompleteWeek.label)}</dt><dd>${numberLink(trend.lastCompleteWeek.display)}${trend.lastCompleteWeek.range ? `<small>${esc(trend.lastCompleteWeek.range)}</small>` : ""}</dd></div></dl>`;
  const trendTable = dataTable({ caption: esc(fill(labels.overview.page.captionWithUnit, { caption: labels.overview.page.trendCaption })), head: [esc(labels.overview.page.colPeriod), esc(labels.overview.page.colRange), ...(["net_revenue", "gross_profit", CM] as const).map(name => esc(metricDefinitions[name].label))], numeric: [false, false, true, true, true], rows: weeks.map(week => [esc(week.label), esc(`${week.start}–${week.end}`), ...(["net_revenue", "gross_profit", CM] as const).map(name => numberLink(formatAmountL2(week.metrics[name].value)))]) });
  const g3 = chartFrame({
    id: "trend", testId: "trend", title: esc(labels.overview.sections.trend), subtitle: esc(trend.subtitle),
    legend: [{ label: esc(labels.overview.trendV3.legend.current), color: colors.current }, { label: esc(labels.overview.trendV3.legend.previous), color: colors.previous }, { label: esc(labels.overview.trendYoyV3.legend), color: colors.yoy, shape: "dash", note: snapshot.yoy?.status === "ready" ? undefined : esc(labels.overview.chartFrame.noData) }],
    takeaways, height: "sm", after: yoyNote,
    v4Note: "G3：只改刻度（formatAxisWan：50 萬，不再寫 50.0 萬）",
    dataTable: { title: labels.overview.sections.trend, content: trendTable },
    body: responsive(bp => lineSvg({ width: PAIR_INNER[bp], height: SM, series: trendSeries, scale: trendScale, tickLabels: ticksText, xLabels: trendXLabels })),
  });
  data.trend = { ticks: ticksText, weeks: weeks.map(week => ({ period: week.period, start: week.start, end: week.end, net_revenue: week.metrics.net_revenue.value, contribution_after_marketing: week.metrics[CM].value })) };

  // ── G4 各通路：既有雙長條（刻度改 formatAxisWan）＋緊湊表新增「差額」欄與 C24 差額條（不利 --chart-unfavorable、有利 --chart-total）。
  const conclusion = channelConclusion(snapshot);
  const summary = buildManagerSummary(snapshot);
  const changes = conclusion.rows.map(row => ({ row, change: summary.channels.find(item => item.channel === row.channel)!.contribution.change }));
  const channelScaleRaw = axisTicks(conclusion.rows.flatMap(row => [coordinate(row.previous.value), coordinate(row.current.value)]));
  const channelScale: Scale = { lo: channelScaleRaw.domain[0], hi: channelScaleRaw.domain[1], step: channelScaleRaw.ticks.length > 1 ? channelScaleRaw.ticks[1] - channelScaleRaw.ticks[0] : 1, ticks: channelScaleRaw.ticks };
  const maxChange = changes.reduce((max, item) => item.change.value === null ? max : Decimal.max(max, new Exact(item.change.value).abs()), new Exact(0));
  const barRows = conclusion.rows.map(row => ({ label: row.label, previous: coordinate(row.previous.value), current: coordinate(row.current.value), previousLabel: fill(labels.overview.channelsV3.previousValue, { value: formatAmountL1(row.previous.value) }), currentLabel: formatAmountL1(row.current.value), currentUnfavorable: deltaTone(CM, row.current.value, "L1") === "unfavorable" }));
  const changeHead = book.mark("overview.chartsV4.channels.changeHead", "差額（元）", "G4", "可沿用 overview.channelsV3.dataTable.change 的同一字串，不另立新鍵");
  const kvRows = changes.map(({ row, change }) => {
    const value = change.value;
    const unfavorable = value !== null && deltaTone(CM, value, "L2") === "unfavorable";
    const bar = value === null || maxChange.isZero() ? "" : barCell({ ratio: new Exact(value).abs().div(maxChange).toNumber(), negative: new Exact(value).isNegative(), color: unfavorable ? colors.unfavorable : colors.total, testId: `chart-overview-channels-bar-${row.channel}` });
    const turned = row.turned === null ? "" : `<span class="ui-lozenge" data-tone="${row.turned === "negative" ? "unfavorable" : "neutral"}">${esc(row.turned === "negative" ? labels.overview.channelsV3.turnedNegative : labels.overview.channelsV3.turnedPositive)}</span>`;
    return `<tr><th scope="row">${esc(row.label)}${turned}</th><td class="num${deltaTone(CM, row.current.value, "L2") === "unfavorable" ? " negative" : ""}">${numberLink(formatAmountL2(row.current.value))}</td><td class="num${deltaTone("contribution_margin", row.margin.value, "L2") === "unfavorable" ? " negative" : ""}">${numberLink(formatMetric("contribution_margin", row.margin, "L2"))}</td><td class="num change-cell"${v4("G4：新增差額欄＋C24 差額條（390 移到下一行）")}><span class="change-bar">${bar}</span>${numberLink(formatSignedDelta(value, "L2"), unfavorable ? "negative" : undefined)}</td></tr>`;
  }).join("");
  const kv = `<table class="kv channel-kv"><thead><tr><th scope="col">${esc(labels.overview.channelsV3.table.channel)}</th><th scope="col" class="num">${esc(labels.overview.channelsV3.table.current)}</th><th scope="col" class="num">${esc(labels.overview.channelsV3.table.margin)}</th><th scope="col" class="num">${changeHead}</th></tr></thead><tbody>${kvRows}</tbody></table>`;
  const channelTable = dataTable({ caption: esc(fill(labels.overview.page.captionWithUnit, { caption: labels.overview.page.channelCaption })), head: [esc(labels.overview.page.colChannel), esc(`${labels.shell.periods.current}${metricDefinitions.net_revenue.label}`), esc(`${labels.shell.periods.previous}${metricDefinitions[CM].shortLabel}`), esc(`${labels.shell.periods.current}${metricDefinitions[CM].shortLabel}`), esc(metricDefinitions.contribution_margin.label)], rows: conclusion.rows.map(row => [esc(row.label), numberLink(formatAmountL2(report.current.channels[row.channel]?.metrics.net_revenue.value ?? null)), numberLink(formatAmountL2(row.previous.value)), numberLink(formatAmountL2(row.current.value)), numberLink(formatMetric("contribution_margin", row.margin, "L2"))]) });
  const g4 = chartFrame({
    id: "channel", testId: "channel-mix", title: esc(conclusion.title), subtitle: esc(conclusion.subtitle),
    legend: [{ label: esc(labels.overview.chartFrame.legend.current), color: colors.current }, { label: esc(labels.overview.chartFrame.legend.previous), color: colors.previous }],
    height: "sm", after: kv, v4Note: "G4：刻度 formatAxisWan；緊湊表加差額條",
    dataTable: { title: labels.overview.sections.channelMix, content: channelTable },
    body: responsive(bp => channelBarsSvg(barRows, { width: PAIR_INNER[bp], height: SM, scale: channelScale })),
  });
  data.channels = changes.map(({ row, change }) => ({ channel: row.channel, previous: row.previous.value, current: row.current.value, change: change.value, ratio: change.value === null || maxChange.isZero() ? null : new Exact(change.value).abs().div(maxChange).toFixed(4) }));

  // ── 其他常用指標（G7a sparkline「近 n 週」）＋損益兩平 MER 列（G5 bullet）
  const assist = { previous: assistKpis(report.previous), current: assistKpis(report.current) };
  const currentWeeks = weeks.filter(week => week.period === "current").slice(-8);
  const fullWeek = (week: { start: string; end: string }) => periodDays(week.start, week.end) === 7;
  // 設計稿試算：件數逐週以 domain 的 aggregatePeriod 再彙總一次（V4-2 的 assistWeeks 會讓 weeklyRows 直接帶 units_sold）。
  const weeklyUnits = currentWeeks.map(week => aggregatePeriod(dataset, { start: week.start, end: week.end }, report.scope.channels).units_sold);
  const weekly: Record<AssistKpiId, (string | null)[]> = {
    units_sold: weeklyUnits.map(count => count.value === null ? null : count.value.toString()),
    net_revenue_per_unit: currentWeeks.map((week, index) => netRevenuePerUnit(week.metrics.net_revenue, weeklyUnits[index]).value),
    marketing_burden: currentWeeks.map(week => week.metrics.marketing_burden.value),
    mer: currentWeeks.map(week => week.metrics.mer.value),
    gross_margin: currentWeeks.map(week => week.metrics.gross_margin.value),
    refund_ratio: currentWeeks.map(week => week.metrics.refund_ratio.value),
    fulfillment_burden: currentWeeks.map(week => week.metrics.fulfillment_burden.value),
  };
  const sparkHead = book.mark("overview.chartsV4.assistSpark.head", fill("近 {n} 週", { n: currentWeeks.length }), "G7a", "n＝實際週數，上限 8");
  const rows = assist.current.map((kpi, index) => ({ kpi, previous: assist.previous[index] }));
  const assistTable = (group: typeof rows) => `<table class="kv assist-kv"><thead><tr><th scope="col">${esc(labels.overview.assistTable.columns.metric)}</th><th scope="col" class="num">${esc(labels.overview.assistTable.columns.current)}</th><th scope="col" class="num">${esc(labels.overview.assistTable.columns.previous)}</th><th scope="col" class="spark-head"${v4("G7a：新增「近 n 週」sparkline 欄")}>${sparkHead}</th></tr></thead><tbody>${group.map(({ kpi, previous }) => `<tr data-testid="assist-${kpi.id}"><th scope="row">${esc(kpi.label)}</th><td class="num">${numberLink(kpi.display)}</td><td class="num prev">${numberLink(previous.display)}</td><td class="spark-cell">${sparkline(weekly[kpi.id].map((value, i) => ({ value: coordinate(value), hollow: kpi.id === "units_sold" && !fullWeek(currentWeeks[i]) })), `chart-overview-assist-spark-${kpi.id}`)}</td></tr>`).join("")}</tbody></table>`;
  const be = { previous: breakevenMer(report.previous), current: breakevenMer(report.current) };
  const merRatio = be.current.value !== null && be.current.actual.value !== null ? new Exact(be.current.actual.value).div(be.current.value) : null;
  const merBehind = merRatio !== null && merRatio.lt(1);
  const merWidth = merRatio === null ? "0" : Decimal.min(Decimal.max(merRatio, 0), 1).times(100).toFixed(1);
  const merLine = book.mark("overview.chartsV4.bullet.merLine", fill("實際 {mer}，損益兩平 {breakeven}", { mer: formatMetric("mer", be.current.actual, "L1"), breakeven: be.current.display }), "G5", "與既有的一句結論（breakevenNote）內容重複，見 README 待審問題");
  const merBullet = merRatio === null ? "" : `<tr class="kv-target"${v4("G5：損益兩平 MER 列加 bullet（目標刻度＝損益兩平）")}><td colspan="3"><p class="kpi-target"><span class="kpi-bullet${merBehind ? " is-behind" : ""}" data-testid="chart-overview-bullet-bar-mer" aria-hidden="true"><span class="kpi-bullet-bar" style="width: ${merWidth}%"></span><span class="kpi-bullet-target"></span></span>${merLine}</p></td></tr>`;
  const breakeven = `<div class="assist-breakeven" data-testid="assist-breakeven-mer"><table class="kv assist-breakeven-table"><thead><tr><th scope="col">${esc(labels.overview.assistTable.columns.metric)}</th><th scope="col" class="num">${esc(labels.overview.assistTable.columns.current)}</th><th scope="col" class="num">${esc(labels.overview.assistTable.columns.previous)}</th></tr></thead><tbody><tr><th scope="row">${esc(be.current.label)} <span class="btn-help" aria-hidden="true">?</span></th><td class="num">${numberLink(be.current.display)}</td><td class="num prev">${numberLink(be.previous.display)}</td></tr>${merBullet}</tbody></table><p class="assist-breakeven-note">${esc(breakevenNote(be.current))}</p></div>`;
  const weeklyTitle = book.mark("overview.chartsV4.assistSpark.tableTitle", "各指標每週", "G7a");
  const weeklyTable = dataTable({ caption: book.mark("overview.chartsV4.assistSpark.caption", "各指標每週（本期最後 6 週）", "G7a", "未滿 7 天的週，欄頭加「未滿 7 天」（沿用 overview.trendV3.incompleteShort）"), head: [esc(labels.overview.assistTable.columns.metric), ...currentWeeks.map(week => esc(`${week.label} ${week.start.slice(5).replace("-", "/")}–${week.end.slice(5).replace("-", "/")}${fullWeek(week) ? "" : ` ${labels.overview.trendV3.incompleteShort}`}`))], rows: assist.current.map(kpi => [esc(kpi.label), ...weekly[kpi.id].map(value => numberLink(value === null ? labels.shell.status.missing : formatAssist(kpi.id, value)))]), testId: "chart-overview-assist-table" });
  const assistHtml = `<section class="assist" aria-labelledby="assist-title" data-testid="assist-kpis"><div class="assist-head"><h2 id="assist-title">${esc(labels.overview.sections.assistKpis)}</h2><span class="btn-help" aria-hidden="true">?</span></div><div class="panel assist-panel"><div class="assist-grid">${assistTable(rows.slice(0, 4))}${assistTable(rows.slice(4))}</div>${breakeven}${trialNote("設計稿試算：近 6 週的件數由產生器逐週呼叫 aggregatePeriod 取得，件均呼叫既有 netRevenuePerUnit；正式數字由 V4-2 的 B 級函式 assistWeeks（assist-weeks-v1）產生。")}<details class="data-alternative"${v4("G7a：新增資料表「各指標每週」")}><summary>${esc(fill(labels.overview.page.dataTable, { title: "" }))}${weeklyTitle}</summary>${weeklyTable}</details></div></section>`;
  data.assistWeeks = { weeks: currentWeeks.map(week => ({ start: week.start, end: week.end, full: fullWeek(week) })), values: weekly, breakevenMer: { actual: be.current.actual.value, breakeven: be.current.value, ratio: merRatio?.toFixed(6) ?? null } };

  // ── 進階（v3 既有，收合）
  const advanced = `<details class="advanced" data-testid="overview-advanced"><summary>${esc(labels.overview.pnlV3.advancedSummary)}</summary><p class="note">（設計稿不畫展開內容：v3 既有，v4 只在 V4-10 加 G8，可整批延後。）</p></details>`;

  const content = `${snapshotHtml}${kpiHtml}${topHtml}${g1}${g2}<div class="pair">${g3}${g4}</div>${assistHtml}${advanced}`;
  const html = pageDocument({
    page: "overview", docTitle: "經營總覽 · H5 設計稿", source, content, proposals: book,
    headerAction: `<span class="ui-btn ui-btn-secondary" data-testid="present-toggle">${esc(labels.shell.presentV3.enter)}</span>`,
    diagnosisBadge: groups.groups.filter(group => alertStatus(group)?.tone === "unfavorable").length,
    bannerNote: "KPI 帶的目標取自 verification/revamp-v4-capture/targets.csv",
  });
  data.proposals = book.items;
  return { file: "overview.html", html, data, proposals: book };
}

/** 各指標每週資料表的格（L2）：件數、件均、比率、倍數各用 presentation 既有的格式化函式。 */
function formatAssist(id: AssistKpiId, value: string): string {
  const metric: Metric = { value, reason_codes: [] };
  switch (id) {
    case "units_sold": return formatCount(value, "L2");
    case "net_revenue_per_unit": return formatPerUnit(value, "L2");
    default: return formatMetric(id, metric, "L2");
  }
}
