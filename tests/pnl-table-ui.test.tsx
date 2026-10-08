import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { buildPnlTable, PNL_DAY_COLUMN_LIMIT, PNL_ROWS } from "../src/application/pnl-table";
import { formatAmountL2, formatDateL1, formatPeriodL1, formatRateL1, metricDefinitions, MINUS } from "../src/application/presentation";
import { createReviewSession } from "../src/application/review-session";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import type { EvidenceSelection } from "../src/components/evidence-drawer";
import { MeetingEntry } from "../src/components/meeting-page";
import { Overview } from "../src/components/overview";
import { PnlTable, pnlEvidence, pnlRowLabel } from "../src/components/overview/pnl-table";
import type { Dataset, DatasetInput } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { scanLabels } from "../scripts/lib/copy-scan.mjs";
import { fixture } from "./helpers/fixtures";
import { byTestId as byTestIdHtml, element, escapeAttr, openTag, textOf as textOfHtml } from "./helpers/markup";

/*
 * V3-9a F9 每日／每週管理損益表的畫面（PRD §7.1 區塊 10、§9.3、§6.4 M1／M6；D-V3-19＝A、D-V3-8 螢幕用 U+2212、D-V3-7 有利不上色）。
 * SSR（renderToStaticMarkup）檢查結構與掛載；互動沿用 tests/scenario-form.test.tsx 的 hooks harness（沒有 DOM 套件）。
 * 期待值一律由 labels、fill 與 presentation 的格式化函式組出，不寫死數字（golden：本期扣廣告後貢獻 255.00）。
 */
const hooks = vi.hoisted(() => ({ active: false, states: [] as unknown[], cursor: 0, dirty: false }));
vi.mock("react", async importOriginal => {
  const actual = await importOriginal<typeof import("react")>();
  return {
    ...actual,
    useState: (initial: unknown) => {
      if (!hooks.active) return actual.useState(initial);
      const index = hooks.cursor++;
      if (!(index in hooks.states)) hooks.states[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
      const set = (next: unknown) => {
        const previous = hooks.states[index];
        const value = typeof next === "function" ? (next as (value: unknown) => unknown)(previous) : next;
        if (!Object.is(value, previous)) { hooks.states[index] = value; hooks.dirty = true; }
      };
      return [hooks.states[index], set];
    },
    useMemo: (factory: () => unknown, deps: readonly unknown[]) => hooks.active ? factory() : actual.useMemo(factory, deps),
    useId: () => hooks.active ? ":test:" : actual.useId(),
  };
});
afterEach(() => { hooks.active = false; hooks.states = []; });
type TreeElement = ReactElement<Record<string, unknown>>;
function mount<P>(component: (props: P) => ReactNode) {
  hooks.active = true; hooks.states = []; hooks.cursor = 0;
  return (props: P): ReactNode => {
    let tree: ReactNode, rounds = 0;
    do { hooks.dirty = false; hooks.cursor = 0; tree = component(props); } while (hooks.dirty && ++rounds < 10);
    return tree;
  };
}
function findAll(node: ReactNode, match: (element: TreeElement) => boolean, found: TreeElement[] = []): TreeElement[] {
  if (Array.isArray(node)) for (const child of node) findAll(child, match, found);
  else if (node !== null && typeof node === "object" && "props" in node) {
    const item = node as TreeElement;
    if (match(item)) found.push(item);
    findAll(item.props.children as ReactNode, match, found);
  }
  return found;
}
const byTestId = (node: ReactNode, testid: string) => findAll(node, item => item.props["data-testid"] === testid)[0];
const textOf = (node: ReactNode): string => Array.isArray(node) ? node.map(textOf).join("") : typeof node === "string" || typeof node === "number" ? String(node) : node !== null && typeof node === "object" && "props" in node ? textOf((node as TreeElement).props.children as ReactNode) : "";
const click = (item: TreeElement) => (item.props.onClick as () => void)();

const copy = labels.overview.pnlV3;
const noop = () => undefined;
type Loaded = { input: DatasetInput; dataset: Dataset; snapshot: WorkspaceSnapshot };
async function load(name: string): Promise<Loaded> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}
let golden: Loaded, demo: Loaded, refundOnly: Loaded;
beforeAll(async () => { [golden, demo, refundOnly] = await Promise.all([load("golden"), load("demo"), load("refund_only")]); });

function overview(source: Loaded): string {
  const review = createReviewSession({ ...source, revision: 1 }, "e", "rev-pnl");
  return renderToStaticMarkup(createElement(Overview, {
    snapshot: source.snapshot, onEvidence: noop, onCreateAction: noop, periodOpen: false, onPeriodToggle: noop, targets: null, events: null, allChannels: source.dataset.manifest.channels,
    onBasis: noop, onNavigate: noop, datasetName: labels.shell.devValidation.datasets.golden, missingItems: 0, actionsSummary: { pending: 0, pinned: [] },
    meetingEntry: createElement(MeetingEntry, { review, history: [], datasetHash: source.snapshot.dataset_hash, onOpen: noop }),
  }));
}
const table = (snapshot: WorkspaceSnapshot) => renderToStaticMarkup(createElement(PnlTable, { snapshot, onEvidence: noop }));
const rowsOf = (html: string) => [...html.matchAll(/<tr class="pnl-row-[^"]*"[^>]*>[\s\S]*?<\/tr>/g)].map(match => match[0]);

describe("F9 位置與掛載（§7.1 區塊 10、M1）", () => {
  it("在總覽「進階」內、期間合計與日均之後；兩層 <details> 預設收合，表格內容仍掛載", () => {
    const html = overview(golden);
    const advanced = byTestIdHtml(html, "overview-advanced");
    expect(openTag(html, 'data-testid="overview-advanced"')).not.toMatch(/\sopen=""/);
    expect(advanced).toContain('data-testid="pnl-table"');
    expect(advanced.indexOf('data-testid="pnl-table"')).toBeGreaterThan(advanced.indexOf('data-testid="period-comparison"'));
    // 管理損益表不在期間合計與日均裡面（兩個並列的收合面板）。
    expect(byTestIdHtml(html, "period-comparison")).not.toContain('data-testid="pnl-table"');
    expect(openTag(html, 'data-testid="pnl-table"')).toBe('<details class="panel pnl-table" aria-labelledby="pnl-table-title" data-testid="pnl-table">');
    const pnl = byTestIdHtml(html, "pnl-table");
    expect(pnl).toMatch(new RegExp(`^<details[^>]*><summary><span class="section-title">${copy.summary}</span></summary><h2 id="pnl-table-title" class="sr-only">${copy.summary}</h2>`));
    expect(pnl).toContain('<table class="ui-table report-table"');
    expect(pnl.match(/class="number-link"/g)).toHaveLength(PNL_ROWS.length * 2);
  });

  it("日／週分段與「顯示零值列」各只有一份；預設每日（aria-pressed）、零值列不顯示", () => {
    const html = overview(demo);
    for (const id of ["pnl-table", "pnl-granularity-day", "pnl-granularity-week", "pnl-show-zero"]) expect(html.split(`data-testid="${id}"`).length - 1, id).toBe(1);
    expect(openTag(html, 'data-testid="pnl-granularity-day"')).toBe('<button type="button" aria-pressed="true" data-testid="pnl-granularity-day">');
    expect(openTag(html, 'data-testid="pnl-granularity-week"')).toBe('<button type="button" aria-pressed="false" data-testid="pnl-granularity-week">');
    expect(textOfHtml(byTestIdHtml(html, "pnl-granularity-day"))).toBe(copy.granularity.day);
    expect(textOfHtml(byTestIdHtml(html, "pnl-granularity-week"))).toBe(copy.granularity.week);
    expect(openTag(html, 'data-testid="pnl-show-zero"')).toMatch(/^<button type="button" class="ui-btn ui-btn-secondary pnl-zero-toggle" aria-pressed="false" aria-controls="[^"]+" data-testid="pnl-show-zero">/);
    expect(textOfHtml(byTestIdHtml(html, "pnl-show-zero"))).toBe(copy.showZero);
    // 分段按鈕在 role=group 內（C11），群組的可及名稱來自 labels。
    expect(element(html, `aria-label="${escapeAttr(copy.granularity.aria)}"`)).toMatch(/^<div class="ui-segmented" role="group"/);
    // aria-controls 指到唯一的表格 id。
    const controls = /aria-controls="([^"]+)"/.exec(openTag(html, 'data-testid="pnl-show-zero"')!)![1];
    expect(html.split(`id="${controls}"`).length - 1).toBe(1);
    expect(openTag(html, `id="${controls}"`)).toMatch(/^<table class="ui-table report-table"/);
  });

  it("單位只寫一次（表頭右上角）；捲動容器保留 .table-scroll[tabIndex=0][role=region][aria-label]", () => {
    const pnl = byTestIdHtml(overview(golden), "pnl-table");
    // 看得到的單位只有一處；sr-only 的表格標題另帶單位給螢幕閱讀器（表格本身在單位那一行之外）。
    expect(pnl.replace(/<caption class="sr-only">[^<]*<\/caption>/, "").split(copy.unit).length - 1).toBe(1);
    expect(pnl).toContain(`<p class="pnl-unit">${copy.unit}</p>`);
    expect(pnl).toContain(`<div class="table-scroll" tabindex="0" role="region" aria-label="${escapeAttr(copy.tableAria)}">`);
    expect(pnl).toContain(`<caption class="sr-only">${escapeAttr(fill(copy.caption, { granularity: copy.granularity.day }))}</caption>`);
    // 技術細節收合在面板最下方。
    expect(pnl).toContain(`<details class="data-alternative"><summary>${labels.evidence.sections.technicalDetails}</summary><p class="note">${escapeAttr(copy.noteTechnical)}</p></details>`);
  });
});

describe("F9 表格內容（§9.3 報表型表格）", () => {
  it("表頭：項目 → 每一天（M/D）→ 合計 → 佔淨營收 %；數字欄頭右對齊", () => {
    const html = table(demo.snapshot);
    const head = element(html, "<thead")!;
    const headers = [...head.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(match => textOfHtml(match[1]));
    const days = buildPnlTable(demo.snapshot, "day").columns.map(column => formatDateL1(column.label, { anchor: demo.snapshot.data_as_of }));
    expect(days[0]).toBe("7/13");
    expect(headers).toEqual([copy.columns.item, ...days, copy.columns.total, copy.columns.share]);
    expect((head.match(/<th scope="col" class="num"/g) ?? []).length).toBe(days.length + 2);
  });

  it("列的順序與列名：費用列加「減：」（labels 樣板），其餘是 metricDefinitions 的指標名；class pnl-row-item／subtotal／total", () => {
    const rows = rowsOf(table(golden.snapshot));
    expect(rows).toHaveLength(PNL_ROWS.length);
    rows.forEach((row, index) => {
      const spec = PNL_ROWS[index];
      const label = spec.deduct ? fill(copy.rowDeduct, { label: metricDefinitions[spec.metric].label }) : metricDefinitions[spec.metric].label;
      expect(row).toMatch(new RegExp(`^<tr class="pnl-row-${spec.kind}" data-row="${spec.metric}"`));
      expect(row).toContain(`<th scope="row">${escapeAttr(label)}</th>`);
      expect(pnlRowLabel(spec)).toBe(label);
    });
    expect(textOfHtml(rows[1])).toContain(fill(copy.rowDeduct, { label: metricDefinitions.discounts.label }));
    expect(rows.filter(row => row.startsWith('<tr class="pnl-row-subtotal"'))).toHaveLength(3);
    expect(rows.filter(row => row.startsWith('<tr class="pnl-row-total"'))).toHaveLength(1);
  });

  it("每格金額是 number-link（L2 整數元），可及名稱含日期與指標；合計欄同樣可點；佔淨營收 % 是一般文字（L1 一位小數）", () => {
    const html = table(golden.snapshot);
    const date = formatDateL1("2026-08-02", { anchor: golden.snapshot.data_as_of });
    expect(date).toBe("8/2");
    const link = (column: string, metric: string, value: string) => `<button type="button" class="number-link" aria-label="${escapeAttr(fill(copy.cellAria, { date: column, metric, value }))}">${value}</button>`;
    for (const row of buildPnlTable(golden.snapshot, "day").rows) {
      const label = metricDefinitions[row.metric].label;
      const value = formatAmountL2(row.total.metric.value);
      const markup = rowsOf(html).find(item => item.includes(`data-row="${row.metric}"`))!;
      expect(markup, row.metric).toContain(`<td class="num" data-col="2026-08-02">${link(date, label, value)}</td>`);
      expect(markup, row.metric).toContain(`<td class="num" data-col="total">${link(copy.columns.total, label, value)}</td>`);
      expect(markup, row.metric).toContain(`<td class="num" data-col="share">${formatRateL1(row.share.value)}</td>`);
    }
    // 扣廣告後貢獻 255 ÷ 2470 → 10.3%；淨營收 100.0%。
    const after = rowsOf(html).find(item => item.includes('data-row="contribution_after_marketing"'))!;
    expect(after).toContain(`<td class="num" data-col="share">${formatRateL1("0.1032")}</td>`);
    expect(after).toContain(`>${formatAmountL2("255.00")}</button>`);
  });

  it("負數用 U+2212（refund_only：淨營收 −100、商品成本 −40、扣廣告後貢獻 −60）；淨營收 ≤ 0 時佔淨營收 % 寫不適用；有利不上色", () => {
    const html = table(refundOnly.snapshot);
    const row = (metric: string) => rowsOf(html).find(item => item.includes(`data-row="${metric}"`))!;
    expect(formatAmountL2("-100.00")).toBe(`${MINUS}100`);
    expect(row("net_revenue")).toContain(`>${MINUS}100</button>`);
    expect(row("cogs_net")).toContain(`>${MINUS}40</button>`);
    expect(row("contribution_after_marketing")).toContain(`>${MINUS}60</button>`);
    expect(html).not.toMatch(/>-\d/);
    for (const item of rowsOf(html)) expect(item).toContain(`<td class="num" data-col="share">${labels.shell.status.notApplicable}</td>`);
    expect(html).not.toMatch(/favorable|unfavorable/);
  });

  it("零值列 hidden 但掛載（refund_only 7 列）；小計與合計列不隱藏", () => {
    const html = table(refundOnly.snapshot);
    const hidden = rowsOf(html).filter(row => /^<tr[^>]*\shidden=""/.test(row));
    expect(hidden.map(row => /data-row="([^"]+)"/.exec(row)![1])).toEqual(["gross_sales", "discounts", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"]);
    for (const row of hidden) {
      expect(row).toContain('data-zero="true"');
      expect(row).toContain('class="number-link"');
    }
    expect(rowsOf(html).filter(row => !/\shidden=""/.test(row)).map(row => /data-row="([^"]+)"/.exec(row)![1])).toEqual(["refunds", "net_revenue", "cogs_net", "gross_profit", "contribution_before_marketing", "contribution_after_marketing"]);
    // golden 沒有零值列：沒有任何列 hidden。
    expect(table(golden.snapshot)).not.toMatch(/<tr[^>]*\shidden=""/);
  });

  it("daily 沒有那一天：整欄寫「無資料」（一般文字、第三色），不是 0，也不是 number-link", () => {
    const date = "2026-07-20";
    const sparse: WorkspaceSnapshot = { ...demo.snapshot, report: { ...demo.snapshot.report, current: { ...demo.snapshot.report.current, daily: demo.snapshot.report.current.daily.filter(row => row.date !== date) } } };
    const html = table(sparse);
    const cells = [...html.matchAll(new RegExp(`<td class="[^"]*" data-col="${date}">([\\s\\S]*?)</td>`, "g"))];
    expect(cells).toHaveLength(PNL_ROWS.length);
    for (const [cell, text] of cells) {
      expect(cell).toContain('class="num pnl-empty"');
      expect(text).toBe(copy.noData);
    }
    expect(html.match(/class="number-link"/g)).toHaveLength(PNL_ROWS.length * 42);
  });

  it("資料待補（errors/missing_ad_day）：格子寫資料待補，仍是 number-link（抽屜列出缺列）", async () => {
    const missing = await load("errors/missing_ad_day");
    const html = table(missing.snapshot);
    const ad = rowsOf(html).find(item => item.includes('data-row="ad_spend"'))!;
    expect(ad).toContain(`>${labels.shell.status.missing}</button>`);
    expect(ad).not.toMatch(/\shidden=""/);
  });

  it("本期超過 92 天：每日停用（aria-describedby 指到說明），只顯示每週", () => {
    const long: WorkspaceSnapshot = { ...demo.snapshot, report: { ...demo.snapshot.report, current: { ...demo.snapshot.report.current, period: { start: "2026-01-01", end: "2026-04-30" } } } };
    const html = table(long);
    const day = openTag(html, 'data-testid="pnl-granularity-day"')!;
    expect(day).toMatch(/aria-pressed="false"/);
    expect(day).toMatch(/\sdisabled=""/);
    const describedBy = /aria-describedby="([^"]+)"/.exec(day)![1];
    expect(element(html, `id="${describedBy}"`)).toBe(`<p class="note pnl-limit" id="${describedBy}">${fill(copy.dayLimit, { n: PNL_DAY_COLUMN_LIMIT })}</p>`);
    expect(openTag(html, 'data-testid="pnl-granularity-week"')).toMatch(/aria-pressed="true"/);
    expect(openTag(html, "<table")).toContain('data-granularity="week"');
    // 42 天的本期：沒有說明、每日可按。
    expect(table(demo.snapshot)).not.toContain("pnl-limit");
  });
});

describe("F9 互動（hooks harness）", () => {
  it("切到每週：欄是 snapshot 的本期週（WeeklyRow.label＋起訖）；再切回每日", () => {
    const render = mount(PnlTable);
    const props = { snapshot: demo.snapshot, onEvidence: noop };
    let tree = render(props);
    click(byTestId(tree, "pnl-granularity-week"));
    tree = render(props);
    expect(byTestId(tree, "pnl-granularity-week").props["aria-pressed"]).toBe(true);
    expect(byTestId(tree, "pnl-granularity-day").props["aria-pressed"]).toBe(false);
    const weeks = demo.snapshot.weeks.filter(week => week.period === "current");
    const heads = findAll(tree, item => item.type === "th" && item.props.scope === "col").map(textOf);
    expect(heads).toEqual([copy.columns.item, ...weeks.map(week => `${week.label}${formatPeriodL1(week.start, week.end, { anchor: demo.snapshot.data_as_of, days: false })}`), copy.columns.total, copy.columns.share]);
    expect(findAll(tree, item => item.type === "table")[0].props["data-granularity"]).toBe("week");
    click(byTestId(tree, "pnl-granularity-day"));
    tree = render(props);
    expect(findAll(tree, item => item.type === "table")[0].props["data-granularity"]).toBe("day");
  });

  it("「顯示零值列」切換 aria-pressed，零值列取消 hidden（refund_only）", () => {
    const render = mount(PnlTable);
    const props = { snapshot: refundOnly.snapshot, onEvidence: noop };
    let tree = render(props);
    const hiddenRows = (node: ReactNode) => findAll(node, item => item.type === "tr" && item.props.hidden === true).map(item => item.props["data-row"]);
    expect(hiddenRows(tree)).toHaveLength(7);
    click(byTestId(tree, "pnl-show-zero"));
    tree = render(props);
    expect(byTestId(tree, "pnl-show-zero").props["aria-pressed"]).toBe(true);
    expect(hiddenRows(tree)).toEqual([]);
    click(byTestId(tree, "pnl-show-zero"));
    tree = render(props);
    expect(hiddenRows(tree)).toHaveLength(7);
  });

  it("點格子開「計算與來源」：每日格是那一天、兩個通路、那天的來源列；合計格是本期；週格是那一週", () => {
    const onEvidence = vi.fn<(evidence: EvidenceSelection) => void>();
    const render = mount(PnlTable);
    const props = { snapshot: demo.snapshot, onEvidence };
    let tree = render(props);
    const daily = buildPnlTable(demo.snapshot, "day");
    const afterRow = daily.rows.find(row => row.metric === "contribution_after_marketing")!;
    const label = metricDefinitions.contribution_after_marketing.label;
    const day = formatDateL1("2026-07-20", { anchor: demo.snapshot.data_as_of });
    const cell = afterRow.cells[daily.columns.findIndex(column => column.id === "2026-07-20")];
    const button = findAll(tree, item => item.type === "button" && item.props["aria-label"] === fill(copy.cellAria, { date: day, metric: label, value: formatAmountL2(cell.metric.value) }))[0];
    click(button);
    expect(onEvidence).toHaveBeenLastCalledWith({ title: fill(copy.evidenceTitle, { metric: label, date: day }), name: "contribution_after_marketing", metric: cell.metric, period: { start: "2026-07-20", end: "2026-07-20" }, channels: demo.snapshot.report.scope.channels, sources: cell.sources });
    expect(onEvidence.mock.lastCall![0].sources.length).toBeGreaterThan(0);
    // 合計格。
    const total = findAll(tree, item => item.type === "button" && item.props["aria-label"] === fill(copy.cellAria, { date: copy.columns.total, metric: label, value: formatAmountL2(afterRow.total.metric.value) }))[0];
    click(total);
    expect(onEvidence).toHaveBeenLastCalledWith(pnlEvidence(demo.snapshot, afterRow, afterRow.total, copy.columns.total));
    expect(onEvidence.mock.lastCall![0].period).toEqual(demo.snapshot.report.current.period);
    expect(onEvidence.mock.lastCall![0].metric).toEqual(demo.snapshot.report.current.metrics.contribution_after_marketing);
    // 週格：期間是該週，值是 WeeklyRow 的同名指標。
    click(byTestId(tree, "pnl-granularity-week"));
    tree = render(props);
    const week = demo.snapshot.weeks.filter(item => item.period === "current")[1];
    const weekButton = findAll(tree, item => item.type === "button" && item.props["aria-label"] === fill(copy.cellAria, { date: week.label, metric: label, value: formatAmountL2(week.metrics.contribution_after_marketing.value) }))[0];
    click(weekButton);
    expect(onEvidence.mock.lastCall![0]).toMatchObject({ name: "contribution_after_marketing", metric: week.metrics.contribution_after_marketing, period: { start: week.start, end: week.end }, sources: week.sources });
  });
});

describe("F9 labels（overview.pnlV3）", () => {
  it("新鍵沒有黑名單詞、箭頭、「｜」、驚嘆號、問句、注意：前綴", () => {
    const { metrics } = scanLabels({ overview: { pnlV3: labels.overview.pnlV3 } });
    for (const [key, value] of Object.entries(metrics)) expect(value, key).toBe(0);
    const strings = JSON.stringify(labels.overview.pnlV3);
    expect(strings).not.toMatch(/[？?！!｜→]|注意：|行動|看證據|怎麼算的|公式與來源|數據|變化|通路貢獻|口徑|工作區|資料就緒|快照|稽核|\bID\b|hash|JSON|null|partial|blocking/);
    expect(strings).not.toMatch(/(?<!淨)營收/);
  });
});
