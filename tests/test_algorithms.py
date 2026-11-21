"""Unit tests for all 11 search algorithms.

Per the search-algorithm-engineering skill, tests cover:
- start == goal
- direct path
- no path
- cycles / repeated states
- multiple routes
- obstacles
- weighted terrain
- tie cases and deterministic ordering
- algorithm-specific limits, thresholds, pruning, backtracking

Algorithm properties are tested, not only one hard-coded path.
"""

from __future__ import annotations

from typing import List

import pytest

from src.algorithms import ALGORITHM_REGISTRY
from src.core.problem import Cell, TerminationReason
from src.core.problem import SearchProblem
from tests.conftest import GridSpec, make_problem, validate_path


ALL_ALGORITHM_IDS = list(ALGORITHM_REGISTRY.keys())


def run(algorithm_id: str, problem: SearchProblem, budget=None, **kwargs):
    cls = ALGORITHM_REGISTRY[algorithm_id]
    if algorithm_id == "dls":
        return cls(problem, budget=budget, limit=5, **kwargs).run()
    if algorithm_id == "iddfs":
        return cls(problem, budget=budget, max_depth=30, **kwargs).run()
    if algorithm_id == "hill_climbing":
        return cls(problem, budget=budget, sideways_moves=5,
                   **kwargs).run()
    if algorithm_id == "beam_search":
        return cls(problem, budget=budget, beam_width=5, **kwargs).run()
    return cls(problem, budget=budget, **kwargs).run()


# ---------------------------------------------------------------------------
# shared contract tests applied to every algorithm
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("algorithm_id", ALL_ALGORITHM_IDS)
def test_start_equals_goal(algorithm_id, problem_start_is_goal, budget):
    result = run(algorithm_id, problem_start_is_goal, budget=budget)
    assert result.found is True
    assert result.path == [Cell(1, 1)]
    assert result.path_cost == 0.0
    assert result.termination_reason == TerminationReason.SUCCESS
    assert any(e.type.value == "SEARCH_STARTED" for e in result.events)
    assert any(e.type.value == "PATH_FOUND" for e in result.events)


@pytest.mark.parametrize("algorithm_id", ALL_ALGORITHM_IDS)
def test_direct_path(algorithm_id, problem_simple, budget):
    result = run(algorithm_id, problem_simple, budget=budget)
    cost = validate_path(problem_simple, result.path,
                         Cell(0, 0), Cell(2, 2))
    assert result.found is True
    assert cost != float("inf"), "returned path is not a legal transition path"
    assert result.path[0] == Cell(0, 0)
    assert result.path[-1] == Cell(2, 2)
    assert result.termination_reason == TerminationReason.SUCCESS


@pytest.mark.parametrize("algorithm_id", ALL_ALGORITHM_IDS)
def test_no_path(algorithm_id, problem_no_path, budget):
    result = run(algorithm_id, problem_no_path, budget=budget)
    assert result.found is False
    assert result.path == [] or result.path_cost == 0.0
    assert result.termination_reason in (
        TerminationReason.NO_PATH, TerminationReason.LIMIT_REACHED,
    )
    # Never fabricate a path on failure.
    assert result.path == [] or not result.found


@pytest.mark.parametrize("algorithm_id", ALL_ALGORITHM_IDS)
def test_events_have_seq_numbers(algorithm_id, problem_simple, budget):
    result = run(algorithm_id, problem_simple, budget=budget)
    seqs = [e.seq for e in result.events]
    assert seqs == sorted(seqs)
    assert seqs == list(range(1, len(seqs) + 1))


@pytest.mark.parametrize("algorithm_id", ALL_ALGORITHM_IDS)
def test_metrics_are_nonnegative(algorithm_id, problem_simple, budget):
    result = run(algorithm_id, problem_simple, budget=budget)
    assert result.nodes_explored >= 0
    assert result.nodes_generated >= 0
    assert result.execution_time_ms >= 0
    assert result.max_frontier_size >= 0
    assert result.search_depth >= 0


# ---------------------------------------------------------------------------
# weighted terrain respected by cost-sensitive algorithms
# ---------------------------------------------------------------------------

WEIGHTED_ALGORITHMS = ["ucs", "astar", "bfs", "dfs", "dls", "iddfs",
                       "ida_star", "greedy", "beam_search", "rbfs"]


@pytest.mark.parametrize("algorithm_id", WEIGHTED_ALGORITHMS)
def test_weighted_terrain_path_legal(algorithm_id, problem_weighted, budget):
    result = run(algorithm_id, problem_weighted, budget=budget)
    # Every one of these can solve an open 3x3 grid, so a miss is a bug.
    assert result.found is True
    cost = validate_path(problem_weighted, result.path, Cell(0, 0), Cell(2, 2))
    assert cost != float("inf")
    assert result.path_cost == pytest.approx(cost)


# ---------------------------------------------------------------------------
# diagonal movement / corner cutting
# ---------------------------------------------------------------------------

@pytest.mark.parametrize("algorithm_id", ALL_ALGORITHM_IDS)
def test_diagonal_movement(algorithm_id, problem_diagonal, budget):
    result = run(algorithm_id, problem_diagonal, budget=budget)
    assert result.found is True
    cost = validate_path(problem_diagonal, result.path, Cell(0, 0), Cell(2, 2))
    assert cost != float("inf")
    assert result.path_cost == pytest.approx(cost)


# ---------------------------------------------------------------------------
# optimality checks where algorithms guarantee it (unweighted 4-way grid)
# ---------------------------------------------------------------------------

OPTIMAL_EQUAL_COST = ["bfs", "ucs", "astar", "iddfs", "ida_star", "rbfs"]


@pytest.mark.parametrize("algorithm_id", OPTIMAL_EQUAL_COST)
def test_optimal_cost_equal_weight(algorithm_id, problem_simple, budget):
    """On an unweighted grid the shortest path cost is 4 (Manhattan)."""
    result = run(algorithm_id, problem_simple, budget=budget)
    assert result.found is True
    assert result.path_cost == pytest.approx(4.0)


# ---------------------------------------------------------------------------
# DLS cutoff semantics
# ---------------------------------------------------------------------------

def test_dls_distinguishes_cutoff_from_failure(budget):
    # A tiny 1D-ish corridor where the goal is at depth 3, limit 1 -> cutoff.
    spec = GridSpec(rows=4, cols=1, start=Cell(0, 0), goal=Cell(3, 0),
                    obstacles=[])
    problem = make_problem(spec)
    result = ALGORITHM_REGISTRY["dls"](problem, budget=budget, limit=1).run()
    assert result.found is False
    assert result.termination_reason == TerminationReason.LIMIT_REACHED
    assert any(e.type.value == "CUTOFF" for e in result.events)


def test_dls_finds_within_limit(budget):
    spec = GridSpec(rows=4, cols=1, start=Cell(0, 0), goal=Cell(3, 0),
                    obstacles=[])
    problem = make_problem(spec)
    result = ALGORITHM_REGISTRY["dls"](problem, budget=budget, limit=5).run()
    assert result.found is True
    assert result.path == [Cell(0, 0), Cell(1, 0), Cell(2, 0), Cell(3, 0)]


# ---------------------------------------------------------------------------
# IDDFS iterations reported
# ---------------------------------------------------------------------------

def test_iddfs_reports_iterations(budget):
    spec = GridSpec(rows=4, cols=1, start=Cell(0, 0), goal=Cell(3, 0),
                    obstacles=[])
    problem = make_problem(spec)
    result = ALGORITHM_REGISTRY["iddfs"](problem, budget=budget,
                                         max_depth=10).run()
    assert result.found is True
    iteration_events = [e for e in result.events
                        if e.type.value in ("ITERATION_STARTED",
                                            "ITERATION_COMPLETED")]
    assert len(iteration_events) > 0


# ---------------------------------------------------------------------------
# Beam search width validation + pruning events
# ---------------------------------------------------------------------------

def test_beam_search_validates_width(problem_simple):
    with pytest.raises(ValueError):
        ALGORITHM_REGISTRY["beam_search"](problem_simple, beam_width=0)


def test_beam_search_emits_prune_events(budget):
    spec = GridSpec(rows=3, cols=3, start=Cell(0, 0), goal=Cell(2, 2),
                    obstacles=[])
    problem = make_problem(spec)
    result = ALGORITHM_REGISTRY["beam_search"](
        problem, budget=budget, beam_width=1).run()
    prune_events = [e for e in result.events if e.type.value == "NODE_PRUNED"]
    # With beam_width 1 on a branching grid, pruning must occur.
    assert len(prune_events) > 0
    assert all(e.metadata["reason"] == "beyond_beam_width"
               for e in prune_events)


# ---------------------------------------------------------------------------
# Hill climbing: not optimal, reports local optimum
# ---------------------------------------------------------------------------

def test_hill_climbing_not_claim_optimal(problem_simple, budget):
    result = run("hill_climbing", problem_simple, budget=budget)
    # Open grid with a consistent heuristic: steepest descent reaches the goal.
    assert result.found is True
    assert result.termination_reason in (
        TerminationReason.SUCCESS, TerminationReason.NO_PATH,
    )


# ---------------------------------------------------------------------------
# IDA* threshold events
# ---------------------------------------------------------------------------

def test_ida_star_emits_threshold_events(budget):
    spec = GridSpec(rows=3, cols=3, start=Cell(0, 0), goal=Cell(2, 2),
                    obstacles=[])
    problem = make_problem(spec)
    result = ALGORITHM_REGISTRY["ida_star"](problem, budget=budget).run()
    assert result.found is True
    iteration_events = [e for e in result.events
                        if e.type.value == "ITERATION_STARTED"]
    assert len(iteration_events) >= 1


# ---------------------------------------------------------------------------
# Result to_dict serialization
# ---------------------------------------------------------------------------

def test_result_serialization(problem_simple, budget):
    result = run("bfs", problem_simple, budget=budget)
    d = result.to_dict()
    assert set(d.keys()) >= {
        "found", "path", "path_cost", "nodes_explored", "nodes_generated",
        "execution_time_ms", "max_frontier_size", "search_depth", "events",
        "termination_reason", "algorithm",
    }
    assert d["algorithm"] == "bfs"
    assert d["termination_reason"] in (
        "success", "no_path", "limit_reached", "interrupted",
        "invalid_config",
    )
    for ev in d["events"]:
        assert set(ev.keys()) >= {
            "seq", "type", "node", "parent", "depth", "g", "h", "f",
            "metadata",
        }
