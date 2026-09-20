"""Deterministic candidate↔job matching (Phase 3).

Produces an explainable 0-100 fit score from skill overlap, title similarity,
experience fit, and location — no external model or API key required. The
interface (`match_candidate`) is intentionally small so an embeddings/LLM
scorer can replace the internals later.
"""
from __future__ import annotations

import re

_STOP = {
    "senior", "junior", "staff", "lead", "principal", "head", "of", "and",
    "the", "a", "an", "engineer", "developer", "manager", "specialist",
}

_YEARS_RE = re.compile(r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)", re.IGNORECASE)


def required_years(requirements: str | None) -> int:
    if not requirements:
        return 0
    m = _YEARS_RE.search(requirements)
    return int(m.group(1)) if m else 0


def _tokens(value: str | None) -> set[str]:
    if not value:
        return set()
    words = re.findall(r"[a-zA-Z][a-zA-Z+#.\-]{1,}", value.lower())
    return {w for w in words if w not in _STOP and len(w) > 1}


def match_candidate(candidate, job) -> dict:
    job_skills = {s.lower().strip() for s in (job.skills or []) if s.strip()}
    cand_skills = {s.lower().strip() for s in (candidate.skills or []) if s.strip()}

    matched = sorted(job_skills & cand_skills)
    missing = sorted(job_skills - cand_skills)

    # 1) Skill coverage — the dominant signal (55 pts).
    skill_score = (len(matched) / len(job_skills)) * 55 if job_skills else 0.0

    # 2) Title similarity (15 pts).
    job_tokens = _tokens(job.title)
    title_tokens = _tokens(candidate.current_title)
    title_score = (len(job_tokens & title_tokens) / len(job_tokens)) * 15 if job_tokens else 0.0

    # 3) Experience fit (20 pts).
    req = required_years(job.requirements)
    exp = candidate.experience_years or 0
    if req == 0:
        exp_score = 12.0 if exp > 0 else 4.0
    elif exp >= req:
        # Slight preference for near-req over grossly over-qualified.
        exp_score = 20.0 - min(6.0, max(0, exp - req) * 0.5)
    else:
        exp_score = max(0.0, (exp / req) * 20.0)

    # 4) Location (10 pts).
    loc_score = 0.0
    if job.location and candidate.location:
        jl, cl = job.location.lower(), candidate.location.lower()
        if jl == cl:
            loc_score = 10.0
        elif "remote" in jl or "remote" in cl:
            loc_score = 8.0
        elif _tokens(jl) & _tokens(cl):
            loc_score = 6.0
    elif not job.location:
        loc_score = 5.0

    score = round(min(100.0, skill_score + title_score + exp_score + loc_score), 1)

    reasons = []
    if matched:
        reasons.append(f"Matches {len(matched)}/{len(job_skills)} required skills")
    if missing:
        reasons.append(f"Missing: {', '.join(missing[:5])}")
    if req:
        reasons.append(f"{exp}y experience vs {req}y required")
    if loc_score >= 8:
        reasons.append("Location aligned")

    return {
        "score": score,
        "matched_skills": matched,
        "missing_skills": missing,
        "skill_coverage": round((len(matched) / len(job_skills) * 100), 1) if job_skills else 0.0,
        "required_years": req,
        "reasons": reasons,
        "band": "strong" if score >= 70 else "possible" if score >= 45 else "weak",
    }


def rank_candidates(candidates, job, threshold: float = 0.0, limit: int = 50) -> list[dict]:
    scored = []
    for c in candidates:
        result = match_candidate(c, job)
        if result["score"] >= threshold:
            scored.append({"candidate": c, **result})
    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:limit]