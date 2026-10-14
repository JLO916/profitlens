import { createHash } from "node:crypto";
import { lookupUiRef, UI_REF_PATTERN } from "../../src/application/guide";
import { guideLabels } from "../../src/i18n/guide.zh-TW";
import { labels } from "../../src/i18n/labels.zh-TW";

// V41-2a（docs/revamp-v4.1/01_PRD.md §3.5「同步檢查」；D-V41-22＝A）：說明頁截圖的 labels_hash＝該步驟引用的介面字串的雜湊。
// 被引用的介面字串改了（例如按鈕改名），截圖裡的字就過期了：tests/guide-content.test.ts 比對清單裡的 labels_hash 與這裡算出的值，不符就要求跑 GUIDE_MEDIA=write
// （圖相同時只更新雜湊，不重轉 WebP）。capture.spec.ts 的 write 模式寫入清單時也用這個函式。
// 純 TS：只用相對路徑 import（Playwright 與 Vitest 都能直接載入），不讀檔、不依賴伺服器。

/** 一個步驟會用到 {ui:…} 的欄位（步驟標題、內文、alt、圖說）。 */
const STEP_FIELDS = ["title", "body", "alt", "caption"] as const;

/** guideLabels.guide.areas[area].steps[stepKey] 的 {title, body, alt, caption}；功能區、步驟或欄位不存在時回傳空陣列（還沒寫文字的步驟沒有引用）。 */
function stepTexts(area: string, stepKey: string): string[] {
  const areas = guideLabels.guide.areas as unknown as Record<string, { steps?: Record<string, Partial<Record<(typeof STEP_FIELDS)[number], unknown>>> } | undefined>;
  const step = areas[area]?.steps?.[stepKey];
  if (!step) return [];
  return STEP_FIELDS.map(field => step[field]).filter((value): value is string => typeof value === "string");
}

/** 這一步引用的介面字串路徑（去重、依路徑排序）。 */
export function stepUiRefs(area: string, stepKey: string): string[] {
  const paths = new Set<string>();
  for (const text of stepTexts(area, stepKey)) for (const match of text.matchAll(UI_REF_PATTERN)) paths.add(match[1]);
  return [...paths].sort();
}

/** labels_hash：sha256 hex of JSON.stringify([[路徑, labels 原字串], …])（路徑依字典序；路徑不存在時丟錯，同 resolveUiRefs）。沒有引用時是 JSON.stringify([]) 的雜湊。 */
export function labelsHash(area: string, stepKey: string): string {
  const pairs = stepUiRefs(area, stepKey).map(path => [path, lookupUiRef(path, labels)]);
  return createHash("sha256").update(JSON.stringify(pairs)).digest("hex");
}
