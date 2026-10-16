# 9 通路合成資料（synthetic-many-channels-9x7）

V42-0 第 7 項（`docs/revamp-v4.2/06_BATCHES.md`；`01_PRD.md` §15「G4 超過約 6 個通路會擠」）把 `tests/helpers/page-states.tsx` 的 `manyChannelsActive()`（V4-3a 起給 `diagnosis-many-channels`、V42-0 起也給 `overview-many-channels` 的記憶體合成資料）原樣寫成檔案，讓瀏覽器能用匯入精靈載入同一份資料，對總覽 G4 目視擁擠程度。所有通路、商品與金額都是虛構的，不是任何真實營運結果。

- **內容**：通路 CH01–CH09；涵蓋 2026-01-01 到 2026-01-14，上期 1/01–1/07、本期 1/08–1/14（各 7 天）；每天每通路一列銷售（`SKU-{n}`、HOME、2 件、折扣前收入 `1000 + 天序 + 通路序`、折扣 50、退款 0、商品成本 400）、一列通路費用（30／10／20／5）、一列廣告（100）；三份 CSV 各 126 列資料；manifest 以 `fixtures/golden/manifest.json` 為底，改 `dataset_id`、日期與通路。
- **位元組與記憶體版相同**：三份 CSV 的內容字串與 `manyChannelsActive()` 組出的字串逐字相同（沒有檔尾換行，因為記憶體版是 `join("\n")`），`manifest.json` 解析後與記憶體版相同；用 `src/application/workspace.ts` `hashInput` 同樣的 canonical＋SHA-256 算出的 `dataset_hash` 同為 `9e2c8f32ddd659de6282fc858ba08762ba57fa61331e9f1097d79556d4897338`（`verification/revamp-v42/V42-0-baseline.md` §6）。改 `manyChannelsActive()` 時要同步重寫這個目錄；反過來不改這裡的值。
- **位置**：放在 `tests/fixtures/`，不在 `fixtures/`（財務核心禁區白名單為空，`fixtures/*` 一個檔都不新增）。不進產品示範、不給說明頁截圖。
- **用途**：V42-0 的 G4 目視截圖（`verification/revamp-v42/V42-0/overview-many-channels.spec.ts`，輸出在同目錄）；之後批次要在瀏覽器看多通路畫面時可重用（E2E 以 `resolve("tests/fixtures/synthetic-many-channels-9x7")` 取目錄，`importViaWizard(page, dir, { manifest: true, classification: "valid" })`，資料完整、檢核結果 `valid`）。
- **手算期望值**：本目錄不另列；每通路本期扣廣告後貢獻＝7 天 ×（淨營收 − 400 − 65 − 100），9 通路本期 2,765 到 2,821 元（相鄰通路差 7 元）、兩期差額各 +49 元，與 `tests/mounted-testids.test.tsx` 的 V42-0 M1 測試和截圖上的精簡表一致。
