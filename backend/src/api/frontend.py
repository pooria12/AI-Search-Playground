"""Serve the built React app through the Workers ``ASSETS`` binding.

Mirrors the documented Python Workers pattern: the Worker runs first, API
routes win, and every other GET is proxied to Workers Static Assets. Unknown
paths without a file extension fall back to ``index.html`` so client-side
routes survive a page refresh.
"""

from __future__ import annotations

from fastapi import FastAPI, Request
from fastapi.responses import Response
from starlette.exceptions import HTTPException

# Headers that describe the *transport* of the proxied asset and would be
# wrong for the re-serialised body.
_DROP_HEADERS = {"content-length", "content-encoding", "transfer-encoding",
                 "connection"}
_ASSET_ORIGIN = "https://assets.local/"


def _looks_like_file(path: str) -> bool:
    last = path.rsplit("/", 1)[-1]
    return "." in last


async def _fetch_asset(assets, path: str):
    response = await assets.fetch(_ASSET_ORIGIN + path)
    if response.status == 404 and not _looks_like_file(path):
        response = await assets.fetch(_ASSET_ORIGIN + "index.html")
    return response


def register_frontend(app: FastAPI) -> None:
    """Add the static-asset catch-all. Call after every API route exists."""

    @app.get("/{path:path}", include_in_schema=False)
    async def frontend(path: str, request: Request):
        if path == "api" or path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not Found")

        env = request.scope.get("env")
        assets = getattr(env, "ASSETS", None) if env is not None else None
        if assets is None:
            raise HTTPException(
                status_code=404,
                detail="frontend assets are not bound (run `npm run build` "
                       "in frontend/ and deploy with wrangler)")

        asset = await _fetch_asset(assets, path or "index.html")
        body = await asset.bytes()
        headers = {k: v for k, v in dict(asset.headers).items()
                   if k.lower() not in _DROP_HEADERS}
        return Response(content=body, status_code=asset.status,
                        headers=headers)
