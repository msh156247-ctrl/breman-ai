from __future__ import annotations

import json
import re
import tomllib
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
import yaml

from api.access_control import (
    can_access_mission_owner,
    can_manage_team,
    can_view_team,
    resolve_team_member,
    visible_team_ids,
)
from api.approval_notifications import (
    approval_notification_id,
    approval_notification_payload,
    normalize_approval_channels,
    notification_row_from_event,
    retryable_approval_notifications,
)
from api.mission_views import (
    mission_artifacts_response,
    mission_evaluations_response,
    mission_response_snapshot,
    pending_approval_row,
)
from api.security import validate_production_security
from api.server import app
from api.workflow_graph_views import build_workflow_graph_response, filter_workflow_graph_rows
from core.decision_log import DecisionLog


client = TestClient(app)
ROOT_DIR = Path(__file__).resolve().parents[1]


def _headers(user_id: str, role: str = "owner") -> dict[str, str]:
    return {"X-User-Id": user_id, "X-User-Role": role}


def test_readme_api_section_lists_public_fastapi_routes() -> None:
    lines = (ROOT_DIR / "README.md").read_text(encoding="utf-8").splitlines()
    start = lines.index("## API") + 1
    documented: set[tuple[str, str]] = set()
    route_pattern = re.compile(r"^- `(?P<method>GET|POST|PUT|PATCH|DELETE|WS) (?P<path>[^`]+)`")

    for line in lines[start:]:
        if not line.strip():
            if documented:
                break
            continue
        match = route_pattern.match(line)
        if match is None:
            if documented:
                break
            continue
        path = match.group("path").split("?", 1)[0]
        documented.add((match.group("method"), path))

    public_routes: set[tuple[str, str]] = set()
    for route in app.routes:
        path = getattr(route, "path", "")
        if not path.startswith(("/api", "/ws")):
            continue
        methods = getattr(route, "methods", None)
        if methods:
            public_routes.update((method, path) for method in methods if method not in {"HEAD", "OPTIONS"})
        else:
            public_routes.add(("WS", path))

    assert public_routes - documented == set()
    assert documented - public_routes == set()


def test_staging_deployment_configs_match_documented_contracts() -> None:
    railway = tomllib.loads((ROOT_DIR / "railway.toml").read_text(encoding="utf-8"))
    deploy = railway["deploy"]
    assert "api.server:app" in deploy["startCommand"]
    assert "--port $PORT" in deploy["startCommand"]
    assert deploy["healthcheckPath"] == "/api/health"
    assert deploy["numReplicas"] == 1

    vercel = json.loads((ROOT_DIR / "frontend" / "vercel.json").read_text(encoding="utf-8"))
    assert vercel["framework"] == "nextjs"
    assert vercel["installCommand"] == "npm install"
    assert vercel["buildCommand"] == "npm run build"

    ignored = set((ROOT_DIR / "frontend" / ".vercelignore").read_text(encoding="utf-8").splitlines())
    assert {".next", ".next-*", "node_modules", "*.log", ".env*.local"}.issubset(ignored)

    readme = (ROOT_DIR / "README.md").read_text(encoding="utf-8")
    assert "`docs/STAGING.md`" in readme
    assert "`railway.toml`" in readme
    assert "`frontend/vercel.json`" in readme


def test_workspace_settings_round_trip_restores_execution_graph() -> None:
    user_id = "workspace-graph-owner"
    payload = {
        "client_version": "workspace_settings_v4",
        "hired_agents": [{"id": "agent-1", "name": "Builder"}],
        "library_agents": [{"id": "agent-1", "name": "Builder"}],
        "project_units": [],
        "member_folders": [{"id": "dev", "name": "개발"}],
        "agent_folder_ids": {"agent-1": "dev"},
        "nodes": [
            {"id": "node-1", "type": "agentNode", "position": {"x": 10, "y": 20}, "data": {"label": "Build"}},
            {"id": "node-2", "type": "agentNode", "position": {"x": 40, "y": 20}, "data": {"label": "Review"}},
        ],
        "edges": [{"id": "edge-1", "source": "node-1", "target": "node-2", "type": "smoothstep"}],
        "node_execution_states": {"node-1": "completed", "node-2": "idle"},
        "artifact_versions": [
            {
                "artifact_id": "build.md",
                "version": "v1",
                "changed_by": "agent-1",
                "summary": "created",
                "timestamp": "2026-06-25T00:00:00Z",
            }
        ],
        "loop_regions": [
            {
                "id": "loop-1",
                "name": "Review loop",
                "nodeIds": ["node-1", "node-2"],
                "startNodeId": "node-1",
                "endNodeId": "node-2",
                "exitNodeId": "__finish__",
                "repeatCount": 3,
                "exitCondition": "quality >= 0.9",
                "createdAt": "2026-06-25T00:00:00Z",
            }
        ],
    }

    saved = client.put("/api/workspace/settings", headers=_headers(user_id), json=payload)
    assert saved.status_code == 200
    settings = saved.json()["settings"]
    assert settings["schema_version"] == 4
    assert settings["nodes"] == payload["nodes"]
    assert settings["edges"] == payload["edges"]
    assert settings["loop_regions"][0]["startNodeId"] == "node-1"

    loaded = client.get("/api/workspace/settings", headers=_headers(user_id))
    assert loaded.status_code == 200
    restored = loaded.json()["settings"]
    assert restored["hired_agents"][0]["id"] == "agent-1"
    assert restored["node_execution_states"] == payload["node_execution_states"]
    assert restored["artifact_versions"] == payload["artifact_versions"]


def test_canonical_workflow_fields_keep_legacy_response_aliases() -> None:
    response = client.post(
        "/api/missions",
        headers=_headers("workflow-fields-owner"),
        json={
            "goal": "canonical workflow fields",
            "budget": 1,
            "use_mock": True,
            "workflow_id": "workflow-canonical",
            "workflow_label": "Canonical workflow",
            "workflow_graph": {
                "nodes": [
                    {"id": "node-a", "type": "agentNode", "data": {"label": "Plan"}},
                    {"id": "node-b", "type": "agentNode", "data": {"label": "Build"}},
                ],
                "edges": [{"id": "edge-a", "source": "node-a", "target": "node-b"}],
                "loop_regions": [],
            },
        },
    )
    assert response.status_code == 200
    body = response.json()
    assert body["workflow_id"] == "workflow-canonical"
    assert body["team_id"] == "workflow-canonical"

    detail = client.get(f"/api/missions/{body['mission_id']}", headers=_headers("workflow-fields-owner"))
    assert detail.status_code == 200
    mission = detail.json()
    assert mission["workflow_graph"] == mission["team_graph"]
    assert mission["workflow_label"] == mission["team_label"]


def test_legacy_api_metadata_is_explicit() -> None:
    response = client.get("/api/compatibility", headers=_headers("compat-viewer", "viewer"))
    assert response.status_code == 200
    body = response.json()
    assert body["deprecated_fields"]["team_graph"] == "workflow_graph"
    assert body["deprecated_routes"]["/api/graph/teams"] == "/api/graph/workflows"
    canonical = client.get("/api/graph/workflows", headers=_headers("compat-viewer", "viewer"))
    legacy = client.get("/api/graph/teams", headers=_headers("compat-viewer", "viewer"))
    assert canonical.status_code == legacy.status_code == 200
    assert canonical.json()["nodes"] == legacy.json()["nodes"]


def test_production_security_guard_requires_strong_jwt_only_configuration(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BREMEN_ENV", "production")
    monkeypatch.setenv("BREMEN_AUTH_JWT_ONLY", "false")
    monkeypatch.delenv("BREMEN_JWT_SECRET", raising=False)
    monkeypatch.delenv("BREMEN_KEY_ENCRYPTION_SECRET", raising=False)
    monkeypatch.delenv("BREMEN_ADMIN_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="unsafe_production_security_configuration"):
        validate_production_security()

    monkeypatch.setenv("BREMEN_AUTH_JWT_ONLY", "true")
    monkeypatch.setenv("BREMEN_JWT_SECRET", "jwt-secret-" + "x" * 32)
    monkeypatch.setenv("BREMEN_KEY_ENCRYPTION_SECRET", "key-secret-" + "y" * 32)
    monkeypatch.setenv("BREMEN_ADMIN_TOKEN", "admin-token-" + "z" * 24)
    validate_production_security()


def test_staging_uses_production_security_guard(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BREMEN_ENV", "staging")
    monkeypatch.setenv("BREMEN_AUTH_JWT_ONLY", "false")
    monkeypatch.delenv("BREMEN_JWT_SECRET", raising=False)
    monkeypatch.delenv("BREMEN_KEY_ENCRYPTION_SECRET", raising=False)
    monkeypatch.delenv("BREMEN_ADMIN_TOKEN", raising=False)
    with pytest.raises(RuntimeError, match="unsafe_production_security_configuration"):
        validate_production_security()


def test_frontend_does_not_reference_public_admin_token_env() -> None:
    forbidden = "NEXT_PUBLIC_BREMEN_ADMIN_TOKEN"
    ignored_dirs = {"node_modules", ".next", "out", "dist"}
    checked_suffixes = {".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".json"}
    offenders: list[str] = []

    for path in (ROOT_DIR / "frontend").rglob("*"):
        if not path.is_file() or path.suffix not in checked_suffixes:
            continue
        if ignored_dirs.intersection(path.parts) or any(part.startswith(".next") for part in path.parts):
            continue
        if forbidden in path.read_text(encoding="utf-8", errors="ignore"):
            offenders.append(str(path.relative_to(ROOT_DIR)))

    assert offenders == []


def test_readme_documents_jwt_only_key_management_without_browser_admin_token() -> None:
    readme = (ROOT_DIR / "README.md").read_text(encoding="utf-8")
    assert "`BREMEN_AUTH_JWT_ONLY=true`에서는 유효한 `owner|admin` JWT" in readme
    assert "브라우저 관리자 토큰 없이 key 변경" in readme
    assert "provider key 변경 API는 `owner|admin` JWT를 관리자 증명으로 사용" in readme


def test_decision_log_rotates_and_keeps_indexed_mission_queries(tmp_path: Path) -> None:
    log = DecisionLog(tmp_path / "decision_log.jsonl", max_bytes=1024, archive_count=2)
    for index in range(40):
        log.append(
            {
                "type": "task_event",
                "mission_id": "mission-indexed",
                "timestamp": index,
                "message": f"{index}-" + ("x" * 120),
            }
        )

    status = log.storage_status()
    rows = log.list_by_mission("mission-indexed")
    assert status["event_count"] == len(rows)
    assert status["event_count"] > 0
    assert len(status["segments"]) <= 3
    assert Path(status["index_path"]).exists()
    assert rows[-1]["timestamp"] == 39
    assert [row["timestamp"] for row in rows] == sorted(row["timestamp"] for row in rows)


def test_generated_frontend_ontology_matches_yaml_source() -> None:
    source = yaml.safe_load((ROOT_DIR / "ontology.yaml").read_text(encoding="utf-8"))
    generated = json.loads(
        (ROOT_DIR / "frontend" / "generated" / "ontology.json").read_text(encoding="utf-8")
    )
    assert generated["generated_from"] == "../ontology.yaml"
    assert generated["version"] == str(source["version"])
    assert generated["units"] == source["units"]


def test_auth_runtime_is_split_from_api_server() -> None:
    server_source = (ROOT_DIR / "api" / "server.py").read_text(encoding="utf-8")
    auth_runtime_source = (ROOT_DIR / "api" / "auth_runtime.py").read_text(encoding="utf-8")

    assert "from api.auth_runtime import" in server_source
    assert "async def resolve_jwt_identity_middleware" in auth_runtime_source
    assert "def _resolve_identity" in auth_runtime_source
    assert "def _resolve_identity" not in server_source


def test_approval_transport_is_split_but_server_keeps_patchable_wrappers() -> None:
    server_source = (ROOT_DIR / "api" / "server.py").read_text(encoding="utf-8")
    transport_source = (ROOT_DIR / "api" / "approval_transport.py").read_text(encoding="utf-8")

    assert "from api.approval_transport import" in server_source
    assert "def post_json_webhook" in transport_source
    assert "def send_smtp_approval_email" in transport_source
    assert "def _post_json_webhook" in server_source
    assert "def _send_smtp_approval_email" in server_source
    assert "class NoRedirectHandler" not in server_source


def test_approval_notification_helpers_are_split_from_api_server() -> None:
    server_source = (ROOT_DIR / "api" / "server.py").read_text(encoding="utf-8")
    notification_source = (ROOT_DIR / "api" / "approval_notifications.py").read_text(encoding="utf-8")

    assert "from api.approval_notifications import" in server_source
    assert "def normalize_approval_channel" in notification_source
    assert "def approval_notification_payload" in notification_source
    assert "def notification_row_from_event" in notification_source
    assert "def retryable_approval_notifications" in notification_source
    assert "APPROVAL_CHANNEL_ALIASES" not in server_source
    assert "def _normalize_approval_channel" not in server_source
    assert "def _approval_notification_id" not in server_source
    assert "def _notification_row_from_event" not in server_source
    assert "retryable_statuses" not in server_source


def test_approval_notification_helpers_normalize_payload_and_retry_targets() -> None:
    channels = normalize_approval_channels(["관리자", "이메일", "문자", "카카오톡", "email"])
    assert channels == ["admin_queue", "email", "sms", "kakao"]

    notification_id = approval_notification_id("mission-a", "task-a", "before_run", "email")
    assert notification_id == "mission-a:task-a:before_run:email"

    payload = approval_notification_payload(
        {
            "id": notification_id,
            "mission_id": "mission-a",
            "task_id": "task-a",
            "gate_stage": "before_run",
            "channel": "email",
            "target": "ops@example.com",
            "requested_at": 123,
        },
        public_url=lambda path, mission_id: f"https://ops.test{path}",
    )
    assert payload["approve_url"] == "https://ops.test/runs?mission=mission-a"
    assert payload["ops_url"] == "https://ops.test/chat/mission-a?tab=timeline"

    row = notification_row_from_event(
        {
            "type": "approval_notification_delivery",
            "mission_id": "mission-a",
            "task_id": "task-a",
            "gate_stage": "before_run",
            "channel": "email",
            "timestamp": 100,
            "delivery_status": "failed",
            "delivery_transport": "webhook",
            "delivery_error": "down",
        }
    )
    assert row["id"] == notification_id
    assert row["delivery_status"] == "failed"
    assert row["delivery_transport"] == "webhook"

    retryable = retryable_approval_notifications(
        [
            row,
            {"id": "mission-a:task-a:before_run:admin_queue", "channel": "admin_queue", "delivery_status": "pending"},
            {"id": "mission-a:task-a:before_run:sms", "channel": "sms", "delivery_status": "sent"},
        ],
        channels=["이메일"],
    )
    assert [item["id"] for item in retryable] == [notification_id]


def test_market_view_helpers_are_split_from_api_server() -> None:
    server_source = (ROOT_DIR / "api" / "server.py").read_text(encoding="utf-8")
    market_source = (ROOT_DIR / "api" / "market_views.py").read_text(encoding="utf-8")

    assert "from api.market_views import" in server_source
    assert "def matches_market_filters" in market_source
    assert "def decorate_member_for_market" in market_source
    assert "def decorate_team_for_market" in market_source
    assert "def team_member_profiles" in market_source
    assert "haystack_parts = [" not in server_source


def test_key_admin_helpers_are_split_from_api_server() -> None:
    server_source = (ROOT_DIR / "api" / "server.py").read_text(encoding="utf-8")
    key_admin_source = (ROOT_DIR / "api" / "key_admin.py").read_text(encoding="utf-8")

    assert "from api.key_admin import" in server_source
    assert "def mask_key" in key_admin_source
    assert "def require_admin" in key_admin_source
    assert "def require_admin_token_or_jwt_owner" in key_admin_source
    assert "def sanitize_backup_label" in key_admin_source
    assert "def _mask_key" not in server_source
    assert "def _require_admin" not in server_source
    assert "ch.isalnum() or ch in" not in server_source


def test_workflow_graph_views_are_split_from_api_server() -> None:
    server_source = (ROOT_DIR / "api" / "server.py").read_text(encoding="utf-8")
    graph_source = (ROOT_DIR / "api" / "workflow_graph_views.py").read_text(encoding="utf-8")

    assert "from api.workflow_graph_views import" in server_source
    assert "def build_workflow_graph_response" in graph_source
    assert "def filter_workflow_graph_rows" in graph_source
    assert "def ledger_row_touches_team" in graph_source
    assert '"royalty_earned": round' not in server_source
    assert '"workflow_count": len(nodes)' not in server_source


def test_workflow_graph_view_summarizes_rows_and_visibility() -> None:
    teams = [
        {"id": "team-a", "name": "Alpha", "domain": "dev", "members": [{"member_id": "a"}]},
        {"id": "team-b", "name": "Beta", "domain": "qa", "members": []},
    ]
    channels = [
        {
            "id": "channel-ab",
            "source_team_id": "team-a",
            "target_team_id": "team-b",
            "topic": "handoff",
            "messages": [{"text": "ready"}],
        }
    ]
    ledger = [
        {"team_id": "team-a", "royalty_cost": 0.125},
        {"source_team_id": "team-b", "royalty_cost": 0.25},
    ]

    response = build_workflow_graph_response(
        teams,
        channels,
        ledger,
        find_active_contract=lambda source, target: {"id": "contract-ab"} if source == "team-a" and target == "team-b" else None,
    )
    assert response["workflow_count"] == 2
    assert response["connection_count"] == 1
    assert response["nodes"][0]["member_count"] == 1
    assert response["nodes"][0]["royalty_earned"] == 0.125
    assert response["edges"][0]["contract_id"] == "contract-ab"

    visible_teams, visible_channels, visible_ledger = filter_workflow_graph_rows(
        teams,
        channels,
        ledger,
        {"team-a"},
    )
    assert [team["id"] for team in visible_teams] == ["team-a"]
    assert visible_channels == []
    assert visible_ledger == [ledger[0]]


def test_access_control_helpers_are_split_from_api_server() -> None:
    server_source = (ROOT_DIR / "api" / "server.py").read_text(encoding="utf-8")
    access_source = (ROOT_DIR / "api" / "access_control.py").read_text(encoding="utf-8")

    assert "from api.access_control import" in server_source
    assert "def resolve_team_member" in access_source
    assert "def can_manage_team" in access_source
    assert "def can_view_team" in access_source
    assert "def visible_team_ids" in access_source
    assert "def can_access_mission_owner" in access_source
    assert "TEAM_ROLE_PRIORITY" not in server_source
    assert '"team_manage_permission_required"' not in server_source


def test_access_control_prefers_highest_duplicate_team_role() -> None:
    team = {
        "id": "team-a",
        "created_by": "owner-a",
        "members": [
            {"member_id": "member-a", "role_type": "executor"},
            {"member_id": "member-a", "role_type": "channel_supervisor"},
            {"member_id": "member-a", "role_type": "supervisor"},
        ],
    }
    identity = {"user_id": "member-a", "role": "member"}
    resolver = lambda _team_id, member_id: resolve_team_member(team, member_id)

    assert resolve_team_member(team, "member-a") == {"member_id": "member-a", "role_type": "channel_supervisor"}
    assert can_manage_team(identity, team, resolver) is True
    assert can_view_team(identity, team, resolver) is True
    assert visible_team_ids(identity, [team], resolver) == {"team-a"}
    assert can_access_mission_owner(identity, "member-a") is True
    assert can_access_mission_owner(identity, "other-member") is False


def test_mission_view_helpers_are_split_from_api_server() -> None:
    server_source = (ROOT_DIR / "api" / "server.py").read_text(encoding="utf-8")
    mission_source = (ROOT_DIR / "api" / "mission_views.py").read_text(encoding="utf-8")

    assert "from api.mission_views import" in server_source
    assert "def mission_response_snapshot" in mission_source
    assert "def mission_artifacts_response" in mission_source
    assert "def mission_timeline_response" in mission_source
    assert "def mission_evaluations_response" in mission_source
    assert "def pending_approval_row" in mission_source
    assert 'workflow_id = mission.get("workflow_id"' not in server_source
    assert 'task.get("artifacts"' not in server_source


def test_mission_view_helpers_preserve_response_contracts() -> None:
    mission = {
        "id": "mission-a",
        "goal": "Build",
        "status": "awaiting_approval",
        "workflow_id": "workflow-a",
        "workflow_label": "Workflow A",
        "workflow_graph": {"nodes": [], "edges": []},
        "tasks": [
            {"id": "task-a", "status": "completed", "artifacts": {"doc": "ok"}},
            {"id": "task-b", "status": "running", "artifacts": {"draft": "skip"}},
            {"id": "task-c", "status": "completed", "artifacts": {}},
        ],
    }

    snapshot = mission_response_snapshot(mission)
    assert snapshot["team_id"] == "workflow-a"
    assert snapshot["team_label"] == "Workflow A"
    assert snapshot["team_graph"] == {"nodes": [], "edges": []}

    artifacts = mission_artifacts_response("mission-a", mission)
    assert artifacts == {
        "mission_id": "mission-a",
        "artifacts": {"task-a": {"doc": "ok"}},
        "total_tasks": 3,
        "completed_tasks": 1,
    }

    evaluations = mission_evaluations_response(
        "mission-a",
        [],
        [
            {"type": "task_completed", "task_id": "task-a"},
            {"type": "evaluation_result", "task_id": "task-a", "quality_pass": True},
        ],
    )
    assert evaluations["count"] == 1
    assert evaluations["evaluations"][0]["task_id"] == "task-a"

    approval = pending_approval_row(
        "mission-a",
        {"task_id": "task-a", "role": "reviewer", "gate_stage": "before_run", "runtime_active": False},
        mission,
        approval_channels=["admin_queue"],
        owner_id="owner-a",
        notifications=[],
    )
    assert approval["mission_goal"] == "Build"
    assert approval["can_approve"] is False
    assert approval["owner_id"] == "owner-a"
