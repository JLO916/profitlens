import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { argb, EXPORT_THEME, EXPORT_THEME_TOKENS } from "@/application/export-theme";

// V3-7 PRD §9.6：PDF、PPT、Excel 用到的色碼集中在 src/application/export-theme.ts，值與 globals.css :root 的語意 token 一一對應；
// 匯出程式碼的其他地方不得出現 hex。這裡解析 :root（把 --xxx: var(--yyy) 解到底）逐一比對。

const GLOBALS = readFileSync(resolve("src/app/globals.css"), "utf8");
/** 第一個 :root { … } 區塊的自訂屬性（不含 @media 內的覆寫）。 */
function rootTokens(css: string): Map<string, string> {
  const start = css.indexOf(":root {");
  expect(start).toBeGreaterThanOrEqual(0);
  const end = css.indexOf("\n}", start);
  const body = css.slice(start + ":root {".length, end).replace(/\/\*[\s\S]*?\*\//g, "");
  return new Map([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(match => [match[1], match[2].trim()]));
}
/** var(--a) → var(--b) → #hex：解到底（循環或找不到就丟錯）。 */
function resolveToken(tokens: Map<string, string>, name: string, seen: string[] = []): string {
  if (seen.includes(name)) throw new Error(`token 循環：${[...seen, name].join(" → ")}`);
  const value = tokens.get(name);
  if (value === undefined) throw new Error(`:root 沒有 ${name}`);
  const reference = /^var\((--[\w-]+)\)$/.exec(value);
  return reference ? resolveToken(tokens, reference[1], [...seen, name]) : value;
}
const hex = (value: string) => value.replace(/^#/, "").toUpperCase();

describe("V3-7 export-theme：匯出色碼與 globals.css :root 一一對應", () => {
  const tokens = rootTokens(GLOBALS);

  it("每個顏色都對到一個 :root token，解到底的 hex 相同", () => {
    expect(Object.keys(EXPORT_THEME_TOKENS).sort()).toEqual(Object.keys(EXPORT_THEME).sort());
    for (const [key, token] of Object.entries(EXPORT_THEME_TOKENS)) {
      const resolved = resolveToken(tokens, token);
      expect(resolved, `${key} ← ${token}`).toMatch(/^#[0-9a-fA-F]{6}$/);
      expect(EXPORT_THEME[key as keyof typeof EXPORT_THEME], `${key} ← ${token}（${resolved}）`).toBe(hex(resolved));
    }
  });

  it("§9.6 指定值：品牌 #1f5a4f、不利 #b03a2e、Excel 表頭底 #f1f3f3；有利不上色（D-V3-7：同主文字色）", () => {
    expect(EXPORT_THEME.brand).toBe("1F5A4F");
    expect(resolveToken(tokens, "--accent")).toBe("#1f5a4f");
    expect(EXPORT_THEME.unfavorable).toBe("B03A2E");
    expect(EXPORT_THEME.headerFill).toBe("F1F3F3");
    expect(EXPORT_THEME.favorable).toBe(EXPORT_THEME.ink);
    expect(tokens.get("--favorable")).toBe("var(--text-primary)");
    for (const value of Object.values(EXPORT_THEME)) expect(value).toMatch(/^[0-9A-F]{6}$/);
    expect(argb(EXPORT_THEME.headerFill)).toBe("FFF1F3F3");
  });

  it("列印字級 token：--print-title 14pt、--print-body 10pt、--print-note 8pt，放在 :root", () => {
    expect([tokens.get("--print-title"), tokens.get("--print-body"), tokens.get("--print-note")]).toEqual(["14pt", "10pt", "8pt"]);
  });

  it("匯出程式碼與列印版面不寫死色碼：PPT、Excel、列印版元件與其 CSS 都沒有 hex（只在 export-theme.ts 與 :root）", () => {
    const HEX = /#?\b[0-9a-fA-F]{6}\b/g;
    const strip = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    for (const file of ["src/application/pptx-export.ts", "src/application/excel-export.ts", "src/application/export-header.ts", "src/components/print-summary.tsx", "src/components/manager-summary.module.css"]) {
      const found = (strip(readFileSync(resolve(file), "utf8")).match(HEX) ?? []).filter(value => /[a-fA-F]/.test(value) || value.startsWith("#"));
      expect(found, file).toEqual([]);
    }
  });
});
