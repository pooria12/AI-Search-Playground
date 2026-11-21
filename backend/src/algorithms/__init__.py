"""Search algorithm package.

Exports every algorithm class and a registry mapping algorithm ids to
implementations, so the API layer can instantiate algorithms generically.
"""

from .astar import Astar
from .beam_search import BeamSearch
from .bfs import BFS
from .dfs import DFS
from .dls import DLS
from .greedy import GreedyBestFirst
from .hill_climbing import HillClimbing
from .ida_star import IDAStar
from .iddfs import IDDFS
from .rbfs import RBFS
from .ucs import UCS

ALGORITHM_REGISTRY: dict[str, type] = {
    "bfs": BFS,
    "dfs": DFS,
    "ucs": UCS,
    "dls": DLS,
    "iddfs": IDDFS,
    "astar": Astar,
    "greedy": GreedyBestFirst,
    "ida_star": IDAStar,
    "hill_climbing": HillClimbing,
    "beam_search": BeamSearch,
    "rbfs": RBFS,
}

ALGORITHM_METADATA: dict[str, dict] = {
    "bfs": {
        "name": "Breadth-First Search",
        "abbreviation": "BFS",
        "description": "Level-by-level exploration using a FIFO queue. Optimal for equal step costs.",
        "data_structure": "FIFO queue",
        "optimal": "equal-cost only",
        "complete": "finite branching",
    },
    "dfs": {
        "name": "Depth-First Search",
        "abbreviation": "DFS",
        "description": "Depth-first expansion using an explicit LIFO stack and a visited set. Not optimal.",
        "data_structure": "LIFO stack",
        "optimal": "no",
        "complete": "finite graphs (visited set)",
    },
    "ucs": {
        "name": "Uniform Cost Search",
        "abbreviation": "UCS",
        "description": "Priority queue ordered by cumulative path cost g(n). Optimal with nonnegative costs.",
        "data_structure": "min-priority queue (by g)",
        "optimal": "yes (nonnegative costs)",
        "complete": "yes (finite branching)",
    },
    "dls": {
        "name": "Depth-Limited Search",
        "abbreviation": "DLS",
        "description": "DFS bounded by a depth limit. Distinguishes cutoff from failure; re-expands a state reached at a shallower depth.",
        "data_structure": "LIFO stack",
        "optimal": "no",
        "complete": "within limit",
    },
    "iddfs": {
        "name": "Iterative Deepening DFS",
        "abbreviation": "IDDFS",
        "description": "Repeated DLS with increasing depth limits. Complete and optimal for equal costs.",
        "data_structure": "LIFO stack (per iteration)",
        "optimal": "equal-cost only",
        "complete": "finite branching",
    },
    "astar": {
        "name": "A* Search",
        "abbreviation": "A*",
        "description": "Priority queue ordered by f(n) = g(n) + h(n). Heuristic-guided and optimal with an admissible heuristic.",
        "data_structure": "min-priority queue (by f)",
        "optimal": "yes (admissible heuristic)",
        "complete": "yes (finite branching)",
    },
    "greedy": {
        "name": "Greedy Best-First Search",
        "abbreviation": "GBFS",
        "description": "Prioritizes by h(n) only, with an expanded set. Fast but not optimal.",
        "data_structure": "min-priority queue (by h)",
        "optimal": "no",
        "complete": "finite graphs (closed set)",
    },
    "ida_star": {
        "name": "Iterative Deepening A*",
        "abbreviation": "IDA*",
        "description": "Depth-first iterations bounded by f = g + h threshold; next threshold is the minimum exceeded f-value.",
        "data_structure": "recursion stack",
        "optimal": "yes (admissible heuristic)",
        "complete": "yes (finite branching)",
    },
    "hill_climbing": {
        "name": "Hill Climbing",
        "abbreviation": "HC",
        "description": "Moves to the best neighbor by heuristic. Reports local optima and plateaus; optional sideways moves. Not complete or optimal.",
        "data_structure": "current state + neighbor list",
        "optimal": "no",
        "complete": "no",
    },
    "beam_search": {
        "name": "Beam Search",
        "abbreviation": "BS",
        "description": "Retains only the best k candidates per level. Pruning can discard the only solution.",
        "data_structure": "beam of k candidates",
        "optimal": "no",
        "complete": "no",
    },
    "rbfs": {
        "name": "Recursive Best-First Search",
        "abbreviation": "RBFS",
        "description": "Recursive best-first search with backed-up f-values and an explicit f-limit. Linear space.",
        "data_structure": "recursion stack",
        "optimal": "yes (admissible heuristic)",
        "complete": "yes (finite branching)",
    },
}

__all__ = [
    "BFS", "DFS", "UCS", "DLS", "IDDFS", "Astar", "GreedyBestFirst",
    "IDAStar", "HillClimbing", "BeamSearch", "RBFS",
    "ALGORITHM_REGISTRY", "ALGORITHM_METADATA",
]
