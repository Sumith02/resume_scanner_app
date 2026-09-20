"""Rule-based recruiting Copilot (Phase 3).

Parses a natural-language hiring question into structured candidate filters,
runs the tenant-scoped search, and returns an explainable answer. It is
deliberately offline/deterministic; the `interpret`/`answer` seam allows an LLM
to be swapped in without touching the API layer.
"""
from __future__ import annotations

import re

from sqlalchemy.orm import Session

from backend.models import Candidate
from backend.resume_service import SKILL_LEXICON

_STAGES = {
    "new": "NEW", "parsed": "PARSED", "review": "IN_REVIEW",
    "reviewing": "IN_REVIEW", "shortlist": "SHORTLISTED",
    "shortlisted": "SHORTLISTED", "interview": "INTERVIEW",
    "interviewing": "INTERVIEW", "offer": "OFFER", "offered": "OFFER",
    "onboarding": "ONBOARDING", "placed": "PLACED", "hired": "PLACED",
    "rejected": "REJECTED",
}
_YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)", re.IGNORECASE)
_LOCATION_RE = re.compile(r"\b(?:in|near|around|based in)\s+([A-Z][a-zA-Z]+(?:[\s,]+[A-Z][a-zA-Z]+)?)")


def interpret(query: str) -> dict:
    q = (query or "").strip()
    lower = q.lower()

    skills = [s for s in SKILL_LEXICON if re.search(rf"\b{re.escape(s)}\b", lower)]

    stages = []
    for word, stage in _STAGES.items():
        if re.search(rf"\b{word}\b", lower) and stage not in stages:
            stages.append(stage)

    m = _YEARS_RE.search(lower)
    min_experience = int(m.group(1)) if m else None

    location = None
    lm = _LOCATION_RE.search(q)
    if lm:
        location = lm.group(1).strip()

    # Free-text remainder (title-ish keywords) minus recognized tokens.
    keywords = []
    stop = {"find", "show", "me", "all", "candidates", "candidate", "with",
            "who", "have", "has", "the", "and", "or", "for", "in", "near",
            "around", "based", "years", "year", "yrs", "experience", "stage",
            "status", "list", "get", "top", "best", "please"}
    for token in re.findall(r"[a-zA-Z][a-zA-Z+#.\-]{1,}", lower):
        if token not in stop and token not in skills and not token.isdigit():
            keywords.append(token)
    return {
        "skills": skills,
        "stages": stages,
        "min_experience": min_experience,
        "location": location,
        "keywords": keywords[:6],
    }


def answer(db: Session, org_id: int, query: str, limit: int = 20) -> dict:
    criteria = interpret(query)

    candidates = (
        db.query(Candidate)
        .filter(Candidate.organization_id == org_id)
        .all()
    )

    matches = []
    for c in candidates:
        if criteria["min_experience"] is not None and (c.experience_years or 0) < criteria["min_experience"]:
            continue
        if criteria["stages"] and _stage_value(c.stage) not in criteria["stages"]:
            continue
        if criteria["location"] and criteria["location"].lower() not in (c.location or "").lower():
            continue
        if criteria["skills"]:
            have = {s.lower() for s in (c.skills or [])}
            if not all(s.lower() in have for s in criteria["skills"]):
                continue
        matches.append(c)

    matches.sort(key=lambda c: (len(set(map(str.lower, c.skills or [])) & set(criteria["skills"])), c.experience_years or 0), reverse=True)
    matches = matches[:limit]

    message = _summarize(criteria, len(matches), len(candidates))
    return {"query": query, "criteria": criteria, "count": len(matches), "message": message, "candidates": matches}


def _stage_value(stage) -> str:
    return stage.value if hasattr(stage, "value") else str(stage)


def _summarize(criteria: dict, found: int, total: int) -> str:
    bits = []
    if criteria["skills"]:
        bits.append("skills " + ", ".join(criteria["skills"]))
    if criteria["min_experience"]:
        bits.append(f"{criteria['min_experience']}+ years experience")
    if criteria["stages"]:
        bits.append("stage " + "/".join(criteria["stages"]))
    if criteria["location"]:
        bits.append(f"located in {criteria['location']}")
    if criteria["keywords"]:
        bits.append("matching '" + ", ".join(criteria["keywords"]) + "'")

    if not bits:
        return f"Showing {found} of {total} candidates in your talent database."
    return f"Found {found} of {total} candidates with " + "; ".join(bits) + "."
