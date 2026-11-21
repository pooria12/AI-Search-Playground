# Cloudflare Deployment

## Configuration files

- `wrangler.jsonc` — Workers config: `python_workers` compatibility flag,
  `main = backend/src/main.py`, static assets binding `ASSETS` →
  `frontend/dist`, bounded vars (budget limits, default grid).
- `backend/pyproject.toml` — fastapi, pydantic (+ pytest/httpx for tests).
- `frontend/package.json` — React/Vite frontend; `npm run build` → `dist`.
- `frontend/vite.config.ts` — proxies `/api` to localhost:8787 in dev.

## Deployment steps

```bash
# 1. Build the React frontend (production static assets)
cd frontend
npm install
npm run build
cd ..

# 2. Copy dev vars (edit values as needed; never commit secrets)
cp .env.example .dev.vars   # for local development
cp .dev.vars.example .dev.vars

# 3. Deploy to Cloudflare Workers
wrangler login
wrangler deploy --config wrangler.jsonc
```

## Verification checklist

Before declaring deployment successful:
1. Worker builds successfully.
2. Python dependencies install correctly in the Workers runtime.
3. FastAPI initializes successfully.
4. All 11 algorithm modules import successfully.
5. Static frontend assets are served (`/` returns index.html).
6. API endpoints respond correctly (`/api/health`, `/api/algorithms`,
   `/api/search/execute`, etc.).
7. SPA navigation works (direct page refresh returns index.html).
8. Search execution works in the deployed runtime.
9. Execution budgets are respected.
10. No secrets are exposed.
11. All 11 algorithms tested.
12. Public deployment URL works.

## Deployment profiles

- **Profile A — Cloudflare Free (default):** Python Workers, Static Assets,
  REST API, bounded algorithm execution, small/medium grids, limited event
  histories, localStorage persistence.
- **Profile B — Paid / Advanced:** optional upgrade path (Workers paid CPU
  limits, Containers, Durable Objects, D1/KV). Paid services are never made
  mandatory or introduced silently.

## Worker entry and static assets

`wrangler.jsonc` points `main` at `backend/main.py`, which follows Cloudflare's
documented pattern: `Default = asgi.entrypoint(app)`. With
`assets.run_worker_first = true` every request reaches FastAPI first, so
`/api/*` always wins; a final catch-all route proxies everything else to the
`ASSETS` binding, falling back to `index.html` for client-side routes.
Tests live in the top-level `tests/` (not `backend/tests/`) so wrangler does
not upload them with the Worker. `pyproject.toml` lives at the repo root next to `wrangler.jsonc`, as
`pywrangler` expects.

## Running locally

`pywrangler` is installable from PyPI (`workers-py`) and needs `uv >= 0.13.4`:

```bash
cd frontend && npm install && npm run build && cd ..
uv run pywrangler dev
```

This path was not exercised end to end during the audit (the sandbox could not
reach the Pyodide package index), so run it once before deploying. The FastAPI
app and the asset proxy are covered by the pytest suite without the runtime.

## CPU limits

Native CPython takes roughly 1-30 ms per search on the default grid, before
Pyodide overhead. The Free plan's 10 ms CPU limit is likely too small; use the
Paid plan or lower the `SEARCH_*` limits in `vars`.

## Git-connected deploys

Build command `npm run build`, deploy command `npx wrangler deploy`.
`wrangler.jsonc` sets `build.command = "uv run pywrangler sync"`, which vendors
the Python packages into `python_modules/` before wrangler uploads the Worker
(`pywrangler deploy` does exactly this sync, then calls `wrangler deploy`).
Without it the deploy fails with `No module named 'workers'`.
