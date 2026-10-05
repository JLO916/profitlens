import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { scanTsxText } from "../scripts/lib/ui-scan.mjs";
import { metricDefinitions } from "../src/application/presentation";
import { labels } from "../src/i18n";
import type { MetricName, RuleCode } from "../src/domain/types";

const METRICS: MetricName[] = Object.keys(metricDefinitions) as MetricName[];
const RULES: RuleCode[] = ["REV_UP_CM_DOWN", "NEGATIVE_CHANNEL_CM", "DISCOUNT_BURDEN_UP", "REFUND_BURDEN_UP", "FULFILLMENT_BURDEN_UP", "MARKETING_BURDEN_UP", "SKU_NEGATIVE_GP", "MISSING_CRITICAL_DATA"];
const NAV = ["overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data", "validation"] as const;
/** 03 §1-5：主層 UI 不得出現的舊名詞／工程用語。技術細節區由 labels 以外的字串負責，這裡只檢查元件原始碼。 */
const OLD_TERMS = ["行銷後貢獻", "行銷前貢獻", "已入帳退款", "履約費用", "取分調整", "稽核資訊", "建立行動草稿"];

function componentSources(): { file: string; text: string }[] {
  // R3 起元件可放子目錄（例如 import-wizard/），一併掃描。
  const dir = resolve("src/components");
  return readdirSync(dir, { recursive: true, encoding: "utf8" }).filter(name => name.endsWith(".tsx")).map(file => ({ file, text: readFileSync(resolve(dir, file), "utf8") }));
}
/** Strip collapsed technical blocks so jargon inside <details> is not counted as main-layer copy. */
const withoutDetails = (text: string) => text.replace(/<details[\s\S]*?<\/details>/g, "");

describe("R2 labels are the single source of user-visible copy", () => {
  it("has a complete, non-empty entry for every metric, rule and navigation id", () => {
    for (const name of METRICS) {
      const entry = labels.metrics[name];
      for (const field of ["label", "short", "plain", "formula", "formulaTechnical"] as const) expect(entry[field], `${name}.${field}`).toMatch(/\S/);
      expect(metricDefinitions[name].label).toBe(entry.label);
      expect(metricDefinitions[name].shortLabel).toBe(entry.short);
      expect(metricDefinitions[name].formulaTechnical).toBe(entry.formulaTechnical);
    }
    for (const code of RULES) for (const field of ["title", "cause", "nextStep", "caution"] as const) expect(labels.rules[code][field], `${code}.${field}`).toMatch(/\S/);
    for (const id of NAV) { expect(labels.nav[id].label).toMatch(/\S/); expect(labels.nav[id].description).toMatch(/\S/); }
    expect(labels.basis.items).toHaveLength(9);
  });

  it("keeps the old accounting/engineering terms out of component JSX outside technical details", () => {
    const offenders: string[] = [];
    for (const { file, text } of componentSources()) {
      const main = withoutDetails(text);
      for (const term of OLD_TERMS) if (main.includes(term)) offenders.push(`${file}: ${term}`);
    }
    expect(offenders).toEqual([]);
  });

  it("keeps Chinese ideographs out of the R3 import wizard components (labels only)", () => {
    const ideograph = /[\u4e00-\u9fff]/;
    for (const { file, text } of componentSources().filter(source => source.file.startsWith("import-wizard"))) {
      const code = text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(code, file).not.toMatch(ideograph);
    }
  });

  it("keeps CJK out of every component's JSX text and string literals, technical <details> included (V3-2a)", () => {
    // 與 scripts/ui-audit.mjs／tests/design-lint.test.ts 同一個掃描器（TypeScript AST：JSX 文字節點、字串與樣板常值；註解不算）。
    // 收合的技術細節也是程式碼，裡面的中文一樣要放在 labels；這裡不做任何豁免。
    const files = componentSources();
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.flatMap(({ file, text }) => {
      const result = scanTsxText(text, `src/components/${file}`);
      return [...result.jsxCjk.map(where => `JSX 文字 ${where}`), ...result.cjkLiterals.map(where => `字串常值 ${where}`)];
    });
    expect(offenders).toEqual([]);
  });

  it("the component CJK scan catches text nodes, attributes, template literals and text inside <details>", () => {
    const sample = [
      "export const A = () => <div title=\"標題\">{`共 ${1} 筆`}<details><summary>技術</summary>細節</details></div>;",
      "// 註解不算",
    ].join("\n");
    const result = scanTsxText(sample, "sample.tsx");
    expect(result.jsxCjk).toHaveLength(2);
    expect(result.cjkLiterals).toHaveLength(3); // 屬性「標題」、樣板的頭「共 」與尾「 筆」
  });

  it("does not leak forbidden jargon through metric or rule copy", () => {
    const forbidden = /取分|快照|稽核|\bfact\b|\bhash\b|revision|schema|metric_version|contribution-v1|cohort|blocking|partial|\bnull\b/i;
    for (const name of METRICS) for (const field of ["label", "short", "plain", "formula"] as const) expect(labels.metrics[name][field], `${name}.${field}`).not.toMatch(forbidden);
    for (const code of RULES) for (const field of ["title", "cause", "nextStep", "caution"] as const) expect(labels.rules[code][field], `${code}.${field}`).not.toMatch(forbidden);
    for (const item of labels.basis.items) expect(item).not.toMatch(forbidden);
  });
});
