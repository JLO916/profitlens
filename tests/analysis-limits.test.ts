import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_ANALYSIS_WEEK_INTERVALS, MAX_ANALYSIS_CHANNELS, assertSupportedAnalysisChannels, assertSupportedAnalysisPeriods } from "@/application/limits";
import { createSnapshot } from "@/application/workspace";
import { inspectImportFile, prepareImport } from "@/application/import";
import type { ImportFileDraft } from "@/application/import";
import { analyzeDataset } from "@/domain/analysis";
import { validateDataset } from "@/domain/validation";
import type { Dataset, FileName, Period } from "@/domain/types";
import { fixture } from "./helpers/fixtures";

vi.mock("@/domain/analysis", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/domain/analysis")>();
  return { ...original, analyzeDataset: vi.fn(original.analyzeDataset) };
});
vi.mock("@/domain/validation", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/domain/validation")>();
  return { ...original, validateDataset: vi.fn(original.validateDataset) };
});
const mockedAnalyze = vi.mocked(analyzeDataset);
const mockedValidate = vi.mocked(validateDataset);
function period(start: string, days: number): Period {
  return { start, end: new Date(Date.parse(`${start}T00:00:00Z`) + (days - 1) * 86_400_000).toISOString().slice(0, 10) };
}
const hugePrevious = { start: "0001-01-01", end: "4000-12-31" };
const hugeCurrent = { start: "4001-01-01", end: "8000-12-31" };
function hugeDataset(): Dataset {
  const input = fixture();
  input.manifest = { ...(input.manifest as Record<string, unknown>), coverage_start: "0001-01-01", coverage_end: "8000-12-31", data_as_of: "8000-12-31", previous_period: hugePrevious, current_period: hugeCurrent };
  const validation = validateDataset(input);
  expect(validation.classification).toBe("partial");
  return validation.dataset!;
}
function inspectedFiles(): Partial<Record<FileName, ImportFileDraft>> {
  const input = fixture();
  return Object.fromEntries(Object.entries(input.files).map(([name, contents]) => {
    const bytes = new TextEncoder().encode(contents as string);
    return [name, inspectImportFile(name as FileName, { name, size: bytes.byteLength, bytes })];
  }));
}
beforeEach(async () => {
  const analysis = await vi.importActual<typeof import("@/domain/analysis")>("@/domain/analysis");
  const validation = await vi.importActual<typeof import("@/domain/validation")>("@/domain/validation");
  mockedAnalyze.mockReset().mockImplementation(analysis.analyzeDataset);
  mockedValidate.mockReset().mockImplementation(validation.validateDataset);
});

describe("bounded application analysis periods", () => {
  it("declares the technical limit independently of financial metrics", () => {
    expect(MAX_ANALYSIS_WEEK_INTERVALS).toBe(1040);
  });
  it("accepts exactly 1,040 seven-day intervals across the two periods", () => {
    expect(() => assertSupportedAnalysisPeriods(period("2000-01-01", 3640), period("2010-01-01", 3640))).not.toThrow();
  });
  it("counts a final partial interval instead of truncating it", () => {
    expect(() => assertSupportedAnalysisPeriods(period("2000-01-01", 3641), period("2010-01-01", 3640)))
      .toThrow(expect.objectContaining({ reason_code: "ANALYSIS_PERIOD_TOO_LARGE" }));
  });
  it("rejects valid extreme calendar periods without building a weekly range", () => {
    expect(() => assertSupportedAnalysisPeriods(hugePrevious, hugeCurrent))
      .toThrow(expect.objectContaining({ reason_code: "ANALYSIS_PERIOD_TOO_LARGE" }));
  });
  it("allows short periods and lets invalid dates remain errors", () => {
    expect(() => assertSupportedAnalysisPeriods(period("2026-08-01", 1), period("2026-08-02", 1))).not.toThrow();
    expect(() => assertSupportedAnalysisPeriods({ start: "2026-02-30", end: "2026-03-01" }, period("2026-08-02", 1))).toThrow();
  });
  it("rejects manifest-default oversized periods before calling the domain or allocating weeks", async () => {
    // RED is safe too: if the application has no guard yet this sentinel throws
    // immediately, rather than running the original unbounded implementation.
    mockedAnalyze.mockImplementationOnce(() => { throw new Error("DOMAIN_SHOULD_NOT_RUN_FOR_OVERSIZED_INPUT"); });
    await expect(createSnapshot(hugeDataset(), {}, "hash")).rejects.toMatchObject({ reason_code: "ANALYSIS_PERIOD_TOO_LARGE" });
    expect(mockedAnalyze).not.toHaveBeenCalled();
    mockedAnalyze.mockReset();
  });
  it("checks active filter periods before domain analysis, not only manifest defaults", async () => {
    const dataset = hugeDataset();
    dataset.manifest.previous_period = { start: "2026-08-01", end: "2026-08-01" };
    dataset.manifest.current_period = { start: "2026-08-02", end: "2026-08-02" };
    mockedAnalyze.mockImplementationOnce(() => { throw new Error("DOMAIN_SHOULD_NOT_RUN_FOR_OVERSIZED_INPUT"); });
    await expect(createSnapshot(dataset, { previous_period: hugePrevious, current_period: hugeCurrent }, "hash"))
      .rejects.toMatchObject({ reason_code: "ANALYSIS_PERIOD_TOO_LARGE" });
    expect(mockedAnalyze).not.toHaveBeenCalled();
    mockedAnalyze.mockReset();
  });
  it("turns an oversized import into a blocking non-commit result without mutating M1 data", () => {
    const source = hugeDataset().manifest;
    const original = structuredClone(source);
    const result = prepareImport(source, inspectedFiles(), { amountBasisConfirmed: true });
    expect(result.input).toBeNull();
    expect(result.validation.classification).toBe("blocking");
    expect(result.validation.dataset).toBeNull();
    expect(result.validation.issues).toContainEqual(expect.objectContaining({
      file: "manifest.json", line: null, field: "periods", severity: "blocking", reason_code: "ANALYSIS_PERIOD_TOO_LARGE",
    }));
    expect(source).toEqual(original);
  });
});


describe("bounded application channel count", () => {
  it("allows exactly 1,000 selected sales channels and rejects the next one", () => {
    expect(MAX_ANALYSIS_CHANNELS).toBe(1000);
    expect(() => assertSupportedAnalysisChannels(Array.from({ length: 1000 }, (_, index) => `CHANNEL_${index}`))).not.toThrow();
    expect(() => assertSupportedAnalysisChannels(Array.from({ length: 1001 }, (_, index) => `CHANNEL_${index}`)))
      .toThrow(expect.objectContaining({ reason_code: "ANALYSIS_CHANNEL_LIMIT" }));
  });
  it("blocks oversized manifest channels before calling M1 dataset validation", () => {
    const input = fixture();
    const pending = inspectedFiles();
    const source = { ...(input.manifest as Record<string, unknown>), channels: Array.from({ length: 1001 }, (_, index) => `CHANNEL_${index}`) };
    mockedValidate.mockImplementationOnce(() => { throw new Error("VALIDATION_SHOULD_NOT_RUN_FOR_OVERSIZED_CHANNELS"); });
    const result = prepareImport(source, pending, { amountBasisConfirmed: true });
    expect(result.input).toBeNull();
    expect(result.validation.dataset).toBeNull();
    expect(result.validation.classification).toBe("blocking");
    expect(result.validation.issues).toContainEqual(expect.objectContaining({ file: "manifest.json", field: "channels", reason_code: "ANALYSIS_CHANNEL_LIMIT" }));
    expect(mockedValidate).not.toHaveBeenCalled();
  });
  it("rejects too many active filter channels before calling domain analysis", async () => {
    const dataset = validateDataset(fixture()).dataset!;
    mockedAnalyze.mockImplementationOnce(() => { throw new Error("DOMAIN_SHOULD_NOT_RUN_FOR_OVERSIZED_CHANNELS"); });
    await expect(createSnapshot(dataset, { channels: Array.from({ length: 1001 }, (_, index) => `CHANNEL_${index}`) }, "hash"))
      .rejects.toMatchObject({ reason_code: "ANALYSIS_CHANNEL_LIMIT" });
    expect(mockedAnalyze).not.toHaveBeenCalled();
  });
});
