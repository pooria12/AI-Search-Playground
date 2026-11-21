# API Contract

All routes are relative to the same origin (no CORS required).

## Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/config` | Effective server limits (max grid size, defaults) |
| GET | `/api/algorithms` | List all 11 algorithms with metadata |
| GET | `/api/algorithms/{id}` | Get one algorithm's metadata |
| POST | `/api/search/execute` | Run a search and return result + event trace |
| POST | `/api/environments/validate` | Validate a grid environment config |
| POST | `/api/comparisons` | Run multiple algorithms on one environment |
| POST | `/api/search/validate-path` | Validate a search config without executing |

## Search execute request

```json
{
  "algorithm": "astar",
  "start": {"row": 0, "col": 0},
  "goal": {"row": 2, "col": 2},
  "rows": 15,
  "cols": 20,
  "movement": "four_way",
  "corner_cutting": false,
  "obstacles": [{"row": 1, "col": 1}],
  "terrain": [{"row": 3, "col": 3, "type": "difficult"}],
  "beam_width": 3,
  "dls_limit": null,
  "iddfs_max_depth": 100,
  "hill_climbing_sideways": 0,
  "max_expanded_nodes": null,
  "max_generated_nodes": null,
  "max_events": null,
  "timeout_ms": null
}
```

Notes:

- `rows` / `cols` default to 15 / 20 and are limited by `GET /api/config`.
- `movement` is `"four_way"` or `"eight_way"`; `terrain[].type` is `"difficult"`
  (cost 2) or `"high_cost"` (cost 5). Anything else is a 422.
- `dls_limit: null` means *automatic*: the start-to-goal Manhattan distance.
- `iddfs_max_depth` is clamped to `rows * cols`.
- The `max_*` / `timeout_ms` fields may only *lower* the server's budget.
  `max_expanded_nodes`, `max_generated_nodes` and `timeout_ms` bound the
  search itself. `max_events` bounds only the size of the returned trace: when
  it is reached, later events are dropped, `trace_truncated` is `true`, and the
  search still runs to its real outcome. The concluding event
  (`PATH_FOUND`, `SEARCH_FAILED` or `EXECUTION_LIMIT_REACHED`) is always kept.
- `movement: "eight_way"` with `corner_cutting: false` forbids a diagonal when
  either side cell is a wall; with `true` it may graze one wall corner but never
  squeeze between two walls.
- Start/goal must be in bounds and not on an obstacle, and obstacles/terrain
  must be in bounds; otherwise the response is a 400 with a readable message.

## Search execute response

```json
{
  "result": {
    "found": true,
    "path": ["(0,0)","(0,1)","(1,1)","(2,1)","(2,2)"],
    "path_cost": 4.0,
    "nodes_explored": 9,
    "nodes_generated": 9,
    "execution_time_ms": 0.63,
    "max_frontier_size": 3,
    "search_depth": 4,
    "events": [
      {"seq":1,"type":"SEARCH_STARTED","node":"(0,0)","parent":null,"depth":0,"g":0.0,"h":4.0,"f":0.0,"metadata":{}},
      ...
    ],
    "termination_reason": "success",
    "algorithm": "astar",
    "limit_reason": null,
    "trace_truncated": false
  }
}
```

## Termination reasons

`success`, `no_path`, `limit_reached`. (`interrupted` and `invalid_config` exist
in the enum but are not currently produced.)

When `limit_reached`, `limit_reason` says why: `max_expanded_nodes`,
`max_generated_nodes`, `timeout`, `depth_limit` (DLS cutoff),
`max_depth` (IDDFS ran out of depths) or `max_recursion_depth`. The trace then
ends with an `EXECUTION_LIMIT_REACHED` event. A budget interruption is never
reported as a natural failure.

Cell identifiers in `path` and in events use the form `"(row,col)"`.

## Error responses

Every error uses this shape. `code` is `invalid_request` (400),
`validation_error` (422, with `field`), `request_error` (e.g. 404) or
`internal_error` (500).

```json
{
  "error": {
    "code": "invalid_request",
    "message": "...",
    "field": null
  }
}
```
