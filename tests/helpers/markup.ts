// SSR markup 小工具（renderToStaticMarkup 的輸出是良構的；只需要成對的同名標籤）。V3-4a 總覽結構與格式測試共用。
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** 與 React 的屬性值跳脫相同（& " < >）。 */
export const escapeAttr = (text: string) => text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** 拿掉標籤，只留文字節點。 */
export const textOf = (html: string) => html.replace(/<[^>]*>/g, "");

/** 回傳含有 `attr` 的那個元素（開始標籤到對應的結束標籤）；找不到回傳 null，有多個時回傳第一個。 */
export function element(html: string, attr: string): string | null {
  const at = html.indexOf(attr);
  if (at < 0) return null;
  const start = html.lastIndexOf("<", at);
  const tag = /^<([a-zA-Z][\w-]*)/.exec(html.slice(start))![1];
  const re = new RegExp(`<(/?)${escapeRe(tag)}(?=[\\s>/])[^>]*?(/?)>`, "g");
  re.lastIndex = start;
  let depth = 0;
  for (let match = re.exec(html); match; match = re.exec(html)) {
    if (match[1]) depth--; else if (!match[2]) depth++;
    if (depth === 0) return html.slice(start, re.lastIndex);
  }
  throw new Error(`元素沒有結束標籤：${attr}`);
}
/** 元素的開始標籤。 */
export const openTag = (html: string, attr: string) => { const el = element(html, attr); return el ? el.slice(0, el.indexOf(">") + 1) : null; };
/** 依 data-testid 取元素；找不到時丟錯，方便測試直接使用。 */
export function byTestId(html: string, testid: string): string {
  const found = element(html, `data-testid="${testid}"`);
  if (found === null) throw new Error(`找不到 data-testid="${testid}"`);
  return found;
}
