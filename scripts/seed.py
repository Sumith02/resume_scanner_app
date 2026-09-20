"""Seed a demo Nexerra Talent OS instance.

Creates the master admin, two tenant companies with activated admins,
some recruiters within seats, jobs, tags, and candidates with resumes,
so the platform can be explored immediately.

Run:  python scripts/seed.py
"""
from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.db import SessionLocal, init_db
from backend.models import (
    Candidate,
    CandidateStage,
    ClientPortalToken,
    EmailTemplate,
    Interview,
    InterviewMode,
    InterviewStatus,
    Job,
    JobStatus,
    Offer,
    OfferStatus,
    OnboardingTask,
    Organization,
    OrgStatus,
    Role,
    SourceKind,
    Subscription,
    SubscriptionStatus,
    Tag,
    TalentPool,
    TalentPoolMember,
    User,
    UserStatus,
    utcnow,
)
from backend.plans import get_plan
from backend.resume_service import extract_experience_years, extract_skills
from backend.security import generate_invite_token, hash_password, hash_token


def seed() -> None:
    init_db()
    db = SessionLocal()
    try:
        if db.query(User).filter(User.role == Role.MASTER_ADMIN).first():
            print("Master admin already exists — skipping seed.")
            return

        master = User(
            email="admin@nexerra.io",
            name="Platform Administrator",
            password_hash=hash_password("Admin@12345"),
            role=Role.MASTER_ADMIN,
            status=UserStatus.ACTIVE,
            organization_id=None,
        )
        db.add(master)
        db.flush()

        org_a = Organization(
            name="Northwind Recruiting",
            slug="northwind-recruiting",
            email="owner@northwind.dev",
            status=OrgStatus.ACTIVE,
            seat_limit=8,
            plan_code="growth",
            created_by_user_id=master.id,
        )
        org_b = Organization(
            name="Bright Search Partners",
            slug="bright-search-partners",
            email="owner@brightsearch.dev",
            status=OrgStatus.ACTIVE,
            seat_limit=5,
            plan_code="starter",
            created_by_user_id=master.id,
        )
        db.add_all([org_a, org_b])
        db.flush()

        owners = [
            User(
                email="owner@northwind.dev",
                name="Olivia North",
                password_hash=hash_password("Owner@12345"),
                role=Role.COMPANY_OWNER,
                status=UserStatus.ACTIVE,
                organization_id=org_a.id,
            ),
            User(
                email="owner@brightsearch.dev",
                name="Ben Bright",
                password_hash=hash_password("Owner@12345"),
                role=Role.COMPANY_OWNER,
                status=UserStatus.ACTIVE,
                organization_id=org_b.id,
            ),
            User(
                email="recruiter@northwind.dev",
                name="Rita Recruiter",
                password_hash=hash_password("Recruiter@12345"),
                role=Role.RECRUITER,
                status=UserStatus.ACTIVE,
                organization_id=org_a.id,
            ),
            User(
                email="readonly@northwind.dev",
                name="Ravi Viewer",
                password_hash=hash_password("Readonly@12345"),
                role=Role.READ_ONLY,
                status=UserStatus.ACTIVE,
                organization_id=org_a.id,
            ),
        ]
        db.add_all(owners)
        db.flush()

        tag = Tag(organization_id=org_a.id, name="Priority", color="#ef4444")
        tag2 = Tag(organization_id=org_a.id, name="Remote", color="#0ea5e9")
        db.add_all([tag, tag2])

        jobs = [
            Job(
                organization_id=org_a.id,
                title="Senior Backend Engineer",
                client_name="Northwind Client Co",
                department="Engineering",
                location="Remote",
                employment_type="Full-time",
                status=JobStatus.OPEN,
                skills=["python", "fastapi", "postgres", "docker"],
                requirements="5+ years building backend services.",
                created_by_user_id=owners[0].id,
            ),
            Job(
                organization_id=org_a.id,
                title="Frontend Engineer",
                client_name="Northwind Client Co",
                department="Engineering",
                location="Berlin",
                employment_type="Full-time",
                status=JobStatus.OPEN,
                skills=["react", "typescript", "css"],
                requirements="Strong React and TypeScript.",
                created_by_user_id=owners[0].id,
            ),
            Job(
                organization_id=org_b.id,
                title="Data Analyst",
                client_name="Bright Client",
                department="Data",
                location="London",
                employment_type="Contract",
                status=JobStatus.OPEN,
                skills=["sql", "python", "tableau"],
                requirements="Analytics and reporting.",
                created_by_user_id=owners[1].id,
            ),
        ]
        db.add_all(jobs)
        db.flush()

        resumes = [
            (
                org_a.id,
                "Alice Wang",
                "alice.wang@example.com",
                "+1 555 201 3344",
                "Senior Python engineer with 7 years experience. "
                "Built FastAPI services on PostgreSQL and Docker. React exposure.",
            ),
            (
                org_a.id,
                "Marcus Lee",
                "marcus.lee@example.com",
                "+1 555 902 7788",
                "Frontend specialist. React, TypeScript, and design systems. "
                "4 years building SaaS UIs.",
            ),
            (
                org_a.id,
                "Priya Nair",
                "priya.nair@example.com",
                "+44 20 7946 0102",
                "Full-stack developer. Python, Django, JavaScript, Kubernetes. "
                "6 years experience across fintech.",
            ),
            (
                org_b.id,
                "Tom Baker",
                "tom.baker@example.com",
                "+44 20 7946 0455",
                "Data analyst with 3 years experience in SQL, Python and Tableau.",
            ),
        ]

        created = []
        for i, (org_id, name, email, phone, text) in enumerate(resumes, start=1):
            candidate = Candidate(
                organization_id=org_id,
                name=name,
                email=email,
                phone=phone,
                summary=text,
                skills=extract_skills(text),
                experience_years=extract_experience_years(text),
                source=SourceKind.UPLOAD,
                stage=CandidateStage.NEW if i % 2 else CandidateStage.SHORTLISTED,
                created_by_user_id=owners[0].id if org_id == org_a.id else owners[1].id,
            )
            db.add(candidate)
            db.flush()
            if org_id == org_a.id:
                job_skill_sets = [(j.id, {s.lower() for s in (j.skills or [])}) for j in jobs if j.organization_id == org_id]
                skill_set = {s.lower() for s in candidate.skills}
                candidate.matched_job_ids = [
                    jid for jid, js in job_skill_sets if js and (js & skill_set)
                ]
            created.append(candidate)

        _seed_subscription(db, org_a, "growth")
        _seed_subscription(db, org_b, "starter")

        # Talent pool
        pool = TalentPool(
            organization_id=org_a.id,
            name="Backend Bench",
            description="Pre-vetted backend engineers for future roles.",
            created_by_user_id=owners[0].id,
        )
        db.add(pool)
        db.flush()
        alice = next(c for c in created if c.organization_id == org_a.id and c.name.startswith("Alice"))
        db.add(TalentPoolMember(organization_id=org_a.id, pool_id=pool.id,
                                candidate_id=alice.id, added_by_user_id=owners[0].id))

        # Interview + scorecard
        backend_job = next(j for j in jobs if j.title.startswith("Senior Backend"))
        interview = Interview(
            organization_id=org_a.id,
            candidate_id=alice.id,
            job_id=backend_job.id,
            title="Technical Screen",
            scheduled_at=utcnow(),
            mode=InterviewMode.VIDEO,
            location="https://meet.example.com/abc",
            status=InterviewStatus.COMPLETED,
            interviewer_user_id=owners[0].id,
            created_by_user_id=owners[0].id,
        )
        db.add(interview)
        db.flush()

        # Offer + onboarding for a shortlisted candidate
        marcus = next(c for c in created if c.name.startswith("Marcus"))
        frontend_job = next(j for j in jobs if j.title == "Frontend Engineer")
        offer = Offer(
            organization_id=org_a.id,
            candidate_id=marcus.id,
            job_id=frontend_job.id,
            salary=105000,
            employment_type="Full-time",
            status=OfferStatus.ACCEPTED,
            created_by_user_id=owners[0].id,
        )
        db.add(offer)
        db.add_all([
            OnboardingTask(organization_id=org_a.id, candidate_id=marcus.id, title=title)
            for title in (
                "Sign offer letter and contract",
                "Complete background check",
                "Provision email and equipment",
            )
        ])

        db.add(EmailTemplate(
            organization_id=org_a.id,
            name="Interview Invitation",
            subject="Interview invitation — {{job_title}}",
            body="Hi {{candidate_name}},\n\nWe'd love to schedule an interview for {{job_title}}.\n\nBest,\n{{company_name}}",
            created_by_user_id=owners[0].id,
        ))

        portal_secret = generate_invite_token()
        db.add(ClientPortalToken(
            organization_id=org_a.id,
            client_name="Northwind Client Co",
            token_hash=hash_token(portal_secret),
            job_ids=[backend_job.id, frontend_job.id],
            created_by_user_id=owners[0].id,
        ))

        db.commit()
        print("Seed complete.")
        print("  Master admin:  admin@nexerra.io / Admin@12345")
        print("  Company owner: owner@northwind.dev / Owner@12345")
        print("  Recruiter:     recruiter@northwind.dev / Recruiter@12345")
        print("  Read-only:     readonly@northwind.dev / Readonly@12345")
        print("  Second tenant: owner@brightsearch.dev / Owner@12345")
        print(f"  Client portal: /portal/{portal_secret} (Northwind Client Co)")
    finally:
        db.close()


def _seed_subscription(db, org: Organization, plan_code: str) -> None:
    plan = get_plan(plan_code)
    now = utcnow()
    from datetime import timedelta

    db.add(Subscription(
        organization_id=org.id,
        plan_code=plan.code,
        status=SubscriptionStatus.ACTIVE,
        seats=org.seat_limit,
        current_period_start=now,
        current_period_end=now + timedelta(days=30),
    ))
    org.plan_code = plan.code


if __name__ == "__main__":
    seed()