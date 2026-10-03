# M0 完成回報

> 卡片：**M0 現行站止血（v2.1）**｜範圍：PRD v3 §9.1 HF-01～HF-07｜分支：`m0/hotfix-v2.1`（基準 `main` 5771104）｜日期：2026-10-03
>
> 依據：`docs/PRD_v3.md` 第 9.1、20.3～20.8 節與附錄 A；`spec/test_anchors.v1.json`。未部署、未修改 `src/domain`、golden、fixtures、錨點期望值或相依套件。

## 完成的需求

| 需求 ID | 狀態 | 測試檔與測試名稱 | 備註 |
|---|---|---|---|
| HF-01 試算不改全站篩選 | 完成 | `tests/e2e/m0-hotfix.spec.ts`「HF-01 試算頁「編輯 MARKETPLACE 方案」只改頁內試算通路，回總覽仍是全部通路」；`tests/e2e/scenarios.spec.ts`「僅單一通路可試算…」（文案斷言更新） | 頁內顯示「試算通路：MARKETPLACE（只在試算頁生效，全站篩選維持「全部通路」）」；回總覽 KPI 淨營收仍為 7,850,657.90 |
| HF-02 會議資料版本標示 | 完成 | `m0-hotfix.spec.ts`「HF-02 會議稿固定舊資料時，摘要改標版本並換底色，不與目前 KPI 混淆」 | 匯入替代資料後，摘要標題為「會議資料（8/24 版，與目前資料不同）」，並以米色底與說明框區隔；更新會議來源後恢復「本期經營摘要」 |
| HF-03 對獲利影響同號同色 | 完成 | `tests/m0-hotfix.test.ts`「M0 HF-03 …」4 項；`m0-hotfix.spec.ts`「HF-03 三件事「折扣」與拆解圖同一項同號同色（對獲利的影響）」；`tests/e2e/workspace.spec.ts`「診斷金額以對獲利的影響呈現（HF-03），證據方向與來源一致」 | 三件事、診斷卡、拆解圖長條與數據表的折扣項都是 `-1,188,365.10`，紅色 `rgb(180, 35, 24)` |
| HF-04 正負轉換不顯示 % | 完成 | `m0-hotfix.test.ts`「M0 HF-04 …」3 項；`m0-hotfix.spec.ts`「HF-04 平台由正轉負時 KPI 不顯示百分比，改為「由賺 X 轉為虧 Y」」 | MARKETPLACE 行銷後貢獻顯示「由賺 721,100.88 轉為虧 61,169.93」，卡片內沒有 % |
| HF-05 本機自動保存（經同意） | 完成 | `m0-hotfix.test.ts`「M0 HF-05 …」3 項；`m0-hotfix.spec.ts`「HF-05 同意 → 載入示範資料 → 重新整理…」與「HF-05 選「先不要」不建立任何本機資料；刪除本機副本會停止自動保存」 | 重新整理後資料仍在，頂部顯示「已保存 hh:mm」，且不跳離頁提醒；選「先不要」時 IndexedDB 與 localStorage 都是空的 |
| HF-06 頁首主按鈕 | 完成 | `m0-hotfix.spec.ts`「HF-06 有資料時頁首沒有綠色主按鈕「載入示範資料」，改收在「更多」」；`tests/e2e/review-v2-a.spec.ts`（改用 `demoButton`） | 選單在四種視窗下都完整落在畫面內 |
| HF-07 行動版修正 | 完成 | `m0-hotfix.spec.ts`「M0 HF-07 行動版 390×844」3 項：替換保護對話框置中並有遮罩／套用匯入後捲回頁首／行動「執行狀態」下拉高度與其他欄位一致 | 對話框依內容決定高度且置中（±2px）；匯入後 `scrollY = 0`；下拉與「期限」欄高度差 ≤ 4px |

## 變更的檔案

| 類別 | 檔案 |
|---|---|
| 新增模組 | `src/application/profit-impact.ts`（對獲利影響換算、正負轉換文字、共用色碼）、`src/application/autosave.ts`（同意旗標、Asia/Taipei 時鐘） |
| 修改元件 | `src/components/dashboard.tsx`（HF-01／05／06／07）、`multi-scenario-workbench.tsx`（HF-01）、`review-workbench.tsx`、`manager-summary.tsx`、`manager-summary.module.css`（HF-02／03／04）、`overview.tsx`（HF-03／04）、`workspace-panels.tsx`（HF-03）、`workspace-storage.tsx`、`replacement-dialog.tsx`（HF-05） |
| 修改應用層 | `src/application/local-store.ts`（自動保存紀錄）、`src/application/manager-summary.ts`（`impact_amount`、Markdown 欄名） |
| 樣式 | `src/app/globals.css`：新增 M0 區塊；原規則只改 `.action-card select` 一行 |
| 測試 | 新增 `tests/m0-hotfix.test.ts`、`tests/e2e/m0-hotfix.spec.ts`；修改 `tests/e2e/workspace.spec.ts`、`review-v2-a.spec.ts`、`scenarios.spec.ts`、`replacement-helpers.ts` |
| 文件 | 新增 `docs/PRD_v3.md`、`docs/assets/*.png`、`spec/*`（PRD 套件）；更新 `docs/DECISIONS.md`、`docs/STATUS.md`；新增 `verification/M0/*` |

## 驗收指令與結果

| 指令 | 結果 | 備註 |
|---|---|---|
| `npm run typecheck` | 通過 | exit 0 |
| `npm run lint` | 通過 | `eslint . --max-warnings=0`，exit 0 |
| `npm test -- --run` | 通過 | 41 個測試檔／829 項（v2 原有 819 項＋M0 新增 10 項） |
| `npm run build` | 通過 | 由 E2E 的 webServer 以 `npm run build` 實際建置（production） |
| `npm run test:e2e` | 通過 | 456 項：**439 passed、17 skipped、0 failed、0 flaky**，retries 0，22.1 分鐘（4 種視窗）。17 項略過都是預期內：HF-07 只在 390×844 執行（9 項）、截圖只在 desktop 產生（6 項）、axe 只跑 desktop 與 mobile（2 項）。axe 的 2 項是本機腳本、不提交；**提交版測試套件為 437 passed、15 skipped**（v2 原有 404 項＋M0 新增 48 項）。以 `npx playwright test -c playwright.local-3110.config.ts` 執行：此設定只把埠號由 3100 改為 3110（本機 3100 被另一份副本佔用），不提交，其餘沿用 `playwright.config.ts` |
| axe（DoD 第 7 條） | 部分 | 9 種畫面狀態 × desktop／mobile：0 critical；serious 只有 `color-contrast`。M0 新增的元素（已保存標示、自動保存詢問、更多選單、試算通路、會議版本說明、正負轉換、對獲利影響金額）**沒有任何違規節點**；命中的節點都使用 v2 既有的灰字色（例如 `.bridge-total`、診斷卡 `.note`，M0 只改了其中的文字）。會議版本底色換上前後，違規節點集合完全相同（desktop 58／mobile 54）。詳見 `axe-desktop.json`、`axe-mobile.json` |

## 錨點與一致性關卡

| 項目 | 結果 |
|---|---|
| `spec/tools/gen_test_anchors.py --repo .` 重新產生 | 與 `spec/test_anchors.v1.json` 逐位元組相同 |
| M0 相關錨點 | 示範資料淨營收 7,850,657.90；三件事折扣 -1,188,365.10（與拆解同號）；MARKETPLACE 行銷後貢獻 721,100.88 → -61,169.93；替代資料淨營收 600.00。單元測試與 E2E 都有斷言 |
| 一致性關卡（第 20.5 節） | 不適用：M0 未觸及計算、帳本或轉接；`git diff main -- src/domain fixtures tests/fixtures package.json package-lock.json` 為空 |

## 截圖（verification/M0/）

每項都有 390×844 與 1440×900 兩種尺寸，由 `m0-hotfix.spec.ts`「M0 截圖」測試產生。

| 需求 | 檔案 |
|---|---|
| HF-01 | `hf01-scenario-channel-{390x844,1440x900}.png` |
| HF-02 | `hf02-meeting-differs-*.png` |
| HF-03 | `hf03-three-things-discount-*.png`、`hf03-bridge-*.png` |
| HF-04 | `hf04-kpi-transition-*.png` |
| HF-05 | `hf05-autosave-prompt-*.png`、`hf05-restored-saved-badge-*.png` |
| HF-06 | `hf06-more-menu-*.png` |
| HF-07 | `hf07-dialog-*.png`、`hf07-after-import-top-*.png`、`hf07-action-status-*.png` |

## 偏離 PRD 的地方與理由（已記入 docs/DECISIONS.md）

| 項目 | 內容 |
|---|---|
| 負號字元 | PRD 寫「−」（U+2212），本站沿用 ASCII「-」，與既有格式器、CSV／Markdown 匯出及 Excel 解析一致 |
| 通路名稱 | PRD 例句「試算通路：平台」；現行站仍顯示 `MARKETPLACE`。中文顯示名稱屬 MET-01（M1.3）／M1.5 |
| 自動保存儲存層 | 沿用既有 IndexedDB，另建 `autosave-current` 紀錄，同意旗標放在 localStorage；屬 M1.2 Dexie 上線前的止血版 |
| DoD 第 6 條文字掃描 | M0 不套用：HF-01 驗收文字本身含 `MARKETPLACE`；M0 新增的程式行沒有新增禁用詞 |
| E2E 埠號與 axe 工具 | 本機以 3110 埠執行；axe-core 4.13.0（MPL-2.0）只放在 `/tmp`，沒有加入 repo 相依套件 |

## 已知限制

| # | 限制 |
|---|---|
| 1 | **axe color-contrast（既有）**：`.breadcrumb` `#798882`、`.eyebrow` `#7d9187`、`.muted` `#718178`、`.diagnostic-card h4/p` `#66816b`／`#687d6b`、`.bridge-total` `#7b8a7e`、`.tag`、`.tiny-tag`、`.sidebar-*`、`.subtitle`、`.text-button`、`.clear-button` 等 12px 灰字在白底未達 4.5:1。M0 只改了 `.action-card select` 一行既有 CSS，其餘都是新增，因此這些都是 v2 既有問題。依「範圍外只記錄」原則不在 M0 修改，建議併入 M1.3（設計標記）或 M2.8（NFR 無障礙） |
| 2 | 自動保存只保留一份「目前工作區」，不跨分頁同步、不加密；共享電腦應選「先不要」。替換資料前仍會先提醒 |
| 3 | `npm test`（不加 `--run`）在非 CI 環境會進入 vitest 監看模式而不結束，DoD 指令必須加 `-- --run` |
| 4 | 只測 Chromium；Safari、Firefox、實體裝置未執行。未部署正式站 |
| 5 | 完整 E2E 會改寫既有 `verification/review-v2-a-*` 的證據檔；為保留 A 批原始證據，提交前已還原，M0 證據只放在 `verification/M0/` |

## 建議的下一張卡片

**M1.1 Workspaces 與核心抽離**（LED-05、NFR-12、NFR-13）：建立 `packages/kernel` 與一致性測試工具，並套用第 20.2 節的 AGENTS.md 修訂。若希望 DoD 第 7 條在 v2.1 就全部通過，可先開一張小卡調深既有灰字色票（約 0.5 天，只改 CSS）。
