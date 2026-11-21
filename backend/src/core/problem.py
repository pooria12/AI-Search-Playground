"""Shared search problem model and grid environment.

Defines the canonical interfaces that every algorithm implements against:
- State representation and stable hashing/equality
- Successor generation (action + transition cost)
- Goal testing
- Heuristic functions

The grid environment models 4-way and 8-way movement with normal, difficult,
and high-cost terrain, plus an explicit corner-cutting policy.
"""

from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, List, Optional, Protocol, Tuple


class MovementMode(Enum):
    FOUR_WAY = "four_way"
    EIGHT_WAY = "eight_way"


class TerrainType(Enum):
    NORMAL = "normal"        # cost 1
    DIFFICULT = "difficult"  # cost 2
    HIGH_COST = "high_cost"  # cost 5


TERRAIN_COST: Dict[TerrainType, float] = {
    TerrainType.NORMAL: 1.0,
    TerrainType.DIFFICULT: 2.0,
    TerrainType.HIGH_COST: 5.0,
}


class TerminationReason(Enum):
    SUCCESS = "success"
    NO_PATH = "no_path"
    LIMIT_REACHED = "limit_reached"


class EventType(str, Enum):
    SEARCH_STARTED = "SEARCH_STARTED"
    ITERATION_STARTED = "ITERATION_STARTED"
    ITERATION_COMPLETED = "ITERATION_COMPLETED"
    NODE_DISCOVERED = "NODE_DISCOVERED"
    NODE_ADDED_TO_FRONTIER = "NODE_ADDED_TO_FRONTIER"
    NODE_REMOVED_FROM_FRONTIER = "NODE_REMOVED_FROM_FRONTIER"
    NODE_EXPANDED = "NODE_EXPANDED"
    NODE_PRUNED = "NODE_PRUNED"
    CUTOFF = "CUTOFF"
    BACKTRACK = "BACKTRACK"
    PATH_FOUND = "PATH_FOUND"
    SEARCH_FAILED = "SEARCH_FAILED"
    EXECUTION_LIMIT_REACHED = "EXECUTION_LIMIT_REACHED"


@dataclass(frozen=True)
class Cell:
    """A grid cell. Immutable and hashable so it can be a state key."""
    row: int
    col: int

    def __str__(self) -> str:
        return f"({self.row},{self.col})"


@dataclass(frozen=True)
class Action:
    """A movement action from one cell to a successor."""
    delta_row: int
    delta_col: int
    label: str
    cost: float

    def __post_init__(self) -> None:
        if not isinstance(self.cost, (int, float)) or self.cost < 0:
            raise ValueError(f"Action cost must be non-negative, got {self.cost}")


@dataclass
class SearchEvent:
    """A serializable event emitted by a running search algorithm."""
    seq: int
    type: EventType
    node: str              # cell identifier, e.g. "(2,3)"
    parent: Optional[str]
    depth: int
    g: Optional[float]
    h: Optional[float]
    f: Optional[float]
    metadata: Dict[str, object]

    def to_dict(self) -> dict:
        return {
            "seq": self.seq,
            "type": self.type.value,
            "node": self.node,
            "parent": self.parent,
            "depth": self.depth,
            "g": self.g,
            "h": self.h,
            "f": self.f,
            "metadata": self.metadata,
        }


@dataclass
class SearchResult:
    """Normalized result contract returned by every algorithm."""
    found: bool
    path: List[Cell]
    path_cost: float
    nodes_explored: int
    nodes_generated: int
    execution_time_ms: float
    max_frontier_size: int
    search_depth: int
    events: List[SearchEvent]
    termination_reason: TerminationReason
    algorithm: str
    # Why a LIMIT_REACHED result stopped (e.g. "max_expanded_nodes", "timeout",
    # "depth_limit"). None for every other termination reason.
    limit_reason: Optional[str] = None
    # True when the event trace hit ``max_events`` and later events were
    # dropped. The search itself still ran to its real conclusion.
    trace_truncated: bool = False

    def to_dict(self) -> dict:
        return {
            "found": self.found,
            "path": [str(c) for c in self.path],
            "path_cost": self.path_cost,
            "nodes_explored": self.nodes_explored,
            "nodes_generated": self.nodes_generated,
            "execution_time_ms": self.execution_time_ms,
            "max_frontier_size": self.max_frontier_size,
            "search_depth": self.search_depth,
            "events": [e.to_dict() for e in self.events],
            "termination_reason": self.termination_reason.value,
            "algorithm": self.algorithm,
            "limit_reason": self.limit_reason,
            "trace_truncated": self.trace_truncated,
        }


class Successor(Protocol):
    def __call__(self, state: Cell) -> List[Tuple[Cell, Action]]:
        ...


class GoalTest(Protocol):
    def __call__(self, state: Cell) -> bool:
        ...


class Heuristic(Protocol):
    def __call__(self, state: Cell) -> float:
        ...


@dataclass
class SearchProblem:
    """A concrete search problem instance."""
    start: Cell
    goal: Cell
    successors: Successor
    goal_test: GoalTest
    heuristic: Optional[Heuristic] = None

    def is_goal(self, state: Cell) -> bool:
        return self.goal_test(state)

    def h(self, state: Cell) -> float:
        if self.heuristic is None:
            return 0.0
        return float(self.heuristic(state))
