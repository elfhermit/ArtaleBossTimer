# SPEC (schema v1) — ArtaleBossTimer

此檔案為專案的規格文件（schema v1），記錄資料儲存、Boss 復活規則、保留策略與簡單的遷移 / 備份範例。

## 1. 目的

提供一個可被程式讀寫的單一真相（source of truth），讓 UI 與工具程式能一致地處理擊殺紀錄與 Boss 復活規則。

## 2. LocalStorage key

- 本版本（schema v1）使用的 LocalStorage key：`bossKillHistory`

> 備註：歷史上專案曾使用過不同的 key（例如 `abt_records_v1` 等）；若要支援舊 key，請參考第 7 節的遷移範例。

## 3. schema v1 — 資料模型（kill record）

`bossKillHistory` 為一個陣列（Array），每個元素為一筆擊殺紀錄 (object)，結構如下：

```json
{
  "id": "kill-<timestamp>",        
  "bossId": "boss-1",
  "killTime": "2025-11-17T14:05:00.000Z",
  "channel": 1,
  "hasDrop": true,
  "notes": "掉落：稀有裝備"
}
```

- 欄位說明：
  - `id` (string)：唯一識別字串（範例使用 `kill-<milliseconds>`）。
  - `bossId` (string)：對應 `docs/bosses/bosses.json` 中 `id` 欄位。
  - `killTime` (string)：ISO 8601 格式之 UTC 時間字串（程式中以 `new Date(...)` 處理）。
  - `channel` (integer)：頻道編號（1..3000），UI 有步進器與快速選取鍵。
  - `hasDrop` (boolean)：是否有出貨／掉寶。
  - `notes` (string)：備註（可空字串）。

## 4. Boss 靜態資料（位置）

- Boss 與其復活視窗由 `docs/bosses/bosses.json` 提供。每個 Boss 範例：

```json
{
  "id": "boss-1",
  "name": "紅寶王",
  "respawn": "23分~30分",
  "minMinutes": 23,
  "maxMinutes": 30,
  "image": "placeholder.svg"
}
```

- 欄位說明：
  - `id`, `name`: 識別與顯示名稱。
  - `respawn`: 可讀的文字描述（UI 顯示）。
  - `minMinutes`, `maxMinutes` (integer)：最早與最晚復活時間（以分鐘為單位），程式以此計算倒數與進度。
  - `image`：可選，預留給顯示用資源。

## 5. 行為與時間處理

- 程式在記錄 `killTime` 時使用 ISO 格式字串（UTC），顯示上使用瀏覽器本機時間與 `datetime-local` 控制元件（24 小時制）。
- 復活區間計算：以 `killTime + minMinutes` 為最早復活、`killTime + maxMinutes` 為最晚復活。

## 6. 保留策略（Retention）

- 根據專案規範（以 `SPEC.md` 為權威），採用 **每 Boss 最多保留 300 筆紀錄** 的策略。也就是說：
  - 在新增紀錄時，若單一 Boss 的紀錄數超過 300，請刪除該 Boss 最舊的紀錄以維持上限。

> 注意：README 或其他文件中曾提到 3000 的值；以 `SPEC.md` 的 300 為準。如需變更，請在修改時附上遷移計劃與原因說明。

## 7. 遷移與備份範例

- 匯出（備份）LocalStorage：

在瀏覽器 DevTools Console 可執行：

```js
const data = localStorage.getItem('bossKillHistory');
console.log(data); // 複製並存成檔案即可備份
```

- 匯入（還原）：把之前備份的 JSON 字串貼回並存入 LocalStorage：

```js
localStorage.setItem('bossKillHistory', '<PASTE_JSON_STRING>');
location.reload();
```

- 從舊 key (`abt_records_v1`) 遷移到 `bossKillHistory` 範例：

```js
// 假設舊資料為陣列且欄位相容
const old = localStorage.getItem('abt_records_v1');
if (old) {
  try {
    const parsed = JSON.parse(old);
    // 可在此做欄位檢查/轉換
    localStorage.setItem('bossKillHistory', JSON.stringify(parsed));
    console.log('遷移完成');
  } catch (e) { console.error('解析失敗', e); }
}
```

- 強制執行保留上限（在 console 執行）：

```js
const raw = JSON.parse(localStorage.getItem('bossKillHistory') || '[]');
const limitPerBoss = 300;
const grouped = raw.reduce((acc, rec) => {
  acc[rec.bossId] = acc[rec.bossId] || [];
  acc[rec.bossId].push(rec);
  return acc;
}, {});

const result = Object.values(grouped).flatMap(list => {
  // 依 killTime 升序刪除最舊的
  list.sort((a,b)=> new Date(a.killTime) - new Date(b.killTime));
  if (list.length <= limitPerBoss) return list;
  return list.slice(list.length - limitPerBoss);
});

localStorage.setItem('bossKillHistory', JSON.stringify(result));
console.log('已套用保留策略');
```

## 8. 驗證小工具（console 範例）

檢查每個 Boss 的紀錄數：

```js
const data = JSON.parse(localStorage.getItem('bossKillHistory') || '[]');
const counts = data.reduce((acc, r) => { acc[r.bossId] = (acc[r.bossId]||0)+1; return acc; }, {});
console.table(counts);
```

檢查是否所有紀錄符合 schema（簡單檢查）：

```js
const invalid = data.filter(r => !r.id || !r.bossId || !r.killTime || typeof r.channel !== 'number');
console.log('invalid count', invalid.length);
console.dir(invalid.slice(0,20));
```

## 9. 其他注意事項

- 若修改 `docs/bosses/bosses.json`（新增 Boss 或更新 `minMinutes`/`maxMinutes`），請同時更新 UI 下拉或卡片標籤（`docs/index.html` / `docs/app.js` 中的渲染程式）。
- 若要調整保留上限或 storage key，請在 PR 中提供遷移計劃與測試指令。

---

檔案建立於 schema v1。如果你希望我把此 SPEC 同步到 README 或新增一個遷移腳本檔案，請告訴我，我可以 `建立` 該工具並提交。
