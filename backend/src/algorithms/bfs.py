"""Breadth-First Search (BFS).

Strategy: explore the graph level by level using a FIFO queue. A state is
marked discovered when it is enqueued, preventing duplicate queue entries.

Correctness:
- Complete for finite branching factor.
- Optimal only when all step costs are equal (unweighted grids).
- Parent chain reconstructed without incorrect reversal.

Event emission reflects actual queue operations.
"""

from __future__ import annotations

from collections import deque
from typing import Dict, Optional

from ..core.problem import (
    Cell,
    EventType,
    SearchProblem,
    TerminationReason,
)
from .base import BaseSearch, SearchBudget, reconstruct_path


class BFS(BaseSearch):
    name = "Breadth-First Search"
    algorithm_id = "bfs"

    def _search(self) -> None:
        problem = self.problem
        start = problem.start

        # Immediate start == goal case.
        if problem.is_goal(start):
            self._emit(
                EventType.SEARCH_STARTED, start, depth=0, g=0.0,
                h=problem.h(start), f=0.0,
                metadata={"note": "start is goal"},
            )
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
                   h=problem.h(start), f=0.0)

        queue: deque[Cell] = deque([start])
        came_from: Dict[Cell, Optional[Cell]] = {start: None}
        g_score: Dict[Cell, float] = {start: 0.0}
        discovered: set[Cell] = {start}
        self._nodes_generated = 1
        self._note_frontier(1)

        depth_of: Dict[Cell, int] = {start: 0}

        while queue:
            self._check_budget()
            current = queue.popleft()
            self._count_expansion()
            self._search_depth = max(self._search_depth, depth_of[current])

            self._emit(EventType.NODE_REMOVED_FROM_FRONTIER, current,
                       parent=came_from.get(current), depth=depth_of[current],
                       g=g_score[current], h=problem.h(current),
                       f=g_score[current] + problem.h(current))
            self._emit(EventType.NODE_EXPANDED, current,
                       parent=came_from.get(current), depth=depth_of[current],
                       g=g_score[current], h=problem.h(current),
                       f=g_score[current] + problem.h(current))

            if problem.is_goal(current):
                self._termination_reason = TerminationReason.SUCCESS
                self._found = True
                self._path = reconstruct_path(came_from, start, current)
                self._path_cost = g_score[current]
                self._search_depth = depth_of[current]
                self._emit(EventType.PATH_FOUND, current,
                           parent=came_from.get(current), depth=depth_of[current],
                           g=g_score[current], h=problem.h(current),
                           f=g_score[current] + problem.h(current),
                           metadata={"path": [str(c) for c in self._path]})
                return

            for nxt, action in problem.successors(current):
                self._check_budget()
                if nxt in discovered:
                    continue
                discovered.add(nxt)
                came_from[nxt] = current
                g_score[nxt] = g_score[current] + action.cost
                depth_of[nxt] = depth_of[current] + 1
                self._count_generation()
                self._max_frontier_size = max(
                    self._max_frontier_size, len(queue) + 1
                )

                self._emit(EventType.NODE_DISCOVERED, nxt, parent=current,
                           depth=depth_of[nxt], g=g_score[nxt],
                           h=problem.h(nxt),
                           f=g_score[nxt] + problem.h(nxt),
                           metadata={"action": action.label})
                self._emit(EventType.NODE_ADDED_TO_FRONTIER, nxt, parent=current,
                           depth=depth_of[nxt], g=g_score[nxt],
                           h=problem.h(nxt),
                           f=g_score[nxt] + problem.h(nxt),
                           metadata={"action": action.label})

                queue.append(nxt)

        # Queue exhausted without finding a goal.
        self._emit(EventType.SEARCH_FAILED, start, depth=0,
                   metadata={"reason": "frontier exhausted"})
