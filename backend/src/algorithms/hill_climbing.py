"""Hill Climbing (steepest descent on the heuristic).

Strategy: repeatedly move to the neighbor with the lowest heuristic value
(ties broken by cell order). Detects and reports local optima and plateaus.
Sideways moves (equal heuristic) are an explicit option; while wandering on a
plateau a cell is never revisited, so the walk cannot ping-pong.

Correctness:
- Not complete, not optimal. Stops at the first local optimum.
- On failure ``path`` is empty; the route climbed so far is reported in the
  ``SEARCH_FAILED`` event metadata so it can still be visualised.
- Random restarts are intentionally *not* supported: a restart would begin
  somewhere other than the requested start cell, so any path it found would
  not be a path from that start.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Set

from ..core.problem import (
    Cell,
    EventType,
    SearchProblem,
    TerminationReason,
)
from .base import BaseSearch, SearchBudget


class HillClimbing(BaseSearch):
    name = "Hill Climbing"
    algorithm_id = "hill_climbing"

    def __init__(
        self,
        problem: SearchProblem,
        budget: Optional[SearchBudget] = None,
        sideways_moves: int = 0,
    ) -> None:
        super().__init__(problem, budget=budget)
        if sideways_moves < 0:
            raise ValueError("sideways_moves must be >= 0")
        self.sideways_moves = sideways_moves

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
                   f=h0, metadata={"sideways_moves": self.sideways_moves})

        current = start
        current_g = 0.0
        current_h = h0
        path: List[Cell] = [start]
        came_from: Dict[Cell, Optional[Cell]] = {start: None}
        self._nodes_generated = 1
        self._note_frontier(1)
        sideways_used = 0
        plateau_visited: Set[Cell] = {start}

        while True:
            self._check_budget()
            depth = len(path) - 1
            self._count_expansion()
            self._search_depth = depth

            self._emit(EventType.NODE_EXPANDED, current,
                       parent=came_from.get(current), depth=depth,
                       g=current_g, h=current_h, f=current_g + current_h,
                       metadata={"note": "current_state"})

            if problem.is_goal(current):
                self._termination_reason = TerminationReason.SUCCESS
                self._found = True
                self._path = path
                self._path_cost = current_g
                self._emit(EventType.PATH_FOUND, current,
                           parent=came_from.get(current), depth=depth,
                           g=current_g, h=current_h, f=current_g + current_h,
                           metadata={"path": [str(c) for c in path]})
                return

            neighbors = problem.successors(current)
            self._max_frontier_size = max(self._max_frontier_size,
                                          len(neighbors))

            evaluated = []
            for nxt, action in neighbors:
                self._count_generation()
                nh = problem.h(nxt)
                evaluated.append((nh, nxt.row, nxt.col, nxt, action))
                self._emit(EventType.NODE_DISCOVERED, nxt, parent=current,
                           depth=depth + 1, g=current_g + action.cost, h=nh,
                           f=current_g + action.cost + nh,
                           metadata={"action": action.label,
                                     "note": "neighbor_evaluation"})
            evaluated.sort(key=lambda item: item[:3])

            if not evaluated:
                self._fail("no_available_neighbors", current, came_from,
                           depth, current_g, current_h, path)
                return

            best_h, _, _, best_nxt, best_action = evaluated[0]
            move_note = None

            if best_h < current_h:
                move_note = "moved_to_better_neighbor"
                sideways_used = 0
                plateau_visited = set()
            elif best_h == current_h and sideways_used < self.sideways_moves:
                # Plateau: take the best equal neighbor not yet seen on it.
                for nh, _, _, nxt, action in evaluated:
                    if nh != current_h:
                        break
                    if nxt not in plateau_visited:
                        best_nxt, best_action = nxt, action
                        move_note = "sideways_move"
                        sideways_used += 1
                        break

            if move_note is None:
                reason = ("plateau" if best_h == current_h
                          else "local_optimum")
                self._fail(reason, current, came_from, depth, current_g,
                           current_h, path)
                return

            previous = current
            came_from[best_nxt] = previous
            current_g += best_action.cost
            current_h = problem.h(best_nxt)
            current = best_nxt
            path.append(current)
            plateau_visited.add(current)
            self._emit(EventType.NODE_ADDED_TO_FRONTIER, current,
                       parent=previous, depth=len(path) - 1, g=current_g,
                       h=current_h, f=current_g + current_h,
                       metadata={"action": best_action.label,
                                 "note": move_note})

    def _fail(self, reason, current, came_from, depth, g, h, path) -> None:
        self._termination_reason = TerminationReason.NO_PATH
        self._emit(EventType.SEARCH_FAILED, current,
                   parent=came_from.get(current), depth=depth, g=g, h=h,
                   f=g + h,
                   metadata={"reason": reason,
                             "path": [str(c) for c in path]})
