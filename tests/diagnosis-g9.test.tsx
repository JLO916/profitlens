import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { checkChartMarkup, SSR_RULES } from "../scripts/lib/chart-scan.mjs";
import { chartColors } from "../src/application/chart-theme";
import { diagnosisGroups, type DiagnosisGroup } from "../src/application/diagnosis-group";
import { buildManagerSummary } from "../src/application/manager-summary";
import { deltaTone, formatSignedDelta } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { barCellFill, barCellGeometry, BAR_CELL_HEIGHT, BAR_CELL_WIDTH } from "../src/components/charts/bar-cell";
import { DiagnosisList, hasImpactBar, IMPACT_BAR_RULES, IMPACT_BAR_TOTAL_RULE, impactBarScale, impactBarTestId } from "../src/components/diagnosis-list";
import { Diagnosis } from "../src/components/workspace-panels";
import type { DatasetInput, RuleCode } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";
import { element, openTag, textOf } from "./helpers/markup";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

// V4-3a 代理 C：G9 健檢清單內嵌影響金額條（PRD §4.1–§4.7 G9、§7.2、§7.8 X38；CHART_CATALOG G9「單元測試」欄）的 SSR 結構測試。
// 只對差額類規則（REV_UP_CM_DOWN＋四個費用負擔規則）畫 C24 variance 條；水準類（NEGATIVE_CHANNEL_CM、SKU_NEGATIVE_GP）、資料缺漏與金額未知的列不畫、
// 也不參與共用尺度；REV_UP_CM_DOWN 是總差額，畫空心條，清單下方一行 diagnosis.chartsV4.impact.totalNote；費用規則影響為正（比率升、金額降）照有利色往右畫；
// 門檻刻度依 importance_threshold（0 時與零線重疊、不畫）；條在 <summary> 的影響金額之後、aria-hidden、不可聚焦、不另設點擊（PRD §4.5 G9）；不做跨規則加總（X38）。
// 期待值一律由 diagnosisGroups、barCellGeometry、barCellFill、deltaTone 算出；示範資料的數字見 docs/revamp-v4/CHART_CATALOG.md G9。

const noop = () => undefined;
const DIFFERENCE_RULES: RuleCode[] = ["REV_UP_CM_DOWN", "DISCOUNT_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "MARKETING_BURDEN_UP"];
const LEVEL_RULES: RuleCode[] = ["NEGATIVE_CHANNEL_CM", "SKU_NEGATIVE_GP"];
const EMPTY_SLOT = '<span class="impact-bar is-empty" aria-hidden="true"></span>';
const HEX = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})(?![\w-])/i;

async function load(input: DatasetInput): Promise<WorkspaceSnapshot> {
  return createSnapshot(validateDataset(input).dataset!, {}, await hashInput(input));
}
type Name = "golden" | "demo" | "refundOnly" | "zeroAd" | "missingCogs" | "synthetic";
const snapshots = {} as Record<Name, WorkspaceSnapshot>;
beforeAll(async () => {
  Object.assign(snapshots, {
    golden: await load(fixture("golden")), demo: await load(fixture("demo")), refundOnly: await load(fixture("refund_only")),
    zeroAd: await load(fixture("zero_ad")), missingCogs: await load(fixture("errors/missing_cogs")), synthetic: await load(synthetic4ChannelInput()),
  });
});

const render = (snapshot: WorkspaceSnapshot, props: { groups?: DiagnosisGroup[]; importanceThreshold?: string } = {}) => renderToStaticMarkup(createElement(DiagnosisList, { snapshot, onEvidence: noop, ...props }));
/** 開始標籤的屬性（只取第一個元素）。 */
const attrs = (html: string) => Object.fromEntries([...html.slice(0, html.indexOf(">")).matchAll(/\s([\w-]+)="([^"]*)"/g)].map(match => [match[1], match[2]]));
const rowOf = (html: string, rule: RuleCode) => element(html, `data-testid="diagnosis-row-${rule}"`)!;
const summaryOf = (html: string, rule: RuleCode) => element(rowOf(html, rule), "<summary")!;
const impactOf = (html: string, rule: RuleCode) => element(summaryOf(html, rule), 'class="diagnosis-impact"')!;
const barOf = (html: string, rule: RuleCode) => element(html, `data-testid="${impactBarTestId(rule)}"`);
const barCount = (html: string) => (html.match(/data-testid="chart-diagnosis-impact-bar-/g) ?? []).length;
/** 預期的條：差額類、不是缺漏、金額已知。 */
const barred = (groups: readonly DiagnosisGroup[]) => groups.filter(group => DIFFERENCE_RULES.includes(group.rule) && !group.missing && group.impact_cents !== null);

describe("G9 規則分類與共用尺度（純函式）", () => {
  it("畫條的規則恰好是差額類五條；總差額規則是 REV_UP_CM_DOWN；水準類與資料缺漏不畫", () => {
    expect([...IMPACT_BAR_RULES].sort()).toEqual([...DIFFERENCE_RULES].sort());
    expect(IMPACT_BAR_TOTAL_RULE).toBe("REV_UP_CM_DOWN");
    for (const rule of LEVEL_RULES) expect(hasImpactBar({ rule, missing: false, impact_cents: "-100.00" }), rule).toBe(false);
    expect(hasImpactBar({ rule: "MISSING_CRITICAL_DATA", missing: true, impact_cents: null })).toBe(false);
    expect(hasImpactBar({ rule: "DISCOUNT_BURDEN_UP", missing: false, impact_cents: null })).toBe(false);
    expect(hasImpactBar({ rule: "DISCOUNT_BURDEN_UP", missing: false, impact_cents: "0.00" })).toBe(true);
    expect(impactBarTestId("REV_UP_CM_DOWN")).toBe("chart-diagnosis-impact-bar-REV_UP_CM_DOWN");
  });

  it("共用尺度只取差額類列的 |影響| 最大值：示範 1,188,365.10（折扣）、golden 315（總差額）；水準類的金額再大也不參與", () => {
    expect(impactBarScale(diagnosisGroups(snapshots.demo).groups)).toBe("1188365.1");
    expect(impactBarScale(diagnosisGroups(snapshots.golden).groups)).toBe("315");
    const groups = diagnosisGroups(snapshots.golden).groups.map(group => group.rule === "NEGATIVE_CHANNEL_CM" ? { ...group, impact_cents: "-100000.00" } : group);
    expect(impactBarScale(groups)).toBe("315");
    expect(impactBarScale(diagnosisGroups(snapshots.refundOnly).groups)).toBeNull();
  });
});

describe("G9 SSR：條在哪些列、放在哪裡", () => {
  it("示範資料：差額類五列各一條（NEGATIVE_CHANNEL_CM 沒有，留同寬空位）；條數＝差額類有金額的 group 數；testid 整份清單唯一", () => {
    const html = render(snapshots.demo);
    const groups = diagnosisGroups(snapshots.demo).groups;
    expect(groups.map(group => group.rule)).toEqual(["DISCOUNT_BURDEN_UP", "REV_UP_CM_DOWN", "MARKETING_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "NEGATIVE_CHANNEL_CM"]);
    expect(barCount(html)).toBe(barred(groups).length);
    expect(barCount(html)).toBe(5);
    for (const group of barred(groups)) expect(html.split(`data-testid="${impactBarTestId(group.rule)}"`), group.rule).toHaveLength(2);
    expect(barOf(html, "NEGATIVE_CHANNEL_CM")).toBeNull();
    expect(impactOf(html, "NEGATIVE_CHANNEL_CM")).toContain(EMPTY_SLOT);
    expect(html).toContain('data-testid="diagnosis-list" aria-label="');
    expect(openTag(html, 'data-testid="diagnosis-list"')).toContain('data-impact-bars=""');
  });

  it("每條在該列 <summary> 的 span.diagnosis-impact 內、影響金額（.impact-amount）之後；根 svg aria-hidden、data-chart-kind=\"cell\"、不可聚焦、不另設點擊；summary 仍沒有互動元件", () => {
    const html = render(snapshots.demo);
    for (const group of barred(diagnosisGroups(snapshots.demo).groups)) {
      const impact = impactOf(html, group.rule);
      const svg = barOf(impact, group.rule)!;
      expect(svg, group.rule).not.toBeNull();
      expect(impact.indexOf('class="impact-amount')).toBeLessThan(impact.indexOf("<svg"));
      expect(impact.endsWith(`${svg}</span>`), group.rule).toBe(true);
      expect(attrs(svg), group.rule).toMatchObject({ "aria-hidden": "true", "data-chart-kind": "cell", focusable: "false", viewBox: `0 0 ${BAR_CELL_WIDTH} ${BAR_CELL_HEIGHT}` });
      expect(attrs(svg).class, group.rule).toMatch(/^bar-cell is-variance( is-outline)? impact-bar$/);
      expect(svg, group.rule).not.toMatch(/tabindex|is-clickable/i);
      expect(summaryOf(html, group.rule), group.rule).not.toMatch(/<button|<a\s|<input|<select|<details|tabindex/i);
    }
  });

  it("條的幾何＝barCellGeometry（共用尺度、REV_UP_CM_DOWN 空心）；色與同列影響金額同一個判斷（deltaTone L1）；實心條中最寬的是 |影響| 最大的費用負擔規則", () => {
    for (const name of ["demo", "golden", "zeroAd", "missingCogs", "synthetic"] as const) {
      const snapshot = snapshots[name];
      const html = render(snapshot);
      const groups = diagnosisGroups(snapshot).groups;
      const max = impactBarScale(groups);
      const solid: { rule: RuleCode; width: number; magnitude: number }[] = [];
      for (const group of barred(groups)) {
        const outline = group.rule === "REV_UP_CM_DOWN";
        const geometry = barCellGeometry({ mode: "variance", value: group.impact_cents, max, outline });
        const tone = deltaTone("contribution_after_marketing", group.impact_cents, "L1");
        const svg = barOf(html, group.rule)!;
        expect(attrs(svg)["data-tone"], `${name} ${group.rule}`).toBe(tone);
        const rect = attrs(element(svg, 'class="bar-cell-bar"')!);
        const box = outline ? geometry.outline! : geometry.bar!;
        expect(rect, `${name} ${group.rule}`).toMatchObject({ x: String(box.x), y: String(box.y), width: String(box.width), height: String(box.height) });
        if (outline) expect(rect, name).toMatchObject({ fill: "none", stroke: barCellFill(tone), "stroke-width": "2" });
        else { expect(rect.fill, `${name} ${group.rule}`).toBe(barCellFill(tone)); solid.push({ rule: group.rule, width: geometry.bar!.width, magnitude: Math.abs(Number(group.impact_cents)) }); }
        expect(geometry.direction, `${name} ${group.rule}`).toBe(group.impact_cents!.startsWith("-") ? "left" : "right");
      }
      if (solid.length) {
        const widest = solid.reduce((top, item) => item.width > top.width ? item : top);
        expect(widest.magnitude, name).toBe(Math.max(...solid.map(item => item.magnitude)));
      }
    }
  });

  it("示範資料：折扣（|影響| 最大）滿半寬 48 不利色；REV_UP_CM_DOWN −598,833.95 是空心條（外框 24.2，框線矩形 x 24.8、寬 22.2）", () => {
    const html = render(snapshots.demo);
    expect(attrs(element(barOf(html, "DISCOUNT_BURDEN_UP")!, "<rect")!)).toMatchObject({ x: "0", width: "48", fill: chartColors.unfavorable });
    const total = barOf(html, "REV_UP_CM_DOWN")!;
    expect(attrs(total).class).toBe("bar-cell is-variance is-outline impact-bar");
    expect(attrs(element(total, "<rect")!)).toMatchObject({ x: "24.8", y: "4", width: "22.2", height: "4", fill: "none", stroke: chartColors.unfavorable, "stroke-width": "2", "vector-effect": "non-scaling-stroke" });
    // 只有 REV_UP_CM_DOWN 空心；費用規則都是實心。
    expect(html.match(/is-outline/g)).toHaveLength(1);
  });

  it("4 通路合成資料：費用規則影響為正（物流費比率升、金額降 +1,190.00）時照有利色往右畫；資料缺漏、NEGATIVE_CHANNEL_CM、SKU_NEGATIVE_GP 沒有條；沒有總差額就沒有空心條與註明", () => {
    const html = render(snapshots.synthetic);
    const groups = diagnosisGroups(snapshots.synthetic).groups;
    const fulfillment = groups.find(group => group.rule === "FULFILLMENT_BURDEN_UP")!;
    expect(fulfillment.impact_cents).toBe("1190.00");
    const svg = barOf(html, "FULFILLMENT_BURDEN_UP")!;
    expect(attrs(svg)["data-tone"]).toBe("favorable");
    const rect = attrs(element(svg, "<rect")!);
    expect(rect.fill).toBe(chartColors.favorable);
    expect(Number(rect.x)).toBe(BAR_CELL_WIDTH / 2);
    expect(rect.width).toBe(String(barCellGeometry({ mode: "variance", value: "1190.00", max: "7650", outline: false }).bar!.width));
    expect(impactBarScale(groups)).toBe("7650");
    for (const rule of ["MISSING_CRITICAL_DATA", ...LEVEL_RULES] as RuleCode[]) {
      expect(groups.some(group => group.rule === rule), rule).toBe(true);
      expect(barOf(html, rule), rule).toBeNull();
      expect(impactOf(html, rule), rule).toContain(EMPTY_SLOT);
    }
    expect(html).not.toContain("is-outline");
    expect(html).not.toContain(labels.diagnosis.chartsV4.impact.totalNote);
  });

  it("refund_only（只有水準類規則）：整份清單沒有條、沒有空位、ol 不帶 data-impact-bars、沒有註明", () => {
    const html = render(snapshots.refundOnly);
    expect(diagnosisGroups(snapshots.refundOnly).groups.map(group => group.rule).sort()).toEqual([...LEVEL_RULES].sort());
    expect(barCount(html)).toBe(0);
    expect(html).not.toContain("impact-bar");
    expect(html).not.toContain("data-impact-bars");
    expect(html).not.toContain('data-chart-kind="cell"');
    expect(html).not.toContain(labels.diagnosis.chartsV4.impact.totalNote);
  });

  it("清單下方一行註明空心與實心（diagnosis.chartsV4.impact.totalNote）：畫了 REV_UP_CM_DOWN 才出現，恰好一次、在 </ol> 之後", () => {
    for (const name of ["demo", "golden", "zeroAd"] as const) {
      const html = render(snapshots[name]);
      expect(html.split(labels.diagnosis.chartsV4.impact.totalNote), name).toHaveLength(2);
      expect(html, name).toContain(`</ol><p class="note impact-note">${labels.diagnosis.chartsV4.impact.totalNote}</p></section>`);
    }
  });

  it("同一份 groups 由頁面傳入（Diagnosis 用 buildManagerSummary）與自行計算的輸出相同；健檢頁整頁 SSR 也恰好 5 條", () => {
    const groups = buildManagerSummary(snapshots.demo).diagnosis;
    expect(render(snapshots.demo, { groups })).toBe(render(snapshots.demo));
    const page = renderToStaticMarkup(createElement(Diagnosis, { snapshot: snapshots.demo, onEvidence: noop }));
    expect(barCount(page)).toBe(5);
  });
});

describe("G9 門檻刻度（importance_threshold；C24 tick）", () => {
  it("沒給門檻或門檻 0：沒有刻度（與零線重疊，H5 設計稿「門檻 0 元」狀態）", () => {
    for (const html of [render(snapshots.golden), render(snapshots.golden, { importanceThreshold: "0.00" })]) {
      expect(html).not.toContain("bar-cell-tick");
      expect(html).not.toContain("has-tick");
    }
  });

  it("門檻 100.00（golden 尺度 315）：每條在條所在那一側 100 ÷ 315 × 48 的位置畫一個 2×12 刻度，色取 chartColors.target；水準類列沒有", () => {
    const groups = buildManagerSummary(snapshots.golden, { importanceThreshold: "100.00" }).diagnosis;
    const html = render(snapshots.golden, { groups, importanceThreshold: "100.00" });
    for (const group of barred(groups)) {
      const svg = barOf(html, group.rule)!;
      const tick = barCellGeometry({ mode: "variance", value: group.impact_cents, max: "315", tick: "100.00" }).tick!;
      // 100 ÷ 315 × 48＝15.238…，取到 0.1 為 15.2；中心 48 − 15.2＝32.8，矩形 x＝32.8 − 1＝31.8（golden 差額類都是不利、往左）。
      expect(tick, group.rule).toMatchObject({ x: 31.8, width: 2, height: BAR_CELL_HEIGHT });
      expect(attrs(element(svg, 'class="bar-cell-tick"')!), group.rule).toMatchObject({ x: String(tick.x), y: "0", width: "2", height: String(BAR_CELL_HEIGHT), fill: chartColors.target });
    }
    expect(html.match(/bar-cell-tick/g)).toHaveLength(barred(groups).length);
    expect(rowOf(html, "NEGATIVE_CHANNEL_CM")).not.toContain("bar-cell-tick");
  });

  it("門檻超過共用尺度（400.00 > 315）：不畫刻度（不夾在端點）", () => {
    expect(render(snapshots.golden, { importanceThreshold: "400.00" })).not.toContain("bar-cell-tick");
  });
});

describe("G9 護欄：不做跨規則加總（X38）、chart-lint SSR 0 違規、色只經 chartColors", () => {
  it("輸出沒有任何跨規則合計（差額類加總、全部規則加總，L1／L2／L3 都不出現），也沒有「其他」合併列", () => {
    for (const name of ["demo", "golden", "synthetic"] as const) {
      const html = render(snapshots[name]);
      const groups = diagnosisGroups(snapshots[name]).groups.filter(group => group.impact_cents !== null);
      const sum = (rows: DiagnosisGroup[]) => (rows.reduce((total, group) => total + Math.round(Number(group.impact_cents) * 100), 0) / 100).toFixed(2);
      for (const total of [sum(barred(groups)), sum(groups)]) for (const layer of ["L1", "L2", "L3"] as const) expect(textOf(html), `${name} ${total} ${layer}`).not.toContain(formatSignedDelta(total, layer));
      expect(html.match(/<details class="alert diagnosis-row/g), name).toHaveLength(diagnosisGroups(snapshots[name]).groups.length);
    }
  });

  it("CL-1、CL-2、CL-9、CL-11：健檢清單（示範、合成、golden）0 違規（條在 summary 內、同列有影響金額數字、aria-hidden）", () => {
    for (const name of ["demo", "golden", "synthetic"] as const) {
      const { violations } = checkChartMarkup(`<main id="main-content">${render(snapshots[name])}</main>`, { page: "diagnosis" });
      for (const rule of SSR_RULES) expect(violations[rule], `${name} ${rule}`).toEqual([]);
    }
  });

  it("markup 沒有色碼；fill／stroke 都是 chartColors 的 var() 字串或 none", () => {
    const html = render(snapshots.demo, { importanceThreshold: "300000.00" });
    expect(html).toContain("bar-cell-tick");
    const bars = [...html.matchAll(/<svg class="bar-cell[\s\S]*?<\/svg>/g)].map(match => match[0]);
    expect(bars).toHaveLength(5);
    for (const svg of bars) {
      expect(svg).not.toMatch(HEX);
      for (const [, color] of svg.matchAll(/(?:fill|stroke)="([^"]+)"/g)) if (color !== "none") expect(Object.values(chartColors)).toContain(color);
    }
  });
});

describe("globals.css「V4-3a C」錨點：只用 token 與本段宣告的區域變數，不藏條、不寫色", () => {
  const css = readFileSync(resolve("src/app/globals.css"), "utf8");
  const start = css.indexOf("/* ── V4-3a C：");
  const block = css.slice(start, css.indexOf("/* ── V4-3a C 錨點結束 ── */", start));
  const rules = block.replace(/\/\*[\s\S]*?\*\//g, "");
  const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));

  it("錨點存在；選擇器都在 .diagnosis-panel 之下；有條時才改影響金額欄（ol[data-impact-bars]）；≤ 1023 條寬 64", () => {
    expect(start).toBeGreaterThan(-1);
    for (const [, selector] of rules.matchAll(/(?:^|[}\n])\s*([^@{}\n][^{}]*)\{/g)) if (selector.trim()) expect(selector.trim(), selector).toMatch(/^\.diagnosis-panel /);
    expect(rules).toContain(".diagnosis-panel .diagnosis-list[data-impact-bars] { --impact-bar-w: 96px; }");
    expect(rules).toContain("@media (max-width: 1023px)");
    expect(rules).toContain("--impact-bar-w: 64px;");
  });

  it("沒有色碼、沒有 var(--chart-*)、沒有 display: none；引用的變數都在 :root 或是本段／健檢面板宣告的區域變數", () => {
    expect(rules).not.toMatch(HEX);
    expect(rules).not.toContain("var(--chart-");
    expect(rules).not.toContain("display: none");
    const local = new Set(["--impact-bar-w", "--alert-impact-w", "--alert-chev-w"]);
    for (const [, token] of rules.matchAll(/var\((--[\w-]+)\)/g)) expect(local.has(token) || root.includes(`${token}:`), token).toBe(true);
  });
});
