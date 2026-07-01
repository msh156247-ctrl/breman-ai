from __future__ import annotations

import os
from typing import Dict

from fastapi import HTTPException

from api.auth_runtime import _is_jwt_only_mode, request_identity_source_ctx
from api.security import ADMIN_TOKEN_ENV


def mask_key(raw: str) -> str:
    clean = raw.strip()
    if len(clean) <= 6:
        return "*" * len(clean)
    return f"{clean[:3]}{'*' * (len(clean) - 6)}{clean[-3:]}"


def require_admin(x_admin_token: str | None) -> None:
    expected = os.getenv(ADMIN_TOKEN_ENV, "bremen-admin-dev")
    if not x_admin_token or x_admin_token != expected:
        raise HTTPException(status_code=403, detail="admin_token_required")


def require_admin_token_or_jwt_owner(
    identity: Dict[str, str],
    x_admin_token: str | None,
) -> None:
    if (
        _is_jwt_only_mode()
        and request_identity_source_ctx.get() == "jwt"
        and identity.get("role") in {"owner", "admin"}
    ):
        return
    require_admin(x_admin_token)


def sanitize_backup_label(label: str | None) -> str | None:
    if not label:
        return None
    safe_label = "".join(ch for ch in label if ch.isalnum() or ch in {"-", "_"})
    return safe_label[:32] if safe_label else None
