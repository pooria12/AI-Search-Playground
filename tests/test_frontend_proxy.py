"""Tests for the static-asset proxy using a fake ``ASSETS`` binding."""

from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.app import app as api_app
from src.api.frontend import register_frontend


class FakeResponse:
    def __init__(self, status, body=b"", headers=None):
        self.status = status
        self._body = body
        self.headers = headers or {}

    async def bytes(self):
        return self._body


class FakeAssets:
    FILES = {
        "index.html": b"<html>app</html>",
        "assets/app.js": b"console.log(1)",
    }

    def __init__(self):
        self.requested = []

    async def fetch(self, url):
        path = url.removeprefix("https://assets.local/")
        self.requested.append(path)
        if path in self.FILES:
            return FakeResponse(200, self.FILES[path], {
                "content-type": "text/html", "content-length": "999",
                "content-encoding": "gzip"})
        return FakeResponse(404)


class Env:
    def __init__(self, assets):
        self.ASSETS = assets


def make_client(assets, with_env=True):
    app = FastAPI()
    app.router.routes.extend(api_app.router.routes)  # real API routes first
    app.exception_handlers.update(api_app.exception_handlers)
    register_frontend(app)

    @app.middleware("http")
    async def inject_env(request, call_next):
        if with_env:
            request.scope["env"] = Env(assets)
        return await call_next(request)

    return TestClient(app)


def test_serves_index_and_assets():
    client = make_client(FakeAssets())
    assert client.get("/").text == "<html>app</html>"
    assert client.get("/assets/app.js").text == "console.log(1)"


def test_transport_headers_are_not_forwarded():
    response = make_client(FakeAssets()).get("/")
    assert response.headers["content-length"] == str(len(response.content))
    assert "content-encoding" not in response.headers


def test_spa_routes_fall_back_to_index_but_missing_files_stay_404():
    client = make_client(FakeAssets())
    assert client.get("/education").text == "<html>app</html>"
    assert client.get("/assets/missing.js").status_code == 404


def test_api_routes_win_and_unknown_api_paths_never_return_html():
    client = make_client(FakeAssets())
    assert client.get("/api/health").json()["status"] == "ok"
    response = client.get("/api/does-not-exist")
    assert response.status_code == 404
    assert response.json()["error"]["code"] == "request_error"


def test_missing_assets_binding_is_a_clear_404():
    response = make_client(None, with_env=False).get("/")
    assert response.status_code == 404
    assert "assets are not bound" in response.json()["error"]["message"]
