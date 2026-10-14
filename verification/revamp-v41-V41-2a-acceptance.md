# v4.1 V41-2a 驗收：媒體管線與前 5 個功能區（2026-10-14）

依 `docs/revamp-v4.1/06_BATCHES.md` 的「V41-2a」，相關拍板是 D-V41-20、21、22，全部 A。開工前使用者回覆「25A」，D-V41-25 已在 V41-1 收尾套用（`7dddcdf`）。

| 步驟 | commit | 內容 |
|---|---|---|
| 開工錨點 | `fc26ed7` | `guide.ts` 加 `GUIDE_AREA_STEPS`（5 區 21 步的 key 與 mediaId）與 `GUIDE_PUBLISHED_AREAS`（先空）；空的媒體清單 |
| 實作 A：媒體管線 | `09e6c8f`、`a87d31c` | `guide-media.config.ts`、`capture.spec.ts`、`shared.ts`、`labels-hash.ts`；21 張基準 PNG、WebP 與清單；guide-content 加媒體同步檢查；synthetic-4-channel README |
| 實作 B：功能區頁 | `99c21d2` | `/guide/[area]`、`guide-step.tsx`、`guide-toc.tsx`、5 區 guideLabels、首頁目錄 5 張卡、sitemap 7 個網址 |
| 實作 C：測試與量測 | `cf66cff` | 功能區頁 E2E、`/guide/start` 鍵盤走查、axe 加 `/guide/overview`、功能區頁 First Load、畫面基準 16、launch-check 說明截圖、Lighthouse 加 `/guide/overview`、network-log 不請求 `/guide` |
| 整合 | `67fc2c4`、`3e8dc80`、`81323c8`、`0af1cfb`、`4b30029` | 合併三支分支；看過 21 張截圖後改 4 則 alt；`GUIDE_MEDIA=write` 只補 labels_hash |
| 審查 | — | 四個面向（規格、內容、截圖品質、無障礙／測試／效能），major 9 項（合併重複後 6 件），nit 47 項只記錄 |
| 審查修正 | `d575000` | 見 §5 |
| 收尾 | `8d6286f` | 頁尾一句改字、驗收、基準、STATUS、功能保留表 |

## 1. 完成項目

| 06 項目 | 狀態 | 說明 |
|---|---|---|
| 1 媒體管線 | 完成 | `GUIDE_MEDIA=check` 只比對、不寫任何檔；`GUIDE_MEDIA=write` 只更新比對失敗或新增的媒體。<br>基準 PNG 在 `verification/guide-media/baseline/`；WebP 由 Chromium canvas 品質 0.9 轉檔。<br>清單 `src/application/guide-media.json` 只記 id、檔名、寬高、bytes、基準 PNG 的 SHA-256、labels_hash，與整份的 `updated`（2026-10-14）。<br>強調框只注入擷取頁面，不改產品程式。擷取狀態 S0、S1、S3、S4、S5，時間固定在 `FIXED_NOW` |
| 2 路由與元件 | 完成 | `src/app/guide/[area]/page.tsx`：`generateStaticParams`、`dynamicParams = false`、`guideMetadata`（canonical＝`/guide/{area}`、og:image＝`/og.png`）。<br>`guide-step.tsx`：`<figure>`，圖外包連到原尺寸檔的 `<a>`，可及名稱＝alt＋「（開啟原尺寸圖）」；第一張不 lazy，其餘 lazy。<br>`guide-toc.tsx`：首頁與功能區頁共用 |
| 3 5 個功能區 | 完成 | start 4 張、import 5 張、overview 5 張、diagnosis 4 張、products 3 張，共 21 張。<br>synthetic-4-channel README 的用途段依 D-V41-21＝A 修改 |
| 4 同步檢查 | 完成 | `tests/guide-content.test.ts` 加媒體檢查：清單、檔案存在、SHA-256、bytes、孤兒檔、單張 ≤ 200 KB、每區 ≤ 1.5 MB、labels_hash |
| 5 測試與量測 | 完成 | guide-routes 每區 SSR；E2E 每區四尺寸；keyboard-walk 加 `/guide/start`；axe 加 `/guide/overview`；Lighthouse 加 `/guide/overview`；畫面基準 16 |
| 6 sitemap 與目錄 | 完成 | sitemap 7 個網址；首頁目錄 5 張卡；`testids-v41-added.txt` 加 47 列（guide-area 5、guide-step 21、guide-shot 21） |

**內容上的處理**（都在規格範圍內）：

- **介面字串改成引用**：
  - 匯入四步的標題改引用精靈上的步驟名（`{ui:importWizard.steps.0..3}`）。
  - 檢核步驟的按鈕引用實際的「套用這批資料」（`{ui:importWizard.commit}`）。
  - 商品表步驟引用畫面上的標題「全部商品」（`{ui:products.highlights.fullTable}`）。
- **圖說**：GUIDE_CONTENT 沒有起草，依 PRD §3.6 每一步寫一句這一步的結果，頁面另起一行加資料來源註記。
  - S1：「畫面為示範資料（虛構）」。
  - S3、S4、S5：「畫面為虛構的合成資料」。S3 依 D-V41-21＝A 的決定欄，GUIDE_CONTENT §0 原本寫示範資料，已更正。
  - S0：首頁空狀態沒有資料，不加註記。
- **alt 依 PRD §3.6**：寫畫面上看得到什麼；18 張有強調框的另寫「強調框框住哪裡」。
- **還沒上線的功能區只顯示名稱、不放連結**：「要注意」與「下一步」提到的資料來源、計算與來源、待辦、假設試算、匯出這幾區，到 V41-2b 才會變成連結。
- **頁尾一句改字**：「截圖是示範資料的畫面」改成「截圖是虛構資料的畫面」，因為現在也有合成資料的截圖。這是收尾時改的，截圖與雜湊都不受影響。

## 2. 驗收命令與結果（程式 `d575000`，收尾 `8d6286f` 只改頁尾一句）

| 命令 | 結果 |
|---|---|
| `npm run typecheck`、`npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v41/V41-2a/ui-audit.json` | hex 0、圓角 4、字級 11（不變）、JSX 中文 0、元件字串常值中文 0、labels 違規 0 |
| `npm run contrast-check` | 85／85 |
| `npm test -- --run` | **166 檔、3,465 個測試全過** |
| `npm run build` | exit 0；`/guide` 與 5 個 `/guide/{area}` 都是靜態頁 |
| `npm run test:e2e`（帶 `NETWORK_LOG_OUT`、`KEYBOARD_WALK_OUT`、`AXE_OUT`，另加 `GUIDE_SHOTS_OUT`） | **1,103 passed、0 failed、29 skipped（33.7 分鐘）**；跑完已還原 E2E 改寫的追蹤檔 |
| `CAPTURE_BATCH=V41-2a` | 第一次：只有 15 不同（四尺寸），16 寫入新基準；更新 15 後重跑 **38 passed、0 failed**（64 張） |
| `GUIDE_MEDIA=check` × 2 | 兩次都 21／21 通過，0 差異 |
| `GUIDE_MEDIA=write` | 21 張都是 unchanged，`git status` 沒有任何變動 |
| launch-check | 13 項全部通過，補充 14 項全部通過（含 `guide-media`：`/guide/start/start-load.webp` 200） |
| Lighthouse × 3 | 見下方；`/guide`、`/guide/overview` 的 a11y、SEO 都是 100；390 TBT 五項通過 |
| 禁區與邊界五條 | 都是空的 |
| `package.json`、`package-lock.json` | 沒有變動 |

## 3. 量測

| 項目 | 實測 | 門檻 | 結果 |
|---|---|---|---|
| `/` First Load JS（gzip） | 519,687 | 520,451 | 通過，與 V41-1 相同（這批不改工作台） |
| `/` 首載 chunk 的 `GUIDE_SENTINELS` | 0、0 | 0 | 通過 |
| `/guide` First Load JS | 131,465 | 136,585 | 通過，等於框架基準 |
| 5 個 `/guide/{area}` First Load JS | 都是 131,465 | 136,585 | 通過；禁用符號都是 0 |
| B2 首屏、B9 DOM 節點 | 與 V41-1 相同 | — | 通過 |
| axe | desktop、laptop、tablet 各 25 個狀態，mobile 23 個 | 0 serious | 全部 0 問題（多的 1 個是 `/guide/overview`） |
| keyboard-walk `/guide/start` | 1440 與 390 相同：本頁目錄第一項第 2 步、第一個步驟與第一張圖的原尺寸連結第 6 步 | — | 看不見焦點 0、重複 0、`aria-hidden` 內 0 |
| network-log | 下載 5 種、沒有 POST；工作台走查沒有請求任何 `/guide/` 檔 | — | 通過 |

**截圖大小**（WebP）：

- 21 張合計 637,040 bytes，單張最大是 import-review 111,950（上限 204,800）。
- 每區合計：start 71,904、import 239,138、overview 170,198、diagnosis 85,986、products 69,814（上限 1.5 MB）。

**390 寬的顯示比例**（顯示寬度 ÷ 原圖寬度，`guide-shots.json`）：21 張中 11 張低於 0.45，每張都有原尺寸連結。理由取自截圖品質審查的逐張判定；1440 寬時每張圖的比例都在 0.61–1.0。

| 截圖 | 原圖寬 | 比例 | 為什麼不再裁窄 |
|---|---|---|---|
| import-files | 942 | 0.35 | 換一份、移除按鈕靠右 |
| import-basis | 942 | 0.35 | 兩欄的日期輸入與標記會被切掉 |
| import-review | 990 | 0.34 | 規格要求與畫面基準 12 同一個範圍 |
| import-issues | 942 | 0.35 | 修法欄在最右邊 |
| overview-snapshot | 1,204 | 0.28 | 一句話與五格 KPI 帶本來就是整列寬；GUIDE_CONTENT 已預期超過 800 |
| overview-top-three | 1,204 | 0.28 | 三件事每列的影響金額與按鈕在最右邊 |
| overview-bridge | 1,188 | 0.28 | GUIDE_CONTENT 要求截整個圖框（瀑布圖與旁邊的拆解表） |
| diagnosis-list | 1,142 | 0.29 | 健檢列的影響金額條在右邊 |
| diagnosis-share | 1,188 | 0.28 | 0–100 的軸橫跨整個圖框 |
| diagnosis-heat | 800 | 0.42 | 已裁到 800；裁到約 450 會切掉標題下的說明行 |
| products-table | 798 | 0.42 | 已在 800 以內；再窄會切掉更多欄位 |

import-mapping 在審查修正時裁到 600 px，比例由 0.35 提高到 0.55。

**Lighthouse × 3**（開跑時 1 分鐘負載 2.21、2.46、2.38）：

- **工作台 8 頁**：a11y 三次都是全部 100；首頁 Performance 1440 是 100、390 是 94；預先載入的 chunk 都沒有落入量測區間。
- **390 TBT 中位數**（ms）：五項都通過。

| 步驟 | 第 1 次 | 第 2 次 | 第 3 次 | 中位數 | 門檻 |
|---|---|---|---|---|---|
| 載入示範資料 | 1,003.6 | 1,057.3 | 1,017.1 | **1,017.1** | 1,109.1 |
| 健檢 | 1,494.0 | 814.4 | 790.9 | **814.4** | 832.3 |
| 商品 | 102.3 | 93.7 | 89.4 | **93.7** | 129.9 |
| 會議 | 1,022.1 | 999.4 | 997.3 | **999.4** | 1,071.2 |
| 資料來源 | 16.7 | 15.4 | 14.6 | **15.4** | 50.0 |

健檢第 1 次的 1,494.0 是單次離群值，第 2、3 次都在門檻內。

- **說明頁**（navigation 模式，三次）：

| 頁面 | 尺寸 | Accessibility | Performance | SEO | CLS | TBT | LCP |
|---|---|---|---|---|---|---|---|
| `/guide` | 1440 | 100 | 100 | 100 | 0 | 0 ms | 424–426 ms |
| `/guide` | 390 | 100 | 99–100 | 100 | 0 | 8.5–21 ms | 1,870–2,022 ms |
| `/guide/overview` | 1440 | 100 | 100 | 100 | 0 | 0 ms | 522–523 ms |
| `/guide/overview` | 390 | 100 | 98 | 100 | 0 | 10.5 ms | 2,474–2,475 ms |

門檻是 a11y 100、SEO ≥ 95、Performance 1440 ≥ 97、390 ≥ 90、CLS 0，三次都達到；SEO 沒有未通過的稽核，canonical 稽核也通過。

證據：`lighthouse-runs/`（第 1、2 次）、`metrics.json`（第 3 次）、`lighthouse/`（報告）。

## 4. 畫面基準

- **比對方式**：`V41-1/snapshots/` 的 60 張先複製到 `V41-2a/snapshots/`，不帶 `--update-snapshots` 跑一次。
- **15 說明首頁首屏**（四尺寸）：不同，本頁目錄多一項「各功能區的操作說明」，下面的內容往下移。屬於允許的變動（目錄多 5 張卡），已更新。
- **16 功能區頁首屏 `/guide/overview`**（四尺寸）：新增。
- **其餘 56 張**：0 差異。
- 重跑：64 張全部通過。

## 5. 審查

四個面向各一位審查，只報 blocker、major。合併重複後的 6 件，`d575000` 全部修正：

1. **import-issues 的圖說、強調框與檢核步驟內文**：缺列的問題沒有原始行號，原本卻寫「每個問題都寫出檔名、行號」，強調框也框到空白的行號格。
   - 圖說與內文改成不承諾行號。
   - 強調框改成只框檔案格，只重拍這一張。
2. **alt 沒有寫強調框框住哪裡**：違反 PRD §3.6。18 張有強調框的 alt 都補上，截圖不變。
3. **匯入精靈 S3 四張的資料註記**：畫面是 `tests/fixtures/inclusive_tax`，不是示範資料。依 D-V41-21＝A 改成「虛構的合成資料」，GUIDE_CONTENT §0 同步更正。
4. **overview-top-three 的 alt**：原本寫「每一項寫通路」，畫面上沒有通路；改成畫面上看得到的內容。
5. **import-mapping 裁切太寬**：內容只到約 560 px，卻截了 942 px；改成 600 px，只重拍這一張。
6. 整合時另改了 4 則與截圖不符的 alt：期間快捷的位置、欄位對照已自動收合、缺廣告列的寫法、全部商品表的工具列。

修正後重跑：`GUIDE_MEDIA=write` 只更新 import-mapping、import-issues 兩張與 overview-top-three 的雜湊；`check` 連兩次 21／21；guide.spec 四尺寸通過。

**nit 47 項只記錄、不修**，主要有：

- **麵包屑**：分隔符號是「/」，PRD 畫的是「›」。
- **步驟標題**：有 3 個不是動詞開頭，沿用 GUIDE_CONTENT 草稿（金額基準與期間、手機上看瀑布圖、有商品毛利為負的商品時）。
- **文案重複**：
  - 「全部商品表可以用排序換排序」，排序選單的名稱就是「排序」。
  - 「本期一句話用一句話說…」。
- **與畫面位置不符**：
  - 商品頁第 1 步說「旁邊的表」，實際在圖下方。
  - overview-bridge-m 的 alt 說每一列都有差額條，合計列沒有。
- **裁切**：diagnosis-heat 裁在 800 px，切到面板右框線。
- **程式重複**：`GuideMediaEntry` 型別在三個檔各寫一次。
- **測試的邊界情況**：
  - 本機有 `.DS_Store` 時孤兒檔檢查會失敗（已在 .gitignore）。
  - 沒有另外檢查 WebP 本身的寬高，只靠 SHA-256 與 bytes。
- **testid 清單**：guide-hub 那一列的行號註記過時。
- **首頁目錄卡片**：標題與一句之間沒有分隔，報讀時連在一起。
- **還沒上線的功能區**：「相關說明：」後面暫時是純文字，看起來像壞掉的連結，V41-2b 後會變成連結。

## 6. 給 V41-2b 的提醒

- 後 6 個功能區照同一套管線加：`GUIDE_AREA_STEPS` 加步驟、`GUIDE_PUBLISHED_AREAS` 加區、`GUIDE_MEDIA=write` 只會新增。
- 驗收的 E2E 命令要帶 `GUIDE_SHOTS_OUT=verification/revamp-v41/V41-2b/guide-shots.json`。

## 7. 人工關卡與待決

- **H7**（使用者看 `/guide`）：未執行／待人工，擋 v4.1.0 正式上線；建議 V41-2b 之後看。
- **source-map-js 1.2.2**：仍待使用者同意（V41-0 提出）。
- 沒有新的待決事項。沒有推送、沒有部署。

## 8. commit

- 收尾 commit `8d6286f`。
- commit 之後 `git diff --stat 625bfa5 HEAD -- （禁區）` 與 `git diff --stat 872662d HEAD -- src/app/api vercel.json src/application/analytics.ts` 都是空的。
- 沒有推送、沒有部署。
