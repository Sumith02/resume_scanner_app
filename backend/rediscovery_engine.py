from __future__ import annotations

from typing import Any

from .match_engine import compute_multidimensional_match


def rediscover_candidates_for_job(
    job: dict[str, Any] | None,
    all_candidates: list[dict[str, Any]],
    applications: list[dict[str, Any]] | None = None,
    min_score: int = 60,
) -> dict[str, Any]:
    """Scans historical candidate database to surface candidates who fit a newly created job or requirement."""
    matches = []
    job = job or {
        "title": "Software Engineer",
        "description": "Software development, architecture, and system engineering",
        "location": "Any",
    }
    all_candidates = all_candidates or []
    
    # Map past candidate application statuses
    app_status_by_candidate: dict[str, list[str]] = {}
    if applications:
        for app in applications:
            cand_id = app.get("candidateId") or app.get("id")
            if cand_id:
                app_status_by_candidate.setdefault(cand_id, []).append(app.get("status", "new"))

    for candidate in all_candidates:
        try:
            match_result = compute_multidimensional_match(candidate, job)
            score = int(match_result.get("overallScore", 0))
            if score < min_score:
                continue

            cand_id = candidate.get("id", "")
            past_statuses = app_status_by_candidate.get(cand_id, ["new"])

            # Determine Rediscovery Categorization & Tag
            if any(s == "interview" for s in past_statuses):
                historical_tag = "Previously interviewed (Strong prior candidate)"
                rediscovery_reason = "Interviewed previously for an engineering opening; strong skill overlap with current requirements."
            elif any(s == "shortlisted" for s in past_statuses):
                historical_tag = "Previously shortlisted"
                rediscovery_reason = "Shortlisted in earlier cycle; profile was qualified but unhired due to headcount."
            elif any(s == "rejected" for s in past_statuses):
                historical_tag = "Applied previously (Different job profile)"
                rediscovery_reason = "Applied previously for a different role; fits this opening significantly better."
            else:
                historical_tag = "Historical candidate in database"
                matched_skills = match_result.get("matchedSkills", [])
                skills_str = ", ".join(matched_skills[:3]) if matched_skills else "technical competencies"
                rediscovery_reason = f"Existing database talent with verified alignment in {skills_str}."

            matches.append(
                {
                    "candidate": candidate,
                    "match": match_result,
                    "historicalTag": historical_tag,
                    "rediscoveryReason": rediscovery_reason,
                    "overallScore": score,
                }
            )
        except Exception:
            continue

    # Sort descending by match score
    matches.sort(key=lambda m: m["overallScore"], reverse=True)

    summary_counts = {
        "totalSearched": len(all_candidates),
        "strongMatches": len(matches),
        "previouslyInterviewed": sum(1 for m in matches if "interviewed" in m["historicalTag"].lower()),
        "previouslyShortlisted": sum(1 for m in matches if "shortlisted" in m["historicalTag"].lower()),
        "otherHistorical": sum(
            1
            for m in matches
            if "interviewed" not in m["historicalTag"].lower() and "shortlisted" not in m["historicalTag"].lower()
        ),
    }

    return {
        "jobTitle": job.get("title", "Target Role"),
        "metrics": summary_counts,
        "results": matches,
    }
