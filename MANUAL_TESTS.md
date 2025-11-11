# Manual Acceptance Tests — Artale Boss Timer

這份檔案列出在本次變更（Modal、Toast、per-day-per-boss 儲存、migration）之後的手動驗收步驟。

環境準備
- 使用同一個瀏覽器（測試以 Chrome / Edge / Firefox 任一為主）。
- 若有舊的單一 key `abt_records_v1`，請先備份（Developer Tools → Application → Local Storage → 匯出該 key 的值），以便測試遷移。

測試步驟

1) 啟動與遷移檢查
- 打開 `index.html`。
- 若 LocalStorage 中存在舊 key `abt_records_v1`，啟動時應自動遷移到多個 key (`abt:<bossId>:YYYY-MM-DD`)；檢查 DevTools → Application → Local Storage，確認沒有 `abt_records_v1`，而是多個 `abt:` 前綴的 key。
- 若成功，畫面不應出現錯誤。

2) 新增紀錄
- 選擇 Boss（預設 BossA），點「新增擊殺」。
- 表單預填現在時間，輸入頻道（例如 12）、選「是/否」出貨、填備註，點「儲存」。
- 預期：畫面右下角出現綠色 toast（"已新增紀錄"），表格顯示該筆紀錄。
- 在 DevTools 的 LocalStorage 檢查對應 key `abt:<Boss>:YYYY-MM-DD`，該 key 的 JSON 應包含剛剛的紀錄。

3) 編輯紀錄
- 在表格點「編輯」，表單會填入該筆資料，修改頻道或備註，按儲存。
- 預期：綠色 toast（"已更新紀錄"），表格更新該筆顯示。
- 檢查 LocalStorage 中該筆資料的 `updatedAt` 已更新。

4) 刪除紀錄（Modal）
- 在表格點「刪除」，應彈出自訂確認 modal（非瀏覽器 confirm）。
- 按「取消」→ 不會刪除；再按「刪除」→ 在 modal 按「確認」後，右下角出現 toast（"已刪除紀錄"），表格不再顯示該筆。
- 檢查 LocalStorage 對應 key 內該 id 已被移除。

5) 復活計算器與規則顯示
- 在復活計算器區塊切換 Boss，`規則說明` 會依 Boss 顯示，範例：BossA 顯示 "固定 60 分鐘後復活..."。
- 輸入時間（或使用表單時間），按「計算復活」，下方顯示計算結果，且出現小提示 toast。

6) 邊界測試
- 輸入頻道 0、-1、空字串或小數：應看到錯誤 toast（頻道必須為 1 到 3000 的整數）。
- 嘗試在本地大量新增多筆紀錄（可用 console 快速插入）以觸發 purge 策略：當單一 Boss 的總筆數超過 3000 時，系統會自動刪除最舊的紀錄（跨 day 檢查），檢查是否生效。

7) 恢復舊資料（回退測試）
- 若需要回退，可以把先前備份的 `abt_records_v1` 的值貼回 LocalStorage 中，重新載入頁面應再次執行 migration（或手動刪除遷移後的 per-day keys 並還原舊 key）。

注意事項
- 匯入/匯出功能暫不實作；僅支援同一瀏覽器的 LocalStorage 使用情境。
- migration 只在啟動時執行一次：若移除 per-day keys 並把 old key 放回，重新載入會再次遷移。

開發者小技巧
- 在 Console 中可用下列程式碼快速查看該 boss 的當日 key：

```js
const boss = 'BossA';
const d = new Date();
const key = `abt:${boss}:${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
console.log(key, localStorage.getItem(key));
```

---

如需我把匯出/匯入改為隱藏的進階功能（放在設定頁面），或把 purge 策略改為每日上限而非全域上限，請告訴我優先順序，我會依據你的指示調整。