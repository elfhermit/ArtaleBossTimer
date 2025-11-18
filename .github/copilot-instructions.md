
<!-- Copilot 專案指引（針對本存放庫的簡短、可落地指示） -->
# 快速代理人指南 — Artale-Boss-Chaser

本檔案提供給 Copilot/AI 程式碼代理人的精簡、可執行指引，讓你能快速在本專案中開始工作。

重要事項（請先閱讀）
- 本專案為純前端靜態應用，執行檔案位於 `docs/`（歷史上也曾使用 `public/` 做本機預覽）。
- 主要 runtime 檔案：`docs/index.html`、`docs/app.js`、`docs/styles.css`。
- 規格與資料模型的權威來源：`SPEC.md`（schema v1）——在有衝突時以此為準。
 - GitHub Pages 已設定：Branch = `main`，Folder = `/docs`（參考 repo Settings → Pages）。

首先要做的事
- 閱讀 `SPEC.md`（資料模型、復活規則、LocalStorage key 設計）。
- 打開 `docs/app.js`，查看 runtime 程式碼與工具函式；許多專案特有的 helper 在那裡實作。

專案架構（概覽）
- Single-page 靜態前端，無伺服器元件。
- 資料儲存：瀏覽器 LocalStorage。需了解的 key：`abt_records_v1`（或依 `SPEC.md` 所述的 per-boss 變體）。
- 資料流：UI（`index.html`）→ 表單處理與邏輯 (`docs/app.js`) → LocalStorage CRUD（`addRecord`、`updateRecord`、`deleteRecord`、`getRecords`）→ UI 表格渲染與復活時間計算。

專案慣例與要注意的地方
- LocalStorage 策略：依 `SPEC.md` 採用 per-boss 的保留策略並紀錄 schema 版本（`v1`）；修改前務必參考 `SPEC.md` 的鍵名與遷移說明。
- 保留上限不一致（注意）：`SPEC.md` 提到 per-boss 300 筆，但 `README.md` 有處提到 3000；若改動 retention 邏輯，請以 `SPEC.md` 為準並在 PR 中註明差異。
- 復活規則（respawn rules）為靜態資料結構（參見 `SPEC.md` 範例）。新增 Boss 時需同時更新 `docs/app.js` 中的規則物件與 Boss 下拉選單。
- 表單驗證：頻道（channel）為整數，範圍 1..3000（上限可調，請參考 `SPEC.md`）。

開發工作流程（本機執行與偵錯）
- 本機快速預覽（PowerShell）：
  ```powershell
  python -m http.server 8000
  # 瀏覽器開啟 http://localhost:8000/docs/index.html
  ```
- 若在其他分支或 fork 看到 `public/` 資料夾，可使用 `/public/index.html` 做預覽。
- 偵錯：在瀏覽器 DevTools → Application → Local Storage 檢查 `abt:` 前綴的 key，方便匯出／匯入 JSON 做驗證。

常見維護 / 修改的檔案
- 調整 UI/行為：`docs/app.js` 與 `docs/index.html`。
- 調整樣式：`docs/styles.css`。
- 規格或 schema 變更：更新 `SPEC.md` 並在同一 PR 裡附上遷移計畫。

範例與慣用模式（實務重點）
- CRUD helper：在 `docs/app.js` 搜尋 `addRecord`、`getRecords`、`purgeOldRecordsIfNeeded`，若新增工具函式請沿用相同簽名與錯誤處理方式。
- 復活規則範例（摘自 `SPEC.md`）：
  ```js
  const bossRespawnRules = {
    "bossA": { type: "fixedMinutes", minutes: 60 },
    "bossB": { type: "rangeMinutes", min: 45, max: 60 },
  }
  ```
- 新增 Boss 時：更新上述規則物件，並在 `docs/index.html`（或渲染下拉的 JS）新增對應選項。

測試與驗證（目前狀態）
- 本 repo 尚無自動化測試。小幅變更建議手動驗證：
  1) 啟動本機 HTTP server；2) 在 UI 執行新增/編輯/刪除流程；3) 在 DevTools 的 LocalStorage 中檢查資料。
- 若修改資料結構，請同時提供一個遷移 helper 與一個可在 console 執行的驗證小工具（例如：統計每個 boss 的紀錄數並檢查 `version === 'v1'`）。

代理人應注意的邊界案例
- LocalStorage 容量限制 — 若提案會大量產生資料，優先建議提供匯出/匯入或分段儲存策略。
- 跨日計算（cross-day）：時間運算必須保留 ISO 格式並正確顯示跨午夜的日期（例如：23:50 + 60 分 => 次日 00:50）。
- 表單驗證需與 `SPEC.md` 保持一致（channel 範圍、備註長度上限等）。

不確定時怎麼做
- 遵循 `SPEC.md` 作為資料形狀與儲存設計的單一真相來源。
- 若變更儲存格式，務必同時提供遷移邏輯並更新 `SPEC.md` 與 `README.md`（`README.md` 中提到 `public/`，請與實際情況對齊）。

需要決定或回覆的事項
- 請確認保留上限：要以 `SPEC.md` 的每 Boss 300 筆為準，還是以 `README.md` 的 3000 為準？（若要改為 global policy，我可以順便實作遷移 helper。）
- 已設定 canonical preview 資料夾為 `docs/`（Settings → Pages 指向 `main` + `/docs`）。若你想改回 `public/` 或改為 `gh-pages` branch，請告知我我可以協助調整部署流程或新增 Action。

-- 檔案結束
