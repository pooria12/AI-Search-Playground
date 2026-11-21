# AI Search Playground

Interactive AI Search Algorithm Visualizer — a Cloudflare-native educational
application that runs all 11 classical search algorithms in Python (via
Cloudflare Workers / Pyodide + FastAPI) and visualizes their real execution
traces in a React frontend.

## Architecture (single origin)

```
User Browser
    |
    v
Cloudflare Workers
    |
    +-- React + Vite static assets (Workers Static Assets)
    +-- Python Worker / FastAPI API  (/api/*)
    +-- Optional Cloudflare storage bindings
```

The Python Worker serves both the REST API and the frontend through one
hostname, so no CORS configuration or separate frontend server is needed.

## Project structure

```
ai-search-playground/
├── wrangler.jsonc              # Cloudflare Workers config
├── pyproject.toml              # Python dependencies + pytest config
├── backend/
│   ├── main.py                 # Cloudflare Workers entry point (ASGI)
│   ├── src/
│   │   ├── core/               # Shared problem model + grid environment
│   │   ├── algorithms/         # 11 independent search implementations
│   │   └── api/                # FastAPI routes, schemas, service, limits,
│   │                           #   static-asset proxy for the SPA
├── tests/                      # pytest suite (230+ tests; kept outside backend/
│                               #   because wrangler uploads every .py beside main.py)
├── frontend/
│   ├── package.json
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   └── src/                    # React dashboard (TypeScript)
├── docs/                       # architecture, deployment, API, validation
├── .gitignore
└── .env.example                # local variable placeholders
```

## The 11 algorithms

BFS, DFS, UCS, DLS, IDDFS, A*, Greedy Best-First, IDA*, Hill Climbing, Beam
Search, RBFS — each independently implemented in Python with real search
events, standardized results, pseudocode, and complexity/optimality/completeness
analysis. None are faked or shared under different labels. Hill climbing has
no random restarts: a restart would begin somewhere other than the requested
start cell, so any path it found would not be a path from that start.

## Local development

### Backend tests (plain Python, no Workers runtime needed)

```bash
python -m pip install fastapi pydantic pytest httpx
python -m pytest                 # from the repo root (config is in pyproject.toml)
```

### Frontend

```bash
cd frontend
npm install
npm run dev          # http://localhost:5173 (Vite proxies /api to localhost:8787)
npm run build        # production assets into frontend/dist
npm run typecheck    # tsc --noEmit
npm test             # vitest
```

### Cloudflare Workers (production runtime)

The Python Worker runs under Pyodide and needs Cloudflare's `pywrangler`
tooling, which is installable from PyPI (`workers-py`) and requires
`uv >= 0.13.4`:

```bash
cd frontend && npm install && npm run build && cd ..
uv run pywrangler dev            # local Worker at http://localhost:8787
cp .env.example .dev.vars        # optional local overrides (never commit secrets)
uv run pywrangler deploy         # requires `wrangler login`
```

> **Verification status.** The API, the algorithms and the static-asset proxy
> are covered by tests that run without the Workers runtime. The Worker entry
> (`backend/main.py`) and `wrangler.jsonc` follow Cloudflare's documented
> Python Workers FastAPI + Static Assets pattern, but they could **not** be run
> end to end in the environment where this audit was done (its network blocked
> the Pyodide package index). Run `pywrangler dev` once before deploying.

### Cloudflare Workers Builds (Git-connected deploys)

Dashboard (Workers & Pages -> your Worker -> Settings -> Build):

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Deploy command | `npx wrangler deploy` (the default) |

Plain wrangler does not vendor Python dependencies, so on its own it fails
validation with `ModuleNotFoundError: No module named 'workers'` (and would fail
on `fastapi` next). `pywrangler deploy` is `pywrangler sync` (which vendors
`workers-py`, `fastapi` and `pydantic` into `python_modules/`) followed by
`wrangler deploy`. `wrangler.jsonc` therefore sets
`build.command = "uv run pywrangler sync"`, so the default deploy command works
unchanged. Using `uv run pywrangler deploy` as the deploy command also works
(the second sync is a no-op). Workers Builds already runs `uv sync` because
of `[tool.uv]` in `pyproject.toml`, which is why `uv` is available.

The build also runs `npm clean-install` and `pip install .` at the repo root
automatically, so the root `package.json` and `pyproject.toml` are kept
build-safe (the Python project declares no packages; it only lists
dependencies). `npm run build` installs and builds `frontend/`, producing the
`frontend/dist` assets (gitignored, so they must be built in CI).

The Worker name in `wrangler.jsonc` (`algorithm`) must match the Worker the
build is connected to, or Workers Builds opens a rename pull request.

## Execution limits

Every search is bounded by max expanded nodes, max generated nodes, max events,
grid size and a timeout. The server limits live in `wrangler.jsonc` `vars`, are
read per request (`backend/src/api/limits.py`) and are reported at
`GET /api/config`. A request may ask for a *lower* budget, never a higher one.
A search that hits a limit returns `termination_reason: "limit_reached"` plus a
`limit_reason` such as `max_expanded_nodes` or `depth_limit`, and a final
`EXECUTION_LIMIT_REACHED` event; it is never reported as a natural failure.
`max_events` is different: it caps only the size of the returned trace. When
reached, the response sets `trace_truncated` and the search still finishes with
its real result.

Default grid: 20 columns x 15 rows (maximum 60 x 40).

### CPU time on Cloudflare

On the default grid, native CPython 3.12 takes roughly 1-30 ms per search
(BFS about 8 ms, RBFS about 28 ms) before Pyodide overhead. The Workers Free
plan allows 10 ms CPU per request, so **expect the Free plan to be too tight**
and plan on the Paid plan (or lower the limits in `vars`). Measure under
`pywrangler dev` and on your account.

### Algorithms that can hit a budget by design

Iterative deepening and RBFS repeat work, so on grids with walls they can use up
the expanded-node budget before finishing. Measured on 280 random solvable
20x15 grids with 10-30% walls and the default server budget: BFS, DFS, UCS, A*,
Greedy, IDDFS and IDA* solved 100%; RBFS 94% (it keeps no table of visited
cells, so it re-walks tied routes; the rest stop with
`limit_reason: "max_expanded_nodes"`). DLS stops at its depth limit by design
(default limit = start-to-goal Manhattan distance, so a wall detour is a
cutoff). Hill climbing stops at local optima and beam search can prune the only
route; both are incomplete by definition.

IDA* keeps a per-iteration table of the cheapest g seen per cell to avoid
re-walking equal-cost grid routes, which costs O(cells) memory instead of the
textbook O(path length).

## Storage

No accounts or authentication. The grid you draw is saved in browser
`localStorage` (validated on load; corrupt or oversized data is ignored) and
execution traces are kept in memory. No cloud storage is required.

## Testing

- Backend: `python -m pytest` from the repo root (476 tests):
  - differential tests of every complete/optimal algorithm against a reference
    Dijkstra on random grids (4/8-way, weighted terrain, walls);
  - property tests of the algorithms themselves (`tests/test_validation.py`):
    admissible + consistent heuristic, the expansion order that defines each
    algorithm (UCS by g, A* by f, BFS by level), event traces that agree with
    what the search did, exact budgets, edge cases for every algorithm;
  - regression tests for each bug found in the audits, API validation and
    error-shape tests, and the static-asset proxy.
- Frontend: `cd frontend && npm test` (vitest: cell parsing, animation
  timeline, grid editing, persistence, API client) and `npm run typecheck`.
- UI end to end (needs a running backend; skipped otherwise):

  ```bash
  python -m uvicorn src.api.app:app --app-dir backend --port 8787 &
  cd frontend && E2E_API_URL=http://127.0.0.1:8787 npm run test:e2e
  ```

  It mounts the real React app in jsdom against the real API and checks, for
  example, that the number of path-coloured canvas cells equals the returned
  path length.

## Docs

- `docs/architecture.md` — system architecture
- `docs/cloudflare-deployment.md` — Cloudflare deployment guide
- `docs/api.md` — REST API contract
- `docs/ALGORITHM_VALIDATION.md` — per-algorithm correctness validation
- `docs/DEVELOPMENT_PROGRESS.md` — phase status

## License

Educational project.
