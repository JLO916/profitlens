import { describe, expect, it } from 'vitest';
import { fixture } from './helpers/fixtures';
import { validateDataset } from '@/domain/validation';
import { createSnapshot, hashInput } from '@/application/workspace';
import { addActionDraft, actionDocuments, confirmBoundAction, contextFor, editActionManagement, editBoundAction, emptyActionWorkspace, normalizeActionWorkspace, previewActionRebind, commitActionRebind, refreshActionWorkspace, removeBoundAction, type ActionSource } from '@/application/action-workspace';

async function source(change = '', revision = 1, channels = ['DTC']): Promise<ActionSource> {
  const input = fixture();
  if (change === 'ads') input.files['ad_spend_daily.csv'] = String(input.files['ad_spend_daily.csv']).replace('2026-08-02,DTC,270.00', '2026-08-02,DTC,370.00');
  if (change === 'null') input.files['channel_costs_daily.csv'] = String(input.files['channel_costs_daily.csv']).split('\n').filter(line => !line.startsWith('2026-08-02,DTC,')).join('\n');
  const dataset = validateDataset(input).dataset!;
  return { input, dataset, revision, snapshot: await createSnapshot(dataset, { channels }, await hashInput(input)) };
}
async function confirmed() {
  const s = await source(); let w = addActionDraft(emptyActionWorkspace(), s, 'A');
  const fact = w.contexts[0].session.facts.find(f => f.metric === 'contribution_after_marketing' && f.scope.kind === 'channel' && f.period.start === '2026-08-02')!;
  w = editBoundAction(w, 'A', { fact_ids: [fact.id] }); w = confirmBoundAction(w, 'A');
  return { w, s, fact };
}
describe('v2 A1 independent actions and immutable evidence binding', () => {
  it('switching view leaves original evidence confirmed and management editable', async () => {
    const { w, s } = await confirmed(); const other = await source('', 2, ['MARKETPLACE']);
    const changed = refreshActionWorkspace(w, other.snapshot, 2);
    expect(changed.contexts).toEqual(w.contexts);
    const edited = editBoundAction(changed, 'A', { owner_role: '物流', deadline: '2026-11-01', problem: '核對原始引用' });
    expect(edited.items[0].card.evidence_confirmed).toBe(true);
    expect(actionDocuments(edited)[0].binding.dataset_hash).toBe(s.snapshot.dataset_hash);
    expect(actionDocuments(edited)[0].status).toBe('confirmed');
  });
  it('execution state and progress do not assert business effects or revoke evidence', async () => {
    const { w } = await confirmed();
    for (const execution_status of ['not_started', 'in_progress', 'blocked', 'completed'] as const) {
      const next = editActionManagement(w, 'A', { execution_status, progress_notes: '=HYPERLINK(1)' });
      expect(actionDocuments(next)[0]).toMatchObject({ execution_status, progress_notes: '=HYPERLINK(1)', evidence_confirmed: true });
    }
    expect(() => editActionManagement(w, 'A', { progress_notes: 'x'.repeat(2001) })).toThrow('INVALID_ACTION_FIELD');
    expect(() => editActionManagement(w, 'A', { execution_status: 'invented' as never })).toThrow('INVALID_ACTION_FIELD');
  });
  it('data replacement retains original references, never same-ID auto-replacement', async () => {
    const { w, fact } = await confirmed(); const target = await source('ads', 2);
    const changed = refreshActionWorkspace(w, target.snapshot, 2);
    expect(actionDocuments(changed)[0]).toMatchObject({ status: 'confirmed', evidence_relation: 'historical' });
    expect(actionDocuments(changed)[0].evidence[0]).toEqual(fact);
    expect(editBoundAction(changed, 'A', { owner_role: '新負責人' }).items[0].card.evidence_confirmed).toBe(true);
  });
  it('legacy stale cannot revive from navigation or normalization; explicit old-evidence review works', async () => {
    const { w, s } = await confirmed(); w.contexts[0].session.stale = true; delete w.items[0].legacy_review_required;
    const migrated = normalizeActionWorkspace(w);
    expect(actionDocuments(migrated)[0].status).toBe('stale');
    expect(actionDocuments(refreshActionWorkspace(migrated, s.snapshot, 99))[0].status).toBe('stale');
    expect(editActionManagement(migrated, 'A', { execution_status: 'blocked' }).items[0].card.evidence_confirmed).toBe(true);
    expect(actionDocuments(confirmBoundAction(migrated, 'A'))[0].status).toBe('confirmed');
  });
  it('data limitations stay separate from editable required data', async () => {
    const s = await source(); const diagnostic = s.snapshot.report.diagnostics[0];
    const w = addActionDraft(emptyActionWorkspace(), s, 'A', diagnostic.id);
    expect(w.items[0].card.required_data).toBe('');
    expect(actionDocuments(w)[0].data_limitations).toEqual(diagnostic.limitations);
  });
  it('detaches retained source bytes and facts from mutable inputs', async () => {
    const s = await source(); const w = addActionDraft(emptyActionWorkspace(), s, 'A'); const original = structuredClone(w);
    s.input.files['sales_daily.csv'] = 'changed'; s.snapshot.report.facts[0].value = '999.00';
    expect(w).toEqual(original);
  });
  it('rebind previews same-ID different values and commits only explicit consent, retaining old binding', async () => {
    const { w, fact } = await confirmed(); const target = await source('ads', 2); const before = structuredClone(w);
    const preview = await previewActionRebind(w, 'A', target);
    expect(preview.facts[0].before.id).toBe(preview.facts[0].after.id);
    expect(preview.facts[0].before.value).toBe('270.00'); expect(preview.facts[0].after.value).toBe('170.00');
    expect(w).toEqual(before);
    await expect(commitActionRebind(w, 'A', preview, target, false)).rejects.toThrow('ACTION_REBIND_CONSENT_REQUIRED');
    const next = await commitActionRebind(w, 'A', preview, target, true);
    expect(actionDocuments(next)[0].evidence[0].value).toBe('170.00');
    expect(actionDocuments(next)[0].binding_history.at(-1)!.evidence[0]).toEqual(fact);
    expect(next.items[0].binding_revision).toBe(w.items[0].binding_revision! + 1); expect(next.items[0].binding_history).toHaveLength(w.items[0].binding_history!.length + 1);
    expect(actionDocuments(next)[0].evidence_confirmed).toBe(true);
  });
  it('null stays null with reasons in preview and confirmed rebind', async () => {
    const { w } = await confirmed(); const target = await source('null', 2); const preview = await previewActionRebind(w, 'A', target);
    expect(preview.facts[0].after.value).toBeNull(); expect(preview.facts[0].after.reason_codes.length).toBeGreaterThan(0);
    expect(actionDocuments(await commitActionRebind(w, 'A', preview, target, true))[0].evidence[0].value).toBeNull();
  });
  it('recomputes original scope despite target current view and refuses changed source or tampered preview', async () => {
    const { w } = await confirmed(); const target = await source('ads', 2, ['MARKETPLACE']); const preview = await previewActionRebind(w, 'A', target);
    expect(preview.target_context.session.scope.channels).toEqual(['DTC']);
    await expect(commitActionRebind(w, 'A', preview, await source('null', 3), true)).rejects.toThrow('ACTION_REBIND_PREVIEW_STALE');
    await expect(commitActionRebind(w, 'A', preview, { ...target, revision: 3 }, true)).rejects.toThrow('ACTION_REBIND_PREVIEW_STALE');
    const tampered = structuredClone(preview); tampered.facts[0].after.value = '999.00';
    await expect(commitActionRebind(w, 'A', tampered, target, true)).rejects.toThrow('ACTION_REBIND_PREVIEW_STALE');
  });
  it('changed active evidence invalidates preview; repeated rebind preserves every original context', async () => {
    const { w, s } = await confirmed(); const target = await source('ads', 2); const preview = await previewActionRebind(w, 'A', target);
    const edited = editBoundAction(w, 'A', { fact_ids: [] });
    await expect(commitActionRebind(edited, 'A', preview, target, true)).rejects.toThrow('ACTION_REBIND_PREVIEW_STALE');
    const next = await commitActionRebind(w, 'A', preview, target, true);
    const back = { ...s, revision: 3 }; const previewBack = await previewActionRebind(next, 'A', back);
    const rebound = await commitActionRebind(next, 'A', previewBack, back, true);
    expect(actionDocuments(rebound)[0].binding_history.flatMap(h => h.evidence.map(fact => fact.value))).toEqual(['270.00', '170.00']);
    expect(rebound.contexts).toHaveLength(3);
    expect(contextFor(rebound, rebound.items[0]).session.scope).toEqual(w.contexts[0].session.scope);
    expect(removeBoundAction(rebound, 'A').contexts).toHaveLength(0);
  });
  it('explicit same-version review can rebind legacy evidence without changing the stored context', async () => {
    const { w, s } = await confirmed(); w.contexts[0].session.stale = true; delete w.items[0].legacy_review_required;
    const oldContext = structuredClone(w.contexts[0]);
    const preview = await previewActionRebind(w, 'A', s);
    const next = await commitActionRebind(w, 'A', preview, s, true);
    expect(actionDocuments(next)[0].status).toBe('confirmed');
    expect(next.contexts[0]).toEqual(oldContext);
    expect(next.items[0].binding_history!.at(-1)!.legacy_review_required).toBe(true);
  });
  it('requires matching original periods and rejects forged history at export', async () => {
    const { w } = await confirmed(); const target = await source('ads', 2);
    const wrong = structuredClone(target); wrong.input.manifest = { ...(wrong.input.manifest as object), coverage_start: '2026-08-02' };
    await expect(previewActionRebind(w, 'A', wrong)).rejects.toThrow();
    const next = await commitActionRebind(w, 'A', await previewActionRebind(w, 'A', target), target, true);
    next.items[0].binding_history!.at(-1)!.fact_ids = ['made-up'];
    expect(() => actionDocuments(next)).toThrow('UNKNOWN_FACT_ID');
  });
});
