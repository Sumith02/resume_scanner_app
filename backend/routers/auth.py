from __future__ import annotations

from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend import email_service
from backend.config import BOOTSTRAP_EMAIL, BOOTSTRAP_NAME, BOOTSTRAP_PASSWORD, FRONTEND_URL
from backend.db import get_db
from backend.deps import get_current_user
from backend.models import Organization, OrgStatus, Role, User, UserStatus, utcnow
from backend.repository import (
    get_user_by_email,
    log_audit,
)
from backend.schemas import AcceptInviteIn, BootstrapIn, ChangePasswordIn, LoginIn, TokenOut
from backend.security import (
    create_access_token,
    generate_invite_token,
    generate_temp_password,
    hash_password,
    hash_token,
    invite_expiry,
    verify_password,
)
from backend.serializers import user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _token_response(user: User) -> dict:
    token = create_access_token(user.id, user.organization_id, user.role.value)
    return {"access_token": token, "token_type": "bearer", "user": user_out(user)}


@router.post("/bootstrap")
def bootstrap(payload: BootstrapIn, db: Session = Depends(get_db)):
    existing = (
        db.query(User).filter(User.role == Role.MASTER_ADMIN).first()
    )
    if existing is not None:
        raise HTTPException(409, "Master admin already exists")
    email = (payload.email or BOOTSTRAP_EMAIL).strip()
    password = payload.password or BOOTSTRAP_PASSWORD
    name = payload.name or BOOTSTRAP_NAME
    if get_user_by_email(db, email):
        raise HTTPException(409, "A user with this email already exists")

    user = User(
        email=email.lower(),
        name=name,
        password_hash=hash_password(password),
        role=Role.MASTER_ADMIN,
        status=UserStatus.ACTIVE,
        organization_id=None,
    )
    db.add(user)
    db.flush()
    log_audit(
        db,
        org_id=None,
        actor_user_id=user.id,
        actor_email=user.email,
        action="platform.bootstrap",
        resource_type="user",
        resource_id=user.id,
        details={"role": Role.MASTER_ADMIN.value},
    )
    db.commit()
    return {
        "message": "Master admin created",
        "user": user_out(user),
    }


@router.post("/login", response_model=TokenOut)
def login(payload: LoginIn, db: Session = Depends(get_db)):
    user = get_user_by_email(db, payload.email)
    if user is None or not user.password_hash:
        raise HTTPException(401, "Invalid credentials")
    if not verify_password(payload.password, user.password_hash):
        raise HTTPException(401, "Invalid credentials")
    if user.status in (UserStatus.INACTIVE, UserStatus.SUSPENDED):
        raise HTTPException(403, "Account is inactive")
    # INVITED users may sign in with the temporary password emailed to them;
    # they are forced through the set-password step before doing anything else.
    user.last_login_at = utcnow()
    db.commit()
    return _token_response(user)


@router.post("/change-password", response_model=TokenOut)
def change_password(
    payload: ChangePasswordIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not user.password_hash or not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(400, "Current password is incorrect")
    if verify_password(payload.new_password, user.password_hash):
        raise HTTPException(400, "New password must be different from the current one")

    user.password_hash = hash_password(payload.new_password)
    newly_activated = user.must_change_password or user.status == UserStatus.INVITED
    user.must_change_password = False
    if user.status == UserStatus.INVITED:
        user.status = UserStatus.ACTIVE

    if newly_activated and user.organization_id:
        org = db.get(Organization, user.organization_id)
        if org and org.status in (OrgStatus.INVITATION_SENT, OrgStatus.CREATED):
            org.status = OrgStatus.ACTIVE

    log_audit(
        db,
        org_id=user.organization_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="user.password_changed",
        resource_type="user",
        resource_id=user.id,
    )
    db.commit()
    return _token_response(user)


@router.post("/accept-invite", response_model=TokenOut)
def accept_invite(payload: AcceptInviteIn, db: Session = Depends(get_db)):
    user = get_user_by_email(db, payload.email)
    if user is None:
        raise HTTPException(404, "Invitation not found")
    if user.status != UserStatus.INVITED:
        raise HTTPException(400, "Account is not awaiting activation")
    if not user.invite_token_hash:
        raise HTTPException(400, "No active invitation token on this account")
    if hash_token(payload.token) != user.invite_token_hash:
        raise HTTPException(400, "Invalid invitation token")
    if user.invite_expires_at and user.invite_expires_at < utcnow():
        raise HTTPException(400, "Invitation token has expired")

    user.password_hash = hash_password(payload.password)
    user.status = UserStatus.ACTIVE
    user.must_change_password = False
    user.invite_token_hash = None
    user.invite_expires_at = None


    if user.organization_id:
        org = db.get(Organization, user.organization_id)
        if org and org.status in (OrgStatus.INVITATION_SENT, OrgStatus.CREATED):
            org.status = OrgStatus.ACTIVE

    log_audit(
        db,
        org_id=user.organization_id,
        actor_user_id=user.id,
        actor_email=user.email,
        action="user.accept_invite",
        resource_type="user",
        resource_id=user.id,
    )
    db.commit()
    return _token_response(user)


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return user_out(user)


def issue_invite(db: Session, user: User) -> tuple[str, str]:
    """Set a temporary password + signed activation link. Returns (token, temp)."""
    token = generate_invite_token()
    temp_password = generate_temp_password()
    user.invite_token_hash = hash_token(token)
    user.invite_expires_at = invite_expiry()
    user.password_hash = hash_password(temp_password)
    user.must_change_password = True
    db.flush()
    return token, temp_password


def invite_url(email: str, token: str) -> str:
    return f"{FRONTEND_URL}/invite?email={quote(email)}&token={quote(token)}"


def send_invite_email(
    *,
    to_email: str,
    name: str,
    temp_password: str,
    token: str,
    role_label: str,
) -> None:
    """Email credentials + activation link. Delivery never breaks provisioning."""
    subject = "Your Nexerra Talent OS account"
    body = (
        f"Hi {name},\n\n"
        f"A Nexerra Talent OS account has been created for you as {role_label}.\n\n"
        f"Email: {to_email}\n"
        f"Temporary password: {temp_password}\n\n"
        f"1. Sign in at {FRONTEND_URL}/login with the temporary password.\n"
        f"2. You will be asked to set a new password.\n"
        f"3. Connect your email (Gmail) inside the app to start receiving resumes.\n\n"
        f"Alternative activation link: {invite_url(to_email, token)}\n\n"
        f"If you did not expect this invitation, you can ignore this email.\n"
    )
    email_service.send_system_email(to_email, subject, body)