import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { DAILY_HEATMAP_VERSION, type HeatValueCell } from "../src/application/chart-heatmap";
import { channelLabel, demoAlias } from "../src/application/copy";
import { applyEvidenceFilter, evidenceFilterError, evidenceFilterText, scopedEvidenceFilter } from "../src/application/evidence-filter";
import { evidenceRows, formatDateL1, type EvidenceRow } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { heatCellEvidence, heatSectionModel } from "../src/components/diagnosis/heat-section";
import { EvidenceDrawer, type EvidenceSelection } from "../src/components/evidence-drawer";
import type { Dataset, DatasetInput } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, escapeAttr } from "./helpers/markup";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

// V4-3b 代理 E（合併後才能寫的 SSR 測試；06_BATCHES V4-3b「驗收重點」：熱表格開當日抽屜、篩選片語含日期、原始明細每列日期等於該日；filter.sku 下沒有通路費用與廣告列）。
// 代理 A 的 G11 格證據（heatCellEvidence：filter { channel, date }、arrangeVersion daily-heatmap-v1）接上代理 B 的下鑽篩選（EvidenceFilter.date、sku，applyEvidenceFilter、
// scopedEvidenceFilter、evidenceFilterText）與抽屜：篩選只過濾原始明細、不重算；每一格都驗，不挑樣本。

const noop = () => undefined;
const filterCopy = labels.overview.trendYoyV3.filter;
async function load(input: DatasetInput): Promise<{ dataset: Dataset; snapshot: WorkspaceSnapshot }> {
  const dataset = validateDataset(input).dataset!;
  return { dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}
let demo: Awaited<ReturnType<typeof load>>;
let synthetic: Awaited<ReturnType<typeof load>>;
beforeAll(async () => { demo = await load(fixture("demo")); synthetic = await load(synthetic4ChannelInput()); });

/** 每一格（期間外以外）與它的證據；示範資料 2 通路 × 42 天、合成資料 4 通路 × 17 天。 */
function cellsOf(snapshot: WorkspaceSnapshot): { channel: string; cell: HeatValueCell; evidence: EvidenceSelection }[] {
  const heatmap = heatSectionModel(snapshot).result.heatmap!;
  return heatmap.channels.flatMap(channel => channel.rows.flatMap(row => row.cells.flatMap(cell => cell.kind === "value" ? [{ channel: channel.channel, cell, evidence: heatCellEvidence(heatmap, channel.channel, row, cell) }] : [])));
}
const key = (row: EvidenceRow) => JSON.stringify([row.file, row.line, row.date, row.channel, row.sku]);
const dataRows = (rows: readonly EvidenceRow[]) => rows.filter(row => row.file !== "manifest.json");
const render = (dataset: Dataset, snapshot: WorkspaceSnapshot, evidence: EvidenceSelection) => renderToStaticMarkup(createElement(EvidenceDrawer, { dataset, snapshot, evidence, onClose: noop, onBasis: noop }));
const tabs = (html: string) => [...element(html, 'class="source-tabs')!.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map(match => match[1]);
const dates = (html: string) => [...element(html, 'class="source-table"')!.matchAll(/class="evidence-date"[^>]*>([^<]*)<\/td>/g)].map(match => match[1]);
const tabText = (tab: keyof typeof labels.evidence.sourceTabs, n: number) => fill(labels.evidence.drawer.tabWithCount, { tab: labels.evidence.sourceTabs[tab], n });

describe("G11 格的證據 × 下鑽篩選（合併後）", () => {
  it("每一格：filter＝{ channel, date }（沒有 sku，scopedEvidenceFilter 原樣回傳）；套在本期全部來源列上＝該格自己的來源列（逐列相同、不重算）；每列日期等於該日、通路等於該通路；manifest 列保留", () => {
    for (const { dataset, snapshot } of [demo, synthetic]) {
      const all = evidenceRows(dataset, snapshot.report.current.sources);
      const cells = cellsOf(snapshot);
      expect(cells.length, `${snapshot.report.dataset_id}：格數＝通路數 × 天數`).toBe(heatSectionModel(snapshot).result.heatmap!.cellCount);
      for (const { channel, cell, evidence } of cells) {
        const label = `${snapshot.report.dataset_id} ${channel} ${cell.key}`;
        expect(evidence.filter, label).toEqual({ channel, date: cell.key });
        expect(evidenceFilterError(evidence), label).toBeNull();
        expect(scopedEvidenceFilter(evidence), label).toBe(evidence.filter);
        const filtered = applyEvidenceFilter(all, scopedEvidenceFilter(evidence));
        expect(filtered.filter(row => row.file === "manifest.json"), `${label}：manifest 列保留`).toHaveLength(all.filter(row => row.file === "manifest.json").length);
        const data = dataRows(filtered);
        expect(data.filter(row => row.date !== cell.key || row.channel !== channel), `${label}：每列日期等於該日、通路等於該通路`).toEqual([]);
        expect(data.map(key).sort(), `${label}：＝該格自己的來源列`).toEqual(dataRows(evidenceRows(dataset, cell.sources)).map(key).sort());
        if (cell.metric.value !== null) expect(data.length, `${label}：有值的格至少一列來源`).toBeGreaterThan(0);
      }
    }
  });

  it("抽屜（SSR，示範資料標題所指的 MARKETPLACE 8/22）：片語「篩選：日期 8/22 · 平台 · MARKETPLACE」；原始明細每列日期等於該日；分段筆數是篩選後的列；metric_version contribution-v1 之後另列 daily-heatmap-v1；不畫全通路階梯", () => {
    const { dataset, snapshot } = demo;
    const heatmap = heatSectionModel(snapshot).result.heatmap!;
    const headline = heatmap.headline!;
    const target = cellsOf(snapshot).find(item => item.channel === headline.channel && item.cell.key === headline.key)!;
    expect([target.channel, target.cell.key]).toEqual(["MARKETPLACE", "2026-08-22"]);
    const html = render(dataset, snapshot, target.evidence);
    const alias = demoAlias(snapshot.report.dataset_id);
    const anchor = snapshot.data_as_of;
    const phrase = evidenceFilterText(target.evidence.filter, { alias, anchor })!;
    expect(phrase).toBe(fill(filterCopy.phrase, { scope: [fill(labels.evidence.chartsV4.filter.date, { date: formatDateL1("2026-08-22", { anchor }) }), channelLabel("MARKETPLACE", alias)].join(filterCopy.joiner) }));
    expect(byTestId(html, "evidence-filter")).toContain(`<span>${escapeAttr(phrase)}</span>`);
    expect(dates(html).length).toBeGreaterThan(0);
    expect(dates(html).filter(value => value !== "2026-08-22")).toEqual([]);
    const filtered = applyEvidenceFilter(evidenceRows(dataset, snapshot.report.current.sources), target.evidence.filter);
    const count = (file: string) => filtered.filter(row => row.file === file).length;
    expect(tabs(html)).toEqual([tabText("sales", count("sales_daily.csv")), tabText("costs", count("channel_costs_daily.csv")), tabText("ads", count("ad_spend_daily.csv"))].filter((_, index) => [count("sales_daily.csv"), count("channel_costs_daily.csv"), count("ad_spend_daily.csv")][index] > 0));
    expect(count("channel_costs_daily.csv"), "通路費用列（當天該通路）").toBeGreaterThan(0);
    expect(count("ad_spend_daily.csv"), "廣告列（當天該通路）").toBeGreaterThan(0);
    expect(byTestId(html, "evidence-arrange-version")).toContain(`<code>${DAILY_HEATMAP_VERSION}</code>`);
    expect(html).toContain("contribution-v1");
    expect(html, "單日單一通路的證據不畫全通路階梯").not.toContain("ladder-table");
  });

  it("filter.sku：熱表格的證據（通路層，沒有 evidence.sku）帶 sku 是用錯——抽屜拿掉 sku，通路費用與廣告列照常；同一天同一通路的商品層證據帶 { channel, date, sku } 時只剩該商品當天的銷售列，沒有通路費用與廣告列", () => {
    const { dataset, snapshot } = demo;
    const all = evidenceRows(dataset, snapshot.report.current.sources);
    const target = cellsOf(snapshot).find(item => item.channel === "MARKETPLACE" && item.cell.key === "2026-08-22")!;
    const sku = dataRows(evidenceRows(dataset, target.cell.sources)).find(row => row.file === "sales_daily.csv" && row.sku !== undefined)!.sku!;
    // 用錯：通路層證據帶 sku。
    const misuse: EvidenceSelection = { ...target.evidence, filter: { ...target.evidence.filter, sku } };
    expect(evidenceFilterError(misuse)).toBe("skuWithoutProductEvidence");
    expect(scopedEvidenceFilter(misuse)).toEqual({ channel: "MARKETPLACE", date: "2026-08-22" });
    const scoped = dataRows(applyEvidenceFilter(all, scopedEvidenceFilter(misuse)));
    expect(scoped.map(key).sort(), "拿掉 sku 後＝該格自己的來源列").toEqual(dataRows(evidenceRows(dataset, target.cell.sources)).map(key).sort());
    const misuseHtml = render(dataset, snapshot, misuse);
    expect(misuseHtml).not.toContain(escapeAttr(fill(labels.evidence.chartsV4.filter.sku, { sku })));
    expect(tabs(misuseHtml).some(tab => tab.startsWith(labels.evidence.sourceTabs.costs)), "用錯時通路費用列照常").toBe(true);
    expect(tabs(misuseHtml).some(tab => tab.startsWith(labels.evidence.sourceTabs.ads)), "用錯時廣告列照常").toBe(true);
    // 正確：商品層證據（evidence.sku 相同）。
    const product: EvidenceSelection = { ...target.evidence, sku, filter: { channel: "MARKETPLACE", date: "2026-08-22", sku } };
    expect(evidenceFilterError(product)).toBeNull();
    const rows = dataRows(applyEvidenceFilter(all, scopedEvidenceFilter(product)));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter(row => row.file !== "sales_daily.csv" || row.sku !== sku || row.date !== "2026-08-22" || row.channel !== "MARKETPLACE"), "只剩該商品當天的銷售列").toEqual([]);
    const html = render(dataset, snapshot, product);
    expect(tabs(html)).toEqual([tabText("sales", rows.length)]);
    expect(byTestId(html, "evidence-filter")).toContain(escapeAttr(fill(labels.evidence.chartsV4.filter.sku, { sku })));
    expect(dates(html).filter(value => value !== "2026-08-22")).toEqual([]);
  });
});
