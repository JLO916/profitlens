import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BREAKEVEN_MER_REASON_CODES, breakevenReasonLabel } from "@/application/breakeven-mer";
import { SCENARIO_REASON_ALIASES, SCENARIO_REASON_CODES, scenarioReasonLabel, scenarioReasonText } from "@/application/decision-export";
import { ALL_IMPORT_ISSUE_REASON_CODES, issueTemplate, sideFileIssueMessage } from "@/application/import";
import { parseTargets } from "@/application/targets";
import { parseEvents } from "@/application/events";
import { analyzeDataset } from "@/domain/analysis";
import { analyzeScenarioSensitivity } from "@/domain/scenario-sensitivity";
import { buildScenarioBaseline, type ScenarioInputs } from "@/domain/scenarios";
import { AMOUNT_FIELDS } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";

// V3-2a §7.7.3：domain 的每個原因碼（ValidationIssue 與試算原因）在 labels 都有白話文案；
// 畫面與匯出不得退回 domain 的中文 message（scenario-sensitivity.tsx、decision-export.ts 原本的 `mapped[code] ?? reason.message`）。
// 原因碼清單由原始碼掃描得到，新增原因碼卻沒補文案時這裡會失敗。

const read = (path: string) => readFileSync(resolve(path), "utf8");
/** 原始碼中所有「全大寫、含底線」的字串常值（原因碼的寫法）。 */
const literalCodes = (text: string) => [...text.matchAll(/"([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+)"/g)].map(([, code]) => code);

/** 產生 ValidationIssue.reason_code 的位置。import.ts 只掃到 V3-2a 接線區塊之前（那裡是原因碼清單本身）。 */
function scannedIssueCodes(): string[] {
  const importSource = read("src/application/import.ts");
  const codes = [
    ...literalCodes(read("src/domain/validation.ts")),
    ...literalCodes(read("src/domain/date.ts")),
    ...literalCodes(read("src/lib/csv.ts")),
    ...literalCodes(read("src/application/limits.ts")),
    ...literalCodes(read("src/application/import-guidance.ts")),
    ...literalCodes(read("src/components/import-wizard/index.tsx")),
    ...literalCodes(importSource.slice(0, importSource.indexOf("// —— V3-2a §7.7.3"))),
  ];
  // validation.ts 的缺漏金額原因碼由欄位名組成：cogs_net → MISSING_COGS，其餘 MISSING_<欄位大寫>。
  expect(read("src/domain/validation.ts")).toContain('`MISSING_${field.toUpperCase()}`');
  codes.push(...AMOUNT_FIELDS.map(field => field === "cogs_net" ? "MISSING_COGS" : `MISSING_${field.toUpperCase()}`));
  return [...new Set(codes)].sort();
}
/** 試算原因碼：src/domain/scenarios.ts（eligibility 第 86–101 行與 calculateScenario）與 scenario-sensitivity.ts。 */
function scannedScenarioCodes(): string[] {
  const codes = ["src/domain/scenarios.ts", "src/domain/scenario-sensitivity.ts"].flatMap(path => [...read(path).matchAll(/code: "([A-Z][A-Z0-9_]+)"/g)].map(([, code]) => code));
  return [...new Set(codes)].sort();
}

describe("ValidationIssue 原因碼都有 labels.importErrors 文案", () => {
  it("application 的原因碼清單涵蓋所有產生位置（沒有漏列，也沒有多列）", () => {
    expect([...ALL_IMPORT_ISSUE_REASON_CODES].sort()).toEqual(scannedIssueCodes());
  });
  it.each(ALL_IMPORT_ISSUE_REASON_CODES)("%s 有 labels.importErrors 樣板", code => {
    expect(issueTemplate(code), `labels.importErrors.${code} 缺文案`).not.toBeNull();
  });
});

describe("試算原因碼都有 labels.ui.scenarioSensitivity.reasons 文案", () => {
  it("試算原因碼清單涵蓋 domain 的每一個 code", () => {
    expect([...SCENARIO_REASON_CODES].sort()).toEqual(scannedScenarioCodes());
    for (const [code, target] of Object.entries(SCENARIO_REASON_ALIASES)) {
      expect(SCENARIO_REASON_CODES, code).toContain(code);
      expect(SCENARIO_REASON_CODES, target).toContain(target);
    }
  });
  it("沒有缺文案的試算原因碼", () => {
    const missing = SCENARIO_REASON_CODES.filter(code => scenarioReasonLabel(code) === null);
    expect(missing, `labels.ui.scenarioSensitivity.reasons 缺：${missing.join("、")}`).toEqual([]);
  });
});

describe("試算頁與匯出不退回 domain 訊息", () => {
  const zero: ScenarioInputs = { volume_change_pct: "0", discount_change_pp: "0", fulfillment_change_pct: "0", ad_change_pct: "0", one_time_cost: "0", assumptions_accepted: true };
  const baseline = () => buildScenarioBaseline(analyzeDataset(validateDataset(fixture()).dataset!).current.channels.DTC, true);

  it("快照過期與三格未填：用 labels 的白話句", () => {
    const stale = analyzeScenarioSensitivity(baseline(), zero, ["0", "0", "0"], { stale: true });
    expect(stale.reasons.map(scenarioReasonText)).toEqual([labels.ui.scenarioSensitivity.reasons.STALE_SCENARIO]);
    const blank = analyzeScenarioSensitivity(baseline(), zero, ["", "0", "0"]);
    expect(blank.sensitivity.reasons.map(scenarioReasonText)).toEqual([labels.ui.scenarioSensitivity.reasons.SENSITIVITY_VOLUME_REQUIRED]);
    expect(analyzeScenarioSensitivity(baseline(), zero, ["0", "0"]).sensitivity.reasons.map(scenarioReasonText)).toEqual([labels.ui.scenarioSensitivity.reasons.SENSITIVITY_VOLUME_REQUIRED]);
  });

  it("逐列原因改用畫面上的 A／B／C 編號，且不含 domain 的 message", () => {
    const result = analyzeScenarioSensitivity(baseline(), zero, ["abc", "0", "500"]);
    const reasons = result.sensitivity.reasons;
    expect(reasons.map(reason => reason.code)).toEqual(["INVALID_NUMBER", "INPUT_OUT_OF_RANGE"]);
    const texts = reasons.map(scenarioReasonText);
    expect(texts[0].startsWith(fill(labels.ui.scenarioSensitivity.rowLabel, { letter: "A" }))).toBe(true);
    expect(texts[1].startsWith(fill(labels.ui.scenarioSensitivity.rowLabel, { letter: "C" }))).toBe(true);
    reasons.forEach((reason, index) => {
      expect(texts[index]).not.toContain(reason.message);
      expect(texts[index]).not.toContain(reason.message.replace(/^\S+ \d+：/u, ""));
    });
  });

  it("試算基準不能試算的原因也用 labels（試算頁的「這個範圍不能試算」清單）", () => {
    const unconfirmed = buildScenarioBaseline(analyzeDataset(validateDataset(fixture()).dataset!).current.channels.DTC, false);
    expect(unconfirmed.reasons.map(reason => reason.code)).toEqual(["BASELINE_COVERAGE_UNCONFIRMED"]);
    expect(unconfirmed.reasons.map(scenarioReasonText)).toEqual([labels.ui.scenarioSensitivity.reasons.BASELINE_COVERAGE_UNCONFIRMED]);
    expect(scenarioReasonText(unconfirmed.reasons[0])).not.toContain(unconfirmed.reasons[0].message);
  });
});

describe("選配檔（targets.csv／events.csv）的 CSV 讀取錯誤不顯示 lib 的中文訊息", () => {
  const malformed = new TextEncoder().encode('period_start,period_end\n"2026-08-01,2026-08-31\n');
  it.each([
    ["targets.csv", () => parseTargets({ name: "targets.csv", bytes: malformed }, ["DTC"]).issues],
    ["events.csv", () => parseEvents({ name: "events.csv", bytes: malformed }).issues],
  ] as const)("%s 用 labels.importErrors 樣板帶入檔名", (file, parse) => {
    const [issue] = parse();
    const template = issueTemplate(issue.reason_code);
    expect(template, issue.reason_code).not.toBeNull();
    expect(sideFileIssueMessage(file, issue)).toBe(fill(labels.importErrors[issue.reason_code], { file, line: issue.line ?? "—", field: issue.field }));
    expect(sideFileIssueMessage(file, issue)).not.toContain(issue.message);
  });
  it("該檔自己的原因碼沿用 labels.targets.errors／labels.events.errors 產生的訊息", () => {
    const [issue] = parseTargets({ name: "targets.csv", bytes: new TextEncoder().encode("period_start\n2026-08-01\n") }, ["DTC"]).issues;
    expect(Object.hasOwn(labels.targets.errors, issue.reason_code)).toBe(true);
    expect(sideFileIssueMessage("targets.csv", issue)).toBe(issue.message);
  });
});

describe("V3-9a F12 損益兩平 MER 的 application 原因碼都有 labels 文案", () => {
  it("breakeven-mer.ts 產生的原因碼＝BREAKEVEN_MER_REASON_CODES（另沿用 domain 的 NON_POSITIVE_NET_REVENUE 與缺漏原因碼），每個都有 labels.assist.breakevenV3.reasons", () => {
    const source = read("src/application/breakeven-mer.ts");
    const produced = [...source.matchAll(/push\("([A-Z][A-Z0-9_]+)"\)/g)].map(([, code]) => code);
    expect([...new Set(produced)].sort()).toEqual([...BREAKEVEN_MER_REASON_CODES, "NON_POSITIVE_NET_REVENUE"].sort());
    for (const code of BREAKEVEN_MER_REASON_CODES) expect(breakevenReasonLabel(code), `labels.assist.breakevenV3.reasons.${code} 缺文案`).toMatch(/\S/);
    expect(Object.keys(labels.assist.breakevenV3.reasons).sort()).toEqual([...BREAKEVEN_MER_REASON_CODES].sort());
  });
});
