from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
from contextvars import ContextVar
from datetime import datetime, timezone
from email.message import EmailMessage
import ipaddress
import json
from pathlib import Path
import os
import socket
import smtplib
import ssl
import threading
import time
from urllib import error as urllib_error
from urllib import request as urllib_request
from urllib.parse import urlparse
import uuid
from typing import Any, Dict, List

import jwt
from fastapi import FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import uvicorn

from api.compat import legacy_api_metadata, mission_workflow_compatibility_fields
from api.schemas import (
    ApiKeyRegisterRequest,
    ApprovalChannelSettingsRequest,
    ApprovalNotificationRetryRequest,
    AuthTokenRequest,
    ChannelCreateRequest,
    ChannelPublishRequest,
    ContractActiveUpdateRequest,
    MemberCreateRequest,
    MemoryPutRequest,
    MemoryTransferRequest,
    MissionRequest,
    PolicyCheckRequest,
    RoyaltySimulateRequest,
    TeamCreateRequest,
    TeamMemberAddRequest,
    TeamRoyaltyContractRequest,
    WorkspaceSettingsRequest,
)
from api.security import (
    ADMIN_TOKEN_ENV,
    AUTH_JWT_ONLY_ENV,
    DEFAULT_JWT_SECRET,
    JWT_ALGORITHM,
    JWT_AUDIENCE_ENV,
    JWT_ISSUER_ENV,
    JWT_SECRET_ENV,
    auth_mode_name,
    build_jwt_payload,
    is_jwt_only_mode,
    is_truthy,
    key_storage_mode,
    security_configuration_issues,
    validate_production_security,
)
from api.websocket_manager import ConnectionManager
from api.workspace_settings import (
    _approval_channel_settings_response,
    _normalize_approval_channel_settings,
    _normalize_workspace_settings_payload,
    _require_json_payload_size,
    _workspace_settings_response_payload,
)
from api.workflow_validation import validate_workflow_graph_shape, workflow_runtime_providers
from core.composer import ComposerRuntime
from core.models import MissionStatus
from core.capability_registry import CapabilityRegistry
from core.db import (
    KEY_ENCRYPTION_SECRET_ENV,
    aggregate_settlements,
    append_ledger_record,
    append_key_history,
    backup_database,
    check_database_health,
    create_channel_record,
    create_contract_record,
    create_member_profile,
    create_team_record,
    deactivate_active_contracts,
    delete_provider_key,
    decrypt_provider_key,
    get_active_contract_record,
    get_db_file_path,
    get_channel_record,
    get_contract_record,
    get_provider_key,
    get_member_profile,
    get_mission_record,
    get_mission_owner,
    get_team_record,
    get_workspace_settings,
    init_db,
    is_provider_key_registered,
    list_key_history,
    list_channel_records,
    list_contract_history_by_pair,
    list_contract_records,
    list_ledger_records,
    list_key_status,
    list_member_records,
    list_mission_records,
    list_memory_records,
    list_team_records,
    run_integrity_checks,
    upsert_provider_key,
    upsert_workspace_settings,
    update_channel_record,
    update_contract_record,
    update_team_record,
    upsert_mission_owner,
    upsert_mission_record,
    upsert_memory_record,
)
from core.decision_log import DecisionLog
from core.memory_scope import MemoryRecord, MemoryScopeEngine
from core.ontology_loader import load_ontology
from core.policy_engine import PolicyEngine
from core.role_registry import RoleRegistry
from core.royalty_engine import RoyaltyEngine
from core.trust_engine import TrustEngine
from core.workflow_compiler import WorkflowCompiler


def _parse_cors_origins() -> List[str]:
    raw = os.getenv(
        "BREMEN_CORS_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3003,http://127.0.0.1:3003",
    )
    origins = [origin.strip() for origin in raw.split(",") if origin.strip()]
    return origins or [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3003",
        "http://127.0.0.1:3003",
    ]


CORS_ORIGINS = _parse_cors_origins()


@asynccontextmanager
async def app_lifespan(_: FastAPI):
    validate_production_security()
    yield


app = FastAPI(title="Bremen OS API", version="1.0.0", lifespan=app_lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials="*" not in CORS_ORIGINS,
    allow_methods=["*"],
    allow_headers=["*"],
)

def _redact_sensitive(obj: Any) -> Any:
    if isinstance(obj, dict):
        redacted: Dict[str, Any] = {}
        for k, v in obj.items():
            lk = str(k).lower()
            if "api_key" in lk or lk == "authorization" or lk == "x-admin-token":
                redacted[k] = "***REDACTED***"
            else:
                redacted[k] = _redact_sensitive(v)
        return redacted
    if isinstance(obj, list):
        return [_redact_sensitive(x) for x in obj]
    return obj


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    # Prevent accidental sensitive input echo in validation error responses.
    errors = _redact_sensitive(exc.errors())
    if isinstance(errors, list):
        for item in errors:
            if not isinstance(item, dict):
                continue
            loc = item.get("loc", [])
            loc_tokens = [str(x).lower() for x in loc] if isinstance(loc, (list, tuple)) else []
            if any(("api_key" in tok) or tok in {"authorization", "x-admin-token"} for tok in loc_tokens):
                item["input"] = "***REDACTED***"
    return JSONResponse(status_code=422, content={"detail": errors})


ROOT_DIR = Path(__file__).resolve().parents[1]
RUNTIME_DIR = Path(os.getenv("BREMEN_RUNTIME_DIR", str(ROOT_DIR / "runtime"))).expanduser().resolve()
RUNTIME_DIR.mkdir(parents=True, exist_ok=True)

manager = ConnectionManager()
missions: Dict[str, dict] = {}
running_tasks: Dict[str, asyncio.Task] = {}
mission_owners: Dict[str, str] = {}
pending_human_gates: Dict[str, Dict[str, Any]] = {}
approval_notification_outbox: Dict[str, List[Dict[str, Any]]] = {}
decision_log = DecisionLog(RUNTIME_DIR / "decision_log.jsonl")
trust_engine = TrustEngine(RUNTIME_DIR / "trust_log.jsonl")
cap_registry = CapabilityRegistry(ROOT_DIR / "capabilities.yaml")
policy_engine = PolicyEngine(ROOT_DIR / "policy_rules.yaml", policy_set="default")
memory_engine = MemoryScopeEngine()
royalty_engine = RoyaltyEngine()
evaluations: Dict[str, List[Dict[str, Any]]] = {}

ALLOWED_TEAM_ROLE_TYPES = {"executor", "supervisor", "channel_supervisor"}
CHANNEL_PUBLISH_ALLOWED_ROLES = {"supervisor", "channel_supervisor"}
TEAM_ROLE_PRIORITY = {"executor": 0, "supervisor": 1, "channel_supervisor": 2}
PROVIDER_ENV_MAP = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GEMINI_API_KEY",
    "stability": "STABILITY_API_KEY",
    "google": "GOOGLE_API_KEY",
}
RUNTIME_SUPPORTED_PROVIDERS = {"openai", "mock"}
APPROVAL_CHANNEL_ALIASES = {
    "admin": "admin_queue",
    "admin_queue": "admin_queue",
    "manager": "admin_queue",
    "ops": "admin_queue",
    "관리자": "admin_queue",
    "관리자 대기": "admin_queue",
    "운영자": "admin_queue",
    "이메일": "email",
    "email": "email",
    "mail": "email",
    "문자": "sms",
    "sms": "sms",
    "text": "sms",
    "카카오": "kakao",
    "카카오톡": "kakao",
    "카톡": "kakao",
    "kakao": "kakao",
    "kakaotalk": "kakao",
}
APPROVAL_PUBLIC_BASE_URL_ENV = "BREMEN_PUBLIC_BASE_URL"
APPROVAL_WEBHOOK_TOKEN_ENV = "BREMEN_APPROVAL_WEBHOOK_TOKEN"
APPROVAL_EMAIL_WEBHOOK_ENV = "BREMEN_APPROVAL_EMAIL_WEBHOOK_URL"
APPROVAL_SMS_WEBHOOK_ENV = "BREMEN_APPROVAL_SMS_WEBHOOK_URL"
APPROVAL_KAKAO_WEBHOOK_ENV = "BREMEN_APPROVAL_KAKAO_WEBHOOK_URL"
APPROVAL_GENERIC_WEBHOOK_ENV = "BREMEN_APPROVAL_WEBHOOK_URL"
APPROVAL_ALLOW_PRIVATE_WEBHOOKS_ENV = "BREMEN_ALLOW_PRIVATE_WEBHOOKS"
SMTP_HOST_ENV = "BREMEN_SMTP_HOST"
SMTP_PORT_ENV = "BREMEN_SMTP_PORT"
SMTP_USER_ENV = "BREMEN_SMTP_USER"
SMTP_PASSWORD_ENV = "BREMEN_SMTP_PASSWORD"
SMTP_FROM_ENV = "BREMEN_SMTP_FROM"
SMTP_USE_SSL_ENV = "BREMEN_SMTP_USE_SSL"
APPROVAL_EXTERNAL_CHANNEL_IDS = ("email", "sms", "kakao")
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

init_db()
for _mission in list_mission_records():
    _mission_id = str(_mission.get("id", "")).strip()
    if not _mission_id:
        continue
    _owner_id = get_mission_owner(_mission_id)
    if _owner_id:
        mission_owners[_mission_id] = _owner_id
    if str(_mission.get("status") or "").lower() in {"planning", "running", "retrying"}:
        _mission["status"] = "failed"
        _mission["interruption_reason"] = "runtime_interrupted_on_restart"
        for _task in _mission.get("tasks", []) if isinstance(_mission.get("tasks"), list) else []:
            if not isinstance(_task, dict):
                continue
            if str(_task.get("status") or "").lower() == "running":
                _task["status"] = "failed"
                _task["error_message"] = "runtime_interrupted_on_restart"
        _persist_owner = _owner_id or str(_mission.get("owner_id") or "system")
        upsert_mission_record(_mission, owner_id=_persist_owner)
        decision_log.append(
            {
                "type": "mission_failed",
                "timestamp": time.time(),
                "mission_id": _mission_id,
                "success": False,
                "error": "runtime_interrupted_on_restart",
                "message": f"Mission {_mission_id} was interrupted by a runtime restart",
            }
        )
    elif str(_mission.get("status") or "").lower() in {"completed", "failed", "cancelled"} and not _mission.get("finished_at"):
        _terminal_timestamps = [
            float(event.get("timestamp"))
            for event in decision_log.list_by_mission(_mission_id)
            if event.get("type") in {"mission_completed", "mission_failed", "mission_cancelled"}
            and isinstance(event.get("timestamp"), (int, float))
        ]
        if _terminal_timestamps:
            _mission["finished_at"] = datetime.fromtimestamp(max(_terminal_timestamps), tz=timezone.utc).isoformat()
            upsert_mission_record(_mission, owner_id=_owner_id or str(_mission.get("owner_id") or "system"))
    missions[_mission_id] = _mission


def _is_truthy(value: str | None) -> bool:
    return is_truthy(value)


def _is_jwt_only_mode() -> bool:
    return is_jwt_only_mode()


def _auth_mode_name() -> str:
    return auth_mode_name()


def _key_storage_mode() -> str:
    return key_storage_mode()


def _build_jwt_payload(user_id: str, role: str, ttl_seconds: int) -> Dict[str, Any]:
    return build_jwt_payload(user_id, role, ttl_seconds)


@app.middleware("http")
async def resolve_jwt_identity(request: Request, call_next):
    token_identity: Dict[str, str] | None = None
    identity_source = "header"
    auth_error: str | None = None
    jwt_only = _is_jwt_only_mode()
    auth_header = request.headers.get("authorization", "")
    had_bearer = auth_header.lower().startswith("bearer ")
    if auth_header.lower().startswith("bearer "):
        raw_token = auth_header[7:].strip()
        if raw_token:
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
                    raw_token,
                    os.getenv(JWT_SECRET_ENV, DEFAULT_JWT_SECRET),
                    **decode_kwargs,
                )
                user_id = str(payload.get("sub") or payload.get("user_id") or "").strip()
                role = str(payload.get("role") or "").strip().lower()
                if user_id and role in ALLOWED_ROLES:
                    token_identity = {"user_id": user_id, "role": role}
                    identity_source = "jwt"
                else:
                    auth_error = "jwt_invalid_identity_claims"
            except Exception:
                token_identity = None
                identity_source = "header"
                auth_error = "jwt_invalid_or_expired"
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


def _resolve_team_member(team_id: str, member_id: str) -> Dict[str, Any] | None:
    team = get_team_record(team_id)
    if team is None:
        return None
    best_row: Dict[str, Any] | None = None
    best_priority = -1
    for row in team.get("members", []):
        if not isinstance(row, dict) or row.get("member_id") != member_id:
            continue
        priority = TEAM_ROLE_PRIORITY.get(str(row.get("role_type", "")), -1)
        if best_row is None or priority > best_priority:
            best_row = row
            best_priority = priority
    return best_row


def _find_active_contract(source_team_id: str, target_team_id: str) -> Dict[str, Any] | None:
    return get_active_contract_record(source_team_id, target_team_id)


def _find_contract_by_id(contract_id: str) -> Dict[str, Any] | None:
    return get_contract_record(contract_id)


def _contract_pair_key(source_team_id: str, target_team_id: str) -> str:
    return f"{source_team_id}:{target_team_id}"


def _next_contract_version(source_team_id: str, target_team_id: str) -> int:
    pair_key = _contract_pair_key(source_team_id, target_team_id)
    versions = [int(c.get("version", 1)) for c in list_contract_history_by_pair(pair_key)]
    return (max(versions) + 1) if versions else 1


def _period_key(ts: float, cycle: str) -> str:
    dt = datetime.fromtimestamp(ts, tz=timezone.utc)
    if cycle == "weekly":
        y, week, _ = dt.isocalendar()
        return f"{y}-W{week:02d}"
    if cycle == "monthly":
        return f"{dt.year}-{dt.month:02d}"
    return f"{dt.year}-{dt.month:02d}-{dt.day:02d}"


def _is_provider_key_registered(provider: str) -> bool:
    return is_provider_key_registered(provider)


def _mask_key(raw: str) -> str:
    clean = raw.strip()
    if len(clean) <= 6:
        return "*" * len(clean)
    return f"{clean[:3]}{'*' * (len(clean) - 6)}{clean[-3:]}"


def _require_admin(x_admin_token: str | None) -> None:
    expected = os.getenv(ADMIN_TOKEN_ENV, "bremen-admin-dev")
    if not x_admin_token or x_admin_token != expected:
        raise HTTPException(status_code=403, detail="admin_token_required")


def _require_admin_token_or_jwt_owner(
    identity: Dict[str, str],
    x_admin_token: str | None,
) -> None:
    if (
        _is_jwt_only_mode()
        and request_identity_source_ctx.get() == "jwt"
        and identity.get("role") in {"owner", "admin"}
    ):
        return
    _require_admin(x_admin_token)


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


def _require_roles(identity: Dict[str, str], allowed_roles: set[str]) -> None:
    if identity.get("role", "viewer") not in allowed_roles:
        raise HTTPException(status_code=403, detail=f"role_not_allowed:{identity.get('role')}")


def _can_manage_team(identity: Dict[str, str], team: Dict[str, Any]) -> bool:
    role = identity.get("role", "viewer")
    if role in {"owner", "admin"}:
        return True
    user_id = identity.get("user_id", "")
    if not user_id:
        return False
    if str(team.get("created_by", "")) == user_id:
        return True
    row = _resolve_team_member(str(team.get("id", "")), user_id)
    if row is None:
        return False
    return str(row.get("role_type", "")) in {"supervisor", "channel_supervisor"}


def _require_team_manage_permission(identity: Dict[str, str], team: Dict[str, Any]) -> None:
    if not _can_manage_team(identity, team):
        raise HTTPException(status_code=403, detail="team_manage_permission_required")


def _can_view_team(identity: Dict[str, str], team: Dict[str, Any]) -> bool:
    role = identity.get("role", "viewer")
    if role in {"owner", "admin"}:
        return True
    user_id = identity.get("user_id", "")
    if not user_id:
        return False
    if str(team.get("created_by", "")) == user_id:
        return True
    return _resolve_team_member(str(team.get("id", "")), user_id) is not None


def _visible_team_ids(identity: Dict[str, str]) -> set[str]:
    if identity.get("role") in {"owner", "admin"}:
        return {str(t.get("id", "")) for t in list_team_records()}
    visible: set[str] = set()
    for team in list_team_records():
        team_id = str(team.get("id", ""))
        if team_id and _can_view_team(identity, team):
            visible.add(team_id)
    return visible


def _can_access_mission(identity: Dict[str, str], mission_id: str) -> bool:
    role = identity.get("role", "viewer")
    if role in {"owner", "admin"}:
        return True
    owner_id = mission_owners.get(mission_id) or get_mission_owner(mission_id)
    if owner_id and mission_id not in mission_owners:
        mission_owners[mission_id] = owner_id
    return bool(owner_id and owner_id == identity.get("user_id"))


def _require_mission_access(identity: Dict[str, str], mission_id: str) -> None:
    if not _can_access_mission(identity, mission_id):
        raise HTTPException(status_code=403, detail="mission_access_denied")


def _require_memory_scope_access(
    identity: Dict[str, str],
    scope: str,
    scope_id: str,
    *,
    write: bool,
) -> None:
    normalized_scope = scope.strip().lower()
    normalized_scope_id = scope_id.strip()
    if normalized_scope not in {"global", "team", "mission", "member", "ephemeral"}:
        raise HTTPException(status_code=400, detail=f"invalid_scope:{normalized_scope}")
    if identity.get("role") in {"owner", "admin"}:
        return
    user_id = str(identity.get("user_id") or "")
    if normalized_scope == "global":
        raise HTTPException(status_code=403, detail="memory_scope_access_denied")
    if normalized_scope in {"member", "ephemeral"}:
        if normalized_scope_id != user_id:
            raise HTTPException(status_code=403, detail="memory_scope_access_denied")
        return
    if normalized_scope == "mission":
        _require_mission_access(identity, normalized_scope_id)
        return
    team = get_team_record(normalized_scope_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    if write:
        _require_team_manage_permission(identity, team)
    elif not _can_view_team(identity, team):
        raise HTTPException(status_code=403, detail="memory_scope_access_denied")


def _get_mission_owner_cached(mission_id: str) -> str | None:
    owner_id = mission_owners.get(mission_id) or get_mission_owner(mission_id)
    if owner_id and mission_id not in mission_owners:
        mission_owners[mission_id] = owner_id
    return owner_id


def _get_mission_snapshot(mission_id: str) -> Dict[str, Any] | None:
    mission = missions.get(mission_id)
    if mission is not None:
        return mission
    stored = get_mission_record(mission_id)
    if stored is not None:
        missions[mission_id] = stored
    return stored


def _mission_response_snapshot(mission: Dict[str, Any]) -> Dict[str, Any]:
    workflow_id = mission.get("workflow_id", mission.get("team_id"))
    workflow_label = mission.get("workflow_label", mission.get("team_label"))
    workflow_graph = mission.get("workflow_graph", mission.get("team_graph"))
    return {
        **mission,
        **mission_workflow_compatibility_fields(
            workflow_id=str(workflow_id) if workflow_id is not None else None,
            workflow_label=str(workflow_label) if workflow_label is not None else None,
            workflow_graph=workflow_graph if isinstance(workflow_graph, dict) else None,
        ),
    }


def _approval_channel_settings_for_user(user_id: str | None) -> Dict[str, Any]:
    stored = get_workspace_settings(str(user_id or "")) if user_id else None
    raw = stored.get("approval_channel_settings") if isinstance(stored, dict) else None
    return _normalize_approval_channel_settings(raw)


def _approval_channel_settings_for_mission(mission_id: str) -> Dict[str, Any]:
    return _approval_channel_settings_for_user(_get_mission_owner_cached(mission_id))


def _approval_channel_env_overrides() -> Dict[str, bool]:
    return {
        "public_base_url": bool(os.getenv(APPROVAL_PUBLIC_BASE_URL_ENV)),
        "email_webhook": bool(os.getenv(APPROVAL_EMAIL_WEBHOOK_ENV) or os.getenv(APPROVAL_GENERIC_WEBHOOK_ENV)),
        "sms_webhook": bool(os.getenv(APPROVAL_SMS_WEBHOOK_ENV) or os.getenv(APPROVAL_GENERIC_WEBHOOK_ENV)),
        "kakao_webhook": bool(os.getenv(APPROVAL_KAKAO_WEBHOOK_ENV) or os.getenv(APPROVAL_GENERIC_WEBHOOK_ENV)),
        "webhook_token": bool(os.getenv(APPROVAL_WEBHOOK_TOKEN_ENV)),
        "smtp": bool(os.getenv(SMTP_HOST_ENV)),
    }


def _approval_settings_webhook_token(settings: Dict[str, Any]) -> str:
    encrypted = str(settings.get("webhook_token_encrypted") or "")
    if not encrypted:
        return ""
    try:
        return decrypt_provider_key(encrypted)
    except ValueError:
        return ""


def _normalize_approval_channel(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    return APPROVAL_CHANNEL_ALIASES.get(raw.lower(), raw.lower())


def _normalize_approval_channels(value: Any) -> List[str]:
    raw_channels = value if isinstance(value, list) else ["admin_queue"]
    channels: List[str] = []
    for raw_channel in raw_channels:
        channel = _normalize_approval_channel(raw_channel)
        if channel and channel not in channels:
            channels.append(channel)
    return channels or ["admin_queue"]


def _approval_notification_id(mission_id: str, task_id: str, gate_stage: str, channel: str) -> str:
    return f"{mission_id}:{task_id}:{gate_stage}:{channel}"


def _approval_public_url(path: str, mission_id: str = "") -> str:
    base_url = (os.getenv(APPROVAL_PUBLIC_BASE_URL_ENV) or "").strip().rstrip("/")
    if not base_url and mission_id:
        base_url = str(_approval_channel_settings_for_mission(mission_id).get("public_base_url") or "").strip().rstrip("/")
    if not base_url:
        return path
    return f"{base_url}{path}"


def _approval_notification_payload(notification: Dict[str, Any]) -> Dict[str, Any]:
    mission_id = str(notification.get("mission_id") or "")
    return {
        "kind": "bremen_approval_request",
        "notification_id": notification.get("id"),
        "mission_id": mission_id,
        "task_id": notification.get("task_id"),
        "gate_stage": notification.get("gate_stage"),
        "channel": notification.get("channel"),
        "target": notification.get("target"),
        "requested_at": notification.get("requested_at"),
        "approve_url": _approval_public_url(f"/runs?mission={mission_id}", mission_id),
        "ops_url": _approval_public_url(f"/chat/{mission_id}?tab=timeline", mission_id),
    }


def _post_json_webhook(url: str, payload: Dict[str, Any], token: str = "") -> Dict[str, Any]:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("webhook_url_invalid")
    if not _is_truthy(os.getenv(APPROVAL_ALLOW_PRIVATE_WEBHOOKS_ENV)):
        try:
            addresses = {
                item[4][0]
                for item in socket.getaddrinfo(
                    parsed.hostname,
                    parsed.port or (443 if parsed.scheme == "https" else 80),
                    type=socket.SOCK_STREAM,
                )
            }
        except OSError as exc:
            raise ValueError("webhook_host_unresolvable") from exc
        for address in addresses:
            ip = ipaddress.ip_address(address)
            if (
                ip.is_private
                or ip.is_loopback
                or ip.is_link_local
                or ip.is_multicast
                or ip.is_reserved
                or ip.is_unspecified
            ):
                raise ValueError("webhook_private_address_blocked")

    data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
    headers = {"Content-Type": "application/json; charset=utf-8"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib_request.Request(url, data=data, headers=headers, method="POST")

    class NoRedirectHandler(urllib_request.HTTPRedirectHandler):
        def redirect_request(self, req: Any, fp: Any, code: int, msg: str, headers: Any, newurl: str) -> None:
            return None

    opener = urllib_request.build_opener(NoRedirectHandler())
    with opener.open(req, timeout=8) as response:
        status_code = int(getattr(response, "status", 0) or response.getcode())
        if status_code >= 400:
            raise RuntimeError(f"webhook_http_{status_code}")
        return {"status_code": status_code}


def _send_smtp_approval_email(notification: Dict[str, Any], payload: Dict[str, Any]) -> None:
    target = str(notification.get("target") or "").strip()
    host = (os.getenv(SMTP_HOST_ENV) or "").strip()
    if not target or "@" not in target:
        raise ValueError("email_target_required")
    if not host:
        raise ValueError("smtp_not_configured")
    port = int(os.getenv(SMTP_PORT_ENV) or ("465" if _is_truthy(os.getenv(SMTP_USE_SSL_ENV)) else "587"))
    username = (os.getenv(SMTP_USER_ENV) or "").strip()
    password = os.getenv(SMTP_PASSWORD_ENV) or ""
    sender = (os.getenv(SMTP_FROM_ENV) or username or "bremen@localhost").strip()
    message = EmailMessage()
    message["Subject"] = f"[Bremen] 승인 요청 · {payload['mission_id']}"
    message["From"] = sender
    message["To"] = target
    message.set_content(
        "\n".join(
            [
                "Bremen 승인 요청이 도착했습니다.",
                f"Mission: {payload['mission_id']}",
                f"Task: {payload.get('task_id') or '-'}",
                f"Gate: {payload.get('gate_stage') or 'before_run'}",
                f"승인/옵스룸: {payload['ops_url']}",
            ]
        )
    )
    if _is_truthy(os.getenv(SMTP_USE_SSL_ENV)):
        with smtplib.SMTP_SSL(host, port, context=ssl.create_default_context(), timeout=8) as smtp:
            if username:
                smtp.login(username, password)
            smtp.send_message(message)
        return
    with smtplib.SMTP(host, port, timeout=8) as smtp:
        smtp.starttls(context=ssl.create_default_context())
        if username:
            smtp.login(username, password)
        smtp.send_message(message)


def _approval_webhook_for_channel(channel: str, mission_id: str = "") -> str:
    if channel == "email":
        env_url = os.getenv(APPROVAL_EMAIL_WEBHOOK_ENV) or os.getenv(APPROVAL_GENERIC_WEBHOOK_ENV) or ""
    elif channel == "sms":
        env_url = os.getenv(APPROVAL_SMS_WEBHOOK_ENV) or os.getenv(APPROVAL_GENERIC_WEBHOOK_ENV) or ""
    elif channel == "kakao":
        env_url = os.getenv(APPROVAL_KAKAO_WEBHOOK_ENV) or os.getenv(APPROVAL_GENERIC_WEBHOOK_ENV) or ""
    else:
        env_url = os.getenv(APPROVAL_GENERIC_WEBHOOK_ENV) or ""
    if str(env_url).strip():
        return str(env_url).strip()
    if not mission_id:
        return ""
    settings = _approval_channel_settings_for_mission(mission_id)
    channels = settings.get("channels") if isinstance(settings.get("channels"), dict) else {}
    config = channels.get(channel) if isinstance(channels.get(channel), dict) else {}
    if not config.get("enabled"):
        return ""
    return str(config.get("webhook_url") or "").strip()


def _approval_webhook_token_for_mission(mission_id: str) -> str:
    env_token = os.getenv(APPROVAL_WEBHOOK_TOKEN_ENV, "")
    if env_token:
        return env_token
    return _approval_settings_webhook_token(_approval_channel_settings_for_mission(mission_id))


def _approval_target_for_channel(mission_id: str, channel: str, explicit_target: str) -> str:
    if explicit_target:
        return explicit_target
    if channel == "admin_queue":
        return "admin_queue"
    settings = _approval_channel_settings_for_mission(mission_id)
    channels = settings.get("channels") if isinstance(settings.get("channels"), dict) else {}
    config = channels.get(channel) if isinstance(channels.get(channel), dict) else {}
    return str(config.get("target") or "").strip()


def _deliver_approval_notification(notification: Dict[str, Any]) -> Dict[str, Any]:
    channel = _normalize_approval_channel(notification.get("channel")) or "admin_queue"
    now = time.time()
    if channel == "admin_queue":
        return {
            "delivery_status": "queued",
            "delivery_transport": "internal_queue",
            "delivery_attempted_at": now,
            "updated_at": now,
        }
    payload = _approval_notification_payload(notification)
    mission_id = str(notification.get("mission_id") or "")
    webhook_url = _approval_webhook_for_channel(channel, mission_id)
    try:
        if channel == "email" and not webhook_url:
            _send_smtp_approval_email(notification, payload)
            return {
                "delivery_status": "sent",
                "delivery_transport": "smtp",
                "delivery_attempted_at": now,
                "delivered_at": time.time(),
                "updated_at": time.time(),
                "delivery_error": "",
            }
        if webhook_url:
            _post_json_webhook(webhook_url, payload, _approval_webhook_token_for_mission(mission_id))
            return {
                "delivery_status": "sent",
                "delivery_transport": "webhook",
                "delivery_attempted_at": now,
                "delivered_at": time.time(),
                "updated_at": time.time(),
                "delivery_error": "",
            }
        return {
            "delivery_status": "outbox_pending",
            "delivery_transport": "external_outbox",
            "delivery_attempted_at": now,
            "updated_at": now,
            "delivery_error": "delivery_adapter_not_configured",
        }
    except (OSError, RuntimeError, ValueError, urllib_error.URLError, smtplib.SMTPException) as exc:
        return {
            "delivery_status": "failed",
            "delivery_transport": "webhook" if webhook_url else ("smtp" if channel == "email" else "external_outbox"),
            "delivery_attempted_at": now,
            "updated_at": time.time(),
            "delivery_error": str(exc),
        }


def _update_approval_notification_delivery(
    mission_id: str,
    notification_id: str,
    delivery_update: Dict[str, Any],
) -> Dict[str, Any] | None:
    for row in approval_notification_outbox.get(mission_id, []):
        if str(row.get("id") or "") != notification_id:
            continue
        row.update(delivery_update)
        return dict(row)
    return None


async def _dispatch_approval_notification_and_emit(notification: Dict[str, Any]) -> Dict[str, Any] | None:
    mission_id = str(notification.get("mission_id") or "")
    notification_id = str(notification.get("id") or "")
    if not mission_id or not notification_id:
        return None
    delivery_update = await asyncio.to_thread(_deliver_approval_notification, dict(notification))
    row = _update_approval_notification_delivery(mission_id, notification_id, delivery_update)
    if row is None:
        return None
    event = {
        "type": "approval_notification_delivery",
        "message": f"📨 approval notification delivery {row.get('delivery_status')} via {row.get('channel')}",
        "timestamp": row.get("updated_at") or time.time(),
        **row,
    }
    decision_log.append(event)
    await manager.broadcast_all(event)
    await manager.broadcast_to_mission(mission_id, event)
    return row


def _ensure_approval_notifications(gate: Dict[str, Any]) -> List[Dict[str, Any]]:
    mission_id = str(gate.get("mission_id") or "").strip()
    task_id = str(gate.get("task_id") or "").strip()
    gate_stage = str(gate.get("gate_stage") or "before_run").strip() or "before_run"
    if not mission_id:
        return []
    requested_at = gate.get("requested_at") or time.time()
    approval_target = str(gate.get("approval_target") or "").strip()
    channels = _normalize_approval_channels(gate.get("approval_channels"))
    rows = approval_notification_outbox.setdefault(mission_id, [])
    existing_ids = {str(row.get("id") or "") for row in rows}
    created: List[Dict[str, Any]] = []
    for channel in channels:
        notification_id = _approval_notification_id(mission_id, task_id, gate_stage, channel)
        if notification_id in existing_ids:
            continue
        now = time.time()
        row = {
            "id": notification_id,
            "mission_id": mission_id,
            "task_id": task_id,
            "gate_stage": gate_stage,
            "channel": channel,
            "target": _approval_target_for_channel(mission_id, channel, approval_target),
            "status": "queued",
            "requested_at": requested_at,
            "updated_at": now,
            "delivery_mode": "internal_queue" if channel == "admin_queue" else "external_outbox",
            "delivery_status": "queued" if channel == "admin_queue" else "pending",
            "delivery_transport": "internal_queue" if channel == "admin_queue" else "external_outbox",
            "delivery_error": "",
        }
        rows.append(row)
        created.append(row)
        existing_ids.add(notification_id)
    return created


def _resolve_approval_notifications(
    mission_id: str,
    task_id: str,
    gate_stage: str,
    approved_by: str,
    timestamp: float,
) -> List[Dict[str, Any]]:
    resolved: List[Dict[str, Any]] = []
    for row in approval_notification_outbox.get(mission_id, []):
        if str(row.get("task_id") or "") != task_id:
            continue
        if str(row.get("gate_stage") or "") != gate_stage:
            continue
        if str(row.get("status") or "") == "approved":
            continue
        row["status"] = "approved"
        row["approved_by"] = approved_by
        row["approved_at"] = timestamp
        row["updated_at"] = timestamp
        resolved.append(dict(row))
    return resolved


def _notification_row_from_event(event: Dict[str, Any]) -> Dict[str, Any]:
    mission_id = str(event.get("mission_id") or "")
    task_id = str(event.get("task_id") or "")
    gate_stage = str(event.get("gate_stage") or "before_run")
    channel = str(event.get("channel") or "admin_queue")
    return {
        "id": str(event.get("id") or _approval_notification_id(mission_id, task_id, gate_stage, channel)),
        "mission_id": mission_id,
        "task_id": task_id,
        "gate_stage": gate_stage,
        "channel": channel,
        "target": str(event.get("target") or ""),
        "status": str(event.get("status") or "queued"),
        "requested_at": event.get("requested_at") or event.get("timestamp") or time.time(),
        "updated_at": event.get("updated_at") or event.get("timestamp") or time.time(),
        "delivery_mode": str(event.get("delivery_mode") or ("internal_queue" if channel == "admin_queue" else "external_outbox")),
        "delivery_status": str(event.get("delivery_status") or ("queued" if channel == "admin_queue" else "pending")),
        "delivery_transport": str(event.get("delivery_transport") or ("internal_queue" if channel == "admin_queue" else "external_outbox")),
        "delivery_error": str(event.get("delivery_error") or ""),
        **({"delivery_attempted_at": event.get("delivery_attempted_at")} if event.get("delivery_attempted_at") else {}),
        **({"delivered_at": event.get("delivered_at")} if event.get("delivered_at") else {}),
        **({"approved_by": event.get("approved_by")} if event.get("approved_by") else {}),
        **({"approved_at": event.get("approved_at")} if event.get("approved_at") else {}),
    }


def _rebuild_approval_notifications_from_log(mission_id: str) -> List[Dict[str, Any]]:
    rows_by_id: Dict[str, Dict[str, Any]] = {}
    for event in decision_log.list_by_mission(mission_id):
        if event.get("type") not in {
            "approval_notification_queued",
            "approval_notification_delivery",
            "approval_notification_resolved",
        }:
            continue
        row = _notification_row_from_event(event)
        row_id = str(row.get("id") or "")
        if row_id:
            rows_by_id[row_id] = row
    rebuilt = list(rows_by_id.values())
    rebuilt.sort(key=lambda row: float(row.get("requested_at") or 0))
    if rebuilt:
        approval_notification_outbox[mission_id] = [dict(row) for row in rebuilt]
    return rebuilt


def _approval_notifications_for_gate(mission_id: str, task_id: str, gate_stage: str) -> List[Dict[str, Any]]:
    memory_rows = approval_notification_outbox.get(mission_id, [])
    if not memory_rows:
        memory_rows = _rebuild_approval_notifications_from_log(mission_id)
    else:
        log_rows = _rebuild_approval_notifications_from_log(mission_id)
        merged = {str(row.get("id") or ""): dict(row) for row in log_rows}
        merged.update({str(row.get("id") or ""): dict(row) for row in memory_rows})
        memory_rows = [row for key, row in merged.items() if key]
        approval_notification_outbox[mission_id] = memory_rows
    return [
        dict(row)
        for row in memory_rows
        if str(row.get("task_id") or "") == task_id and str(row.get("gate_stage") or "") == gate_stage
    ]


def _retryable_approval_notifications(
    mission_id: str,
    *,
    channels: List[str] | None = None,
    notification_ids: List[str] | None = None,
) -> List[Dict[str, Any]]:
    rows = approval_notification_outbox.get(mission_id, [])
    if not rows:
        rows = _rebuild_approval_notifications_from_log(mission_id)
    allowed_channels = {_normalize_approval_channel(channel) for channel in channels or []}
    allowed_channels.discard("")
    allowed_ids = {str(notification_id or "").strip() for notification_id in notification_ids or []}
    allowed_ids.discard("")
    retryable_statuses = {"pending", "failed", "outbox_pending"}
    targets: List[Dict[str, Any]] = []
    for row in rows:
        channel = _normalize_approval_channel(row.get("channel")) or "admin_queue"
        if channel == "admin_queue":
            continue
        if allowed_channels and channel not in allowed_channels:
            continue
        row_id = str(row.get("id") or "")
        if allowed_ids and row_id not in allowed_ids:
            continue
        if str(row.get("status") or "") == "approved":
            continue
        if str(row.get("delivery_status") or "pending") not in retryable_statuses:
            continue
        targets.append(dict(row))
    return targets


def _recovered_pending_gate_from_log(mission_id: str, mission: Dict[str, Any]) -> Dict[str, Any] | None:
    if str(mission.get("status") or "") not in {"awaiting_approval", "blocked"}:
        return None
    latest_gate: Dict[str, Any] | None = None
    for event in decision_log.list_by_mission(mission_id):
        event_type = str(event.get("type") or "")
        if event_type == "human_gate_requested":
            latest_gate = event
        elif latest_gate is not None and event_type in {"human_gate_approved", "mission_completed", "mission_failed", "mission_cancelled"}:
            latest_gate = None
    if latest_gate is not None:
        return {
            "mission_id": mission_id,
            "task_id": str(latest_gate.get("task_id") or ""),
            "role": str(latest_gate.get("role") or ""),
            "gate_stage": str(latest_gate.get("gate_stage") or "before_run"),
            "approval_channels": _normalize_approval_channels(latest_gate.get("approval_channels")),
            "approval_target": str(latest_gate.get("approval_target") or ""),
            "requested_at": latest_gate.get("requested_at") or latest_gate.get("timestamp") or time.time(),
            "runtime_active": False,
            "can_approve": False,
            "recovery_reason": "runtime_waiter_not_active",
        }

    waiting_task = next(
        (
            task
            for task in mission.get("tasks", [])
            if isinstance(task, dict) and str(task.get("status") or "") == "waiting_input"
        ),
        None,
    )
    if waiting_task is None:
        return None
    return {
        "mission_id": mission_id,
        "task_id": str(waiting_task.get("id") or ""),
        "role": str(waiting_task.get("role") or ""),
        "gate_stage": "before_run",
        "approval_channels": ["admin_queue"],
        "approval_target": "",
        "requested_at": time.time(),
        "runtime_active": False,
        "can_approve": False,
        "recovery_reason": "mission_snapshot_waiting_input",
    }


def _decode_jwt_identity(raw_token: str) -> Dict[str, str] | None:
    token = raw_token.strip()
    if not token:
        return None
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
            return {"user_id": user_id, "role": role}
    except Exception:
        return None
    return None


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


def _extract_request_meta(request: Request) -> Dict[str, Any]:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return {"ip": client_ip, "user_agent": user_agent}


def _matches_market_filters(row: Dict[str, Any], category: str | None, search: str | None) -> bool:
    normalized_category = (category or "").strip().lower()
    if normalized_category and normalized_category != "전체".lower():
        row_category = str(row.get("category") or row.get("domain") or "").strip().lower()
        if row_category != normalized_category:
            return False

    needle = (search or "").strip().lower()
    if needle:
        haystack_parts = [
            row.get("id", ""),
            row.get("name", ""),
            row.get("description", ""),
            row.get("domain", ""),
            row.get("category", ""),
            " ".join(str(x) for x in row.get("capabilities", []) if x is not None),
            " ".join(str(x) for x in row.get("tags", []) if x is not None),
        ]
        if needle not in " ".join(str(part).lower() for part in haystack_parts):
            return False
    return True


def _decorate_member_for_market(profile: Dict[str, Any]) -> Dict[str, Any]:
    provider = str(profile.get("provider", "")).strip().lower()
    runtime_supported = provider in RUNTIME_SUPPORTED_PROVIDERS
    key_registered = provider == "mock" or _is_provider_key_registered(provider)
    available = runtime_supported and key_registered
    return {
        **profile,
        "category": profile.get("category") or profile.get("domain", "general"),
        "is_ai": profile.get("is_ai", True),
        "published": profile.get("published", True),
        "available": available,
        "runtime_supported": runtime_supported,
        "availability_reason": (
            "available"
            if available
            else "runtime_provider_not_supported"
            if not runtime_supported
            else "provider_api_key_not_registered"
        ),
        "required_api": provider,
    }


def _decorate_team_for_market(team: Dict[str, Any]) -> Dict[str, Any]:
    return {
        **team,
        "category": team.get("category") or team.get("domain", "general"),
        "is_template": team.get("is_template", True),
        "published": team.get("published", True),
        "member_count": len(team.get("members", [])),
    }


def _team_member_profiles(team: Dict[str, Any]) -> List[Dict[str, Any]]:
    profiles: List[Dict[str, Any]] = []
    for row in team.get("members", []):
        if not isinstance(row, dict):
            continue
        member_id = str(row.get("member_id", "")).strip()
        if not member_id:
            continue
        profile = get_member_profile(member_id)
        if profile is not None:
            profiles.append(_decorate_member_for_market({**profile, "team_role_type": row.get("role_type")}))
    return profiles


async def _close_ws_policy(websocket: WebSocket, reason: str) -> None:
    await websocket.accept()
    await websocket.close(code=1008, reason=reason)


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    try:
        identity = _resolve_ws_identity(websocket)
    except HTTPException:
        await _close_ws_policy(websocket, "ws_auth_invalid")
        return
    if identity.get("role") not in {"owner", "admin"}:
        await _close_ws_policy(websocket, "ws_access_denied")
        return
    await manager.connect(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)


@app.websocket("/ws/{mission_id}")
async def mission_websocket(websocket: WebSocket, mission_id: str) -> None:
    try:
        identity = _resolve_ws_identity(websocket)
    except HTTPException:
        await _close_ws_policy(websocket, "ws_auth_invalid")
        return
    if _get_mission_snapshot(mission_id) is None:
        await _close_ws_policy(websocket, "mission_not_found")
        return
    if not _can_access_mission(identity, mission_id):
        await _close_ws_policy(websocket, "mission_access_denied")
        return
    await manager.connect(websocket, mission_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket, mission_id)


@app.post("/api/missions")
async def create_mission(
    request: MissionRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    if not request.goal.strip():
        raise HTTPException(status_code=422, detail="mission_goal_required")
    validate_workflow_graph_shape(request.workflow_graph)
    requested_team: Dict[str, Any] | None = None
    # Only the deprecated team_id alias refers to the legacy persisted team domain.
    if request.team_id:
        requested_team = get_team_record(request.team_id)
        if requested_team is None:
            raise HTTPException(status_code=404, detail="Team not found")
        if not _can_view_team(identity, requested_team):
            raise HTTPException(status_code=403, detail="team_view_permission_required")
    runtime_api_key: str | None = None
    if not request.use_mock:
        requested_providers = workflow_runtime_providers(request.workflow_graph)
        unsupported_providers = sorted(requested_providers - RUNTIME_SUPPORTED_PROVIDERS)
        if unsupported_providers:
            raise HTTPException(
                status_code=422,
                detail=f"runtime_provider_not_supported:{','.join(unsupported_providers)}",
            )
        if "mock" in requested_providers:
            raise HTTPException(
                status_code=422,
                detail="mock_provider_requires_mock_runtime",
            )
        missing_keys = sorted(
            provider for provider in requested_providers if not _is_provider_key_registered(provider)
        )
        if missing_keys:
            raise HTTPException(
                status_code=403,
                detail=f"provider_api_key_not_registered:{','.join(missing_keys)}",
            )
        runtime_api_key = get_provider_key("openai")
    mission_policy = policy_engine.check_mission_start(
        budget=request.budget,
        use_mock=request.use_mock,
        api_key_available=request.use_mock or bool(runtime_api_key),
    )
    if not mission_policy.allowed:
        raise HTTPException(status_code=422, detail=mission_policy.reasons)

    def persist_current_mission() -> Dict[str, Any] | None:
        return None

    def ensure_pending_human_gate(gate: Dict[str, Any]) -> Dict[str, Any] | None:
        gate_mission_id = str(gate.get("mission_id") or "").strip()
        if not gate_mission_id:
            return None
        pending = pending_human_gates.get(gate_mission_id)
        if pending is None:
            pending = {
                "mission_id": gate_mission_id,
                "task_id": str(gate.get("task_id") or ""),
                "role": str(gate.get("role") or ""),
                "gate_stage": str(gate.get("gate_stage") or "before_run"),
                "approval_channels": _normalize_approval_channels(gate.get("approval_channels")),
                "approval_target": str(gate.get("approval_target") or ""),
                "requested_at": gate.get("requested_at") or time.time(),
                "event": asyncio.Event(),
                "approval": None,
            }
            pending_human_gates[gate_mission_id] = pending
        else:
            pending.update(
                {
                    "mission_id": gate_mission_id,
                    "task_id": str(gate.get("task_id") or pending.get("task_id") or ""),
                    "role": str(gate.get("role") or pending.get("role") or ""),
                    "gate_stage": str(gate.get("gate_stage") or pending.get("gate_stage") or "before_run"),
                    "approval_channels": _normalize_approval_channels(gate.get("approval_channels") or pending.get("approval_channels")),
                    "approval_target": str(gate.get("approval_target") or pending.get("approval_target") or ""),
                    "requested_at": gate.get("requested_at") or pending.get("requested_at") or time.time(),
                }
            )
        return pending

    async def wait_for_human_gate(gate: Dict[str, Any]) -> Dict[str, Any] | None:
        gate_mission_id = str(gate.get("mission_id") or "").strip()
        if not gate_mission_id:
            persist_current_mission()
            return None
        pending = ensure_pending_human_gate(gate)
        persist_current_mission()
        if pending is None:
            return None
        gate_event = pending.get("event")
        if not isinstance(gate_event, asyncio.Event):
            return None
        pending["runtime_waiting"] = True
        await gate_event.wait()
        approval = pending.get("approval")
        pending_human_gates.pop(str(gate.get("mission_id") or ""), None)
        return approval if isinstance(approval, dict) else None

    def event_handler(event: dict) -> None:
        decision_log.append(event)
        event_mission_id = event.get("mission_id")
        if event.get("type") == "evaluation_result" and isinstance(event_mission_id, str):
            evaluations.setdefault(event_mission_id, []).append(event)
        if event.get("type") == "human_gate_requested" and isinstance(event_mission_id, str):
            ensure_pending_human_gate(event)
            for notification in _ensure_approval_notifications(event):
                notification_event = {
                    "type": "approval_notification_queued",
                    "message": f"📨 approval notification queued via {notification['channel']}",
                    "timestamp": notification["updated_at"],
                    **notification,
                }
                decision_log.append(notification_event)
                asyncio.create_task(manager.broadcast_all(notification_event))
                asyncio.create_task(manager.broadcast_to_mission(event_mission_id, notification_event))
                if notification.get("channel") != "admin_queue":
                    asyncio.create_task(_dispatch_approval_notification_and_emit(notification))
        if event.get("type") in {
            "human_gate_requested",
            "human_gate_approved",
            "task_started",
            "task_completed",
            "task_failed",
            "mission_completed",
            "mission_failed",
        }:
            persist_current_mission()
        asyncio.create_task(manager.broadcast_all(event))
        if isinstance(event_mission_id, str):
            asyncio.create_task(manager.broadcast_to_mission(event_mission_id, event))

    composer = ComposerRuntime(
        use_mock=request.use_mock,
        on_event=event_handler,
        wait_for_human_gate=wait_for_human_gate,
        workflow_graph=request.workflow_graph,
        api_key=runtime_api_key,
    )
    try:
        planned = composer.plan_mission(request.goal.strip(), request.budget)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    def mission_snapshot() -> Dict[str, Any]:
        snapshot = planned.to_dict()
        previous_snapshot = missions.get(planned.id, {})
        if planned.status in {MissionStatus.COMPLETED, MissionStatus.FAILED}:
            snapshot["finished_at"] = previous_snapshot.get("finished_at") or datetime.now(timezone.utc).isoformat()
        workflow_label = request.workflow_label.strip()
        if not workflow_label and requested_team is not None:
            workflow_label = str(requested_team.get("name", "")).strip()
        snapshot["owner_id"] = identity["user_id"]
        snapshot["created_role"] = identity["role"]
        snapshot["use_mock"] = request.use_mock
        snapshot["auto_mode"] = request.auto_mode
        snapshot.update(
            mission_workflow_compatibility_fields(
                workflow_id=request.workflow_id,
                workflow_label=workflow_label or None,
                workflow_graph=request.workflow_graph,
            )
        )
        if request.workflow_graph is not None:
            snapshot["workflow_runtime"] = {
                "source": "workflow_graph",
                "node_count": len(request.workflow_graph.get("nodes", [])),
                "edge_count": len(request.workflow_graph.get("edges", [])),
                "loop_regions": request.workflow_graph.get("loop_regions", []),
                "tasks": [
                    {
                        "id": task.id,
                        "role": task.role,
                        "dependencies": task.dependencies,
                        "condition_mode": task.metadata.get("condition_mode", "always") if isinstance(task.metadata, dict) else "always",
                        "condition_expression": task.metadata.get("condition_expression", "") if isinstance(task.metadata, dict) else "",
                        "condition_time_rule": task.metadata.get("condition_time_rule", "") if isinstance(task.metadata, dict) else "",
                        "condition_data_path": task.metadata.get("condition_data_path", "") if isinstance(task.metadata, dict) else "",
                        "condition_operator": task.metadata.get("condition_operator", "==") if isinstance(task.metadata, dict) else "==",
                        "condition_value": task.metadata.get("condition_value", "") if isinstance(task.metadata, dict) else "",
                        "condition_branches": task.metadata.get("condition_branches", []) if isinstance(task.metadata, dict) else [],
                        "execution_mode": task.metadata.get("execution_mode", "auto") if isinstance(task.metadata, dict) else "auto",
                        "approval_channels": task.metadata.get("approval_channels", []) if isinstance(task.metadata, dict) else [],
                    }
                    for task in planned.tasks.values()
                ],
            }
        return snapshot

    mission_owners[planned.id] = identity["user_id"]

    def persist_current_mission() -> Dict[str, Any] | None:
        snapshot = mission_snapshot()
        missions[planned.id] = snapshot
        upsert_mission_record(snapshot, owner_id=identity["user_id"])
        return snapshot

    persist_current_mission()
    upsert_mission_owner(
        mission_id=planned.id,
        owner_id=identity["user_id"],
        created_at=time.time(),
    )
    decision_log.append(
        {
            "type": "mission_created",
            "timestamp": time.time(),
            "mission_id": planned.id,
            "goal": request.goal,
            "budget": request.budget,
            "use_mock": request.use_mock,
            **mission_workflow_compatibility_fields(
                workflow_id=request.workflow_id,
                workflow_label=request.workflow_label,
                workflow_graph=None,
            ),
            "workflow_graph_counts": {
                "nodes": len(request.workflow_graph.get("nodes", [])) if isinstance(request.workflow_graph, dict) else 0,
                "edges": len(request.workflow_graph.get("edges", [])) if isinstance(request.workflow_graph, dict) else 0,
            },
            "team_graph_counts": {
                "nodes": len(request.workflow_graph.get("nodes", [])) if isinstance(request.workflow_graph, dict) else 0,
                "edges": len(request.workflow_graph.get("edges", [])) if isinstance(request.workflow_graph, dict) else 0,
            },
            "auto_mode": request.auto_mode,
            "created_by": identity["user_id"],
            "created_role": identity["role"],
        }
    )

    async def run_and_store() -> None:
        result = False
        try:
            result = await composer.execute_mission(planned)
            persist_current_mission()
            # team 실행일 경우 로열티 원장 기록 (v1: 총 비용을 팀원 수로 균등 배분)
            if request.team_id:
                team = get_team_record(request.team_id)
            else:
                team = None
            if team:
                team_members = team.get("members", [])
                if isinstance(team_members, list) and len(team_members) > 0:
                    share = (planned.total_cost / len(team_members)) if len(team_members) else 0.0
                    for tm in team_members:
                        if not isinstance(tm, dict):
                            continue
                        member_id = tm.get("member_id")
                        if not isinstance(member_id, str):
                            continue
                        profile = get_member_profile(member_id)
                        if not profile:
                            continue
                        royalty_rate = float(profile.get("royalty_rate", 0.0))
                        calc = royalty_engine.calculate(provider_cost=share, royalty_rate=royalty_rate)
                        row = {
                            "kind": "mission_team_run",
                            "created_at": time.time(),
                            "run_id": planned.id,
                            "team_id": request.team_id,
                            "member_id": member_id,
                            "provider_cost": calc.provider_cost,
                            "royalty_rate": calc.royalty_rate,
                            "royalty_cost": calc.royalty_cost,
                            "platform_fee": calc.platform_fee,
                            "total_cost": calc.total_cost,
                        }
                        try:
                            append_ledger_record(row)
                            event = {
                                "type": "royalty_recorded",
                                "timestamp": time.time(),
                                "mission_id": planned.id,
                                **row,
                            }
                        except Exception as exc:
                            event = {
                                "type": "royalty_record_failed",
                                "timestamp": time.time(),
                                "mission_id": planned.id,
                                "run_id": planned.id,
                                "team_id": request.team_id,
                                "member_id": member_id,
                                "error": str(exc),
                            }
                        decision_log.append(event)
                        await manager.broadcast_to_mission(planned.id, event)
                        await manager.broadcast_all(event)
        except asyncio.CancelledError:
            planned.status = MissionStatus.FAILED
            failure_event = {
                "type": "mission_failed",
                "timestamp": time.time(),
                "mission_id": planned.id,
                "success": False,
                "error": "mission_cancelled",
                "message": f"Mission {planned.id} was cancelled before completion",
            }
            decision_log.append(failure_event)
            persist_current_mission()
            await manager.broadcast_to_mission(planned.id, failure_event)
            await manager.broadcast_all(failure_event)
        except Exception as exc:
            planned.status = MissionStatus.FAILED
            failure_event = {
                "type": "mission_failed",
                "timestamp": time.time(),
                "mission_id": planned.id,
                "success": False,
                "error": str(exc),
                "message": f"Mission {planned.id} failed: {exc}",
            }
            decision_log.append(failure_event)
            persist_current_mission()
            await manager.broadcast_to_mission(planned.id, failure_event)
            await manager.broadcast_all(failure_event)
        finally:
            snapshot = persist_current_mission()
            await manager.broadcast_to_mission(
                planned.id,
                {"type": "mission_snapshot", "mission_id": planned.id, "mission": snapshot, "success": bool(result)},
            )
            running_tasks.pop(planned.id, None)
            pending = pending_human_gates.pop(planned.id, None)
            if isinstance(pending, dict):
                gate_event = pending.get("event")
                if isinstance(gate_event, asyncio.Event) and not gate_event.is_set():
                    gate_event.set()

    running_tasks[planned.id] = asyncio.create_task(run_and_store())
    return {
        "mission_id": planned.id,
        "goal": request.goal,
        "budget": str(request.budget),
        "status": "started",
        **mission_workflow_compatibility_fields(
            workflow_id=request.workflow_id,
            workflow_label=missions[planned.id].get("workflow_label"),
            workflow_graph=None,
        ),
        "message": "미션이 백그라운드에서 실행 중입니다.",
    }


@app.get("/api/missions/{mission_id}")
async def get_mission(
    mission_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> dict:
    identity = _resolve_identity(x_user_id, x_user_role)
    mission = _get_mission_snapshot(mission_id)
    if mission is None:
        raise HTTPException(status_code=404, detail="Mission not found")
    _require_mission_access(identity, mission_id)
    return {
        **_mission_response_snapshot(mission),
        "owner_id": _get_mission_owner_cached(mission_id),
    }


@app.get("/api/missions")
async def list_missions(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> List[dict]:
    identity = _resolve_identity(x_user_id, x_user_role)
    if identity.get("role") in {"owner", "admin"}:
        return [
            {
                **_mission_response_snapshot(mission),
                "owner_id": _get_mission_owner_cached(str(mission.get("id", ""))),
            }
            for mission in list_mission_records()
        ]
    return [
        {
            **_mission_response_snapshot(mission),
            "owner_id": _get_mission_owner_cached(mission_id),
        }
        for mission in list_mission_records(owner_id=identity.get("user_id"))
        for mission_id in [str(mission.get("id", ""))]
        if mission_id
    ]


def _pending_approval_row(
    mission_id: str,
    pending: Dict[str, Any],
    *,
    runtime_active: bool = True,
    can_approve: bool = True,
) -> Dict[str, Any] | None:
    mission = _get_mission_snapshot(mission_id)
    if mission is None:
        return None
    channels = _normalize_approval_channels(pending.get("approval_channels"))
    task_id = str(pending.get("task_id") or "")
    gate_stage = str(pending.get("gate_stage") or "before_run")
    is_runtime_active = bool(pending.get("runtime_active", runtime_active))
    is_approvable = bool(pending.get("can_approve", can_approve)) and is_runtime_active
    return {
        "mission_id": mission_id,
        "task_id": task_id,
        "role": str(pending.get("role") or ""),
        "gate_stage": gate_stage,
        "approval_channels": channels,
        "approval_target": str(pending.get("approval_target") or ""),
        "requested_at": pending.get("requested_at") or time.time(),
        "mission_goal": str(mission.get("goal") or ""),
        "mission_status": str(mission.get("status") or ""),
        "owner_id": _get_mission_owner_cached(mission_id),
        "runtime_active": is_runtime_active,
        "can_approve": is_approvable,
        "recovery_reason": str(pending.get("recovery_reason") or ""),
        "notifications": _approval_notifications_for_gate(mission_id, task_id, gate_stage),
    }


@app.get("/api/approvals/pending")
async def list_pending_approvals(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    rows: List[Dict[str, Any]] = []
    active_mission_ids: set[str] = set()
    for mission_id, pending in list(pending_human_gates.items()):
        if not _can_access_mission(identity, mission_id):
            continue
        active_mission_ids.add(mission_id)
        row = _pending_approval_row(mission_id, pending, runtime_active=True, can_approve=True)
        if row is not None:
            rows.append(row)

    mission_source = list_mission_records() if identity.get("role") in {"owner", "admin"} else list_mission_records(owner_id=identity.get("user_id"))
    for mission in mission_source:
        if not isinstance(mission, dict):
            continue
        mission_id = str(mission.get("id") or "")
        if not mission_id or mission_id in active_mission_ids:
            continue
        if not _can_access_mission(identity, mission_id):
            continue
        recovered = _recovered_pending_gate_from_log(mission_id, mission)
        if recovered is None:
            continue
        row = _pending_approval_row(mission_id, recovered, runtime_active=False, can_approve=False)
        if row is not None:
            rows.append(row)
    rows.sort(key=lambda row: float(row.get("requested_at") or 0), reverse=True)
    return {"approvals": rows, "count": len(rows)}


@app.post("/api/missions/{mission_id}/approve")
async def approve_human_gate(
    mission_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    if _get_mission_snapshot(mission_id) is None:
        raise HTTPException(status_code=404, detail="Mission not found")
    _require_mission_access(identity, mission_id)
    pending = pending_human_gates.get(mission_id)
    if pending is None:
        raise HTTPException(status_code=409, detail="no_pending_human_gate")
    gate_event = pending.get("event")
    if not isinstance(gate_event, asyncio.Event) or gate_event.is_set():
        pending_human_gates.pop(mission_id, None)
        raise HTTPException(status_code=409, detail="no_pending_human_gate")
    timestamp = time.time()
    task_id = str(pending.get("task_id") or "")
    gate_stage = str(pending.get("gate_stage") or "before_run")
    pending["approval"] = {
        "approved_by": identity["user_id"],
        "approved_role": identity["role"],
        "timestamp": timestamp,
    }
    pending["approved_at"] = timestamp
    resolved_notifications = _resolve_approval_notifications(
        mission_id=mission_id,
        task_id=task_id,
        gate_stage=gate_stage,
        approved_by=identity["user_id"],
        timestamp=timestamp,
    )
    for notification in resolved_notifications:
        notification_event = {
            "type": "approval_notification_resolved",
            "message": f"📨 approval notification resolved via {notification['channel']}",
            "timestamp": timestamp,
            **notification,
        }
        decision_log.append(notification_event)
        await manager.broadcast_all(notification_event)
        await manager.broadcast_to_mission(mission_id, notification_event)
    gate_event.set()
    return {
        "status": "approved",
        "mission_id": mission_id,
        "task_id": task_id,
        "approved_by": identity["user_id"],
        "timestamp": timestamp,
        "gate_stage": gate_stage,
        "notifications": resolved_notifications,
    }


@app.post("/api/missions/{mission_id}/approval-notifications/retry")
async def retry_approval_notifications(
    mission_id: str,
    request: ApprovalNotificationRetryRequest | None = None,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    if _get_mission_snapshot(mission_id) is None:
        raise HTTPException(status_code=404, detail="Mission not found")
    _require_mission_access(identity, mission_id)
    retry_request = request or ApprovalNotificationRetryRequest()
    targets = _retryable_approval_notifications(
        mission_id,
        channels=retry_request.channels,
        notification_ids=retry_request.notification_ids,
    )
    if not targets:
        raise HTTPException(status_code=409, detail="no_retryable_approval_notifications")

    retried: List[Dict[str, Any]] = []
    for notification in targets:
        notification["status"] = "queued"
        notification["delivery_status"] = "pending"
        notification["delivery_error"] = ""
        notification["updated_at"] = time.time()
        notification_event = {
            "type": "approval_notification_retry_requested",
            "message": f"📨 approval notification retry requested via {notification.get('channel')}",
            "timestamp": notification["updated_at"],
            "retried_by": identity["user_id"],
            **notification,
        }
        decision_log.append(notification_event)
        await manager.broadcast_all(notification_event)
        await manager.broadcast_to_mission(mission_id, notification_event)
        row = await _dispatch_approval_notification_and_emit(notification)
        if row is not None:
            retried.append(row)

    return {
        "status": "retry_dispatched",
        "mission_id": mission_id,
        "retried_count": len(retried),
        "notifications": retried,
    }


@app.get("/api/missions/{mission_id}/artifacts")
async def get_mission_artifacts(
    mission_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    mission = _get_mission_snapshot(mission_id)
    if mission is None:
        raise HTTPException(status_code=404, detail="Mission not found")
    _require_mission_access(identity, mission_id)

    tasks = mission.get("tasks", [])
    artifacts = {
        task.get("id"): task.get("artifacts", {})
        for task in tasks
        if task.get("status") == "completed" and task.get("artifacts")
    }
    return {
        "mission_id": mission_id,
        "artifacts": artifacts,
        "total_tasks": len(tasks),
        "completed_tasks": len(artifacts),
    }


@app.get("/api/missions/{mission_id}/timeline")
async def get_mission_timeline(
    mission_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    if _get_mission_snapshot(mission_id) is None:
        raise HTTPException(status_code=404, detail="Mission not found")
    _require_mission_access(identity, mission_id)
    events = decision_log.list_by_mission(mission_id)
    return {"mission_id": mission_id, "events": events, "count": len(events)}


@app.get("/api/missions/{mission_id}/evaluations")
async def get_mission_evaluations(
    mission_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    if _get_mission_snapshot(mission_id) is None:
        raise HTTPException(status_code=404, detail="Mission not found")
    _require_mission_access(identity, mission_id)
    rows = evaluations.get(mission_id, [])
    if not rows:
        rows = [event for event in decision_log.list_by_mission(mission_id) if event.get("type") == "evaluation_result"]
    return {"mission_id": mission_id, "evaluations": rows, "count": len(rows)}


@app.get("/api/capabilities")
async def list_capabilities(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member", "viewer"})
    return {"version": cap_registry.version, "capabilities": cap_registry.list_all()}


@app.get("/api/workspace/settings")
async def get_current_workspace_settings(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member", "viewer"})
    stored = get_workspace_settings(identity["user_id"])
    if stored is None:
        return {
            "user_id": identity["user_id"],
            "exists": False,
            "settings": _workspace_settings_response_payload({}),
        }
    return {
        "user_id": identity["user_id"],
        "exists": True,
        "settings": _workspace_settings_response_payload(stored),
    }


@app.put("/api/workspace/settings")
async def save_current_workspace_settings(
    request: WorkspaceSettingsRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    _require_json_payload_size(
        request.model_dump(),
        max_bytes=4_000_000,
        detail_prefix="workspace_settings",
    )
    existing = get_workspace_settings(identity["user_id"]) or {}
    normalized = _normalize_workspace_settings_payload(
        {
            "hired_agents": request.hired_agents,
            "library_agents": request.library_agents,
            "project_units": request.project_units,
            "member_folders": request.member_folders,
            "agent_folder_ids": request.agent_folder_ids,
            "nodes": request.nodes,
            "edges": request.edges,
            "node_execution_states": request.node_execution_states,
            "artifact_versions": request.artifact_versions,
            "loop_regions": request.loop_regions,
            "approval_channel_settings": request.approval_channel_settings
            if request.approval_channel_settings is not None
            else existing.get("approval_channel_settings"),
            "client_version": request.client_version,
        }
    )
    saved = upsert_workspace_settings(identity["user_id"], normalized, time.time())
    return {"user_id": identity["user_id"], "exists": True, "settings": _workspace_settings_response_payload(saved)}


@app.get("/api/approval-channels/settings")
async def get_approval_channel_settings(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    settings = _approval_channel_settings_for_user(identity["user_id"])
    return {
        "user_id": identity["user_id"],
        "settings": _approval_channel_settings_response(settings),
        "env_overrides": _approval_channel_env_overrides(),
    }


@app.put("/api/approval-channels/settings")
async def save_approval_channel_settings(
    request: ApprovalChannelSettingsRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor"})
    _require_json_payload_size(
        request.approval_channel_settings,
        max_bytes=262_144,
        detail_prefix="approval_channel_settings",
    )
    existing = get_workspace_settings(identity["user_id"]) or {}
    existing_approval = existing.get("approval_channel_settings") if isinstance(existing, dict) else {}
    normalized_approval = _normalize_approval_channel_settings(
        request.approval_channel_settings,
        existing_approval if isinstance(existing_approval, dict) else {},
    )
    normalized_workspace = _normalize_workspace_settings_payload(
        {
            **existing,
            "approval_channel_settings": normalized_approval,
            "client_version": existing.get("client_version") or "approval_channels_v1",
        }
    )
    saved = upsert_workspace_settings(identity["user_id"], normalized_workspace, time.time())
    return {
        "user_id": identity["user_id"],
        "settings": _approval_channel_settings_response(saved.get("approval_channel_settings", {})),
        "env_overrides": _approval_channel_env_overrides(),
    }


@app.post("/api/members")
async def create_member(
    request: MemberCreateRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor"})
    provider = request.provider.strip().lower()
    if provider != "mock" and not _is_provider_key_registered(provider):
        raise HTTPException(
            status_code=403,
            detail=f"provider_api_key_not_registered:{provider}",
        )
    validation = cap_registry.validate(request.capabilities)
    member_id = str(uuid.uuid4())[:8]
    profile = {
        "id": member_id,
        "name": request.name,
        "provider": provider,
        "model": request.model,
        "version": request.version,
        "description": request.description,
        "domain": request.domain,
        "capabilities": validation["valid"],
        "royalty_rate": request.royalty_rate,
    }
    create_member_profile(profile)
    trust_engine.append_event(
        {
            "type": "member_created",
            "timestamp": time.time(),
            "member_id": member_id,
            "provider": request.provider,
            "model": request.model,
            "version": request.version,
            "capabilities": validation["valid"],
        }
    )
    return {"member": profile, "invalid_capabilities": validation["invalid"]}


@app.get("/api/members")
async def list_members(
    category: str | None = None,
    search: str | None = None,
    available_only: bool = False,
    is_ai: bool | None = None,
    published: bool | None = None,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member", "viewer"})
    rows = [_decorate_member_for_market(row) for row in list_member_records()]

    if is_ai is not None:
        rows = [row for row in rows if bool(row.get("is_ai", True)) is is_ai]
    if published is not None:
        rows = [row for row in rows if bool(row.get("published", True)) is published]
    if available_only:
        rows = [row for row in rows if bool(row.get("available", False))]
    rows = [row for row in rows if _matches_market_filters(row, category, search)]
    rows.sort(key=lambda row: str(row.get("name", "")).lower())
    return {"members": rows, "agents": rows, "count": len(rows)}


@app.get("/api/members/{member_id}")
async def get_member(
    member_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member", "viewer"})
    profile = get_member_profile(member_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Member not found")
    member = _decorate_member_for_market(profile)
    return {"member": member, "agent": member}


@app.get("/api/members/{member_id}/trust")
async def get_member_trust(
    member_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    profile = get_member_profile(member_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Member not found")
    return trust_engine.get_trust(member_id=member_id, member_profile=profile)


@app.post("/api/keys/register")
async def register_api_key(
    request: ApiKeyRegisterRequest,
    http_request: Request,
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin"})
    _require_admin_token_or_jwt_owner(identity, x_admin_token)
    provider = request.provider.strip().lower()
    if provider not in PROVIDER_ENV_MAP:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {provider}")
    raw_key = request.api_key.strip()
    if len(raw_key) < 10:
        raise HTTPException(status_code=400, detail="api_key_too_short")

    actor = identity["user_id"]
    req_meta = _extract_request_meta(http_request)
    now_ts = time.time()
    masked = _mask_key(raw_key)
    upsert_provider_key(provider=provider, api_key=raw_key, masked=masked, updated_at=now_ts)
    append_key_history(
        timestamp=now_ts,
        provider=provider,
        action="register",
        actor=actor,
        ip=req_meta.get("ip"),
        user_agent=req_meta.get("user_agent"),
        masked=masked,
    )
    return {"provider": provider, "registered": True, "actor": actor, "masked": masked}


@app.get("/api/keys/status")
async def get_api_key_status(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin"})
    rows = list_key_status(PROVIDER_ENV_MAP)
    return {"providers": rows, "count": len(rows)}


@app.delete("/api/keys/{provider}")
async def delete_api_key(
    provider: str,
    http_request: Request,
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin"})
    _require_admin_token_or_jwt_owner(identity, x_admin_token)
    normalized = provider.strip().lower()
    if normalized not in PROVIDER_ENV_MAP:
        raise HTTPException(status_code=400, detail=f"Unsupported provider: {normalized}")
    normalized_actor = identity["user_id"]
    req_meta = _extract_request_meta(http_request)
    now_ts = time.time()
    removed = delete_provider_key(normalized)
    append_key_history(
        timestamp=now_ts,
        provider=normalized,
        action="delete",
        actor=normalized_actor,
        ip=req_meta.get("ip"),
        user_agent=req_meta.get("user_agent"),
        masked=(removed.get("masked") if removed else None),
    )
    return {"provider": normalized, "registered": False, "actor": normalized_actor}


@app.get("/api/keys-history")
async def get_api_key_history(
    limit: int = Query(20, ge=1, le=200),
    offset: int = Query(0, ge=0),
    provider: str | None = None,
    actor: str | None = None,
    action: str | None = None,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin"})
    rows, total = list_key_history(limit=limit, offset=offset, provider=provider, actor=actor, action=action)
    return {
        "history": rows,
        "count": len(rows),
        "total": total,
        "limit": limit,
        "offset": offset,
        "filters": {"provider": provider, "actor": actor, "action": action},
    }


@app.get("/api/admin/db/integrity")
async def get_db_integrity(
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    _require_admin(x_admin_token)
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin"})
    result = run_integrity_checks()
    result["db_file"] = get_db_file_path()
    return result


@app.post("/api/admin/db/backup")
async def create_db_backup(
    label: str | None = Query(None),
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    _require_admin(x_admin_token)
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin"})
    safe_label = None
    if label:
        safe_label = "".join(ch for ch in label if ch.isalnum() or ch in {"-", "_"})
        safe_label = safe_label[:32] if safe_label else None
    result = backup_database(label=safe_label)
    return {"ok": True, **result}


@app.get("/api/auth/whoami")
async def auth_whoami(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    return {
        "user_id": identity["user_id"],
        "role": identity["role"],
        "source": request_identity_source_ctx.get(),
    }


@app.post("/api/auth/token")
async def auth_token(
    request: AuthTokenRequest,
    x_admin_token: str | None = Header(default=None, alias="X-Admin-Token"),
) -> Dict[str, Any]:
    _require_admin(x_admin_token)
    user_id = request.user_id.strip()
    role = request.role.strip().lower()
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id_required")
    if len(user_id) > 128:
        raise HTTPException(status_code=400, detail="user_id_too_long")
    if role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail=f"invalid_role:{role}")

    payload = _build_jwt_payload(user_id=user_id, role=role, ttl_seconds=request.ttl_seconds)
    token = jwt.encode(
        payload,
        os.getenv(JWT_SECRET_ENV, DEFAULT_JWT_SECRET),
        algorithm=JWT_ALGORITHM,
    )
    return {
        "access_token": token,
        "token_type": "bearer",
        "expires_at": datetime.fromtimestamp(int(payload["exp"]), tz=timezone.utc).isoformat(),
        "expires_in": request.ttl_seconds,
        "user_id": user_id,
        "role": role,
        "auth_mode": _auth_mode_name(),
    }


@app.get("/api/auth/migration-stats")
async def auth_migration_stats_endpoint(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin"})
    with auth_migration_stats_lock:
        stats_snapshot = dict(auth_migration_stats)
    total = max(stats_snapshot["total_requests"], 1)
    return {
        "mode": _auth_mode_name(),
        "stats": stats_snapshot,
        "ratios": {
            "jwt_authenticated_ratio": round(stats_snapshot["jwt_authenticated"] / total, 6),
            "header_fallback_ratio": round(stats_snapshot["header_fallback"] / total, 6),
            "jwt_error_ratio": round(stats_snapshot["jwt_errors"] / total, 6),
        },
        "notes": ["in_memory_stats_single_process_scope"],
    }


@app.get("/api/auth/permissions")
async def auth_permissions(
    mission_id: str | None = Query(default=None),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    role = identity["role"]
    can_manage_keys = role in {"owner", "admin"}
    can_run_mission = role in {"owner", "admin", "supervisor", "member"}
    can_manage_policies = role in {"owner", "admin", "supervisor"}
    can_access_global_ws = role in {"owner", "admin"}
    can_access_mission = False
    if mission_id:
        can_access_mission = _can_access_mission(identity, mission_id)
    return {
        "user_id": identity["user_id"],
        "role": role,
        "permissions": {
            "can_manage_keys": can_manage_keys,
            "can_run_mission": can_run_mission,
            "can_manage_policies": can_manage_policies,
            "can_access_global_ws": can_access_global_ws,
            "can_access_mission": can_access_mission,
        },
        "mission_id": mission_id,
    }


@app.post("/api/teams")
async def create_team(
    request: TeamCreateRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor"})
    team_id = str(uuid.uuid4())[:8]
    team = {
        "id": team_id,
        "name": request.name,
        "domain": request.domain,
        "policy_set": request.policy_set,
        "description": request.description,
        "created_by": identity["user_id"],
        "members": [],
        "created_at": time.time(),
    }
    create_team_record(team)
    return {"team": team}


@app.get("/api/teams")
async def list_teams(
    category: str | None = None,
    search: str | None = None,
    is_template: bool | None = None,
    published: bool | None = None,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    rows = [_decorate_team_for_market(row) for row in list_team_records()]
    if identity.get("role") not in {"owner", "admin"}:
        rows = [row for row in rows if _can_view_team(identity, row)]
    if is_template is not None:
        rows = [row for row in rows if bool(row.get("is_template", True)) is is_template]
    if published is not None:
        rows = [row for row in rows if bool(row.get("published", True)) is published]
    rows = [row for row in rows if _matches_market_filters(row, category, search)]
    rows.sort(key=lambda row: str(row.get("name", "")).lower())
    return {"teams": rows, "count": len(rows)}


@app.get("/api/teams/{team_id}")
async def get_team(
    team_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    team = get_team_record(team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    if not _can_view_team(identity, team):
        raise HTTPException(status_code=403, detail="team_view_permission_required")
    decorated = _decorate_team_for_market(team)
    member_profiles = _team_member_profiles(team)
    return {"team": decorated, "member_profiles": member_profiles, "members": member_profiles}


@app.post("/api/teams/{team_id}/members")
async def add_team_member(
    team_id: str,
    request: TeamMemberAddRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor"})
    team = get_team_record(team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    _require_team_manage_permission(identity, team)
    if get_member_profile(request.member_id) is None:
        raise HTTPException(status_code=404, detail="Member not found")
    if request.role_type not in ALLOWED_TEAM_ROLE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role_type. allowed={sorted(ALLOWED_TEAM_ROLE_TYPES)}",
        )
    raw_members = team.get("members", [])
    existing_row: Dict[str, Any] | None = None
    duplicate_count = 0
    members: List[Dict[str, Any]] = []
    if isinstance(raw_members, list):
        for item in raw_members:
            if not isinstance(item, dict):
                continue
            if item.get("member_id") == request.member_id:
                duplicate_count += 1
                if existing_row is None:
                    existing_row = item
                continue
            members.append(item)
    row = {**(existing_row or {}), "member_id": request.member_id, "role_type": request.role_type}
    members.append(row)
    created = existing_row is None
    updated = not created and (
        str(existing_row.get("role_type", "")) != request.role_type or duplicate_count > 1
    )
    team["members"] = members
    update_team_record(team)
    return {
        "team_id": team_id,
        "member": row,
        "created": created,
        "updated": updated,
        "member_count": len(team["members"]),
    }


@app.post("/api/channels")
async def create_channel(
    request: ChannelCreateRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor"})
    source_team = get_team_record(request.source_team_id)
    target_team = get_team_record(request.target_team_id)
    if source_team is None or target_team is None:
        raise HTTPException(status_code=404, detail="Source/target team not found")
    if request.source_team_id == request.target_team_id:
        raise HTTPException(status_code=400, detail="Source and target team cannot be same")
    _require_team_manage_permission(identity, source_team)
    if not _can_view_team(identity, target_team):
        raise HTTPException(status_code=403, detail="target_team_view_permission_required")
    channel_id = str(uuid.uuid4())[:8]
    channel = {
        "id": channel_id,
        "source_team_id": request.source_team_id,
        "target_team_id": request.target_team_id,
        "topic": request.topic,
        "messages": [],
        "created_at": time.time(),
    }
    create_channel_record(channel)
    return {"channel": channel}


@app.get("/api/channels")
async def list_channels(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    rows = list_channel_records()
    if identity.get("role") not in {"owner", "admin"}:
        visible_ids = _visible_team_ids(identity)
        rows = [
            row
            for row in rows
            if str(row.get("source_team_id", "")) in visible_ids or str(row.get("target_team_id", "")) in visible_ids
        ]
    return {"channels": rows, "count": len(rows)}


@app.post("/api/channels/{channel_id}/publish")
async def publish_channel(
    channel_id: str,
    request: ChannelPublishRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    channel = get_channel_record(channel_id)
    if channel is None:
        raise HTTPException(status_code=404, detail="Channel not found")
    if request.from_team_id != channel["source_team_id"] or request.to_team_id != channel["target_team_id"]:
        raise HTTPException(status_code=400, detail="Team routing mismatch for channel")
    if get_member_profile(request.sender_member_id) is None:
        raise HTTPException(status_code=404, detail="Sender member not found")
    if identity.get("role") not in {"owner", "admin"} and identity.get("user_id") != request.sender_member_id:
        raise HTTPException(status_code=403, detail="sender_member_id_must_match_identity")
    if request.allow_external and identity.get("role") not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="channel_external_override_permission_required")
    if len(json.dumps(request.content, ensure_ascii=False, default=str).encode("utf-8")) > 65_536:
        raise HTTPException(status_code=413, detail="channel_content_too_large")

    team_member = _resolve_team_member(request.from_team_id, request.sender_member_id)
    if team_member is None:
        raise HTTPException(status_code=403, detail="Sender is not a member of source team")
    role_type = str(team_member.get("role_type", "executor"))
    if role_type not in CHANNEL_PUBLISH_ALLOWED_ROLES:
        raise HTTPException(
            status_code=403,
            detail=f"Sender role_type '{role_type}' cannot publish inter-team channel",
        )

    policy = policy_engine.check_task_execution(
        role="channel_supervisor",
        spent=0.0,
        budget=1.0,
        external_publish=not request.allow_external,
    )
    if not policy.allowed:
        raise HTTPException(status_code=403, detail=policy.reasons or ["external_publish_blocked"])

    contract = _find_active_contract(request.from_team_id, request.to_team_id)
    message = {
        "timestamp": time.time(),
        "from_team_id": request.from_team_id,
        "to_team_id": request.to_team_id,
        "sender_member_id": request.sender_member_id,
        "content": request.content,
        "sender_role_type": role_type,
        "contract_id": (contract.get("id") if contract else None),
    }
    messages = channel.get("messages")
    if not isinstance(messages, list):
        messages = []
        channel["messages"] = messages
    if len(messages) >= 1000:
        raise HTTPException(status_code=409, detail="channel_message_limit_reached")
    messages.append(message)
    update_channel_record(channel)

    ledger_row = None
    if contract is not None and request.provider_cost > 0:
        calc = royalty_engine.calculate(
            provider_cost=request.provider_cost,
            royalty_rate=float(contract.get("royalty_rate", 0.0)),
            platform_fee_rate=contract.get("platform_fee_rate"),
        )
        ledger_row = {
            "kind": "interteam_channel",
            "created_at": time.time(),
            "run_id": None,
            "channel_id": channel_id,
            "contract_id": contract.get("id"),
            "source_team_id": request.from_team_id,
            "target_team_id": request.to_team_id,
            "sender_member_id": request.sender_member_id,
            "provider_cost": calc.provider_cost,
            "royalty_rate": calc.royalty_rate,
            "royalty_cost": calc.royalty_cost,
            "platform_fee": calc.platform_fee,
            "total_cost": calc.total_cost,
        }
        append_ledger_record(ledger_row)
        decision_log.append(
            {
                "type": "interteam_royalty_recorded",
                "timestamp": time.time(),
                **ledger_row,
            }
        )
    return {
        "allowed": True,
        "message": message,
        "message_count": len(channel["messages"]),
        "contract_applied": (contract is not None),
        "ledger_row": ledger_row,
    }


@app.post("/api/contracts/team-royalty")
async def create_team_royalty_contract(
    request: TeamRoyaltyContractRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin"})
    if get_team_record(request.source_team_id) is None or get_team_record(request.target_team_id) is None:
        raise HTTPException(status_code=404, detail="Source/target team not found")
    if request.source_team_id == request.target_team_id:
        raise HTTPException(status_code=400, detail="Source and target team cannot be same")
    if request.royalty_rate < 0:
        raise HTTPException(status_code=400, detail="royalty_rate must be >= 0")
    if request.platform_fee_rate is not None and request.platform_fee_rate < 0:
        raise HTTPException(status_code=400, detail="platform_fee_rate must be >= 0")

    pair_key = _contract_pair_key(request.source_team_id, request.target_team_id)
    version = _next_contract_version(request.source_team_id, request.target_team_id)
    if request.active:
        deactivate_active_contracts(pair_key=pair_key, deactivated_at=time.time())

    contract = {
        "id": str(uuid.uuid4())[:8],
        "pair_key": pair_key,
        "version": version,
        "source_team_id": request.source_team_id,
        "target_team_id": request.target_team_id,
        "royalty_rate": request.royalty_rate,
        "platform_fee_rate": request.platform_fee_rate,
        "description": request.description,
        "active": request.active,
        "created_at": time.time(),
        "deactivated_at": None,
    }
    create_contract_record(contract)
    return {"contract": contract}


@app.get("/api/contracts/team-royalty")
async def list_team_royalty_contracts(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    rows = list_contract_records()
    if identity.get("role") not in {"owner", "admin"}:
        visible_ids = _visible_team_ids(identity)
        rows = [
            row
            for row in rows
            if str(row.get("source_team_id", "")) in visible_ids or str(row.get("target_team_id", "")) in visible_ids
        ]
    return {"contracts": rows, "count": len(rows)}


@app.patch("/api/contracts/team-royalty/{contract_id}/active")
async def update_team_royalty_contract_active(
    contract_id: str,
    request: ContractActiveUpdateRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin"})
    contract = _find_contract_by_id(contract_id)
    if contract is None:
        raise HTTPException(status_code=404, detail="Contract not found")

    pair_key = contract.get("pair_key")
    now = time.time()
    if request.active:
        deactivate_active_contracts(pair_key=pair_key, exclude_contract_id=contract_id, deactivated_at=now)
        contract["active"] = True
        contract["deactivated_at"] = None
    else:
        contract["active"] = False
        contract["deactivated_at"] = now
    update_contract_record(contract)
    return {"contract": contract}


@app.get("/api/contracts/team-royalty/history")
async def list_team_royalty_contract_history(
    source_team_id: str,
    target_team_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    if identity.get("role") not in {"owner", "admin"}:
        visible_ids = _visible_team_ids(identity)
        if source_team_id not in visible_ids and target_team_id not in visible_ids:
            raise HTTPException(status_code=403, detail="contract_history_view_permission_required")
    pair_key = _contract_pair_key(source_team_id, target_team_id)
    rows = list_contract_history_by_pair(pair_key)
    return {"source_team_id": source_team_id, "target_team_id": target_team_id, "contracts": rows, "count": len(rows)}


@app.post("/api/ledger/royalty/simulate")
async def simulate_royalty(
    request: RoyaltySimulateRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    profile = get_member_profile(request.member_id)
    if profile is None:
        raise HTTPException(status_code=404, detail="Member not found")
    royalty_rate = float(profile.get("royalty_rate", 0.0))
    calc = royalty_engine.calculate(
        provider_cost=request.provider_cost,
        royalty_rate=royalty_rate,
        platform_fee_rate=request.platform_fee_rate,
    )
    return {
        "member_id": request.member_id,
        "provider_cost": calc.provider_cost,
        "royalty_rate": calc.royalty_rate,
        "royalty_cost": calc.royalty_cost,
        "platform_fee": calc.platform_fee,
        "total_cost": calc.total_cost,
    }


@app.get("/api/ledger")
async def get_ledger(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    rows = list_ledger_records()
    if identity.get("role") not in {"owner", "admin"}:
        visible_ids = _visible_team_ids(identity)
        rows = [
            row
            for row in rows
            if str(row.get("source_team_id", "")) in visible_ids
            or str(row.get("target_team_id", "")) in visible_ids
            or str(row.get("receiver_team_id", "")) in visible_ids
            or str(row.get("team_id", "")) in visible_ids
        ]
    return {"rows": rows, "count": len(rows)}


@app.get("/api/ledger/settlements")
async def get_settlements(
    cycle: str = Query("daily"),
    team_id: str | None = None,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    if cycle not in {"daily", "weekly", "monthly"}:
        raise HTTPException(status_code=400, detail="cycle must be one of: daily, weekly, monthly")
    if identity.get("role") in {"owner", "admin"}:
        settlements = aggregate_settlements(cycle=cycle, team_id=team_id)
        return {"cycle": cycle, "team_id": team_id, "settlements": settlements, "count": len(settlements)}

    visible_ids = _visible_team_ids(identity)
    if team_id:
        if team_id not in visible_ids:
            raise HTTPException(status_code=403, detail="settlement_view_permission_required")
        settlements = aggregate_settlements(cycle=cycle, team_id=team_id)
        return {"cycle": cycle, "team_id": team_id, "settlements": settlements, "count": len(settlements)}

    combined: List[Dict[str, Any]] = []
    for visible_team_id in sorted(visible_ids):
        combined.extend(aggregate_settlements(cycle=cycle, team_id=visible_team_id))
    settlements = combined
    return {"cycle": cycle, "team_id": team_id, "settlements": settlements, "count": len(settlements)}


@app.get("/api/graph/workflows")
@app.get("/api/graph/teams", deprecated=True)
async def get_team_graph(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    nodes: List[Dict[str, Any]] = []
    teams = list_team_records()
    channels = list_channel_records()
    ledger = list_ledger_records()
    if identity.get("role") not in {"owner", "admin"}:
        visible_ids = _visible_team_ids(identity)
        teams = [team for team in teams if str(team.get("id", "")) in visible_ids]
        channels = [
            ch
            for ch in channels
            if str(ch.get("source_team_id", "")) in visible_ids and str(ch.get("target_team_id", "")) in visible_ids
        ]
        ledger = [
            row
            for row in ledger
            if str(row.get("source_team_id", "")) in visible_ids
            or str(row.get("target_team_id", "")) in visible_ids
            or str(row.get("receiver_team_id", "")) in visible_ids
            or str(row.get("team_id", "")) in visible_ids
        ]
    for team in teams:
        team_id = str(team.get("id"))
        member_count = len(team.get("members", []))
        out_channels = [c for c in channels if c.get("source_team_id") == team_id]
        in_channels = [c for c in channels if c.get("target_team_id") == team_id]
        earned = sum(
            float(row.get("royalty_cost", 0.0))
            for row in ledger
            if row.get("team_id") == team_id or row.get("source_team_id") == team_id
        )
        nodes.append(
            {
                "id": team_id,
                "name": team.get("name"),
                "domain": team.get("domain"),
                "member_count": member_count,
                "out_channels": len(out_channels),
                "in_channels": len(in_channels),
                "royalty_earned": round(earned, 6),
            }
        )

    edges: List[Dict[str, Any]] = []
    for channel in channels:
        channel_id = str(channel.get("id"))
        src = channel.get("source_team_id")
        dst = channel.get("target_team_id")
        msg_count = len(channel.get("messages", []))
        edges.append(
            {
                "id": channel_id,
                "source": src,
                "target": dst,
                "topic": channel.get("topic"),
                "message_count": msg_count,
                "contract_id": (_find_active_contract(src, dst) or {}).get("id"),
            }
        )
    return {
        "nodes": nodes,
        "edges": edges,
        "workflow_count": len(nodes),
        "connection_count": len(edges),
        "team_count": len(nodes),
        "channel_count": len(edges),
    }


@app.get("/api/compatibility")
async def get_api_compatibility(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member", "viewer"})
    return legacy_api_metadata()


@app.get("/api/policies")
async def get_policies(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor"})
    return {
        "version": policy_engine.version,
        "policy_set": policy_engine.policy_set_name,
        "rules": policy_engine.rules,
    }


@app.post("/api/policies/check")
async def check_policies(
    request: PolicyCheckRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor"})
    mission_result = policy_engine.check_mission_start(
        budget=request.budget,
        use_mock=request.use_mock,
        api_key_available=request.use_mock or _is_provider_key_registered("openai"),
    )
    task_result = None
    if request.role:
        task_result = policy_engine.check_task_execution(
            role=request.role,
            spent=request.spent,
            budget=request.budget,
            external_publish=request.external_publish,
        )
    return {
        "mission_start": {
            "allowed": mission_result.allowed,
            "reasons": mission_result.reasons,
            "warnings": mission_result.warnings,
            "details": mission_result.details,
        },
        "task_pre_execution": (
            {
                "allowed": task_result.allowed,
                "reasons": task_result.reasons,
                "warnings": task_result.warnings,
                "details": task_result.details,
            }
            if task_result
            else None
        ),
    }


@app.post("/api/memory/put")
async def put_memory(
    request: MemoryPutRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    normalized_scope = request.scope.strip().lower()
    normalized_scope_id = request.scope_id.strip()
    normalized_key = request.key.strip()
    normalized_classification = request.classification.strip().lower()
    _require_memory_scope_access(identity, normalized_scope, normalized_scope_id, write=True)
    _require_json_payload_size(
        request.value,
        max_bytes=262_144,
        detail_prefix="memory_value",
    )
    record = MemoryRecord(
        scope=normalized_scope,
        scope_id=normalized_scope_id,
        key=normalized_key,
        value=request.value,
        classification=normalized_classification,
    )
    try:
        memory_engine.put(record)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    upsert_memory_record(
        {
            "scope": record.scope,
            "scope_id": record.scope_id,
            "key": record.key,
            "value": record.value,
            "classification": record.classification,
        },
        updated_at=time.time(),
    )
    return {
        "status": "ok",
        "scope": record.scope,
        "scope_id": record.scope_id,
        "key": record.key,
    }


@app.get("/api/memory/{scope}/{scope_id}")
async def list_memory(
    scope: str,
    scope_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    _require_memory_scope_access(identity, scope, scope_id, write=False)
    records = list_memory_records(scope.strip().lower(), scope_id.strip())
    return {"scope": scope, "scope_id": scope_id, "count": len(records), "records": records}


@app.post("/api/memory/filter-transfer")
async def filter_memory_transfer(
    request: MemoryTransferRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    source_scope = request.source_scope.strip().lower()
    source_scope_id = request.source_scope_id.strip()
    target_scope = request.target_scope.strip().lower()
    target_scope_id = request.target_scope_id.strip()
    _require_memory_scope_access(
        identity,
        source_scope,
        source_scope_id,
        write=False,
    )
    _require_memory_scope_access(
        identity,
        target_scope,
        target_scope_id,
        write=True,
    )
    if request.allow_external and identity.get("role") not in {"owner", "admin"}:
        raise HTTPException(status_code=403, detail="memory_external_override_permission_required")
    transfer_engine = MemoryScopeEngine()
    for row in list_memory_records(source_scope, source_scope_id):
        transfer_engine.put(
            MemoryRecord(
                scope=str(row.get("scope") or source_scope),
                scope_id=str(row.get("scope_id") or source_scope_id),
                key=str(row.get("key") or ""),
                value=row.get("value"),
                classification=str(row.get("classification") or "internal"),
            )
        )
    result = transfer_engine.filter_transfer(
        source_scope=source_scope,
        source_scope_id=source_scope_id,
        target_scope=target_scope,
        target_scope_id=target_scope_id,
        allow_external=request.allow_external,
    )
    if result.get("allowed"):
        for row in result.get("records", []):
            if not isinstance(row, dict):
                continue
            upsert_memory_record(
                {
                    "scope": target_scope,
                    "scope_id": target_scope_id,
                    "key": row.get("key"),
                    "value": row.get("value"),
                    "classification": row.get("classification", "internal"),
                },
                updated_at=time.time(),
            )
    decision_log.append(
        {
            "type": "memory_transfer",
            "timestamp": time.time(),
            "source_scope": source_scope,
            "source_scope_id": source_scope_id,
            "target_scope": target_scope,
            "target_scope_id": target_scope_id,
            "allowed": result.get("allowed", False),
            "reasons": result.get("reasons", []),
            "record_count": len(result.get("records", [])),
        }
    )
    return result


@app.get("/api/health")
async def health_check() -> Dict[str, Any]:
    database_ok = check_database_health()
    security_warnings = security_configuration_issues()
    log_status = decision_log.storage_status()
    status = "healthy" if database_ok and not security_warnings else "degraded" if database_ok else "unhealthy"
    return {
        "status": status,
        "service": "Bremen OS API",
        "database": "ok" if database_ok else "unavailable",
        "auth_mode": _auth_mode_name(),
        "key_storage": _key_storage_mode(),
        "key_storage_secret_env": KEY_ENCRYPTION_SECRET_ENV,
        "runtime_providers": sorted(RUNTIME_SUPPORTED_PROVIDERS),
        "decision_log": {
            "bytes": sum(int(segment["bytes"]) for segment in log_status["segments"]),
            "segments": len(log_status["segments"]),
            "event_count": log_status["event_count"],
            "max_bytes": log_status["max_bytes"],
            "archive_count": log_status["archive_count"],
            "indexed": True,
        },
        "warnings": security_warnings,
    }


@app.get("/api/ontology")
async def get_ontology(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    try:
        ontology = load_ontology(ROOT_DIR / "ontology.yaml")
        registry = RoleRegistry(ontology)
        return {
            "version": ontology.raw.get("version", "unknown"),
            "domain": ontology.raw.get("domain", "unknown"),
            "roles": registry.as_dict(),
            "workflows": list(ontology.workflows.keys()),
            "units": ontology.units,
            "objects": ontology.raw.get("objects", []),
            "actions": ontology.raw.get("actions", []),
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to load ontology: {exc}")


@app.get("/api/routing/preview")
async def routing_preview(
    goal: str = Query(..., min_length=1),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    try:
        ontology = load_ontology(ROOT_DIR / "ontology.yaml")
        registry = RoleRegistry(ontology)
        compiler = WorkflowCompiler(ontology, registry)
        preview = compiler.preview_routing(goal)
        return preview
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to preview routing: {exc}")


if __name__ == "__main__":
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
