import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { formatHeadlineAmount } from "@/application/copy";
import { formatAmountL1, formatAmountL3, formatGrowth, formatPercentNumber, formatPointsValue, formatRateL1, formatRateL3, formatSignedDelta, MINUS } from "@/application/presentation";
import { validateDataset } from "@/domain/validation";
import { EvidenceDrawer, type EvidenceSelection } from "@/components/evidence-drawer";
import { headlineChangeText, toneClass } from "@/components/manager-summary";
import { fill, labels } from "@/i18n";
import { expected, fixture } from "./helpers/fixtures";

// V3-2b（PRD §3.3、§7.8、§8.5）：一頁摘要、會議、試算、待辦、商品與「計算與來源」抽屜的層分配。
// 所有期望值都由格式化函式或手算的精確值產生；golden 數字（本期 255.00、差額 −315.00、試算 284.00／264.00／19.70）不改。

const metric = (value: string | null, reason_codes: string[] = []) => ({ value, reason_codes });

describe("一頁摘要的關鍵差額（L1 方向詞＋成長率）", () => {
  it("PRD §8.5 規則 1 的例子：−598,833.95 ÷ 1,868,626.68 →「少賺 59.9 萬（−32.0%）」，成長率從精確值一次取位", () => {
    const row = { metric: "contribution_after_marketing" as const, previous: metric("1868626.68"), current: metric("1269792.73"), change: metric("-598833.95") };
    expect(headlineChangeText(row)).toBe(`${labels.format.earnLess} 59.9 萬（${MINUS}32.0%）`);
    expect(headlineChangeText(row)).toBe(fill(labels.meeting.managerSummary.changePhraseGrowth, { word: labels.format.earnLess, amount: formatHeadlineAmount("-598833.95"), growth: formatGrowth("1269792.73", "1868626.68", "L1")! }));
  });

  it("golden 合計：淨營收多 220 元（+9.8%）、扣廣告後貢獻少賺 315 元（−55.3%）", () => {
    const golden = expected();
    expect(golden.current.contribution_after_marketing).toBe("255.00");
    const revenue = { metric: "net_revenue" as const, previous: metric(golden.previous.net_revenue), current: metric(golden.current.net_revenue), change: metric("220.00") };
    const contribution = { metric: "contribution_after_marketing" as const, previous: metric(golden.previous.contribution_after_marketing), current: metric(golden.current.contribution_after_marketing), change: metric("-315.00") };
    // 手算：220 ÷ 2,250 = 9.777…% → 9.8%；−315 ÷ 570 = −55.263…% → −55.3%。
    expect(headlineChangeText(revenue)).toBe(`${labels.format.more} 220 元（+9.8%）`);
    expect(headlineChangeText(contribution)).toBe(`${labels.format.earnLess} 315 元（${MINUS}55.3%）`);
  });

  it("上期 ≤ 0 不附成長率、差額為零只寫持平、缺值依原因碼寫資料待補", () => {
    expect(headlineChangeText({ metric: "contribution_after_marketing", previous: metric("-15.00"), current: metric("270.00"), change: metric("285.00") })).toBe(`${labels.format.turnedPositive} 285 元`);
    expect(headlineChangeText({ metric: "net_revenue", previous: metric("2470.00"), current: metric("2470.00"), change: metric("0.00") })).toBe(labels.format.flat);
    expect(headlineChangeText({ metric: "net_revenue", previous: metric(null, ["MISSING_COGS"]), current: metric("1.00"), change: metric(null, ["MISSING_COGS"]) })).toBe(labels.shell.status.missing);
  });

  it("顏色依有利／不利：貢獻減少是 negative，費用減少不是", () => {
    expect(toneClass("unfavorable")).toBe("negative");
    expect(toneClass("favorable")).toBe("positive");
    expect(toneClass("neutral")).toBe("neutral");
  });
});

describe("已經是百分數／百分點的值", () => {
  it("試算銷量門檻與假設：L1 一位小數、帶正負號、U+2212", () => {
    expect(formatPercentNumber("12.345678901234", "L1", { signed: true })).toBe("+12.3%");
    expect(formatPercentNumber("-90", "L2", { signed: true })).toBe(`${MINUS}90.0%`);
    expect(formatPercentNumber("0.000000000000", "L1", { signed: true })).toBe("0.0%");
    expect(formatPercentNumber("12.345", "L3")).toBe("12.35%");
    expect(formatPercentNumber(null, "L1")).toBe(labels.shell.status.missing);
  });

  it("總覽貢獻率差（百分點）：先精確除以 100，再依層取位", () => {
    // 手算：16.17% − 30.42% 的精確差 −14.251… 個百分點。
    expect(formatPointsValue("-14.251234", "L1")).toBe(fill(labels.format.units.pointsDown, { value: "14.3" }));
    expect(formatPointsValue("-14.251234", "L3")).toBe(fill(labels.format.units.points, { value: `${MINUS}14.25` }));
    expect(formatPointsValue("2.05", "L2")).toBe(fill(labels.format.units.points, { value: "+2.1" }));
  });
});

describe("計算與來源抽屜（§7.8）：L1 大數字＋到分的精確值行", () => {
  const dataset = validateDataset(fixture("golden")).dataset!;
  const period = { start: "2026-08-02", end: "2026-08-02" };
  const render = (evidence: EvidenceSelection) => renderToStaticMarkup(createElement(EvidenceDrawer, { dataset, evidence, onClose: () => undefined }));
  const precise = (html: string) => /data-testid="evidence-precise-value">([^<]*)</.exec(html)?.[1];
  const big = (html: string) => /<p class="number">([^<]*)</.exec(html)?.[1];

  it("金額：大字「127.0 萬」，下一行「1,269,792.73 元」", () => {
    const html = render({ title: "t", name: "contribution_after_marketing", metric: metric("1269792.73"), period, channels: ["DTC"], sources: [] });
    expect(big(html)).toBe(formatAmountL1("1269792.73"));
    expect(big(html)).toBe("127.0 萬");
    expect(precise(html)).toBe(fill(labels.format.units.yuan, { value: formatAmountL3("1269792.73") }));
    expect(precise(html)).toBe("1,269,792.73 元");
    expect(html).not.toContain('data-testid="evidence-rounding-note"');
  });

  it("比率：大字「16.2%」，精確值「16.17%」", () => {
    const html = render({ title: "t", name: "contribution_margin", metric: metric("0.161745000000"), period, channels: ["DTC"], sources: [] });
    expect(big(html)).toBe(formatRateL1("0.161745000000"));
    expect(precise(html)).toBe(formatRateL3("0.161745000000"));
    expect(precise(html)).toBe("16.17%");
  });

  it("差額：大字帶正負號（golden −315.00），組成到分、表頭標（元），技術細節附取位說明", () => {
    const html = render({ title: "t", name: "contribution_after_marketing", metric: metric("-315.00"), period, channels: ["DTC"], sources: [],
      formula: "f", components: [{ label: labels.shell.periods.previous, metric: metric("570.00") }, { label: labels.shell.periods.current, metric: metric("255.00") }] });
    expect(big(html)).toBe(`${MINUS}315 元`);
    expect(precise(html)).toBe(`${MINUS}315.00 元`);
    // V3-5（§7.8）：組成項目改成 14px 表格，「（元）」只標在欄頭（上期（元）／本期（元）／差額（元）），儲存格到分不帶單位。
    expect(html).toContain(`<th scope="col" class="num">${fill(labels.format.units.yuanColumn, { label: labels.shell.periods.current })}</th>`);
    expect(html).toContain(`<td class="num">${formatAmountL3("255.00")}</td>`);
    expect(html).toContain(`<td class="num">${formatSignedDelta("-315.00", "L3")}</td>`);
    expect(html).toContain(labels.format.roundingNote);
  });

  it("空值：大字依原因碼寫不適用，不顯示精確值行", () => {
    const html = render({ title: "t", name: "mer", metric: metric(null, ["NON_POSITIVE_DENOMINATOR"]), period, channels: ["DTC"], sources: [] });
    expect(big(html)).toBe(labels.shell.status.notApplicable);
    expect(precise(html)).toBeUndefined();
  });
});
