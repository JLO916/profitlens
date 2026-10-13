# V4-8b 畫面基準差異（V4-8a → V4-8b）

比對對象：`verification/revamp-v4/V4-8a/snapshots/`（複製成本批起點）與本批 `--update-snapshots=changed` 之後的 `verification/revamp-v4/V4-8b/snapshots/`。

## 結果

- 52 張中 51 張逐位元組相同，1 張不同：`mobile/08-meeting.png`。
- 這 1 張屬於本批的允許變動畫面（D-V4-63＝B：08 mobile 的 G19 空狀態高度）。
- desktop、laptop、tablet 的 39 張與 mobile 其餘 12 張都是 0 差異。也就是說，D-V4-59 的 390 修正沒有改到示範資料的任何畫面；D-V4-44 B 的骨架在預先載入完成後也不會出現。
- 第一次比對（不更新基準）：22 passed、1 failed（只有 08 mobile）、5 skipped。
- 更新基準後重跑完整 capture：23 passed、5 skipped（設計上略過）。

## 08 mobile 的差異

| 項目 | V4-8a | V4-8b |
|---|---|---|
| 圖高（fullPage） | 390 × 3805 | 390 × 3625（−180） |
| 上方逐列相同 | 第 0–3184 列 | 第 0–3184 列 |
| 差異帶 | 第 3185–3544 列（360 列） | 第 3185–3364 列（180 列） |
| 下方逐列相同 | 最後 260 列 | 最後 260 列 |

差異帶就是 G19 會議歷史（`chart-meeting-history`）的空狀態框。示範資料沒有結束過的會議，所以 G19 是「少於 2 筆」的等高空狀態。

- V4-8a：≤ 767px 時框高是 `chartHeights.sm × 2` = 360。
- V4-8b：依 D-V4-63＝B，改用 `chartHeights.sm` = 180。CSS 在 `globals.css` 的「V4-8b B」錨點區塊（`.meeting-history-chart .chart-frame.multiples[data-state="empty"]`）。

差異帶以上（期間列、議程、完整通路寬表收合列等）和以下（歷史清單、頁尾）逐列相同，只是整體上移 180px。

## 比對方法

1. 每一列像素算 SHA-1。
2. 從上往下找最長的相同前綴，再從下往上找最長的相同後綴。
3. 剩下的就是差異帶。

產生器是代理 C 的暫存腳本，不在 repo。
