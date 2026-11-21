"""Iterative Deepening A* (IDA*).

Strategy: depth-first iterations bounded by an f = g + h threshold. After a
failed iteration the next threshold is the *minimum f-value that exceeded the
current one* (not an arbitrary increment).

Correctness:
- Optimal with an admissible heuristic.
- Cycle avoidance is per current path. In addition, each iteration keeps a
  transposition table (best g per cell): a cell reached again with an equal or
  higher g is skipped. Without it the many equal-cost routes across an open
  grid make plain IDA* re-walk the same cells combinatorially often. The skip
  is safe: the earlier visit already contributed every f-value the later one
  could, so optimality and the next-threshold rule are unchanged. The price
  is O(cells) memory instead of the textbook O(path length).
- Nodes pruned by the threshold are reported as pruned and are *not* counted
  as expanded.
"""

from __future__ import annotations

import math
from typing import Dict, List, Optional, Set, Tuple

from ..core.problem import (
    Cell,
    EventType,
    SearchProblem,
    TerminationReason,
)
from .base import BaseSearch, SearchBudget

_EPS = 1e-9
_FOUND = "found"
_CUTOFF = "cutoff"
_FAIL = "fail"


class IDAStar(BaseSearch):
    name = "Iterative Deepening A*"
    algorithm_id = "ida_star"
    needs_deep_recursion = True

    def __init__(
        self,
        problem: SearchProblem,
        budget: Optional[SearchBudget] = None,
    ) -> None:
        super().__init__(problem, budget=budget)
        self._path_stack: List[Cell] = []
        self._best_g: Dict[Cell, float] = {}

    def _search(self) -> None:
        problem = self.problem
        start = problem.start
        h0 = problem.h(start)

        if problem.is_goal(start):
            self._emit(EventType.SEARCH_STARTED, start, depth=0, g=0.0,
                       h=h0, f=h0, metadata={"note": "start is goal"})
            self._emit(EventType.PATH_FOUND, start, depth=0, g=0.0, h=h0,
                       f=h0, metadata={"path": [str(start)]})
            self._termination_reason = TerminationReason.SUCCESS
            self._found = True
            self._path = [start]
            self._path_cost = 0.0
            self._search_depth = 0
            return

        self._emit(EventType.SEARCH_STARTED, start, depth=0, g=0.0, h=h0,
                   f=h0)
        self._nodes_generated = 1

        threshold = h0
        iteration = 0
        while True:
            iteration += 1
            self._emit(EventType.ITERATION_STARTED, start, depth=0, g=0.0,
                       h=h0, f=threshold,
                       metadata={"iteration": iteration,
                                 "threshold": threshold})
            self._path_stack = [start]
            self._best_g = {}
            status, value = self._dfs(0.0, threshold, {start})

            self._emit(EventType.ITERATION_COMPLETED, start, depth=0, g=0.0,
                       h=h0, f=threshold,
                       metadata={"iteration": iteration,
                                 "threshold": threshold,
                                 "found": status == _FOUND,
                                 "cutoff": status == _CUTOFF})

            if status == _FOUND:
                self._termination_reason = TerminationReason.SUCCESS
                self._found = True
                self._path = list(self._path_stack)
                self._path_cost = value
                self._search_depth = len(self._path) - 1
                self._emit(EventType.PATH_FOUND, problem.goal,
                           parent=self._path[-2], depth=self._search_depth,
                           g=value, h=0.0, f=value,
                           metadata={"path": [str(c) for c in self._path],
                                     "iteration": iteration})
                return

            if status == _FAIL or math.isinf(value):
                # Nothing exceeded the threshold: the reachable space is
                # exhausted without a goal.
                self._termination_reason = TerminationReason.NO_PATH
                self._emit(EventType.SEARCH_FAILED, start, depth=0,
                           metadata={"reason": "space_exhausted"})
                return

            threshold = value  # minimum f that exceeded the old threshold

    def _dfs(
        self,
        g: float,
        threshold: float,
        on_path: Set[Cell],
    ) -> Tuple[str, float]:
        """Threshold-bounded DFS from the top of ``self._path_stack``.

        Returns (status, value): ``found`` with the path cost, ``cutoff`` with
        the minimum exceeding f-value, or ``fail`` for a dead end.
        """
        problem = self.problem
        current = self._path_stack[-1]
        depth = len(self._path_stack) - 1
        parent = self._path_stack[-2] if depth > 0 else None
        h = problem.h(current)
        f = g + h

        if f > threshold + _EPS:
            self._emit(EventType.NODE_PRUNED, current, parent=parent,
                       depth=depth, g=g, h=h, f=f,
                       metadata={"reason": "f_exceeds_threshold",
                                 "threshold": threshold})
            return _CUTOFF, f

        previous_g = self._best_g.get(current)
        if previous_g is not None and previous_g <= g + _EPS:
            self._emit(EventType.NODE_PRUNED, current, parent=parent,
                       depth=depth, g=g, h=h, f=f,
                       metadata={"reason": "already_reached_cheaper",
                                 "best_g": previous_g})
            return _FAIL, math.inf
        self._best_g[current] = g

        self._check_budget()
        self._count_expansion()
        self._note_frontier(len(self._path_stack))
        self._search_depth = max(self._search_depth, depth)
        self._emit(EventType.NODE_EXPANDED, current, parent=parent,
                   depth=depth, g=g, h=h, f=f,
                   metadata={"threshold": threshold})

        if problem.is_goal(current):
            return _FOUND, g

        min_exceeded = math.inf
        for nxt, action in problem.successors(current):
            if nxt in on_path:
                continue
            self._check_budget()
            ng = g + action.cost
            nh = problem.h(nxt)
            self._count_generation()
            self._emit(EventType.NODE_DISCOVERED, nxt, parent=current,
                       depth=depth + 1, g=ng, h=nh, f=ng + nh,
                       metadata={"action": action.label})

            on_path.add(nxt)
            self._path_stack.append(nxt)
            status, value = self._dfs(ng, threshold, on_path)
            if status == _FOUND:
                return status, value  # keep the stack: it is the solution
            self._path_stack.pop()
            on_path.discard(nxt)

            self._emit(EventType.BACKTRACK, nxt, parent=current,
                       depth=depth + 1, g=ng, h=nh, f=ng + nh,
                       metadata={"reason": "returned_from_recursion",
                                 "threshold": threshold})
            if status == _CUTOFF:
                min_exceeded = min(min_exceeded, value)

        if math.isinf(min_exceeded):
            return _FAIL, math.inf
        return _CUTOFF, min_exceeded
