import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("PL-01 persistence boundary (mock API, actual IndexedDB covered by browser tests)", () => {
  it("importing storage helpers does not open a database, load a record or subscribe to another window", async () => {
    const open = vi.fn(); const deleteDatabase = vi.fn();
    vi.stubGlobal("indexedDB", { open, deleteDatabase });
    await import("@/application/local-store");
    expect(open).not.toHaveBeenCalled();
    expect(deleteDatabase).not.toHaveBeenCalled();
  });
  it("rejects malformed backups before opening or replacing any saved local record", async () => {
    const open = vi.fn(); vi.stubGlobal("indexedDB", { open });
    const { saveLocalWorkspace } = await import("@/application/local-store");
    await expect(saveLocalWorkspace("{")).rejects.toThrow("INVALID_WORKSPACE_JSON");
    expect(open).not.toHaveBeenCalled();
  });
  it("reports unavailable browser storage rather than claiming a save or delete succeeded", async () => {
    vi.stubGlobal("indexedDB", undefined);
    const { loadLocalWorkspace, deleteLocalWorkspace } = await import("@/application/local-store");
    await expect(loadLocalWorkspace()).rejects.toThrow("LOCAL_STORAGE_UNAVAILABLE");
    await expect(deleteLocalWorkspace()).rejects.toThrow("LOCAL_STORAGE_UNAVAILABLE");
  });
});
