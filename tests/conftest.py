"""Shared fixtures and helpers for search algorithm tests."""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import pytest

import heapq
import random

from src.core.grid import GridConfig, GridEnvironment, build_problem
from src.core.problem import Cell, MovementMode, SearchProblem, TerrainType


@dataclass
class GridSpec:
    rows: int
    cols: int
    start: Cell
    goal: Cell
    obstacles: List[Cell]
    movement: MovementMode = MovementMode.FOUR_WAY
    corner_cutting: bool = False
    terrain: dict = None  # (row, col) -> TerrainType


def make_problem(spec: GridSpec) -> SearchProblem:
    config = GridConfig(
        rows=spec.rows,
        cols=spec.cols,
        movement=spec.movement,
        corner_cutting=spec.corner_cutting,
        terrain=spec.terrain or {},
    )
    env = GridEnvironment(config)
    for obs in spec.obstacles:
        env.add_obstacle(obs)

    def successors(state: Cell):
        return env.successors(state)

    def goal_test(state: Cell):
        return state == spec.goal

    if spec.movement == MovementMode.FOUR_WAY:
        heuristic = lambda s: env.manhattan_heuristic(s, spec.goal)  # noqa: E731
    else:
        heuristic = lambda s: env.octile_heuristic(s, spec.goal)  # noqa: E731

    return SearchProblem(
        start=spec.start,
        goal=spec.goal,
        successors=successors,
        goal_test=goal_test,
        heuristic=heuristic,
    )


def validate_path(problem: SearchProblem, path: List[Cell], start: Cell,
                  goal: Cell) -> float:
    """Validate a path and return its true cost; returns inf if invalid."""
    if not path:
        return float("inf")
    if path[0] != start or path[-1] != goal:
        return float("inf")
    total = 0.0
    for i in range(len(path) - 1):
        found = False
        for nxt, action in problem.successors(path[i]):
            if nxt == path[i + 1]:
                total += action.cost
                found = True
                break
        if not found:
            return float("inf")
    return total


def empty_budget():
    from src.algorithms.base import SearchBudget
    return SearchBudget(
        max_expanded_nodes=100000,
        max_generated_nodes=200000,
        max_events=200000,
        timeout_ms=60000,
    )


SIMPLE = GridSpec(
    rows=3, cols=3,
    start=Cell(0, 0), goal=Cell(2, 2),
    obstacles=[],
)

NO_PATH = GridSpec(
    rows=3, cols=3,
    start=Cell(0, 0), goal=Cell(2, 2),
    obstacles=[Cell(0, 1), Cell(1, 0), Cell(2, 1), Cell(1, 2)],
)

START_IS_GOAL = GridSpec(
    rows=3, cols=3,
    start=Cell(1, 1), goal=Cell(1, 1),
    obstacles=[],
)

WEIGHTED = GridSpec(
    rows=3, cols=3,
    start=Cell(0, 0), goal=Cell(2, 2),
    obstacles=[],
    terrain={(0, 1): TerrainType.HIGH_COST, (1, 1): TerrainType.HIGH_COST,
             (2, 1): TerrainType.HIGH_COST},
)

DIAGONAL = GridSpec(
    rows=3, cols=3,
    start=Cell(0, 0), goal=Cell(2, 2),
    obstacles=[],
    movement=MovementMode.EIGHT_WAY,
    corner_cutting=False,
)


@pytest.fixture(params=["bfs", "dfs", "ucs", "dls", "iddfs", "astar", "greedy",
                        "ida_star", "hill_climbing", "beam_search", "rbfs"])
def algorithm_id(request):
    return request.param


@pytest.fixture
def problem_simple():
    return make_problem(SIMPLE)


@pytest.fixture
def problem_no_path():
    return make_problem(NO_PATH)


@pytest.fixture
def problem_start_is_goal():
    return make_problem(START_IS_GOAL)


@pytest.fixture
def problem_weighted():
    return make_problem(WEIGHTED)


@pytest.fixture
def problem_diagonal():
    return make_problem(DIAGONAL)


@pytest.fixture
def budget():
    return empty_budget()


def reference_cost(problem: SearchProblem) -> Optional[float]:
    """Ground-truth shortest path cost via Dijkstra (None if unreachable)."""
    dist = {problem.start: 0.0}
    heap = [(0.0, 0, problem.start)]
    tie = 1
    while heap:
        d, _, u = heapq.heappop(heap)
        if d > dist[u]:
            continue
        if u == problem.goal:
            return d
        for v, action in problem.successors(u):
            nd = d + action.cost
            if nd < dist.get(v, float("inf")):
                dist[v] = nd
                heapq.heappush(heap, (nd, tie, v))
                tie += 1
    return None


def random_problem(rng: random.Random, weighted: bool = False,
                   movement: Optional[MovementMode] = None) -> SearchProblem:
    rows, cols = rng.randint(2, 9), rng.randint(2, 9)
    cells = [Cell(r, c) for r in range(rows) for c in range(cols)]
    start, goal = rng.sample(cells, 2)
    density = rng.choice([0.0, 0.15, 0.3])
    obstacles = [c for c in cells
                 if c not in (start, goal) and rng.random() < density]
    terrain = {}
    if weighted:
        for c in cells:
            roll = rng.random()
            if roll < 0.15:
                terrain[(c.row, c.col)] = TerrainType.DIFFICULT
            elif roll < 0.25:
                terrain[(c.row, c.col)] = TerrainType.HIGH_COST
    config = GridConfig(
        rows=rows, cols=cols,
        movement=movement or rng.choice(list(MovementMode)),
        corner_cutting=rng.random() < 0.3,
        terrain=terrain, obstacles=obstacles,
    )
    return build_problem(config, start, goal)
