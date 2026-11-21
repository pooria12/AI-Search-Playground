"""Server-side execution limits.

Defaults mirror the ``vars`` block in ``wrangler.jsonc``. In a deployed Worker
the values are read from the Worker ``env`` bindings of each request, so they
can be tuned in configuration without code changes. Requests may ask for
*lower* budgets but never exceed these maximums.
"""

from __future__ import annotations

from dataclasses import dataclass, fields
from typing import Any, Optional


@dataclass(frozen=True)
class ServerLimits:
    search_max_expanded_nodes: int = 20000
    search_max_generated_nodes: int = 50000
    search_max_events: int = 20000
    search_max_grid_cols: int = 60
    search_max_grid_rows: int = 40
    search_timeout_ms: int = 8000
    default_grid_cols: int = 20
    default_grid_rows: int = 15


DEFAULT_LIMITS = ServerLimits()


def _read(env: Any, name: str) -> Optional[int]:
    """Read one setting from a Worker env object or a plain mapping."""
    value = None
    try:
        if isinstance(env, dict):
            value = env.get(name)
        else:
            value = getattr(env, name, None)
    except Exception:  # noqa: BLE001 - foreign (JS proxy) objects can raise
        return None
    if value is None:
        return None
    try:
        number = int(str(value))
    except (TypeError, ValueError):
        return None
    return number if number >= 1 else None


def limits_from_env(env: Any) -> ServerLimits:
    """Build limits from an env object, falling back to defaults per field."""
    if env is None:
        return DEFAULT_LIMITS
    overrides = {}
    for f in fields(ServerLimits):
        value = _read(env, f.name.upper())
        if value is not None:
            overrides[f.name] = value
    return ServerLimits(**overrides) if overrides else DEFAULT_LIMITS
