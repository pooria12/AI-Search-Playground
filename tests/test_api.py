"""API layer tests for the AI Search Playground backend.

Tests the FastAPI routes and service layer independently of the Cloudflare
Workers runtime (which is not available locally).
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from src.api.app import app

client = TestClient(app)


def test_health():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_list_algorithms():
    response = client.get("/api/algorithms")
    assert response.status_code == 200
    algorithms = response.json()
    ids = {a["id"] for a in algorithms}
    expected = {
        "bfs", "dfs", "ucs", "dls", "iddfs", "astar", "greedy",
        "ida_star", "hill_climbing", "beam_search", "rbfs",
    }
    assert expected == ids
    for a in algorithms:
        assert set(a.keys()) >= {
            "id", "name", "abbreviation", "description", "data_structure",
            "optimal", "complete",
        }


def test_get_algorithm():
    response = client.get("/api/algorithms/astar")
    assert response.status_code == 200
    assert response.json()["id"] == "astar"

    response = client.get("/api/algorithms/nope")
    assert response.status_code == 404


def test_execute_bfs():
    payload = {
        "algorithm": "bfs",
        "start": {"row": 0, "col": 0},
        "goal": {"row": 2, "col": 2},
        "rows": 3, "cols": 3,
        "movement": "four_way",
        "obstacles": [],
        "terrain": [],
    }
    response = client.post("/api/search/execute", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["result"]["found"] is True
    assert body["result"]["algorithm"] == "bfs"
    assert body["result"]["path"][0] == "(0,0)"
    assert body["result"]["path"][-1] == "(2,2)"
    assert body["result"]["termination_reason"] == "success"
    assert len(body["result"]["events"]) > 0
    # Events are serially numbered from 1.
    seqs = [e["seq"] for e in body["result"]["events"]]
    assert seqs == list(range(1, len(seqs) + 1))


def test_execute_unknown_algorithm():
    payload = {
        "algorithm": "not_a_real_algorithm",
        "start": {"row": 0, "col": 0},
        "goal": {"row": 1, "col": 1},
        "rows": 3, "cols": 3,
    }
    response = client.post("/api/search/execute", json=payload)
    assert response.status_code == 400


def test_execute_no_path():
    payload = {
        "algorithm": "ucs",
        "start": {"row": 0, "col": 0},
        "goal": {"row": 2, "col": 2},
        "rows": 3, "cols": 3,
        "movement": "four_way",
        "obstacles": [
            {"row": 0, "col": 1},
            {"row": 1, "col": 0},
            {"row": 2, "col": 1},
            {"row": 1, "col": 2},
        ],
        "terrain": [],
    }
    response = client.post("/api/search/execute", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert body["result"]["found"] is False
    assert body["result"]["termination_reason"] in ("no_path", "limit_reached")


def test_validate_environment():
    payload = {
        "rows": 3, "cols": 3,
        "start": {"row": 0, "col": 0},
        "goal": {"row": 2, "col": 2},
        "movement": "four_way",
        "obstacles": [],
        "terrain": [],
    }
    response = client.post("/api/environments/validate", json=payload)
    assert response.status_code == 200
    assert response.json()["valid"] is True

    # Invalid: start out of bounds.
    bad = dict(payload)
    bad["start"] = {"row": 99, "col": 99}
    response = client.post("/api/environments/validate", json=bad)
    assert response.status_code == 200
    assert response.json()["valid"] is False
    assert len(response.json()["errors"]) > 0


def test_comparisons():
    payload = {
        "algorithms": ["bfs", "ucs", "astar", "dfs"],
        "start": {"row": 0, "col": 0},
        "goal": {"row": 2, "col": 2},
        "rows": 3, "cols": 3,
        "movement": "four_way",
        "obstacles": [],
        "terrain": [],
    }
    response = client.post("/api/comparisons", json=payload)
    assert response.status_code == 200
    body = response.json()
    assert len(body["results"]) == 4
    result_ids = {r["algorithm"] for r in body["results"]}
    assert {"bfs", "ucs", "astar", "dfs"} == result_ids
    for r in body["results"]:
        assert set(r.keys()) >= {
            "algorithm", "found", "path_cost", "nodes_explored",
            "nodes_generated", "execution_time_ms", "max_frontier_size",
            "search_depth", "termination_reason",
        }


def test_validate_path_endpoint():
    payload = {
        "algorithm": "astar",
        "start": {"row": 0, "col": 0},
        "goal": {"row": 2, "col": 2},
        "rows": 3, "cols": 3,
    }
    response = client.post("/api/search/validate-path", json=payload)
    assert response.status_code == 200
    assert response.json()["valid"] is True


# ---------------------------------------------------------------------------
# validation, error shape, defaults, limits (added during the audit)
# ---------------------------------------------------------------------------

import pytest

from src.api.limits import DEFAULT_LIMITS, limits_from_env

BASE = {
    "algorithm": "bfs",
    "start": {"row": 0, "col": 0},
    "goal": {"row": 2, "col": 2},
    "rows": 3, "cols": 3,
}


def post(**patch):
    return client.post("/api/search/execute", json={**BASE, **patch})


def assert_error_shape(response, status, code):
    assert response.status_code == status
    error = response.json()["error"]
    assert error["code"] == code and error["message"]


@pytest.mark.parametrize("patch,fragment", [
    ({"start": {"row": 9, "col": 9}}, "start cell out of bounds"),
    ({"goal": {"row": 9, "col": 0}}, "goal cell out of bounds"),
    ({"obstacles": [{"row": 0, "col": 0}]}, "start cell is an obstacle"),
    ({"obstacles": [{"row": 2, "col": 2}]}, "goal cell is an obstacle"),
    ({"obstacles": [{"row": 50, "col": 0}]}, "out of bounds"),
    ({"terrain": [{"row": 0, "col": 9, "type": "difficult"}]},
     "out of bounds"),
    ({"rows": 41}, "rows must be <= 40"),
    ({"cols": 61}, "cols must be <= 60"),
    ({"algorithm": "nope"}, "unknown algorithm"),
])
def test_execute_rejects_unrunnable_searches(patch, fragment):
    response = post(**patch)
    assert_error_shape(response, 400, "invalid_request")
    assert fragment in response.json()["error"]["message"]


@pytest.mark.parametrize("patch", [
    {"movement": "diagonal"},
    {"terrain": [{"row": 0, "col": 1, "type": "lava"}]},
    {"beam_width": 0},
    {"dls_limit": -1},
])
def test_execute_schema_violations_use_documented_error_shape(patch):
    assert_error_shape(post(**patch), 422, "validation_error")


def test_unknown_route_uses_documented_error_shape():
    assert_error_shape(client.get("/api/nope"), 404, "request_error")


def test_default_grid_is_20_columns_by_15_rows():
    body = {k: v for k, v in BASE.items() if k not in ("rows", "cols")}
    body["goal"] = {"row": 14, "col": 19}
    result = client.post("/api/search/execute", json=body).json()["result"]
    assert result["found"] and result["path"][-1] == "(14,19)"


def test_dls_default_limit_is_usable():
    # Previously dls_limit defaulted to 0, so DLS could never find anything.
    result = post(algorithm="dls").json()["result"]
    assert result["found"] is True


def test_comparison_validates_algorithms_and_environment():
    base = {k: v for k, v in BASE.items() if k != "algorithm"}
    bad = client.post("/api/comparisons",
                      json={**base, "algorithms": ["bfs", "nope"]})
    assert_error_shape(bad, 400, "invalid_request")
    oob = client.post("/api/comparisons", json={
        **base, "algorithms": ["bfs"], "start": {"row": 9, "col": 9}})
    assert_error_shape(oob, 400, "invalid_request")
    empty = client.post("/api/comparisons", json={**base, "algorithms": []})
    assert_error_shape(empty, 422, "validation_error")


def test_comparison_passes_algorithm_options_through():
    base = {k: v for k, v in BASE.items() if k != "algorithm"}
    body = client.post("/api/comparisons", json={
        **base, "algorithms": ["dls", "beam_search"], "dls_limit": 0,
    }).json()
    dls = next(r for r in body["results"] if r["algorithm"] == "dls")
    assert dls["found"] is False and dls["limit_reason"] == "depth_limit"


def test_limit_reason_is_reported():
    result = post(algorithm="bfs", max_expanded_nodes=2).json()["result"]
    assert result["termination_reason"] == "limit_reached"
    assert result["limit_reason"] == "max_expanded_nodes"
    assert result["events"][-1]["type"] == "EXECUTION_LIMIT_REACHED"


def test_requests_cannot_exceed_server_budget():
    result = post(max_events=10**9).json()["result"]
    assert len(result["events"]) <= DEFAULT_LIMITS.search_max_events + 1


def test_config_endpoint_reports_limits():
    body = client.get("/api/config").json()
    assert body["max_grid_rows"] == 40 and body["default_grid_cols"] == 20


def test_limits_read_from_worker_env_with_fallbacks():
    limits = limits_from_env({"SEARCH_MAX_GRID_ROWS": "10",
                              "SEARCH_MAX_EVENTS": "not-a-number",
                              "SEARCH_TIMEOUT_MS": "0"})
    assert limits.search_max_grid_rows == 10
    assert limits.search_max_events == DEFAULT_LIMITS.search_max_events
    assert limits.search_timeout_ms == DEFAULT_LIMITS.search_timeout_ms
    assert limits_from_env(None) is DEFAULT_LIMITS


def test_validate_path_endpoint_rejects_bad_environment():
    response = client.post("/api/search/validate-path",
                           json={**BASE, "start": {"row": 9, "col": 9}})
    assert_error_shape(response, 400, "invalid_request")


def test_event_cap_is_reported_as_trace_truncation_not_failure():
    result = post(max_events=5).json()["result"]
    assert result["found"] is True
    assert result["trace_truncated"] is True
    assert result["limit_reason"] is None
    assert result["events"][-1]["type"] == "PATH_FOUND"


def test_comparison_is_not_limited_by_the_trace_size():
    base = {k: v for k, v in BASE.items() if k != "algorithm"}
    body = client.post("/api/comparisons", json={
        **base, "rows": 15, "cols": 20, "goal": {"row": 14, "col": 19},
        "algorithms": ["iddfs", "rbfs", "bfs"], "iddfs_max_depth": 60,
    }).json()
    assert all(r["limit_reason"] != "max_events" for r in body["results"])
