import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { labels } from "@/i18n";
import * as labelModule from "@/i18n/labels.zh-TW";
import { LABEL_GROUPS } from "@/i18n/labels.zh-TW";
import { labelEntries, labelScope, scanLabels } from "../scripts/lib/copy-scan.mjs";

// V3-2c labels 結構重整（PRD §8.10）把 v2 的 41 個頂層區段搬到新分組；V3-10（06_BATCHES「移除 labels 舊 key alias」、PRD §11.5）移除只放參照的舊鍵 alias。
// 基準仍是 V3-2b 收尾版攤平後的快照（scripts/labels-regroup.mjs 產生）：每個舊路徑經 tests/fixtures/labels-legacy-map.json（移除 alias 前由 legacyAliases 凍結）
// 對到新路徑，字串逐字相同、一對一，確保 V3-2c 搬家與 V3-10 拆 alias 都沒有改到任何一個字。

const LABELS_FILE = resolve("src/i18n/labels.zh-TW.ts");
const SNAPSHOT = JSON.parse(readFileSync(resolve("verification/revamp-v3/labels-v3-2b.flat.json"), "utf8")) as Record<string, string>;
/** V3-2c 收尾刪除的鍵（scripts/labels-unused.mjs 判定沒有引用）：每列第一欄是 V3-2b 舊路徑，第二欄是新路徑。 */
const REMOVED_ROWS = readFileSync(resolve("verification/revamp-v3/labels-removed-v3-2c.txt"), "utf8").split("\n").filter(line => line.trim() && !line.startsWith("#")).map(line => line.split("\t"));
const REMOVED = new Set(REMOVED_ROWS.map(([old]) => old));
/** 快照扣掉已刪除的鍵：V3-2c 之後 labels 應該剛好有這些字串（在新路徑）。 */
const KEPT: Record<string, string> = Object.fromEntries(Object.entries(SNAPSHOT).filter(([path]) => !REMOVED.has(path)));
/** V3-10：移除 alias 前凍結的對照（leaves：舊葉路徑 → 新葉路徑；prefixes：能整棵對應的舊物件路徑 → 新物件路徑）。 */
const LEGACY_MAP = JSON.parse(readFileSync(resolve("tests/fixtures/labels-legacy-map.json"), "utf8")) as { leaves: Record<string, string>; prefixes: Record<string, string> };
const GROUPS: readonly string[] = LABEL_GROUPS;
/** v2 的 41 個頂層區段名（V3-10 起只用來確認它們不再出現在 labels 頂層；與新分組同名者——metrics、rules、actions、meeting、importWizard、evidence、format、brand、assist、targets、events、relaunch、glossary——本來就是新分組）。 */
const LEGACY_SECTIONS = ["ui", "units", "format", "brand", "downloads", "notes", "csvColumns", "csvSuffix", "evidence", "metrics", "rules", "nav", "sections", "buttons", "scenario", "actions", "meeting", "status", "periods", "importWizard", "importErrors", "basis", "demoChannelAlias", "demoCategoryAlias", "emptyState", "assist", "targets", "events", "diagnosisList", "scenarioPresets", "scenarioForm", "actionBoard", "productHighlights", "meetingRecord", "meetingPage", "excelExport", "pptxExport", "autoSave", "relaunch", "whatsNew", "glossary"];
/** V3-3 起新增的鍵（沒有 v2 舊路徑）：只放在各分組的 V3 錨點物件內；快照比對略過，但 copy-scan 指標仍須與快照相同（新字串不得新增違規）。 */
const V3_NEW_KEY_PREFIXES = ["shell.topbarV3.", "shell.sidebarV3.", "shell.dataStatus.", "shell.mobileNav.", "shell.periodBarV3.", "shell.banner.", "overview.snapshot.", "overview.snapshotUi.", "overview.kpiBand.", "overview.alerts.", "overview.assistTable.", "overview.advanced.", "summary.weekly.", "overview.chartFrame.", "overview.bridgeV3.", "overview.profit.", "overview.trendV3.", "overview.channelsV3.", "diagnosis.listV3.", "diagnosis.tableV3.", "diagnosis.aiCollapse.", "products.pageV3.", "evidence.drawerV3.", "scenarios.pageV3.", "actions.pageV3.", "actions.drawerV3.", "meeting.pageV3.", "exports.headerV3.", "exports.menuV3.", "data.pageV3.", "importWizard.wizardV3.", "empty.stateV3.", "assist.breakevenV3.", "actions.adDecisionV3.", "overview.pnlV3.", "overview.trendYoyV3.", "exports.variantsV3.", "shell.presentV3."];
const isV3NewKey = (path: string) => V3_NEW_KEY_PREFIXES.some(prefix => path.startsWith(prefix));

const get = (path: string): unknown => path.split(".").reduce<unknown>((node, key) => (node !== null && typeof node === "object" && Object.hasOwn(node, key) ? (node as Record<string, unknown>)[key] : undefined), labels);
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
/** labels 全部的字串葉節點（labels 頂層就是新分組，沒有 alias，不需要再篩）。 */
const ENTRIES = labelEntries(labels);

describe("V3-10 labels：舊 key alias 已移除，字串與 V3-2b 快照一對一", () => {
  it("快照是 V3-2b 的全部字串葉節點（2,221 個、41 個舊區段）；對照表剛好涵蓋快照扣掉 V3-2c 刪除的鍵", () => {
    expect(Object.keys(SNAPSHOT)).toHaveLength(2221);
    expect(LEGACY_SECTIONS).toHaveLength(41);
    expect(new Set(Object.keys(SNAPSHOT).map(path => path.split(".")[0]))).toEqual(new Set(LEGACY_SECTIONS));
    expect(Object.keys(LEGACY_MAP.leaves).sort()).toEqual(Object.keys(KEPT).sort());
    expect(Object.keys(LEGACY_MAP.leaves)).toHaveLength(2094);
  });

  it("(i) 每個舊路徑經對照表對到新路徑，字串逐字相同（一對一：沒有兩個舊路徑對到同一個新路徑）", () => {
    const mismatched = Object.entries(KEPT).filter(([old, value]) => get(LEGACY_MAP.leaves[old]) !== value).map(([old]) => `${old} → ${LEGACY_MAP.leaves[old]}`);
    expect(mismatched).toEqual([]);
    const targets = Object.values(LEGACY_MAP.leaves);
    expect(new Set(targets).size).toBe(targets.length);
  });

  it("(ii) labels 的每個字串不是對照表的目標，就是 V3 新鍵（沒有多也沒有少）", () => {
    const targets = new Set(Object.values(LEGACY_MAP.leaves));
    const extra = ENTRIES.map(([path]) => path).filter(path => !targets.has(path) && !isV3NewKey(path));
    expect(extra).toEqual([]);
    const fromSnapshot = ENTRIES.filter(([path]) => targets.has(path));
    expect(fromSnapshot).toHaveLength(targets.size);
    // V3 新鍵沒有舊路徑：對照表不得指到 V3 錨點物件。
    expect([...targets].filter(isV3NewKey)).toEqual([]);
  });

  it("(iii) 整棵對應的前綴與葉節點對照一致（prefixes 底下每個舊葉路徑都對到 新前綴＋同一段相對路徑）", () => {
    expect(Object.keys(LEGACY_MAP.prefixes).length).toBeGreaterThan(0);
    for (const [from, to] of Object.entries(LEGACY_MAP.prefixes)) {
      const under = Object.entries(LEGACY_MAP.leaves).filter(([old]) => old.startsWith(`${from}.`));
      expect(under.length, from).toBeGreaterThan(0);
      for (const [old, next] of under) expect(next, old).toBe(`${to}${old.slice(from.length)}`);
      expect(typeof get(to), to).toBe("object");
    }
  });

  it("(iv) labels 頂層＝LABEL_GROUPS，沒有 v2 舊區段；labels 模組不再匯出 legacyAliases／LEGACY_SECTIONS", () => {
    expect(Object.keys(labels)).toEqual([...GROUPS]);
    expect(GROUPS).toEqual(["shell", "overview", "diagnosis", "products", "scenarios", "actions", "meeting", "data", "importWizard", "evidence", "exports", "storage", "empty", "errors", "glossary", "format", "summary", "metrics", "rules", "assist", "targets", "events", "brand", "relaunch"]);
    const onlyLegacy = LEGACY_SECTIONS.filter(name => !GROUPS.includes(name));
    expect(onlyLegacy).toHaveLength(28);
    expect(onlyLegacy.filter(name => Object.hasOwn(labels, name))).toEqual([]);
    expect(Object.keys(labelModule).filter(name => onlyLegacy.includes(name) || ["legacyAliases", "LEGACY_SECTIONS", "ui"].includes(name))).toEqual([]);
    // 舊葉路徑（有搬家的）一個都取不到。
    const reachable = Object.entries(LEGACY_MAP.leaves).filter(([old, next]) => old !== next && get(old) !== undefined).map(([old]) => old);
    expect(reachable).toEqual([]);
    const text = readFileSync(LABELS_FILE, "utf8");
    expect(text).not.toMatch(/legacyAliases|LEGACY_SECTIONS|LEGACY_PREFIXES|expandLegacyPrefixes|第 3 部分：v2 舊鍵 alias/);
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

  it("掃描器每個字串只算一次，copy-scan 指標與 V3-2b 快照（扣掉已刪除的鍵、換到新路徑）的掃描逐項相同", () => {
    const { view } = labelScope(labels, labelModule);
    expect(labelEntries(view)).toEqual(ENTRIES);
    expect(() => labelScope({ ...labels, ui: {} }, labelModule)).toThrow(/ui/);
    const remapped = Object.fromEntries(Object.entries(KEPT).map(([old, value]) => [LEGACY_MAP.leaves[old], value]));
    expect(scanLabels(labels, labelModule).metrics).toEqual(scanLabels(unflatten(remapped)).metrics);
  });

  it("規則卡 { headline, explain: { cause, nextStep }, caution }、指標 { headline, short, explain, technical }，v2 舊鍵已不存在", () => {
    for (const rule of Object.values(labels.rules)) {
      expect(Object.keys(rule).sort()).toEqual(["caution", "explain", "headline"]);
      expect(rule.explain.cause).toMatch(/\S/);
      expect(rule.explain.nextStep).toMatch(/\S/);
      expect(rule.caution).toMatch(/\S/);
    }
    for (const metric of Object.values(labels.metrics)) {
      expect(Object.keys(metric).sort()).toEqual(["explain", "headline", "short", "technical"]);
      expect(Object.keys(metric.technical).sort()).toEqual(["formula", "formulaTechnical"]);
    }
    for (const item of Object.values(labels.shell.nav)) expect(Object.keys(item).sort()).toEqual(["explain", "headline"]);
  });

  it("R2「由盤點產生」區段與帶引號的鍵已移除", () => {
    const text = readFileSync(LABELS_FILE, "utf8");
    expect(text).not.toContain("由盤點產生");
    expect(text).not.toMatch(/^\s*"[A-Za-z_$][\w$]*":/m);
  });
});
