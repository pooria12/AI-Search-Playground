"""Greedy Best-First Search.

Strategy: prioritizes nodes by h(n) only (heuristic estimate to goal), not by
f(n) = g(n) + h(n). Clearly distinguished from A*.

Correctness:
- Not complete, not optimal.
- Uses visited/best-known handling to prevent avoidable repeated expansion.
"""

from __future__ import annotations

import heapq
from typing import Dict, Optional

from ..core.problem import (
    Cell,
    EventType,
    SearchProblem,
    TerminationReason,
)
from .base import BaseSearch, SearchBudget, reconstruct_path, COST_EPS


class GreedyBestFirst(BaseSearch):
    name = "Greedy Best-First Search"
    algorithm_id = "greedy"

    def _search(self) -> None:
        problem = self.problem
        start = problem.start

        if problem.is_goal(start):
            self._emit(EventType.SEARCH_STARTED, start, depth=0, g=0.0,
                       h=problem.h(start), f=problem.h(start),
                       metadata={"note": "start is goal"})
            self._emit(EventType.PATH_FOUND, start, depth=0, g=0.0,
                       h=problem.h(start), f=problem.h(start),
                       metadata={"path": [str(start)]})
            self._termination_reason = TerminationReason.SUCCESS
            self._found = True
            self._path = [start]
            self._path_cost = 0.0
            self._search_depth = 0
            return

        self._emit(EventType.SEARCH_STARTED, start, depth=0, g=0.0,
                   h=problem.h(start), f=problem.h(start))

        counter = 0
        heap: list = []
        heapq.heappush(heap, (problem.h(start), counter, start, 0, 0.0))
        counter += 1

        came_from: Dict[Cell, Optional[Cell]] = {start: None}
        g_score: Dict[Cell, float] = {start: 0.0}
        depth_of: Dict[Cell, int] = {start: 0}
        generated: set = {start}
        self._nodes_generated = 1
        self._max_frontier_size = 1
        closed: set = set()

        while heap:
            self._check_budget()
            h, _, current, depth, g = heapq.heappop(heap)

            # Ignore stale entries.
            if g > g_score.get(current, float("inf")):
                continue

            if current in closed:
                continue
            closed.add(current)

            self._count_expansion()
            self._search_depth = max(self._search_depth, depth)

            self._emit(EventType.NODE_REMOVED_FROM_FRONTIER, current,
                       parent=came_from.get(current), depth=depth, g=g,
                       h=problem.h(current), f=problem.h(current),
                       metadata={"note": "greedy_priority_is_h"})
            self._emit(EventType.NODE_EXPANDED, current,
                       parent=came_from.get(current), depth=depth, g=g,
                       h=problem.h(current), f=problem.h(current),
                       metadata={"note": "greedy_priority_is_h"})

            if problem.is_goal(current):
                self._termination_reason = TerminationReason.SUCCESS
                self._found = True
                self._path = reconstruct_path(came_from, start, current)
                self._path_cost = g
                self._search_depth = depth
                self._emit(EventType.PATH_FOUND, current,
                           parent=came_from.get(current), depth=depth, g=g,
                           h=problem.h(current), f=problem.h(current),
                           metadata={"path": [str(c) for c in self._path]})
                return

            for nxt, action in problem.successors(current):
                self._check_budget()
                if nxt in closed:
                    continue  # classic GBFS never reopens expanded states
                tentative_g = g + action.cost
                # Greedy only updates if this is a strictly better known route;
                # priority remains h(n) regardless of g.
                if tentative_g < g_score.get(nxt, float("inf")) - COST_EPS:
                    came_from[nxt] = current
                    g_score[nxt] = tentative_g
                    depth_of[nxt] = depth + 1
                    h = problem.h(nxt)
                    self._count_generation()
                    rediscovered = nxt in generated
                    added_meta = {"action": action.label}
                    if rediscovered:
                        added_meta["note"] = "cheaper_route_found"
                    if not rediscovered:
                        generated.add(nxt)
                        self._emit(EventType.NODE_DISCOVERED, nxt,
                                   parent=current, depth=depth + 1,
                                   g=tentative_g, h=h, f=h,
                                   metadata={"action": action.label})
                    heapq.heappush(heap, (h, counter, nxt, depth + 1,
                                          tentative_g))
                    counter += 1
                    self._max_frontier_size = max(
                        self._max_frontier_size, len(heap)
                    )
                    self._emit(EventType.NODE_ADDED_TO_FRONTIER, nxt,
                               parent=current, depth=depth + 1, g=tentative_g,
                               h=h, f=h,
                               metadata=added_meta)

        self._emit(EventType.SEARCH_FAILED, start, depth=0,
                   metadata={"reason": "frontier exhausted"})
