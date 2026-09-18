"""Pricing model for the resume-scanner multi-tenant platform.

Master (the platform owner) assigns exactly ONE pricing tier per company
(tenant) at account creation and at tier-switch. A company's workspace then
exposes precisely the operational features that this tier entitles it to —
and nothing more.

The tier vocabulary below is the REAL one already in use by the client
(company) record surface: client_service.py persists tier="Standard Retained"
as the create default and seeds three more tiers. This module is pure data
(no imports, no side effects), so the auth gate, the tenant-provisioning
service prickling_create method, and the test suite can all read it without
creating import cycles.
"""

from __future__ import annotations

# ---------------------------------------------------------------------------
# The canonical tier vocabulary — DO NOT RENAME. These exact strings are
# persisted on the company record by create_client and seeded as startup data.
# ---------------------------------------------------------------------------
TIER_STANDARD_RETAINED = "Standard Retained"
TIER_EXCLUSIVE_SEARCH = "Exclusive Search"
TIER_HIGH_VOLUME_CONTINGENCY = "High-Volume Contingency"
TIER_ENTERPRISE_RETAINED = "Enterprise Retained"

# All valid tiers. Order is display/promotion order (ascending value).
TIER_ORDER: tuple[str, ...] = (
    TIER_STANDARD_RETAINED,
    TIER_EXCLUSIVE_SEARCH,
    TIER_HIGH_VOLUME_CONTINGENCY,
    TIER_ENTERPRISE_RETAINED,
)

# ---------------------------------------------------------------------------
# Feature identifiers (entitlement keys). Each corresponds to ONE operational
# surface on the agency route family. require_tier only ever gates on these.
# ---------------------------------------------------------------------------
ENT_SCAN = "scan"  # resume scanning/parsing/ranking, natural-language search
ENT_AGENCY_LIST = "agency.list"  # GET /api/agency/clients
ENT_AGENCY_OVERVIEW = "agency.overview"  # GET /api/agency/overview
ENT_AGENCY_CREATE = "agency.clients.create"  # POST /api/agency/clients
ENT_AGENCY_SWITCH = "agency.clients.switch"  # POST /api/agency/clients/{id}/switch
ENT_CLIENT_JOBS = "agency.clients.jobs"  # GET/POST client jobs
ENT_SHORTLISTS = "agency.shortlists"  # share / shortlist feedback
ENT_PLACEMENTS = "agency.placements"  # list / record placements
ENT_INVOICES = "agency.invoices"  # list / create invoices
ENT_OFFERS = "offers"  # create offer, update status
ENT_INTERVIEWS = "interviews"  # schedule interview, submit scorecard
ENT_COMPLIANCE = "compliance"  # export, delete-candidate, retention policies

# ---------------------------------------------------------------------------
# Tier -> explicit entitlement set. Nothing implicit: a tier grants EXACTLY
# what is listed for it and no more. Unknown tiers grant NOTHING (fail closed).
# ---------------------------------------------------------------------------
TIER_ENTITLEMENTS: dict[str, frozenset[str]] = {
    TIER_STANDARD_RETAINED: frozenset({ENT_SCAN}),
    TIER_EXCLUSIVE_SEARCH: frozenset(
        {ENT_SCAN, ENT_AGENCY_LIST, ENT_AGENCY_OVERVIEW, ENT_AGENCY_CREATE, ENT_AGENCY_SWITCH, ENT_CLIENT_JOBS, ENT_SHORTLISTS}
    ),
    TIER_HIGH_VOLUME_CONTINGENCY: frozenset(
        {
            ENT_SCAN,
            ENT_AGENCY_LIST,
            ENT_AGENCY_OVERVIEW,
            ENT_AGENCY_CREATE,
            ENT_AGENCY_SWITCH,
            ENT_CLIENT_JOBS,
            ENT_SHORTLISTS,
            ENT_PLACEMENTS,
            ENT_INVOICES,
        }
    ),
    TIER_ENTERPRISE_RETAINED: frozenset(
        {
            ENT_SCAN,
            ENT_AGENCY_LIST,
            ENT_AGENCY_OVERVIEW,
            ENT_AGENCY_CREATE,
            ENT_AGENCY_SWITCH,
            ENT_CLIENT_JOBS,
            ENT_SHORTLISTS,
            ENT_PLACEMENTS,
            ENT_INVOICES,
            ENT_OFFERS,
            ENT_INTERVIEWS,
            ENT_COMPLIANCE,
        }
    ),
}


def is_valid_tier(tier: str) -> bool:
    return tier in TIER_ENTITLEMENTS


def features_for(tier: str) -> frozenset[str]:
    """Entitlement set granted by a tier. Unknown tier -> empty set (fail closed)."""
    return TIER_ENTITLEMENTS.get(tier, frozenset())


def tier_has(tier: str, feature: str) -> bool:
    return feature in features_for(tier)
