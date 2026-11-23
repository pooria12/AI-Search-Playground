# Run report

Every search result comes with a report that explains what the algorithm did.
It is derived only from the recorded event trace and the server's own counters
(`frontend/src/lib/report/`), never from canned text about a typical run.

## Two views

**Live** (`live.ts`, `narrate.ts`): one plain-English sentence per step, written
for the selected algorithm (for example "lowest f = g + h = 8 + 13 = 21" for A\*,
"top of the stack" for DFS, "f_limit" for RBFS), plus cumulative counters:
expanded so far, discovered, on the frontier now, backtracks, pruned or cutoff.
Counters come from prefix sums built once per run, so a frame costs O(1).

**Summary** (`summary.ts`, `analyze.ts`, `path.ts`): opens automatically when the
animation reaches the end. Sections:

| Section | Content |
|---|---|
| Outcome / Why it ended this way | Headline, route cost against the straight-line lower bound, share of expansions on the final route; for failures the reason (see below) |
| How the algorithm works | The strategy in this implementation, the run's settings (beam width, depth limit, ...) and movement rules |
| How the path was found | How the path is recovered, the route as run-length arrows (`→×11 ↓×8 ...`), straight/diagonal moves, turns, and the cost split into plain moves and terrain extra |
| Search effort | Expanded, generated, peak frontier (labelled per algorithm), depth, distinct cells, repeated expansions, cheaper routes, time |
| Deepening passes / Threshold passes / Beam levels | One row per IDDFS pass, IDA\* pass or beam level |
| Notable moments | When the goal first appeared, the largest f A\* expanded, backtracks, prunes, cutoffs |
| What this algorithm guarantees | Optimal / complete, and why |

The summary can be copied as Markdown or downloaded as `.md`.

## Failures are explained

| Outcome | What the report says |
|---|---|
| `no_path` (BFS, UCS, A\*, ...) | Every reachable cell was expanded, so with these walls the goal is unreachable |
| IDDFS `no_path` | A full pass ended with nothing beyond its limit, so deeper limits cannot help |
| Hill climbing | Where it stopped, the route it climbed, local optimum vs plateau, and that this does not prove the goal is unreachable |
| Beam search | The beam emptied; incomplete, a wider beam may find a route |
| `limit_reached` / `depth_limit` | A cutoff, not proof of no path; raise the limit |
| `limit_reached` / budgets | The budget ran out; says nothing about whether a path exists |
| `trace_truncated` | The trace was cut at N events; totals still come from the search's own counters |

## Testing

`frontend/src/lib/report/report.test.ts` runs against `__fixtures__/runs.json`,
which holds real `/api/search/execute` responses for every algorithm and for
the non-success outcomes (regenerate with `python scripts/make_report_fixtures.py`).
Among other checks, the cost the frontend rebuilds from the returned path
(plain moves plus terrain extra) must equal the server's `path_cost` exactly.
The end-to-end UI test checks that the summary agrees with the Stats panel.
