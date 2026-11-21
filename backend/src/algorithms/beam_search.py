"""Beam Search.

Strategy: expand one level at a time and keep only the best ``k`` candidates,
ranked by the heuristic ``h`` (ties broken by lower ``g``, then cell order).
Emits which candidates were retained and which were pruned.

Correctness:
- Validates beam width k >= 1.
- Each state is a candidate once per level (the best-ranked route wins) and a
  state that already joined a beam is never re-added, so the beam is never
  filled with duplicates and the search always terminates.
- Not complete or optimal: pruning can discard the only route to the goal.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Set, Tuple

from ..core.problem import (
    Action,
    Cell,
    EventType,
    SearchProblem,
    TerminationReason,
)
from .base import BaseSearch, SearchBudget, reconstruct_path


class BeamSearch(BaseSearch):
    name = "Beam Search"
    algorithm_id = "beam_search"

    def __init__(
        self,
        problem: SearchProblem,
        budget: Optional[SearchBudget] = None,
        beam_width: int = 3,
    ) -> None:
        super().__init__(problem, budget=budget)
        if beam_width < 1:
            raise ValueError("beam_width must be >= 1")
        self.beam_width = beam_width

    def _search(self) -> None:
        problem = self.problem
        start = problem.start
        k = self.beam_width
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
                   f=h0, metadata={"beam_width": k})

        came_from: Dict[Cell, Optional[Cell]] = {start: None}
        g_score: Dict[Cell, float] = {start: 0.0}
        in_beam_ever: Set[Cell] = {start}
        beam: List[Cell] = [start]
        self._nodes_generated = 1
        self._max_frontier_size = 1
        level = 0

        while beam:
            self._check_budget()
            level += 1
            # cell -> (rank, g, parent, action); the best route per cell wins.
            candidates: Dict[Cell, Tuple[tuple, float, Cell, Action]] = {}

            for current in beam:
                g = g_score[current]
                depth = level - 1
                h = problem.h(current)
                self._count_expansion()
                self._search_depth = max(self._search_depth, depth)
                self._emit(EventType.NODE_EXPANDED, current,
                           parent=came_from[current], depth=depth, g=g, h=h,
                           f=g + h,
                           metadata={"note": "beam_candidate",
                                     "beam_width": k})

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

                for nxt, action in problem.successors(current):
                    self._check_budget()
                    if nxt in in_beam_ever:
                        continue
                    ng = g + action.cost
                    nh = problem.h(nxt)
                    self._count_generation()
                    rank = (nh, ng, nxt.row, nxt.col)
                    self._emit(EventType.NODE_DISCOVERED, nxt, parent=current,
                               depth=level, g=ng, h=nh, f=ng + nh,
                               metadata={"action": action.label,
                                         "level": level})
                    existing = candidates.get(nxt)
                    if existing is None or rank < existing[0]:
                        candidates[nxt] = (rank, ng, current, action)

            ordered = sorted(candidates.items(), key=lambda kv: kv[1][0])
            retained = ordered[:k]
            pruned = ordered[k:]

            self._emit(EventType.ITERATION_COMPLETED, start, depth=level,
                       g=0.0, h=0.0, f=0.0,
                       metadata={"level": level, "beam_width": k,
                                 "retained": len(retained),
                                 "pruned": len(pruned),
                                 "expanded": len(beam)})

            for cell, (_, ng, parent, action) in pruned:
                nh = problem.h(cell)
                self._emit(EventType.NODE_PRUNED, cell, parent=parent,
                           depth=level, g=ng, h=nh, f=ng + nh,
                           metadata={"action": action.label,
                                     "reason": "beyond_beam_width",
                                     "beam_width": k, "level": level})

            beam = []
            for cell, (_, ng, parent, action) in retained:
                came_from[cell] = parent
                g_score[cell] = ng
                in_beam_ever.add(cell)
                beam.append(cell)
                nh = problem.h(cell)
                self._emit(EventType.NODE_ADDED_TO_FRONTIER, cell,
                           parent=parent, depth=level, g=ng, h=nh,
                           f=ng + nh,
                           metadata={"note": "retained_by_beam",
                                     "beam_width": k})
            self._max_frontier_size = max(self._max_frontier_size, len(beam))

        self._termination_reason = TerminationReason.NO_PATH
        self._emit(EventType.SEARCH_FAILED, start, depth=0,
                   metadata={"reason": "beam_empty", "beam_width": k})
