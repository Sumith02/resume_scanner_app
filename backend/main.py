from __future__ import annotations

import os
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from backend.db import init_db
from backend.routers import (
    analytics,
    auth,
    billing,
    candidates,
    email,
    interviews,
    jobs,
    master,
    offers,
    onboarding,
    org,
    pools,
    portal,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    is_testing = "pytest" in sys.modules or "PYTEST_CURRENT_TEST" in os.environ
    if not is_testing:
        try:
            from scripts.seed import seed

            seed()
        except Exception:
            pass
    yield


app = FastAPI(
    title="Nexerra Talent OS API",
    version="1.0.0",
    description="Multi-tenant recruitment operating system — Master Admin → Company → Sub-Users",
    lifespan=lifespan,
)


_initialized = False


@app.middleware("http")
async def ensure_api_prefix(request: Request, call_next):
    global _initialized
    if not _initialized:
        _initialized = True
        try:
            init_db()
            is_testing = "pytest" in sys.modules or "PYTEST_CURRENT_TEST" in os.environ
            if not is_testing:
                from scripts.seed import seed

                seed()
        except Exception:
            pass

    path = request.scope.get("path", "")
    if not path.startswith("/api"):
        request.scope["path"] = "/api" + (path if path.startswith("/") else f"/{path}")

    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

from starlette.exceptions import HTTPException as StarletteHTTPException
from fastapi.responses import JSONResponse

@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=getattr(exc, "headers", None),
    )

@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    import traceback
    tb = traceback.format_exc()
    print("UNHANDLED ERROR ON", request.url.path, ":", tb)
    return JSONResponse(
        status_code=500,
        content={
            "detail": f"{type(exc).__name__}: {str(exc)}",
            "error_type": type(exc).__name__,
            "traceback": tb.splitlines()[-4:],
        },
    )

app.include_router(auth.router)
app.include_router(master.router)
app.include_router(org.router)
app.include_router(jobs.router)
app.include_router(candidates.router)
app.include_router(pools.router)
app.include_router(interviews.router)
app.include_router(offers.router)
app.include_router(onboarding.router)
app.include_router(email.router)
app.include_router(billing.router)
app.include_router(analytics.router)
app.include_router(portal.router)


@app.get("/")
@app.get("/api")
@app.get("/api/")
@app.get("/api/health")
def health():
    return {"status": "ok", "service": "nexerra-talent-os"}