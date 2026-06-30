from __future__ import annotations

from contextvars import ContextVar
import os
import threading
from typing import Any, Dict

import jwt
from fastapi import HTTPException, Request, WebSocket

from api.security import (
    DEFAULT_JWT_SECRET,
    JWT_ALGORITHM,
    JWT_AUDIENCE_ENV,
    JWT_ISSUER_ENV,
    JWT_SECRET_ENV,
    auth_mode_name,
    build_jwt_payload,
    is_jwt_only_mode,
    is_truthy,
)


ALLOWED_ROLES = {"owner", "admin", "supervisor", "member", "viewer"}
request_identity_ctx: ContextVar[Dict[str, str] | None] = ContextVar("request_identity_ctx", default=None)
request_identity_source_ctx: ContextVar[str] = ContextVar("request_identity_source_ctx", default="header")
request_auth_error_ctx: ContextVar[str | None] = ContextVar("request_auth_error_ctx", default=None)
request_had_bearer_ctx: ContextVar[bool] = ContextVar("request_had_bearer_ctx", default=False)
auth_migration_stats: Dict[str, int] = {
    "total_requests": 0,
    "jwt_authenticated": 0,
    "header_fallback": 0,
    "jwt_errors": 0,
    "jwt_required_errors": 0,
}
auth_migration_stats_lock = threading.Lock()


def _is_truthy(value: str | None) -> bool:
    return is_truthy(value)


def _is_jwt_only_mode() -> bool:
    return is_jwt_only_mode()


def _auth_mode_name() -> str:
    return auth_mode_name()


def _build_jwt_payload(user_id: str, role: str, ttl_seconds: int) -> Dict[str, Any]:
    return build_jwt_payload(user_id, role, ttl_seconds)


def _decode_jwt_identity_with_error(raw_token: str) -> tuple[Dict[str, str] | None, str | None]:
    token = raw_token.strip()
    if not token:
        return None, "jwt_invalid_or_expired"
    try:
        decode_kwargs: Dict[str, Any] = {
            "algorithms": [JWT_ALGORITHM],
            "options": {"require": ["exp"]},
        }
        issuer = (os.getenv(JWT_ISSUER_ENV) or "").strip()
        audience = (os.getenv(JWT_AUDIENCE_ENV) or "").strip()
        if issuer:
            decode_kwargs["issuer"] = issuer
        if audience:
            decode_kwargs["audience"] = audience
        payload = jwt.decode(
            token,
            os.getenv(JWT_SECRET_ENV, DEFAULT_JWT_SECRET),
            **decode_kwargs,
        )
        user_id = str(payload.get("sub") or payload.get("user_id") or "").strip()
        role = str(payload.get("role") or "").strip().lower()
        if user_id and role in ALLOWED_ROLES:
            return {"user_id": user_id, "role": role}, None
        return None, "jwt_invalid_identity_claims"
    except Exception:
        return None, "jwt_invalid_or_expired"


def _decode_jwt_identity(raw_token: str) -> Dict[str, str] | None:
    identity, _ = _decode_jwt_identity_with_error(raw_token)
    return identity


async def resolve_jwt_identity_middleware(request: Request, call_next):
    token_identity: Dict[str, str] | None = None
    identity_source = "header"
    auth_error: str | None = None
    jwt_only = _is_jwt_only_mode()
    auth_header = request.headers.get("authorization", "")
    had_bearer = auth_header.lower().startswith("bearer ")
    if had_bearer:
        raw_token = auth_header[7:].strip()
        if raw_token:
            token_identity, auth_error = _decode_jwt_identity_with_error(raw_token)
            if token_identity is not None:
                identity_source = "jwt"
    elif jwt_only:
        auth_error = "jwt_required"

    if jwt_only and token_identity is None and auth_error is None:
        auth_error = "jwt_required"
    token = request_identity_ctx.set(token_identity)
    source_token = request_identity_source_ctx.set(identity_source)
    err_token = request_auth_error_ctx.set(auth_error)
    bearer_token = request_had_bearer_ctx.set(had_bearer)
    try:
        response = await call_next(request)
        with auth_migration_stats_lock:
            auth_migration_stats["total_requests"] += 1
            if identity_source == "jwt" and token_identity is not None:
                auth_migration_stats["jwt_authenticated"] += 1
            else:
                auth_migration_stats["header_fallback"] += 1
            if auth_error:
                auth_migration_stats["jwt_errors"] += 1
                if auth_error == "jwt_required":
                    auth_migration_stats["jwt_required_errors"] += 1
        response.headers["X-Auth-Mode"] = _auth_mode_name()
        response.headers["X-Auth-Source"] = identity_source
        if auth_error:
            response.headers["X-Auth-Error"] = auth_error
        return response
    finally:
        request_identity_ctx.reset(token)
        request_identity_source_ctx.reset(source_token)
        request_auth_error_ctx.reset(err_token)
        request_had_bearer_ctx.reset(bearer_token)


def _resolve_identity(x_user_id: str | None, x_user_role: str | None) -> Dict[str, str]:
    token_identity = request_identity_ctx.get()
    if token_identity is not None:
        return token_identity
    # Fail-closed: if bearer token was provided but invalid, never fallback to header identity.
    if request_had_bearer_ctx.get() and request_auth_error_ctx.get():
        raise HTTPException(status_code=401, detail=request_auth_error_ctx.get() or "jwt_invalid_or_expired")
    if _is_jwt_only_mode():
        raise HTTPException(status_code=401, detail=request_auth_error_ctx.get() or "jwt_required")
    user_id = (x_user_id or "").strip()
    role = (x_user_role or "").strip().lower()
    if role not in ALLOWED_ROLES:
        role = "viewer"
    if not user_id:
        user_id = "system"
    return {"user_id": user_id, "role": role}


def _resolve_ws_identity(websocket: WebSocket) -> Dict[str, str]:
    raw_jwt = websocket.query_params.get("jwt")
    if raw_jwt is not None:
        token_identity = _decode_jwt_identity(raw_jwt)
        if token_identity is None:
            raise HTTPException(status_code=401, detail="jwt_invalid_or_expired")
        return token_identity
    if _is_jwt_only_mode():
        raise HTTPException(status_code=401, detail="jwt_required")
    return _resolve_identity(
        websocket.query_params.get("user_id"),
        websocket.query_params.get("user_role"),
    )


def _require_roles(identity: Dict[str, str], allowed_roles: set[str]) -> None:
    role = identity.get("role", "viewer")
    if role not in allowed_roles:
        raise HTTPException(status_code=403, detail=f"role_not_allowed:{identity.get('role')}")
