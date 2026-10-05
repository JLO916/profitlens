import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { aggregatePeriod } from "../src/domain/aggregation";
import type { FileName } from "../src/domain/types";
import { inspectImportFile } from "../src/application/import";
import { buildManifest, canConfirm, canLeaveFiles, canLeaveMapping, initialWizardState, memoryEntries, monthShortcut, needsMappingStep, plainIssueMessage, proposeSettings, roleForFilename, runCheck, suggestFileMapping, wizardMappingStore, wizardReducer, type WizardState } from "../src/application/import-wizard";
import { MemoryMappingStore, rememberMapping } from "../src/application/mapping-memory";
import { fill, labels } from "../src/i18n";

const roles: FileName[] = ["sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv"];
function payload(dir: string, role: FileName, name = role) {
  const bytes = new Uint8Array(readFileSync(resolve(dir, role)));
  return { name, size: bytes.byteLength, bytes };
}
function loaded(dir: string, overrides: Partial<Record<FileName, string>> = {}): WizardState {
  let state = initialWizardState();
  for (const role of roles) {
    const file = payload(dir, role);
    const text = overrides[role];
    const bytes = text === undefined ? file.bytes : new TextEncoder().encode(text);
    state = wizardReducer(state, { type: "fileRead", role, draft: inspectImportFile(role, { name: file.name, size: bytes.byteLength, bytes }), encoding: "utf8", memory: null });
  }
  return state;
}
const inclusive = resolve("tests/fixtures/inclusive_tax");
const alternative = resolve("tests/fixtures/alternative");

describe("R3 wizard: file slots", () => {
  it("auto-assigns roles from filenames and leaves unknown names unassigned", () => {
    expect(roleForFilename("Sales_2026-08.csv")).toBe("sales_daily.csv");
    expect(roleForFilename("蝦皮銷售報表.csv")).toBe("sales_daily.csv");
    expect(roleForFilename("channel_costs_daily.csv")).toBe("channel_costs_daily.csv");
    expect(roleForFilename("平台費用.csv")).toBe("channel_costs_daily.csv");
    expect(roleForFilename("ad_spend_daily.csv")).toBe("ad_spend_daily.csv");
    expect(roleForFilename("meta-ads-daily.csv")).toBe("ad_spend_daily.csv");
    expect(roleForFilename("廣告投放.csv")).toBe("ad_spend_daily.csv");
    expect(roleForFilename("report.csv")).toBeNull();
    expect(roleForFilename("upload.csv")).toBeNull();
  });
  it("cannot leave step 1 until all three files parse without blocking issues", () => {
    expect(canLeaveFiles(initialWizardState())).toBe(false);
    const state = loaded(alternative);
    expect(canLeaveFiles(state)).toBe(true);
    const broken = wizardReducer(state, { type: "fileFailed", role: "sales_daily.csv", issues: [{ file: "sales_daily.csv", field: "$file", line: null, severity: "blocking", reason_code: "FILE_TOO_LARGE", message: "x" }] });
    expect(canLeaveFiles(broken)).toBe(false);
    expect(plainIssueMessage(broken.readIssues["sales_daily.csv"]![0])).toBe(fill(labels.importErrors.FILE_TOO_LARGE, { file: "sales_daily.csv" }));
  });
});

describe("R3 wizard: mapping suggestions", () => {
  const standard = ["date", "channel", "sku", "category", "units_sold", "gross_sales", "discounts", "refunds", "cogs_net", "currency"];
  it("skips the mapping step only when every header is an exact standard name with nothing left over", () => {
    const state = loaded(alternative);
    expect(needsMappingStep(state)).toBe(false);
    const next = wizardReducer(state, { type: "next" });
    expect(next.step).toBe(3);
    expect(next.mappingSkipped).toBe(true);
    expect(roles.every(role => next.files[role]!.draft.mappingConfirmed && next.files[role]!.draft.ignoredColumnsConfirmed)).toBe(true);
    const extra = loaded(alternative, { "sales_daily.csv": readFileSync(resolve(alternative, "sales_daily.csv"), "utf8").replace(/^date,/, "note,date,").replace(/\n(?=.)/g, "\nx,").replace(/,$/m, "") });
    expect(needsMappingStep(extra)).toBe(true);
  });
  it("prefers exact names, then memory, then preset or dictionary, and never reuses a source column", () => {
    const headers = ["日期", "channel", "商品貨號", "品類", "件數", "商品金額", "折扣", "退款", "成本", "幣別"];
    const plain = suggestFileMapping("sales_daily.csv", headers, null);
    expect(plain.mapping).toMatchObject({ date: "日期", channel: "channel", sku: "商品貨號", gross_sales: "商品金額", cogs_net: "成本", currency: "幣別" });
    expect(plain.origins.channel).toBe("exact");
    expect(plain.origins.date).toBe("dictionary");
    const memory = { key: "k", role: "sales_daily.csv" as const, headers, mapping: { ...Object.fromEntries(standard.map(field => [field, ""])), date: "日期", gross_sales: "折扣", discounts: "商品金額", channel: "商品貨號" }, preset_id: null, basis: "inclusive" as const, rate: "0.05", convert_fields: ["gross_sales"], used_at: "2026-09-28" };
    const remembered = suggestFileMapping("sales_daily.csv", headers, memory);
    expect(remembered.origins.channel, "exact beats memory").toBe("exact");
    expect(remembered.mapping.gross_sales).toBe("折扣");
    expect(remembered.origins.gross_sales).toBe("memory");
    expect(remembered.mapping.discounts).toBe("商品金額");
    expect(remembered.origins.date).toBe("memory");
    const used = Object.values(remembered.mapping).filter(Boolean);
    expect(new Set(used).size).toBe(used.length);
  });
  it("detects an order-level preset and reports it instead of silently mapping", () => {
    const orderHeaders = "訂單號碼,訂單日期,商品貨號,商品名稱,數量,商品金額";
    const state = loaded(alternative, { "sales_daily.csv": `${orderHeaders}\n#1001,2026-09-01,SKU-1,T,1,100\n` });
    expect(state.files["sales_daily.csv"]!.preset?.preset.id).toBe("shopline_orders");
    expect(needsMappingStep(state)).toBe(true);
  });
  it("requires the ignore confirmation before leaving step 2 and clears a stolen source column", () => {
    const text = readFileSync(resolve(alternative, "sales_daily.csv"), "utf8").split(/\r?\n/).map((line, index) => line ? `${line},${index ? "x" : "memo"}` : line).join("\n");
    let state = loaded(alternative, { "sales_daily.csv": text });
    expect(canLeaveMapping(state)).toBe(false);
    state = wizardReducer(state, { type: "ignoreConfirmed", role: "sales_daily.csv", value: true });
    expect(canLeaveMapping(state)).toBe(true);
    state = wizardReducer(state, { type: "mapField", role: "sales_daily.csv", field: "discounts", source: "gross_sales" });
    expect(state.files["sales_daily.csv"]!.draft.mapping.gross_sales).toBe("");
    expect(state.files["sales_daily.csv"]!.origins.discounts).toBe("manual");
    expect(canLeaveMapping(state)).toBe(false);
  });
});

describe("R3 wizard: settings proposal and confirmation", () => {
  it("fills coverage, periods, channels and data_as_of = last day + 1 from the files", () => {
    const state = wizardReducer(loaded(inclusive), { type: "next" });
    expect(state.step).toBe(3);
    expect(state.settingsSource).toBe("proposal");
    expect(state.settings).toMatchObject({ coverage_start: "2026-08-01", coverage_end: "2026-08-04", data_as_of: "2026-08-05", previous_start: "2026-08-01", previous_end: "2026-08-02", current_start: "2026-08-03", current_end: "2026-08-04", comparison_mode: "same_days", channels: ["官網"], dataset_id: "import-2026-08-01-2026-08-04" });
    expect(state.availableChannels).toEqual(["官網"]);
    expect(proposeSettings(initialWizardState())).toBeNull();
  });
  it("offers the month shortcut only with two complete adjacent months", () => {
    expect(monthShortcut({ start: "2026-08-01", end: "2026-09-30" })).toEqual({ previous: { start: "2026-08-01", end: "2026-08-31" }, current: { start: "2026-09-01", end: "2026-09-30" } });
    expect(monthShortcut({ start: "2026-07-15", end: "2026-09-30" })).toEqual({ previous: { start: "2026-08-01", end: "2026-08-31" }, current: { start: "2026-09-01", end: "2026-09-30" } });
    expect(monthShortcut({ start: "2026-08-01", end: "2026-09-29" })).toBeNull();
    expect(monthShortcut({ start: "2026-08-01", end: "2026-08-04" })).toBeNull();
  });
  it("blocks confirmation until a basis is chosen, stops on 我不確定 and rejects a bad rate", () => {
    const base = wizardReducer(loaded(inclusive), { type: "next" });
    expect(canConfirm(base)).toBe(false);
    expect(canConfirm(wizardReducer(base, { type: "basis", basis: "unknown" }))).toBe(false);
    expect(canConfirm(wizardReducer(base, { type: "basis", basis: "exclusive" }))).toBe(true);
    const inclusiveState = wizardReducer(base, { type: "basis", basis: "inclusive" });
    expect(canConfirm(inclusiveState)).toBe(true);
    expect(canConfirm(wizardReducer(inclusiveState, { type: "ratePercent", percent: "25" }))).toBe(false);
    expect(canConfirm(wizardReducer(inclusiveState, { type: "ratePercent", percent: "5.5" }))).toBe(false);
    const confirmed = wizardReducer(wizardReducer(base, { type: "basis", basis: "exclusive" }), { type: "confirm" });
    expect(confirmed).toMatchObject({ step: 4, confirmed: true, checking: true });
    expect(confirmed.settings.sales_coverage_confirmed).toBe(true);
    expect(buildManifest(confirmed.settings)).toMatchObject({ source_type: "user_provided", currency: "TWD", timezone: "Asia/Taipei", sales_coverage_confirmed: true, amount_basis: "product_amounts_excluding_tax_and_customer_shipping_income", channels: ["官網"] });
  });
});

describe("R3 wizard: inclusive import equals the hand calculation", () => {
  // tests/fixtures/inclusive_tax/README.md：本期淨營收 2150.00、扣廣告後貢獻 518.05；未換算會是 2257.50。
  it("converts the default fields per row, records raw values and totals, and leaves cogs untouched", () => {
    const state = wizardReducer(wizardReducer(wizardReducer(loaded(inclusive), { type: "next" }), { type: "basis", basis: "inclusive" }), { type: "confirm" });
    const prepared = runCheck(state);
    expect(prepared.validation.classification).toBe("valid");
    expect(prepared.conversion).toMatchObject({ basis: "inclusive", rate: "0.05", rows_converted: 12 });
    expect(prepared.conversion!.fields).toEqual(["gross_sales", "discounts", "refunds", "platform_fees", "payment_fees", "fulfillment_costs", "other_variable_costs", "ad_spend"]);
    expect(prepared.conversion!.totals!.gross_sales).toEqual({ raw: "4725.00", converted: "4500.00" });
    expect(prepared.conversion!.totals!.other_variable_costs).toEqual({ raw: "1.00", converted: "0.95" });
    expect(prepared.raw_values["sales_daily.csv"]![4]).toEqual({ gross_sales: "840.00", discounts: "84.00", refunds: "0.00" });
    expect(prepared.raw_values["channel_costs_daily.csv"]![5].other_variable_costs).toBe("1.00");
    const dataset = prepared.validation.dataset!;
    const current = aggregatePeriod(dataset, { start: "2026-08-03", end: "2026-08-04" }, ["官網"]).metrics;
    expect(current.net_revenue.value).toBe("2150.00");
    expect(current.gross_profit.value).toBe("1230.00");
    expect(current.contribution_before_marketing.value).toBe("868.05");
    expect(current.contribution_after_marketing.value).toBe("518.05");
    const previous = aggregatePeriod(dataset, { start: "2026-08-01", end: "2026-08-02" }, ["官網"]).metrics;
    expect(previous.contribution_after_marketing.value).toBe("266.00");
  });
  it("keeps the numbers inclusive when the user picks 未稅, and blocks 我不確定", () => {
    const exclusive = runCheck(wizardReducer(wizardReducer(wizardReducer(loaded(inclusive), { type: "next" }), { type: "basis", basis: "exclusive" }), { type: "confirm" }));
    expect(exclusive.conversion).toBeNull();
    expect(aggregatePeriod(exclusive.validation.dataset!, { start: "2026-08-03", end: "2026-08-04" }, ["官網"]).metrics.net_revenue.value).toBe("2257.50");
    const unsure = { ...wizardReducer(wizardReducer(loaded(inclusive), { type: "next" }), { type: "basis", basis: "unknown" }), confirmed: true };
    expect(runCheck(unsure).validation.issues.map(issue => issue.reason_code)).toContain("SOURCE_AMOUNT_BASIS_UNSUPPORTED");
  });
  it("remembers the confirmed mapping with basis and rate per file, in memory when not consented", async () => {
    const state = wizardReducer(wizardReducer(wizardReducer(loaded(inclusive), { type: "next" }), { type: "basis", basis: "inclusive" }), { type: "convertField", role: "sales_daily.csv", field: "cogs_net", checked: true });
    const entries = memoryEntries(state, "2026-09-28");
    expect(entries).toHaveLength(3);
    expect(entries[0]).toMatchObject({ role: "sales_daily.csv", basis: "inclusive", rate: "0.05", convert_fields: ["gross_sales", "discounts", "refunds", "cogs_net"], used_at: "2026-09-28", preset_id: null });
    const memory = new MemoryMappingStore(), persistent = new MemoryMappingStore();
    let consented = false;
    const store = wizardMappingStore(() => consented, memory, persistent);
    const stored = await rememberMapping(store, entries[0]);
    expect(await persistent.get(stored.key)).toBeNull();
    expect(await memory.get(stored.key)).not.toBeNull();
    consented = true;
    await rememberMapping(store, entries[1]);
    expect((await persistent.get((await rememberMapping(persistent, entries[1])).key))?.role).toBe("channel_costs_daily.csv");
  });
});

describe("R3 review follow-ups", () => {
  it("treats only byte-identical standard names as exact; case/space variants are suggestions that keep step 2", () => {
    const upper = readFileSync(resolve(alternative, "sales_daily.csv"), "utf8").replace(/^date,channel,sku,category,units_sold,gross_sales/, "date,channel,sku,category,units_sold,GROSS_SALES");
    const state = loaded(alternative, { "sales_daily.csv": upper });
    expect(state.files["sales_daily.csv"]!.origins.gross_sales).toBe("dictionary");
    expect(state.files["sales_daily.csv"]!.draft.mapping.gross_sales).toBe("GROSS_SALES");
    expect(needsMappingStep(state)).toBe(true);
  });
  it("recalls a remembered mapping even when the new header has stray spaces", () => {
    const headers = ["日期", "channel", "商品貨號", "品類", "件數", " 商品金額 ", "折扣", "退款", "成本", "幣別"];
    const memory = { key: "k", role: "sales_daily.csv" as const, headers, mapping: { gross_sales: "商品金額" }, preset_id: null, basis: null, rate: null, convert_fields: [], used_at: "2026-09-28" };
    const suggested = suggestFileMapping("sales_daily.csv", headers, memory);
    expect(suggested.mapping.gross_sales).toBe(" 商品金額 ");
    expect(suggested.origins.gross_sales).toBe("memory");
  });
  it("does not flag a daily file as order-level when only generic dictionary headers match a fingerprint", () => {
    const daily = loaded(alternative, { "sales_daily.csv": "交易日期,通路,SKU,品類,件數,商品金額,折扣,退款,成本,幣別\n2026-09-01,DTC,A,T,1,100.00,0.00,0.00,50.00,TWD\n" });
    expect(daily.files["sales_daily.csv"]!.preset).toBeNull();
  });
  it("fills placeholders the issue lacks with 「—」 instead of falling back to the technical message", () => {
    // V3-2a §7.7.3：一律用 labels.importErrors 樣板，不退回 domain 的中文 message；拿不到的占位符顯示「—」。
    const rangeLevel = { file: "ad_spend_daily.csv" as const, field: "$coverage", line: null, severity: "partial" as const, reason_code: "MISSING_AD_DAY", message: "涵蓋日期與通路所需列數超過每檔上限" };
    expect(plainIssueMessage(rangeLevel)).toBe(fill(labels.importErrors.MISSING_AD_DAY, { date: "—", channel: "—" }));
    expect(plainIssueMessage(rangeLevel)).not.toContain(rangeLevel.message);
    expect(plainIssueMessage({ ...rangeLevel, date: "2026-08-01", channel: "官網" })).toBe(fill(labels.importErrors.MISSING_AD_DAY, { date: "2026-08-01", channel: "官網" }));
  });
  it("reads previously persisted memory without the consent box when a local database already exists, but never writes without consent", async () => {
    const memory = new MemoryMappingStore(), persistent = new MemoryMappingStore();
    const entry = await rememberMapping(persistent, { role: "sales_daily.csv", headers: ["a"], mapping: { date: "a" }, preset_id: null, basis: null, rate: null, convert_fields: [], used_at: "2026-09-28" });
    const store = wizardMappingStore(() => false, memory, persistent, async () => true);
    expect((await store.get(entry.key))?.role).toBe("sales_daily.csv");
    await store.put({ ...entry, key: entry.key, headers: ["b"] });
    expect(await persistent.get(entry.key)).toMatchObject({ headers: ["a"] });
    const fresh = wizardMappingStore(() => false, new MemoryMappingStore(), persistent, async () => false);
    expect(await fresh.get(entry.key)).toBeNull();
  });
});
