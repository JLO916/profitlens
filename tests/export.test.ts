import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import golden from "../fixtures/golden/expected.json";
import { csvHeader, csvHeaderKey } from "../src/application/copy";
import { blankScenarioInputs, createDecisionSession, saveScenario } from "../src/application/decision";
import { exportDecisionCsv, exportDecisionJson } from "../src/application/decision-export";
import { encodeCsv, exportIssuesCsv, exportProductsCsv, exportSnapshotCsv, type CsvCell } from "../src/application/export";
import { EXPORT_VARIANTS, variantSpec } from "../src/application/export-variants";
import { buildManagerSummary, exportChannelComparisonCsv, exportManagerSummaryMarkdown } from "../src/application/manager-summary";
import { formatSignedDelta, MINUS } from "../src/application/presentation";
import { createSnapshot, hashInput } from "../src/application/workspace";
import { fill, labels } from "../src/i18n";
import { validateDataset } from "../src/domain/validation";
import { parseCsv } from "../src/lib/csv";
import { AMOUNT_FIELDS, type DatasetInput, type ProductRow, type ValidationIssue } from "../src/domain/types";
import { SCENARIO_GOLDEN } from "./helpers/export-numeric";
import { FIXED_GENERATED_AT, goldenFormattedExports, isChartV4MarkdownLine } from "./helpers/export-normalize";
import { fixture } from "./helpers/fixtures";

const text = (value: string): CsvCell => ({ kind: "text", value });
const number = (value: string): CsvCell => ({ kind: "number", value });
/** R2：匯出標題列為「中文名稱 (english_key)」；測試以 english key 讀欄位，所以把標題透過 csvHeaderKey 還原。 */
function records(csv: string): Record<string, string>[] {
  const result = parseCsv(csv);
  return result.rows.map(row => Object.fromEntries(result.headers.map((header, index) => [csvHeaderKey(header), row.values[index]])));
}
function headerRow(csv: string): string[] {
  return parseCsv(csv).headers;
}
async function setup(input: DatasetInput = fixture()) {
  const result = validateDataset(input);
  expect(result.dataset).not.toBeNull();
  const dataset = result.dataset!;
  return { dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)) };
}

describe("M3 typed safe CSV encoder", () => {
  it("writes UTF-8 BOM, quoted comma-delimited fields, CRLF records and inert embedded delimiters", () => {
    const result = encodeCsv([[text("label"), text("value")], [text('a,"b"'), text("line1\r\nline2")]]);
    expect(result).toBe('\uFEFF"label","value"\r\n"a,""b""","line1\r\nline2"\r\n');
    expect(records(result)).toEqual([{ label: 'a,"b"', value: "line1\r\nline2" }]);
  });

  it.each(["=1+1", "+SUM(A1)", "-1+2", "@SUM(A1)", "\t=1+1", "\r=1", "\n=1", " \t +1", "\ufeff=1", "\u0000@x", "\u200b=1", "-315.00"])("neutralizes untrusted text beginning with a formula/control prefix: %j", value => {
    const csv = encodeCsv([[text("value")], [text(value)]]);
    expect(records(csv)[0].value).toBe(`'${value}`);
    expect(csv).toContain(`"'${value.replaceAll('"', '""')}"`);
  });

  it("preserves strictly typed negative, very large and long decimal values exactly", () => {
    const values = ["-315.00", "9007199254740993.01", "-9007199254740993.01", "0.12345678901234567890123456789", "0.00"];
    const result = records(encodeCsv([[text("value")], ...values.map(value => [number(value)])]));
    expect(result.map(row => row.value)).toEqual(values);
    expect(encodeCsv([[number("-315.00")]])).toBe('\uFEFF"-315.00"\r\n');
  });

  it.each(["1e3", "+1", "NaN", "Infinity", "-1+2", "=1", "1,000", " 1", "", "1."])("rejects a non-decimal numeric payload instead of exporting it: %j", value => {
    expect(() => encodeCsv([[number(value)]])).toThrow("INVALID_NUMERIC_CELL");
  });

  it("rejects runtime Number payloads and leaves null empty rather than zero", () => {
    expect(() => encodeCsv([[{ kind: "number", value: 1 } as never]])).toThrow("INVALID_NUMERIC_CELL");
    expect(records(encodeCsv([[text("value")], [{ kind: "null" }]]))[0].value).toBe("");
  });
});

describe("M3 exact snapshot exports", () => {
  it("exports fixed golden period totals, channel facts, weeks and all bridge components", async () => {
    const { dataset, snapshot } = await setup();
    const csv = exportSnapshotCsv(dataset, snapshot);
    const headers = headerRow(csv);
    expect(headers.every(header => header === csvHeader(csvHeaderKey(header)))).toBe(true);
    expect(headers).toContain(`${labels.exports.csv.columns.row_type} (row_type)`);
    expect(headers).toContain(`${labels.exports.csv.columns.metric} (metric)`);
    const rows = records(csv);
    for (const period of ["previous", "current"] as const) {
      for (const [metric, value] of Object.entries(golden[period])) {
        expect(rows.find(row => row.row_type === "period_summary" && row.period === period && row.metric === metric)?.value).toBe(value);
      }
    }
    for (const [channel, expected] of Object.entries(golden.current_channels)) {
      expect(rows.find(row => row.row_type === "channel" && row.period === "current" && row.channel === channel && row.metric === "contribution_after_marketing")?.value).toBe(expected.contribution_after_marketing);
    }
    expect(rows.find(row => row.row_type === "weekly" && row.period === "current" && row.metric === "contribution_after_marketing")?.value).toBe("255.00");
    for (const [metric, value] of Object.entries(golden.bridge)) expect(rows.find(row => row.row_type === "bridge" && row.metric === metric)?.value).toBe(value);
  });

  it("carries the active filter metadata, raw string rates and actual source filenames", async () => {
    const { dataset, snapshot: original } = await setup();
    const snapshot = await createSnapshot(dataset, { channels: ["DTC"] }, original.dataset_hash);
    const rows = records(exportSnapshotCsv(dataset, snapshot, { "sales_daily.csv": "營運銷售.csv" }));
    // R4：assist_kpi 列的版本欄是 assist-kpi-v1（輔助指標獨立版本）；V3-9a F12：breakeven_mer 列是 breakeven-mer-v1（D-V3-17＝C）；其餘列仍是 contribution-v1。
    const versionOf = (rowType: string) => rowType === "assist_kpi" ? "assist-kpi-v1" : rowType === "breakeven_mer" ? "breakeven-mer-v1" : "contribution-v1";
    expect(rows.every(row => row.dataset_id === "golden-v1" && row.dataset_hash === snapshot.dataset_hash && row.filter_hash === snapshot.filter_hash && row.metric_version === versionOf(row.row_type) && row.as_of === "2026-08-03")).toBe(true);
    expect(rows.filter(row => row.row_type === "breakeven_mer")).toHaveLength(2);
    expect(rows.every(row => JSON.parse(row.scope).channels.length === 1 && JSON.parse(row.scope).channels[0] === "DTC")).toBe(true);
    expect(rows.filter(row => row.row_type === "channel").every(row => row.channel === "DTC")).toBe(true);
    expect(rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "contribution_after_marketing")?.value).toBe("270.00");
    const revenue = rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "net_revenue")!;
    expect(JSON.parse(revenue.source_refs).some((source: { file: string; logical_file: string }) => source.file === "營運銷售.csv" && source.logical_file === "sales_daily.csv")).toBe(true);
    expect(rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "discount_rate")?.value).toBe(snapshot.report.current.metrics.discount_rate.value);
  });

  it("exports null with missing-data reason instead of a usable zero", async () => {
    const { dataset, snapshot } = await setup(fixture("errors/missing_cogs"));
    const rows = records(exportSnapshotCsv(dataset, snapshot));
    const contribution = rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "contribution_after_marketing")!;
    expect(contribution.value).toBe("");
    expect(JSON.parse(contribution.reason_codes)).toContain("MISSING_COGS");
    expect(rows.find(row => row.row_type === "period_summary" && row.period === "current" && row.metric === "net_revenue")?.value).toBe("2470.00");
    expect(rows.find(row => row.row_type === "bridge" && row.metric === "sum")?.value).toBe("");
  });

  it("treats dataset metadata as untrusted text and never mutates the snapshot", async () => {
    const input = fixture();
    input.manifest = { ...(input.manifest as object), dataset_id: "=1+1" };
    const { dataset, snapshot } = await setup(input);
    const before = structuredClone({ dataset, snapshot });
    expect(records(exportSnapshotCsv(dataset, snapshot))[0].dataset_id).toBe("'=1+1");
    expect({ dataset, snapshot }).toEqual(before);
  });
});

describe("M3 scoped product and issue exports", () => {
  it("exports only supplied visible product rows, with category/search scope and no channel contribution", async () => {
    const { dataset, snapshot } = await setup();
    const product = snapshot.products.rows.filter(row => row.channel === "DTC" && row.sku === "A");
    const rows = records(exportProductsCsv(dataset, snapshot, product, { category: "HOME", query: "A" }));
    expect(rows.every(row => row.row_type === "product" && row.channel === "DTC" && row.sku === "A" && row.category === "HOME" && row.product_category === "HOME" && row.product_query === "A")).toBe(true);
    expect(rows.find(row => row.metric === "net_revenue")?.value).toBe("1120.00");
    expect(rows.find(row => row.metric === "gross_profit")?.value).toBe("540.00");
    expect(rows.some(row => ["ad_spend", "contribution_after_marketing", "contribution_before_marketing"].includes(row.metric))).toBe(false);
    expect(rows.every(row => JSON.parse(row.source_refs).every((source: { logical_file: string }) => source.logical_file === "sales_daily.csv"))).toBe(true);
  });

  it("protects SKU/category/query text and excludes injected non-product metric keys", async () => {
    const input = fixture();
    input.files["sales_daily.csv"] = (input.files["sales_daily.csv"] as string).replaceAll(",A,HOME,", ",=1+1,@HOME,");
    const { dataset, snapshot } = await setup(input);
    const products = snapshot.products.rows.filter(row => row.sku === "=1+1").map(row => ({ ...row, metrics: { ...row.metrics, contribution_after_marketing: { value: "999.00", reason_codes: [] } } })) as ProductRow[];
    const rows = records(exportProductsCsv(dataset, snapshot, products, { category: "@HOME", query: "=1+1" }));
    expect(rows.every(row => row.sku === "'=1+1" && row.category === "'@HOME" && row.product_category === "'@HOME" && row.product_query === "'=1+1")).toBe(true);
    expect(rows.some(row => row.metric === "contribution_after_marketing")).toBe(false);
  });

  it("an empty product selection exports metadata without inventing product totals", async () => {
    const { dataset, snapshot } = await setup();
    const rows = records(exportProductsCsv(dataset, snapshot, [], { query: "NO_MATCH" }));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ row_type: "selection", product_query: "NO_MATCH", value: "", metric: "" });
    expect(JSON.parse(rows[0].reason_codes)).toContain("NO_MATCHING_PRODUCTS");
  });

  it("issue CSV keeps logical/actual files and escapes untrusted error fields", () => {
    const issues: ValidationIssue[] = [{ severity: "blocking", file: "sales_daily.csv", line: 12, field: "=BAD", reason_code: "INVALID_MONEY", message: '含逗號,引號"與換行\n的文字', date: "2026-08-02", channel: "+DTC", sku: "-SKU" }];
    const csv = exportIssuesCsv(issues, { "sales_daily.csv": "@actual.csv" });
    // R3：多一欄白話說明；V3-2a 起 labels.errors.import 查不到的代碼顯示「問題代碼 XXX」，不退回 domain 的原訊息。
    expect(headerRow(csv)).toEqual(["severity", "file", "logical_file", "line", "field", "reason_code", "message", "message_plain", "date", "channel", "sku"].map(csvHeader));
    expect(headerRow(csv)[0]).toBe(`${labels.exports.csv.columns.severity} (severity)`);
    const rows = records(csv);
    expect(rows).toEqual([{ severity: "blocking", file: "'@actual.csv", logical_file: "sales_daily.csv", line: "12", field: "'=BAD", reason_code: "INVALID_MONEY", message: '含逗號,引號"與換行\n的文字', message_plain: `${labels.data.issues.reasonCodeSummary} INVALID_MONEY`, date: "2026-08-02", channel: "'+DTC", sku: "'-SKU" }]);
    expect(records(exportIssuesCsv([]))).toEqual([]);
  });
});

// ── V4-9b（D-V4-12＝A、D-V4-13＝B；CHART_CATALOG G1「匯出」列）──
const sha256 = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");
describe("V4-9b 一頁摘要 Markdown 的九項差額表；CSV、JSON 逐字不變", () => {
  it("通路表之後、其他常用指標之前多一段「貢獻變化拆解」：項目、差額（元）兩欄（數字欄 ---:），九列＝橋接表的列名與 L2 帶號差額（U+2212）", async () => {
    const { snapshot } = await setup();
    const summary = buildManagerSummary(snapshot);
    expect(summary.bridge).toEqual(snapshot.report.bridge.components);
    const lines = exportManagerSummaryMarkdown(summary, undefined, { generatedAt: FIXED_GENERATED_AT }).split("\n");
    const at = lines.indexOf(`## ${labels.overview.sections.bridge}`);
    expect(at).toBeGreaterThan(0);
    expect(lines.filter(line => isChartV4MarkdownLine(line))).toHaveLength(1);
    expect(lines.slice(at - 1, at + 15)).toEqual([
      "", `## ${labels.overview.sections.bridge}`, "", `| ${labels.overview.bridgeV3.table.item} | ${fill(labels.exports.common.moneyColumn, { label: labels.exports.csv.suffix.change })} |`, "| --- | ---: |",
      ...AMOUNT_FIELDS.map(field => `| ${labels.overview.bridgeV3.rows[field]} | ${formatSignedDelta(golden.bridge[field], "L2")} |`),
      "", `## ${labels.overview.sections.assistKpis}`,
    ]);
    // 接在通路表最後一列之後；golden：原價收入 +600、折扣 −250（U+2212，不是 ASCII 負號）。
    expect(lines[at - 2]).toMatch(/^\| MARKETPLACE \|/);
    expect(lines[at + 4]).toBe(`| ${labels.overview.bridgeV3.rows.gross_sales} | +600 |`);
    expect(lines[at + 5]).toBe(`| ${labels.overview.bridgeV3.rows.discounts} | ${MINUS}250 |`);
    // 舊的摘要物件（沒有 bridge 欄位）照舊輸出，不多這一段。
    const { bridge: _bridge, ...legacy } = summary;
    void _bridge;
    const old = exportManagerSummaryMarkdown(legacy, undefined, { generatedAt: FIXED_GENERATED_AT }).split("\n");
    expect(old).not.toContain(`## ${labels.overview.sections.bridge}`);
    expect(old.length).toBe(lines.length - 14);
  });

  it("Markdown 沒有版本之分：變體只管列印／PDF、Excel、PPT，三種選擇都輸出同一份（都有九項差額表）；有會議脈絡時也有", async () => {
    const { snapshot } = await setup();
    const summary = buildManagerSummary(snapshot);
    const outputs = EXPORT_VARIANTS.map(variant => {
      expect(Object.keys(variantSpec(variant)), variant).not.toContain("markdown");
      return exportManagerSummaryMarkdown(summary, undefined, { generatedAt: FIXED_GENERATED_AT });
    });
    for (const output of outputs) {
      expect(output).toBe(outputs[0]);
      expect(output).toContain(`\n## ${labels.overview.sections.bridge}\n`);
    }
    const { managerSummaryContextMd } = await goldenFormattedExports();
    expect(managerSummaryContextMd).toContain(`\n## ${labels.overview.sections.bridge}\n`);
  });

  it("CSV、JSON 與 V4-9b 開工前（74c81cc）逐字相同（D-V4-13＝B：不新增 daily 列與週列 channel 欄）", async () => {
    /** 74c81cc 以同一段程式算出的 sha256 與字數（golden、refund_only、zero_ad 各六種：分析 CSV、商品 CSV、通路寬表 CSV、問題 CSV、決策 CSV、決策 JSON）。 */
    const BASELINE: Record<string, [string, number]> = {
      "golden|snapshot_csv": ["91d9c716f85029da151460a02fd7a4cbe021db741c7b6e640b4c084e062bec72", 312048],
      "golden|products_csv": ["d7a477f5103d3cba6f5813767405297b93f3044ca9e097bb1c432fadd354b20d", 36832],
      "golden|channel_csv": ["08f40060224421b78347e1901bcfb985009cec42262bc914a08054b9942fe21d", 1250],
      "golden|issues_csv": ["568b9d6534f70d9cc1c2a1723b6963ef0ffe54be48f974e21185d45dff1339b0", 174],
      "golden|decision_csv": ["39b9d821e9cfdb82bd697ab615883164327a481104725c790339e8f76106fc76", 276561],
      "golden|decision_json": ["310f7e6a49ed3cfd012c49d724525ba63d5aff2372d75e7b55d1a202b93bbfe3", 116090],
      "refund_only|snapshot_csv": ["39af49479054c5e571d2a9fcf4f580b504f85aba8b5515b5f24b7190eeb08dba", 191497],
      "refund_only|products_csv": ["efbed8fb6e8c96f5165804356b21cc479d2965b7e951d373c22afc721ded55ec", 9589],
      "refund_only|channel_csv": ["57c8b47deab37161982449f3e41a1ceca747c2c01e61d5482d0d2b977ea60d44", 902],
      "refund_only|issues_csv": ["568b9d6534f70d9cc1c2a1723b6963ef0ffe54be48f974e21185d45dff1339b0", 174],
      "refund_only|decision_csv": ["fd992fd9b64ebade62a532663d1d8ed3fe04889be849be863d59e4b45b442e8e", 225461],
      "refund_only|decision_json": ["76b919447342efb94a6c4c081b273bce451343c58c5d008fc13d5f6d91d70c48", 98142],
      "zero_ad|snapshot_csv": ["7ab7ff5d108a097ca1797cf2a8a05cee12c83cf1710de64a52e69f882589acd4", 312388],
      "zero_ad|products_csv": ["6ddcda003999f94a1b8404d3ed8ed0720c04198445aa19f4d1e599f05a7e9296", 36868],
      "zero_ad|channel_csv": ["01c90c8ecd0663c1d2396ad253c31dd4a93e27a92f974eb09d8c2f70b6a6d10e", 1249],
      "zero_ad|issues_csv": ["568b9d6534f70d9cc1c2a1723b6963ef0ffe54be48f974e21185d45dff1339b0", 174],
      "zero_ad|decision_csv": ["df3aaef0b52268da8da1ed584566e3d974f47f6326fef7b074d3e1358a89d3fe", 277022],
      "zero_ad|decision_json": ["e5285441bf6663a784e2622e8edd386c74d02e239241a57763b03fd78727237d", 116310],
    };
    const current: Record<string, [string, number]> = {};
    for (const name of ["golden", "refund_only", "zero_ad"]) {
      const input = fixture(name);
      const dataset = validateDataset(input).dataset!;
      const hash = await hashInput(input);
      const snapshot = await createSnapshot(dataset, {}, hash);
      const session = createDecisionSession(dataset, await createSnapshot(dataset, { channels: [dataset.manifest.channels[0]] }, hash), 1);
      const plans = [...saveScenario(session, [], { id: "p", name: "p", inputs: SCENARIO_GOLDEN, sensitivity: { volumes: ["-10", "0", "10"] } }), { id: "d", name: "d", inputs: blankScenarioInputs(), result: null }];
      const texts: Record<string, string> = {
        snapshot_csv: exportSnapshotCsv(dataset, snapshot), products_csv: exportProductsCsv(dataset, snapshot, snapshot.products.rows, {}), channel_csv: exportChannelComparisonCsv(buildManagerSummary(snapshot)),
        issues_csv: exportIssuesCsv(dataset.issues), decision_csv: exportDecisionCsv(session, plans, []), decision_json: exportDecisionJson(session, plans, []),
      };
      for (const [key, text] of Object.entries(texts)) current[`${name}|${key}`] = [sha256(text), text.length];
    }
    expect(current).toEqual(BASELINE);
  });
});
