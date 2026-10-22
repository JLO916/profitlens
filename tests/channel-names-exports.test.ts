import { describe, expect, it } from "vitest";
import { CHANNEL_SETTINGS_VERSION, type ChannelSettings } from "@/application/channel-settings";
import { addActionDraft, emptyActionWorkspace, type ActionSource } from "@/application/action-workspace";
import { snapshotResolver } from "@/application/copy";
import { createDecisionSession } from "@/application/decision";
import { exportDecisionCsv, exportDecisionJson, exportDecisionMarkdown } from "@/application/decision-export";
import { buildExcelWorkbook, type ExcelCell, type ExcelSheet, type ExcelWorkbook } from "@/application/excel-export";
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown } from "@/application/manager-summary";
import { exportMeetingMarkdown, finalizeMeeting, type Meeting } from "@/application/meeting";
import { createReviewSession, updateReviewSession } from "@/application/review-session";
import { emptyScenarioWorkspace } from "@/application/scenario-workspace";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { exportWorkspaceDecision } from "@/application/workspace-decision-export";
import { currentViewDecisionContext } from "@/components/meeting-entry";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

/*
 * V42-1a（06_BATCHES V42-1a 第 5 項；PRD §12）：人讀匯出的範圍文字用設定的顯示名稱——一頁摘要、會議紀錄、決策 Markdown 與 Excel 待辦工作表
 * 都和同一份快照的畫面用同一組名稱；CSV 的 channel 欄、JSON 與會議紀錄本身維持通路代碼。沒有設定時（示範／golden）輸出逐字不變，
 * 那一半由 export-numeric-baseline 與備份位元組測試把關，這裡只驗「沒給解析器時仍是代碼」。
 */
const SETTINGS: ChannelSettings = { version: CHANNEL_SETTINGS_VERSION, channels: [{ code: "DTC", label: "官網" }], groups: [] };
const NAME = "官網";
const NOW = "2026-10-03T06:00:00.000Z";
const excel = labels.exports.excel;

async function prepared() {
  const input = synthetic4ChannelInput();
  const dataset = validateDataset(input).dataset!;
  const hash = await hashInput(input);
  const named = await createSnapshot(dataset, { channels: ["DTC"] }, hash, SETTINGS);
  const plain = await createSnapshot(dataset, { channels: ["DTC"] }, hash);
  return { input, dataset, hash, named, plain };
}
async function goldenSource(): Promise<ActionSource> {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), revision: 1 };
}
function meetingFrom(input: ReturnType<typeof synthetic4ChannelInput>, dataset: ReturnType<typeof validateDataset>["dataset"], snapshot: WorkspaceSnapshot): Meeting {
  const review = updateReviewSession(createReviewSession({ input, dataset: dataset!, snapshot, revision: 1 }, "e", "rev-names"), { name: "十月例會", meeting_date: "2026-10-03" });
  return finalizeMeeting({ review, snapshot, scenarios: emptyScenarioWorkspace("e"), actions: emptyActionWorkspace(), date: "2026-10-03", now: NOW });
}
const value = (cell: ExcelCell) => cell.kind === "null" ? null : cell.value;
const records = (sheet: ExcelSheet) => sheet.rows.map(row => Object.fromEntries(sheet.header.map((header, index) => [header, value(row[index])])));
const sheetOf = (workbook: ExcelWorkbook, key: keyof typeof excel.sheets) => workbook.sheets.find(sheet => sheet.name === excel.sheets[key])!;

describe("V42-1a 人讀匯出的範圍文字用設定的顯示名稱", () => {
  it("一頁摘要 Markdown：帶解析器時範圍與通路表寫顯示名稱；沒給解析器與通路比較 CSV 維持代碼", async () => {
    const { named, plain } = await prepared();
    const summary = buildManagerSummary(named);
    const copy = labels.meeting.managerSummary;
    const withNames = exportManagerSummaryMarkdown(summary, undefined, { resolver: snapshotResolver(named) });
    expect(withNames).toContain(fill(copy.mdMeta, { asOf: summary.data_as_of, channels: NAME }));
    expect(withNames).toContain(`| ${NAME} |`);
    const plainText = exportManagerSummaryMarkdown(buildManagerSummary(plain));
    expect(plainText).toContain(fill(copy.mdMeta, { asOf: summary.data_as_of, channels: "DTC" }));
    expect(plainText).not.toContain(NAME);
    // 同一份摘要沒給解析器也仍是代碼（呼叫端決定是否套名稱）。
    expect(exportManagerSummaryMarkdown(summary)).toBe(plainText);
    const csv = exportChannelComparisonCsv(summary);
    expect(csv).toContain('"DTC"');
    expect(csv).not.toContain(NAME);
  });

  it("會議紀錄 Markdown：帶解析器時固定範圍的通路寫顯示名稱；紀錄本身（source_fixed、JSON）維持代碼", async () => {
    const { input, dataset, named } = await prepared();
    const meeting = meetingFrom(input, dataset, named);
    expect(meeting.source_fixed.channels).toEqual(["DTC"]);
    expect(JSON.stringify(meeting)).not.toContain(NAME);
    const record = labels.meeting.record;
    const line = (channels: string) => fill(record.mdField, { field: labels.exports.csv.columns.channels, value: channels });
    expect(exportMeetingMarkdown(meeting, undefined, { resolver: snapshotResolver(named) })).toContain(line(NAME));
    const plainText = exportMeetingMarkdown(meeting);
    expect(plainText).toContain(line("DTC"));
    expect(plainText).not.toContain(NAME);
  });

  it("決策 Markdown：帶解析器時範圍寫顯示名稱；JSON 與 CSV 維持代碼；工作區決策匯出對同一版本資料自動套名稱", async () => {
    const { input, dataset, named } = await prepared();
    const session = createDecisionSession(dataset, named, 1);
    expect(exportDecisionMarkdown(session, [], [], undefined, [], { resolver: snapshotResolver(named) })).toContain(NAME);
    const plainText = exportDecisionMarkdown(session, [], []);
    expect(plainText).toContain("DTC");
    expect(plainText).not.toContain(NAME);
    expect(exportDecisionJson(session, [], [])).not.toContain(NAME);
    expect(exportDecisionCsv(session, [], [])).not.toContain(NAME);
    const source = { input, dataset, snapshot: named, revision: 1 };
    expect(exportWorkspaceDecision("md", source, emptyScenarioWorkspace("e"), emptyActionWorkspace(), null)).toContain(NAME);
    expect(exportWorkspaceDecision("json", source, emptyScenarioWorkspace("e"), emptyActionWorkspace(), null)).not.toContain(NAME);
    expect(exportWorkspaceDecision("csv", source, emptyScenarioWorkspace("e"), emptyActionWorkspace(), null)).not.toContain(NAME);
  });

  it("Excel 待辦工作表：與活頁簿同一版本資料的待辦寫顯示名稱（與通路工作表同一組）；引用其他資料集的待辦維持該資料集的代碼", async () => {
    const { input, dataset, named, plain } = await prepared();
    const source: ActionSource = { input, dataset, snapshot: named, revision: 1 };
    let actions = addActionDraft(emptyActionWorkspace(), source, "A");
    actions = addActionDraft(actions, await goldenSource(), "B");
    const workbook = buildExcelWorkbook({ summary: buildManagerSummary(named), snapshot: named, dataset, actions });
    const scopes = records(sheetOf(workbook, "actions")).map(row => String(row[excel.columns.actions.scope]));
    expect(scopes).toHaveLength(2);
    expect(scopes[0]).toContain(NAME);
    expect(scopes[0]).not.toContain("DTC");
    expect(scopes[1]).toContain("DTC");
    expect(scopes[1]).not.toContain(NAME);
    const channelRows = records(sheetOf(workbook, "channels")).map(row => String(row[excel.columns.channels.channel]));
    expect(channelRows).toContain(NAME);
    // 沒有設定的快照：待辦範圍仍是代碼（export-numeric-baseline 的守門條件）。
    const plainWorkbook = buildExcelWorkbook({ summary: buildManagerSummary(plain), snapshot: plain, dataset, actions });
    const plainScopes = records(sheetOf(plainWorkbook, "actions")).map(row => String(row[excel.columns.actions.scope]));
    expect(plainScopes[0]).toContain("DTC");
    expect(plainScopes.join("\n")).not.toContain(NAME);
  });

  it("目前檢視的待辦範圍（列印與 PDF 的決策脈絡）：同一版本資料的待辦寫顯示名稱，其他資料集的待辦維持代碼", async () => {
    const { input, dataset, named } = await prepared();
    let actions = addActionDraft(emptyActionWorkspace(), { input, dataset, snapshot: named, revision: 1 }, "A");
    actions = addActionDraft(actions, await goldenSource(), "B");
    const [own, foreign] = currentViewDecisionContext(named, actions).actions;
    expect(own.scopeLabel).toContain(NAME);
    expect(own.scopeLabel).not.toContain("DTC");
    expect(foreign.scopeLabel).toContain("DTC");
    expect(foreign.scopeLabel).not.toContain(NAME);
  });
});
