from __future__ import annotations

import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from api.server import DEFAULT_JWT_SECRET, app, mission_owners


client = TestClient(app)


def _headers(user_id: str, role: str) -> dict[str, str]:
    return {"X-User-Id": user_id, "X-User-Role": role}


def test_auth_permissions_snapshot_for_viewer() -> None:
    res = client.get("/api/auth/permissions", headers=_headers("viewer-u", "viewer"))
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == "viewer"
    assert body["permissions"]["can_manage_keys"] is False
    assert body["permissions"]["can_run_mission"] is False
    assert body["permissions"]["can_access_global_ws"] is False


def test_mission_owner_acl_blocks_other_member() -> None:
    owner_user = f"member-{uuid.uuid4().hex[:6]}"
    other_user = f"member-{uuid.uuid4().hex[:6]}"

    create = client.post(
        "/api/missions",
        headers=_headers(owner_user, "member"),
        json={"goal": "rbac-regression", "budget": 1, "use_mock": True},
    )
    assert create.status_code == 200
    mission_id = create.json()["mission_id"]

    own_get = client.get(f"/api/missions/{mission_id}", headers=_headers(owner_user, "member"))
    assert own_get.status_code == 200
    assert own_get.json()["owner_id"] == owner_user

    denied_get = client.get(f"/api/missions/{mission_id}", headers=_headers(other_user, "member"))
    assert denied_get.status_code == 403
    assert denied_get.json()["detail"] == "mission_access_denied"

    denied_approve = client.post(f"/api/missions/{mission_id}/approve", headers=_headers(other_user, "member"))
    assert denied_approve.status_code == 403
    assert denied_approve.json()["detail"] == "mission_access_denied"


def test_sensitive_read_endpoints_role_guard() -> None:
    viewer_headers = _headers("viewer-u", "viewer")
    owner_headers = _headers("owner-u", "owner")
    supervisor_headers = _headers("sup-u", "supervisor")

    assert client.get("/api/keys/status", headers=viewer_headers).status_code == 403
    assert client.get("/api/keys-history", headers=viewer_headers).status_code == 403
    assert client.get("/api/keys/status", headers=owner_headers).status_code == 200

    assert client.get("/api/policies", headers=viewer_headers).status_code == 403
    assert client.get("/api/policies", headers=supervisor_headers).status_code == 200
    assert client.get("/api/ontology", headers=viewer_headers).status_code == 403
    assert client.get("/api/ontology", headers=supervisor_headers).status_code == 200


def test_auth_permissions_mission_scope_flags() -> None:
    owner_user = f"member-{uuid.uuid4().hex[:6]}"
    other_user = f"member-{uuid.uuid4().hex[:6]}"

    create = client.post(
        "/api/missions",
        headers=_headers(owner_user, "member"),
        json={"goal": "permission-mission-scope", "budget": 1, "use_mock": True},
    )
    assert create.status_code == 200
    mission_id = create.json()["mission_id"]

    owner_perm = client.get(
        f"/api/auth/permissions?mission_id={mission_id}",
        headers=_headers(owner_user, "member"),
    )
    assert owner_perm.status_code == 200
    assert owner_perm.json()["permissions"]["can_access_mission"] is True

    other_perm = client.get(
        f"/api/auth/permissions?mission_id={mission_id}",
        headers=_headers(other_user, "member"),
    )
    assert other_perm.status_code == 200
    assert other_perm.json()["permissions"]["can_access_mission"] is False

    admin_perm = client.get(
        f"/api/auth/permissions?mission_id={mission_id}",
        headers=_headers("admin-u", "admin"),
    )
    assert admin_perm.status_code == 200
    assert admin_perm.json()["permissions"]["can_access_mission"] is True


def test_settlement_scope_denies_viewer_for_foreign_team() -> None:
    create_team = client.post(
        "/api/teams",
        headers=_headers("owner-u", "owner"),
        json={"name": f"settlement-team-{uuid.uuid4().hex[:6]}", "domain": "ops"},
    )
    assert create_team.status_code == 200
    team_id = create_team.json()["team"]["id"]

    viewer_settlement = client.get(
        f"/api/ledger/settlements?cycle=weekly&team_id={team_id}",
        headers=_headers("viewer-u", "viewer"),
    )
    assert viewer_settlement.status_code == 403
    assert viewer_settlement.json()["detail"] == "settlement_view_permission_required"

    owner_settlement = client.get(
        f"/api/ledger/settlements?cycle=weekly&team_id={team_id}",
        headers=_headers("owner-u", "owner"),
    )
    assert owner_settlement.status_code == 200


def test_websocket_role_and_mission_access_guard() -> None:
    with pytest.raises(WebSocketDisconnect) as viewer_ws:
        with client.websocket_connect("/ws?user_id=viewer-u&user_role=viewer") as ws:
            ws.receive_text()
    assert viewer_ws.value.code == 1008

    with client.websocket_connect("/ws?user_id=owner-u&user_role=owner") as ws:
        ws.close()

    creator_user = f"member-{uuid.uuid4().hex[:6]}"
    other_user = f"member-{uuid.uuid4().hex[:6]}"
    create = client.post(
        "/api/missions",
        headers=_headers(creator_user, "member"),
        json={"goal": "ws-mission-guard", "budget": 1, "use_mock": True},
    )
    assert create.status_code == 200
    mission_id = create.json()["mission_id"]

    with pytest.raises(WebSocketDisconnect) as other_ws:
        with client.websocket_connect(f"/ws/{mission_id}?user_id={other_user}&user_role=member") as ws:
            ws.receive_text()
    assert other_ws.value.code == 1008

    with client.websocket_connect(f"/ws/{mission_id}?user_id={creator_user}&user_role=member") as ws:
        ws.close()


def test_mission_owner_db_fallback_after_cache_clear() -> None:
    owner_user = f"member-{uuid.uuid4().hex[:6]}"
    other_user = f"member-{uuid.uuid4().hex[:6]}"

    create = client.post(
        "/api/missions",
        headers=_headers(owner_user, "member"),
        json={"goal": "db-fallback-acl", "budget": 1, "use_mock": True},
    )
    assert create.status_code == 200
    mission_id = create.json()["mission_id"]

    # Simulate process-local cache loss (similar to restart scenario).
    mission_owners.clear()

    owner_get = client.get(f"/api/missions/{mission_id}", headers=_headers(owner_user, "member"))
    assert owner_get.status_code == 200
    assert owner_get.json()["owner_id"] == owner_user

    other_get = client.get(f"/api/missions/{mission_id}", headers=_headers(other_user, "member"))
    assert other_get.status_code == 403
    assert other_get.json()["detail"] == "mission_access_denied"


def test_team_write_and_contract_write_role_guard() -> None:
    viewer_headers = _headers("viewer-u", "viewer")
    supervisor_headers = _headers("sup-u", "supervisor")
    owner_headers = _headers("owner-u", "owner")

    deny_team = client.post(
        "/api/teams",
        headers=viewer_headers,
        json={"name": f"deny-team-{uuid.uuid4().hex[:6]}", "domain": "ops"},
    )
    assert deny_team.status_code == 403
    assert deny_team.json()["detail"] == "role_not_allowed:viewer"

    create_source = client.post(
        "/api/teams",
        headers=owner_headers,
        json={"name": f"src-team-{uuid.uuid4().hex[:6]}", "domain": "ops"},
    )
    create_target = client.post(
        "/api/teams",
        headers=owner_headers,
        json={"name": f"tgt-team-{uuid.uuid4().hex[:6]}", "domain": "ops"},
    )
    assert create_source.status_code == 200
    assert create_target.status_code == 200
    source_team_id = create_source.json()["team"]["id"]
    target_team_id = create_target.json()["team"]["id"]

    deny_contract = client.post(
        "/api/contracts/team-royalty",
        headers=supervisor_headers,
        json={
            "source_team_id": source_team_id,
            "target_team_id": target_team_id,
            "royalty_rate": 0.1,
            "active": True,
        },
    )
    assert deny_contract.status_code == 403
    assert deny_contract.json()["detail"] == "role_not_allowed:supervisor"

    allow_contract = client.post(
        "/api/contracts/team-royalty",
        headers=owner_headers,
        json={
            "source_team_id": source_team_id,
            "target_team_id": target_team_id,
            "royalty_rate": 0.1,
            "active": True,
        },
    )
    assert allow_contract.status_code == 200


def test_jwt_identity_takes_precedence_over_spoofed_headers() -> None:
    token = jwt.encode(
        {"sub": "jwt-member", "role": "member", "exp": int(time.time()) + 3600},
        DEFAULT_JWT_SECRET,
        algorithm="HS256",
    )
    res = client.get(
        "/api/auth/whoami",
        headers={
            "Authorization": f"Bearer {token}",
            "X-User-Id": "spoof-user",
            "X-User-Role": "owner",
        },
    )
    assert res.status_code == 200
    body = res.json()
    assert body["user_id"] == "jwt-member"
    assert body["role"] == "member"
    assert body["source"] == "jwt"


def test_jwt_only_mode_blocks_header_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BREMEN_AUTH_JWT_ONLY", "1")
    try:
        header_only = client.get("/api/auth/whoami", headers=_headers("header-user", "owner"))
        assert header_only.status_code == 401
        assert header_only.json()["detail"] in {"jwt_required", "jwt_invalid_or_expired"}

        token = jwt.encode(
            {"sub": "jwt-only-user", "role": "member", "exp": int(time.time()) + 3600},
            DEFAULT_JWT_SECRET,
            algorithm="HS256",
        )
        jwt_ok = client.get("/api/auth/whoami", headers={"Authorization": f"Bearer {token}"})
        assert jwt_ok.status_code == 200
        assert jwt_ok.json()["user_id"] == "jwt-only-user"
        assert jwt_ok.json()["role"] == "member"
        assert jwt_ok.json()["source"] == "jwt"
    finally:
        monkeypatch.delenv("BREMEN_AUTH_JWT_ONLY", raising=False)


def test_invalid_bearer_token_does_not_fallback_to_headers() -> None:
    res = client.get(
        "/api/auth/whoami",
        headers={
            "Authorization": "Bearer invalid.token.value",
            "X-User-Id": "spoof-user",
            "X-User-Role": "owner",
        },
    )
    assert res.status_code == 401
    assert res.json()["detail"] in {"jwt_invalid_or_expired", "jwt_invalid_identity_claims"}


def test_auth_migration_stats_endpoint_guard_and_shape() -> None:
    denied = client.get("/api/auth/migration-stats", headers=_headers("viewer-u", "viewer"))
    assert denied.status_code == 403

    allowed = client.get("/api/auth/migration-stats", headers=_headers("owner-u", "owner"))
    assert allowed.status_code == 200
    body = allowed.json()
    assert body["mode"] in {"hybrid", "jwt_only"}
    assert "stats" in body
    assert "ratios" in body
    assert "total_requests" in body["stats"]
