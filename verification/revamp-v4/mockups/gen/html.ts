import { fill, labels } from "@/i18n";
import { esc } from "./format";

// 設計稿 HTML 的共用片段：H5 待審字串、v4 變更標示、ChartFrame（C16）骨架、圖例、資料表 <details>。
// 類別名稱盡量沿用產品的 globals.css（chart-section、sec-head、chart-frame、data-alternative、kv …），對應的設計稿樣式在 ../mockups.css。

/** 一個 H5 待審的新字串（V4-n 才進 labels 的 `{group}.chartsV4.*`）。 */
export interface Proposal { key: string; text: string; chart: string; note?: string }

/** 每頁收集自己用到的新字串，寫進 mockup-data.json 與頁尾清單，H5 一次審。 */
export class ProposalBook {
  readonly items: Proposal[] = [];
  /** 回傳帶標記的 HTML（切換「標示新字串」時加底線）；同一個 key 只登記一次。 */
  mark(key: string, text: string, chart: string, note?: string): string {
    this.add(key, text, chart, note);
    return `<span class="proposal" data-proposal-key="${esc(key)}">${esc(text)}</span>`;
  }
  /** 只登記、不包標記（例如放在 SVG 文字、aria-label 或 title 裡的字串）。 */
  note(key: string, text: string, chart: string, note?: string): string {
    this.add(key, text, chart, note);
    return text;
  }
  /** 同一個 key 只登記第一次出現的字串（模板代入後的示例）。 */
  private add(key: string, text: string, chart: string, note?: string): void {
    if (!this.items.some(item => item.key === key)) this.items.push({ key, text, chart, note });
  }
}

/** v4 變更標示：切換「標示 v4 變更」時外框與左上角標籤可見；不改版面。 */
export function v4(note: string): string {
  return ` data-v4-note="${esc(note)}"`;
}

/** 「設計稿試算」標記：B 級整理函式尚不存在，設計稿以產生器內的一次性計算代替，正式數字由該批的函式產生。 */
export function trialNote(text: string): string {
  return `<p class="mockup-trial" role="note">${esc(text)}</p>`;
}

export type LegendShape = "line" | "dash" | "tick" | "ring" | "rect";
export interface LegendItem { label: string; color: string; shape?: LegendShape; note?: string }

/** C16 圖例：12×2 線段（line）、虛線段（dash）、2×12 刻度（tick）、空心圓（ring）、空心矩形（rect）；不畫實心圓點或方塊（X32）。 */
export function legendHtml(items: readonly LegendItem[]): string {
  const mark = (item: LegendItem) => {
    switch (item.shape ?? "line") {
      case "dash": return `<svg class="legend-mark" width="12" height="2" viewBox="0 0 12 2" aria-hidden="true"><line x1="0" y1="1" x2="12" y2="1" stroke="${item.color}" stroke-width="2" stroke-dasharray="4 3"/></svg>`;
      case "tick": return `<svg class="legend-mark" width="2" height="12" viewBox="0 0 2 12" aria-hidden="true"><rect x="0" y="0" width="2" height="12" fill="${item.color}"/></svg>`;
      case "ring": return `<svg class="legend-mark" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"><circle cx="5" cy="5" r="4" fill="none" stroke="${item.color}" stroke-width="1.5"/></svg>`;
      case "rect": return `<svg class="legend-mark" width="12" height="8" viewBox="0 0 12 8" aria-hidden="true"><rect x="0.75" y="0.75" width="10.5" height="6.5" fill="none" stroke="${item.color}" stroke-width="1.5"/></svg>`;
      default: return `<svg class="legend-mark" width="12" height="2" viewBox="0 0 12 2" aria-hidden="true"><rect x="0" y="0" width="12" height="2" fill="${item.color}"/></svg>`;
    }
  };
  return `<div class="legend">${items.map(item => `<span>${mark(item)}${item.label}${item.note ? `<small>${item.note}</small>` : ""}</span>`).join("")}</div>`;
}

export interface FrameOptions {
  id: string;
  testId: string;
  /** 標題（已跳脫或已標記的 HTML）。 */
  title: string;
  subtitle: string;
  className?: string;
  legend?: readonly LegendItem[];
  extra?: string;
  unitNote?: string;
  takeaways?: string;
  height?: "sm" | "lg";
  frameClassName?: string;
  /** chart：固定高容器 aria-hidden；table：熱表，不設 aria-hidden，內含 .table-scroll[role=region]。 */
  mode?: "chart" | "table";
  /** 圖旁欄（G1 橋接表）：DOM 在圖之前，寬螢幕用 grid-template-areas 放回右欄。 */
  aside?: string;
  after?: string;
  /** 資料表 <details>：summary 用 labels.overview.page.dataTable「表格 · {title}」。 */
  dataTable?: { title: string; content: string; open?: boolean };
  /** 固定高容器的行內樣式（例如 G10 依通路數選 sm 或 lg 之外的狀態）；只放 token。 */
  frameStyle?: string;
  v4Note?: string;
  /** 標題層級（CHART_CATALOG §1.1 headingLevel）：預設 2；G13、G14 用 4，G21 用 3。 */
  headingLevel?: 2 | 3 | 4;
  /** panel（預設，section.panel.chart-section）或 inline（section.chart-section.is-inline，放在既有 .panel 內，例如 G21）。 */
  variant?: "panel" | "inline";
  body: string;
}

/** C16 ChartFrame 骨架（PRD §6.1 的 v4 擴充：aside、unitNote、frameClassName、mode、legend[].shape）。 */
export function chartFrame(options: FrameOptions): string {
  const height = options.height ?? "sm";
  const mode = options.mode ?? "chart";
  const end = [options.legend && options.legend.length > 0 ? legendHtml(options.legend) : "", options.extra ?? "", options.unitNote ? `<span class="unit-note">${options.unitNote}</span>` : ""].filter(Boolean).join("");
  const frame = `<div class="chart-frame ${height}${options.frameClassName ? ` ${options.frameClassName}` : ""}"${mode === "chart" ? ` aria-hidden="true"` : ""} data-mode="${mode}"${options.frameStyle ? ` style="${options.frameStyle}"` : ""}>${options.body}</div>`;
  const grid = options.aside ? `<div class="frame-grid has-aside"><div class="frame-aside">${options.aside}</div><div class="frame-main">${frame}</div></div>` : frame;
  const table = options.dataTable ? `<details class="data-alternative"${options.dataTable.open ? " open" : ""}><summary>${esc(fill(labels.overview.page.dataTable, { title: options.dataTable.title }))}</summary>${options.dataTable.content}</details>` : "";
  const heading = `h${options.headingLevel ?? 2}`;
  const sectionClass = options.variant === "inline" ? "chart-section is-inline" : "panel chart-section";
  return `<section class="${sectionClass}${options.className ? ` ${options.className}` : ""}" id="${options.id}" aria-labelledby="${options.id}-title" aria-describedby="${options.id}-sub" data-testid="${options.testId}"${options.v4Note ? v4(options.v4Note) : ""}>
<div class="sec-head"><div class="sec-title"><${heading} id="${options.id}-title">${options.title}</${heading}><p class="sub" id="${options.id}-sub">${options.subtitle}</p></div>${end ? `<div class="sec-end">${end}</div>` : ""}</div>
${options.takeaways ?? ""}${grid}${options.after ?? ""}${table}
</section>`;
}

/** 資料表（C33 慣例的設計稿版）：.table-scroll[role=region] > table，caption 帶單位，數字欄右對齊；number-link 在設計稿是不可點的樣式。 */
export function dataTable(options: { caption: string; head: readonly string[]; rows: readonly (readonly string[])[]; numeric?: readonly boolean[]; testId?: string; className?: string; foot?: readonly string[] }): string {
  const numeric = options.numeric ?? options.head.map((_, index) => index > 0);
  const th = options.head.map((cell, index) => `<th scope="col"${numeric[index] ? ` class="num"` : ""}>${cell}</th>`).join("");
  const body = options.rows.map(row => `<tr>${row.map((cell, index) => index === 0 ? `<th scope="row">${cell}</th>` : `<td${numeric[index] ? ` class="num"` : ""}>${cell}</td>`).join("")}</tr>`).join("");
  const foot = options.foot ? `<tfoot><tr><td colspan="${options.head.length}">${options.foot.join("<br>")}</td></tr></tfoot>` : "";
  return `<div class="table-scroll" role="region" tabindex="0" aria-label="${esc(options.caption.replace(/<[^>]+>/g, ""))}"><table class="ui-table${options.className ? ` ${options.className}` : ""}"${options.testId ? ` data-testid="${options.testId}"` : ""}><caption>${options.caption}</caption><thead><tr>${th}</tr></thead><tbody>${body}</tbody>${foot}</table></div>`;
}

/** 設計稿的 number-link（與產品同外觀：點狀底線）；設計稿不可點，用 span。 */
export function numberLink(text: string, tone?: "negative" | "positive" | "muted"): string {
  return `<span class="number-link${tone ? ` ${tone}` : ""}">${esc(text)}</span>`;
}
