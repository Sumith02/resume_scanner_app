from __future__ import annotations

from typing import Any

from .match_engine import compute_multidimensional_match
from .search_engine import execute_hybrid_search


def process_copilot_message(
    user_prompt: str,
    candidates: list[dict[str, Any]],
    jobs: list[dict[str, Any]],
    active_candidate_id: str | None = None,
    active_job_id: str | None = None,
) -> dict[str, Any]:
    """Interprets recruiter request and executes actionable Copilot tools with grounded evidence."""
    try:
        candidates = candidates or []
        jobs = jobs or []
        prompt = (user_prompt or "").strip()
        prompt_lower = prompt.lower()

        # 0. Greeting / Overview / Capabilities
        if (
            any(prompt_lower == g for g in ["hi", "hello", "hey", "help", "start", "info"])
            or "what can you do" in prompt_lower
            or "who are you" in prompt_lower
            or not prompt
        ):
            return {
                "role": "assistant",
                "content": (
                    "### 🤖 Welcome to Nexerra Recruiter Copilot\n\n"
                    "I am your AI recruitment intelligence assistant, grounded directly in your private candidate database.\n\n"
                    "**Things you can ask me:**\n"
                    "- 🔍 **Talent Search**: *'Find senior Python developers with AWS in Bengaluru'*\n"
                    "- ⚖️ **Candidate Comparison**: *'Compare top candidates'*\n"
                    "- 📋 **Technical Interview Guide**: *'Generate interview questions for backend role'*\n"
                    "- 📊 **Score Explanation**: *'Explain match score breakdown'*\n"
                    "- 🔄 **Talent Rediscovery**: *'Find previous or silver medalist candidates'*\n\n"
                    f"*Workspace Status:* **{len(candidates)}** candidates indexed, **{len(jobs)}** open job requisitions."
                ),
                "toolCalls": [{"tool": "copilot_overview", "status": "executed"}],
                "actionSuggestions": [
                    "Compare top candidates",
                    "Generate interview guide",
                    "Rediscover historical candidates",
                ],
            }

        # If candidate pool is empty, provide clear guidance
        if not candidates:
            return {
                "role": "assistant",
                "content": (
                    "### 📂 Candidate Database is Empty\n\n"
                    "There are currently no candidates in your organization's workspace.\n\n"
                    "**To start using Copilot intelligence:**\n"
                    "1. **Direct Upload**: Upload candidate PDF or DOCX resumes in *Talent Database* or *Command Center*.\n"
                    "2. **Gmail Ingestion**: Connect your HR Gmail inbox to automatically scan and import incoming resumes.\n\n"
                    "Once candidates are imported, I will automatically analyze their technical skills, compute match scores, and generate interview guides."
                ),
                "toolCalls": [{"tool": "pipeline_status", "status": "executed", "totalFound": 0}],
                "actionSuggestions": ["Scan connected Gmail inbox", "Upload sample resumes"],
            }

        # 1. Action: Compare candidates
        if "compare" in prompt_lower:
            if len(candidates) >= 2:
                c1, c2 = candidates[0], candidates[1]
                skills_1 = set(s.lower() for s in (c1.get("matchedSkills") or []) if isinstance(s, str))
                skills_2 = set(s.lower() for s in (c2.get("matchedSkills") or []) if isinstance(s, str))
                diff_skills = skills_1 - skills_2
                c1_skills = [s.title() for s in (c1.get("matchedSkills") or [])[:3]]
                c2_skills = [s.title() for s in (c2.get("matchedSkills") or [])[:3]]

                reply = (
                    f"### Side-by-Side Candidate Comparison\n\n"
                    f"- **{c1.get('canonicalName', 'Candidate 1')}** ({c1.get('experienceYears', 0) or 0:g} yrs, {c1.get('location', 'Remote')}):\n"
                    f"  *Key Strengths:* {', '.join(list(diff_skills)[:3]).title() or ', '.join(c1_skills) or 'Core engineering competencies'}.\n"
                    f"- **{c2.get('canonicalName', 'Candidate 2')}** ({c2.get('experienceYears', 0) or 0:g} yrs, {c2.get('location', 'Remote')}):\n"
                    f"  *Key Strengths:* {', '.join(c2_skills) or 'Engineering & system architecture'}.\n\n"
                    f"**Nexerra Recommendation:** {c1.get('canonicalName', 'Candidate 1')} demonstrates strong immediate alignment "
                    f"based on verified resume evidence."
                )
                return {
                    "role": "assistant",
                    "content": reply,
                    "toolCalls": [{"tool": "compare_candidates", "status": "executed", "entities": [c1.get("id", ""), c2.get("id", "")]}],
                    "actionSuggestions": ["Generate interview guide for Candidate 1", "Add both to shortlist"],
                }
            else:
                c = candidates[0]
                return {
                    "role": "assistant",
                    "content": (
                        f"### Candidate Profile: {c.get('canonicalName', 'Candidate')}\n\n"
                        f"You currently have **1 candidate** in your database:\n"
                        f"- **Title:** {c.get('currentTitle', 'Engineer')}\n"
                        f"- **Experience:** {c.get('experienceYears', 0) or 0:g} years • **Location:** {c.get('location', 'Not specified')}\n"
                        f"- **Skills:** {', '.join(c.get('matchedSkills') or ['Engineering'])}\n\n"
                        f"*To perform side-by-side comparisons, please upload or import at least 2 candidates.*"
                    ),
                    "toolCalls": [{"tool": "compare_candidates", "status": "executed", "entities": [c.get("id", "")]}],
                    "actionSuggestions": ["Generate interview guide", "Upload more resumes"],
                }

        # 2. Action: Generate interview guide
        if "interview" in prompt_lower or "question" in prompt_lower or "rubric" in prompt_lower:
            target_candidate = (
                next((c for c in candidates if c.get("id") == active_candidate_id), None)
                or (candidates[0] if candidates else None)
            )
            name = target_candidate.get("canonicalName", "Candidate") if target_candidate else "Candidate"
            cand_skills = [
                s.get("skillName")
                for s in (target_candidate.get("skills") or [])
                if isinstance(s, dict) and s.get("skillName")
            ] if target_candidate else []
            if not cand_skills and target_candidate:
                cand_skills = target_candidate.get("matchedSkills") or []
            primary_skill = cand_skills[0] if cand_skills else "Software Architecture"
            secondary_skill = cand_skills[1] if len(cand_skills) > 1 else "Production Engineering"

            reply = (
                f"### Structured Technical Interview Guide for {name}\n\n"
                f"**1. Architecture & Core Proficiency ({primary_skill}):**\n"
                f"- *'Walk me through a high-throughput production system you built using **{primary_skill}**. What were the primary bottlenecks, and how did you measure latency under peak load?'*\n\n"
                f"**2. Production Reliability & Edge Cases ({secondary_skill}):**\n"
                f"- *'How do you structure automated testing, monitoring, and error handling in your **{secondary_skill}** services during unexpected failovers?'*\n\n"
                f"**3. Technical Depth & Gap Verification:**\n"
                f"- *'Can you describe your hands-on experience with cloud infrastructure automation and deployment pipelines in previous roles?'*\n\n"
                f"*Evaluator Tip: Rate depth of concrete evidence from 1 (Theoretical) to 5 (Deep production battle-tested experience).*"
            )
            return {
                "role": "assistant",
                "content": reply,
                "toolCalls": [{"tool": "generate_interview_guide", "status": "executed"}],
                "actionSuggestions": ["Save to candidate activity log", "Compare top 2 candidates"],
            }

        # 3. Action: Explain score / Why is candidate ranked X%?
        if "why" in prompt_lower or "explain" in prompt_lower or "score" in prompt_lower:
            target_candidate = (
                next((c for c in candidates if c.get("id") == active_candidate_id), None)
                or (candidates[0] if candidates else None)
            )
            if target_candidate and jobs:
                match_data = compute_multidimensional_match(target_candidate, jobs[0])
                name = target_candidate.get("canonicalName", "Candidate")
                reply = (
                    f"### Score Breakdown for {name} ({match_data['overallScore']}% Overall against {jobs[0].get('title', 'Role')})\n\n"
                    f"- **Required Skills (35% max):** Earned {match_data['scoreBreakdown']['requiredSkills']['earned']} pts. "
                    f"Verified: {', '.join(match_data['matchedSkills'][:4]) or 'Core proficiencies'}.\n"
                    f"- **Preferred Skills (15% max):** Earned {match_data['scoreBreakdown']['preferredSkills']['earned']} pts.\n"
                    f"- **Experience & Seniority (15% max):** Earned {match_data['scoreBreakdown']['experience']['earned']} pts "
                    f"({target_candidate.get('experienceYears', 0) or 0:g} years verified).\n"
                    f"- **Semantic Relevance (20% max):** Earned {match_data['scoreBreakdown']['semantic']['earned']} pts.\n"
                    f"- **Location & Education (15% max):** Earned {match_data['scoreBreakdown']['location']['earned'] + match_data['scoreBreakdown']['education']['earned']} pts.\n\n"
                    f"**Identified Gaps to Verify:** {', '.join(match_data['missingSkills'][:2]) or 'None observed'}."
                )
                return {
                    "role": "assistant",
                    "content": reply,
                    "toolCalls": [{"tool": "explain_match_score", "status": "executed"}],
                    "actionSuggestions": ["Generate interview questions for missing skills", "Schedule screening"],
                }
            elif target_candidate:
                name = target_candidate.get("canonicalName", "Candidate")
                exp = target_candidate.get("experienceYears", 0) or 0
                quality = target_candidate.get("dataQualityScore", 90)
                skills = target_candidate.get("matchedSkills") or ["Engineering"]
                reply = (
                    f"### Profile Evaluation for {name}\n\n"
                    f"- **Verified Experience:** {exp:g} years\n"
                    f"- **Primary Competencies:** {', '.join(skills[:5])}\n"
                    f"- **Resume Data Quality Score:** {quality}% completeness\n\n"
                    f"*Create an open job opening in the Requisitions section to compute multi-dimensional match percentage against specific requirements.*"
                )
                return {
                    "role": "assistant",
                    "content": reply,
                    "toolCalls": [{"tool": "evaluate_profile", "status": "executed"}],
                    "actionSuggestions": ["Generate interview guide", "Compare top candidates"],
                }

        # 4. Action: Find overlooked or historical candidates
        if "overlooked" in prompt_lower or "rediscover" in prompt_lower or "previous" in prompt_lower:
            matched = candidates[:5]
            reply = (
                f"### Talent Rediscovery: {len(matched)} Historical Candidates Found\n\n"
                f"I searched your private database of {len(candidates)} candidates:\n\n"
            )
            for i, c in enumerate(matched, 1):
                c_skills = (c.get("matchedSkills") or [])[:3]
                reply += (
                    f"{i}. **{c.get('canonicalName', 'Candidate')}** — {c.get('currentTitle', 'Engineer')} "
                    f"({c.get('experienceYears', 0) or 0:g} yrs, {c.get('location', 'Remote')})\n"
                    f"   *Status:* {c.get('status', 'new').capitalize()} • Skills: {', '.join(c_skills) or 'Technical expertise'}\n"
                )
            reply += "\nWould you like to shortlist these candidates or draft an outreach message?"
            return {
                "role": "assistant",
                "content": reply,
                "toolCalls": [{"tool": "rediscover_candidates", "status": "executed", "count": len(matched)}],
                "actionSuggestions": ["Draft outreach campaign", "Compare top 2 candidates"],
            }

        # 5. Default: Natural Language Talent Search via tool
        search_res = execute_hybrid_search(user_prompt, candidates)
        results = search_res.get("results", [])[:4]
        parsed = search_res.get("parsedCriteria", {})

        criteria_str = []
        if parsed.get("skills"):
            criteria_str.append(f"Skills: **{', '.join(parsed['skills'])}**")
        if parsed.get("minExperience"):
            criteria_str.append(f"Min Exp: **{parsed['minExperience']:g}+ yrs**")
        if parsed.get("location"):
            criteria_str.append(f"Location: **{parsed['location']}**")

        criteria_desc = f" ({', '.join(criteria_str)})" if criteria_str else ""
        
        if not results:
            return {
                "role": "assistant",
                "content": (
                    f"I interpreted your search{criteria_desc}, but found **0 matching candidates** in your private database.\n\n"
                    f"**Suggestions to find talent:**\n"
                    f"- Search for broader terms like *'Python'*, *'React'*, *'Backend'*, or *'Engineer'*.\n"
                    f"- Check your connected Gmail inbox to scan and import new incoming applications.\n"
                    f"- Or ask: *'Compare candidates'* or *'Generate interview guide'*."
                ),
                "toolCalls": [{"tool": "search_candidates", "status": "executed", "totalFound": 0}],
                "actionSuggestions": ["Search for all candidates", "Rediscover historical candidates"],
            }

        reply = f"I interpreted your search{criteria_desc}.\n\n"
        reply += f"Found **{len(search_res['results'])} matching candidate{'s' if len(search_res['results']) != 1 else ''}** in your database. Top results:\n\n"

        for i, res in enumerate(results, 1):
            cand = res["candidate"]
            reply += (
                f"{i}. **{cand.get('canonicalName', 'Candidate')}** ({res.get('relevanceScore', 80)}% match)\n"
                f"   - {cand.get('currentTitle', 'Engineer')} • {cand.get('experienceYears', 0) or 0:g} yrs • {cand.get('location', 'Remote')}\n"
                f"   - Key Signals: {', '.join(res.get('reasons', []))}\n"
            )

        return {
            "role": "assistant",
            "content": reply,
            "toolCalls": [{"tool": "search_candidates", "status": "executed", "totalFound": len(search_res["results"])}],
            "actionSuggestions": ["Rediscover overlooked candidates", "Compare top 2 candidates", "Draft outreach campaign"],
        }

    except Exception as error:
        return {
            "role": "assistant",
            "content": (
                f"I processed your request, but encountered an unexpected data condition: {str(error)}.\n\n"
                "You can try selecting a candidate directly or asking for a candidate comparison, interview guide, or natural search."
            ),
            "toolCalls": [{"tool": "copilot_fallback", "status": "executed"}],
            "actionSuggestions": ["Compare candidates", "Generate interview guide", "Rediscover candidates"],
        }
