import { describe, expect, it } from "vitest";
import { achievement, achievementText, exportTargetsCsv, matchTargets, mismatchText, parseTargets, targetDisplay, targetsCsvTemplate, TARGET_METRICS, type TargetScope, type TargetSet } from "../src/application/targets";
import { formatAmountL1, formatAmountL3, formatRateL1, MINUS } from "../src/application/presentation";
import { fill, labels } from "../src/i18n";
import type { Metric } from "../src/domain/types";

// R4-4 targets.csv（05_FEATURES §3）。所有期待值都是手寫，不依賴 fixtures。
const CHANNELS = ["shopee", "website", "momo"] as const;
const bytes = (text: string) => new TextEncoder().encode(text);
const load = (text: string, name = "targets.csv") => parseTargets({ name, bytes: bytes(text) }, CHANNELS);
const metric = (value: string | null): Metric => ({ value, reason_codes: value === null ? ["MISSING_VALUE"] : [] });
const AUGUST = { start: "2026-08-01", end: "2026-08-31" };

// 第 1 行是標題；資料列為第 2–7 行。兩個期間（7 月、8 月）、ALL 與 shopee、四個指標。
const SIX_ROWS = [
  "period_start,period_end,channel,metric,target",
  "2026-08-01,2026-08-31,ALL,net_revenue,8000000",                     // 2
  "2026-08-01,2026-08-31,ALL,gross_profit,3200000.5",                  // 3
  "2026-08-01,2026-08-31,shopee,contribution_after_marketing,450000",  // 4
  "2026-07-01,2026-07-31,ALL,ad_spend,600000.00",                      // 5
  "2026-07-01,2026-07-31,shopee,net_revenue,2500000",                  // 6
  "2026-08-01,2026-08-31,shopee,ad_spend,120000",                      // 7
].join("\r\n") + "\r\n";

function sixRowSet(): TargetSet {
  const { set, issues } = load(SIX_ROWS);
  expect(issues).toEqual([]);
  return set!;
}
const lineOf = (match: ReturnType<typeof matchTargets>[keyof ReturnType<typeof matchTargets>]) =>
  match.status === "matched" ? ["matched", match.row.line] : match.status === "mismatch" ? ["mismatch", match.nearest.line] : ["none"];
const summary = (scope: TargetScope, set = sixRowSet()) => Object.fromEntries(Object.entries(matchTargets(set, scope)).map(([name, match]) => [name, lineOf(match)]));

describe("R4 targets.csv parsing", () => {
  it("reads the six-row file, keeps source lines and normalises targets to two decimals", () => {
    const set = sixRowSet();
    expect(set.filename).toBe("targets.csv");
    expect(set.rows.map(row => [row.line, row.channel, row.metric, row.target])).toEqual([
      [2, "ALL", "net_revenue", "8000000.00"],
      [3, "ALL", "gross_profit", "3200000.50"],
      [4, "shopee", "contribution_after_marketing", "450000.00"],
      [5, "ALL", "ad_spend", "600000.00"],
      [6, "shopee", "net_revenue", "2500000.00"],
      [7, "shopee", "ad_spend", "120000.00"],
    ]);
  });

  it("accepts a BOM, ignores extra columns and column order, and trims cells", () => {
    const text = "\ufeffnote,target,metric,channel,period_end,period_start\r\nfree text, -5 ,ad_spend,momo,2026-08-31,2026-08-01\r\n";
    const { set, issues } = load(text, "my-targets.csv");
    expect(issues).toEqual([]);
    expect(set).toEqual({ filename: "my-targets.csv", rows: [{ period_start: "2026-08-01", period_end: "2026-08-31", channel: "momo", metric: "ad_spend", target: "-5.00", line: 2 }] });
  });

  it("reports every error code with its line and rejects the whole file", () => {
    const text = [
      "period_start,period_end,channel,metric,target",
      "2026-13-01,2026-08-31,ALL,net_revenue,1",       // 2 INVALID_DATE（13 月）
      "2026-08-31,2026-08-01,ALL,net_revenue,1",       // 3 PERIOD_ORDER
      "2026-08-01,2026-08-31,tiktok,net_revenue,1",    // 4 UNKNOWN_CHANNEL
      "2026-08-01,2026-08-31,ALL,orders,1",            // 5 INVALID_METRIC
      "2026-08-01,2026-08-31,ALL,gross_profit,\"8,000,000\"", // 6 INVALID_TARGET（千分位）
      "2026-08-01,2026-08-31,ALL,ad_spend,1.234",      // 7 INVALID_TARGET（三位小數）
      "2026-08-01,2026-08-31,ALL,ad_spend,100",        // 8 合法
      "2026-08-01,2026-08-31,ALL,ad_spend,200",        // 9 DUPLICATE（與第 8 行）
      "2026-02-29,2026-03-31,ALL,net_revenue,1",       // 10 INVALID_DATE（2026 非閏年）
    ].join("\n");
    const { set, issues } = load(text);
    expect(set).toBeNull();
    expect(issues.map(issue => [issue.reason_code, issue.line, issue.field])).toEqual([
      ["INVALID_DATE", 2, "period_start"],
      ["PERIOD_ORDER", 3, "period_end"],
      ["UNKNOWN_CHANNEL", 4, "channel"],
      ["INVALID_METRIC", 5, "metric"],
      ["INVALID_TARGET", 6, "target"],
      ["INVALID_TARGET", 7, "target"],
      ["DUPLICATE", 9, "$record"],
      ["INVALID_DATE", 10, "period_start"],
    ]);
    expect(issues[0].message).toBe(fill(labels.targets.errors.INVALID_DATE, { line: 2 }));
    expect(issues[2].message).toBe(fill(labels.targets.errors.UNKNOWN_CHANNEL, { line: 4, value: "tiktok" }));
    expect(issues[3].message).toBe(fill(labels.targets.errors.INVALID_METRIC, { line: 5, value: "orders" }));
    expect(issues[4].message).toBe(fill(labels.targets.errors.INVALID_TARGET, { line: 6, value: "8,000,000" }));
    expect(issues[6].message).toBe(fill(labels.targets.errors.DUPLICATE, { line: 9, other: 8 }));
    for (const issue of issues) expect(issue.message).not.toMatch(/\{\w+\}/);
  });

  it("names each missing column on the header line", () => {
    const { set, issues } = load("period_start,channel,target\n2026-08-01,ALL,1\n");
    expect(set).toBeNull();
    expect(issues.map(issue => [issue.reason_code, issue.line, issue.field, issue.message])).toEqual([
      ["MISSING_COLUMN", 1, "period_end", fill(labels.targets.errors.MISSING_COLUMN, { field: "period_end" })],
      ["MISSING_COLUMN", 1, "metric", fill(labels.targets.errors.MISSING_COLUMN, { field: "metric" })],
    ]);
  });

  it("flags a header-only file (including the blank template) as EMPTY", () => {
    for (const text of [targetsCsvTemplate(), "period_start,period_end,channel,metric,target\n\n"]) {
      const { set, issues } = load(text);
      expect(set).toBeNull();
      expect(issues).toEqual([{ line: null, field: "$record", reason_code: "EMPTY", message: labels.targets.errors.EMPTY }]);
    }
    expect(targetsCsvTemplate()).toBe("\ufeffperiod_start,period_end,channel,metric,target\r\n");
  });

  it("passes CSV-level failures through with their reason code", () => {
    const invalidUtf8 = parseTargets({ name: "targets.csv", bytes: new Uint8Array([0x70, 0xff, 0xfe]) }, CHANNELS);
    expect(invalidUtf8.set).toBeNull();
    expect(invalidUtf8.issues.map(issue => issue.reason_code)).toEqual(["INVALID_UTF8"]);
    const ragged = load("period_start,period_end,channel,metric,target\n2026-08-01,2026-08-31,ALL\n");
    expect(ragged.issues.map(issue => [issue.reason_code, issue.line])).toEqual([["COLUMN_COUNT_MISMATCH", 2]]);
  });

  it("round-trips through exportTargetsCsv with identical rows and lines", () => {
    const set = sixRowSet();
    const csv = exportTargetsCsv(set);
    expect(csv.startsWith("\ufeff\"period_start\",\"period_end\",\"channel\",\"metric\",\"target\"\r\n")).toBe(true);
    expect(csv).toContain("\"2026-08-01\",\"2026-08-31\",\"ALL\",\"gross_profit\",\"3200000.50\"\r\n");
    const again = parseTargets({ name: "targets.csv", bytes: bytes(csv) }, CHANNELS);
    expect(again).toEqual({ set, issues: [] });
    expect(exportTargetsCsv(again.set!)).toBe(csv);
  });
});

describe("R4 target matching (exact period only, no pro-rating)", () => {
  it("matches ALL rows for an all-channel scope and reports other periods as mismatch", () => {
    expect(summary({ current_period: AUGUST, channels: ["momo", "shopee", "website"], allChannels: CHANNELS })).toEqual({
      net_revenue: ["matched", 2],
      gross_profit: ["matched", 3],
      contribution_after_marketing: ["none"], // 只有 shopee 的目標，不套到全部通路
      ad_spend: ["mismatch", 5],              // ALL 只有 7 月的目標
    });
  });

  it("matches the channel's own rows for a single-channel scope", () => {
    expect(summary({ current_period: AUGUST, channels: ["shopee"], allChannels: CHANNELS })).toEqual({
      net_revenue: ["mismatch", 6],           // shopee 只有 7 月
      gross_profit: ["none"],                 // ALL 的目標不拆給單一通路
      contribution_after_marketing: ["matched", 4],
      ad_spend: ["matched", 7],
    });
  });

  it("never matches a partial multi-channel selection", () => {
    expect(summary({ current_period: AUGUST, channels: ["shopee", "website"], allChannels: CHANNELS })).toEqual({
      net_revenue: ["none"], gross_profit: ["none"], contribution_after_marketing: ["none"], ad_spend: ["none"],
    });
    expect(summary({ current_period: AUGUST, channels: [], allChannels: CHANNELS })).toEqual({
      net_revenue: ["none"], gross_profit: ["none"], contribution_after_marketing: ["none"], ad_spend: ["none"],
    });
  });

  it("treats a partially overlapping current period as mismatch, not a pro-rated target", () => {
    const halfMonth = { start: "2026-08-01", end: "2026-08-15" };
    const result = matchTargets(sixRowSet(), { current_period: halfMonth, channels: [...CHANNELS], allChannels: CHANNELS });
    expect(result.net_revenue).toEqual({ status: "mismatch", nearest: expect.objectContaining({ line: 2, target: "8000000.00" }) });
    if (result.net_revenue.status === "mismatch") expect(mismatchText(result.net_revenue.nearest)).toBe(fill(labels.targets.mismatch, { start: result.net_revenue.nearest.period_start, end: result.net_revenue.nearest.period_end }));
  });

  it("picks the most overlapping, then the closest period as the nearest mismatch", () => {
    const text = [
      "period_start,period_end,channel,metric,target",
      "2026-06-01,2026-06-30,ALL,net_revenue,1",   // 2 與本期相隔 31 天
      "2026-09-01,2026-09-30,ALL,net_revenue,2",   // 3 與本期相隔 11 天
      "2026-07-20,2026-08-05,ALL,net_revenue,3",   // 4 重疊 5 天（8/1–8/5）
      "2026-08-10,2026-09-10,ALL,net_revenue,4",   // 5 重疊 11 天（8/10–8/20）
      "2026-06-01,2026-06-30,ALL,gross_profit,5",  // 6
      "2026-09-01,2026-09-30,ALL,gross_profit,6",  // 7
    ].join("\n");
    const { set } = load(text);
    const current = { start: "2026-08-01", end: "2026-08-20" };
    const result = matchTargets(set, { current_period: current, channels: [...CHANNELS], allChannels: CHANNELS });
    expect(lineOf(result.net_revenue)).toEqual(["mismatch", 5]);
    expect(lineOf(result.gross_profit)).toEqual(["mismatch", 7]); // 9/1 與 8/20 相隔 11 天，比 6/30（相隔 31 天）近
  });

  it("prefers ALL when a single-channel dataset selects its only channel", () => {
    const { set } = parseTargets({ name: "targets.csv", bytes: bytes("period_start,period_end,channel,metric,target\n2026-08-01,2026-08-31,shopee,net_revenue,1\n2026-08-01,2026-08-31,ALL,net_revenue,2\n") }, ["shopee"]);
    const result = matchTargets(set, { current_period: AUGUST, channels: ["shopee"], allChannels: ["shopee"] });
    expect(lineOf(result.net_revenue)).toEqual(["matched", 3]);
  });

  it("returns none for every metric without a target set", () => {
    const result = matchTargets(null, { current_period: AUGUST, channels: [...CHANNELS], allChannels: CHANNELS });
    expect(Object.keys(result)).toEqual([...TARGET_METRICS]);
    for (const name of TARGET_METRICS) expect(result[name]).toEqual({ status: "none" });
  });
});

describe("R4 achievement rate", () => {
  it("divides actual by target to one decimal, half up", () => {
    // 7,848,000.00 ÷ 8,000,000 = 0.981 → 98.1%
    expect(achievement(metric("7848000.00"), "8000000.00")).toEqual({ rate: "98.1%", display: "98.1%", status: "ok" });
    // 7,844,000 ÷ 8,000,000 = 0.9805 → 98.05% → 98.1%（ROUND_HALF_UP）
    expect(achievement(metric("7844000.00"), "8000000.00").rate).toBe("98.1%");
    // 7,843,960 ÷ 8,000,000 = 0.980495 → 98.0%
    expect(achievement(metric("7843960.00"), "8000000.00").rate).toBe("98.0%");
  });

  it("shows exactly 100% and above 100%", () => {
    expect(achievement(metric("8000000.00"), "8000000.00").rate).toBe("100.0%");
    expect(achievement(metric("8400000.00"), "8000000.00").rate).toBe("105.0%");
    expect(achievement(metric("16000000.01"), "8000000.00").rate).toBe("200.0%");
  });

  it("keeps negative actuals signed and avoids -0.0%", () => {
    // V3-2b：負號由 formatRateL1 決定（U+2212）；−100 ÷ 1,000 ＝ −0.1；−0.01 ÷ 1,000,000 取位後為 0，不帶符號。
    expect(achievement(metric("-100.00"), "1000.00").rate).toBe(formatRateL1("-0.1"));
    expect(achievement(metric("-100.00"), "1000.00").rate?.startsWith(MINUS)).toBe(true);
    expect(achievement(metric("-0.01"), "1000000.00").rate).toBe(formatRateL1("0"));
  });

  it("is undefined when the target is zero or negative, and missing when actual is unknown", () => {
    expect(achievement(metric("7848000.00"), "0.00")).toEqual({ rate: null, display: labels.targets.undefinedTarget, status: "undefined" });
    expect(achievement(metric("7848000.00"), "-1.00")).toEqual({ rate: null, display: labels.targets.undefinedTarget, status: "undefined" });
    expect(achievement(metric(null), "8000000.00")).toEqual({ rate: null, display: labels.status.missing, status: "missing" });
  });

  it("formats the KPI card line from labels", () => {
    const row = sixRowSet().rows[0];
    // 預設 L3（目標清單）；KPI 卡傳 L1（萬）。
    expect(targetDisplay(row)).toBe(formatAmountL3(row.target));
    expect(targetDisplay(row, "L1")).toBe(formatAmountL1(row.target));
    expect(achievementText(row, metric("7848000.00"))).toBe(fill(labels.targets.achieved, { target: formatAmountL3("8000000.00"), rate: "98.1%" }));
    expect(achievementText(row, metric("7848000.00"), "L1")).toBe(fill(labels.targets.achieved, { target: formatAmountL1("8000000.00"), rate: "98.1%" }));
    expect(achievementText(row, metric(null))).toBe(labels.status.missing);
  });
});

describe("R4 targets reach the analysis CSV as target / achievement rows", () => {
  it("writes the target amount and a 12-place achievement ratio for matched metrics only", async () => {
    const { validateDataset } = await import("@/domain/validation");
    const { createSnapshot, hashInput } = await import("@/application/workspace");
    const { exportSnapshotCsv } = await import("@/application/export");
    const { csvHeaderKey } = await import("@/application/copy");
    const { parseCsv } = await import("@/lib/csv");
    const { fixture } = await import("./helpers/fixtures");
    const input = fixture("golden");
    const dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    // golden 本期 2026-08-02：淨營收 2470.00 → 目標 2000.00 達成 1.235；毛利目標期間不同 → 不列。
    const set = { filename: "targets.csv", rows: [
      { period_start: "2026-08-02", period_end: "2026-08-02", channel: "ALL", metric: "net_revenue" as const, target: "2000.00", line: 2 },
      { period_start: "2026-08-01", period_end: "2026-08-02", channel: "ALL", metric: "gross_profit" as const, target: "100.00", line: 3 },
    ] };
    const parsed = parseCsv(exportSnapshotCsv(dataset, snapshot, {}, null, set));
    const rows = parsed.rows.map(row => Object.fromEntries(parsed.headers.map((header, index) => [csvHeaderKey(header), row.values[index]])));
    const targets = rows.filter(row => row.row_type === "target");
    expect(targets.map(row => row.metric)).toEqual(["target_net_revenue", "achievement_net_revenue"]);
    expect(targets[0]).toMatchObject({ value: "2000.00", unit: "TWD" });
    expect(targets[1]).toMatchObject({ value: "1.235000000000", unit: "ratio", reason_codes: "[]" });
  });
});

describe("R4 review follow-ups: row cap and full-date mismatch text", () => {
  it("rejects more than MAX_TARGET_ROWS rows so the set can always be backed up", async () => {
    const { MAX_TARGET_ROWS, parseTargets, mismatchText, targetRowIssues } = await import("@/application/targets");
    const header = "period_start,period_end,channel,metric,target";
    const day = (index: number) => new Date(Date.parse("2020-01-01T00:00:00Z") + index * 86_400_000).toISOString().slice(0, 10);
    const unique = Array.from({ length: MAX_TARGET_ROWS + 1 }, (_, index) => `${day(index)},${day(index)},ALL,net_revenue,${index + 1}.00`);
    const result = parseTargets({ name: "big.csv", bytes: new TextEncoder().encode([header, ...unique].join("\n")) }, ["DTC"]);
    expect(result.set).toBeNull();
    expect(result.issues.map(issue => issue.reason_code)).toContain("TOO_MANY_ROWS");
    expect(targetRowIssues([{ period_start: "2026-08-01", period_end: "2026-08-31", channel: "SHOPEE", metric: "net_revenue", target: "1.00", line: 2 }], ["DTC"]).map(issue => issue.reason_code)).toEqual(["UNKNOWN_CHANNEL"]);
    expect(mismatchText({ period_start: "2025-08-01", period_end: "2025-08-31", channel: "ALL", metric: "net_revenue", target: "1.00", line: 2 })).toBe("目標期間 2025-08-01–2025-08-31 與本期不一致");
  });
});
