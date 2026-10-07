import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { channelsLabel, conversionSentence, demoAlias } from "@/application/copy";
import { formatCount, formatPeriodL1, metricDefinitions } from "@/application/presentation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { PRODUCT_SORT_OPTIONS, ProductComparisonPanel, TABLE_DENSITY_KEY, type ProductPanelInitial } from "@/components/product-comparison-panel";
import { PageHeader } from "@/components/shell/page-chrome";
import type { AnalysisFilters } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";

/*
 * V3-5 商品毛利頁（PRD §7.3、§6.3 #36、F18；§9.4 C3／C10／C14／C15）。伺服器端渲染（所有彈出層都是關著的）：
 * 頁首插槽、範圍副標、前 10 名兩表、工具列（≤ 5 個控制）、合併排序、欄位 popover（更多欄位＋列高）、筆數句、篩選型空狀態、匯出本頁兩項、
 * 每個數字格都是 number-link、手機清單的 data-label／data-list-role 與明確 role。期待值一律由 labels 與格式化函式組出。
 */

const page = labels.products.pageV3;
const panelCopy = labels.ui.productComparisonPanel;
const noop = () => undefined;

async function render(name = "golden", options: { filters?: AnalysisFilters; initial?: ProductPanelInitial; allChannels?: readonly string[]; conversion?: Parameters<typeof ProductComparisonPanel>[0]["conversion"] } = {}) {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, options.filters ?? {}, await hashInput(input));
  const html = renderToStaticMarkup(createElement(ProductComparisonPanel, { dataset, snapshot, onEvidence: noop, initial: options.initial, allChannels: options.allChannels, conversion: options.conversion }));
  return { html, dataset, snapshot };
}
const occurrences = (html: string, needle: string) => html.split(needle).length - 1;
/** 從某個屬性所在的開始標籤起，取到對應的結束標籤（同名元素巢狀時計數）。 */
function element(html: string, attr: string): string | null {
  const at = html.indexOf(attr);
  if (at < 0) return null;
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-z0-9]+)/i.exec(html.slice(start))![1];
  const re = new RegExp(`<${tag}\\b|</${tag}>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    depth += match[0].startsWith("</") ? -1 : 1;
    if (depth === 0) return html.slice(start, match.index + match[0].length);
  }
  return null;
}
const openTag = (html: string, attr: string) => { const at = html.indexOf(attr); return at < 0 ? null : html.slice(html.lastIndexOf("<", at), html.indexOf(">", at) + 1); };
const headerTexts = (table: string) => [...table.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(match => match[1]);
/** tbody 每列的儲存格開始標籤（td 與 th scope=row）。 */
const bodyRows = (table: string) => [...table.slice(table.indexOf("<tbody")).matchAll(/<tr role="row">([\s\S]*?)<\/tr>/g)].map(match => [...match[1].matchAll(/<(td|th)\b[^>]*>/g)].map(cell => cell[0]));
/** 第 n 個儲存格的完整內容（td／th）。 */
const cells = (row: string) => [...row.matchAll(/<(td|th)\b[^>]*>[\s\S]*?<\/\1>/g)].map(match => match[0]);
/** 開始標籤的 class 是否含 num（金額、比率、件數欄右對齊）。 */
const isNum = (tag: string) => /\sclass="[^"]*\bnum\b[^"]*"/.test(tag);
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`).exec(tag)?.[1] ?? null;

afterEach(() => { Reflect.deleteProperty(globalThis, "window"); });

describe("V3-5 頁首動作插槽（shell/page-chrome.tsx）", () => {
  it("每頁都渲染一個 #page-actions（testid page-actions）；沒有內容時是空的，傳入 actions 時放在裡面", () => {
    const empty = renderToStaticMarkup(createElement(PageHeader, { title: labels.nav.overview.label, description: labels.nav.overview.description, isData: false, showLoadDemo: false, onLoadDemo: noop, onImport: noop }));
    expect(occurrences(empty, ' id="page-actions"')).toBe(1);
    expect(occurrences(empty, 'data-testid="page-actions"')).toBe(1);
    expect(empty).toContain('<div class="page-actions" id="page-actions" data-testid="page-actions"></div>');
    const filled = renderToStaticMarkup(createElement(PageHeader, { title: labels.nav.products.label, description: page.description, isData: false, showLoadDemo: false, onLoadDemo: noop, onImport: noop, actions: createElement("span", { "data-testid": "slot-probe" }) }));
    expect(element(filled, 'id="page-actions"')).toContain('data-testid="slot-probe"');
    expect(filled).toContain(`<p class="subtitle">${page.description}</p>`);
  });

  it("Dashboard 的商品頁頁首描述用 pageV3.description（取代 v2 的 eyebrow 與「元，未稅」標籤）；其他頁維持導覽描述", () => {
    const source = readFileSync(resolve("src/components/dashboard.tsx"), "utf8");
    const line = source.split("\n").find(text => text.includes("<PageHeader "))!;
    // V3-8：匯入中（importing）頁首描述改成隱私一句，所以只比對商品頁那一段三元式。
    expect(line).toContain('panel === "products" ? labels.products.pageV3.description : currentPanel.description}');
    expect(page.description.length).toBeLessThanOrEqual(24);
  });
});

describe("V3-5 商品毛利頁（伺服器端渲染）", () => {
  it("範圍副標一行：本期 … 對比 上期 … · 全部通路 · 金額未稅；只看部分通路時寫通路名", async () => {
    const { html, snapshot } = await render();
    const { previous, current } = snapshot.report;
    const expected = (channels: string) => fill(page.scope, { current: formatPeriodL1(current.period.start, current.period.end, { days: false, anchor: snapshot.data_as_of }), previous: formatPeriodL1(previous.period.start, previous.period.end, { days: false, anchor: snapshot.data_as_of }), channels });
    expect(html).toContain(`<p class="product-scope" data-testid="product-scope">${expected(labels.shell.periodBar.filter.allChannels)}</p>`);
    const dtc = await render("golden", { filters: { channels: ["DTC"] } });
    expect(dtc.html).toContain(expected(channelsLabel(["DTC"], demoAlias(dtc.dataset.manifest.dataset_id))));
    // allChannels 明確傳入時以它判斷（例如資料集只有部分通路被選）。
    const explicit = await render("golden", { allChannels: ["DTC", "MARKETPLACE", "OTHER"] });
    expect(explicit.html).not.toContain(` · ${labels.shell.periodBar.filter.allChannels} · `);
    // 不再有 eyebrow 與「元，未稅」標籤；h2 只給輔助科技（頁首已有 h1），小表標題維持 h4。
    expect(html).not.toContain('class="eyebrow"');
    expect(html).not.toContain(panelCopy.basisTag);
    expect(html).toContain(`<h2 id="products-heading" class="sr-only">${labels.sections.productTable}</h2>`);
  });

  it("前 10 名兩表：testid、h4、欄位 排名｜商品｜本期商品毛利（元）｜差額（元），商品格是「SKU · 通路」（示範資料用台灣化通路名）", async () => {
    const { html } = await render("demo");
    const yuan = (label: string) => fill(labels.units.yuanColumn, { label });
    for (const kind of ["worst", "best"] as const) {
      const section = element(html, `data-testid="product-${kind}"`)!;
      expect(section).toContain(`<h4 id="product-${kind}-heading">`);
      const table = element(section, "<table")!;
      expect(headerTexts(table)).toEqual([page.columns.rank, page.columns.product, yuan(`${labels.periods.current}${metricDefinitions.gross_profit.shortLabel}`), yuan(page.columns.change)]);
      const rows = element(table, "<tbody")!.split('<tr role="row">').slice(1).map(cells);
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.length).toBeLessThanOrEqual(10);
      rows.forEach((contents, index) => {
        expect(contents[0]).toContain(`>${formatCount(index + 1, "L2")}</td>`);
        expect(contents[1]).toMatch(/^<th scope="row" role="rowheader"[^>]*>[^<]+<span class="product-channel"><span aria-hidden="true"> · <\/span>[^<]+<\/span><\/th>$/);
        expect(contents[2]).toContain('class="number-link');
        expect(contents[3]).toContain('class="number-link');
      });
      expect(table).toContain(`<caption class="sr-only">${kind === "worst" ? page.worstCaption : page.bestCaption}</caption>`);
    }
    expect(html).toContain(labels.demoChannelAlias.DTC);
  });

  it("工具列（C15）：品類｜搜尋｜排序｜只看負毛利｜欄位，直接子控制 ≤ 5；舊的排序方向 select 已合併", async () => {
    const { html } = await render();
    const toolbar = element(html, 'data-testid="product-toolbar"')!;
    // 只數工具列的直接子元素（欄位 popover 內的控制不算）。
    const inner = toolbar.slice(toolbar.indexOf(">") + 1, toolbar.lastIndexOf("</div>"));
    const children: string[] = [];
    let rest = inner;
    while (rest.trim()) {
      const tag = /^<([a-z0-9]+)/i.exec(rest.trimStart())![1];
      // input 是空元素（沒有結束標籤），只取開始標籤。
      const node = tag === "input" ? openTag(rest, "<input")! : element(rest, `<${tag}`)!;
      children.push(tag);
      rest = rest.slice(rest.indexOf(node) + node.length);
    }
    const controls = children.filter(tag => ["select", "input", "button", "details"].includes(tag));
    expect(controls).toEqual(["select", "input", "select", "button", "details"]);
    expect(controls.length).toBeLessThanOrEqual(5);
    for (const id of ["product-category", "product-search", "product-sort"]) expect(occurrences(html, `id="${id}"`), id).toBe(1);
    expect(html).not.toContain('id="product-direction"');
    expect(openTag(toolbar, 'id="product-category"')).toContain(`aria-label="${labels.csvColumns.category}"`);
    expect(openTag(toolbar, 'id="product-search"')).toContain(`aria-label="${panelCopy.searchSku}"`);
    expect(openTag(toolbar, 'id="product-sort"')).toContain(`aria-label="${page.sortLabel}"`);
    expect(toolbar).toContain(`aria-pressed="false">${panelCopy.negativeOnly}</button>`);
  });

  it("排序合併成一個 select：選項文字取自 pageV3.sortOptions（順序相同），值對應既有的依據 × 方向；預設「商品毛利差額：下降最多優先」", async () => {
    const { html } = await render();
    const select = element(html, 'id="product-sort"')!;
    const options = [...select.matchAll(/<option value="([^"]+)"( selected="")?>([^<]*)<\/option>/g)].map(match => ({ value: match[1], selected: !!match[2], label: match[3] }));
    expect(options.map(option => option.label)).toEqual(Object.values(page.sortOptions));
    expect(options.map(option => option.value)).toEqual(PRODUCT_SORT_OPTIONS.map(option => `${option.sort}.${option.direction}`));
    expect(new Set(PRODUCT_SORT_OPTIONS.map(option => option.sort))).toEqual(new Set(["gross_profit_change", "current_gross_profit", "net_revenue_change", "current_net_revenue", "sku"]));
    expect(options.filter(option => option.selected).map(option => option.label)).toEqual([page.sortOptions.grossProfitChangeAscending]);
  });

  it("「欄位」popover：收合時仍掛載更多欄位切換（product-more-columns、aria-pressed）、說明與列高切換（標準 40px／精簡 32px）；summary 內沒有互動元件", async () => {
    const { html } = await render();
    const host = element(html, 'class="ui-popover-host product-columns"')!;
    expect(openTag(host, "<details")).not.toMatch(/\sopen=""/);
    const summary = element(host, "<summary")!;
    expect(summary).toContain(page.columnsMenu);
    expect(summary).not.toMatch(/<(button|input|select|a)\b/);
    expect(host).toMatch(/aria-pressed="false" data-testid="product-more-columns"/);
    const hintId = attr(openTag(host, 'data-testid="product-more-columns"')!, "aria-describedby")!;
    expect(host).toContain(`id="${hintId}" class="product-columns-hint">${labels.productHighlights.moreColumnsHint}</p>`);
    const density = element(host, 'data-testid="product-density"')!;
    expect(density).toContain(page.densityLegend);
    const radios = [...density.matchAll(/<input type="radio"[^>]*>/g)].map(match => match[0]);
    expect(radios.map(tag => attr(tag, "value"))).toEqual(["standard", "compact"]);
    expect(radios.map(tag => / checked=""/.test(tag))).toEqual([true, false]);
    expect(new Set(radios.map(tag => attr(tag, "name"))).size).toBe(1);
    for (const text of [page.densityStandard, page.densityCompact]) expect(density).toContain(text);
    expect(html).toContain('<section class="product-page" aria-labelledby="products-heading" data-density="standard">');
    // 初始偏好為精簡時，整頁（兩張小表與完整表）一起改 32px。
    const compact = await render("golden", { initial: { density: "compact" } });
    expect(compact.html).toContain('data-density="compact"');
    expect([...element(compact.html, 'data-testid="product-density"')!.matchAll(/<input type="radio"[^>]*>/g)].map(match => / checked=""/.test(match[0]))).toEqual([false, true]);
  });

  it("F18 列高偏好記在 localStorage（profitlens.table-density）；讀取失敗時用標準，不影響渲染", async () => {
    expect(TABLE_DENSITY_KEY).toBe("profitlens.table-density");
    const store = new Map<string, string>([[TABLE_DENSITY_KEY, "compact"]]);
    Reflect.set(globalThis, "window", { localStorage: { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value) } });
    expect((await render()).html).toContain('data-density="compact"');
    Reflect.set(globalThis, "window", { localStorage: { getItem: () => { throw new Error("blocked"); } } });
    expect((await render()).html).toContain('data-density="standard"');
  });

  it("筆數句在表格右上角（工具列最右、aria-live=polite）：「顯示 n 筆，共 m 筆」；搜尋後 n 變小、m 不變", async () => {
    const { html } = await render();
    const count = (n: number, total: number) => fill(page.showing, { n: formatCount(n, "L2"), total: formatCount(total, "L2") });
    expect(html).toContain(`<p class="ui-toolbar-end product-count" aria-live="polite" data-testid="product-count">${count(4, 4)}</p>`);
    expect((await render("golden", { initial: { query: "a" } })).html).toContain(`>${count(2, 4)}</p>`);
  });

  it("篩選後沒有結果：C10 篩選型空狀態「沒有符合篩選的商品。」＋「清除篩選」；沒有篩選時不出現清除按鈕", async () => {
    for (const initial of [{ query: "zzz" }, { negativeOnly: true }] satisfies ProductPanelInitial[]) {
      const { html } = await render("golden", { initial });
      const empty = element(html, 'data-testid="product-empty"')!;
      expect(openTag(empty, "<div")).toContain("ui-empty-block");
      // V3-8 C（§7.10、C10）：標題是 p.ui-empty-title（句尾句號）。
      expect(empty).toContain(`<p class="ui-empty-title">${labels.products.panel.noProducts}</p>`);
      expect(empty).toContain(`data-testid="product-clear-filters">${page.clearFilters}</button>`);
      expect(html).not.toContain('data-testid="product-table"');
      expect(html).toContain(`>${fill(page.showing, { n: formatCount(0, "L2"), total: formatCount(4, "L2") })}</p>`);
    }
    const { html } = await render();
    expect(html).not.toContain('data-testid="product-empty"');
    expect(html).not.toContain('data-testid="product-clear-filters"');
  });

  it("技術細節 <details> 在表格下方（差額說明＋待補筆數），預設收合", async () => {
    // errors/missing_cogs：只有 DTC／A 缺成本，差額待補 1 筆。
    const { html } = await render("errors/missing_cogs");
    const technical = element(html, 'class="product-technical"')!;
    expect(html.indexOf('data-testid="product-table"')).toBeLessThan(html.indexOf('class="product-technical"'));
    expect(openTag(technical, "<details")).not.toMatch(/\sopen=""/);
    expect(technical).toContain(labels.sections.technicalDetails);
    expect(technical).toContain(panelCopy.deltaFormulaNote);
    expect(technical).toContain(fill(panelCopy.negativeNote, { n: 1 }));
  });

  it("匯出本頁（頁內下拉）：一份 <details class=topbar-menu auto-close>，兩項（商品比較 CSV、商品明細 CSV）各有 12px 說明；含稅換算時明細那項多一句換算說明", async () => {
    const { html } = await render();
    expect(occurrences(html, 'data-testid="product-export-menu"')).toBe(1);
    const menu = element(html, 'data-testid="product-export-menu"')!;
    expect(openTag(menu, "<details")).toMatch(/^<details class="topbar-menu auto-close export-page" data-testid="product-export-menu">$/);
    const summary = element(menu, "<summary")!;
    expect(summary).toContain('data-testid="export-page-products"');
    expect(summary).toContain(page.exportPage);
    expect(summary).not.toMatch(/<(button|input|select|a)\b/);
    const comparison = openTag(menu, 'data-testid="product-export-comparison"')!, products = openTag(menu, 'data-testid="product-export-products"')!;
    expect(menu).toContain(`data-testid="product-export-comparison" aria-describedby="${attr(comparison, "aria-describedby")}">${panelCopy.downloadComparisonCsv}</button>`);
    expect(menu).toContain(`data-testid="product-export-products" aria-describedby="${attr(products, "aria-describedby")}">${panelCopy.downloadProductsCsv}</button>`);
    expect(menu).toContain(`<small id="${attr(comparison, "aria-describedby")}">${page.exportComparisonHint}</small>`);
    expect(menu).toContain(`<small id="${attr(products, "aria-describedby")}">${page.exportProductsHint}</small>`);
    // 伺服器端沒有頁首插槽：選單先渲染在面板內（掛載後改 portal 到 #page-actions，同一時間只有一份）。
    expect(element(html, 'class="product-export-inline"')).toContain('data-testid="product-export-menu"');
    const conversion = { basis: "inclusive" as const, rate: "0.05", fields: ["gross_sales", "cogs_net"], rows_converted: 8 };
    const converted = (await render("golden", { conversion })).html;
    expect(converted).toContain(fill(page.exportConverted, { summary: conversionSentence(conversion)! }));
  });

  it("完整表：testid、金額／比率／件數欄右對齊（num）且每格都是 number-link；更多欄位打開時新增的格也是", async () => {
    for (const initial of [{}, { moreColumns: true }] satisfies ProductPanelInitial[]) {
      const { html } = await render("demo", { initial });
      const table = element(html, 'data-testid="product-table"')!;
      const heads = [...table.matchAll(/<th scope="col"[^>]*>/g)].map(match => match[0]);
      const rows = table.slice(table.indexOf("<tbody")).split('<tr role="row">').slice(1).map(cells);
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) {
        expect(row).toHaveLength(heads.length);
        row.forEach((cell, index) => {
          const numeric = isNum(heads[index]);
          expect(isNum(/^<[^>]*>/.exec(cell)![0]), `${index}`).toBe(numeric);
          if (numeric) expect(cell, `${index}`).toContain('class="number-link');
        });
      }
      expect(heads.filter(isNum).length).toBe(initial.moreColumns ? 16 : 8);
    }
  });

  it("C3 手機清單：每個 th／td 都有 data-label（等於欄名）與 data-list-role；主行＝商品＋本期商品毛利，次行＝差額、件數、毛利率；明確 role", async () => {
    const { html } = await render("golden", { initial: { moreColumns: true } });
    const roles = new Set(["primary", "secondary", "labeled"]);
    for (const testid of ['data-testid="product-table"', 'data-testid="product-worst"', 'data-testid="product-best"']) {
      const table = element(element(html, testid)!, "<table")!;
      expect(openTag(table, "<table")).toContain('role="table"');
      expect(occurrences(table, '<thead role="rowgroup">')).toBe(1);
      expect(occurrences(table, '<tbody role="rowgroup">')).toBe(1);
      const headers = headerTexts(table);
      expect(occurrences(table, 'role="columnheader"')).toBe(headers.length);
      for (const row of bodyRows(table)) {
        expect(row).toHaveLength(headers.length);
        row.forEach((tag, index) => {
          expect(attr(tag, "data-label"), `${testid} ${index}`).toBe(headers[index]);
          expect(roles.has(attr(tag, "data-list-role") ?? ""), `${testid} ${index}`).toBe(true);
          expect(attr(tag, "role")).toBe(tag.startsWith("<th") ? "rowheader" : "cell");
        });
        expect(occurrences(row.join(""), 'role="rowheader"')).toBe(1);
      }
    }
    const full = element(html, 'data-testid="product-table"')!;
    const first = bodyRows(full)[0];
    const headers = headerTexts(full);
    const byRole = (role: string) => first.flatMap((tag, index) => attr(tag, "data-list-role") === role ? [headers[index]] : []);
    const yuan = (label: string) => fill(labels.units.yuanColumn, { label });
    expect(byRole("primary")).toEqual([labels.csvColumns.channel, "SKU", yuan(`${labels.periods.current}${metricDefinitions.gross_profit.shortLabel}`)]);
    expect(byRole("secondary")).toEqual([`${labels.periods.current}${labels.assist.items.units_sold.label}`, `${labels.periods.current}${metricDefinitions.gross_margin.shortLabel}`, yuan(`${metricDefinitions.gross_profit.label}${labels.csvSuffix.change}`)]);
    // 次行把商品毛利差額排第一（CSS order，.list-lead）。
    expect(first.filter(tag => /\bclass="[^"]*\blist-lead\b/.test(tag)).map(tag => attr(tag, "data-label"))).toEqual([yuan(`${metricDefinitions.gross_profit.label}${labels.csvSuffix.change}`)]);
    const worst = element(element(html, 'data-testid="product-worst"')!, "<table")!;
    const worstHeaders = headerTexts(worst);
    expect(bodyRows(worst)[0].map(tag => attr(tag, "data-list-role"))).toEqual(["secondary", "primary", "primary", "secondary"]);
    expect(worstHeaders[1]).toBe(page.columns.product);
  });

  it("CSS 錨點 B：插槽空時不佔位、手機清單以 data-label 顯示欄名（產生內容不重複朗讀）、精簡列高由 data-density 切換", () => {
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const anchor = css.slice(css.indexOf("V3-5 錨點 B"), css.indexOf("V3-5 錨點 C"));
    expect(anchor).toContain(".page-actions:empty { display: none; }");
    expect(anchor).toMatch(/content: attr\(data-label\) \/ "";/);
    expect(anchor).toContain(".product-list tr { display: flex;");
    expect(anchor).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).toContain('[data-density="compact"] .ui-table');
  });
});
