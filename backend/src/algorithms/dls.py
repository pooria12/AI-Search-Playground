"""Depth-Limited Search (DLS).

Strategy: DFS that enforces a precise depth limit (root is depth 0).
Distinguishes *cutoff* (a deeper, unexplored state exists) from *failure*
(the space inside the limit is exhausted) so IDDFS can continue correctly.

Correctness:
- Visited bookkeeping is depth-aware: a state is re-expanded only if it is
  reached at a strictly shallower depth. A plain visited set would hide
  shorter routes and make the search miss goals that lie within the limit.
- A cutoff is reported only when a state that has never been reached is
  actually left unexplored because of the limit.
- Not optimal in path cost; complete within the limit.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from ..core.problem import (
    Cell,
    EventType,
    SearchProblem,
    TerminationReason,
)
from .base import BaseSearch, DepthFrame, SearchBudget, reconstruct_path


class DLS(BaseSearch):
    name = "Depth-Limited Search"
    algorithm_id = "dls"

    def __init__(
        self,
        problem: SearchProblem,
        budget: Optional[SearchBudget] = None,
        limit: int = 0,
    ) -> None:
        super().__init__(problem, budget=budget)
        if limit < 0:
            raise ValueError("depth limit must be >= 0")
        self.limit = limit

    def _search(self) -> None:
        problem = self.problem
        start = problem.start
        limit = self.limit

        if problem.is_goal(start):
            self._emit(EventType.SEARCH_STARTED, start, depth=0, g=0.0,
                       h=problem.h(start), f=0.0,
                       metadata={"note": "start is goal", "limit": limit})
            self._emit(EventType.PATH_FOUND, start, depth=0, g=0.0,
                       h=problem.h(start), f=0.0,
                       metadata={"path": [str(start)]})
            self._termination_reason = TerminationReason.SUCCESS
            self._found = True
            self._path = [start]
            self._path_cost = 0.0
            self._search_depth = 0
            return

        self._emit(EventType.SEARCH_STARTED, start, depth=0, g=0.0,
                   h=problem.h(start), f=problem.h(start),
                   metadata={"limit": limit})

        came_from: Dict[Cell, Optional[Cell]] = {start: None}
        best_depth: Dict[Cell, int] = {start: 0}
        stack: List[DepthFrame] = [
            DepthFrame(start, 0, 0.0, iter(problem.successors(start)))
        ]
        self._nodes_generated = 1
        self._max_frontier_size = 1
        cutoff_occurred = False
        cut_marked: set = set()

        while stack:
            self._check_budget()
            frame = stack[-1]
            current, depth, g = frame.cell, frame.depth, frame.g
            h = problem.h(current)

            if not frame.expanded:
                frame.expanded = True
                self._count_expansion()
                self._search_depth = max(self._search_depth, depth)
                self._emit(EventType.NODE_REMOVED_FROM_FRONTIER, current,
                           parent=came_from[current], depth=depth, g=g, h=h,
                           f=g + h, metadata={"limit": limit})
                self._emit(EventType.NODE_EXPANDED, current,
                           parent=came_from[current], depth=depth, g=g, h=h,
                           f=g + h, metadata={"limit": limit})
                if problem.is_goal(current):
                    self._termination_reason = TerminationReason.SUCCESS
                    self._found = True
                    self._path = reconstruct_path(came_from, start, current)
                    self._path_cost = g
                    self._search_depth = depth
                    self._emit(EventType.PATH_FOUND, current,
                               parent=came_from[current], depth=depth, g=g,
                               h=h, f=g + h,
                               metadata={"path": [str(c) for c in self._path],
                                         "limit": limit})
                    return

            advanced = False
            for nxt, action in frame.successors:
                self._check_budget()
                next_depth = depth + 1
                ng = g + action.cost
                if next_depth > limit:
                    if nxt not in best_depth:
                        # A never-reached state is being skipped only because
                        # of the limit: a genuine cutoff.
                        cutoff_occurred = True
                        if nxt in cut_marked:
                            continue  # one marker per cell is enough
                        cut_marked.add(nxt)
                        self._emit(EventType.CUTOFF, nxt, parent=current,
                                   depth=next_depth, g=ng, h=problem.h(nxt),
                                   f=ng + problem.h(nxt),
                                   metadata={"action": action.label,
                                             "limit": limit})
                    continue
                if nxt in best_depth and best_depth[nxt] <= next_depth:
                    continue
                best_depth[nxt] = next_depth
                came_from[nxt] = current
                self._count_generation()
                nh = problem.h(nxt)
                self._emit(EventType.NODE_DISCOVERED, nxt, parent=current,
                           depth=next_depth, g=ng, h=nh, f=ng + nh,
                           metadata={"action": action.label, "limit": limit})
                stack.append(DepthFrame(nxt, next_depth, ng,
                                        iter(problem.successors(nxt))))
                self._max_frontier_size = max(self._max_frontier_size,
                                              len(stack))
                advanced = True
                break

            if not advanced:
                self._emit(EventType.BACKTRACK, current,
                           parent=came_from[current], depth=depth, g=g,
                           h=h, f=g + h,
                           metadata={"reason": "no_successors_within_limit",
                                     "limit": limit})
                stack.pop()

        if cutoff_occurred:
            self._mark_limit("depth_limit", limit=limit)
        else:
            self._termination_reason = TerminationReason.NO_PATH
            self._emit(EventType.SEARCH_FAILED, start, depth=0,
                       metadata={"reason": "frontier exhausted",
                                 "limit": limit})
