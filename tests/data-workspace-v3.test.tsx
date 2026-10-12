import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import type { Dataset, DatasetInput, FileName, ValidationIssue } from "@/domain/types";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { inspectImportFile } from "@/application/import";
import { initialWizardState, runCheck, wizardReducer, type WizardState } from "@/application/import-wizard";
import { ASSIST_KPI_VERSION } from "@/application/assist-kpi";
import { formatAmountL3, formatCount, formatDateL1, formatPeriodL1, formatRateL2 } from "@/application/presentation";
import { conversionSentence } from "@/application/copy";
import type { TaxConversion } from "@/application/tax-basis";
import { DataWorkspace, Diagnosis } from "@/components/workspace-panels";
import { PageHeader } from "@/components/shell/page-chrome";
import { fill, labels } from "@/i18n";
import { BLACKLIST, labelEntries } from "../scripts/lib/copy-scan.mjs";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";
import { issueDistribution } from "@/application/chart-issues";
import { issueReasonLabel } from "@/application/issue-filter";
import { COVERAGE_RANGE_FIELD } from "@/application/chart-coverage";
import { chartColors } from "@/application/chart-theme";
import { barCellPairGeometry, barCellScale, barCellSigned } from "@/components/charts/bar-cell";

// V3-8 資料來源頁（PRD §7.7.1、§6.3 #51–#53；D-V3-2、D-V3-28）＋通路健檢空狀態（§7.10 健檢沒有結果、C10）。SSR 驗收：
// 區塊順序、資料狀態一行、問題表在第二段（六欄、原因碼欄 hidden 掛載、下載鈕只在資料來源頁）、兩欄定義列表、前處理表、選填資料並列、
// 來源預覽三個 details、版本與來源資訊 details（metric_version 取自 snapshot）、範本 3×3、頁首主次依有沒有資料對調、健檢空狀態三要素、新鍵不含黑名單詞。

const v3 = labels.data.pageV3;
const dataPanel = labels.data.panel;
const diagnosisPanel = labels.diagnosis.panel;
const noop = () => undefined;
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const roles: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
type Source = { input: DatasetInput; dataset: Dataset; snapshot: WorkspaceSnapshot; conversion?: TaxConversion | null; mappings?: Partial<Record<FileName, Record<string, string>>> };

async function load(name: string): Promise<Source> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}
/** 含稅匯入（tests/fixtures/inclusive_tax，D2 預設勾選 8 欄）：經精靈的 reducer 與檢核得到 conversion 與欄位對照（同 mounted-testids 的 data 狀態）。 */
async function imported(): Promise<Source> {
  let state: WizardState = initialWizardState();
  for (const role of roles) {
    const content = new Uint8Array(readFileSync(resolve("tests/fixtures/inclusive_tax", role)));
    state = wizardReducer(state, { type: "fileRead", role, draft: inspectImportFile(role, { name: role, size: content.byteLength, bytes: content }), encoding: "utf8", memory: null });
  }
  const confirmed = wizardReducer(wizardReducer(wizardReducer(state, { type: "next" }), { type: "basis", basis: "inclusive" }), { type: "confirm" });
  const prepared = wizardReducer(confirmed, { type: "checked", candidate: runCheck(confirmed) }).candidate!;
  const dataset = validateDataset(prepared.input!).dataset!;
  return { input: prepared.input!, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(prepared.input!)), conversion: prepared.conversion, mappings: prepared.columnMappings };
}
const page = (source: Source, extra: Partial<Parameters<typeof DataWorkspace>[0]> = {}) => renderToStaticMarkup(createElement(DataWorkspace, { dataset: source.dataset, snapshot: source.snapshot, conversion: source.conversion, mappings: source.mappings, ...extra }));
/** 回傳含有 attr 的元素（開始標籤到對應的結束標籤）。 */
function element(html: string, attr: string): string {
  const at = html.indexOf(attr);
  if (at < 0) throw new Error(`找不到 ${attr}`);
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start))![1];
  const re = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*?(/?)>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    if (match[1]) depth--; else if (!match[2]) depth++;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  throw new Error(`沒有結束標籤：${attr}`);
}

let golden: Source, partial: Source, importedSource: Source, demo: Source;
beforeAll(async () => { [golden, partial, importedSource, demo] = await Promise.all([load("golden"), load("errors/missing_cogs"), imported(), load("demo")]); });

describe("V3-8 資料來源頁（PRD §7.7.1）", () => {
  it("區塊順序依 §7.7.1 的 2–9：資料狀態一行 → 資料問題 → 範圍與金額基準 → 前處理 → 選填資料 → 來源預覽 → 版本與來源資訊 → 範本下載", () => {
    for (const source of [partial, importedSource]) {
      const html = page(source);
      const order = ["data-status-line", "data-issues", "data-scope", "data-preprocessing", "data-optional", "data-preview", "data-version-info", "data-templates"].map(id => html.indexOf(`data-testid="${id}"`));
      expect(order.every(index => index >= 0), order.join()).toBe(true);
      expect([...order].sort((a, b) => a - b)).toEqual(order);
      // 第一個元素就是資料狀態一行；資料問題區段保留 v2 的 aria-labelledby（quality-heading）。
      expect(html.startsWith('<p class="data-status-line" data-testid="data-status-line">')).toBe(true);
      expect(html).toContain('<section class="panel data-section" aria-labelledby="quality-heading" data-testid="data-issues">');
      // V4-7a：G20 涵蓋時間軸（狀態一行之後、資料問題之前）的結論標題是第 8 個 h2（G21 是 h3，在資料問題之內）。
      expect(html.match(/<h2[\s>]/g)).toHaveLength(8);
      expect(html.match(/<h2 id="data-coverage-title">/g)).toHaveLength(1);
    }
  });

  it("資料狀態一行：來源 · 資料到 · 涵蓋（天數）· 份數 · 金額基準 · 問題數，以「 · 」分隔，日期經 formatDateL1／formatPeriodL1", () => {
    const line = (source: Source) => /<p class="data-status-line" data-testid="data-status-line">([^<]*)<\/p>/.exec(page(source))![1];
    const manifest = importedSource.dataset.manifest, anchor = manifest.data_as_of;
    expect(line(importedSource)).toBe([labels.shell.status.local, fill(labels.shell.status.ready, { date: formatDateL1(anchor, { anchor }) }), fill(v3.statusLine.coverage, { range: formatPeriodL1(manifest.coverage_start, manifest.coverage_end, { anchor }) }), fill(v3.statusLine.files, { n: 3 }), fill(v3.statusLine.basis, { basis: v3.statusLine.basisConverted }), v3.statusLine.noIssues].join(" · "));
    expect(line(importedSource)).toContain("（4 天）");
    const pm = partial.dataset.manifest;
    expect(line(partial)).toBe([labels.shell.status.demo, fill(labels.shell.status.ready, { date: formatDateL1(pm.data_as_of, { anchor: pm.data_as_of }) }), fill(v3.statusLine.coverage, { range: formatPeriodL1(pm.coverage_start, pm.coverage_end, { anchor: pm.data_as_of }) }), fill(v3.statusLine.files, { n: 3 }), fill(v3.statusLine.basis, { basis: v3.statusLine.basisExclusive }), fill(v3.statusLine.issues, { n: partial.dataset.issues.length })].join(" · "));
    expect(v3.separator).toBe(" · ");
  });

  it("資料問題在第二段：六欄問題表、原因碼欄 hidden 掛載、工具列的「下載問題清單 CSV」（data-issues-download）與單位寫一次；計數徽章只放數字", () => {
    const html = page(partial);
    const issues = element(html, 'data-testid="data-issues"');
    expect([...issues.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(match => match[1])).toEqual(Object.values(v3.issueTable.columns));
    expect(issues).toContain(`<th scope="col" class="issue-code" hidden="">${v3.issueTable.columns.code}</th>`);
    expect(issues).toContain(`<td class="issue-code" hidden=""><details><summary>${labels.data.issues.reasonCodeSummary}</summary><code>MISSING_COGS</code></details></td>`);
    expect(issues).toContain(`<button type="button" class="ui-btn ui-btn-secondary" data-testid="data-issues-download">${labels.exports.downloads.issuesCsv}</button>`);
    expect(issues.split(v3.issueTable.unit)).toHaveLength(2);
    expect(issues).toContain(`<span class="ui-count-badge" role="img" aria-label="${fill(v3.statusLine.issues, { n: 1 })}">1</span>`);
    expect(issues).toContain(`<span class="ui-mono">sales_daily.csv</span>`);
    // 沒有問題時寫一句（v2 的 noIssues），沒有表格、沒有下載鈕。
    const clean = element(page(golden), 'data-testid="data-issues"');
    expect(clean).toContain(`<p class="data-section-empty">${dataPanel.noIssues}</p>`);
    expect(clean).not.toContain("<table");
    expect(clean).not.toContain("ui-count-badge");
  });

  it("範圍與金額基準：兩欄定義列表（dl.ui-dl，10 格：v2 的 9 欄＋金額基準），技術細節與欄位對照仍在原處收合", () => {
    const scope = element(page(importedSource), 'data-testid="data-scope"');
    expect(scope).toContain(`<h2 class="ui-section-title" id="dataset-heading">${labels.data.sections.dataScope}</h2>`);
    const dl = element(scope, 'class="ui-dl"');
    expect([...dl.matchAll(/<dt>([^<]*)<\/dt>/g)].map(match => match[1])).toEqual([dataPanel.meta.datasetId, labels.shell.status.dataAsOf, dataPanel.meta.coverage, labels.importWizard.basis.label, dataPanel.meta.currencyTimezone, dataPanel.meta.channels, dataPanel.meta.coverageConfirmed, labels.shell.periods.previous, labels.shell.periods.current, dataPanel.meta.scopeChannels]);
    expect(dl).toContain(`<dt>${labels.importWizard.basis.label}</dt><dd>${v3.statusLine.basisConverted}</dd>`);
    expect(scope).not.toContain("metadata-grid");
    expect(scope).toContain(`<details><summary>${labels.evidence.sections.technicalDetails}</summary>`);
    expect(scope).toContain(`<details><summary>${dataPanel.mappingsSummary}</summary>`);
    expect(scope).not.toContain("口徑");
  });

  it("本次匯入的前處理是表格：列數＝換算欄位數，含稅與未稅合計經 formatAmountL3、稅率經 formatRateL2（數值不變）；未稅匯入時一句 noConversion", () => {
    const conversion = importedSource.conversion!;
    const section = element(page(importedSource), 'data-testid="data-preprocessing"');
    expect(section).toContain(`<p class="ui-section-subtitle">${conversionSentence(conversion)}</p>`);
    expect([...section.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(match => match[1])).toEqual(Object.values(v3.preprocessing.columns));
    // V4-7b：換算值格內多了 G22 成對條（C24 根 svg data-chart-kind="cell"，aria-hidden、沒有文字）；這裡只比對文字欄，條另見本檔「V4-7b G22 前處理表成對條」。
    const textOnly = section.replace(/<svg class="bar-cell is-pair[^"]*" data-chart-kind="cell"[^>]*>[\s\S]*?<\/svg>/g, "");
    const body = [...textOnly.matchAll(/<tr data-field="([a-z_]+)"><th scope="row">([^<]*)<\/th><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td><td class="num">([^<]*)<\/td><\/tr>/g)];
    expect(body.map(match => match[1])).toEqual(conversion.fields);
    expect(body).toHaveLength(8);
    for (const [, field, label, raw, converted, rate] of body) {
      expect(label).toBe(labels.metrics[field as keyof typeof labels.metrics].headline);
      expect(raw).toBe(formatAmountL3(conversion.totals![field].raw));
      expect(converted).toBe(formatAmountL3(conversion.totals![field].converted));
      expect(rate).toBe(formatRateL2(conversion.rate));
    }
    expect(section).toContain("5%");
    // v2 的條列（conversionTotals 一行一欄）拿掉了。
    expect(section).not.toContain("<ul>");
    const none = element(page(golden), 'data-testid="data-preprocessing"');
    expect(none).toContain(`<p class="data-section-empty">${labels.importWizard.noConversion}</p>`);
    expect(none).not.toContain("<table");
  });

  it("選填資料：目標與促銷檔期在同一個分組（標題「選填資料」），testid 不變；工具列順序 上傳、下載範本、下載目前資料、移除；錯誤清單用同一組欄位", () => {
    const targets = { filename: "targets.csv", rows: [{ line: 2, period_start: "2026-08-01", period_end: "2026-08-02", channel: "ALL", metric: "net_revenue" as const, target: "100.00" }] };
    const events = { filename: "events.csv", rows: [{ line: 2, start: "2026-08-01", end: "2026-08-02", label: "週年慶" }] };
    const html = page(golden, { targets, events, targetIssues: [{ line: 3, field: "metric", reason_code: "INVALID_METRIC", message: fill(labels.targets.errors.INVALID_METRIC, { line: 3, value: "bogus" }) }], eventIssues: [{ line: null, field: "$file", reason_code: "EMPTY", message: labels.events.errors.EMPTY ?? "EMPTY" }] });
    const optional = element(html, 'data-testid="data-optional"');
    expect(optional).toContain(`<h2 class="ui-section-title" id="optional-heading">${v3.optionalHeading}</h2>`);
    const grid = element(optional, 'class="data-optional-grid"');
    for (const id of ["targets-entry", "targets-issues", "targets-table", "events-entry", "events-issues", "events-table"]) expect(grid, id).toContain(`data-testid="${id}"`);
    expect(grid.indexOf('data-testid="targets-entry"')).toBeLessThan(grid.indexOf('data-testid="events-entry"'));
    const toolbar = element(element(grid, 'data-testid="targets-entry"'), 'class="ui-toolbar side-entry-controls"');
    const order = [labels.targets.upload, labels.targets.template, labels.targets.download, labels.targets.remove].map(text => toolbar.indexOf(`>${text}<`));
    expect(order.every(index => index >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    const targetIssues = element(grid, 'data-testid="targets-issues"');
    expect(targetIssues).toMatch(/^<div class="side-entry-issues" role="alert" data-testid="targets-issues">/);
    expect([...targetIssues.matchAll(/<th scope="col"[^>]*>([^<]*)<\/th>/g)].map(match => match[1])).toEqual(Object.values(v3.issueTable.columns));
    expect(targetIssues).toContain("INVALID_METRIC");
    expect(element(grid, 'data-testid="targets-table"')).toContain('<th scope="row" class="num ui-mono">2</th>');
  });

  it("來源檔案預覽：三個收合的 <details>（summary 寫檔案角色＋檔名＋列數），前 10 列表格保持掛載，行號用等寬字", () => {
    const html = page(golden, { filenames: { "sales_daily.csv": "經營銷售.csv" } });
    const preview = element(html, 'data-testid="data-preview"');
    const files = [["sales_daily.csv", labels.importWizard.files.sales, "經營銷售.csv", golden.dataset.sales.length], ["channel_costs_daily.csv", labels.importWizard.files.costs, "channel_costs_daily.csv", golden.dataset.costs.length], ["ad_spend_daily.csv", labels.importWizard.files.ads, "ad_spend_daily.csv", golden.dataset.ads.length]] as const;
    expect(preview.match(/<details /g)).toHaveLength(3);
    for (const [role, title, name, count] of files) {
      const details = element(preview, `data-testid="data-preview-${role}"`);
      expect(details.startsWith(`<details class="data-preview-file" data-testid="data-preview-${role}"><summary>${title} · <span class="ui-mono">${name}</span> · ${fill(dataPanel.rowCount, { n: count })}</summary>`)).toBe(true);
      expect(details).toContain(`<caption class="sr-only">${fill(dataPanel.previewCaption, { fileName: role })}</caption>`);
      expect(details).toContain(`aria-label="${fill(dataPanel.previewRegionAria, { title })}"`);
      expect(details).toMatch(/<th scope="row" class="ui-mono">\d+<\/th>/);
      expect(details.match(/<tr><th scope="row"/g)!.length).toBe(Math.min(10, count));
    }
  });

  it("版本與來源資訊：新的收合 <details>（L3）；資料版本＝dataset hash、指標版本取自 snapshot.metric_version 與 assist-kpi 常數、金額基準代碼、欄位對照彙整；原處技術細節仍在", () => {
    const html = page(importedSource, { filenames: { "sales_daily.csv": "銷售.csv" } });
    const version = element(html, 'data-testid="data-version-info"');
    expect(version.startsWith(`<details class="panel data-section data-version" data-testid="data-version-info"><summary><h2 class="ui-section-title">${v3.version.heading}</h2></summary>`)).toBe(true);
    expect(version).toContain(`<dt>${v3.version.dataVersion}</dt><dd class="ui-mono">${importedSource.snapshot.dataset_hash}</dd>`);
    expect(version).toContain(`<dt>${v3.version.metricVersion}</dt><dd class="ui-mono">${importedSource.snapshot.metric_version} · ${ASSIST_KPI_VERSION}</dd>`);
    expect(version).toContain(`<dt>${dataPanel.meta.amountBasisTechnical}</dt><dd class="ui-mono">${importedSource.dataset.manifest.amount_basis} · inclusive ${importedSource.conversion!.rate}</dd>`);
    expect(version).toContain(`<span class="ui-mono">銷售.csv</span> · ${labels.importWizard.mappingSources.exact}`);
    // 匯入時間只在呼叫端給 importedAt 時出現（formatSavedDateTime，台北時間）。
    expect(version).not.toContain(v3.version.importedAt);
    expect(element(page(importedSource, { importedAt: "2026-10-07T06:05:00.000Z" }), 'data-testid="data-version-info"')).toContain(`<dt>${v3.version.importedAt}</dt><dd>2026-10-07 14:05</dd>`);
    // 欄位對照只列改過名的欄：來源欄名（標準欄位）。
    const renamed = element(page(importedSource, { mappings: { "sales_daily.csv": { gross_sales: "商品折扣前收入", discounts: "discounts" } } }), 'data-testid="data-version-info"');
    expect(renamed).toContain(`<span class="ui-mono">sales_daily.csv</span> · ${fill(v3.version.mappingItem, { original: "商品折扣前收入", standard: "gross_sales" })}</li>`);
    expect(html).toContain(`<details><summary>${labels.evidence.sections.technicalDetails}</summary>`);
  });

  it("範本下載：與頂欄匯出選單同一張 3×3 表（標題沿用 downloads.templatesHeading）", () => {
    const templates = element(page(golden), 'data-testid="data-templates"');
    expect(templates).toContain(`<h2 class="ui-section-title" id="templates-heading">${labels.exports.downloads.templatesHeading}</h2>`);
    expect(templates.match(/<tr>/g)).toHaveLength(4);
    expect([...templates.matchAll(/<th scope="col">([^<]*)<\/th>/g)].map(match => match[1])).toEqual([labels.shell.topbarV3.templateColumns.file, labels.shell.topbarV3.templateColumns.blank, labels.shell.topbarV3.templateColumns.example]);
    for (const file of Object.values(labels.importWizard.files)) {
      expect(templates).toContain(`aria-label="${fill(labels.exports.downloads.blankTemplate, { file })}"`);
      expect(templates).toContain(`aria-label="${fill(labels.exports.downloads.exampleTemplate, { file })}"`);
    }
  });

  it("示範資料（demo）也走同一套版面：狀態一行以「示範資料」開頭、金額基準未稅", () => {
    const html = page(demo);
    expect(html).toMatch(new RegExp(`^<p class="data-status-line" data-testid="data-status-line">${escapeRe(labels.shell.status.demo)} · `));
    expect(html).toContain(fill(v3.statusLine.basis, { basis: v3.statusLine.basisExclusive }));
  });
});

describe("V3-8 頁首主次（PRD §7.7.1 第 1 點）", () => {
  const header = (hasData: boolean | undefined, showLoadDemo = true) => renderToStaticMarkup(createElement(PageHeader, { title: labels.shell.nav.data.headline, description: labels.shell.nav.data.explain, isData: true, showLoadDemo, onLoadDemo: noop, onImport: noop, ...(hasData === undefined ? {} : { hasData }) }));
  const controls = (html: string) => [...element(html, 'class="load-controls"').matchAll(/<button type="button" class="ui-btn (ui-btn-primary|ui-btn-secondary)"( data-testid="page-import")?/g)].map(match => `${match[1]}${match[2] ? ":page-import" : ""}`);

  it("已有資料：「匯入資料」主要在前、「載入示範資料」次要在後（未傳 hasData 時同此）", () => {
    for (const html of [header(true), header(undefined)]) {
      expect(controls(html)).toEqual(["ui-btn-primary:page-import", "ui-btn-secondary"]);
      const buttons = element(html, 'class="load-controls"');
      expect(buttons.indexOf(labels.shell.buttons.importData)).toBeLessThan(buttons.indexOf(labels.shell.buttons.loadDemo));
    }
  });

  it("沒有資料：對調成「載入示範資料」主要在前、「匯入資料」次要在後；page-import 永遠在「匯入資料」上、只有一個", () => {
    const html = header(false);
    expect(controls(html)).toEqual(["ui-btn-primary", "ui-btn-secondary:page-import"]);
    const buttons = element(html, 'class="load-controls"');
    expect(buttons.indexOf(labels.shell.buttons.loadDemo)).toBeLessThan(buttons.indexOf(labels.shell.buttons.importData));
    expect(html.match(/data-testid="page-import"/g)).toHaveLength(1);
    // showLoadDemo 語意不變：沒有資料又不在匯入中時（dashboard 的 showLoadDemo＝false）只剩次要的「匯入資料」，主要動作在空狀態。
    expect(controls(header(false, false))).toEqual(["ui-btn-secondary:page-import"]);
  });
});

describe("V3-8 通路健檢空狀態（PRD §7.10「健檢沒有結果」、C10）", () => {
  it("標題、說明（role=status）與「查看健檢規則」文字按鈕；8 條規則說明 hidden 掛載、aria-controls 指到它", async () => {
    const base = golden.snapshot;
    const html = renderToStaticMarkup(createElement(Diagnosis, { snapshot: { ...base, report: { ...base.report, diagnostics: [] } }, onEvidence: noop }));
    const empty = element(html, 'data-testid="diagnosis-empty"');
    expect(empty.startsWith('<div class="ui-empty-block diagnosis-empty" data-testid="diagnosis-empty">')).toBe(true);
    expect(empty).toContain(`<div role="status"><p class="diagnosis-empty-title">${v3.diagnosisEmpty.title}</p><p>${v3.diagnosisEmpty.body}</p></div>`);
    const controls = new RegExp(`<button type="button" class="ui-btn ui-btn-text" aria-expanded="false" aria-controls="([^"]+)">${escapeRe(v3.diagnosisEmpty.action)}</button>`).exec(empty)![1];
    const rules = element(empty, `id="${controls}"`);
    expect(rules).toMatch(/^<ol id="[^"]+" class="diagnosis-empty-rules" aria-label="[^"]+" tabindex="-1" hidden="">/);
    expect(rules.match(/<li>/g)).toHaveLength(8);
    expect(html).not.toContain('data-testid="diagnosis-list"');
  });
});

describe("V3-8 新鍵（data.pageV3）文案", () => {
  it("不含黑名單詞、箭頭、全形直線、驚嘆號、問號、「注意：」與 emoji；按鈕是動詞＋名詞；空狀態標題以句號結尾", () => {
    const entries = labelEntries(v3) as [string, string][];
    expect(entries.length).toBeGreaterThan(30);
    const offenders: string[] = [];
    for (const [path, value] of entries) {
      for (const terms of Object.values(BLACKLIST)) for (const [name, re] of terms as [string, RegExp][]) if (new RegExp(re.source, re.flags.replace("g", "")).test(value.replace(/\{\w+\}/g, " "))) offenders.push(`${path}: ${name}`);
      if (/[→←⇒▸▾↗｜！!？?]|注意：|\p{Extended_Pictographic}/u.test(value)) offenders.push(`${path}: 標點或符號`);
    }
    expect(offenders).toEqual([]);
    expect(v3.diagnosisEmpty.title.endsWith("。")).toBe(true);
    expect(v3.diagnosisEmpty.body.endsWith("。")).toBe(true);
    for (const button of [v3.diagnosisEmpty.action, v3.issueTable.showCodes]) expect(button).toMatch(/^(查看|顯示)/);
    expect(`${v3.diagnosisEmpty.title}${v3.diagnosisEmpty.body}`).toBe(diagnosisPanel.noDiagnostics);
  });
});

// ── V4-7a 整合（代理 C）：資料來源頁的 G20 涵蓋時間軸與 G21 問題分布表（PRD §5.7；CHART_CATALOG §7、G20、G21；06_BATCHES V4-7a「驗收重點」）。
// SSR 斷言位置與結構；點擊後的篩選、捲動與焦點在 tests/issue-list-filter-v4.test.tsx（hooks harness）與 tests/e2e/charts-data.spec.ts。
describe("V4-7a 資料來源頁：G20、G21 的位置與標題", () => {
  const coverage = labels.data.chartsV4.coverage, issues = labels.data.chartsV4.issues;
  let adDay: Source, synthetic: Source;
  beforeAll(async () => {
    adDay = await load("errors/missing_ad_day");
    const input = synthetic4ChannelInput(), dataset = validateDataset(input).dataset!;
    synthetic = { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
  });
  const titleOf = (html: string, id: string) => new RegExp(`<h[23] id="${id}-title">([^<]*)</h[23]>`).exec(html)![1];
  const mainSections = (html: string) => (checkChartMarkup(html, { page: "data" }) as { mainSections: string[] }).mainSections;

  it("G20（section.panel.chart-section，h2）緊接在狀態一行之後、資料問題之前；G21（inline、h3、table 模式）在 data-issues 內 ui-section-head 之後、問題表之前，不套 .panel", () => {
    for (const source of [adDay, synthetic, partial]) {
      const html = page(source);
      const status = element(html, 'data-testid="data-status-line"'), g20 = element(html, 'data-testid="chart-data-coverage"');
      expect(html.indexOf(status) + status.length, "G20 緊接在狀態一行之後").toBe(html.indexOf(g20));
      expect(html.indexOf(g20) + g20.length, "G20 之後就是資料問題").toBe(html.indexOf('<section class="panel data-section" aria-labelledby="quality-heading" data-testid="data-issues">'));
      expect(g20).toMatch(/^<section class="panel chart-section coverage-section" aria-labelledby="data-coverage-title" aria-describedby="data-coverage-sub" data-testid="chart-data-coverage">/);
      const section = element(html, 'data-testid="data-issues"');
      const g21 = element(section, 'data-testid="chart-data-issues"');
      const head = element(section, 'class="ui-section-head"');
      expect(section.indexOf(head) + head.length, "G21 緊接在 ui-section-head 之後").toBe(section.indexOf(g21));
      expect(section.indexOf(g21) + g21.length, "G21 之後是問題表").toBe(section.indexOf('<div class="issue-list">'));
      expect(g21).toMatch(/^<section class="chart-section is-inline issues-chart" aria-labelledby="data-issues-dist-title" aria-describedby="data-issues-dist-sub" data-testid="chart-data-issues">/);
      expect(g21).toContain('<h3 id="data-issues-dist-title">');
      expect(g21).toContain('data-mode="table"');
      expect([...section.matchAll(/class="[^"]*\bpanel\b[^"]*"/g)], "data-issues 內沒有 .panel 套 .panel").toHaveLength(1);
      // 問題表沒有篩選（SSR 第一次渲染）：沒有篩選片語與清除鈕，下載鈕照舊。
      expect(section).not.toContain('data-testid="data-issues-filter"');
      expect(section).toContain('data-testid="data-issues-download"');
    }
  });

  it("示範資料與 golden：沒有任何問題時不渲染 G21（data-issues 的「沒有問題」不變），G20 標題＝title.none；資料來源頁主層獨立圖區塊＝1", () => {
    for (const source of [demo, golden]) {
      const html = page(source);
      const manifest = source.dataset.manifest, md = (iso: string) => formatDateL1(iso, { anchor: manifest.data_as_of });
      expect(html).not.toContain("chart-data-issues");
      expect(element(html, 'data-testid="data-issues"')).toContain(`<p class="data-section-empty">${dataPanel.noIssues}</p>`);
      expect(titleOf(html, "data-coverage")).toBe(fill(coverage.title.none, { start: md(manifest.coverage_start), end: md(manifest.coverage_end) }));
      expect(html).not.toContain(`data-testid="${"chart-data-coverage-seg-"}`);
      expect(mainSections(html)).toEqual(["chart-data-coverage"]);
    }
  });

  it("missing_ad_day：G20 標題用單日模板（沒有「8/2 到 8/2」）、G21 標題用單格模板（沒有「最多」）；一個缺列框、一個篩選按鈕、一格；主層獨立圖區塊＝2", () => {
    const html = page(adDay);
    const anchor = adDay.dataset.manifest.data_as_of, date = formatDateL1("2026-08-02", { anchor });
    const g20Title = titleOf(html, "data-coverage"), g21Title = titleOf(html, "data-issues-dist");
    expect(g20Title).toBe(fill(coverage.title.missingOneDay, { file: labels.importWizard.files.ads, date, channel: "MARKETPLACE" }));
    expect(g20Title).not.toContain(`${date} ${coverage.title.missing.split("{start} ")[1].split(" {end}")[0]} ${date}`);
    expect(g21Title).toBe(fill(issues.title.single, { file: labels.importWizard.files.ads, n: formatCount(1, "L2"), reason: issueReasonLabel("MISSING_AD_DAY") }));
    expect(g21Title).not.toContain(issues.title.most.split("{reason}")[1].split("，")[0]);
    expect([...html.matchAll(/data-testid="(chart-data-coverage-seg-[^"]+)"/g)].map(match => match[1])).toEqual(["chart-data-coverage-seg-ads-MARKETPLACE-2026-08-02"]);
    const table = element(html, 'data-testid="chart-data-coverage-table"');
    expect(table.match(/<button type="button" class="ui-btn ui-btn-text coverage-filter"/g)).toHaveLength(1);
    expect(table).toContain(`aria-label="${fill(coverage.filterName, { file: labels.importWizard.files.ads, channel: "MARKETPLACE" })}"`);
    expect([...html.matchAll(/data-testid="(chart-data-issues-cell-[^"]+)"/g)].map(match => match[1])).toEqual(["chart-data-issues-cell-ads-MISSING_AD_DAY"]);
    expect(mainSections(html)).toEqual(["chart-data-coverage", "chart-data-issues"]);
  });

  it("4 通路合成資料：G21 格加總＝列級問題筆數（issue-distribution-v1）；G20 三段缺列各一個缺列框與一個篩選按鈕（通路費用 LIVE 9/14、廣告 LIVE 8/30 與 9/22）", () => {
    const html = page(synthetic);
    const distribution = issueDistribution(synthetic.dataset.issues)!;
    const cells = [...element(html, 'data-testid="chart-data-issues-table"').matchAll(/data-testid="chart-data-issues-cell-[^"]+"><button type="button" class="heat-count" aria-label="[^"]*">([^<]+)<\/button>/g)].map(match => Number(match[1].replace(/,/g, "")));
    expect(cells.reduce((sum, value) => sum + value, 0)).toBe(distribution.rowLevel);
    expect(distribution.rowLevel).toBe(synthetic.dataset.issues.length);
    expect([...html.matchAll(/data-testid="(chart-data-coverage-seg-[^"]+)"/g)].map(match => match[1])).toEqual(["chart-data-coverage-seg-costs-LIVE-2026-09-14", "chart-data-coverage-seg-ads-LIVE-2026-08-30", "chart-data-coverage-seg-ads-LIVE-2026-09-22"]);
    expect(element(html, 'data-testid="chart-data-coverage-table"').match(/class="ui-btn ui-btn-text coverage-filter"/g)).toHaveLength(3);
    expect(mainSections(html)).toEqual(["chart-data-coverage", "chart-data-issues"]);
  });

  it("範圍級缺列（field $coverage、沒有日期）：G20 退回文字（state empty、rangeFallback，沒有 svg 與缺列框、資料表 0 列），G21 標題 title.rangeOnly（範圍級問題另成表尾一列）；主層獨立圖區塊＝2", async () => {
    const range = (file: "channel_costs_daily.csv" | "ad_spend_daily.csv", reason_code: string): ValidationIssue => ({ file, line: null, field: COVERAGE_RANGE_FIELD, severity: "partial", reason_code, message: "" });
    const dataset: Dataset = { ...golden.dataset, issues: [range("channel_costs_daily.csv", "MISSING_CHANNEL_COST_DAY"), range("ad_spend_daily.csv", "MISSING_AD_DAY")] };
    const html = page({ ...golden, dataset });
    const g20 = element(html, 'data-testid="chart-data-coverage"');
    expect(titleOf(html, "data-coverage")).toBe(coverage.title.range);
    expect(g20).toMatch(/class="chart-frame sm"[^>]*data-state="empty"/);
    expect(element(g20, 'class="chart-frame-message"')).toContain(coverage.rangeFallback);
    expect(g20).not.toContain("<svg");
    expect(g20).not.toContain("chart-data-coverage-seg-");
    expect(element(g20, 'data-testid="chart-data-coverage-table"')).not.toContain('<th scope="row">');
    expect(titleOf(html, "data-issues-dist")).toBe(fill(issues.title.rangeOnly, { n: formatCount(2, "L2") }));
    expect(element(html, 'data-testid="chart-data-issues"')).toContain(issues.rangeRow);
    expect(mainSections(html)).toEqual(["chart-data-coverage", "chart-data-issues"]);
  });
});

// V4-7b G22（CHART_CATALOG G22、PRD §4.2、§6.3 C24 pair、§8.7）：資料來源頁前處理表的換算值格（tr[data-field] 的第 3 格）在數字之前加成對條——
// 上 4px 含稅原值（rect.bar-cell-previous、chartColors.previous）、下 6px 換算值（rect.bar-cell-bar、chartColors.total）；整張表共用尺度＝含稅原值的 |值| 最大值、共用版面。
// 只呈現 TaxConversion.totals 既有的兩個值；條 aria-hidden、不可聚焦、不可點；含稅與未稅合計、稅率三格的文字不變（上方 V3-8 那條測試）。
describe("V4-7b G22 前處理表成對條", () => {
  const PAIR = /<svg class="bar-cell is-pair( is-signed)?" data-chart-kind="cell" data-testid="chart-data-preprocess-bar-([a-z_]+)" viewBox="0 0 96 12" width="96" height="12" preserveAspectRatio="none" aria-hidden="true" focusable="false">([\s\S]*?)<\/svg>/g;
  const rowOf = (section: string, field: string) => element(section, `<tr data-field="${field}"`);
  const rect = (className: string, bar: { x: number; y: number; width: number; height: number }, fillColor: string) => `<rect class="${className}" x="${bar.x}" y="${bar.y}" width="${bar.width}" height="${bar.height}" fill="${fillColor}"></rect>`;

  it("含稅匯入（inclusive_tax，8 欄）：每個換算欄位一條，在換算值格內、數字之前；上條含稅原值、下條換算值；共用尺度＝含稅原值最大值（原價收入 4,725.00 滿寬 96）", () => {
    const conversion = importedSource.conversion!;
    const section = element(page(importedSource), 'data-testid="data-preprocessing"');
    const pairs = [...section.matchAll(PAIR)];
    expect(pairs.map(match => match[2])).toEqual(conversion.fields);
    const totals = conversion.fields.map(field => conversion.totals![field]);
    const scale = barCellScale(totals.map(item => item.raw));
    expect(scale).toBe("4725");
    expect(barCellSigned(totals.flatMap(item => [item.raw, item.converted]))).toBe(false);
    for (const [, signed, field, inner] of pairs) {
      expect(signed, field).toBeUndefined();
      const { raw, converted } = conversion.totals![field];
      const geometry = barCellPairGeometry({ value: converted, previous: raw, max: scale, signed: false });
      // DOM：條在換算值格（第 3 格）內、數字之前；含稅合計格（第 2 格）與稅率格沒有條。
      const cells = [...rowOf(section, field).matchAll(/<td class="num">([\s\S]*?)<\/td>/g)].map(match => match[1]);
      expect(cells, field).toHaveLength(3);
      expect(cells[0], field).toBe(formatAmountL3(raw));
      expect(cells[1].startsWith("<svg "), `${field}：條在數字之前`).toBe(true);
      expect(cells[1].endsWith(`</svg>${formatAmountL3(converted)}`), field).toBe(true);
      expect(cells[2], field).toBe(formatRateL2(conversion.rate));
      if (geometry.previous.bar) expect(inner, field).toContain(rect("bar-cell-previous", geometry.previous.bar, chartColors.previous));
      else expect(inner, `${field}：原值 0 時沒有上條`).not.toContain("bar-cell-previous");
      if (geometry.value.bar) expect(inner, field).toContain(rect("bar-cell-bar", geometry.value.bar, chartColors.total));
      else expect(inner, `${field}：換算值 0 時沒有下條`).not.toContain('class="bar-cell-bar"');
      expect(inner, field).toContain(`<line class="bar-cell-zero" x1="${geometry.zeroLineX}" x2="${geometry.zeroLineX}"`);
      expect(inner, `${field}：不可聚焦`).not.toMatch(/tabindex|<button|<a\s/);
    }
    // 原價收入的含稅原值就是尺度：上條滿寬（96）、貼盒頂高 4；換算值 4,500.00 的下條 ＝ 4500 ÷ 4725 × 96。
    const gross = barCellPairGeometry({ value: "4500.00", previous: "4725.00", max: scale });
    expect(gross.previous.bar).toEqual({ x: 0, y: 0, width: 96, height: 4 });
    expect(gross.value.bar).toEqual({ x: 0, y: 6, width: 91.4, height: 6 });
    expect(section).not.toContain("is-clickable");
    expect(section.split("data-chart-kind").length - 1).toBe(conversion.fields.length);
  });

  it("有負值的欄（記憶體裡把退款合計改成負數）：整張表共用 signed 版面（每條都有 is-signed、零線在正中央）", () => {
    const conversion = importedSource.conversion!;
    const negative: TaxConversion = { ...conversion, totals: { ...conversion.totals!, refunds: { raw: "-126.00", converted: "-120.00" } } };
    const section = element(page({ ...importedSource, conversion: negative }), 'data-testid="data-preprocessing"');
    const pairs = [...section.matchAll(PAIR)];
    expect(pairs).toHaveLength(conversion.fields.length);
    for (const [, signed, field, inner] of pairs) {
      expect(signed, field).toBe(" is-signed");
      expect(inner, field).toContain('<line class="bar-cell-zero" x1="48" x2="48"');
    }
    const refunds = pairs.find(match => match[2] === "refunds")![3];
    const geometry = barCellPairGeometry({ value: "-120.00", previous: "-126.00", max: barCellScale(Object.values(negative.totals!).map(item => item.raw)), signed: true });
    expect(geometry.previous.direction).toBe("left");
    expect(refunds).toContain(rect("bar-cell-previous", geometry.previous.bar!, chartColors.previous));
    expect(refunds).toContain(rect("bar-cell-bar", geometry.value.bar!, chartColors.total));
  });

  it("未稅匯入（golden、示範資料）：沒有前處理表，也就沒有成對條", () => {
    for (const source of [golden, demo]) expect(page(source)).not.toContain("chart-data-preprocess-bar-");
  });
});
