# ArtaleBossTimer

Static client-only app to record Boss kills (LocalStorage). This repo is prepared for Git-based version control and GitHub Pages deployment.

Project layout (organized for clarity):

- `/public` — static site files (HTML/CSS/JS) ready for deployment (local preview).
  - `index.html` — main UI
  - `app.js` — runtime JavaScript
  - `styles.css` — styling
- `/docs` — deployable copy for GitHub Pages (automated by workflow)
- `/src` — archived source snapshots for development/reference
- `/` — repository root (this README, .gitignore, and config files)

How to use locally

1. Preview locally (quick):
   - From the repository root run a simple HTTP server (Python):

```powershell
python -m http.server 8000

# then open http://localhost:8000/docs/index.html (or /public/index.html for preview)
```

2. Git & GitHub
   - Repo URL: https://github.com/elfhermit/ArtaleBossTimer.git
   - Typical workflow:

```powershell
git add .
git commit -m "Initial import: organize public/docs site"
git branch -M main
git remote add origin https://github.com/elfhermit/ArtaleBossTimer.git
git push -u origin main
```

3. GitHub Pages deployment
   - Option A (recommended): Use the `/docs` folder as Pages source. In GitHub repo Settings → Pages, select `main` branch `/docs` folder.
   - Option B: Use the `gh-pages` branch. This repo includes a GitHub Actions workflow that publishes `/docs` to `gh-pages` automatically on pushes to `main`.

Notes & next steps
- If you want the site to be served at the repo root via GitHub Pages without actions, move files into `docs/` or root.
- The runtime copies are in `/public` for local preview and `/docs` for deployment.
- If you'd like, I can:
  - Add a license (e.g., MIT) and CONTRIBUTING.md.
  - Add a GitHub Action to publish `public/` directly to `gh-pages` instead of using `/docs`.
  - Restore the full root source to `/src` (currently a snapshot) if you prefer a different organization.

