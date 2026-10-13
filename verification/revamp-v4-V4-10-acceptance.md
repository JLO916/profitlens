# Revamp v4 V4-10 驗收：P2 圖表（G8、G17、G24）（2026-10-13）

依 `docs/revamp-v4/06_BATCHES.md`「V4-10」，D-V4-12、21、22 都是 A。

工作方式：

1. 三個 worktree 平行實作，基準都是 `8b945f4`：
   - A：G8（`a62402f`）
   - B：G17（`905edda`）
   - D：G24（`23f577d`）
2. 依序合併（`53a54e2`、`4392bb2`、`8bd10e3`），整合 commit 是 `a882148`。
3. 一位審查，0 項 blocker 或 major。

## 1. 完成項目

| 項目 | 狀態 | 說明 |
|---|---|---|
| G8 兩期每日累計 | 完成 | **算法**：新增 `cumulativeDaily`（`cumulative-daily-v1`）。日值來自從 `pnl-table.ts` 抽出並匯出的 `periodDailyMetrics`；`buildPnlTable` 的輸出不變，`tests/pnl-table.test.ts` 沒改也通過。<br>**驗證**：示範資料本期末日累計 1,269,792.73、上期 1,868,626.68，各等於該期合計；golden 單日 255.00。示範資料從第 1 天起就落後上期。<br>**呈現**：放在總覽的進階 `<details>` 內；目標只在 matched 時畫一條水平線，不畫等速目標線。點擊累計值開抽屜，用 `valueKind: "level"`，數字不帶「+」。<br>**Excel**：「圖表資料」加 G8 段。<br>**X37**：總覽主層仍是 4 張；收合時可見的圖框 4 個，展開進階後 5 個 |
| G17 待辦到期分布 | 完成 | **算法**：新增 `actionDueBuckets`（`action-due-buckets-v1`），分逾期、7 天內（今天到今天＋6 天）、之後、未填四個桶，四桶加總等於未完成待辦數。<br>**元件**：C24 BarCell 加 count 模式，既有模式的輸出不變。小表依內容寬，不撐滿版面。<br>**axe**：加「待辦頁新增一張卡」狀態 |
| G24 商品折扣率 × 毛利率散佈 | 完成 | **載入**：`products-scatter-lazy.tsx` 用 `next/dynamic` 載入，放在商品頁進階 `<details>` 內，第一次展開才下載。<br>**首載證明**：散佈圖的 chunk 是 `333.320e7d5e45d6c88e.js`，不在首頁 HTML 的腳本清單裡（`verification/revamp-v4/V4-10/first-load-proof.md`）。<br>**限制句**：「只呈現分布，不代表因果。」 |
| labels | 完成 | 只新增 `overview.chartsV4.cumulative`、`actions.chartsV4.due`、`products.chartsV4.scatter` |

## 2. 驗收命令與結果

| 命令 | 結果 |
|---|---|
| typecheck、lint | exit 0 |
| audit:ui、contrast-check | design 15 項沒有升高；contrast 85／85 |
| `npm test -- --run` | **164 檔、3,370 個測試全過** |
| 整合時的全套 E2E | 1,051 passed、16 failed、25 skipped。<br>16 條失敗是 4 個測試 × 4 個尺寸，原因都是斷言寫法，不是功能錯誤：Recharts 3 的圖層自帶 `tabindex=-1`、Label 換了圖層、Excel 版本清單少列一項、定位器同時選到收合的進階區。<br>修正 5 處斷言，再加一處 G17 小表寬度的 CSS 修正；受影響的 spec 在四個尺寸重跑全過 |
| **最終程式全套 E2E（`6ba99ab`，帶三個 `*_OUT`）** | **1,067 passed、0 failed、25 skipped（31.9 分鐘）**；跑完已還原 E2E 改寫的追蹤檔 |
| `CAPTURE_BATCH=V4-10` | 只有 04（G17）與 06（G24 的收合列）在四個尺寸有差異，02 是 0。<br>更新基準後重跑：23 passed、5 skipped（`capture-diff.md`） |
| Lighthouse | **整合後第一輪三次**：載入示範資料 1,165.2、健檢 834.9 超過門檻。原因是 G8 在進階區收合時也照算兩期每日累計，低負載下仍多約 150ms。<br>**修正 G8 延後計算（`6badab3`）後再跑三次**：載入示範資料 1,108.6 通過；健檢 841.6 沒過，但 V4-10 沒有動到健檢頁。<br>**依 D-V4-47 與 V4-9b 同場成對 10 對**（負載 1.7–2.6）：p3 的 V4-10 那一次有 10 個預先載入 chunk 落入量測區間，排除；其餘 9 對 V4-10 的中位數是載入示範資料 1,077.1、健檢 825.8、商品 99.1、會議 1,022.1、資料來源 17.5，**五項都低於門檻**。<br>證據在 `verification/revamp-v4/V4-10/lighthouse-ab/`、`lighthouse-runs/`。a11y 全 100 |
| 禁區四條命令與 commit 之後的 diff | 都是空的（收尾 commit `f1f65c7`） |

**其他數字**：

- **First Load JS**：519,322 bytes（含 G8 延後計算的修正），比 V4-9b 多 3,130；門檻 545,397，還剩 26,075。
- **B9 DOM 節點**：總覽多 16 個（G8 收合時的骨架）；商品頁 2,248 → 2,510（G24 的資料表收合但掛載），上限 3,322；其他五頁不變。
- **axe**：23／23／23／21 個狀態，全部 0 問題。
- **棘輪**：不升；chart-lint 為 0。
- **testid 刪除數**：0。
- **功能保留表**：V4-10 的 9 列都打勾：31、36、40、D09、D29、EX3、G8、G17、G24。

## 3. 已知限制

- **G24 標題的計數**：標題「{n} 個商品毛利率為負」照 PRD 當成 A 級的呈現層計數，沒有另加版本常數。
- **390 展開 G24**：仍會下載散佈圖的 chunk，畫在 `display:none` 的框內；改看下方資料表。
- **G8 在 390**：Recharts 會省略放不下的刻度，「第 1 天」可能不顯示。
