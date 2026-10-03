import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { saveScenario, type ScenarioPlan } from "../src/application/decision";
import { SCENARIO_PRESET_IDS, absoluteContext, absoluteToRelative, rangeHint, relativeToAbsolute } from "../src/application/scenario-presets";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, updateScenarioContext, type ScenarioSource, type ScenarioWorkspace } from "../src/application/scenario-workspace";
import { MultiScenarioWorkbench } from "../src/components/multi-scenario-workbench";
import type { ScenarioInputs } from "../src/domain/scenarios";
import type { AnalysisFilters } from "../src/domain/types";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// R5-3 試算頁 DOM 契約（SSR，不需任何點擊）：進頁即表單、範本選單、收合的固定假設、版本徽章／草稿、絕對值等值文字。
const form = labels.scenarioForm;
const dw = labels.ui.decisionWorkbench;
const msw = labels.ui.multiScenarioWorkbench;
const FIELDS = [labels.scenario.volume.label, labels.scenario.discount.label, labels.scenario.fulfillmentUnit.label, labels.scenario.adSpend.label, labels.scenario.oneOff.label];
const noop = () => undefined;

async function source(name = "golden", filters: AnalysisFilters = { channels: ["DTC"] }): Promise<ScenarioSource> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, filters, await hashInput(input));
  return { input, dataset, snapshot, revision: 1 };
}
function render(src: ScenarioSource, state: ScenarioWorkspace = emptyScenarioWorkspace(), setState: (next: unknown) => void = noop) {
  return renderToStaticMarkup(createElement(MultiScenarioWorkbench, { source: src, state, setState, onEvidence: noop, onSelectForReview: noop, onExport: noop }));
}
/** 依 data-testid 取出整張方案卡（<article>…</article>）。 */
function card(html: string, index: number): string {
  const at = html.indexOf(`data-testid="scenario-${index}"`);
  expect(at, `scenario-${index}`).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf("<article", at), html.indexOf("</article>", at) + "</article>".length);
}
/** 取出某個 testid 所在元素的開頭標籤到對應結尾（不處理同名巢狀；這裡的 select／details 沒有同名巢狀）。 */
function element(html: string, testid: string, tag: string): string {
  const at = html.indexOf(`data-testid="${testid}"`);
  expect(at, testid).toBeGreaterThan(-1);
  return html.slice(html.lastIndexOf(`<${tag}`, at), html.indexOf(`</${tag}>`, at) + `</${tag}>`.length);
}
const text = (html: string) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&");
const accepted = (patch: Partial<ScenarioInputs> = {}): ScenarioInputs => ({ volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true, ...patch });

/** 以 application 層 API 建一個單通路 context，逐步寫入方案（與頁面上「計算」「編輯」相同的路徑）。 */
function contextBuilder(src: ScenarioSource, workspace: ScenarioWorkspace = emptyScenarioWorkspace()) {
  let ws = ensureScenarioContext(workspace, src);
  const id = ws.contexts[ws.contexts.length - 1].id;
  const context = () => ws.contexts.find(row => row.id === id)!;
  const plans = () => scenarioContextDecision(context()).scenarios;
  const write = (next: ScenarioPlan[]) => { ws = updateScenarioContext(ws, id, { ...scenarioContextDecision(context()), scenarios: next }); };
  return {
    calculate: (plan: Omit<ScenarioPlan, "result">) => write(saveScenario(context().session, plans(), plan)),
    edit: (planId: string, patch: Partial<ScenarioPlan>) => write(plans().map(plan => plan.id === planId ? { ...plan, ...patch, result: null } : plan)),
    sensitivity: (planId: string, volumes: [string, string, string]) => write(plans().map(plan => plan.id === planId ? { ...plan, sensitivity: { volumes } } : plan)),
    context, get workspace() { return ws; },
  };
}

// 與 tests/copy-density.test.ts 相同的口徑：主層（排除 <details>）含「不是／不代表／不等於／不可」的句子。
const withoutDetails = (html: string) => html.replace(/<details(?:\s[^>]*)?>[\s\S]*?<\/details>/g, "");
function disclaimerSentences(html: string): string[] {
  const nodes = withoutDetails(html).split(/<[^>]*>/).map(node => node.replace(/&[a-z]+;|&#\d+;/g, " "));
  const sentences = nodes.flatMap(node => node.split(/[。；;\n]/)).map(sentence => sentence.replace(/\s+/g, " ").trim()).filter(sentence => /不是|不代表|不等於|不可/.test(sentence));
  return [...new Set(sentences.map(sentence => sentence.replace(/^.*?注意[:：]\s*/, "")))];
}

describe("R5-3 scenario page opens straight onto the form", () => {
  it("golden DTC: channel select, baseline and plan 1 with five inputs are rendered without any click or state write", async () => {
    const src = await source();
    const setState = vi.fn();
    const html = render(src, emptyScenarioWorkspace(), setState);
    expect(setState).not.toHaveBeenCalled();
    const select = element(html, "scenario-channel", "select");
    expect(select).toContain(`aria-label="${form.channel}"`);
    expect(select.match(/<option /g)).toHaveLength(src.dataset.manifest.channels.length);
    expect(select).toMatch(/<option value="DTC" selected="">DTC<\/option>/);
    expect(html).toContain('data-testid="baseline-net_revenue"');
    expect(html).toContain('data-testid="baseline-contribution_after_marketing"');
    expect(text(element(html, "baseline-contribution_after_marketing", "button"))).toBe("270.00");
    const plan = card(html, 1);
    expect(plan).toContain(`value="${fill(dw.defaultPlanName, { n: 1 })}"`);
    for (const label of FIELDS) expect(plan, label).toMatch(new RegExp(`<input id="[^"]+" aria-label="${label.replace(/[()（）]/g, ".")}"`));
    expect(plan).toContain(labels.scenario.acceptAssumptions);
    expect(plan).toContain(`>${labels.buttons.calculate}</button>`);
    // 尚未寫入的草稿方案不給「移除」；也不再有「開始試算」「全部填 0」這兩層／兩種入口。
    expect(plan).not.toContain(`>${labels.buttons.removeScenario}</button>`);
    expect(html).not.toContain(fill(msw.startButton, { channel: "DTC" }));
    expect(html).not.toContain(labels.buttons.fillZero);
    expect(card(html, 1)).toContain('data-testid="scenario-draft"');
    expect(html).not.toContain('data-testid="scenario-version"');
    expect(html).not.toContain('data-testid="scenario-2"');
  });

  it("demo data shows channel aliases and defaults to the first channel when the site scope has several channels", async () => {
    const demo = await source("demo", { channels: ["MARKETPLACE"] });
    const single = element(render(demo), "scenario-channel", "select");
    expect(single).toContain(`<option value="MARKETPLACE" selected="">${labels.demoChannelAlias.MARKETPLACE}</option>`);
    expect(single).toContain(`<option value="DTC">${labels.demoChannelAlias.DTC}</option>`);
    const all = render(await source("golden", {}));
    expect(element(all, "scenario-channel", "select")).toMatch(/<option value="DTC" selected="">DTC<\/option>/);
    // 多通路範圍要先另建單通路基準（非同步），SSR 時顯示重算中；選通路只改本頁，不呼叫全站篩選。
    expect(all).toContain(`<p role="status">${msw.rebuildingBaseline}</p>`);
  });

  it("template menu lists the six presets after the placeholder and always shows the starting-point note", async () => {
    const html = render(await source());
    const plan = card(html, 1);
    const select = element(plan, "scenario-preset", "select");
    expect(select).toContain(`aria-label="${labels.buttons.applyTemplate}"`);
    const options = [...select.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(match => [match[1], match[2]]);
    expect(options).toEqual([["", labels.scenarioPresets.menuPlaceholder], ...SCENARIO_PRESET_IDS.map(id => [id, labels.scenarioPresets.items[id].name])]);
    expect(options).toHaveLength(7);
    expect(plan).toContain(labels.scenario.templateNote);
  });

  it("fixed assumptions are a collapsed <details> with the must-read summary; the consent checkbox stays in the form", async () => {
    const html = render(await source());
    const block = html.slice(html.lastIndexOf("<details", html.indexOf('data-testid="scenario-assumptions"')), html.indexOf("</ol>", html.indexOf('data-testid="scenario-assumptions"')));
    expect(block).toMatch(/^<details(?![^>]*\sopen)[^>]*data-testid="scenario-assumptions"/);
    expect(block).toContain(`>${form.assumptionsSummary}</summary>`);
    expect(block.match(/<li>/g)).toHaveLength((JSON.parse(dw.assumptions) as string[]).length);
    expect(block).not.toContain(labels.scenario.acceptAssumptions);
    expect(card(html, 1)).toMatch(new RegExp(`<input type="checkbox"[^>]*/>${labels.scenario.acceptAssumptions}`));
    expect(disclaimerSentences(html).length).toBeLessThanOrEqual(3);
  });
});

describe("R5-3 version badge, draft tag and sensitivity on stored plans", () => {
  it("shows 版本 n only on valid results and the draft tag on edited plans (golden DTC 284.00 / 264.00)", async () => {
    const src = await source();
    const build = contextBuilder(src);
    build.calculate({ id: "a", name: "A", inputs: accepted() });
    build.calculate({ id: "a", name: "A", inputs: accepted({ fulfillment_change_pct: "-10" }) });
    build.calculate({ id: "b", name: "B", inputs: accepted({ fulfillment_change_pct: "-10", one_time_cost: "20" }) });
    expect(build.context().plans.map(plan => [plan.id, plan.revision, plan.result?.contribution])).toEqual([["a", 2, "284.00"], ["b", 1, "264.00"]]);
    build.edit("b", { inputs: accepted({ fulfillment_change_pct: "-10", one_time_cost: "30" }) });
    build.calculate({ id: "c", name: "C", inputs: { ...accepted(), assumptions_accepted: false } });
    const html = render(src, build.workspace);
    const [a, b, c] = [card(html, 1), card(html, 2), card(html, 3)];
    expect(text(element(a, "scenario-version", "span"))).toBe(fill(form.version, { n: 2 }));
    expect(text(element(a, "scenario-contribution", "strong"))).toBe("284.00");
    expect(a).not.toContain('data-testid="scenario-draft"');
    expect(text(element(b, "scenario-draft", "span"))).toBe(labels.scenario.draft);
    expect(b).not.toContain('data-testid="scenario-version"');
    expect(b).not.toContain('data-testid="scenario-contribution"');
    expect(c).not.toContain('data-testid="scenario-version"');
    expect(c).not.toContain('data-testid="scenario-draft"');
    // 已寫入的方案才有「移除」；比較表沿用 scenario-comparison。
    expect(a).toContain(`>${labels.buttons.removeScenario}</button>`);
    expect(html).toContain('data-testid="scenario-comparison"');
  });

  it("sensitivity inputs are read from plan.sensitivity (controlled) and do not move the version", async () => {
    const src = await source();
    const build = contextBuilder(src);
    build.calculate({ id: "a", name: "A", inputs: accepted({ fulfillment_change_pct: "-10" }) });
    build.sensitivity("a", ["-10", "0", "10"]);
    expect(build.context().plans[0]).toMatchObject({ revision: 1, sensitivity: { volumes: ["-10", "0", "10"] } });
    expect(build.context().versions).toHaveLength(1);
    const plan = card(render(src, build.workspace), 1);
    const sensitivity = plan.slice(plan.indexOf('data-testid="scenario-sensitivity"'));
    for (const value of ["-10", "0", "10"]) expect(sensitivity).toContain(`maxLength="100" value="${value}"`);
    expect(element(sensitivity, "sensitivity-result", "div")).toContain("<table");
    expect(text(element(plan, "scenario-version", "span"))).toBe(fill(form.version, { n: 1 }));
  });
});

describe("R5-3 relative / absolute input helpers in the form", () => {
  it("shows the absolute equivalent of relative inputs and matches absoluteToRelative round trips (golden DTC: 4 units, ad 270.00)", async () => {
    const src = await source();
    const build = contextBuilder(src);
    build.calculate({ id: "p", name: "P", inputs: accepted() });
    build.edit("p", { inputs: accepted({ volume_change_pct: "50", discount_change_pp: "2", ad_change_pct: "-50" }) });
    const ctx = absoluteContext(build.context().session.baseline, 4n);
    const plan = card(render(src, build.workspace), 1);
    const equivalent = (field: string) => text(element(plan, `scenario-equivalent-${field}`, "small"));
    expect(equivalent("volume_change_pct")).toBe(relativeToAbsolute("volume_change_pct", "50", ctx));
    expect(equivalent("volume_change_pct")).toBe(fill(labels.scenarioPresets.absolute.equivalentUnits, { value: fill(labels.assist.units.count, { value: "6" }) }));
    expect(equivalent("discount_change_pp")).toBe(relativeToAbsolute("discount_change_pp", "2", ctx));
    expect(equivalent("ad_change_pct")).toBe(fill(labels.scenarioPresets.absolute.equivalentBudget, { value: "135.00" }));
    // 反向：在絕對值模式填 6 件／135 元，送進引擎的相對值就是畫面上這兩格的 50／−50。
    expect(absoluteToRelative("volume_change_pct", "6", ctx)).toEqual({ relative: "50", equivalent: fill(labels.scenarioPresets.absolute.equivalentPct, { value: "+50.0" }) });
    expect(absoluteToRelative("ad_change_pct", "135", ctx)).toEqual({ relative: "-50", equivalent: fill(labels.scenarioPresets.absolute.equivalentPct, { value: "−50.0" }) });
    expect(plan).not.toContain('data-testid="scenario-equivalent-fulfillment_change_pct"');
    expect(plan).not.toContain('data-testid="scenario-range-');
  });

  it("renders the relative / absolute toggle on volume, discount and ad budget only, with a live range hint", async () => {
    const src = await source();
    const build = contextBuilder(src);
    build.calculate({ id: "p", name: "P", inputs: accepted() });
    build.edit("p", { inputs: accepted({ volume_change_pct: "150" }) });
    const plan = card(render(src, build.workspace), 1);
    for (const [field, label] of [["volume_change_pct", labels.scenario.volume.label], ["discount_change_pp", labels.scenario.discount.label], ["ad_change_pct", labels.scenario.adSpend.label]] as const) {
      const group = element(plan, `scenario-mode-${field}`, "div");
      expect(group).toContain('role="group"');
      expect(group).toContain(`aria-label="${fill(form.modeGroup, { field: label })}"`);
      expect(group).toContain(`aria-pressed="true">${labels.scenario.modeRelative}</button>`);
      expect(group).toContain(`aria-pressed="false">${labels.scenario.modeAbsolute}</button>`);
      expect(group).not.toContain("disabled");
    }
    expect(plan).not.toContain('data-testid="scenario-mode-fulfillment_change_pct"');
    expect(plan).not.toContain('data-testid="scenario-mode-one_time_cost"');
    const hint = element(plan, "scenario-range-volume_change_pct", "small");
    expect(hint).toContain('role="status"');
    expect(text(hint)).toBe(rangeHint("volume_change_pct", "150"));
    expect(text(hint)).toBe(fill(labels.scenarioPresets.range.pct, { min: "−90", max: "+100" }));
  });

  it("disables the absolute toggle with a reason when the current value is missing (zero_ad: ad spend 0)", async () => {
    const html = render(await source("zero_ad"));
    const plan = card(html, 1);
    const group = element(plan, "scenario-mode-ad_change_pct", "div");
    expect(group).toMatch(new RegExp(`aria-pressed="false" disabled="">${labels.scenario.modeAbsolute}</button>`));
    expect(text(element(plan, "scenario-unavailable-ad_change_pct", "small"))).toBe(labels.scenarioPresets.absolute.unavailable.ad_change_pct);
  });
});

describe("R5-3 other channels stay reachable below the form", () => {
  it("lists other channels' plans (MARKETPLACE 19.70) with select-for-meeting inside a collapsed <details>", async () => {
    const dtc = await source();
    const marketplace = await source("golden", { channels: ["MARKETPLACE"] });
    const build = contextBuilder(marketplace);
    build.calculate({ id: "m", name: "M", inputs: accepted({ volume_change_pct: "20", discount_change_pp: "2", fulfillment_change_pct: "-10", ad_change_pct: "-20", one_time_cost: "20" }) });
    expect(build.context().plans[0].result?.contribution).toBe("19.70");
    const html = render(dtc, build.workspace);
    const others = element(html, "scenario-other-channels", "details");
    expect(others).toMatch(/^<details(?![^>]*\sopen)/);
    expect(others).toContain(`<summary>${form.otherChannels}</summary>`);
    expect(others).toContain(fill(msw.editChannelPlans, { channel: "MARKETPLACE" }));
    expect(others).toContain(fill(msw.planSummary, { plan: "M", resultLabel: labels.scenario.resultTitle, amount: "19.70" }));
    expect(others).toContain(fill(msw.selectPlanForMeeting, { selectForMeeting: labels.buttons.selectForMeeting, channel: "MARKETPLACE", plan: "M" }));
    // DTC 本身還沒有方案：表單仍是草稿方案 1，不受其他通路影響。
    expect(card(html, 1)).toContain(`value="${fill(dw.defaultPlanName, { n: 1 })}"`);
  });
});
