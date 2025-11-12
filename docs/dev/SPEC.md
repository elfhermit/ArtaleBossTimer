# SPEC — Artale Boss Timer

## 目的

建立一個部署在 GitHub Pages 的靜態前端頁面，用來在 client（瀏覽器）端紀錄與查詢每日對 Boss 的擊殺紀錄，並提供 Boss 復活時間的參考與計算器。

## 範圍與優先順序 (MUST / SHOULD / MAY)

MUST

- Boss 選單（下拉） — 若 Boss 數量過多（例如 >50），請考慮加入搜尋或分頁。
- 擊殺紀錄表單（自動帶入當下時間到秒、頻道、是否出貨、備註）
- 當天某 Boss 的紀錄查詢（表格呈現、含 edit/delete）
- 使用 Local Storage 儲存與讀取（支援保留至多 300 筆，預設為 per-boss 策略，可調整）
- 表單驗證：頻道 1..3000、出貨必選、備註長度限制
- 靜態 Boss 復活規則顯示與復活計算器
- 響應式設計，能在行動裝置與桌面使用

SHOULD

- 篩選 / 搜尋（頻道、是否出貨、時間範圍）
- 顯示當天每頻道的預估復活時間（表格或 tooltip）

## 資料模型（schema v1）

每一筆擊殺紀錄格式（JSON）：

```json
{
  "id": "string",            
  "bossId": "string",
  "timestamp": "string",
  "channel": 123,
  "looted": true,
  "note": "string",
  "createdAt": "string",
  "updatedAt": "string",
  "version": "v1"
}
```

設計說明：timestamp 儲存完整日期與時間，方便做「當天(00:00:00 - 23:59:59)」查詢與跨日處理。

## Local Storage 設計建議

- key: `abt_records_v1`
- value: `{ records: [ ... ], meta: { schemaVersion: "v1", lastPurgeAt: "..." } }`
- 300 筆限制預設為「per-boss」：當某個 boss 的紀錄超過 300 時自動刪除最舊紀錄。

CRUD API（模組化）

- addRecord(record)
- updateRecord(id, changes)
- deleteRecord(id)
- getRecords({bossId, date})
- purgeOldRecordsIfNeeded(bossId)
- exportJSON(), importJSON(json)

## 表單驗證規則

- Boss: 必選
- 擊殺時間: 預設為現在時間（可手動編輯），存成 ISO
- 頻道: 必填，整數，1..3000
- 是否出貨: radio，必選
- 備註: 選填，max 200 字

## Boss 復活規則（靜態資料範例）

主要來源：`docs/bosses/bosses.json`（此檔案列出專案目前的 Boss 與復活時間參考）。

當新增或調整 Boss 的復活規則時，請同時更新：

- `docs/bosses/bosses.json`（資料來源）
- UI 的 Boss 下拉選單或渲染程式（例如 `docs/index.html` 或產生下拉的 JS），以確保前端能正確顯示與選擇該 Boss。

`bosses.json` 範例條目（建議格式）：

```json
{
  "id": "boss-1",
  "name": "紅寶王",
  "respawn": "23分~30分",
  "minMinutes": 23,
  "maxMinutes": 30,
  "image": "placeholder.svg",
  "drops": ["道具A", "道具B"]
}
```

說明：

- `respawn` 欄位可以使用中文可讀範圍（如上）或結構化為分鐘數（例如 `minMinutes`/`maxMinutes`）。若要機器解析或用於計算器，建議以結構化欄位為主，並在 UI 層提供 human-friendly 顯示。
- `drops` 為選用欄位，可放掉落物名稱陣列；若未提供，代表尚無掉落清單。

## 計算邏輯

- fixedMinutes: respawn = killTime + minutes
- rangeMinutes: respawnRange = [killTime + min, killTime + max]
- hourlyOffset: 找到下一個 minute == offset 的時間點且 > killTime

跨日情形須顯示日期（例如 23:50 + 60min => 次日 00:50）。

## UI 元件（高階）

- Header（標題、日期快速切換）
- Boss 下拉選單（支援搜尋）
- 新增擊殺表單（或 modal）
- 當日紀錄表格（排序、編輯、刪除）
- 復活計算器（輸入擊殺時間/頻道 -> 顯示可能復活時間）

## 邊界案例與測試建議

- 頻道輸入錯誤（0、負數、非整數）
- LocalStorage 空間不足
- 跨日查詢（00:00:00 準則）
- 超過 3000 筆的淘汰策略

測試最小集：新增 / 編輯 / 刪除 / 驗證失敗 / 復活計算器三種 rule

## 假設與風險

- 假設：300 筆為 per-boss 保留策略（如需改成 global，請回覆）
- 假設：資料存在於使用者本地瀏覽器（LocalStorage），不跨裝置
- 風險：LocalStorage 容量限制與效能問題；建議提供匯出備份

## MVP 開發任務（優先順序）

1. 建立專案骨架（index.html, styles.css, app.js）
2. Boss 下拉選單與靜態復活規則資料
3. 擊殺表單（含驗證）與新增功能
4. LocalStorage 模組（add/get/update/delete + 300 策略）

   - 已採用 per-day-per-boss localStorage key 策略，以減少 parse 大型 JSON 的成本；專案啟動時會自動遷移舊的單一 key (`abt_records_v1`)（見 migration）。

5. 當日紀錄表格（顯示、edit/delete）
6. 復活計算器（fixed + range）
7. 簡單樣式與響應式

---
