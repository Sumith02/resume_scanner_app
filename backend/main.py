from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
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
    yield


app = FastAPI(
    title="Nexerra Talent OS API",
    version="1.0.0",
    description="Multi-tenant recruitment operating system — Master Admin → Company → Sub-Users",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
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