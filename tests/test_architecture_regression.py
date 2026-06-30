from __future__ import annotations

import json
import re
from pathlib import Path

from fastapi.testclient import TestClient
import pytest
import yaml

from api.security import validate_production_security
from api.server import app
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
