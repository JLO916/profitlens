"use client";

import { useEffect, useId, useRef, useState, type Ref } from "react";
import { fill, labels } from "@/i18n";
import { track } from "@/application/analytics";
import { GLOSSARY_V2_SECTION_ID, glossaryEntries, glossaryRenames, searchGlossary } from "@/application/glossary";

/** 開啟後要捲到的段落；「這版改了什麼」提示用 v2-names。 */
export type BasisDialogSection = "v2-names";

/**
 * 指標定義（R2 口徑說明；V3-2a 加名詞小辭典，PRD §6.3 #12、§8.9）：九條固定內容、名詞搜尋（舊名也搜得到）、業界說法對照（D-V3-18）、v2 舊名對照。
 * 由頂欄、抽屜與頁尾開啟（V3-2a 再加「這版改了什麼」提示）；Esc 或關閉後回到開啟它的按鈕。每次開啟都是新的搜尋狀態。
 */
export function BasisDialog({ open, onClose, section = null }: { open: boolean; onClose: () => void; section?: BasisDialogSection | null }) {
  if (!open) return null;
  return <OpenBasisDialog onClose={onClose} section={section} />;
}

function OpenBasisDialog({ onClose, section }: { onClose: () => void; section: BasisDialogSection | null }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const v2HeadingRef = useRef<HTMLHeadingElement>(null);
  const initialSection = useRef(section);
  const [query, setQuery] = useState("");
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || dialog.open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.showModal();
    track("glossary_opened");
    if (initialSection.current === "v2-names") { v2HeadingRef.current?.focus({ preventScroll: true }); v2HeadingRef.current?.scrollIntoView?.({ block: "start" }); }
    return () => { if (dialog.open) dialog.close(); if (opener?.isConnected) opener.focus(); };
  }, []);
  return <dialog ref={ref} className="basis-dialog" aria-labelledby={titleId} data-testid="basis-dialog" onCancel={event => { event.preventDefault(); onClose(); }}>
    <header className="evidence-header"><h2 id={titleId}>{labels.glossary.basis.title}</h2><button type="button" className="button quiet" onClick={onClose} autoFocus>{labels.shell.buttons.close}</button></header>
    <div className="evidence-body">
      <ol className="basis-list">{labels.glossary.basis.items.map(item => <li key={item}>{item}</li>)}</ol>
      <p className="note">{labels.glossary.basis.aliasNote}</p>
      <GlossarySection query={query} onQuery={setQuery} v2HeadingRef={v2HeadingRef} />
    </div>
  </dialog>;
}

/** 名詞小辭典本體（無狀態，方便 SSR 測試）：搜尋、名詞清單、業界說法對照、v2 舊名。 */
export function GlossarySection({ query, onQuery, v2HeadingRef }: { query: string; onQuery: (query: string) => void; v2HeadingRef?: Ref<HTMLHeadingElement> }) {
  const headingId = useId();
  const searchId = useId();
  const industryId = useId();
  const entries = glossaryEntries();
  const results = searchGlossary(query, entries);
  const renames = glossaryRenames(entries);
  const separator = labels.glossary.listSeparator;
  return <>
    <section className="glossary" aria-labelledby={headingId}>
      <h3 id={headingId}>{labels.glossary.heading}</h3>
      <p className="note">{labels.glossary.intro}</p>
      <label className="glossary-search" htmlFor={searchId}>{labels.glossary.searchLabel}</label>
      <input id={searchId} type="search" data-testid="glossary-search" value={query} placeholder={labels.glossary.searchPlaceholder} autoComplete="off" onChange={event => onQuery(event.target.value)} />
      <p className="note glossary-count" role="status" aria-live="polite">{results.length > 0 ? fill(labels.glossary.resultCount, { n: results.length }) : fill(labels.glossary.noResult, { query: query.trim() })}</p>
      {results.length > 0 && <dl className="glossary-list">{results.map(entry => <div key={entry.term} className="glossary-entry">
        <dt>{entry.term}</dt>
        <dd>{entry.definition}{entry.short && entry.short !== entry.term && <span className="glossary-meta">{fill(labels.glossary.shortLine, { short: entry.short })}</span>}{entry.aliases.length > 0 && <span className="glossary-meta">{fill(labels.glossary.oldNamesLine, { names: entry.aliases.join(separator) })}</span>}{entry.exportKey && <span className="glossary-meta">{fill(labels.glossary.englishKeyLine, { key: entry.exportKey })}</span>}</dd>
      </div>)}</dl>}
    </section>
    <section className="glossary" aria-labelledby={industryId}>
      <h3 id={industryId}>{labels.glossary.industryHeading}</h3>
      <p className="note">{labels.glossary.industryIntro}</p>
      <table className="ladder-table glossary-table"><thead><tr><th scope="col">{labels.glossary.industryColumns.ours}</th><th scope="col">{labels.glossary.industryColumns.industry}</th><th scope="col">{labels.glossary.industryColumns.difference}</th></tr></thead><tbody>{labels.glossary.industryRows.map(row => <tr key={row.ours}><th scope="row">{row.ours}</th><td>{row.industry}</td><td>{row.difference}</td></tr>)}</tbody></table>
      <p className="note"><a href={labels.glossary.industrySourceUrl} target="_blank" rel="noreferrer">{labels.glossary.industrySource}</a></p>
    </section>
    <section className="glossary" id={GLOSSARY_V2_SECTION_ID} aria-labelledby={`${GLOSSARY_V2_SECTION_ID}-heading`} data-testid="glossary-v2-names">
      <h3 id={`${GLOSSARY_V2_SECTION_ID}-heading`} ref={v2HeadingRef} tabIndex={-1}>{labels.glossary.v2Heading}</h3>
      <p className="note">{labels.glossary.v2Intro}</p>
      <table className="ladder-table glossary-table"><thead><tr><th scope="col">{labels.glossary.v2Columns.old}</th><th scope="col">{labels.glossary.v2Columns.current}</th></tr></thead><tbody>{renames.map(rename => <tr key={`${rename.oldName}-${rename.term}`}><td>{rename.oldName}</td><td>{rename.term}</td></tr>)}</tbody></table>
    </section>
  </>;
}
