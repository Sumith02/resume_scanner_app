from __future__ import annotations

import re
from collections import Counter
from pathlib import Path

SKILL_CATEGORIES = [
    {
        "key": "backend",
        "label": "Backend",
        "description": "API, server, database, and service engineering",
        "accent": "#2563eb",
        "keywords": [
            "node.js",
            "nodejs",
            "express",
            "nestjs",
            "java",
            "spring boot",
            "python",
            "django",
            "flask",
            "fastapi",
            "go",
            "golang",
            "ruby on rails",
            "laravel",
            ".net",
            "c#",
            "php",
            "rest api",
            "graphql",
            "microservices",
            "postgresql",
            "mysql",
            "mongodb",
            "redis",
            "kafka",
            "rabbitmq",
            "system design",
        ],
    },
    {
        "key": "frontend",
        "label": "Frontend",
        "description": "Web UI, design systems, and client-side engineering",
        "accent": "#0891b2",
        "keywords": [
            "react",
            "next.js",
            "vue",
            "nuxt",
            "angular",
            "svelte",
            "typescript",
            "javascript",
            "html",
            "css",
            "tailwind",
            "redux",
            "zustand",
            "webpack",
            "vite",
            "storybook",
            "responsive design",
            "web accessibility",
            "frontend",
        ],
    },
    {
        "key": "machine_learning",
        "label": "Machine Learning",
        "description": "ML models, NLP, computer vision, and applied AI",
        "accent": "#7c3aed",
        "keywords": [
            "machine learning",
            "deep learning",
            "artificial intelligence",
            "tensorflow",
            "pytorch",
            "keras",
            "scikit-learn",
            "sklearn",
            "nlp",
            "computer vision",
            "opencv",
            "transformer",
            "llm",
            "rag",
            "mlops",
            "model training",
            "feature engineering",
            "data science",
            "python",
        ],
    },
    {
        "key": "data_engineering",
        "label": "Data Engineering",
        "description": "Pipelines, analytics, warehousing, and BI",
        "accent": "#16a34a",
        "keywords": [
            "spark",
            "pyspark",
            "airflow",
            "dbt",
            "etl",
            "elt",
            "data warehouse",
            "bigquery",
            "snowflake",
            "redshift",
            "databricks",
            "hadoop",
            "sql",
            "tableau",
            "power bi",
            "looker",
            "analytics",
            "data pipeline",
            "data modeling",
        ],
    },
    {
        "key": "devops",
        "label": "DevOps",
        "description": "Cloud, CI/CD, infrastructure, and reliability",
        "accent": "#ea580c",
        "keywords": [
            "aws",
            "azure",
            "gcp",
            "docker",
            "kubernetes",
            "terraform",
            "ansible",
            "jenkins",
            "github actions",
            "gitlab ci",
            "ci/cd",
            "linux",
            "prometheus",
            "grafana",
            "sre",
            "observability",
            "helm",
            "cloudformation",
        ],
    },
    {
        "key": "mobile",
        "label": "Mobile",
        "description": "iOS, Android, and cross-platform app development",
        "accent": "#db2777",
        "keywords": [
            "react native",
            "flutter",
            "android",
            "ios",
            "swift",
            "kotlin",
            "xcode",
            "android studio",
            "mobile app",
            "jetpack compose",
            "objective-c",
            "dart",
        ],
    },
    {
        "key": "qa",
        "label": "QA Automation",
        "description": "Manual testing, automation, and release quality",
        "accent": "#ca8a04",
        "keywords": [
            "selenium",
            "cypress",
            "playwright",
            "jest",
            "vitest",
            "testing",
            "test automation",
            "manual testing",
            "qa",
            "quality assurance",
            "postman",
            "jmeter",
            "regression testing",
            "api testing",
        ],
    },
    {
        "key": "ui_ux",
        "label": "UI/UX Design",
        "description": "Product design, UX research, and design systems",
        "accent": "#9333ea",
        "keywords": [
            "figma",
            "adobe xd",
            "sketch",
            "wireframes",
            "prototype",
            "user research",
            "ux design",
            "ui design",
            "design system",
            "interaction design",
            "visual design",
            "usability",
        ],
    },
    {
        "key": "product_management",
        "label": "Product Management",
        "description": "Roadmaps, requirements, stakeholder and delivery ownership",
        "accent": "#0f766e",
        "keywords": [
            "product management",
            "product manager",
            "roadmap",
            "prd",
            "user stories",
            "scrum",
            "agile",
            "jira",
            "stakeholder management",
            "go to market",
            "market research",
            "product strategy",
        ],
    },
    {
        "key": "business_ops",
        "label": "Business Operations",
        "description": "Sales, marketing, finance, HR, and business support roles",
        "accent": "#64748b",
        "keywords": [
            "sales",
            "marketing",
            "seo",
            "sem",
            "crm",
            "hubspot",
            "finance",
            "accounting",
            "operations",
            "human resources",
            "recruitment",
            "talent acquisition",
            "customer success",
            "business development",
        ],
    },
]

KNOWN_LOCATIONS = [
    ("Bengaluru", "Karnataka", "India", "bangalore"),
    ("Hyderabad", "Telangana", "India"),
    ("Pune", "Maharashtra", "India"),
    ("Mumbai", "Maharashtra", "India", "bombay"),
    ("Navi Mumbai", "Maharashtra", "India"),
    ("Thane", "Maharashtra", "India"),
    ("Chennai", "Tamil Nadu", "India"),
    ("Delhi", "Delhi", "India", "new delhi"),
    ("Gurugram", "Haryana", "India", "gurgaon"),
    ("Noida", "Uttar Pradesh", "India"),
    ("Kolkata", "West Bengal", "India"),
    ("Ahmedabad", "Gujarat", "India"),
    ("Jaipur", "Rajasthan", "India"),
    ("Indore", "Madhya Pradesh", "India"),
    ("Kochi", "Kerala", "India", "cochin"),
    ("Thiruvananthapuram", "Kerala", "India", "trivandrum"),
    ("Coimbatore", "Tamil Nadu", "India"),
    ("Chandigarh", "Chandigarh", "India"),
    ("Lucknow", "Uttar Pradesh", "India"),
    ("Bhubaneswar", "Odisha", "India"),
    ("Nagpur", "Maharashtra", "India"),
    ("Surat", "Gujarat", "India"),
    ("Vadodara", "Gujarat", "India"),
    ("Visakhapatnam", "Andhra Pradesh", "India", "vizag"),
    ("San Francisco", "California", "United States"),
    ("San Jose", "California", "United States"),
    ("Seattle", "Washington", "United States"),
    ("New York", "New York", "United States", "nyc"),
    ("Austin", "Texas", "United States"),
    ("Dallas", "Texas", "United States"),
    ("Boston", "Massachusetts", "United States"),
    ("Chicago", "Illinois", "United States"),
    ("Atlanta", "Georgia", "United States"),
    ("Toronto", "Ontario", "Canada"),
    ("Vancouver", "British Columbia", "Canada"),
    ("London", "England", "United Kingdom"),
    ("Berlin", "Berlin", "Germany"),
    ("Dublin", "Leinster", "Ireland"),
    ("Singapore", "Singapore", "Singapore"),
    ("Dubai", "Dubai", "United Arab Emirates"),
    ("Abu Dhabi", "Abu Dhabi", "United Arab Emirates"),
    ("Sydney", "New South Wales", "Australia"),
    ("Melbourne", "Victoria", "Australia"),
]


def analyze_resume(text: str, fallback_name: str) -> dict[str, object]:
    normalized = _normalize_text(text)
    name = _extract_name(normalized, fallback_name)
    email_match = re.search(r"[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}", normalized, re.I)
    phone_match = re.search(r"(?:\+?\d[\d\s().-]{7,}\d)", normalized)
    location = _extract_location(normalized)
    skills = _classify_skills(normalized)
    experience = _extract_experience(normalized)
    matched = skills["matchedSkills"]
    summary_parts = [f"{name} is primarily aligned with {skills['primarySkill']} roles."]
    if matched:
        summary_parts.append(f"Strongest detected signals: {', '.join(matched[:5])}.")
    if experience is not None:
        summary_parts.append(f"Resume indicates up to {experience:g} years of experience.")
    if location["location"] != "Unknown":
        summary_parts.append(f"Location signal: {location['location']}.")

    return {
        "candidateName": name,
        "email": email_match.group(0) if email_match else "",
        "phone": re.sub(r"\s+", " ", phone_match.group(0)).strip() if phone_match else "",
        **location,
        **skills,
        "experienceYears": experience,
        "summary": " ".join(summary_parts),
        "textPreview": normalized[:1600],
        "resumeTextLength": len(normalized),
    }


def _normalize_text(text: str) -> str:
    text = text.replace("\r", "\n")
    text = re.sub(r"[^\S\n]+", " ", text)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def _classify_skills(text: str) -> dict[str, object]:
    lower = text.lower()
    scores: dict[str, int] = {}
    found: Counter[str] = Counter()
    for category in SKILL_CATEGORIES:
        score = 0
        for keyword in category["keywords"]:
            pattern = rf"(?<![a-z0-9+#.]){re.escape(keyword).replace(r'\ ', r'\s+')}(?=[^a-z0-9+#.]|$)"
            matches = len(re.findall(pattern, lower))
            if matches:
                capped = min(matches, 4)
                score += capped * (2 if " " in keyword or len(keyword) >= 10 else 1)
                found[_pretty_keyword(keyword)] += capped
        scores[category["key"]] = score

    primary_key, top_score = max(scores.items(), key=lambda item: item[1], default=("general", 0))
    primary = next((item for item in SKILL_CATEGORIES if item["key"] == primary_key), None)
    matched = [skill for skill, _ in sorted(found.items(), key=lambda item: (-item[1], item[0]))[:18]]
    return {
        "primarySkill": primary["label"] if primary and top_score else "General Review",
        "primarySkillKey": primary_key if primary and top_score else "general",
        "skillScores": scores,
        "skillScorePercent": min(100, round((top_score / 18) * 100)) if top_score else 0,
        "matchedSkills": matched,
    }


def _extract_name(text: str, fallback_name: str) -> str:
    blocked = re.compile(
        r"resume|curriculum|vitae|email|phone|mobile|address|linkedin|github|portfolio|summary|objective|experience|education|skills",
        re.I,
    )
    skill_terms = {keyword for category in SKILL_CATEGORIES for keyword in category["keywords"]}
    for line in [line.strip() for line in text.splitlines() if line.strip()][:18]:
        words = line.split()
        has_skill_term = any(term in line.lower() for term in skill_terms)
        if (
            3 <= len(line) <= 60
            and 2 <= len(words) <= 5
            and "@" not in line
            and not re.search(r"\d{4,}", line)
            and not blocked.search(line)
            and not has_skill_term
        ):
            return _title_case(line)
    return _title_case(re.sub(r"[_-]+", " ", Path(fallback_name).stem))


def _extract_experience(text: str) -> float | None:
    values = [float(value) for value in re.findall(r"(\d+(?:\.\d+)?)\s*\+?\s*(?:years|year|yrs|yr)\b", text, re.I)]
    valid = [value for value in values if 0 <= value <= 60]
    return max(valid) if valid else None


def _extract_location(text: str) -> dict[str, object]:
    if re.search(r"\b(remote|work from home|wfh)\b", text, re.I):
        return {"location": "Remote", "city": "Remote", "region": "", "country": "", "locationConfidence": 0.74}
    lines = [line.strip() for line in text.splitlines() if line.strip()][:80]
    explicit = "\n".join(
        line for line in lines if re.search(r"location|address|based in|current city|city\s*:", line, re.I)
    )
    for haystack, confidence in ((explicit, 0.92), ("\n".join(lines), 0.82), (text, 0.63)):
        lower = haystack.lower()
        for entry in sorted(KNOWN_LOCATIONS, key=lambda item: -len(item[0])):
            city, region, country, *aliases = entry
            if any(re.search(rf"(?<![a-z]){re.escape(name.lower())}(?![a-z])", lower) for name in (city, *aliases)):
                return {
                    "location": ", ".join(dict.fromkeys((city, region, country))),
                    "city": city,
                    "region": region,
                    "country": country,
                    "locationConfidence": confidence,
                }
    return {"location": "Unknown", "city": "", "region": "", "country": "", "locationConfidence": 0}


def _pretty_keyword(value: str) -> str:
    special = {
        "aws": "AWS",
        "gcp": "GCP",
        "sql": "SQL",
        "nlp": "NLP",
        "llm": "LLM",
        "qa": "QA",
        "ios": "iOS",
        "php": "PHP",
    }
    return special.get(value, " ".join(word.capitalize() for word in value.split()))


def _title_case(value: str) -> str:
    return " ".join(
        word if word.isupper() and len(word) <= 4 else word[:1].upper() + word[1:].lower() for word in value.split()
    )
