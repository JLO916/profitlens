import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { importColumns, inspectImportFile, prepareImport } from "@/application/import";
import { buildImportReconciliation, columnGuidance, proposeImportSettings, standardCsvTemplate } from "@/application/import-guidance";
import type { FileName } from "@/domain/types";
const roles = Object.keys(importColumns) as FileName[];
function draft(role: FileName, csv: string) {
  const bytes = new TextEncoder().encode(csv);
  return inspectImportFile(role, { name: role, bytes, size: bytes.length });
}
function fixture(folder = "golden") {
  const path = `fixtures/${folder}/`;
  const drafts = Object.fromEntries(roles.map(role => [role, draft(role, readFileSync(path + role, "utf8"))]));
  const manifest = JSON.parse(readFileSync(path + "manifest.json", "utf8"));
  return { drafts, manifest };
}
describe("PL03 import guidance", () => {
  it("provides Chinese meaning for every standard field and headers-only templates without fake financial zeroes", () => {
    for (const role of roles) {
      const template = standardCsvTemplate(role);
      expect(template.trim()).toBe(importColumns[role].join(","));
      expect(template.trim().split(/\r?\n/)).toHaveLength(1);
      for (const field of importColumns[role]) expect(columnGuidance[field]).toMatchObject({ label: expect.any(String), meaning: expect.any(String) });
    }
  });
  it("proposes range and channels using all three files without changing drafts or confirming coverage", () => {
    const { drafts } = fixture(); const copy = structuredClone(drafts);
    expect(proposeImportSettings(drafts)).toMatchObject({
      proposal: { coverage_start: "2026-08-01", coverage_end: "2026-08-02", data_as_of: "2026-08-02", channels: ["DTC", "MARKETPLACE"], previous_period: { start: "2026-08-01", end: "2026-08-01" }, current_period: { start: "2026-08-02", end: "2026-08-02" }, comparison_mode: "same_days" }, issues: [],
    });
    expect(drafts).toEqual(copy);
    expect(proposeImportSettings(drafts).proposal).not.toHaveProperty("sales_coverage_confirmed");
  });
  it("requires explicit renamed date/channel mapping and refuses invalid dates or empty channel", () => {
    const { drafts } = fixture();
    const role = "sales_daily.csv";
    const text = readFileSync(`fixtures/golden/${role}`, "utf8").replace("date,channel", "日期,通路");
    drafts[role] = draft(role, text);
    expect(proposeImportSettings(drafts).proposal).toBeNull();
    drafts[role].mapping.date = "日期"; drafts[role].mapping.channel = "通路";
    expect(proposeImportSettings(drafts).proposal).toBeNull();
    drafts[role].mappingConfirmed = true;
    expect(proposeImportSettings(drafts).proposal).not.toBeNull();
    drafts[role] = draft(role, text.replace("日期,通路", "date,channel").replace("2026-08-01,DTC", "2026-02-30,"));
    expect(proposeImportSettings(drafts).issues).toEqual(expect.arrayContaining([expect.objectContaining({ field: "date", line: 2 }), expect.objectContaining({ field: "channel", line: 2 })]));
    expect(proposeImportSettings(drafts).proposal).toBeNull();
  });
  it("includes cost-only days and clearly proposes equal periods without silently dropping an odd middle day", () => {
    const { drafts } = fixture();
    drafts["ad_spend_daily.csv"] = draft("ad_spend_daily.csv", "date,channel,ad_spend,currency\n2026-08-03,OTHER,0,TWD\n");
    const result = proposeImportSettings(drafts);
    expect(result.proposal?.coverage_end).toBe("2026-08-03");
    expect(result.proposal?.channels).toContain("OTHER");
    expect(result.proposal?.previous_period).toEqual({ start: "2026-08-01", end: "2026-08-01" });
    expect(result.proposal?.current_period).toEqual({ start: "2026-08-03", end: "2026-08-03" });
    expect(result.notes.join(" ")).toContain("2026-08-02");
  });
  it("does not trim invalid date/channel keys into valid proposals", () => {
    const { drafts } = fixture();
    drafts["ad_spend_daily.csv"] = draft("ad_spend_daily.csv", "date,channel,ad_spend,currency\n 2026-08-02, DTC,0,TWD\n");
    expect(proposeImportSettings(drafts).proposal).toBeNull();
  });
  it("keeps valid maximum-year keys from crashing proposal generation", () => {
    const { drafts } = fixture();
    for (const role of roles) drafts[role] = draft(role, "date,channel\n9999-12-01,DTC\n9999-12-31,DTC\n");
    expect(() => proposeImportSettings(drafts)).not.toThrow();
    expect(proposeImportSettings(drafts).proposal?.coverage_end).toBe("9999-12-31");
  });
  it("proposes two adjacent complete months without truncating the longer month", () => {
    const { drafts } = fixture();
    for (const role of roles) drafts[role] = draft(role, "date,channel\n2026-08-01,DTC\n2026-09-30,DTC\n");
    const result = proposeImportSettings(drafts);
    expect(result.proposal).toMatchObject({ comparison_mode: "calendar_months", previous_period: { start: "2026-08-01", end: "2026-08-31" }, current_period: { start: "2026-09-01", end: "2026-09-30" } });
  });
});
describe("PL04 reconciliation", () => {
  it("independently totals source columns then compares all-coverage domain metrics with fixed golden answers", () => {
    const { drafts, manifest } = fixture();
    const prepared = prepareImport(manifest, drafts, { amountBasisConfirmed: true });
    const result = buildImportReconciliation(prepared, drafts)!;
    expect(result.fields.find(row => row.field === "gross_sales")).toMatchObject({ source_column: "gross_sales", source_total: "5600.00", standard_total: "5600.00", difference: "0.00" });
    expect(result.fields.find(row => row.field === "ad_spend")).toMatchObject({ source_total: "750.00", standard_total: "750.00", difference: "0.00" });
    expect(result.metrics.net_revenue.value).toBe("4720.00");
    expect(result.metrics.contribution_after_marketing.value).toBe("825.00");
    expect(result.excluded.join(" ")).toContain("運費收入");
    expect(result.excluded.join(" ")).toContain("平台補助");
  });
  it("keeps blank cost unknown while showing known subtotal separately; missing ad day is never zero", () => {
    for (const [folder, field, reason] of [["errors/missing_cogs", "cogs_net", "MISSING_COGS"], ["errors/missing_ad_day", "ad_spend", "MISSING_AD_DAY"]]) {
      const { drafts, manifest } = fixture(folder);
      const result = buildImportReconciliation(prepareImport(manifest, drafts, { amountBasisConfirmed: true }), drafts)!;
      const row = result.fields.find(item => item.field === field)!;
      expect(row.standard_total).toBeNull();
      expect(row.difference).toBeNull();
      expect(row.reason_codes).toContain(reason);
      expect(result.metrics.net_revenue.value).toBe("4720.00");
      expect(result.metrics.contribution_after_marketing.value).toBeNull();
      if (field === "cogs_net") { expect(row.source_total).toBeNull(); expect(row.missing_values).toBe(1); }
    }
  });
  it("preserves valid zeroes and decimal precision", () => {
    const { drafts, manifest } = fixture();
    drafts["ad_spend_daily.csv"] = draft("ad_spend_daily.csv", "date,channel,ad_spend,currency\n2026-08-01,DTC,0.10,TWD\n2026-08-01,MARKETPLACE,0.20,TWD\n2026-08-02,DTC,0,TWD\n2026-08-02,MARKETPLACE,0,TWD\n");
    const result = buildImportReconciliation(prepareImport(manifest, drafts, { amountBasisConfirmed: true }), drafts)!;
    expect(result.fields.find(row => row.field === "ad_spend")).toMatchObject({ source_total: "0.30", standard_total: "0.30", difference: "0.00" });
  });
  it("preserves more than one hundred digits without floating-point rounding", () => {
    const { drafts, manifest } = fixture();
    const amount = "9".repeat(150) + ".10";
    drafts["ad_spend_daily.csv"] = draft("ad_spend_daily.csv", `date,channel,ad_spend,currency\n2026-08-01,DTC,${amount},TWD\n2026-08-01,MARKETPLACE,0.20,TWD\n2026-08-02,DTC,0,TWD\n2026-08-02,MARKETPLACE,0,TWD\n`);
    const result = buildImportReconciliation(prepareImport(manifest, drafts, { amountBasisConfirmed: true }), drafts)!;
    expect(result.fields.find(row => row.field === "ad_spend")).toMatchObject({ source_total: "9".repeat(150) + ".30", difference: "0.00" });
  });
  it.each(["including_tax", "net_after_deductions", "unknown"] as const)("blocks acknowledged incompatible %s source instead of converting", sourceAmountBasis => {
    const { drafts, manifest } = fixture(); const copy = structuredClone(drafts);
    const result = prepareImport(manifest, drafts, { amountBasisConfirmed: true, sourceAmountBasis });
    expect(result.input).toBeNull();
    expect(result.validation.issues).toContainEqual(expect.objectContaining({ reason_code: "SOURCE_AMOUNT_BASIS_UNSUPPORTED" }));
    expect(buildImportReconciliation(result, drafts)).toBeNull();
    expect(drafts).toEqual(copy);
  });
});
