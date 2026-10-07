import { afterEach, describe, expect, it, vi } from 'vitest';
import { fixture } from './helpers/fixtures';
import { validateDataset } from '@/domain/validation';
import { createSnapshot, hashInput } from '@/application/workspace';
import { createDecisionSession, decisionSignature, emptyDecisionWorkspace } from '@/application/decision';
import { exportDecisionCsv, exportDecisionJson } from '@/application/decision-export';
import { csvHeaderKey } from '@/application/copy';
import { formatDateL1 } from '@/application/presentation';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ActionsWorkbench } from '@/components/actions-workbench';
import { fill, labels } from '@/i18n';
import { exportWorkspaceBackup, restoreWorkspaceBackup } from '@/application/workspace-backup';
import { actionDocuments, addActionDraft, boardColumns, editActionManagement, editBoundAction, emptyActionWorkspace, filterEvidenceChoices, knownOwners, normalizeActionWorkspace, pinAction, taipeiToday, toggleEvidenceId, type ActionSource, type ActionWorkspace } from '@/application/action-workspace';

async function source(): Promise<ActionSource> {
  const input = fixture(); const dataset = validateDataset(input).dataset!;
  return { input, dataset, revision: 1, snapshot: await createSnapshot(dataset, { channels: ['DTC'] }, await hashInput(input)) };
}
async function drafts(ids: string[]): Promise<{ s: ActionSource; w: ActionWorkspace }> {
  const s = await source(); let w = emptyActionWorkspace();
  for (const id of ids) w = addActionDraft(w, s, id);
  return { s, w };
}
async function sign(envelope: Record<string, unknown>): Promise<string> {
  const { checksum: ignored, ...body } = envelope; void ignored;
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(decisionSignature(body)));
  return JSON.stringify({ ...body, checksum: Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('') });
}
/** Quote-aware CSV reader keyed by the english header key, so assertions read real cells. */
function records(text: string): Record<string, string>[] {
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  const value = text.replace(/^﻿/, '');
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (character === '"') { if (quoted && value[index + 1] === '"') { cell += '"'; index++; } else quoted = !quoted; }
    else if (character === ',' && !quoted) { row.push(cell); cell = ''; }
    else if (!quoted && (character === '\r' || character === '\n')) { if (character === '\r' && value[index + 1] === '\n') index++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += character;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const headers = rows.shift()!.map(csvHeaderKey);
  return rows.map(values => Object.fromEntries(headers.map((key, index) => [key, values[index]])));
}
afterEach(() => { vi.useRealTimers(); });

describe('R5-5 editActionManagement writes status_updated_at only when the status changes', () => {
  it('a fresh draft has no status date, and normalization never invents one', async () => {
    const { w } = await drafts(['A']);
    expect(w.items[0].execution_status).toBe('not_started');
    expect(w.items[0].status_updated_at).toBeUndefined();
    expect('status_updated_at' in normalizeActionWorkspace(w).items[0]).toBe(false);
    expect(actionDocuments(w)[0].status_updated_at).toBeNull();
  });
  it('changing the status records the given day; the rest of the action is untouched', async () => {
    const { w } = await drafts(['A']);
    const next = editActionManagement(w, 'A', { execution_status: 'in_progress' }, '2026-10-03');
    expect(next.items[0]).toMatchObject({ execution_status: 'in_progress', status_updated_at: '2026-10-03' });
    expect(next.items[0].card).toEqual(w.items[0].card);
    expect(w.items[0].status_updated_at).toBeUndefined();
    expect(actionDocuments(next)[0]).toMatchObject({ execution_status: 'in_progress', status_updated_at: '2026-10-03' });
  });
  it('setting the same status, or only editing progress notes, keeps the earlier date', async () => {
    const { w } = await drafts(['A']);
    // Normalized default is not_started, so selecting not_started again is not a change.
    expect(editActionManagement(w, 'A', { execution_status: 'not_started' }, '2026-10-03').items[0].status_updated_at).toBeUndefined();
    const moved = editActionManagement(w, 'A', { execution_status: 'blocked' }, '2026-10-01');
    expect(editActionManagement(moved, 'A', { execution_status: 'blocked' }, '2026-10-05').items[0].status_updated_at).toBe('2026-10-01');
    expect(editActionManagement(moved, 'A', { progress_notes: '等供應商報價' }, '2026-10-05').items[0].status_updated_at).toBe('2026-10-01');
    const again = editActionManagement(moved, 'A', { execution_status: 'completed' }, '2026-10-05');
    expect(again.items[0]).toMatchObject({ execution_status: 'completed', status_updated_at: '2026-10-05' });
  });
  it('a status move and progress note in one patch still records the day', async () => {
    const { w } = await drafts(['A']);
    const next = editActionManagement(w, 'A', { execution_status: 'completed', progress_notes: '已完成' }, '2026-12-31');
    expect(next.items[0]).toMatchObject({ execution_status: 'completed', progress_notes: '已完成', status_updated_at: '2026-12-31' });
  });
  it('defaults the day to the Asia/Taipei calendar date of the clock (not UTC)', async () => {
    const { w } = await drafts(['A']);
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-03T23:30:00.000Z'));
    // UTC 10/03 23:30 = 臺北 10/04 07:30。
    expect(editActionManagement(w, 'A', { execution_status: 'in_progress' }).items[0].status_updated_at).toBe('2026-10-04');
  });
  it('switches day exactly at Taipei midnight (UTC 16:00), including month and year ends', async () => {
    const { w } = await drafts(['A']);
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-03T15:59:59.999Z'));
    expect(editActionManagement(w, 'A', { execution_status: 'blocked' }).items[0].status_updated_at).toBe('2026-10-03');
    vi.setSystemTime(new Date('2026-10-03T16:00:00.000Z'));
    expect(editActionManagement(w, 'A', { execution_status: 'blocked' }).items[0].status_updated_at).toBe('2026-10-04');
    expect(taipeiToday(new Date('2026-10-31T16:00:00.000Z'))).toBe('2026-11-01');
    expect(taipeiToday(new Date('2026-12-31T15:59:59.999Z'))).toBe('2026-12-31');
    expect(taipeiToday(new Date('2026-12-31T16:00:00.000Z'))).toBe('2027-01-01');
    expect(taipeiToday(new Date('2028-02-28T16:30:00.000Z'))).toBe('2028-02-29');
  });
  it.each(['', '2026-13-01', '2026-02-30', '2026/10/03', '20261003', '2026-10-3'])('rejects an invalid status day %j with INVALID_ACTION_FIELD', async (day) => {
    const { w } = await drafts(['A']);
    expect(() => editActionManagement(w, 'A', { execution_status: 'in_progress' }, day)).toThrow('INVALID_ACTION_FIELD');
  });
  it('an invalid day is ignored when nothing changes (no write happens)', async () => {
    const { w } = await drafts(['A']);
    expect(editActionManagement(w, 'A', { progress_notes: '只改紀錄' }, 'not-a-date').items[0].status_updated_at).toBeUndefined();
  });
  it('status_updated_at is not a patchable field', async () => {
    const { w } = await drafts(['A']);
    expect(() => editActionManagement(w, 'A', { status_updated_at: '2026-10-03' } as never, '2026-10-03')).toThrow('INVALID_ACTION_FIELD');
  });
  it('actionDocuments rejects a tampered status day (leap-year aware)', async () => {
    const { w } = await drafts(['A']);
    const tampered = { ...w, items: [{ ...w.items[0], status_updated_at: '2026-02-29' }] };
    expect(() => actionDocuments(tampered)).toThrow('INVALID_ACTION_FIELD');
    const leap = { ...w, items: [{ ...w.items[0], status_updated_at: '2028-02-29' }] };
    expect(actionDocuments(leap)[0].status_updated_at).toBe('2028-02-29');
  });
});

describe('R5 addActionDraft overrides (health-check copy on the card)', () => {
  it('without overrides the card keeps the diagnostic title and recommendation', async () => {
    const s = await source(); const diagnostic = s.snapshot.report.diagnostics[0];
    expect(diagnostic.title).not.toBe(''); expect(diagnostic.recommendation).not.toBe('');
    const card = addActionDraft(emptyActionWorkspace(), s, 'A', diagnostic.id).items[0].card;
    expect(card).toMatchObject({ problem: diagnostic.title, action: diagnostic.recommendation, fact_ids: diagnostic.fact_ids });
  });
  it('overrides replace problem and/or action only; evidence, scope and diagnostic binding are unchanged', async () => {
    const s = await source(); const diagnostic = s.snapshot.report.diagnostics[0];
    const plain = addActionDraft(emptyActionWorkspace(), s, 'A', diagnostic.id).items[0];
    const both = addActionDraft(emptyActionWorkspace(), s, 'A', diagnostic.id, { problem: '健檢列標題', action: '健檢列下一步' }).items[0];
    expect(both.card).toEqual({ ...plain.card, problem: '健檢列標題', action: '健檢列下一步' });
    expect(both).toMatchObject({ diagnostic_id: diagnostic.id, scope: plain.scope, execution_status: 'not_started' });
    const problemOnly = addActionDraft(emptyActionWorkspace(), s, 'A', diagnostic.id, { problem: '只換標題' }).items[0].card;
    expect(problemOnly).toMatchObject({ problem: '只換標題', action: diagnostic.recommendation });
    const actionOnly = addActionDraft(emptyActionWorkspace(), s, 'A', diagnostic.id, { action: '只換下一步' }).items[0].card;
    expect(actionOnly).toMatchObject({ problem: diagnostic.title, action: '只換下一步' });
    // 手動新增（沒有 diagnostic）也可帶 overrides；沒帶就是空白。
    expect(addActionDraft(emptyActionWorkspace(), s, 'B', undefined, { problem: '手動' }).items[0].card).toMatchObject({ problem: '手動', action: '', fact_ids: [] });
  });
});

describe('R5-5 knownOwners', () => {
  it('is empty for an empty workspace or when nobody has an owner', async () => {
    expect(knownOwners(emptyActionWorkspace())).toEqual([]);
    const { w } = await drafts(['A', 'B']);
    expect(knownOwners(editBoundAction(w, 'A', { owner_role: '   ' }))).toEqual([]);
  });
  it('trims, drops blanks, de-duplicates, and lists later actions first', async () => {
    const { w: base } = await drafts(['A', 'B', 'C', 'D', 'E']);
    let w = base;
    // Items A..E owners: 營運, " 行銷 ", "", 營運, 財務 → reversed: 財務, 營運, (blank), 行銷, 營運.
    for (const [id, owner] of [['A', '營運'], ['B', ' 行銷 '], ['C', ''], ['D', '營運'], ['E', '財務']] as const) w = editBoundAction(w, id, { owner_role: owner });
    expect(knownOwners(w)).toEqual(['財務', '營運', '行銷']);
  });
  it('follows the workspace order, so a pinned (moved-to-front) action counts as older', async () => {
    const { w: base } = await drafts(['A', 'B']);
    let w = editBoundAction(editBoundAction(base, 'A', { owner_role: '客服' }), 'B', { owner_role: '物流' });
    expect(knownOwners(w)).toEqual(['物流', '客服']);
    w = pinAction(w, 'B', true); // order becomes B, A
    expect(knownOwners(w)).toEqual(['客服', '物流']);
  });
  it('treats case and inner spacing as distinct names (only outer whitespace is trimmed)', async () => {
    const { w: base } = await drafts(['A', 'B', 'C']);
    let w = base;
    for (const [id, owner] of [['A', 'Ops'], ['B', 'ops'], ['C', 'O ps']] as const) w = editBoundAction(w, id, { owner_role: owner });
    expect(knownOwners(w)).toEqual(['O ps', 'ops', 'Ops']);
  });
});

describe('R5-5 boardColumns', () => {
  it('always returns the four columns, empty for an empty workspace', () => {
    expect(boardColumns(emptyActionWorkspace())).toEqual({ not_started: [], in_progress: [], blocked: [], completed: [] });
  });
  it('groups by execution status, keeps workspace order inside a column, pinned first', async () => {
    const { w: base } = await drafts(['1', '2', '3', '4', '5']);
    let w = base;
    w = editActionManagement(w, '2', { execution_status: 'in_progress' }, '2026-10-01');
    w = editActionManagement(w, '3', { execution_status: 'blocked' }, '2026-10-01');
    w = editActionManagement(w, '5', { execution_status: 'in_progress' }, '2026-10-02');
    w = pinAction(w, '5', true); // order: 5, 1, 2, 3, 4
    const columns = boardColumns(w);
    const ids = (status: keyof typeof columns) => columns[status].map(item => item.card.id);
    expect(ids('not_started')).toEqual(['1', '4']);
    expect(ids('in_progress')).toEqual(['5', '2']);
    expect(ids('blocked')).toEqual(['3']);
    expect(ids('completed')).toEqual([]);
    expect(Object.values(columns).flat()).toHaveLength(5);
    expect(columns.in_progress[0]).toBe(w.items[0]);
  });
  it('treats a legacy item without a status as not started', async () => {
    const { w } = await drafts(['A']);
    const legacy = { ...w, items: [{ ...w.items[0], execution_status: undefined }] };
    expect(boardColumns(legacy).not_started.map(item => item.card.id)).toEqual(['A']);
  });
  it('never drops an item with an unrecognised status (it falls back to not started)', async () => {
    const { w } = await drafts(['A', 'B']);
    const odd = { ...w, items: [{ ...w.items[0], execution_status: 'invented' as never }, w.items[1]] };
    const columns = boardColumns(odd);
    expect(columns.not_started.map(item => item.card.id)).toEqual(['A', 'B']);
    expect(Object.keys(columns)).toEqual(['not_started', 'in_progress', 'blocked', 'completed']);
  });
});

describe('R5-5 evidence checklist helpers', () => {
  const order = ['f1', 'f2', 'f3', 'f4'];
  it('toggleEvidenceId adds in the choice order and removes without reordering the rest', () => {
    expect(toggleEvidenceId([], 'f3', true, order)).toEqual(['f3']);
    expect(toggleEvidenceId(['f3'], 'f1', true, order)).toEqual(['f1', 'f3']);
    expect(toggleEvidenceId(['f1', 'f3', 'f4'], 'f3', false, order)).toEqual(['f1', 'f4']);
    expect(toggleEvidenceId(['f4', 'f1'], 'f2', true, order)).toEqual(['f1', 'f2', 'f4']);
  });
  it('toggleEvidenceId is idempotent and keeps unknown ids after known ones', () => {
    expect(toggleEvidenceId(['f2'], 'f2', true, order)).toEqual(['f2']);
    expect(toggleEvidenceId(['f2'], 'f3', false, order)).toEqual(['f2']);
    expect(toggleEvidenceId(['f2', 'f2'], 'f1', true, order)).toEqual(['f1', 'f2']);
    expect(toggleEvidenceId(['x', 'f2'], 'f1', true, order)).toEqual(['f1', 'f2', 'x']);
    expect(toggleEvidenceId([], 'f9', true, [])).toEqual(['f9']);
  });
  const choices = [{ id: 'f1', text: '2026-08-02 · 商品淨營收 · DTC' }, { id: 'f2', text: '2026-08-02 · Ad Spend · DTC' }, { id: 'f3', text: '2026-09-01 · 商品淨營收 · MARKETPLACE' }];
  const text = (choice: { text: string }) => choice.text;
  it('filterEvidenceChoices shows everything for a blank query', () => {
    expect(filterEvidenceChoices(choices, [], '', text).map(c => c.id)).toEqual(['f1', 'f2', 'f3']);
    expect(filterEvidenceChoices(choices, [], '   ', text).map(c => c.id)).toEqual(['f1', 'f2', 'f3']);
  });
  it('filterEvidenceChoices matches case-insensitively and trims the query, keeping order', () => {
    expect(filterEvidenceChoices(choices, [], '  ad spend ', text).map(c => c.id)).toEqual(['f2']);
    expect(filterEvidenceChoices(choices, [], '商品淨營收', text).map(c => c.id)).toEqual(['f1', 'f3']);
    expect(filterEvidenceChoices(choices, [], 'marketplace', text).map(c => c.id)).toEqual(['f3']);
  });
  it('filterEvidenceChoices always keeps checked items, even when nothing else matches', () => {
    expect(filterEvidenceChoices(choices, ['f2'], '商品淨營收', text).map(c => c.id)).toEqual(['f1', 'f2', 'f3']);
    expect(filterEvidenceChoices(choices, ['f3'], 'no-such-text', text).map(c => c.id)).toEqual(['f3']);
    expect(filterEvidenceChoices([], ['f3'], 'x', text)).toEqual([]);
  });
});

describe('R5-5 status_updated_at reaches exports and survives backups', () => {
  it('exports status_updated_at in JSON (date or null) and as a CSV manual_action field', async () => {
    const { s, w: base } = await drafts(['A', 'B']);
    const w = editActionManagement(base, 'B', { execution_status: 'blocked' }, '2026-10-02');
    const session = createDecisionSession(s.dataset, s.snapshot, 1);
    const json = JSON.parse(exportDecisionJson(session, [], [], w));
    expect(json.actions.map((action: { id: string; status_updated_at: string | null }) => [action.id, action.status_updated_at])).toEqual([['A', null], ['B', '2026-10-02']]);
    const rows = records(exportDecisionCsv(session, [], [], w)).filter(row => row.row_type === 'manual_action' && row.field === 'status_updated_at');
    expect(rows.map(row => [row.item_id, row.value])).toEqual([['A', 'null'], ['B', '2026-10-02']]);
  });
  it('round-trips status_updated_at through a backup; actions without it restore as undefined', async () => {
    const { s, w: base } = await drafts(['A', 'B']);
    const w = editActionManagement(base, 'B', { execution_status: 'completed' }, '2026-10-03');
    const text = await exportWorkspaceBackup({ input: s.input, filters: s.snapshot.report.scope, id: 'golden', revision: 1, decision: emptyDecisionWorkspace(), action_workspace: w });
    const saved = JSON.parse(text).payload.action_workspace.items;
    expect('status_updated_at' in saved[0]).toBe(false);
    expect(saved[1].status_updated_at).toBe('2026-10-03');
    const restored = await restoreWorkspaceBackup(text);
    expect(restored.action_workspace.items[0].status_updated_at).toBeUndefined();
    expect(restored.action_workspace.items[1]).toMatchObject({ execution_status: 'completed', status_updated_at: '2026-10-03' });
    expect(actionDocuments(restored.action_workspace).map(doc => doc.status_updated_at)).toEqual([null, '2026-10-03']);
  });
  it('a v3 envelope never carries status_updated_at (INVALID_WORKSPACE_FORMAT); without it the v3 file restores', async () => {
    const { s, w: base } = await drafts(['A']);
    const w = editActionManagement(base, 'A', { execution_status: 'in_progress' }, '2026-10-03');
    const v3 = JSON.parse(await exportWorkspaceBackup({ input: s.input, filters: s.snapshot.report.scope, id: 'golden', revision: 1, decision: emptyDecisionWorkspace(), action_workspace: w }));
    v3.schema_version = 'profitlens-workspace-v3';
    for (const key of ['preprocessing', 'targets', 'events', 'meeting_history', 'ui_prefs']) delete v3.payload[key];
    expect(v3.payload.action_workspace.items[0].status_updated_at).toBe('2026-10-03');
    await expect(restoreWorkspaceBackup(await sign(v3))).rejects.toThrow('INVALID_WORKSPACE_FORMAT');
    delete v3.payload.action_workspace.items[0].status_updated_at;
    const restored = await restoreWorkspaceBackup(await sign(v3));
    expect(restored.action_workspace.items[0]).toMatchObject({ execution_status: 'in_progress' });
    expect(restored.action_workspace.items[0].status_updated_at).toBeUndefined();
  });
  it.each([['2026/10/03', 'shape'], ['2026-10-033', 'length'], ['2026-02-30', 'calendar']])('rejects a re-signed backup whose status day is %j (%s)', async (day) => {
    const { s, w } = await drafts(['A']);
    const envelope = JSON.parse(await exportWorkspaceBackup({ input: s.input, filters: s.snapshot.report.scope, id: 'golden', revision: 1, decision: emptyDecisionWorkspace(), action_workspace: w }));
    envelope.payload.action_workspace.items[0].status_updated_at = day;
    await expect(restoreWorkspaceBackup(await sign(envelope))).rejects.toThrow();
  });
  it('accepts a re-signed backup that adds a valid status day to an older item', async () => {
    const { s, w } = await drafts(['A']);
    const envelope = JSON.parse(await exportWorkspaceBackup({ input: s.input, filters: s.snapshot.report.scope, id: 'golden', revision: 1, decision: emptyDecisionWorkspace(), action_workspace: w }));
    envelope.payload.action_workspace.items[0].status_updated_at = '2026-09-30';
    const restored = await restoreWorkspaceBackup(await sign(envelope));
    expect(restored.action_workspace.items[0].status_updated_at).toBe('2026-09-30');
  });
});

describe('R5-5 ActionsWorkbench markup (board default, list on request)', () => {
  async function workspace() {
    const { s, w: base } = await drafts(['A', 'B', 'C']);
    let w = editBoundAction(editBoundAction(base, 'A', { owner_role: '營運', problem: '核對 DTC 費用', deadline: '2026-10-20' }), 'B', { owner_role: '行銷' });
    w = editActionManagement(w, 'B', { execution_status: 'blocked' }, '2026-10-02');
    w = pinAction(w, 'C', true); // order: C, A, B
    return { s, w };
  }
  const render = (props: Record<string, unknown>) => renderToStaticMarkup(createElement(ActionsWorkbench, { onChange: () => {}, onEvidence: () => {}, onExport: () => {}, ...props } as never));
  const between = (html: string, start: string, end?: string) => html.slice(html.indexOf(start), end ? html.indexOf(end) : undefined);
  it('defaults to the board: four labelled columns, cards numbered by workspace order, pressed toggle', async () => {
    const { s, w } = await workspace();
    const html = render({ workspace: w, source: s });
    for (const status of ['not_started', 'in_progress', 'blocked', 'completed']) {
      expect(html).toContain(`data-testid="board-column-${status}"`);
      expect(html).toContain(`aria-labelledby="board-column-${status}-heading"`);
    }
    expect(html).toContain('aria-pressed="true" data-testid="actions-view-board"');
    expect(html).toContain('aria-pressed="false" data-testid="actions-view-list"');
    // V3-6：v2 的 h2「待辦看板」改成頁首 h1「待辦」；工作台區段以 aria-label 命名。
    expect(html).toContain(`data-testid="actions-workbench" class="actions-page" aria-label="${labels.nav.actions.label}"`);
    expect(html).not.toContain(labels.sections.actionBoard);
    // Not started holds C (pinned, card 1) and A (card 2): count 2; in progress and done are empty.
    const notStarted = between(html, 'data-testid="board-column-not_started"', 'data-testid="board-column-in_progress"');
    expect(notStarted).toContain(fill(labels.actionBoard.columnCount, { n: 2 }));
    expect(notStarted.indexOf('data-testid="board-card-1"')).toBeLessThan(notStarted.indexOf('data-testid="board-card-2"'));
    expect(notStarted).toContain('核對 DTC 費用');
    expect(notStarted).toContain(labels.actionBoard.untitled);
    expect(notStarted).toContain(labels.actionBoard.unassigned);
    expect(notStarted).toContain(labels.actionBoard.noDeadline);
    expect(between(html, 'data-testid="board-column-completed"')).toContain(labels.actions.pageV3.columnEmpty);
    // Card 3 is B (blocked) with its status day and only the three other moves.
    const blocked = between(html, 'data-testid="board-column-blocked"', 'data-testid="board-column-completed"');
    expect(blocked).toContain('data-testid="board-card-3"');
    expect(blocked).toContain(fill(labels.actions.pageV3.updated, { date: formatDateL1('2026-10-02', { today: taipeiToday() }) }));
    expect(blocked).toContain(fill(labels.actionBoard.moveTo, { status: labels.actions.statuses.done }));
    expect(blocked).not.toContain(fill(labels.actionBoard.moveTo, { status: labels.actions.statuses.blocked }));
    expect(blocked).toContain(`aria-label="${fill(labels.actionBoard.moveGroup, { n: 3 })}"`);
    // Card 1 (C) is pinned: its star is pressed and named "unpin"; card 2's star is not pressed.
    expect(between(html, 'data-testid="board-card-1"', 'data-testid="board-card-2"')).toContain(`aria-pressed="true" aria-label="${labels.ui.actionsWorkbench.unpin}"`);
    expect(between(html, 'data-testid="board-card-2"', 'data-testid="board-column-in_progress"')).toContain(`aria-pressed="false" aria-label="${labels.buttons.pin}"`);
    // V3-6：「展開編輯」改成卡片底部的「編輯」（開啟待辦編輯抽屜）。
    expect(html).not.toContain(labels.actionBoard.expandEdit);
    expect(html).toContain(`data-testid="board-card-1-edit" aria-describedby="board-card-1-title">${labels.actions.pageV3.edit}</button>`);
    expect(html).not.toContain('data-testid="action-1"');
    expect(html).not.toContain('data-testid="evidence-checklist"');
  });
  it('the list view keeps the action-<n> articles and the shared editor with date, owner datalist and evidence checklist', async () => {
    const { s, w } = await workspace();
    const html = render({ workspace: w, source: s, view: 'list' });
    expect(html).not.toContain(labels.sections.actionList);
    expect(html).not.toContain('data-testid="action-board"');
    expect(html).toContain('aria-pressed="true" data-testid="actions-view-list"');
    expect(html).toContain('data-testid="action-1"');
    expect(html).toContain('data-testid="action-3"');
    expect(html).not.toContain('data-testid="board-column-not_started"');
    expect(html).toContain('type="date"');
    expect(html).toContain('list="action-owners-A"');
    // Owners: later actions first → B (行銷) then A (營運).
    expect(html).toContain('<datalist id="action-owners-A"><option value="行銷"></option><option value="營運"></option></datalist>');
    expect(html).toContain('data-testid="evidence-checklist"');
    expect(html).toContain(`aria-label="${labels.ui.actionsWorkbench.evidencePicker}"`);
    expect(html).toContain(`aria-label="${labels.actions.searchEvidence}"`);
    expect(html).toContain('type="checkbox"');
    expect(html).not.toContain('multiple=""');
    expect(html).toContain('class="action-status-select"');
    expect(html).toContain(fill(labels.actionBoard.statusUpdated, { date: '2026-10-02' }));
  });
  it('shows the empty note and no board when there are no actions', async () => {
    const s = await source();
    const html = render({ workspace: emptyActionWorkspace(), source: s });
    // V3-6（§7.5 第 6 點）：頁面型空狀態，工具列與看板都不渲染。
    expect(html).toContain('data-testid="actions-empty"');
    expect(html).toContain(`<h2>${labels.actions.pageV3.emptyTitle}</h2><p>${labels.actions.pageV3.emptyBody}</p>`);
    expect(html).not.toContain('data-testid="action-board"');
    expect(html).not.toContain('data-testid="actions-view-board"');
  });
});
