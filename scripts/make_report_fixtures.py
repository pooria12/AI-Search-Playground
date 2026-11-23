"""Record real API responses for every algorithm, for the frontend report tests.

Usage (from the repo root):  python scripts/make_report_fixtures.py
The fixtures are genuine /api/search/execute responses, so the report logic is
tested against exactly what the backend produces.
"""

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from fastapi.testclient import TestClient  # noqa: E402

from src.api.app import app  # noqa: E402

client = TestClient(app)

# 8 x 12 maze with a wall the route must go around, plus some costly terrain.
MAZE = {
    "rows": 8,
    "cols": 12,
    "start": {"row": 4, "col": 1},
    "goal": {"row": 4, "col": 10},
    "movement": "four_way",
    "corner_cutting": False,
    "obstacles": [{"row": r, "col": 6} for r in range(1, 7)],
    "terrain": [{"row": 7, "col": c, "type": "difficult"} for c in range(5, 8)],
}

# A small maze keeps the trace of the repeat-heavy algorithms (IDDFS, RBFS) tiny.
SMALL = {
    "rows": 5,
    "cols": 9,
    "start": {"row": 2, "col": 1},
    "goal": {"row": 2, "col": 7},
    "movement": "four_way",
    "corner_cutting": False,
    "obstacles": [{"row": r, "col": 4} for r in range(0, 4)],
    "terrain": [],
}

SCENARIOS = {
    # name -> (algorithm, request overrides)
    **{a: (a, {}) for a in ("bfs", "dfs", "ucs", "astar", "greedy",
                            "ida_star", "beam_search", "hill_climbing")},
    "dls": ("dls", {"dls_limit": 20}),
    "iddfs": ("iddfs", {**SMALL, "iddfs_max_depth": 40}),
    "rbfs": ("rbfs", SMALL),
    # the search finishes, but its trace is cut short by the event cap
    "rbfs_truncated": ("rbfs", {"max_events": 400}),
    # outcomes other than plain success
    "dls_cutoff": ("dls", {"dls_limit": 4}),
    "bfs_no_path": ("bfs", {"obstacles": [{"row": r, "col": 6} for r in range(0, 8)]}),
    "beam_width1": ("beam_search", {"beam_width": 1}),
    "astar_8way": ("astar", {"movement": "eight_way", "corner_cutting": True}),
    "astar_limit": ("astar", {"max_expanded_nodes": 7}),
}

out = {"maze": MAZE, "runs": {}}
for name, (algorithm, patch) in SCENARIOS.items():
    request = {**MAZE, **patch, "algorithm": algorithm}
    response = client.post("/api/search/execute", json=request)
    assert response.status_code == 200, (name, response.text)
    out["runs"][name] = {"request": request, "result": response.json()["result"]}

target = ROOT / "frontend" / "src" / "lib" / "__fixtures__" / "runs.json"
target.write_text(json.dumps(out, separators=(",", ":")))
print(f"wrote {target.relative_to(ROOT)} ({target.stat().st_size // 1024} KiB)")
for name, run in out["runs"].items():
    r = run["result"]
    print(f"  {name:12s} found={r['found']!s:5} {r['termination_reason']:13s} "
          f"explored={r['nodes_explored']:4d} events={len(r['events']):5d} "
          f"cost={r['path_cost']:.2f} limit={r['limit_reason']}")
