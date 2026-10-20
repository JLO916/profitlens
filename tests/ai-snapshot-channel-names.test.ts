import { describe, expect, it } from "vitest";
import { prepareAiSnapshot } from "@/application/ai-snapshot";
import { CHANNEL_SETTINGS_VERSION, type ChannelSettings } from "@/application/channel-settings";
import { createSnapshot, hashInput } from "@/application/workspace";
import { validateDataset } from "@/domain/validation";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

/*
 * V42-1a（06_BATCHES V42-1a 第 4 項、PRD §3.1「名稱只進人讀的文字」與 §8「名稱不進任何雜湊與機器可讀欄位」、docs/AI_CONTRACT.md「模型只收到最小彙總內容」）：
 * AI 快照負載（ai-snapshot-v2）只帶 C01… 的通路代號與 facts；通路的顯示名稱、群組名與群組 id（快照的 channel_names／channel_groups）一律不進負載，
 * 通路代碼本身也只留在本機的 localChannels 對照。有設定與沒有設定的快照產生的負載逐位元組相同。
 */
const LABEL = "官網（自營）", SOCIAL_LABEL = "社群小店", GROUP_LABEL = "自有通路", GROUP_ID = "grp-own";
const SETTINGS: ChannelSettings = {
  version: CHANNEL_SETTINGS_VERSION,
  channels: [{ code: "DTC", label: LABEL, group: GROUP_ID, order: 0 }, { code: "SOCIAL", label: SOCIAL_LABEL, group: GROUP_ID, order: 1 }],
  groups: [{ id: GROUP_ID, label: GROUP_LABEL, order: 0 }],
};
const CHANNELS = ["DTC", "SOCIAL", "MARKETPLACE"];
const json = (value: unknown) => JSON.stringify(value, (_, item: unknown) => typeof item === "bigint" ? item.toString() : item);

describe("V42-1a AI 快照負載不含通路的顯示名稱與群組名", () => {
  it("有設定的快照：負載序列化後沒有顯示名稱、群組名、群組 id、channel_names／channel_groups 鍵，也沒有通路代碼；filters.channels 只有 C01… 代號；localChannels 才是代碼", async () => {
    const input = synthetic4ChannelInput();
    const dataset = validateDataset(input).dataset!;
    const hash = await hashInput(input);
    const named = await createSnapshot(dataset, { channels: CHANNELS }, hash, SETTINGS);
    expect(named.channel_names).toEqual({ DTC: LABEL, SOCIAL: SOCIAL_LABEL });
    expect(named.channel_groups).toEqual([{ id: GROUP_ID, label: GROUP_LABEL, members: ["DTC", "SOCIAL"] }]);
    const prepared = prepareAiSnapshot(named, 3);
    const text = JSON.stringify(prepared.payload);
    for (const forbidden of [LABEL, SOCIAL_LABEL, GROUP_LABEL, GROUP_ID, "channel_names", "channel_groups", "DTC", "SOCIAL", "MARKETPLACE", "LIVE"]) expect(text, forbidden).not.toContain(forbidden);
    expect(prepared.payload.filters.channels).toEqual(["C01", "C02", "C03"]);
    expect(prepared.localChannels).toEqual({ C01: "DTC", C02: "MARKETPLACE", C03: "SOCIAL" });
    // 本機對照也只有代碼與 facts（來源列、範圍的通路代碼），沒有名稱。
    const local = json({ channels: prepared.localChannels, facts: prepared.localFacts });
    for (const forbidden of [LABEL, SOCIAL_LABEL, GROUP_LABEL, GROUP_ID]) expect(local, forbidden).not.toContain(forbidden);
    expect(prepared.payload.facts.length).toBeGreaterThan(0);
  });

  it("有設定與沒有設定的快照：負載逐位元組相同、本機對照相同（名稱不改任何 fact、id 與雜湊）", async () => {
    const input = synthetic4ChannelInput();
    const dataset = validateDataset(input).dataset!;
    const hash = await hashInput(input);
    const named = prepareAiSnapshot(await createSnapshot(dataset, { channels: CHANNELS }, hash, SETTINGS), 7);
    const plain = prepareAiSnapshot(await createSnapshot(dataset, { channels: CHANNELS }, hash), 7);
    expect(JSON.stringify(named.payload)).toBe(JSON.stringify(plain.payload));
    expect(named.localChannels).toEqual(plain.localChannels);
    expect(json(named.localFacts)).toBe(json(plain.localFacts));
    expect(named.payload.snapshot_id).toBe(plain.payload.snapshot_id);
  });
});
