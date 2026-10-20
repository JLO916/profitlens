import { describe, expect, it } from "vitest";
import { categoryLabel, channelLabel, channelsLabel, demoAlias, scopeLabel } from "@/application/copy";
import {
  CHANNEL_SETTINGS_VERSION, defaultChannelSettings, isDemoDataset, isValidChannelName, makeResolver, normalizeChannelSettings, orderedChannels,
  resolveChannelGroups, resolveChannelNames, snapshotChannelFields, validateChannelSettings, type ChannelSettings,
} from "@/application/channel-settings";
import { labels } from "@/i18n";

// V42-1a（PRD §3.1、§11.1 第 1 列）：名稱驗證四條規則與不重複、不在 manifest 的代碼被丟掉、群組依成員集合解析（順序無關）、order 穩定排序、
// synthetic-demo* 的預設設定讓 channelLabel 輸出與現在逐字相同、未改設定時正規化回 null（備份不寫鍵）。

const DEMO_ID = "synthetic-demo-12w-v1", DEMO_CHANNELS = ["DTC", "MARKETPLACE"] as const;
const FOUR = ["DTC", "LIVE", "MARKETPLACE", "SOCIAL"] as const;
const settings = (channels: ChannelSettings["channels"], groups: ChannelSettings["groups"] = []): ChannelSettings => ({ version: CHANNEL_SETTINGS_VERSION, channels, groups });

describe("channel-settings：名稱驗證四條規則、NFC 與不重複", () => {
  it("四條規則與 import-guidance 的通路代碼相同：去頭尾空白後非空、前後沒有空格、≤ 200 字、沒有控制字元", () => {
    expect(isValidChannelName("官網")).toBe(true);
    expect(isValidChannelName("a".repeat(200))).toBe(true);
    expect(isValidChannelName("")).toBe(false);
    expect(isValidChannelName("   ")).toBe(false);
    expect(isValidChannelName(" 官網")).toBe(false);
    expect(isValidChannelName("官網 ")).toBe(false);
    expect(isValidChannelName("a".repeat(201))).toBe(false);
    expect(isValidChannelName("a\u0000b")).toBe(false);
    expect(isValidChannelName("a\tb")).toBe(false);
    expect(isValidChannelName("a\u007fb")).toBe(false);
    const result = validateChannelSettings(settings([{ code: "DTC", label: " 官網" }, { code: "LIVE", label: "直播 " }, { code: "MARKETPLACE", label: "x".repeat(201) }, { code: "SOCIAL", label: "社\u0001群" }], [{ id: "g1", label: "", order: 0 }]), FOUR);
    expect(result.settings.channels.map(entry => entry.label)).toEqual([undefined, undefined, undefined, undefined]);
    expect(result.settings.groups).toEqual([]);
    // 群組先解析（通路的 group 要對到群組 id），所以群組的空名稱排在最前面。
    expect(result.invalidNames).toEqual(["", " 官網", "直播 ", "x".repeat(201), "社\u0001群"]);
    expect(result.droppedCodes).toEqual([]);
  });
  it("比對前做 NFC：分解形與組合形視為同一個名稱，存成 NFC", () => {
    const composed = "café", decomposed = "café";
    const result = validateChannelSettings(settings([{ code: "DTC", label: composed }, { code: "LIVE", label: decomposed }]), FOUR);
    expect(result.settings.channels).toEqual([{ code: "DTC", label: composed }, { code: "LIVE" }]);
    // 回報的名稱是比對用的 NFC 形。
    expect(result.invalidNames).toEqual([composed]);
    const stored = validateChannelSettings(settings([{ code: "DTC", label: decomposed }]), FOUR);
    expect(stored.settings.channels[0].label).toBe(composed);
  });
  it("顯示名稱在通路與群組之間不重複；可以等於自己的代碼，不可等於別的通路代碼", () => {
    const result = validateChannelSettings(settings(
      [{ code: "DTC", label: "DTC" }, { code: "LIVE", label: "官網" }, { code: "MARKETPLACE", label: "官網" }, { code: "SOCIAL", label: "LIVE" }],
      [{ id: "g1", label: "官網", order: 0 }, { id: "g2", label: "自有", order: 1 }, { id: "g3", label: "MARKETPLACE", order: 2 }],
    ), FOUR);
    expect(result.settings.channels).toEqual([{ code: "DTC", label: "DTC" }, { code: "LIVE", label: "官網" }, { code: "MARKETPLACE" }, { code: "SOCIAL" }]);
    expect(result.settings.groups).toEqual([{ id: "g2", label: "自有", order: 1 }]);
    expect(result.invalidNames).toEqual(["官網", "LIVE", "官網", "MARKETPLACE"]);
  });
  it("不在 manifest 的代碼整筆丟掉並回報；重複代碼只留第一筆；群組指到不存在的 id 就丟掉；order 強制成整數", () => {
    const result = validateChannelSettings({ version: CHANNEL_SETTINGS_VERSION, channels: [
      { code: "SHOPEE", label: "蝦皮" }, { code: "DTC", label: "官網", group: "g1", order: 2.9 }, { code: "DTC", label: "第二筆" }, { code: "LIVE", group: "missing", order: Number.NaN }, { code: 3 }, "DTC",
    ], groups: [{ id: "g1", label: "自有" }, { id: "g1", label: "重複 id", order: 5 }, { label: "沒有 id", order: 1 }] }, FOUR);
    expect(result.droppedCodes).toEqual(["SHOPEE"]);
    expect(result.settings).toEqual(settings([{ code: "DTC", label: "官網", group: "g1", order: 2 }, { code: "LIVE" }], [{ id: "g1", label: "自有", order: 0 }]));
    expect(result.invalidNames).toEqual([]);
    expect(validateChannelSettings(null, FOUR)).toEqual({ settings: settings([]), droppedCodes: [], invalidNames: [] });
    expect(validateChannelSettings("garbage", FOUR).settings).toEqual(settings([]));
  });
});

describe("channel-settings：群組解析與順序", () => {
  const grouped = (order: readonly string[]) => settings(order.map(code => ({ code, group: code === "DTC" || code === "SOCIAL" ? "own" : "platform" })), [{ id: "platform", label: "平台", order: 1 }, { id: "own", label: "自有", order: 0 }]);
  it("群組依成員集合解析，與通路的輸入順序無關；成員排序；依 order 再 id 排序", () => {
    const a = resolveChannelGroups(grouped(FOUR), FOUR), b = resolveChannelGroups(grouped([...FOUR].reverse()), FOUR);
    expect(a).toEqual(b);
    expect(a).toEqual([{ id: "own", label: "自有", members: ["DTC", "SOCIAL"] }, { id: "platform", label: "平台", members: ["LIVE", "MARKETPLACE"] }]);
  });
  it("沒有成員的群組不出現；不在 manifest 的成員不算", () => {
    const result = resolveChannelGroups(settings([{ code: "DTC", group: "own" }, { code: "SHOPEE", group: "platform" }], [{ id: "own", label: "自有", order: 0 }, { id: "platform", label: "平台", order: 1 }, { id: "empty", label: "空", order: 2 }]), FOUR);
    expect(result).toEqual([{ id: "own", label: "自有", members: ["DTC"] }]);
    expect(resolveChannelGroups(undefined, FOUR)).toEqual([]);
  });
  it("order 穩定排序：同序依代碼，沒有 order 的排在後面；沒有設定時全部同序、依代碼", () => {
    expect(orderedChannels(settings([{ code: "MARKETPLACE", order: 1 }, { code: "DTC", order: 1 }, { code: "SOCIAL", order: 0 }]), FOUR)).toEqual(["SOCIAL", "DTC", "MARKETPLACE", "LIVE"]);
    expect(orderedChannels(settings([{ code: "LIVE", order: -3 }]), FOUR)).toEqual(["LIVE", "DTC", "MARKETPLACE", "SOCIAL"]);
    expect(orderedChannels(undefined, ["B", "A"])).toEqual(["A", "B"]);
    expect(orderedChannels(null, FOUR)).toEqual([...FOUR]);
  });
});

describe("channel-settings：示範資料的隱含預設讓既有別名輸出逐字相同", () => {
  it("isDemoDataset 與 demoAlias 同一條規則", () => {
    for (const id of [DEMO_ID, "synthetic-demo", "golden-v1", "alternative-manual-v1", "synthetic-4-channel-v1", ""]) expect(isDemoDataset(id)).toBe(demoAlias(id));
  });
  it("defaultChannelSettings：示範資料的 label＝demoChannelAlias（只放 manifest 裡的代碼）、不預設群組；其他資料集沒有 label", () => {
    expect(defaultChannelSettings(DEMO_ID, [...DEMO_CHANNELS, "SHOPEE"])).toEqual(settings([{ code: "DTC", label: labels.data.demoChannelAlias.DTC }, { code: "MARKETPLACE", label: labels.data.demoChannelAlias.MARKETPLACE }, { code: "SHOPEE" }]));
    expect(defaultChannelSettings("golden-v1", DEMO_CHANNELS)).toEqual(settings([{ code: "DTC" }, { code: "MARKETPLACE" }]));
  });
  it("解析器與 boolean 路徑逐字相同：通路、多通路、範圍文字、品類", () => {
    const demo = makeResolver(undefined, DEMO_ID), plain = makeResolver(undefined, "golden-v1");
    const fromNames = makeResolver(resolveChannelNames(undefined, DEMO_ID, DEMO_CHANNELS), DEMO_ID);
    for (const code of [...DEMO_CHANNELS, "SHOPEE"]) {
      expect(channelLabel(code, demo)).toBe(channelLabel(code, true));
      expect(channelLabel(code, fromNames)).toBe(channelLabel(code, true));
      expect(channelLabel(code, plain)).toBe(channelLabel(code, false));
      expect(channelLabel(code, plain)).toBe(code);
    }
    expect(channelsLabel(DEMO_CHANNELS, demo)).toBe(channelsLabel(DEMO_CHANNELS, true));
    expect(channelsLabel(DEMO_CHANNELS, demo)).toBe(`${labels.data.demoChannelAlias.DTC}、${labels.data.demoChannelAlias.MARKETPLACE}`);
    expect(scopeLabel({ kind: "all", channels: [...DEMO_CHANNELS] }, demo)).toBe(scopeLabel({ kind: "all", channels: [...DEMO_CHANNELS] }, true));
    expect(scopeLabel({ kind: "channel", channels: ["DTC"] }, demo)).toBe(labels.data.demoChannelAlias.DTC);
    expect(scopeLabel({ kind: "sku", channels: ["DTC"], sku: "SKU-1" }, plain)).toBe("DTC／SKU-1");
    for (const code of [...Object.keys(labels.data.demoCategoryAlias), "UNKNOWN", ""]) {
      expect(categoryLabel(code, demo)).toBe(categoryLabel(code, true));
      expect(categoryLabel(code, plain)).toBe(categoryLabel(code, false));
    }
    expect(demo.names).toEqual(labels.data.demoChannelAlias);
    expect(plain.names).toEqual({});
  });
  it("resolveChannelNames 只放有名稱的代碼：預設疊上設定；設定裡不在 manifest 的代碼不算", () => {
    expect(resolveChannelNames(undefined, "golden-v1", DEMO_CHANNELS)).toEqual({});
    expect(resolveChannelNames(settings([{ code: "DTC", label: "官網" }, { code: "SHOPEE", label: "蝦皮" }]), "golden-v1", DEMO_CHANNELS)).toEqual({ DTC: "官網" });
    expect(resolveChannelNames(settings([{ code: "DTC", label: "官網" }]), DEMO_ID, DEMO_CHANNELS)).toEqual({ DTC: "官網", MARKETPLACE: labels.data.demoChannelAlias.MARKETPLACE });
    const resolver = makeResolver(resolveChannelNames(settings([{ code: "DTC", label: "DTC" }]), DEMO_ID, DEMO_CHANNELS), DEMO_ID);
    expect(resolver.channel("DTC")).toBe("DTC");
    expect(resolver.channel("MARKETPLACE")).toBe(labels.data.demoChannelAlias.MARKETPLACE);
    expect(resolver.category("HOME")).toBe(labels.data.demoCategoryAlias.HOME);
  });
});

describe("channel-settings：與預設比對後的正規化（備份寫出用）", () => {
  it("未改設定的示範與 golden 正規化回 null", () => {
    for (const [id, channels] of [[DEMO_ID, DEMO_CHANNELS], ["golden-v1", DEMO_CHANNELS], ["synthetic-4-channel-v1", FOUR]] as const) {
      const defaults = defaultChannelSettings(id, channels);
      expect(normalizeChannelSettings(defaults, defaults)).toBeNull();
      expect(normalizeChannelSettings(settings([]), defaults)).toBeNull();
      expect(normalizeChannelSettings(validateChannelSettings(defaults, channels).settings, defaults)).toBeNull();
      expect(snapshotChannelFields(defaults, id, channels)).toBeNull();
      expect(snapshotChannelFields(null, id, channels)).toBeNull();
      expect(snapshotChannelFields(undefined, id, channels)).toBeNull();
    }
    // 示範資料把 label 設成與別名相同、群組沒有成員：仍是「沒有設定」。
    expect(normalizeChannelSettings(settings([{ code: "DTC", label: labels.data.demoChannelAlias.DTC }], [{ id: "g1", label: "自有", order: 0 }]), defaultChannelSettings(DEMO_ID, DEMO_CHANNELS))).toBeNull();
  });
  it("等於預設的欄位去掉、只剩 code 的通路去掉、沒有成員的群組去掉；通路依 manifest 順序輸出", () => {
    const defaults = defaultChannelSettings(DEMO_ID, DEMO_CHANNELS);
    const input = settings([{ code: "MARKETPLACE", label: labels.data.demoChannelAlias.MARKETPLACE, group: "g1", order: 0 }, { code: "DTC", label: "官網" }], [{ id: "g2", label: "空", order: 1 }, { id: "g1", label: "平台", order: 0 }]);
    expect(normalizeChannelSettings(input, defaults)).toEqual(settings([{ code: "DTC", label: "官網" }, { code: "MARKETPLACE", group: "g1", order: 0 }], [{ id: "g1", label: "平台", order: 0 }]));
    // 正規化是冪等的（往返後位元組穩定）。
    const once = normalizeChannelSettings(input, defaults)!;
    expect(normalizeChannelSettings(once, defaults)).toEqual(once);
    expect(JSON.stringify(normalizeChannelSettings(validateChannelSettings(once, DEMO_CHANNELS).settings, defaults))).toBe(JSON.stringify(once));
  });
  it("snapshotChannelFields：驗證、正規化後解析名稱與群組；示範資料把代碼設回自己的代碼也算有設定", () => {
    const fields = snapshotChannelFields(settings([{ code: "DTC", label: "官網", group: "own" }, { code: "SOCIAL", group: "own" }, { code: "SHOPEE", label: "蝦皮" }], [{ id: "own", label: "自有", order: 0 }]), "synthetic-4-channel-v1", FOUR);
    expect(fields).toEqual({ channel_names: { DTC: "官網" }, channel_groups: [{ id: "own", label: "自有", members: ["DTC", "SOCIAL"] }] });
    expect(snapshotChannelFields(settings([{ code: "DTC", label: "DTC" }]), DEMO_ID, DEMO_CHANNELS)).toEqual({ channel_names: { DTC: "DTC", MARKETPLACE: labels.data.demoChannelAlias.MARKETPLACE }, channel_groups: [] });
  });
});
