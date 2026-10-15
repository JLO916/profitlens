import { mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { GUIDE_VIDEOS } from "../../src/application/guide";
import { labels } from "../../src/i18n";
import { wizard, wizardFileLabels, wizardRoles } from "../../tests/e2e/import-wizard-helpers";
import { navControl, type NavId } from "../../tests/e2e/replacement-helpers";
import { FIXED_NOW, evidenceDrawer, loadDemo } from "../revamp-v4-capture/shared";
import { GUIDE_MEDIA_WRITE, SYNC_GAP_MS, VIDEO_END_HOLD_MS, VIDEO_MIN_CUE_MS, VIDEO_RESULT_MS, collectErrors, compareVideoCue, point, ringClick, scrollToTop, settleVideoFrame, syncFlash, syncVideo, type VideoTimeline } from "./shared";
import { VIDEO_SIZE } from "./vtt";

// V41-3 示範影片（docs/revamp-v4.1/01_PRD.md §3.3 第 7 點、§3.5「影片」「字幕與逐字稿」、§3.6；GUIDE_CONTENT.md §3；D-V41-6＝A、D-V41-7＝A、D-V41-8）。
// 一支影片一個測試（各自全新的瀏覽器狀態），依 src/application/guide.ts 的 GUIDE_VIDEOS；FLOWS 必須恰好涵蓋每支影片與每個 cue（載入時檢查）。
// 視窗＝影片 1280×800，deviceScaleFactor 1、固定時鐘 FIXED_NOW；資料同截圖（示範資料、tests/fixtures/inclusive_tax），本機保存提示一律按「暫時不要」。
// 每支：prepare 到起始狀態（不入片）→ 片頭對時色塊（syncFlash，成品切掉）→ 每個 cue：記下開始時刻 → 操作（按下之前在目標畫 0.8 秒強調框）→ 等畫面穩定 →
// 視窗截圖與 baseline/video/{id}-{cue}.png 比對 → 停留到這個 cue 至少 5 秒、結果畫面至少 2 秒 → 下一個 cue；最後一個 cue 再多停 1.5 秒 → 片尾對時色塊。
// GUIDE_MEDIA=write：同一個流程開著 Playwright recordVideo，錄完交給 syncVideo（cue 全部 0 差異且已有 MP4 就不重錄，只更新字幕與 labels_hash）。
// check（預設）：不錄影、不寫任何檔，只比對 cue 截圖；停留時間與 write 相同（畫面上有時間性的狀態時，兩種模式拍到的一樣）。

/** 示範影片的操作：prepare 到起始狀態（影片從第一個 cue 開始，這段會被切掉），cues 依 GUIDE_VIDEOS 的 cue key。 */
interface VideoFlow {
  prepare: (page: Page) => Promise<void>;
  cues: Record<string, (page: Page) => Promise<void>>;
}

const INCLUSIVE_TAX_DIR = resolve("tests/fixtures/inclusive_tax");
const section = (page: Page, id: string) => page.locator(`section[aria-labelledby='${id}-title']`);
const wizardStep = (page: Page, step: number) => page.getByTestId(`import-step-${step}`);
const wizardButton = (page: Page, name: string) => wizard(page).getByRole("button", { name, exact: true });

/** 首頁空狀態（S0）：固定時鐘、開 /。 */
async function emptyHome(page: Page) {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  await expect(page.getByTestId("empty-state")).toBeVisible();
}

/** 本機保存提示出現後按「暫時不要」（強調框），等它消失。 */
async function declineLocalSave(page: Page) {
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await ringClick(page, prompt.getByRole("button", { name: labels.storage.autoSave.decline, exact: true }));
  await expect(prompt).toHaveCount(0);
}

/** 側欄切頁（強調框在側欄按鈕）：等這一頁成為 aria-current 且頁面骨架消失（同 tests/e2e 的 navigateTo；1280 是桌機殼層）。 */
async function navTo(page: Page, id: NavId) {
  const control = navControl(page, id);
  await ringClick(page, control);
  await expect(control).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("panel-loading")).toHaveCount(0);
}

const FLOWS: Record<string, VideoFlow> = {
  // ── start-30s（/guide 30 秒上手、/guide/start）：S0 → S1 ──
  "start-30s": {
    prepare: emptyHome,
    cues: {
      // 首頁按「載入示範資料」→ 本機保存提示按「暫時不要」→ 經營總覽。
      load: async page => {
        await ringClick(page, page.getByTestId("empty-load-demo"));
        await expect(page.getByTestId("workspace-status")).toContainText(labels.shell.status.ready.replace("{date}", ""));
        await declineLocalSave(page);
        await expect(page.getByTestId("top-three")).toBeVisible();
        await expect(page.locator(".kpi-band [data-testid^='kpi-']")).toHaveCount(5);
      },
      // 本期一句話，再看 KPI 帶的關鍵數字（只畫強調框，不按）。
      snapshot: async page => {
        await point(page, page.getByTestId("snapshot-sentence"), 1_400);
        await point(page, page.getByTestId("kpi-band"), 1_400);
      },
      // 捲到貢獻變化拆解（圖框上緣貼在期間列下方）。
      bridge: async page => {
        await scrollToTop(page, section(page, "bridge"));
      },
      // 點拆解表最後一列「本期扣廣告後貢獻」的金額 → 計算與來源抽屜（L1 值與到分的精確值）。
      evidence: async page => {
        await ringClick(page, page.getByTestId("bridge-table").locator("tr.is-total button.number-link"));
        await expect(evidenceDrawer(page)).toBeVisible();
        await expect(evidenceDrawer(page).getByTestId("evidence-precise-value")).toBeVisible();
      },
      // 抽屜右上角的關閉 → 回到貢獻變化拆解。
      close: async page => {
        await ringClick(page, evidenceDrawer(page).locator("button.evidence-close"));
        await expect(evidenceDrawer(page)).toHaveCount(0);
      },
    },
  },
  // ── import-wizard（/guide/import）：S3（tests/fixtures/inclusive_tax，虛構的合成資料）──
  "import-wizard": {
    prepare: emptyHome,
    cues: {
      // 首頁按「匯入資料」→ 精靈第 1 步 → 三份檔案依序放進對應的位置（setInputFiles，同選檔）。
      files: async page => {
        await ringClick(page, page.getByTestId("empty-import"));
        await expect(wizardStep(page, 1)).toBeVisible();
        await point(page, wizardStep(page, 1).locator(".dropzone"));
        for (const role of wizardRoles) {
          await wizard(page).getByLabel(wizardFileLabels[role], { exact: true }).setInputFiles(resolve(INCLUSIVE_TAX_DIR, role));
          await expect(page.getByTestId(`import-file-${role}`)).toContainText(role);
          await page.waitForTimeout(400);
        }
      },
      // 「下一步」：欄名都是標準欄名，第 2 步自動完成、直接到第 3 步；按「上一步」回看第 2 步（已對照的欄收合），框第一個收合列。
      mapping: async page => {
        await ringClick(page, wizardButton(page, labels.importWizard.next));
        await expect(wizardStep(page, 1)).toHaveCount(0);
        if (await wizardStep(page, 2).count() === 0) {
          await expect(wizardStep(page, 3)).toBeVisible();
          await ringClick(page, wizardButton(page, labels.importWizard.back));
        }
        await expect(wizardStep(page, 2)).toBeVisible();
        await point(page, wizardStep(page, 2).locator("details.mapping-done > summary").first(), 1_000);
      },
      // 「確認對照」→ 第 3 步：選「含稅」，再框建議的上期與本期那一行。
      basis: async page => {
        await ringClick(page, wizardButton(page, labels.importWizard.confirmMapping));
        await expect(wizardStep(page, 3)).toBeVisible();
        await point(page, wizardStep(page, 3).locator(".basis-option", { has: page.getByLabel(labels.importWizard.basis.inclusive, { exact: true }) }));
        await wizard(page).getByLabel(labels.importWizard.basis.inclusive, { exact: true }).check();
        await page.mouse.move(0, 0);
        await expect(page.getByTestId("import-conversion")).toBeVisible();
        await point(page, page.getByTestId("import-settings-proposal").locator(".wizard-group").first().locator(":scope > p.wizard-line"), 1_000);
      },
      // 「確認並檢核」→ 第 4 步：可以套用（valid）。
      review: async page => {
        await ringClick(page, wizardButton(page, labels.importWizard.confirmAndCheck));
        await expect(page.getByTestId("import-status")).toHaveAttribute("data-classification", "valid", { timeout: 20_000 });
        await expect(page.getByTestId("import-result-note")).toHaveText(labels.importWizard.result.valid);
      },
      // 「套用」→ 本機保存提示按「暫時不要」→ 經營總覽（匯入的資料）。
      apply: async page => {
        await ringClick(page, page.getByTestId("import-commit"));
        await expect(wizard(page)).toHaveCount(0);
        await declineLocalSave(page);
        await expect(page.getByTestId("kpi-band")).toBeVisible();
        await expect(page.getByTestId("top-three")).toBeVisible();
      },
    },
  },
  // ── meeting-weekly（/guide/meeting）：S1 → S8（同截圖 S7、S8 的操作，第 2 個方案不做）──
  "meeting-weekly": {
    prepare: async page => {
      await loadDemo(page);
      await page.evaluate(() => window.scrollTo(0, 0));
    },
    cues: {
      // 側欄「通路健檢」→ 第一項「加入待辦」→ 切到待辦、新增第一張卡。
      action: async page => {
        await navTo(page, "diagnosis");
        await expect(page.getByTestId("diagnosis-list")).toBeVisible();
        await ringClick(page, page.getByTestId("diagnosis-list").locator(":scope > li").first().getByRole("button", { name: labels.actions.buttons.addToActions, exact: true }));
        await expect(page.getByTestId("board-card-1")).toBeVisible();
        await point(page, page.getByTestId("board-card-1"));
      },
      // 側欄「假設試算」→ 方案 1 套用範本「維持現況」、同意聲明、試算 →「選入會議」。
      scenario: async page => {
        await navTo(page, "scenarios");
        await expect(page.getByTestId("decision-workbench")).toBeVisible();
        const card = page.getByTestId("scenario-1");
        await expect(card).toBeVisible();
        await point(page, card.getByTestId("scenario-preset"));
        await card.getByTestId("scenario-preset").selectOption("keep");
        await ringClick(page, card.getByTestId("scenario-preset-apply"));
        const consent = card.getByTestId("scenario-accept");
        if (await consent.count()) await ringClick(page, consent);
        await expect(card.getByTestId("scenario-acknowledged")).toBeVisible();
        await ringClick(page, card.getByRole("button", { name: labels.scenarios.buttons.calculate, exact: true }));
        await expect(card.getByTestId("scenario-contribution")).toBeVisible();
        await ringClick(page, page.getByTestId("scenario-select-1"));
      },
      // 側欄「會議紀錄」（議程 5 有選入的方案）→ 頁首的決議選「採用」。
      decision: async page => {
        await navTo(page, "meeting");
        await expect(page.getByTestId("meeting-scenario-results")).toBeVisible();
        const decision = page.getByTestId("meeting-decision").getByRole("combobox", { name: labels.meeting.form.decision, exact: true });
        await point(page, decision);
        await decision.selectOption({ label: labels.meeting.form.decisions.adopted });
        await expect(decision).toHaveValue("adopted");
      },
      // 「結束會議」→ 確認區「確認」→ 會議歷史多一筆（捲過去框住它）。
      finalize: async page => {
        await ringClick(page, page.getByTestId("meeting-finalize"));
        await expect(page.getByTestId("meeting-finalize-confirm")).toBeVisible();
        await ringClick(page, page.getByTestId("meeting-finalize-confirm-button"));
        await expect(page.getByTestId("meeting-history-item")).toHaveCount(1);
        await point(page, page.getByTestId("meeting-history-item"), 1_000);
      },
      // 頂欄「匯出」選單展開，框「會議」那一組。
      export: async page => {
        const menu = page.getByTestId("download-menu");
        await ringClick(page, menu.locator(":scope > summary"));
        await expect(menu).toHaveAttribute("open", "");
        await expect(menu.locator(".menu-panel")).toBeVisible();
        await point(page, page.getByTestId("download-group-meeting"), 1_000);
      },
    },
  },
};

// FLOWS 與 GUIDE_VIDEOS 必須是同一組影片與 cue（多一個或少一個都在載入時失敗）。
const planned = JSON.stringify(GUIDE_VIDEOS.map(video => [video.id, video.cues.map(cue => cue.key)]));
const covered = JSON.stringify(GUIDE_VIDEOS.map(video => [video.id, Object.keys(FLOWS[video.id]?.cues ?? {})]));
if (planned !== covered || Object.keys(FLOWS).length !== GUIDE_VIDEOS.length) throw new Error(`FLOWS 與 GUIDE_VIDEOS 不一致：planned=${planned} covered=${covered}`);

for (const video of GUIDE_VIDEOS) {
  test(`${video.id}（影片：${video.cues.map(cue => cue.key).join(" → ")}）`, async ({ browser, baseURL }) => {
    test.setTimeout(300_000);
    const flow = FLOWS[video.id];
    const rawDir = resolve("test-results/guide-media/video-raw", video.id);
    if (GUIDE_MEDIA_WRITE) { await rm(rawDir, { recursive: true, force: true }); await mkdir(rawDir, { recursive: true }); }
    const context = await browser.newContext({ baseURL, locale: "zh-TW", timezoneId: "Asia/Taipei", viewport: VIDEO_SIZE, deviceScaleFactor: 1, ...(GUIDE_MEDIA_WRITE ? { recordVideo: { dir: rawDir, size: VIDEO_SIZE } } : {}) });
    const page = await context.newPage();
    const errors = collectErrors(page);
    const timeline: VideoTimeline = { syncStart: 0, cues: [], end: 0, syncEnd: 0 };
    const raw = resolve(rawDir, `${video.id}.webm`);
    let changed = false;
    try {
      try {
        await flow.prepare(page);
        await settleVideoFrame(page);
        await page.mouse.move(0, 0);
        // 片頭對時（成品從下一刻的 cue 1 開始，看不到色塊）；check 也照做，兩種模式的流程與時間相同。
        timeline.syncStart = await syncFlash(page);
        for (const [index, cue] of video.cues.entries()) {
          const at = Date.now();
          timeline.cues.push({ key: cue.key, at });
          await flow.cues[cue.key](page);
          await settleVideoFrame(page);
          changed = (await compareVideoCue(page, video.id, cue.key)) || changed;
          const hold = VIDEO_RESULT_MS + (index === video.cues.length - 1 ? VIDEO_END_HOLD_MS : 0);
          await page.waitForTimeout(Math.max(hold, VIDEO_MIN_CUE_MS - (Date.now() - at)));
        }
        timeline.end = Date.now();
        // 片尾對時（成品在 timeline.end 切掉，空 SYNC_GAP_MS 再蓋色塊）。
        await page.waitForTimeout(SYNC_GAP_MS);
        timeline.syncEnd = await syncFlash(page);
        expect(errors, `${errors.length} console／page errors`).toEqual([]);
      } finally {
        await page.close();
      }
      // 關頁後 Playwright 才把錄影寫完；saveAs 等它寫完再複製到 rawDir。
      if (GUIDE_MEDIA_WRITE) await page.video()!.saveAs(raw);
    } finally {
      await context.close();
    }
    if (GUIDE_MEDIA_WRITE) console.log(await syncVideo(browser, video, raw, timeline, changed));
  });
}
