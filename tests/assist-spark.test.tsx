import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { ASSIST_KPI_IDS, ASSIST_KPI_VERSION, assistKpis } from "../src/application/assist-kpi";
import { ASSIST_WEEKS_VERSION, assistWeeks } from "../src/application/chart-assist-weeks";
import { chartColors } from "../src/application/chart-theme";
import { formatCount, formatMultiple, formatPerUnit, formatPeriodL1, formatRateL1 } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { chartDataCellText } from "../src/components/charts/chart-data-table";
import { EvidenceDrawer } from "../src/components/evidence-drawer";
import { ASSIST_TABLE_TESTID, assistEvidence, assistSparkTestId, assistWeekEvidence } from "../src/components/overview/assist-spark";
import { AssistTable } from "../src/components/overview/assist-table";
import type { Dataset, DatasetInput } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, escapeAttr, openTag, textOf } from "./helpers/markup";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

// V4-2 代理 A：G7a 其他常用指標表「近 {n} 週」sparkline 與「各指標每週」資料表（PRD §4.1–§4.7 G7、§5.1 第 8 列、§8.7；CHART_CATALOG G7（a）；D-V4-6）。
// SSR 結構：七列各一條 sparkline（aria-hidden、不可點、在 tr 內）、損益兩平段不畫；資料表收合但掛載（M1）、列數＝7、格是 number-link；
// 抽屜：metric_version 不變（domain 值 contribution-v1，件數、件均 assist-kpi-v1），另帶 arrangeVersion assist-weeks-v1。
// 期待值一律由 labels、fill 與格式化函式組出。

const noop = () => undefined;
const spark = labels.overview.chartsV4.assistSpark, ui = labels.overview.assistTable;
type Loaded = { input: DatasetInput; dataset: Dataset; snapshot: WorkspaceSnapshot };
const loaded: Record<string, Loaded> = {};
async function load(name: string, input: DatasetInput): Promise<void> {
  const dataset = validateDataset(input).dataset!;
  loaded[name] = { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}
beforeAll(async () => {
  await load("demo", fixture("demo"));
  await load("golden", fixture("golden"));
  await load("synthetic", synthetic4ChannelInput());
  await load("zero_ad", fixture("zero_ad"));
  await load("refund_only", fixture("refund_only"));
});
const render = (name: string) => renderToStaticMarkup(createElement(AssistTable, { snapshot: loaded[name].snapshot, onEvidence: noop }));
const details = (html: string) => {
  const at = html.indexOf('<details class="data-alternative"');
  return at < 0 ? null : element(html.slice(at), '<details class="data-alternative"')!;
};

describe("G7a sparkline 欄（近 {n} 週）", () => {
  it("兩張緊湊表都多一欄「近 6 週」（示範資料本期 6 個完整週）；七列各一條 chart-overview-assist-spark-{kpiId}，在該列的 td.spark-cell 內", () => {
    const html = render("demo");
    const tables = html.match(/<table class="kv"[^>]*>[\s\S]*?<\/table>/g)!;
    expect(tables).toHaveLength(2);
    const header = `<thead><tr><th scope="col">${ui.columns.metric}</th><th scope="col" class="num">${ui.columns.current}</th><th scope="col" class="num">${ui.columns.previous}</th><th scope="col" class="spark-head">${fill(spark.head, { n: 6 })}</th></tr></thead>`;
    for (const table of tables) expect(table).toContain(header);
    expect(fill(spark.head, { n: 6 })).toBe("近 6 週");
    for (const id of ASSIST_KPI_IDS) {
      const row = byTestId(html, `assist-${id}`);
      const cell = element(row, 'class="spark-cell"')!;
      expect(cell, id).toMatch(/^<td class="spark-cell"><svg /);
      expect(byTestId(cell, assistSparkTestId(id)), id).toContain('data-chart-kind="spark"');
      expect(openTag(cell, "<svg")!, id).toContain('aria-hidden="true"');
      expect(openTag(cell, "<svg")!, id).toContain('data-points="6"');
      // 示範資料每週都是完整週：沒有空心點，最後一點是實心 current。
      expect(cell, id).not.toContain('data-kind="hollow"');
      expect(cell, id).toContain(`data-kind="last" cx="61"`);
      expect(cell, id).toContain(`fill="${chartColors.current}"`);
      // 本期、上期兩個 number-link 不變（V3 的 td.num 兩格），sparkline 格不是 .num、沒有按鈕。
      expect(row.match(/<td class="num/g), id).toHaveLength(2);
      expect(cell, id).not.toMatch(/<button|tabindex/i);
    }
    expect(html.match(/data-chart-kind="spark"/g)).toHaveLength(7);
    expect(html.match(/data-testid="chart-overview-assist-spark-/g)).toHaveLength(7);
  });

  it("損益兩平 MER 段不畫 sparkline（D-V4-6）；新 testid 都不以 kpi- 開頭", () => {
    const html = render("demo");
    expect(byTestId(html, "assist-breakeven-mer")).not.toContain("data-chart-kind");
    expect(byTestId(html, "assist-breakeven-mer")).not.toContain("chart-overview-assist");
    const ids = [...html.matchAll(/data-testid="(chart-[^"]+)"/g)].map(match => match[1]);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every(id => !id.startsWith("kpi-"))).toBe(true);
  });

  it("合成資料（本期最後一週 3 天）：售出件數的最後一點空心（fill＝chartColors.surface）、折線只連前兩週；比率（商品毛利率）照畫實心", () => {
    const html = render("synthetic");
    expect(html).toContain(`<th scope="col" class="spark-head">${fill(spark.head, { n: 3 })}</th>`);
    const units = byTestId(html, assistSparkTestId("units_sold"));
    const circles = units.match(/<circle[^>]*>/g)!;
    expect(circles.at(-1)).toContain(`fill="${chartColors.surface}"`);
    expect(circles.at(-1)).toContain('data-kind="hollow"');
    expect(units.match(/<polyline[^>]*points="([^"]+)"/)![1].split(" ")).toHaveLength(2);
    const margin = byTestId(html, assistSparkTestId("gross_margin"));
    expect(margin).not.toContain('data-kind="hollow"');
    expect(margin.match(/<polyline[^>]*points="([^"]+)"/)![1].split(" ")).toHaveLength(3);
  });

  it("本期值是資料待補或不適用時不畫（語意由同列本期數字承擔，CL-1）：合成資料的廣告佔淨營收與 MER（LIVE 兩期都缺廣告列）格留空，各週數字仍在資料表", () => {
    const html = render("synthetic");
    for (const id of ["marketing_burden", "mer"] as const) {
      const row = byTestId(html, `assist-${id}`);
      expect(row, id).toContain('<td class="spark-cell"></td>');
      expect(row, id).not.toContain("data-chart-kind");
    }
    // 資料表：廣告佔淨營收第 1、2 週有值（number-link 的文字是比率），第 3 週資料待補。
    const table = byTestId(details(html)!, ASSIST_TABLE_TESTID);
    const burdenRow = table.slice(table.indexOf(`>${assistKpis(loaded.synthetic.snapshot.report.current)[2].label}</th>`)).split("</tr>")[0];
    const texts = [...burdenRow.matchAll(/class="number-link"[^>]*>([^<]*)<\/button>/g)].map(match => match[1]);
    const values = assistWeeks(loaded.synthetic.snapshot).series[2].values;
    expect(texts).toEqual([formatRateL1(values[0].value), formatRateL1(values[1].value), labels.shell.status.missing]);
  });

  it("整列沒有任何週值時不畫（zero_ad 的 MER、refund_only 的件均）：格留空、同列不出現 data-chart-kind（CL-1 的「同列有數字」才成立）", () => {
    const zeroAd = byTestId(render("zero_ad"), "assist-mer");
    expect(zeroAd).toContain('<td class="spark-cell"></td>');
    expect(zeroAd).not.toContain("data-chart-kind");
    const refund = byTestId(render("refund_only"), "assist-net_revenue_per_unit");
    expect(refund).toContain('<td class="spark-cell"></td>');
  });

  it("chart-lint（CL-1、CL-2、CL-9、CL-11）：五種資料的其他常用指標表都是 0 違規", () => {
    for (const name of Object.keys(loaded)) {
      const result = checkChartMarkup(render(name), { page: "overview" });
      for (const rule of ["CL-1", "CL-2", "CL-9", "CL-11"] as const) expect(result.violations[rule], `${name} ${rule}`).toEqual([]);
    }
  });

  it("廣告預算目標列（kv-target）跨四欄（含新的 sparkline 欄）", () => {
    const html = renderToStaticMarkup(createElement(AssistTable, { snapshot: loaded.demo.snapshot, onEvidence: noop, budget: createElement("p", { className: "kpi-target" }, "x") }));
    expect(html).toContain('<tr class="kv-target"><td colSpan="4"><p class="kpi-target">x</p></td></tr>');
  });
});

describe("「各指標每週」資料表（C33；M1 收合時保持掛載）", () => {
  it("在 .assist-panel 最後、損益兩平段之後；<details class=\"data-alternative\"> 預設收合；summary「表格 · 各指標每週」；表格掛載在收合的 <details> 內", () => {
    const html = render("demo");
    const panel = element(html, 'class="panel assist-panel"')!;
    const block = details(panel)!;
    expect(block).not.toBeNull();
    expect(panel.indexOf('data-testid="assist-breakeven-mer"')).toBeLessThan(panel.indexOf(block));
    expect(panel.endsWith(`${block}</div>`)).toBe(true);
    expect(openTag(block, "<details")).toBe('<details class="data-alternative">');
    expect(block).toContain(`<summary>${fill(labels.overview.page.dataTable, { title: spark.tableTitle })}</summary>`);
    expect(fill(labels.overview.page.dataTable, { title: spark.tableTitle })).toBe("表格 · 各指標每週");
    expect(byTestId(block, ASSIST_TABLE_TESTID)).toContain("<tbody>");
    // 全頁恰好一份（M6）。
    expect(html.match(new RegExp(`data-testid="${ASSIST_TABLE_TESTID}"`, "g"))).toHaveLength(1);
  });

  it("C33 結構：.table-scroll[role=region][tabindex=0][aria-label=caption] > table[data-testid]；caption「各指標每週（本期最後 6 週）」；欄頭＝指標＋6 週（週名、起訖）；列＝7 個指標；42 格都是 number-link", () => {
    const { snapshot } = loaded.demo;
    const block = details(render("demo"))!;
    const caption = fill(spark.caption, { n: 6 });
    expect(openTag(block, 'class="table-scroll')).toBe(`<div class="table-scroll chart-data-scroll" role="region" tabindex="0" aria-label="${escapeAttr(caption)}">`);
    const table = byTestId(block, ASSIST_TABLE_TESTID);
    expect(openTag(table, "<table")).toBe(`<table class="ui-table chart-data-table" data-density="compact" data-testid="${ASSIST_TABLE_TESTID}">`);
    expect(table).toContain(`<caption>${caption}</caption>`);
    const weeks = assistWeeks(snapshot).weeks;
    const heads = [...table.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map(match => match[1]);
    expect(heads).toEqual([ui.columns.metric, ...weeks.map(week => `${week.label}<small>${formatPeriodL1(week.period.start, week.period.end, { anchor: snapshot.data_as_of, days: false })}</small>`)]);
    const rows = table.slice(table.indexOf("<tbody>")).match(/<tr>/g)!;
    expect(rows).toHaveLength(7);
    expect(table.match(/<th scope="row"/g)).toHaveLength(7);
    expect(table.match(/class="number-link"/g)).toHaveLength(42);
    expect(table).not.toContain('data-testid="assist-');
  });

  it("列名：件數與件均加單位（rowUnit），比率與倍數沿用指標名；格是 L2（件數整數、件均整數元、比率一位小數 %、倍數一位小數）", () => {
    const { snapshot } = loaded.demo;
    const table = byTestId(details(render("demo"))!, ASSIST_TABLE_TESTID);
    const kpis = assistKpis(snapshot.report.current);
    const data = assistWeeks(snapshot);
    const rowHeads = [...table.matchAll(/<th scope="row" title="([^"]*)">([^<]*)<\/th>/g)].map(match => match[2]);
    expect(rowHeads).toEqual(kpis.map(kpi => kpi.id === "units_sold" ? fill(spark.rowUnit.count, { label: kpi.label }) : kpi.id === "net_revenue_per_unit" ? fill(spark.rowUnit.perUnit, { label: kpi.label }) : kpi.label));
    const first = (id: string) => data.series.find(item => item.id === id)!.values[0].value;
    const cellTexts = [...table.matchAll(/<button type="button" class="number-link" aria-label="[^"]*">([^<]*)<\/button>/g)].map(match => match[1]);
    expect(cellTexts[0]).toBe(formatCount(first("units_sold"), "L2"));
    expect(cellTexts[6]).toBe(formatPerUnit(first("net_revenue_per_unit"), "L2"));
    expect(cellTexts[12]).toBe(formatRateL1(first("marketing_burden")));
    expect(cellTexts[18]).toBe(formatMultiple(first("mer"), "L2"));
    expect(chartDataCellText({ value: first("units_sold"), unit: "count" }, {})).toBe(cellTexts[0]);
  });

  it("number-link 的可及名稱沿用 overview.assistTable.cellAria（期間＝週名，值＝與本期格相同的 L1，含可見文字）", () => {
    const { snapshot } = loaded.demo;
    const table = byTestId(details(render("demo"))!, ASSIST_TABLE_TESTID);
    const kpis = assistKpis(snapshot.report.current);
    const data = assistWeeks(snapshot);
    const units = data.series[0].values[0].value!;
    const aria = fill(ui.cellAria, { metric: kpis[0].label, period: data.weeks[0].label, value: formatCount(units, "L1") });
    expect(table).toContain(`<button type="button" class="number-link" aria-label="${escapeAttr(aria)}">${formatCount(units, "L2")}</button>`);
    expect(aria).toContain(formatCount(units, "L2"));
  });

  it("未滿 7 天的週：欄頭加「未滿 7 天」（沿用 overview.trendV3.incompleteShort），表格之後加 incompleteNote；缺值格寫「資料待補」純文字也可開抽屜", () => {
    const block = details(render("synthetic"))!;
    const table = byTestId(block, ASSIST_TABLE_TESTID);
    const heads = [...table.matchAll(/<th scope="col"[^>]*>([\s\S]*?)<\/th>/g)].map(match => match[1]);
    expect(heads.at(-1)).toContain(`<small>${labels.overview.trendV3.incompleteShort}</small>`);
    expect(heads.slice(1, -1).every(head => !head.includes(labels.overview.trendV3.incompleteShort))).toBe(true);
    expect(block).toContain(`<p class="note">${spark.incompleteNote}</p>`);
    // 廣告佔淨營收第 3 週缺 9/22 的廣告：格寫「資料待補」（第三色），仍是 number-link（抽屜看缺漏原因與來源列）。
    const burden = assistKpis(loaded.synthetic.snapshot.report.current)[2];
    const aria = fill(ui.cellAria, { metric: burden.label, period: assistWeeks(loaded.synthetic.snapshot).weeks[2].label, value: labels.shell.status.missing });
    expect(table).toContain(`<td class="num is-empty"><button type="button" class="number-link" aria-label="${escapeAttr(aria)}">${labels.shell.status.missing}</button></td>`);
    // 示範資料沒有未滿週：沒有說明句。
    expect(details(render("demo"))).not.toContain(spark.incompleteNote);
  });

  it("主層（收合的 <details> 以外）沒有新增否定句（B8）；說明句只在 <details> 內", () => {
    const html = render("synthetic");
    const main = html.replace(details(html)!, "");
    expect(main).not.toContain(spark.incompleteNote);
    expect(textOf(main)).not.toMatch(/不是|不代表|不等於|不可/);
  });
});

describe("抽屜（PRD §8.7：metric_version 不變，另帶 arrangeVersion）", () => {
  it("本期、上期兩格的抽屜寫法搬到 assistEvidence 後輸出不變（與 V3 的 inline 寫法逐欄相同）", () => {
    const { snapshot } = loaded.demo;
    const channels = snapshot.report.scope.channels;
    for (const item of assistKpis(snapshot.report.current)) {
      expect(assistEvidence(item, snapshot.report.current.period, channels), item.id).toEqual({ title: item.label, name: item.metric ?? "net_revenue", metric: { value: item.value, reason_codes: item.reason_codes }, period: snapshot.report.current.period, channels, sources: item.sources, formula: item.formula, formulaTechnical: item.formulaTechnical, metricVersion: item.metric ? undefined : ASSIST_KPI_VERSION, nullDisplay: item.status === "not_applicable" ? labels.assist.notApplicable : undefined, unitOverride: item.unit === "count" ? "count" : item.unit === "money_per_unit" ? "money_per_unit" : undefined });
    }
  });

  it("每週格：period＝該週、sources＝週列 sources、arrangeVersion＝assist-weeks-v1；比率不給 metricVersion（contribution-v1），件數、件均是 assist-kpi-v1", () => {
    const { snapshot } = loaded.demo;
    const channels = snapshot.report.scope.channels;
    const kpis = assistKpis(snapshot.report.current);
    const data = assistWeeks(snapshot);
    const week = data.weeks[2];
    for (const [index, kpi] of kpis.entries()) {
      const evidence = assistWeekEvidence(kpi, data.series[index].values[2], week, channels);
      expect(evidence.arrangeVersion, kpi.id).toBe(ASSIST_WEEKS_VERSION);
      expect(evidence.period, kpi.id).toEqual(week.period);
      expect(evidence.sources, kpi.id).toBe(week.sources);
      expect(evidence.channels, kpi.id).toEqual(channels);
      expect(evidence.metric, kpi.id).toEqual({ value: data.series[index].values[2].value, reason_codes: data.series[index].values[2].reason_codes });
      expect(evidence.metricVersion, kpi.id).toBe(kpi.metric ? undefined : ASSIST_KPI_VERSION);
      expect(evidence.title, kpi.id).toBe(kpi.label);
    }
  });

  it("抽屜 SSR：週的比率格 metric_version 仍是 contribution-v1、下一行「圖表整理版本 assist-weeks-v1」，並畫該週的比率表；件數格是 assist-kpi-v1", () => {
    const { snapshot, dataset } = loaded.demo;
    const channels = snapshot.report.scope.channels;
    const kpis = assistKpis(snapshot.report.current);
    const data = assistWeeks(snapshot);
    const drawer = (index: number) => renderToStaticMarkup(createElement(EvidenceDrawer, { dataset, snapshot, evidence: assistWeekEvidence(kpis[index], data.series[index].values[0], data.weeks[0], channels), onClose: noop }));
    const burden = drawer(2);
    const technical = element(burden, 'class="evidence-technical"')!;
    expect(technical).toContain("<div><dt>metric_version</dt><dd><code>contribution-v1</code></dd></div>");
    expect(technical).toContain(`<div data-testid="evidence-arrange-version"><dt>${labels.evidence.chartsV4.arrangeVersion}</dt><dd><code>${ASSIST_WEEKS_VERSION}</code></dd></div>`);
    expect(technical.indexOf("metric_version")).toBeLessThan(technical.indexOf("evidence-arrange-version"));
    expect(burden).toContain('class="ladder-table"');
    const units = element(drawer(0), 'class="evidence-technical"')!;
    expect(units).toContain(`<div><dt>metric_version</dt><dd><code>${ASSIST_KPI_VERSION}</code></dd></div>`);
    expect(units).toContain('data-testid="evidence-arrange-version"');
  });
});

describe("原始碼：sparkline 與資料表不在元件內寫色（CL-3）", () => {
  it("assist-spark.tsx、assist-table.tsx、chart-data-table.tsx 沒有 `var(--chart-` 字串常值與色碼", () => {
    for (const file of ["src/components/overview/assist-spark.tsx", "src/components/overview/assist-table.tsx", "src/components/charts/chart-data-table.tsx"]) {
      const text = readFileSync(resolve(file), "utf8");
      expect(text, file).not.toContain("var(--chart-");
      expect(text, file).not.toMatch(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/i);
    }
  });
});
