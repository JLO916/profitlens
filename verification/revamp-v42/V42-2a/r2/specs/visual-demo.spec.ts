// R2 review item 7: re-shoot the frozen 01–09 walkthrough (demo data, FIXED_NOW clock) exactly as verification/revamp-v4-capture/baseline.spec.ts does, save PNGs for an out-of-repo pixel compare.
import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { labels } from "/Users/j-work/ProfitLens/src/i18n";
import { calculateKeepPreset, evidenceDrawer, goTo, loadDemo, navigateTo } from "/Users/j-work/ProfitLens/verification/revamp-v4-capture/shared";
import { Obs, R2, collectConsole } from "./r2-helpers";

test.describe.configure({ timeout: 600_000 });
const top = (page: import("@playwright/test").Page) => page.evaluate(() => window.scrollTo(0, 0));

test("R2 visual 01/02/05/08/09 (demo, no groups)", async ({ page }, testInfo) => {
  const obs = new Obs(`visual-${testInfo.project.name}`);
  collectConsole(page, obs);
  const dir = `${R2}/shots/visual-${testInfo.project.name}`;
  mkdirSync(dir, { recursive: true });
  const opts = { animations: "disabled" as const, caret: "hide" as const, scale: "css" as const };
  try {
    await loadDemo(page);
    await top(page);
    await page.screenshot({ path: `${dir}/01-overview-top.png`, ...opts });
    await page.screenshot({ path: `${dir}/02-overview-full.png`, fullPage: true, ...opts });
    await page.getByTestId("top-three").getByRole("button", { name: labels.evidence.buttons.viewEvidence, exact: true }).first().click();
    await expect(evidenceDrawer(page)).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(evidenceDrawer(page)).toHaveCount(0);
    await page.getByTestId("top-three").getByRole("button", { name: labels.actions.buttons.addToActions, exact: true }).first().click();
    await expect(page.getByTestId("board-card-1")).toBeVisible();
    await top(page);
    await goTo(page, "diagnosis", page.getByTestId("diagnosis-panel"));
    await page.screenshot({ path: `${dir}/05-diagnosis.png`, fullPage: true, ...opts });
    await goTo(page, "products", page.getByTestId("product-table"));
    await navigateTo(page, "scenarios");
    await calculateKeepPreset(page);
    await top(page);
    await goTo(page, "meeting", page.getByTestId("meeting-page"));
    await expect(page.getByTestId("manager-summary")).toBeVisible();
    await page.screenshot({ path: `${dir}/08-meeting.png`, fullPage: true, ...opts });
    await goTo(page, "data", page.getByTestId("targets-entry"));
    await page.screenshot({ path: `${dir}/09-data.png`, fullPage: true, ...opts });
    obs.set("done", true);
  } finally {
    obs.save();
  }
});
