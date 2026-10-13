# V4-10 首載證明（G24 散佈圖 chunk 不在首頁）

建置：`NEXT_TELEMETRY_DISABLED=1 npm run build`（Next.js 16.3.7，webpack），以 PUBLIC_DEMO 設定 `npm start -- --port 3100` 起站後量測（2026-10-13）。

## 1. 散佈圖 chunk 的檔名（取自 build 產出）

`.next/react-loadable-manifest.json` 中唯一一筆散佈圖項目：

```
"components/products/scatter-section.tsx -> ../charts/products-scatter-lazy": { "id": 35333, "files": ["static/chunks/333.320e7d5e45d6c88e.js"] }
```

- `333.320e7d5e45d6c88e.js`：17,442 bytes，gzip 6,100 bytes。檔內有 Recharts `ScatterChart` 的元件定義（`chartName:"ScatterChart"`）。

## 2. 首頁 HTML 的腳本清單

`GET /` 的 HTML 中 `<script src>` 指向 `/_next/static/` 的檔案（7 個，其中 polyfills 是 nomodule）：

| 檔案 | 含散佈圖 chunk 檔名 | `ScatterChart` 字串數 | `products-scatter-lazy` |
|---|---|---|---|
| chunks/4bd1b696-c9cc1fe3b38e59bb.js | 0 | 0 | 0 |
| chunks/794-fdceb3b9319f55ac.js | 0 | 0 | 0 |
| chunks/main-app-cd717720e6e1afbf.js | 0 | 0 | 0 |
| chunks/194-ab182664d94ba742.js | 0 | 2 | 0 |
| chunks/app/page-bb6f93af07968014.js | 0 | 0 | 0 |
| chunks/polyfills-42372ed130431b0a.js（nomodule） | 0 | 0 | 0 |
| chunks/webpack-ffd8f02df12b4ef8.js | 1（chunk 雜湊表） | 0 | 0 |

- 首頁 HTML 本身出現 `333.320e7d5e45d6c88e` 0 次，散佈圖 chunk 不在首頁腳本清單。
- `webpack-*.js` 那一次是 webpack runtime 的 chunk 雜湊表（`333:"320e7d5e45d6c88e"`）。這張表列出每個可按需載入的 chunk，不會下載它。
- `194-*.js` 的 2 次 `ScatterChart` 是 Recharts 共用 Tooltip 程式裡的圖名比較（`"ScatterChart"!==m`、`"ScatterChart"===m`），不是散佈圖元件。V4-9b 的首載同樣是 2 次（`verification/revamp-v4/V4-9b/metrics.json` 的 `firstLoadJs.recordedSymbols.ScatterChart`），本批沒有變。
- 商品頁面板 chunk（`225.81d0969025bd7271.js`，含 `"product-table"`）只有一處 `n.e(333)`（展開 `<details>` 時才按需載入），`ScatterChart` 0 次。
- E2E `tests/e2e/charts-products.spec.ts` 的 G24 測試在四個尺寸讀同一份 manifest 驗證三件事：該 chunk 不在首頁、商品頁載入後還沒下載、展開才下載。全套 E2E 四尺寸都通過。

## 3. First Load JS（B5）

| 批次 | modern 腳本數 | 未壓縮 bytes | gzip bytes | 上限 |
|---|---|---|---|---|
| V4-9b | 6 | 1,709,119 | 516,192 | 545,397 |
| V4-10 | 6 | 1,721,759 | 519,293 | 545,397 |

V4-10 比 V4-9b 多 3,101 bytes（gzip）。來源是 G8 累計線（總覽進階區，LineChart 首載已有）與 G17 小表。仍 ≤ 545,397，餘 26,104。`splitSentinels` 全為 0，`forbiddenSymbols` 全為 0（`first-load-modules.json`）。

## 4. B9 DOM 節點數（載入示範資料後；上限＝V4-0a 基準＋1,500）

| 頁 | 1440 V4-9b → V4-10（上限） | 1280 V4-9b → V4-10（上限） | 390 V4-9b → V4-10（上限） |
|---|---|---|---|
| 總覽 | 3,309 → 3,325（4,575） | 3,333 → 3,349（4,599） | 3,296 → 3,312（4,562） |
| 健檢 | 2,174 → 2,174（2,824） | 2,174 → 2,174（2,824） | 2,174 → 2,174（2,824） |
| 商品 | 2,248 → 2,510（3,322） | 2,248 → 2,510（3,322） | 2,248 → 2,510（3,322） |
| 試算 | 683 → 683（2,160） | 683 → 683（2,160） | 683 → 683（2,160） |
| 待辦 | 711 → 711（2,188） | 711 → 711（2,188） | 711 → 711（2,188） |
| 會議 | 1,064 → 1,064（2,498） | 1,064 → 1,064（2,498） | 1,064 → 1,064（2,498） |
| 資料 | 1,209 → 1,209（2,629） | 1,209 → 1,209（2,629） | 1,206 → 1,206（2,629） |

- 總覽多 16：G8 在收合進階區內的同高骨架與資料表 summary（瀏覽器在第一次展開前不畫圖與 84 列資料表）。
- 商品多 262：G24 的收合 `<details>`。資料表收合但掛載，示範資料 40 列。
- 待辦不變：示範資料沒有待辦，G17 不渲染。
- 七頁都在上限內（metrics.spec 硬斷言通過）。

量測檔：`verification/revamp-v4/V4-10/metrics.json`（`firstLoadJs`、`{desktop,laptop,mobile}.b9`）、`first-load-modules.json`。
