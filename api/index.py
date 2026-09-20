from __future__ import annotations

import os
import sys
from pathlib import Path

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from backend.db import init_db
from backend.main import app as _app
from scripts.seed import seed

# Auto-initialize and seed demo accounts on startup
try:
    init_db()
    seed()
except Exception as e:
    print(f"[Nexerra Vercel API] Startup note: {e}")


class NormalizedPathMiddleware:
    """Ensure routes are prefixed with /api so FastAPI matches both stripped and non-stripped rewrites."""
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope.get("type") in ("http", "websocket"):
            path = scope.get("path", "")
            if not path.startswith("/api"):
                scope["path"] = "/api" + (path if path.startswith("/") else f"/{path}")
        await self.app(scope, receive, send)


app = NormalizedPathMiddleware(_app)
