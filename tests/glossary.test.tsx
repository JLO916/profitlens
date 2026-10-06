import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { fill, labels } from "@/i18n";
import { GLOSSARY_V2_SECTION_ID, glossaryEntries, glossaryRenames, normalizeGlossaryQuery, searchGlossary } from "../src/application/glossary";
import { BasisDialog, GlossarySection } from "../src/components/basis-dialog";
import { isWhitelisted, scanLabels } from "../scripts/lib/copy-scan.mjs";

// V3-2a（F5／F23，PRD §6.3 #12、§8.9；D-V3-18）：指標定義對話框的名詞小辭典。沒有 DOM 套件，以 SSR 輸出驗證。

/** PRD §8.9／GLOSSARY.md §3：這些 v2 舊名在小辭典都要搜得到。 */
const V2_OLD_NAMES = ["通路貢獻", "行銷前貢獻", "行銷後貢獻", "邊際貢獻", "口徑", "看證據", "怎麼算的", "公式與來源", "行動", "輔助指標", "廣告投報"];
const html = (query: string) => renderToStaticMarkup(createElement(GlossarySection, { query, onQuery: () => undefined }));
const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

describe("名詞小辭典資料（labels.glossary.terms）", () => {
  it("至少包含名詞表的 30 列，每列都有名詞與一句定義，名詞不重複", () => {
    const terms = labels.glossary.terms;
    expect(terms.length).toBeGreaterThanOrEqual(30);
    for (const term of terms) { expect(term.term).toMatch(/\S/); expect(term.definition).toMatch(/\S/); }
    expect(new Set(terms.map(term => term.term)).size).toBe(terms.length);
  });

  it("定案用詞：扣廣告前貢獻、廣告效率（MER）、計算與來源、指標定義、待辦都在", () => {
    const names = labels.glossary.terms.map(term => term.term);
    for (const name of ["扣廣告前貢獻", "扣廣告後貢獻", "廣告效率（MER）", "計算與來源", "指標定義", "金額基準", "解讀限制", "待辦"]) expect(names).toContain(name);
  });

  it("舊名只放在白名單（oldNames），名詞小辭典與提示不增加 copy-style 黑名單計數", () => {
    expect(isWhitelisted("glossary.terms.2.oldNames.0")).toBe(true);
    expect(isWhitelisted("glossary.terms.2.oldNames")).toBe(true);
    expect(isWhitelisted("glossary.terms.2.definition")).toBe(false);
    // V3-2c：glossary 分組另外收了指標定義（basis，原 labels.basis）與舊名對照（aliases），這兩塊原本就不屬於小辭典，掃描時排除，範圍與 V3-2b 相同。
    const dictionary = Object.fromEntries(Object.entries(labels.glossary).filter(([key]) => key !== "basis" && key !== "aliases"));
    const { metrics } = scanLabels({ glossary: dictionary, whatsNew: labels.whatsNew });
    expect(metrics.blacklistSynonym).toBe(0);
    expect(metrics.blacklistJargon).toBe(0);
    expect(metrics.placeholderMalformed).toBe(0);
  });
});

describe("名詞小辭典搜尋", () => {
  it.each(V2_OLD_NAMES)("輸入舊名「%s」找得到新名詞", oldName => {
    const results = searchGlossary(oldName);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].aliases.some(alias => alias.includes(oldName))).toBe(true);
  });

  it("舊名「通路貢獻」第一筆是扣廣告前貢獻，並附定義", () => {
    const [first] = searchGlossary("通路貢獻");
    expect(first.term).toBe("扣廣告前貢獻");
    expect(first.definition).toContain("還沒扣廣告");
  });

  it("比對忽略大小寫、全形與空白；空字串回傳全部；找不到時回傳空陣列", () => {
    expect(normalizeGlossaryQuery(" Ｍｅｒ ")).toBe("mer");
    expect(searchGlossary("mer")[0].term).toBe("廣告效率（MER）");
    expect(searchGlossary("")).toHaveLength(glossaryEntries().length);
    expect(searchGlossary("不存在的名詞xyz")).toEqual([]);
  });

  it("basis.aliases 的舊名併入搜尋（以英文欄名對應）", () => {
    const entries = glossaryEntries([{ term: "扣廣告後貢獻", short: "", definition: "d", englishKey: "contribution_after_marketing", oldNames: [] }], { contribution_after_marketing: ["邊際貢獻"] });
    expect(entries[0].aliases).toEqual(["邊際貢獻"]);
    expect(searchGlossary("邊際貢獻", entries)).toHaveLength(1);
  });

  it("英文欄名只顯示匯出檔會出現的 key（指標與 basis_note），labels 內部 key 不顯示", () => {
    const byTerm = new Map(glossaryEntries().map(entry => [entry.term, entry]));
    expect(byTerm.get("扣廣告前貢獻")?.exportKey).toBe("contribution_before_marketing");
    expect(byTerm.get("解讀限制")?.exportKey).toBe("basis_note");
    expect(byTerm.get("指標定義")?.exportKey).toBe("");
    expect(html("指標定義")).not.toContain("basis.title");
  });

  it("v2 舊名對照每個舊名一列，指向這一版的名詞", () => {
    const renames = glossaryRenames();
    expect(renames).toContainEqual({ oldName: "通路貢獻", term: "扣廣告前貢獻" });
    expect(renames).toContainEqual({ oldName: "廣告投報（MER）", term: "廣告效率（MER）" });
    expect(renames).toContainEqual({ oldName: "行動", term: "待辦" });
  });
});

describe("名詞小辭典畫面（SSR）", () => {
  it("用舊名搜尋時只列出對應的名詞，並顯示舊名與筆數", () => {
    const markup = html("通路貢獻");
    expect(markup).toContain('data-testid="glossary-search"');
    expect(markup).toContain(escape(labels.glossary.searchLabel));
    expect(markup).toContain("<dt>扣廣告前貢獻</dt>");
    expect(markup).not.toContain("<dt>淨營收</dt>");
    expect(markup).toContain(escape(fill(labels.glossary.oldNamesLine, { names: ["通路貢獻", "行銷前貢獻"].join(labels.glossary.listSeparator) })));
    expect(markup).toContain(escape(fill(labels.glossary.resultCount, { n: searchGlossary("通路貢獻").length })));
  });

  it("找不到時顯示說明，不顯示空清單", () => {
    const markup = html("不存在的名詞xyz");
    expect(markup).toContain(escape(fill(labels.glossary.noResult, { query: "不存在的名詞xyz" })));
    expect(markup).not.toContain("glossary-list");
  });

  it("「v2 舊名」段落有錨點，列出舊名 → 新名詞；不受搜尋影響", () => {
    const markup = html("淨營收");
    expect(markup).toContain(`id="${GLOSSARY_V2_SECTION_ID}"`);
    expect(markup).toContain(escape(labels.glossary.v2Heading));
    expect(markup).toContain("<td>通路貢獻</td><td>扣廣告前貢獻</td>");
  });

  it("業界說法對照（D-V3-18）：CM1／CM2 只出現在指標定義對話框，並寫明不宣稱等同", () => {
    const markup = html("");
    expect(markup).toContain(escape(labels.glossary.industryHeading));
    expect(markup).toContain("CM1");
    expect(markup).toContain("CM2");
    expect(labels.glossary.industryRows.find(row => row.ours === "扣廣告前貢獻")?.difference).toContain("不宣稱等同");
    expect(labels.glossary.industryRows.find(row => row.ours === "扣廣告後貢獻")?.difference).toContain("不是淨利");
  });

  it("對話框標題取 labels.basis.title，保留 basis-dialog testid，並內含搜尋框", () => {
    const markup = renderToStaticMarkup(createElement(BasisDialog, { open: true, onClose: () => undefined }));
    expect(markup).toContain('data-testid="basis-dialog"');
    expect(markup).toContain(`>${escape(labels.basis.title)}</h2>`);
    expect(markup).toContain('data-testid="glossary-search"');
    for (const item of labels.basis.items) expect(markup).toContain(escape(item));
    expect(renderToStaticMarkup(createElement(BasisDialog, { open: false, onClose: () => undefined }))).toBe("");
  });
});
