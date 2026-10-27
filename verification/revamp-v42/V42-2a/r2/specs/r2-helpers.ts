// R2 review helpers (read-only review of V42-2a). Reuses repo E2E helpers; writes only under the r2 scratchpad.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, type Locator, type Page, type TestInfo } from "@playwright/test";
import { decisionSignature } from "/Users/j-work/ProfitLens/src/application/decision";
import { fill, labels } from "/Users/j-work/ProfitLens/src/i18n";
import { closePeriodSheet, closeStorage, dismissSavePrompt, isMobile, navigateTo, openDetails, openMeeting, openPeriodSheet, openStorage, periodSummary, periodSummaryVisibleText } from "/Users/j-work/ProfitLens/tests/e2e/replacement-helpers";

export const R2 = "/private/tmp/claude-502/-Users-j-work-ProfitLens/dbb9107e-e7d5-4aed-a614-47ec6e660af0/scratchpad/v42/v42-2a/r2";
export const ui = labels.data.channelSettingsV42;
export const v42 = labels.diagnosis.channelsV42;
export const storageCopy = labels.storage.workspace;
export const MANIFEST = ["DTC", "LIVE", "MARKETPLACE", "SOCIAL"] as const;
export const NAMES: Record<string, string> = { DTC: "官網", SOCIAL: "社群", MARKETPLACE: "蝦皮", LIVE: "直播" };
export const G1 = "自有", G2 = "平台";
export const KPI_METRICS = ["net_revenue", "gross_profit", "contribution_before_marketing", "contribution_after_marketing", "contribution_margin"] as const;

export const editor = (page: Page) => page.getByTestId("channel-settings");
export const labelInput = (page: Page, code: string) => editor(page).getByLabel(fill(ui.rowAria.label, { code }), { exact: true });
export const groupSelect = (page: Page, code: string) => editor(page).getByLabel(fill(ui.rowAria.group, { code }), { exact: true });
export const groupNameInput = (page: Page, n: number) => editor(page).getByLabel(fill(ui.groups.nameLabel, { n }), { exact: true });
export const applyButton = (page: Page) => editor(page).getByRole("button", { name: ui.buttons.apply, exact: true });
export const statusLine = (page: Page) => editor(page).locator(".channel-settings-status");
export const storage = (page: Page) => page.getByTestId("workspace-storage");
export const wsStatus = (page: Page) => page.getByTestId("workspace-status");
export const restorePreview = (page: Page) => page.getByRole("region", { name: storageCopy.restorePreviewAria });
export const scopeSelect = (page: Page) => page.getByTestId("scope-select");
export const viewContent = (page: Page) => page.locator(".view-content");
export const periodBar = (page: Page) => page.locator(".period-bar");
export const drillButtons = (root: Locator) => root.locator("[data-testid^='channel-drill-']");
export const metaValue = (page: Page, term: string) => page.getByTestId("data-scope").locator("dl > div").filter({ has: page.locator("dt", { hasText: term }) }).locator("dd");

/** Observations per test, dumped to obs/<name>.json at the end. */
export class Obs {
  data: Record<string, unknown> = {};
  constructor(public name: string) {}
  set(key: string, value: unknown) { this.data[key] = value; this.data.lastStep = key; this.save(); }
  push(key: string, value: unknown) { const list = (this.data[key] as unknown[] | undefined) ?? []; list.push(value); this.data[key] = list; }
  save() { mkdirSync(`${R2}/obs`, { recursive: true }); writeFileSync(`${R2}/obs/${this.name}.json`, JSON.stringify(this.data, null, 2)); }
}

export function collectConsole(page: Page, obs: Obs) {
  page.on("pageerror", error => obs.push("pageerrors", error.message));
  page.on("console", message => { const type = message.type(); if (type === "error" || type === "warning") obs.push("console", { type, text: message.text().slice(0, 500) }); });
}

export async function shot(page: Page, testInfo: TestInfo, name: string, options: Parameters<Page["screenshot"]>[0] = {}) {
  const dir = `${R2}/shots/${testInfo.project.name}`;
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/${name}.png`;
  await page.screenshot({ path, animations: "disabled", caret: "hide", scale: "css", ...options });
  return path;
}
export async function shotOf(locator: Locator, testInfo: TestInfo, name: string) {
  const dir = `${R2}/shots/${testInfo.project.name}`;
  mkdirSync(dir, { recursive: true });
  const path = `${dir}/${name}.png`;
  await locator.screenshot({ path, animations: "disabled", caret: "hide", scale: "css" });
  return path;
}

export const box = async (locator: Locator) => { const b = await locator.boundingBox(); return b ? { x: Math.round(b.x * 10) / 10, y: Math.round(b.y * 10) / 10, width: Math.round(b.width * 10) / 10, height: Math.round(b.height * 10) / 10 } : null; };

/** Structure of the scope <select>: option groups and flat option list. */
export const selectModel = (page: Page) => scopeSelect(page).evaluate(node => {
  const select = node as HTMLSelectElement;
  const groups = [...select.querySelectorAll("optgroup")].map(group => ({ label: group.label, options: [...group.querySelectorAll("option")].map(option => ({ value: option.value, text: option.textContent ?? "", testid: option.dataset.testid ?? null, disabled: option.disabled })) }));
  const topLevel = [...select.children].filter(child => child.tagName === "OPTION").map(option => ({ value: (option as HTMLOptionElement).value, text: option.textContent ?? "", disabled: (option as HTMLOptionElement).disabled }));
  const selected = select.selectedOptions[0];
  const parent = selected?.parentElement;
  return { value: select.value, selected: selected ? { value: selected.value, text: selected.textContent ?? "", group: parent instanceof HTMLOptGroupElement ? parent.label : null, disabled: selected.disabled, testid: selected.dataset.testid ?? null } : null, groups, topLevel, optionTexts: [...select.options].map(option => option.textContent ?? "") };
});

export const kpiValues = async (page: Page) => {
  const out: Record<string, string> = {};
  for (const name of KPI_METRICS) out[name] = (await page.getByTestId(`kpi-${name}`).locator(".kpi-value").textContent()) ?? "";
  return out;
};

export const activeDesc = (page: Page) => page.evaluate(() => { const a = document.activeElement as HTMLElement | null; if (!a) return "none"; return `${a.tagName.toLowerCase()}${a.id ? "#" + a.id : ""}${a.getAttribute("data-testid") ? "[" + a.getAttribute("data-testid") + "]" : ""}:${(a.textContent ?? "").trim().slice(0, 30)}`; });

/** Open the data page editor. */
export async function openEditor(page: Page) {
  await navigateTo(page, "data");
  await expect(page.getByTestId("targets-entry")).toBeVisible();
  await openDetails(editor(page));
  await expect(editor(page)).toHaveAttribute("open", "");
}
export async function applySettings(page: Page) {
  await applyButton(page).click();
  await expect(statusLine(page)).toHaveText(ui.applied);
  await expect(editor(page).getByRole("alert")).toHaveCount(0);
  await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
}
/** Four display names + two groups (自有＝DTC＋SOCIAL、平台＝MARKETPLACE＋LIVE), apply. */
export async function configureGroups(page: Page) {
  await openEditor(page);
  for (const code of MANIFEST) await labelInput(page, code).fill(NAMES[code]);
  const addGroup = editor(page).getByRole("button", { name: ui.buttons.addGroup, exact: true });
  await addGroup.click();
  await expect(editor(page).getByTestId("channel-settings-group-g1")).toBeVisible();
  await groupNameInput(page, 1).fill(G1);
  await addGroup.click();
  await expect(editor(page).getByTestId("channel-settings-group-g2")).toBeVisible();
  await groupNameInput(page, 2).fill(G2);
  for (const [code, group] of [["DTC", "g1"], ["SOCIAL", "g1"], ["MARKETPLACE", "g2"], ["LIVE", "g2"]] as const) await groupSelect(page, code).selectOption(group);
  await applySettings(page);
  await expect(metaValue(page, labels.data.panel.meta.channels)).toHaveText(MANIFEST.map(code => NAMES[code]).join("、"));
}

export interface ChooseInfo { mobile: boolean; expandedAfterSelect: string | null; activeAfterSelect: string; toggleBefore: string | null; toggleAfter: string | null; activeAfterClose: string }
/** Pick an option by label (390: open the sheet first) and wait for the recompute; records the sheet behaviour on 390. */
export async function chooseScope(page: Page, pick: { label?: string; value?: string }, expectValue: string): Promise<ChooseInfo> {
  await openPeriodSheet(page);
  const toggle = page.getByTestId("period-toggle");
  const mobile = isMobile(page);
  const toggleBefore = mobile ? await toggle.textContent() : null;
  await scopeSelect(page).focus();
  await scopeSelect(page).selectOption(pick.label !== undefined ? { label: pick.label } : { value: pick.value! });
  await expect(scopeSelect(page)).toHaveValue(expectValue);
  await expect(page.getByTestId("period-bar")).not.toHaveAttribute("aria-busy", "true");
  await expect(viewContent(page)).not.toHaveAttribute("aria-busy", "true");
  const info: ChooseInfo = { mobile, expandedAfterSelect: mobile ? await toggle.getAttribute("aria-expanded") : null, activeAfterSelect: await activeDesc(page), toggleBefore, toggleAfter: mobile ? await toggle.textContent() : null, activeAfterClose: "" };
  await closePeriodSheet(page);
  info.activeAfterClose = await activeDesc(page);
  return info;
}

export const summaryTitle = (page: Page) => periodSummary(page).getAttribute("title");
export { periodSummaryVisibleText };

export async function backup(page: Page) {
  await openStorage(page);
  const [file] = await Promise.all([page.waitForEvent("download"), storage(page).getByRole("button", { name: labels.storage.buttons.downloadBackup, exact: true }).click()]);
  const text = readFileSync((await file.path())!, "utf8");
  await closeStorage(page);
  return text;
}
export async function reloadAndRestore(page: Page, text: string) {
  await page.goto("/");
  await expect(wsStatus(page)).toContainText(labels.shell.status.empty);
  await openStorage(page);
  await storage(page).getByLabel(storageCopy.selectBackupFile, { exact: true }).setInputFiles({ name: "workspace.json", mimeType: "application/json", buffer: Buffer.from(text) });
  await expect(restorePreview(page)).toBeVisible();
  await storage(page).getByRole("button", { name: storageCopy.applyRestore, exact: true }).click();
  await expect(storage(page).getByTestId("storage-notice")).toHaveText(storageCopy.restoredNotice);
  await closeStorage(page);
  await dismissSavePrompt(page);
  await navigateTo(page, "overview");
  await expect(page.getByTestId("kpi-band")).toBeVisible();
}
export function withoutGroups(text: string): string {
  const { checksum: _stale, ...body } = JSON.parse(text);
  void _stale;
  body.payload.channel_settings.groups = [];
  for (const entry of body.payload.channel_settings.channels) delete entry.group;
  return JSON.stringify({ ...body, checksum: createHash("sha256").update(decisionSignature(body), "utf8").digest("hex") });
}

/** Meeting page on the current scope (create if needed, refresh if the view differs). */
export async function meetingOnCurrentScope(page: Page) {
  const meeting = await openMeeting(page);
  if (await meeting.getByTestId("meeting-create").count()) await meeting.getByTestId("meeting-create").click();
  const banner = meeting.getByTestId("review-view-difference");
  if (await banner.count()) { await banner.getByRole("button", { name: labels.meeting.buttons.updateMeetingSource, exact: true }).click(); await expect(banner).toHaveCount(0); }
  return meeting;
}

const AXE_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
export interface AxeRow { id: string; impact: string | null; help: string; targets: string[] }
export async function axeRun(page: Page): Promise<{ all: AxeRow[]; blocking: AxeRow[] }> {
  const path = require.resolve("axe-core/axe.min.js");
  if (!await page.evaluate(() => "axe" in window)) await page.addScriptTag({ path });
  const rows = await page.evaluate(async tags => {
    const axe = (window as unknown as { axe: { run: (context: unknown, options: unknown) => Promise<{ violations: { id: string; impact: string | null; help: string; nodes: { target: unknown[] }[] }[] }> } }).axe;
    const result = await axe.run({ exclude: [["nextjs-portal"]] }, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations"] });
    return result.violations.map(item => ({ id: item.id, impact: item.impact, help: item.help, targets: item.nodes.slice(0, 5).map(node => JSON.stringify(node.target)) }));
  }, AXE_TAGS);
  return { all: rows, blocking: rows.filter(row => row.impact === "serious" || row.impact === "critical") };
}
/** Visible focusable elements inside aria-hidden="true" subtrees. */
export const hiddenFocusables = (page: Page) => page.evaluate(() => {
  const sel = "a[href],button,input,select,textarea,[tabindex]:not([tabindex='-1']),summary";
  return [...document.querySelectorAll<HTMLElement>(sel)].filter(e => e.closest("[aria-hidden='true']") && e.getClientRects().length > 0 && !(e as HTMLButtonElement).disabled && getComputedStyle(e).visibility !== "hidden").map(e => `${e.tagName.toLowerCase()}#${e.id}.${e.className}[${e.getAttribute("data-testid") ?? ""}]`);
});

/** Focus the previous tabbable element (DOM order) and press Tab; report whether the target received focus. */
export async function tabTo(page: Page, target: Locator) {
  await target.scrollIntoViewIfNeeded();
  const from = await target.evaluate(el => {
    const sel = "a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex='-1']),summary";
    const all = [...document.querySelectorAll<HTMLElement>(sel)].filter(e => e.getClientRects().length > 0 && !e.closest("[aria-hidden='true']") && getComputedStyle(e).visibility !== "hidden" && !e.closest("details:not([open]) > :not(summary)"));
    const index = all.indexOf(el as HTMLElement);
    if (index <= 0) return null;
    const prev = all[index - 1];
    prev.focus();
    return `${prev.tagName.toLowerCase()}[${prev.getAttribute("data-testid") ?? ""}]:${(prev.textContent ?? "").trim().slice(0, 30)}`;
  });
  await page.keyboard.press("Tab");
  const reached = await target.evaluate(el => el === document.activeElement);
  const focus = await target.evaluate(el => { const cs = getComputedStyle(el); return { focusVisible: el.matches(":focus-visible"), outlineStyle: cs.outlineStyle, outlineWidth: cs.outlineWidth, outlineColor: cs.outlineColor, outlineOffset: cs.outlineOffset }; });
  return { from, reached, active: await activeDesc(page), focus };
}

/** Where (which testid ancestor) a text appears inside <main>. */
export const textOwners = (page: Page, needle: string) => page.evaluate(needle => {
  const main = document.querySelector("main"); if (!main) return [];
  const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
  const out: string[] = [];
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (!(node.textContent ?? "").includes(needle)) continue;
    const el = node.parentElement!;
    if (el.closest("[hidden]")) continue;
    const owner = el.closest("[data-testid]");
    out.push(`${owner?.getAttribute("data-testid") ?? "(no testid)"} > ${el.tagName.toLowerCase()}.${el.className}: ${(node.textContent ?? "").trim().slice(0, 50)}`);
    if (out.length >= 12) break;
  }
  return out;
}, needle);

/** Text measurement for a select's selected option against its box (native select clips the text). */
export const selectTextFit = (page: Page) => scopeSelect(page).evaluate(node => {
  const select = node as HTMLSelectElement;
  const cs = getComputedStyle(select);
  const canvas = document.createElement("canvas").getContext("2d")!;
  canvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
  const text = select.selectedOptions[0]?.textContent ?? "";
  const textWidth = canvas.measureText(text).width;
  const inner = select.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  return { text, textWidth: Math.round(textWidth), clientWidth: select.clientWidth, innerWidth: Math.round(inner), overflow: textWidth > inner, maxWidth: cs.maxWidth };
});

export { closePeriodSheet, dismissSavePrompt, isMobile, labels, fill, navigateTo, openDetails, openMeeting, openPeriodSheet, periodSummary };
