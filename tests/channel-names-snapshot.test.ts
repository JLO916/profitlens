import { describe, expect, it } from "vitest";
import { CHANNEL_SETTINGS_VERSION, type ChannelSettings } from "@/application/channel-settings";
import { channelLabel, channelsLabel, scopeLabel, snapshotResolver } from "@/application/copy";
import { createSnapshot, hashInput, type WorkspaceSnapshot } from "@/application/workspace";
import type { Scope } from "@/domain/types";
import { validateDataset } from "@/domain/validation";
import { labels } from "@/i18n";
import { fixture } from "./helpers/fixtures";
import { synthetic4ChannelInput } from "./helpers/synthetic-4-channel";

// V42-1a（D-V42-14；06_BATCHES V42-1a 第 2 項）：createSnapshot 的第 4 個選填參數把設定解析成快照的 channel_names／channel_groups；
// 沒有設定的快照與 v4.1.2 相同（沒有這兩個鍵）；filter_hash 仍只由 report.scope 算；試算頁式的單一通路快照範圍文字等於設定的顯示名稱。

const SETTINGS: ChannelSettings = { version: CHANNEL_SETTINGS_VERSION, channels: [{ code: "DTC", label: "官網", group: "own" }, { code: "SOCIAL", group: "own" }], groups: [{ id: "own", label: "自有", order: 0 }] };

/** 期間列／試算頁的範圍：只有一個通路是 kind "channel"，否則 kind "all"（與 excel-export 的 scopeLabel({ kind: "all", channels }) 相同的組法）。 */
const scopeOf = (snapshot: Pick<WorkspaceSnapshot, "report">): Scope => ({ kind: snapshot.report.scope.channels.length === 1 ? "channel" : "all", channels: snapshot.report.scope.channels });

const json = (value: unknown) => JSON.stringify(value, (_, item: unknown) => typeof item === "bigint" ? item.toString() : item);

async function prepared() {
  const input = synthetic4ChannelInput();
  const dataset = validateDataset(input).dataset!;
  return { dataset, hash: await hashInput(input) };
}

describe("V42-1a 快照的通路名稱", () => {
  it("有設定時 channel_names.DTC 是顯示名稱、channel_groups 是成員集合；沒有設定時兩個鍵都不存在", async () => {
    const { dataset, hash } = await prepared();
    const named = await createSnapshot(dataset, {}, hash, SETTINGS);
    expect(named.channel_names).toEqual({ DTC: "官網" });
    expect(named.channel_groups).toEqual([{ id: "own", label: "自有", members: ["DTC", "SOCIAL"] }]);
    const plain = await createSnapshot(dataset, {}, hash);
    expect("channel_names" in plain).toBe(false);
    expect("channel_groups" in plain).toBe(false);
    expect(Object.keys(plain).sort()).toEqual(["data_as_of", "dataset_hash", "filter_hash", "metric_version", "products", "report", "weeks", "yoy"]);
    const nulled = await createSnapshot(dataset, {}, hash, null);
    expect(Object.keys(nulled).sort()).toEqual(Object.keys(plain).sort());
    // 設定與預設沒有差（只剩 code、群組沒有成員）時，和沒有設定一樣。
    const untouched = await createSnapshot(dataset, {}, hash, { version: CHANNEL_SETTINGS_VERSION, channels: [{ code: "DTC" }], groups: [{ id: "g1", label: "空", order: 0 }] });
    expect("channel_names" in untouched).toBe(false);
  });
  it("filter_hash 與 dataset_hash 不受設定影響；report 與 products 逐位元組相同", async () => {
    const { dataset, hash } = await prepared();
    const named = await createSnapshot(dataset, { channels: ["DTC", "MARKETPLACE"] }, hash, SETTINGS);
    const plain = await createSnapshot(dataset, { channels: ["DTC", "MARKETPLACE"] }, hash);
    expect(named.filter_hash).toBe(plain.filter_hash);
    expect(named.dataset_hash).toBe(plain.dataset_hash);
    expect(json(named.report)).toBe(json(plain.report));
    expect(json(named.products)).toBe(json(plain.products));
    expect(named.report.scope.channels).toEqual(["DTC", "MARKETPLACE"]);
  });
  it("試算頁式的單一通路快照：scopeLabel 與期間摘要的範圍文字等於設定的顯示名稱；沒有名稱的通路退回代碼", async () => {
    const { dataset, hash } = await prepared();
    const single = await createSnapshot(dataset, { channels: ["DTC"] }, hash, SETTINGS);
    const resolver = snapshotResolver(single);
    expect(scopeLabel(scopeOf(single), resolver)).toBe("官網");
    expect(channelsLabel(single.report.scope.channels, resolver)).toBe("官網");
    expect(channelLabel("SOCIAL", resolver)).toBe("SOCIAL");
    const social = await createSnapshot(dataset, { channels: ["SOCIAL"] }, hash, SETTINGS);
    expect(scopeLabel(scopeOf(social), snapshotResolver(social))).toBe("SOCIAL");
    const all = await createSnapshot(dataset, {}, hash, SETTINGS);
    expect(scopeLabel(scopeOf(all), snapshotResolver(all))).toBe(`${labels.overview.sections.total}（官網、LIVE、MARKETPLACE、SOCIAL）`);
  });
  it("snapshotResolver：沒有 channel_names 的快照用隱含預設——示範資料是既有別名、golden 是代碼", async () => {
    const demoInput = fixture("demo"), goldenInput = fixture("golden");
    const demo = await createSnapshot(validateDataset(demoInput).dataset!, {}, await hashInput(demoInput));
    const golden = await createSnapshot(validateDataset(goldenInput).dataset!, {}, await hashInput(goldenInput));
    expect(scopeLabel(scopeOf(demo), snapshotResolver(demo))).toBe(`${labels.overview.sections.total}（${labels.data.demoChannelAlias.DTC}、${labels.data.demoChannelAlias.MARKETPLACE}）`);
    expect(scopeLabel(scopeOf(golden), snapshotResolver(golden))).toBe(`${labels.overview.sections.total}（${golden.report.scope.channels.join("、")}）`);
    expect(snapshotResolver(golden).channel("DTC")).toBe("DTC");
    // 示範資料加了設定：沒有改到的通路仍是既有別名。
    const demoNamed = await createSnapshot(validateDataset(demoInput).dataset!, {}, await hashInput(demoInput), { version: CHANNEL_SETTINGS_VERSION, channels: [{ code: "DTC", label: "官網" }], groups: [] });
    expect(demoNamed.channel_names).toEqual({ DTC: "官網", MARKETPLACE: labels.data.demoChannelAlias.MARKETPLACE });
    expect(demoNamed.filter_hash).toBe(demo.filter_hash);
  });
});
