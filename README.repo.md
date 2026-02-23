# Engine — Repo config (standalone repo)

When **engine** is its own Git repo (root = this folder), use these files.

## Repo config

| File | Purpose |
|------|---------|
| `.github/workflows/ci.yml` | CI: install on push/PR to `main` or `develop`. |
| `vercel.json` | Vercel Node serverless: runs `app.js` as the handler. |
| `render.yaml` | Render: Node web service. |

## Deploy options

### Vercel (serverless)

- Import repo, root = `.`
- Add env if needed (e.g. `PORT`). No DB required.

### Render

- New Web Service → connect repo (root = this folder).
- Optional: use `render.yaml`; set `PORT` if needed (default 3000).

### Other (Railway, Fly.io, VM)

- Run `npm start` (port from `PORT` or 3000).

## Health

- `GET /health` — status + instance + active jobs
