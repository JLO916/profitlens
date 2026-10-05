import { describe, expect, it, vi } from "vitest";
import { labels } from "@/i18n";
import { track, type AnalyticsEvent } from "../src/application/analytics";
import { detectV2Workspace, isV2BackupSchema, readWhatsNewMark, shouldShowWhatsNewAfterRestore, shouldShowWhatsNewOnLoad, V2_BACKUP_SCHEMAS, whatsNewText, WHATS_NEW_STORAGE_KEY, writeWhatsNewMark, type WhatsNewStorage } from "../src/application/whats-new";

// V3-2a（F23，PRD §8.9）：「這版改了什麼」提示的偵測與已讀紀錄。IndexedDB 與 localStorage 都以假的物件注入。

function memoryStorage(initial: Record<string, string> = {}): WhatsNewStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: key => (key in data ? data[key] : null), setItem: (key, value) => { data[key] = String(value); } };
}
const throwingStorage: WhatsNewStorage = { getItem: () => { throw new Error("SecurityError"); }, setItem: () => { throw new Error("QuotaExceededError"); } };
const workspace = (exists: boolean) => vi.fn(async () => ({ exists, savedAt: null }));

describe("whats-new 偵測", () => {
  it("這台電腦已有本機工作區（v2 使用者）時顯示，且不寫任何紀錄", async () => {
    const storage = memoryStorage();
    expect(await shouldShowWhatsNewOnLoad(storage, workspace(true))).toBe(true);
    expect(storage.data).toEqual({});
  });

  it("新訪客不顯示，並記為 fresh；之後在 v3 自己存的本機副本不再觸發，也不再讀 IndexedDB", async () => {
    const storage = memoryStorage();
    expect(await shouldShowWhatsNewOnLoad(storage, workspace(false))).toBe(false);
    expect(storage.data[WHATS_NEW_STORAGE_KEY]).toBe("fresh");
    const probe = workspace(true);
    expect(await shouldShowWhatsNewOnLoad(storage, probe)).toBe(false);
    expect(probe).not.toHaveBeenCalled();
  });

  it("已關閉就不再顯示（載入與還原都一樣）", async () => {
    const storage = memoryStorage({ [WHATS_NEW_STORAGE_KEY]: "dismissed" });
    const probe = workspace(true);
    expect(await shouldShowWhatsNewOnLoad(storage, probe)).toBe(false);
    expect(probe).not.toHaveBeenCalled();
    expect(shouldShowWhatsNewAfterRestore("profitlens-workspace-v2", storage)).toBe(false);
  });

  it("還原 v1–v4 備份後顯示（fresh 也顯示）；其他 schema 不顯示", () => {
    for (const schema of V2_BACKUP_SCHEMAS) {
      expect(isV2BackupSchema(schema)).toBe(true);
      expect(shouldShowWhatsNewAfterRestore(schema, memoryStorage())).toBe(true);
      expect(shouldShowWhatsNewAfterRestore(schema, memoryStorage({ [WHATS_NEW_STORAGE_KEY]: "fresh" }))).toBe(true);
    }
    expect(shouldShowWhatsNewAfterRestore(undefined, memoryStorage())).toBe(true);
    expect(isV2BackupSchema("profitlens-workspace-v5")).toBe(false);
    expect(isV2BackupSchema(4)).toBe(false);
    expect(shouldShowWhatsNewAfterRestore("profitlens-workspace-v5", memoryStorage())).toBe(false);
  });

  it("讀取本機工作區失敗時當作沒有 v2 資料", async () => {
    expect(await detectV2Workspace(async () => { throw new Error("LOCAL_STORAGE_UNAVAILABLE"); })).toBe(false);
    expect(await detectV2Workspace(workspace(true))).toBe(true);
  });
});

describe("whats-new 已讀紀錄（localStorage，try/catch）", () => {
  it("寫入後讀得回來；無法辨識的值當作沒有紀錄", () => {
    const storage = memoryStorage();
    expect(readWhatsNewMark(storage)).toBeNull();
    expect(writeWhatsNewMark("dismissed", storage)).toBe(true);
    expect(readWhatsNewMark(storage)).toBe("dismissed");
    expect(readWhatsNewMark(memoryStorage({ [WHATS_NEW_STORAGE_KEY]: "yes" }))).toBeNull();
  });

  it("localStorage 讀寫丟錯時不丟出：讀不到就再顯示一次（v2 使用者），寫不進去回傳 false", async () => {
    expect(readWhatsNewMark(throwingStorage)).toBeNull();
    expect(writeWhatsNewMark("dismissed", throwingStorage)).toBe(false);
    expect(await shouldShowWhatsNewOnLoad(throwingStorage, workspace(true))).toBe(true);
    expect(await shouldShowWhatsNewOnLoad(throwingStorage, workspace(false))).toBe(false);
    expect(shouldShowWhatsNewAfterRestore("profitlens-workspace-v4", throwingStorage)).toBe(true);
  });

  it("沒有 localStorage（伺服器端）時同樣不丟錯", async () => {
    expect(readWhatsNewMark(null)).toBeNull();
    expect(writeWhatsNewMark("fresh", null)).toBe(false);
    expect(await shouldShowWhatsNewOnLoad(null, workspace(false))).toBe(false);
  });
});

describe("whats-new 文案", () => {
  it("提示文字依 PRD §8.9：例子是扣廣告前貢獻與它的舊名，字串都來自 labels", () => {
    const example = labels.glossary.terms.find(term => term.englishKey === "contribution_before_marketing")!;
    expect(example.term).toBe("扣廣告前貢獻");
    expect(example.oldNames[0]).toBe("通路貢獻");
    expect(whatsNewText()).toBe("這一版改了部分名稱，例如『通路貢獻』改為『扣廣告前貢獻』。");
    expect(labels.whatsNew.link).toBe("查看名詞對照");
    expect(labels.whatsNew.dismissAria).toContain(labels.whatsNew.dismiss);
  });

  it("glossary_opened 是合法的分析事件名，沒有 window.va 時 track 不做任何事", () => {
    const event: AnalyticsEvent = "glossary_opened";
    expect(() => track(event)).not.toThrow();
  });
});
