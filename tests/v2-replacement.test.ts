import { describe, expect, it } from 'vitest';
import { beginReplacement, chooseReplacement, finishReplacementSave, confirmReplacementDownload, type ReplacementState } from '@/application/replacement-guard';

describe('A3 atomic replacement consent', () => {
  it.each(['dataset', 'import', 'restore', 'clear'] as const)('requires a deliberate choice for dirty %s', kind => {
    const state = beginReplacement(kind, 7, true);
    expect(state.stage).toBe('choice');
    expect(chooseReplacement(state, 'cancel', 7).stage).toBe('cancelled');
    expect(chooseReplacement(state, 'discard', 7).stage).toBe('ready');
    const saving = chooseReplacement(state, 'save', 7);
    expect(saving.stage).toBe('saving');
    expect(finishReplacementSave(saving, 'failed', 7).stage).toBe('choice');
    expect(finishReplacementSave(saving, 'local_saved', 7).stage).toBe('ready');
    expect(finishReplacementSave(saving, 'local_saved', 8).stage).toBe('invalidated');
    const downloaded = finishReplacementSave(saving, 'downloaded', 7);
    expect(downloaded.stage).toBe('download_confirmation');
    expect(confirmReplacementDownload(downloaded, 7).stage).toBe('ready');
    expect(confirmReplacementDownload(downloaded, 8).stage).toBe('invalidated');
  });
  it('a save failure never permits replacement', () => {
    const saving = chooseReplacement(beginReplacement('import', 2, true), 'save', 2);
    expect(finishReplacementSave(saving, 'failed', 2).stage).toBe('choice');
  });
  it('a download must be acknowledged, and cannot acknowledge another version', () => {
    const state = finishReplacementSave(chooseReplacement(beginReplacement('restore', 4, true), 'save', 4), 'downloaded', 4);
    expect(state.stage).toBe('download_confirmation');
    expect(confirmReplacementDownload(state, 5).stage).toBe('invalidated');
    expect(confirmReplacementDownload(state, 4).stage).toBe('ready');
  });
  it('local save completion cannot discard concurrent edits', () => {
    const state = chooseReplacement(beginReplacement('clear', 3, true), 'save', 3);
    expect(finishReplacementSave(state, 'local_saved', 4).stage).toBe('invalidated');
    expect(finishReplacementSave(state, 'local_saved', 3).stage).toBe('ready');
  });
  it('ready/cancelled intents cannot be reused as save completions', () => {
    const state: ReplacementState = chooseReplacement(beginReplacement('clear', 1, true), 'discard', 1);
    expect(() => finishReplacementSave(state, 'local_saved', 1)).toThrow('INVALID_REPLACEMENT_TRANSITION');
  });
  it('a clean workspace requires no discard prompt', () => {
    expect(beginReplacement('dataset', 1, false).stage).toBe('ready');
  });
});
