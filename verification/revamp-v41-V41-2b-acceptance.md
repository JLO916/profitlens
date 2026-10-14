# v4.1 V41-2b 驗收：後 6 個功能區（2026-10-15）

依 `docs/revamp-v4.1/06_BATCHES.md` 的「V41-2b」。這批沒有新的拍板事項。

| 步驟 | commit | 內容 |
|---|---|---|
| 開工錨點 | `35bf907` | `GUIDE_AREA_STEPS` 加後 6 區 23 步的 key 與 mediaId（頁面還沒上線） |
| 實作 A：截圖 | `69082cc` | 擷取狀態 S6–S8；23 張基準 PNG、WebP 與清單項目；原本 21 張逐位元組不變 |
| 實作 B：內容與上線 | `079c478` | 後 6 區 guideLabels；`GUIDE_PUBLISHED_AREAS` 改成 11 區；sitemap 13 個網址、首頁目錄 11 張卡；guide-routes 擴到 11 區；testid 加 52 列 |
| 整合 | `b9e47c8`、`9d49482`、`e480f11` | 合併兩支分支；逐張看過 23 張截圖，改寫與畫面不符的 alt 與內文；`GUIDE_MEDIA=write` 只補 labels_hash |
| 審查 | — | 四個面向（規格、內容、截圖品質、無障礙／測試／效能），major 3 項，nit 49 項只記錄 |
| 審查修正 | `504960f` | 見 §5 |
| 收尾 | `a59cf22` | 孤兒檔檢查忽略點開頭的系統檔、驗收、基準、STATUS、功能保留表 |

## 1. 完成項目

| 06 項目 | 狀態 | 說明 |
|---|---|---|
| 1 擷取狀態 S6–S8 | 完成 | S6：S1 後在假設試算用「維持現況」試算，再新增第二個方案、套用「砍廣告一半」並試算。<br>S7：S6 後通路健檢第一項加入待辦、方案 1 選入會議。<br>S8：S7 後結束會議並確認。<br>另有套用後的 S4 狀態，給資料來源頁的缺列截圖用 |
| 2 6 個功能區 | 完成 | scenarios 4 張、actions 3 張、meeting 5 張、data 4 張、evidence 3 張、export 4 張，共 23 張；全站共 44 張 |
| 3 sitemap、目錄、testid | 完成 | sitemap 13 個網址；首頁目錄 11 張卡；V41-1、V41-2a 時還是純文字的功能區名稱，現在全部是連結；`testids-v41-added.txt` 加 52 列 |
| 4 preview 部署詢問 | 見 §7 | 依 D-V41-24，在回報裡詢問，使用者同意才推送 |

**與 GUIDE_CONTENT 草稿不同的地方**：都是為了讓文字與畫面一致，GUIDE_CONTENT 已同步更正。

- **S6 多試算一個方案**：草稿只說「新增一個方案」。若第二個方案空白，比較圖只有一條 0，沒有東西可比。
- **介面名稱照實際畫面**：
  - 待辦編輯用實際欄位名：期限、怎麼看成效、何時喊停。
  - 置頂是卡片標題左邊的星號，不是右上角。
  - 決議是會議頁首的選單。
  - 計算與來源的精確值在金額下方，不是標題下一行。
- **試算第 2 步**：不再引用已在 R5 移除的「全部填 0（維持現況）」按鈕，改寫成套用範本「維持現況」會把五格都填 0。
- **門檻圖截圖**：擷取時填三個虛構的銷量假設（−50%、−20%、+30%）並試算，圖上看得到三個假設點，與步驟文字一致。
- **會議結束後的匯出**：框住會議歷史裡的「下載 Markdown」。草稿寫的 `meeting.page.outputs`「匯出」現在畫面上沒有。

## 2. 驗收命令與結果（程式 `504960f`，收尾只改測試的檔案過濾）

| 命令 | 結果 |
|---|---|
| `npm run typecheck`、`npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v41/V41-2b/ui-audit.json` | hex 0、圓角 4、字級 11（不變）、JSX 中文 0、元件字串常值中文 0、labels 違規 0 |
| `npm run contrast-check` | 85／85 |
| `npm test -- --run` | **166 檔、3,509 個測試全過** |
| `npm run build` | exit 0；`/guide` 與 11 個 `/guide/{area}` 都是靜態頁 |
| `npm run test:e2e`（帶 `NETWORK_LOG_OUT`、`KEYBOARD_WALK_OUT`、`AXE_OUT`、`GUIDE_SHOTS_OUT`） | **1,127 passed、0 failed、29 skipped（34.1 分鐘）**；跑完已還原 E2E 改寫的追蹤檔 |
| `CAPTURE_BATCH=V41-2b` | **38 passed、0 failed**，64 張全部 0 差異（見 §4） |
| `GUIDE_MEDIA=check` × 2 | 兩次都 44／44 通過，0 差異 |
| `GUIDE_MEDIA=write` | 44 張都是 unchanged，`git status` 沒有任何變動 |
| launch-check | 13 項全部通過，補充 14 項全部通過；sitemap 13 個網址 |
| Lighthouse × 3 | 見下方；`/guide`、`/guide/overview` 的 a11y、SEO 都是 100；390 TBT 五項通過 |
| 禁區與邊界五條 | 都是空的 |
| `package.json`、`package-lock.json` | 沒有變動 |

## 3. 量測

| 項目 | 實測 | 門檻 | 結果 |
|---|---|---|---|
| `/` First Load JS（gzip） | 519,687 | 520,451 | 通過，與 V41-1、V41-2a 相同 |
| `/` 首載 chunk 的 `GUIDE_SENTINELS` | 0、0 | 0 | 通過 |
| `/guide` 與 11 個 `/guide/{area}` First Load JS | 都是 131,465 | 136,585 | 通過，等於框架基準；禁用符號都是 0 |
| B2 首屏、B9 DOM 節點 | 與 V41-2a 相同 | — | 通過 |
| axe | desktop、laptop、tablet 各 25 個狀態，mobile 23 個 | 0 serious | 全部 0 問題 |
| keyboard-walk | `/guide`、`/guide/start` 與 V41-2a 相同 | — | 通過 |
| network-log | 下載 5 種、沒有 POST；工作台沒有請求 `/guide/` | — | 通過 |

**截圖大小**（WebP）：

- 新增 23 張合計 599,008 bytes，最大一張 meeting-present 86,188（上限 204,800）。
- 全站 44 張合計 1,236,048 bytes。
- 每區合計：scenarios 131,278、actions 47,084、meeting 149,178、data 92,840、evidence 101,076、export 77,552；前 5 區與 V41-2a 相同。都遠低於 1.5 MB。

**390 寬的顯示比例**：44 張中 21 張低於 0.45，每張都有原尺寸連結。V41-2a 的 11 張理由見 `verification/revamp-v41-V41-2a-acceptance.md`；這批新增 10 張：

| 截圖 | 原圖寬 | 比例 | 為什麼不再裁窄 |
|---|---|---|---|
| scenarios-setup | 1,188 | 0.28 | 「新增方案」在最右邊 |
| scenarios-inputs | 753 | 0.44 | 兩欄輸入，「增減／改成」切換在右邊 |
| scenarios-compare | 1,188 | 0.28 | 比較表的欄位與長條圖都是整列寬 |
| actions-board | 1,204 | 0.28 | 看板有四個狀態欄 |
| meeting-agenda | 1,144 | 0.29 | 議程目錄在最左、第 2 項的金額在最右 |
| meeting-present | 1,440 | 0.23 | 規格要求截整個畫面（投影本來就是整個畫面） |
| meeting-finalize | 896 | 0.37 | 會議歷史面板 880 px，按鈕在右邊 |
| data-coverage | 1,188 | 0.28 | 時間軸是整列寬 |
| data-issues | 1,188 | 0.28 | 「下載問題清單 CSV」在最右邊 |
| data-preview | 1,188 | 0.28 | 預覽表是整列寬 |

**Lighthouse × 3**（開跑時 1 分鐘負載 2.49、2.26、2.32）：

- **工作台 8 頁**：a11y 三次都是全部 100；首頁 Performance 1440 是 100、390 是 94–96；預先載入的 chunk 都沒有落入量測區間。
- **390 TBT 中位數**（ms）：五項都通過。

| 步驟 | 第 1 次 | 第 2 次 | 第 3 次 | 中位數 | 門檻 |
|---|---|---|---|---|---|
| 載入示範資料 | 1,091.0 | 987.5 | 1,001.1 | **1,001.1** | 1,109.1 |
| 健檢 | 834.2 | 793.1 | 791.9 | **793.1** | 832.3 |
| 商品 | 93.3 | 82.7 | 82.9 | **82.9** | 129.9 |
| 會議 | 1,001.2 | 974.3 | 960.4 | **974.3** | 1,071.2 |
| 資料來源 | 17.6 | 9.5 | 8.0 | **9.5** | 50.0 |

- **說明頁**（navigation 模式，三次）：

| 頁面 | 尺寸 | Accessibility | Performance | SEO | CLS | TBT | LCP |
|---|---|---|---|---|---|---|---|
| `/guide` | 1440 | 100 | 100 | 100 | 0 | 0 ms | 421–450 ms |
| `/guide` | 390 | 100 | 100 | 100 | 0 | 9.5–13 ms | 1,866–1,878 ms |
| `/guide/overview` | 1440 | 100 | 100 | 100 | 0 | 0 ms | 443–522 ms |
| `/guide/overview` | 390 | 100 | 98–99 | 100 | 0 | 8–10 ms | 2,178–2,473 ms |

三次都達到門檻；SEO 沒有未通過的稽核。

證據：`lighthouse-runs/`（第 1、2 次）、`metrics.json`（第 3 次）、`lighthouse/`（報告）。

## 4. 畫面基準

- **比對方式**：`V41-2a/snapshots/` 的 64 張先複製到 `V41-2b/snapshots/`，不帶 `--update-snapshots` 跑。
- **結果**：64 張全部 0 差異，這批不需要更新任何基準。
- **15 說明首頁首屏**：允許變動，但實際沒有變。目錄多的 6 張卡在首屏以下，本頁目錄與 V41-2a 相同。

## 5. 審查

四個面向各一位審查，只報 blocker、major，共 3 項：

1. **試算第 2 步引用已移除的按鈕**：「全部填 0（維持現況）」在 R5 已拿掉，字串還在，所以文字檢查抓不到。已改寫，GUIDE_CONTENT 同步更正（`504960f`）。
2. **門檻圖截圖沒有假設點**：步驟文字要讀者填三個假設看門檻，截圖卻沒有填。
   - 擷取時改成填三個虛構的假設並試算；alt 補回三個假設的位置。
   - 只重拍這一張，其餘 43 張不動（`504960f`）。
3. **孤兒檔檢查把 `.DS_Store` 當成孤兒**：主 checkout 的 `public/guide/` 有 Finder 自動產生的 `.DS_Store`（已在 .gitignore），會讓 `npm test` 在本機失敗。
   - 修正代理在 worktree 重現不了，所以沒改。
   - 收尾時改成孤兒檔檢查忽略點開頭的檔名。V41-2a 審查時已記為 nit，這次真的發生了。

**整合時另外改的**：逐張看過 23 張截圖，改寫與畫面不符的 alt。例如：

- 置頂星號的位置。
- 決議是選單，不是「選入的方案」。
- 原始明細只框第一列的檔名與行號。

**nit 49 項只記錄、不修**，主要有：

- **截圖裡的英文**：無頭 Chromium 的原生控制項顯示英文。export-save、export-backup 的檔案選擇寫「Choose File」，actions-edit 的日期是 mm/dd/yyyy。截圖不修圖。
- **裁切邊緣**：export-menu、export-save 左緣露出約 8 px 的底頁；scenarios-setup 上緣離標題只有約 4 px。
- **註解過時**：`src/app/sitemap.ts` 的註解仍寫兩個網址；`testids-v41-added.txt` 部分行號註記過時。
- **連結之間**：「相關說明：」後的多個連結之間只有間距、沒有分隔字。

## 6. 給後續批次的提醒

- **V41-4**（O1 分享圖、O2 CLS）：
  - O2 若改到說明截圖拍到的版面，要跑 `GUIDE_MEDIA=write` 並逐張寫理由。
  - 驗收的 E2E 命令仍要帶 `GUIDE_SHOTS_OUT`。
- **H7**（使用者看說明頁）：11 個功能區頁都已上線，可以開始。

## 7. 人工關卡與待決

- **H7**：未執行／待人工，擋 v4.1.0 正式上線。現在可以做：本機 `npm run dev` 開 http://127.0.0.1:3000/guide，或部署 preview（要使用者同意）。
- **preview 部署**（D-V41-24）：依 06 V41-2b 第 4 項詢問使用者；沒有同意就不推送。
- **source-map-js 1.2.2**：仍待使用者同意（V41-0 提出）。
- 沒有推送、沒有部署。

## 8. commit

- 收尾 commit `a59cf22`。
- commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區）` 與 `git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts` 都是空的。
- 沒有推送、沒有部署。
