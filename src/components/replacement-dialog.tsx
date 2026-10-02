'use client';

import { useEffect, useRef, useState } from 'react';
import { beginReplacement, chooseReplacement, confirmReplacementDownload, finishReplacementSave, type ReplacementKind, type ReplacementState } from '@/application/replacement-guard';
import { exportWorkspaceBackup, type WorkspaceBackupSource } from '@/application/workspace-backup';
import { saveLocalWorkspace } from '@/application/local-store';
import { downloadText } from '@/application/download';

export interface PendingReplacement { kind: ReplacementKind; version: number; run: () => void | Promise<void> }
const descriptions: Record<ReplacementKind, string> = {
  dataset: '載入另一份示範／驗證資料，取代目前分析資料。舊方案與行動保留原始引用。',
  import: '套用已檢核的新 CSV，取代目前分析資料。舊方案與行動保留原始引用。',
  restore: '用備份完整取代目前資料、方案、行動與會議工作稿。',
  clear: '清空目前分頁的資料、方案、行動與會議工作稿；本機副本及已下載檔案仍保留。',
};
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
    if (next.stage === 'invalidated') setError('工作區在確認期間已變更，尚未替換。請取消後重新檢查。');
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
      if (local) await saveLocalWorkspace(data);
      else downloadText(data, 'profitlens-workspace.json', 'application/json;charset=utf-8');
      if (!live.current) return;
      const next = finishReplacementSave(pending, local ? 'local_saved' : 'downloaded', currentVersion());
      if (next.stage === 'ready') onSaved(intent.version);
      apply(next);
    } catch {
      if (!live.current) return;
      apply(finishReplacementSave(pending, 'failed', currentVersion()));
      setError('儲存未完成，沒有替換目前工作區。請重試、改下載備份，或取消。');
    }
  }
  const busy = state.stage === 'saving';
  return <dialog ref={ref} className="evidence-dialog clear-workspace-dialog" aria-labelledby="replacement-heading" onCancel={event => { event.preventDefault(); if (!busy) onCancel(); }}>
    <div className="evidence-body">
      <h2 id="replacement-heading">替換前先儲存工作區</h2>
      <p>本次修改尚未儲存。{descriptions[intent.kind]}</p>
      <p className="note">完整備份包含已套用資料及工作稿；未套用的匯入／日期草稿不包含在備份，取消可繼續編輯。</p>
      <div className="button-row">
        <button className="button primary" autoFocus disabled={!source || busy || state.stage === 'invalidated'} onClick={() => setSavingOptions(true)}>先儲存</button>
        <button className="button quiet" disabled={busy || state.stage === 'invalidated'} onClick={() => apply(chooseReplacement(state, 'discard', currentVersion()))}>不儲存並繼續</button>
        <button className="button quiet" disabled={busy} onClick={onCancel}>取消</button>
      </div>
      {savingOptions && <section aria-label="替換前儲存選項">
        <p>下載後須確認檔案已保存；儲存在瀏覽器須另行同意，不是雲端備份。</p>
        <button className="button quiet" disabled={busy || state.stage === 'invalidated'} onClick={() => void save(false)}>下載備份</button>
        <label className="local-save-consent"><input type="checkbox" checked={consent} disabled={busy} onChange={e => setConsent(e.target.checked)} />我同意將本次工作區儲存在這個瀏覽器</label>
        <button className="button primary" disabled={!consent || busy || state.stage === 'invalidated'} onClick={() => void save(true)}>儲存本機副本並繼續</button>
      </section>}
      {state.stage === 'download_confirmation' && <button className="button primary" onClick={() => { const next = confirmReplacementDownload(state, currentVersion()); if (next.stage === 'ready') onSaved(intent.version); apply(next); }}>已確認備份已保存並繼續</button>}
      {busy && <p role="status">正在儲存，尚未替換資料…</p>}
      {error && <p role="alert">{error}</p>}
    </div>
  </dialog>;
}
