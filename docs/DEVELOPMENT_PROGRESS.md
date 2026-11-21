# Development Progress

## Phase 0 — Cloudflare Architecture (complete)
- Repository inspected (greenfield, no existing code)
- Mandatory `search-algorithm-engineering` skill read and followed
- Project structure created
- `wrangler.jsonc` — python_workers flag, static assets binding, bounded vars
- `backend/pyproject.toml` — fastapi, pydantic
- `frontend/package.json` + `vite.config.ts` — React/Vite, Tailwind, proxy
- `.gitignore`, `.env.example`, `.dev.vars.example`

## Phase 1 — Algorithms (complete)
All 11 algorithms independently implemented:
bfs, dfs, ucs, dls, iddfs, astar, greedy, ida_star, hill_climbing,
beam_search, rbfs
- Shared problem model (core/problem.py, core/grid.py)
- Shared base class (base.py): events, budgets, timing, path reconstruction,
  path-cost validation
- 90 algorithm unit tests pass (conftest fixtures + parametrized contract tests)

## Phase 2 — Cloudflare Backend (complete)
- FastAPI app (api/app.py): health, algorithms, execute, validate-env,
  comparisons, validate-path
- Pydantic schemas (api/schemas.py)
- Service layer (api/service.py): DTO <-> algorithm bridging, server-side
  budget maximums, environment validation, comparison runner
- Cloudflare Workers entry (backend/src/main.py): asgi.entrypoint + static
  assets + SPA fallback
- 9 API tests pass (total 99 backend tests)

## Phase 3 — Frontend (complete)
- React dashboard: algorithm selector, interactive grid, playback controls,
  statistics, education page, comparison dashboard
- Tailwind dark theme (navy/charcoal/blue), canvas grid with event playback
- Type-safe API client
- `tsc --noEmit` passes; `npm run build` succeeds

## Phase 4 — Event playback & visualization (complete)
- Backend events serialized to frontend; per-step animation frames derived
  from events (frontier/explored/expanding/path)
- Play / pause / step forward / step backward / reset / speed slider
- Backward playback by replaying from stored event history (no fabricated
  inverse events)

## Phase 5 — Education & Comparison (complete)
- EducationPage: pseudocode, Python source, complexity, completeness,
  optimality, advantages, disadvantages, examples per algorithm
- Comparison dashboard: side-by-side results table on identical environments

## Phase 6 — Deployment configuration (in progress)
- wrangler.jsonc configured (python_workers flag, ASSETS binding)
- `pywrangler` is installable from PyPI (`workers-py`, needs `uv >= 0.13.4`),
  but the Worker was not run end to end; see README "Verification status".

## Phase 7 — QA (pending)
- Backend: 476 passed. Frontend: 32 passed (vitest) + 6 end-to-end UI tests
- Frontend production build: OK
- Cloudflare deployment verification: pending (requires Cloudflare credentials)

## Audit (November 2026)

Debugged end to end. Highlights:
IDA* never advanced its threshold, IDDFS/DLS used an unsound visited set,
DFS/DLS re-counted nodes on every backtrack, beam search ranked by g instead of
h, hill climbing advertised restarts it never had, budgets for IDDFS were not
enforced and limit reasons were lost, exceptions were swallowed as
"interrupted", server limits in `wrangler.jsonc` were never read, defaults for
rows/cols were swapped, and the frontend could not parse the backend's cell
format (so the animation never rendered) nor size its grid cells.

## Second audit (algorithms)

Exact budgets (N allows exactly N expansions), a 1e-9 cost tolerance so sums of
sqrt(2) never reopen nodes, honest `max_frontier_size` for IDA*/RBFS, consistent
terminal events, `max_events` truncates the trace instead of aborting the search
(IDDFS on the default grid: 45% -> 100% solved), no more squeezing between two
diagonal walls, Greedy's completeness stated correctly, memoised successors,
and property tests that validate algorithm behaviour rather than only answers.
