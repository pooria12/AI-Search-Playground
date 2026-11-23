"""Regression and property tests for bugs found during the audit.

Each test documents a concrete failure of the previous implementation.
"""

from __future__ import annotations

import random

import pytest

from src.algorithms import ALGORITHM_REGISTRY
from src.algorithms.base import SearchBudget
from src.core.grid import GridConfig, build_problem
from src.core.problem import Cell, EventType, MovementMode, TerminationReason
from tests.conftest import (
    GridSpec, make_problem, random_problem, reference_cost, validate_path,
)

BIG = SearchBudget(max_expanded_nodes=200000, max_generated_nodes=400000,
                   max_events=400000, timeout_ms=60000)


def run(aid, problem, budget=BIG, **kw):
    return ALGORITHM_REGISTRY[aid](problem, budget=budget, **kw).run()


def etypes(result, name):
    return [e for e in result.events if e.type.value == name]


# ---------------------------------------------------------------------------
# differential testing against Dijkstra
# ---------------------------------------------------------------------------

COMPLETE = ["bfs", "dfs", "ucs", "astar", "greedy", "ida_star", "rbfs",
            "iddfs"]
OPTIMAL = ["ucs", "astar", "ida_star", "rbfs"]


@pytest.mark.parametrize("seed", range(40))
def test_complete_algorithms_agree_with_reference(seed):
    rng = random.Random(seed)
    problem = random_problem(rng, weighted=rng.random() < 0.6)
    truth = reference_cost(problem)
    for aid in COMPLETE:
        kwargs = {"max_depth": 200} if aid == "iddfs" else {}
        result = run(aid, problem, **kwargs)
        assert result.termination_reason != TerminationReason.LIMIT_REACHED
        if truth is None:
            assert not result.found, f"{aid} found a path that cannot exist"
            assert result.path == []
            continue
        assert result.found, f"{aid} missed a reachable goal (seed {seed})"
        cost = validate_path(problem, result.path, problem.start, problem.goal)
        assert cost == pytest.approx(result.path_cost), aid
        if aid in OPTIMAL:
            assert result.path_cost == pytest.approx(truth), aid


@pytest.mark.parametrize("seed", range(40))
def test_bfs_and_iddfs_optimal_in_steps_on_unit_grids(seed):
    rng = random.Random(1000 + seed)
    for _ in range(100):  # draw until the goal is reachable
        problem = random_problem(rng, weighted=False,
                                 movement=MovementMode.FOUR_WAY)
        truth = reference_cost(problem)
        if truth is not None:
            break
    else:
        pytest.fail("no solvable problem generated")
    assert run("bfs", problem).path_cost == pytest.approx(truth)
    assert run("iddfs", problem, max_depth=200).path_cost == pytest.approx(truth)


# ---------------------------------------------------------------------------
# IDA*: threshold must advance to the minimum exceeded f-value
# ---------------------------------------------------------------------------

def test_ida_star_raises_threshold_when_heuristic_is_not_exact():
    # A wall forces a detour, so the first threshold (h(start)) is too small.
    spec = GridSpec(rows=5, cols=5, start=Cell(0, 0), goal=Cell(0, 4),
                    obstacles=[Cell(0, 2), Cell(1, 2), Cell(2, 2)])
    problem = make_problem(spec)
    result = run("ida_star", problem)
    assert result.found
    assert result.path_cost == pytest.approx(reference_cost(problem))
    thresholds = [e.metadata["threshold"]
                  for e in etypes(result, "ITERATION_STARTED")]
    assert thresholds == sorted(set(thresholds)) and len(thresholds) > 1


def test_ida_star_counts_only_expanded_nodes_and_reports_pruning():
    problem = make_problem(GridSpec(rows=4, cols=4, start=Cell(0, 0),
                                    goal=Cell(3, 3), obstacles=[Cell(1, 1)]))
    result = run("ida_star", problem)
    assert result.nodes_explored == len(etypes(result, "NODE_EXPANDED"))
    assert etypes(result, "NODE_PRUNED")


# ---------------------------------------------------------------------------
# depth-first family
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("aid", ["dfs", "dls"])
def test_dfs_family_expands_each_node_once(aid):
    problem = make_problem(GridSpec(rows=6, cols=6, start=Cell(0, 0),
                                    goal=Cell(5, 5), obstacles=[]))
    kw = {"limit": 40} if aid == "dls" else {}
    result = run(aid, problem, **kw)
    expanded = [e.node for e in etypes(result, "NODE_EXPANDED")]
    assert len(expanded) == len(set(expanded))
    assert result.nodes_explored == len(expanded) <= 36


def test_dls_finds_goal_that_exists_within_limit():
    # Open grid, goal 4 steps away, limit exactly 4: a plain visited set can
    # reach (2,2) first at depth 6 and then wrongly refuse the 4-step route.
    problem = make_problem(GridSpec(rows=3, cols=3, start=Cell(0, 0),
                                    goal=Cell(2, 2), obstacles=[]))
    result = run("dls", problem, limit=4)
    assert result.found and len(result.path) == 5


def test_dls_limit_zero_reports_cutoff_not_failure():
    problem = make_problem(GridSpec(rows=3, cols=3, start=Cell(0, 0),
                                    goal=Cell(2, 2), obstacles=[]))
    result = run("dls", problem, limit=0)
    assert not result.found
    assert result.termination_reason == TerminationReason.LIMIT_REACHED
    assert result.limit_reason == "depth_limit"
    assert etypes(result, "CUTOFF")


def test_dls_exhausted_space_is_failure_not_cutoff():
    # Goal walled off; the limit is generous, so this is genuine failure.
    problem = make_problem(GridSpec(
        rows=3, cols=3, start=Cell(0, 0), goal=Cell(2, 2),
        obstacles=[Cell(0, 1), Cell(1, 0), Cell(2, 1), Cell(1, 2)]))
    result = run("dls", problem, limit=20)
    assert result.termination_reason == TerminationReason.NO_PATH


def test_iddfs_stops_early_when_space_is_exhausted():
    problem = make_problem(GridSpec(
        rows=3, cols=3, start=Cell(0, 0), goal=Cell(2, 2),
        obstacles=[Cell(0, 1), Cell(1, 0), Cell(2, 1), Cell(1, 2)]))
    result = run("iddfs", problem, max_depth=100)
    assert result.termination_reason == TerminationReason.NO_PATH
    assert len(etypes(result, "ITERATION_STARTED")) <= 3


def test_iddfs_emits_path_found_once():
    problem = make_problem(GridSpec(rows=4, cols=1, start=Cell(0, 0),
                                    goal=Cell(3, 0), obstacles=[]))
    assert len(etypes(run("iddfs", problem, max_depth=10), "PATH_FOUND")) == 1


# ---------------------------------------------------------------------------
# budgets and limit reporting
# ---------------------------------------------------------------------------

def open_grid(rows=30, cols=30):
    return build_problem(GridConfig(rows=rows, cols=cols), Cell(0, 0),
                         Cell(rows - 1, cols - 1))


@pytest.mark.parametrize("aid", ["bfs", "dfs", "ucs", "astar", "iddfs"])
def test_expanded_node_budget_is_enforced(aid):
    budget = SearchBudget(max_expanded_nodes=25, max_generated_nodes=10**6,
                          max_events=10**6, timeout_ms=60000)
    kw = {"max_depth": 100} if aid == "iddfs" else {}
    result = run(aid, open_grid(), budget=budget, **kw)
    assert result.termination_reason == TerminationReason.LIMIT_REACHED
    assert result.limit_reason == "max_expanded_nodes"
    assert result.nodes_explored == 25  # a budget of N allows exactly N
    assert etypes(result, "EXECUTION_LIMIT_REACHED")


def test_event_cap_truncates_the_trace_but_not_the_search():
    budget = SearchBudget(max_events=50, max_expanded_nodes=10**6,
                          max_generated_nodes=10**6, timeout_ms=60000)
    result = run("bfs", open_grid(), budget=budget)
    assert result.found and result.limit_reason is None
    assert result.termination_reason == TerminationReason.SUCCESS
    assert result.trace_truncated is True
    # 50 recorded events plus the concluding PATH_FOUND.
    assert len(result.events) == 51
    assert result.events[-1].type == EventType.PATH_FOUND
    seqs = [e.seq for e in result.events]
    assert seqs == list(range(1, len(seqs) + 1))


@pytest.mark.parametrize("aid", ["bfs", "dfs", "ucs", "astar", "greedy",
                                 "ida_star", "rbfs", "beam_search",
                                 "hill_climbing"])
def test_event_cap_never_changes_the_outcome(aid):
    rng = random.Random(3)
    from tests.conftest import random_problem
    problem = random_problem(rng, weighted=True)
    full = run(aid, problem)
    capped = run(aid, problem, budget=SearchBudget(max_events=5))
    assert capped.trace_truncated or len(full.events) <= 5 + 1
    for field in ("found", "path", "path_cost", "nodes_explored",
                  "nodes_generated", "termination_reason", "limit_reason"):
        assert getattr(capped, field) == getattr(full, field), field


def test_an_untruncated_trace_is_not_flagged():
    problem = make_problem(GridSpec(rows=3, cols=3, start=Cell(0, 0),
                                    goal=Cell(2, 2), obstacles=[]))
    assert run("bfs", problem).trace_truncated is False


def test_unexpected_exceptions_are_not_swallowed():
    problem = make_problem(GridSpec(rows=3, cols=3, start=Cell(0, 0),
                                    goal=Cell(2, 2), obstacles=[]))

    def boom(_cell):
        raise KeyError("bug")

    problem.successors = boom
    with pytest.raises(KeyError):
        run("bfs", problem)


# ---------------------------------------------------------------------------
# recursion depth
# ---------------------------------------------------------------------------

def serpentine():
    """41x60 maze whose only route snakes back and forth: 1,280 cells."""
    rows, cols = 41, 60
    obstacles = []
    for r in range(1, rows, 2):
        gap = cols - 1 if (r // 2) % 2 == 0 else 0
        obstacles += [Cell(r, c) for c in range(cols) if c != gap]
    config = GridConfig(rows=rows, cols=cols, obstacles=obstacles)
    return build_problem(config, Cell(0, 0), Cell(rows - 1, cols - 1))


@pytest.mark.parametrize("aid", ["rbfs", "ida_star"])
def test_recursive_algorithms_handle_long_paths(aid):
    # 1,280 steps is deeper than Python's default recursion limit (1000).
    result = run(aid, serpentine())
    if aid == "ida_star":
        # Iterative deepening on a corridor re-walks it each pass; hitting the
        # budget is legitimate, a crash or a mislabelled result is not.
        assert result.found or result.limit_reason in (
            "max_events", "max_expanded_nodes", "max_generated_nodes")
    else:
        assert result.found and len(result.path) == 1280


def test_recursion_limit_is_restored_after_run():
    import sys
    before = sys.getrecursionlimit()
    run("rbfs", make_problem(GridSpec(rows=1, cols=50, start=Cell(0, 0),
                                      goal=Cell(0, 49), obstacles=[])))
    assert sys.getrecursionlimit() == before


# ---------------------------------------------------------------------------
# RBFS: dead ends are not reconsidered
# ---------------------------------------------------------------------------

def test_rbfs_terminates_with_no_path_on_enclosed_goal():
    problem = make_problem(GridSpec(
        rows=4, cols=4, start=Cell(0, 0), goal=Cell(3, 3),
        obstacles=[Cell(2, 3), Cell(3, 2), Cell(2, 2)]))
    result = run("rbfs", problem)
    assert result.termination_reason == TerminationReason.NO_PATH


# ---------------------------------------------------------------------------
# beam search
# ---------------------------------------------------------------------------

def test_beam_search_ranks_by_heuristic_so_width_one_reaches_open_goal():
    result = run("beam_search", open_grid(20, 20), beam_width=1)
    assert result.found and result.path_cost == pytest.approx(38.0)


def test_beam_search_never_retains_duplicates_or_exceeds_width():
    result = run("beam_search", open_grid(15, 15), beam_width=4)
    retained_by_level = {}
    for e in etypes(result, "NODE_ADDED_TO_FRONTIER"):
        retained_by_level.setdefault(e.depth, []).append(e.node)
    for nodes in retained_by_level.values():
        assert len(nodes) <= 4 and len(nodes) == len(set(nodes))


def test_beam_search_can_lose_the_only_route():
    # The heuristic pulls a width-1 beam into a dead-end pocket.
    spec = GridSpec(rows=5, cols=5, start=Cell(2, 0), goal=Cell(2, 4),
                    obstacles=[Cell(1, 2), Cell(3, 2), Cell(2, 2),
                               Cell(0, 2), Cell(4, 2)])
    assert reference_cost(make_problem(spec)) is None  # truly unreachable
    assert not run("beam_search", make_problem(spec), beam_width=1).found


# ---------------------------------------------------------------------------
# hill climbing
# ---------------------------------------------------------------------------

def u_trap():
    """Goal behind a wall: steepest descent gets stuck against the wall."""
    return make_problem(GridSpec(
        rows=5, cols=5, start=Cell(2, 0), goal=Cell(2, 4),
        obstacles=[Cell(1, 2), Cell(2, 2), Cell(3, 2)]))


def test_hill_climbing_local_optimum_has_no_path_but_reports_trace():
    problem = u_trap()
    assert reference_cost(problem) is not None  # a route exists
    result = run("hill_climbing", problem)
    assert result.found is False and result.path == []
    assert result.termination_reason == TerminationReason.NO_PATH
    failure = etypes(result, "SEARCH_FAILED")[0]
    assert failure.metadata["reason"] in ("local_optimum", "plateau")
    assert failure.metadata["path"][0] == "(2,0)"


def test_hill_climbing_events_have_correct_parent():
    result = run("hill_climbing", make_problem(GridSpec(
        rows=3, cols=3, start=Cell(0, 0), goal=Cell(2, 2), obstacles=[])))
    for e in etypes(result, "NODE_ADDED_TO_FRONTIER"):
        assert e.parent is not None and e.parent != e.node


def test_hill_climbing_sideways_never_revisits_plateau_cells():
    result = run("hill_climbing", u_trap(), sideways_moves=50)
    path = [e.node for e in etypes(result, "NODE_EXPANDED")]
    assert len(path) == len(set(path))


def test_hill_climbing_has_no_restart_option():
    with pytest.raises(TypeError):
        ALGORITHM_REGISTRY["hill_climbing"](u_trap(), max_restarts=3)


# ---------------------------------------------------------------------------
# A* / Greedy specifics
# ---------------------------------------------------------------------------

def test_astar_explores_far_fewer_nodes_than_ucs_on_open_grid():
    grid = open_grid(30, 30)
    assert run("astar", grid).nodes_explored < run("ucs", grid).nodes_explored / 4


def test_greedy_does_not_reopen_expanded_nodes():
    result = run("greedy", open_grid(12, 12))
    expanded = [e.node for e in etypes(result, "NODE_EXPANDED")]
    assert len(expanded) == len(set(expanded))


def test_ida_star_solves_a_detour_on_an_open_grid_within_default_budget():
    # Without the per-iteration transposition table this exhausted the event
    # budget: equal-cost routes across open ground are combinatorial.
    obstacles = [Cell(r, 9) for r in range(2, 13)]
    problem = make_problem(GridSpec(rows=15, cols=20, start=Cell(7, 2),
                                    goal=Cell(7, 17), obstacles=obstacles))
    result = run("ida_star", problem, budget=SearchBudget())
    assert result.found
    assert result.path_cost == pytest.approx(reference_cost(problem))
    assert result.nodes_explored < 10000
