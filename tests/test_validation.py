"""Property tests that check the algorithms are the real textbook algorithms.

They validate *behaviour*, not just final answers: heuristic admissibility and
consistency, the order in which nodes are expanded, and that every trace event
agrees with what the algorithm actually did.
"""

from __future__ import annotations

import heapq
import random
from collections import Counter, defaultdict

import pytest

from src.algorithms import ALGORITHM_REGISTRY
from src.algorithms.base import SearchBudget
from src.core.grid import GridConfig, build_problem
from src.core.problem import Cell, EventType, MovementMode, TerminationReason
from tests.conftest import GridSpec, make_problem, random_problem, reference_cost

BIG = SearchBudget(max_expanded_nodes=10**6, max_generated_nodes=10**6,
                   max_events=10**6, timeout_ms=120000)
ET = EventType
NODE_LESS = {ET.SEARCH_STARTED, ET.ITERATION_STARTED, ET.ITERATION_COMPLETED,
             ET.SEARCH_FAILED, ET.EXECUTION_LIMIT_REACHED}
TERMINAL = {TerminationReason.SUCCESS: ET.PATH_FOUND,
            TerminationReason.NO_PATH: ET.SEARCH_FAILED,
            TerminationReason.LIMIT_REACHED: ET.EXECUTION_LIMIT_REACHED}


def cell(text: str) -> Cell:
    row, col = text.strip("()").split(",")
    return Cell(int(row), int(col))


def options(aid, rng):
    return {"dls": {"limit": rng.randint(0, 12)},
            "iddfs": {"max_depth": rng.randint(0, 14)},
            "beam_search": {"beam_width": rng.randint(1, 4)},
            "hill_climbing": {"sideways_moves": rng.randint(0, 3)},
            }.get(aid, {})


def run(aid, problem, **kw):
    return ALGORITHM_REGISTRY[aid](problem, budget=BIG, **kw).run()


def reachable(problem):
    seen, stack = {problem.start}, [problem.start]
    while stack:
        for nxt, _ in problem.successors(stack.pop()):
            if nxt not in seen:
                seen.add(nxt)
                stack.append(nxt)
    return seen


def distance_to_goal(problem):
    universe = reachable(problem) | {problem.goal}
    reverse = defaultdict(list)
    for u in universe:
        for v, action in problem.successors(u):
            reverse[v].append((u, action.cost))
    dist, heap, tie = {problem.goal: 0.0}, [(0.0, 0, problem.goal)], 1
    while heap:
        d, _, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        for w, cost in reverse[u]:
            if d + cost < dist.get(w, float("inf")):
                dist[w] = d + cost
                heapq.heappush(heap, (d + cost, tie, w))
                tie += 1
    return dist, universe


# ---------------------------------------------------------------------------
# heuristic
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("seed", range(60))
def test_heuristic_is_admissible_and_consistent(seed):
    problem = random_problem(random.Random(seed), weighted=seed % 3 != 0)
    dist, universe = distance_to_goal(problem)
    for u in universe:
        assert problem.h(u) <= dist.get(u, float("inf")) + 1e-9, "inadmissible"
        for v, action in problem.successors(u):
            assert problem.h(u) <= action.cost + problem.h(v) + 1e-9, \
                "inconsistent"
    assert problem.h(problem.goal) == 0


# ---------------------------------------------------------------------------
# traces tell the truth
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("seed", range(60))
def test_every_trace_is_truthful(seed):
    rng = random.Random(500 + seed)
    problem = random_problem(rng, weighted=rng.random() < 0.6)
    for aid in ALGORITHM_REGISTRY:
        result = run(aid, problem, **options(aid, rng))
        events = result.events
        ctx = f"{aid} seed={seed}"

        assert [e.seq for e in events] == list(range(1, len(events) + 1)), ctx
        assert events[0].type == ET.SEARCH_STARTED, ctx
        assert events[-1].type == TERMINAL[result.termination_reason], (
            f"{ctx}: ends with {events[-1].type.value} "
            f"for {result.termination_reason.value}")
        assert (result.limit_reason is not None) == (
            result.termination_reason == TerminationReason.LIMIT_REACHED), ctx
        assert result.nodes_explored == sum(
            e.type == ET.NODE_EXPANDED for e in events), ctx
        assert result.max_frontier_size >= 1, ctx
        assert not result.trace_truncated, ctx

        seen, last_g = {problem.start}, {}
        for e in events:
            if e.type in NODE_LESS:
                continue
            node = cell(e.node)
            if e.type != ET.PATH_FOUND and e.h is not None:
                assert e.h == pytest.approx(problem.h(node)), ctx
            if e.type in (ET.NODE_DISCOVERED, ET.NODE_ADDED_TO_FRONTIER,
                          ET.CUTOFF, ET.NODE_PRUNED):
                seen.add(node)
            if e.type == ET.NODE_EXPANDED:
                assert node in seen, f"{ctx}: expanded {node} undiscovered"
                last_g[node] = e.g
            if e.type == ET.NODE_DISCOVERED and e.parent and e.g is not None:
                parent = cell(e.parent)
                costs = [a.cost for v, a in problem.successors(parent)
                         if v == node]
                assert costs, f"{ctx}: {node} is not a successor of {parent}"
                if parent in last_g:
                    assert last_g[parent] + costs[0] == pytest.approx(e.g), ctx

        if result.found:
            assert events[-1].metadata["path"] == [str(c) for c in result.path]


# ---------------------------------------------------------------------------
# the order in which each algorithm expands nodes defines it
# ---------------------------------------------------------------------------

def expansions(result):
    return [e for e in result.events if e.type == ET.NODE_EXPANDED]


@pytest.mark.parametrize("seed", range(40))
def test_expansion_order_matches_the_algorithm(seed):
    rng = random.Random(900 + seed)
    problem = random_problem(rng, weighted=seed % 2 == 0)
    optimum = reference_cost(problem)

    g = [e.g for e in expansions(run("ucs", problem))]
    assert all(b >= a - 1e-9 for a, b in zip(g, g[1:])), \
        "UCS must expand in non-decreasing g"

    depth = [e.depth for e in expansions(run("bfs", problem))]
    assert depth == sorted(depth), "BFS must expand level by level"

    if optimum is not None:
        astar = expansions(run("astar", problem))
        f = [e.f for e in astar]
        assert all(b >= a - 1e-9 for a, b in zip(f, f[1:])), \
            "A* with a consistent h expands in f order"
        assert max(f) <= optimum + 1e-9, "A* never expands f > C*"
        assert len(astar) <= len(expansions(run("ucs", problem))) + 1

    ida = run("ida_star", problem)
    for e in expansions(ida):
        assert e.f <= e.metadata["threshold"] + 1e-9


@pytest.mark.parametrize("width", [1, 2, 3, 5])
def test_beam_search_never_keeps_more_than_k_per_level(width):
    problem = random_problem(random.Random(width), weighted=True)
    result = run("beam_search", problem, beam_width=width)
    per_level = Counter(e.depth for e in result.events
                        if e.type == ET.NODE_ADDED_TO_FRONTIER)
    assert all(n <= width for n in per_level.values())


# ---------------------------------------------------------------------------
# DLS / IDDFS end like every other limit
# ---------------------------------------------------------------------------

def test_depth_cutoff_ends_with_the_limit_event():
    problem = make_problem(GridSpec(rows=3, cols=3, start=Cell(0, 0),
                                    goal=Cell(2, 2), obstacles=[]))
    dls = run("dls", problem, limit=1)
    assert dls.termination_reason == TerminationReason.LIMIT_REACHED
    assert dls.limit_reason == "depth_limit"
    assert dls.events[-1].type == ET.EXECUTION_LIMIT_REACHED
    assert dls.events[-1].metadata["limit"] == 1

    iddfs = run("iddfs", problem, max_depth=2)
    assert iddfs.limit_reason == "max_depth"
    assert iddfs.events[-1].type == ET.EXECUTION_LIMIT_REACHED


# ---------------------------------------------------------------------------
# budgets are exact
# ---------------------------------------------------------------------------

def open_grid(n=30):
    return build_problem(GridConfig(rows=n, cols=n), Cell(0, 0),
                         Cell(n - 1, n - 1))


@pytest.mark.parametrize("aid", ["bfs", "dfs", "ucs", "astar", "greedy",
                                 "ida_star", "rbfs", "iddfs", "beam_search"])
def test_generated_budget_is_exact(aid):
    budget = SearchBudget(max_generated_nodes=40, max_expanded_nodes=10**6,
                          max_events=10**6, timeout_ms=60000)
    kwargs = {"max_depth": 60} if aid == "iddfs" else {}
    result = ALGORITHM_REGISTRY[aid](open_grid(), budget=budget, **kwargs).run()
    assert result.termination_reason == TerminationReason.LIMIT_REACHED
    assert result.limit_reason == "max_generated_nodes"
    assert result.nodes_generated == 40


def test_timeout_budget_stops_a_long_search():
    budget = SearchBudget(timeout_ms=1, max_expanded_nodes=10**9,
                          max_generated_nodes=10**9, max_events=10**9)
    result = ALGORITHM_REGISTRY["iddfs"](open_grid(40), budget=budget,
                                         max_depth=500).run()
    assert result.limit_reason == "timeout"
    assert result.events[-1].type == ET.EXECUTION_LIMIT_REACHED


# ---------------------------------------------------------------------------
# frontier metrics are meaningful for every algorithm
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("aid", sorted(ALGORITHM_REGISTRY))
def test_max_frontier_is_reported_for_every_algorithm(aid):
    problem = make_problem(GridSpec(rows=6, cols=6, start=Cell(0, 0),
                                    goal=Cell(5, 5), obstacles=[Cell(2, 2)]))
    kwargs = {"limit": 30} if aid == "dls" else {}
    assert run(aid, problem, **kwargs).max_frontier_size >= 1


def test_start_with_no_moves_still_has_a_frontier_of_one():
    problem = make_problem(GridSpec(
        rows=3, cols=3, start=Cell(0, 0), goal=Cell(2, 2),
        obstacles=[Cell(0, 1), Cell(1, 0)]))
    for aid in ("bfs", "hill_climbing", "dfs"):
        assert run(aid, problem).max_frontier_size == 1, aid


def test_ida_star_memory_is_bounded_by_the_longest_path():
    # Textbook IDA* holds only the current path (here at most 2n-1 cells).
    assert run("ida_star", open_grid(25)).max_frontier_size <= 2 * 25 - 1


def test_rbfs_reports_the_nodes_it_actually_stores():
    # Each active frame keeps its node plus its child list: more than the path
    # alone, but still linear in depth rather than in the explored area.
    result = run("rbfs", open_grid(10))
    assert result.found
    assert result.max_frontier_size >= len(result.path)


# ---------------------------------------------------------------------------
# edge cases, for every algorithm
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("aid", sorted(ALGORITHM_REGISTRY))
def test_start_equals_goal(aid):
    problem = make_problem(GridSpec(rows=3, cols=3, start=Cell(1, 1),
                                    goal=Cell(1, 1), obstacles=[]))
    result = run(aid, problem, **({"limit": 0} if aid == "dls" else {}))
    assert result.found and result.path == [Cell(1, 1)]
    assert result.path_cost == 0 and result.nodes_explored == 0


@pytest.mark.parametrize("aid", sorted(ALGORITHM_REGISTRY))
def test_single_cell_and_enclosed_cases_do_not_crash(aid):
    kw = {"limit": 5} if aid == "dls" else {}
    boxed_start = make_problem(GridSpec(
        rows=3, cols=3, start=Cell(0, 0), goal=Cell(2, 2),
        obstacles=[Cell(0, 1), Cell(1, 0)]))
    boxed_goal = make_problem(GridSpec(
        rows=3, cols=3, start=Cell(0, 0), goal=Cell(2, 2),
        obstacles=[Cell(2, 1), Cell(1, 2)]))
    for problem in (boxed_start, boxed_goal):
        result = run(aid, problem, **kw)
        assert not result.found and result.path == []
        assert result.termination_reason != TerminationReason.SUCCESS


@pytest.mark.parametrize("aid", sorted(ALGORITHM_REGISTRY))
def test_long_thin_grids(aid):
    row = make_problem(GridSpec(rows=1, cols=40, start=Cell(0, 0),
                                goal=Cell(0, 39), obstacles=[]))
    kw = {"limit": 60} if aid == "dls" else {}
    result = run(aid, row, **kw)
    assert result.found and len(result.path) == 40


# ---------------------------------------------------------------------------
# corner policy: graze one wall corner, never squeeze between two
# ---------------------------------------------------------------------------

def moves(obstacles, corner_cutting):
    config = GridConfig(rows=2, cols=2, movement=MovementMode.EIGHT_WAY,
                        corner_cutting=corner_cutting, obstacles=obstacles)
    problem = build_problem(config, Cell(0, 0), Cell(1, 1))
    return {n for n, _ in problem.successors(Cell(0, 0))}


def test_corner_policy_matrix():
    one_wall = [Cell(0, 1)]
    two_walls = [Cell(0, 1), Cell(1, 0)]
    assert Cell(1, 1) in moves([], False)
    assert Cell(1, 1) not in moves(one_wall, False)   # no cutting at all
    assert Cell(1, 1) in moves(one_wall, True)        # may graze one corner
    assert Cell(1, 1) not in moves(two_walls, False)
    assert Cell(1, 1) not in moves(two_walls, True)   # never squeeze through


def test_successor_lists_are_independent_copies():
    problem = open_grid(5)
    first = problem.successors(Cell(2, 2))
    first.clear()
    assert len(problem.successors(Cell(2, 2))) == 4


# ---------------------------------------------------------------------------
# float noise must not look like a cheaper route
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("aid", ["ucs", "astar"])
def test_eight_way_search_never_expands_a_node_twice(aid):
    # Sums of sqrt(2) differ by ~1e-15 along equal-cost routes; comparing
    # costs without a tolerance used to reopen and re-expand such nodes.
    rng = random.Random(11)
    for _ in range(300):
        problem = random_problem(rng, weighted=False,
                                 movement=MovementMode.EIGHT_WAY)
        nodes = [e.node for e in expansions(run(aid, problem))]
        assert len(nodes) == len(set(nodes))


# ---------------------------------------------------------------------------
# documentation cannot drift away from what is tested
# ---------------------------------------------------------------------------

# The algorithms the differential tests (test_regressions.py) require to find a
# path whenever one exists, and to find an optimal one.
TESTED_COMPLETE = {"bfs", "dfs", "ucs", "astar", "greedy", "ida_star", "rbfs",
                   "iddfs"}
TESTED_OPTIMAL = {"ucs", "astar", "ida_star", "rbfs"}


def test_metadata_claims_match_the_guarantees_that_are_tested():
    from src.algorithms import ALGORITHM_METADATA

    assert set(ALGORITHM_METADATA) == set(ALGORITHM_REGISTRY)
    for aid, meta in ALGORITHM_METADATA.items():
        claims_complete = meta["complete"] not in ("no", "within limit")
        assert claims_complete == (aid in TESTED_COMPLETE), (
            f"{aid}: metadata says complete={meta['complete']!r}")
        claims_optimal = meta["optimal"].startswith("yes")
        assert claims_optimal == (aid in TESTED_OPTIMAL), (
            f"{aid}: metadata says optimal={meta['optimal']!r}")
