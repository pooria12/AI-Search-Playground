"""Shared maze + replay helpers for the README art (real algorithm output)."""

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "backend"))

from src.algorithms import ALGORITHM_REGISTRY  # noqa: E402
from src.algorithms.base import SearchBudget  # noqa: E402
from src.core.grid import GridConfig, build_problem  # noqa: E402
from src.core.problem import Cell, EventType, TerrainType  # noqa: E402

# '#' wall, '~' difficult terrain (cost 2), 'S' start, 'G' goal.
# A wall with a pocket facing the goal: greedy and hill climbing are drawn
# into the pocket, BFS floods the whole map, A* goes around efficiently.
MAZE = [
    "..............................",
    "..............#...............",
    "..............#...............",
    "..............#.....#######...",
    "..............#.....#.....#...",
    "..............#.....#.....#...",
    "..S...........#.....#..G..#...",
    "..............#.....#.....#...",
    "..............#.....#.....#...",
    "..............#.....#.....#...",
    "..............#.....##.####...",
    "..............#...............",
    "...~~~........#...............",
    "...~~~........#...............",
    "..............................",
]

BUDGET = SearchBudget(max_expanded_nodes=10**6, max_generated_nodes=10**6,
                      max_events=10**6, timeout_ms=60000)


def build():
    rows, cols = len(MAZE), len(MAZE[0])
    obstacles, terrain = [], {}
    start = goal = None
    for r, line in enumerate(MAZE):
        for c, ch in enumerate(line):
            if ch == "#":
                obstacles.append(Cell(r, c))
            elif ch == "~":
                terrain[(r, c)] = TerrainType.DIFFICULT
            elif ch == "S":
                start = Cell(r, c)
            elif ch == "G":
                goal = Cell(r, c)
    cfg = GridConfig(rows=rows, cols=cols, obstacles=obstacles, terrain=terrain)
    return cfg, build_problem(cfg, start, goal)


def run(algorithm, problem, **kwargs):
    return ALGORITHM_REGISTRY[algorithm](problem, budget=BUDGET, **kwargs).run()


def parse(node: str):
    r, c = node.strip("()").split(",")
    return int(r), int(c)


def replay(result):
    """Per-cell first-discovered / first-expanded event index and the path set."""
    seen, expanded = {}, {}
    n = len(result.events)
    for i, e in enumerate(result.events):
        if e.type in (EventType.NODE_DISCOVERED, EventType.NODE_ADDED_TO_FRONTIER):
            seen.setdefault(parse(e.node), i)
        elif e.type == EventType.NODE_EXPANDED:
            expanded.setdefault(parse(e.node), i)
            seen.setdefault(parse(e.node), i)
    path = [(c.row, c.col) for c in result.path]
    return seen, expanded, path, n
