"use client";

import { useState } from "react";
import { CHANNEL_SETTINGS_VERSION, defaultChannelSettings, isValidChannelName, normalizeChannelSettings, resolveChannelNames, validateChannelSettings, type ChannelSettings } from "@/application/channel-settings";
import { fill, labels } from "@/i18n";

/*
 * V42-1b（D-V42-8＝A、D-V42-13＝A；PRD §3.1、§3.2、§9；docs/revamp-v4.2/06_BATCHES.md V42-1b 第 1 項）：資料來源頁的「通路設定」區。
 * - 收合的 <details class="panel data-section">（內容保持掛載，M1），在「範圍與金額基準」之後、「本次匯入的前處理」之前；由 DataWorkspace 靜態匯入，隨 workspace-panels 的 chunk 載入、不進 / 首載（tests/lazy-panels.test.tsx）。
 * - 每個 manifest 通路一列：通路代碼、顯示名稱（空白＝畫面顯示通路代碼，示範資料也一樣：清空後套用寫成 label＝代碼、蓋掉隱含預設的別名；示範資料的起始值是隱含預設的別名）、群組（未分組＋各群組）、順序（整數）；群組區每個群組一列（名稱、成員）。
 * - 草稿只在這個元件的 state；按「套用設定」才驗證（四條規則、不重複、順序是整數）並呼叫 onApply(正規化後的設定)——與預設沒有差時是 null。有問題就逐句列出、不套用，不替使用者修剪名稱。
 *   套用成功時草稿當場由正規化後的設定重建（沒有成員的群組去掉）；父層重算完傳回同一份設定時不再重建，重算期間打的字不會被蓋掉（lastApplied）。
 * - 群組 id 由這裡配（g1、g2…），同一個工作階段不重用；沒有成員的群組在套用時去掉（提示句）。
 * - 顯示名稱與群組名只進人讀的畫面與匯出；CSV、備份的 active.filters、AI 的事實仍是通路代碼（「要注意」一句）。
 * 中文一律取 labels.data.channelSettingsV42.*（D-V42-22）；純函式 initialDraft／settingsFromDraft 匯出給 tests/channel-settings-editor.test.tsx。
 */

const ui = labels.data.channelSettingsV42;
/** V42-2a（D-V42-12；GLOSSARY §2）：群組層的三句限制，接在「要注意」的名稱句之後（details 預設收合，畫面 17 不變）。 */
const limits = labels.diagnosis.channelsV42.limits;
const JOINER = "、";

export interface ChannelDraftRow { code: string; label: string; group: string; order: string }
export interface ChannelDraftGroup { id: string; label: string }
export interface ChannelSettingsDraft { rows: ChannelDraftRow[]; groups: ChannelDraftGroup[]; /** 下一個新群組的號碼（id＝`g${n}`）；只增不減，同一個工作階段不重用。 */ nextGroupId: number }
export interface ChannelSettingsEditorProps { datasetId: string; manifestChannels: readonly string[]; settings: ChannelSettings | null; onApply: (settings: ChannelSettings | null) => void }

const GROUP_ID_RE = /^g(\d+)$/;
const compareIds = (a: string, b: string) => a < b ? -1 : a > b ? 1 : 0;
/** 設定裡已用掉的 g{n} 之後的下一個號碼（沒有 g{n} 形式的 id 時從 floor 起）。 */
function nextGroupNumber(groups: readonly { id: string }[], floor: number): number {
  return groups.reduce((max, group) => { const match = GROUP_ID_RE.exec(group.id); return match ? Math.max(max, Number(match[1]) + 1) : max; }, floor);
}

/** 由目前的設定建草稿：顯示名稱欄的起始值是目前生效的名稱（設定的 label，否則示範資料的隱含預設，否則空白）；群組依 order 再 id 排。 */
export function initialDraft(settings: ChannelSettings | null | undefined, datasetId: string, manifestChannels: readonly string[], minNextGroupId = 1): ChannelSettingsDraft {
  const names = resolveChannelNames(settings, datasetId, manifestChannels);
  const byCode = new Map((settings?.channels ?? []).map(entry => [entry.code, entry]));
  const groups = [...(settings?.groups ?? [])].sort((a, b) => a.order - b.order || compareIds(a.id, b.id)).map(group => ({ id: group.id, label: group.label }));
  const groupIds = new Set(groups.map(group => group.id));
  const rows = manifestChannels.map(code => {
    const entry = byCode.get(code);
    return { code, label: names[code] ?? "", group: entry?.group !== undefined && groupIds.has(entry.group) ? entry.group : "", order: entry?.order !== undefined ? String(entry.order) : "" };
  });
  return { rows, groups, nextGroupId: nextGroupNumber(groups, minNextGroupId) };
}

export interface DraftOutcome { /** 每個問題一句（labels.data.channelSettingsV42.validation.*），去重；空陣列＝可以套用。 */ problems: string[]; /** 有問題時 undefined；否則正規化後的設定，與預設沒有差時 null。 */ settings: ChannelSettings | null | undefined }

/**
 * 草稿 → 設定：空白的顯示名稱＝畫面顯示通路代碼——資料集有隱含預設的別名（示範資料）時寫成 label＝代碼（與預設有差、會寫進設定並蓋掉別名；與提示句、placeholder 一致），
 * 沒有預設別名時不寫 label；順序欄要是整數；沒有成員的群組去掉、有成員但沒名稱的群組是問題；名稱不修剪（前後空格由規則句報出）。
 */
export function settingsFromDraft(draft: ChannelSettingsDraft, datasetId: string, manifestChannels: readonly string[]): DraftOutcome {
  const problems: string[] = [];
  const defaults = defaultChannelSettings(datasetId, manifestChannels);
  const defaultLabel = new Map(defaults.channels.map(entry => [entry.code, entry.label]));
  const memberCount = new Map<string, number>();
  for (const row of draft.rows) if (row.group !== "") memberCount.set(row.group, (memberCount.get(row.group) ?? 0) + 1);
  const channels: ChannelSettings["channels"] = [];
  for (const row of draft.rows) {
    const entry: ChannelSettings["channels"][number] = { code: row.code };
    if (row.label !== "") { if (isValidChannelName(row.label)) entry.label = row.label; else problems.push(fill(ui.validation.invalidName, { name: row.label })); }
    else if (defaultLabel.get(row.code)) entry.label = row.code;
    if (row.group !== "") entry.group = row.group;
    if (row.order !== "") { const order = Number(row.order); if (Number.isInteger(order)) entry.order = order; else problems.push(fill(ui.validation.invalidOrder, { code: row.code })); }
    channels.push(entry);
  }
  const groups: ChannelSettings["groups"] = [];
  draft.groups.forEach((group, index) => {
    if ((memberCount.get(group.id) ?? 0) === 0) return;
    if (group.label.trim() === "") { problems.push(fill(ui.validation.groupNameMissing, { n: index + 1 })); return; }
    if (!isValidChannelName(group.label)) { problems.push(fill(ui.validation.invalidName, { name: group.label })); return; }
    groups.push({ id: group.id, label: group.label, order: index });
  });
  const validated = validateChannelSettings({ version: CHANNEL_SETTINGS_VERSION, channels, groups }, manifestChannels);
  for (const name of new Set(validated.invalidNames)) if (isValidChannelName(name)) problems.push(fill(ui.validation.duplicateName, { name }));
  const unique = [...new Set(problems)];
  if (unique.length > 0) return { problems: unique, settings: undefined };
  return { problems: [], settings: normalizeChannelSettings(validated.settings, defaults) };
}

export function ChannelSettingsEditor({ datasetId, manifestChannels, settings, onApply }: ChannelSettingsEditorProps) {
  const channelsKey = manifestChannels.join("\u0000");
  // 設定（還原備份等）或資料集變了就重建草稿（React「記住上一次的 props」寫法；設定參照相同時不動使用者正在打的字）。
  // 例外：自己剛套用的那份設定（lastApplied；null 也算一份）由父層重算完傳回時不重建——套用當下已同步重建，重算是非同步的，期間打的字不能被蓋掉；傳回後就清掉，之後的變動照舊重建。
  const [source, setSource] = useState({ settings, datasetId, channelsKey });
  const [draft, setDraft] = useState(() => initialDraft(settings, datasetId, manifestChannels));
  const [problems, setProblems] = useState<string[]>([]);
  const [applied, setApplied] = useState(false);
  const [lastApplied, setLastApplied] = useState<{ settings: ChannelSettings | null } | null>(null);
  if (source.settings !== settings || source.datasetId !== datasetId || source.channelsKey !== channelsKey) {
    const ownRoundTrip = lastApplied !== null && settings === lastApplied.settings && source.datasetId === datasetId && source.channelsKey === channelsKey;
    setSource({ settings, datasetId, channelsKey });
    setLastApplied(null);
    if (!ownRoundTrip) {
      setDraft(current => initialDraft(settings, datasetId, manifestChannels, current.nextGroupId));
      setProblems([]);
    }
  }
  const edit = (update: (current: ChannelSettingsDraft) => ChannelSettingsDraft) => { setDraft(update); setApplied(false); };
  const setRow = (code: string, patch: Partial<Omit<ChannelDraftRow, "code">>) => edit(current => ({ ...current, rows: current.rows.map(row => row.code === code ? { ...row, ...patch } : row) }));
  const setGroupLabel = (id: string, label: string) => edit(current => ({ ...current, groups: current.groups.map(group => group.id === id ? { ...group, label } : group) }));
  const addGroup = () => edit(current => ({ ...current, groups: [...current.groups, { id: `g${current.nextGroupId}`, label: "" }], nextGroupId: current.nextGroupId + 1 }));
  const apply = () => {
    const outcome = settingsFromDraft(draft, datasetId, manifestChannels);
    setProblems(outcome.problems);
    if (outcome.settings === undefined) { setApplied(false); return; }
    const next = outcome.settings;
    // 套用成功：草稿當場由正規化後的設定重建（沒有成員的群組去掉、群組 id 不重用），並記下這份設定——父層重算完傳回同一個參照時不再重建。
    setDraft(current => initialDraft(next, datasetId, manifestChannels, current.nextGroupId));
    setLastApplied({ settings: next });
    setApplied(true);
    onApply(next);
  };
  const groupName = (group: ChannelDraftGroup, index: number) => group.label || fill(ui.groups.unnamed, { n: index + 1 });
  return <details className="panel data-section channel-settings" data-testid="channel-settings">
    <summary><h2 className="ui-section-title">{ui.heading}</h2></summary>
    <p className="channel-settings-lead">{ui.lead}</p>
    {/* ≥ 768 的表頭一列（≤ 767 隱藏，改由每個欄位自己的可見標籤）；只是視覺，不進可及樹。 */}
    <div className="channel-settings-head" aria-hidden="true"><span>{ui.columns.code}</span><span>{ui.columns.label}</span><span>{ui.columns.group}</span><span>{ui.columns.order}</span></div>
    <ul className="channel-settings-rows">
      {draft.rows.map(row => {
        const ids = { label: `channel-setting-label-${row.code}`, group: `channel-setting-group-${row.code}`, order: `channel-setting-order-${row.code}` };
        return <li key={row.code} className="channel-settings-row" data-testid={`channel-settings-row-${row.code}`}>
          <div className="ui-field channel-settings-code"><span className="ui-field-label">{ui.columns.code}</span><span className="ui-mono">{row.code}</span></div>
          <div className="ui-field"><label className="ui-field-label" htmlFor={ids.label}>{ui.columns.label}</label><input id={ids.label} className="ui-field-control" type="text" value={row.label} placeholder={row.code} aria-label={fill(ui.rowAria.label, { code: row.code })} onChange={event => setRow(row.code, { label: event.target.value })} /></div>
          <div className="ui-field"><label className="ui-field-label" htmlFor={ids.group}>{ui.columns.group}</label><select id={ids.group} className="ui-field-control" value={row.group} aria-label={fill(ui.rowAria.group, { code: row.code })} onChange={event => setRow(row.code, { group: event.target.value })}><option value="">{ui.ungrouped}</option>{draft.groups.map((group, index) => <option key={group.id} value={group.id}>{groupName(group, index)}</option>)}</select></div>
          <div className="ui-field"><label className="ui-field-label" htmlFor={ids.order}>{ui.columns.order}</label><input id={ids.order} className="ui-field-control" type="number" step={1} inputMode="numeric" value={row.order} aria-label={fill(ui.rowAria.order, { code: row.code })} onChange={event => setRow(row.code, { order: event.target.value })} /></div>
        </li>;
      })}
    </ul>
    <p className="ui-field-hint channel-settings-hint">{ui.hints.blankLabel}</p>
    <h3 className="channel-settings-subheading">{ui.groups.heading}</h3>
    {draft.groups.length === 0 ? <p className="data-section-empty">{ui.groups.empty}</p> : <ul className="channel-settings-group-list">
      {draft.groups.map((group, index) => {
        const id = `channel-setting-groupname-${group.id}`;
        const members = draft.rows.filter(row => row.group === group.id);
        return <li key={group.id} className="channel-settings-group" data-testid={`channel-settings-group-${group.id}`}>
          <div className="ui-field"><label className="ui-field-label" htmlFor={id}>{fill(ui.groups.nameLabel, { n: index + 1 })}</label><input id={id} className="ui-field-control" type="text" value={group.label} onChange={event => setGroupLabel(group.id, event.target.value)} /></div>
          <span className="channel-settings-group-members">{members.length > 0 ? fill(ui.groups.members, { list: members.map(row => row.label || row.code).join(JOINER) }) : ui.groups.noMembers}</span>
        </li>;
      })}
    </ul>}
    <p className="ui-field-hint channel-settings-hint">{ui.hints.emptyGroupDropped}</p>
    <div className="ui-toolbar channel-settings-actions"><button type="button" className="ui-btn ui-btn-secondary" onClick={addGroup}>{ui.buttons.addGroup}</button><button type="button" className="ui-btn ui-btn-primary" onClick={apply}>{ui.buttons.apply}</button></div>
    {/* 問題清單：live role 放在外層 div，<ul> 維持 list（li 的父層要是 list，axe 的 listitem 規則）。 */}
    {problems.length > 0 && <div role="alert"><ul className="channel-settings-problems">{problems.map(problem => <li key={problem} className="ui-field-error">{problem}</li>)}</ul></div>}
    {/* 套用後的狀態句：live region 一直掛著（空字串時不佔高度），內容換成句子時才會被唸出。 */}
    <p className="channel-settings-status" role="status">{applied ? ui.applied : ""}</p>
    <details className="channel-settings-notes"><summary>{ui.notes.summary}</summary><p>{ui.notes.names}</p><p>{limits.rules}</p><p>{limits.scenario}</p><p>{limits.targets}</p></details>
  </details>;
}
