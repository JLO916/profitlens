import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import type { ValidationIssue } from "@/domain/types";
import { issueMessageParts, sideFileIssueMessage } from "@/application/import";
import { parseTargets } from "@/application/targets";
import { IssueList, SideFileIssueList } from "@/components/issue-list";
import { fill, labels } from "@/i18n";

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
