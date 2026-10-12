import { readFileSync } from "node:fs";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { fixture } from "./helpers/fixtures";
import { ISSUE_LIST_BASELINE_FILE, issueListBaseline } from "./helpers/issue-list-baseline";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";
import { validateDataset } from "@/domain/validation";
import type { ValidationIssue } from "@/domain/types";
import { downloadText } from "@/application/download";
import { exportIssuesCsv } from "@/application/export";
import { issueMessageParts, issueTemplate, sideFileIssueMessage } from "@/application/import";
import { filterIssues, hasIssueFilter, ISSUE_FILES, issueFileKey, issueFilterKey, issueFilterPhrase, issueReasonLabel, type IssueFilter } from "@/application/issue-filter";
import { formatCount } from "@/application/presentation";
import { parseTargets } from "@/application/targets";
import { IssueList, SideFileIssueList } from "@/components/issue-list";
import { fill, labels } from "@/i18n";

// V4-7a：「下載問題清單 CSV」只在按下時呼叫 downloadText；換成假的，確認篩選中仍下載全部問題（不碰瀏覽器 API）。
vi.mock("@/application/download", () => ({ downloadText: vi.fn(), downloadBinary: vi.fn() }));

// V3-8 資料問題表（PRD §7.7.1 第 3 點、§9.4 C3 資料表／C15 工具列）：欄位 檔案｜行號｜欄位｜問題｜修法｜原因碼；
// 問題＝V3-2a 的 L1（檔案與行號已是獨立欄，去掉「{file} 第 {line} 行：」前綴）、修法＝L2、原因碼＝L3（預設收合欄，hidden 但掛載，M1）。
// 匯入精靈步驟 4、錯誤狀態、目標與促銷檔期的錯誤清單都用這個元件，欄位一起改。

const v3 = labels.data.pageV3.issueTable;
const copy = labels.data.issues;
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const bytes = (text: string) => new TextEncoder().encode(text);
const missingCogs = () => validateDataset(fixture("errors/missing_cogs")).dataset!.issues;
const render = (props: Parameters<typeof IssueList>[0]) => renderToStaticMarkup(createElement(IssueList, props));
const headers = (html: string) => [...html.matchAll(/<th scope="col"([^>]*)>([^<]*)<\/th>/g)].map(match => ({ attrs: match[1], text: match[2] }));
const rows = (html: string) => [...html.matchAll(/<tr>(<td[\s\S]*?)<\/tr>/g)].map(match => [...match[1].matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)].map(cell => ({ attrs: cell[1], html: cell[2] })));
const text = (html: string) => html.replace(/<details>[\s\S]*?<\/details>/g, "").replace(/<[^>]+>/g, "");

describe("V3-8 資料問題表（IssueList）", () => {
  it("六欄表頭依序：檔案｜行號｜欄位｜問題｜修法｜原因碼；行號欄右對齊；原因碼欄預設 hidden 但掛載", () => {
    const html = render({ issues: missingCogs() });
    const head = headers(html);
    expect(head.map(cell => cell.text)).toEqual([v3.columns.file, v3.columns.line, v3.columns.field, v3.columns.problem, v3.columns.fix, v3.columns.code]);
    expect(head[1].attrs).toContain('class="num"');
    expect(head[5].attrs).toContain('hidden=""');
    for (const row of rows(html)) {
      expect(row).toHaveLength(6);
      expect(row[5].attrs).toContain('hidden=""');
      expect(row[5].html).toMatch(new RegExp(`^<details><summary>${escapeRe(copy.reasonCodeSummary)}</summary><code>[A-Z_]+</code></details>$`));
    }
    // v2 的 caption、region 與 tabindex 保留（caption 改成 sr-only：可見的標題與計數在區段標題列）。
    expect(html).toContain(`<div class="table-scroll" tabindex="0" role="region" aria-label="${copy.regionAria}">`);
    expect(html).toContain(`<caption class="sr-only">${fill(copy.caption, { n: 1 })}</caption>`);
    expect(html).toMatch(/<table class="ui-table issue-table" id="[^"]+">/);
  });

  it("問題欄是 L1 去掉位置前綴、修法欄是 L2、原因碼欄是 L3（issueMessageParts，不另拼句子）；檔名、行號、欄位 key 用等寬字", () => {
    const [issue] = missingCogs();
    const parts = issueMessageParts(issue);
    const prefix = fill(labels.errors.import.MISSING_COGS.slice(0, labels.errors.import.MISSING_COGS.indexOf("：") + 1), { file: issue.file, line: issue.line });
    expect(parts.headline.startsWith(prefix)).toBe(true);
    const [row] = rows(render({ issues: [issue] }));
    expect(row[0].html).toContain(`<span class="ui-mono">${issue.file}</span>`);
    expect(row[1]).toEqual({ attrs: ' class="num ui-mono"', html: String(issue.line) });
    expect(row[2].html).toBe(`<span class="ui-mono">${issue.field}</span>`);
    expect(row[3].html).toBe(`<span class="ui-lozenge" data-tone="warning" data-severity="partial">${copy.severity.partial}</span>${parts.headline.slice(prefix.length)}`);
    expect(row[4].html).toBe(parts.explain);
    expect(row[5].html).toContain(`<code>${parts.code}</code>`);
    // 去掉前綴後，主層仍是 V3-2a 的同一句話（L1 的剩餘部分＋L2），沒有 domain 的中文 message。
    expect(`${issue.file}${issue.line}${text(row[3].html).replace(copy.severity.partial, "")}`).toBe(`${issue.file}${issue.line}${parts.headline.slice(prefix.length)}`);
    expect(render({ issues: [issue] })).not.toContain(issue.message);
  });

  it("位置前綴含日期、通路等其他占位符時保留整句；嚴重程度用 C8 狀態標籤（阻擋＝不利色、待補＝警示色、提醒＝中性）", () => {
    const base = missingCogs()[0];
    const costDay: ValidationIssue = { file: "channel_costs_daily.csv", line: null, date: "2026-08-02", channel: "DTC", field: "$record", severity: "partial", reason_code: "MISSING_CHANNEL_COST_DAY", message: "domain" };
    const blocking: ValidationIssue = { ...base, severity: "blocking" };
    const warning: ValidationIssue = { ...base, severity: "warning" };
    const html = render({ issues: [costDay, blocking, warning] });
    const [cost, block, warn] = rows(html);
    expect(cost[1].html).toBe("");
    expect(text(cost[3].html)).toBe(`${copy.severity.partial}${issueMessageParts(costDay).headline}`);
    expect(cost[0].html).toContain("<small>2026-08-02 DTC</small>");
    expect(block[3].html).toContain(`<span class="ui-lozenge" data-tone="unfavorable" data-severity="blocking">${copy.severity.blocking}</span>`);
    expect(warn[3].html).toContain(`<span class="ui-lozenge" data-severity="warning">${copy.severity.warning}</span>`);
  });

  it("工具列：「顯示原因碼」切換（aria-pressed、aria-controls 指到表格）＋表頭右上角寫一次單位；「下載問題清單 CSV」只在給 download 時出現", () => {
    const issues = missingCogs();
    const plain = render({ issues });
    const tableId = /<table class="ui-table issue-table" id="([^"]+)">/.exec(plain)![1];
    expect(plain).toContain(`<button type="button" class="ui-btn ui-btn-text issue-codes-toggle" aria-pressed="false" aria-controls="${tableId}">${v3.showCodes}</button>`);
    expect(plain.split(v3.unit)).toHaveLength(2);
    expect(plain).not.toContain(labels.exports.downloads.issuesCsv);
    const withDownload = render({ issues, download: { filename: "profitlens-issues.csv", testId: "probe-download" } });
    expect(withDownload).toContain(`<button type="button" class="ui-btn ui-btn-secondary" data-testid="probe-download">${labels.exports.downloads.issuesCsv}</button>`);
    expect(withDownload.split(labels.exports.downloads.issuesCsv)).toHaveLength(2);
    // 工具列在表格之前（C15：工具列在表格上方）。
    expect(withDownload.indexOf(labels.exports.downloads.issuesCsv)).toBeLessThan(withDownload.indexOf("<table"));
    // 不給 testId 時不帶 data-testid（M6：同一頁可能同時掛兩份問題表）。
    expect(render({ issues, download: { filename: "x.csv" } })).toContain(`<button type="button" class="ui-btn ui-btn-secondary">${labels.exports.downloads.issuesCsv}</button>`);
  });

  it("實際檔名與標準檔名不同時，檔名下補標準檔名；欄位對照過的欄位補原欄位（既有 props 語意不變）", () => {
    const [issue] = missingCogs();
    const [row] = rows(render({ issues: [issue], filenames: { "sales_daily.csv": "=uploaded.csv" }, mappings: { "sales_daily.csv": { cogs_net: "商品成本" } } }));
    expect(row[0].html).toBe(`<span class="ui-mono">=uploaded.csv</span><small>${fill(copy.logicalFile, { file: issue.file })}</small><small>${issue.date} ${issue.channel}</small>`);
    expect(row[2].html).toBe(`<span class="ui-mono">${issue.field}</span><small>${fill(copy.originalColumn, { column: "商品成本" })}</small>`);
  });

  it("超過 50 項仍分頁：每頁 50 列、分頁狀態與上下頁按鈕沿用 v2", () => {
    const [issue] = missingCogs();
    const many = Array.from({ length: 120 }, (_, index) => ({ ...issue, line: index + 2 }));
    const html = render({ issues: many });
    expect(rows(html)).toHaveLength(50);
    expect(html).toContain(`<nav class="issue-pagination" aria-label="${copy.paginationAria}">`);
    expect(html).toContain(`<span>${fill(copy.pageStatus, { page: 1, pages: 3 })}</span>`);
    expect(html).toContain(`<caption class="sr-only">${fill(copy.caption, { n: 120 })}</caption>`);
    expect(render({ issues: many.slice(0, 50) })).not.toContain("issue-pagination");
  });

  it("選填檔（targets.csv）的錯誤用同一組欄位：去掉「targets.csv 第 n 行：」前綴、修法是句號後的說明、原因碼欄 hidden；沒有嚴重程度標籤", () => {
    const { issues } = parseTargets({ name: "targets.csv", bytes: bytes("period_start,period_end,channel,metric,target\n2026-08-01,2026-08-02,ALL,net_revenue,100.00\n2026-08-01,2026-08-02,ALL,bogus,100.00\n") }, ["DTC", "MARKETPLACE"]);
    expect(issues.map(issue => issue.reason_code)).toEqual(["INVALID_METRIC"]);
    const html = renderToStaticMarkup(createElement(SideFileIssueList, { file: "targets.csv", issues, regionLabel: fill(v3.sideRegionAria, { name: labels.targets.entry }) }));
    expect(html).toContain(`role="region" aria-label="${fill(v3.sideRegionAria, { name: labels.targets.entry })}"`);
    const [row] = rows(html);
    const message = sideFileIssueMessage("targets.csv", issues[0]);
    const prefix = `targets.csv 第 ${issues[0].line} 行：`;
    expect(message.startsWith(prefix)).toBe(true);
    const [headline, ...rest] = message.slice(prefix.length).split("。");
    expect(row.map(cell => cell.html.replace(/<[^>]+>/g, ""))).toEqual(["targets.csv", String(issues[0].line), "metric", headline, rest.join("。"), `${copy.reasonCodeSummary}INVALID_METRIC`]);
    expect(row[5].attrs).toContain('hidden=""');
    expect(html).not.toContain("ui-lozenge");
    expect(html).not.toContain(labels.exports.downloads.issuesCsv);
  });
});

// ── V4-7a 代理 B：問題表的選填篩選（PRD §6.4；CHART_CATALOG §7 開頭、G20、G21「單元測試」）——src/application/issue-filter.ts 與 IssueList 的 filter、onClearFilter。
const v4 = labels.data.chartsV4.issues;
const syntheticIssues = () => validateDataset(synthetic4ChannelInput()).dataset!.issues;
const adDayIssues = () => validateDataset(fixture("errors/missing_ad_day")).dataset!.issues;
const codesOf = (html: string) => rows(html).map(row => /<code>([A-Z_]+)<\/code>/.exec(row[5].html)![1]);
const filesOf = (html: string) => rows(html).map(row => /<span class="ui-mono">([^<]+)<\/span>/.exec(row[0].html)![1]);
const count = (value: number) => formatCount(value, "L2");
/** IssueList 本身沒有 hook：直接呼叫取得它渲染的表格元素與 props（items、onDownload、filter）。 */
type TableProps = { items: ValidationIssue[]; onDownload?: () => void; filter?: { key: string; phrase: string; onClear?: () => void } };
const tableOf = (props: Parameters<typeof IssueList>[0]) => (IssueList(props) as ReactElement<TableProps>).props;

describe("V4-7a 問題表篩選：沒給 filter 時逐字不變", () => {
  it("以 V4-7a 開工錨點（e905189）產生的基準逐字比對（資料問題表的各種輸入、選填檔錯誤清單）", () => {
    const expected = JSON.parse(readFileSync(ISSUE_LIST_BASELINE_FILE, "utf8")) as Record<string, string>;
    const actual = issueListBaseline();
    expect(Object.keys(actual)).toEqual(Object.keys(expected));
    for (const key of Object.keys(expected)) expect(actual[key], key).toBe(expected[key]);
  });

  it("filter 為 null、空物件，或只給 onClearFilter 時，輸出與沒給相同（沒有篩選列）", () => {
    const expected = JSON.parse(readFileSync(ISSUE_LIST_BASELINE_FILE, "utf8")) as Record<string, string>;
    const props = { issues: syntheticIssues(), download: { filename: "profitlens-issues.csv", testId: "data-issues-download" } };
    for (const extra of [{ filter: null }, { filter: {} }, { onClearFilter: () => undefined }, { filter: {}, onClearFilter: () => undefined }]) {
      expect(render({ ...props, ...extra }), JSON.stringify(Object.keys(extra))).toBe(expected["synthetic-4-channel download"]);
    }
  });
});

describe("V4-7a issue-filter（純函式）", () => {
  it("三份核心 CSV 的固定順序與短名（sales、costs、ads；與 G20、G21 的 testid 相同）；manifest.json 沒有短名", () => {
    expect(ISSUE_FILES.map(entry => [entry.file, entry.key])).toEqual([["sales_daily.csv", "sales"], ["channel_costs_daily.csv", "costs"], ["ad_spend_daily.csv", "ads"]]);
    expect(issueFileKey("ad_spend_daily.csv")).toBe("ads");
    expect(issueFileKey("manifest.json")).toBeNull();
  });

  it("hasIssueFilter、issueFilterKey：null、undefined、空物件都是沒有篩選（鍵為空字串）；同一組條件同一個鍵", () => {
    for (const none of [null, undefined, {}]) {
      expect(hasIssueFilter(none)).toBe(false);
      expect(issueFilterKey(none)).toBe("");
    }
    const filter: IssueFilter = { file: "ad_spend_daily.csv", channel: "LIVE", reason: "MISSING_AD_DAY" };
    expect(hasIssueFilter(filter)).toBe(true);
    expect(issueFilterKey({ ...filter })).toBe(issueFilterKey(filter));
    expect(issueFilterKey({ file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" })).not.toBe(issueFilterKey(filter));
    expect(issueFilterKey({ channel: "LIVE" })).not.toBe(issueFilterKey({ reason: "LIVE" }));
  });

  it("filterIssues：檔案、通路、原因碼同時成立；順序不變、逐筆沿用；沒有篩選時回傳複本", () => {
    const issues = syntheticIssues();
    expect(filterIssues(issues, null)).toEqual(issues);
    expect(filterIssues(issues, null)).not.toBe(issues);
    const ads = filterIssues(issues, { file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" });
    expect(ads).toHaveLength(5);
    expect(ads.every(issue => issue.file === "ad_spend_daily.csv" && issue.reason_code === "MISSING_AD_DAY")).toBe(true);
    expect(ads.map(issue => issue.date)).toEqual(["2026-08-30", "2026-08-31", "2026-09-01", "2026-09-02", "2026-09-22"]);
    expect(ads[0]).toBe(issues.find(issue => issue.file === "ad_spend_daily.csv"));
    expect(filterIssues(issues, { file: "channel_costs_daily.csv", channel: "LIVE" })).toHaveLength(6);
    expect(filterIssues(issues, { reason: "MISSING_AD_DAY" })).toHaveLength(5);
    expect(filterIssues(issues, { file: "ad_spend_daily.csv", reason: "MISSING_CHANNEL_COST_DAY" })).toEqual([]);
    expect(filterIssues(issues, { channel: "DTC" })).toEqual([]);
    // G20 缺列段：missing_ad_day 缺 2026-08-02 MARKETPLACE 的廣告列。
    expect(filterIssues(adDayIssues(), { file: "ad_spend_daily.csv", channel: "MARKETPLACE", reason: "MISSING_AD_DAY" })).toHaveLength(1);
  });

  it("issueReasonLabel：缺列兩種與略過的欄位取 data.chartsV4.issues.reasons；其餘取 errors.import 的 L1 去掉位置前綴；仍有占位符或沒有樣板時退回原因碼", () => {
    for (const code of ["MISSING_CHANNEL_COST_DAY", "MISSING_AD_DAY", "UNKNOWN_COLUMN_IGNORED"]) expect(issueReasonLabel(code)).toBe(v4.reasons[code]);
    // 匯入後可能出現在資料集的列級原因碼（待補的空白欄位）：全部有短名（沒有占位符、不是原因碼本身），且等於問題表「問題」欄的同一句。
    for (const code of ["MISSING_COGS", "MISSING_GROSS_SALES", "MISSING_DISCOUNTS", "MISSING_REFUNDS", "MISSING_PLATFORM_FEES", "MISSING_PAYMENT_FEES", "MISSING_FULFILLMENT_COSTS", "MISSING_OTHER_VARIABLE_COSTS", "MISSING_AD_SPEND", "MISSING_UNITS_SOLD"]) {
      const headline = issueTemplate(code)!.headline;
      expect(headline.startsWith("{file} 第 {line} 行："), code).toBe(true);
      expect(issueReasonLabel(code), code).toBe(headline.slice("{file} 第 {line} 行：".length));
      expect(issueReasonLabel(code), code).not.toMatch(/[{}]|^[A-Z_]+$/);
    }
    expect(issueReasonLabel("SALES_COVERAGE_UNCONFIRMED")).toBe(issueTemplate("SALES_COVERAGE_UNCONFIRMED")!.headline);
    expect(issueReasonLabel("INVALID_AMOUNT")).toBe("INVALID_AMOUNT");
    expect(issueReasonLabel("INVALID_MANIFEST")).toBe("INVALID_MANIFEST");
    expect(issueReasonLabel("NOT_A_CODE")).toBe("NOT_A_CODE");
  });

  it("issueFilterPhrase：「篩選：檔案角色名 · 通路 · 原因名（n 項）」，只列給了的條件；沒有篩選時為 null", () => {
    const sep = labels.data.pageV3.separator;
    expect(issueFilterPhrase(null, 3)).toBeNull();
    expect(issueFilterPhrase({}, 3)).toBeNull();
    expect(issueFilterPhrase({ file: "ad_spend_daily.csv", channel: "LIVE", reason: "MISSING_AD_DAY" }, 5)).toBe(fill(v4.filter.phrase, { scope: [labels.importWizard.files.ads, "LIVE", v4.reasons.MISSING_AD_DAY].join(sep), n: count(5) }));
    expect(issueFilterPhrase({ file: "channel_costs_daily.csv", reason: "MISSING_CHANNEL_COST_DAY" }, 6)).toBe(fill(v4.filter.phrase, { scope: [labels.importWizard.files.costs, v4.reasons.MISSING_CHANNEL_COST_DAY].join(sep), n: count(6) }));
    expect(issueFilterPhrase({ channel: "LIVE" }, 1234)).toBe(fill(v4.filter.phrase, { scope: "LIVE", n: count(1234) }));
  });
});

describe("V4-7a IssueList 的 filter、onClearFilter", () => {
  const filter: IssueFilter = { file: "ad_spend_daily.csv", reason: "MISSING_AD_DAY" };
  const download = { filename: "profitlens-issues.csv", testId: "data-issues-download" };

  it("篩選中：表只列符合的問題（caption 的筆數跟著變）；工具列之下、表之上有 role=status 的篩選片語（可程式聚焦）與「清除篩選」鈕；下載鈕照舊", () => {
    const html = render({ issues: syntheticIssues(), filter, onClearFilter: () => undefined, download });
    expect(rows(html)).toHaveLength(5);
    expect(filesOf(html).every(file => file === "ad_spend_daily.csv")).toBe(true);
    expect(codesOf(html).every(code => code === "MISSING_AD_DAY")).toBe(true);
    expect(html).toContain(`<caption class="sr-only">${fill(copy.caption, { n: 5 })}</caption>`);
    const phrase = issueFilterPhrase(filter, 5)!;
    expect(html).toContain(`<div class="issue-filter"><p class="issue-filter-phrase" role="status" tabindex="-1" data-testid="data-issues-filter">${phrase}</p><button type="button" class="ui-btn ui-btn-secondary issue-filter-clear" data-testid="data-issues-filter-clear">${labels.overview.trendYoyV3.filter.clear}</button></div>`);
    const at = (needle: string) => html.indexOf(needle);
    expect(at("issue-toolbar")).toBeLessThan(at('class="issue-filter"'));
    expect(at('class="issue-filter"')).toBeLessThan(at('class="table-scroll"'));
    expect(html).toContain(`data-testid="data-issues-download">${labels.exports.downloads.issuesCsv}</button>`);
  });

  it("G20 缺列段的篩選（檔案＋通路＋原因碼）：missing_ad_day 只剩 2026-08-02 MARKETPLACE 那一列；沒給 onClearFilter 時只有片語、沒有清除鈕", () => {
    const html = render({ issues: adDayIssues(), filter: { file: "ad_spend_daily.csv", channel: "MARKETPLACE", reason: "MISSING_AD_DAY" } });
    expect(rows(html)).toHaveLength(1);
    expect(rows(html)[0][0].html).toContain("<small>2026-08-02 MARKETPLACE</small>");
    expect(html).toContain('data-testid="data-issues-filter"');
    expect(html).not.toContain("data-issues-filter-clear");
    // 沒有符合的問題時表是空的、片語寫 0 項（不改成「沒有問題」狀態）。
    const none = render({ issues: adDayIssues(), filter: { channel: "DTC" } });
    expect(rows(none)).toHaveLength(0);
    expect(none).toContain(issueFilterPhrase({ channel: "DTC" }, 0)!);
  });

  it("清除：表格元件收到的 onClear 就是 onClearFilter（按下後呼叫一次）；沒有篩選時表格元件沒有 filter、items 是原陣列", () => {
    const issues = syntheticIssues();
    const onClearFilter = vi.fn();
    const filtered = tableOf({ issues, filter, onClearFilter });
    expect(filtered.items).toHaveLength(5);
    expect(filtered.filter).toEqual({ key: issueFilterKey(filter), phrase: issueFilterPhrase(filter, 5), onClear: onClearFilter });
    filtered.filter!.onClear!();
    expect(onClearFilter).toHaveBeenCalledTimes(1);
    const plain = tableOf({ issues });
    expect(plain.filter).toBeUndefined();
    expect(plain.items).toBe(issues);
  });

  it("「下載問題清單 CSV」在篩選中仍是全部問題：與沒有篩選時同一份內容（exportIssuesCsv(全部 issues, filenames)）、同一個檔名", () => {
    const issues = syntheticIssues();
    const filenames = { "ad_spend_daily.csv": "ads-upload.csv" } as const;
    const mock = vi.mocked(downloadText);
    mock.mockClear();
    tableOf({ issues, filenames, download, filter, onClearFilter: () => undefined }).onDownload!();
    tableOf({ issues, filenames, download }).onDownload!();
    expect(mock).toHaveBeenCalledTimes(2);
    const [withFilter, without] = mock.mock.calls;
    expect(withFilter).toEqual(without);
    expect(withFilter).toEqual([exportIssuesCsv(issues, filenames), download.filename]);
    // 全部 11 項（表頭 1 列＋11 列），不是篩選後的 5 項。
    expect(withFilter[0].trim().split(/\r?\n/)).toHaveLength(1 + 11);
  });
});
