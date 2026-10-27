// R2 review item 6: accessible name/value of the scope select while the disabled「2 個通路」option is selected (CDP accessibility tree), plus the G4 table box with/without drill buttons on 390.
import { expect, test } from "@playwright/test";
import { groupOptionValue, SUBSET_OPTION_VALUE } from "/Users/j-work/ProfitLens/src/application/channel-settings";
import { importSynthetic } from "/Users/j-work/ProfitLens/tests/e2e/chart-helpers-v4";
import { hideDevOverlay } from "/Users/j-work/ProfitLens/tests/e2e/launch-helpers-v310";
import { Obs, backup, chooseScope, collectConsole, configureGroups, G1, isMobile, navigateTo, openPeriodSheet, reloadAndRestore, scopeSelect, shot, withoutGroups } from "./r2-helpers";

test.describe.configure({ timeout: 600_000 });

test("R2 ax subset", async ({ page }, testInfo) => {
  const obs = new Obs(`ax-${testInfo.project.name}`);
  collectConsole(page, obs);
  page.on("dialog", dialog => { if (dialog.type() === "beforeunload") void dialog.accept(); else void dialog.dismiss(); });
  await hideDevOverlay(page);
  try {
    await page.goto("/");
    await importSynthetic(page);
    await configureGroups(page);
    await navigateTo(page, "overview");
    await chooseScope(page, { label: G1 }, groupOptionValue("g1"));
    const text = await backup(page);
    await reloadAndRestore(page, withoutGroups(text));
    await expect(scopeSelect(page)).toHaveValue(SUBSET_OPTION_VALUE);
    if (isMobile(page)) await openPeriodSheet(page);
    const session = await page.context().newCDPSession(page);
    await session.send("Accessibility.enable");
    const handle = await scopeSelect(page).elementHandle();
    const { object } = await session.send("DOM.resolveNode", { backendNodeId: undefined, objectId: undefined, nodeId: undefined } as never).catch(() => ({ object: null })) as { object: unknown };
    void object; void handle;
    // Use the AX tree with the DOM node id of the select.
    const { root } = await session.send("DOM.getDocument", { depth: -1 });
    void root;
    const { nodeIds } = await session.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-testid='scope-select']" });
    const { nodes } = await session.send("Accessibility.getPartialAXTree", { nodeId: nodeIds[0], fetchRelatives: false });
    const ax = nodes.map(node => ({ role: node.role?.value, name: node.name?.value, value: node.value?.value, properties: (node.properties ?? []).map(p => `${p.name}=${JSON.stringify(p.value?.value)}`) }));
    obs.set("axSelect", ax);
    // also the selected option node
    const { nodeIds: optionIds } = await session.send("DOM.querySelectorAll", { nodeId: root.nodeId, selector: "[data-testid='scope-select'] option:checked" });
    const { nodes: optionNodes } = await session.send("Accessibility.getPartialAXTree", { nodeId: optionIds[0], fetchRelatives: false });
    obs.set("axOption", optionNodes.map(node => ({ role: node.role?.value, name: node.name?.value, properties: (node.properties ?? []).map(p => `${p.name}=${JSON.stringify(p.value?.value)}`) })));
    await shot(page, testInfo, "ax-subset-state");
  } finally {
    obs.save();
  }
});
