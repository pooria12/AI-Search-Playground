"""Cloudflare Workers entry point for AI Search Playground.

Follows the documented Python Workers FastAPI integration
(``Default = asgi.entrypoint(app)``) and serves the React build through the
``ASSETS`` binding. ``wrangler.jsonc`` sets ``run_worker_first`` so API routes
take priority over static files.

Absolute ``src.*`` imports are used on purpose: this file sits next to the
``src`` package, so the same import paths work under pytest and in the Worker.
"""

from workers import asgi

from src.api.app import app
from src.api.frontend import register_frontend

register_frontend(app)  # must stay last: it is the catch-all route

Default = asgi.entrypoint(app)
