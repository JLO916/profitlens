請只做 M2。先確認 M1 golden 與必要邊界測試通過。
使用 fixtures/demo 的合成資料經 M1 domain 計算，建立資料工作區、經營總覽、通路診斷與商品毛利明細。不要在元件硬寫金額或診斷結論。
畫面繁體中文，以營運主管的工作台呈現：資料截至日／前後期／通路篩選、核心 KPI、週趨勢、精確金額橋接、通路比較、點擊數字可開公式和來源。
SKU 頁不可顯示虛構的行銷後貢獻。明確處理 empty/loading/error/partial/ready；圖表有表格替代、鍵盤操作可用。
驗收 golden 與 demo 兩套資料可切換；檢查 desktop/tablet/mobile，使用可用瀏覽器工具走一次，記錄 screenshots 或實际 browser logs。未做瀏覽器驗收不可說已驗收。
本輪不接 AI，不做 scenario，不部署。執行工程檢查並更新 STATUS 後停止。
