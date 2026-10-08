import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, Fragment, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { AST_RULES, checkChartMarkup, scanChartTsx, scanChartVarLiterals } from "../scripts/lib/chart-scan.mjs";
import { scanCssText, scanTsxText } from "../scripts/lib/ui-scan.mjs";
import { breakevenMer, type BreakevenMer } from "../src/application/breakeven-mer";
import { favorableDirectionOf, formatMultiple, MINUS } from "../src/application/presentation";
import { achievement, parseTargets, TARGET_METRICS, type TargetMetric, type TargetSet } from "../src/application/targets";
import type { Metric } from "../src/domain/types";
import { Overview } from "../src/components/overview";
import { AssistTable, breakevenBulletLine } from "../src/components/overview/assist-table";
import { Bullet, bulletGeometry } from "../src/components/overview/charts/bullet";
import { fill, labels } from "../src/i18n";
import { byTestId, element, openTag, textOf } from "./helpers/markup";
import { bytes, load, noop, type Active } from "./helpers/page-states";

// V4-2 代理 C：C18 Bullet 共用元件（PRD §6.2 C18、§4.4 G5、§7.2；CHART_CATALOG G5 實作卡）。
// 1. 幾何：寬＝達成率夾在 0 到 1（取位同 achievement：百分比一位小數、ROUND_HALF_UP）、落後依有利方向、缺值或基準 ≤ 0 不畫；手算 golden。
// 2. KPI 帶與 v3 逐字相同：本檔保留 v3.0.0（625bfa5）src/components/overview.tsx 的 targetBar 當對照組，逐一比對 markup（含 HALF_UP 邊界、負值、預算）。
// 3. G5 損益兩平 MER 段的 bullet：位置（表格之外、一句結論之後）、寬與落後、旁邊一行字（labels.overview.chartsV4.bullet.merLine）、不適用與資料待補不畫。
// 字串一律取自 labels 與格式化函式，不寫死中文；金額與倍數的手算值寫在註解。

const ui = labels.overview.chartsV4.bullet;
const MER_TESTID = "chart-overview-bullet-bar-mer";
const html = (node: ReactNode) => renderToStaticMarkup(createElement(Fragment, null, node));
const bullet = (actual: string | null, target: string | null, direction: "up" | "down" = "up", testId?: string) => html(createElement(Bullet, { actual, target, favorableDirection: direction, testId }));

/**
 * v3.0.0 的 targetBar（625bfa5 的 src/components/overview.tsx:43-51）：判斷與取位逐行照抄，只把回傳的 JSX 改寫成 createElement（測試檔不用 JSX）。
 * V4-2 起 KPI 帶改用共用 Bullet；這個對照組證明兩者輸出逐字相同。
 */
function legacyTargetBar(metric: TargetMetric, actual: Metric, target: string): ReactNode {
  const result = achievement(actual, target);
  if (result.status !== "ok" || result.rate === null) return null;
  const ratio = Number(result.rate.replace(MINUS, "-").replace(/[%,]/g, "")) / 100;
  if (!Number.isFinite(ratio)) return null;
  const behind = favorableDirectionOf(metric) === "up" ? ratio < 1 : ratio > 1;
  const width = Math.min(Math.max(ratio, 0), 1);
  return createElement("span", { className: `kpi-bullet${behind ? " is-behind" : ""}`, "aria-hidden": "true" }, createElement("span", { className: "kpi-bullet-bar", style: { width: `${(width * 100).toFixed(1)}%` } }), createElement("span", { className: "kpi-bullet-target" }));
}
const kpiBullet = (metric: TargetMetric, actual: string | null, target: string) => html(createElement(Bullet, { actual, target, favorableDirection: favorableDirectionOf(metric) }));
const metric = (value: string | null): Metric => ({ value, reason_codes: [] });

function renderOverview(state: Active, targets: TargetSet | null): string {
  return renderToStaticMarkup(createElement(Overview, { snapshot: state.snapshot, onEvidence: noop, onCreateAction: noop, periodOpen: false, onPeriodToggle: noop, targets, events: null, allChannels: state.dataset.manifest.channels, onBasis: noop, onNavigate: noop, datasetName: labels.shell.devValidation.datasets.demo, missingItems: 0, actionsSummary: { pending: 0, pinned: [] } }));
}
const renderAssist = (state: Active) => renderToStaticMarkup(createElement(AssistTable, { snapshot: state.snapshot, onEvidence: noop, onBasis: noop }));
function targetSet(state: Active, rows: string[]): TargetSet {
  const parsed = parseTargets({ name: "targets.csv", bytes: bytes(["period_start,period_end,channel,metric,target", ...rows].join("\n")) }, state.dataset.manifest.channels);
  if (!parsed.set) throw new Error(JSON.stringify(parsed.issues));
  return parsed.set;
}

let demo: Active, golden: Active, goldenMarketplace: Active, demoMarketplace: Active;
beforeAll(async () => {
  [demo, golden, goldenMarketplace, demoMarketplace] = await Promise.all([load("demo", "demo"), load("golden", "golden"), load("golden-mp", "golden", { channels: ["MARKETPLACE"] }), load("demo-mp", "demo", { channels: ["MARKETPLACE"] })]);
});

describe("bulletGeometry：寬＝達成率夾在 0 到 1、刻度在右端、落後依有利方向（手算）", () => {
  it("有利方向 up：953 ÷ 1,000＝95.3%（落後）；1,047 ÷ 1,000＝104.7% 滿格（不落後）；剛好達成 100.0% 不落後", () => {
    expect(bulletGeometry("953.00", "1000.00", "up")).toEqual({ ratio: 0.953, width: "95.3%", behind: true });
    expect(bulletGeometry("1047.00", "1000.00", "up")).toEqual({ ratio: 1.047, width: "100.0%", behind: false });
    expect(bulletGeometry("1000.00", "1000.00", "up")).toEqual({ ratio: 1, width: "100.0%", behind: false });
  });

  it("有利方向 down（廣告費預算）：1,500 ÷ 1,000＝150.0% 超支＝落後、滿格；255 ÷ 1,000＝25.5% 不落後", () => {
    expect(bulletGeometry("1500.00", "1000.00", "down")).toEqual({ ratio: 1.5, width: "100.0%", behind: true });
    expect(bulletGeometry("255.00", "1000.00", "down")).toEqual({ ratio: 0.255, width: "25.5%", behind: false });
  });

  it("取位與 achievement 相同（ROUND_HALF_UP 到 0.1%）：2,470 ÷ 2,471.23＝99.9502…% 顯示 100.0%、不落後；2,470 ÷ 2,471.24＝99.9498…% 顯示 99.9%、落後", () => {
    expect(bulletGeometry("2470.00", "2471.23", "up")).toEqual({ ratio: 1, width: "100.0%", behind: false });
    expect(achievement(metric("2470.00"), "2471.23").rate).toBe("100.0%");
    // ratio 是圖形座標用的浮點數（與 v3 相同：Number("99.9") ÷ 100），只比到 12 位；寬與落後逐字比對。
    expect(bulletGeometry("2470.00", "2471.24", "up")).toMatchObject({ width: "99.9%", behind: true });
    expect(bulletGeometry("2470.00", "2471.24", "up")!.ratio).toBeCloseTo(0.999, 12);
    expect(achievement(metric("2470.00"), "2471.24").rate).toBe("99.9%");
  });

  it("負值與 0 從 0 起畫（寬 0.0%）：−120.50 ÷ 1,000＝−12.05% 取位成 −12.1%；0 ÷ 1,000＝0.0%", () => {
    expect(bulletGeometry("-120.50", "1000.00", "up")).toEqual({ ratio: -0.121, width: "0.0%", behind: true });
    expect(bulletGeometry("0.00", "1000.00", "up")).toEqual({ ratio: 0, width: "0.0%", behind: true });
    expect(bulletGeometry("0.00", "1000.00", "down")).toEqual({ ratio: 0, width: "0.0%", behind: false });
  });

  it("12 位小數的比率字串（MER）：示範資料本期實際 11.398943979974 ÷ 損益兩平 4.008483476626＝2.8437…（284.4%）滿格；golden MARKETPLACE 本期 5.5 ÷ 6＝91.666…% 取位 91.7%、落後", () => {
    expect(bulletGeometry("11.398943979974", "4.008483476626", "up")).toEqual({ ratio: 2.844, width: "100.0%", behind: false });
    expect(bulletGeometry("5.500000000000", "6.000000000000", "up")).toEqual({ ratio: 0.917, width: "91.7%", behind: true });
  });

  it("不畫：實際或基準是 null、undefined、顯示字串（千分位、U+2212、單位）或不是十進位；基準 ≤ 0", () => {
    for (const [actual, target] of [[null, "1000.00"], [undefined, "1000.00"], ["1000.00", null], ["1000.00", undefined], ["1,000.00", "1000.00"], [`${MINUS}5.00`, "1000.00"], ["1000.00", "1,000.00"], ["1e3", "1000.00"], ["abc", "1000.00"], ["", "1000.00"], ["1000.00", "0.00"], ["1000.00", "0"], ["1000.00", "-10.00"]] as const) {
      expect(bulletGeometry(actual, target, "up"), `${actual} ÷ ${target}`).toBeNull();
      expect(bullet(actual ?? null, target ?? null), `${actual} ÷ ${target}`).toBe("");
    }
  });
});

describe("C18 markup：與 v3 targetBar 逐字相同（KPI 帶、預算列不變）", () => {
  it("DOM 與 class 沿用 .kpi-bullet／.kpi-bullet-bar／.kpi-bullet-target；落後加 is-behind；根節點 aria-hidden；沒給 testId 時沒有 data-testid", () => {
    expect(bullet("953.00", "1000.00")).toBe('<span class="kpi-bullet is-behind" aria-hidden="true"><span class="kpi-bullet-bar" style="width:95.3%"></span><span class="kpi-bullet-target"></span></span>');
    expect(bullet("1047.00", "1000.00")).toBe('<span class="kpi-bullet" aria-hidden="true"><span class="kpi-bullet-bar" style="width:100.0%"></span><span class="kpi-bullet-target"></span></span>');
    expect(bullet("1047.00", "1000.00", "up", MER_TESTID)).toBe(`<span class="kpi-bullet" data-testid="${MER_TESTID}" aria-hidden="true"><span class="kpi-bullet-bar" style="width:100.0%"></span><span class="kpi-bullet-target"></span></span>`);
  });

  it("四個目標指標 × 實際 × 目標的格點（含 HALF_UP 邊界、負值、0、超大值、缺值、目標 ≤ 0）：Bullet 與 v3 targetBar 的 markup 逐字相同", () => {
    const actuals = [null, "0.00", "0.01", "-120.50", "-0.04", "255.00", "2469.99", "2470.00", "2471.23", "1269792.73", "1868626.68", "7853942.37", "999999999999.99"];
    const targets = ["0.00", "-50000.00", "0.01", "1.00", "100.00", "2470.00", "2471.23", "2471.24", "100000.00", "1200000.00", "3000000.00", "7500000.00", "999999999.00"];
    let compared = 0, drawn = 0;
    for (const name of TARGET_METRICS) for (const actual of actuals) for (const target of targets) {
      const expected = html(legacyTargetBar(name, metric(actual), target));
      expect(kpiBullet(name, actual, target), `${name} ${actual} ÷ ${target}`).toBe(expected);
      compared++;
      if (expected) drawn++;
    }
    expect(compared).toBe(TARGET_METRICS.length * actuals.length * targets.length);
    expect(drawn).toBeGreaterThan(compared / 2);
  });

  it("隨機 2,000 組兩位小數金額（固定種子）：Bullet 與 v3 targetBar 的 markup 逐字相同", () => {
    let seed = 20261008;
    const next = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    const money = (scale: number) => (Math.floor(next() * scale * 100) / 100 * (next() < 0.1 ? -1 : 1)).toFixed(2);
    for (let i = 0; i < 2000; i++) {
      const name = TARGET_METRICS[i % TARGET_METRICS.length];
      const actual = money(10 ** (1 + Math.floor(next() * 8))), target = money(10 ** (1 + Math.floor(next() * 8)));
      expect(kpiBullet(name, actual, target), `${name} ${actual} ÷ ${target}`).toBe(html(legacyTargetBar(name, metric(actual), target)));
    }
  });

  it("總覽（示範資料＋畫面 13 的 targets.csv，另加廣告費預算列）：每個 kpi-target-* 的細條與 v3 對照組逐字相同；KPI 帶內的 data-testid 都以 kpi- 開頭，細條不帶 testid", () => {
    const { start, end } = demo.snapshot.report.current.period;
    const capture = readFileSync(resolve("verification/revamp-v4-capture/targets.csv"), "utf8").trim().split("\n").slice(1);
    const set = targetSet(demo, [...capture, `${start},${end},ALL,ad_spend,400000.00`]);
    const page = renderOverview(demo, set);
    const band = byTestId(page, "kpi-band");
    let behind = 0, ahead = 0;
    for (const row of set.rows) {
      const name = row.metric as TargetMetric;
      const target = byTestId(page, `kpi-target-${name}`);
      const legacy = html(legacyTargetBar(name, demo.snapshot.report.current.metrics[name], row.target));
      expect(legacy, name).not.toBe("");
      expect(target.startsWith(`<p class="kpi-target matched" data-testid="kpi-target-${name}">${legacy}<button class="number-link">`), name).toBe(true);
      if (legacy.includes("is-behind")) behind++; else ahead++;
    }
    // 畫面 13 的 KPI 帶：淨營收、扣廣告後貢獻達成，商品毛利落後（v4 baseline.spec 的前提）；預算列在其他常用指標表。
    expect(byTestId(band, "kpi-target-gross_profit")).toContain('<span class="kpi-bullet is-behind" aria-hidden="true">');
    expect(byTestId(band, "kpi-target-net_revenue")).toContain('<span class="kpi-bullet" aria-hidden="true">');
    expect(byTestId(band, "kpi-target-contribution_after_marketing")).toContain('<span class="kpi-bullet" aria-hidden="true">');
    expect([behind, ahead]).toEqual([2, 2]);
    const ids = [...band.matchAll(/data-testid="([^"]+)"/g)].map(match => match[1]);
    expect(ids[0]).toBe("kpi-band");
    expect(ids.slice(1).every(id => id.startsWith("kpi-")), ids.join(",")).toBe(true);
    for (const span of band.match(/<span class="kpi-bullet[^"]*"[^>]*>/g) ?? []) expect(span).not.toContain("data-testid");
    expect(band.match(/<span class="kpi-bullet[ "]/g)).toHaveLength(3);
  });

  it("目標期間不符不畫細條（只有提示句）；沒有目標檔時完全沒有細條", () => {
    const set = targetSet(golden, ["2020-01-01,2020-01-31,ALL,net_revenue,500.00"]);
    const page = renderOverview(golden, set);
    expect(openTag(page, 'data-testid="kpi-target-net_revenue"')).toBe('<p class="kpi-target mismatch" data-testid="kpi-target-net_revenue">');
    expect(byTestId(page, "kpi-target-net_revenue")).not.toContain("kpi-bullet");
    expect(byTestId(renderOverview(golden, null), "kpi-band")).not.toContain("kpi-bullet");
  });
});

describe("G5 損益兩平 MER 段的 bullet（chart-overview-bullet-bar-mer）", () => {
  it("示範資料：本期實際 MER 對損益兩平 MER 比值約 2.84，細條滿格、不落後；旁邊一行「實際…，損益兩平…」（L1）；整段只有一個", () => {
    const current = breakevenMer(demo.snapshot.report.current);
    expect(current.comparison).toBe("above");
    const block = byTestId(renderAssist(demo), "assist-breakeven-mer");
    expect(block.match(new RegExp(`data-testid="${MER_TESTID}"`, "g"))).toHaveLength(1);
    const line = element(block, 'class="assist-breakeven-bullet"')!;
    const bar = bullet(current.actual.value, current.value, favorableDirectionOf("mer"), MER_TESTID);
    expect(bar).toContain('style="width:100.0%"');
    expect(bar).not.toContain("is-behind");
    const text = fill(ui.merLine, { mer: formatMultiple(current.actual.value, "L1"), breakeven: formatMultiple(current.value, "L1") });
    expect(line).toBe(`<p class="assist-breakeven-bullet">${bar}${text}</p>`);
    expect(breakevenBulletLine(current)).toBe(text);
  });

  it("位置：在表格之外（表格仍只有一列 tbody tr）、在一句結論之後、說明區之前；整行沒有可聚焦元素，細條本身 aria-hidden", () => {
    const block = byTestId(renderAssist(demo), "assist-breakeven-mer");
    const table = element(block, 'class="kv assist-breakeven-table"')!;
    expect(table.match(/<tr\b/g)).toHaveLength(2);
    expect(table).not.toContain(MER_TESTID);
    const note = block.indexOf('data-testid="assist-breakeven-note"'), line = block.indexOf('class="assist-breakeven-bullet"'), help = block.indexOf('data-testid="assist-breakeven-help"');
    expect(note).toBeGreaterThan(block.indexOf("</table>"));
    expect(line).toBeGreaterThan(note);
    expect(help).toBeGreaterThan(line);
    const row = element(block, 'class="assist-breakeven-bullet"')!;
    expect(row).not.toMatch(/<(button|a|input|select|textarea)\b|tabindex/i);
    expect(openTag(row, `data-testid="${MER_TESTID}"`)).toBe(`<span class="kpi-bullet" data-testid="${MER_TESTID}" aria-hidden="true">`);
  });

  it("落後（實際 MER 低於損益兩平）：golden MARKETPLACE 本期 5.5 ÷ 6＝91.7%、is-behind；示範資料 MARKETPLACE 本期 7.8658 ÷ 8.9506＝87.9%", () => {
    for (const [state, width] of [[goldenMarketplace, "91.7%"], [demoMarketplace, "87.9%"]] as const) {
      const current = breakevenMer(state.snapshot.report.current);
      expect(current.comparison, state.id).toBe("below");
      const bar = byTestId(renderAssist(state), MER_TESTID);
      expect(openTag(bar, `data-testid="${MER_TESTID}"`), state.id).toBe(`<span class="kpi-bullet is-behind" data-testid="${MER_TESTID}" aria-hidden="true">`);
      expect(bar, state.id).toContain(`style="width:${width}"`);
    }
    const golden = breakevenMer(goldenMarketplace.snapshot.report.current);
    expect(textOf(element(byTestId(renderAssist(goldenMarketplace), "assist-breakeven-mer"), 'class="assist-breakeven-bullet"')!)).toBe(fill(ui.merLine, { mer: formatMultiple("5.5", "L1"), breakeven: formatMultiple("6", "L1") }));
    expect(breakevenBulletLine(golden)).toBe(fill(ui.merLine, { mer: formatMultiple(golden.actual.value, "L1"), breakeven: formatMultiple(golden.value, "L1") }));
  });

  it("不畫（整行不出現）：廣告費為 0 時實際 MER 不適用（zero_ad）、損益兩平不適用（refund_only）、資料待補（missing_cogs）", async () => {
    for (const dir of ["zero_ad", "refund_only", "errors/missing_cogs"]) {
      const state = await load(dir, dir);
      const current = breakevenMer(state.snapshot.report.current);
      expect(current.comparison, dir).toBe("not_applicable");
      const block = byTestId(renderAssist(state), "assist-breakeven-mer");
      expect(block, dir).not.toContain("assist-breakeven-bullet");
      expect(block, dir).not.toContain(MER_TESTID);
      expect(breakevenBulletLine(current), dir).toBeNull();
    }
  });

  it("兩個 L1 倍數相同但精確值不同時改 L3（同 breakevenNote 的規則）；精確值相同時維持 L1", () => {
    const base = breakevenMer(golden.snapshot.report.current);
    const close: BreakevenMer = { ...base, actual: metric("3.460000000000"), value: "3.540000000000", comparison: "below" };
    expect(formatMultiple("3.46", "L1")).toBe(formatMultiple("3.54", "L1"));
    expect(breakevenBulletLine(close)).toBe(fill(ui.merLine, { mer: formatMultiple("3.46", "L3"), breakeven: formatMultiple("3.54", "L3") }));
    const equal: BreakevenMer = { ...base, actual: metric("3.500000000000"), value: "3.500000000000", comparison: "equal" };
    expect(breakevenBulletLine(equal)).toBe(fill(ui.merLine, { mer: formatMultiple("3.5", "L1"), breakeven: formatMultiple("3.5", "L1") }));
  });

  it("chart-lint SSR（CL-1、CL-2、CL-9、CL-11）：示範資料總覽 0 違規（testid 符合 §4.7、細條本身 aria-hidden）", () => {
    const { start, end } = demo.snapshot.report.current.period;
    const page = renderOverview(demo, targetSet(demo, [`${start},${end},ALL,net_revenue,7500000.00`]));
    expect(page).toContain(MER_TESTID);
    const { violations } = checkChartMarkup(`<main id="main-content">${page}</main>`, { page: "overview" });
    for (const rule of ["CL-1", "CL-2", "CL-9", "CL-11"] as const) expect(violations[rule], rule).toEqual([]);
  });
});

describe("原始碼與樣式護欄", () => {
  it("bullet.tsx：沒有 hex、中文、fontSize 常值、`var(--` 字串；chart-lint 的 AST 規則 0 違規", () => {
    const file = "src/components/overview/charts/bullet.tsx";
    const text = readFileSync(resolve(file), "utf8");
    const scan = scanTsxText(text, file);
    for (const key of ["hex", "jsxCjk", "cjkLiterals", "fontSize"] as const) expect(scan[key], key).toEqual([]);
    const lint = scanChartTsx(text, file) as Record<string, string[]>;
    for (const rule of AST_RULES) expect(lint[rule], rule).toEqual([]);
    expect(scanChartVarLiterals(text, file)).toEqual([]);
    expect(text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "")).not.toContain("var(--");
  });

  it("assist-table.tsx 沒有 `var(--chart-` 字串常值（CL-3）", () => {
    const file = "src/components/overview/assist-table.tsx";
    expect(scanChartVarLiterals(readFileSync(resolve(file), "utf8"), file)).toEqual([]);
  });

  it("globals.css：.kpi-bullet* 的色改引用 --chart-total、--chart-unfavorable、--chart-target，三個 token 在 :root 的值就是 v3 的 --text-secondary、--unfavorable、--text-primary（外觀零差異）", () => {
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const root = css.slice(css.indexOf(":root {"), css.indexOf("}", css.indexOf(":root {")));
    expect(root).toContain("--chart-total: var(--text-secondary);");
    expect(root).toContain("--chart-unfavorable: var(--unfavorable);");
    expect(root).toContain("--chart-target: var(--text-primary);");
    expect(css).toContain(".kpi-bullet-bar { position: absolute; top: 0; bottom: 0; left: 0; background: var(--chart-total); }");
    expect(css).toContain(".kpi-bullet.is-behind .kpi-bullet-bar { background: var(--chart-unfavorable); }");
    expect(css).toContain(".kpi-bullet-target { position: absolute; top: -3px; right: 0; width: 2px; height: 12px; background: var(--chart-target); }");
    expect(css).toContain(".kpi-bullet { position: relative; display: block; height: 6px; margin: var(--space-1) 0; background: var(--bg-hover); }");
  });

  it("globals.css 錨點 V4-2 C 的規則只用 token：沒有 hex、圓角、陰影；字級只用既有的 --text-12；不用 order", () => {
    const css = readFileSync(resolve("src/app/globals.css"), "utf8");
    const start = css.indexOf("/* ── V4-2 C：");
    const end = css.indexOf("/* ── V4-2 C 錨點結束 ── */");
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const block = css.slice(start, end);
    const scan = scanCssText(block, "globals.css#V4-2-C");
    expect(scan.hex).toEqual([]);
    expect(scan.borderRadius).toEqual([]);
    expect(scan.boxShadow).toEqual([]);
    expect(scan.fontSize.map(entry => (entry as { value: string }).value)).toEqual(["var(--text-12)"]);
    expect(block).toContain(".assist-breakeven-bullet {");
    expect(block).not.toMatch(/\border\s*:/);
  });
});
