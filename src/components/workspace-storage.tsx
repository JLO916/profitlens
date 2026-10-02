"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { downloadText } from "@/application/download";
import { exportWorkspaceBackup, restoreWorkspaceBackup, MAX_WORKSPACE_BYTES, type RestoredWorkspace, type WorkspaceBackupSource } from "@/application/workspace-backup";
import { deleteLocalWorkspace, loadLocalWorkspace, saveLocalWorkspace } from "@/application/local-store";
import { channelsLabel, demoAlias } from "@/application/copy";
import { fill, labels } from "@/i18n";

const copy = labels.ui.workspaceStorage;

/** Persistence happens only after a deliberate user action, never during mount. */
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

  async function save(local: boolean) {
    if (!source || (local && !consent)) return;
    const currentVersion = version;
    setBusy(true); setNotice(""); setError("");
    try {
      const text = await exportWorkspaceBackup(source);
      if (local) {
        await saveLocalWorkspace(text);
        onSaved(currentVersion);
        setNotice(copy.savedLocalNotice);
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
    setBusy(true); setError(""); setCandidate(null); setConsent(false);
    try {
      await deleteLocalWorkspace(); onDeleted();
      setNotice(copy.deletedNotice);
    } catch { setError(copy.deleteError); }
    finally { setBusy(false); }
  }

  // R1-2: the whole panel lives in the top-bar「儲存」menu; R2: every visible string comes from labels. Testids are unchanged.
  const alias = candidate ? demoAlias(candidate.dataset.manifest.dataset_id) : false;
  return <details className="topbar-menu storage-menu workspace-storage" data-testid="workspace-storage">
    <summary>{labels.buttons.save} <span className={`tag ${source && dirty ? "unsaved" : ""}`}>{source ? dirty ? labels.status.unsaved : labels.status.savedVersion : labels.status.noWorkspace}</span></summary>
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
    <label className="local-save-consent"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} disabled={busy} />{copy.consent}</label>
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
  </details>;
}
