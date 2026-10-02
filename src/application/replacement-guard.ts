/** Explicit consent is bound to the exact in-memory version shown to the user. */
export type ReplacementKind = 'dataset' | 'import' | 'restore' | 'clear';
export interface ReplacementState {
  kind: ReplacementKind;
  version: number;
  stage: 'choice' | 'saving' | 'download_confirmation' | 'ready' | 'cancelled' | 'invalidated';
}
export function beginReplacement(kind: ReplacementKind, version: number, dirty: boolean): ReplacementState {
  if (!Number.isSafeInteger(version) || version < 0) throw new Error('INVALID_REPLACEMENT_VERSION');
  return { kind, version, stage: dirty ? 'choice' : 'ready' };
}
export function chooseReplacement(state: ReplacementState, choice: 'save' | 'discard' | 'cancel', currentVersion: number): ReplacementState {
  if (state.stage !== 'choice' && state.stage !== 'download_confirmation') throw new Error('INVALID_REPLACEMENT_TRANSITION');
  if (choice === 'cancel') return { ...state, stage: 'cancelled' };
  if (currentVersion !== state.version) return { ...state, stage: 'invalidated' };
  return { ...state, stage: choice === 'save' ? 'saving' : 'ready' };
}
export function finishReplacementSave(state: ReplacementState, result: 'failed' | 'downloaded' | 'local_saved', currentVersion: number): ReplacementState {
  if (state.stage !== 'saving') throw new Error('INVALID_REPLACEMENT_TRANSITION');
  if (currentVersion !== state.version) return { ...state, stage: 'invalidated' };
  return { ...state, stage: result === 'failed' ? 'choice' : result === 'downloaded' ? 'download_confirmation' : 'ready' };
}
export function confirmReplacementDownload(state: ReplacementState, currentVersion: number): ReplacementState {
  if (state.stage !== 'download_confirmation') throw new Error('INVALID_REPLACEMENT_TRANSITION');
  return { ...state, stage: currentVersion === state.version ? 'ready' : 'invalidated' };
}
