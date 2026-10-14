# v4.1 V41-1 驗收：說明路由、入口與介紹三段（2026-10-14）

依 `docs/revamp-v4.1/06_BATCHES.md` 的「V41-1」，相關拍板是 D-V41-4、5、9、10、11、13、19（D-V41-23 預設沿用），全部依建議值。

| 步驟 | commit | 內容 |
|---|---|---|
| 開工錨點 | `ced36f8` | `shell.guideV41` 入口三條與 V41-1 錨點註解 |
| 實作 A：說明頁 | `5366bf9` | `/guide`、`guideLabels`、`guide.ts`、說明元件、sitemap、`.guide-*` 樣式、兩支單元測試 |
| 實作 B：工作台入口 | `08b42de` | 側欄、手機「更多」、首頁空狀態、頁尾四處入口；shell、mounted-testids 測試 |
| 實作 C：腳本 | `b1f0dd2` | launch-check 補充檢查、Lighthouse 對 `/guide` 跑 navigation |
| 整合 | `5e2de8f`、`6c78e41`、`c1c3b4a`、`3c5b828` | 合併三支分支；加 E2E、keyboard-walk、axe-sweep、首載量測、畫面基準 14、15 |
| 審查 | — | 三個面向（規格、內容、無障礙與測試），2 項 major，指的是同一件事（見 §4）；nit 29 項只記錄 |
| 審查修正 | `a1415f1` | 只改文件：新增待決事項 D-V41-25，版面不改 |
| 驗收修正 | `53c8843` | 「更多」面板加高改用 `data-more-tall`，不用 `body:has`（§3「390 TBT 與成對比較」） |
| 收尾 | 見 §7 | 驗收、基準、STATUS、功能保留表 |

## 1. 完成項目

| 06 項目 | 狀態 | 說明 |
|---|---|---|
| 1 路由與 metadata | 完成 | `src/app/guide/layout.tsx`（跳至主要內容、品牌連到 `/`、「開啟工作台」、頁尾）、`page.tsx`、`metadata.ts`。<br>`guideMetadata()` 回傳完整的 openGraph、twitter 與 canonical。全部是伺服器元件，`/guide` 靜態產生 |
| 2 `src/application/guide.ts` | 完成 | `GUIDE_AREAS` 本批是空陣列；`resolveUiRefs()` 路徑不存在就丟錯。<br>不 import 任何模組，`scripts/*.mjs` 可以直接載入 |
| 3 元件 | 完成 | `guide-text.tsx`、`guide-card-list.tsx`，都是伺服器元件 |
| 4 說明首頁內容 | 完成 | 開頭、為什麼做這套服務（§1.1 產品口吻草稿，逐字）、幫哪些人解決哪些問題、獨特性與代價、30 秒上手、頁尾。<br>功能區目錄：本批 `GUIDE_AREAS` 為空，整段不顯示 |
| 5 工作台入口 | 完成 | 側欄 nav 之後、手機「更多」最後一列、首頁空狀態按鈕列下方、頁尾「指標定義」旁。<br>都是 `<a href="/guide" target="_blank" rel="noopener">`，可及名稱含 sr-only 的「（另開分頁）」 |
| 6 labels | 完成 | 新檔 `src/i18n/guide.zh-TW.ts`；`labels.zh-TW.ts` 只加 `shell.guideV41.*` 3 條；`LABEL_GROUPS` 維持 24 組 |
| 7 sitemap 與上線檢查 | 完成 | sitemap＝`/`、`/guide`；`tests/relaunch.test.ts` 同步。<br>launch-check 補充：sitemap 含全部說明頁、`/guide` 200 且含品牌名、og:image 與 canonical、`/guide/not-a-area` 404 |
| 8 樣式 | 完成 | `.guide-*` 放在 `globals.css` 最後一段，只用既有 token；字級種類 11 不變 |
| 9 測試與量測 | 完成 | 新增 `guide-content`、`guide-routes`、`e2e/guide.spec`；keyboard-walk、axe-sweep 加 `/guide`；mounted-testids 加 4 個入口；metrics 加 `GUIDE_SENTINELS` 與說明頁首載；Lighthouse 對 `/guide` 另跑 navigation；畫面基準加 14、15 |
| 10 testid 與功能保留 | 完成 | `testids-v41-added.txt` 加 6 個；`feature-retention.csv` 中 batch＝V41-1 的 12 列打勾 |

**實作時的選擇**（都在規格範圍內）：

- **功能區頁還沒上線時不放連結**：「從哪裡開始」「在哪裡看得到」與 30 秒上手第 2–4 步，本批只顯示功能區名稱。V41-2a、2b 把頁面加進 `GUIDE_AREAS` 後，自動變成連結。這樣本批不會產生任何 404 連結。30 秒上手第 1 步連到工作台 `/`（同分頁）。
- **「幫哪些人」用三塊角色卡**：每塊是 h3＋`<dl>`，不用表格。390 寬讀起來比五欄表格好，內容與草稿相同。
- **說明頁用 `<a>`，不用 `next/link`**：`next/link` 會把用戶端路由程式帶進說明頁。`layout.tsx`、`page.tsx` 因此關掉 `@next/next/no-html-link-for-pages`，並寫明理由。
- **新增的 key**（GUIDE_CONTENT 沒有列名稱的）：`guide.common.pageTitle`、`guide.hub.description`、`guide.hub.intro`、`guide.hub.tocAria`、`guide.sections.areas`、`guide.who.fields.*`、`guide.unique.where`、`guide.areas.{11}.title`。V41-2a 以後才用的 key 都沒有先加。
- **`GUIDE_PLAIN_TERMS`** 就是起始的三個：下一步、影響金額、關鍵數字，各附理由。

## 2. 驗收命令與結果（程式 `53c8843`）

| 命令 | 結果 |
|---|---|
| `npm run typecheck`、`npm run lint` | exit 0 |
| `npm run audit:ui -- --json verification/revamp-v41/V41-1/ui-audit.json` | hex 0、圓角 4、字級 11（不變）、JSX 中文 0、元件字串常值中文 0、labels 違規 0（blacklistSynonym 12 是既有數） |
| `npm run contrast-check` | 85／85 通過，沒有新 token |
| `npm test -- --run` | **166 檔、3,413 個測試全過**（V41-0 是 164 檔、3,387）；`a1415f1` 與 `53c8843` 各跑一次 |
| `npm run build` | exit 0；`/guide` 是靜態路由 |
| `npm run test:e2e`（帶三個 `*_OUT`） | **1,077 passed、0 failed、27 skipped**：`a1415f1` 33.5 分鐘、`53c8843` 34.0 分鐘，兩次相同；證據檔是 `53c8843` 這次的；跑完都已還原 E2E 改寫的追蹤檔 |
| `CAPTURE_BATCH=V41-1`（PUBLIC_DEMO） | 第一次：只有允許變動的畫面與手機 04–09 不同，14、15 寫入新基準。更新允許的 28 張後重跑：**只剩手機 04–09 這 6 張不同**（待 D-V41-25，§4）；metrics 全部通過。`53c8843` 再跑一次，結果相同 |
| launch-check | 13 項全部通過，補充 13 項全部通過（`launch-check-local.json`） |
| Lighthouse × 3 | 見 §3：`/guide` 全 100；390 TBT 五項通過（`53c8843`） |
| `lsof -ti tcp:3100` | 停掉伺服器後沒有輸出 |
| 禁區與邊界五條 | 都是空的 |
| `git diff --stat ced36f8 -- package.json package-lock.json` | 空，沒有依賴變動 |

## 3. 量測

**首載**（`metrics.json` 的 `v41`）：

| 項目 | 實測 | 門檻 | 結果 |
|---|---|---|---|
| `/` First Load JS（gzip） | 519,687 | 520,451（V41-0 實測 519,427＋1,024） | 通過，多 260（`a1415f1` 是 519,666） |
| `/` 首載 chunk 的 `GUIDE_SENTINELS` | 「服務介紹與使用說明」0、「淨營收漲了，…少賺？」0 | 0 | 通過；對照組「使用說明：每一頁怎麼用」（在 labels）出現 1 次，證明 chunk 保留中文原字 |
| `/guide` First Load JS（gzip） | 131,465（4 個腳本，與 404 頁相同） | 136,585（框架基準 131,465＋5,120） | 通過，多 0 |
| `/guide` 禁用符號 | Recharts 圖表名、工作台 testid、`book_new`、`PptxGenJS` 全部 0 | 0 | 通過 |

**其他**：

- **B2 首屏**：1440、1280、390 都通過；KPI 前可聚焦控制數 10、10、3，與 V41-0 相同。
- **B9 DOM 節點**：七頁各多 10 個（側欄與頁尾入口），都在上限內。
- **axe**：desktop、laptop、tablet 各 24 個狀態，mobile 22 個，全部 0 問題（V41-0 是 23／23／23／21，多的是 `/guide`）。
- **keyboard-walk `/guide`**（1440 與 390 相同）：
  - 第一個停留點是跳至主要內容，按 Enter 焦點進到 `main#main-content`。
  - 「開啟工作台」在第 1 步，本頁目錄第一項在第 3 步；main 內 7 個停留點。
  - 看不見焦點 0、重複 0、`aria-hidden` 內 0。
  - 工作台七頁的里程碑不變：走查從 main 開始，側欄入口在 main 之前。
- **network-log**：下載 5 種、沒有 POST，與 V41-0 相同。
- **棘輪**：design-lint、copy-style、copy-density、chart-lint 的上限檔都沒改，測試全過；`guideLabels` 新字串 copy-scan 0 違規。
- **testid 刪除數**：v2、v3、v4 新增、v41 新增四份都是 0。
- **labels**：v3 快照 2,581 個、v4 快照 2,839 個逐字相同；新 key 只在 `guide.`、`shell.guideV41.` 下。

**Lighthouse：說明首頁 `/guide`**（navigation 模式，`53c8843` 第 3 次；三次相同）：

| 尺寸 | Accessibility | Performance | SEO | CLS | TBT | LCP |
|---|---|---|---|---|---|---|
| 1440 | 100 | 100 | 100 | 0 | 0 ms | 422 ms |
| 390 | 100 | 100 | 100 | 0 | 7.5 ms | 1,868 ms |

canonical 稽核在 127.0.0.1 上也通過，不需要排除（`seoScoreExcludingCanonical` 同為 100）。門檻是 a11y 100、SEO ≥ 95、Performance 1440 ≥ 97、390 ≥ 90、CLS 0，三次都達到。

**Lighthouse：工作台 8 頁**（`53c8843`）：

- a11y 三次都是全部 100。
- 首頁 Performance：1440 是 100，390 是 94、97、95。
- 預先載入的 chunk 都沒有落入量測區間。
- 開跑時 1 分鐘負載：2.26、3.98、3.03。

390 TBT（ms）：

| 步驟 | 第 1 次 | 第 2 次 | 第 3 次 | 中位數 | 門檻 | V41-0 中位數 |
|---|---|---|---|---|---|---|
| 載入示範資料 | 1,101.6 | 1,038.5 | 986.2 | **1,038.5** | 1,109.1 | 1,079.0 |
| 健檢 | 830.9 | 810.5 | 770.9 | **810.5** | 832.3 | 821.8 |
| 商品 | 94.0 | 94.3 | 83.6 | **94.0** | 129.9 | 99.8 |
| 會議 | 1,011.1 | 1,016.8 | 983.6 | **1,011.1** | 1,071.2 | 1,029.4 |
| 資料來源 | 18.3 | 16.3 | 6.7 | **16.3** | 50.0 | 17.3 |

五項都通過。

**修正前（`a1415f1`）的量測與成對比較**：這段說明 `53c8843` 修了什麼。

1. **三次量測**：開跑時負載 4.0–5.3、4.0–5.3、2.45；前兩次等負載降到 2.5 以下，等了 15 分鐘仍未降，照跑。會議中位數 1,131.0，超過門檻 1,071.2；其餘四項通過，載入示範資料 1,099.3、健檢 819.2、商品 107.4、資料來源 33.2。
2. **成對比較**：依 D-V4-47，與 V41-0（`c825213`）同場比較 8 對。兩邊各自 `git archive` 成獨立副本，build 後分別在 3101、3102 服務，交替先後。
   - 會議：V41-1 中位數 1,029.6，V41-0 1,024.7，成對差的中位數 −1.0，通過。
   - 載入示範資料：8 對中 6 對 V41-1 較慢，成對差的中位數 +53.4，V41-1 中位數 1,183.2 超過門檻。這項在正式三次量測雖然通過，成對資料仍顯示有真實成本。
3. **trace 比對**（`lighthouse-ab/trace-load-demo.jsonl`）：載入示範資料這一步，長任務內的樣式重算 CPU 每一對都穩定較高——V41-0 是 35–49 ms，V41-1 是 83–96 ms，重算的元素多 104 個。
4. **原因**：入口 B 為了 `#validation` 時「更多」面板 5 列的高度，加了 `body:has(#mobile-more > :nth-child(5))`。body 每次重算樣式都要掃整棵 DOM 找這個條件。
5. **對照組**：只拿掉這條規則、其餘不變，跑 3 次，樣式重算回到 40.3–41.4 ms，與 V41-0 相同。當時負載 5–8。
6. **修正**（`53c8843`）：`--more-nav-h` 的使用者都在 `.topbar` 或 `.mobile-tabbar` 內，改由 `shell-frame` 在這兩個元素標 `data-more-tall`。
   - 面板高度不變：一般 4 列 112px；`#validation` 5 列 160px，頂欄群組緊貼在面板上方（y 572–628）。
   - 修正後完整 E2E、畫面基準、首載與 Lighthouse 都重跑，數字見上。

證據：`lighthouse-runs/`（修正前三次 `a1415f1-run*`、修正後前兩次 `run1`、`run2`；第三次在 `metrics.json`）、`lighthouse-ab/`（8 對與對照組 3 次的 metrics、`summary.txt`、`drive.log`、`trace-load-demo.jsonl`）。

## 4. 畫面基準

**比對方式**：`verification/revamp-v41/V41-0/snapshots/` 的 52 張先複製到 `V41-1/snapshots/`，不帶 `--update-snapshots` 跑一次，再逐張判定。

| 畫面 | 尺寸 | 結果 | 處理 |
|---|---|---|---|
| 01–09 | desktop、laptop、tablet（27 張） | 不同：側欄 nav 之後多「使用說明」與一條分隔線；02、04–09 整頁截圖另有頁尾多一個連結。圖片尺寸不變 | 允許（含側欄的畫面），已更新 |
| 10、11、12、13 | 四尺寸 | 0 差異 | 不動 |
| 01、03 | mobile | 0 差異（「更多」面板預設收合） | 不動 |
| 02 | mobile | 頁尾多一個連結，多折一行，頁高 +16px | 允許（02 mobile），已更新 |
| 04–09 | mobile（6 張） | 同 02：頁尾多折一行，頁高 +16px | **不在允許清單內，待 D-V41-25，基準不更新** |
| 14 首頁空狀態 | 四尺寸 | 新增 | 已寫入 |
| 15 說明首頁首屏 | 四尺寸 | 新增 | 已寫入 |

目前 `V41-1/snapshots/` 共 60 張，其中手機 04–09 仍是 V41-0 的版本。重跑時只有這 6 張不同，其餘 54 張通過。

**手機 04–09 的逐列比對**（審查修正時量測，這次正式跑的差異張數相同）：比對 V41-0 基準與實拍，每個色彩通道容差 5 色階，先頂端對齊找第一列不同，再底端對齊算最後幾列相同。

| 畫面（mobile） | V41-0 → V41-1（px） | 頁尾以上相同的列 | 差異帶（實拍 y） | 底部相同 |
|---|---|---|---|---|
| 02 overview-full | 4607 → 4623（+16） | 0–4491 | 4492–4524 | 98 列 |
| 04 actions-board | 1156 → 1172（+16） | 0–1040 | 1041–1073 | 98 列 |
| 05 diagnosis | 4527 → 4543（+16） | 0–4411 | 4412–4444 | 98 列 |
| 06 products | 10951 → 10967（+16） | 0–10835 | 10836–10868 | 98 列 |
| 07 scenarios | 2897 → 2913（+16） | 0–2781 | 2782–2814 | 98 列 |
| 08 meeting | 3625 → 3641（+16） | 0–3509 | 3510–3542 | 98 列 |
| 09 data | 2864 → 2880（+16） | 0–2748 | 2749–2781 | 98 列 |

**原因只有一個**：頁尾在「指標定義」旁加了「 · 使用說明」（D-V41-5）。390 寬放不下，多折一行；`.main-footer` 行高 16px，所以頁高 +16px。02、04–09 都是整頁截圖、都含頁尾。頁尾以上每一列都相同，內容沒有位移。

**處理**：版面不改。06 的允許清單寫「02 mobile（頁尾連結）」，起草時以為只有 02 是整頁截圖，但 04–09 也是。這屬於新出現的待決事項，依 CLAUDE.md 不自行擴大允許清單，記為 D-V41-25（`docs/revamp-v4.1/09_DECISIONS_PENDING.md`）。

- 選 A（建議）：清單改成「02、04–09 mobile」，用這次的實拍更新 6 張基準。實拍已保存，可直接套用。
- 選 B：頁尾不放入口，手機 02、04–09 回到 0 差異。

**四尺寸截圖**：`V41-1/snapshots/{desktop,laptop,tablet,mobile}/15-guide-hub.png`（說明首頁首屏）與 `14-home-empty.png`（首頁空狀態與入口）。

## 5. 審查

三個面向各一位審查，只報 blocker、major：

- **major**：2 項，指的是同一件事，就是 §4 的手機 04–09。依 CLAUDE.md 處理成待決事項，程式不改。
- **nit**：29 項，只記錄、不修。主要有：
  - `src/app/robots.ts` 註解仍寫「指向單頁 sitemap」。
  - 入口的 class（`.sidebar-guide`、`.footer-guide`、`.state-guide`）沿用殼層命名，沒有 `.guide-` 前綴。
  - `.guide-main` 的行高 1.75 與 760px 欄寬沒有用 token。
  - 「在哪裡看得到」與功能區名稱之間沒有標點，報讀時連在一起；V41-2a 變成連結後會改善。
  - 手機「更多」面板裡點入口另開分頁後，原分頁的面板仍開著（Esc、點外面照常收起）。
  - 投影模式頁尾也會顯示入口（頁尾本來就不在投影時隱藏）。
  - `.guide-toc ol` 用 `list-style: none`，Safari 的 VoiceOver 可能不報讀為清單。
  - `guide.why.body`、`guide.unique.lead` 文中直接寫「EC ProfitLens」。
  - 首頁空狀態的入口出現在每一頁的空狀態（資料來源頁除外），因為各頁共用同一個空狀態。
- 審查沒有抓到的一項：入口加的 `body:has(...)` 讓 390 載入示範資料的樣式重算多約 45ms，是收尾時的成對比較與 trace 找到的，已在 `53c8843` 修正（§3）。
- 審查另外確認：
  - 說明文字與 GUIDE_CONTENT §1 逐字相同。
  - `guide-routes`、`guide-content` 兩支測試對 12 種刻意破壞都會失敗。
  - 禁區與邊界都是空的。

## 6. 給 V41-2a 的提醒

- 獨特性第 2 項連到 `/guide/overview#bridge`，`/guide/overview` 要有 `id="bridge"`，並補斷言（`guide-routes` 目前只檢查 `/guide` 頁內的錨點）。
- PRD §3.8 的「一張說明截圖 200」補充檢查，等 V41-2a 有媒體時加進 launch-check。
- 手機 04–09 的基準依 D-V41-25 的回覆處理；沒回覆前，V41-2a 比對時這 6 張仍會不同。

## 7. 人工關卡與待決

- **H7**（使用者看 `/guide`）：未執行／待人工，擋 v4.1.0 正式上線。功能區頁要到 V41-2a、2b 才有，目前首頁的功能區名稱還不是連結；建議 V41-2b 之後再看。
- **D-V41-25**：待使用者回覆（§4）。
- **source-map-js 1.2.2**：仍待使用者同意（V41-0 提出）。
- 沒有推送、沒有部署。
