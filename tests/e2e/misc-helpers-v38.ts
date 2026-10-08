import { expect, type Locator, type Page } from "@playwright/test";
import { labels } from "../../src/i18n";
import { sidebarNav } from "./replacement-helpers";

const stateV3 = labels.empty.stateV3;

/**
 * V3-8 C（§7.10 區段空狀態，C10 區段型）：會議議程 ⑤ 沒有選入方案時，meeting-scenario-results-empty 是
 * div.ui-empty-block > p.ui-empty-title（labels.empty.stateV3.meetingNoScenarioTitle）＋p（meetingNoScenarioBody）＋
 * 文字按鈕「前往假設試算」（data-testid meeting-go-scenarios，labels.empty.stateV3.meetingGoToScenarios）。
 * 取代 v2 的整句 labels.meeting.managerSummary.noScenario（toHaveText 會把按鈕文字也算進去，所以分句斷言）。
 */
export async function expectMeetingNoScenario(agenda5: Locator) {
  const empty = agenda5.getByTestId("meeting-scenario-results-empty");
  await expect(empty).toBeVisible();
  await expect(empty.locator(":scope > p")).toHaveText([stateV3.meetingNoScenarioTitle, stateV3.meetingNoScenarioBody]);
  const go = empty.getByRole("button", { name: stateV3.meetingGoToScenarios, exact: true });
  await expect(go).toBeVisible();
  await expect(go).toHaveAttribute("data-testid", "meeting-go-scenarios");
}

/** 議程 ⑤ 空狀態的「前往假設試算」：點了切到假設試算頁（側欄的 aria-current＝page；手機側欄仍掛載可讀）且試算工作台可見。 */
export async function goToScenariosFromMeeting(page: Page, agenda5: Locator) {
  const go = agenda5.getByTestId("meeting-go-scenarios");
  // 手機底部分頁列是 fixed：先把按鈕捲到畫面中間，避免被蓋住。
  await go.evaluate(element => element.scrollIntoView({ block: "center" }));
  await go.click();
  await expect(sidebarNav(page, "scenarios")).toHaveAttribute("aria-current", "page");
  await expect(sidebarNav(page, "meeting")).not.toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("multi-scenario-workbench")).toBeVisible();
}

/**
 * V3-8 C：會議歷史為空——div.ui-empty-block.meeting-history-empty 裡兩個 p（標題 meetingHistoryTitle＋說明 meetingHistoryBody），
 * 取代 v2 的一整句 labels.meeting.page.historyEmpty。兩句都要看得到。
 */
export async function expectMeetingHistoryEmpty(history: Locator) {
  await expect(history).toContainText(stateV3.meetingHistoryTitle);
  await expect(history).toContainText(stateV3.meetingHistoryBody);
  await expect(history.getByText(stateV3.meetingHistoryTitle, { exact: true })).toBeVisible();
  await expect(history.getByText(stateV3.meetingHistoryBody, { exact: true })).toBeVisible();
}
