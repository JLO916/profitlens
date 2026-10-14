// V41-2a（docs/revamp-v4.1/01_PRD.md §3.3、§3.6）：說明頁的本頁目錄——<nav data-testid="guide-toc"> 內一個 <ol>，每一項是連到頁內錨點（#id）的連結，Tab 順序＝閱讀順序。
// 伺服器元件（不加 "use client"）。說明首頁（段落 #why…#areas）與功能區頁（步驟 #{stepKey}）共用；文字由呼叫端從 guideLabels 解析好再傳進來。

export interface GuideTocItem {
  /** 頁內錨點的 id（不含 #）。 */
  id: string;
  title: string;
}

export function GuideToc({ label, items }: { label: string; items: readonly GuideTocItem[] }) {
  return <nav className="guide-toc" aria-label={label} data-testid="guide-toc">
    <ol>{items.map(item => <li key={item.id}><a className="guide-link" href={`#${item.id}`}>{item.title}</a></li>)}</ol>
  </nav>;
}
