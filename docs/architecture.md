# Architecture

## Single-origin deployment

The application is deployed as a single Cloudflare Worker that serves both the
REST API and the React frontend through one hostname. No CORS, no separate
frontend server, no Uvicorn in production.

```
User Browser
    |
    v
Cloudflare Workers
    |
    +-- React + Vite static assets (Workers Static Assets binding: ASSETS)
    +-- Python Worker / FastAPI API            (routes under /api/*)
    +-- Optional Cloudflare storage bindings   (not required initially)
```

## Layers

### Frontend (`frontend/src`)
- React + TypeScript + Vite, Tailwind CSS, Lucide React
- `context/AppContext.tsx` — grid editing state and the pure edit functions
  (paint, move start/goal, resize, random walls/terrain); persists the grid
- `components/Grid.tsx` — canvas grid: drag S/G, paint walls and terrain,
  erase; renders the current animation frame
- `lib/timeline.ts` — turns an event trace into random-access animation frames
  using periodic checkpoints (scrub forwards or backwards cheaply)
- `lib/cells.ts` — parses the backend's `"(row,col)"` identifiers
- `hooks/usePlayback.ts` — requestAnimationFrame playback with a speed scale
- `components/` — Toolbar, AlgorithmSelector, AlgorithmOptionsPanel,
  PlaybackControls, EventInspector, StatsPanel, ComparisonView
- `services/api.ts` — API client; surfaces the backend's error messages
- `pages/EducationPage.tsx` — per-algorithm concepts, pseudocode, Python source
- `App.tsx` — shell: runs searches, discards stale responses, navigation

### Backend (`backend/src`)
- `core/problem.py` — shared problem model: Cell, Action, SearchProblem,
  SearchEvent, SearchResult, TerminationReason, EventType
- `core/grid.py` — grid environment: 4-way / 8-way movement, normal/difficult/
  high-cost terrain, corner-cutting policy, Manhattan + Octile heuristics,
  `build_problem()`
- `algorithms/base.py` — shared base class: event emission, execution budgets
  (with a reported `limit_reason`), monotonic timing, path reconstruction and
  path-cost recomputation
- `algorithms/*.py` — 11 independent implementations (bfs, dfs, ucs, dls,
  iddfs, astar, greedy, ida_star, hill_climbing, beam_search, rbfs)
- `algorithms/__init__.py` — registry + metadata
- `api/app.py` — FastAPI routes + uniform error handlers
- `api/limits.py` — server limits read from Worker `env` per request
- `api/frontend.py` — static-asset proxy with SPA fallback
- `api/schemas.py` — Pydantic request/response DTOs
- `api/service.py` — service layer bridging DTOs <-> algorithms

## Event-based execution

Every algorithm emits real execution events (SEARCH_STARTED, NODE_DISCOVERED,
NODE_EXPANDED, PATH_FOUND, etc.) with seq, node, parent, depth, g/h/f, and
metadata. The backend runs the search, returns the trace + final result, and
the React frontend animates the stored trace. No WebSocket is required.

## Execution budget

To respect Cloudflare Workers Free-plan limits, each search is bounded by
max expanded nodes, max generated nodes, max events (which also bounds the
response size), grid dimensions and a timeout. Exceeding a budget returns a structured
`limit_reached` result — never reported as a natural failure.
