'use client';

import { markV3Save } from "@/application/whats-new";
import { useEffect, useRef, useState } from 'react';
import { beginReplacement, chooseReplacement, confirmReplacementDownload, finishReplacementSave, type ReplacementKind, type ReplacementState } from '@/application/replacement-guard';
import { exportWorkspaceBackup, type WorkspaceBackupSource } from '@/application/workspace-backup';
import { saveLocalWorkspace } from '@/application/local-store';
import { downloadText } from '@/application/download';
import { fill, labels } from '@/i18n';

export interface PendingReplacement { kind: ReplacementKind; version: number; run: () => void | Promise<void> }
const ui = labels.ui.replacementDialog;
const descriptions: Record<ReplacementKind, string> = ui.descriptions;
export function ReplacementDialog({ intent, source, currentVersion, onSaved, onCancel, onProceed }: {
  intent: PendingReplacement; source: WorkspaceBackupSource | null; currentVersion: () => number;
  onSaved: (version: number) => void; onCancel: () => void; onProceed: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const [state, setState] = useState<ReplacementState>(() => beginReplacement(intent.kind, intent.version, true));
  const [savingOptions, setSavingOptions] = useState(false);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState('');
  const live = useRef(true);
  useEffect(() => {
    live.current = true;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = ref.current; dialog?.showModal();
    return () => { live.current = false; dialog?.close(); opener?.focus(); };
  }, []);
  function apply(next: ReplacementState) {
    setState(next);
    if (next.stage === 'ready') onProceed();
    if (next.stage === 'invalidated') setError(ui.errors.invalidated);
  }
  async function save(local: boolean) {
    if (!source || (local && !consent)) return;
    const pending = chooseReplacement(state, 'save', currentVersion());
    apply(pending);
    if (pending.stage !== 'saving') return;
    setError('');
    try {
      const data = await exportWorkspaceBackup(source);
      if (!live.current) return;
      if (local) { await saveLocalWorkspace(data); markV3Save(); }
      else downloadText(data, 'profitlens-workspace.json', 'application/json;charset=utf-8');
      if (!live.current) return;
      const next = finishReplacementSave(pending, local ? 'local_saved' : 'downloaded', currentVersion());
      if (next.stage === 'ready') onSaved(intent.version);
      apply(next);
    } catch {
      if (!live.current) return;
      apply(finishReplacementSave(pending, 'failed', currentVersion()));
      setError(ui.errors.saveFailed);
    }
  }
  const busy = state.stage === 'saving';
  return <dialog ref={ref} className="evidence-dialog clear-workspace-dialog" aria-labelledby="replacement-heading" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div className="evidence-body">
      <h2 id="replacement-heading">{ui.heading}</h2>
      <p>{fill(ui.unsavedIntro, { description: descriptions[intent.kind] })}</p>
      <details><summary>{labels.sections.technicalDetails}</summary><p className="note">{ui.backupScopeNote}</p></details>
      <div className="button-row">
        <button className="button primary" autoFocus disabled={!source || busy || state.stage === 'invalidated'} onClick={() => setSavingOptions(true)}>{ui.saveFirst}</button>
        <button className="button quiet" disabled={busy || state.stage === 'invalidated'} onClick={() => apply(chooseReplacement(state, 'discard', currentVersion()))}>{ui.discardAndContinue}</button>
        <button className="button quiet" disabled={busy} onClick={onCancel}>{labels.buttons.cancel}</button>
      </div>
      {savingOptions && <section aria-label={ui.saveOptionsAria}>
        <p>{ui.saveOptionsCaution}</p>
        <button className="button quiet" disabled={busy || state.stage === 'invalidated'} onClick={() => void save(false)}>{labels.buttons.downloadBackup}</button>
        <label className="local-save-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />{ui.localConsent}</label>
        <button className="button primary" disabled={!consent || busy || state.stage === 'invalidated'} onClick={() => void save(true)}>{ui.saveLocalAndContinue}</button>
      </section>}
      {state.stage === 'download_confirmation' && <button className="button primary" onClick={() => { const next = confirmReplacementDownload(state, currentVersion()); if (next.stage === 'ready') onSaved(intent.version); apply(next); }}>{ui.confirmDownloadedAndContinue}</button>}
      {busy && <p role="status">{ui.saving}</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </dialog>;
}
