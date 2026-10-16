import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";
import { labels } from "../../../src/i18n";
import { importViaWizard } from "../../../tests/e2e/import-wizard-helpers";
import { FIXED_NOW } from "../../revamp-v4-capture/shared";

// V42-0 第 7 項（docs/revamp-v4.2/06_BATCHES.md；01_PRD.md §15「G4 超過約 6 個通路會擠」）：overview-many-channels（9 通路）G4 擁擠程度的瀏覽器目視。
// 用匯入精靈載入 tests/fixtures/synthetic-many-channels-9x7/（與 tests/helpers/page-states.tsx 的 manyChannelsActive() 位元組相同），
// 對 [data-testid=channel-mix] 截一張 1440 的圖、整個視窗再一張，並把 G4 框內長條與端點數字的 DOM 幾何寫成 JSON；只讀畫面，不改 src。
// 不在任何 Playwright config 的 testDir 內，不計入 E2E 與畫面基準；對已啟動的 PUBLIC_DEMO 伺服器單獨跑：
//   CAPTURE_PORT=<埠> npx playwright test -c verification/revamp-v42/V42-0/
// 輸出寫在本目錄：overview-many-channels-channel-mix-1440.png、overview-many-channels-overview-1440.png、overview-many-channels-g4-geometry.json。
const port = Number(process.env.CAPTURE_PORT ?? 3100);
const FIXTURE = resolve("tests/fixtures/synthetic-many-channels-9x7");
const OUT = resolve("verification/revamp-v42/V42-0");
const CHANNELS = 9;

test.use({ viewport: { width: 1440, height: 1000 }, locale: "zh-TW", timezoneId: "Asia/Taipei", baseURL: `http://127.0.0.1:${port}` });

test("V42-0 overview-many-channels：9 通路的 G4 在 1440 的實際畫面與幾何", async ({ page }) => {
  await page.clock.setFixedTime(FIXED_NOW);
  await page.goto("/");
  await importViaWizard(page, FIXTURE, { manifest: true, classification: "valid" });
  const prompt = page.getByTestId("local-save-prompt");
  await expect(prompt).toBeVisible();
  await prompt.getByRole("button", { name: labels.storage.autoSave.decline, exact: true }).click();
  await expect(prompt).toHaveCount(0);
  await expect(page.getByTestId("kpi-band")).toBeVisible();

  const section = page.getByTestId("channel-mix");
  await expect(section).toBeVisible();
  await section.scrollIntoViewIfNeeded();
  await expect(section.locator(".recharts-wrapper")).toHaveCount(1);
  // Recharts 只在瀏覽器畫長條（SSR 只有 initialDimension 的外框）：等兩組各 9 根都出現。
  await expect(section.locator(".recharts-bar-rectangle path")).toHaveCount(CHANNELS * 2);

  mkdirSync(OUT, { recursive: true });
  await section.screenshot({ path: resolve(OUT, "overview-many-channels-channel-mix-1440.png"), animations: "disabled", caret: "hide", scale: "css" });
  await page.screenshot({ path: resolve(OUT, "overview-many-channels-overview-1440.png"), animations: "disabled", caret: "hide", scale: "css" });

  const geometry = await section.evaluate(root => {
    const round = (value: number) => Math.round(value * 100) / 100;
    const box = (element: Element) => { const rect = element.getBoundingClientRect(); return { x: round(rect.x), y: round(rect.y), width: round(rect.width), height: round(rect.height) }; };
    const frame = root.querySelector(".chart-frame"), wrapper = root.querySelector(".recharts-wrapper");
    return {
      frame: frame ? { class: frame.getAttribute("class"), style: frame.getAttribute("style"), ...box(frame) } : null,
      wrapper: wrapper ? box(wrapper) : null,
      // 兩組 Bar（上期 barSize 8、本期 barSize 18）各自的 9 根長條。
      bars: Array.from(root.querySelectorAll(".recharts-bar")).map(group => Array.from(group.querySelectorAll(".recharts-bar-rectangle path")).map(box)),
      // 軸刻度（X 軸金額、Y 軸通路）與端點數字（chart-value）。
      texts: Array.from(root.querySelectorAll("svg text")).map(text => ({ text: text.textContent, class: text.getAttribute("class"), ...box(text) })),
      kvRows: root.querySelectorAll(".kv.channel-kv tbody tr").length,
      dataRows: root.querySelectorAll("details.data-alternative tbody tr").length,
    };
  });
  writeFileSync(resolve(OUT, "overview-many-channels-g4-geometry.json"), JSON.stringify(geometry, null, 2) + "\n");

  // 與 tests/mounted-testids.test.tsx 的 V42-0 M1（SSR）一致的部分：固定高框、精簡表與資料表各 9 列；瀏覽器才量得到的部分只記錄，結論寫在 V42-0-baseline.md §6。
  expect(geometry.frame?.class).toBe("chart-frame sm");
  expect(geometry.frame?.height).toBe(180);
  expect(geometry.bars.map(group => group.length)).toEqual([CHANNELS, CHANNELS]);
  expect(geometry.texts.filter(entry => entry.class?.includes("chart-value")).length).toBe(CHANNELS * 2);
  expect(geometry.kvRows).toBe(CHANNELS);
  expect(geometry.dataRows).toBe(CHANNELS);
});
