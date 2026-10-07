// V3-7 §6.5 匯出正規化比對：Markdown、Excel 允許的差異只有四行版頭（§7.9）、Markdown 負號 U+2212、
// 管理損益表的括號負數（D-V3-8，V3-9 才有）與中文標籤；其餘內容與數值逐格相同。
// 這裡把新版輸出「去掉版頭、負號換回 ASCII」後，與 V3-7 開工前（71e9f5f）存下的輸出逐字比對（tests/fixtures/export-format-baseline-v3-6.json）。
import { addActionDraft, editActionManagement, emptyActionWorkspace, pinAction, type ActionWorkspace } from "@/application/action-workspace";
import { createDecisionSession, saveScenario } from "@/application/decision";
import { exportDecisionMarkdown } from "@/application/decision-export";
import { buildExcelWorkbook, type ExcelWorkbook } from "@/application/excel-export";
import { buildManagerSummary, exportManagerSummaryMarkdown, type SummaryDecisionContext } from "@/application/manager-summary";
import { exportMeetingMarkdown, finalizeMeeting } from "@/application/meeting";
import { metricDefinitions, MINUS } from "@/application/presentation";
import { createReviewSession, rebuildReviewSnapshot, selectReviewScenario, syncReviewPins, updateReviewSession } from "@/application/review-session";
import { emptyScenarioWorkspace, ensureScenarioContext, scenarioContextDecision, scenarioSelectionRef, updateScenarioContext } from "@/application/scenario-workspace";
import { createSnapshot, hashInput } from "@/application/workspace";
import { exportWorkspaceDecision } from "@/application/workspace-decision-export";
import { compareProducts } from "@/domain/product-comparison";
import type { AnalysisFilters } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { SCENARIO_GOLDEN } from "./export-numeric";
import { fixture } from "./fixtures";

/** 測試用固定產出時間：2026-10-05 06:32Z＝台北 14:32。 */
export const FIXED_GENERATED_AT = new Date("2026-10-05T06:32:00.000Z");
const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 版頭第 2 行（報表名）與第 4 行（版本與產出時間）的樣式；第 1 行（資料集）與第 3 行（期間與單位）以位置判定。 */
function headerPatterns() {
  const copy = labels.exports.headerV3;
  const title = fill(copy.reportTitle, { metric: metricDefinitions.contribution_after_marketing.label });
  const version = new RegExp(`^${escapeRegExp(copy.versionLine).replace("\\{version\\}", "\\S+").replace("\\{time\\}", "\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}")}$`);
  return { title, version };
}
/**
 * V3-9a F12 損益兩平 MER（breakeven-mer-v1，D-V3-17＝C）是新增的列：Markdown 的其他常用指標表最後多一列、技術細節多一行版本；
 * Excel 摘要表多一列（其他常用指標）、指標定義表的技術區多一列版本。正規化時拿掉這些新增列，其餘內容仍須與 V3-7 開工前逐字相同（既有列與數值不變）。
 */
const isBreakevenMarkdownLine = (line: string) => line.startsWith(`| ${labels.assist.breakevenV3.label} |`) || line.startsWith(`- ${labels.assist.breakevenV3.technicalVersion}：`);
const isBreakevenExcelRow = (row: ExcelWorkbook["sheets"][number]["rows"][number]) => row[1]?.kind === "text" && (row[1].value === labels.assist.breakevenV3.label || row[1].value === labels.assist.breakevenV3.excelVersion);
/**
 * Markdown 正規化：去掉每一段四行版頭（第 2 行是報表名、第 4 行是版本與產出時間；行尾換行用的兩個空白一併去掉）與其後一個空行，
 * U+2212 換回 ASCII「-」，全形括號包住的金額（有千分位或小數）換成「-金額」；V3-9a 起另拿掉損益兩平 MER 的新增列（isBreakevenMarkdownLine）。
 */
export function normalizeMarkdown(text: string): string {
  const { title, version } = headerPatterns();
  const lines = text.split("\n");
  const out: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const second = lines[index + 1]?.trimEnd(), fourth = lines[index + 3]?.trimEnd();
    if (second === title && fourth !== undefined && version.test(fourth)) {
      index += 3;
      if (lines[index + 1] === "") index += 1;
      continue;
    }
    if (isBreakevenMarkdownLine(lines[index])) continue;
    out.push(lines[index]);
  }
  return out.join("\n").replaceAll(MINUS, "-").replace(/（(\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+\.\d+)）/g, "-$1");
}
/**
 * V3-9b F14／F13 是新增的內容：活頁簿最後多一張「管理損益表」工作表（D-V3-8），待辦工作表最後多一欄「廣告決策」。
 * 正規化時拿掉這張工作表與這一欄（表頭、格式與每列的最後一格），其餘仍須與 V3-7 開工前逐字相同。
 */
const isPnlSheet = (sheet: ExcelWorkbook["sheets"][number]) => sheet.name === labels.exports.variantsV3.pnlSheet;
function withoutAdDecisionColumn(sheet: ExcelWorkbook["sheets"][number]): ExcelWorkbook["sheets"][number] {
  const at = sheet.name === labels.excelExport.sheets.actions ? sheet.header.indexOf(labels.actions.adDecisionV3.csvColumn) : -1;
  if (at < 0) return sheet;
  const drop = <T,>(list: readonly T[]) => list.filter((_, index) => index !== at);
  return { ...sheet, header: drop(sheet.header), rows: sheet.rows.map(drop), ...(sheet.formats ? { formats: drop(sheet.formats) } : {}) };
}
/** Excel 正規化：摘要工作表拿掉「版頭」區塊的列；V3-9a 起另拿掉損益兩平 MER 的新增列（isBreakevenExcelRow）；V3-9b 起拿掉管理損益表工作表與待辦工作表的廣告決策欄；其餘工作表、表頭、每一格原樣保留。 */
export function normalizeWorkbook(workbook: ExcelWorkbook): ExcelWorkbook {
  const section = labels.exports.headerV3.excelSection;
  return { sheets: workbook.sheets.filter(sheet => !isPnlSheet(sheet)).map(withoutAdDecisionColumn).map(sheet => ({ ...sheet, rows: sheet.rows.filter(row => !(row[0]?.kind === "text" && row[0].value === section) && !isBreakevenExcelRow(row)) })) };
}

async function source(filters: AnalysisFilters = {}) {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, filters, await hashInput(input)), revision: 1 };
}
/**
 * golden 的五種「給人看」的匯出（一頁摘要 Markdown 兩種、決策 Markdown、工作稿 Markdown、會議紀錄 Markdown）與 Excel 活頁簿模型。
 * generatedAt 只有 V3-7 之後的版本讀取（之前的版本忽略多出來的參數），產出時間固定，輸出可重現。
 */
export async function goldenFormattedExports(generatedAt: Date = FIXED_GENERATED_AT) {
  const all = await source();
  const dtc = await source({ channels: ["DTC"] });
  const summary = buildManagerSummary(all.snapshot);
  // 決策 Markdown：DTC 兩個已試算方案（284.00、264.00）＋一個草稿。
  const session = createDecisionSession(dtc.dataset, dtc.snapshot, 1);
  const plans = [
    ...saveScenario(session, [], { id: "p", name: "p", inputs: SCENARIO_GOLDEN, sensitivity: { volumes: ["-10", "0", "10"] } }),
    ...saveScenario(session, [], { id: "q", name: "q", inputs: { ...SCENARIO_GOLDEN, one_time_cost: "20" } }),
  ];
  // 會議：DTC 方案 p 選入、待辦 a1 置頂進行中、a2 未置頂；結束時間固定。
  let scenarios = ensureScenarioContext(emptyScenarioWorkspace("e"), dtc);
  const context = scenarios.contexts[0], draft = scenarioContextDecision(context);
  draft.scenarios = saveScenario(context.session, [], { id: "p", name: "p", inputs: SCENARIO_GOLDEN });
  scenarios = updateScenarioContext(scenarios, context.id, draft);
  const diagnostic = all.snapshot.report.diagnostics.find(row => row.code === "REV_UP_CM_DOWN" && row.scope.kind === "all")!;
  let actions: ActionWorkspace = addActionDraft(emptyActionWorkspace(), all, "a1", diagnostic.id);
  actions = addActionDraft(actions, all, "a2");
  actions = pinAction(actions, "a1", true);
  actions = editActionManagement(actions, "a1", { execution_status: "in_progress" }, "2026-10-01");
  let review = createReviewSession(all, "e", "rev-normalize", "2026-10-03T05:30:00.000Z");
  review = selectReviewScenario(review, scenarios, scenarioSelectionRef(scenarios.contexts[0], "p"));
  review = syncReviewPins(review, actions);
  review = updateReviewSession(review, { name: "golden", decision_state: "adopted", notes: "ok" });
  const meeting = finalizeMeeting({ review, snapshot: await rebuildReviewSnapshot(review), scenarios, actions, date: "2026-10-03", now: "2026-10-03T06:00:00.000Z" });
  const decisionContext: SummaryDecisionContext = {
    dataset_hash: summary.dataset_hash, filter_hash: summary.filter_hash, selectedScenarioId: "plan", reviewName: "golden", decisionState: "adopted", notes: "ok",
    scenarios: [{ id: "plan", name: "plan", status: "current", scopeLabel: "DTC", baseline: "270.00", contribution: "284.00", delta: "14.00", assumptions: ["a"] }],
    actions: [{ id: "a", problem: "p", action: "x", owner: "o", deadline: "2026-10-20", risk: "r", status: "draft", scopeLabel: "DTC" }],
  };
  const options = { generatedAt } as never;
  return {
    managerSummaryMd: exportManagerSummaryMarkdown(summary, undefined, options),
    managerSummaryContextMd: exportManagerSummaryMarkdown(summary, decisionContext, options),
    decisionMd: exportDecisionMarkdown(session, plans, [], undefined, [], options),
    workspaceDecisionMd: exportWorkspaceDecision("md", dtc, scenarios, actions, review),
    meetingMd: exportMeetingMarkdown(meeting),
    /** 會議紀錄 Markdown 的來源（測試指定產出時間用；不是匯出物）。 */
    meeting,
    excel: buildExcelWorkbook({ summary, snapshot: all.snapshot, dataset: all.dataset, actions, products: compareProducts(all.dataset, all.snapshot.report.scope).rows, meeting: { name: "golden", date: "2026-10-03", decision: "adopted", notes: "ok" }, generatedAt } as never),
  };
}
