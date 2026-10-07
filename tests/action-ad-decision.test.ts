import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fixture } from "./helpers/fixtures";
import { validateDataset } from "@/domain/validation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { createDecisionSession, emptyDecisionWorkspace } from "@/application/decision";
import { exportDecisionCsv, exportDecisionJson, exportDecisionMarkdown } from "@/application/decision-export";
import { exportWorkspaceDecision } from "@/application/workspace-decision-export";
import { emptyScenarioWorkspace } from "@/application/scenario-workspace";
import { csvHeader, csvHeaderKey } from "@/application/copy";
import { exportWorkspaceBackup, restoreWorkspaceBackup } from "@/application/workspace-backup";
import { AD_DECISIONS, actionDocuments, addActionDraft, confirmBoundAction, editActionManagement, editBoundAction, emptyActionWorkspace, moveActionUp, pinAction, setAdDecision, type ActionSource, type ActionWorkspace } from "@/application/action-workspace";
import { ActionsWorkbench } from "@/components/actions-workbench";
import { fill, labels } from "@/i18n";
import { scanLabels } from "../scripts/lib/copy-scan.mjs";

/*
 * V3-9a（PRD §10.1 F13、§7.5 第 7 點）：待辦的廣告決策標籤（暫停／調整／加碼；使用者自選、不自動判斷）。
 * 資料（setAdDecision）、決策匯出三種格式（有值與無值）、備份來回、SSR 編輯器 select 與卡片徽章、labels 新鍵的文案規則。
 */
const ad = labels.actions.adDecisionV3;
async function source(): Promise<ActionSource> {
  const input = fixture(); const dataset = validateDataset(input).dataset!;
  return { input, dataset, revision: 1, snapshot: await createSnapshot(dataset, { channels: ["DTC"] }, await hashInput(input)) };
}
async function drafts(ids: string[]): Promise<{ s: ActionSource; w: ActionWorkspace }> {
  const s = await source(); let w = emptyActionWorkspace();
  for (const id of ids) w = addActionDraft(w, s, id);
  return { s, w };
}
/** 依英文欄名 key 讀 CSV（支援引號），並檢查每一列的欄數都與表頭相同。 */
function csvRows(csv: string): { headers: string[]; keys: string[]; rows: Record<string, string>[] } {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  const text = csv.replace(/^\uFEFF/, "");
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (quoted) { if (char === "\"" && text[index + 1] === "\"") { cell += "\""; index++; } else if (char === "\"") quoted = false; else cell += char; continue; }
    if (char === "\"") quoted = true; else if (char === ",") { row.push(cell); cell = ""; } else if (char === "\n" || char === "\r") { if (char === "\r" && text[index + 1] === "\n") index++; row.push(cell); rows.push(row); row = []; cell = ""; } else cell += char;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift()!;
  const keys = headers.map(csvHeaderKey);
  for (const values of rows) expect(values).toHaveLength(headers.length);
  return { headers, keys, rows: rows.map(values => Object.fromEntries(keys.map((key, index) => [key, values[index]]))) };
}
/** V3-9a 之前的決策 CSV 欄序（D11：既有欄名與欄序不變，只能在後面加欄）。 */
const V2_DECISION_HEADERS = ["schema_version", "scenario_version", "metric_version", "dataset_id", "dataset_hash", "filter_hash", "as_of", "currency", "timezone", "amount_basis", "revision", "snapshot_status", "period", "scope", "comparison_mode", "previous_days", "current_days", "row_type", "item_id", "item_name", "status", "field", "value", "reason_codes", "fact_ids", "source_refs", "analysis_scope", "context_id", "plan_revision", "analysis_epoch"];

describe("V3-9a F13 setAdDecision（使用者自選，不自動判斷）", () => {
  it("新增的待辦沒有標（不補值）；設定、改值、清除（undefined）只改這一欄", async () => {
    const { w: base } = await drafts(["A", "B"]);
    expect(base.items.every(item => !("ad_decision" in item))).toBe(true);
    const tracked = editActionManagement(pinAction(base, "A", true), "A", { execution_status: "in_progress" }, "2026-10-01");
    const marked = setAdDecision(tracked, "A", "pause");
    const a = marked.items.find(item => item.card.id === "A")!;
    expect(a.ad_decision).toBe("pause");
    const { ad_decision: _value, ...rest } = a; void _value;
    expect(rest).toEqual(tracked.items.find(item => item.card.id === "A"));
    expect(marked.items.find(item => item.card.id === "B")).toEqual(tracked.items.find(item => item.card.id === "B"));
    expect(setAdDecision(marked, "A", "increase").items[0].ad_decision).toBe("increase");
    const cleared = setAdDecision(marked, "A", undefined);
    expect(cleared.items[0]).not.toHaveProperty("ad_decision");
    expect(cleared.items[0]).toEqual(tracked.items[0]);
    // 狀態更新日不因標籤改變（只有執行狀態改變才寫）。
    expect(setAdDecision(tracked, "B", "adjust").items.find(item => item.card.id === "B")).not.toHaveProperty("status_updated_at");
  });
  it("不在三種之內的值與不存在的待辦都拒絕；三種值依 AD_DECISIONS 的順序", async () => {
    const { w } = await drafts(["A"]);
    expect([...AD_DECISIONS]).toEqual(["pause", "adjust", "increase"]);
    expect(() => setAdDecision(w, "A", "stop" as never)).toThrow("INVALID_ACTION_FIELD");
    expect(() => setAdDecision(w, "missing", "pause")).toThrow("UNKNOWN_ACTION");
    expect(() => actionDocuments({ ...w, items: [{ ...w.items[0], ad_decision: "stop" as never }] })).toThrow("INVALID_ACTION_FIELD");
  });
  it("置頂、往上移、改狀態、改欄位、確認引用都保留標籤", async () => {
    const { s, w: base } = await drafts(["A", "B"]);
    let w = setAdDecision(base, "B", "adjust");
    w = pinAction(w, "B", true);
    w = moveActionUp(w, "A");
    w = editActionManagement(w, "B", { execution_status: "blocked" }, "2026-10-02");
    const fact = createDecisionSession(s.dataset, s.snapshot, 1).facts.find(entry => entry.metric === "net_revenue" && entry.scope.kind === "channel")!;
    w = editBoundAction(w, "B", { problem: "檢討投放", fact_ids: [fact.id] });
    w = confirmBoundAction(w, "B");
    expect(w.items.find(item => item.card.id === "B")).toMatchObject({ ad_decision: "adjust", pinned: true, execution_status: "blocked", card: { problem: "檢討投放", evidence_confirmed: true } });
  });
});

describe("V3-9a F13 決策匯出（Markdown／CSV／JSON）：有標才出現，既有欄位、順序與數值不變", () => {
  async function exported() {
    const { s, w: base } = await drafts(["A", "B"]);
    const plain = editBoundAction(editBoundAction(base, "A", { problem: "提高官網轉換" }), "B", { problem: "檢討市集廣告" });
    const marked = setAdDecision(plain, "B", "increase");
    const session = createDecisionSession(s.dataset, s.snapshot, 1);
    return { s, session, plain, marked };
  }
  it("JSON：actions[].ad_decision 只在有標的待辦出現，放在最後；其他鍵與值和沒標時完全相同", async () => {
    const { session, plain, marked } = await exported();
    const before = JSON.parse(exportDecisionJson(session, [], [], plain)), after = JSON.parse(exportDecisionJson(session, [], [], marked));
    expect(after.actions[1].ad_decision).toBe("increase");
    expect(after.actions[0]).not.toHaveProperty("ad_decision");
    expect(Object.keys(after.actions[1])).toEqual([...Object.keys(before.actions[1]), "ad_decision"]);
    const { ad_decision: _value, ...rest } = after.actions[1]; void _value;
    expect(rest).toEqual(before.actions[1]);
    expect(after.actions[0]).toEqual(before.actions[0]);
    expect({ ...after, actions: [] }).toEqual({ ...before, actions: [] });
  });
  it("CSV：最後新增一欄 ad_decision（欄名「廣告決策 (ad_decision)」），既有 30 欄的欄名與欄序不變；有標的待辦每一列都帶值，其他列空白；不另成一列 field", async () => {
    const { session, plain, marked } = await exported();
    const before = csvRows(exportDecisionCsv(session, [], [], plain)), after = csvRows(exportDecisionCsv(session, [], [], marked));
    expect(after.keys).toEqual([...V2_DECISION_HEADERS, "ad_decision"]);
    expect(after.headers.slice(0, -1)).toEqual(V2_DECISION_HEADERS.map(csvHeader));
    expect(after.headers.at(-1)).toBe(`${ad.csvColumn} (ad_decision)`);
    expect(before.headers).toEqual(after.headers);
    expect(after.rows).toHaveLength(before.rows.length);
    after.rows.forEach((row, index) => {
      const { ad_decision: value, ...rest } = row;
      const { ad_decision: empty, ...original } = before.rows[index];
      expect(rest).toEqual(original);
      expect(empty).toBe("");
      expect(value).toBe(row.item_id === "B" && (row.row_type === "manual_action" || row.row_type === "action_fact") ? "increase" : "");
    });
    expect(after.rows.filter(row => row.item_id === "B" && row.ad_decision === "increase").length).toBeGreaterThan(10);
    expect(after.rows.some(row => row.field === "ad_decision")).toBe(false);
  });
  it("Markdown：有標的待辦在主層多一行「廣告決策：加碼」（沒標不印）；其他內容不變", async () => {
    const { session, plain, marked } = await exported();
    const at = new Date("2026-10-07T00:00:00.000Z");
    const before = exportDecisionMarkdown(session, [], [], plain, [], { generatedAt: at }), after = exportDecisionMarkdown(session, [], [], marked, [], { generatedAt: at });
    const line = fill(labels.ui.decisionExport.fieldLine, { label: ad.field, value: ad.options.increase });
    expect(line).toBe("- 廣告決策：加碼");
    expect(after.split("\n").filter(text => text === line)).toHaveLength(1);
    const sectionB = after.slice(after.indexOf(fill(labels.ui.decisionExport.actionHeading, { priority: 2, problem: "檢討市集廣告" })));
    expect(sectionB.slice(0, sectionB.indexOf("<details>"))).toContain(line);
    expect(after.split("\n").filter(text => text !== line)).toEqual(before.split("\n"));
    expect(before).not.toContain(ad.field);
    expect(after).not.toContain("ad_decision");
  });
  it("工作區決策匯出（頂欄與待辦頁「匯出本頁」用的 exportWorkspaceDecision）三種格式都帶到標籤", async () => {
    const { s, marked } = await exported();
    const scenarios = emptyScenarioWorkspace("e");
    const json = JSON.parse(exportWorkspaceDecision("json", s, scenarios, marked, null));
    expect(json.actions.map((action: { id: string; ad_decision?: string }) => [action.id, action.ad_decision])).toEqual([["A", undefined], ["B", "increase"]]);
    const csv = csvRows(exportWorkspaceDecision("csv", s, scenarios, marked, null));
    expect(csv.keys.at(-1)).toBe("ad_decision");
    expect(new Set(csv.rows.filter(row => row.ad_decision).map(row => row.item_id))).toEqual(new Set(["B"]));
    expect(exportWorkspaceDecision("md", s, scenarios, marked, null)).toContain(`- ${ad.field}：${ad.options.increase}`);
  });
});

describe("V3-9a F13 備份來回", () => {
  it("每一種標籤都寫進備份 v5 並原樣讀回；沒標的待辦讀回 undefined", async () => {
    const { s, w: base } = await drafts(["A", "B", "C", "D"]);
    const w = setAdDecision(setAdDecision(setAdDecision(base, "A", "pause"), "B", "adjust"), "C", "increase");
    const text = await exportWorkspaceBackup({ input: s.input, filters: s.snapshot.report.scope, id: "golden", revision: 1, decision: emptyDecisionWorkspace(), action_workspace: w });
    expect(JSON.parse(text).payload.action_workspace.items.map((item: { ad_decision?: string }) => item.ad_decision)).toEqual(["pause", "adjust", "increase", undefined]);
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.action_workspace.items.map(item => item.ad_decision)).toEqual(["pause", "adjust", "increase", undefined]);
    expect(actionDocuments(restored.action_workspace).map(doc => doc.ad_decision)).toEqual(["pause", "adjust", "increase", undefined]);
  });
});

describe("V3-9a F13 介面（SSR）：編輯器 select 與卡片徽章", () => {
  const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(ActionsWorkbench, { onChange: () => {}, onEvidence: () => {}, onExport: () => {}, ...props } as never));
  const options = (html: string) => [...html.matchAll(/<option value="([^"]*)"[^>]*>([^<]*)<\/option>/g)].map(match => [match[1], match[2]]);
  it("清單檢視：每項在狀態之後有「廣告決策」select（不標／暫停／調整／加碼），目前值被選取；徽章只在有標的項目", async () => {
    const { s, w: base } = await drafts(["A", "B"]);
    const w = setAdDecision(base, "A", "adjust");
    const html = render({ workspace: w, source: s, view: "list" });
    for (const [n, selected] of [[1, "adjust"], [2, ""]] as const) {
      const item = html.slice(html.indexOf(`data-testid="action-${n}"`), n === 1 ? html.indexOf('data-testid="action-2"') : undefined);
      const select = item.slice(item.indexOf('data-testid="action-ad-decision"'), item.indexOf("</select>", item.indexOf('data-testid="action-ad-decision"')) + 9);
      expect(options(select), `action-${n}`).toEqual([["", ad.none], ["pause", ad.options.pause], ["adjust", ad.options.adjust], ["increase", ad.options.increase]]);
      expect(select).toContain(`<option value="${selected}" selected="">`);
      expect(item.indexOf(`aria-label="${labels.actions.status}"`)).toBeLessThan(item.indexOf('data-testid="action-ad-decision"'));
      expect(item).toContain(`>${ad.field}</label>`);
    }
    expect(html).toContain(`data-testid="action-1-ad-decision">${fill(ad.badge, { decision: ad.options.adjust })}</span>`);
    expect(html).not.toContain('data-testid="action-2-ad-decision"');
  });
  it("看板：有標的卡在狀態標籤旁顯示「廣告加碼」徽章（中性色 C8 lozenge）；沒標不渲染；看板本身沒有 select", async () => {
    const { s, w: base } = await drafts(["A", "B"]);
    const html = render({ workspace: setAdDecision(base, "B", "increase"), source: s, view: "board" });
    const badge = `<span class="ui-lozenge action-ad-decision-badge" data-testid="board-card-2-ad-decision">${fill(ad.badge, { decision: ad.options.increase })}</span>`;
    expect(html).toContain(badge);
    expect(fill(ad.badge, { decision: ad.options.increase })).toBe("廣告加碼");
    expect(html).not.toContain('data-testid="board-card-1-ad-decision"');
    expect(html).not.toContain('data-testid="action-ad-decision"');
    const card = html.slice(html.indexOf('data-testid="board-card-2"'));
    expect(card.indexOf(labels.actions.statuses.not_started)).toBeLessThan(card.indexOf(badge));
    expect(card.indexOf(badge)).toBeLessThan(card.indexOf('class="board-card-evidence"'));
    expect(render({ workspace: base, source: s, view: "board" })).not.toContain("action-ad-decision-badge");
  });
  it("看板開著抽屜：select 只在抽屜裡一份", async () => {
    const { s, w: base } = await drafts(["A", "B"]);
    const html = render({ workspace: setAdDecision(base, "A", "pause"), source: s, view: "board", initial: { editing: "A" } });
    expect(html.split('data-testid="action-ad-decision"').length - 1).toBe(1);
    expect(html.slice(html.indexOf('data-testid="action-drawer"'))).toContain('data-testid="action-ad-decision"');
    expect(html).toContain('<option value="pause" selected="">');
  });
});

describe("V3-9a F13 labels（actions.adDecisionV3）", () => {
  it("新字串沒有黑名單詞、箭頭、｜、驚嘆號、問句；欄位名與 CSV 欄名一致", () => {
    const strings = [ad.field, ad.none, ad.options.pause, ad.options.adjust, ad.options.increase, ad.badge, ad.csvColumn];
    const { metrics } = scanLabels({ actions: { adDecisionV3: ad } });
    for (const [key, value] of Object.entries(metrics)) expect(value, key).toBe(0);
    for (const text of strings) expect(text).not.toMatch(/[?？!！｜→]|注意：|行動|數據|變化|口徑|工作區/);
    expect(ad.csvColumn).toBe(ad.field);
    expect(Object.keys(ad.options)).toEqual([...AD_DECISIONS]);
    expect(ad.badge).toContain("{decision}");
  });
});
