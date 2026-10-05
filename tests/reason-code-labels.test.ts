import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SCENARIO_REASON_ALIASES, SCENARIO_REASON_CODES, scenarioReasonLabel, scenarioReasonText } from "@/application/decision-export";
import { ALL_IMPORT_ISSUE_REASON_CODES, issueTemplate } from "@/application/import";
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
});
