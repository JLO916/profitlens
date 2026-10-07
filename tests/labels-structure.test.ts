import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { labels } from "@/i18n";
import * as labelModule from "@/i18n/labels.zh-TW";
import { LABEL_GROUPS, LEGACY_SECTIONS, legacyAliases } from "@/i18n/labels.zh-TW";
import { labelEntries, labelScope, scanLabels } from "../scripts/lib/copy-scan.mjs";

// V3-2c labels 結構重整（PRD §8.10）：新分組是字串的儲存處，v2 的 41 個頂層區段變成只放參照的 alias（V3-10 移除）。
// 基準是 V3-2b 收尾版攤平後的快照（scripts/labels-regroup.mjs 產生）；這裡逐字比對，確保搬家沒有改到任何一個字。

const LABELS_FILE = resolve("src/i18n/labels.zh-TW.ts");
const SNAPSHOT = JSON.parse(readFileSync(resolve("verification/revamp-v3/labels-v3-2b.flat.json"), "utf8")) as Record<string, string>;
/** V3-2c 收尾刪除的鍵（scripts/labels-unused.mjs 判定沒有引用）：每列第一欄是 V3-2b 舊路徑，第二欄是新路徑。 */
const REMOVED_ROWS = readFileSync(resolve("verification/revamp-v3/labels-removed-v3-2c.txt"), "utf8").split("\n").filter(line => line.trim() && !line.startsWith("#")).map(line => line.split("\t"));
const REMOVED = new Set(REMOVED_ROWS.map(([old]) => old));
/** 快照扣掉已刪除的鍵：V3-2c 之後 labels 應該剛好有這些舊路徑。 */
const KEPT: Record<string, string> = Object.fromEntries(Object.entries(SNAPSHOT).filter(([path]) => !REMOVED.has(path)));
const GROUPS: readonly string[] = LABEL_GROUPS;
/** V3-3 起新增的鍵（沒有 v2 舊路徑）：只放在 shell 的 V3-3 錨點物件內；快照比對略過，但 copy-scan 指標仍須與快照相同（新字串不得新增違規）。 */
const V3_NEW_KEY_PREFIXES = ["shell.topbarV3.", "shell.sidebarV3.", "shell.dataStatus.", "shell.mobileNav.", "shell.periodBarV3.", "shell.banner.", "overview.snapshot.", "overview.snapshotUi.", "overview.kpiBand.", "overview.alerts.", "overview.assistTable.", "overview.advanced.", "summary.weekly.", "overview.chartFrame.", "overview.bridgeV3.", "overview.profit.", "overview.trendV3.", "overview.channelsV3.", "diagnosis.listV3.", "diagnosis.tableV3.", "diagnosis.aiCollapse.", "products.pageV3.", "evidence.drawerV3.", "scenarios.pageV3.", "actions.pageV3.", "actions.drawerV3.", "meeting.pageV3.", "exports.headerV3.", "exports.menuV3."];
const isV3NewKey = (path: string) => V3_NEW_KEY_PREFIXES.some(prefix => path.startsWith(prefix));
const LEGACY: readonly string[] = LEGACY_SECTIONS;

const get = (path: string): unknown => path.split(".").reduce<unknown>((node, key) => (node !== null && typeof node === "object" ? (node as Record<string, unknown>)[key] : undefined), labels);
function unflatten(flat: Record<string, string>): Record<string, unknown> {
  const root: Record<string, unknown> = {};
  for (const [path, value] of Object.entries(flat)) {
    const keys = path.split(".");
    let node = root;
    for (const key of keys.slice(0, -1)) node = (node[key] ??= {}) as Record<string, unknown>;
    node[keys[keys.length - 1]] = value;
  }
  return root;
}

describe("V3-2c labels 結構重整", () => {
  it("快照是 V3-2b 的全部字串葉節點（2,221 個、41 個舊區段）", () => {
    expect(Object.keys(SNAPSHOT)).toHaveLength(2221);
    expect(LEGACY).toHaveLength(41);
    expect(new Set(Object.keys(SNAPSHOT).map(path => path.split(".")[0]))).toEqual(new Set(LEGACY));
  });

  it("(i) 新分組的字串經 legacyAliases 反推回舊路徑，與快照逐字相同（一對一，沒有多也沒有少）", () => {
    const { view } = labelScope(labels, labelModule);
    const inverse = new Map<string, string[]>();
    for (const [from, to] of Object.entries(legacyAliases)) inverse.set(to, [...(inverse.get(to) ?? []), from]);
    const rebuilt: Record<string, string> = {};
    const unmapped: string[] = [];
    for (const [path, value] of labelEntries(view)) {
      if (isV3NewKey(path)) continue;
      const olds = inverse.get(path) ?? [];
      if (olds.length !== 1) unmapped.push(`${path}（對到 ${olds.length} 個舊路徑）`);
      else rebuilt[olds[0]] = value;
    }
    expect(unmapped).toEqual([]);
    expect(rebuilt).toEqual(KEPT);
  });

  it("(ii) 每個舊路徑（扣掉 V3-2c 刪除的鍵）都還能從 labels 取到同一個字串（alias 樹完整）", () => {
    const mismatched = Object.entries(KEPT).filter(([path, value]) => get(path) !== value).map(([path]) => path);
    expect(mismatched).toEqual([]);
    expect(Object.keys(legacyAliases).sort()).toEqual(Object.keys(KEPT).sort());
  });

  it("V3-2c 刪除的鍵：每一列都是快照裡的字串，新舊路徑都已不存在", () => {
    expect(REMOVED_ROWS.length).toBe(REMOVED.size);
    expect(REMOVED.size).toBeGreaterThan(0);
    for (const [old, next, value] of REMOVED_ROWS) {
      expect(JSON.stringify(SNAPSHOT[old]), old).toBe(value);
      expect(get(old), old).toBeUndefined();
      expect(get(next), next).toBeUndefined();
    }
    expect(Object.keys(KEPT)).toHaveLength(Object.keys(SNAPSHOT).length - REMOVED.size);
  });

  it("(iii) alias 只放參照：舊區段與同名分組的展開區沒有任何字串常值（字串不會在新樹與 alias 樹重複）", () => {
    const source = ts.createSourceFile(LABELS_FILE, readFileSync(LABELS_FILE, "utf8"), ts.ScriptTarget.Latest, true);
    const merged = LEGACY.filter(name => GROUPS.includes(name) && Object.entries(legacyAliases).some(([from, to]) => from.startsWith(`${name}.`) && from !== to));
    const aliasNames = new Set(LEGACY.filter(name => !GROUPS.includes(name) || merged.includes(name)));
    const literals = (node: ts.Node): string[] => {
      const found: string[] = [];
      const visit = (child: ts.Node) => {
        if (ts.isLiteralTypeNode(child)) return;
        if (ts.isStringLiteral(child) || ts.isNoSubstitutionTemplateLiteral(child) || ts.isTemplateExpression(child)) found.push(child.getText(source));
        ts.forEachChild(child, visit);
      };
      visit(node);
      return found;
    };
    const checked = new Map<string, string[]>();
    for (const statement of source.statements) {
      if (!ts.isVariableStatement(statement)) continue;
      for (const decl of statement.declarationList.declarations) {
        const name = decl.name.getText(source);
        if (aliasNames.has(name) && decl.initializer) checked.set(name, literals(decl.initializer));
      }
    }
    expect([...checked.keys()].sort()).toEqual([...aliasNames].sort());
    expect(merged.sort()).toEqual(["actions", "meeting", "metrics", "rules"]);
    expect(Object.fromEntries([...checked].filter(([, found]) => found.length))).toEqual({});
  });

  it("(iv) legacyAliases 的每個目標都存在且是字串；labels 頂層只有新分組與舊區段", () => {
    const missing = Object.entries(legacyAliases).filter(([, to]) => typeof get(to) !== "string").map(([from, to]) => `${from} → ${to}`);
    expect(missing).toEqual([]);
    expect(new Set(Object.keys(labels))).toEqual(new Set([...GROUPS, ...LEGACY]));
    expect(GROUPS).toEqual(["shell", "overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data", "importWizard", "evidence", "exports", "storage", "empty", "errors", "glossary", "format", "summary", "metrics", "rules", "assist", "targets", "events", "brand", "relaunch"]);
  });

  it("掃描器每個字串只算一次，copy-scan 指標與 V3-2b 快照（扣掉已刪除的鍵）的掃描逐項相同", () => {
    const { view } = labelScope(labels, labelModule);
    expect(labelEntries(view).filter(([path]) => !isV3NewKey(path))).toHaveLength(Object.keys(KEPT).length);
    expect(scanLabels(labels, labelModule).metrics).toEqual(scanLabels(unflatten(KEPT)).metrics);
  });

  it("規則卡 { headline, explain: { cause, nextStep }, caution }、指標 { headline, short, explain, technical }，舊鍵指向同一個字串", () => {
    for (const rule of Object.values(labels.rules)) {
      expect(rule.title).toBe(rule.headline);
      expect(rule.cause).toBe(rule.explain.cause);
      expect(rule.nextStep).toBe(rule.explain.nextStep);
      expect(rule.caution).toMatch(/\S/);
    }
    for (const metric of Object.values(labels.metrics)) {
      expect(metric.label).toBe(metric.headline);
      expect(metric.plain).toBe(metric.explain);
      expect(metric.formula).toBe(metric.technical.formula);
      expect(metric.formulaTechnical).toBe(metric.technical.formulaTechnical);
    }
    for (const [id, item] of Object.entries(labels.nav)) {
      expect(item.label).toBe(labels.shell.nav[id as keyof typeof labels.shell.nav].headline);
      expect(item.description).toBe(labels.shell.nav[id as keyof typeof labels.shell.nav].explain);
    }
    expect(labels.basis.aliases).toBe(labels.glossary.aliases);
  });

  it("R2「由盤點產生」區段與帶引號的鍵已移除", () => {
    const text = readFileSync(LABELS_FILE, "utf8");
    expect(text).not.toContain("由盤點產生");
    expect(text).not.toMatch(/^\s*"[A-Za-z_$][\w$]*":/m);
  });
});
