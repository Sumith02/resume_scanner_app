from __future__ import annotations

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from backend.db import get_db
from backend.models import User
from backend.rbac import has_permission
from backend.security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=True)


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: Session = Depends(get_db),
) -> User:
    exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired token",
    )
    try:
        payload = decode_access_token(credentials.credentials)
        user_id = int(payload["sub"])
    except Exception:
        raise exc
    user = db.get(User, user_id)
    if user is None:
        raise exc
    status_str = user.status.value if hasattr(user.status, "value") else str(user.status)
    if status_str in ("INACTIVE", "SUSPENDED"):
        raise HTTPException(status_code=403, detail=f"Account status is {status_str}")
    return user


def require_permission(permission: str):
    def _check(user: User = Depends(get_current_user)) -> User:
        status_str = user.status.value if hasattr(user.status, "value") else str(user.status)
        if status_str == "INVITED" or user.must_change_password:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Password change required before accessing platform features",
            )
        if not has_permission(user.role, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permission: {permission}",
            )
        return user

    return _check


def org_id_of(user: User) -> int | None:
    return user.organization_id


def ensure_company_scope(user: User) -> int:
    if user.organization_id is None:
        raise HTTPException(status_code=403, detail="Endpoint requires a company scope")
    return user.organization_id


def ensure_active_org(user: User, db: Session) -> None:
    from backend.models import Organization, OrgStatus

    if user.organization_id is None:
        return
    org = db.get(Organization, user.organization_id)
    if org is None or org.status == OrgStatus.DEACTIVATED:
        raise HTTPException(status_code=403, detail="Organization is deactivated")
    if org.status == OrgStatus.SUSPENDED:
        raise HTTPException(status_code=403, detail="Organization is suspended")