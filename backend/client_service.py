"""Resume Scanner - Agency Multi-Client Recruitment OS Service
Provides multi-tenant client account management, recruiter allocation,
workload distribution, and cross-client candidate rediscovery.
"""

from __future__ import annotations

import time
from typing import Any

DEFAULT_AGENCY_CLIENTS: list[dict[str, Any]] = [
    {
        "id": "client-a",
        "code": "CLIENT A",
        "name": "Apex Global Financial",
        "industry": "FinTech & Banking Infrastructure",
        "openJobsCount": 14,
        "candidatePoolCount": 8200,
        "recruiterCount": 4,
        "tier": "Enterprise Retained",
        "slaHours": 24,
        "primaryRecruiter": "Sarah Jenkins",
        "assignedRecruiters": ["Sarah Jenkins", "Michael Chang", "Priya Nair", "Alex Rivera"],
        "status": "Active",
        "avgPlacementDays": 18,
        "recentVacancies": ["Senior React Developer", "Lead Systems Architect", "Quant Risk Analyst"],
    },
    {
        "id": "client-b",
        "code": "CLIENT B",
        "name": "HyperScale Health & AI",
        "industry": "HealthTech & Diagnostics",
        "openJobsCount": 9,
        "candidatePoolCount": 4700,
        "recruiterCount": 3,
        "tier": "Exclusive Search",
        "slaHours": 48,
        "primaryRecruiter": "David Vance",
        "assignedRecruiters": ["David Vance", "Elena Rostova", "Kavita Rao"],
        "status": "Active",
        "avgPlacementDays": 22,
        "recentVacancies": ["Full Stack TypeScript Engineer", "Bioinformatics Scientist", "DevOps Lead"],
    },
    {
        "id": "client-c",
        "code": "CLIENT C",
        "name": "Nova Autonomous Systems",
        "industry": "Robotics & Embedded Systems",
        "openJobsCount": 22,
        "candidatePoolCount": 17000,
        "recruiterCount": 7,
        "tier": "High-Volume Contingency",
        "slaHours": 12,
        "primaryRecruiter": "Marcus Thorne",
        "assignedRecruiters": [
            "Marcus Thorne", "Rachel Green", "James Wu", "Ananya Sharma",
            "Liam O'Connor", "Chloe Martin", "Devon Scott"
        ],
        "status": "Active",
        "avgPlacementDays": 14,
        "recentVacancies": ["Embedded C++ Architect", "Computer Vision Specialist", "Hardware Firmware Lead"],
    },
]


class AgencyClientService:
    def __init__(self) -> None:
        self._clients: list[dict[str, Any]] = [dict(c) for c in DEFAULT_AGENCY_CLIENTS]
        self._active_client_id: str = "client-a"

    def list_clients(self) -> list[dict[str, Any]]:
        return list(self._clients)

    def get_client(self, client_id: str) -> dict[str, Any] | None:
        for c in self._clients:
            if c["id"] == client_id:
                return dict(c)
        return None

    def get_active_client_id(self) -> str:
        return self._active_client_id

    def set_active_client(self, client_id: str) -> dict[str, Any]:
        if client_id != "all":
            client = self.get_client(client_id)
            if not client:
                raise ValueError(f"Agency client '{client_id}' not found")
        self._active_client_id = client_id
        return {
            "activeClientId": self._active_client_id,
            "activeClient": self.get_client(client_id) if client_id != "all" else None,
        }

    def create_client(self, payload: dict[str, Any]) -> dict[str, Any]:
        cid = f"client-{int(time.time())}"
        new_client = {
            "id": cid,
            "code": payload.get("code") or f"CLIENT {chr(65 + len(self._clients))}",
            "name": payload.get("name", "New Agency Client"),
            "industry": payload.get("industry", "Technology"),
            "openJobsCount": int(payload.get("openJobsCount", 1)),
            "candidatePoolCount": int(payload.get("candidatePoolCount", 0)),
            "recruiterCount": int(payload.get("recruiterCount", 1)),
            "tier": payload.get("tier", "Standard Retained"),
            "slaHours": int(payload.get("slaHours", 48)),
            "primaryRecruiter": payload.get("primaryRecruiter", "Recruiter Lead"),
            "assignedRecruiters": payload.get("assignedRecruiters", ["Recruiter Lead"]),
            "status": "Active",
            "avgPlacementDays": 21,
            "recentVacancies": payload.get("recentVacancies", []),
        }
        self._clients.append(new_client)
        return new_client

    def get_agency_overview(self) -> dict[str, Any]:
        total_jobs = sum(c["openJobsCount"] for c in self._clients)
        total_candidates = sum(c["candidatePoolCount"] for c in self._clients)
        total_recruiters = sum(c["recruiterCount"] for c in self._clients)

        return {
            "totalClients": len(self._clients),
            "totalOpenJobs": total_jobs,
            "totalCandidateIntelligence": total_candidates,
            "totalAgencyRecruiters": total_recruiters,
            "activeClientId": self._active_client_id,
            "clients": list(self._clients),
        }


agency_client_service = AgencyClientService()
