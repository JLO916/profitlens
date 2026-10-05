import { labels } from "@/i18n";

/**
 * V3-2a（F5／F23，PRD §6.3 #12、§8.9）：名詞小辭典的資料與搜尋。
 * 資料只來自 labels.glossary.terms（名詞表 GLOSSARY.md §1）與 labels.basis.aliases；這裡不寫任何使用者看得到的字串。
 */
export interface GlossaryTerm {
  term: string;
  short: string;
  definition: string;
  englishKey: string;
  oldNames: readonly string[];
}
export interface GlossaryEntry extends GlossaryTerm {
  /** oldNames 併入 basis.aliases[englishKey]，去重、保留順序。 */
  aliases: readonly string[];
  /** 匯出檔（CSV metric 欄、Excel）真的會出現的英文欄名；englishKey 只是 labels 內部 key 時為空字串，畫面不顯示。 */
  exportKey: string;
}
export interface GlossaryRename { oldName: string; term: string }

/** 「v2 舊名」段落的錨點；「這版改了什麼」提示開啟對話框後捲到這裡。 */
export const GLOSSARY_V2_SECTION_ID = "glossary-v2-names";

/** basis.aliases 的形狀可能由 V3-2 其他工作調整；只取「englishKey → 字串陣列」的部分，其他形狀一律忽略。 */
function basisAliases(): Record<string, readonly string[]> {
  const raw: unknown = labels.basis.aliases;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, readonly string[]> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) if (Array.isArray(value)) out[key] = value.filter((item): item is string => typeof item === "string");
  return out;
}

/** 指標英文 key（metricDefinitions／匯出 metric 欄）與 CSV 欄 basis_note 才算使用者會在匯出檔看到的英文欄名。 */
function isExportKey(key: string): boolean {
  return key === "basis_note" || Object.hasOwn(labels.metrics, key);
}

export function glossaryEntries(terms: readonly GlossaryTerm[] = labels.glossary.terms, aliases: Record<string, readonly string[]> = basisAliases()): GlossaryEntry[] {
  return terms.map(term => {
    const extra = term.englishKey ? aliases[term.englishKey] ?? [] : [];
    const merged = [...new Set([...term.oldNames, ...extra])].filter(name => name !== term.term);
    return { ...term, aliases: merged, exportKey: isExportKey(term.englishKey) ? term.englishKey : "" };
  });
}

/** 比對時忽略大小寫、全形／半形與空白（例如「ｍｅｒ」「Mer」都找得到 MER）。 */
export function normalizeGlossaryQuery(text: string): string {
  return text.normalize("NFKC").toLowerCase().replace(/\s+/g, "");
}

/**
 * 搜尋名詞、短名、舊名、英文欄名與定義；空字串回傳全部。
 * 排序：名詞或舊名完全相同 → 名詞或舊名包含查詢字 → 只在英文欄名或定義出現；同級依名詞表順序。
 */
export function searchGlossary(query: string, entries: readonly GlossaryEntry[] = glossaryEntries()): GlossaryEntry[] {
  const q = normalizeGlossaryQuery(query);
  if (!q) return [...entries];
  const rank = (entry: GlossaryEntry): number => {
    const names = [entry.term, entry.short, ...entry.aliases].filter(Boolean).map(normalizeGlossaryQuery);
    if (names.some(name => name === q)) return 0;
    if (names.some(name => name.includes(q))) return 1;
    if (normalizeGlossaryQuery(entry.englishKey).includes(q) || normalizeGlossaryQuery(entry.definition).includes(q)) return 2;
    return -1;
  };
  return entries.map((entry, index) => ({ entry, index, score: rank(entry) })).filter(item => item.score >= 0).sort((a, b) => a.score - b.score || a.index - b.index).map(item => item.entry);
}

/** 「v2 舊名」段落：每個舊名一列（舊名 → 這一版的名詞），依名詞表順序。 */
export function glossaryRenames(entries: readonly GlossaryEntry[] = glossaryEntries()): GlossaryRename[] {
  return entries.flatMap(entry => entry.aliases.map(oldName => ({ oldName, term: entry.term })));
}
