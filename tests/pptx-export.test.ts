import Decimal from "decimal.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";
import { addActionDraft, editActionManagement, editBoundAction, emptyActionWorkspace, pinAction, type ActionSource } from "@/application/action-workspace";
import { channelsLabel, ruleCopy } from "@/application/copy";
import { buildManagerSummary, type ManagerSummary } from "@/application/manager-summary";
import {
  buildPptxOnePager, estimatedLines, exportPptx, fitLine, pptxChannelRows, pptxKpiRuns, pptxText, pptxTitleSize, pptxWaterfallChart, writePptx,
  PPTX_FILENAME, PPTX_MAX_CHANNEL_ROWS, PPTX_MIME, PPTX_TEXT_LIMITS, PPTX_WATERFALL_SERIES, type PptxChartBar, type PptxOnePager, type PptxOnePagerInput,
} from "@/application/pptx-export";
import { EXPORT_THEME } from "@/application/export-theme";
import { formatAmountL1, formatAmountL2, formatPeriodExport, formatSignedDelta, MINUS } from "@/application/presentation";
import { bridgeWaterfall } from "@/application/waterfall";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import { AMOUNT_FIELDS, type DatasetInput, type Metric } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { readZip, zipText } from "./helpers/zip";

// R6-5 PPT 一頁式：資料層的字串（golden 手算）＋寫出的 .pptx 以測試用最小 zip 讀取器拆開，直接檢查 XML。

const copy = labels.exports.pptx;
const headerCopy = labels.exports.headerV3;
/** V3-7：版頭的產出時間固定（2026-10-05 06:32Z＝台北 14:32），輸出可重現。 */
const GENERATED_AT = new Date("2026-10-05T06:32:00.000Z");
const REPORT_TITLE = fill(headerCopy.reportTitle, { metric: labels.metrics.contribution_after_marketing.headline });
/** golden 的版頭第 3、4 行（期間＋單位；版本＋產出時間），用 labels 與 formatPeriodExport 組字。 */
const PERIOD_UNIT_LINE = fill(headerCopy.periodUnitLine, { period: fill(headerCopy.periodLine, { current: formatPeriodExport("2026-08-02", "2026-08-02"), previous: formatPeriodExport("2026-08-01", "2026-08-01") }), unit: headerCopy.unitExclusive });
const VERSION_LINE = fill(headerCopy.versionLine, { version: "contribution-v1", time: "2026-10-05 14:32" });
const SCRIPT = "<script>alert(1)</script>";
const UNPINNED = "UNPINNED-SHOULD-NOT-APPEAR";
const ch = (...codes: number[]) => String.fromCharCode(...codes);

async function source(input: DatasetInput, revision: number): Promise<ActionSource> {
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, snapshot: await createSnapshot(dataset, {}, await hashInput(input)), revision };
}
/** golden（上期 2026-08-01、本期 2026-08-02，兩通路）＋三個置頂待辦（其中一個引用另一份資料）＋一個未置頂。 */
async function setup() {
  const current = await source(fixture(), 1);
  const older = await source(JSON.parse(JSON.stringify(fixture()).replaceAll("2026-08-", "2026-09-")) as DatasetInput, 2);
  let actions = emptyActionWorkspace();
  actions = addActionDraft(actions, current, "script");
  actions = editBoundAction(actions, "script", { problem: SCRIPT, owner_role: "營運 & 行銷", deadline: "2026-10-08" });
  actions = editActionManagement(actions, "script", { execution_status: "in_progress" }, "2026-10-03");
  actions = pinAction(actions, "script", true);
  actions = addActionDraft(actions, older, "amp");
  actions = editBoundAction(actions, "amp", { problem: "A & B" });
  actions = pinAction(actions, "amp", true);
  actions = addActionDraft(actions, current, "blank");
  actions = pinAction(actions, "blank", true);
  actions = addActionDraft(actions, current, "unpinned");
  actions = editBoundAction(actions, "unpinned", { problem: UNPINNED });
  const summary = buildManagerSummary(current.snapshot);
  const build = (extra: Partial<PptxOnePagerInput> = {}) => buildPptxOnePager({ summary, snapshot: current.snapshot, actions, generatedAt: GENERATED_AT, ...extra });
  return { snapshot: current.snapshot, older: older.snapshot, summary, actions, build };
}

const xmlEscape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const xmlUnescape = (value: string) => value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
/** 投影片上每一段文字（<a:t>），已還原 XML 跳脫。 */
const runs = (xml: string): string[] => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(match => xmlUnescape(match[1]));
/** 投影片上第一個文字恰為 value 的一段（<a:r>）：字級（百分之一 pt）與文字色。 */
function runOf(xml: string, value: string): { size: number; color: string | null } | null {
  for (const match of xml.matchAll(/<a:r>([\s\S]*?)<\/a:r>/g)) {
    const t = /<a:t>([^<]*)<\/a:t>/.exec(match[1]);
    if (!t || xmlUnescape(t[1]) !== value) continue;
    return { size: Number(/ sz="(\d+)"/.exec(match[1])?.[1] ?? Number.NaN), color: /<a:srgbClr val="(\w+)"\/>/.exec(match[1])?.[1] ?? null };
  }
  return null;
}
/** XML 1.0 不允許的字元：Tab／LF／CR 以外的 C0 控制字元、U+FFFE、U+FFFF。 */
const hasInvalidXmlCharacter = (xml: string) => [...xml].some(character => { const code = character.charCodeAt(0); return (code < 0x20 && code !== 0x09 && code !== 0x0a && code !== 0x0d) || code === 0xfffe || code === 0xffff; });
async function unpack(model: PptxOnePager) {
  const bytes = await writePptx(model);
  const files = readZip(bytes);
  return { bytes, files, slide: zipText(files, "ppt/slides/slide1.xml")!, types: zipText(files, "[Content_Types].xml")!, presentation: zipText(files, "ppt/presentation.xml")!, core: zipText(files, "docProps/core.xml")! };
}

describe("R6-5 PPT 一頁式：資料層（buildPptxOnePager）", () => {
  it("formats the golden headline deltas, three things and channel table from hand-derived amounts", async () => {
    const { summary, snapshot, build } = await setup();
    const model = build();
    // V3-7 §7.9：沒有會議時標題是版頭第 2 行（報表名）；副標是版頭第 1／3／4 行（資料集；兩期與單位；指標版本與產出時間）。
    expect(model.title).toBe(REPORT_TITLE);
    expect(model.header).toEqual(["golden-v1", PERIOD_UNIT_LINE, VERSION_LINE]);
    // 檔案屬性（主旨）沿用 V3-2b 的副標：版頭期間用匯出格式「YYYY-MM-DD 至 YYYY-MM-DD（天數）」。
    expect(model.subtitle).toBe(fill(copy.subtitle, { asOf: "2026-08-03", previous: formatPeriodExport("2026-08-01", "2026-08-01"), current: formatPeriodExport("2026-08-02", "2026-08-02"), channels: channelsLabel(["DTC", "MARKETPLACE"], false) }));
    expect(formatPeriodExport("2026-08-01", "2026-08-01")).toBe(fill(labels.format.units.exportRange, { start: "2026-08-01", end: "2026-08-01", days: 1 }));
    // 手算：淨營收 上期 2500−200−50＝2250、本期 3100−450−180＝2470，差 +220；扣廣告後貢獻 570 → 255，差 −315（fixtures/golden/expected.json）。
    // V3-2b §3.3：PPT 關鍵差額卡是 L1（< 1 萬寫「元」、≥ 1 萬寫「萬」；U+2212 負號、正差額加「+」）。
    expect(model.key_deltas).toEqual([
      { label: labels.metrics.net_revenue.headline, previous: formatAmountL1("2250.00"), current: formatAmountL1("2470.00"), change: formatSignedDelta("220.00", "L1") },
      { label: labels.metrics.contribution_after_marketing.headline, previous: formatAmountL1("570.00"), current: formatAmountL1("255.00"), change: formatSignedDelta("-315.00", "L1") },
    ]);
    expect(model.key_deltas[1]).toEqual({ label: labels.metrics.contribution_after_marketing.headline, previous: fill(labels.format.units.yuan, { value: "570" }), current: fill(labels.format.units.yuan, { value: "255" }), change: `${MINUS}${fill(labels.format.units.yuan, { value: "315" })}` });
    expect(model.key_deltas.map(row => [row.previous, row.current, row.change])).toEqual(summary.headlines.map(row => [formatAmountL1(row.previous.value), formatAmountL1(row.current.value), formatSignedDelta(row.change.value, "L1")]));
    // 三件事：標題與下一步來自 ruleCopy；影響金額手算——貢獻 −315；折扣 200 → 450 多 250（影響 −250）；廣告 300 → 450 多 150（影響 −150）。
    expect(model.priorities.length).toBeLessThanOrEqual(3);
    expect(model.priorities.map(row => row.headline)).toEqual(summary.priorities.map(item => ruleCopy(snapshot, item.primary, false).headline));
    expect(model.priorities[0].headline).toBe(fill(labels.rules.REV_UP_CM_DOWN.headline, { dNet: fill(labels.format.units.yuan, { value: "220" }), dCM: fill(labels.format.units.yuan, { value: "315" }) }));
    expect(model.priorities.map(row => row.impact)).toEqual(["-315.00", "-250.00", "-150.00"].map(value => formatSignedDelta(value, "L1")));
    expect(model.priorities.map(row => row.next_step)).toEqual([labels.rules.REV_UP_CM_DOWN.explain.nextStep, labels.rules.DISCOUNT_BURDEN_UP.explain.nextStep, labels.rules.MARKETING_BURDEN_UP.explain.nextStep]);
    // 通路（扣廣告後貢獻）手算自 fixtures/golden CSV：
    // DTC 上期 (1500−100−50)−600−(0+40+100+10)−200＝400，本期 (1800−230−90)−740−(0+44+140+16)−270＝270；
    // MARKETPLACE 上期 (1000−100−0)−450−(90+20+60+10)−100＝170，本期 (1300−220−90)−585−(120+22+85+13)−180＝−15。
    // 通路表是 L2 整數元（單位在表格標題「（元）」）。
    expect(model.channels).toEqual([
      { channel: "DTC", previous: formatAmountL2("400.00"), current: formatAmountL2("270.00"), change: formatSignedDelta("-130.00", "L2") },
      { channel: "MARKETPLACE", previous: formatAmountL2("170.00"), current: formatAmountL2("-15.00"), change: formatSignedDelta("-185.00", "L2") },
    ]);
    expect(model.channels[1]).toEqual({ channel: "MARKETPLACE", previous: "170", current: `${MINUS}15`, change: `${MINUS}185` });
    expect(model.channels).toHaveLength(summary.channels.length);
    expect(model.decision).toBe(copy.noMeeting);
    expect(model.footer).toBe(labels.glossary.basis.footer);
    // V3-7：指標版本已在版頭第 4 行，頁尾只留資料版本（前 12 碼）。
    expect(model.technical).toBe(fill(headerCopy.pptxDataVersion, { datasetHash: summary.dataset_hash.slice(0, 12) }));
  });

  it("V3-7 版頭：含稅換算寫「已換算為未稅」；有會議時標題是會議名稱，資料集與報表名併成副標第一行（最多三行）", async () => {
    const { summary, build } = await setup();
    const converted = build({ summary: { ...summary, conversion_note: "TAX-NOTE" } });
    expect(converted.header[1]).toBe(fill(headerCopy.periodUnitLine, { period: fill(headerCopy.periodLine, { current: formatPeriodExport("2026-08-02", "2026-08-02"), previous: formatPeriodExport("2026-08-01", "2026-08-01") }), unit: headerCopy.unitConverted }));
    const meeting = build({ meeting: { name: "十月例會", date: "2026-10-03", decision: "adopted", notes: "" }, datasetName: "示範資料" });
    expect(meeting.title).toBe(fill(copy.titleMeeting, { name: "十月例會", date: "2026-10-03" }));
    expect(meeting.header).toEqual([`示範資料${copy.separator}${REPORT_TITLE}`, PERIOD_UNIT_LINE, VERSION_LINE]);
    // 很長的資料集名稱截到一行（全寬 10pt 約 66 個全形字），版頭仍是三行、版面固定。
    const long = build({ datasetName: "長".repeat(200) });
    expect(long.header).toHaveLength(3);
    expect(estimatedLines(long.header[0], 66)).toBe(1);
    expect(long.header[0].endsWith(copy.ellipsis)).toBe(true);
  });

  it("lists only pinned actions (≤ 3) with labels for blanks and the older-data badge", async () => {
    const { build, actions } = await setup();
    const model = build();
    expect(model.pinned_actions).toEqual([
      { problem: SCRIPT, owner: "營運 & 行銷", deadline: "2026-10-08", status: labels.actions.form.statuses.in_progress },
      { problem: "A & B", owner: labels.actions.board.unassigned, deadline: labels.actions.board.noDeadline, status: fill(copy.statusHistorical, { status: labels.actions.form.statuses.not_started, badge: labels.actions.form.staleBadge }) },
      { problem: labels.actions.board.untitled, owner: labels.actions.board.unassigned, deadline: labels.actions.board.noDeadline, status: labels.actions.form.statuses.not_started },
    ]);
    expect(JSON.stringify(model)).not.toContain(UNPINNED);
    // 超過三個置頂（直接改資料模擬）、未知執行狀態、找不到引用的資料：只取前三、狀態當未開始、標為引用較早資料。
    const crowded = { ...actions, items: actions.items.map(item => ({ ...item, pinned: true })) };
    expect(build({ actions: crowded }).pinned_actions).toHaveLength(3);
    const odd = { ...actions, items: actions.items.map(item => item.card.id === "script" ? { ...item, execution_status: "weird" as never, context_id: "missing-context" } : item) };
    expect(build({ actions: odd }).pinned_actions[0].status).toBe(fill(copy.statusHistorical, { status: labels.actions.form.statuses.not_started, badge: labels.actions.form.staleBadge }));
    expect(build({ actions: emptyActionWorkspace() }).pinned_actions).toEqual([]);
  });

  it("builds the meeting title and decision from codes or free text, keeping untrusted text plain", async () => {
    const { build } = await setup();
    const meeting = { name: "第 40 週 <b>會議</b>", date: "2026-10-03", decision: "adopted", notes: `先砍 MARKETPLACE${ch(10)}第二行 & 確認${ch(0, 7)}` };
    const model = build({ meeting });
    expect(model.title).toBe(fill(copy.titleMeeting, { name: "第 40 週 <b>會議</b>", date: "2026-10-03" }));
    expect(model.decision).toBe([fill(copy.decision, { decision: labels.meeting.form.decisions.adopted }), fill(copy.decisionNotes, { notes: "先砍 MARKETPLACE 第二行 & 確認" })].join(copy.separator));
    const cases: [string, string][] = [
      ["draft", labels.meeting.form.decisions.draft], ["need_data", labels.meeting.form.decisions.need_data], ["needs_data", labels.meeting.form.decisions.need_data],
      ["rejected", labels.meeting.form.decisions.rejected], ["not_adopted", labels.meeting.form.decisions.rejected], ["", labels.meeting.form.decisions.draft],
      [labels.meeting.form.decisions.adopted, labels.meeting.form.decisions.adopted], ["Custom verdict", "Custom verdict"], ["constructor", "constructor"], ["__proto__", "__proto__"],
    ];
    for (const [decision, label] of cases) expect(build({ meeting: { ...meeting, decision, notes: "" } }).decision, decision).toBe(fill(copy.decision, { decision: label }));
    expect(build({ meeting: { ...meeting, name: "   ", date: "" } }).title).toBe(REPORT_TITLE);
    expect(build({ meeting: { ...meeting, date: "" } }).title).toBe("第 40 週 <b>會議</b>");
    expect(build({ meeting: null }).decision).toBe(copy.noMeeting);
    const long = build({ meeting: { ...meeting, name: "週".repeat(80), notes: "備".repeat(200) } });
    expect(Array.from(long.title)).toHaveLength(PPTX_TEXT_LIMITS.title);
    expect(long.title.endsWith(copy.ellipsis)).toBe(true);
    expect(Array.from(long.decision).length).toBeLessThanOrEqual(PPTX_TEXT_LIMITS.decision);
  });

  it("shows missing amounts as 資料待補, adds the tax-conversion note and caps three things at three", async () => {
    const { summary, build } = await setup();
    const broken: ManagerSummary = structuredClone(summary);
    broken.headlines[1].change = { value: null, reason_codes: [] };
    broken.priorities[0].impact = null;
    broken.priorities[0].ranking_amount = { value: null, reason_codes: [] };
    broken.channels[0].contribution.current = { value: null, reason_codes: [] };
    broken.conversion_note = "TAX-NOTE";
    broken.priorities = [...broken.priorities, broken.priorities[1]];
    const model = build({ summary: broken });
    expect(model.key_deltas[1].change).toBe(labels.shell.status.missing);
    expect(model.priorities[0].impact).toBe(labels.shell.status.missing);
    expect(model.channels[0].current).toBe(labels.shell.status.missing);
    expect(model.footer).toBe(`${labels.glossary.basis.footer} TAX-NOTE`);
    expect(model.priorities).toHaveLength(3);
  });

  it("refuses a snapshot from another dataset or range", async () => {
    const { summary, snapshot, older, actions } = await setup();
    expect(() => buildPptxOnePager({ summary, snapshot: older, actions })).toThrow("PPTX_SOURCE_MISMATCH");
    expect(() => buildPptxOnePager({ summary, snapshot: { ...snapshot, filter_hash: "other" }, actions })).toThrow("PPTX_SOURCE_MISMATCH");
  });
});

describe("R6-5 文字清理與版面估計", () => {
  it("pptxText strips XML-invalid and bidi control characters, collapses whitespace and truncates by code point", () => {
    expect(pptxText(`a${ch(0)}b${ch(7)}c${ch(0x1f)}d${ch(0x7f)}e`)).toBe("abcde");
    expect(pptxText(`x${ch(0xd800)}y${ch(0xdc00)}z${ch(0xfffe)}${ch(0xffff)}`)).toBe("xyz");
    expect(pptxText(`${ch(0x202e)}abc${ch(0x2066)}${ch(0x2069)}`)).toBe("abc");
    expect(pptxText(`  a${ch(13, 10)}${ch(9)}b  `)).toBe("a b");
    expect(pptxText(null)).toBe("");
    expect(pptxText(undefined)).toBe("");
    expect(pptxText(12)).toBe("12");
    expect(pptxText(SCRIPT)).toBe(SCRIPT);
    expect(pptxText("一二三四", 4)).toBe("一二三四");
    expect(pptxText("一二三四五", 4)).toBe(`一二三${copy.ellipsis}`);
    const emoji = String.fromCodePoint(0x1f600);
    expect(pptxText(emoji)).toBe(emoji);
    expect(pptxText(emoji.repeat(3), 2)).toBe(`${emoji}${copy.ellipsis}`);
    expect(pptxText("abc", 0)).toBe(copy.ellipsis);
    const once = pptxText("長".repeat(30), 10);
    expect(pptxText(once, 10)).toBe(once);
  });

  it("estimatedLines keeps half-width words together and hard-breaks only words longer than a line", () => {
    expect(estimatedLines("", 6)).toBe(1);
    expect(estimatedLines("DTC", 6)).toBe(1);
    expect(estimatedLines("一二三四五六", 6)).toBe(1);
    expect(estimatedLines("一二三四五六七", 6)).toBe(2);
    // 「官網 · DTC」寬 2＋0.6×6＝5.6 → 一行；「平台 · 」寬 3.8，MARKETPLACE 寬 6.6 放不下剩餘 2.2 → 換行，又大於 6 → 再硬斷：共 3 行。
    expect(estimatedLines("官網 · DTC", 6)).toBe(1);
    expect(estimatedLines("平台 · MARKETPLACE", 6)).toBe(3);
    expect(estimatedLines("x".repeat(30), 6)).toBe(3);
    expect(estimatedLines("abc", 0)).toBe(2);
  });

  it("pptxChannelRows shows every channel that fits (≤ 4) and otherwise the rows that fit plus a remainder", () => {
    const rows = (names: string[]) => names.map(channel => ({ channel }));
    const named = (count: number) => rows(Array.from({ length: count }, (_, index) => `CH-${index + 1}`));
    expect(pptxChannelRows([])).toMatchObject({ shown: [], omitted: 0 });
    expect(pptxChannelRows(rows(["官網 · DTC", "平台 · MARKETPLACE"]))).toMatchObject({ shown: rows(["官網 · DTC", "平台 · MARKETPLACE"]), omitted: 0 });
    expect(pptxChannelRows(named(PPTX_MAX_CHANNEL_ROWS))).toMatchObject({ shown: named(4), omitted: 0 });
    // 五個以上：表頭＋4 列＋「另有」列超出可用高度，改畫 3 列＋「另有 n 個」。
    expect(pptxChannelRows(named(5))).toMatchObject({ shown: named(3), omitted: 2 });
    expect(pptxChannelRows(named(9))).toMatchObject({ shown: named(3), omitted: 6 });
    // 很長的通路名（每列估 3 行）：三個就放不下，只畫 1 列。
    const long = rows(["長".repeat(16), "寬".repeat(16), "高".repeat(16)]);
    expect(pptxChannelRows(long)).toMatchObject({ shown: long.slice(0, 1), omitted: 2 });
    const tall = pptxChannelRows(named(9)).height, short = pptxChannelRows(named(1)).height;
    expect(tall).toBeGreaterThan(short);
  });
});

describe("V3-7 版頭與大字的版面估計", () => {
  it("pptxTitleSize：28pt 放得下一行就用 28，太長依序縮成 24／20／18", () => {
    expect(pptxTitleSize(REPORT_TITLE)).toBe(28);
    expect(pptxTitleSize("週".repeat(23))).toBe(28);
    expect(pptxTitleSize("週".repeat(26))).toBe(24);
    expect(pptxTitleSize("週".repeat(36))).toBe(18);
  });

  it("pptxKpiRuns：數字 36pt、單位 20pt，兩段串起來就是原字串；估計放不下時數字縮小（最小 24pt）", () => {
    const golden = formatSignedDelta("-315.00", "L1");
    expect(pptxKpiRuns(golden)).toEqual([{ text: `${MINUS}315`, size: 36 }, { text: golden.slice(`${MINUS}315`.length), size: 20 }]);
    expect(pptxKpiRuns(golden).map(run => run.text).join("")).toBe(golden);
    expect(pptxKpiRuns(formatSignedDelta("1709082.18", "L1")).map(run => run.size)).toEqual([36, 20]);
    const wide = pptxKpiRuns(formatSignedDelta("12345678.00", "L1"));
    expect(wide.map(run => run.text).join("")).toBe(formatSignedDelta("12345678.00", "L1"));
    expect(wide[0].size).toBeLessThan(36);
    expect(wide[0].size).toBeGreaterThanOrEqual(24);
    expect(pptxKpiRuns(labels.shell.status.missing)).toEqual([{ text: labels.shell.status.missing, size: 36 }]);
  });

  it("fitLine：截到估計一行放得下，結尾補「…」；本來就一行的不動", () => {
    expect(fitLine(PERIOD_UNIT_LINE, 66)).toBe(PERIOD_UNIT_LINE);
    const cut = fitLine("長".repeat(100), 66);
    expect(estimatedLines(cut, 66)).toBe(1);
    expect(cut.endsWith(copy.ellipsis)).toBe(true);
    expect(Array.from(cut)).toHaveLength(66);
  });
});

describe("R6-5 寫出 .pptx（以最小 zip 讀取器拆開檢查）", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("resolves the pptxgenjs class as the default export of a dynamic import", async () => {
    const imported = await import("pptxgenjs");
    expect(typeof imported.default).toBe("function");
  });

  it("writes two 16:9 slides (V4-9a D-V4-34＝A): the one-pager with the title, key deltas, three things, channels and decision first, the G1 waterfall second", async () => {
    const { build } = await setup();
    const model = build();
    const { bytes, files, slide, types, presentation } = await unpack(model);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    expect([...files.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toEqual(["ppt/slides/slide1.xml", "ppt/slides/slide2.xml"]);
    expect(files.has("ppt/slides/slide3.xml")).toBe(false);
    expect(types).toContain('PartName="/ppt/slides/slide1.xml"');
    expect(types).toContain('PartName="/ppt/slides/slide2.xml"');
    expect(types).not.toContain("slide3.xml");
    // LAYOUT_16x9 = 10 × 5.625 英吋 = 9144000 × 5143500 EMU。
    const size = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(presentation)!;
    expect([Number(size[1]), Number(size[2])]).toEqual([9144000, 5143500]);
    expect(Number(size[1]) * 9).toBe(Number(size[2]) * 16);
    const texts = runs(slide);
    // V3-2b：關鍵差額卡 L1、通路表 L2，負號 U+2212；ASCII「-」金額不再出現在投影片上。
    // V3-7：標題與版頭三行副標各是一段；關鍵差額大字拆成數字（36pt）與單位（20pt）兩段，串起來就是 L1 字串；檔案屬性的副標不畫在投影片上。
    const kpi = (value: string) => pptxKpiRuns(value).map(run => run.text);
    expect(kpi(formatSignedDelta("220.00", "L1")).join("")).toBe(formatSignedDelta("220.00", "L1"));
    expect(texts).not.toContain(model.subtitle);
    for (const value of [model.title, ...model.header, ...kpi(formatSignedDelta("220.00", "L1")), ...kpi(formatSignedDelta("-315.00", "L1")), `${labels.shell.periods.previous} ${formatAmountL1("2250.00")}`, `${labels.shell.periods.current} ${formatAmountL1("2470.00")}`, "DTC", "MARKETPLACE", formatAmountL2("400.00"), formatAmountL2("-15.00"), formatSignedDelta("-185.00", "L2"), copy.noMeeting,
      labels.overview.sections.keyDeltas, labels.overview.sections.topThree, labels.meeting.sections.meetingDecision, copy.pinnedTitle]) expect(texts, value).toContain(value);
    model.priorities.forEach((row, index) => expect(texts).toContain(fill(copy.priorityRow, { n: index + 1, headline: row.headline })));
    expect(texts.some(value => value.startsWith(labels.glossary.basis.footer))).toBe(true);
    expect(texts).toContain(`${copy.separator}${model.technical}`);
    expect(slide).not.toContain(UNPINNED);
    expect(texts.filter(value => /^-\d/.test(value))).toEqual([]);
  });

  it("escapes untrusted text: <script> only as &lt;script&gt; and & as &amp;", async () => {
    const { build } = await setup();
    const { slide } = await unpack(build());
    expect(slide).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(slide).not.toContain("<script>");
    expect(slide).toContain("A &amp; B");
    expect(slide).not.toContain("A & B");
    expect(slide).toContain("營運 &amp; 行銷");
    expect(runs(slide)).toContain(fill(copy.pinnedRow, { n: 1, problem: SCRIPT }));
    expect(runs(slide)).toContain(fill(copy.pinnedRow, { n: 2, problem: "A & B" }));
    const meetingModel = build({ meeting: { name: `Q4 <b>"weekly"</b> & 'review'`, date: "2026-10-03", decision: "adopted", notes: "<img src=x onerror=alert(1)>" } });
    const { slide: meetingSlide, core } = await unpack(meetingModel);
    expect(core).toContain(`<dc:title>${xmlEscape(meetingModel.title)}</dc:title>`);
    expect(core).not.toContain("<b>");
    expect(meetingSlide).not.toContain("<b>");
    expect(meetingSlide).not.toContain("<img");
    expect(runs(meetingSlide)).toContain(meetingModel.decision);
  });

  it("strips control characters from an externally built model so the package stays well-formed XML", async () => {
    const { build } = await setup();
    const model: PptxOnePager = { ...build(), title: `T${ch(0)}it${ch(0x1b)}le`, decision: `D${ch(8)}ecision${ch(0xfffe)}`, pinned_actions: [{ problem: `P${ch(0x0b)}roblem`, owner: `O${ch(0x0c)}`, deadline: "2026-10-08", status: "S" }] };
    const { slide, core } = await unpack(model);
    expect(hasInvalidXmlCharacter(slide)).toBe(false);
    expect(hasInvalidXmlCharacter(core)).toBe(false);
    expect(runs(slide)).toEqual(expect.arrayContaining(["Title", "Decision", fill(copy.pinnedRow, { n: 1, problem: "Problem" })]));
  });

  it("uses type of at least 10pt, the brand green and no image parts", async () => {
    const { build } = await setup();
    const { slide, files } = await unpack(build());
    const sizes = [...slide.matchAll(/ sz="(\d+)"/g)].map(match => Number(match[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(1000);
    // V3-7：色碼全部來自 export-theme（品牌色 #1f5a4f＝--accent）。
    expect(slide).toContain(`srgbClr val="${EXPORT_THEME.brand}"`);
    // pptxgenjs 一律寫出空的 ppt/media/ 目錄項；只要沒有任何檔案在裡面。
    expect([...files.entries()].filter(([name]) => name.startsWith("ppt/media/")).every(([name, data]) => name.endsWith("/") && data.length === 0)).toBe(true);
    expect(zipText(files, "ppt/slides/_rels/slide1.xml.rels")).not.toMatch(/relationships\/image/);
    expect(slide).not.toContain("<p:pic");
  });

  it("V3-7 §9.6：白底、只有一條 4pt 強調色頂線（沒有色塊）、標題 28pt、關鍵差額 36pt；不利差額 #b03a2e、有利不上色；表頭淺灰底", async () => {
    const { build } = await setup();
    const { slide } = await unpack(build());
    expect(slide).toMatch(new RegExp(`<p:bg>[\\s\\S]*?srgbClr val="${EXPORT_THEME.surface}"`));
    const shapes = [...slide.matchAll(/<p:spPr>([\s\S]*?)<\/p:spPr>/g)].map(match => match[1]);
    // 每個圖形都不填色（文字方塊是 noFill，沒有 v2 的品牌色標題塊與卡片底）；唯一的線是頂線：4pt（50800 EMU）、品牌色。
    expect(shapes.length).toBeGreaterThan(5);
    expect(shapes.every(shape => shape.includes("<a:noFill/>"))).toBe(true);
    const lines = shapes.filter(shape => shape.includes('prst="line"'));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('<a:ln w="50800">');
    expect(lines[0]).toContain(`srgbClr val="${EXPORT_THEME.brand}"`);
    // 字級：標題 28pt、關鍵差額數字 36pt（單位 20pt）。
    expect(runOf(slide, REPORT_TITLE)).toMatchObject({ size: 2800, color: EXPORT_THEME.ink });
    expect(runOf(slide, "+220")).toEqual({ size: 3600, color: EXPORT_THEME.favorable });
    expect(runOf(slide, `${MINUS}315`)).toEqual({ size: 3600, color: EXPORT_THEME.unfavorable });
    // 通路表：差額只有不利上色（DTC −130、MARKETPLACE −185）；本期欄是本期資料，用強調色；表頭淺灰底、主文字色。
    expect(runOf(slide, `${MINUS}185`)).toMatchObject({ color: EXPORT_THEME.unfavorable });
    expect(runOf(slide, formatAmountL2("270.00"))).toMatchObject({ color: EXPORT_THEME.brand });
    expect(runOf(slide, formatAmountL2("400.00"))).toMatchObject({ color: EXPORT_THEME.ink });
    expect(slide).toContain(`<a:solidFill><a:srgbClr val="${EXPORT_THEME.headerFill}"/></a:solidFill>`);
    expect(runOf(slide, labels.exports.csv.columns.channel)).toMatchObject({ color: EXPORT_THEME.ink });
    // v2 的色碼（品牌綠 214C45、正色 177F6C、負色 AD533A、白底淺綠字 D7E6DE）都不再出現。
    for (const legacy of ["214C45", "177F6C", "AD533A", "D7E6DE"]) expect(slide).not.toContain(legacy);
  });

  it("truncates a long channel table with a remainder row, caps lists at three and shows empty-state notes", async () => {
    const { build } = await setup();
    const base = build();
    const many: PptxOnePager = { ...base, channels: Array.from({ length: 9 }, (_, index) => ({ channel: `CH-${index + 1}`, previous: "1.00", current: "2.00", change: "+1.00" })), priorities: [], pinned_actions: [] };
    const texts = runs((await unpack(many)).slide);
    for (const index of [1, 2, 3]) expect(texts).toContain(`CH-${index}`);
    for (const index of [4, 5, 6, 7, 8, 9]) expect(texts).not.toContain(`CH-${index}`);
    expect(texts).toContain(fill(copy.channelsMore, { n: 6 }));
    expect(texts).toContain(labels.overview.notes.noPriorities);
    expect(texts).toContain(copy.pinnedEmpty);
    const morePrefix = copy.channelsMore.split("{n}")[0];
    const four: PptxOnePager = { ...base, channels: many.channels.slice(0, 4) };
    const fourTexts = runs((await unpack(four)).slide);
    for (const index of [1, 2, 3, 4]) expect(fourTexts).toContain(`CH-${index}`);
    expect(fourTexts.some(value => value.startsWith(morePrefix))).toBe(false);
    const crowded: PptxOnePager = { ...base,
      priorities: [1, 2, 3, 4, 5].map(n => ({ headline: `H${n}`, impact: "+1.00", next_step: `S${n}` })),
      pinned_actions: [1, 2, 3, 4, 5].map(n => ({ problem: `P${n}`, owner: "o", deadline: "d", status: "s" })) };
    const crowdedTexts = runs((await unpack(crowded)).slide);
    expect(crowdedTexts).toContain(fill(copy.priorityRow, { n: 3, headline: "H3" }));
    expect(crowdedTexts).not.toContain(fill(copy.priorityRow, { n: 4, headline: "H4" }));
    expect(crowdedTexts).toContain(fill(copy.pinnedRow, { n: 3, problem: "P3" }));
    expect(crowdedTexts).not.toContain(fill(copy.pinnedRow, { n: 4, problem: "P4" }));
  });

  it("exportPptx downloads the same bytes locally with the pptx MIME type and default or custom filename", async () => {
    const { summary, snapshot, actions } = await setup();
    const clicks: { href: string; download: string }[] = [];
    vi.stubGlobal("document", { createElement: (tag: string) => {
      const link = { tag, href: "", download: "", click() { clicks.push({ href: link.href, download: link.download }); } };
      return link;
    } });
    const blobs: Blob[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation(blob => { blobs.push(blob as Blob); return `blob:profitlens-test-${blobs.length}`; });
    const revoke = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    const bytes = await exportPptx({ summary, snapshot, actions });
    expect(clicks).toEqual([{ href: "blob:profitlens-test-1", download: PPTX_FILENAME }]);
    expect(blobs[0].type).toBe(PPTX_MIME);
    expect(Buffer.from(await blobs[0].arrayBuffer()).equals(Buffer.from(bytes))).toBe(true);
    vi.runAllTimers();
    expect(revoke).toHaveBeenCalledWith("blob:profitlens-test-1");
    await exportPptx({ summary, snapshot, actions }, "weekly.pptx");
    expect(clicks[1]).toEqual({ href: "blob:profitlens-test-2", download: "weekly.pptx" });
  });

  it("the test zip reader rejects bytes that are not a zip archive", () => {
    expect(() => readZip(new Uint8Array([1, 2, 3]))).toThrow();
    expect(() => readZip(new TextEncoder().encode("x".repeat(64)))).toThrow("ZIP_EOCD_NOT_FOUND");
  });
});

describe("V4-9a C32 PPT 原生瀑布（第二張投影片；D-V4-10＝A、D-V4-34＝A、D-V4-37＝A）", () => {
  const seriesCopy = labels.exports.chartsV4.pptx.series;
  const THEME = new Set<string>(Object.values(EXPORT_THEME));
  const VARIANTS = ["standard", "boss", "client"] as const;
  const MEETING = { name: "十月例會", date: "2026-10-03", decision: "adopted", notes: "先砍 MARKETPLACE" };
  /** 內容區下緣（pptx-export.ts 的 PAGE_BODY_BOTTOM；頁尾從 5.2 起）。 */
  const PAGE_BODY_BOTTOM = 5.18;
  const EMU_PER_INCH = 914400;
  type SeriesKey = (typeof PPTX_WATERFALL_SERIES)[number];
  const money = (value: string): Metric => ({ value, reason_codes: [] });
  /** 合成橋接（只改 snapshot 副本，同 tests/pptx-chart-spike.test.ts）：上期 80,000.00 → 九項（跨 0、整段在 0 以下、0 元） → 本期 −14,500.25。 */
  const SYNTHETIC_COMPONENTS = ["25000.00", "-60000.00", "-75500.50", "-12000.00", "8000.25", "50000.00", "-20000.00", "0.00", "-10000.00"] as const;
  function synthetic(base: WorkspaceSnapshot): WorkspaceSnapshot {
    const snapshot = structuredClone(base);
    const sum = SYNTHETIC_COMPONENTS.reduce((total, value) => total.plus(value), new Decimal(0));
    snapshot.report.previous.metrics.contribution_after_marketing = money("80000.00");
    snapshot.report.current.metrics.contribution_after_marketing = money(new Decimal("80000.00").plus(sum).toFixed(2));
    AMOUNT_FIELDS.forEach((field, index) => { snapshot.report.bridge.components[field] = money(SYNTHETIC_COMPONENTS[index]); });
    snapshot.report.bridge.sum = money(sum.toFixed(2));
    snapshot.report.bridge.contribution_change = money(sum.toFixed(2));
    snapshot.report.bridge.reconciled = true;
    return snapshot;
  }

  /** 圖的 part（pptxgenjs 以模組層級的計數器編號，不一定是 chart1.xml）。 */
  const chartParts = (files: Map<string, Buffer>) => [...files.keys()].filter(name => /^ppt\/charts\/chart\d+\.xml$/.test(name));
  function parseChart(xml: string) {
    const series = [...xml.matchAll(/<c:ser>([\s\S]*?)<\/c:ser>/g)].map(match => {
      const body = match[1];
      const fill = /<\/c:tx>\s*<c:spPr>([\s\S]*?)<\/c:spPr>/.exec(body)?.[1] ?? "";
      return {
        name: xmlUnescape(/<c:tx>[\s\S]*?<c:v>([^<]*)<\/c:v>/.exec(body)?.[1] ?? ""),
        noFill: fill.includes("<a:noFill/>") && !fill.includes("<a:solidFill>"),
        color: /<a:srgbClr val="(\w+)"/.exec(fill)?.[1] ?? null,
        values: [...(/<c:val>([\s\S]*?)<\/c:val>/.exec(body)?.[1] ?? "").matchAll(/<c:pt idx="\d+"><c:v>([^<]*)<\/c:v><\/c:pt>/g)].map(point => point[1]),
      };
    });
    const valAx = /<c:valAx>([\s\S]*?)<\/c:valAx>/.exec(xml)?.[1] ?? "";
    return {
      series,
      barDir: /<c:barDir val="(\w+)"\/>/.exec(xml)?.[1], grouping: /<c:grouping val="(\w+)"\/>/.exec(xml)?.[1], overlap: /<c:overlap val="(-?\d+)"\/>/.exec(xml)?.[1],
      axis: { min: Number(/<c:min val="(-?[\d.]+)"\/>/.exec(valAx)?.[1]), max: Number(/<c:max val="(-?[\d.]+)"\/>/.exec(valAx)?.[1]), format: xmlUnescape(/<c:numFmt formatCode="([^"]*)"/.exec(valAx)?.[1] ?? "") },
      showVal: [...xml.matchAll(/<c:showVal val="(\d)"\/>/g)].map(match => match[1]),
      labelFormats: [...xml.matchAll(/<c:dLbls>[\s\S]*?<c:numFmt formatCode="([^"]*)"/g)].map(match => xmlUnescape(match[1])),
      colors: [...xml.matchAll(/srgbClr val="(\w+)"/g)].map(match => match[1]),
      sizes: [...xml.matchAll(/ sz="(\d+)"/g)].map(match => Number(match[1])),
      innerLayout: /<c:manualLayout>\s*<c:layoutTarget val="inner" \/>/.test(xml),
    };
  }
  /** 內嵌活頁簿（PowerPoint「編輯資料」）第一張工作表的列：第一列是系列名，第一欄是柱名。 */
  function embeddedRows(files: Map<string, Buffer>) {
    const names = [...files.keys()].filter(name => /^ppt\/embeddings\/.+\.xlsx$/.test(name));
    expect(names).toHaveLength(1);
    const book = XLSX.read(files.get(names[0])!, { type: "buffer" });
    return XLSX.utils.sheet_to_json<(string | number | null)[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: null, raw: true });
  }
  /** 由各系列的值反推每根柱的起點與終點（同 V4-0b spike）；0 元的增減段什麼都不畫，回傳 null。 */
  function rebuild(bars: readonly PptxChartBar[], valueOf: (key: SeriesKey, index: number) => Decimal) {
    return bars.map((bar, index): string[] | null => {
      if (bar.kind !== "delta") return [valueOf("level", index).toFixed(2), valueOf("level", index).toFixed(2)];
      const base = valueOf("base", index);
      const up = valueOf("favorable", index).plus(valueOf("unfavorable", index));
      const down = valueOf("favorableBelowZero", index).plus(valueOf("unfavorableBelowZero", index));
      const favorable = !valueOf("favorable", index).plus(valueOf("favorableBelowZero", index)).isZero();
      const [lo, hi] = base.gt(0) ? [base, base.plus(up)] : base.lt(0) ? [base.plus(down), base] : [down, up];
      if (lo.eq(hi)) return null;
      return (favorable ? [lo, hi] : [hi, lo]).map(value => value.toFixed(2));
    });
  }
  /** bars 的起訖（0 元的增減段為 null）：rebuild 的期望值。 */
  const expectedSpans = (bars: readonly PptxChartBar[]) => bars.map(bar => bar.kind === "delta" ? (bar.start === bar.end ? null : [bar.start, bar.end]) : [bar.end, bar.end]);
  /** 投影片上的物件（文字方塊、線、圖）的下緣（英吋）。 */
  const objectBottoms = (xml: string) => [...xml.matchAll(/<p:(sp|graphicFrame)>([\s\S]*?)<\/p:\1>/g)].map(match => {
    const off = /<a:off x="(-?\d+)" y="(-?\d+)"\/>/.exec(match[2]), ext = /<a:ext cx="(\d+)" cy="(\d+)"\/>/.exec(match[2]);
    return (Number(off?.[2] ?? 0) + Number(ext?.[2] ?? 0)) / EMU_PER_INCH;
  });
  async function deck(model: PptxOnePager) {
    const files = readZip(await writePptx(model));
    const parts = chartParts(files);
    return { files, parts, slide1: zipText(files, "ppt/slides/slide1.xml")!, slide2: zipText(files, "ppt/slides/slide2.xml") ?? "", chart: parts.length ? parseChart(zipText(files, parts[0])!) : null };
  }

  it("模型：三個版本的 charts 都是同一張 G1——標題＝bridgeWaterfall().title、副標＝區塊 · 版頭兩期 · 單位、柱＝bars 的柱名、起訖精確字串與標值", async () => {
    const { summary, snapshot, build } = await setup();
    const bridge = bridgeWaterfall(snapshot);
    const period = fill(headerCopy.periodLine, { current: formatPeriodExport("2026-08-02", "2026-08-02"), previous: formatPeriodExport("2026-08-01", "2026-08-01") });
    const expected = {
      id: "bridge", title: bridge.title, subtitle: fill(labels.exports.chartsV4.pptx.subtitle, { section: labels.overview.sections.bridge, period, unit: headerCopy.unitExclusive }),
      bars: bridge.bars.map(bar => ({ id: bar.id, label: bar.shortLabel, kind: bar.kind, start: bar.start, end: bar.end, display: bar.display })),
    };
    for (const variant of VARIANTS) {
      expect(build({ variant }).charts, variant).toEqual([expected]);
      expect(build({ variant, meeting: MEETING }).charts, variant).toEqual([expected]);
    }
    // 手算（fixtures/golden）：上期 570.00 → 營業額 +600 → 1,170.00 → 折扣 −250 → 920.00 → 退款 −130 → 790.00 → 商品成本 −275 → 515.00
    // → 平台費 −30 → 485.00 → 金流費 −6 → 479.00 → 物流費 −65 → 414.00 → 其他變動費 −9 → 405.00 → 廣告 −150 → 255.00（本期）。
    expect(expected.bars.map(bar => [bar.start, bar.end])).toEqual([
      ["570.00", "570.00"], ["570.00", "1170.00"], ["1170.00", "920.00"], ["920.00", "790.00"], ["790.00", "515.00"], ["515.00", "485.00"],
      ["485.00", "479.00"], ["479.00", "414.00"], ["414.00", "405.00"], ["405.00", "255.00"], ["255.00", "255.00"],
    ]);
    expect(expected.bars.map(bar => bar.display)).toEqual([formatAmountL1("570.00"), ...["600.00", "-250.00", "-130.00", "-275.00", "-30.00", "-6.00", "-65.00", "-9.00", "-150.00"].map(value => formatSignedDelta(value, "L1")), formatAmountL1("255.00")]);
    // 含稅換算時單位跟版頭一樣寫「已換算為未稅」。
    expect(build({ summary: { ...summary, conversion_note: "TAX-NOTE" } }).charts[0].subtitle).toBe(fill(labels.exports.chartsV4.pptx.subtitle, { section: labels.overview.sections.bridge, period, unit: headerCopy.unitConverted }));
  });

  it("pptxWaterfallChart（golden 手算）：四個系列——透明底段、起訖與小計（金額）、有利與不利（柱高＝絕對值）；色取 EXPORT_THEME；軸 0–1,500 含 0", async () => {
    const { snapshot, build } = await setup();
    const chart = pptxWaterfallChart(build().charts[0].bars);
    expect(chart.series.map(series => series.key)).toEqual(["base", "level", "favorable", "unfavorable"]);
    expect(chart.series.map(series => series.name)).toEqual([seriesCopy.base, seriesCopy.level, seriesCopy.favorable, seriesCopy.unfavorable]);
    expect(chart.series.map(series => series.color)).toEqual(["transparent", EXPORT_THEME.chartTotal, EXPORT_THEME.chartFavorable, EXPORT_THEME.chartUnfavorable]);
    expect(Object.fromEntries(chart.series.map(series => [series.key, series.exact]))).toEqual({
      base: ["0", "570.00", "920.00", "790.00", "515.00", "485.00", "479.00", "414.00", "405.00", "255.00", "0"],
      level: ["570.00", "0", "0", "0", "0", "0", "0", "0", "0", "0", "255.00"],
      favorable: ["0", "600.00", "0", "0", "0", "0", "0", "0", "0", "0", "0"],
      unfavorable: ["0", "0", "250.00", "130.00", "275.00", "30.00", "6.00", "65.00", "9.00", "150.00", "0"],
    });
    for (const series of chart.series) expect(series.values, series.key).toEqual(series.exact.map(Number));
    expect(chart.categories).toEqual(bridgeWaterfall(snapshot).bars.map(bar => bar.shortLabel));
    expect(chart.axis).toEqual({ min: 0, max: 1500, step: 500 });
  });

  it("pptxWaterfallChart（合成：跨 0、整段在 0 以下、0 元、負的本期）：0 以下的兩個輔助系列、精確字串逐格手算、軸 −50,000–150,000 不切負柱", async () => {
    const { snapshot, build } = await setup();
    const bars = build({ snapshot: synthetic(snapshot) }).charts[0].bars;
    expect(bars.map(bar => bar.end)).toEqual(["80000.00", "105000.00", "45000.00", "-30500.50", "-42500.50", "-34500.25", "15499.75", "-4500.25", "-4500.25", "-14500.25", "-14500.25"]);
    const chart = pptxWaterfallChart(bars);
    expect(chart.series.map(series => series.key)).toEqual([...PPTX_WATERFALL_SERIES]);
    expect(chart.series.map(series => series.name)).toEqual(PPTX_WATERFALL_SERIES.map(key => seriesCopy[key]));
    expect(chart.series.map(series => series.color)).toEqual(["transparent", EXPORT_THEME.chartTotal, EXPORT_THEME.chartFavorable, EXPORT_THEME.chartUnfavorable, EXPORT_THEME.chartFavorable, EXPORT_THEME.chartUnfavorable]);
    expect(Object.fromEntries(chart.series.map(series => [series.key, series.exact]))).toEqual({
      base: ["0", "80000.00", "45000.00", "0", "-30500.50", "-34500.25", "0", "0", "0", "-4500.25", "0"],
      level: ["80000.00", "0", "0", "0", "0", "0", "0", "0", "0", "0", "-14500.25"],
      favorable: ["0", "25000.00", "0", "0", "0", "0", "15499.75", "0", "0", "0", "0"],
      unfavorable: ["0", "0", "60000.00", "45000.00", "0", "0", "0", "15499.75", "0", "0", "0"],
      favorableBelowZero: ["0", "0", "0", "0", "0", "-8000.25", "-34500.25", "0", "0", "0", "0"],
      unfavorableBelowZero: ["0", "0", "0", "-30500.50", "-12000.00", "0", "0", "-4500.25", "0", "-10000.00", "0"],
    });
    const exact = new Map(chart.series.map(series => [series.key, series.exact]));
    expect(rebuild(bars, (key, index) => new Decimal(exact.get(key)?.[index] ?? "0"))).toEqual(expectedSpans(bars));
    expect(chart.axis).toEqual({ min: -50000, max: 150000, step: 50000 });
  });

  it("寫出：第二張只有一個原生圖（chart part 1、ppt/media 空、沒有圖片）；堆疊長條、底段無填色、所有色屬於 EXPORT_THEME、showValue 關、標籤與軸的格式帶 U+2212、字級 ≥ 10pt", async () => {
    const { build } = await setup();
    const { files, parts, slide2, chart } = await deck(build({ meeting: MEETING }));
    expect(parts).toHaveLength(1);
    expect([...files.keys()].filter(name => /^ppt\/embeddings\/.+\.xlsx$/.test(name))).toHaveLength(1);
    expect(zipText(files, "ppt/slides/_rels/slide2.xml.rels")).toContain("relationships/chart");
    expect(zipText(files, "ppt/slides/_rels/slide1.xml.rels")).not.toContain("relationships/chart");
    // 不用任何圖片 API：ppt/media 沒有檔案，任何 rels 都沒有 image 關係，投影片沒有 <p:pic>。
    expect([...files.entries()].filter(([name, data]) => name.startsWith("ppt/media/") && !(name.endsWith("/") && data.length === 0)).map(([name]) => name)).toEqual([]);
    for (const name of [...files.keys()].filter(item => item.endsWith(".rels"))) expect(zipText(files, name), name).not.toMatch(/relationships\/image/);
    expect(slide2).not.toContain("<p:pic");
    expect(chart).not.toBeNull();
    expect([chart!.barDir, chart!.grouping, chart!.overlap]).toEqual(["col", "stacked", "100"]);
    expect(chart!.series.map(series => series.name)).toEqual([seriesCopy.base, seriesCopy.level, seriesCopy.favorable, seriesCopy.unfavorable]);
    expect(chart!.series[0].noFill).toBe(true);
    expect(chart!.series.slice(1).map(series => series.color)).toEqual([EXPORT_THEME.chartTotal, EXPORT_THEME.chartFavorable, EXPORT_THEME.chartUnfavorable]);
    expect(chart!.colors.length).toBeGreaterThan(0);
    for (const color of chart!.colors) expect(THEME.has(color), color).toBe(true);
    // D-V4-37＝A：圖內的資料標籤全部關掉、繪圖區固定；資料標籤格式仍帶 U+2212（使用者自行打開時沿用），數值軸也是。
    expect(chart!.showVal.length).toBeGreaterThan(0);
    expect(chart!.showVal.every(value => value === "0")).toBe(true);
    expect(chart!.innerLayout).toBe(true);
    expect(chart!.labelFormats.length).toBeGreaterThan(0);
    expect(chart!.labelFormats.every(code => code === `#,##0.00;"${MINUS}"#,##0.00;`)).toBe(true);
    expect(chart!.axis.format).toBe(`#,##0;"${MINUS}"#,##0`);
    expect(Math.min(...chart!.sizes, ...[...slide2.matchAll(/ sz="(\d+)"/g)].map(match => Number(match[1])))).toBeGreaterThanOrEqual(1000);
  });

  it("寫出：圖的快取值與內嵌活頁簿（編輯資料）都等於 bars 的精確值；輔助系列名＝labels（圖形用，非金額；有利、不利標明絕對值）；標值文字方塊＝bars[].display（帶 U+2212）；軸依資料含負值", async () => {
    const { snapshot, build } = await setup();
    for (const source of [snapshot, synthetic(snapshot)]) {
      const model = build({ snapshot: source });
      const bars = model.charts[0].bars;
      const { files, slide2, chart } = await deck(model);
      const byName = new Map(chart!.series.map(series => [series.name, series]));
      const cache = (key: SeriesKey, index: number) => new Decimal(byName.get(seriesCopy[key])?.values[index] || "0");
      expect(rebuild(bars, cache)).toEqual(expectedSpans(bars));
      // 編輯資料：第一列是系列名（＝labels），第一欄是柱名；每格等於圖的快取值（pptxgenjs 把 0 寫成空白格）。
      const rows = embeddedRows(files);
      expect(rows[0].slice(1)).toEqual(chart!.series.map(series => series.name));
      expect(chart!.series.map(series => series.name).every(name => Object.values(seriesCopy).includes(name as never))).toBe(true);
      expect([seriesCopy.favorable, seriesCopy.unfavorable].every(name => rows[0].includes(name))).toBe(true);
      expect(rows.slice(1).map(row => row[0])).toEqual(bars.map(bar => bar.label));
      chart!.series.forEach((series, column) => series.values.forEach((value, row) => expect(new Decimal(rows[row + 1][column + 1] ?? 0).eq(new Decimal(value || "0")), `${series.name}[${row}]`).toBe(true)));
      // 軸：含 0，涵蓋每根柱的起訖（負柱不被切掉）。
      const levels = bars.flatMap(bar => [Number(bar.start), Number(bar.end)]);
      expect(chart!.axis.min).toBeLessThanOrEqual(Math.min(0, ...levels));
      expect(chart!.axis.max).toBeGreaterThanOrEqual(Math.max(0, ...levels));
      // 標值（D-V4-37＝A）：文字方塊依序是每根柱的 display（L1、U+2212），不出現 ASCII「-」金額；不利（U+2212）用不利色。
      expect(runs(slide2)).toEqual([model.charts[0].title, model.charts[0].subtitle, ...bars.map(bar => bar.display)]);
      expect(runs(slide2).filter(value => /^-\d/.test(value))).toEqual([]);
      expect(bars.some(bar => bar.display.startsWith(MINUS))).toBe(true);
      for (const bar of bars.filter(item => item.display.startsWith(MINUS))) expect(runOf(slide2, bar.display), bar.id).toEqual({ size: 1000, color: EXPORT_THEME.unfavorable });
      // 第二張的每個物件（含 0 以下的標值）都在內容區下緣之上。
      for (const bottom of objectBottoms(slide2)) expect(bottom).toBeLessThanOrEqual(PAGE_BODY_BOTTOM + 1e-6);
    }
    const negative = await deck(build({ snapshot: synthetic(snapshot) }));
    expect(negative.chart!.axis).toMatchObject({ min: -50000, max: 150000 });
    expect(runs(negative.slide2)).toContain(formatAmountL1("-14500.25"));
    expect(formatAmountL1("-14500.25").startsWith(MINUS)).toBe(true);
  });

  it("第二張有標題（結論句）、單位與期間；第一張與沒有圖時逐字相同，一句話、KPI、三件事、通路表、決議、置頂待辦三個版本逐項仍在；三個版本的圖逐格相同", async () => {
    const { snapshot, build } = await setup();
    const period = fill(headerCopy.periodLine, { current: formatPeriodExport("2026-08-02", "2026-08-02"), previous: formatPeriodExport("2026-08-01", "2026-08-01") });
    const decks = await Promise.all(VARIANTS.map(async variant => {
      const model = build({ variant, meeting: MEETING });
      return { variant, model, ...(await deck(model)), plain: await deck({ ...model, charts: [] }) };
    }));
    for (const { variant, model, slide1, slide2, plain } of decks) {
      // 沒有圖（charts 空陣列）時只有一張、沒有 chart part；有圖時第一張逐字不變。
      expect([...plain.files.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name)), variant).toEqual(["ppt/slides/slide1.xml"]);
      expect(plain.parts, variant).toEqual([]);
      expect(slide1, variant).toBe(plain.slide1);
      const texts = runs(slide1);
      const blocks = [labels.overview.sections.keyDeltas, ...model.key_deltas.map(row => row.label), labels.overview.sections.topThree, ...model.priorities.map((row, index) => fill(copy.priorityRow, { n: index + 1, headline: row.headline })), labels.meeting.sections.meetingDecision, model.decision];
      if (variant === "boss") blocks.push(model.one_liner!);
      else blocks.push(labels.exports.csv.columns.channel, ...model.channels.map(row => row.channel), copy.pinnedTitle, ...model.pinned_actions.map((row, index) => fill(copy.pinnedRow, { n: index + 1, problem: row.problem })));
      // 老闆一頁版的三件事是「標題 · 影響 金額」同一段，所以用整張的文字比對。
      for (const value of blocks) expect(texts.join("\n"), `${variant}: ${value}`).toContain(value);
      expect(model.key_deltas, variant).toHaveLength(variant === "boss" ? 4 : 2);
      // 第二張：結論句標題；副標有區塊名、兩期（版頭第 3 行前段）與單位。
      const slide2Texts = runs(slide2);
      expect(slide2Texts[0], variant).toBe(bridgeWaterfall(snapshot).title);
      for (const value of [labels.overview.sections.bridge, period, headerCopy.unitExclusive]) expect(slide2Texts[1], `${variant}: ${value}`).toContain(value);
    }
    // 三個版本：第二張的文字、圖的系列值與軸、內嵌活頁簿逐格相同。
    const [standard, ...others] = decks;
    for (const other of others) {
      expect(runs(other.slide2), other.variant).toEqual(runs(standard.slide2));
      expect(other.chart!.series, other.variant).toEqual(standard.chart!.series);
      expect(other.chart!.axis, other.variant).toEqual(standard.chart!.axis);
      expect(embeddedRows(other.files), other.variant).toEqual(embeddedRows(standard.files));
    }
  });
});
