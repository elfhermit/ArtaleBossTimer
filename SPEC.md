# SPEC — Artale Boss Timer

## 目的
建立一個部署在 GitHub Pages 的靜態前端頁面，用來在 client（瀏覽器）端紀錄與查詢每日對 Boss 的擊殺紀錄，並提供 Boss 復活時間的參考與計算器。

## 範圍與優先順序 (MUST / SHOULD / MAY)

- MUST
  - Boss 選單（下拉）
  - 擊殺紀錄表單（自動帶入當下時間到秒、頻道、是否出貨、備註）
  - 當天某 Boss 的紀錄查詢（表格、含 edit/delete）
  - 使用 Local Storage 儲存與讀取（支援保留至多 3000 筆，預設為 per-boss 策略，可調整）
  - 表單驗證：頻道 1..3000、出貨必選、備註長度限制
  - 靜態 Boss 復活規則顯示與復活計算器
  - 響應式設計，能在行動裝置與桌面使用

- SHOULD
  - 篩選 / 搜尋（頻道、是否出貨、時間範圍）
  - 匯入 / 匯出 JSON 的備份功能（暫不實作，先以同一瀏覽器操作為主）
  - 顯示當天每頻道的預估復活時間（表格或 tooltip）

- MAY
  - 使用者自訂 Boss 與復活規則
  - 雲端備份或同步（非本階段）

## 資料模型（schema v1）

每一筆擊殺紀錄格式（JSON）：

{
  "id": "string",            // 唯一 id
  "bossId": "string",       // Boss 名稱或 id
  "timestamp": "string",    // ISO 8601（含日期與時間）
  "channel": 123,            // 正整數 1..3000
  "looted": true,            // boolean
  "note": "string",        // 可選，max 200 chars
  "createdAt": "string",
  "updatedAt": "string",
  "version": "v1"
}

設計說明：timestamp 儲存完整日期與時間，方便做「當天(00:00:00 - 23:59:59)」查詢與跨日處理。

## Local Storage 設計建議

- key: `abt_records_v1`
- value: { records: [ ... ], meta: { schemaVersion: "v1", lastPurgeAt: "..." } }
- 3000 筆限制預設為「per-boss」：當某個 boss 的紀錄超過 3000 時自動刪除最舊紀錄。
- CRUD API（模組化）:
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

範例結構：

```
const bossRespawnRules = {
  "bossA": { type: "fixedMinutes", minutes: 60 },
  "bossB": { type: "rangeMinutes", min: 45, max: 60 },
  "bossC": { type: "hourlyOffset", minute: 15 }
}
```

計算邏輯：
- fixedMinutes: respawn = killTime + minutes
- rangeMinutes: respawnRange = [killTime + min, killTime + max]
- hourlyOffset: 找到下一個 minute == offset 的時間點且 > killTime

跨日情形須顯示日期（例如 23:50 + 60min => 次日 00:50）。

## UI 元件（高階）

- Header（標題、日期快速切換）
- Boss 下拉選單
- 新增擊殺表單（或 modal）
- 當日紀錄表格（排序、編輯、刪除）
- 復活計算器（輸入擊殺時間/頻道 -> 顯示可能復活時間）
- 匯出/匯入按鈕（建議實作）

## 邊界案例與測試建議

- 頻道輸入錯誤（0、負數、非整數）
- LocalStorage 空間不足
- 跨日查詢（00:00:00 準則）
- 超過 3000 筆的淘汰策略

測試最小集：新增 / 編輯 / 刪除 / 驗證失敗 / 復活計算器三種 rule

## 假設與風險

- 假設：3000 筆為 per-boss 保留策略（如需改成 global，請回覆）
- 假設：資料存在於使用者本地瀏覽器（LocalStorage），不跨裝置
- 風險：LocalStorage 容量限制與效能問題；建議提供匯出備份

## MVP 開發任務（優先順序）

1. 建立專案骨架（index.html, styles.css, app.js）
2. Boss 下拉選單與靜態復活規則資料
3. 擊殺表單（含驗證）與新增功能
4. LocalStorage 模組（add/get/update/delete + 3000 策略）
  - 已採用 per-day-per-boss localStorage key 策略，以減少 parse 大型 JSON 的成本；專案啟動時會自動遷移舊的單一 key (`abt_records_v1`)（見 migration）。
5. 當日紀錄表格（顯示、edit/delete）
6. 復活計算器（fixed + range）
7. 簡單樣式與響應式

---

若你同意上述假設（特別是 3000 筆為 per-boss），我會依此實作 MVP；如果要改為 global 請告知，我會調整 schema 與淘汰策略。