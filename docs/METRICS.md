# Metric specification — contribution-v1

全部口徑為本產品管理定義，不宣稱為法定財務報表。金額為 TWD 未稅，保留兩位小數；使用 decimal.js 或精確整數最小貨幣單位，不用原生浮點累加金額。

## Symbols and formulas
G=gross_sales, D=discounts, R=refunds, C=cogs_net, P=platform_fees, Q=payment_fees, F=fulfillment_costs, O=other_variable_costs, A=ad_spend。

```
商品淨營收 N = G - D - R
商品毛利 GP = N - C
行銷前貢獻 CM_before = GP - P - Q - F - O
行銷後貢獻 CM_after = CM_before - A
商品毛利率 = GP / N          （N > 0 才定義）
行銷後貢獻率 = CM_after / N  （N > 0 才定義）
折扣率 = D / G              （G > 0 才定義）
退款金額比 = R / (G-D)       （G-D > 0 才定義）
混合行銷效率 MER = N / A    （A > 0 且 N > 0 才定義）
```
MER 不是 ROAS，不具媒體歸因或因果意義。沒有新客、流量、訂單唯一鍵與 cohort 時，不顯示 CAC、CVR、AOV、LTV。退款金額比不是件數退貨率，也不是同批訂單最終退款率。
N 可以為負；仍可顯示相關金額，但不以負分母製造率指標。A=0 時 MER 是 null/N/A，不是 0 或 Infinity。
金額加總先用未格式化精確值。比率先加總分子與分母再除，不平均各列百分比。成長率只在前期值 >0 時顯示；前期 <=0 時顯示絕對差，並用「轉正／轉負」等事實文字。率差用百分點。

## Exact monetary bridge
```
ΔCM_after = ΔG - ΔD - ΔR - ΔC - ΔP - ΔQ - ΔF - ΔO - ΔA
```
此橋接沒有未解釋的殘差；金額到分完全對齊，圖表僅顯示四捨五入時仍保留精確 tooltip。
各項是已觀察的金額差異，不是獨立因果貢獻。例如廣告增加與營收增加可能相關，不可把 -ΔA 宣稱為「浪費」或刪除後必然增加同額利潤。
SKU 毛利差可以加總成通路商品毛利差；沒有廣告分攤，因此不提供 SKU 的行銷後貢獻排名。

## Data quality propagation
鍵值／格式錯誤：新資料集不可提交。
成本／廣告缺漏：保留可確定的收入，受影響指標用 null + reason_code；同範圍合計也不能假裝完整。允许呈現「已知部分」時，必須同時顯示排除範圍，不得用其代替標題總計。
缺資料的區段不畫零值折線、不列為改善贏家、不產生依賴該金額的 AI 建議。

## Deterministic diagnostic rules
初版只做可核查的規則：
- REV_UP_CM_DOWN：同範圍 ΔN>0 且 ΔCM_after<0。
- NEGATIVE_CHANNEL_CM：本期通路 CM_after<0。
- DISCOUNT_BURDEN_UP：折扣率上升，另附 ΔD 及 ΔG，不宣稱降低折扣必然改善。
- REFUND_BURDEN_UP：退款金額比上升，附入帳日／cohort 限制。
- FULFILLMENT_BURDEN_UP：F/N 上升，N 必須正值。
- MARKETING_BURDEN_UP：A/N 上升，不據此自動要求停投。
- SKU_NEGATIVE_GP：商品 N-C<0，只判商品毛利。
- MISSING_CRITICAL_DATA：成本或費用不完整；先產生補資料任務。
規則可依對應數值變化排序；不使用虛構的成功率或 AI 自評信心分數。產業門檻留到後續由使用者設定，初版不硬編「好毛利率」。

## Golden reference
2026-08-01：N=2250.00, GP=1200.00, CM_before=870.00, CM_after=570.00。
2026-08-02：N=2470.00, GP=1145.00, CM_before=705.00, CM_after=255.00。
ΔN=220.00、ΔCM_after=-315.00。
通路本期：DTC N=1480.00 / CM_after=270.00；MARKETPLACE N=990.00 / CM_after=-15.00。
精確答案在 `fixtures/golden/expected.json`，應由應用核心單元測試獨立計算比對。
