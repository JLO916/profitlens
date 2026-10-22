// V42-G1（docs/revamp-v4.2/06_BATCHES.md V42-G1；使用者 2026-10-20 提供的說明首頁改寫稿）：說明首頁「獨特性」與「刻意不做的事」的純資料——
// 3 個主張（編號）＋1 個前提（不編號）各自「在哪裡看得到」的功能區，以及「刻意不做的事」各點後附的「相關說明：」連結。
// 放在 src/components/guide/（伺服器模組、不 import 任何執行期模組）而不是 src/application/guide.ts：本批對 src/application 零改動（驗收命令 git diff --stat 4ed65c7 HEAD -- src/application 必須為空）；
// src/application/guide.ts 的 GUIDE_UNIQUE（v4.1 的 7 項）因此留著、V42-G1 起沒有任何頁面讀它。文字在 src/i18n/guide.zh-TW.ts 的 guide.unique.items.*、guide.tradeoffs.items.*。
import type { GuideAreaLink } from "@/application/guide";

/** 3 個主張（頁面順序＝改寫稿 §4 的 1、2、3）；traceable 連到總覽頁的 #bridge（tests/guide-routes.test.tsx、tests/e2e/guide.spec.ts 要求說明首頁有這個連結）。 */
export const GUIDE_HUB_CLAIMS = [
  { key: "traceable", where: [{ area: "evidence" }, { area: "overview", hash: "bridge" }, { area: "data" }] },
  { key: "judgment", where: [{ area: "diagnosis" }, { area: "scenarios" }, { area: "meeting" }] },
  { key: "loop", where: [{ area: "actions" }, { area: "meeting" }, { area: "export" }] },
] as const satisfies readonly { key: string; where: readonly GuideAreaLink[] }[];
export type GuideHubClaimKey = (typeof GUIDE_HUB_CLAIMS)[number]["key"];

/** 前提（主張之後、不編號）：為台灣多通路電商設計、資料不離開你的電腦。 */
export const GUIDE_HUB_PREMISE = { key: "premise", where: [{ area: "import" }, { area: "export" }] } as const satisfies { key: string; where: readonly GuideAreaLink[] };

/** guide.unique.items 的鍵依頁面順序（tests/guide-content.test.ts 對照）。 */
export const GUIDE_HUB_UNIQUE_KEYS = [...GUIDE_HUB_CLAIMS.map(item => item.key), GUIDE_HUB_PREMISE.key] as const;

/** 「刻意不做的事」三點的順序（guide.tradeoffs.items 的鍵）：前兩點是目前的取捨，第三點是刻意的設計。 */
export const GUIDE_TRADEOFF_KEYS = ["sync", "accounts", "judgment"] as const;
export type GuideTradeoffKey = (typeof GUIDE_TRADEOFF_KEYS)[number];

/**
 * 某一點後附的功能區連結（寫法同 src/application/guide.ts 的 GUIDE_AREA_NOTE_LINKS，列在「相關說明：」之後）。
 * sync（不自動同步）連到匯入資料頁：訂單明細整理成每日資料的工具說明（/docs/ORDER_AGGREGATION.md）在那一頁的「開始前」；說明首頁的站內連結只有 /、/guide/{area}（tests/guide-routes.test.tsx），不直接連文件。
 */
export const GUIDE_TRADEOFF_LINKS: Readonly<Partial<Record<GuideTradeoffKey, readonly GuideAreaLink[]>>> = { sync: [{ area: "import" }] };
