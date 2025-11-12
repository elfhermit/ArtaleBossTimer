# ArtaleBossTimer

Static client-only app to record Boss kills (LocalStorage). This repository contains a static UI and utilities for local preview and development.

給新人的一句話：此專案是一個純前端（client-only）的 Boss 擊殺紀錄工具，使用瀏覽器 LocalStorage 儲存資料，供同一瀏覽器中查詢、編輯與顯示預估復活時間。

快速上手（給新人）：
- 開啟 `public/index.html`（或在本地啟動 HTTP server 後開啟 `/public/index.html`）
- 從上方的 Boss 下拉選擇一個 Boss，表單會預填當下時間。輸入頻道（1-3000）、是否出貨、及備註，按「儲存」。
- 下方「當天紀錄」會列出該 Boss 的今日紀錄，包含預估復活時間；可在表格中編輯或刪除紀錄。
- 若需備份，請使用瀏覽器 Developer Tools → Application → Local Storage 將相關 `abt:` 開頭的 key 匯出。

Project layout (organized for clarity):

- `/public` — static site files (HTML/CSS/JS) intended for local preview.
  - `index.html` — main UI
  - `app.js` — runtime JavaScript
  - `styles.css` — styling
- `/docs` — copy of the static site (kept for reference). NOTE: GitHub Pages is intentionally not configured in this repo per project settings.
- `/src` — archived source snapshots for development/reference
- `/` — repository root (this README, .gitignore, and config files)

How to use locally

1. Preview locally (quick):
   - From the repository root run a simple HTTP server (Python):

```powershell
python -m http.server 8000

# then open http://localhost:8000/public/index.html (or /docs/index.html for reference)
```

2. Git & GitHub
   - Repo URL: https://github.com/elfhermit/ArtaleBossTimer.git
   - Typical workflow:

```powershell
git add .
git commit -m "Update: project organization"
git branch -M main
git remote add origin https://github.com/elfhermit/ArtaleBossTimer.git
git push -u origin main
```

3. GitHub Pages / Publishing
   - NOTE: GitHub Pages deployment is intentionally disabled for this repository (per user request).
   - If you later decide to enable Pages, you can manually set it in the repository Settings → Pages (Branch: `main`, Folder: `/docs`) or add an action to publish to `gh-pages`.

Notes & next steps
- The runtime copies live in `/public` for local preview. `/docs` is retained for reference but Pages is not active.
- If you'd like, I can:
  - Add a license (e.g., MIT) and `CONTRIBUTING.md`.
  - Add an optional manual publish workflow that you can trigger (`workflow_dispatch`) to publish `/docs` to `gh-pages` on demand.
  - Produce a `NEXT_STEPS.md` with remaining tasks and risk assumptions.

