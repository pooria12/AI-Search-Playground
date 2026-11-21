"""API service layer.

Translates HTTP request DTOs into search problems, validates them, enforces
server-side execution budgets, runs algorithms, and serializes results back
to DTOs. Internal Python objects never leak into responses.
"""

from __future__ import annotations

from typing import List

from ..algorithms import ALGORITHM_METADATA, ALGORITHM_REGISTRY
from ..algorithms.base import SearchBudget
from ..core.grid import GridConfig, GridEnvironment, build_problem
from ..core.problem import Cell, MovementMode, SearchProblem, TerrainType
from .limits import DEFAULT_LIMITS, ServerLimits
from .schemas import (
    ComparisonAlgorithmResult,
    ComparisonResponse,
    ComparisonRunRequest,
    EnvironmentFields,
    EnvironmentValidateRequest,
    EnvironmentValidateResponse,
    SearchExecuteRequest,
    SearchResultDTO,
)

MAX_ERRORS = 10


class InvalidRequest(ValueError):
    """The request is well-formed JSON but describes an unrunnable search."""


# ---------------------------------------------------------------------------
# environment construction + validation
# ---------------------------------------------------------------------------

def _movement(env: EnvironmentFields) -> MovementMode:
    return (MovementMode.EIGHT_WAY if env.movement == "eight_way"
            else MovementMode.FOUR_WAY)


def _build_config(env: EnvironmentFields) -> GridConfig:
    return GridConfig(
        rows=env.rows,
        cols=env.cols,
        movement=_movement(env),
        corner_cutting=env.corner_cutting,
        terrain={(t.row, t.col): TerrainType(t.type) for t in env.terrain},
        obstacles=[Cell(o.row, o.col) for o in env.obstacles],
    )


def environment_errors(env: EnvironmentFields,
                       limits: ServerLimits = DEFAULT_LIMITS) -> List[str]:
    """Return human-readable problems with an environment (empty if valid)."""
    errors: List[str] = []

    if env.rows > limits.search_max_grid_rows:
        errors.append(
            f"rows must be <= {limits.search_max_grid_rows} (got {env.rows})")
    if env.cols > limits.search_max_grid_cols:
        errors.append(
            f"cols must be <= {limits.search_max_grid_cols} (got {env.cols})")
    if errors:
        return errors

    def in_bounds(row: int, col: int) -> bool:
        return 0 <= row < env.rows and 0 <= col < env.cols

    start = Cell(env.start.row, env.start.col)
    goal = Cell(env.goal.row, env.goal.col)
    if not in_bounds(start.row, start.col):
        errors.append("start cell out of bounds")
    if not in_bounds(goal.row, goal.col):
        errors.append("goal cell out of bounds")

    obstacles = {(o.row, o.col) for o in env.obstacles}
    if (start.row, start.col) in obstacles:
        errors.append("start cell is an obstacle")
    if (goal.row, goal.col) in obstacles:
        errors.append("goal cell is an obstacle")

    for o in env.obstacles:
        if not in_bounds(o.row, o.col):
            errors.append(f"obstacle ({o.row},{o.col}) out of bounds")
    for t in env.terrain:
        if not in_bounds(t.row, t.col):
            errors.append(f"terrain ({t.row},{t.col}) out of bounds")
    return errors[:MAX_ERRORS]


def validate_environment(
    req: EnvironmentValidateRequest,
    limits: ServerLimits = DEFAULT_LIMITS,
) -> EnvironmentValidateResponse:
    errors = environment_errors(req, limits)
    return EnvironmentValidateResponse(valid=not errors, errors=errors)


def _require_valid(env: EnvironmentFields, limits: ServerLimits) -> None:
    errors = environment_errors(env, limits)
    if errors:
        raise InvalidRequest("; ".join(errors))


def _build_problem(env: EnvironmentFields) -> SearchProblem:
    return build_problem(_build_config(env),
                         Cell(env.start.row, env.start.col),
                         Cell(env.goal.row, env.goal.col))


# ---------------------------------------------------------------------------
# execution
# ---------------------------------------------------------------------------

def _build_budget(req: SearchExecuteRequest,
                  limits: ServerLimits) -> SearchBudget:
    def pick(requested, maximum):
        return min(requested, maximum) if requested else maximum

    return SearchBudget(
        max_expanded_nodes=pick(req.max_expanded_nodes,
                                limits.search_max_expanded_nodes),
        max_generated_nodes=pick(req.max_generated_nodes,
                                 limits.search_max_generated_nodes),
        max_events=pick(req.max_events, limits.search_max_events),
        timeout_ms=pick(req.timeout_ms, limits.search_timeout_ms),
    )


def _algorithm_kwargs(req: SearchExecuteRequest) -> dict:
    """Constructor options for algorithms that take them."""
    if req.algorithm == "beam_search":
        return {"beam_width": req.beam_width}
    if req.algorithm == "hill_climbing":
        return {"sideways_moves": req.hill_climbing_sideways}
    if req.algorithm == "iddfs":
        return {"max_depth": min(req.iddfs_max_depth, req.rows * req.cols)}
    if req.algorithm == "dls":
        if req.dls_limit is not None:
            return {"limit": req.dls_limit}
        manhattan = (abs(req.start.row - req.goal.row)
                     + abs(req.start.col - req.goal.col))
        return {"limit": manhattan}
    return {}


def execute_search(req: SearchExecuteRequest,
                   limits: ServerLimits = DEFAULT_LIMITS) -> SearchResultDTO:
    if req.algorithm not in ALGORITHM_REGISTRY:
        raise InvalidRequest(f"unknown algorithm: {req.algorithm}")
    _require_valid(req, limits)

    problem = _build_problem(req)
    algorithm = ALGORITHM_REGISTRY[req.algorithm](
        problem, budget=_build_budget(req, limits),
        **_algorithm_kwargs(req))
    return SearchResultDTO(**algorithm.run().to_dict())


def list_algorithms() -> list[dict]:
    return [{"id": aid, **meta} for aid, meta in ALGORITHM_METADATA.items()]


def run_comparison(req: ComparisonRunRequest,
                   limits: ServerLimits = DEFAULT_LIMITS) -> ComparisonResponse:
    unknown = [a for a in req.algorithms if a not in ALGORITHM_REGISTRY]
    if unknown:
        raise InvalidRequest(f"unknown algorithm(s): {', '.join(unknown)}")
    _require_valid(req, limits)

    environment = {
        "rows": req.rows,
        "cols": req.cols,
        "movement": req.movement,
        "corner_cutting": req.corner_cutting,
        "start": {"row": req.start.row, "col": req.start.col},
        "goal": {"row": req.goal.row, "col": req.goal.col},
        "obstacles": [{"row": o.row, "col": o.col} for o in req.obstacles],
        "terrain": [{"row": t.row, "col": t.col, "type": t.type}
                    for t in req.terrain],
    }
    shared = req.model_dump(exclude={"algorithms"})
    # A comparison only needs the statistics, not the animation trace.
    shared["max_events"] = 1

    results: list[ComparisonAlgorithmResult] = []
    for aid in dict.fromkeys(req.algorithms):  # de-duplicate, keep order
        result = execute_search(
            SearchExecuteRequest(algorithm=aid, **shared), limits)
        results.append(ComparisonAlgorithmResult(
            algorithm=aid,
            found=result.found,
            path_cost=result.path_cost if result.found else None,
            path_length=len(result.path),
            nodes_explored=result.nodes_explored,
            nodes_generated=result.nodes_generated,
            execution_time_ms=result.execution_time_ms,
            max_frontier_size=result.max_frontier_size,
            search_depth=result.search_depth,
            termination_reason=result.termination_reason,
            limit_reason=result.limit_reason,
        ))
    return ComparisonResponse(environment=environment, results=results)
