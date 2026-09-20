from __future__ import annotations

import os
import sys
import traceback
from pathlib import Path

# Ensure project root is in sys.path
ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

try:
    from backend.db import init_db
    from backend.main import app as main_app

    # Ensure database schema is created
    init_db()

    try:
        from scripts.seed import seed
        seed()
    except Exception as seed_err:
        print(f"[Nexerra Vercel API] Seed note: {seed_err}")

    app = main_app

except Exception as import_err:
    from fastapi import FastAPI
    from fastapi.responses import JSONResponse

    app = FastAPI(title="Nexerra Fallback Error Handler")
    tb = traceback.format_exc()
    print(f"[Nexerra Vercel API Error] {tb}")

    @app.api_route("/{full_path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
    async def fallback_route(full_path: str):
        return JSONResponse(
            status_code=500,
            content={
                "error": "Serverless initialization failed",
                "message": str(import_err),
                "traceback": tb.splitlines(),
                "python": sys.version,
                "cwd": os.getcwd(),
                "sys_path": sys.path,
            },
        )
