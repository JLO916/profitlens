import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { channelsLabel, demoAlias, scopeLabel } from "../src/application/copy";
import { diagnosisGroups, type DiagnosisGroup } from "../src/application/diagnosis-group";
import type { EventSet } from "../src/application/events";
import { formatAmountL3, formatSignedDelta } from "../src/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "../src/application/workspace";
import { alertStatus, TopThree, type TopThreeProps } from "../src/components/top-three";
import { validateDataset } from "../src/domain/validation";
import { fill, labels } from "../src/i18n";
import { fixture } from "./helpers/fixtures";

// V3-4a 代理 C：總覽「本期三件事」改 C9 摘要型警示列（PRD §7.1 第 4 點、§9.4 C9、§8.2 句型）。
// DOM 契約（E2E 錨點）：section[data-testid=top-three] > ol.alert-list > li.alert-row[data-testid=overview-priority-<rule>]，
// 列內 <details class="alert">（summary：展開指示、狀態標籤、h3.alert-title、.alert-explain；展開內容：限制、相關範圍、檔期）＋ .alert-impact（.impact-amount）＋ .alert-actions。
// 所有期待值都由 labels、fill 與格式化函式組出，不寫死數字（golden：影響金額 −315.00、−250.00、−150.00）。

async function snapshot(name = "golden"): Promise<WorkspaceSnapshot> {
  const input = fixture(name);
  const dataset = validateDataset(input).dataset!;
  return createSnapshot(dataset, {}, await hashInput(input));
}
const noop = () => undefined;
const render = (snap: WorkspaceSnapshot, extra: Partial<TopThreeProps> = {}) => renderToStaticMarkup(createElement(TopThree, { snapshot: snap, onEvidence: noop, onCreateAction: noop, ...extra }));
const alerts = labels.overview.alerts;
const text = (html: string) => html.replace(/<[^>]*>/g, "");
/** 依標記取出整個元素（同名標籤以巢狀深度配對；列內的相關範圍也是 <li>）。 */
function element(html: string, marker: string, tag: string): string {
  const at = html.indexOf(marker);
  expect(at, marker).toBeGreaterThan(-1);
  const open = html.lastIndexOf(`<${tag}`, at);
  const re = new RegExp(`<${tag}[\\s>]|</${tag}>`, "g");
  re.lastIndex = open;
  let depth = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    depth += match[0] === `</${tag}>` ? -1 : 1;
    if (depth === 0) return html.slice(open, match.index + match[0].length);
  }
  throw new Error(`unclosed ${tag} at ${marker}`);
}
const rowOf = (html: string, rule: string) => element(html, `data-testid="overview-priority-${rule}"`, "li");
const summaryOf = (row: string) => row.slice(row.indexOf("<summary"), row.indexOf("</summary>") + "</summary>".length);
const bodyOf = (row: string) => element(row, 'class="alert-body"', "div");
/** 列內 <details> 之外的部分（影響金額與動作）。 */
const outsideDetails = (row: string) => row.slice(row.indexOf("</details>"));

describe("V3-4a 本期三件事：C9 摘要型警示列（golden，門檻 0.00）", () => {
  it("列數與順序等於 diagnosisGroups().priorities，每列 li.alert-row 帶 overview-priority-{rule}，預設收合", async () => {
    const snap = await snapshot();
    const html = render(snap);
    const priorities = diagnosisGroups(snap).priorities;
    expect(priorities).toHaveLength(3);
    expect(html).toContain('<section class="top-three" aria-labelledby="top-three-title" data-testid="top-three">');
    expect(html).toContain('<ol class="alert-list">');
    expect([...html.matchAll(/<li class="alert-row" data-testid="overview-priority-([A-Z_]+)">/g)].map(match => match[1])).toEqual(priorities.map(group => group.rule));
    for (const group of priorities) expect(rowOf(html, group.rule), group.rule).toMatch(/^<li class="alert-row" data-testid="[^"]+"><details class="alert"><summary>/);
    // 不再是 .panel 卡片，也不再用 v2 的 .top-three-list。
    expect(html).not.toContain('class="panel top-three"');
    expect(html).not.toContain("top-three-list");
  });

  it("summary：展開指示、狀態標籤（不利）、L1 標題 h3、第二行解讀＝原因＋下一步；summary 不含任何按鈕", async () => {
    const snap = await snapshot();
    const html = render(snap);
    for (const group of diagnosisGroups(snap).priorities) {
      const summary = summaryOf(rowOf(html, group.rule));
      const status = alertStatus(group);
      expect(status, group.rule).toEqual({ tone: "unfavorable", text: labels.format.unfavorable });
      expect(summary, group.rule).toMatch(/^<summary><svg class="alert-chev"[^>]*aria-hidden="true"/);
      expect(summary, group.rule).toContain(`<span class="alert-loz"><span class="ui-lozenge" data-tone="unfavorable">${labels.format.unfavorable}</span></span>`);
      expect(summary, group.rule).toContain(`<h3 class="alert-title">${group.headline}</h3>`);
      expect(summary, group.rule).toContain(`<span class="alert-explain">${group.cause}${group.next_step}</span>`);
      expect(summary, group.rule).not.toContain("<button");
    }
  });

  it("同一列 summary 之外：影響金額（L1、number-link impact-amount、依 favorableDirection 上色）與「看明細」「加入待辦」兩顆按鈕", async () => {
    const snap = await snapshot();
    const html = render(snap);
    const priorities = diagnosisGroups(snap).priorities;
    expect(priorities.map(group => group.impact_cents)).toEqual(["-315.00", "-250.00", "-150.00"]);
    for (const group of priorities) {
      const outside = outsideDetails(rowOf(html, group.rule));
      expect(outside, group.rule).toMatch(new RegExp(`^</details><p class="alert-impact"><span class="k">${labels.overview.sections.impact}</span><button type="button" class="number-link impact-amount negative" aria-label="[^"]+">${formatSignedDelta(group.impact_cents, "L1")}</button></p>`));
      expect(outside, group.rule).toContain(`<div class="alert-actions"><button type="button" class="ui-btn ui-btn-secondary">${labels.evidence.buttons.viewEvidence}</button><button type="button" class="ui-btn ui-btn-secondary">${labels.actions.buttons.addToActions}</button></div>`);
    }
    // 沒有 onCreateAction 時只有「看明細」。
    const readOnly = renderToStaticMarkup(createElement(TopThree, { snapshot: snap, onEvidence: noop }));
    expect(readOnly).not.toContain(labels.actions.buttons.addToActions);
    expect(readOnly.split(`>${labels.evidence.buttons.viewEvidence}</button>`)).toHaveLength(priorities.length + 1);
  });

  it("展開內容：限制句、其餘範圍（每個範圍一個 L2 影響金額）；沒有檔期時不出現檔期一行", async () => {
    const snap = await snapshot();
    const html = render(snap);
    const alias = demoAlias(snap.report.dataset_id);
    for (const group of diagnosisGroups(snap).priorities) {
      const body = bodyOf(rowOf(html, group.rule));
      expect(body, group.rule).toContain(`<dt>${alerts.limitation}</dt><dd>${group.caution}</dd>`);
      expect(body, group.rule).not.toContain(`<dt>${alerts.eventPeriod}</dt>`);
      if (group.scopes.length > 1) {
        expect(body, group.rule).toContain(`<dt>${alerts.relatedScopes}</dt>`);
        const others = group.scopes.slice(1);
        expect(body.match(/class="number-link impact-amount /g), group.rule).toHaveLength(others.length);
        for (const scope of others) expect(text(body), `${group.rule} ${scope.label}`).toContain(`${fill(labels.overview.topThree.memberRow, { scope: scopeLabel(scope.scope, alias), amount: "" })}${formatSignedDelta(scope.impact?.value ?? null, "L2")}`);
      } else expect(body, group.rule).not.toContain(`<dt>${alerts.relatedScopes}</dt>`);
    }
  });

  it("標題列：3 件時是「本期三件事」，範圍只標一次；依影響金額排序的 `?` 說明與「調整門檻」popover 都收合但掛載", async () => {
    const snap = await snapshot();
    const html = render(snap);
    const scope = channelsLabel(snap.report.scope.channels, demoAlias(snap.report.dataset_id));
    expect(html).toContain(`<h2 id="top-three-title">${labels.overview.sections.topThree}</h2><span class="sec-scope">${scope}</span>`);
    expect(text(element(html, 'class="sec-head"', "div")).split(scope)).toHaveLength(2);
    expect(html).toContain(`${labels.overview.sections.impactLegend}<button type="button" class="ui-help-trigger" title="${labels.overview.sections.impactLegendHelp}" aria-label="${alerts.sortHelpAria}" aria-expanded="false" aria-controls="top-three-sort-help">`);
    expect(html).toMatch(new RegExp(`<span id="top-three-sort-help" class="sort-help ui-popover ui-help-content" hidden="">${labels.overview.sections.impactLegendHelp}</span>`));
    // 門檻 popover：<details> 沒有 open，表單、說明與 testid 都在 markup 裡（M1）。
    const popover = element(html, 'class="threshold-popover"', "details");
    expect(popover).toMatch(/^<details class="threshold-popover"><summary class="ui-btn ui-btn-text">/);
    expect(popover).toContain(`>${labels.overview.sections.adjustThreshold}</summary>`);
    expect(popover).toContain('data-testid="threshold-form-overview"');
    expect(popover).toContain('aria-describedby="top-three-threshold-help"');
    expect(popover).toContain(`<p class="note" id="top-three-threshold-help">${fill(labels.diagnosis.list.thresholdHelp, { amount: formatAmountL3("0.00") })}</p>`);
    expect(popover).toContain(`>${labels.meeting.form.threshold}<input`);
    expect(popover).toContain(`>${labels.shell.buttons.apply}</button>`);
    expect(html.match(/id="top-three-threshold-help"/g)).toHaveLength(1);
  });

  it("另有未列出的群組時，底部是「查看全部 {n} 項健檢結果」（n＝健檢結果總數）；沒傳 onOpenDiagnosis 時停用", async () => {
    const snap = await snapshot();
    const result = diagnosisGroups(snap);
    expect(result.omitted_group_count).toBeGreaterThan(0);
    const viewAll = fill(alerts.viewAll, { n: result.groups.length });
    expect(render(snap)).toContain(`<p class="list-foot"><button type="button" class="ui-btn ui-btn-text" disabled="">${viewAll}</button></p>`);
    expect(render(snap, { onOpenDiagnosis: noop })).toContain(`<p class="list-foot"><button type="button" class="ui-btn ui-btn-text">${viewAll}</button></p>`);
    // v2 的「另有 n 組未列出」與「沒有要先查的項目」不再出現在總覽三件事。
    const html = render(snap);
    expect(html).not.toContain(fill(labels.overview.notes.omittedGroups, { n: result.omitted_group_count }));
    expect(html).not.toContain(labels.overview.notes.noPriorities);
  });
});

describe("V3-4a 本期三件事：不足 3 件與 0 件的句型（以門檻初始值模擬高門檻）", () => {
  it("1–2 件：標題改成「本期要先看的事（{n} 件）」，底部仍可查看全部", async () => {
    const snap = await snapshot();
    for (const threshold of ["200.00", "300.00"]) {
      const result = diagnosisGroups(snap, { importanceThreshold: threshold });
      expect(result.priorities.length, threshold).toBeGreaterThan(0);
      expect(result.priorities.length, threshold).toBeLessThan(3);
      const html = render(snap, { initialThreshold: threshold });
      expect(html, threshold).toContain(`<h2 id="top-three-title">${fill(alerts.titleCount, { n: result.priorities.length })}</h2>`);
      expect(html, threshold).not.toContain(`<h2 id="top-three-title">${labels.overview.sections.topThree}</h2>`);
      expect([...html.matchAll(/data-testid="overview-priority-([A-Z_]+)"/g)].map(match => match[1]), threshold).toEqual(result.priorities.map(group => group.rule));
      expect(html, threshold).toContain(fill(alerts.viewAll, { n: result.groups.length }));
      // 表單顯示目前套用的門檻（到分）。
      expect(html, threshold).toContain(`value="${result.importance_threshold}"`);
      expect(html, threshold).toContain(fill(labels.diagnosis.list.thresholdHelp, { amount: formatAmountL3(result.importance_threshold) }));
    }
  });

  it("0 件：role=status 的「本期沒有需要先看的事。」＋「前往通路健檢」；沒有清單與底部連結，門檻表單仍在", async () => {
    const snap = await snapshot();
    const result = diagnosisGroups(snap, { importanceThreshold: "100000.00" });
    expect(result.priorities).toHaveLength(0);
    const html = render(snap, { initialThreshold: "100000.00", onOpenDiagnosis: noop });
    expect(html).toContain(`<div class="alert-empty"><p role="status">${alerts.empty}</p><button type="button" class="ui-btn ui-btn-text">${alerts.goDiagnosis}</button></div>`);
    expect(html).toContain(`<h2 id="top-three-title">${labels.overview.sections.topThree}</h2>`);
    expect(html).not.toContain('class="alert-list"');
    expect(html).not.toContain('class="list-foot"');
    expect(html).toContain('data-testid="threshold-form-overview"');
    expect(html).toContain('id="top-three-threshold-help"');
    // 沒傳 onOpenDiagnosis 時「前往通路健檢」仍渲染但停用。
    expect(render(snap, { initialThreshold: "100000.00" })).toContain(`<button type="button" class="ui-btn ui-btn-text" disabled="">${alerts.goDiagnosis}</button>`);
  });

  it("門檻初始值不合法時退回 0.00（三列）", async () => {
    const snap = await snapshot();
    const html = render(snap, { initialThreshold: "abc" });
    expect(html.match(/data-testid="overview-priority-/g)).toHaveLength(3);
    expect(html).toContain(`value="${formatAmountL3("0.00")}"`);
  });
});

describe("V3-4a 本期三件事：狀態標籤與檔期", () => {
  it("資料缺漏排最前：狀態標籤「資料待補」（warning），影響金額是中性文字不是按鈕", async () => {
    const snap = await snapshot("errors/missing_cogs");
    const html = render(snap);
    const missing = diagnosisGroups(snap).priorities[0];
    expect(missing.rule).toBe("MISSING_CRITICAL_DATA");
    const row = rowOf(html, missing.rule);
    expect(summaryOf(row)).toContain(`<span class="ui-lozenge" data-tone="warning">${labels.shell.status.missing}</span>`);
    expect(outsideDetails(row)).toContain(`<p class="alert-impact"><span class="k">${labels.overview.sections.impact}</span><span class="impact-amount neutral">${labels.shell.status.missing}</span></p>`);
  });

  it("alertStatus：有利依 favorableDirection 顯示「有利」；金額未知或為 0 不顯示標籤", () => {
    const group = (impact: string | null, missing = false): Pick<DiagnosisGroup, "missing" | "impact_cents"> => ({ missing, impact_cents: impact });
    expect(alertStatus(group("120.00"))).toEqual({ tone: "favorable", text: labels.format.favorable });
    expect(alertStatus(group("-120.00"))).toEqual({ tone: "unfavorable", text: labels.format.unfavorable });
    expect(alertStatus(group(null))).toBeNull();
    expect(alertStatus(group("0.00"))).toBeNull();
    expect(alertStatus(group(null, true))).toEqual({ tone: "warning", text: labels.shell.status.missing });
  });

  it("本期與檔期重疊時，每列展開內容多一行「檔期」（去掉括號）；不重疊時沒有", async () => {
    const snap = await snapshot();
    const { start, end } = snap.report.current.period;
    const overlapping: EventSet = { filename: "events.csv", rows: [{ start, end, label: "Summer Sale", line: 2 }, { start, end, label: "Summer Sale", line: 3 }, { start, end, label: "Member Day", line: 4 }] };
    const html = render(snap, { events: overlapping });
    const value = fill(alerts.eventValue, { label: ["Summer Sale", "Member Day"].join(labels.events.joiner) });
    for (const group of diagnosisGroups(snap).priorities) {
      const row = rowOf(html, group.rule);
      expect(bodyOf(row), group.rule).toContain(`<dt>${alerts.eventPeriod}</dt><dd>${value}</dd>`);
      expect(summaryOf(row), group.rule).toContain(`<h3 class="alert-title">${group.headline}</h3>`);
    }
    expect(value).not.toMatch(/^（|）$/);
    const before = { filename: "events.csv", rows: [{ start: "2020-01-01", end: "2020-01-02", label: "Old", line: 2 }] };
    expect(render(snap, { events: before })).not.toContain(`<dt>${alerts.eventPeriod}</dt>`);
  });
});
