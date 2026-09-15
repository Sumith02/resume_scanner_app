from __future__ import annotations

import re
from typing import Any
from .talent_engine import CANONICAL_SKILLS_MAP


def parse_natural_language_query(query: str) -> dict[str, Any]:
    """Interprets recruiter conversational queries into structured parameters."""
    normalized = query.lower()
    
    # 1. Detect skills mentioned
    detected_skills = []
    for term, (canonical, _) in CANONICAL_SKILLS_MAP.items():
        pattern = rf"(?<![a-z0-9+#.]){re.escape(term)}(?=[^a-z0-9+#.]|$)"
        if re.search(pattern, normalized):
            if canonical not in detected_skills:
                detected_skills.append(canonical)

    # 2. Detect experience
    exp_match = re.search(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years|year|yrs|yr)", normalized)
    min_exp = float(exp_match.group(1)) if exp_match else None

    # 3. Detect location
    locations = [
        "bengaluru", "bangalore", "hyderabad", "pune", "mumbai", "delhi", "gurugram", "noida",
        "chennai", "san francisco", "seattle", "new york", "london", "dubai", "remote"
    ]
    detected_location = ""
    for loc in locations:
        if loc in normalized:
            detected_location = "Bengaluru" if loc in ("bengaluru", "bangalore") else loc.title()
            break

    # 4. Seniority
    seniority = ""
    if "lead" in normalized or "staff" in normalized or "principal" in normalized:
        seniority = "Lead / Staff"
    elif "senior" in normalized or "sr" in normalized:
        seniority = "Senior"
    elif "junior" in normalized or "intern" in normalized:
        seniority = "Junior"

    return {
        "rawQuery": query,
        "parsedCriteria": {
            "skills": detected_skills,
            "minExperience": min_exp,
            "location": detected_location,
            "seniority": seniority,
        },
    }


def execute_hybrid_search(
    query: str,
    candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """Parses query and performs hybrid scoring against candidates."""
    parsed = parse_natural_language_query(query)
    criteria = parsed["parsedCriteria"]
    target_skills = [s.lower() for s in criteria["skills"]]
    min_exp = criteria["minExperience"]
    target_loc = criteria["location"].lower()

    ranked = []
    for cand in candidates:
        score = 0
        reasons = []
        cand_skills = [s.get("skillName", "").lower() for s in cand.get("skills", [])]
        cand_skills_flat = {s.lower() for s in cand.get("matchedSkills", [])} | set(cand_skills)
        cand_exp = float(cand.get("experienceYears") or 0)
        cand_loc = (cand.get("location") or "").lower()

        # Skill match score
        if target_skills:
            matched = [s for s in target_skills if s in cand_skills_flat]
            if matched:
                score += round((len(matched) / len(target_skills)) * 50)
                reasons.append(f"Matched skills: {', '.join(s.title() for s in matched)}")
        else:
            score += 25

        # Experience match score
        if min_exp is not None:
            if cand_exp >= min_exp:
                score += 25
                reasons.append(f"{cand_exp:g} yrs experience (meets {min_exp:g}+ req)")
            elif cand_exp >= min_exp * 0.7:
                score += 15
        else:
            score += 20

        # Location match
        if target_loc:
            if target_loc in cand_loc or "remote" in cand_loc:
                score += 25
                reasons.append(f"Location match ({cand.get('location')})")
            else:
                score += 5
        else:
            score += 20

        # Keyword relevance fallback
        q_words = [w for w in query.lower().split() if len(w) > 3]
        text_haystack = f"{cand.get('canonicalName')} {cand.get('currentTitle')} {cand.get('profileSummary')}".lower()
        if any(w in text_haystack for w in q_words):
            score += 10

        final_score = min(99, score)
        if final_score >= 35 or not query.strip():
            ranked.append(
                {
                    "candidate": cand,
                    "relevanceScore": final_score,
                    "reasons": reasons or ["Profile alignment with general search query"],
                }
            )

    ranked.sort(key=lambda item: item["relevanceScore"], reverse=True)
    return {
        "query": query,
        "parsedCriteria": criteria,
        "results": ranked,
        "totalFound": len(ranked),
    }
