import { channelsLabel } from "@/application/copy";
import { periodPresets } from "@/application/period-presets";
import { formatPeriodL1 } from "@/application/presentation";
import { fill, labels } from "@/i18n";
import { esc, md } from "./format";
import type { ProposalBook } from "./html";
import type { MockupSource } from "./source";

// 設計稿的殼層（v3 已上線、v4 不改）：頂欄、側欄、頁首、期間列、手機底部分頁列、頁尾。
// 字串一律取自 labels；殼層只是讓圖表有上下文，畫法比照 v3.0.0 的截圖（verification/revamp-v4/V4-0a/snapshots），不追求逐像素相同。

export type MockupPage = "overview" | "diagnosis" | "products" | "data";

export interface DocumentOptions {
  page: MockupPage;
  /** <title> 與頁面標示用的名稱（例如「經營總覽 · H5 設計稿」）。 */
  docTitle: string;
  source: MockupSource;
  /** 頁首右側的動作（總覽是「投影模式」）。 */
  headerAction?: string;
  /** 側欄「通路健檢」旁的不利項數。 */
  diagnosisBadge?: number;
  content: string;
  proposals: ProposalBook;
  /** 設計稿橫幅的補充說明（例如「設計稿試算的範圍」）。 */
  bannerNote?: string;
  /** 頁首說明；沒給時用 labels.shell.nav[page].explain（商品毛利頁在 v3 用 products.pageV3.description）。 */
  description?: string;
}

/** 下拉提示的 chevron（inline SVG，不用箭頭字元）。 */
const CHEVRON = `<svg class="chevron" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5" fill="none" stroke="var(--text-tertiary)" stroke-width="1.5"/></svg>`;

const NAV_GROUPS: readonly { key: keyof typeof labels.shell.sidebarV3.groups; items: readonly (keyof typeof labels.shell.nav)[] }[] = [
  { key: "results", items: ["overview"] },
  { key: "causes", items: ["diagnosis", "products"] },
  { key: "decisions", items: ["scenarios", "actions", "meeting"] },
  { key: "data", items: ["data"] },
];

function topbar(source: MockupSource): string {
  const status = fill(labels.shell.dataStatus.button, { source: source.spec.imported ? labels.shell.status.local : labels.shell.status.demo, date: md(source.dataset.manifest.data_as_of) });
  return `<header class="topbar">
<span class="brand"><span class="brand-mark" aria-hidden="true"><svg width="14" height="14" viewBox="0 0 14 14"><rect x="1" y="7" width="3" height="6" fill="var(--on-accent)"/><rect x="5.5" y="4" width="3" height="9" fill="var(--on-accent)"/><rect x="10" y="1" width="3" height="12" fill="var(--on-accent)"/></svg></span>EC ProfitLens</span>
<span class="topbar-chip"><i class="status-dot" aria-hidden="true"></i>${esc(status)}</span>
<span class="topbar-wide"><span class="topbar-text">${esc(labels.shell.status.aiOff)}</span><span class="topbar-btn">${esc(labels.shell.buttons.basis)}</span><span class="topbar-btn">${esc(labels.shell.buttons.save)} <small>${esc(labels.shell.status.unsaved)}</small></span><span class="topbar-btn">${esc(labels.shell.topbarV3.export)}</span></span>
<span class="topbar-more" aria-hidden="true">⋯</span>
</header>`;
}

function sidebar(page: MockupPage, diagnosisBadge: number | undefined): string {
  const groups = NAV_GROUPS.map(group => `<p class="nav-group">${esc(labels.shell.sidebarV3.groups[group.key])}</p>${group.items.map(item => {
    const badge = item === "diagnosis" && diagnosisBadge ? `<span class="nav-badge">${diagnosisBadge}</span>` : item === "meeting" ? `<span class="nav-badge is-accent">${esc(labels.shell.sidebarV3.meetingDraft)}</span>` : "";
    return `<span class="nav-item"${item === page ? ` aria-current="page"` : ""}><i class="nav-icon" aria-hidden="true"></i>${esc(labels.shell.nav[item].headline)}${badge}</span>`;
  }).join("")}`).join("");
  return `<nav class="sidebar" aria-label="${esc(labels.shell.sidebar.mainNavAria)}">${groups}</nav>`;
}

function periodBar(source: MockupSource): string {
  const { report } = source.snapshot;
  const anchor = source.snapshot.data_as_of;
  const presets = periodPresets(source.dataset.manifest, { previous: report.previous.period, current: report.current.period, comparison_mode: report.scope.comparison_mode });
  const current = formatPeriodL1(report.current.period.start, report.current.period.end, { days: false, anchor });
  const previous = formatPeriodL1(report.previous.period.start, report.previous.period.end, { days: false, anchor });
  const summary = report.comparison.previous_days === report.comparison.current_days
    ? fill(labels.shell.periodBarV3.summary, { current, previous, days: report.comparison.current_days })
    : fill(labels.shell.periodBarV3.summaryUnequal, { current, previous, currentDays: report.comparison.current_days, previousDays: report.comparison.previous_days });
  const yoy = presets.find(preset => preset.id === "yoy");
  const yoyNote = yoy && yoy.status === "unavailable" ? `<p class="needs-attention">${esc(fill(labels.shell.banner.yoyUnavailable, { reason: yoy.reason }))}</p>` : "";
  const allChannels = report.scope.channels.length === source.dataset.manifest.channels.length;
  const channel = allChannels ? labels.shell.periodBar.filter.allChannels : channelsLabel(report.scope.channels, source.alias);
  const toggle = fill(labels.shell.periodBarV3.toggle, { preset: labels.shell.periodBarV3.custom, range: current });
  return `<div class="period-bar" role="region" aria-label="${esc(labels.shell.periodBarV3.regionAria)}">
<div class="period-wide"><span class="select-like">${esc(channel)}</span><span class="preset-seg">${presets.map(preset => `<span class="preset${preset.status === "unavailable" ? " is-disabled" : ""}">${esc(preset.label)}</span>`).join("")}</span><span class="period-summary">${esc(summary)}</span><span class="ui-btn ui-btn-secondary period-custom">${esc(labels.shell.periodBarV3.custom)} ${CHEVRON}</span></div>
<div class="period-narrow"><span class="select-like is-wide">${esc(toggle)}${CHEVRON}</span></div>
</div>${yoyNote}`;
}

function bottomNav(page: MockupPage): string {
  const tabs = labels.shell.mobileNav.tabs;
  const items: [string, string][] = [["overview", tabs.overview], ["diagnosis", tabs.diagnosis], ["actions", tabs.actions], ["meeting", tabs.meeting], ["more", labels.shell.mobileNav.more]];
  const active = page === "overview" || page === "diagnosis" ? page : "more";
  return `<nav class="mobile-tabbar" aria-label="${esc(labels.shell.mobileNav.aria)}">${items.map(([id, label]) => `<span class="tab-item"${id === active ? ` aria-current="page"` : ""}><i class="nav-icon" aria-hidden="true"></i>${esc(label)}</span>`).join("")}</nav>`;
}

const TOGGLE_SCRIPT = `<script>
// 設計稿切換（只切 body 的 class，不改內容）：標示 v4 變更、標示 H5 待審新字串；另有各圖自己的狀態切換（data-switch）。
document.querySelectorAll("[data-toggle]").forEach(function (input) {
  input.addEventListener("change", function () { document.body.classList.toggle(input.getAttribute("data-toggle"), input.checked); });
});
document.querySelectorAll("[data-switch]").forEach(function (button) {
  button.addEventListener("click", function () {
    var group = button.getAttribute("data-switch"), value = button.getAttribute("data-value");
    document.querySelectorAll('[data-switch="' + group + '"]').forEach(function (other) { other.setAttribute("aria-pressed", String(other === button)); });
    document.querySelectorAll('[data-switch-panel="' + group + '"]').forEach(function (panel) { panel.hidden = panel.getAttribute("data-value") !== value; });
  });
});
</script>`;

/** 整頁 HTML：設計稿橫幅（不屬於產品）＋殼層＋內容＋待審字串清單。 */
export function pageDocument(options: DocumentOptions): string {
  const { page, source } = options;
  const nav = labels.shell.nav[page];
  const proposals = options.proposals.items;
  const proposalList = proposals.length === 0 ? "" : `<details class="mockup-proposals"><summary>本頁新字串（H5 待審，${proposals.length} 個）</summary><table class="ui-table"><thead><tr><th scope="col">預計 labels key</th><th scope="col">字串</th><th scope="col">圖</th><th scope="col">說明</th></tr></thead><tbody>${proposals.map(item => `<tr><td><code>${esc(item.key)}</code></td><td>${esc(item.text)}</td><td>${esc(item.chart)}</td><td>${esc(item.note ?? "")}</td></tr>`).join("")}</tbody></table></details>`;
  return `<!doctype html>
<html lang="zh-Hant-TW">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(options.docTitle)}</title>
<link rel="stylesheet" href="tokens.css">
<link rel="stylesheet" href="mockups.css">
</head>
<body class="mockup" data-page="${page}">
<div class="mockup-banner" role="note"><strong>靜態設計稿，不是產品畫面</strong><span>${esc(nav.headline)} · 數字取自${esc(source.spec.label)}，由既有 domain／application 函式算出${options.bannerNote ? ` · ${esc(options.bannerNote)}` : ""}</span><span class="mockup-toggles"><label><input type="checkbox" data-toggle="show-v4"> 標示 v4 變更</label><label><input type="checkbox" data-toggle="show-proposals"> 標示新字串（H5 待審）</label><a href="index.html">設計稿目錄</a></span></div>
<div class="app-shell">
${topbar(source)}
${sidebar(page, options.diagnosisBadge)}
<div class="main-shell"><main id="main-content">
<div class="page-heading"><div class="page-heading-text"><h1>${esc(nav.headline)}</h1><p>${esc(options.description ?? nav.explain)}</p></div>${options.headerAction ?? ""}</div>
${periodBar(source)}
<div class="view-content">
${options.content}
</div>
<footer class="main-footer"><p>${esc(labels.glossary.basis.footer)}<span class="footer-basis">${esc(labels.shell.buttons.basis)}</span><span aria-hidden="true"> · </span>${esc(labels.shell.sidebar.sidebarFooter)}</p></footer>
${proposalList}
</main></div>
${bottomNav(page)}
</div>
${TOGGLE_SCRIPT}
</body>
</html>
`;
}
