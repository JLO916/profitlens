import { afterEach, describe, expect, it, vi } from "vitest";
import { addActionDraft, editActionManagement, editBoundAction, emptyActionWorkspace, pinAction, type ActionSource } from "@/application/action-workspace";
import { channelsLabel, ruleCopy } from "@/application/copy";
import { buildManagerSummary, type ManagerSummary } from "@/application/manager-summary";
import {
  buildPptxOnePager, estimatedLines, exportPptx, pptxChannelRows, pptxText, writePptx,
  PPTX_FILENAME, PPTX_MAX_CHANNEL_ROWS, PPTX_MIME, PPTX_TEXT_LIMITS, type PptxOnePager, type PptxOnePagerInput,
} from "@/application/pptx-export";
import { formatAmountL1, formatAmountL2, formatPeriodExport, formatSignedDelta, MINUS } from "@/application/presentation";
import { createSnapshot, hashInput } from "@/application/workspace";
import type { DatasetInput } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { readZip, zipText } from "./helpers/zip";

// R6-5 PPT 一頁式：資料層的字串（golden 手算）＋寫出的 .pptx 以測試用最小 zip 讀取器拆開，直接檢查 XML。

const copy = labels.pptxExport;
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
  const build = (extra: Partial<PptxOnePagerInput> = {}) => buildPptxOnePager({ summary, snapshot: current.snapshot, actions, ...extra });
  return { snapshot: current.snapshot, older: older.snapshot, summary, actions, build };
}

const xmlEscape = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
const xmlUnescape = (value: string) => value.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&quot;", '"').replaceAll("&apos;", "'").replaceAll("&amp;", "&");
/** 投影片上每一段文字（<a:t>），已還原 XML 跳脫。 */
const runs = (xml: string): string[] => [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map(match => xmlUnescape(match[1]));
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
    expect(model.title).toBe(fill(copy.title, { brand: labels.brand.name }));
    // V3-2b §8.6：版頭期間用匯出格式「YYYY-MM-DD 至 YYYY-MM-DD（天數）」。
    expect(model.subtitle).toBe(fill(copy.subtitle, { asOf: "2026-08-03", previous: formatPeriodExport("2026-08-01", "2026-08-01"), current: formatPeriodExport("2026-08-02", "2026-08-02"), channels: channelsLabel(["DTC", "MARKETPLACE"], false) }));
    expect(formatPeriodExport("2026-08-01", "2026-08-01")).toBe(fill(labels.units.exportRange, { start: "2026-08-01", end: "2026-08-01", days: 1 }));
    // 手算：淨營收 上期 2500−200−50＝2250、本期 3100−450−180＝2470，差 +220；扣廣告後貢獻 570 → 255，差 −315（fixtures/golden/expected.json）。
    // V3-2b §3.3：PPT 關鍵差額卡是 L1（< 1 萬寫「元」、≥ 1 萬寫「萬」；U+2212 負號、正差額加「+」）。
    expect(model.key_deltas).toEqual([
      { label: labels.metrics.net_revenue.label, previous: formatAmountL1("2250.00"), current: formatAmountL1("2470.00"), change: formatSignedDelta("220.00", "L1") },
      { label: labels.metrics.contribution_after_marketing.label, previous: formatAmountL1("570.00"), current: formatAmountL1("255.00"), change: formatSignedDelta("-315.00", "L1") },
    ]);
    expect(model.key_deltas[1]).toEqual({ label: labels.metrics.contribution_after_marketing.label, previous: fill(labels.units.yuan, { value: "570" }), current: fill(labels.units.yuan, { value: "255" }), change: `${MINUS}${fill(labels.units.yuan, { value: "315" })}` });
    expect(model.key_deltas.map(row => [row.previous, row.current, row.change])).toEqual(summary.headlines.map(row => [formatAmountL1(row.previous.value), formatAmountL1(row.current.value), formatSignedDelta(row.change.value, "L1")]));
    // 三件事：標題與下一步來自 ruleCopy；影響金額手算——貢獻 −315；折扣 200 → 450 多 250（影響 −250）；廣告 300 → 450 多 150（影響 −150）。
    expect(model.priorities.length).toBeLessThanOrEqual(3);
    expect(model.priorities.map(row => row.headline)).toEqual(summary.priorities.map(item => ruleCopy(snapshot, item.primary, false).headline));
    expect(model.priorities[0].headline).toBe(fill(labels.rules.REV_UP_CM_DOWN.title, { dNet: fill(labels.units.yuan, { value: "220" }), dCM: fill(labels.units.yuan, { value: "315" }) }));
    expect(model.priorities.map(row => row.impact)).toEqual(["-315.00", "-250.00", "-150.00"].map(value => formatSignedDelta(value, "L1")));
    expect(model.priorities.map(row => row.next_step)).toEqual([labels.rules.REV_UP_CM_DOWN.nextStep, labels.rules.DISCOUNT_BURDEN_UP.nextStep, labels.rules.MARKETING_BURDEN_UP.nextStep]);
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
    expect(model.footer).toBe(labels.basis.footer);
    expect(model.technical).toBe(fill(copy.technical, { metricVersion: "contribution-v1", datasetHash: summary.dataset_hash.slice(0, 12) }));
  });

  it("lists only pinned actions (≤ 3) with labels for blanks and the older-data badge", async () => {
    const { build, actions } = await setup();
    const model = build();
    expect(model.pinned_actions).toEqual([
      { problem: SCRIPT, owner: "營運 & 行銷", deadline: "2026-10-08", status: labels.actions.statuses.in_progress },
      { problem: "A & B", owner: labels.actionBoard.unassigned, deadline: labels.actionBoard.noDeadline, status: fill(copy.statusHistorical, { status: labels.actions.statuses.not_started, badge: labels.actions.staleBadge }) },
      { problem: labels.actionBoard.untitled, owner: labels.actionBoard.unassigned, deadline: labels.actionBoard.noDeadline, status: labels.actions.statuses.not_started },
    ]);
    expect(JSON.stringify(model)).not.toContain(UNPINNED);
    // 超過三個置頂（直接改資料模擬）、未知執行狀態、找不到引用的資料：只取前三、狀態當未開始、標為引用較早資料。
    const crowded = { ...actions, items: actions.items.map(item => ({ ...item, pinned: true })) };
    expect(build({ actions: crowded }).pinned_actions).toHaveLength(3);
    const odd = { ...actions, items: actions.items.map(item => item.card.id === "script" ? { ...item, execution_status: "weird" as never, context_id: "missing-context" } : item) };
    expect(build({ actions: odd }).pinned_actions[0].status).toBe(fill(copy.statusHistorical, { status: labels.actions.statuses.not_started, badge: labels.actions.staleBadge }));
    expect(build({ actions: emptyActionWorkspace() }).pinned_actions).toEqual([]);
  });

  it("builds the meeting title and decision from codes or free text, keeping untrusted text plain", async () => {
    const { build } = await setup();
    const meeting = { name: "第 40 週 <b>會議</b>", date: "2026-10-03", decision: "adopted", notes: `先砍 MARKETPLACE${ch(10)}第二行 & 確認${ch(0, 7)}` };
    const model = build({ meeting });
    expect(model.title).toBe(fill(copy.titleMeeting, { name: "第 40 週 <b>會議</b>", date: "2026-10-03" }));
    expect(model.decision).toBe([fill(copy.decision, { decision: labels.meeting.decisions.adopted }), fill(copy.decisionNotes, { notes: "先砍 MARKETPLACE 第二行 & 確認" })].join(copy.separator));
    const cases: [string, string][] = [
      ["draft", labels.meeting.decisions.draft], ["need_data", labels.meeting.decisions.need_data], ["needs_data", labels.meeting.decisions.need_data],
      ["rejected", labels.meeting.decisions.rejected], ["not_adopted", labels.meeting.decisions.rejected], ["", labels.meeting.decisions.draft],
      [labels.meeting.decisions.adopted, labels.meeting.decisions.adopted], ["Custom verdict", "Custom verdict"], ["constructor", "constructor"], ["__proto__", "__proto__"],
    ];
    for (const [decision, label] of cases) expect(build({ meeting: { ...meeting, decision, notes: "" } }).decision, decision).toBe(fill(copy.decision, { decision: label }));
    expect(build({ meeting: { ...meeting, name: "   ", date: "" } }).title).toBe(fill(copy.title, { brand: labels.brand.name }));
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
    expect(model.key_deltas[1].change).toBe(labels.status.missing);
    expect(model.priorities[0].impact).toBe(labels.status.missing);
    expect(model.channels[0].current).toBe(labels.status.missing);
    expect(model.footer).toBe(`${labels.basis.footer} TAX-NOTE`);
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

describe("R6-5 寫出 .pptx（以最小 zip 讀取器拆開檢查）", () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  it("resolves the pptxgenjs class as the default export of a dynamic import", async () => {
    const imported = await import("pptxgenjs");
    expect(typeof imported.default).toBe("function");
  });

  it("writes exactly one 16:9 slide with the title, key deltas, three things, channels and decision", async () => {
    const { build } = await setup();
    const model = build();
    const { bytes, files, slide, types, presentation } = await unpack(model);
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(String.fromCharCode(bytes[0], bytes[1])).toBe("PK");
    expect([...files.keys()].filter(name => /^ppt\/slides\/slide\d+\.xml$/.test(name))).toEqual(["ppt/slides/slide1.xml"]);
    expect(files.has("ppt/slides/slide2.xml")).toBe(false);
    expect(types).toContain('PartName="/ppt/slides/slide1.xml"');
    expect(types).not.toContain("slide2.xml");
    // LAYOUT_16x9 = 10 × 5.625 英吋 = 9144000 × 5143500 EMU。
    const size = /<p:sldSz cx="(\d+)" cy="(\d+)"/.exec(presentation)!;
    expect([Number(size[1]), Number(size[2])]).toEqual([9144000, 5143500]);
    expect(Number(size[1]) * 9).toBe(Number(size[2]) * 16);
    const texts = runs(slide);
    // V3-2b：關鍵差額卡 L1、通路表 L2，負號 U+2212；ASCII「-」金額不再出現在投影片上。
    for (const value of [model.title, model.subtitle, formatSignedDelta("220.00", "L1"), formatSignedDelta("-315.00", "L1"), `${labels.periods.previous} ${formatAmountL1("2250.00")}`, `${labels.periods.current} ${formatAmountL1("2470.00")}`, "DTC", "MARKETPLACE", formatAmountL2("400.00"), formatAmountL2("-15.00"), formatSignedDelta("-185.00", "L2"), copy.noMeeting,
      labels.sections.keyDeltas, labels.sections.topThree, labels.sections.meetingDecision, copy.pinnedTitle]) expect(texts, value).toContain(value);
    model.priorities.forEach((row, index) => expect(texts).toContain(fill(copy.priorityRow, { n: index + 1, headline: row.headline })));
    expect(texts.some(value => value.startsWith(labels.basis.footer))).toBe(true);
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
    expect(slide).toContain('srgbClr val="214C45"');
    // pptxgenjs 一律寫出空的 ppt/media/ 目錄項；只要沒有任何檔案在裡面。
    expect([...files.entries()].filter(([name]) => name.startsWith("ppt/media/")).every(([name, data]) => name.endsWith("/") && data.length === 0)).toBe(true);
    expect(zipText(files, "ppt/slides/_rels/slide1.xml.rels")).not.toMatch(/relationships\/image/);
    expect(slide).not.toContain("<p:pic");
  });

  it("truncates a long channel table with a remainder row, caps lists at three and shows empty-state notes", async () => {
    const { build } = await setup();
    const base = build();
    const many: PptxOnePager = { ...base, channels: Array.from({ length: 9 }, (_, index) => ({ channel: `CH-${index + 1}`, previous: "1.00", current: "2.00", change: "+1.00" })), priorities: [], pinned_actions: [] };
    const texts = runs((await unpack(many)).slide);
    for (const index of [1, 2, 3]) expect(texts).toContain(`CH-${index}`);
    for (const index of [4, 5, 6, 7, 8, 9]) expect(texts).not.toContain(`CH-${index}`);
    expect(texts).toContain(fill(copy.channelsMore, { n: 6 }));
    expect(texts).toContain(labels.notes.noPriorities);
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
