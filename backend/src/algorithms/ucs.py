"""Uniform Cost Search (UCS).

Strategy: min-priority queue ordered by cumulative path cost ``g``. Supports
relaxation when a cheaper route to a state is found; stale heap entries are
ignored safely.

Correctness:
- Complete under standard finite branching assumptions with nonnegative costs.
- Optimal with nonnegative edge costs.
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


class UCS(BaseSearch):
    name = "Uniform Cost Search"
    algorithm_id = "ucs"

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
                   h=problem.h(start), f=0.0)

        # Priority queue entries: (g, tiebreaker_counter, cell, depth)
        counter = 0
        heap: list[tuple] = []
        heapq.heappush(heap, (0.0, counter, start, 0))
        counter += 1

        came_from: Dict[Cell, Optional[Cell]] = {start: None}
        g_score: Dict[Cell, float] = {start: 0.0}
        depth_of: Dict[Cell, int] = {start: 0}
        generated: set[Cell] = {start}
        self._nodes_generated = 1
        self._max_frontier_size = 1

        while heap:
            self._check_budget()
            g, _, current, depth = heapq.heappop(heap)

            # Ignore stale heap entries (an outdated, higher-cost record).
            if g > g_score.get(current, float("inf")):
                continue

            self._count_expansion()
            self._search_depth = max(self._search_depth, depth)

            self._emit(EventType.NODE_REMOVED_FROM_FRONTIER, current,
                       parent=came_from.get(current), depth=depth, g=g,
                       h=problem.h(current), f=g,
                       metadata={"note": "ucs_priority_is_g"})
            self._emit(EventType.NODE_EXPANDED, current,
                       parent=came_from.get(current), depth=depth, g=g,
                       h=problem.h(current), f=g,
                       metadata={"note": "ucs_priority_is_g"})

            if problem.is_goal(current):
                self._termination_reason = TerminationReason.SUCCESS
                self._found = True
                self._path = reconstruct_path(came_from, start, current)
                self._path_cost = g
                self._search_depth = depth
                self._emit(EventType.PATH_FOUND, current,
                           parent=came_from.get(current), depth=depth, g=g,
                           h=problem.h(current), f=g,
                           metadata={"path": [str(c) for c in self._path]})
                return

            for nxt, action in problem.successors(current):
                self._check_budget()
                tentative_g = g + action.cost
                if tentative_g < g_score.get(nxt, float("inf")) - COST_EPS:
                    came_from[nxt] = current
                    g_score[nxt] = tentative_g
                    depth_of[nxt] = depth + 1
                    self._count_generation()
                    rediscovered = nxt in generated
                    added_meta = {"action": action.label}
                    if rediscovered:
                        added_meta["note"] = "cheaper_route_found"
                    if not rediscovered:
                        generated.add(nxt)
                        self._emit(EventType.NODE_DISCOVERED, nxt,
                                   parent=current, depth=depth + 1,
                                   g=tentative_g, h=problem.h(nxt),
                                   f=tentative_g,
                                   metadata={"action": action.label})
                    heapq.heappush(heap, (tentative_g, counter, nxt,
                                          depth + 1))
                    counter += 1
                    self._max_frontier_size = max(
                        self._max_frontier_size, len(heap)
                    )
                    self._emit(EventType.NODE_ADDED_TO_FRONTIER, nxt,
                               parent=current, depth=depth + 1, g=tentative_g,
                               h=problem.h(nxt), f=tentative_g,
                               metadata=added_meta)

        self._emit(EventType.SEARCH_FAILED, start, depth=0,
                   metadata={"reason": "frontier exhausted"})
