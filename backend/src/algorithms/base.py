"""Shared base class and utilities for search algorithms.

Provides deterministic event emission, execution-budget enforcement, monotonic
timing, and path reconstruction. Algorithms subclass :class:`BaseSearch` and
implement :meth:`run`. No hidden global mutable search state lives here.
"""

from __future__ import annotations

import math
import sys
import time
from dataclasses import dataclass
from typing import Dict, Iterator, List, Optional, Tuple

from ..core.problem import (
    Action,
    Cell,
    EventType,
    SearchEvent,
    SearchProblem,
    SearchResult,
    TerminationReason,
)


# Events that always end a trace, even when the trace is otherwise full.
_CONCLUDING_EVENTS = frozenset({
    EventType.PATH_FOUND,
    EventType.SEARCH_FAILED,
    EventType.EXECUTION_LIMIT_REACHED,
})

# Costs are sums of floats (e.g. several sqrt(2) diagonals), so two equal-cost
# routes can differ by ~1e-15. Cost comparisons use this tolerance so such noise
# is never mistaken for a cheaper route (which would re-expand nodes).
COST_EPS = 1e-9

# Enough for a path through every cell of the largest allowed grid.
RECURSION_LIMIT = 12000


@dataclass
class SearchBudget:
    """Configurable execution budget to protect Worker memory/CPU.

    If any limit is exceeded the search stops and returns a structured
    limit-reached result rather than pretending failure occurred naturally.
    """
    max_expanded_nodes: int = 20000
    max_generated_nodes: int = 50000
    max_events: int = 20000
    timeout_ms: int = 8000


class SearchBudgetExceeded(Exception):
    """Raised internally when an execution budget is exceeded."""
    def __init__(self, reason: str) -> None:
        super().__init__(reason)
        self.reason = reason


class DepthFrame:
    """One entry of an explicit depth-first stack.

    ``expanded`` guards against re-counting / re-emitting a node every time
    the search returns to it after backtracking from a child.
    """

    __slots__ = ("cell", "depth", "g", "successors", "expanded")

    def __init__(self, cell: Cell, depth: int, g: float,
                 successors: Iterator[Tuple[Cell, Action]]) -> None:
        self.cell = cell
        self.depth = depth
        self.g = g
        self.successors = successors
        self.expanded = False


def reconstruct_path(
    came_from: Dict[Cell, Optional[Cell]],
    start: Cell,
    goal: Cell,
) -> List[Cell]:
    """Rebuild the start-to-goal path from parent links."""
    path: List[Cell] = []
    current: Optional[Cell] = goal
    while current is not None:
        path.append(current)
        current = came_from.get(current)
    path.reverse()
    if not path or path[0] != start:
        return []
    return path


def compute_path_cost(
    problem: SearchProblem,
    path: List[Cell],
) -> float:
    """Recompute the cumulative cost of a path from actual transition costs."""
    total = 0.0
    for i in range(len(path) - 1):
        successors = problem.successors(path[i])
        for nxt, action in successors:
            if nxt == path[i + 1]:
                total += action.cost
                break
        else:
            # Illegal transition: path is invalid.
            return math.inf
    return total


def now_ms() -> float:
    return time.perf_counter() * 1000.0


class BaseSearch:
    """Base class for all search algorithms.

    Subclasses implement :meth:`_search` and emit events through
    :meth:`_emit`. Budgets, timing, and result assembly are handled here.
    """

    name: str = "base"
    algorithm_id: str = "base"
    # Recursive algorithms (IDA*, RBFS) set this so deep grid paths do not hit
    # Python's default recursion limit.
    needs_deep_recursion: bool = False

    def __init__(
        self,
        problem: SearchProblem,
        budget: Optional[SearchBudget] = None,
    ) -> None:
        self.problem = problem
        self.budget = budget or SearchBudget()

        self._events: List[SearchEvent] = []
        self._seq = 0
        self._start_time: Optional[float] = None
        self._end_time: Optional[float] = None
        self._nodes_generated = 0
        self._nodes_explored = 0
        self._max_frontier_size = 0
        self._search_depth = 0
        self._termination_reason = TerminationReason.NO_PATH
        self._limit_reason: Optional[str] = None
        self._trace_truncated = False
        # Instance-level outcome holders (initialized per run). Using plain
        # attributes here: field() only works inside @dataclass classes, and
        # BaseSearch is not a dataclass.
        self._found = False
        self._path: List[Cell] = []
        self._path_cost = 0.0

    # -- event emission ---------------------------------------------------

    def _emit(
        self,
        type: EventType,
        node: Cell,
        parent: Optional[Cell] = None,
        depth: int = 0,
        g: Optional[float] = None,
        h: Optional[float] = None,
        f: Optional[float] = None,
        metadata: Optional[Dict[str, object]] = None,
    ) -> None:
        # ``max_events`` bounds the size of the recorded trace, not the
        # search: once it is full, intermediate events are dropped and the
        # search carries on to its real outcome (still bounded by the
        # expanded / generated / time budgets). The events that conclude a
        # search are always recorded, so every trace ends consistently.
        if (len(self._events) >= self.budget.max_events
                and type not in _CONCLUDING_EVENTS):
            self._trace_truncated = True
            return
        self._seq += 1
        self._events.append(
            SearchEvent(
                seq=self._seq,
                type=type,
                node=str(node),
                parent=str(parent) if parent is not None else None,
                depth=depth,
                g=g,
                h=h,
                f=f,
                metadata=metadata or {},
            )
        )

    # -- budget checks ----------------------------------------------------

    def _check_budget(self) -> None:
        """Time budget; call regularly from the search loop."""
        if self._end_time is None and self._start_time is not None:
            elapsed_ms = (now_ms() - self._start_time)
            if elapsed_ms > self.budget.timeout_ms:
                raise SearchBudgetExceeded("timeout")

    def _count_expansion(self) -> None:
        """Count one node expansion, refusing the (max+1)-th one.

        A budget of N therefore allows exactly N expansions.
        """
        if self._nodes_explored >= self.budget.max_expanded_nodes:
            raise SearchBudgetExceeded("max_expanded_nodes")
        self._nodes_explored += 1

    def _count_generation(self) -> None:
        """Count one generated node (a frontier insertion), same rule."""
        if self._nodes_generated >= self.budget.max_generated_nodes:
            raise SearchBudgetExceeded("max_generated_nodes")
        self._nodes_generated += 1

    def _note_frontier(self, size: int) -> None:
        """Record the peak number of nodes held in the open structure."""
        if size > self._max_frontier_size:
            self._max_frontier_size = size

    # -- template ---------------------------------------------------------

    def run(self) -> SearchResult:
        """Execute the search and return a normalized :class:`SearchResult`.

        Only budget exhaustion and recursion exhaustion are converted into a
        ``limit_reached`` result. Any other exception is a bug and propagates
        so it is never reported as a search outcome.
        """
        self._start_time = now_ms()
        self._termination_reason = TerminationReason.NO_PATH
        self._limit_reason = None
        self._trace_truncated = False
        self._found = False
        self._path = []
        self._path_cost = 0.0

        previous_limit = sys.getrecursionlimit()
        if self.needs_deep_recursion and previous_limit < RECURSION_LIMIT:
            sys.setrecursionlimit(RECURSION_LIMIT)

        try:
            self._search()
        except SearchBudgetExceeded as exc:
            self._mark_limit(exc.reason)
        except RecursionError:
            self._mark_limit("max_recursion_depth")
        finally:
            self._end_time = now_ms()
            if sys.getrecursionlimit() != previous_limit:
                sys.setrecursionlimit(previous_limit)

        execution_time_ms = self._end_time - self._start_time

        found = self._found
        path = self._path if found else []
        path_cost = 0.0

        if found:
            # Never trust an algorithm's own bookkeeping: re-derive the cost
            # from the actual transitions and fail loudly on an illegal path.
            path_cost = compute_path_cost(self.problem, path)
            if not path or path_cost == math.inf:
                raise RuntimeError(
                    f"{self.algorithm_id} returned an illegal path: {path}"
                )

        return SearchResult(
            found=found,
            path=path,
            path_cost=path_cost,
            nodes_explored=self._nodes_explored,
            nodes_generated=self._nodes_generated,
            execution_time_ms=execution_time_ms,
            max_frontier_size=self._max_frontier_size,
            search_depth=self._search_depth,
            events=list(self._events),
            termination_reason=self._termination_reason,
            algorithm=self.algorithm_id,
            limit_reason=self._limit_reason,
            trace_truncated=self._trace_truncated,
        )

    def _mark_limit(self, reason: str, **metadata: object) -> None:
        """Record a limit stop and emit the terminal limit event.

        Used for budget exhaustion and for algorithm-level limits (a depth
        cutoff), so every ``limit_reached`` result ends the same way.
        """
        self._termination_reason = TerminationReason.LIMIT_REACHED
        self._limit_reason = reason
        self._emit(EventType.EXECUTION_LIMIT_REACHED, self.problem.start,
                   metadata={"reason": reason, **metadata})

    def _search(self) -> None:
        raise NotImplementedError
