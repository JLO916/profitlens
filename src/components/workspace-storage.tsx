"use client";

import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { downloadText } from "@/application/download";
import { exportWorkspaceBackup, restoreWorkspaceBackup, MAX_WORKSPACE_BYTES, type RestoredWorkspace, type WorkspaceBackupSource } from "@/application/workspace-backup";
import { deleteLocalWorkspace, loadLocalWorkspace, localWorkspaceSavedAt, saveLocalWorkspace } from "@/application/local-store";
import { AUTO_SAVE_DELAY_MS, createAutoSaver, formatSavedDateTime, formatSavedTime, type AutoSaver } from "@/application/auto-save";
import { channelsLabel, demoAlias } from "@/application/copy";
import { fill, labels } from "@/i18n";

const copy = labels.ui.workspaceStorage;
const auto = labels.autoSave;

/**
 * Persistence happens only after consent, never during mount: an explicit save, or (R6-6, D7＝A) auto-save
 * after the user agreed in the first-use prompt or ticked the consent box. Restore still needs preview → confirm.
 */
export function WorkspaceStorage({ source, version, dirty, onRestore, onSaved, onDeleted, consent, onConsentChange }: {
  source: WorkspaceBackupSource | null;
  version: number;
  dirty: boolean;
  onRestore: (workspace: RestoredWorkspace, accepted?: () => void) => void;
  onSaved: (version: number) => void;
  onDeleted: () => void;
  /** R3：本機保存同意由 Dashboard 保存，匯入精靈的對照記憶也依此決定是否寫進 IndexedDB。 */
  consent: boolean;
  onConsentChange: (value: boolean) => void;
}) {
  const setConsent = onConsentChange;
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [candidate, setCandidate] = useState<RestoredWorkspace | null>(null);
  const [downloadVersion, setDownloadVersion] = useState<number | null>(null);
  const ticket = useRef(0);
  // R6-6：首次有資料且尚未同意時問一次（本元件生命週期內；清空工作區時 Dashboard 以新 key 重掛，會再問一次）。
  const [answered, setAnswered] = useState(false);
  const [previousSavedAt, setPreviousSavedAt] = useState<Date | null>(null);
  const [lastSaved, setLastSaved] = useState<{ version: number; at: Date } | null>(null);
  const [autoError, setAutoError] = useState(false);
  const promptId = useId();
  const latest = useRef({ source, onSaved });
  useEffect(() => { latest.current = { source, onSaved }; });
  // 自動保存一律走 exportWorkspaceBackup → saveLocalWorkspace（寫入前重新驗證）；失敗不重試，等下次變更。卸載時取消排程。
  const saverRef = useRef<AutoSaver | null>(null);
  useEffect(() => {
    const saver = createAutoSaver({
      delayMs: AUTO_SAVE_DELAY_MS,
      save: async () => {
        const current = latest.current.source;
        if (!current) throw new Error("AUTO_SAVE_NO_WORKSPACE");
        await saveLocalWorkspace(await exportWorkspaceBackup(current));
      },
      onSaved: (saved, at) => { setLastSaved({ version: saved, at }); setAutoError(false); latest.current.onSaved(saved); },
      onError: () => setAutoError(true),
    });
    saverRef.current = saver;
    return () => { saver.cancel(); if (saverRef.current === saver) saverRef.current = null; };
  }, []);
  const hasSource = source !== null;
  useEffect(() => {
    const saver = saverRef.current;
    if (!saver) return;
    if (!consent || !hasSource || !dirty) { saver.cancel(); return; }
    saver.schedule(version);
  }, [consent, hasSource, dirty, version]);
  const promptOpen = hasSource && !consent && !answered;
  useEffect(() => {
    if (!promptOpen) return;
    let live = true;
    // 這台電腦已有保存的工作區時提醒「同意會改存成目前的」；沒有本機資料庫時不會建立。
    localWorkspaceSavedAt().then(value => { if (live) setPreviousSavedAt(value ? new Date(value) : null); }, () => undefined);
    return () => { live = false; };
  }, [promptOpen]);
  const promptRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  /** 關閉對話框；焦點原本在對話框內時移到「儲存」選單（按鈕消失後焦點不會掉到頁首）。 */
  function closePrompt() {
    setAnswered(true);
    if (typeof document !== "undefined" && promptRef.current?.contains(document.activeElement)) summaryRef.current?.focus();
  }
  function acceptPrompt() {
    closePrompt(); setConsent(true);
    // 同意後立即保存一次；之後的變更由上面的排程在 2 秒內保存（同一版不重存）。
    saverRef.current?.schedule(version);
    void saverRef.current?.flush();
  }

  async function save(local: boolean) {
    if (!source || (local && !consent)) return;
    const currentVersion = version;
    setBusy(true); setNotice(""); setError("");
    try {
      const text = await exportWorkspaceBackup(source);
      if (local) {
        await saveLocalWorkspace(text);
        onSaved(currentVersion);
        setLastSaved({ version: currentVersion, at: new Date() });
        setNotice(auto.savedLocalNotice);
      } else {
        downloadText(text, "profitlens-workspace.json", "application/json;charset=utf-8");
        setDownloadVersion(currentVersion);
        setNotice(copy.downloadedNotice);
      }
    } catch {
      setError(copy.saveError);
    } finally { setBusy(false); }
  }

  async function preview(text: string, currentTicket: number) {
    const restored = await restoreWorkspaceBackup(text);
    if (ticket.current !== currentTicket) return;
    setCandidate(restored);
    setNotice(copy.previewReadyNotice);
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
      if (ticket.current === currentTicket) setError(copy.invalidBackupError);
    } finally { if (ticket.current === currentTicket) setBusy(false); }
  }
  async function loadLocal() {
    const currentTicket = ++ticket.current;
    setBusy(true); setCandidate(null); setError(""); setNotice("");
    try {
      const text = await loadLocalWorkspace();
      if (ticket.current !== currentTicket) return;
      if (text === null) setNotice(copy.noLocalNotice);
      else await preview(text, currentTicket);
    } catch { if (ticket.current === currentTicket) setError(copy.localReadError); }
    finally { if (ticket.current === currentTicket) setBusy(false); }
  }
  async function removeLocal() {
    ++ticket.current;
    setBusy(true); setError(""); setCandidate(null); setConsent(false); setAnswered(true);
    // 先停掉排程並等進行中的自動保存寫完，避免刪除後又被寫回。
    const saver = saverRef.current;
    saver?.cancel();
    try {
      await saver?.whenIdle();
      await deleteLocalWorkspace(); onDeleted();
      setLastSaved(null); setPreviousSavedAt(null);
      setNotice(copy.deletedNotice);
    } catch { setError(copy.deleteError); }
    finally { setBusy(false); }
  }

  // R1-2: the whole panel lives in the top-bar「儲存」menu; R2: every visible string comes from labels. Testids are unchanged.
  const alias = candidate ? demoAlias(candidate.dataset.manifest.dataset_id) : false;
  // R6-6：已保存時顯示「已保存 hh:mm」（這一版由自動或手動存在這台電腦）；下載備份確認的版本沿用「此版本已保存」。
  const savedTag = !source ? labels.status.noWorkspace : dirty ? labels.status.unsaved : lastSaved && lastSaved.version === version ? fill(labels.status.savedAt, { time: formatSavedTime(lastSaved.at) }) : labels.status.savedVersion;
  return <>
  <details className="topbar-menu storage-menu workspace-storage" data-testid="workspace-storage">
    <summary ref={summaryRef}>{labels.buttons.save} <span className={`tag ${source && dirty ? "unsaved" : ""}`}>{savedTag}</span></summary>
    <div className="menu-panel">
    <h3>{labels.buttons.save}</h3>
    <p>{copy.intro}</p>
    <p className="note">{copy.caution}</p>
    <details className="note"><summary>{labels.sections.technicalDetails}</summary><p>{copy.backupContents}</p></details>
    <div className="button-row">
      <button className="button quiet" disabled={!source || busy} onClick={() => void save(false)}>{labels.buttons.downloadBackup}</button>
      <label className="backup-file-label">{copy.selectBackupFile}<input aria-label={copy.selectBackupFile} type="file" accept=".json,application/json" disabled={busy} onChange={event => void selectBackup(event)} /></label>
      <button className="button quiet" disabled={busy} onClick={() => void loadLocal()}>{labels.buttons.restorePreview}</button>
    </div>
    <label className="local-save-consent"><input type="checkbox" checked={consent} onChange={event => { setAnswered(true); setConsent(event.target.checked); }} disabled={busy} />{copy.consent}</label>
    <p className="note consent-note">{auto.consentNote}</p>
    <p className="note autosave-status" data-testid="autosave-status">{consent ? auto.statusOn : auto.statusOff}{consent && lastSaved && <span> · {fill(auto.lastSaved, { time: formatSavedTime(lastSaved.at) })}</span>}</p>
    <div className="button-row">
      <button className="button primary" disabled={!source || !consent || busy} onClick={() => void save(true)}>{labels.buttons.saveLocal}</button>
      <button className="button quiet" disabled={busy} onClick={() => void removeLocal()}>{labels.buttons.deleteLocal}</button>
      {downloadVersion !== null && <button className="button quiet" onClick={() => { onSaved(downloadVersion); setDownloadVersion(null); setNotice(copy.downloadConfirmedNotice); }}>{copy.confirmDownloaded}</button>}
    </div>
    {busy && <p aria-live="polite">{copy.busy}</p>}
    {notice && <p className="note" data-testid="storage-notice" aria-live="polite">{notice}</p>}
    {error && <p role="alert" className="alert error">{error}</p>}
    {candidate && <section className="restore-preview" aria-label={copy.restorePreviewAria}>
      <h3>{copy.restoreHeading}</h3>
      <p>{fill(copy.restoreSummary, { datasetId: candidate.dataset.manifest.dataset_id, asOf: candidate.snapshot.data_as_of, channels: channelsLabel(candidate.snapshot.report.scope.channels, alias) })}</p>
      <p>{fill(copy.restorePeriods, { prevStart: candidate.snapshot.report.previous.period.start, prevEnd: candidate.snapshot.report.previous.period.end, curStart: candidate.snapshot.report.current.period.start, curEnd: candidate.snapshot.report.current.period.end })}</p>
      <p>{fill(copy.restoreCounts, { plans: candidate.scenario_workspace.contexts.reduce((sum, context) => sum + context.plans.length, 0), actions: candidate.action_workspace.items.length })}</p>
      {dirty && <p className="alert partial">{copy.unsavedWarning}</p>}
      <div className="button-row"><button className="button primary" onClick={() => { onRestore(candidate, () => { setConsent(false); setCandidate(null); setDownloadVersion(null); setNotice(copy.restoredNotice); }); }}>{copy.applyRestore}</button><button className="button quiet" onClick={() => setCandidate(null)}>{labels.buttons.cancel}</button></div>
    </section>}
    </div>
  </details>
  {/* R6-6 首次同意對話框：非 modal（不蓋主內容、不鎖焦點、不自動 focus），在 details 外面，收合時仍看得到。 */}
  {promptOpen && <section ref={promptRef} role="dialog" aria-labelledby={`${promptId}-title`} aria-describedby={`${promptId}-body`} className="local-save-prompt" data-testid="local-save-prompt" onKeyDown={event => { if (event.key === "Escape") closePrompt(); }}>
    <h2 id={`${promptId}-title`}>{auto.promptTitle}</h2>
    <p id={`${promptId}-body`}>{auto.promptBody}</p>
    {previousSavedAt && <p className="note" data-testid="local-save-replace-warning">{fill(auto.replaceWarning, { time: formatSavedDateTime(previousSavedAt) })}</p>}
    <p className="note">{copy.caution}</p>
    <div className="button-row">
      <button type="button" className="button primary" onClick={acceptPrompt}>{auto.accept}</button>
      <button type="button" className="button quiet" onClick={closePrompt}>{auto.decline}</button>
    </div>
  </section>}
  {autoError && consent && hasSource && <div className="local-save-alert" data-testid="autosave-error">
    <p role="alert">{auto.failed}</p>
    <button type="button" className="button quiet" onClick={() => setAutoError(false)}>{auto.dismiss}</button>
  </div>}
  </>;
}
