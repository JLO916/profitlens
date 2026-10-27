import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CHANNEL_SETTINGS_VERSION, defaultChannelSettings, normalizeChannelSettings, validateChannelSettings, type ChannelSettings } from "@/application/channel-settings";
import { createSnapshot, hashInput } from "@/application/workspace";
import { ChannelSettingsEditor, initialDraft, settingsFromDraft, type ChannelSettingsDraft } from "@/components/data/channel-settings-editor";
import { DataWorkspace } from "@/components/workspace-panels";
import { validateDataset } from "@/domain/validation";
import { fill, labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";

// V42-1b 代理 A（D-V42-8＝A；PRD §3.1、§3.2、§9；06_BATCHES V42-1b 第 1 項）：資料來源頁「通路設定」區。
// SSR（node 環境沒有 DOM）：每個 manifest 通路一列、示範資料的起始值是隱含預設的別名、收合、label for 指到唯一 id、放在 data-scope 之後；
// 草稿 → 設定的純函式：沒有改動回 null、有效改動回正規化後的設定、不合規則與同名逐句列出且不套用、沒有成員的群組去掉、群組 id 不重用。
// 按鈕點擊與套用後的狀態句由 tests/e2e/channel-groups.spec.ts（V42-1b 代理 C）在瀏覽器四尺寸驗證。

const ui = labels.data.channelSettingsV42;
const DEMO_ID = "synthetic-demo-12w-v1", DEMO = ["DTC", "MARKETPLACE"] as const;
const LOCAL_ID = "local-4ch-2026", FOUR = ["DTC", "LIVE", "MARKETPLACE", "SOCIAL"] as const;
const noop = () => undefined;
const render = (props: Partial<Parameters<typeof ChannelSettingsEditor>[0]> = {}) => renderToStaticMarkup(createElement(ChannelSettingsEditor, { datasetId: DEMO_ID, manifestChannels: DEMO, settings: null, onApply: noop, ...props }));
const settingsOf = (channels: ChannelSettings["channels"], groups: ChannelSettings["groups"] = []): ChannelSettings => ({ version: CHANNEL_SETTINGS_VERSION, channels, groups });
/** 改草稿裡某個通路的欄位。 */
const withRow = (draft: ChannelSettingsDraft, code: string, patch: Partial<ChannelSettingsDraft["rows"][number]>): ChannelSettingsDraft => ({ ...draft, rows: draft.rows.map(row => row.code === code ? { ...row, ...patch } : row) });
/** 比照編輯器的「新增群組」：id＝g{nextGroupId}，號碼只增。 */
const withGroup = (draft: ChannelSettingsDraft, label: string): ChannelSettingsDraft => ({ ...draft, groups: [...draft.groups, { id: `g${draft.nextGroupId}`, label }], nextGroupId: draft.nextGroupId + 1 });
const attrs = (html: string, name: string) => [...html.matchAll(new RegExp(`\\s${name}="([^"]*)"`, "g"))].map(match => match[1]);
/** 以 id 取開始標籤；attr 取其中一個屬性值（屬性順序與大小寫由 React 的 SSR 決定，不比對整串）。 */
const openTag = (html: string, id: string) => { const match = new RegExp(`<[a-z]+ [^>]*\\bid="${id}"[^>]*>`).exec(html); if (!match) throw new Error(`no element with id ${id}`); return match[0]; };
const attr = (tag: string, name: string) => new RegExp(`\\s${name}="([^"]*)"`, "i").exec(tag)?.[1];
/** 文字欄：class、type、value；順序欄另看 step 與 inputmode。 */
const textField = (html: string, id: string) => { const tag = openTag(html, id); return [attr(tag, "class"), attr(tag, "type"), attr(tag, "value")]; };
const orderField = (html: string, id: string) => { const tag = openTag(html, id); return [attr(tag, "class"), attr(tag, "type"), attr(tag, "step"), attr(tag, "inputmode"), attr(tag, "value")]; };

describe("V42-1b 通路設定區（SSR）", () => {
  it("收合的 details（summary 內是區段 h2）、每個 manifest 通路一列、示範資料的顯示名稱起始值＝隱含預設的別名、placeholder＝通路代碼、未分組、沒有群組、兩個按鈕、狀態句、「要注意」一句", () => {
    const html = render();
    expect(html.startsWith(`<details class="panel data-section channel-settings" data-testid="channel-settings"><summary><h2 class="ui-section-title">${ui.heading}</h2></summary>`)).toBe(true);
    expect(html).not.toMatch(/<details[^>]*\sopen/);
    expect(html).toContain(`<p class="channel-settings-lead">${ui.lead}</p>`);
    expect(attrs(html, "data-testid").filter(id => id.startsWith("channel-settings-row-"))).toEqual(DEMO.map(code => `channel-settings-row-${code}`));
    for (const code of DEMO) {
      const row = html.slice(html.indexOf(`data-testid="channel-settings-row-${code}"`), html.indexOf("</li>", html.indexOf(`data-testid="channel-settings-row-${code}"`)));
      expect(row).toContain(`<span class="ui-mono">${code}</span>`);
      expect(row).toContain(`value="${labels.data.demoChannelAlias[code]}"`);
      expect(row).toContain(`placeholder="${code}"`);
      expect(row).toContain(`aria-label="${fill(ui.rowAria.label, { code })}"`);
      expect(row).toContain(`aria-label="${fill(ui.rowAria.group, { code })}"`);
      expect(row).toContain(`aria-label="${fill(ui.rowAria.order, { code })}"`);
      expect(row).toMatch(new RegExp(`<option value=""[^>]*>${ui.ungrouped}</option>`));
      expect(orderField(row, `channel-setting-order-${code}`)).toEqual(["ui-field-control", "number", "1", "numeric", ""]);
    }
    for (const column of Object.values(ui.columns)) expect(html).toContain(`<span>${column}</span>`);
    expect(html).toContain(`<p class="data-section-empty">${ui.groups.empty}</p>`);
    expect(html).not.toContain('data-testid="channel-settings-group-');
    expect(html).toContain(`<p class="ui-field-hint channel-settings-hint">${ui.hints.blankLabel}</p>`);
    expect(html).toContain(`<p class="ui-field-hint channel-settings-hint">${ui.hints.emptyGroupDropped}</p>`);
    expect(html).toContain(`<button type="button" class="ui-btn ui-btn-secondary">${ui.buttons.addGroup}</button><button type="button" class="ui-btn ui-btn-primary">${ui.buttons.apply}</button>`);
    expect(html).not.toContain('role="alert"');
    expect(html).toContain('<p class="channel-settings-status" role="status"></p>');
    expect(html).toContain(`<details class="channel-settings-notes"><summary>${ui.notes.summary}</summary><p>${ui.notes.names}</p></details>`);
    // 表頭一列只是視覺（aria-hidden），裡面沒有可聚焦的東西。
    expect(html).toMatch(/<div class="channel-settings-head" aria-hidden="true">(<span>[^<]*<\/span>){4}<\/div>/);
  });

  it("非示範資料：顯示名稱起始空白，設定的 label／group／order 帶入；群組列 channel-settings-group-{id}、成員一行；每個 label for 指到唯一的 id", () => {
    const settings = settingsOf([{ code: "DTC", label: "官網", group: "g1", order: 2 }, { code: "SOCIAL", group: "g1" }, { code: "LIVE", order: 1 }], [{ id: "g1", label: "自有", order: 0 }]);
    const html = render({ datasetId: LOCAL_ID, manifestChannels: FOUR, settings });
    expect(attrs(html, "data-testid").filter(id => id.startsWith("channel-settings-row-"))).toEqual(FOUR.map(code => `channel-settings-row-${code}`));
    expect(textField(html, "channel-setting-label-DTC")).toEqual(["ui-field-control", "text", "官網"]);
    expect(textField(html, "channel-setting-label-MARKETPLACE")).toEqual(["ui-field-control", "text", ""]);
    expect(orderField(html, "channel-setting-order-DTC")).toEqual(["ui-field-control", "number", "1", "numeric", "2"]);
    expect(orderField(html, "channel-setting-order-LIVE")).toEqual(["ui-field-control", "number", "1", "numeric", "1"]);
    expect(html).toMatch(/id="channel-setting-group-DTC"[^>]*>(?:(?!<\/select>).)*<option value="g1" selected="">自有<\/option>/);
    expect(html).toMatch(/id="channel-setting-group-MARKETPLACE"[^>]*>(?:(?!<\/select>).)*<option value="g1">自有<\/option>/);
    expect(html).toContain('data-testid="channel-settings-group-g1"');
    expect(html).toContain(`>${fill(ui.groups.nameLabel, { n: 1 })}</label>`);
    expect(textField(html, "channel-setting-groupname-g1")).toEqual(["ui-field-control", "text", "自有"]);
    expect(html).toContain(`<span class="channel-settings-group-members">${fill(ui.groups.members, { list: "官網、SOCIAL" })}</span>`);
    const ids = attrs(html, "id"), fors = attrs(html, "for");
    expect(new Set(ids).size).toBe(ids.length);
    expect(fors.length).toBe(FOUR.length * 3 + 1);
    for (const target of fors) expect(ids, target).toContain(target);
  });

  it("還沒命名的群組在選單與成員行用「第 n 個群組」；成員行沒有成員時寫還沒有成員", () => {
    const html = render({ datasetId: LOCAL_ID, manifestChannels: FOUR, settings: settingsOf([{ code: "LIVE", group: "g3" }], [{ id: "g3", label: "直播", order: 0 }]) });
    expect(html).toContain(`<span class="channel-settings-group-members">${fill(ui.groups.members, { list: "LIVE" })}</span>`);
    // 編輯器裡沒有名稱的群組只會在草稿出現（新增群組後）；initialDraft 之後的草稿用 settingsFromDraft 驗證，這裡只確認替代名的字串存在且是陳述句。
    expect(fill(ui.groups.unnamed, { n: 2 })).toBe("第 2 個群組");
    expect(ui.groups.noMembers.length).toBeGreaterThan(0);
  });
});

describe("V42-1b 草稿 → 設定（initialDraft、settingsFromDraft）", () => {
  it("示範資料沒有改動：草稿的名稱是隱含預設的別名、沒有群組；套用回 null（備份不寫鍵，與 v4.1.3 相同）", () => {
    const draft = initialDraft(null, DEMO_ID, DEMO);
    expect(draft).toEqual({ rows: [{ code: "DTC", label: labels.data.demoChannelAlias.DTC, group: "", order: "" }, { code: "MARKETPLACE", label: labels.data.demoChannelAlias.MARKETPLACE, group: "", order: "" }], groups: [], nextGroupId: 1 });
    expect(settingsFromDraft(draft, DEMO_ID, DEMO)).toEqual({ problems: [], settings: null });
    // 非示範資料：顯示名稱起始空白；沒有改動同樣是 null。
    const local = initialDraft(null, LOCAL_ID, FOUR);
    expect(local.rows.map(row => row.label)).toEqual(["", "", "", ""]);
    expect(settingsFromDraft(local, LOCAL_ID, FOUR)).toEqual({ problems: [], settings: null });
  });

  it("有效的改動：回正規化後的設定（等於 validateChannelSettings 再 normalizeChannelSettings），通路依 manifest 順序、群組 order＝在草稿裡的位置", () => {
    let draft = withGroup(withGroup(initialDraft(null, LOCAL_ID, FOUR), "自有"), "平台");
    draft = withRow(draft, "DTC", { label: "官網", group: "g1", order: "1" });
    draft = withRow(draft, "SOCIAL", { group: "g1", order: "2" });
    draft = withRow(draft, "MARKETPLACE", { label: "商城", group: "g2" });
    draft = withRow(draft, "LIVE", { group: "g2", order: "-3" });
    const outcome = settingsFromDraft(draft, LOCAL_ID, FOUR);
    expect(outcome.problems).toEqual([]);
    const expected: ChannelSettings = settingsOf(
      [{ code: "DTC", label: "官網", group: "g1", order: 1 }, { code: "LIVE", group: "g2", order: -3 }, { code: "MARKETPLACE", label: "商城", group: "g2" }, { code: "SOCIAL", group: "g1", order: 2 }],
      [{ id: "g1", label: "自有", order: 0 }, { id: "g2", label: "平台", order: 1 }],
    );
    expect(outcome.settings).toEqual(expected);
    expect(outcome.settings).toEqual(normalizeChannelSettings(validateChannelSettings(expected, FOUR).settings, defaultChannelSettings(LOCAL_ID, FOUR)));
    // 套用後父層傳回這份設定時，草稿重建的結果與使用者打的相同（往返）；群組號碼延續（下一個是 g3）。
    const rebuilt = initialDraft(outcome.settings, LOCAL_ID, FOUR, draft.nextGroupId);
    expect(rebuilt).toEqual({ ...draft, nextGroupId: 3 });
  });

  it("示範資料只改一個通路：等於預設的別名不寫進設定，只剩改掉的那一筆；把顯示名稱改成自己的代碼也算改動", () => {
    const draft = withRow(initialDraft(null, DEMO_ID, DEMO), "MARKETPLACE", { label: "蝦皮" });
    expect(settingsFromDraft(draft, DEMO_ID, DEMO)).toEqual({ problems: [], settings: settingsOf([{ code: "MARKETPLACE", label: "蝦皮" }]) });
    expect(settingsFromDraft(withRow(initialDraft(null, DEMO_ID, DEMO), "DTC", { label: "DTC" }), DEMO_ID, DEMO)).toEqual({ problems: [], settings: settingsOf([{ code: "DTC", label: "DTC" }]) });
  });

  it("名稱不合規則：前後空格不修剪、空白字串、超過 200 字、控制字元各一句（去重）；順序不是整數一句；有成員但沒名稱的群組一句；有問題就沒有設定", () => {
    let draft = withGroup(initialDraft(null, LOCAL_ID, FOUR), "  ");
    draft = withRow(draft, "DTC", { label: " 官網", group: "g1" });
    draft = withRow(draft, "LIVE", { label: "   " });
    draft = withRow(draft, "MARKETPLACE", { label: "x".repeat(201), order: "1.5" });
    draft = withRow(draft, "SOCIAL", { label: "社\u0001群", order: "abc" });
    const outcome = settingsFromDraft(draft, LOCAL_ID, FOUR);
    expect(outcome.settings).toBeUndefined();
    expect(outcome.problems).toEqual([
      fill(ui.validation.invalidName, { name: " 官網" }),
      fill(ui.validation.invalidName, { name: "   " }),
      fill(ui.validation.invalidName, { name: "x".repeat(201) }),
      fill(ui.validation.invalidOrder, { code: "MARKETPLACE" }),
      fill(ui.validation.invalidName, { name: "社\u0001群" }),
      fill(ui.validation.invalidOrder, { code: "SOCIAL" }),
      fill(ui.validation.groupNameMissing, { n: 1 }),
    ]);
    // 群組名前後有空格也是規則句，不修剪。
    const spaced = withRow(withGroup(initialDraft(null, LOCAL_ID, FOUR), "自有 "), "DTC", { group: "g1" });
    expect(settingsFromDraft(spaced, LOCAL_ID, FOUR)).toEqual({ problems: [fill(ui.validation.invalidName, { name: "自有 " })], settings: undefined });
    // 兩列同一個不合規則的名稱只列一句。
    const twice = withRow(withRow(initialDraft(null, LOCAL_ID, FOUR), "DTC", { label: " a" }), "LIVE", { label: " a" });
    expect(settingsFromDraft(twice, LOCAL_ID, FOUR).problems).toEqual([fill(ui.validation.invalidName, { name: " a" })]);
  });

  it("通路與群組之間不得同名：兩個通路同名、等於別的通路代碼、群組名等於通路的顯示名稱、等於示範資料隱含預設的別名，都是同名句；等於自己的代碼可以", () => {
    const sameLabel = withRow(withRow(initialDraft(null, LOCAL_ID, FOUR), "DTC", { label: "官網" }), "LIVE", { label: "官網" });
    expect(settingsFromDraft(sameLabel, LOCAL_ID, FOUR)).toEqual({ problems: [fill(ui.validation.duplicateName, { name: "官網" })], settings: undefined });
    const otherCode = withRow(initialDraft(null, LOCAL_ID, FOUR), "LIVE", { label: "DTC" });
    expect(settingsFromDraft(otherCode, LOCAL_ID, FOUR)).toEqual({ problems: [fill(ui.validation.duplicateName, { name: "DTC" })], settings: undefined });
    const groupSame = withRow(withRow(withGroup(initialDraft(null, LOCAL_ID, FOUR), "官網"), "DTC", { label: "官網" }), "SOCIAL", { group: "g1" });
    expect(settingsFromDraft(groupSame, LOCAL_ID, FOUR)).toEqual({ problems: [fill(ui.validation.duplicateName, { name: "官網" })], settings: undefined });
    // 示範資料：DTC 的顯示名稱留空（＝隱含預設「官網 · DTC」）、MARKETPLACE 改成同一個字串，仍擋下（隱含預設也算進查重）。
    const demoClash = withRow(withRow(initialDraft(null, DEMO_ID, DEMO), "DTC", { label: "" }), "MARKETPLACE", { label: labels.data.demoChannelAlias.DTC });
    expect(settingsFromDraft(demoClash, DEMO_ID, DEMO)).toEqual({ problems: [fill(ui.validation.duplicateName, { name: labels.data.demoChannelAlias.DTC })], settings: undefined });
    // NFC：組合字與預組字視為同一個名稱。
    const nfc = withRow(withRow(initialDraft(null, LOCAL_ID, FOUR), "DTC", { label: "café" }), "LIVE", { label: "café" });
    expect(settingsFromDraft(nfc, LOCAL_ID, FOUR).problems).toEqual([fill(ui.validation.duplicateName, { name: "café" })]);
    expect(settingsFromDraft(withRow(initialDraft(null, LOCAL_ID, FOUR), "DTC", { label: "DTC" }), LOCAL_ID, FOUR)).toEqual({ problems: [], settings: settingsOf([{ code: "DTC", label: "DTC" }]) });
  });

  it("沒有成員的群組在套用時去掉（名稱空白也不算問題）；全部去掉後沒有改動就是 null；群組 id 只增不減、重建草稿時延續", () => {
    const empty = withGroup(withGroup(initialDraft(null, LOCAL_ID, FOUR), ""), "備用");
    expect(empty.groups.map(group => group.id)).toEqual(["g1", "g2"]);
    expect(settingsFromDraft(empty, LOCAL_ID, FOUR)).toEqual({ problems: [], settings: null });
    const used = withRow(empty, "DTC", { group: "g2" });
    expect(settingsFromDraft(used, LOCAL_ID, FOUR)).toEqual({ problems: [], settings: settingsOf([{ code: "DTC", group: "g2" }], [{ id: "g2", label: "備用", order: 1 }]) });
    // 套用後重建：g1 不見了，但下一個新群組是 g3（不重用 g1）；還原備份帶 g7 時從 g8 起。
    expect(initialDraft(settingsFromDraft(used, LOCAL_ID, FOUR).settings, LOCAL_ID, FOUR, used.nextGroupId)).toEqual({ rows: [{ code: "DTC", label: "", group: "g2", order: "" }, { code: "LIVE", label: "", group: "", order: "" }, { code: "MARKETPLACE", label: "", group: "", order: "" }, { code: "SOCIAL", label: "", group: "", order: "" }], groups: [{ id: "g2", label: "備用" }], nextGroupId: 3 });
    expect(initialDraft(settingsOf([{ code: "LIVE", group: "g7" }], [{ id: "g7", label: "直播", order: 0 }]), LOCAL_ID, FOUR).nextGroupId).toBe(8);
    expect(initialDraft(settingsOf([{ code: "LIVE", group: "own" }], [{ id: "own", label: "自有", order: 0 }]), LOCAL_ID, FOUR, 4).nextGroupId).toBe(4);
  });

  it("還原的設定裡指到不存在群組的通路、不在 manifest 的代碼，建草稿時都不帶入；群組依 order 再 id 排", () => {
    const draft = initialDraft(settingsOf([{ code: "DTC", group: "missing" }, { code: "GONE", label: "x" }, { code: "LIVE", group: "b" }], [{ id: "b", label: "乙", order: 1 }, { id: "a", label: "甲", order: 0 }]), LOCAL_ID, FOUR);
    expect(draft.rows.map(row => [row.code, row.group])).toEqual([["DTC", ""], ["LIVE", "b"], ["MARKETPLACE", ""], ["SOCIAL", ""]]);
    expect(draft.groups).toEqual([{ id: "a", label: "甲" }, { id: "b", label: "乙" }]);
  });
});

describe("V42-1b DataWorkspace 接線與 chunk", () => {
  it("資料來源頁在 data-scope 之後、data-preprocessing 之前渲染通路設定區；沒有接回呼的呼叫端（頁面狀態）也渲染；golden 兩個通路各一列", async () => {
    const input = fixture("golden");
    const dataset = validateDataset(input).dataset!;
    const snapshot = await createSnapshot(dataset, {}, await hashInput(input));
    const html = renderToStaticMarkup(createElement(DataWorkspace, { dataset, snapshot }));
    const order = ["data-scope", "channel-settings", "data-preprocessing"].map(id => html.indexOf(`data-testid="${id}"`));
    expect(order.every(index => index >= 0), order.join()).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(html.match(/data-testid="channel-settings"/g)).toHaveLength(1);
    expect(attrs(html, "data-testid").filter(id => id.startsWith("channel-settings-row-"))).toEqual(["channel-settings-row-DTC", "channel-settings-row-MARKETPLACE"]);
    // golden 不是示範資料：顯示名稱起始空白。
    expect(textField(html, "channel-setting-label-DTC")).toEqual(["ui-field-control", "text", ""]);
    // 傳入設定時帶入草稿。
    const withSettings = renderToStaticMarkup(createElement(DataWorkspace, { dataset, snapshot, channelSettings: settingsOf([{ code: "DTC", label: "官網" }]) }));
    expect(textField(withSettings, "channel-setting-label-DTC")).toEqual(["ui-field-control", "text", "官網"]);
  });

  it("編輯器由 workspace-panels.tsx 靜態匯入（留在 workspace-panels 的 chunk）；dashboard.tsx 不匯入它，只把 Active.channel_settings 與 applyChannelSettings 接給 DataWorkspace", () => {
    const panels = readFileSync(resolve("src/components/workspace-panels.tsx"), "utf8");
    const dashboard = readFileSync(resolve("src/components/dashboard.tsx"), "utf8");
    expect(panels).toContain('import { ChannelSettingsEditor } from "./data/channel-settings-editor";');
    expect(panels.match(/<ChannelSettingsEditor\s/g)).toHaveLength(1);
    expect(dashboard).not.toContain("channel-settings-editor");
    expect(dashboard).toContain("channelSettings={active.channel_settings ?? null} onApplyChannelSettings={applyChannelSettings}");
    expect(dashboard).toContain("async function applyFilters(filters: AnalysisFilters, settings?: ChannelSettings | null)");
  });
});
