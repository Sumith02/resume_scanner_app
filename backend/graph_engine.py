"""Resume Scanner - Talent Graph Engine
Constructs multi-relational talent knowledge graphs connecting Candidates,
Skills, Experience Roles, Alumni Companies, Education, Locations,
Jobs Applied, Interview History, and Similar Candidate clusters.
"""

from __future__ import annotations

import re
from typing import Any


def _slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-zA-Z0-9]+", "-", text.strip().lower())
    return cleaned.strip("-") or "unknown"


def calculate_candidate_similarity(c1: dict[str, Any], c2: dict[str, Any]) -> tuple[int, list[str]]:
    """Calculates similarity score (0-100) and rationale between two candidates."""
    if c1.get("id") == c2.get("id"):
        return 0, []

    skills_1 = set(s.lower() for s in (c1.get("matchedSkills") or []) if isinstance(s, str))
    skills_2 = set(s.lower() for s in (c2.get("matchedSkills") or []) if isinstance(s, str))

    shared_skills = skills_1.intersection(skills_2)
    union_skills = skills_1.union(skills_2)

    skill_jaccard = (len(shared_skills) / len(union_skills)) if union_skills else 0.0

    # Companies overlap
    companies_1 = {
        exp.get("company", "").strip().lower()
        for exp in (c1.get("experiences") or [])
        if isinstance(exp, dict) and exp.get("company")
    }
    companies_2 = {
        exp.get("company", "").strip().lower()
        for exp in (c2.get("experiences") or [])
        if isinstance(exp, dict) and exp.get("company")
    }
    shared_companies = companies_1.intersection(companies_2)

    # Experience years proximity
    exp1 = float(c1.get("experienceYears") or 0.0)
    exp2 = float(c2.get("experienceYears") or 0.0)
    exp_diff = abs(exp1 - exp2)
    exp_score = max(0.0, 1.0 - (exp_diff / 8.0))

    # Composite weighted similarity score (0 - 100)
    composite = (skill_jaccard * 0.60) + (min(1.0, len(shared_companies) * 0.5) * 0.25) + (exp_score * 0.15)
    score = int(round(composite * 100))

    reasons = []
    if shared_skills:
        formatted_skills = [s.title() for s in sorted(shared_skills)]
        reasons.append(f"Shared {len(shared_skills)} skills ({', '.join(formatted_skills[:3])})")
    if shared_companies:
        formatted_companies = [c.title() for c in sorted(shared_companies)]
        reasons.append(f"Both worked at {', '.join(formatted_companies[:2])}")
    if exp_diff <= 2:
        reasons.append(f"Similar experience level (~{int(exp1)} yrs)")

    return score, reasons


def build_candidate_talent_graph(
    candidate: dict[str, Any],
    all_candidates: list[dict[str, Any]],
    jobs: list[dict[str, Any]] | None = None,
    events: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Builds a complete, 1st-degree relational Talent Graph centered around a candidate."""
    cand_id = candidate.get("id", "cand-unknown")
    cand_name = candidate.get("canonicalName", "Anonymous Candidate")
    cand_title = candidate.get("currentTitle") or candidate.get("primaryDomain") or "Professional"

    nodes: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []
    seen_node_ids: set[str] = set()

    def add_node(node_id: str, label: str, node_type: str, metadata: dict[str, Any] | None = None) -> None:
        if node_id not in seen_node_ids:
            seen_node_ids.add(node_id)
            node_data = {
                "id": node_id,
                "label": label,
                "type": node_type,
            }
            if metadata:
                node_data.update(metadata)
            nodes.append(node_data)

    def add_link(source: str, target: str, relation: str, label: str = "", weight: float = 1.0) -> None:
        links.append({
            "source": source,
            "target": target,
            "relation": relation,
            "label": label,
            "weight": weight,
        })

    # 1. Root Candidate Node
    add_node(
        cand_id,
        cand_name,
        "candidate",
        {
            "currentTitle": cand_title,
            "location": candidate.get("location"),
            "experienceYears": candidate.get("experienceYears"),
            "dataQualityScore": candidate.get("dataQualityScore", 90),
            "blindId": candidate.get("blindId"),
            "status": candidate.get("status", "new"),
        },
    )

    # 2. Skill Nodes
    for sk in (candidate.get("skills") or []):
        if not isinstance(sk, dict):
            continue
        name = sk.get("skillName", "")
        norm = sk.get("normalizedSkill", name)
        node_id = f"skill:{_slugify(norm)}"
        add_node(node_id, name, "skill", {
            "category": sk.get("category", "General"),
            "proficiency": sk.get("proficiency", "Proficient"),
            "evidence": sk.get("evidenceText", ""),
        })
        add_link(cand_id, node_id, "HAS_SKILL", sk.get("proficiency", "Proficient"), weight=1.0)

    # 3. Experience: Roles & Companies Nodes
    for exp in (candidate.get("experiences") or []):
        if not isinstance(exp, dict):
            continue
        company = exp.get("company", "").strip()
        title = exp.get("title", "").strip()
        dates = f"{exp.get('startDate', '')} - {exp.get('endDate', '')}".strip(" -")

        if company:
            company_node_id = f"company:{_slugify(company)}"
            add_node(company_node_id, company, "company", {"entity": "Alumni Employer"})
            add_link(cand_id, company_node_id, "WORKED_AT", dates or "Tenure", weight=0.9)

        if title:
            role_node_id = f"role:{_slugify(title)}"
            add_node(role_node_id, title, "role", {"entity": "Position Title"})
            add_link(cand_id, role_node_id, "HELD_ROLE", dates or "Role", weight=0.8)

    # 4. Education Nodes
    for edu in (candidate.get("educations") or []):
        if not isinstance(edu, dict):
            continue
        inst = edu.get("institution", "").strip()
        degree = edu.get("degree", "").strip()
        field = edu.get("field", "").strip()
        label = f"{degree} in {field}" if (degree and field) else (degree or inst or "Degree")
        edu_node_id = f"edu:{_slugify(inst or label)}"

        add_node(edu_node_id, label, "education", {
            "institution": inst,
            "degree": degree,
            "field": field,
        })
        add_link(cand_id, edu_node_id, "STUDIED_AT", inst, weight=0.7)

    # 5. Location Node
    loc = candidate.get("location", "").strip()
    if loc:
        loc_node_id = f"loc:{_slugify(loc)}"
        add_node(loc_node_id, loc, "location", {"region": candidate.get("region", "")})
        add_link(cand_id, loc_node_id, "BASED_IN", "Location", weight=0.6)

    # 6. Jobs Applied / Matched
    if jobs:
        for job in jobs:
            job_id = job.get("id")
            title = job.get("title")
            req_skills = set(s.lower() for s in (job.get("requiredSkills") or []) if isinstance(s, str))
            cand_skills = set(s.lower() for s in (candidate.get("matchedSkills") or []) if isinstance(s, str))
            overlap = req_skills.intersection(cand_skills)

            # If there is meaningful skill overlap or candidate applied
            if overlap or len(req_skills) == 0:
                match_pct = int((len(overlap) / len(req_skills)) * 100) if req_skills else 75
                if match_pct >= 40:
                    job_node_id = f"job:{job_id}"
                    add_node(job_node_id, title, "job", {
                        "department": job.get("department", "Engineering"),
                        "matchScore": match_pct,
                    })
                    add_link(cand_id, job_node_id, "APPLIED_TO", f"{match_pct}% Match", weight=0.85)

    # 7. Interview History Nodes
    status = candidate.get("status")
    if status in ["screening", "interview", "offer", "hired", "rejected"]:
        interview_node_id = f"interview:{status}"
        stage_title = f"{status.capitalize()} Stage"
        add_node(interview_node_id, stage_title, "interview", {"stage": status})
        add_link(cand_id, interview_node_id, "INTERVIEW_HISTORY", f"Stage: {stage_title}", weight=0.8)

    # 8. Similar Candidates Nodes (Derived relational clustering)
    similar_list: list[dict[str, Any]] = []
    for other in all_candidates:
        if other.get("id") == cand_id:
            continue
        sim_score, reasons = calculate_candidate_similarity(candidate, other)
        if sim_score >= 25:
            other_id = other.get("id", "")
            add_node(other_id, other.get("canonicalName", "Candidate"), "similar_candidate", {
                "currentTitle": other.get("currentTitle") or other.get("primaryDomain"),
                "similarityScore": sim_score,
                "reasons": reasons,
                "location": other.get("location"),
                "experienceYears": other.get("experienceYears"),
            })
            add_link(cand_id, other_id, "SIMILAR_TO", f"{sim_score}% similarity", weight=sim_score / 100.0)
            similar_list.append({
                "candidate": other,
                "similarityScore": sim_score,
                "reasons": reasons,
            })

    similar_list.sort(key=lambda x: x["similarityScore"], reverse=True)

    return {
        "candidateId": cand_id,
        "nodes": nodes,
        "links": links,
        "metrics": {
            "totalNodes": len(nodes),
            "totalRelationships": len(links),
            "skillsCount": len([n for n in nodes if n["type"] == "skill"]),
            "companiesCount": len([n for n in nodes if n["type"] == "company"]),
            "similarCandidatesCount": len(similar_list),
        },
        "similarCandidates": similar_list[:5],
    }


def build_talent_network_overview(
    candidates: list[dict[str, Any]],
    jobs: list[dict[str, Any]] | None = None,
    max_nodes: int = 70,
) -> dict[str, Any]:
    """Constructs a macro talent ecosystem graph grouping candidates around shared skill hubs

    and alumni companies across the entire organization.
    """
    nodes: list[dict[str, Any]] = []
    links: list[dict[str, Any]] = []
    seen: set[str] = set()

    def add_n(n_id: str, label: str, n_type: str, meta: dict[str, Any] | None = None) -> None:
        if n_id not in seen:
            seen.add(n_id)
            item = {"id": n_id, "label": label, "type": n_type}
            if meta:
                item.update(meta)
            nodes.append(item)

    # 1. Add top candidates
    for c in candidates[:25]:
        c_id = c.get("id")
        add_n(c_id, c.get("canonicalName", "Candidate"), "candidate", {
            "title": c.get("currentTitle") or c.get("primaryDomain"),
            "exp": c.get("experienceYears"),
            "location": c.get("location"),
        })

        # Connect to skills
        for sk in (c.get("matchedSkills") or [])[:4]:
            if not isinstance(sk, str) or not sk.strip():
                continue
            sk_id = f"skill:{_slugify(sk)}"
            add_n(sk_id, sk, "skill")
            links.append({"source": c_id, "target": sk_id, "relation": "HAS_SKILL", "weight": 1.0})

        # Connect to companies
        for exp in (c.get("experiences") or [])[:2]:
            if not isinstance(exp, dict):
                continue
            comp = exp.get("company", "").strip()
            if comp:
                comp_id = f"company:{_slugify(comp)}"
                add_n(comp_id, comp, "company")
                links.append({"source": c_id, "target": comp_id, "relation": "WORKED_AT", "weight": 0.8})

    return {
        "nodes": nodes[:max_nodes],
        "links": links[: max_nodes * 2],
        "summary": {
            "candidatesAnalyzed": len(candidates),
            "connectedSkills": len([n for n in nodes if n["type"] == "skill"]),
            "alumniCompanies": len([n for n in nodes if n["type"] == "company"]),
            "graphDensity": round(len(links) / max(1, len(nodes)), 2),
        },
    }
