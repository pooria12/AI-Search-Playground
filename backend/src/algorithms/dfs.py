"""Depth-First Search (DFS).

Strategy: expand the most recently discovered node first using an explicit
LIFO stack (graph-search variant). A global visited set prevents cycling on
grids.

Correctness:
- Complete on finite graphs (the visited set guarantees termination).
- Not optimal: returns the first path found.
- Each node is counted and expanded exactly once, even though the stack
  returns to it after every child finishes.
"""

from __future__ import annotations

from typing import Dict, List, Optional

from ..core.problem import Cell, EventType, TerminationReason
from .base import BaseSearch, DepthFrame, reconstruct_path


class DFS(BaseSearch):
    name = "Depth-First Search"
    algorithm_id = "dfs"

    def _search(self) -> None:
        problem = self.problem
        start = problem.start

        if problem.is_goal(start):
            self._emit(EventType.SEARCH_STARTED, start, depth=0, g=0.0,
                       h=problem.h(start), f=0.0,
                       metadata={"note": "start is goal"})
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
                   h=problem.h(start), f=problem.h(start))

        came_from: Dict[Cell, Optional[Cell]] = {start: None}
        visited: set[Cell] = {start}
        stack: List[DepthFrame] = [
            DepthFrame(start, 0, 0.0, iter(problem.successors(start)))
        ]
        self._nodes_generated = 1
        self._max_frontier_size = 1

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
                           parent=came_from[current], depth=depth, g=g,
                           h=h, f=g + h)
                self._emit(EventType.NODE_EXPANDED, current,
                           parent=came_from[current], depth=depth, g=g,
                           h=h, f=g + h)

                if problem.is_goal(current):
                    self._termination_reason = TerminationReason.SUCCESS
                    self._found = True
                    self._path = reconstruct_path(came_from, start, current)
                    self._path_cost = g
                    self._search_depth = depth
                    self._emit(EventType.PATH_FOUND, current,
                               parent=came_from[current], depth=depth, g=g,
                               h=h, f=g + h,
                               metadata={"path": [str(c) for c in self._path]})
                    return

            advanced = False
            for nxt, action in frame.successors:
                self._check_budget()
                if nxt in visited:
                    continue
                visited.add(nxt)
                came_from[nxt] = current
                self._count_generation()
                ng = g + action.cost
                nh = problem.h(nxt)
                self._emit(EventType.NODE_DISCOVERED, nxt, parent=current,
                           depth=depth + 1, g=ng, h=nh, f=ng + nh,
                           metadata={"action": action.label})
                stack.append(DepthFrame(nxt, depth + 1, ng,
                                        iter(problem.successors(nxt))))
                self._max_frontier_size = max(self._max_frontier_size,
                                              len(stack))
                advanced = True
                break  # go deep immediately (LIFO order)

            if not advanced:
                self._emit(EventType.BACKTRACK, current,
                           parent=came_from[current], depth=depth, g=g,
                           h=h, f=g + h,
                           metadata={"reason": "no_unvisited_successors"})
                stack.pop()

        self._emit(EventType.SEARCH_FAILED, start, depth=0,
                   metadata={"reason": "frontier exhausted"})
