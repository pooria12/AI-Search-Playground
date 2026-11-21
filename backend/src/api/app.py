"""FastAPI application for the AI Search Playground backend.

Defines the REST API routes. Kept separate from the Cloudflare Workers entry
point (``backend/main.py``) so the app can be tested without the Worker
runtime.
"""

from __future__ import annotations

from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from ..algorithms import ALGORITHM_METADATA
from .limits import ServerLimits, limits_from_env
from .schemas import (
    ComparisonResponse,
    ComparisonRunRequest,
    EnvironmentValidateRequest,
    EnvironmentValidateResponse,
    ErrorDetail,
    ErrorResponse,
    SearchExecuteRequest,
    SearchExecuteResponse,
)
from .service import (
    InvalidRequest,
    execute_search,
    list_algorithms,
    run_comparison,
    validate_environment,
)

app = FastAPI(title="AI Search Playground API", version="0.2.0")


def get_limits(request: Request) -> ServerLimits:
    """Limits for this request: Worker ``env`` vars if present, else defaults."""
    return limits_from_env(request.scope.get("env"))


def _error(status: int, code: str, message: str,
           field: str | None = None) -> JSONResponse:
    body = ErrorResponse(error=ErrorDetail(code=code, message=message,
                                           field=field))
    return JSONResponse(status_code=status, content=body.model_dump())


# ---------------------------------------------------------------------------
# routes
# ---------------------------------------------------------------------------

@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "ai-search-playground"}


@app.get("/api/config")
async def config(limits: ServerLimits = Depends(get_limits)):
    """Effective server limits, so the UI can size its controls correctly."""
    return {
        "max_grid_rows": limits.search_max_grid_rows,
        "max_grid_cols": limits.search_max_grid_cols,
        "default_grid_rows": limits.default_grid_rows,
        "default_grid_cols": limits.default_grid_cols,
        "max_events": limits.search_max_events,
    }


@app.get("/api/algorithms", response_model=list[dict])
async def get_algorithms():
    """List all available search algorithms with metadata."""
    return list_algorithms()


@app.get("/api/algorithms/{algorithm_id}", response_model=dict)
async def get_algorithm(algorithm_id: str):
    if algorithm_id not in ALGORITHM_METADATA:
        raise HTTPException(status_code=404, detail="algorithm not found")
    return {"id": algorithm_id, **ALGORITHM_METADATA[algorithm_id]}


@app.post("/api/search/execute", response_model=SearchExecuteResponse)
async def execute(request: SearchExecuteRequest,
                  limits: ServerLimits = Depends(get_limits)):
    return SearchExecuteResponse(result=execute_search(request, limits))


@app.post("/api/environments/validate",
          response_model=EnvironmentValidateResponse)
async def validate_env(request: EnvironmentValidateRequest,
                       limits: ServerLimits = Depends(get_limits)):
    return validate_environment(request, limits)


@app.post("/api/comparisons", response_model=ComparisonResponse)
async def comparisons(payload: ComparisonRunRequest,
                      limits: ServerLimits = Depends(get_limits)):
    return run_comparison(payload, limits)


@app.post("/api/search/validate-path")
async def validate_path(request: SearchExecuteRequest,
                        limits: ServerLimits = Depends(get_limits)):
    """Check that a search configuration is runnable without executing it."""
    from ..algorithms import ALGORITHM_REGISTRY
    if request.algorithm not in ALGORITHM_REGISTRY:
        raise InvalidRequest(f"unknown algorithm: {request.algorithm}")
    result = validate_environment(
        EnvironmentValidateRequest(**request.model_dump(
            include=set(EnvironmentValidateRequest.model_fields))), limits)
    if not result.valid:
        raise InvalidRequest("; ".join(result.errors))
    return {"valid": True, "algorithm": request.algorithm}


# ---------------------------------------------------------------------------
# error handling: every error uses the documented {"error": {...}} shape
# ---------------------------------------------------------------------------

@app.exception_handler(InvalidRequest)
async def invalid_request_handler(request: Request, exc: InvalidRequest):
    return _error(400, "invalid_request", str(exc))


@app.exception_handler(RequestValidationError)
async def validation_handler(request: Request, exc: RequestValidationError):
    first = exc.errors()[0] if exc.errors() else {}
    loc = ".".join(str(p) for p in first.get("loc", ()) if p != "body")
    message = first.get("msg", "invalid request")
    return _error(422, "validation_error",
                  f"{loc}: {message}" if loc else message, field=loc or None)


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request,
                                 exc: StarletteHTTPException):
    return _error(exc.status_code, "request_error", str(exc.detail))


@app.exception_handler(Exception)
async def unexpected_error_handler(request: Request, exc: Exception):
    # A bug, not a client error: say so plainly without leaking internals.
    return _error(500, "internal_error", "internal server error")
