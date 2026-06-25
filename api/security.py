from __future__ import annotations

import os
import time
from typing import Any, Dict, List

from core.db import KEY_ENCRYPTION_SECRET_ENV


ADMIN_TOKEN_ENV = "BREMEN_ADMIN_TOKEN"
JWT_SECRET_ENV = "BREMEN_JWT_SECRET"
JWT_ALGORITHM = "HS256"
DEFAULT_JWT_SECRET = "bremen-jwt-dev-secret-change-me-32bytes"
AUTH_JWT_ONLY_ENV = "BREMEN_AUTH_JWT_ONLY"
JWT_ISSUER_ENV = "BREMEN_JWT_ISSUER"
JWT_AUDIENCE_ENV = "BREMEN_JWT_AUDIENCE"
DEPLOYMENT_ENV = "BREMEN_ENV"
PRODUCTION_ENV_NAMES = {"staging", "prod", "production"}


def is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def is_jwt_only_mode() -> bool:
    return is_truthy(os.getenv(AUTH_JWT_ONLY_ENV))


def auth_mode_name() -> str:
    return "jwt_only" if is_jwt_only_mode() else "hybrid"


def key_storage_mode() -> str:
    if os.getenv(KEY_ENCRYPTION_SECRET_ENV):
        return "encrypted"
    if os.getenv(JWT_SECRET_ENV):
        return "encrypted_with_jwt_secret"
    return "encrypted_with_dev_secret"


def build_jwt_payload(user_id: str, role: str, ttl_seconds: int) -> Dict[str, Any]:
    now = int(time.time())
    payload: Dict[str, Any] = {
        "sub": user_id,
        "role": role,
        "iat": now,
        "exp": now + ttl_seconds,
    }
    issuer = (os.getenv(JWT_ISSUER_ENV) or "").strip()
    audience = (os.getenv(JWT_AUDIENCE_ENV) or "").strip()
    if issuer:
        payload["iss"] = issuer
    if audience:
        payload["aud"] = audience
    return payload


def security_configuration_issues() -> List[str]:
    issues: List[str] = []
    jwt_secret = (os.getenv(JWT_SECRET_ENV) or "").strip()
    encryption_secret = (os.getenv(KEY_ENCRYPTION_SECRET_ENV) or "").strip()
    admin_token = (os.getenv(ADMIN_TOKEN_ENV) or "").strip()

    if not encryption_secret:
        issues.append("development_encryption_secret")
    elif len(encryption_secret) < 32:
        issues.append("weak_encryption_secret")
    if not admin_token:
        issues.append("development_admin_token")
    elif len(admin_token) < 24 or admin_token == "bremen-admin-dev":
        issues.append("weak_admin_token")
    if not jwt_secret or jwt_secret == DEFAULT_JWT_SECRET:
        issues.append("development_jwt_secret")
    elif len(jwt_secret) < 32:
        issues.append("weak_jwt_secret")
    if not is_jwt_only_mode():
        issues.append("header_auth_fallback_enabled")
    return issues


def validate_production_security() -> None:
    environment = (os.getenv(DEPLOYMENT_ENV) or "development").strip().lower()
    if environment not in PRODUCTION_ENV_NAMES:
        return
    issues = security_configuration_issues()
    if issues:
        raise RuntimeError(f"unsafe_production_security_configuration:{','.join(sorted(issues))}")
