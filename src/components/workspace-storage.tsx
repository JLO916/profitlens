"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { downloadText } from "@/application/download";
import { exportWorkspaceBackup, restoreWorkspaceBackup, MAX_WORKSPACE_BYTES, type RestoredWorkspace, type WorkspaceBackupSource } from "@/application/workspace-backup";
import { deleteLocalWorkspace, loadLocalWorkspace, saveLocalWorkspace } from "@/application/local-store";

/** Persistence happens only after a deliberate user action, never during mount. */
export function WorkspaceStorage({ source, version, dirty, onRestore, onSaved, onDeleted }: {
  source: WorkspaceBackupSource | null;
  version: number;
  dirty: boolean;
  onRestore: (workspace: RestoredWorkspace) => void;
  onSaved: (version: number) => void;
  onDeleted: () => void;
}) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState<RestoredWorkspace | null>(null);
  const [downloadVersion, setDownloadVersion] = useState<number | null>(null);
  const ticket = useRef(0);

  async function save(local: boolean) {
    if (!source || (local && !consent)) return;
    const currentVersion = version;
    setBusy(true); setNotice(""); setError("");
    try {
      const text = await exportWorkspaceBackup(source);
      if (local) {
        await saveLocalWorkspace(text);
        onSaved(currentVersion);
        setNotice("已保存此版本到這個瀏覽器。本機副本不會自動更新；修改後請再次保存。");
      } else {
        downloadText(text, "profitlens-workspace.json", "application/json;charset=utf-8");
        setDownloadVersion(currentVersion);
        setNotice("已建立工作區備份下載。請確認檔案已保存；備份含分析所需的 CSV 與工作稿，請妥善保管。");
      }
    } catch {
      setError("保存未完成。瀏覽器可能不允許儲存、容量不足，或工作稿無法驗證；目前工作區仍保留。可先下載備份，並檢查方案與行動內容。");
    } finally { setBusy(false); }
  }

  async function preview(text: string, currentTicket: number) {
    const restored = await restoreWorkspaceBackup(text);
    if (ticket.current !== currentTicket) return;
    setCandidate(restored);
    setNotice("備份已通過格式、資料與計算檢查，尚未取代目前工作區。請核對後套用。");
  }
  async function selectBackup(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!file) return;
    const currentTicket = ++ticket.current;
    setBusy(true); setCandidate(null); setError(""); setNotice("");
    try {
      if (!file.name.toLowerCase().endsWith(".json") || file.size > MAX_WORKSPACE_BYTES) throw new Error("INVALID_BACKUP_FILE");
      await preview(new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()), currentTicket);
    } catch {
      if (ticket.current === currentTicket) setError("無法恢復：請使用本工具的有效工作區 JSON 備份（最多 64 MiB）。不支援格式、損毀或遭更動的檔案不會取代目前資料。");
    } finally { if (ticket.current === currentTicket) setBusy(false); }
  }
  async function loadLocal() {
    const currentTicket = ++ticket.current;
    setBusy(true); setCandidate(null); setError(""); setNotice("");
    try {
      const text = await loadLocalWorkspace();
      if (ticket.current !== currentTicket) return;
      if (text === null) setNotice("這個瀏覽器沒有已保存的工作區。預設不會保存，也不會自動載入其他分頁的資料。");
      else await preview(text, currentTicket);
    } catch { if (ticket.current === currentTicket) setError("本機副本無法讀取或驗證，目前資料未變更。可改選工作區備份檔，或刪除本機副本。"); }
    finally { if (ticket.current === currentTicket) setBusy(false); }
  }
  async function removeLocal() {
    ++ticket.current;
    setBusy(true); setError(""); setCandidate(null); setConsent(false);
    try {
      await deleteLocalWorkspace(); onDeleted();
      setNotice("已刪除這個瀏覽器的本機副本並關閉保存。各分頁的目前資料與已下載檔案不會被刪除。");
    } catch { setError("刪除未完成，瀏覽器可能限制本機儲存。請在瀏覽器網站資料設定檢查；目前分頁資料仍保留。"); }
    finally { setBusy(false); }
  }

  return <details className="panel workspace-storage" data-testid="workspace-storage">
    <summary>工作區保存與恢復 <span className="tag">{source ? dirty ? "有未保存變更" : "此版本已保存" : "尚無工作區"}</span></summary>
    <p>預設只留在此分頁記憶體。您可下載完整工作區備份，或主動保存到這個瀏覽器；均不上傳伺服器。本機副本與下載檔未由本工具加密；共享電腦請避免保存，使用後刪除本機副本。同一瀏覽器的使用者可手動恢復保存檔，不同分頁不會自動載入或同步。</p>
    <p className="note">備份包含分析所需資料、欄位對照、已套用範圍、方案、行動、確認狀態與版本；恢復時重新驗證與計算。未套用的日期／匯入草稿、商品搜尋、AI 回應、API key 與傳送同意不保存。校驗碼可偵測損毀，不證明檔案出處；只開啟可信備份。</p>
    <div className="button-row">
      <button className="button quiet" disabled={!source || busy} onClick={() => void save(false)}>下載完整工作區備份</button>
      <label className="backup-file-label">選取工作區備份 JSON<input aria-label="選取工作區備份 JSON" type="file" accept=".json,application/json" disabled={busy} onChange={event => void selectBackup(event)} /></label>
      <button className="button quiet" disabled={busy} onClick={() => void loadLocal()}>讀取本機副本預覽</button>
    </div>
    <label className="local-save-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} />我同意將工作區資料保存於這個瀏覽器（不自動保存）</label>
    <div className="button-row">
      <button className="button primary" disabled={!source || !consent || busy} onClick={() => void save(true)}>保存本機副本</button>
      <button className="button quiet" disabled={busy} onClick={() => void removeLocal()}>刪除本機副本並關閉保存</button>
      {downloadVersion !== null && <button className="button quiet" onClick={() => { onSaved(downloadVersion); setDownloadVersion(null); setNotice("已記錄您確認保存的備份版本；之後的修改仍需再次保存。"); }}>已確認備份檔已保存</button>}
    </div>
    {busy && <p aria-live="polite">正在驗證或處理本機副本…</p>}
    {notice && <p className="note" data-testid="storage-notice" aria-live="polite">{notice}</p>}
    {error && <p role="alert" className="alert error">{error}</p>}
    {candidate && <section className="restore-preview" aria-label="工作區恢復預覽">
      <h3>確認恢復的工作區</h3>
      <p>{candidate.dataset.manifest.dataset_id} · 資料截至 {candidate.snapshot.data_as_of} · 通路 {candidate.snapshot.report.scope.channels.join("、")}</p>
      <p>前期 {candidate.snapshot.report.previous.period.start} — {candidate.snapshot.report.previous.period.end}；本期 {candidate.snapshot.report.current.period.start} — {candidate.snapshot.report.current.period.end}</p>
      <p>方案 {candidate.decision.scenarios.length} 個、行動 {candidate.action_workspace.items.length} 項。資料與方案已重新計算；過期工作稿仍保留過期狀態。</p>
      {dirty && <p className="alert partial">目前工作區有未保存變更。套用會取代目前資料；請先保存需要保留的版本。</p>}
      <div className="button-row"><button className="button primary" onClick={() => { onRestore(candidate); setConsent(false); setCandidate(null); setDownloadVersion(null); setNotice("已恢復工作區。未自動開啟本機保存或 AI 傳送同意。"); }}>套用備份並取代工作區</button><button className="button quiet" onClick={() => setCandidate(null)}>取消恢復</button></div>
    </section>}
  </details>;
}
