"use client";

import { markV3Save } from "@/application/whats-new";
import { useEffect, useId, useRef, useState, useSyncExternalStore, type ChangeEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { downloadText } from "@/application/download";
import { exportWorkspaceBackup, restoreWorkspaceBackup, MAX_WORKSPACE_BYTES, type RestoredWorkspace, type WorkspaceBackupSource } from "@/application/workspace-backup";
import { deleteLocalWorkspace, hasLocalWorkspace, loadLocalWorkspace, saveLocalWorkspace, type LocalWorkspaceInfo } from "@/application/local-store";
import { AUTO_SAVE_DELAY_MS, createAutoSaver, formatSavedDateTime, formatSavedTime, type AutoSaver } from "@/application/auto-save";
import { channelsLabel, demoAlias } from "@/application/copy";
import { fill, labels } from "@/i18n";
import { ShellIcon } from "./shell/shell-icon";

const copy = labels.ui.workspaceStorage;
const auto = labels.autoSave;
const groupCopy = labels.shell.topbarV3.storageGroups;

const subscribeNever = () => () => undefined;
/**
 * R6 修正：首次保存提示渲染在 <body> 最後（主內容與頁尾之後），鍵盤 Tab 順序排在頁面內容後面，不會擋在 h1 前。
 * 伺服器端與 hydration 當下不渲染（沒有 document），掛載後才出現。
 */
function BodyPortal({ children }: { children: ReactNode }) {
  const client = useSyncExternalStore(subscribeNever, () => true, () => false);
  return client ? createPortal(children, document.body) : null;
}

/** 在儲存選單勾選同意後的覆寫確認：open＝可以自動保存；checking＝正在查這台電腦有沒有副本；confirm＝已有副本，等使用者確認。 */
type ReplaceGate = "open" | "checking" | "confirm";

/**
 * Persistence happens only after consent, never during mount: an explicit save, or (R6-6, D7＝A) auto-save
 * after the user agreed in the first-use prompt or ticked the consent box. Restore still needs preview → confirm.
 * 本機保存同意（consent，Dashboard 保存）與自動保存開關（autoSaveEnabled，本元件）分開：同意時預設開啟自動保存，關閉後維持手動。
 */
export function WorkspaceStorage({ source, version, dirty, onRestore, onSaved, onDeleted, consent, onConsentChange, onClear }: {
  source: WorkspaceBackupSource | null;
  version: number;
  dirty: boolean;
  onRestore: (workspace: RestoredWorkspace, accepted?: () => void) => void;
  onSaved: (version: number) => void;
  onDeleted: () => void;
  /** R3：本機保存同意由 Dashboard 保存，匯入精靈的對照記憶也依此決定是否寫進 IndexedDB。 */
  consent: boolean;
  onConsentChange: (value: boolean) => void;
  /** V3-3（§6.3 #10）：v2 頂欄的「清空目前資料」搬到本選單的危險區；流程不變（Dashboard 的取代確認 dialog）。 */
  onClear?: () => void;
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
  /** 這台電腦上已有的工作區副本（首次提示與選單勾選同意時查詢）；null＝還沒查或查不到。 */
  const [existing, setExisting] = useState<LocalWorkspaceInfo | null>(null);
  const [lastSaved, setLastSaved] = useState<{ version: number; at: Date } | null>(null);
  const [autoError, setAutoError] = useState(false);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [gate, setGate] = useState<ReplaceGate>("open");
  /** 每次重設 gate 就 +1，讓還在查詢的副本檢查作廢。 */
  const gateTicket = useRef(0);
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
        await saveLocalWorkspace(await exportWorkspaceBackup(current)); markV3Save();
      },
      onSaved: (saved, at) => { setLastSaved({ version: saved, at }); setAutoError(false); latest.current.onSaved(saved); },
      onError: () => setAutoError(true),
    });
    saverRef.current = saver;
    return () => { saver.cancel(); if (saverRef.current === saver) saverRef.current = null; };
  }, []);
  const hasSource = source !== null;
  // 只有「已同意、自動保存開著、沒有待確認的覆寫」才排程；其他情況取消計時（進行中的寫入照常完成）。
  const autoActive = consent && autoSaveEnabled && gate === "open";
  useEffect(() => {
    const saver = saverRef.current;
    if (!saver) return;
    if (!autoActive || !hasSource || !dirty) { saver.cancel(); return; }
    saver.schedule(version);
  }, [autoActive, hasSource, dirty, version]);
  const promptOpen = hasSource && !consent && !answered;
  useEffect(() => {
    if (!promptOpen) return;
    let live = true;
    // 這台電腦已有保存的工作區時提醒「同意會改存成目前的」（保存時間不明也提醒）；沒有本機資料庫時不會建立。
    hasLocalWorkspace().then(value => { if (live) setExisting(value); }, () => undefined);
    return () => { live = false; };
  }, [promptOpen]);
  const promptRef = useRef<HTMLElement>(null);
  const summaryRef = useRef<HTMLElement>(null);
  /** 關閉對話框；焦點原本在對話框內時移到「儲存」選單（按鈕消失後焦點不會掉到頁首）。 */
  function closePrompt() {
    setAnswered(true);
    if (typeof document !== "undefined" && promptRef.current?.contains(document.activeElement)) summaryRef.current?.focus();
  }
  /** 不必（或不再）確認覆寫：開放自動保存，並讓還在查詢的副本檢查作廢。 */
  function openGate() {
    gateTicket.current += 1;
    setGate("open");
  }
  /** 立即保存目前這一版（同一版已存過就不重存）；之後的變更由上面的排程在 2 秒內保存。 */
  function saveNow() {
    saverRef.current?.schedule(version);
    void saverRef.current?.flush();
  }
  function acceptPrompt() {
    // 提示框已顯示「會改存成目前的工作區」的提醒，按「存在這台電腦」就是確認：同時開啟本機保存與自動保存，立即保存一次。
    closePrompt(); setConsent(true); setAutoSaveEnabled(true); openGate();
    saveNow();
  }
  function changeConsent(checked: boolean) {
    setAnswered(true); setConsent(checked); openGate();
    if (!checked) return;
    // 勾選同意＝預設開啟自動保存；這台電腦已有副本時先確認再開始自動覆寫（手動保存仍可），沒有副本就直接開始。
    setAutoSaveEnabled(true);
    const current = gateTicket.current;
    setGate("checking");
    hasLocalWorkspace().then(found => {
      if (gateTicket.current !== current) return;
      setExisting(found);
      setGate(found.exists ? "confirm" : "open");
    }, () => { if (gateTicket.current === current) setGate("open"); });
  }
  function confirmReplace() {
    openGate();
    if (source) saveNow();
  }

  async function save(local: boolean) {
    if (!source || (local && !consent)) return;
    const currentVersion = version;
    setBusy(true); setNotice(""); setError("");
    try {
      const text = await exportWorkspaceBackup(source);
      if (local) {
        await saveLocalWorkspace(text); markV3Save();
        onSaved(currentVersion);
        setLastSaved({ version: currentVersion, at: new Date() });
        // 手動保存＝已明確改存成目前的工作區，不必再確認覆寫。
        openGate();
        setNotice(autoSaveEnabled ? auto.savedLocalNotice : auto.savedLocalManualNotice);
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
    setBusy(true); setError(""); setCandidate(null); setConsent(false); setAnswered(true); openGate();
    // 先停掉排程並等進行中的自動保存寫完，避免刪除後又被寫回。
    const saver = saverRef.current;
    saver?.cancel();
    try {
      await saver?.whenIdle();
      await deleteLocalWorkspace(); onDeleted();
      setLastSaved(null); setExisting(null);
      setNotice(copy.deletedNotice);
    } catch { setError(copy.deleteError); }
    finally { setBusy(false); }
  }

  // R1-2: the whole panel lives in the top-bar「儲存」menu; R2: every visible string comes from labels. Testids are unchanged.
  const alias = candidate ? demoAlias(candidate.dataset.manifest.dataset_id) : false;
  // R6-6：已保存時顯示「已保存 hh:mm」（這一版由自動或手動存在這台電腦）；下載備份確認的版本沿用「此版本已保存」。
  const savedTag = !source ? labels.status.noWorkspace : dirty ? labels.status.unsaved : lastSaved && lastSaved.version === version ? fill(labels.status.savedAt, { time: formatSavedTime(lastSaved.at) }) : labels.status.savedVersion;
  const savedAtText = existing?.savedAt ? formatSavedDateTime(new Date(existing.savedAt)) : null;
  const promptWarning = existing?.exists ? savedAtText ? fill(auto.replaceWarning, { time: savedAtText }) : auto.replaceWarningUnknownTime : null;
  const replacePending = consent && autoSaveEnabled && gate === "confirm";
  const menuWarning = savedAtText ? fill(auto.menuReplaceWarning, { time: savedAtText }) : auto.menuReplaceWarningUnknownTime;
  const autoStatus = !consent || !autoSaveEnabled ? auto.statusOff : gate === "confirm" ? auto.statusPendingReplace : auto.statusOn;
  return <>
  <details className="topbar-menu storage-menu workspace-storage" data-testid="workspace-storage">
    <summary ref={summaryRef} className="topbar-summary">{labels.buttons.save}<ShellIcon name="chevron" size={16} className="chevron" /><span className={`tag save-state ${source && dirty ? "unsaved" : ""}`}>{savedTag}</span></summary>
    {/* V3-3（§6.3 #14）：依序分三段——本機保存／備份檔／危險區；控制、testid 與行為都和 v2 相同，只重排。 */}
    <div className="menu-panel ui-menu storage-panel">
    <p className="storage-intro">{copy.intro}</p>
    <section className="storage-group" aria-labelledby={`${promptId}-local`}>
      <h3 className="ui-menu-group" id={`${promptId}-local`}>{groupCopy.local}</h3>
      <label className="local-save-consent"><input type="checkbox" checked={consent} onChange={event => changeConsent(event.target.checked)} disabled={busy} />{copy.consent}</label>
      <p className="note consent-note">{auto.consentNote}</p>
      {consent && <label className="local-save-consent autosave-toggle"><input type="checkbox" data-testid="autosave-toggle" checked={autoSaveEnabled} onChange={event => setAutoSaveEnabled(event.target.checked)} disabled={busy} />{auto.toggle}</label>}
      {/* 這台電腦已有副本：確認前不自動覆寫。容器常駐，警告出現時由 polite live region 宣告。 */}
      <div className="autosave-replace" aria-live="polite">{replacePending && <>
        <p className="note" data-testid="autosave-replace-warning">{menuWarning}</p>
        <button type="button" className="button primary" data-testid="autosave-confirm-replace" disabled={busy} onClick={confirmReplace}>{auto.confirmReplace}</button>
      </>}</div>
      <p className="note autosave-status" data-testid="autosave-status">{autoStatus}{consent && lastSaved && <span> · {fill(auto.lastSaved, { time: formatSavedTime(lastSaved.at) })}</span>}</p>
      <div className="button-row">
        <button className="button primary" disabled={!source || !consent || busy} onClick={() => void save(true)}>{labels.buttons.saveLocal}</button>
        <button className="button quiet" disabled={busy} onClick={() => void loadLocal()}>{labels.buttons.restorePreview}</button>
      </div>
    </section>
    <section className="storage-group" aria-labelledby={`${promptId}-backup`}>
      <h3 className="ui-menu-group" id={`${promptId}-backup`}>{groupCopy.backup}</h3>
      <div className="button-row">
        <button className="button quiet" disabled={!source || busy} onClick={() => void save(false)}>{labels.buttons.downloadBackup}</button>
        <label className="backup-file-label">{copy.selectBackupFile}<input aria-label={copy.selectBackupFile} type="file" accept=".json,application/json" disabled={busy} onChange={event => void selectBackup(event)} /></label>
        {downloadVersion !== null && <button className="button quiet" onClick={() => { onSaved(downloadVersion); setDownloadVersion(null); setNotice(copy.downloadConfirmedNotice); }}>{copy.confirmDownloaded}</button>}
      </div>
      {candidate && <section className="restore-preview" aria-label={copy.restorePreviewAria}>
        <h3>{copy.restoreHeading}</h3>
        <p>{fill(copy.restoreSummary, { datasetId: candidate.dataset.manifest.dataset_id, asOf: candidate.snapshot.data_as_of, channels: channelsLabel(candidate.snapshot.report.scope.channels, alias) })}</p>
        <p>{fill(copy.restorePeriods, { prevStart: candidate.snapshot.report.previous.period.start, prevEnd: candidate.snapshot.report.previous.period.end, curStart: candidate.snapshot.report.current.period.start, curEnd: candidate.snapshot.report.current.period.end })}</p>
        <p>{fill(copy.restoreCounts, { plans: candidate.scenario_workspace.contexts.reduce((sum, context) => sum + context.plans.length, 0), actions: candidate.action_workspace.items.length })}</p>
        {dirty && <p className="alert partial">{copy.unsavedWarning}</p>}
        <div className="button-row"><button className="button primary" onClick={() => { onRestore(candidate, () => { setConsent(false); openGate(); setCandidate(null); setDownloadVersion(null); setNotice(copy.restoredNotice); }); }}>{copy.applyRestore}</button><button className="button quiet" onClick={() => setCandidate(null)}>{labels.buttons.cancel}</button></div>
      </section>}
      <details className="note"><summary>{labels.sections.technicalDetails}</summary><p>{copy.backupContents}</p></details>
    </section>
    {busy && <p aria-live="polite">{copy.busy}</p>}
    {notice && <p className="note" data-testid="storage-notice" aria-live="polite">{notice}</p>}
    {error && <p role="alert" className="alert error">{error}</p>}
    <section className="storage-group storage-danger" aria-labelledby={`${promptId}-danger`}>
      <h3 className="ui-menu-group" id={`${promptId}-danger`}>{groupCopy.danger}</h3>
      <div className="button-row">
        <button className="button quiet danger" disabled={busy} onClick={() => void removeLocal()}>{labels.buttons.deleteLocal}</button>
        {onClear && <button type="button" className="button quiet danger clear-button" onClick={onClear}>{labels.buttons.clear}</button>}
      </div>
    </section>
    </div>
  </details>
  {/* R6-6 首次同意對話框：非 modal（不蓋主內容、不鎖焦點、不自動 focus），在 details 外面，收合時仍看得到。
      R6 修正：portal 到 <body> 最後（Tab 順序在主內容之後），出現時由下方 live region 宣告；共享電腦提醒只放在這裡。 */}
  {promptOpen && <BodyPortal><section ref={promptRef} role="dialog" aria-labelledby={`${promptId}-title`} aria-describedby={promptWarning ? `${promptId}-body ${promptId}-replace` : `${promptId}-body`} className="local-save-prompt" data-testid="local-save-prompt" onKeyDown={event => { if (event.key === "Escape") closePrompt(); }}>
    <h2 id={`${promptId}-title`}>{auto.promptTitle}</h2>
    <p id={`${promptId}-body`}>{auto.promptBody}</p>
    {promptWarning && <p id={`${promptId}-replace`} className="note" data-testid="local-save-replace-warning">{promptWarning}</p>}
    <p className="note">{copy.caution}</p>
    <div className="button-row">
      <button type="button" className="button primary" onClick={acceptPrompt}>{auto.accept}</button>
      <button type="button" className="button quiet" onClick={closePrompt}>{auto.decline}</button>
    </div>
  </section></BodyPortal>}
  <p className="sr-only" role="status" aria-live="polite" data-testid="local-save-announce">{promptOpen ? auto.announce : ""}</p>
  {autoError && consent && autoSaveEnabled && hasSource && <div className="local-save-alert" data-testid="autosave-error">
    <p role="alert">{auto.failed}</p>
    <button type="button" className="button quiet" onClick={() => setAutoError(false)}>{auto.dismiss}</button>
  </div>}
  </>;
}
