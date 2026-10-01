# 2026-10-01 發布內容與隱私邊界審查

本輪使用者最新指示為「先做系統發布」。此指示取代前一輪「先 Live AI、再發布」的順序限制。Live AI 仍未執行，不把離線準備或 mock 驗收當作實際模型連線；缺少 key 不構成這次 PUBLIC_DEMO 發布的阻擋。

本文件只檢查可提交內容與靜態安全邊界，沒有 stage、commit、push、部署、讀取秘密值或變更產品程式。主流程仍須完成本輪工程檢查、遠端環境與發布後驗收。機器可讀證據：`release-20261001-package-audit.json`。

## 結論

在本次檢查範圍內沒有發現需要阻擋 PUBLIC_DEMO 發布的套件／資料問題。建議提交三批產品改善、規格修訂、合成資料驗收證據、不可變原評閱包與本輪發布紀錄。仍維持既有私人 GitHub repo，不改為公開 repo，不上傳秘密或真實商家資料。

| 檢查 | 結果 | 證據及限制 |
|---|---|---|
| 待提交範圍 | pass | 起始盤點 477 檔、82,784,423 bytes，其中 verification 384 檔、81,789,309 bytes；本輪並行新增驗收紀錄後數量會增加。最大單檔約 2.4 MB，沒有 >=10 MB 單檔，也沒有 symlink |
| Golden／fixtures 不變 | pass | `git diff --name-only HEAD -- fixtures package.json package-lock.json` 為空；fixture 全目錄及 package／lockfile 沒有修改 |
| 原評閱包保留 | pass | 使用者原 ZIP 仍可讀，reviews 內 11 份檔案與 ZIP 逐 byte 完全相同；沒有改寫附件內容 |
| 評閱包資料來源 | pass | 三份 live_golden CSV 與 fixtures/golden 解析後每列每欄一致；sales 8 列、cost 4 列、ad 4 列，manifest JSON 一致。名稱 live_api 指原樣本 API 收據，不代表 Live AI |
| 20 案 AI 預覽 | pass（離線） | manifest 明示 offline_synthetic_preparation、provider_calls=0、evaluation_status=not_run；20 案均 not_run。請求預覽沒有 email／customer／phone／address／sku／dataset_name／channel_name 欄位或 key pattern |
| 秘密字串有限掃描 | pass（有限規則） | 掃描 630 份可追蹤 UTF-8 文字、16,809,049 bytes；key-like 命中 21 檔、23 次。均為具 project／canary 標記或 mock 測試中明示 test key 的字串；沒有未解釋命中。未輸出命中值。GitHub token、AWS access ID、private-key header、Authorization bearer 規則沒有命中 |
| 環境檔／私有路徑 | pass | 候選清單無 .env、private、uploads、credentials、私鑰類路徑；唯一受追蹤環境檔是 .env.example。`git check-ignore -v --no-index` 確認 .env.local／.env.production／.vercel／data/private／uploads／reports/private／.next／Playwright 報告排除 |
| 公開静態資料 | pass（靜態） | public/ 不存在；樣本 API 僅接受 5 個固定白名單，manifest 必須 source_type=synthetic；輸入 ID 不直接形成路徑 |
| 公開 AI 後端 gate | pass（靜態） | `readAiConfig` 最先處理 PUBLIC_DEMO；POST 在讀 body、建立 provider 前返回 403；不可只依 UI 隱藏按鈕判定 |
| Vercel 排除 | pass（CLI 範圍） | .vercelignore 排除 verification、reviews、tests、docs、scripts、prompts、templates、環境檔、private/uploads 及快取。這不表示 GitHub push 或 Git 整合 checkout 不含這些已提交檔案 |
| 工程／遠端／UI 驗收 | not_run（本子審查） | 主流程另跑 typecheck、lint、unit、build、E2E、遠端環境檢查、部署及瀏覽器驗收；不能拿本文件代替 |

## 建議提交方式

先檢查最終 diff，再 stage 明確範圍：

```sh
git add -- .vercelignore README.md docs eslint.config.mjs playwright.config.ts src tests reviews verification
git diff --cached --stat
git diff --cached --check
git diff --cached --name-only
```

以上是建議命令，本子任務沒有執行。提交前應核對並行流程新增的 release 檔案；不要使用 `git add -f`，也不要盲目追加其他 untracked 檔案。無需重新加入／改写 fixtures 或 package-lock。

- 保留原 review、unit/E2E 的失敗與通過紀錄、合成截圖／PDF、來源 hash 與驗收報告。這些雖使新增內容約 83 MB，單檔沒有異常大物件，且是現有驗收可追溯證據；這次不刪除或壓縮原檔來破壞紀錄。
- 不提交 node_modules、.next、coverage、Playwright HTML report／trace 暫存、test-results、環境檔、.vercel 憑證目錄、私人資料，以及未經審查的真人 pilot 填寫資料。這些位置已有 Git ignore；不強制加入。
- 本次新增 audit 檔案可以一起提交。本文件未宣稱逐張重新檢查全部 281 個非 UTF-8 檔；其合成來源依既有驗收紀錄及固定 fixture 路徑核對。秘密有限掃描不是通用憑證偵測器，也不是對圖片／PDF 的 OCR 個資審查。
- 遠端應維持 `APP_MODE=PUBLIC_DEMO`、`PUBLIC_DEMO=true`、`ENABLE_LIVE_AI=false`。主流程發布後實際驗證 GET AI unavailable、POST 403，並記錄 deployment 的 commit 與 UI；本審查沒有重新查遠端環境值。

## 實際命令與檢查

`git status --short`、`git diff --stat`、`git ls-files -z`、`git ls-files --others --exclude-standard -z`、`git diff --name-only HEAD -- fixtures package.json package-lock.json`、`git check-ignore -v --no-index ...`、`git ls-files '.env*'`，均已執行。Python 標準庫用於路徑／大小盤點、UTF-8 有限規則掃描、JSON／CSV equality、SHA-256、原 ZIP 逐 byte 比對；未進行網路請求。

保留 hash：

- `fixtures/golden/expected.json`：`856994c0e31e83c1ec88f3fa92b2223fc99eedd95358ad64297f3b01937d28a7`
- `package.json`：`b3698b34b2cc982b07626fde2330ecca2d81fbe08dbe978fa6f774ca27e194f9`
- `package-lock.json`：`ab23151e36c2c4a5bc76ad52d0675866eee7465b5d63a52764bbaa3feac7dcfd`
