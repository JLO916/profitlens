import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { emptyActionWorkspace } from "@/application/action-workspace";
import { createDecisionSession, saveScenario } from "@/application/decision";
import { exportDecisionMarkdown } from "@/application/decision-export";
import { buildExcelWorkbook, EXCEL_NUMBER_FORMATS } from "@/application/excel-export";
import { buildManagerSummary, exportManagerSummaryMarkdown, type SummaryDecisionContext } from "@/application/manager-summary";
import { buildPptxOnePager } from "@/application/pptx-export";
import { formatAmountL1, formatAmountL2, formatAmountL3, formatPeriodExport, formatRateL2, formatSignedDelta, MINUS } from "@/application/presentation";
import { createSnapshot, hashInput } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { SCENARIO_GOLDEN } from "./helpers/export-numeric";

// V3-2b §3.3／§8.5／§8.6：各匯出格式的層分配。
// CSV、JSON：只有 L3（ASCII 負號、到分；見 export-numeric-stability.test.ts）。
// Markdown：主文與表格 L2（整數元、表頭「（元）」或「金額單位：元」），技術細節 L3（到分）；負號 U+2212。
// Excel：摘要與通路表 L2、拆解與商品明細 L3；格子仍是數字，顯示格式負號 U+2212。
// PPT：關鍵差額卡與三件事 L1（萬／億），通路表 L2；版頭期間「YYYY-MM-DD 至 YYYY-MM-DD（天數）」。

const TECH = `## ${labels.sections.technicalDetails}`;
const mdEscape = (text: string) => text.replace(/[\\`*_{}\[\]()#+.!|~:-]/g, character => `\\${character}`);
/** 「-」緊接數字的 ASCII 負號金額（排除 ISO 日期 2026-08-02 這種前面是數字的情況）。 */
const ASCII_NEGATIVE = /(?<![\d\\])-\d/;

async function golden(filters = {}) {
  const input = fixture("golden");
  const dataset = validateDataset(input).dataset!;
  const snapshot = await createSnapshot(dataset, filters, await hashInput(input));
  return { input, dataset, snapshot };
}

describe("V3-2b manager summary Markdown: L2 body, L3 technical details", () => {
  it("body amounts are whole yuan with U+2212 and +; thresholds and the appendix keep cents", async () => {
    const { snapshot } = await golden();
    const summary = buildManagerSummary(snapshot, { importanceThreshold: "0.10" });
    const context: SummaryDecisionContext = {
      dataset_hash: summary.dataset_hash, filter_hash: summary.filter_hash, selectedScenarioId: "plan",
      scenarios: [{ id: "plan", name: "plan", status: "current", scopeLabel: "DTC", baseline: "270.00", contribution: "284.00", delta: "14.00", assumptions: [] }], actions: [],
    };
    const [body, technical] = exportManagerSummaryMarkdown(summary, context).split(TECH);
    expect(body).not.toMatch(ASCII_NEGATIVE);
    expect(body).not.toMatch(/(?<!\d)(?:255|315|570|2,?470|2,?250)\.00/);
    expect(body).toContain(fill(labels.ui.managerSummary.mdComparison, { mode: labels.periods.sameDays, threshold: formatAmountL3("0.10") }));
    expect(body).toContain(fill(labels.ui.managerSummary.mdSelectedScenario, { name: "plan", scope: "DTC", baseline: formatAmountL2("270.00"), contribution: formatAmountL2("284.00"), delta: formatSignedDelta("14.00", "L2") }));
    expect(formatSignedDelta("14.00", "L2")).toBe("+14");
    // 三件事：影響金額 L2、帶號。
    expect(body).toContain(`${MINUS}315`);
    // 技術細節：門檻比較金額、事實值、方案狀態都到分（L3），負號 U+2212。
    expect(technical).toContain(fill(labels.ui.managerSummary.techThresholdAmount, { amount: formatAmountL3("315.00") }));
    expect(technical).toContain(`${labels.metrics.contribution_after_marketing.label}：${formatAmountL3("-15.00")}`);
    expect(technical).toContain(`${labels.scenario.resultTitle} ${formatAmountL3("284.00")}；${labels.csvSuffix.change} ${formatSignedDelta("14.00", "L3")}`);
    expect(technical).not.toMatch(/：-\d/);
  });

  it("period lines use the export header format with days", async () => {
    const { snapshot } = await golden();
    const text = exportManagerSummaryMarkdown(buildManagerSummary(snapshot));
    expect(text).toContain(fill(labels.ui.managerSummary.mdPeriod, { period: labels.periods.previous, range: formatPeriodExport("2026-08-01", "2026-08-01") }));
    expect(formatPeriodExport("2026-07-13", "2026-08-23")).toBe(fill(labels.units.exportRange, { start: "2026-07-13", end: "2026-08-23", days: 42 }));
  });
});

describe("V3-2b decision Markdown: L2 body, L3 technical details and cited facts", () => {
  it("baseline and plan results are L2 in the body and L3 in technical details; rates one decimal", async () => {
    const { dataset, snapshot } = await golden({ channels: ["DTC"] });
    const session = createDecisionSession(dataset, snapshot, 1);
    const plans = saveScenario(session, [], { id: "p", name: "p", inputs: SCENARIO_GOLDEN });
    const markdown = exportDecisionMarkdown(session, plans, []);
    const fieldLine = (label: string, value: string) => fill(labels.ui.decisionExport.fieldLine, { label: mdEscape(label), value: mdEscape(value) });
    expect(markdown).toContain(labels.ui.export.amountUnitNote);
    // 版頭（資料版本與來源）的期間用匯出格式。
    expect(markdown).toContain(fieldLine(labels.csvColumns.period, formatPeriodExport("2026-08-02", "2026-08-02")));
    // 現況：扣廣告後貢獻 270.00 → 主文「270」、技術細節「270.00」。
    expect(markdown).toContain(fieldLine(labels.metrics.contribution_after_marketing.label, formatAmountL2("270.00")));
    expect(markdown).toContain(fill(labels.ui.decisionExport.fieldLine, { label: mdEscape("contribution_after_marketing"), value: mdEscape(formatAmountL3("270.00")) }));
    // 比率：主文一位小數的百分比（不是 12 位小數）。
    const rate = session.baseline.rates.discount_rate!;
    expect(markdown).toContain(mdEscape(formatRateL2(rate)));
    expect(markdown).not.toContain(mdEscape(rate));
    // 試算結果：284.00、差額 +14.00。
    expect(markdown).toContain(fieldLine(labels.scenario.resultTitle, formatAmountL2("284.00")));
    expect(markdown).toContain(fieldLine(labels.scenario.vsBaseline, formatSignedDelta("14.00", "L2")));
    expect(markdown).toContain(fill(labels.ui.decisionExport.fieldLine, { label: "contribution", value: mdEscape(formatAmountL3("284.00")) }));
    expect(markdown).toContain(fill(labels.ui.decisionExport.fieldLine, { label: "delta", value: mdEscape(formatSignedDelta("14.00", "L3")) }));
    // ASCII「-」只留在使用者輸入的原字串（每件物流費增減 -10），系統算出的金額都用 U+2212。
    expect(markdown.split("\n").filter(line => /：\\-\d/.test(line))).toEqual([fieldLine(labels.scenario.fulfillmentUnit.label, "-10")]);
  });
});

describe("V3-2b Excel display formats", () => {
  it("L2 rounds half up to whole yuan with U+2212 and shows 0 for |value| < 0.5, matching formatAmountL2", () => {
    for (const value of ["0.40", "-0.40", "0.50", "-0.50", "1234.50", "-1234.50", "-598833.95", "7850657.90", "0.00"]) {
      expect(XLSX.SSF.format(EXCEL_NUMBER_FORMATS.money_l2, Number(value)), value).toBe(formatAmountL2(value));
    }
    for (const value of ["-0.10", "1709082.18", "-598833.95", "0.00"]) expect(XLSX.SSF.format(EXCEL_NUMBER_FORMATS.money, Number(value)), value).toBe(formatAmountL3(value));
    expect(XLSX.SSF.format(EXCEL_NUMBER_FORMATS.ratio, -0.1425)).toBe(`${MINUS}14.25%`);
    expect(XLSX.SSF.format(EXCEL_NUMBER_FORMATS.count, -7420)).toBe(`${MINUS}7,420`);
  });

  it("summary period rows use the export header format", async () => {
    const { dataset, snapshot } = await golden();
    const workbook = buildExcelWorkbook({ summary: buildManagerSummary(snapshot), snapshot, dataset, actions: emptyActionWorkspace() });
    const values = workbook.sheets[0].rows.flatMap(row => row.map(cell => cell.kind === "text" ? cell.value : null));
    expect(values).toContain(formatPeriodExport("2026-08-01", "2026-08-01"));
    expect(values).toContain(formatPeriodExport("2026-08-02", "2026-08-02"));
  });
});

describe("V3-2b PPT one-pager: L1 cards with 萬, L2 channel table", () => {
  it("large amounts switch to 萬 on the cards and stay whole yuan in the channel table", async () => {
    const { snapshot } = await golden();
    const base = buildManagerSummary(snapshot);
    const scaled = (value: string | null) => value === null ? null : (BigInt(value.replace(".", "")) * 10000n).toString().replace(/(\d{2})$/, ".$1");
    const metric = <T extends { value: string | null }>(entry: T): T => ({ ...entry, value: scaled(entry.value) });
    const summary = {
      ...base,
      headlines: base.headlines.map(row => ({ ...row, previous: metric(row.previous), current: metric(row.current), change: metric(row.change) })),
      channels: base.channels.map(row => ({ ...row, contribution: { ...row.contribution, previous: metric(row.contribution.previous), current: metric(row.contribution.current), change: metric(row.contribution.change) } })),
    };
    const model = buildPptxOnePager({ summary, snapshot, actions: emptyActionWorkspace() });
    // 扣廣告後貢獻 570.00 → 5,700,000.00；255.00 → 2,550,000.00；差額 −3,150,000.00。
    expect(model.key_deltas[1]).toMatchObject({ previous: formatAmountL1("5700000.00"), current: formatAmountL1("2550000.00"), change: formatSignedDelta("-3150000.00", "L1") });
    expect(model.key_deltas[1].change).toBe(`${MINUS}${fill(labels.units.wan, { value: "315.0" })}`);
    expect(model.channels[1]).toMatchObject({ previous: "1,700,000", current: `${MINUS}150,000`, change: `${MINUS}1,850,000` });
    expect(model.subtitle).toContain(formatPeriodExport("2026-08-02", "2026-08-02"));
  });
});
