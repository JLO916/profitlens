"use client";

import { useEffect, useReducer, useRef, useState } from "react";
import { inspectImportFile, inspectManifestFile, type PreparedImport } from "@/application/import";
import { canConfirm, canLeaveFiles, canLeaveMapping, detectEncoding, initialWizardState, memoryEntries, recallForRole, rememberAll, roleForFilename, runCheck, wizardMappingStore, wizardReducer, FILE_ROLES, type WizardRole } from "@/application/import-wizard";
import { mappingMemoryDate, type MappingStore } from "@/application/mapping-memory";
import { MAX_CSV_BYTES } from "@/lib/csv";
import type { FileName, SourceRef, ValidationIssue } from "@/domain/types";
import { fill, labels } from "@/i18n";
import { StepBasis } from "./step-basis";
import { StepFiles, fileLabels } from "./step-files";
import { StepMapping } from "./step-mapping";
import { StepReview } from "./step-review";

const copy = labels.importWizard;
const stepIds = ["files", "mapping", "basis", "review"] as const;

/** R3 四步匯入精靈；對外仍是 onCommit／onCancel。狀態機在 src/application/import-wizard.ts，這裡只做讀檔與渲染。 */
export function ImportWizard({ onCommit, onCancel, busy, localSaveConsented }: {
  /** afterCommit 在資料真的被套用後才呼叫（取代對話框取消時不呼叫）；對照記憶在這裡寫入。 */
  onCommit: (prepared: PreparedImport, manifestName?: string, afterCommit?: () => void) => Promise<void>;
  onCancel: () => void;
  busy: boolean;
  /** 使用者已同意本機保存時，對照記憶才寫進 IndexedDB；否則只留在這個分頁。 */
  localSaveConsented: boolean;
}) {
  const [state, dispatch] = useReducer(wizardReducer, undefined, initialWizardState);
  const [dropNotice, setDropNotice] = useState("");
  const consent = useRef(localSaveConsented);
  useEffect(() => { consent.current = localSaveConsented; }, [localSaveConsented]);
  const storeRef = useRef<MappingStore | null>(null);
  // 只在事件處理中建立／讀取：對照記憶的 store 依當下的本機保存同意決定要不要寫 IndexedDB。
  const store = () => (storeRef.current ??= wizardMappingStore(() => consent.current));
  const sequence = useRef<Partial<Record<WizardRole, number>>>({});
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [state.step]);

  async function read(file: File | undefined, role: WizardRole) {
    const ticket = (sequence.current[role] ?? 0) + 1;
    sequence.current[role] = ticket;
    if (!file) return;
    dispatch({ type: "reading", role });
    try {
      // 超過上限先擋下，不讀進記憶體；parser 會再檢查一次位元組。
      if (file.size > MAX_CSV_BYTES) throw new Error("FILE_TOO_LARGE");
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (!mounted.current || sequence.current[role] !== ticket) return;
      if (role === "manifest.json") {
        const result = inspectManifestFile({ name: file.name, size: file.size, bytes });
        const blocking = result.issues.filter(issue => issue.severity === "blocking");
        if (result.manifest) dispatch({ type: "manifestRead", name: file.name, manifest: result.manifest });
        else dispatch({ type: "fileFailed", role, issues: blocking });
        return;
      }
      const draft = inspectImportFile(role, { name: file.name, size: file.size, bytes });
      const memory = draft.parsed ? await recallForRole(store(), role, draft.parsed.headers) : null;
      if (!mounted.current || sequence.current[role] !== ticket) return;
      dispatch({ type: "fileRead", role, draft, encoding: detectEncoding(bytes), memory });
    } catch (error) {
      if (!mounted.current || sequence.current[role] !== ticket) return;
      const tooLarge = error instanceof Error && error.message === "FILE_TOO_LARGE";
      const issue: ValidationIssue = { file: role, field: "$file", line: null, severity: "blocking", reason_code: tooLarge ? "FILE_TOO_LARGE" : "FILE_READ_FAILED", message: tooLarge ? labels.importErrors.FILE_TOO_LARGE : copy.readFailed };
      dispatch({ type: "fileFailed", role, issues: [issue] });
    }
  }
  function dropFiles(files: FileList) {
    const unassigned: string[] = [];
    let placed = 0;
    for (const file of Array.from(files)) {
      const role = roleForFilename(file.name);
      if (role) { void read(file, role); placed++; } else unassigned.push(file.name);
    }
    setDropNotice([placed ? fill(copy.dropped, { n: placed }) : "", ...unassigned.map(name => fill(copy.droppedUnassigned, { name }))].filter(Boolean).join(" "));
  }
  useEffect(() => {
    if (state.step !== 4 || !state.checking) return;
    let cancelled = false;
    // 讓「正在檢核」先畫出來，再做完整檢核。
    requestAnimationFrame(() => { if (cancelled || !mounted.current) return; dispatch({ type: "checked", candidate: runCheck(state) }); });
    return () => { cancelled = true; };
  }, [state.step, state.checking]);  // eslint-disable-line react-hooks/exhaustive-deps -- runCheck reads the state captured when checking started
  const filenames: Partial<Record<SourceRef["file"], string>> = Object.fromEntries([...FILE_ROLES.flatMap(role => state.files[role] ? [[role, state.files[role]!.draft.name]] : []), ...(state.manifestName ? [["manifest.json", state.manifestName]] : [])]);
  async function commit() {
    if (!state.candidate) return;
    const entries = memoryEntries(state, mappingMemoryDate());
    const memoryStore = store();
    await onCommit(state.candidate, state.manifestName ?? undefined, () => { void rememberAll(memoryStore, entries); });
  }
  function pick(role: FileName, files: FileList | null) {
    if (!files || files.length === 0) return;
    if (files.length === 1) { void read(files[0], role); return; }
    dropFiles(files);
  }
  const stepState = (n: number): "done" | "current" | "todo" | "skipped" => n === state.step ? "current" : n < state.step ? (n === 2 && state.mappingSkipped ? "skipped" : "done") : "todo";
  return <section className="panel import-wizard" aria-labelledby="import-heading" data-testid="import-wizard">
    <div className="section-heading"><div><p className="eyebrow">{labels.status.local}</p><h2 id="import-heading" ref={heading} tabIndex={-1}>{copy.title}｜{copy.steps[state.step - 1]}</h2><p className="note">{copy.privacyNote}</p></div><button className="button quiet" type="button" onClick={onCancel}>{copy.cancel}</button></div>
    <ol className="wizard-steps" aria-label={copy.stepperAria} data-testid="import-stepper">{copy.steps.map((title, index) => { const n = index + 1; const status = stepState(n); return <li key={stepIds[index]} className={status} aria-current={status === "current" ? "step" : undefined}><span className="wizard-step-number" aria-hidden="true">{n}</span><span>{title}</span><span className="sr-only">（{copy.stepState[status]}）</span></li>; })}</ol>
    <fieldset className="import-fields" disabled={busy}>
      <legend className="sr-only">{copy.title}</legend>
      {state.step === 1 && <StepFiles state={state} dropNotice={dropNotice} onPick={pick} onDrop={dropFiles} onRemove={role => { sequence.current[role] = (sequence.current[role] ?? 0) + 1; dispatch({ type: "removeFile", role }); }} onManifest={file => void read(file, "manifest.json")} onManifestClear={() => { sequence.current["manifest.json"] = (sequence.current["manifest.json"] ?? 0) + 1; dispatch({ type: "manifestCleared" }); }} />}
      {state.step === 2 && <StepMapping state={state} onMap={(role, field, source) => dispatch({ type: "mapField", role, field, source })} onIgnore={(role, value) => dispatch({ type: "ignoreConfirmed", role, value })} />}
      {state.step === 3 && <StepBasis state={state} dispatch={dispatch} />}
      {state.step === 4 && <StepReview state={state} filenames={filenames} busy={busy} memoryPersistent={localSaveConsented} onCommit={() => void commit()} />}
    </fieldset>
    <div className="wizard-footer">
      {state.step > 1 && <button type="button" className="button quiet" onClick={() => dispatch({ type: "back" })}>{copy.back}</button>}
      {state.step === 1 && <button type="button" className="button primary" disabled={!canLeaveFiles(state)} onClick={() => dispatch({ type: "next" })}>{copy.next}</button>}
      {state.step === 2 && <button type="button" className="button primary" disabled={!canLeaveMapping(state)} onClick={() => dispatch({ type: "next" })}>{copy.confirmMapping}</button>}
      {state.step === 3 && <button type="button" className="button primary" disabled={!canConfirm(state)} onClick={() => dispatch({ type: "confirm" })}>{copy.confirmAndCheck}</button>}
      {state.step === 1 && !canLeaveFiles(state) && <span className="note">{FILE_ROLES.filter(role => !state.files[role]).map(role => fileLabels[role]).join("、")}</span>}
    </div>
  </section>;
}
