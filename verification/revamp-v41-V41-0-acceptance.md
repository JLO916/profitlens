# v4.1 V41-0 驗收：基準與護欄（2026-10-14）

依 `docs/revamp-v4.1/06_BATCHES.md` 的「V41-0」，相關拍板是 D-V41-1、12、15，全部依建議值。這批不改任何畫面。

| 步驟 | commit | 內容 |
|---|---|---|
| 開工錨點 | `39892a2` | 拍板、CLAUDE.md 換成 v4.1 版 |
| 實作 | `c791343` | 一個代理在主 checkout 完成 |
| 審查 | — | 1 項 major：copy-style 棘輪沒有掃 guideLabels |
| 修正 | `4a2ed79` | 修正上述 major |

## 完成項目

| 項目 | 狀態 |
|---|---|
| O3：`next`、`eslint-config-next` 升到 16.3.8（exact） | 完成。lockfile 只有 next 家族的版本號變動，沒有增減套件。<br>`npm audit` 由 10 high 降為 9 high，Next.js 的 6 項都已解決；其餘各項評估見基準文件 §2.2 |
| labels 護欄 | 完成。`verification/revamp-v41/labels-v4.flat.json` 收 2,839 個葉節點，測試斷言逐字相同。<br>新 key 前綴設為 `guide.`、`shell.guideV41.`，`LABEL_GROUPS` 維持 24。<br>`guide.zh-TW.ts` 存在時，copy-style 也會掃描它 |
| 掃描規則 | 完成。<br>• `{ui:路徑}` 視為佔位符。<br>• 新增 guide 標題的 L1 規則。<br>• `guide.*` 加最高級黑名單。<br>• tsx 掃描範圍擴到 `src/app`。<br>既有字串的掃描結果完全相同 |
| testid 第四份清單 | 完成。`testids-v41-added.txt` 只有表頭；四份基準的刪除數都是 0 |
| v4.1 capture config 與首載量測 | 完成。新增 `/` 首載（V41-1 起門檻 519,427＋1,024），以及 404 頁的框架基準 131,465 |
| 功能保留與文字斷言延續 | 完成。<br>• 功能保留表：177 列；O3 已打勾。<br>• 殼層列 2、3、6、7、21 與頁尾列 12、57 標為 V41-1 重新核對。<br>• `e2e-text-assertions.csv`：1,431 列延續 |
| 基準紀錄 | 完成，見 `verification/revamp-v41/V41-0-baseline.md` |

## 驗收結果

| 命令 | 結果 |
|---|---|
| typecheck、lint、build | exit 0 |
| `npm test -- --run` | 164 檔、3,387 個測試全過 |
| audit:ui、contrast | 與 v4.0.0 相同；contrast 85／85 |
| 完整 E2E | **1,067 passed、0 failed、25 skipped** |
| 畫面基準 | 52 張與 V4-11 逐位元組相同 |
| First Load JS（`/`） | 519,427 bytes，多 105 bytes，來自 Next.js 16.3.8 |
| 390 TBT（三次中位數，ms） | 載入示範資料 1,079.0、健檢 821.8、商品 99.8、會議 1,029.4、資料來源 17.3，五項都低於門檻 |
| Lighthouse | a11y 全 100 |
| axe | 23／23／23／21 個狀態，全部 0 問題 |
| keyboard-walk、network-log | 與 v4.0.0 相同 |
| 禁區與邊界五條 | 都是空的 |
| commit 之後的 diff | 空（收尾 commit `8aac363`；禁區與邊界） |

## 待使用者決定

- **`source-map-js` 1.2.1 → 1.2.2**：npm audit 列為 high，有非破壞性修正。它只在 build 時處理本專案自己的 CSS，實際風險低。修正要動 lockfile，依規則要先問。如果同意，只更新這一個套件；`npm audit fix` 會一併移除 4 個 optional 套件，所以不建議直接跑它。
