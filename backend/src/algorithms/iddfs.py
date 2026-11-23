"""Iterative Deepening DFS (IDDFS).

Strategy: run depth-limited search with limits 0, 1, 2, ... and report each
iteration. Every iteration starts from scratch with its own depth-aware
visited map (no pruning leaks across iterations).

Correctness:
- Complete for finite branching.
- Optimal in *number of steps* (and therefore in cost on unit-cost grids):
  the depth-aware visited map re-expands a state when a shallower route to
  it is found, which a plain visited set would not do.
- Stops early (``no_path``) as soon as an iteration ends without any cutoff,
  because deeper limits cannot reveal new states.
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


class IDDFS(BaseSearch):
    name = "Iterative Deepening DFS"
    algorithm_id = "iddfs"

    def __init__(
        self,
        problem: SearchProblem,
        budget: Optional[SearchBudget] = None,
        max_depth: int = 100,
    ) -> None:
        super().__init__(problem, budget=budget)
        if max_depth < 0:
            raise ValueError("max_depth must be >= 0")
        self.max_depth = max_depth

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
                   h=problem.h(start), f=problem.h(start),
                   metadata={"max_depth": self.max_depth})

        last_iteration_cutoff = False
        for limit in range(0, self.max_depth + 1):
            self._emit(EventType.ITERATION_STARTED, start, depth=0, g=0.0,
                       h=problem.h(start), f=0.0,
                       metadata={"iteration": limit, "depth_limit": limit})

            found, cutoff, nodes = self._run_dls(limit)

            self._emit(EventType.ITERATION_COMPLETED, start, depth=0, g=0.0,
                       h=problem.h(start), f=0.0,
                       metadata={"iteration": limit, "depth_limit": limit,
                                 "found": found, "cutoff": cutoff,
                                 "nodes_expanded": nodes})

            if found:
                self._termination_reason = TerminationReason.SUCCESS
                self._found = True
                self._emit(EventType.PATH_FOUND, problem.goal,
                           parent=self._path[-2] if len(self._path) > 1
                           else None,
                           depth=self._search_depth, g=self._path_cost,
                           h=0.0, f=self._path_cost,
                           metadata={"path": [str(c) for c in self._path],
                                     "iteration": limit})
                return

            last_iteration_cutoff = cutoff
            if not cutoff:
                # Nothing was left unexplored because of the limit, so a
                # deeper limit cannot find anything new.
                break

        if last_iteration_cutoff:
            # Ran out of allowed depths while states were still unexplored.
            self._mark_limit("max_depth", max_depth=self.max_depth)
        else:
            self._termination_reason = TerminationReason.NO_PATH
            self._emit(EventType.SEARCH_FAILED, start, depth=0,
                       metadata={"reason": "space_exhausted"})

    def _run_dls(self, limit: int) -> tuple[bool, bool, int]:
        """One depth-limited pass. Returns (found, cutoff, nodes_expanded).

        Counters live on ``self`` so the shared budget is enforced across
        iterations; on success the path is stored on ``self``.
        """
        problem = self.problem
        start = problem.start

        came_from: Dict[Cell, Optional[Cell]] = {start: None}
        best_depth: Dict[Cell, int] = {start: 0}
        stack: List[DepthFrame] = [
            DepthFrame(start, 0, 0.0, iter(problem.successors(start)))
        ]
        self._count_generation()
        self._note_frontier(1)
        cutoff_occurred = False
        cut_marked: set = set()
        nodes_expanded = 0

        while stack:
            self._check_budget()
            frame = stack[-1]
            current, depth, g = frame.cell, frame.depth, frame.g
            h = problem.h(current)

            if not frame.expanded:
                frame.expanded = True
                nodes_expanded += 1
                self._count_expansion()
                self._emit(EventType.NODE_EXPANDED, current,
                           parent=came_from[current], depth=depth, g=g, h=h,
                           f=g + h, metadata={"iteration_limit": limit})
                if problem.is_goal(current):
                    self._path = reconstruct_path(came_from, start, current)
                    self._path_cost = g
                    self._search_depth = depth
                    return True, False, nodes_expanded

            advanced = False
            for nxt, action in frame.successors:
                self._check_budget()
                next_depth = depth + 1
                ng = g + action.cost
                if next_depth > limit:
                    if nxt not in best_depth:
                        cutoff_occurred = True
                        if nxt in cut_marked:
                            continue  # one marker per cell is enough
                        cut_marked.add(nxt)
                        self._emit(EventType.CUTOFF, nxt, parent=current,
                                   depth=next_depth, g=ng, h=problem.h(nxt),
                                   f=ng + problem.h(nxt),
                                   metadata={"action": action.label,
                                             "iteration_limit": limit})
                    continue
                if nxt in best_depth and best_depth[nxt] <= next_depth:
                    continue
                best_depth[nxt] = next_depth
                came_from[nxt] = current
                self._count_generation()
                nh = problem.h(nxt)
                self._emit(EventType.NODE_DISCOVERED, nxt, parent=current,
                           depth=next_depth, g=ng, h=nh, f=ng + nh,
                           metadata={"action": action.label,
                                     "iteration_limit": limit})
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
                                     "iteration_limit": limit})
                stack.pop()

        return False, cutoff_occurred, nodes_expanded
