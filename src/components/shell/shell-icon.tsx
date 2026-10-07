// V3-3 A1 殼層用的線框 icon（inline SVG，不加套件）。只畫圖形，一律 aria-hidden；語意由旁邊的文字或按鈕的 aria-label 承擔。
const PATHS: Record<string, string> = {
  overview: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  diagnosis: "M4 20V10 M10 20V4 M16 20v-7 M21 20H3",
  products: "M3 7.5 12 3l9 4.5v9L12 21l-9-4.5z M3 7.5 12 12l9-4.5 M12 12v9",
  scenarios: "M3 3v18h18 M7 15l4-4 3 3 5-6",
  actions: "M9 6h11 M9 12h11 M9 18h11 M4 6h.01 M4 12h.01 M4 18h.01",
  meeting: "M3 5h18v16H3z M3 10h18 M8 3v4 M16 3v4",
  data: "M3 4h18v16H3z M3 10h18 M9 10v10",
  validation: "M9 3h6 M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3",
  lens: "M4 18V6h5v12 M13 18V3h6v15 M3 21h18",
  chevron: "m6 9 6 6 6-6",
  /** V3-4a 代理 C：警示列（C9）展開指示，收合時朝右、展開時轉 90 度朝下。 */
  "chevron-right": "m9 6 6 6-6 6",
  /** V3-4a 代理 C：`?` 說明觸發器（C14）。 */
  help: "M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z M9.5 9.5a2.5 2.5 0 0 1 4.6 1.3c0 1.7-2.1 2-2.1 3.4 M12 17h.01",
  book: "M2 5h6a4 4 0 0 1 4 4v11a3 3 0 0 0-3-3H2z M22 5h-6a4 4 0 0 0-4 4v11a3 3 0 0 1 3-3h7z",
  ai: "M4 6h16v12H4z M9 11h.01 M15 11h.01 M9 15h6",
  more: "M5 12h.01 M12 12h.01 M19 12h.01",
  import: "M12 4v11 M7 10l5 5 5-5 M5 20h14",
  // V3-4a 總覽：複製週會摘要、`?` 定義按鈕、勾（已平衡、已複製）。
  copy: "M10 8h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2z M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2",
  check: "M5 12l5 5 9-10",
  // V3-5 代理 A：可排序欄頭（C3）。未排序是上下兩個小箭頭；由低到高箭頭朝上，由高到低朝下。
  sort: "M8 9l4-4 4 4 M8 15l4 4 4-4",
  "sort-asc": "M12 19V5 M7 10l5-5 5 5",
  "sort-desc": "M12 5v14 M7 14l5 5 5-5",
  /** V3-5 代理 C：計算與來源抽屜標題列的關閉 icon 按鈕（C6）。 */
  close: "M6 6l12 12 M18 6 6 18",
  /** V3-6 代理 B：看板卡置頂 icon 按鈕（C13）。未置頂是線框星；置頂用同一個外形，由呼叫端加 class（globals.css `.icon-filled`）填實心。 */
  star: "M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.7l5.9-.9z",
  "star-filled": "M12 3.5l2.6 5.3 5.9.9-4.25 4.15 1 5.85L12 16.95 6.75 19.7l1-5.85L3.5 9.7l5.9-.9z",
  /** V3-6 代理 B：編輯（鉛筆）。 */
  edit: "M4 20h4L19 9a2.1 2.1 0 0 0-3-3L5 17z M14 7l3 3",
};

export function ShellIcon({ name, size = 20, className }: { name: keyof typeof PATHS | string; size?: number; className?: string }) {
  return <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={name === "more" ? 3 : 1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={PATHS[name] ?? PATHS.data} /></svg>;
}
