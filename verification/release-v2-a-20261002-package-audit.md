# A 批 2026-10-02 發布包唯讀審查

使用者已授權將 A 批推送既有 GitHub 並部署既有 Vercel。此審查沒有 stage、commit、push、部署、變更產品／測試或讀取 `.env`／credential。沿用本輪原始驗收證據，不覆寫失敗紀錄或附件。

## 結論

在本次候選範圍與有限檢查內，**沒有發現阻擋 PUBLIC_DEMO 發布的秘密或私人營運資料**。可提交 A 批程式、規格、tests、九份原評閱資料與 `review-v2-a-*` 合成／工程證據。這不等同通用秘密掃描或圖片 OCR，也不宣稱已部署、已接 Live AI。

| 核對 | 結果 | 證據與限制 |
|---|---|---|
| 候選盤點 | pass | 278 檔、72,589,017 bytes；A 批 verification 220 檔、71,783,468 bytes。最大單檔 2,815,904 bytes，沒有 ≥10 MiB 單檔或 symlink。 |
| 原始受保護資料 | pass | protected 60 檔、ZIP 九原件及 ZIP 本體相符；fixtures、golden、domain、package／lock 無改動。 |
| 建置來源對應 | pass | `review-v2-a-source-inventory.json` 的 139 件來源／測試 hash 無差異。 |
| 工作區原始 CSV | pass | 四份下載備份均為 v3，source_type=synthetic；manifest 與三 CSV bytes 逐一完全對上 golden。以 bytes 比對，避免 Python text newline 轉換誤判。 |
| 實際下載證據 | pass | 原 inventory 的 26 件 JSON／CSV／Markdown／PDF hash 仍相符；備份與決策結果是合成驗收資料。 |
| 有限秘密／email 掃描 | pass（有限規則） | 166 份 UTF-8 文字，6 個命中均為明標 fake canary；沒有未解釋金鑰、GitHub token、AWS ID、private-key header、Bearer literal 或 email 命中。JSON 只記檔名／行號／類型，不記值。 |
| 敏感路徑／忽略 | pass | 候選無 `.env`、credential、private、uploads、私鑰路徑；`git check-ignore` 確認九個環境／快取／私有資料 probe 排除。 |
| 公開資料與路由 | pass（靜態） | public/ 不存在；只見原 datasets／insights 兩 API。樣本限 demo/golden/missing-cogs/missing-ad/duplicate，manifest 必須 synthetic，原始 ID 不直接做路徑。 |
| PUBLIC_DEMO | pass（靜態） | server config 最先判定公開展示；POST 在讀 body／建 provider 前回 403。主流程仍應於新部署實測。 |
| Vercel 上傳排除 | pass（CLI 規則） | verification/reviews/tests/docs/scripts/prompts/templates、`.env*`、`.vercel`、private/uploads 與快取均排除。GitHub 提交不受 `.vercelignore` 保護。 |
| 圖片／PDF 來源 | pass（來源核對） | 112 件依本輪 E2E／人工紀錄與固定合成 fixtures 核對；本審查未逐件 OCR 或重做視覺驗收。 |

## 建議提交範圍

- 提交本輪已修改的 README／docs／playwright config、src、tests、`reviews/profitlens_review_v2_20261001/`、`verification/review-v2-a-*` 及本審查兩檔。JSON 提供逐檔 SHA-256 與大小，供 stage 後再核對。
- 原紅測、失敗／通過 logs、合成下載與 screenshots/PDF 均是可追溯證據；沒有異常巨大檔需阻擋，但這批證據約 72 MB，Git history 會增加。保留，不任意刪改為通過。
- 不使用 `git add -f`。不提交 `.env*`、`.vercel`、`.next`、node_modules、Playwright 暫存／trace、private/uploads、未審查真人資料。無需變動 fixtures 或 lockfile。
- 並行新增的 `release-v2-a-*` 發布 logs／截圖不在起始候選 278 檔範圍，主流程提交前仍須核對新檔。維持既有 repo 權限；本子任務未查遠端可見性。

## 證據與命令

已執行 `git status --short --untracked-files=all`、`git diff --name-only -z HEAD`、`git ls-files --others --exclude-standard -z`、`git check-ignore -v --no-index`、`git diff --name-only HEAD -- fixtures src/domain package.json package-lock.json`。Python 標準庫執行候選大小／SHA-256、有限 regex、ZIP 原件與 raw CSV bytes 比對；沒有網路請求。

期間 UTC：2026-10-02T02:39:24.357800+00:00 至 2026-10-02T02:41:50.803011+00:00。起始 HEAD `bb9173edae9a28eb1970c5a968f1165b0ce64bb5`。機器證據：`release-v2-a-20261002-package-audit.json`。

## 限制

本次沒有讀取 `.env` 或任何 credential，沒有輸出實際秘密值。已公開可見的部署網址、build ID、工程本機路徑會出現在原 logs，屬保留的工程 metadata，不是 key。圖片／PDF 未全面 OCR，因此結論限定於已核對的合成資料來源及有限掃描。

原 A 批驗收說明「發布未執行」是當時狀態，本次不重寫該歷史證據。新的 commit／deployment／遠端 PUBLIC_DEMO、live endpoint、線上 smoke 由主發布流程記錄。Live AI 仍未實測，不能將 mock／gate 或本機 build 稱為 live 模型驗收。
