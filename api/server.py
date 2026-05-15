from __future__ import annotations

import asyncio
from contextvars import ContextVar
from datetime import datetime, timezone
from pathlib import Path
import os
import threading
import time
import uuid
from typing import Any, Dict, List

import jwt
from fastapi import FastAPI, Header, HTTPException, Query, Request, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
import uvicorn

from core.composer import ComposerRuntime
from core.capability_registry import CapabilityRegistry
from core.db import (
    aggregate_settlements,
    append_ledger_record,
    append_key_history,
    backup_database,
    create_channel_record,
    create_contract_record,
    create_member_profile,
    create_team_record,
    deactivate_active_contracts,
    delete_provider_key,
    get_active_contract_record,
    get_db_file_path,
    get_channel_record,
    get_contract_record,
    get_member_profile,
    get_mission_owner,
    get_team_record,
    init_db,
    is_provider_key_registered,
    list_key_history,
    list_channel_records,
    list_contract_history_by_pair,
    list_contract_records,
    list_ledger_records,
    list_key_status,
    list_registered_keys,
    list_team_records,
    run_integrity_checks,
    upsert_provider_key,
    update_channel_record,
    update_contract_record,
    update_team_record,
    upsert_mission_owner,
)
from core.decision_log import DecisionLog
from core.memory_scope import MemoryRecord, MemoryScopeEngine
from core.ontology_loader import load_ontology
from core.policy_engine import PolicyEngine
from core.role_registry import RoleRegistry
from core.royalty_engine import RoyaltyEngine
from core.trust_engine import TrustEngine
from core.workflow_compiler import WorkflowCompiler


app = FastAPI(title="Bremen OS API", version="1.0.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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


class MissionRequest(BaseModel):
    goal: str
    budget: float = 5.0
    use_mock: bool = True
    team_id: str | None = None


class MemberCreateRequest(BaseModel):
    name: str
    provider: str
    model: str
    version: str
    description: str = ""
    domain: str = "general"
    capabilities: List[str] = []
    royalty_rate: float = 0.0


class PolicyCheckRequest(BaseModel):
    budget: float = 5.0
    use_mock: bool = True
    role: str | None = None
    spent: float = 0.0
    external_publish: bool = False


class MemoryPutRequest(BaseModel):
    scope: str
    scope_id: str
    key: str
    value: Any
    classification: str = "internal"


class MemoryTransferRequest(BaseModel):
    source_scope: str
    source_scope_id: str
    target_scope: str
    target_scope_id: str
    allow_external: bool = False


class TeamCreateRequest(BaseModel):
    name: str
    domain: str = "general"
    policy_set: str = "default"
    description: str = ""


class TeamMemberAddRequest(BaseModel):
    member_id: str
    role_type: str = "executor"  # executor | supervisor | channel_supervisor


class ChannelCreateRequest(BaseModel):
    source_team_id: str
    target_team_id: str
    topic: str


class ChannelPublishRequest(BaseModel):
    from_team_id: str
    to_team_id: str
    sender_member_id: str
    content: Dict[str, Any]
    allow_external: bool = False
    provider_cost: float = 0.0


class RoyaltySimulateRequest(BaseModel):
    member_id: str
    provider_cost: float
    platform_fee_rate: float | None = None


class TeamRoyaltyContractRequest(BaseModel):
    source_team_id: str
    target_team_id: str
    royalty_rate: float
    platform_fee_rate: float | None = None
    description: str = ""
    active: bool = True


class ContractActiveUpdateRequest(BaseModel):
    active: bool


class ApiKeyRegisterRequest(BaseModel):
    provider: str
    api_key: str


class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: List[WebSocket] = []
        self.mission_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, mission_id: str | None = None) -> None:
        await websocket.accept()
        self.active_connections.append(websocket)
        if mission_id:
            self.mission_connections.setdefault(mission_id, []).append(websocket)

    def disconnect(self, websocket: WebSocket, mission_id: str | None = None) -> None:
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)
        if mission_id and mission_id in self.mission_connections:
            conns = self.mission_connections[mission_id]
            if websocket in conns:
                conns.remove(websocket)

    async def broadcast_to_mission(self, mission_id: str, message: dict) -> None:
        connections = self.mission_connections.get(mission_id, [])
        disconnected: List[WebSocket] = []
        for connection in connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn, mission_id)

    async def broadcast_all(self, message: dict) -> None:
        disconnected: List[WebSocket] = []
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for conn in disconnected:
            self.disconnect(conn)


manager = ConnectionManager()
missions: Dict[str, dict] = {}
running_tasks: Dict[str, asyncio.Task] = {}
mission_owners: Dict[str, str] = {}
decision_log = DecisionLog(Path(__file__).resolve().parents[1] / "runtime" / "decision_log.jsonl")
trust_engine = TrustEngine(Path(__file__).resolve().parents[1] / "runtime" / "trust_log.jsonl")
cap_registry = CapabilityRegistry(Path(__file__).resolve().parents[1] / "capabilities.yaml")
policy_engine = PolicyEngine(Path(__file__).resolve().parents[1] / "policy_rules.yaml", policy_set="default")
memory_engine = MemoryScopeEngine()
royalty_engine = RoyaltyEngine()
evaluations: Dict[str, List[Dict[str, Any]]] = {}

ALLOWED_TEAM_ROLE_TYPES = {"executor", "supervisor", "channel_supervisor"}
CHANNEL_PUBLISH_ALLOWED_ROLES = {"supervisor", "channel_supervisor"}
PROVIDER_ENV_MAP = {
    "openai": "OPENAI_API_KEY",
    "anthropic": "ANTHROPIC_API_KEY",
    "gemini": "GEMINI_API_KEY",
}
ADMIN_TOKEN_ENV = "BREMEN_ADMIN_TOKEN"
JWT_SECRET_ENV = "BREMEN_JWT_SECRET"
JWT_ALGORITHM = "HS256"
DEFAULT_JWT_SECRET = "bremen-jwt-dev-secret-change-me-32bytes"
AUTH_JWT_ONLY_ENV = "BREMEN_AUTH_JWT_ONLY"
JWT_ISSUER_ENV = "BREMEN_JWT_ISSUER"
JWT_AUDIENCE_ENV = "BREMEN_JWT_AUDIENCE"
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
for _row in list_registered_keys():
    _provider = str(_row.get("provider", "")).strip().lower()
    if _provider in PROVIDER_ENV_MAP:
        os.environ[PROVIDER_ENV_MAP[_provider]] = str(_row.get("api_key", ""))


def _is_truthy(value: str | None) -> bool:
    if value is None:
        return False
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _is_jwt_only_mode() -> bool:
    return _is_truthy(os.getenv(AUTH_JWT_ONLY_ENV))


def _auth_mode_name() -> str:
    return "jwt_only" if _is_jwt_only_mode() else "hybrid"


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
    for row in team.get("members", []):
        if row.get("member_id") == member_id:
            return row
    return None


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


def _get_mission_owner_cached(mission_id: str) -> str | None:
    owner_id = mission_owners.get(mission_id) or get_mission_owner(mission_id)
    if owner_id and mission_id not in mission_owners:
        mission_owners[mission_id] = owner_id
    return owner_id


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
    token_identity = _decode_jwt_identity((websocket.query_params.get("jwt") or ""))
    if token_identity is not None:
        return token_identity
    return _resolve_identity(
        websocket.query_params.get("user_id"),
        websocket.query_params.get("user_role"),
    )


def _extract_request_meta(request: Request) -> Dict[str, Any]:
    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")
    return {"ip": client_ip, "user_agent": user_agent}


@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket) -> None:
    try:
        identity = _resolve_ws_identity(websocket)
    except HTTPException:
        await websocket.close(code=1008, reason="ws_auth_invalid")
        return
    if identity.get("role") not in {"owner", "admin"}:
        await websocket.close(code=1008, reason="ws_access_denied")
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
        await websocket.close(code=1008, reason="ws_auth_invalid")
        return
    if mission_id not in missions:
        await websocket.close(code=1008, reason="mission_not_found")
        return
    if not _can_access_mission(identity, mission_id):
        await websocket.close(code=1008, reason="mission_access_denied")
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
) -> Dict[str, str]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    if not request.use_mock:
        if not _is_provider_key_registered("openai"):
            raise HTTPException(
                status_code=403,
                detail="openai_api_key_not_registered: register key via /api/keys/register",
            )

    def event_handler(event: dict) -> None:
        decision_log.append(event)
        event_mission_id = event.get("mission_id")
        if event.get("type") == "evaluation_result" and isinstance(event_mission_id, str):
            evaluations.setdefault(event_mission_id, []).append(event)
        asyncio.create_task(manager.broadcast_all(event))
        if isinstance(event_mission_id, str):
            asyncio.create_task(manager.broadcast_to_mission(event_mission_id, event))

    composer = ComposerRuntime(use_mock=request.use_mock, on_event=event_handler)
    planned = composer.plan_mission(request.goal, request.budget)
    missions[planned.id] = planned.to_dict()
    mission_owners[planned.id] = identity["user_id"]
    upsert_mission_owner(
        mission_id=planned.id,
        owner_id=identity["user_id"],
        created_at=time.time(),
    )
    decision_log.append(
        {
            "type": "mission_created",
            "timestamp": asyncio.get_event_loop().time(),
            "mission_id": planned.id,
            "goal": request.goal,
            "budget": request.budget,
            "use_mock": request.use_mock,
            "team_id": request.team_id,
            "created_by": identity["user_id"],
            "created_role": identity["role"],
        }
    )

    async def run_and_store() -> None:
        result = await composer.execute_mission(planned)
        missions[planned.id] = planned.to_dict()
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
                    append_ledger_record(row)
                    decision_log.append(
                        {
                            "type": "royalty_recorded",
                            "timestamp": asyncio.get_event_loop().time(),
                            "mission_id": planned.id,
                            **row,
                        }
                    )
        await manager.broadcast_to_mission(
            planned.id,
            {"type": "mission_snapshot", "mission_id": planned.id, "mission": missions[planned.id], "success": result},
        )

    running_tasks[planned.id] = asyncio.create_task(run_and_store())
    return {
        "mission_id": planned.id,
        "goal": request.goal,
        "budget": str(request.budget),
        "status": "started",
        "message": "미션이 백그라운드에서 실행 중입니다.",
    }


@app.get("/api/missions/{mission_id}")
async def get_mission(
    mission_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> dict:
    identity = _resolve_identity(x_user_id, x_user_role)
    mission = missions.get(mission_id)
    if mission is None:
        raise HTTPException(status_code=404, detail="Mission not found")
    _require_mission_access(identity, mission_id)
    return {**mission, "owner_id": _get_mission_owner_cached(mission_id)}


@app.get("/api/missions")
async def list_missions(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> List[dict]:
    identity = _resolve_identity(x_user_id, x_user_role)
    if identity.get("role") in {"owner", "admin"}:
        return [{**m, "owner_id": _get_mission_owner_cached(mid)} for mid, m in missions.items()]
    return [
        {**mission, "owner_id": _get_mission_owner_cached(mission_id)}
        for mission_id, mission in missions.items()
        if _get_mission_owner_cached(mission_id) == identity.get("user_id")
    ]


@app.post("/api/missions/{mission_id}/approve")
async def approve_human_gate(
    mission_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    if mission_id not in missions:
        raise HTTPException(status_code=404, detail="Mission not found")
    _require_mission_access(identity, mission_id)
    decision_log.append(
        {
            "type": "human_gate_approved",
            "timestamp": asyncio.get_event_loop().time(),
            "mission_id": mission_id,
            "approved_by": identity["user_id"],
            "approved_role": identity["role"],
        }
    )
    return {
        "status": "approved",
        "message": f"Mission {mission_id} Human Gate approved",
        "timestamp": asyncio.get_event_loop().time(),
    }


@app.get("/api/missions/{mission_id}/artifacts")
async def get_mission_artifacts(
    mission_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    mission = missions.get(mission_id)
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
    if mission_id not in missions:
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
    if mission_id not in missions:
        raise HTTPException(status_code=404, detail="Mission not found")
    _require_mission_access(identity, mission_id)
    rows = evaluations.get(mission_id, [])
    return {"mission_id": mission_id, "evaluations": rows, "count": len(rows)}


@app.get("/api/capabilities")
async def list_capabilities(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member", "viewer"})
    return {"version": cap_registry.version, "capabilities": cap_registry.list_all()}


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
            "timestamp": asyncio.get_event_loop().time(),
            "member_id": member_id,
            "provider": request.provider,
            "model": request.model,
            "version": request.version,
            "capabilities": validation["valid"],
        }
    )
    return {"member": profile, "invalid_capabilities": validation["invalid"]}


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
    _require_admin(x_admin_token)
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin"})
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
    os.environ[PROVIDER_ENV_MAP[provider]] = raw_key
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
    _require_admin(x_admin_token)
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin"})
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
    os.environ.pop(PROVIDER_ENV_MAP[normalized], None)
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
        "created_at": asyncio.get_event_loop().time(),
    }
    create_team_record(team)
    return {"team": team}


@app.get("/api/teams")
async def list_teams(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    rows = list_team_records()
    if identity.get("role") not in {"owner", "admin"}:
        rows = [row for row in rows if _can_view_team(identity, row)]
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
    return {"team": team}


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
    row = {"member_id": request.member_id, "role_type": request.role_type}
    team["members"].append(row)
    update_team_record(team)
    return {"team_id": team_id, "member": row, "member_count": len(team["members"])}


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
    _require_team_manage_permission(identity, source_team)
    channel_id = str(uuid.uuid4())[:8]
    channel = {
        "id": channel_id,
        "source_team_id": request.source_team_id,
        "target_team_id": request.target_team_id,
        "topic": request.topic,
        "messages": [],
        "created_at": asyncio.get_event_loop().time(),
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
        return {"allowed": False, "reasons": policy.reasons, "warnings": policy.warnings}

    contract = _find_active_contract(request.from_team_id, request.to_team_id)
    message = {
        "timestamp": asyncio.get_event_loop().time(),
        "from_team_id": request.from_team_id,
        "to_team_id": request.to_team_id,
        "sender_member_id": request.sender_member_id,
        "content": request.content,
        "sender_role_type": role_type,
        "contract_id": (contract.get("id") if contract else None),
    }
    channel["messages"].append(message)
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
                "timestamp": asyncio.get_event_loop().time(),
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
        deactivate_active_contracts(pair_key=pair_key, deactivated_at=asyncio.get_event_loop().time())

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
        "created_at": asyncio.get_event_loop().time(),
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
    now = asyncio.get_event_loop().time()
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
async def simulate_royalty(request: RoyaltySimulateRequest) -> Dict[str, Any]:
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


@app.get("/api/graph/teams")
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
    return {"nodes": nodes, "edges": edges, "team_count": len(nodes), "channel_count": len(edges)}


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
    mission_result = policy_engine.check_mission_start(budget=request.budget, use_mock=request.use_mock)
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
    record = MemoryRecord(
        scope=request.scope,
        scope_id=request.scope_id,
        key=request.key,
        value=request.value,
        classification=request.classification,
    )
    try:
        memory_engine.put(record)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"status": "ok", "scope": request.scope, "scope_id": request.scope_id, "key": request.key}


@app.get("/api/memory/{scope}/{scope_id}")
async def list_memory(
    scope: str,
    scope_id: str,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    records = memory_engine.get_scope(scope, scope_id)
    return {"scope": scope, "scope_id": scope_id, "count": len(records), "records": records}


@app.post("/api/memory/filter-transfer")
async def filter_memory_transfer(
    request: MemoryTransferRequest,
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    result = memory_engine.filter_transfer(
        source_scope=request.source_scope,
        source_scope_id=request.source_scope_id,
        target_scope=request.target_scope,
        target_scope_id=request.target_scope_id,
        allow_external=request.allow_external,
    )
    decision_log.append(
        {
            "type": "memory_transfer",
            "timestamp": asyncio.get_event_loop().time(),
            "source_scope": request.source_scope,
            "source_scope_id": request.source_scope_id,
            "target_scope": request.target_scope,
            "target_scope_id": request.target_scope_id,
            "allowed": result.get("allowed", False),
            "reasons": result.get("reasons", []),
            "record_count": len(result.get("records", [])),
        }
    )
    return result


@app.get("/api/health")
async def health_check() -> Dict[str, str]:
    return {"status": "healthy", "service": "Bremen OS API"}


@app.get("/api/ontology")
async def get_ontology(
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
    x_user_role: str | None = Header(default=None, alias="X-User-Role"),
) -> Dict[str, Any]:
    identity = _resolve_identity(x_user_id, x_user_role)
    _require_roles(identity, {"owner", "admin", "supervisor", "member"})
    try:
        ontology = load_ontology("ontology.yaml")
        registry = RoleRegistry(ontology)
        return {
            "version": ontology.raw.get("version", "unknown"),
            "domain": ontology.raw.get("domain", "unknown"),
            "roles": registry.as_dict(),
            "workflows": list(ontology.workflows.keys()),
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
        ontology = load_ontology("ontology.yaml")
        registry = RoleRegistry(ontology)
        compiler = WorkflowCompiler(ontology, registry)
        preview = compiler.preview_routing(goal)
        return preview
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to preview routing: {exc}")


if __name__ == "__main__":
    uvicorn.run("api.server:app", host="0.0.0.0", port=8000, reload=True, log_level="info")
