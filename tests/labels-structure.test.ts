import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { labels } from "@/i18n";
import * as labelModule from "@/i18n/labels.zh-TW";
import { LABEL_GROUPS } from "@/i18n/labels.zh-TW";
import { guideLabels } from "@/i18n/guide.zh-TW";
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
/**
 * V4-0a（PRD §8.5、D-V4-26）：v4 新增的鍵只放在這 11 個分組的 `chartsV4` 錨點物件內（labels 檔以「── V4-n 錨點」註解標出每批新增的位置）；
 * 都在既有 LABEL_GROUPS（24 組）內，不新增頂層分組。V4-0a 本身不新增任何鍵。
 */
const V4_NEW_KEY_PREFIXES = ["overview.chartsV4.", "diagnosis.chartsV4.", "products.chartsV4.", "scenarios.chartsV4.", "actions.chartsV4.", "meeting.chartsV4.", "data.chartsV4.", "importWizard.chartsV4.", "evidence.chartsV4.", "exports.chartsV4.", "shell.chartsV4."];
const isV4NewKey = (path: string) => V4_NEW_KEY_PREFIXES.some(prefix => path.startsWith(prefix));
/**
 * V41-0（D-V41-12＝A'、docs/revamp-v4.1/06_BATCHES.md V41-0 第 3 項）：v4.1 新增的鍵只在這兩個前綴下——
 * `guide.`（src/i18n/guide.zh-TW.ts 的 guideLabels，頂層只有 guide，不是 LABEL_GROUPS 的分組）與 `shell.guideV41.`（labels.zh-TW.ts 的工作台入口）。
 * 兩個檔每批加「── V41-n 錨點」註解。V41-0 本身不新增任何鍵、不建 guide 檔。
 */
const V41_NEW_KEY_PREFIXES = ["guide.", "shell.guideV41."];
const isV41NewKey = (path: string) => V41_NEW_KEY_PREFIXES.some(prefix => path.startsWith(prefix));
/**
 * V42-0（D-V42-22＝A、docs/revamp-v4.2/06_BATCHES.md V42-0 第 2 項）：v4.2 新增的工作台鍵只在這九個前綴下（新字串跟著既有分組放，都在 LABEL_GROUPS 的 24 組內，不新增頂層分組）；
 * 說明頁的新字串仍在 src/i18n/guide.zh-TW.ts 的 `guide.` 下（不另加前綴）。兩個檔每批加「── V42-n 錨點」註解。V42-0 本身不新增任何鍵。
 */
const V42_NEW_KEY_PREFIXES = ["data.channelSettingsV42.", "shell.periodBarV42.", "shell.scopeV42.", "overview.channelsV42.", "diagnosis.channelsV42.", "meeting.channelsV42.", "products.perspectivesV42.", "exports.v42.", "storage.v42."];
const isV42NewKey = (path: string) => V42_NEW_KEY_PREFIXES.some(prefix => path.startsWith(prefix));
/** 沒有 v2 舊路徑的鍵：V3、V4、V41 或 V42 錨點任一符合（labels.zh-TW.ts 裡的 V41 鍵只會是 shell.guideV41.，因為 LABEL_GROUPS 沒有 guide）。 */
const isNewKey = (path: string) => isV3NewKey(path) || isV4NewKey(path) || isV41NewKey(path) || isV42NewKey(path);
/**
 * V4-0a：v3.0.0（tag v3.0.0＝625bfa5）labels 全部字串葉節點的快照（鍵依碼位排序；產生方式見 verification/revamp-v4/V4-0-baseline.md）。
 * labels-v3-2b.flat.json 只涵蓋 v2 來的字串，V3 錨點下的字串被 isV3NewKey 略過、沒有凍結值，所以 v4 另以這份快照逐鍵逐字比對。
 */
const V3_FLAT = JSON.parse(readFileSync(resolve("verification/revamp-v4/labels-v3.flat.json"), "utf8")) as Record<string, string>;
/**
 * V41-0：v4.0.0（tag v4.0.0＝872662d）labels 全部字串葉節點的快照（鍵依碼位排序；產生方式見 verification/revamp-v41/V41-0-baseline.md）。
 * v3 快照之後 v4 在 chartsV4 錨點下新增的字串沒有凍結值，所以 v4.1 另以這份快照逐鍵逐字比對。
 */
const V4_FLAT = JSON.parse(readFileSync(resolve("verification/revamp-v41/labels-v4.flat.json"), "utf8")) as Record<string, string>;
/**
 * V42-0：v4.1.2（tag v4.1.2＝e256154）labels.zh-TW.ts＋guide.zh-TW.ts 全部字串葉節點的快照（鍵依碼位排序；guide 的鍵以 guide. 開頭；產生方式見 verification/revamp-v42/V42-0-baseline.md）。
 * v4 快照之後 v4.1 在 guide. 與 shell.guideV41. 下新增的字串沒有凍結值，所以 v4.2 另以這份快照逐鍵逐字比對（三份快照：v3 2,581、v4 2,839、v4.1 3,163）。
 */
const V41_FLAT = JSON.parse(readFileSync(resolve("verification/revamp-v42/labels-v41.flat.json"), "utf8")) as Record<string, string>;
/** V41-1 起才有的說明頁標籤檔（D-V41-12＝A'）；只給伺服器模組 import，不進工作台首載。 */
const GUIDE_FILE = resolve("src/i18n/guide.zh-TW.ts");

const lookup = (root: unknown, path: string): unknown => path.split(".").reduce<unknown>((node, key) => (node !== null && typeof node === "object" && Object.hasOwn(node, key) ? (node as Record<string, unknown>)[key] : undefined), root);
const get = (path: string): unknown => lookup(labels, path);
/** V42-0：三份快照合在一起看時的取值——guide. 開頭的路徑取 guideLabels（頂層只有 guide），其餘取 labels。 */
const getAny = (path: string): unknown => (path.startsWith("guide.") ? lookup(guideLabels, path) : get(path));
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

  it("(ii) labels 的每個字串不是對照表的目標，就是 V3、V4 或 V41 新鍵（沒有多也沒有少）", () => {
    const targets = new Set(Object.values(LEGACY_MAP.leaves));
    const extra = ENTRIES.map(([path]) => path).filter(path => !targets.has(path) && !isNewKey(path));
    expect(extra).toEqual([]);
    const fromSnapshot = ENTRIES.filter(([path]) => targets.has(path));
    expect(fromSnapshot).toHaveLength(targets.size);
    // V3、V4、V41 新鍵沒有舊路徑：對照表不得指到這些錨點物件。
    expect([...targets].filter(isNewKey)).toEqual([]);
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

describe("V4-0a labels 護欄：v3.0.0 既有字串逐鍵逐字不變，新葉節點只在 V4_NEW_KEY_PREFIXES 下", () => {
  it("快照是 v3.0.0 的全部 2,581 個字串葉節點（鍵已排序）；V4 前綴 11 個、都在 LABEL_GROUPS 內，快照裡沒有任何 V4 錨點的鍵", () => {
    const keys = Object.keys(V3_FLAT);
    expect(keys).toHaveLength(2581);
    expect(keys).toEqual([...keys].sort());
    expect(V4_NEW_KEY_PREFIXES).toHaveLength(11);
    expect(new Set(V4_NEW_KEY_PREFIXES).size).toBe(11);
    for (const prefix of V4_NEW_KEY_PREFIXES) {
      expect(prefix, prefix).toMatch(/^[A-Za-z]+\.chartsV4\.$/);
      expect(GROUPS, prefix).toContain(prefix.split(".")[0]);
    }
    expect(keys.filter(isV4NewKey)).toEqual([]);
    // V3 與 V4 的錨點不重疊：任一路徑不會同時算成兩種新鍵。
    expect(V4_NEW_KEY_PREFIXES.filter(prefix => V3_NEW_KEY_PREFIXES.some(v3 => v3.startsWith(prefix) || prefix.startsWith(v3)))).toEqual([]);
  });

  it("快照的每個鍵都還在，字串逐字相同（v4 不改既有字串）", () => {
    const changed = Object.entries(V3_FLAT).filter(([path, value]) => get(path) !== value).map(([path, value]) => `${path}：快照 ${JSON.stringify(value)}，現在 ${JSON.stringify(get(path))}`);
    expect(changed).toEqual([]);
  });

  it("快照以外的新葉節點只能在 V4_NEW_KEY_PREFIXES 下（V41-0 起另允許 shell.guideV41.、V42-0 起另允許 V42_NEW_KEY_PREFIXES，見下方 V41-0、V42-0 護欄）", () => {
    const extra = ENTRIES.map(([path]) => path).filter(path => !Object.hasOwn(V3_FLAT, path) && !isV4NewKey(path) && !isV41NewKey(path) && !isV42NewKey(path));
    expect(extra).toEqual([]);
    expect(new Set(ENTRIES.map(([path]) => path)).size).toBe(ENTRIES.length);
  });
});

describe("V41-0 labels 護欄：v4.0.0 既有字串逐鍵逐字不變，新葉節點只在 V41_NEW_KEY_PREFIXES 下", () => {
  it("快照是 v4.0.0 的全部 2,839 個字串葉節點（鍵已排序）、涵蓋 v3 快照且字串相同；V41 前綴 2 個，快照裡沒有任何 V41 前綴的鍵，與 V3、V4 前綴不重疊", () => {
    const keys = Object.keys(V4_FLAT);
    expect(keys).toHaveLength(2839);
    expect(keys).toEqual([...keys].sort());
    expect(Object.entries(V3_FLAT).filter(([path, value]) => V4_FLAT[path] !== value).map(([path]) => path)).toEqual([]);
    expect(V41_NEW_KEY_PREFIXES).toEqual(["guide.", "shell.guideV41."]);
    expect(keys.filter(isV41NewKey)).toEqual([]);
    expect(V41_NEW_KEY_PREFIXES.filter(prefix => [...V3_NEW_KEY_PREFIXES, ...V4_NEW_KEY_PREFIXES].some(other => other.startsWith(prefix) || prefix.startsWith(other)))).toEqual([]);
  });

  it("快照的每個鍵都還在，字串逐字相同（v4.1 不改既有字串）", () => {
    const changed = Object.entries(V4_FLAT).filter(([path, value]) => get(path) !== value).map(([path, value]) => `${path}：快照 ${JSON.stringify(value)}，現在 ${JSON.stringify(get(path))}`);
    expect(changed).toEqual([]);
  });

  it("labels.zh-TW.ts 快照以外的新葉節點只能在 shell.guideV41. 下（V42-0 起另允許 V42_NEW_KEY_PREFIXES，見下方 V42-0 護欄）；LABEL_GROUPS 維持 24 組（沒有 guide 分組）", () => {
    const extra = ENTRIES.map(([path]) => path).filter(path => !Object.hasOwn(V4_FLAT, path));
    expect(extra.filter(path => !path.startsWith("shell.guideV41.") && !isV42NewKey(path))).toEqual([]);
    expect(GROUPS).toHaveLength(24);
    expect(GROUPS).not.toContain("guide");
  });

  it("src/i18n/guide.zh-TW.ts 存在時（V41-1 起），guideLabels 頂層只有 guide、葉節點全部在 guide. 下（V41-0 還沒有這個檔）", async () => {
    if (!existsSync(GUIDE_FILE)) return;
    const { guideLabels } = (await import(/* @vite-ignore */ GUIDE_FILE)) as { guideLabels: Record<string, unknown> };
    expect(Object.keys(guideLabels)).toEqual(["guide"]);
    const entries = labelEntries(guideLabels);
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.map(([path]) => path).filter(path => !path.startsWith("guide."))).toEqual([]);
  });
});

describe("V42-0 labels 護欄：v4.1.2 既有字串逐鍵逐字不變，新葉節點只在 V42_NEW_KEY_PREFIXES（或 guide.）下", () => {
  /** 說明頁的全部字串葉節點（guideLabels 頂層只有 guide，路徑全以 guide. 開頭）。 */
  const GUIDE_ENTRIES = labelEntries(guideLabels);

  it("快照是 v4.1.2 的全部 3,163 個字串葉節點（labels 2,842＋guide 321，鍵已排序）、涵蓋 v3 與 v4 快照且字串相同；V42 前綴 9 個、都在 LABEL_GROUPS 內，快照裡沒有任何 V42 前綴的鍵，與 V3、V4、V41 前綴不重疊", () => {
    const keys = Object.keys(V41_FLAT);
    expect(keys).toHaveLength(3163);
    expect(keys.filter(path => !path.startsWith("guide."))).toHaveLength(2842);
    expect(keys.filter(path => path.startsWith("guide."))).toHaveLength(321);
    expect(keys).toEqual([...keys].sort());
    // 頂層＝LABEL_GROUPS 的 24 組＋說明頁的 guide。
    expect([...new Set(keys.map(path => path.split(".")[0]))].sort()).toEqual([...GROUPS, "guide"].sort());
    expect(Object.entries(V3_FLAT).filter(([path, value]) => V41_FLAT[path] !== value).map(([path]) => path)).toEqual([]);
    expect(Object.entries(V4_FLAT).filter(([path, value]) => V41_FLAT[path] !== value).map(([path]) => path)).toEqual([]);
    expect(V42_NEW_KEY_PREFIXES).toEqual(["data.channelSettingsV42.", "shell.periodBarV42.", "shell.scopeV42.", "overview.channelsV42.", "diagnosis.channelsV42.", "meeting.channelsV42.", "products.perspectivesV42.", "exports.v42.", "storage.v42."]);
    expect(new Set(V42_NEW_KEY_PREFIXES).size).toBe(9);
    for (const prefix of V42_NEW_KEY_PREFIXES) {
      expect(prefix, prefix).toMatch(/^[A-Za-z]+\.[A-Za-z]*[vV]42\.$/);
      expect(GROUPS, prefix).toContain(prefix.split(".")[0]);
    }
    expect(keys.filter(isV42NewKey)).toEqual([]);
    // V42 與 V3、V4、V41 的錨點不重疊：任一路徑不會同時算成兩種新鍵。
    expect(V42_NEW_KEY_PREFIXES.filter(prefix => [...V3_NEW_KEY_PREFIXES, ...V4_NEW_KEY_PREFIXES, ...V41_NEW_KEY_PREFIXES].some(other => other.startsWith(prefix) || prefix.startsWith(other)))).toEqual([]);
  });

  it("快照的每個鍵都還在（labels 或 guideLabels），字串逐字相同（v4.2 不改既有字串）", () => {
    const changed = Object.entries(V41_FLAT).filter(([path, value]) => getAny(path) !== value).map(([path, value]) => `${path}：快照 ${JSON.stringify(value)}，現在 ${JSON.stringify(getAny(path))}`);
    expect(changed).toEqual([]);
  });

  it("labels.zh-TW.ts 快照以外的新葉節點只能在 V42_NEW_KEY_PREFIXES 下；guide.zh-TW.ts 快照以外的新葉節點只能在 guide. 下；LABEL_GROUPS 維持 24 組（沒有 guide 分組）", () => {
    const extra = ENTRIES.map(([path]) => path).filter(path => !Object.hasOwn(V41_FLAT, path));
    expect(extra.filter(path => !isV42NewKey(path))).toEqual([]);
    const extraGuide = GUIDE_ENTRIES.map(([path]) => path).filter(path => !Object.hasOwn(V41_FLAT, path));
    expect(extraGuide.filter(path => !path.startsWith("guide."))).toEqual([]);
    expect(Object.keys(guideLabels)).toEqual(["guide"]);
    expect(new Set(GUIDE_ENTRIES.map(([path]) => path)).size).toBe(GUIDE_ENTRIES.length);
    expect(GROUPS).toHaveLength(24);
    expect(GROUPS).not.toContain("guide");
  });
});
