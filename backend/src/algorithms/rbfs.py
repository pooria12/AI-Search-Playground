"""Recursive Best-First Search (RBFS).

Strategy: best-first search in linear space. Each call receives an
``f_limit`` (the best alternative f-value on the path above). When the best
child exceeds that limit, the call unwinds and *backs up* the best child's
f-value so the parent can compare it with its alternatives.

Correctness:
- Optimal with an admissible heuristic.
- Dead ends back up an f-value of infinity (never a 0.0 sentinel), so they
  are never reconsidered.
- Cycle avoidance is per current path.
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


class RBFS(BaseSearch):
    name = "Recursive Best-First Search"
    algorithm_id = "rbfs"
    needs_deep_recursion = True

    def __init__(
        self,
        problem: SearchProblem,
        budget: Optional[SearchBudget] = None,
    ) -> None:
        super().__init__(problem, budget=budget)

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
        self._stored = 0
        self._note_frontier(1)

        found, _ = self._rbfs(start, 0.0, h0, math.inf, [start], {start})

        if found:
            self._termination_reason = TerminationReason.SUCCESS
            self._found = True
            self._emit(EventType.PATH_FOUND, problem.goal,
                       parent=self._path[-2], depth=self._search_depth,
                       g=self._path_cost, h=0.0, f=self._path_cost,
                       metadata={"path": [str(c) for c in self._path]})
        else:
            self._termination_reason = TerminationReason.NO_PATH
            self._emit(EventType.SEARCH_FAILED, start, depth=0,
                       metadata={"reason": "space_exhausted"})

    def _rbfs(
        self,
        node: Cell,
        g: float,
        f: float,
        f_limit: float,
        path: List[Cell],
        on_path: Set[Cell],
    ) -> Tuple[bool, float]:
        """One RBFS call. Returns (found, backed_up_f).

        ``path`` ends with ``node``. On success ``self._path`` holds the
        solution; on failure the second value is the best child's f-value
        (``inf`` for a dead end).
        """
        problem = self.problem
        depth = len(path) - 1
        parent = path[-2] if depth > 0 else None
        h = problem.h(node)

        self._check_budget()
        self._count_expansion()
        self._search_depth = max(self._search_depth, depth)
        self._emit(EventType.NODE_EXPANDED, node, parent=parent, depth=depth,
                   g=g, h=h, f=f, metadata={"f_limit": f_limit})

        if problem.is_goal(node):
            self._path = list(path)
            self._path_cost = g
            self._search_depth = depth
            return True, f

        # Memory actually held by this frame: the node plus its child list.
        self._stored += 1

        children: List[Dict] = []
        for nxt, action in problem.successors(node):
            if nxt in on_path:
                continue
            self._check_budget()
            ng = g + action.cost
            nh = problem.h(nxt)
            # Backed-up value: a child is never better than its parent's f.
            child_f = max(f, ng + nh)
            self._count_generation()
            children.append({"node": nxt, "action": action, "g": ng,
                             "h": nh, "f": child_f})
            self._emit(EventType.NODE_DISCOVERED, nxt, parent=node,
                       depth=depth + 1, g=ng, h=nh, f=child_f,
                       metadata={"action": action.label, "f_limit": f_limit})

        self._stored += len(children)
        self._note_frontier(self._stored)
        held = 1 + len(children)
        try:
            return self._best_first_loop(node, g, f, f_limit, depth, parent,
                                         h, children, path, on_path)
        finally:
            self._stored -= held

    def _best_first_loop(
        self,
        node: Cell,
        g: float,
        f: float,
        f_limit: float,
        depth: int,
        parent: Optional[Cell],
        h: float,
        children: List[Dict],
        path: List[Cell],
        on_path: Set[Cell],
    ) -> Tuple[bool, float]:
        """Repeatedly recurse into the best child until it exceeds f_limit."""
        if not children:
            return False, math.inf

        while True:
            children.sort(key=lambda c: (c["f"], c["node"].row, c["node"].col))
            best = children[0]

            if math.isinf(best["f"]) or best["f"] > f_limit + _EPS:
                self._emit(EventType.BACKTRACK, node, parent=parent,
                           depth=depth, g=g, h=h, f=f,
                           metadata={"reason": "best_exceeds_f_limit",
                                     "f_limit": f_limit,
                                     "best_f": best["f"],
                                     "best_alternative": str(best["node"])})
                return False, best["f"]

            alternative = children[1]["f"] if len(children) > 1 else math.inf
            new_limit = min(f_limit, alternative)

            self._emit(EventType.NODE_ADDED_TO_FRONTIER, best["node"],
                       parent=node, depth=depth + 1, g=best["g"],
                       h=best["h"], f=best["f"],
                       metadata={"action": best["action"].label,
                                 "f_limit": new_limit})

            path.append(best["node"])
            on_path.add(best["node"])
            found, backed_up = self._rbfs(best["node"], best["g"], best["f"],
                                          new_limit, path, on_path)
            if found:
                return True, backed_up
            path.pop()
            on_path.discard(best["node"])

            self._emit(EventType.BACKTRACK, best["node"], parent=node,
                       depth=depth + 1, g=best["g"], h=best["h"],
                       f=best["f"],
                       metadata={"reason": "returned_from_recursion",
                                 "backed_up_f": backed_up})
            best["f"] = backed_up
