"""Pydantic request/response schemas for the search API.

All API boundaries use these serializable DTOs. Internal Python objects
(problem, algorithm instances) never leak into responses.
"""

from __future__ import annotations

from typing import Dict, List, Literal, Optional

from pydantic import BaseModel, Field


Movement = Literal["four_way", "eight_way"]
TerrainKind = Literal["normal", "difficult", "high_cost"]


# ---------------------------------------------------------------------------
# shared value objects
# ---------------------------------------------------------------------------

class CellDTO(BaseModel):
    row: int = Field(..., ge=0)
    col: int = Field(..., ge=0)


class TerrainDTO(BaseModel):
    row: int = Field(..., ge=0)
    col: int = Field(..., ge=0)
    type: TerrainKind


class EventDTO(BaseModel):
    seq: int
    type: str
    node: str
    parent: Optional[str]
    depth: int
    g: Optional[float]
    h: Optional[float]
    f: Optional[float]
    metadata: Dict[str, object]


class SearchResultDTO(BaseModel):
    found: bool
    path: List[str]
    path_cost: float
    nodes_explored: int
    nodes_generated: int
    execution_time_ms: float
    max_frontier_size: int
    search_depth: int
    events: List[EventDTO]
    termination_reason: str
    algorithm: str
    limit_reason: Optional[str] = None
    trace_truncated: bool = False


# ---------------------------------------------------------------------------
# environment + algorithm options shared by execute / comparison / validate
# ---------------------------------------------------------------------------

class EnvironmentFields(BaseModel):
    start: CellDTO
    goal: CellDTO
    rows: int = Field(15, ge=1)
    cols: int = Field(20, ge=1)
    movement: Movement = "four_way"
    corner_cutting: bool = False
    obstacles: List[CellDTO] = []
    terrain: List[TerrainDTO] = []


class AlgorithmOptions(BaseModel):
    beam_width: int = Field(3, ge=1, le=1000)
    # None = automatic: the start->goal Manhattan distance, i.e. the smallest
    # limit that can still succeed on an open grid.
    dls_limit: Optional[int] = Field(None, ge=0)
    iddfs_max_depth: int = Field(100, ge=0)
    hill_climbing_sideways: int = Field(0, ge=0, le=1000)


# ---------------------------------------------------------------------------
# algorithms
# ---------------------------------------------------------------------------

class AlgorithmDTO(BaseModel):
    id: str
    name: str
    abbreviation: str
    description: str
    data_structure: str
    optimal: str
    complete: str


class AlgorithmsListDTO(BaseModel):
    algorithms: List[AlgorithmDTO]


# ---------------------------------------------------------------------------
# search execution
# ---------------------------------------------------------------------------

class SearchExecuteRequest(EnvironmentFields, AlgorithmOptions):
    algorithm: str = Field(..., description="algorithm id, e.g. 'astar'")
    # Budget overrides (clamped to the server-side maximums). ``max_events``
    # caps the size of the recorded trace; it never changes the search result.
    max_expanded_nodes: Optional[int] = Field(None, ge=1)
    max_generated_nodes: Optional[int] = Field(None, ge=1)
    max_events: Optional[int] = Field(None, ge=1)
    timeout_ms: Optional[int] = Field(None, ge=1)


class SearchExecuteResponse(BaseModel):
    result: SearchResultDTO


class EnvironmentValidateRequest(EnvironmentFields):
    pass


class EnvironmentValidateResponse(BaseModel):
    valid: bool
    errors: List[str] = []


# ---------------------------------------------------------------------------
# comparison
# ---------------------------------------------------------------------------

class ComparisonRunRequest(EnvironmentFields, AlgorithmOptions):
    algorithms: List[str] = Field(..., min_length=1)


class ComparisonAlgorithmResult(BaseModel):
    algorithm: str
    found: bool
    path_cost: Optional[float]
    path_length: int = 0
    nodes_explored: int
    nodes_generated: int
    execution_time_ms: float
    max_frontier_size: int
    search_depth: int
    termination_reason: str
    limit_reason: Optional[str] = None


class ComparisonResponse(BaseModel):
    environment: dict
    results: List[ComparisonAlgorithmResult]


# ---------------------------------------------------------------------------
# errors
# ---------------------------------------------------------------------------

class ErrorDetail(BaseModel):
    code: str
    message: str
    field: Optional[str] = None


class ErrorResponse(BaseModel):
    error: ErrorDetail
