import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { checkChartMarkup } from "../scripts/lib/chart-scan.mjs";
import { CHANNEL_FEE_FIELDS, CHANNEL_STRUCTURE_MAX, CHANNEL_STRUCTURE_SM_MAX, CHANNEL_STRUCTURE_TOTAL_KEY, CHANNEL_STRUCTURE_VERSION, channelStructure } from "../src/application/chart-structure";
import { chartColors, chartHeights } from "../src/application/chart-theme";
import { channelLabel, channelsLabel, demoAlias } from "../src/application/copy";
import { formatAmountL2, formatPeriodL1, metricDefinitions } from "../src/application/presentation";
import { profitWaterfall } from "../src/application/waterfall";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { shareSectionModel, shareSegmentEvidence, ShareSection, shareStackRows, SHARE_TABLE_COLUMNS, shareTableEvidence } from "../src/components/diagnosis/share-section";
import { shareStackGeometry, SHARE_STACK_SEGMENTS } from "../src/components/charts/share-stack";
import { Diagnosis } from "../src/components/workspace-panels";
import { parseCents } from "../src/domain/money";
import type { DatasetInput, Summary } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { byTestId, element, escapeAttr, openTag, textOf } from "./helpers/markup";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

/*
 * V4-3a 代理 A：G10 每 100 元淨營收去向的 B 級整理函式 channelStructure（channel-structure-v1）與 G10 區塊（PRD §4.3 G10、§6.4；CHART_CATALOG G10、§9.2；D-V4-15）。
 * 手算 golden（fixtures/golden 本期 2026-08-02，每列算式寫在旁邊）；示範資料、refund_only、zero_ad 與 4 通路合成資料的對帳點；
 * 各通路的「剩」與三段比率必須和 profitWaterfall(snapshot, channel) 逐字相同（A 級，不另寫一套）。
 */

type Loaded = { snapshot: WorkspaceSnapshot };
async function load(input: DatasetInput): Promise<Loaded> {
  const dataset = validateDataset(input).dataset!;
  return { snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}
let golden: Loaded, demo: Loaded, refundOnly: Loaded, zeroAd: Loaded, synthetic: Loaded;
beforeAll(async () => {
  [golden, demo, refundOnly, zeroAd, synthetic] = await Promise.all([load(fixture("golden")), load(fixture("demo")), load(fixture("refund_only")), load(fixture("zero_ad")), load(synthetic4ChannelInput())]);
});
const share = labels.diagnosis.chartsV4.share;
const noop = () => undefined;
const rowOf = (snapshot: WorkspaceSnapshot, channel: string | null) => {
  const structure = channelStructure(snapshot);
  return channel === null ? structure.total : structure.rows.find(row => row.channel === channel)!;
};
const cents = (value: string | null) => parseCents(value);
/** 七段（商品成本、四項費用、廣告投放費、扣廣告後貢獻）的到分加總，與淨營收比較（比照 waterfall.ts 的三個恆等式）。 */
function sevenSegments(summary: Summary): { sum: bigint; net: bigint } {
  const m = summary.metrics;
  const parts = [m.cogs_net, ...CHANNEL_FEE_FIELDS.map(field => m[field]), m.ad_spend, m.contribution_after_marketing].map(metric => cents(metric.value)!);
  return { sum: parts.reduce((total, part) => total + part, 0n), net: cents(m.net_revenue.value)! };
}
const section = (snapshot: WorkspaceSnapshot) => renderToStaticMarkup(createElement(ShareSection, { snapshot, onEvidence: noop }));
/** 用既有通路的 Summary 複製出 n 個通路（只在記憶體中組成，不寫檔）；只給 G10 的通路數分支用（sm、lg、超過 8）。 */
function cloned(snapshot: WorkspaceSnapshot, count: number): WorkspaceSnapshot {
  const source = snapshot.report.current.channels.DTC;
  const channels = Array.from({ length: count }, (_, index) => `C${String(index + 1).padStart(2, "0")}`);
  return { ...snapshot, report: { ...snapshot.report, scope: { ...snapshot.report.scope, channels }, current: { ...snapshot.report.current, channels: Object.fromEntries(channels.map(channel => [channel, source])) } } };
}

describe("channelStructure：版本與手算 golden（fixtures/golden 本期 8/2）", () => {
  it("版本常數 channel-structure-v1；列＝report.scope.channels 的順序，另有一列合計（鍵 total）", () => {
    const structure = channelStructure(golden.snapshot);
    expect(CHANNEL_STRUCTURE_VERSION).toBe("channel-structure-v1");
    expect(structure.version).toBe(CHANNEL_STRUCTURE_VERSION);
    expect(structure.period).toBe("current");
    expect(structure.rows.map(row => row.key)).toEqual(["DTC", "MARKETPLACE"]);
    expect(structure.total.key).toBe(CHANNEL_STRUCTURE_TOTAL_KEY);
    expect(structure.total.channel).toBeNull();
    expect(structure.total.channels).toEqual(golden.snapshot.report.scope.channels);
    expect(CHANNEL_FEE_FIELDS).toEqual(["platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs"]);
  });

  it("四項費用合計、佔淨營收比與每 100 元（手算）", () => {
    const dtc = rowOf(golden.snapshot, "DTC"), marketplace = rowOf(golden.snapshot, "MARKETPLACE"), total = rowOf(golden.snapshot, null);
    // DTC：平台抽成 0.00＋金流 44.00＋物流 140.00＋其他 16.00＝200.00；200 ÷ 1480＝0.135135135135…；× 100＝13.51… → 13.5
    expect(dtc.fees).toEqual({ value: "200.00", reason_codes: [] });
    expect(dtc.feesShare.value).toBe("0.135135135135");
    expect(dtc.feesPerHundred).toBe("13.5");
    // MARKETPLACE：120.00＋22.00＋85.00＋13.00＝240.00；240 ÷ 990＝0.242424242424…；× 100＝24.24… → 24.2
    expect(marketplace.fees).toEqual({ value: "240.00", reason_codes: [] });
    expect(marketplace.feesShare.value).toBe("0.242424242424");
    expect(marketplace.feesPerHundred).toBe("24.2");
    // 合計：120＋66＋225＋29＝440.00；440 ÷ 2470＝0.178137651821862… → 0.178137651822；× 100＝17.81… → 17.8
    expect(total.fees).toEqual({ value: "440.00", reason_codes: [] });
    expect(total.feesShare.value).toBe("0.178137651822");
    expect(total.feesPerHundred).toBe("17.8");
    // 組成：四項各自的值（抽屜的組成項目）。
    expect(dtc.feeItems).toEqual([
      { field: "platform_fees", metric: { value: "0.00", reason_codes: [] } }, { field: "payment_fees", metric: { value: "44.00", reason_codes: [] } },
      { field: "fulfillment_costs", metric: { value: "140.00", reason_codes: [] } }, { field: "other_variable_costs", metric: { value: "16.00", reason_codes: [] } },
    ]);
  });

  it("超過 100 的幾何：MARKETPLACE 扣廣告後貢獻 −15.00，扣項合計 585＋240＋180＝1005 ÷ 990＝1.015151515152，超過的部分 15 ÷ 990＝0.015151515152；x 軸上限取它", () => {
    const dtc = rowOf(golden.snapshot, "DTC"), marketplace = rowOf(golden.snapshot, "MARKETPLACE"), total = rowOf(golden.snapshot, null);
    expect(golden.snapshot.report.current.channels.MARKETPLACE.metrics.contribution_after_marketing.value).toBe("-15.00");
    expect(marketplace.deductionsShare.value).toBe("1.015151515152");
    expect(marketplace.overShare).toBe("0.015151515152");
    // DTC：740＋200＋270＝1210 ÷ 1480＝0.817567567567567… → 0.817567567568，沒有超過。
    expect(dtc.deductionsShare.value).toBe("0.817567567568");
    expect(dtc.overShare).toBe("0.000000000000");
    // 合計：1325＋440＋450＝2215 ÷ 2470＝0.896761133603…，沒有超過。
    expect(total.deductionsShare.value).toBe("0.896761133603");
    expect(total.overShare).toBe("0.000000000000");
    expect(channelStructure(golden.snapshot).axisMax).toBe("1.015151515152");
    for (const row of [dtc, marketplace, total]) expect(row.status, row.key).toBe("ready");
  });

  it("七段恆等（到分）：商品成本＋四項費用＋廣告投放費＋扣廣告後貢獻＝淨營收（golden 與示範資料，每個通路與合計）", () => {
    for (const { snapshot } of [golden, demo]) {
      const { current } = snapshot.report;
      for (const channel of snapshot.report.scope.channels) {
        const { sum, net } = sevenSegments(current.channels[channel]);
        expect(sum, channel).toBe(net);
        expect(rowOf(snapshot, channel).identity, channel).toBe(true);
      }
      const { sum, net } = sevenSegments(current);
      expect(sum).toBe(net);
      expect(rowOf(snapshot, null).identity).toBe(true);
    }
    // 示範資料的四項費用合計（到分）：DTC 0.00＋77,615.73＋52,768.00＋19,403.93；MARKETPLACE 555,782.03＋79,397.47＋94,806.00＋19,849.36；合計是 report.current.metrics 的四項相加。
    expect(rowOf(demo.snapshot, "DTC").fees.value).toBe("149787.66");
    expect(rowOf(demo.snapshot, "MARKETPLACE").fees.value).toBe("749834.86");
    expect(rowOf(demo.snapshot, null).fees.value).toBe("899622.52");
    expect(rowOf(demo.snapshot, "MARKETPLACE").overShare).toBe("0.015408541833");
    expect(channelStructure(demo.snapshot).axisMax).toBe("1.015408541833");
  });

  it("來源只有通路費用檔與 manifest（四項費用合計的抽屜原始明細）", () => {
    for (const row of [rowOf(golden.snapshot, "DTC"), rowOf(golden.snapshot, null)]) {
      expect(row.sources.length, row.key).toBeGreaterThan(0);
      for (const source of row.sources) expect(["channel_costs_daily.csv", "manifest.json"], row.key).toContain(source.file);
    }
  });

  it("不做「其他」合併、不跨規則加總（X38）：列數＝範圍內的通路數＋1，合計列直接是 report.current.metrics 的四項相加", () => {
    for (const { snapshot } of [golden, demo, synthetic]) {
      const structure = channelStructure(snapshot);
      expect(structure.rows.map(row => row.key)).toEqual(snapshot.report.scope.channels);
      const metrics = snapshot.report.current.metrics;
      const four = CHANNEL_FEE_FIELDS.map(field => metrics[field].value);
      if (four.every(value => value !== null)) expect(cents(structure.total.fees.value)).toBe(four.reduce((total, value) => total + cents(value)!, 0n));
      else expect(structure.total.fees.value).toBeNull();
    }
    const html = section(demo.snapshot);
    expect(html).not.toContain(`>${labels.overview.channelsV3.other}<`);
  });
});

describe("G10 的「剩」與段比率直接用 profitWaterfall（A 級，逐字相同）", () => {
  it("每通路的剩＝profitWaterfall(snapshot, channel).perHundred；商品成本、廣告費、扣廣告後貢獻三段比率＝rows[].share；合計列＝profitWaterfall(snapshot, \"all\")", () => {
    for (const { snapshot } of [golden, demo, zeroAd, synthetic]) {
      const model = shareSectionModel(snapshot);
      for (const row of model.rows) {
        const waterfall = profitWaterfall(snapshot, row.channel ?? "all");
        const shareOf = (metric: string) => waterfall.rows.find(item => item.metric === metric)!.share;
        expect(row.perHundred, row.key).toBe(waterfall.perHundred);
        expect(row.shares, row.key).toEqual({ cogs: shareOf("cogs_net"), ad: shareOf("ad_spend"), remain: shareOf("contribution_after_marketing") });
      }
      // ShareStack 的輸入沿用同一組字串（cogs、ad、remain 來自 profitWaterfall；fees、over 來自 channelStructure）。
      shareStackRows(model).forEach((input, index) => {
        const row = model.rows[index];
        expect([input.cogs, input.ad, input.remain], row.key).toEqual([row.shares.cogs, row.shares.ad, row.shares.remain]);
        expect([input.fees, input.over], row.key).toEqual([row.structure.feesShare.value, row.structure.overShare]);
      });
    }
  });

  it("合計列的剩：示範 16.2、golden 10.3（與 G2 的 overview.profit 標題同一個值）", () => {
    const total = (snapshot: WorkspaceSnapshot) => shareSectionModel(snapshot).rows.at(-1)!;
    expect(total(demo.snapshot).perHundred).toBe("16.2");
    expect(total(golden.snapshot).perHundred).toBe("10.3");
    expect(total(demo.snapshot).total).toBe(true);
    expect(total(demo.snapshot).label).toBe(labels.overview.sections.total);
  });
});

describe("G10 標題與副標（PRD §4.2 G10）", () => {
  it("有虧損通路：取每 100 元虧最多的通路（示範 MARKETPLACE 虧 1.5 元；4 通路合成資料 MARKETPLACE 虧 8.5 元）", () => {
    const alias = demoAlias(demo.snapshot.report.dataset_id);
    const model = shareSectionModel(demo.snapshot);
    expect(model.titleKind).toBe("loss");
    expect(model.title).toBe(fill(share.title.loss, { channel: channelLabel("MARKETPLACE", alias), n: "1.5" }));
    expect(shareSectionModel(golden.snapshot).title).toBe(fill(share.title.loss, { channel: "MARKETPLACE", n: "1.5" }));
    expect(shareSectionModel(synthetic.snapshot).title).toBe(fill(share.title.loss, { channel: "MARKETPLACE", n: "8.5" }));
  });

  it("沒有虧損：取剩最少的通路（zero_ad：MARKETPLACE 剩 16.7 元，DTC 36.5）；同值依通路代碼", () => {
    const model = shareSectionModel(zeroAd.snapshot);
    expect(model.titleKind).toBe("least");
    expect(model.title).toBe(fill(share.title.least, { channel: "MARKETPLACE", n: "16.7" }));
    const { snapshot } = golden;
    const tie: WorkspaceSnapshot = { ...snapshot, report: { ...snapshot.report, current: { ...snapshot.report.current, channels: { ...snapshot.report.current.channels, MARKETPLACE: snapshot.report.current.channels.DTC } } } };
    expect(shareSectionModel(tie).title).toBe(fill(share.title.least, { channel: "DTC", n: "18.2" }));
  });

  it("副標＝標準名 · 本期 · 範圍；有不適用的通路時接一句原因（4 通路合成資料：SOCIAL 平台抽成沖回 −2,160.00）", () => {
    const { snapshot } = demo;
    const alias = demoAlias(snapshot.report.dataset_id);
    const { period } = snapshot.report.current;
    const base = fill(share.subtitle, { section: share.section, period: formatPeriodL1(period.start, period.end, { days: false, anchor: snapshot.data_as_of }), scope: channelsLabel(snapshot.report.scope.channels, alias) });
    expect(shareSectionModel(snapshot).subtitle).toBe(base);
    const model = shareSectionModel(synthetic.snapshot);
    expect(model.notApplicable).toEqual(["SOCIAL"]);
    expect(rowOf(synthetic.snapshot, "SOCIAL").reasons).toEqual(["negativeDeduction"]);
    expect(model.subtitle.endsWith(fill(share.subtitleNote, { subtitle: "", channels: "SOCIAL" }))).toBe(true);
  });
});

describe("refund_only、zero_ad、4 通路合成資料的退回規則（PRD §7.4）", () => {
  it("refund_only：淨營收 −100.00、商品成本 −40.00 沖回，改文字列「不適用」；標題用 title.notApplicable，副標說明原因；沒有任何段", () => {
    const dtc = rowOf(refundOnly.snapshot, "DTC");
    expect(dtc.status).toBe("notApplicable");
    expect(dtc.reasons).toEqual(["negativeDeduction", "nonPositiveRevenue"]);
    expect(dtc.overShare).toBeNull();
    expect(dtc.feesShare).toEqual({ value: null, reason_codes: ["NON_POSITIVE_DENOMINATOR"] });
    expect(dtc.feesPerHundred).toBeNull();
    const model = shareSectionModel(refundOnly.snapshot);
    expect(model.titleKind).toBe("notApplicable");
    expect(model.title).toBe(share.title.notApplicable);
    expect(model.notApplicable).toEqual(["DTC"]);
    expect(model.subtitle).toContain(fill(share.subtitleNote, { subtitle: "", channels: "DTC" }).slice(1));
    const html = section(refundOnly.snapshot);
    expect(html).toContain(`<h2 id="share-title">${escapeAttr(share.title.notApplicable)}</h2>`);
    expect(html).not.toContain("chart-diagnosis-share-seg-");
    expect(html.match(new RegExp(`<text class="chart-value share-status"[^>]*>${labels.shell.status.notApplicable}</text>`, "g"))).toHaveLength(2);
    // 資料表照列（通路＋合計），每 100 元寫不適用。
    const table = byTestId(html, "chart-diagnosis-share-table");
    expect(table.match(/<tr>/g)).toHaveLength(1 + 2);
    expect(textOf(table)).toContain(labels.shell.status.notApplicable);
  });

  it("zero_ad：廣告段寬 0（rect 照樣輸出、看不到），資料表的廣告投放費照列 0", () => {
    const model = shareSectionModel(zeroAd.snapshot);
    const geometry = shareStackGeometry(shareStackRows(model), { width: 1122, axisMax: model.structure.axisMax });
    for (const row of geometry.rows) expect(row.segments.find(segment => segment.segment === "ad")!.width, row.key).toBe(0);
    const html = section(zeroAd.snapshot);
    expect(openTag(html, 'data-testid="chart-diagnosis-share-seg-DTC-ad"')).toContain('width="0"');
    const table = byTestId(html, "chart-diagnosis-share-table");
    expect(table).toContain(`>${formatAmountL2("0.00")}</button>`);
  });

  it("4 通路合成資料：LIVE 缺列寫「資料待補」、SOCIAL 扣項為負寫「不適用」、合計因 LIVE 缺值也是資料待補；DTC、MARKETPLACE 照畫", () => {
    const structure = channelStructure(synthetic.snapshot);
    expect(structure.rows.map(row => [row.key, row.status])).toEqual([["DTC", "ready"], ["LIVE", "missing"], ["MARKETPLACE", "ready"], ["SOCIAL", "notApplicable"]]);
    expect(structure.total.status).toBe("missing");
    expect(structure.rows[1].identity).toBeNull();
    // MARKETPLACE 本期扣廣告後貢獻 −5,200.00 ÷ 淨營收 61,100.00：超過 100 的部分 0.085106382979。
    expect(structure.rows[2].overShare).toBe("0.085106382979");
    expect(structure.axisMax).toBe("1.085106382979");
    const html = section(synthetic.snapshot);
    expect(byTestId(html, "chart-diagnosis-share-seg-MARKETPLACE-over")).toBeTruthy();
    expect(html).not.toContain("chart-diagnosis-share-seg-LIVE-");
    expect(html).not.toContain("chart-diagnosis-share-seg-SOCIAL-");
    expect(html).not.toContain("chart-diagnosis-share-seg-total-");
    expect(html).toContain(`>${labels.shell.status.missing}</text>`);
    expect(html).toContain(`>${labels.shell.status.notApplicable}</text>`);
  });
});

describe("G10 區塊（SSR）：ChartFrame、段、資料表與抽屜 builder", () => {
  it("示範資料：chart-diagnosis-share 是 section.chart-section，標題是結論句、副標是 aria 描述；固定高 sm（2 通路）且 aria-hidden；圖例 4 項（剩餘是空心框）", () => {
    const html = section(demo.snapshot);
    const model = shareSectionModel(demo.snapshot);
    expect(openTag(html, 'data-testid="chart-diagnosis-share"')).toBe(`<section class="panel chart-section share-section" aria-labelledby="share-title" aria-describedby="share-sub" data-testid="chart-diagnosis-share">`);
    expect(html).toContain(`<h2 id="share-title">${escapeAttr(model.title)}</h2>`);
    expect(html).toContain(`<p class="sub" id="share-sub">${escapeAttr(model.subtitle)}</p>`);
    expect(openTag(html, 'class="chart-frame')).toBe(`<div class="chart-frame sm" style="height:${chartHeights.sm}px" aria-hidden="true" data-state="ready">`);
    const legend = element(html, 'class="legend"')!;
    expect(textOf(legend)).toBe([metricDefinitions.cogs_net.label, share.feesTitle, metricDefinitions.ad_spend.shortLabel, share.segments.remain].join(""));
    expect(legend).toContain('data-shape="rect"');
    expect(legend).toContain(`style="background:${chartColors.seg1}"`);
  });

  it("示範資料 MARKETPLACE 超過 100 照常畫：…-seg-MARKETPLACE-over 填不利色，三段在 100 截斷；DTC 有剩餘段（空心框 chartColors.total）；右端標「剩／虧 n 元」", () => {
    const html = section(demo.snapshot);
    const over = openTag(html, 'data-testid="chart-diagnosis-share-seg-MARKETPLACE-over"')!;
    expect(over).toContain(`fill="${chartColors.unfavorable}"`);
    expect(over).toContain(`stroke="${chartColors.surface}"`);
    expect(html).not.toContain('data-testid="chart-diagnosis-share-seg-MARKETPLACE-remain"');
    const remain = openTag(html, 'data-testid="chart-diagnosis-share-seg-DTC-remain"')!;
    expect(remain).toContain('fill="none"');
    expect(remain).toContain(`stroke="${chartColors.total}"`);
    for (const [segment, color] of [["cogs", chartColors.seg1], ["fees", chartColors.seg2], ["ad", chartColors.seg3]] as const) expect(openTag(html, `data-testid="chart-diagnosis-share-seg-DTC-${segment}"`), segment).toContain(`fill="${color}"`);
    expect(html).toContain(`>${fill(share.loss, { n: "1.5" })}</text>`);
    expect(html).toContain(`>${fill(share.remain, { n: "34.3" })}</text>`);
    expect(html).toContain(`>${fill(share.remain, { n: "16.2" })}</text>`);
    // 每個段都在 aria-hidden 的固定高容器內、沒有 tabindex 與按鈕。
    const frame = element(html, 'class="chart-frame sm"')!;
    expect(frame.match(/data-testid="chart-diagnosis-share-seg-[^"]+"/g)).toHaveLength(html.match(/data-testid="chart-diagnosis-share-seg-[^"]+"/g)!.length);
    expect(frame).not.toMatch(/tabindex|<button|<a\b/i);
  });

  it("資料表 chart-diagnosis-share-table：列數＝通路數＋1（合計）；欄名取 metricDefinitions（加「（元）」），四項合計寫「通路費用合計」；金額 L2 number-link", () => {
    const html = section(demo.snapshot);
    const details = element(html, 'class="data-alternative"')!;
    expect(details).toContain(`<summary>${fill(labels.overview.page.dataTable, { title: share.section })}</summary>`);
    const table = byTestId(html, "chart-diagnosis-share-table");
    expect(table.match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr>/g)).toHaveLength(demo.snapshot.report.scope.channels.length + 1);
    const heads = [...element(table, "<thead")!.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(match => textOf(match[1]));
    const yuan = (label: string) => fill(labels.format.units.yuanColumn, { label });
    expect(heads).toEqual([labels.overview.channelsV3.table.channel, ...["net_revenue", "cogs_net", ...CHANNEL_FEE_FIELDS].map(name => yuan(metricDefinitions[name as keyof typeof metricDefinitions].label)), yuan(share.feesTitle), yuan(metricDefinitions.ad_spend.label), yuan(metricDefinitions.contribution_after_marketing.label), share.columns.perHundred]);
    expect(heads.join("")).not.toContain("平台費");
    // 每 100 元：剩／虧 n 元也是 number-link（D-V4-32＝A）。
    expect(table).toContain(`>${fill(share.loss, { n: "1.5" })}</button>`);
    expect(table.match(/class="number-link"/g)).toHaveLength((demo.snapshot.report.scope.channels.length + 1) * SHARE_TABLE_COLUMNS.length);
  });

  it("同一個 builder（PRD §2.2 C7）：段的點擊與同欄資料表格的 number-link 回傳相同的 EvidenceSelection（剩餘與超過 100 的部分都開扣廣告後貢獻）", () => {
    const column = (key: string) => SHARE_TABLE_COLUMNS.find(item => item.key === key)!;
    const columnOf = { cogs: "cogs_net", fees: "fees", ad: "ad_spend", remain: "contribution_after_marketing", over: "contribution_after_marketing" } as const;
    for (const { snapshot } of [golden, demo]) {
      for (const row of shareSectionModel(snapshot).rows) {
        for (const segment of SHARE_STACK_SEGMENTS) expect(shareSegmentEvidence(snapshot, row, segment), `${row.key}-${segment}`).toEqual(shareTableEvidence(snapshot, row, column(columnOf[segment])));
      }
    }
    // 通路列帶 filter.channel；合計列是範圍內全部通路、沒有篩選。
    const [dtc, , total] = shareSectionModel(golden.snapshot).rows;
    expect(shareSegmentEvidence(golden.snapshot, dtc, "cogs").filter).toEqual({ channel: "DTC" });
    expect(shareSegmentEvidence(golden.snapshot, dtc, "fees").filter).toEqual({ channel: "DTC" });
    expect(shareSegmentEvidence(golden.snapshot, total, "cogs")).toEqual({ name: "cogs_net", metric: golden.snapshot.report.current.metrics.cogs_net, period: golden.snapshot.report.current.period, sources: golden.snapshot.report.current.sources, channels: golden.snapshot.report.scope.channels, title: metricDefinitions.cogs_net.label });
    expect(shareSegmentEvidence(golden.snapshot, total, "fees").filter).toBeUndefined();
  });

  it("四項費用段的證據：水準值、channel-structure-v1、自帶標題與定義；每 100 元：unitOverride percent、值是 domain 的扣廣告後貢獻率（不加版本）", () => {
    const [dtc] = shareSectionModel(golden.snapshot).rows;
    const fees = shareSegmentEvidence(golden.snapshot, dtc, "fees");
    expect(fees).toMatchObject({ title: share.feesTitle, name: "platform_fees", metric: { value: "200.00", reason_codes: [] }, valueKind: "level", metricVersion: CHANNEL_STRUCTURE_VERSION, definition: share.feesDefinition, formulaTechnical: share.feesTechnical, channels: ["DTC"] });
    expect(fees.components!.map(component => component.label)).toEqual(CHANNEL_FEE_FIELDS.map(field => metricDefinitions[field].label));
    const perHundred = shareTableEvidence(golden.snapshot, dtc, SHARE_TABLE_COLUMNS.at(-1)!);
    expect(perHundred).toMatchObject({ name: "contribution_margin", metric: golden.snapshot.report.current.channels.DTC.metrics.contribution_margin, unitOverride: "percent", valueKind: "level", channels: ["DTC"], filter: { channel: "DTC" } });
    expect(perHundred.metricVersion).toBeUndefined();
    expect(perHundred.components).toEqual([{ label: metricDefinitions.contribution_after_marketing.label, metric: { value: "270.00", reason_codes: [] } }, { label: metricDefinitions.net_revenue.label, metric: { value: "1480.00", reason_codes: [] } }]);
  });
});

describe("G10 通路數分支（PRD §4.4：≤ 5 用 sm、6 到 8 用 lg、超過 8 只留表）", () => {
  it("5 通路 sm、6 與 8 通路 lg、9 通路 state=empty（lg）：沒有任何段，message 指向資料表與通路寬表，資料表照列", () => {
    expect(CHANNEL_STRUCTURE_SM_MAX).toBe(5);
    expect(CHANNEL_STRUCTURE_MAX).toBe(8);
    const frame = (count: number) => openTag(section(cloned(golden.snapshot, count)), 'class="chart-frame')!;
    expect(frame(5)).toContain('class="chart-frame sm"');
    expect(frame(6)).toContain('class="chart-frame lg"');
    expect(frame(8)).toContain('class="chart-frame lg"');
    const many = section(cloned(golden.snapshot, 9));
    expect(openTag(many, 'class="chart-frame')).toBe(`<div class="chart-frame lg" style="height:${chartHeights.lg}px" data-state="empty">`);
    expect(many).not.toContain("chart-diagnosis-share-seg-");
    expect(many).not.toContain('class="legend"');
    expect(many).toContain(`<p class="chart-frame-message">${escapeAttr(fill(share.tooMany, { count: 9, n: CHANNEL_STRUCTURE_MAX }))}</p>`);
    expect(byTestId(many, "chart-diagnosis-share-table").match(/<tbody>[\s\S]*<\/tbody>/)![0].match(/<tr>/g)).toHaveLength(10);
  });
});

describe("健檢頁 SSR（CL-1、CL-2、CL-9、CL-11）：G10 在清單之後、通路寬表之前，主層獨立圖區塊＝2（V4-3b 起加 G11）", () => {
  it("示範與 golden：chart-lint SSR 規則 0 違規；主層 section.chart-section 是 chart-diagnosis-share、chart-diagnosis-heat；DOM 順序 diagnosis-list → G10 → channel-compare", () => {
    for (const { snapshot } of [demo, golden, refundOnly]) {
      const html = renderToStaticMarkup(createElement(Diagnosis, { snapshot, onEvidence: noop }));
      const result = checkChartMarkup(`<main id="main-content">${html}</main>`, { page: "diagnosis" });
      for (const rule of ["CL-1", "CL-2", "CL-9", "CL-11"] as const) expect(result.violations[rule], rule).toEqual([]);
      // V4-3b：G11 熱表（chart-diagnosis-heat）接在 G10 之後，主層獨立圖區塊＝2（G12 在 <details> 內不計）。
      expect(result.mainSections).toEqual(["chart-diagnosis-share", "chart-diagnosis-heat"]);
      const list = html.indexOf('data-testid="diagnosis-list"'), g10 = html.indexOf('data-testid="chart-diagnosis-share"'), table = html.indexOf('data-testid="channel-compare"');
      expect(list).toBeGreaterThanOrEqual(0);
      expect(g10).toBeGreaterThan(list);
      expect(table).toBeGreaterThan(g10);
      expect(html.split('data-testid="chart-diagnosis-share"').length - 1).toBe(1);
      expect(html.split('data-testid="chart-diagnosis-share-table"').length - 1).toBe(1);
    }
  });
});
