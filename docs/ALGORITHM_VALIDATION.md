# Algorithm Validation

## Test coverage (230+ backend tests)

All 11 algorithms are tested for:

- Start equals goal
- Direct path
- No path (obstacles fully blocking)
- Cycles / repeated states
- Multiple routes
- Obstacles
- Weighted terrain (respect by cost-sensitive algorithms)
- Tie cases and deterministic ordering
- Algorithm-specific limits, thresholds, pruning, backtracking

## Optimality guarantees (tested on unweighted 4-way grid)

| Algorithm | Optimal on equal cost? | Complete? | Notes |
|-----------|------------------------|-----------|-------|
| BFS | Yes | Yes | shortest edge count |
| DFS | No | Yes (finite graph, visited set) | first path found |
| UCS | Yes | Yes | nonnegative costs |
| DLS | No | Within limit | cutoff vs failure |
| IDDFS | Yes (steps) | Yes | increasing limits; depth-aware visited map |
| A* | Yes | Yes | admissible heuristic |
| Greedy | No | No | h(n) only |
| IDA* | Yes | Yes | f-threshold; per-iteration transposition table |
| Hill Climbing | No | No | local optima |
| Beam Search | No | No | pruning may discard solution |
| RBFS | Yes | Yes | f-limit, linear space |

## Path validation

Every successful path is validated:
1. Starts at the requested start cell.
2. Ends at the goal cell.
3. Every adjacent pair is a legal transition under configured movement rules.
4. No blocked (obstacle) cells.
5. Valid diagonal movement: with corner cutting off a diagonal needs both side
   cells free; with it on, one wall corner may be grazed but the agent never
   squeezes between two walls that touch diagonally.
6. Recomputed cumulative cost equals reported `path_cost`.

## DLS cutoff semantics

DLS distinguishes `cutoff` (a never-reached state was skipped only because of
the limit) from `failure` (the space inside the limit is exhausted), so IDDFS
can continue correctly and stop early. Visited bookkeeping is depth-aware: a
state is re-expanded when reached at a strictly shallower depth, otherwise a
goal inside the limit could be missed.

## IDDFS iterations

Each IDDFS iteration reports ITERATION_STARTED / ITERATION_COMPLETED events
with found/cutoff status and nodes expanded.

## Beam search

Validates beam width >= 1. Candidates are ranked by heuristic (ties: lower g,
then cell order); a state is a candidate once per level and never re-enters the
beam. Emits NODE_PRUNED events for candidates beyond the beam width. Not
complete or optimal.

## Event serialization

Events are serially numbered from 1, in order, with seq, type, node, parent,
depth, g/h/f, and metadata. `to_dict()` produces JSON-serializable output.

## Differential testing

`tests/test_regressions.py` compares every algorithm with a reference Dijkstra
on random grids: complete algorithms must find a path exactly when one exists,
paths must be legal, the reported cost must equal the recomputed cost, and
UCS / A* / IDA* / RBFS must match the optimal cost. BFS and IDDFS must be
optimal in steps on unit-cost 4-way grids.

## Known limits (by design)

- IDDFS and RBFS repeat work. On the default 20x15 grid with 10-30% walls
  IDDFS solves every map within the default budget; RBFS stops on the
  expanded-node budget for roughly 6% of them (it re-walks tied routes because
  it keeps no table of visited cells). That is reported as `limit_reached` with
  `limit_reason: "max_expanded_nodes"`, never as a failure to find a path.
- `max_events` only truncates the recorded trace (`trace_truncated`); it never
  changes a search's outcome.
- Python's recursion limit is raised temporarily for IDA* and RBFS (restored
  afterwards); exhaustion is reported as `max_recursion_depth`.
- Unexpected exceptions are never converted into a search result: they surface
  as a 500 `internal_error`.

## What the property tests check

`tests/test_validation.py` goes beyond "found a path":

- the heuristic is admissible and consistent on random weighted 4/8-way grids;
- UCS expands in non-decreasing g, BFS level by level, A* in non-decreasing f
  and never expands a node with f above the optimal cost, and never more nodes
  than UCS (+1); IDA* never expands a node above its threshold;
- every event agrees with the search: g values equal parent g + step cost, h
  equals the heuristic, nodes are discovered before they are expanded, and the
  counters equal the events;
- every trace ends with the event that matches its outcome;
- budgets are exact (a budget of N allows exactly N expansions/generations);
- cost comparisons use a 1e-9 tolerance so sums of sqrt(2) cannot look like a
  cheaper route and cause a node to be expanded twice.
