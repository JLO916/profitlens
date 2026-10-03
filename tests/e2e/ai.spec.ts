import { clickReplacing, dismissSavePrompt, openValidation, startChannelContext } from "./replacement-helpers";
import { chooseBasis, commitWizard, confirmAndCheck, confirmMappingIfShown, nextFromFiles, openWizard, setWizardFiles, setWizardManifest, wizard, wizardRoles, type FilePayload, type WizardRole } from "./import-wizard-helpers";
import { fill, labels } from "../../src/i18n";
import { appendFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { test as base, expect, type Page } from "@playwright/test";

// R2: every user-visible string comes from the label dictionary; compose text the same way the components do.
const ai = labels.ui.aiPanel;
const aiReason = (reason: string) => labels.ui.aiClient.reasons[reason as keyof typeof labels.ui.aiClient.reasons];
const cmLabel = labels.metrics.contribution_after_marketing.label;
/** grounding.ts observationCatalog: a live observation must match the catalog template byte-for-byte, so build it from the same labels. */
const grounding = labels.ui.grounding;
const valueObservation = (period: "previous" | "current", metricLabel: string, token: string) => fill(grounding.observationValue, { subject: fill(grounding.subject, { period: period === "previous" ? labels.periods.previous : labels.periods.current, metric: metricLabel }), value: token });
/** dashboard.tsx periodFieldLabel: the sr-only date labels drop the "→ 範例" tail of the template. */
const periodFieldLabel = (edge: "start" | "end", period: string) => fill((edge === "start" ? labels.ui.dashboard.filter.periodStart : labels.ui.dashboard.filter.periodEnd).split(" → ")[0], { period });
const evidenceDialogName = (title: string) => `${title}｜${labels.sections.evidence}`;

// These HTTP interceptions are browser-only test mocks. They do not call a model
// and never establish that the configured live provider integration works.
interface Snapshot {
  schema_version: string; snapshot_id: string; currency: string; metric_version: string;
  facts: { id: string; metric: string; period: string; scope: string; value: string | null; source_refs: Record<string, unknown>[] }[];
  filters: { channels: string[] };
}
interface ApprovedBody { snapshot: Snapshot; consent: { snapshot_id: string; accepted: boolean; recipient: string } }
interface MockInsight {
  snapshot_id: string;
  insights: { fact_ids: string[]; observation: string; hypotheses: string[]; recommended_action: string; owner_role: string;
    verification_metric: string; stop_condition: string; additional_data_needed: string[]; limitations: string[] }[];
  limitations: string[];
}
interface MockEnvelope {
  status: "live" | "fallback"; snapshot_id: string; output?: MockInsight; reason?: string;
  metadata?: { provider: string; model: string; prompt_version: string; generated_at: string; attempts: number; latency_ms: number; usage: null };
}
interface AuditEvent { kind: string; type?: string; errorName?: string; method?: string; hasBody?: boolean }
const expectedBeforeUnload = new WeakSet<Page>();
const test = base.extend<{ browserAudit: AuditEvent[] }>({
  browserAudit: [async ({ page }, use, testInfo) => {
    const events: AuditEvent[] = [];
    page.on("console", message => events.push({ kind: "console", type: message.type() }));
    page.on("pageerror", error => events.push({ kind: "pageerror", errorName: error.name }));
    page.on("request", request => {
      if (new URL(request.url()).pathname === "/api/insights") events.push({ kind: "insights-request", method: request.method(), hasBody: request.postDataBuffer() !== null });
    });
    page.on("dialog", dialog => {
      if (dialog.type() === "beforeunload" && expectedBeforeUnload.delete(page)) {
        events.push({ kind: "unsaved-changes-warning", type: dialog.type() });
        void dialog.accept();
      } else {
        events.push({ kind: "javascript-dialog", type: dialog.type() });
        void dialog.dismiss();
      }
    });
    await use(events);
    const record = { recorded_at: new Date().toISOString(), project: testInfo.project.name, test: testInfo.title,
      mode: testInfo.title.startsWith("MOCK") ? "browser_mock_no_live_call" : "real_local_disabled_endpoint_no_live_call", status: testInfo.status, events };
    await mkdir(resolve("verification"), { recursive: true });
    await appendFile(resolve("verification/review-v2-a-browser-meta.jsonl"), `${JSON.stringify(record)}\n`);
    await testInfo.attach("browser-metadata-only", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
    expect(events.filter(event => event.kind === "pageerror" || event.kind === "javascript-dialog" || event.type === "error"), "不得執行不可信回應或產生未處理的瀏覽器錯誤").toEqual([]);
  }, { auto: true }],
});
const panel = (page: Page) => page.getByTestId("ai-panel");
const mode = (page: Page) => page.getByTestId("ai-mode");
const consent = (page: Page) => panel(page).getByLabel(ai.consentLabel, { exact: true });
const send = (page: Page) => panel(page).getByRole("button", { name: ai.sendButton, exact: true });
const workspaceStatus = (page: Page) => page.getByTestId("workspace-status");
const kpi = (page: Page, metric: string) => page.getByTestId(`kpi-${metric}`).locator(".kpi-value");

async function showAi(page: Page) {
  await page.getByRole("button", { name: labels.nav.diagnosis.label, exact: true }).click();
  await expect(panel(page)).toBeVisible();
}
async function loadDataset(page: Page, id = "golden", channel = "DTC") {
  await openValidation(page);
  await page.getByLabel(labels.ui.dashboard.validation.datasetLabel, { exact: true }).selectOption(id);
  await Promise.all([
    page.waitForResponse(response => response.url().endsWith(`/api/datasets/${id}`) && response.ok()),
    clickReplacing(page, page.getByRole("button", { name: labels.ui.dashboard.validation.loadButton, exact: true })),
  ]);
  await expect(workspaceStatus(page)).toContainText(labels.status.ready);
  await page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).selectOption(channel);
  await expect(workspaceStatus(page)).toContainText(labels.status.ready);
  // R6：載入資料後右下角（手機底部滿版）出現非 modal 的首次保存提示，會擋住頁尾附近的按鈕；本流程不測自動保存，先按「先不要」。
  await dismissSavePrompt(page);
  await showAi(page);
}
async function preview(page: Page): Promise<ApprovedBody> {
  const advanced = page.getByTestId("ai-advanced");
  if (await advanced.getAttribute("open") === null) await advanced.locator("summary").first().click();
  for (const title of [ai.payloadSummary, ai.requestSummary]) {
    const summary = advanced.getByText(title, { exact: true });
    if (await summary.locator("..").getAttribute("open") === null) await summary.click();
  }
  const content = page.getByTestId("ai-request-preview");
  await expect(content).toContainText('"snapshot_id"');
  return JSON.parse(await content.textContent() ?? "") as ApprovedBody;
}
function liveMock(body: ApprovedBody): MockEnvelope {
  const fact = body.snapshot.facts.find(item => item.metric === "contribution_after_marketing" && item.period === "current");
  expect(fact).toBeDefined();
  return {
    status: "live", snapshot_id: body.snapshot.snapshot_id,
    output: {
      snapshot_id: body.snapshot.snapshot_id,
      insights: [{ fact_ids: [fact!.id], observation: valueObservation("current", cmLabel, `{{fact:${fact!.id}:contribution_after_marketing}}`),
        hypotheses: ["待驗證假說：商品組合可能改變，需核對來源。"], recommended_action: "核對收入與成本來源，確認商品組合是否改變。",
        owner_role: "營運與財務", verification_metric: "行銷後貢獻及來源完整性", stop_condition: "來源尚未確認時停止採用結論。",
        additional_data_needed: ["同範圍來源彙總"], limitations: ["原因仍待驗證，不代表因果關係。"] }],
      limitations: ["行銷後貢獻不是公司淨利。"],
    },
    metadata: { provider: "openai", model: "mock-browser-only", prompt_version: "profitlens-insights-v3", generated_at: "2026-10-01T00:00:00.000Z", attempts: 1, latency_ms: 1, usage: null },
  };
}
async function mockApi(page: Page, responder: (body: ApprovedBody) => MockEnvelope | Promise<MockEnvelope> = liveMock) {
  const posts: ApprovedBody[] = [];
  await page.route("**/api/insights", async route => {
    if (route.request().method() === "GET") {
      await route.fulfill({ status: 200, contentType: "application/json", json: { available: true, reason: null, provider: "openai" } });
      return;
    }
    const body = route.request().postDataJSON() as ApprovedBody;
    posts.push(body);
    await route.fulfill({ status: 200, contentType: "application/json", json: await responder(body) });
  });
  await page.reload();
  return posts;
}
async function approveAndSend(page: Page) {
  await consent(page).check();
  await send(page).click();
}
async function assertCore(page: Page) {
  await page.getByRole("button", { name: labels.nav.overview.label, exact: true }).click();
  await expect(kpi(page, "net_revenue")).toHaveText("1,480.00");
  await expect(kpi(page, "contribution_after_marketing")).toHaveText("270.00");
}

test.beforeEach(async ({ page }) => { await page.goto("/"); });

test("MOCK：設定仍在確認時沒有預覽或停用的送出流程，確認停用後規則診斷保留", async ({ page }) => {
  const release = deferred<void>();
  let posts = 0;
  await page.route("**/api/insights", async route => {
    if (route.request().method() !== "GET") posts++;
    await release.promise;
    await route.fulfill({ status: 200, json: { available: false, reason: "PUBLIC_DEMO", provider: "openai" } });
  });
  await page.reload();
  await loadDataset(page);
  await expect(page.getByTestId("ai-status")).toContainText(ai.statusChecking);
  await expect(panel(page)).toContainText(ai.rulesAvailable);
  await expect(send(page)).toHaveCount(0);
  await expect(consent(page)).toHaveCount(0);
  await expect(page.getByTestId("ai-payload-preview")).toHaveCount(0);
  release.resolve();
  await expect(page.getByTestId("ai-status")).toContainText(aiReason("PUBLIC_DEMO"));
  await expect(panel(page)).toContainText(ai.liveOff);
  expect(posts).toBe(0);
  await assertCore(page);
});

for (const reason of ["NO_KEY", "PUBLIC_DEMO", "STATUS_UNAVAILABLE"] as const) {
  test(`MOCK：${reason} 不展示無法操作的 AI 流程並說明原因`, async ({ page }) => {
    let posts = 0;
    await page.route("**/api/insights", async route => {
      if (route.request().method() === "POST") posts++;
      await route.fulfill({ status: 200, json: { available: false, reason, provider: "openai" } });
    });
    await page.reload();
    await loadDataset(page);
    await expect(panel(page)).toContainText(ai.rulesAvailable);
    await expect(panel(page)).toContainText(reason === "STATUS_UNAVAILABLE" ? ai.liveStatusUnknown : ai.liveOff);
    await expect(page.getByTestId("ai-status")).toContainText(aiReason(reason));
    await expect(send(page)).toHaveCount(0);
    await expect(consent(page)).toHaveCount(0);
    await expect(page.getByTestId("ai-request-preview")).toHaveCount(0);
    await expect(page.getByTestId("ai-payload-preview")).toHaveCount(0);
    await expect(page.getByTestId("ai-live-result")).toHaveCount(0);
    expect(posts).toBe(0);
    await assertCore(page);
  });
}

test("真實本機未啟用端點 GET／POST 降級，未同意不傳送，核心與試算仍可用", async ({ page, request }) => {
  const observedPosts: string[] = [];
  page.on("request", item => { if (new URL(item.url()).pathname === "/api/insights" && item.method() === "POST") observedPosts.push(item.method()); });
  await loadDataset(page);
  await expect(mode(page)).toHaveText(ai.modeRules);
  await expect(send(page)).toHaveCount(0);
  await expect(consent(page)).toHaveCount(0);
  await expect(page.getByTestId("ai-request-preview")).toHaveCount(0);
  await expect(page.getByTestId("ai-payload-preview")).toHaveCount(0);
  expect(observedPosts).toEqual([]);
  const capability = await request.get("/api/insights");
  expect(capability.ok()).toBe(true);
  const config = await capability.json() as { available: boolean; reason: string; provider: string };
  expect(config.available).toBe(false);
  expect(["DISABLED", "NO_KEY", "NO_MODEL", "PUBLIC_DEMO", "LOCAL_ONLY", "INVALID_CONFIG"]).toContain(config.reason);
  expect(config.provider).toBe("openai");
  // The status line explains the disabled reason and points back to the rule-based check (was: 規則診斷).
  await expect(page.getByTestId("ai-status")).toContainText(aiReason(config.reason));
  const result = await request.post("/api/insights", { data: {}, headers: { Origin: new URL(page.url()).origin } });
  const fallback = await result.json() as { status: string; reason: string };
  expect(fallback).toMatchObject({ status: "fallback", reason: config.reason });
  await expect(page.getByTestId("ai-live-result")).toHaveCount(0);
  await assertCore(page);
  await page.getByRole("button", { name: labels.nav.scenarios.label, exact: true }).click();
  // R5：進頁即表單（方案 1 已在），「全部填 0」改為「維持現況」範本（五格皆 0）。
  await startChannelContext(page);
  const card = page.getByTestId("scenario-1");
  await card.getByTestId("scenario-preset").selectOption("keep");
  await card.getByTestId("scenario-preset-apply").click();
  for (const label of [labels.scenario.volume.label, labels.scenario.discount.label, labels.scenario.fulfillmentUnit.label, labels.scenario.adSpend.label, labels.scenario.oneOff.label]) await expect(card.getByLabel(label, { exact: true })).toHaveValue("0");
  await card.getByLabel(labels.scenario.acceptAssumptions, { exact: true }).check();
  await card.getByRole("button", { name: labels.buttons.calculate, exact: true }).click();
  await expect(card.getByTestId("scenario-contribution")).toHaveText("270.00");
});

test("MOCK：只傳精確預覽與同意，合法 placeholder 由本機解析並可追溯證據", async ({ page }, testInfo) => {
  const posts = await mockApi(page);
  await loadDataset(page);
  await expect(mode(page)).toHaveText(ai.modeRules);
  await expect(send(page)).toBeDisabled();
  await expect(page.getByTestId("ai-facts-preview")).toBeVisible();
  await expect(page.getByTestId("ai-facts-preview").locator("tbody tr")).toHaveCount(40);
  await expect(page.getByTestId("ai-payload-preview")).toBeHidden();
  await expect(page.getByTestId("ai-request-preview")).toBeHidden();
  await expect(page.getByTestId("ai-readable-preview")).toContainText(fill(ai.previewScope, { n: 1 }));
  // R2 moved the "model cannot name a channel" caveat from the readable preview into the technical <details>.
  await expect(page.getByTestId("ai-advanced")).toContainText(ai.advancedNote);
  const approved = await preview(page);
  const serialized = JSON.stringify(approved);
  const modelPreview = JSON.parse(await page.getByTestId("ai-payload-preview").textContent() ?? "") as { snapshot: Snapshot; observation_catalog: unknown[] };
  expect(JSON.stringify(modelPreview.snapshot) === JSON.stringify(approved.snapshot), "模型資料預覽與本機 API 快照相同").toBe(true);
  expect(modelPreview.observation_catalog.length).toBeGreaterThan(0);
  expect(Object.keys(approved).sort()).toEqual(["consent", "snapshot"]);
  expect(approved.consent).toEqual({ snapshot_id: approved.snapshot.snapshot_id, accepted: true, recipient: "openai" });
  expect(approved.snapshot.filters.channels).toEqual(["C01"]);
  expect(approved.snapshot.facts.find(item => item.metric === "contribution_after_marketing" && item.period === "current")?.value).toBe("270.00");
  for (const forbidden of ["golden-v1", "DTC", "MARKETPLACE", "sales_daily.csv", "channel_costs_daily.csv", "ad_spend_daily.csv", '"sku"', '"category"', '"dataset_id"', '"note"']) expect(serialized.includes(forbidden), `預覽不得包含 ${forbidden}`).toBe(false);
  for (const fact of approved.snapshot.facts) {
    expect(fact.id).toMatch(/^F\d+$/);
    expect(fact.scope).toBe("selected_channels");
    for (const source of fact.source_refs) expect(Object.keys(source).sort()).toEqual(["missing_rows", "role", "rows"]);
  }
  expect(posts).toHaveLength(0);
  await consent(page).check();
  expect(posts).toHaveLength(0);
  await send(page).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("ai-live-result")).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(JSON.stringify(posts[0]) === serialized, "實際傳送 body 必須精確等於同意前預覽，不印出 payload").toBe(true);
  await expect(mode(page)).toHaveText(ai.modeLive);
  await expect(panel(page)).toContainText("mock-browser-only");
  await expect(page.getByTestId("ai-live-result")).toContainText("270.00");
  await expect(page.getByTestId("ai-live-result")).not.toContainText("{{fact:");
  await expect(page.getByTestId("ai-live-result")).toContainText("待驗證");
  await expect(page.getByTestId("ai-live-result")).toContainText("不是公司淨利");
  await expect(page.getByTestId("ai-response-details")).not.toHaveAttribute("open");
  await expect(page.getByTestId("ai-live-result").getByRole("button")).not.toContainText(/F\d{3}/);
  const evidence = page.getByTestId("ai-live-result").getByRole("button", { name: fill(ai.viewEvidenceLink, { label: fill(ai.evidenceLabel, { metric: cmLabel, start: "2026-08-02", end: "2026-08-02" }) }), exact: true });
  await evidence.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: evidenceDialogName(fill(ai.evidenceTitle, { metric: cmLabel })), exact: true });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("p.number")).toHaveText(fill(labels.ui.evidenceDrawer.money, { amount: "270.00" }));
  // Golden dataset keeps the raw channel name (demo alias applies only to synthetic-demo).
  await expect(dialog).toContainText(`2026-08-02 至 2026-08-02；${labels.evidence.channels}：DTC`);
  await expect(dialog).toContainText("sales_daily.csv");
  await page.keyboard.press("Escape");
  await expect(evidence).toBeFocused();
  await mkdir(resolve("verification"), { recursive: true });
  await page.screenshot({ path: resolve(`verification/review-v2-a-mock-${testInfo.project.name}-ai.png`), fullPage: true });
  await page.screenshot({ path: resolve(`verification/review-v2-a-mock-${testInfo.project.name}-ai-viewport.png`), fullPage: false });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await page.getByRole("button", { name: labels.nav.actions.label, exact: true }).click();
  await expect(page.getByTestId("action-1")).toHaveCount(0);
  await expect(page.getByTestId("actions-workbench")).toContainText(labels.ui.actionsWorkbench.empty);
});

for (const unsafe of ["fabricated-fact", "literal-money", "causal-claim", "wrong-snapshot"] as const) {
  test(`MOCK：HTTP 200 的 ${unsafe} 不安全內容仍由瀏覽器拒絕`, async ({ page }) => {
    const posts = await mockApi(page, body => {
      const result = liveMock(body);
      const insight = result.output!.insights[0];
      if (unsafe === "fabricated-fact") insight.fact_ids = ["F999999"];
      if (unsafe === "literal-money") insight.observation = "MOCK_UNSAFE_MARKER 已增加獲利 99999 元。";
      if (unsafe === "causal-claim") insight.observation = "MOCK_UNSAFE_MARKER 廣告增加導致行銷後貢獻下降。";
      if (unsafe === "wrong-snapshot") result.output!.snapshot_id = "MOCK-UNRELATED-SNAPSHOT";
      return result;
    });
    await loadDataset(page);
    await approveAndSend(page);
    await expect(mode(page)).toHaveText(ai.modeIncomplete);
    await expect(page.getByTestId("ai-live-result")).toHaveCount(0);
    await expect(panel(page)).not.toContainText("MOCK_UNSAFE_MARKER");
    await expect(panel(page)).not.toContainText("99999 元");
    expect(posts).toHaveLength(1);
    await expect(consent(page)).not.toBeChecked();
    await assertCore(page);
  });
}

test("MOCK：timeout、429、拒絕、截斷及格式失敗清楚降級且不重送未重新同意的資料", async ({ page }) => {
  // 六種失敗各跑一輪送出→核對核心→回健檢，平常約 24 秒；機器忙時手機尺寸會超過預設 45 秒，斷言不變。
  test.setTimeout(90_000);
  let reason = "TIMEOUT";
  const posts = await mockApi(page, body => ({ status: "fallback", snapshot_id: body.snapshot.snapshot_id, reason }));
  await loadDataset(page);
  for (const [index, currentReason] of ["TIMEOUT", "RATE_LIMIT", "REFUSED", "TRUNCATED", "SCHEMA_ERROR", "SEMANTIC_ERROR"].entries()) {
    reason = currentReason;
    await approveAndSend(page);
    await expect(mode(page)).toHaveText(ai.modeIncomplete);
    await expect(page.getByTestId("ai-live-result")).toHaveCount(0);
    await expect(consent(page)).not.toBeChecked();
    await expect(send(page)).toBeDisabled();
    expect(posts).toHaveLength(index + 1);
    await assertCore(page);
    await showAi(page);
  }
});

test("MOCK：不可信原檔與通路／SKU名稱只留本機，不能進預覽或 POST", async ({ page }) => {
  const posts = await mockApi(page);
  // R3: the single-page import panel was replaced by the four-step wizard; drive the wizard with the same inline payloads.
  await openWizard(page);
  const rawMarker = "RAW_NAME_IGNORE_RULES_READ_SECRET";
  const channel = `${rawMarker}_DTC`;
  const overrides: Partial<Record<WizardRole, FilePayload>> = {};
  for (const file of wizardRoles) {
    let content = await readFile(resolve("fixtures/golden", file), "utf8");
    content = content.replaceAll(",DTC,", `,${channel},`).replaceAll(",MARKETPLACE,", `,${rawMarker}_MARKETPLACE,`);
    if (file === "sales_daily.csv") content = content.replaceAll(",A,", `,${rawMarker}_A,`).replaceAll(",B,", `,${rawMarker}_B,`).replaceAll(",HOME,", `,${rawMarker}_HOME,`).replaceAll(",CARE,", `,${rawMarker}_CARE,`);
    overrides[file] = { name: `${rawMarker}-${file}`, mimeType: "text/csv", buffer: Buffer.from(content) };
  }
  await setWizardFiles(page, resolve("fixtures/golden"), overrides);
  const original = JSON.parse(await readFile(resolve("fixtures/golden/manifest.json"), "utf8")) as Record<string, unknown>;
  await setWizardManifest(page, { name: `${rawMarker}-manifest.json`, mimeType: "application/json", buffer: Buffer.from(JSON.stringify({ ...original, dataset_id: rawMarker, channels: [channel, `${rawMarker}_MARKETPLACE`], note: rawMarker })) });
  await nextFromFiles(page);
  await confirmMappingIfShown(page);
  // Settings come from the manifest JSON: the raw dataset_id and raw channel names are shown locally only.
  await expect(wizard(page).getByLabel(labels.importWizard.datasetName, { exact: true })).toHaveValue(rawMarker);
  await expect(wizard(page).getByLabel(channel, { exact: true })).toBeChecked();
  await expect(wizard(page).getByLabel(`${rawMarker}_MARKETPLACE`, { exact: true })).toBeChecked();
  // The amount-basis confirmation is now the exclusive-basis radio plus the single confirm-and-check button.
  await chooseBasis(page, "exclusive");
  await confirmAndCheck(page, "valid");
  // Original filenames stay traceable in the local reconciliation table.
  await expect(page.getByTestId("import-reconciliation")).toContainText(`${rawMarker}-sales_daily.csv`);
  await commitWizard(page);
  await expect(workspaceStatus(page)).toContainText(labels.status.ready);
  await dismissSavePrompt(page);
  await page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).selectOption(channel);
  await expect(workspaceStatus(page)).toContainText(labels.status.ready);
  await showAi(page);
  await expect(page.getByTestId("ai-local-mapping")).toContainText(channel);
  const approved = await preview(page);
  expect(JSON.stringify(approved).includes(rawMarker), "不可信原始文字不應進入可傳送的快照").toBe(false);
  expect((await page.getByTestId("ai-payload-preview").textContent())?.includes(rawMarker), "模型最終資料預覽也不得包含原始名稱").toBe(false);
  await approveAndSend(page);
  await expect(page.getByTestId("ai-live-result")).toBeVisible();
  expect(posts).toHaveLength(1);
  expect(JSON.stringify(posts[0]).includes(rawMarker), "POST 不含原始名稱或注入文字").toBe(false);
  await expect(page.getByTestId("ai-live-result")).toContainText("270.00");
});

function deferred<T>() {
  let resolvePromise!: (value: T) => void;
  const promise = new Promise<T>(resolve => { resolvePromise = resolve; });
  return { promise, resolve: resolvePromise };
}

/** Test-only adverse network: the old request ignores cancellation and completes.
 * This exercises UI freshness even when transport abort cannot prevent a reply. */
async function ignoreAbortForMockPost(page: Page) {
  await page.evaluate(() => {
    const originalFetch = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      return originalFetch(input, url.endsWith("/api/insights") && init?.method === "POST" ? { ...init, signal: undefined } : init);
    };
  });
}
async function releaseMock(page: Page, release: ReturnType<typeof deferred<void>>) {
  const response = page.waitForResponse(item => new URL(item.url()).pathname === "/api/insights" && item.request().method() === "POST");
  release.resolve();
  await response;
  await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
}

for (const change of ["channel", "dataset", "period"] as const) {
  test(`MOCK：慢回應忽略 abort 時，${change} 改變並回原值也不復活結果或同意`, async ({ page }) => {
    const received = deferred<ApprovedBody>();
    const release = deferred<void>();
    const posts = await mockApi(page, async body => { received.resolve(body); await release.promise; return liveMock(body); });
    await loadDataset(page, change === "period" ? "demo" : "golden");
    const original = await preview(page);
    await ignoreAbortForMockPost(page);
    await approveAndSend(page);
    await received.promise;
    await expect(panel(page).getByRole("button", { name: ai.cancelButton, exact: true })).toBeVisible();
    if (change === "channel") {
      for (const channel of ["MARKETPLACE", "DTC"]) {
        await page.getByLabel(labels.ui.dashboard.filter.channel, { exact: true }).selectOption(channel);
        await expect(workspaceStatus(page)).toContainText(labels.status.ready);
      }
    } else if (change === "dataset") {
      await loadDataset(page, "demo");
      await loadDataset(page, "golden");
    } else {
      const dateLabels = [periodFieldLabel("start", labels.periods.previous), periodFieldLabel("end", labels.periods.previous), periodFieldLabel("start", labels.periods.current), periodFieldLabel("end", labels.periods.current)];
      for (const values of [["2026-06-01", "2026-06-01", "2026-07-13", "2026-07-13"], ["2026-06-01", "2026-07-12", "2026-07-13", "2026-08-23"]]) {
        for (const [index, label] of dateLabels.entries()) await page.getByLabel(label, { exact: true }).fill(values[index]);
        await page.getByRole("button", { name: labels.buttons.apply, exact: true }).click();
        await expect(workspaceStatus(page)).toContainText(labels.status.ready);
      }
    }
    await expect(consent(page)).not.toBeChecked();
    await expect(send(page)).toBeDisabled();
    const current = await preview(page);
    expect(current.snapshot.snapshot_id === original.snapshot.snapshot_id, "回到原範圍仍屬新的工作區 revision").toBe(false);
    await releaseMock(page, release);
    await expect(mode(page)).toHaveText(ai.modeRules);
    await expect(page.getByTestId("ai-live-result")).toHaveCount(0);
    await expect(consent(page)).not.toBeChecked();
    expect(posts).toHaveLength(1);
  });
}

test("MOCK：取消慢請求撤銷同意，已返回的舊內容仍不能呈現", async ({ page }) => {
  const received = deferred<ApprovedBody>();
  const release = deferred<void>();
  await mockApi(page, async body => { received.resolve(body); await release.promise; return liveMock(body); });
  await loadDataset(page);
  await ignoreAbortForMockPost(page);
  await approveAndSend(page);
  await received.promise;
  await panel(page).getByRole("button", { name: ai.cancelButton, exact: true }).click();
  // statusCancelled carries both facts: consent revoked, and sent data cannot be recalled.
  const [cancelledNotice, irrevocableNotice] = ai.statusCancelled.split("；");
  await expect(page.getByTestId("ai-status")).toContainText(cancelledNotice);
  await expect(page.getByTestId("ai-status")).toContainText(irrevocableNotice);
  await expect(consent(page)).not.toBeChecked();
  await expect(send(page)).toBeDisabled();
  await releaseMock(page, release);
  await expect(mode(page)).toHaveText(ai.modeIncomplete);
  await expect(page.getByTestId("ai-live-result")).toHaveCount(0);
  await assertCore(page);
});

test("MOCK：成功回應與同意不持久化，不跨分頁、重整或重新載入相同資料", async ({ page, context, browserAudit }) => {
  const posts = await mockApi(page);
  await loadDataset(page);
  const before = await page.evaluate(async () => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), databases: (await indexedDB.databases()).map(value => ({ name: value.name, version: value.version })) }));
  await approveAndSend(page);
  await expect(page.getByTestId("ai-live-result")).toBeVisible();
  await expect(consent(page)).not.toBeChecked();
  const after = await page.evaluate(async () => ({ local: Object.keys(localStorage).sort(), session: Object.keys(sessionStorage).sort(), databases: (await indexedDB.databases()).map(value => ({ name: value.name, version: value.version })) }));
  expect(after).toEqual(before);
  expect(posts).toHaveLength(1);
  await loadDataset(page);
  await expect(page.getByTestId("ai-live-result")).toHaveCount(0);
  await expect(mode(page)).toHaveText(ai.modeRules);
  await expect(consent(page)).not.toBeChecked();
  await expect(send(page)).toBeDisabled();
  const other = await context.newPage();
  await other.goto("/");
  await expect(workspaceStatus(other)).toContainText(labels.status.empty);
  await expect(other.getByTestId("ai-live-result")).toHaveCount(0);
  await other.close();
  expectedBeforeUnload.add(page);
  await page.reload();
  expect(browserAudit.filter(event => event.kind === "unsaved-changes-warning")).toEqual([{ kind: "unsaved-changes-warning", type: "beforeunload" }]);
  await expect(workspaceStatus(page)).toContainText(labels.status.empty);
  await expect(page.getByTestId("ai-live-result")).toHaveCount(0);
});
