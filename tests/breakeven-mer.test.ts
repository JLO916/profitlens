import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { analyzeDataset } from "@/domain/analysis";
import { validateDataset } from "@/domain/validation";
import type { Dataset, Metric, Summary } from "@/domain/types";
import { emptyActionWorkspace } from "@/application/action-workspace";
import { ASSIST_KPI_IDS, ASSIST_KPI_VERSION, assistKpis } from "@/application/assist-kpi";
import { BREAKEVEN_MER_ID, BREAKEVEN_MER_REASON_CODES, BREAKEVEN_MER_VERSION, breakevenEvidenceFormula, breakevenMer, breakevenNote, breakevenReasonLabel, breakevenSources } from "@/application/breakeven-mer";
import { csvHeaderKey } from "@/application/copy";
import { buildExcelWorkbook } from "@/application/excel-export";
import { exportSnapshotCsv } from "@/application/export";
import { buildManagerSummary, exportManagerSummaryMarkdown } from "@/application/manager-summary";
import { formatAmountL3, formatEmpty, formatMultiple, metricDefinitions } from "@/application/presentation";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { EvidenceDrawer } from "@/components/evidence-drawer";
import { AssistTable, breakevenEvidence } from "@/components/overview/assist-table";
import { fill, labels } from "@/i18n";
import { parseCsv } from "@/lib/csv";
import { scanLabels } from "../scripts/lib/copy-scan.mjs";
import { expected, fixture } from "./helpers/fixtures";
import { byTestId, escapeAttr, openTag, textOf } from "./helpers/markup";

// V3-9a F12 損益兩平 MER（PRD §10.1 F12、D-V3-17＝C、RK10）：扣廣告後貢獻＝0 時的最低 MER＝淨營收 ÷ 扣廣告前貢獻；版本 breakeven-mer-v1。
// 獨立手算 golden（fixtures/golden/expected.json 的兩期金額；精度與既有 MER 相同：12 位小數、ROUND_HALF_UP）：
//   本期 2,470.00 ÷ 705.00 ＝ 3.503546099290780141…  → 3.503546099291（第 13 位是 7，進位）；L1 3.5 倍、L3 3.50 倍
//         實際 MER 2,470.00 ÷ 450.00 ＝ 5.488888…   → 5.488888888889；L1 5.5 倍 → 高於（扣廣告前貢獻 705 > 廣告費 450，即扣廣告後貢獻 255 > 0）
//   上期 2,250.00 ÷ 870.00 ＝ 2.586206896551724137… → 2.586206896552（第 13 位是 7，進位）；L1 2.6 倍、L3 2.59 倍
//         實際 MER 2,250.00 ÷ 300.00 ＝ 7.5          → 7.500000000000；L1 7.5 倍 → 高於（870 > 300，扣廣告後貢獻 570 > 0）
// 期待值的文字一律由 labels／fill 與格式化函式組出；數值斷言寫手算的原值字串。

const copy = labels.assist.breakevenV3;
const GOLDEN = {
  current: { value: "3.503546099291", actual: "5.488888888889" },
  previous: { value: "2.586206896552", actual: "7.500000000000" },
};
const metric = (value: string | null, reason_codes: string[] = []): Metric => ({ value, reason_codes });
const noop = () => undefined;

let dataset: Dataset;
let snapshot: WorkspaceSnapshot;
beforeAll(async () => {
  const input = fixture("golden");
  dataset = validateDataset(input).dataset!;
  snapshot = await createSnapshot(dataset, {}, await hashInput(input));
});
const analyze = (name: string) => analyzeDataset(validateDataset(fixture(name)).dataset!);
/** 自組 Summary：以 golden 本期為底，只換指定的指標（不經 domain 重算，邊界值由測試直接給）。 */
function withMetrics(overrides: Partial<Record<keyof Summary["metrics"], Metric>>): Summary {
  const base = snapshot.report.current;
  return { ...base, metrics: { ...base.metrics, ...overrides } };
}

describe("F12 版本、識別與原因碼", () => {
  it("獨立版本 breakeven-mer-v1；assist-kpi-v1 與 7 個輔助指標不變", () => {
    expect(BREAKEVEN_MER_VERSION).toBe("breakeven-mer-v1");
    expect(BREAKEVEN_MER_ID).toBe("breakeven_mer");
    expect(ASSIST_KPI_VERSION).toBe("assist-kpi-v1");
    expect(ASSIST_KPI_IDS).toEqual(["units_sold", "net_revenue_per_unit", "marketing_burden", "mer", "gross_margin", "refund_ratio", "fulfillment_burden"]);
    expect(assistKpis(snapshot.report.current).map(kpi => kpi.id)).toEqual([...ASSIST_KPI_IDS]);
    expect(snapshot.metric_version).toBe("contribution-v1");
  });

  it("新原因碼只有兩個，都有 labels 白話文案", () => {
    expect([...BREAKEVEN_MER_REASON_CODES]).toEqual(["ZERO_NET_REVENUE", "NON_POSITIVE_CONTRIBUTION_BEFORE_MARKETING"]);
    for (const code of BREAKEVEN_MER_REASON_CODES) expect(breakevenReasonLabel(code), code).toBe(copy.reasons[code]);
    expect(breakevenReasonLabel("constructor")).toBeNull();
    expect(breakevenReasonLabel("NON_POSITIVE_DENOMINATOR")).toBeNull();
  });
});

describe("F12 手算 golden（本期 2,470 ÷ 705、上期 2,250 ÷ 870）", () => {
  it("輸入就是 golden expected.json 的淨營收與扣廣告前貢獻", () => {
    const gold = expected("golden");
    expect(snapshot.report.current.metrics.net_revenue.value).toBe(gold.current.net_revenue);
    expect(snapshot.report.current.metrics.contribution_before_marketing.value).toBe(gold.current.contribution_before_marketing);
    expect(snapshot.report.previous.metrics.net_revenue.value).toBe(gold.previous.net_revenue);
    expect(snapshot.report.previous.metrics.contribution_before_marketing.value).toBe(gold.previous.contribution_before_marketing);
    expect([gold.current.net_revenue, gold.current.contribution_before_marketing, gold.current.ad_spend]).toEqual(["2470.00", "705.00", "450.00"]);
    expect([gold.previous.net_revenue, gold.previous.contribution_before_marketing, gold.previous.ad_spend]).toEqual(["2250.00", "870.00", "300.00"]);
  });

  it.each(["current", "previous"] as const)("%s：12 位 HALF_UP 原值、L1 顯示、高於實際 MER 的比較", period => {
    const item = breakevenMer(snapshot.report[period]);
    expect(item).toMatchObject({
      id: BREAKEVEN_MER_ID, unit: "multiple", status: "ok", value: GOLDEN[period].value, display: formatMultiple(GOLDEN[period].value, "L1"), reason_codes: [], comparison: "above",
      label: copy.label, shortLabel: copy.short, plain: copy.plain, formula: copy.formula, formulaTechnical: copy.formulaTechnical,
    });
    // 實際 MER 直接取 summary.metrics.mer，不重算。
    expect(item.actual).toEqual(snapshot.report[period].metrics.mer);
    expect(item.actual.value).toBe(GOLDEN[period].actual);
    expect(item.inputs.net_revenue).toEqual(snapshot.report[period].metrics.net_revenue);
    expect(item.inputs.contribution_before_marketing).toEqual(snapshot.report[period].metrics.contribution_before_marketing);
  });

  it("顯示取位：本期 3.5 倍（L1）／3.50 倍（L3），上期 2.6 倍／2.59 倍", () => {
    expect(formatMultiple(GOLDEN.current.value, "L1")).toBe(fill(labels.format.units.multiple, { value: "3.5" }));
    expect(formatMultiple(GOLDEN.current.value, "L3")).toBe(fill(labels.format.units.multiple, { value: "3.50" }));
    expect(formatMultiple(GOLDEN.previous.value, "L1")).toBe(fill(labels.format.units.multiple, { value: "2.6" }));
    expect(formatMultiple(GOLDEN.previous.value, "L3")).toBe(fill(labels.format.units.multiple, { value: "2.59" }));
  });

  it("來源：淨營收與扣廣告前貢獻的來源（銷售檔、通路費用檔），不含廣告檔；每一列都在該期間摘要的來源中", () => {
    const item = breakevenMer(snapshot.report.current);
    const files = new Set(item.sources.map(source => source.file));
    expect(files).toEqual(new Set(["sales_daily.csv", "channel_costs_daily.csv"]));
    expect(item.sources.length).toBe(snapshot.report.current.sources.filter(source => source.file !== "ad_spend_daily.csv").length);
    expect(breakevenSources([{ file: "manifest.json", line: null }, { file: "ad_spend_daily.csv", line: 2 }])).toEqual([{ file: "manifest.json", line: null }]);
  });

  it("一句 L1 結論：本期廣告效率（MER）5.5 倍，高於損益兩平（3.5 倍）；不上色、≤ 20 字", () => {
    const note = breakevenNote(breakevenMer(snapshot.report.current));
    expect(note).toBe(fill(copy.note.above, { mer: metricDefinitions.mer.label, actual: formatMultiple(GOLDEN.current.actual, "L1"), breakeven: formatMultiple(GOLDEN.current.value, "L1") }));
    expect(note).toBe(`本期${metricDefinitions.mer.label}${fill(labels.format.units.multiple, { value: "5.5" })}，高於損益兩平（${fill(labels.format.units.multiple, { value: "3.5" })}）。`);
  });

  it("抽屜公式行帶兩個輸入的 L3 金額", () => {
    expect(breakevenEvidenceFormula(breakevenMer(snapshot.report.current))).toBe(fill(copy.evidenceFormula, { revenue: fill(labels.format.units.yuan, { value: formatAmountL3("2470.00") }), contribution: fill(labels.format.units.yuan, { value: formatAmountL3("705.00") }) }));
    expect(breakevenEvidenceFormula(breakevenMer(snapshot.report.previous))).toContain(fill(labels.format.units.yuan, { value: "2,250.00" }));
  });
});

describe("F12 三種邊界與缺漏（不顯示 0 或無限大）", () => {
  it("扣廣告前貢獻 ≤ 0：value null、NON_POSITIVE_CONTRIBUTION_BEFORE_MARKETING、不適用", () => {
    for (const value of ["-10.00", "0.00"]) {
      const item = breakevenMer(withMetrics({ contribution_before_marketing: metric(value), contribution_after_marketing: metric("-460.00") }));
      expect(item, value).toMatchObject({ value: null, status: "not_applicable", reason_codes: ["NON_POSITIVE_CONTRIBUTION_BEFORE_MARKETING"], display: labels.assist.notApplicable, comparison: "not_applicable" });
      expect(breakevenNote(item), value).toBe(copy.note.nonPositiveContribution);
    }
    // 金額 −10.00 帶 U+2212 寫進抽屜公式行。
    expect(breakevenEvidenceFormula(breakevenMer(withMetrics({ contribution_before_marketing: metric("-10.00") })))).toContain(fill(labels.format.units.yuan, { value: formatAmountL3("-10.00") }));
  });

  it("廣告費 = 0（自組與 fixtures/zero_ad）：損益兩平 MER 照算，實際 MER 不適用，比較 not_applicable", () => {
    const item = breakevenMer(withMetrics({ ad_spend: metric("0.00"), mer: metric(null, ["NON_POSITIVE_DENOMINATOR"]), contribution_after_marketing: metric("705.00") }));
    expect(item).toMatchObject({ value: GOLDEN.current.value, status: "ok", comparison: "not_applicable", actual: { value: null, reason_codes: ["NON_POSITIVE_DENOMINATOR"] } });
    expect(breakevenNote(item)).toBe(copy.note.zeroAds);
    const zero = analyze("zero_ad");
    expect(zero.current.metrics.ad_spend.value).toBe("0.00");
    expect(expected("zero_ad").current_mer).toBeNull();
    const fromFixture = breakevenMer(zero.current);
    // zero_ad 本期：淨營收 ÷ 扣廣告前貢獻照算（扣廣告前貢獻＝扣廣告後貢獻＝705.00）。
    expect(zero.current.metrics.contribution_before_marketing.value).toBe(expected("zero_ad").current_contribution_after_marketing);
    expect(fromFixture.status).toBe("ok");
    expect(fromFixture.value).not.toBeNull();
    expect(fromFixture.comparison).toBe("not_applicable");
    expect(breakevenNote(fromFixture)).toBe(copy.note.zeroAds);
  });

  it("淨營收 = 0：ZERO_NET_REVENUE 排第一；扣廣告前貢獻同時 ≤ 0 時兩個原因碼都列", () => {
    const both = breakevenMer(withMetrics({ net_revenue: metric("0.00"), contribution_before_marketing: metric("-50.00"), mer: metric(null, ["NON_POSITIVE_NET_REVENUE"]) }));
    expect(both).toMatchObject({ value: null, status: "not_applicable", reason_codes: ["ZERO_NET_REVENUE", "NON_POSITIVE_CONTRIBUTION_BEFORE_MARKETING"], display: labels.assist.notApplicable, comparison: "not_applicable" });
    expect(breakevenNote(both)).toBe(copy.note.nonPositiveRevenue);
    // 費用有沖回（負成本）時扣廣告前貢獻可能 > 0，仍不算出 0 倍。
    const reversed = breakevenMer(withMetrics({ net_revenue: metric("0.00"), contribution_before_marketing: metric("20.00"), mer: metric(null, ["NON_POSITIVE_NET_REVENUE"]) }));
    expect(reversed).toMatchObject({ value: null, status: "not_applicable", reason_codes: ["ZERO_NET_REVENUE"] });
  });

  it("淨營收 < 0（fixtures/refund_only 本期 −100.00）：沿用 NON_POSITIVE_NET_REVENUE，不適用", () => {
    const refund = analyze("refund_only");
    expect(refund.current.metrics.net_revenue.value).toBe(expected("refund_only").current_net_revenue);
    const item = breakevenMer(refund.current);
    expect(item.value).toBeNull();
    expect(item.status).toBe("not_applicable");
    expect(item.reason_codes[0]).toBe("NON_POSITIVE_NET_REVENUE");
    expect(breakevenNote(item)).toBe(copy.note.nonPositiveRevenue);
  });

  it("缺漏（fixtures/errors/missing_cogs）：status missing、沿用缺漏原因碼、資料待補", () => {
    const partial = analyze("errors/missing_cogs");
    const before = partial.current.metrics.contribution_before_marketing;
    expect(before.value).toBeNull();
    const item = breakevenMer(partial.current);
    expect(item).toMatchObject({ value: null, status: "missing", display: labels.shell.status.missing, comparison: "not_applicable" });
    expect(item.reason_codes).toEqual([...new Set(before.reason_codes)].sort());
    expect(item.reason_codes.some(code => code.startsWith("MISSING"))).toBe(true);
    expect(breakevenNote(item)).toBe(copy.note.missing);
    expect(breakevenEvidenceFormula(item)).toContain(labels.shell.status.missing);
    // 自組：兩個都缺時原因碼合併排序；沒有原因碼時補 MISSING_VALUE。
    expect(breakevenMer(withMetrics({ net_revenue: metric(null, ["MISSING_REFUNDS"]), contribution_before_marketing: metric(null, ["MISSING_COGS", "MISSING_REFUNDS"]) })).reason_codes).toEqual(["MISSING_COGS", "MISSING_REFUNDS"]);
    expect(breakevenMer(withMetrics({ net_revenue: metric(null) })).reason_codes).toEqual(["MISSING_VALUE"]);
  });

  it("廣告費缺漏：損益兩平 MER 照算，實際 MER 資料待補，結論寫資料待補", () => {
    const item = breakevenMer(withMetrics({ ad_spend: metric(null, ["MISSING_AD_DAY"]), mer: metric(null, ["MISSING_AD_DAY"]) }));
    expect(item).toMatchObject({ value: GOLDEN.current.value, status: "ok", comparison: "not_applicable" });
    expect(breakevenNote(item)).toBe(copy.note.actualMissing);
  });
});

describe("F12 比較：精確的分比較（扣廣告前貢獻 vs 廣告費），L1 相同時改用 L3", () => {
  // 淨營收 1,000.00、扣廣告前貢獻 300.00 → 損益兩平 1,000 ÷ 300 ＝ 3.333333333333（HALF_UP 12 位）。
  const base = { net_revenue: metric("1000.00"), contribution_before_marketing: metric("300.00") };
  it("廣告費 400 → 實際 2.5 倍 < 3.33 倍：低於", () => {
    const item = breakevenMer(withMetrics({ ...base, ad_spend: metric("400.00"), mer: metric("2.500000000000") }));
    expect(item).toMatchObject({ value: "3.333333333333", comparison: "below" });
    expect(breakevenNote(item)).toBe(fill(copy.note.below, { mer: metricDefinitions.mer.label, actual: formatMultiple("2.500000000000", "L1"), breakeven: formatMultiple("3.333333333333", "L1") }));
  });
  it("廣告費 300 → 扣廣告後貢獻 0：剛好在損益兩平", () => {
    const item = breakevenMer(withMetrics({ ...base, ad_spend: metric("300.00"), mer: metric("3.333333333333") }));
    expect(item.comparison).toBe("equal");
    expect(breakevenNote(item)).toBe(fill(copy.note.equal, { mer: metricDefinitions.mer.label, actual: formatMultiple("3.333333333333", "L1") }));
  });
  it("廣告費 299 → 實際 3.344481605351 倍與 3.333333333333 倍的 L1 都是 3.3 倍：結論改用 L3（3.34 倍、3.33 倍）", () => {
    const item = breakevenMer(withMetrics({ ...base, ad_spend: metric("299.00"), mer: metric("3.344481605351") }));
    expect(item.comparison).toBe("above");
    expect(formatMultiple("3.344481605351", "L1")).toBe(formatMultiple("3.333333333333", "L1"));
    expect(breakevenNote(item)).toBe(fill(copy.note.above, { mer: metricDefinitions.mer.label, actual: formatMultiple("3.344481605351", "L3"), breakeven: formatMultiple("3.333333333333", "L3") }));
  });
  it("廣告費為負（實際 MER 不適用但不是 0）：本期 MER 不適用", () => {
    const item = breakevenMer(withMetrics({ ad_spend: metric("-5.00"), mer: metric(null, ["NON_POSITIVE_DENOMINATOR"]) }));
    expect(item.comparison).toBe("not_applicable");
    expect(breakevenNote(item)).toBe(fill(copy.note.actualNotApplicable, { mer: metricDefinitions.mer.label }));
  });
});

describe("F12 匯出：分析 CSV、Excel、主管摘要 Markdown（既有列不變）", () => {
  const csvRows = () => {
    const parsed = parseCsv(exportSnapshotCsv(dataset, snapshot));
    return parsed.rows.map(row => Object.fromEntries(parsed.headers.map((header, index) => [csvHeaderKey(header), row.values[index]])));
  };

  it("分析 CSV：每期一列 row_type breakeven_mer，版本 breakeven-mer-v1、unit multiple、12 位原值；接在 14 列輔助指標之後", () => {
    const rows = csvRows();
    const breakeven = rows.filter(row => row.row_type === "breakeven_mer");
    expect(breakeven).toHaveLength(2);
    for (const period of ["previous", "current"] as const) {
      expect(breakeven.find(row => row.period === period), period).toMatchObject({ metric: "breakeven_mer", metric_label: copy.label, metric_version: BREAKEVEN_MER_VERSION, unit: "multiple", value: GOLDEN[period].value, reason_codes: "[]", period_start: snapshot.report[period].period.start, period_end: snapshot.report[period].period.end });
      const refs = JSON.parse(breakeven.find(row => row.period === period)!.source_refs) as { logical_file: string }[];
      expect(refs.length).toBeGreaterThan(0);
      expect(refs.some(ref => ref.logical_file === "ad_spend_daily.csv"), period).toBe(false);
    }
    const assist = rows.filter(row => row.row_type === "assist_kpi");
    expect(assist).toHaveLength(14);
    expect(assist.every(row => row.metric_version === ASSIST_KPI_VERSION)).toBe(true);
    const lastAssist = rows.lastIndexOf(assist[13]);
    expect(rows.indexOf(breakeven[0])).toBe(lastAssist + 1);
    expect(breakeven.map(row => row.period)).toEqual(["previous", "current"]);
  });

  it("分析 CSV：不適用時 value 空字串＋原因碼（refund_only）", async () => {
    const input = fixture("refund_only");
    const refundDataset = validateDataset(input).dataset!;
    const refund = await createSnapshot(refundDataset, {}, await hashInput(input));
    const parsed = parseCsv(exportSnapshotCsv(refundDataset, refund));
    const rows = parsed.rows.map(row => Object.fromEntries(parsed.headers.map((header, index) => [csvHeaderKey(header), row.values[index]])));
    const current = rows.find(row => row.row_type === "breakeven_mer" && row.period === "current")!;
    expect(current.value).toBe("");
    expect(JSON.parse(current.reason_codes)[0]).toBe("NON_POSITIVE_NET_REVENUE");
  });

  it("Excel：摘要表「其他常用指標」一列（L3 文字格 2.59 倍／3.50 倍、版本），指標定義表技術列多一列版本", () => {
    const summary = buildManagerSummary(snapshot);
    const workbook = buildExcelWorkbook({ summary, snapshot, dataset, actions: emptyActionWorkspace() });
    const sheet = workbook.sheets[0];
    const columns = Object.keys(labels.exports.excel.columns.summary);
    const rows = sheet.rows.map(row => Object.fromEntries(columns.map((key, index) => [key, row[index]])));
    const row = rows.find(row => row.item.kind === "text" && row.item.value === copy.label)!;
    expect(row.section).toEqual({ kind: "text", value: labels.overview.sections.assistKpis });
    expect(row.previous).toEqual({ kind: "text", value: formatMultiple(GOLDEN.previous.value, "L3") });
    expect(row.current).toEqual({ kind: "text", value: formatMultiple(GOLDEN.current.value, "L3") });
    expect(row.detail).toEqual({ kind: "text", value: fill(copy.excelDetail, { version: BREAKEVEN_MER_VERSION }) });
    // 接在關鍵差額兩列之後、三件事之前。
    const index = rows.indexOf(row);
    expect(rows[index - 1].section).toEqual({ kind: "text", value: labels.exports.excel.summary.sections.keyDeltas });
    expect(rows[index + 1].section).toEqual({ kind: "text", value: labels.exports.excel.summary.sections.topThree });
    const basis = workbook.sheets[5];
    const technical = basis.rows.filter(cells => cells[0].kind === "text" && cells[0].value === labels.exports.excel.basis.sections.technical).map(cells => [cells[1], cells[2]].map(cell => cell.kind === "text" ? cell.value : null));
    expect(technical.map(([, detail]) => detail)).toEqual(["golden-v1", snapshot.dataset_hash, snapshot.filter_hash, "contribution-v1", "assist-kpi-v1", "breakeven-mer-v1", "TWD", "Asia/Taipei"]);
    expect(technical.find(([, detail]) => detail === "breakeven-mer-v1")![0]).toBe(copy.excelVersion);
  });

  it("Excel：不適用時寫「不適用（原因碼）」文字格", async () => {
    const input = fixture("refund_only");
    const refundDataset = validateDataset(input).dataset!;
    const refund = await createSnapshot(refundDataset, {}, await hashInput(input));
    const item = breakevenMer(refund.report.current);
    const workbook = buildExcelWorkbook({ summary: buildManagerSummary(refund), snapshot: refund, dataset: refundDataset, actions: emptyActionWorkspace() });
    const columns = Object.keys(labels.exports.excel.columns.summary);
    const row = workbook.sheets[0].rows.map(cells => Object.fromEntries(columns.map((key, index) => [key, cells[index]]))).find(row => row.item.kind === "text" && row.item.value === copy.label)!;
    expect(row.current).toEqual({ kind: "text", value: formatEmpty("notApplicable", { layer: "L3", reasonCodes: item.reason_codes }) });
  });

  it("主管摘要 Markdown：其他常用指標表最後一列是損益兩平 MER（L1），技術細節多一行版本；ManagerSummary.breakeven 帶兩期", () => {
    const summary = buildManagerSummary(snapshot);
    expect(summary.breakeven).toMatchObject({ version: BREAKEVEN_MER_VERSION, previous: { value: GOLDEN.previous.value }, current: { value: GOLDEN.current.value } });
    const markdown = exportManagerSummaryMarkdown(summary);
    const lines = markdown.split("\n");
    const lastAssist = summary.assist.current[summary.assist.current.length - 1];
    const assistRow = `| ${lastAssist.label} | ${summary.assist.previous[summary.assist.previous.length - 1].display} | ${lastAssist.display} |`;
    const row = `| ${copy.label} | ${formatMultiple(GOLDEN.previous.value, "L1")} | ${formatMultiple(GOLDEN.current.value, "L1")} |`;
    expect(lines[lines.indexOf(assistRow) + 1]).toBe(row);
    expect(lines[lines.indexOf(row) + 1]).toBe("");
    const assistVersion = `- ${labels.assist.technicalVersion}：${ASSIST_KPI_VERSION}`;
    expect(lines[lines.indexOf(assistVersion) + 1]).toBe(`- ${copy.technicalVersion}：${BREAKEVEN_MER_VERSION}`);
    // 舊的摘要物件（沒有 breakeven 欄位）照舊輸出，不多列。
    const { breakeven: _breakeven, ...legacy } = summary;
    void _breakeven;
    const old = exportManagerSummaryMarkdown(legacy);
    expect(old).not.toContain(copy.label);
    expect(old.split("\n").length).toBe(lines.length - 2);
  });
});

describe("F12 畫面：其他常用指標的獨立段（SSR）與計算與來源", () => {
  const render = (snap: WorkspaceSnapshot = snapshot) => renderToStaticMarkup(createElement(AssistTable, { snapshot: snap, onEvidence: noop, onBasis: noop }));

  it("兩欄表之後一段：一列本期／上期 number-link、一句結論、`?` 說明（hidden 掛載）；既有兩張表與七列不變", () => {
    const html = render();
    const assist = byTestId(html, "assist-kpis");
    expect(assist.match(/<table class="kv"[^>]*>/g)).toHaveLength(2);
    expect([...assist.matchAll(/<tr data-testid="assist-([a-z_]+)"/g)].map(match => match[1])).toEqual([...ASSIST_KPI_IDS]);
    const block = byTestId(assist, "assist-breakeven-mer");
    expect(assist.indexOf(block)).toBeGreaterThan(assist.indexOf('class="assist-grid"'));
    expect(openTag(assist, 'data-testid="assist-breakeven-mer"')).toBe('<div class="assist-breakeven" data-testid="assist-breakeven-mer">');
    const current = breakevenMer(snapshot.report.current), previous = breakevenMer(snapshot.report.previous);
    const ui = labels.overview.assistTable;
    expect(byTestId(block, "assist-breakeven-current")).toBe(`<button type="button" class="number-link" data-testid="assist-breakeven-current" aria-label="${escapeAttr(fill(ui.cellAria, { metric: copy.label, period: ui.columns.current, value: current.display }))}">${current.display}</button>`);
    expect(byTestId(block, "assist-breakeven-previous")).toBe(`<button type="button" class="number-link" data-testid="assist-breakeven-previous" aria-label="${escapeAttr(fill(ui.cellAria, { metric: copy.label, period: ui.columns.previous, value: previous.display }))}">${previous.display}</button>`);
    expect(block).toContain(`<td class="num ok">${byTestId(block, "assist-breakeven-current")}</td>`);
    expect(block).toContain(`<td class="num prev ok">${byTestId(block, "assist-breakeven-previous")}</td>`);
    expect(textOf(byTestId(block, "assist-breakeven-note"))).toBe(breakevenNote(current));
    // 結論不上色（D-V3-7）：沒有 tone class。
    expect(openTag(block, 'data-testid="assist-breakeven-note"')).toBe('<p class="assist-breakeven-note" data-testid="assist-breakeven-note">');
    const help = byTestId(block, "assist-breakeven-help");
    expect(openTag(block, 'data-testid="assist-breakeven-help"')).toMatch(/^<div id="assist-breakeven-help" role="region" aria-label="[^"]+" class="ui-popover ui-help-content assist-breakeven-help" data-testid="assist-breakeven-help" hidden="">$/);
    expect(textOf(help)).toBe(`${copy.help.definition}${fill(copy.help.version, { version: BREAKEVEN_MER_VERSION })}`);
    const trigger = openTag(block, 'data-testid="assist-breakeven-help-trigger"')!;
    expect(trigger).toContain(`aria-label="${escapeAttr(fill(copy.helpAria, { metric: copy.label }))}"`);
    expect(trigger).toContain('aria-expanded="false"');
    expect(trigger).toContain('aria-controls="assist-breakeven-help"');
  });

  it("不適用（refund_only 本期）與資料待補（missing_cogs）用第三色的狀態 class", async () => {
    for (const [name, status] of [["refund_only", "not_applicable"], ["errors/missing_cogs", "missing"]] as const) {
      const input = fixture(name);
      const data = validateDataset(input).dataset!;
      const snap = await createSnapshot(data, {}, await hashInput(input));
      const block = byTestId(render(snap), "assist-breakeven-mer");
      const current = breakevenMer(snap.report.current);
      expect(current.status, name).toBe(status);
      expect(block, name).toContain(`<td class="num ${status}">`);
      expect(textOf(byTestId(block, "assist-breakeven-current")), name).toBe(current.display);
      expect(textOf(byTestId(block, "assist-breakeven-note")), name).toBe(breakevenNote(current));
    }
  });

  it("計算與來源：倍數大數字＋精確值、公式行帶輸入金額、不畫 MER 的比率表、版本 breakeven-mer-v1、來源只有銷售與通路費用", () => {
    const item = breakevenMer(snapshot.report.current);
    const evidence = breakevenEvidence(item, snapshot.report.current.period, snapshot.report.scope.channels);
    expect(evidence).toMatchObject({ title: copy.label, name: "mer", metric: { value: GOLDEN.current.value, reason_codes: [] }, components: [], metricVersion: BREAKEVEN_MER_VERSION, formulaTechnical: copy.formulaTechnical, formula: breakevenEvidenceFormula(item) });
    const html = renderToStaticMarkup(createElement(EvidenceDrawer, { dataset, snapshot, evidence, onClose: noop, onBasis: noop }));
    expect(html).toContain(`<p class="number">${formatMultiple(GOLDEN.current.value, "L1")}</p>`);
    expect(html).toContain(`data-testid="evidence-precise-value">${formatMultiple(GOLDEN.current.value, "L3")}</p>`);
    expect(html).toContain(`<p class="evidence-formula">${breakevenEvidenceFormula(item)}</p>`);
    expect(html).not.toContain("ladder-table");
    expect(html).not.toContain("evidence-components");
    expect(html).not.toContain(fill(labels.format.units.multiple, { value: "2,470.00" }));
    expect(html).toContain(fill(labels.evidence.drawerV3.version, { version: BREAKEVEN_MER_VERSION }));
    expect(html).toContain(`<code>${GOLDEN.current.value}</code>`);
    expect(html).toContain(`<code>${escapeAttr(copy.formulaTechnical)}</code>`);
    expect(html).toContain(`<dd><code>${BREAKEVEN_MER_VERSION}</code></dd>`);
    const tabs = labels.evidence.sourceTabs;
    expect(html).toContain(`>${fill(labels.evidence.drawer.tabWithCount, { tab: tabs.sales, n: item.sources.filter(source => source.file === "sales_daily.csv").length })}<`);
    expect(html).not.toContain(`>${fill(labels.evidence.drawer.tabWithCount, { tab: tabs.ads, n: 4 })}<`);
    expect(html).not.toMatch(new RegExp(`>${tabs.ads}（`));
  });

  it("計算與來源（不適用）：大數字寫「不適用」，技術細節列出原因碼", async () => {
    const input = fixture("refund_only");
    const data = validateDataset(input).dataset!;
    const snap = await createSnapshot(data, {}, await hashInput(input));
    const item = breakevenMer(snap.report.current);
    const html = renderToStaticMarkup(createElement(EvidenceDrawer, { dataset: data, snapshot: snap, evidence: breakevenEvidence(item, snap.report.current.period, snap.report.scope.channels), onClose: noop, onBasis: noop }));
    expect(html).toContain(`<p class="number">${labels.assist.notApplicable}</p>`);
    expect(html).not.toContain('data-testid="evidence-precise-value"');
    for (const code of item.reason_codes) expect(html).toContain(`<li><code>${code}</code></li>`);
  });
});

describe("F12 labels（assist.breakevenV3）", () => {
  it("新鍵沒有黑名單詞、箭頭、｜、驚嘆號、注意： 前綴；占位符成對", () => {
    const { metrics, details } = scanLabels({ assist: { breakevenV3: labels.assist.breakevenV3 } });
    expect(Object.values(metrics).every(value => value === 0), JSON.stringify(details)).toBe(true);
  });

  it("結論句（L1）≤ 20 個中文字（不計數字、單位與占位符）；指標名用 metricDefinitions 的 label", () => {
    const cjk = (text: string) => (text.replace(/\{\w+\}/g, "").match(/[一-鿿]/g) ?? []).length;
    for (const [key, template] of Object.entries(copy.note)) expect(cjk(fill(template, { mer: metricDefinitions.mer.label })), key).toBeLessThanOrEqual(20);
    expect(copy.note.above).toContain("{mer}");
    expect(copy.note.below).toContain("{mer}");
  });
});
