from __future__ import annotations

import asyncio
import os
from pathlib import Path
import time
import uuid

import jwt
import pytest
from fastapi.testclient import TestClient
from starlette.websockets import WebSocketDisconnect

from api.server import (
    ConnectionManager,
    DEFAULT_JWT_SECRET,
    _deliver_approval_notification,
    _resolve_team_member,
    app,
    approval_notification_outbox,
    decision_log,
    evaluations,
    memory_engine,
    mission_owners,
    missions,
    pending_human_gates,
    running_tasks,
)
from core.composer import ComposerRuntime
from core.cost_governor import CostGovernor
from core.decision_log import DecisionLog
from core.models import Mission, Task, TaskStatus
from core.policy_engine import PolicyEngine
from core.royalty_engine import RoyaltyEngine
from core.task_graph import TaskGraphEngine
from core.trust_engine import TrustEngine
from core.validation_engine import ValidationEngine
from core.workers import LLMWorker
from core.db import (
    ENCRYPTED_KEY_PREFIX,
    KeyRegistry,
    SessionLocal,
    get_workspace_settings,
    get_team_record,
    list_registered_keys,
    update_team_record,
)


client = TestClient(app)


class _FakeWebSocket:
    def __init__(self) -> None:
        self.accepted = False
        self.messages: list[dict] = []

    async def accept(self) -> None:
        self.accepted = True

    async def send_json(self, message: dict) -> None:
        self.messages.append(message)


def _headers(user_id: str, role: str) -> dict[str, str]:
    return {"X-User-Id": user_id, "X-User-Role": role}


def _wait_until(predicate, timeout: float = 5.0, interval: float = 0.05) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        if predicate():
            return True
        time.sleep(interval)
    return predicate()


def test_auth_permissions_snapshot_for_viewer() -> None:
    res = client.get("/api/auth/permissions", headers=_headers("viewer-u", "viewer"))
    assert res.status_code == 200
    body = res.json()
    assert body["role"] == "viewer"
    assert body["permissions"]["can_manage_keys"] is False
    assert body["permissions"]["can_run_mission"] is False
    assert body["permissions"]["can_access_global_ws"] is False


def test_ontology_endpoint_exposes_current_ui_units_from_any_cwd(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.chdir(tmp_path)
    response = client.get("/api/ontology", headers=_headers("ontology-user", "member"))
    assert response.status_code == 200
    assert set(response.json()["units"]) == {
        "workflow",
        "agent_profile",
        "canvas_node",
        "role_binding",
        "mission_run",
        "cost_ledger",
    }


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


def test_human_gate_blocks_backend_until_approved() -> None:
    owner_user = f"gate-owner-{uuid.uuid4().hex[:6]}"
    with TestClient(app) as scoped_client:
        create = scoped_client.post(
            "/api/missions",
            headers=_headers(owner_user, "member"),
            json={"goal": "human-gate-runtime", "budget": 1, "use_mock": True},
        )
        assert create.status_code == 200
        mission_id = create.json()["mission_id"]

        assert _wait_until(lambda: mission_id in pending_human_gates, timeout=4.0)
        detail = scoped_client.get(f"/api/missions/{mission_id}", headers=_headers(owner_user, "member"))
        assert detail.status_code == 200
        body = detail.json()
        assert body["status"] == "awaiting_approval"
        backend_task = next(task for task in body["tasks"] if task["role"] == "backend")
        assert backend_task["status"] == "waiting_input"

        approved = scoped_client.post(f"/api/missions/{mission_id}/approve", headers=_headers(owner_user, "member"))
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"
        assert approved.json()["mission_id"] == mission_id
        assert approved.json()["task_id"] == backend_task["id"]
        assert approved.json()["approved_by"] == owner_user
        assert _wait_until(lambda: mission_id not in pending_human_gates, timeout=2.0)


def test_pending_approvals_list_is_scoped_and_clears_after_approval() -> None:
    owner_user = f"approval-queue-owner-{uuid.uuid4().hex[:6]}"
    other_user = f"approval-queue-other-{uuid.uuid4().hex[:6]}"
    with TestClient(app) as scoped_client:
        create = scoped_client.post(
            "/api/missions",
            headers=_headers(owner_user, "member"),
            json={"goal": "approval queue runtime", "budget": 1, "use_mock": True},
        )
        assert create.status_code == 200
        mission_id = create.json()["mission_id"]
        assert _wait_until(lambda: mission_id in pending_human_gates, timeout=4.0)

        owner_queue = scoped_client.get("/api/approvals/pending", headers=_headers(owner_user, "member"))
        assert owner_queue.status_code == 200
        owner_rows = owner_queue.json()["approvals"]
        row = next(item for item in owner_rows if item["mission_id"] == mission_id)
        assert row["mission_goal"] == "approval queue runtime"
        assert row["gate_stage"] == "before_run"
        assert row["approval_channels"] == ["admin_queue"]
        assert row["owner_id"] == owner_user
        assert row["runtime_active"] is True
        assert row["can_approve"] is True

        other_queue = scoped_client.get("/api/approvals/pending", headers=_headers(other_user, "member"))
        assert other_queue.status_code == 200
        assert all(item["mission_id"] != mission_id for item in other_queue.json()["approvals"])

        global_queue = scoped_client.get("/api/approvals/pending", headers=_headers("ops-owner", "owner"))
        assert global_queue.status_code == 200
        assert any(item["mission_id"] == mission_id for item in global_queue.json()["approvals"])

        approved = scoped_client.post(f"/api/missions/{mission_id}/approve", headers=_headers(owner_user, "member"))
        assert approved.status_code == 200
        assert _wait_until(lambda: mission_id not in pending_human_gates, timeout=2.0)
        cleared_queue = scoped_client.get("/api/approvals/pending", headers=_headers(owner_user, "member"))
        assert cleared_queue.status_code == 200
        assert all(item["mission_id"] != mission_id for item in cleared_queue.json()["approvals"])


def test_pending_approvals_recovers_logged_gate_without_runtime_waiter() -> None:
    owner_user = f"approval-recovery-owner-{uuid.uuid4().hex[:6]}"
    with TestClient(app) as scoped_client:
        create = scoped_client.post(
            "/api/missions",
            headers=_headers(owner_user, "member"),
            json={"goal": "approval queue recovery", "budget": 1, "use_mock": True},
        )
        assert create.status_code == 200
        mission_id = create.json()["mission_id"]
        assert _wait_until(lambda: mission_id in pending_human_gates, timeout=4.0)
        assert _wait_until(lambda: len(approval_notification_outbox.get(mission_id, [])) >= 1, timeout=2.0)

        pending = pending_human_gates.get(mission_id)
        assert pending is not None
        assert _wait_until(lambda: bool(pending.get("runtime_waiting")), timeout=2.0)
        gate_event = pending.get("event")
        try:
            pending_human_gates.pop(mission_id, None)
            approval_notification_outbox.pop(mission_id, None)

            queue = scoped_client.get("/api/approvals/pending", headers=_headers(owner_user, "member"))
            assert queue.status_code == 200
            row = next(item for item in queue.json()["approvals"] if item["mission_id"] == mission_id)
            assert row["mission_goal"] == "approval queue recovery"
            assert row["runtime_active"] is False
            assert row["can_approve"] is False
            assert row["recovery_reason"] == "runtime_waiter_not_active"
            assert row["notifications"]
            assert {item["channel"] for item in row["notifications"]} == {"admin_queue"}
            assert {item["status"] for item in row["notifications"]} == {"queued"}

            approved = scoped_client.post(f"/api/missions/{mission_id}/approve", headers=_headers(owner_user, "member"))
            assert approved.status_code == 409
            assert approved.json()["detail"] == "no_pending_human_gate"
        finally:
            if isinstance(gate_event, asyncio.Event) and not gate_event.is_set():
                gate_event.set()


def test_human_gate_approve_without_pending_gate_returns_409() -> None:
    owner_user = f"approve-owner-{uuid.uuid4().hex[:6]}"
    mission_id = f"manual-{uuid.uuid4().hex[:8]}"
    missions[mission_id] = {
        "id": mission_id,
        "goal": "approve without pending gate",
        "status": "running",
        "tasks": [],
        "owner_id": owner_user,
    }
    mission_owners[mission_id] = owner_user
    pending_human_gates.pop(mission_id, None)

    res = client.post(f"/api/missions/{mission_id}/approve", headers=_headers(owner_user, "member"))

    assert res.status_code == 409
    assert res.json()["detail"] == "no_pending_human_gate"


def test_workflow_graph_condition_dsl_skips_runtime_task() -> None:
    owner_user = f"workflow-cond-owner-{uuid.uuid4().hex[:6]}"
    workflow_graph = {
        "nodes": [
            {
                "id": "skip-plan",
                "type": "agentNode",
                "data": {
                    "label": "Skip planner",
                    "category": "architect",
                    "execution_mode": "auto",
                    "condition_mode": "condition",
                    "condition_expression": "false",
                },
            },
            {
                "id": "qa-step",
                "type": "agentNode",
                "data": {
                    "label": "Architecture checker",
                    "category": "architect",
                    "execution_mode": "auto",
                    "condition_mode": "always",
                },
            },
        ],
        "edges": [{"id": "edge-skip-qa", "source": "skip-plan", "target": "qa-step"}],
        "loop_regions": [
            {
                "id": "loop-1",
                "name": "검토 반복",
                "nodeIds": ["skip-plan", "qa-step"],
                "startNodeId": "skip-plan",
                "endNodeId": "qa-step",
                "repeatCount": 3,
                "exitCondition": "result.done == true",
                "exitConditionNodeId": "qa-step",
                "exitNodeId": "__finish__",
            }
        ],
    }
    with TestClient(app) as scoped_client:
        create = scoped_client.post(
            "/api/missions",
            headers=_headers(owner_user, "member"),
            json={"goal": "workflow condition runtime", "budget": 1, "use_mock": True, "team_graph": workflow_graph},
        )
        assert create.status_code == 200
        mission_id = create.json()["mission_id"]

        assert _wait_until(
            lambda: scoped_client.get(f"/api/missions/{mission_id}", headers=_headers(owner_user, "member"))
            .json()
            .get("status")
            == "completed",
            timeout=8.0,
        )
        detail = scoped_client.get(f"/api/missions/{mission_id}", headers=_headers(owner_user, "member"))
        assert detail.status_code == 200
        body = detail.json()
        tasks = {task["id"]: task for task in body["tasks"]}
        assert tasks["skip-plan"]["status"] == "skipped"
        assert tasks["qa-step"]["status"] == "completed"
        assert body["workflow_runtime"]["source"] == "workflow_graph"
        assert body["workflow_runtime"]["loop_regions"][0]["exitCondition"] == "result.done == true"
        loop_region = body["workflow_runtime"]["loop_regions"][0]
        assert loop_region["semantics_version"] == "loop_region_v1"
        assert loop_region["node_ids"] == ["skip-plan", "qa-step"]
        assert loop_region["repeat_start_node_id"] == "skip-plan"
        assert loop_region["repeat_end_node_id"] == "qa-step"
        assert loop_region["exit_condition_node_id"] == "qa-step"
        assert loop_region["exit_node_id"] == "__finish__"
        assert loop_region["runtime_semantics"]["repeat_pass"] == "rerun_region_tasks_in_step_order"
        events = decision_log.list_by_mission(mission_id)
        assert any(event.get("type") == "workflow_condition_evaluated" and event.get("allowed") is False for event in events)
        assert any(event.get("type") == "task_skipped" and event.get("task_id") == "skip-plan" for event in events)


def test_workflow_graph_approval_channels_reach_human_gate() -> None:
    owner_user = f"workflow-approval-owner-{uuid.uuid4().hex[:6]}"
    workflow_graph = {
        "nodes": [
            {
                "id": "approval-step",
                "type": "utilityNode",
                "data": {
                    "label": "운영 승인",
                    "agent_id": "hitl",
                    "category": "HITL",
                    "execution_mode": "confirm",
                    "approval_gate_stage": "before_run",
                    "approval_channels": ["email", "kakao"],
                    "approval_target": "ops@example.com",
                },
            }
        ],
        "edges": [],
        "loop_regions": [],
    }
    with TestClient(app) as scoped_client:
        create = scoped_client.post(
            "/api/missions",
            headers=_headers(owner_user, "member"),
            json={"goal": "workflow approval channels", "budget": 1, "use_mock": True, "team_graph": workflow_graph},
        )
        assert create.status_code == 200
        mission_id = create.json()["mission_id"]

        assert _wait_until(lambda: mission_id in pending_human_gates, timeout=4.0)
        pending = pending_human_gates[mission_id]
        assert pending["task_id"] == "approval-step"
        assert pending["gate_stage"] == "before_run"
        assert pending["approval_channels"] == ["email", "kakao"]
        assert pending["approval_target"] == "ops@example.com"
        assert _wait_until(lambda: len(approval_notification_outbox.get(mission_id, [])) == 2, timeout=2.0)

        queue = scoped_client.get("/api/approvals/pending", headers=_headers(owner_user, "member"))
        assert queue.status_code == 200
        queue_row = next(item for item in queue.json()["approvals"] if item["mission_id"] == mission_id)
        assert {row["channel"] for row in queue_row["notifications"]} == {"email", "kakao"}
        assert {row["status"] for row in queue_row["notifications"]} == {"queued"}

        approved = scoped_client.post(f"/api/missions/{mission_id}/approve", headers=_headers(owner_user, "member"))
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"
        assert approved.json()["gate_stage"] == "before_run"
        assert {row["status"] for row in approved.json()["notifications"]} == {"approved"}

        assert _wait_until(
            lambda: scoped_client.get(f"/api/missions/{mission_id}", headers=_headers(owner_user, "member"))
            .json()
            .get("status")
            == "completed",
            timeout=4.0,
        )
        detail = scoped_client.get(f"/api/missions/{mission_id}", headers=_headers(owner_user, "member"))
        task = detail.json()["tasks"][0]
        assert task["role"] == "human_approval"
        assert task["status"] == "completed"
        assert task["metadata"]["approval_channels"] == ["email", "kakao"]
        events = decision_log.list_by_mission(mission_id)
        gate_event = next(event for event in events if event.get("type") == "human_gate_requested")
        assert gate_event["approval_channels"] == ["email", "kakao"]
        assert gate_event["approval_target"] == "ops@example.com"
        assert sum(1 for event in events if event.get("type") == "approval_notification_queued") == 2
        assert sum(1 for event in events if event.get("type") == "approval_notification_resolved") == 2


def test_approval_external_channels_dispatch_to_configured_webhooks(monkeypatch: pytest.MonkeyPatch) -> None:
    owner_user = f"workflow-dispatch-owner-{uuid.uuid4().hex[:6]}"
    deliveries: list[dict] = []

    def fake_post_json_webhook(url: str, payload: dict, token: str = "") -> dict:
        deliveries.append({"url": url, "payload": payload, "token": token})
        return {"status_code": 202}

    monkeypatch.setattr("api.server._post_json_webhook", fake_post_json_webhook)
    monkeypatch.setenv("BREMEN_APPROVAL_EMAIL_WEBHOOK_URL", "https://example.test/email")
    monkeypatch.setenv("BREMEN_APPROVAL_SMS_WEBHOOK_URL", "https://example.test/sms")
    monkeypatch.setenv("BREMEN_APPROVAL_KAKAO_WEBHOOK_URL", "https://example.test/kakao")
    monkeypatch.setenv("BREMEN_APPROVAL_WEBHOOK_TOKEN", "approval-token")
    workflow_graph = {
        "nodes": [
            {
                "id": "approval-dispatch",
                "type": "utilityNode",
                "data": {
                    "label": "운영 승인 발송",
                    "agent_id": "hitl",
                    "category": "HITL",
                    "execution_mode": "confirm",
                    "approval_channels": ["이메일", "문자", "카톡"],
                    "approval_target": "ops@example.com",
                },
            }
        ],
        "edges": [],
        "loop_regions": [],
    }
    with TestClient(app) as scoped_client:
        create = scoped_client.post(
            "/api/missions",
            headers=_headers(owner_user, "member"),
            json={"goal": "approval dispatch webhooks", "budget": 1, "use_mock": True, "team_graph": workflow_graph},
        )
        assert create.status_code == 200
        mission_id = create.json()["mission_id"]

        assert _wait_until(lambda: mission_id in pending_human_gates, timeout=4.0)
        assert _wait_until(lambda: len(deliveries) == 3, timeout=3.0)
        assert {item["url"] for item in deliveries} == {
            "https://example.test/email",
            "https://example.test/sms",
            "https://example.test/kakao",
        }
        assert {item["payload"]["channel"] for item in deliveries} == {"email", "sms", "kakao"}
        assert {item["token"] for item in deliveries} == {"approval-token"}
        assert _wait_until(
            lambda: {row.get("delivery_status") for row in approval_notification_outbox.get(mission_id, [])} == {"sent"},
            timeout=2.0,
        )

        queue = scoped_client.get("/api/approvals/pending", headers=_headers(owner_user, "member"))
        assert queue.status_code == 200
        queue_row = next(item for item in queue.json()["approvals"] if item["mission_id"] == mission_id)
        assert queue_row["approval_channels"] == ["email", "sms", "kakao"]
        assert {row["delivery_status"] for row in queue_row["notifications"]} == {"sent"}
        assert {row["delivery_transport"] for row in queue_row["notifications"]} == {"webhook"}

        approved = scoped_client.post(f"/api/missions/{mission_id}/approve", headers=_headers(owner_user, "member"))
        assert approved.status_code == 200
        assert approved.json()["status"] == "approved"
        assert _wait_until(lambda: mission_id not in pending_human_gates, timeout=2.0)

        events = decision_log.list_by_mission(mission_id)
        assert sum(1 for event in events if event.get("type") == "approval_notification_delivery") == 3


def test_email_approval_notification_uses_smtp_fallback(monkeypatch: pytest.MonkeyPatch) -> None:
    sent_messages: list[dict[str, object]] = []

    class FakeSMTP:
        def __init__(self, host: str, port: int, timeout: int) -> None:
            self.host = host
            self.port = port
            self.timeout = timeout
            self.started_tls = False
            self.login_args: tuple[str, str] | None = None

        def __enter__(self) -> "FakeSMTP":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def starttls(self, context: object) -> None:
            self.started_tls = context is not None

        def login(self, username: str, password: str) -> None:
            self.login_args = (username, password)

        def send_message(self, message: object) -> None:
            sent_messages.append(
                {
                    "host": self.host,
                    "port": self.port,
                    "timeout": self.timeout,
                    "started_tls": self.started_tls,
                    "login_args": self.login_args,
                    "message": message,
                }
            )

    monkeypatch.setattr("api.server.smtplib.SMTP", FakeSMTP)
    monkeypatch.delenv("BREMEN_APPROVAL_EMAIL_WEBHOOK_URL", raising=False)
    monkeypatch.delenv("BREMEN_APPROVAL_WEBHOOK_URL", raising=False)
    monkeypatch.setenv("BREMEN_PUBLIC_BASE_URL", "https://ops.example.test")
    monkeypatch.setenv("BREMEN_SMTP_HOST", "smtp.example.test")
    monkeypatch.setenv("BREMEN_SMTP_PORT", "2525")
    monkeypatch.setenv("BREMEN_SMTP_USER", "mailer@example.test")
    monkeypatch.setenv("BREMEN_SMTP_PASSWORD", "smtp-password")
    monkeypatch.setenv("BREMEN_SMTP_FROM", "Bremen <bot@example.test>")
    monkeypatch.delenv("BREMEN_SMTP_USE_SSL", raising=False)

    result = _deliver_approval_notification(
        {
            "id": "smtp-note-1",
            "mission_id": "mission-smtp",
            "task_id": "task-review",
            "gate_stage": "before_run",
            "channel": "email",
            "target": "ops@example.test",
            "requested_at": 123.0,
        }
    )

    assert result["delivery_status"] == "sent"
    assert result["delivery_transport"] == "smtp"
    assert result["delivery_error"] == ""
    assert len(sent_messages) == 1
    sent = sent_messages[0]
    assert sent["host"] == "smtp.example.test"
    assert sent["port"] == 2525
    assert sent["started_tls"] is True
    assert sent["login_args"] == ("mailer@example.test", "smtp-password")
    message = sent["message"]
    assert message["To"] == "ops@example.test"
    assert message["From"] == "Bremen <bot@example.test>"
    body = message.get_content()
    assert "Mission: mission-smtp" in body
    assert "Task: task-review" in body
    assert "https://ops.example.test/chat/mission-smtp?tab=timeline" in body


def test_approval_channel_settings_are_masked_and_user_scoped() -> None:
    owner_user = f"approval-settings-owner-{uuid.uuid4().hex[:6]}"
    other_user = f"approval-settings-other-{uuid.uuid4().hex[:6]}"
    raw_token = f"approval-secret-{uuid.uuid4().hex}"
    payload = {
        "approval_channel_settings": {
            "public_base_url": "https://ops.example.test",
            "webhook_token": raw_token,
            "channels": {
                "admin_queue": {"enabled": True, "target": "Ops Admin"},
                "email": {
                    "enabled": True,
                    "target": "ops@example.com",
                    "webhook_url": "https://hooks.example.test/email",
                },
                "sms": {
                    "enabled": True,
                    "target": "+821012345678",
                    "webhook_url": "https://hooks.example.test/sms",
                },
            },
        }
    }

    saved = client.put("/api/approval-channels/settings", headers=_headers(owner_user, "supervisor"), json=payload)
    assert saved.status_code == 200
    assert raw_token not in saved.text
    settings = saved.json()["settings"]
    assert settings["webhook_token_registered"] is True
    assert settings["webhook_token_masked"] != raw_token
    assert settings["public_base_url"] == "https://ops.example.test"
    assert settings["channels"]["email"]["webhook_url"] == "https://hooks.example.test/email"
    assert set(saved.json()["env_overrides"]) == {
        "public_base_url",
        "email_webhook",
        "sms_webhook",
        "kakao_webhook",
        "webhook_token",
        "smtp",
    }

    stored = get_workspace_settings(owner_user)
    assert stored is not None
    stored_approval = stored["approval_channel_settings"]
    assert raw_token not in str(stored_approval)
    assert stored_approval["webhook_token_encrypted"].startswith(ENCRYPTED_KEY_PREFIX)

    fetched = client.get("/api/approval-channels/settings", headers=_headers(owner_user, "member"))
    assert fetched.status_code == 200
    assert raw_token not in fetched.text
    assert fetched.json()["settings"]["channels"]["sms"]["target"] == "+821012345678"
    assert fetched.json()["env_overrides"] == saved.json()["env_overrides"]

    isolated = client.get("/api/approval-channels/settings", headers=_headers(other_user, "member"))
    assert isolated.status_code == 200
    assert isolated.json()["settings"]["channels"]["email"]["webhook_url"] == ""

    denied = client.put("/api/approval-channels/settings", headers=_headers("viewer-u", "viewer"), json=payload)
    assert denied.status_code == 403


def test_approval_delivery_uses_saved_channel_settings(monkeypatch: pytest.MonkeyPatch) -> None:
    owner_user = f"approval-settings-dispatch-{uuid.uuid4().hex[:6]}"
    deliveries: list[dict] = []
    for key in [
        "BREMEN_APPROVAL_EMAIL_WEBHOOK_URL",
        "BREMEN_APPROVAL_SMS_WEBHOOK_URL",
        "BREMEN_APPROVAL_KAKAO_WEBHOOK_URL",
        "BREMEN_APPROVAL_WEBHOOK_URL",
        "BREMEN_APPROVAL_WEBHOOK_TOKEN",
        "BREMEN_PUBLIC_BASE_URL",
    ]:
        monkeypatch.delenv(key, raising=False)

    def fake_post_json_webhook(url: str, payload: dict, token: str = "") -> dict:
        deliveries.append({"url": url, "payload": payload, "token": token})
        return {"status_code": 202}

    monkeypatch.setattr("api.server._post_json_webhook", fake_post_json_webhook)
    settings = client.put(
        "/api/approval-channels/settings",
        headers=_headers(owner_user, "supervisor"),
        json={
            "approval_channel_settings": {
                "public_base_url": "https://ops.example.test",
                "webhook_token": "stored-approval-token",
                "channels": {
                    "email": {
                        "enabled": True,
                        "target": "ops@example.com",
                        "webhook_url": "https://hooks.example.test/email",
                    },
                    "sms": {
                        "enabled": True,
                        "target": "+821012345678",
                        "webhook_url": "https://hooks.example.test/sms",
                    },
                },
            }
        },
    )
    assert settings.status_code == 200
    workflow_graph = {
        "nodes": [
            {
                "id": "approval-dispatch-settings",
                "type": "utilityNode",
                "data": {
                    "label": "운영 승인 발송",
                    "agent_id": "hitl",
                    "category": "HITL",
                    "execution_mode": "confirm",
                    "approval_channels": ["email", "sms"],
                },
            }
        ],
        "edges": [],
        "loop_regions": [],
    }

    with TestClient(app) as scoped_client:
        create = scoped_client.post(
            "/api/missions",
            headers=_headers(owner_user, "supervisor"),
            json={"goal": "approval settings dispatch", "budget": 1, "use_mock": True, "team_graph": workflow_graph},
        )
        assert create.status_code == 200
        mission_id = create.json()["mission_id"]

        assert _wait_until(lambda: len(deliveries) == 2, timeout=3.0)
        assert {item["url"] for item in deliveries} == {
            "https://hooks.example.test/email",
            "https://hooks.example.test/sms",
        }
        assert {item["token"] for item in deliveries} == {"stored-approval-token"}
        assert all(item["payload"]["ops_url"].startswith("https://ops.example.test/chat/") for item in deliveries)

        queue = scoped_client.get("/api/approvals/pending", headers=_headers(owner_user, "supervisor"))
        assert queue.status_code == 200
        queue_row = next(item for item in queue.json()["approvals"] if item["mission_id"] == mission_id)
        assert {row["target"] for row in queue_row["notifications"]} == {"ops@example.com", "+821012345678"}

        approved = scoped_client.post(f"/api/missions/{mission_id}/approve", headers=_headers(owner_user, "supervisor"))
        assert approved.status_code == 200


def test_retry_failed_approval_notifications_redelivers_external_channel(monkeypatch: pytest.MonkeyPatch) -> None:
    owner_user = f"approval-retry-owner-{uuid.uuid4().hex[:6]}"
    other_user = f"approval-retry-other-{uuid.uuid4().hex[:6]}"
    deliveries: list[dict] = []
    attempts = {"count": 0}

    def flaky_post_json_webhook(url: str, payload: dict, token: str = "") -> dict:
        attempts["count"] += 1
        deliveries.append({"url": url, "payload": payload, "token": token, "attempt": attempts["count"]})
        if attempts["count"] == 1:
            raise RuntimeError("temporary_webhook_down")
        return {"status_code": 202}

    monkeypatch.setattr("api.server._post_json_webhook", flaky_post_json_webhook)
    monkeypatch.setenv("BREMEN_APPROVAL_EMAIL_WEBHOOK_URL", "https://example.test/email")
    workflow_graph = {
        "nodes": [
            {
                "id": "approval-retry",
                "type": "utilityNode",
                "data": {
                    "label": "운영 승인 재전송",
                    "agent_id": "hitl",
                    "category": "HITL",
                    "execution_mode": "confirm",
                    "approval_channels": ["email"],
                    "approval_target": "ops@example.com",
                },
            }
        ],
        "edges": [],
        "loop_regions": [],
    }

    with TestClient(app) as scoped_client:
        create = scoped_client.post(
            "/api/missions",
            headers=_headers(owner_user, "member"),
            json={"goal": "approval retry webhook", "budget": 1, "use_mock": True, "team_graph": workflow_graph},
        )
        assert create.status_code == 200
        mission_id = create.json()["mission_id"]

        assert _wait_until(lambda: len(deliveries) == 1, timeout=3.0)
        assert _wait_until(
            lambda: {row.get("delivery_status") for row in approval_notification_outbox.get(mission_id, [])} == {"failed"},
            timeout=2.0,
        )

        denied = scoped_client.post(
            f"/api/missions/{mission_id}/approval-notifications/retry",
            headers=_headers(other_user, "member"),
            json={},
        )
        assert denied.status_code == 403

        retry = scoped_client.post(
            f"/api/missions/{mission_id}/approval-notifications/retry",
            headers=_headers(owner_user, "member"),
            json={},
        )
        assert retry.status_code == 200
        retry_body = retry.json()
        assert retry_body["status"] == "retry_dispatched"
        assert retry_body["retried_count"] == 1
        assert retry_body["notifications"][0]["delivery_status"] == "sent"
        assert len(deliveries) == 2
        assert deliveries[-1]["payload"]["channel"] == "email"

        retry_again = scoped_client.post(
            f"/api/missions/{mission_id}/approval-notifications/retry",
            headers=_headers(owner_user, "member"),
            json={},
        )
        assert retry_again.status_code == 409
        assert retry_again.json()["detail"] == "no_retryable_approval_notifications"

        events = decision_log.list_by_mission(mission_id)
        assert any(event.get("type") == "approval_notification_retry_requested" for event in events)
        assert sum(1 for event in events if event.get("type") == "approval_notification_delivery") == 2


def test_workflow_graph_korean_categories_compile_to_runtime_roles() -> None:
    runtime = ComposerRuntime(use_mock=True)
    assert runtime._workflow_role_from_node({"category": "개발", "label": "풀스택 코드 작성봇"}) == "backend"
    assert runtime._workflow_role_from_node({"category": "검토", "label": "깐깐한 코드 리뷰어"}) == "qa"
    assert runtime._workflow_role_from_node({"category": "글쓰기", "label": "감성 카피라이터"}) == "writer"
    assert runtime._workflow_role_from_node({"category": "HITL", "agent_id": "hitl", "label": "Human Approval"}) == "human_approval"


def test_workflow_graph_accepts_backward_positioned_acyclic_edge() -> None:
    runtime = ComposerRuntime(
        use_mock=True,
        workflow_graph={
            "nodes": [
                {"id": "target", "data": {"label": "검토", "category": "검토"}},
                {"id": "source", "data": {"label": "기획", "category": "기획"}},
            ],
            "edges": [{"id": "edge-source-target", "source": "source", "target": "target"}],
        },
    )
    mission = runtime.plan_mission("backward positioned edge")
    assert mission.tasks["target"].dependencies == ["source"]
    assert mission.tasks["target"].metadata.get("workflow_non_dag_edges") is None


def test_workflow_graph_excludes_only_edge_that_creates_cycle() -> None:
    runtime = ComposerRuntime(
        use_mock=True,
        workflow_graph={
            "nodes": [
                {"id": "a", "data": {"label": "A", "category": "기획"}},
                {"id": "b", "data": {"label": "B", "category": "검토"}},
            ],
            "edges": [
                {"id": "edge-a-b", "source": "a", "target": "b"},
                {"id": "edge-b-a", "source": "b", "target": "a"},
            ],
        },
    )
    mission = runtime.plan_mission("cycle edge")
    assert mission.tasks["b"].dependencies == ["a"]
    assert mission.tasks["a"].dependencies == []
    rejected = mission.tasks["a"].metadata["workflow_non_dag_edges"]
    assert [edge["id"] for edge in rejected] == ["edge-b-a"]


def test_task_graph_rejects_missing_dependency() -> None:
    with pytest.raises(ValueError, match="존재하지 않는 의존성"):
        TaskGraphEngine({"task-a": Task(id="task-a", description="A", role="architect", dependencies=["missing"])})


def test_time_rule_honors_timezone_and_rejects_invalid_values() -> None:
    runtime = ComposerRuntime(use_mock=True)
    assert runtime._time_rule_matches("매일", "Asia/Seoul") is True
    assert runtime._time_rule_matches("평일 99:99-10:00", "Asia/Seoul") is False
    assert runtime._time_rule_matches("매일 10:00 이후", "Invalid/Timezone") is False


def test_human_gate_callback_without_approval_fails_closed() -> None:
    async def missing_approval(_gate: dict) -> None:
        return None

    runtime = ComposerRuntime(
        use_mock=True,
        wait_for_human_gate=missing_approval,
        workflow_graph={
            "nodes": [
                {
                    "id": "approval",
                    "data": {
                        "label": "Human Approval",
                        "agent_id": "hitl",
                        "category": "HITL",
                        "execution_mode": "confirm",
                    },
                }
            ],
            "edges": [],
        },
    )
    mission = runtime.plan_mission("missing approval")
    with pytest.raises(RuntimeError, match="human_gate_approval_missing"):
        asyncio.run(runtime.execute_mission(mission))
    assert mission.status.value == "failed"
    assert mission.tasks["approval"].status.value == "failed"


def test_workflow_loop_region_replays_until_max_iterations(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[dict] = []
    workflow_graph = {
        "nodes": [
            {
                "id": "loop-plan",
                "type": "agentNode",
                "data": {
                    "label": "Loop planner",
                    "category": "architect",
                    "execution_mode": "auto",
                    "condition_mode": "always",
                },
            }
        ],
        "edges": [],
        "loop_regions": [
            {
                "id": "loop-max",
                "name": "최대 반복 테스트",
                "nodeIds": ["loop-plan"],
                "startNodeId": "loop-plan",
                "endNodeId": "loop-plan",
                "repeatCount": 3,
                "exitCondition": "false",
                "exitConditionNodeId": "loop-plan",
                "exitNodeId": "__finish__",
            }
        ],
    }
    runtime = ComposerRuntime(use_mock=True, on_event=events.append, workflow_graph=workflow_graph)

    async def fast_execute(context: dict) -> dict:
        return {
            "artifacts": {
                "architecture": "마이크로서비스 아키텍처",
                "tech_stack": "FastAPI + Next.js",
                "api_design": "RESTful API",
            },
            "cost": 0.001,
            "confidence": 0.95,
        }

    monkeypatch.setattr(runtime.worker, "execute", fast_execute)

    result = asyncio.run(runtime.run("loop max runtime", budget=1))

    assert result["success"] is True
    task = result["mission"]["tasks"][0]
    assert task["status"] == "completed"
    assert len(task["metadata"]["workflow_loop_history"]) == 2
    summary = task["metadata"]["workflow_loop_summaries"][0]
    assert summary["iterations"] == 3
    assert summary["reason"] == "max_iterations_reached"
    assert summary["semantics_version"] == "loop_region_v1"
    assert summary["repeat_start_node_id"] == "loop-plan"
    assert summary["repeat_end_node_id"] == "loop-plan"
    assert summary["exit_node_id"] == "__finish__"
    started = next(event for event in events if event.get("type") == "workflow_loop_started")
    assert started["semantics_version"] == "loop_region_v1"
    assert started["runtime_semantics"]["condition_not_satisfied"] == "repeat_from_start_until_max_iterations"
    assert [event.get("iteration") for event in events if event.get("type") == "workflow_loop_iteration_started"] == [2, 3]
    assert any(
        event.get("type") == "workflow_loop_exited"
        and event.get("loop_region_id") == "loop-max"
        and event.get("exit_node_id") == "__finish__"
        and event.get("reason") == "max_iterations_reached"
        and event.get("iterations") == 3
        for event in events
    )


def test_workflow_loop_region_exits_when_condition_is_satisfied(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[dict] = []
    workflow_graph = {
        "nodes": [
            {
                "id": "loop-plan",
                "type": "agentNode",
                "data": {
                    "label": "Loop planner",
                    "category": "architect",
                    "execution_mode": "auto",
                    "condition_mode": "always",
                },
            }
        ],
        "edges": [],
        "loop_regions": [
            {
                "id": "loop-exit",
                "name": "조건 종료 테스트",
                "nodeIds": ["loop-plan"],
                "startNodeId": "loop-plan",
                "endNodeId": "loop-plan",
                "repeatCount": 3,
                "exitCondition": 'result.architecture == "마이크로서비스 아키텍처"',
                "exitConditionNodeId": "loop-plan",
                "exitNodeId": "__finish__",
            }
        ],
    }
    runtime = ComposerRuntime(use_mock=True, on_event=events.append, workflow_graph=workflow_graph)

    async def fast_execute(context: dict) -> dict:
        return {
            "artifacts": {
                "architecture": "마이크로서비스 아키텍처",
                "tech_stack": "FastAPI + Next.js",
                "api_design": "RESTful API",
            },
            "cost": 0.001,
            "confidence": 0.95,
        }

    monkeypatch.setattr(runtime.worker, "execute", fast_execute)

    result = asyncio.run(runtime.run("loop exit runtime", budget=1))

    assert result["success"] is True
    task = result["mission"]["tasks"][0]
    assert "workflow_loop_history" not in task["metadata"]
    summary = task["metadata"]["workflow_loop_summaries"][0]
    assert summary["iterations"] == 1
    assert summary["reason"] == "exit_condition_satisfied"
    assert summary["runtime_semantics"]["condition_satisfied"] == "finish"
    assert not [event for event in events if event.get("type") == "workflow_loop_iteration_started"]
    loop_condition = next(event for event in events if event.get("type") == "workflow_loop_condition_evaluated")
    assert loop_condition["condition"]["source"] == "loop_exit"
    assert loop_condition["condition"]["checks"]["engine"] == "condition_dsl_v1"
    assert loop_condition["satisfied"] is True
    assert loop_condition["exit_action"] == "finish"
    assert any(
        event.get("type") == "workflow_loop_exited"
        and event.get("loop_region_id") == "loop-exit"
        and event.get("semantics_version") == "loop_region_v1"
        and event.get("reason") == "exit_condition_satisfied"
        and event.get("iterations") == 1
        for event in events
    )


def test_workflow_loop_region_records_external_exit_node_semantics(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[dict] = []
    workflow_graph = {
        "nodes": [
            {
                "id": "loop-plan",
                "type": "agentNode",
                "data": {"label": "Loop planner", "category": "architect", "execution_mode": "auto"},
            },
            {
                "id": "loop-review",
                "type": "agentNode",
                "data": {"label": "Loop review", "category": "검토", "execution_mode": "auto"},
            },
            {
                "id": "after-loop",
                "type": "agentNode",
                "data": {"label": "After loop", "category": "글쓰기", "execution_mode": "auto"},
            },
        ],
        "edges": [
            {"id": "edge-loop-plan-review", "source": "loop-plan", "target": "loop-review"},
            {"id": "edge-loop-review-after", "source": "loop-review", "target": "after-loop"},
        ],
        "loop_regions": [
            {
                "id": "loop-external-exit",
                "name": "외부 종료 노드 테스트",
                "nodeIds": ["loop-plan", "loop-review"],
                "startNodeId": "loop-plan",
                "endNodeId": "loop-review",
                "repeatCount": 3,
                "exitCondition": "true",
                "exitConditionNodeId": "loop-review",
                "exitNodeId": "after-loop",
            }
        ],
    }
    runtime = ComposerRuntime(use_mock=True, on_event=events.append, workflow_graph=workflow_graph)

    async def fast_execute(context: dict) -> dict:
        if context["role"] == "architect":
            artifacts = {
                "architecture": "마이크로서비스 아키텍처",
                "tech_stack": "FastAPI + Next.js",
                "api_design": "RESTful API",
            }
        elif context["role"] == "qa":
            artifacts = {
                "test_scenarios": "반복 외부 종료 노드 시나리오",
                "unit_tests": "loop_exit_node_semantics",
                "integration_tests": "loop exit node integration",
                "coverage_target": "90 percent target",
            }
        else:
            artifacts = {
                "pages_structure": "After loop runtime page",
                "components": "Loop semantics summary panel",
                "api_integration": "loop exit event binding",
            }
        return {"artifacts": artifacts, "cost": 0.001, "confidence": 0.95}

    monkeypatch.setattr(runtime.worker, "execute", fast_execute)

    result = asyncio.run(runtime.run("loop external exit node runtime", budget=1))

    assert result["success"] is True
    loop_plan = next(task for task in result["mission"]["tasks"] if task["id"] == "loop-plan")
    summary = loop_plan["metadata"]["workflow_loop_summaries"][0]
    assert summary["exit_action"] == "goto_node"
    assert summary["exit_node_id"] == "after-loop"
    assert summary["runtime_semantics"]["condition_satisfied"] == "goto_node"
    started = next(event for event in events if event.get("type") == "workflow_loop_started")
    assert started["exit_action"] == "goto_node"
    assert started["exit_node_id"] == "after-loop"
    exited = next(event for event in events if event.get("type") == "workflow_loop_exited")
    assert exited["exit_action"] == "goto_node"
    assert exited["exit_node_id"] == "after-loop"


def test_workflow_router_branch_skips_unselected_path(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[dict] = []
    calls: list[str] = []
    workflow_graph = {
        "nodes": [
            {
                "id": "plan",
                "type": "agentNode",
                "data": {"label": "Planner", "category": "architect", "execution_mode": "auto"},
            },
            {
                "id": "router",
                "type": "utilityNode",
                "data": {
                    "label": "조건 노드",
                    "category": "ROUTER",
                    "agent_id": "router",
                    "execution_mode": "auto",
                    "condition_branches": [
                        {
                            "id": "branch-pass",
                            "label": "검토로 이동",
                            "condition_mode": "data",
                            "condition_data_path": "previous.architecture",
                            "condition_operator": "contains",
                            "condition_value": "마이크로서비스",
                            "action": "node",
                            "targetNodeId": "review",
                        },
                        {
                            "id": "branch-fail",
                            "label": "구현으로 이동",
                            "expression": "else",
                            "action": "node",
                            "targetNodeId": "build",
                        },
                    ],
                },
            },
            {
                "id": "review",
                "type": "agentNode",
                "data": {"label": "Review", "category": "검토", "execution_mode": "auto"},
            },
            {
                "id": "build",
                "type": "agentNode",
                "data": {"label": "Build", "category": "개발", "execution_mode": "auto"},
            },
        ],
        "edges": [
            {"id": "edge-plan-router", "source": "plan", "target": "router"},
            {"id": "edge-router-review", "source": "router", "target": "review"},
            {"id": "edge-router-build", "source": "router", "target": "build"},
        ],
        "loop_regions": [],
    }
    runtime = ComposerRuntime(use_mock=True, on_event=events.append, workflow_graph=workflow_graph)

    async def fast_execute(context: dict) -> dict:
        calls.append(context["role"])
        if context["role"] == "architect":
            artifacts = {
                "architecture": "마이크로서비스 아키텍처",
                "tech_stack": "FastAPI + Next.js",
                "api_design": "RESTful API",
            }
        elif context["role"] == "qa":
            artifacts = {
                "test_scenarios": "로그인 및 워크플로우 실행 시나리오",
                "unit_tests": "라우터 분기 단위 테스트",
                "integration_tests": "선택된 경로만 실행되는 통합 테스트",
                "coverage_target": "85 percent target",
            }
        else:
            artifacts = {
                "api_endpoints": "/missions",
                "db_models": "Mission, Task",
                "auth_system": "JWT 기반 인증",
            }
        return {"artifacts": artifacts, "cost": 0.001, "confidence": 0.95}

    monkeypatch.setattr(runtime.worker, "execute", fast_execute)

    result = asyncio.run(runtime.run("router branch runtime", budget=1))

    assert result["success"] is True
    tasks = {task["id"]: task for task in result["mission"]["tasks"]}
    assert tasks["plan"]["status"] == "completed"
    assert tasks["router"]["status"] == "completed"
    assert tasks["review"]["status"] == "completed"
    assert tasks["build"]["status"] == "skipped"
    assert calls == ["architect", "qa"]
    route = tasks["router"]["artifacts"]["route"]
    assert route["selected_branch"]["id"] == "branch-pass"
    assert route["selected_branch"]["condition"]["mode"] == "data"
    assert route["selected_target_id"] == "review"
    assert route["skipped_task_ids"] == ["build"]
    matched_branch = next(row for row in route["evaluated_branches"] if row["branch_id"] == "branch-pass")
    assert matched_branch["checks"]["data_ok"] is True
    assert any(
        event.get("type") == "workflow_route_applied"
        and event.get("task_id") == "router"
        and event.get("skipped_task_ids") == ["build"]
        for event in events
    )


def test_condition_dsl_functions_gate_task_execution(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[dict] = []
    calls: list[str] = []
    workflow_graph = {
        "nodes": [
            {
                "id": "plan",
                "type": "agentNode",
                "data": {"label": "Planner", "category": "architect", "execution_mode": "auto"},
            },
            {
                "id": "qa",
                "type": "agentNode",
                "data": {
                    "label": "QA",
                    "category": "검토",
                    "execution_mode": "auto",
                    "condition_mode": "condition",
                    "condition_expression": 'contains(path("previous.architecture"), "마이크로서비스") and number(path("tasks.plan.confidence")) >= 0.9',
                },
            },
        ],
        "edges": [{"id": "edge-plan-qa", "source": "plan", "target": "qa"}],
        "loop_regions": [],
    }
    runtime = ComposerRuntime(use_mock=True, on_event=events.append, workflow_graph=workflow_graph)

    async def fast_execute(context: dict) -> dict:
        calls.append(context["role"])
        if context["role"] == "architect":
            artifacts = {
                "architecture": "마이크로서비스 아키텍처",
                "tech_stack": "FastAPI + Next.js",
                "api_design": "RESTful API",
            }
        else:
            artifacts = {
                "test_scenarios": "조건 DSL 실행 시나리오",
                "unit_tests": "condition_dsl_functions_test",
                "integration_tests": "plan to qa condition integration",
                "coverage_target": "90 percent target",
            }
        return {"artifacts": artifacts, "cost": 0.001, "confidence": 0.95}

    monkeypatch.setattr(runtime.worker, "execute", fast_execute)

    result = asyncio.run(runtime.run("condition dsl functions runtime", budget=1))

    assert result["success"] is True
    tasks = {task["id"]: task for task in result["mission"]["tasks"]}
    assert tasks["qa"]["status"] == "completed"
    assert calls == ["architect", "qa"]
    condition_event = next(event for event in events if event.get("type") == "workflow_condition_evaluated" and event.get("task_id") == "qa")
    assert condition_event["allowed"] is True
    assert condition_event["checks"]["engine"] == "condition_dsl_v1"
    assert condition_event["checks"]["expression_ok"] is True


def test_condition_dsl_contract_without_flat_fields_gates_task_execution(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[dict] = []
    calls: list[str] = []
    workflow_graph = {
        "nodes": [
            {
                "id": "plan",
                "type": "agentNode",
                "data": {"label": "Planner", "category": "architect", "execution_mode": "auto"},
            },
            {
                "id": "qa",
                "type": "agentNode",
                "data": {
                    "label": "QA",
                    "category": "검토",
                    "execution_mode": "auto",
                    "condition_dsl": {
                        "engine": "condition_dsl_v1",
                        "mode": "condition",
                        "checks": [
                            {
                                "kind": "expression",
                                "expression": 'contains(path("previous.architecture"), "마이크로서비스")',
                            }
                        ],
                        "on_true": "run",
                        "on_false": "skip",
                    },
                },
            },
        ],
        "edges": [{"id": "edge-plan-qa", "source": "plan", "target": "qa"}],
        "loop_regions": [],
    }
    runtime = ComposerRuntime(use_mock=True, on_event=events.append, workflow_graph=workflow_graph)

    async def fast_execute(context: dict) -> dict:
        calls.append(context["role"])
        if context["role"] == "architect":
            artifacts = {
                "architecture": "마이크로서비스 아키텍처",
                "tech_stack": "FastAPI + Next.js",
                "api_design": "RESTful API",
            }
        else:
            artifacts = {
                "test_scenarios": "condition dsl contract",
                "unit_tests": "dsl_contract_only_test",
                "integration_tests": "dsl contract integration",
                "coverage_target": "90 percent target",
            }
        return {"artifacts": artifacts, "cost": 0.001, "confidence": 0.95}

    monkeypatch.setattr(runtime.worker, "execute", fast_execute)

    result = asyncio.run(runtime.run("condition dsl contract runtime", budget=1))

    assert result["success"] is True
    tasks = {task["id"]: task for task in result["mission"]["tasks"]}
    assert tasks["qa"]["status"] == "completed"
    assert calls == ["architect", "qa"]
    condition_event = next(event for event in events if event.get("type") == "workflow_condition_evaluated" and event.get("task_id") == "qa")
    assert condition_event["allowed"] is True
    assert condition_event["checks"]["contract"] == "condition_dsl"
    assert condition_event["checks"]["expression_ok"] is True


def test_workflow_router_uses_condition_dsl_branches_without_flat_branch_field(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[dict] = []
    calls: list[str] = []
    workflow_graph = {
        "nodes": [
            {
                "id": "plan",
                "type": "agentNode",
                "data": {"label": "Planner", "category": "architect", "execution_mode": "auto"},
            },
            {
                "id": "router",
                "type": "utilityNode",
                "data": {
                    "label": "조건 노드",
                    "category": "ROUTER",
                    "agent_id": "router",
                    "execution_mode": "auto",
                    "condition_dsl": {
                        "engine": "condition_dsl_v1",
                        "mode": "condition",
                        "checks": [
                            {
                                "kind": "branches",
                                "branches": [
                                    {
                                        "id": "branch-review",
                                        "label": "검토로 이동",
                                        "expression": 'contains(path("previous.architecture"), "마이크로서비스")',
                                        "action": "node",
                                        "target_node_id": "review",
                                    },
                                    {
                                        "id": "branch-build",
                                        "label": "구현으로 이동",
                                        "expression": "else",
                                        "action": "node",
                                        "target_node_id": "build",
                                    },
                                ],
                            }
                        ],
                        "on_true": "run",
                        "on_false": "skip",
                    },
                },
            },
            {
                "id": "review",
                "type": "agentNode",
                "data": {"label": "Review", "category": "검토", "execution_mode": "auto"},
            },
            {
                "id": "build",
                "type": "agentNode",
                "data": {"label": "Build", "category": "backend", "execution_mode": "auto"},
            },
        ],
        "edges": [
            {"id": "edge-plan-router", "source": "plan", "target": "router"},
            {"id": "edge-router-review", "source": "router", "target": "review"},
            {"id": "edge-router-build", "source": "router", "target": "build"},
        ],
        "loop_regions": [],
    }
    runtime = ComposerRuntime(use_mock=True, on_event=events.append, workflow_graph=workflow_graph)

    async def fast_execute(context: dict) -> dict:
        calls.append(context["role"])
        if context["role"] == "architect":
            artifacts = {
                "architecture": "마이크로서비스 아키텍처",
                "tech_stack": "FastAPI + Next.js",
                "api_design": "RESTful API",
            }
        elif context["role"] == "qa":
            artifacts = {
                "test_scenarios": "dsl branch route",
                "unit_tests": "dsl_branch_test",
                "integration_tests": "dsl branch integration",
                "coverage_target": "90 percent target",
            }
        else:
            artifacts = {"api_endpoints": [], "database_schema": {}, "auth_flow": "unused"}
        return {"artifacts": artifacts, "cost": 0.001, "confidence": 0.95}

    monkeypatch.setattr(runtime.worker, "execute", fast_execute)

    result = asyncio.run(runtime.run("router dsl branches runtime", budget=1))

    assert result["success"] is True
    tasks = {task["id"]: task for task in result["mission"]["tasks"]}
    assert tasks["review"]["status"] == "completed"
    assert tasks["build"]["status"] == "skipped"
    assert calls == ["architect", "qa"]
    route = tasks["router"]["artifacts"]["route"]
    assert route["selected_branch"]["id"] == "branch-review"
    assert route["selected_branch"]["condition"]["checks"]["expression_ok"] is True
    assert route["selected_target_id"] == "review"
    assert route["skipped_task_ids"] == ["build"]
    assert any(
        event.get("type") == "workflow_route_applied"
        and event.get("task_id") == "router"
        and event.get("selected_target_id") == "review"
        and event.get("skipped_task_ids") == ["build"]
        for event in events
    )


def test_workflow_router_end_branch_skips_downstream(monkeypatch: pytest.MonkeyPatch) -> None:
    events: list[dict] = []
    calls: list[str] = []
    workflow_graph = {
        "nodes": [
            {
                "id": "plan",
                "type": "agentNode",
                "data": {"label": "Planner", "category": "architect", "execution_mode": "auto"},
            },
            {
                "id": "router",
                "type": "utilityNode",
                "data": {
                    "label": "조건 노드",
                    "category": "ROUTER",
                    "agent_id": "router",
                    "execution_mode": "auto",
                    "condition_branches": [
                        {
                            "id": "branch-end",
                            "label": "여기서 종료",
                            "expression": "true",
                            "action": "end",
                            "targetNodeId": "",
                        }
                    ],
                },
            },
            {
                "id": "review",
                "type": "agentNode",
                "data": {"label": "Review", "category": "검토", "execution_mode": "auto"},
            },
        ],
        "edges": [
            {"id": "edge-plan-router", "source": "plan", "target": "router"},
            {"id": "edge-router-review", "source": "router", "target": "review"},
        ],
        "loop_regions": [],
    }
    runtime = ComposerRuntime(use_mock=True, on_event=events.append, workflow_graph=workflow_graph)

    async def fast_execute(context: dict) -> dict:
        calls.append(context["role"])
        return {
            "artifacts": {
                "architecture": "마이크로서비스 아키텍처",
                "tech_stack": "FastAPI + Next.js",
                "api_design": "RESTful API",
            },
            "cost": 0.001,
            "confidence": 0.95,
        }

    monkeypatch.setattr(runtime.worker, "execute", fast_execute)

    result = asyncio.run(runtime.run("router end runtime", budget=1))

    assert result["success"] is True
    tasks = {task["id"]: task for task in result["mission"]["tasks"]}
    assert tasks["router"]["artifacts"]["route"]["selected_action"] == "end"
    assert tasks["review"]["status"] == "skipped"
    assert calls == ["architect"]
    assert any(
        event.get("type") == "workflow_route_applied"
        and event.get("selected_action") == "end"
        and event.get("skipped_task_ids") == ["review"]
        for event in events
    )


def test_background_mission_exception_persists_failed_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    async def boom(self: ComposerRuntime, mission) -> bool:
        raise RuntimeError("forced mission failure")

    monkeypatch.setattr(ComposerRuntime, "execute_mission", boom)
    owner_user = f"failed-owner-{uuid.uuid4().hex[:6]}"
    with TestClient(app) as scoped_client:
        create = scoped_client.post(
            "/api/missions",
            headers=_headers(owner_user, "member"),
            json={"goal": "forced failure snapshot", "budget": 1, "use_mock": True},
        )
        assert create.status_code == 200
        mission_id = create.json()["mission_id"]

        assert _wait_until(
            lambda: scoped_client.get(f"/api/missions/{mission_id}", headers=_headers(owner_user, "member"))
            .json()
            .get("status")
            == "failed",
            timeout=2.0,
        )
        assert mission_id not in running_tasks
        events = decision_log.list_by_mission(mission_id)
        assert any(event.get("type") == "mission_failed" and event.get("error") == "forced mission failure" for event in events)


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


def test_provider_keys_are_encrypted_at_rest() -> None:
    raw_key = f"test-secret-{uuid.uuid4().hex}"
    provider = "gemini"
    res = client.post(
        "/api/keys/register",
        headers={
            **_headers("owner-u", "owner"),
            "X-Admin-Token": "bremen-admin-dev",
        },
        json={"provider": provider, "api_key": raw_key},
    )
    assert res.status_code == 200

    with SessionLocal() as session:
        row = session.get(KeyRegistry, provider)
        assert row is not None
        assert row.api_key != raw_key
        assert row.api_key.startswith(ENCRYPTED_KEY_PREFIX)

    registered = {row["provider"]: row["api_key"] for row in list_registered_keys()}
    assert registered[provider] == raw_key

    status = client.get("/api/keys/status", headers=_headers("owner-u", "owner"))
    assert status.status_code == 200
    status_text = status.text
    assert raw_key not in status_text
    row = next(item for item in status.json()["providers"] if item["provider"] == provider)
    assert row["registered"] is True
    assert row["masked"] != raw_key


def test_validation_errors_redact_sensitive_inputs() -> None:
    raw_api_key = f"sk-validation-secret-{uuid.uuid4().hex}"
    raw_authorization = f"Bearer validation-auth-{uuid.uuid4().hex}"
    raw_admin_token = f"validation-admin-{uuid.uuid4().hex}"
    response = client.post(
        "/api/keys/register",
        headers={
            **_headers("owner-u", "owner"),
            "X-Admin-Token": raw_admin_token,
            "Authorization": raw_authorization,
        },
        json={
            "api_key": raw_api_key,
            "authorization": raw_authorization,
            "x-admin-token": raw_admin_token,
        },
    )

    assert response.status_code == 422
    body = response.text
    assert raw_api_key not in body
    assert raw_authorization not in body
    assert raw_admin_token not in body
    assert body.count("***REDACTED***") >= 3


def test_key_registry_does_not_mutate_deployment_environment(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = "gemini"
    env_name = "GEMINI_API_KEY"
    monkeypatch.setenv(env_name, "deployment-managed-key")
    headers = {
        **_headers("owner-u", "owner"),
        "X-Admin-Token": "bremen-admin-dev",
    }
    registered = client.post(
        "/api/keys/register",
        headers=headers,
        json={"provider": provider, "api_key": f"db-key-{uuid.uuid4().hex}"},
    )
    assert registered.status_code == 200
    assert os.environ[env_name] == "deployment-managed-key"

    deleted = client.delete(f"/api/keys/{provider}", headers=headers)
    assert deleted.status_code == 200
    assert os.environ[env_name] == "deployment-managed-key"


def test_jwt_only_owner_can_manage_keys_without_browser_admin_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    provider = "google"
    monkeypatch.setenv("BREMEN_AUTH_JWT_ONLY", "true")
    token = jwt.encode(
        {
            "sub": "jwt-key-owner",
            "role": "owner",
            "exp": int(time.time()) + 3600,
        },
        DEFAULT_JWT_SECRET,
        algorithm="HS256",
    )
    headers = {"Authorization": f"Bearer {token}"}
    try:
        registered = client.post(
            "/api/keys/register",
            headers=headers,
            json={"provider": provider, "api_key": f"jwt-key-{uuid.uuid4().hex}"},
        )
        assert registered.status_code == 200
        assert registered.json()["actor"] == "jwt-key-owner"

        deleted = client.delete(f"/api/keys/{provider}", headers=headers)
        assert deleted.status_code == 200
        assert deleted.json()["actor"] == "jwt-key-owner"
    finally:
        monkeypatch.delenv("BREMEN_AUTH_JWT_ONLY", raising=False)


def test_key_status_exposes_all_market_providers() -> None:
    res = client.get("/api/keys/status", headers=_headers("owner-u", "owner"))
    assert res.status_code == 200
    providers = {row["provider"] for row in res.json()["providers"]}
    assert {"openai", "anthropic", "gemini", "stability", "google"}.issubset(providers)

    stability_key = f"stability-secret-{uuid.uuid4().hex}"
    registered = client.post(
        "/api/keys/register",
        headers={
            **_headers("owner-u", "owner"),
            "X-Admin-Token": "bremen-admin-dev",
        },
        json={"provider": "stability", "api_key": stability_key},
    )
    assert registered.status_code == 200
    assert registered.json()["provider"] == "stability"

    status = client.get("/api/keys/status", headers=_headers("owner-u", "owner"))
    assert status.status_code == 200
    body_text = status.text
    assert stability_key not in body_text
    row = next(item for item in status.json()["providers"] if item["provider"] == "stability")
    assert row["registered"] is True


def test_member_market_list_filters_and_shapes() -> None:
    member_name = f"market-agent-{uuid.uuid4().hex[:6]}"
    create = client.post(
        "/api/members",
        headers=_headers("owner-u", "owner"),
        json={
            "name": member_name,
            "provider": "mock",
            "model": "mock-sim",
            "version": "0.1",
            "description": "FastAPI backend marketplace listing",
            "domain": "backend",
            "capabilities": ["fastapi"],
            "royalty_rate": 0.01,
        },
    )
    assert create.status_code == 200

    listed = client.get(
        f"/api/members?category=backend&search={member_name}&available_only=true&is_ai=true&published=true",
        headers=_headers("viewer-u", "viewer"),
    )
    assert listed.status_code == 200
    body = listed.json()
    assert body["count"] >= 1
    row = next(item for item in body["members"] if item["name"] == member_name)
    assert row["category"] == "backend"
    assert row["available"] is True
    assert row["required_api"] == "mock"
    assert body["agents"] == body["members"]


def test_member_market_detail_shape() -> None:
    member_name = f"detail-agent-{uuid.uuid4().hex[:6]}"
    create = client.post(
        "/api/members",
        headers=_headers("owner-u", "owner"),
        json={
            "name": member_name,
            "provider": "mock",
            "model": "mock-sim",
            "version": "0.2",
            "description": "Marketplace detail profile",
            "domain": "qa",
            "capabilities": ["test_generation"],
            "royalty_rate": 0.02,
        },
    )
    assert create.status_code == 200
    member_id = create.json()["member"]["id"]

    detail = client.get(f"/api/members/{member_id}", headers=_headers("viewer-u", "viewer"))
    assert detail.status_code == 200
    body = detail.json()
    assert body["member"]["id"] == member_id
    assert body["member"]["name"] == member_name
    assert body["member"]["category"] == "qa"
    assert body["member"]["available"] is True
    assert body["agent"] == body["member"]


def test_workspace_settings_are_user_scoped_and_role_guarded() -> None:
    user_id = f"workspace-owner-{uuid.uuid4().hex[:6]}"
    other_id = f"workspace-other-{uuid.uuid4().hex[:6]}"
    payload = {
        "library_agents": [
            {
                "id": "agent-a",
                "name": "Saved Agent",
                "category": "개발",
                "required_api": "mock",
            }
        ],
        "project_units": [
            {
                "id": "unit-workflow-a",
                "base_unit_id": "workflow",
                "name": "Saved Workflow Unit",
                "label": "실행 흐름",
                "short_label": "Flow",
                "description": "서버에 저장되는 Unit",
                "effect_summary": "Unit 기반 에이전트 구성이 유지됩니다.",
                "member_role": "워크플로우 설계자",
                "data_contract": "goal, steps, edges",
                "responsibility": "실행 순서를 구조화합니다.",
                "capabilities": ["planning", "workflow design"],
                "success_metrics": ["재사용률"],
                "setup_steps": ["목표 분해"],
                "cost_guidance": "고비용 노드는 승인 뒤에 배치",
                "quality_guidance": "완료 조건을 명시",
                "default_category": "기획",
                "version": "v1",
                "versions": [],
                "published": False,
            }
        ],
        "member_folders": [{"id": "folder-custom", "name": "커스텀"}],
        "agent_folder_ids": {"agent-a": "folder-custom"},
        "client_version": "test-client",
    }

    empty = client.get("/api/workspace/settings", headers=_headers(user_id, "member"))
    assert empty.status_code == 200
    assert empty.json()["exists"] is False
    assert empty.json()["settings"]["library_agents"] == []
    assert empty.json()["settings"]["project_units"] == []

    saved = client.put("/api/workspace/settings", headers=_headers(user_id, "member"), json=payload)
    assert saved.status_code == 200
    saved_body = saved.json()
    assert saved_body["exists"] is True
    assert saved_body["settings"]["library_agents"][0]["id"] == "agent-a"
    assert saved_body["settings"]["project_units"][0]["id"] == "unit-workflow-a"
    assert saved_body["settings"]["project_units"][0]["name"] == "Saved Workflow Unit"
    assert saved_body["settings"]["member_folders"] == [{"id": "folder-custom", "name": "커스텀"}]
    assert saved_body["settings"]["agent_folder_ids"] == {"agent-a": "folder-custom"}
    assert saved_body["settings"]["client_version"] == "test-client"
    assert "updated_at" in saved_body["settings"]

    fetched = client.get("/api/workspace/settings", headers=_headers(user_id, "member"))
    assert fetched.status_code == 200
    assert fetched.json()["exists"] is True
    assert fetched.json()["settings"]["library_agents"][0]["name"] == "Saved Agent"
    assert fetched.json()["settings"]["project_units"][0]["base_unit_id"] == "workflow"

    isolated = client.get("/api/workspace/settings", headers=_headers(other_id, "member"))
    assert isolated.status_code == 200
    assert isolated.json()["exists"] is False
    assert isolated.json()["settings"]["agent_folder_ids"] == {}
    assert isolated.json()["settings"]["project_units"] == []

    denied = client.put("/api/workspace/settings", headers=_headers("viewer-u", "viewer"), json=payload)
    assert denied.status_code == 403
    assert denied.json()["detail"] == "role_not_allowed:viewer"


def test_team_market_list_filters_preserve_read_scope() -> None:
    visible_name = f"visible-team-{uuid.uuid4().hex[:6]}"
    hidden_name = f"hidden-team-{uuid.uuid4().hex[:6]}"
    user_id = f"team-owner-{uuid.uuid4().hex[:6]}"

    visible = client.post(
        "/api/teams",
        headers=_headers(user_id, "supervisor"),
        json={"name": visible_name, "domain": "development"},
    )
    hidden = client.post(
        "/api/teams",
        headers=_headers("owner-u", "owner"),
        json={"name": hidden_name, "domain": "development"},
    )
    assert visible.status_code == 200
    assert hidden.status_code == 200

    scoped = client.get(
        "/api/teams?category=development&is_template=true&published=true",
        headers=_headers(user_id, "member"),
    )
    assert scoped.status_code == 200
    names = {row["name"] for row in scoped.json()["teams"]}
    assert visible_name in names
    assert hidden_name not in names


def test_team_market_detail_includes_member_profiles() -> None:
    owner_id = f"team-detail-owner-{uuid.uuid4().hex[:6]}"
    member = client.post(
        "/api/members",
        headers=_headers(owner_id, "supervisor"),
        json={
            "name": f"team-detail-agent-{uuid.uuid4().hex[:6]}",
            "provider": "mock",
            "model": "mock-sim",
            "version": "1.0",
            "description": "Team detail member",
            "domain": "development",
            "capabilities": ["fastapi"],
            "royalty_rate": 0.01,
        },
    )
    team = client.post(
        "/api/teams",
        headers=_headers(owner_id, "supervisor"),
        json={"name": f"detail-team-{uuid.uuid4().hex[:6]}", "domain": "development"},
    )
    assert member.status_code == 200
    assert team.status_code == 200
    member_id = member.json()["member"]["id"]
    team_id = team.json()["team"]["id"]

    add_member = client.post(
        f"/api/teams/{team_id}/members",
        headers=_headers(owner_id, "supervisor"),
        json={"member_id": member_id, "role_type": "executor"},
    )
    assert add_member.status_code == 200

    detail = client.get(f"/api/teams/{team_id}", headers=_headers(owner_id, "member"))
    assert detail.status_code == 200
    body = detail.json()
    assert body["team"]["id"] == team_id
    assert body["team"]["category"] == "development"
    assert body["team"]["member_count"] == 1
    assert body["member_profiles"][0]["id"] == member_id
    assert body["member_profiles"][0]["team_role_type"] == "executor"
    assert body["members"] == body["member_profiles"]


def test_team_member_add_upserts_and_resolves_highest_role() -> None:
    owner_id = f"team-upsert-owner-{uuid.uuid4().hex[:6]}"
    member = client.post(
        "/api/members",
        headers=_headers(owner_id, "supervisor"),
        json={
            "name": f"upsert-agent-{uuid.uuid4().hex[:6]}",
            "provider": "mock",
            "model": "mock-sim",
            "version": "1.0",
            "description": "Team upsert member",
            "domain": "development",
            "capabilities": ["runtime"],
            "royalty_rate": 0.01,
        },
    )
    team = client.post(
        "/api/teams",
        headers=_headers(owner_id, "supervisor"),
        json={"name": f"upsert-team-{uuid.uuid4().hex[:6]}", "domain": "development"},
    )
    assert member.status_code == 200
    assert team.status_code == 200
    member_id = member.json()["member"]["id"]
    team_id = team.json()["team"]["id"]

    first = client.post(
        f"/api/teams/{team_id}/members",
        headers=_headers(owner_id, "supervisor"),
        json={"member_id": member_id, "role_type": "executor"},
    )
    second = client.post(
        f"/api/teams/{team_id}/members",
        headers=_headers(owner_id, "supervisor"),
        json={"member_id": member_id, "role_type": "supervisor"},
    )
    assert first.status_code == 200
    assert first.json()["created"] is True
    assert first.json()["updated"] is False
    assert first.json()["member_count"] == 1
    assert second.status_code == 200
    assert second.json()["created"] is False
    assert second.json()["updated"] is True
    assert second.json()["member_count"] == 1

    stored = get_team_record(team_id)
    assert stored is not None
    matching = [row for row in stored["members"] if row["member_id"] == member_id]
    assert matching == [{"member_id": member_id, "role_type": "supervisor"}]

    stored["members"].append({"member_id": member_id, "role_type": "channel_supervisor"})
    stored["members"].append({"member_id": member_id, "role_type": "executor"})
    update_team_record(stored)
    assert _resolve_team_member(team_id, member_id)["role_type"] == "channel_supervisor"


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


def test_mission_websocket_is_not_subscribed_to_global_broadcasts() -> None:
    async def run_check() -> None:
        manager = ConnectionManager()
        global_ws = _FakeWebSocket()
        mission_ws = _FakeWebSocket()

        await manager.connect(global_ws)  # type: ignore[arg-type]
        await manager.connect(mission_ws, "mission-a")  # type: ignore[arg-type]
        await manager.broadcast_all({"type": "global"})
        await manager.broadcast_to_mission("mission-a", {"type": "mission"})

        assert global_ws.messages == [{"type": "global"}]
        assert mission_ws.messages == [{"type": "mission"}]

    asyncio.run(run_check())


def test_persisted_entity_timestamps_use_unix_epoch() -> None:
    response = client.post(
        "/api/teams",
        headers=_headers("timestamp-owner", "owner"),
        json={"name": f"timestamp-team-{uuid.uuid4().hex[:6]}", "domain": "ops"},
    )
    assert response.status_code == 200
    assert float(response.json()["team"]["created_at"]) > 1_000_000_000


def test_websocket_invalid_jwt_fails_closed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("BREMEN_AUTH_JWT_ONLY", raising=False)
    with pytest.raises(WebSocketDisconnect) as invalid_ws:
        with client.websocket_connect("/ws?jwt=not-a-valid-jwt&user_id=owner-u&user_role=owner") as ws:
            ws.receive_text()
    assert invalid_ws.value.code == 1008

    monkeypatch.setenv("BREMEN_AUTH_JWT_ONLY", "true")
    with pytest.raises(WebSocketDisconnect) as missing_ws_jwt:
        with client.websocket_connect("/ws?user_id=owner-u&user_role=owner") as ws:
            ws.receive_text()
    assert missing_ws_jwt.value.code == 1008


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


def test_mission_snapshot_db_fallback_after_cache_clear() -> None:
    owner_user = f"member-{uuid.uuid4().hex[:6]}"

    create = client.post(
        "/api/missions",
        headers=_headers(owner_user, "member"),
        json={"goal": "db-fallback-mission-snapshot", "budget": 1, "use_mock": True},
    )
    assert create.status_code == 200
    mission_id = create.json()["mission_id"]

    missions.clear()
    mission_owners.clear()

    owner_get = client.get(f"/api/missions/{mission_id}", headers=_headers(owner_user, "member"))
    assert owner_get.status_code == 200
    assert owner_get.json()["id"] == mission_id
    assert owner_get.json()["owner_id"] == owner_user

    listed = client.get("/api/missions", headers=_headers(owner_user, "member"))
    assert listed.status_code == 200
    assert any(row["id"] == mission_id for row in listed.json())


def test_mission_evaluations_fallback_to_decision_log() -> None:
    owner_user = f"member-{uuid.uuid4().hex[:6]}"
    mission_id = f"eval-{uuid.uuid4().hex[:8]}"
    missions[mission_id] = {
        "id": mission_id,
        "goal": "evaluation decision-log fallback",
        "status": "running",
        "tasks": [],
        "owner_id": owner_user,
    }
    mission_owners[mission_id] = owner_user
    evaluations.pop(mission_id, None)
    decision_log.append(
        {
            "type": "evaluation_result",
            "timestamp": time.time(),
            "mission_id": mission_id,
            "task_id": "t-quality",
            "role": "qa",
            "score": 0.91,
            "quality_pass": True,
        }
    )

    res = client.get(f"/api/missions/{mission_id}/evaluations", headers=_headers(owner_user, "member"))

    assert res.status_code == 200
    body = res.json()
    assert body["count"] >= 1
    assert any(row.get("task_id") == "t-quality" and row.get("quality_pass") is True for row in body["evaluations"])


def test_mission_creation_persists_studio_metadata() -> None:
    owner_user = f"studio-owner-{uuid.uuid4().hex[:6]}"
    team_graph = {
        "nodes": [
            {"id": "node-a", "type": "agentNode", "data": {"label": "Planner"}},
            {"id": "node-b", "type": "agentNode", "data": {"label": "Executor"}},
        ],
        "edges": [{"id": "edge-a", "source": "node-a", "target": "node-b"}],
    }
    create = client.post(
        "/api/missions",
        headers=_headers(owner_user, "member"),
        json={
            "goal": "studio metadata mission",
            "budget": 2,
            "use_mock": True,
            "team_label": "Studio Runtime Graph",
            "team_graph": team_graph,
            "auto_mode": False,
        },
    )
    assert create.status_code == 200
    mission_id = create.json()["mission_id"]
    assert create.json()["team_label"] == "Studio Runtime Graph"

    detail = client.get(f"/api/missions/{mission_id}", headers=_headers(owner_user, "member"))
    assert detail.status_code == 200
    body = detail.json()
    assert body["team_label"] == "Studio Runtime Graph"
    assert body["team_graph"] == team_graph
    assert body["auto_mode"] is False
    assert body["owner_id"] == owner_user


def test_mission_creation_rejects_missing_team_id() -> None:
    create = client.post(
        "/api/missions",
        headers=_headers("owner-u", "owner"),
        json={"goal": "missing-team-run", "budget": 1, "use_mock": True, "team_id": "missing-team"},
    )
    assert create.status_code == 404
    assert create.json()["detail"] == "Team not found"


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


def test_auth_token_endpoint_issues_usable_jwt() -> None:
    user_id = f"token-user-{uuid.uuid4().hex[:6]}"
    issued = client.post(
        "/api/auth/token",
        headers={"X-Admin-Token": "bremen-admin-dev"},
        json={"user_id": user_id, "role": "member", "ttl_seconds": 600},
    )
    assert issued.status_code == 200
    body = issued.json()
    assert body["token_type"] == "bearer"
    assert body["user_id"] == user_id
    assert body["role"] == "member"
    assert body["expires_in"] == 600

    whoami = client.get(
        "/api/auth/whoami",
        headers={
            "Authorization": f"Bearer {body['access_token']}",
            "X-User-Id": "spoof-user",
            "X-User-Role": "owner",
        },
    )
    assert whoami.status_code == 200
    assert whoami.json()["user_id"] == user_id
    assert whoami.json()["role"] == "member"
    assert whoami.json()["source"] == "jwt"


def test_auth_token_endpoint_requires_admin_and_valid_role() -> None:
    missing_admin = client.post(
        "/api/auth/token",
        json={"user_id": "token-user", "role": "member", "ttl_seconds": 600},
    )
    assert missing_admin.status_code == 403
    assert missing_admin.json()["detail"] == "admin_token_required"

    invalid_role = client.post(
        "/api/auth/token",
        headers={"X-Admin-Token": "bremen-admin-dev"},
        json={"user_id": "token-user", "role": "root", "ttl_seconds": 600},
    )
    assert invalid_role.status_code == 400
    assert invalid_role.json()["detail"] == "invalid_role:root"


def test_db_ops_require_admin_and_create_sanitized_backup() -> None:
    missing_admin = client.get("/api/admin/db/integrity", headers=_headers("db-owner", "owner"))
    assert missing_admin.status_code == 403
    assert missing_admin.json()["detail"] == "admin_token_required"

    viewer = client.get(
        "/api/admin/db/integrity",
        headers={**_headers("db-viewer", "viewer"), "X-Admin-Token": "bremen-admin-dev"},
    )
    assert viewer.status_code == 403
    assert viewer.json()["detail"] == "role_not_allowed:viewer"

    headers = {**_headers("db-owner", "owner"), "X-Admin-Token": "bremen-admin-dev"}
    integrity = client.get("/api/admin/db/integrity", headers=headers)
    assert integrity.status_code == 200
    integrity_body = integrity.json()
    assert isinstance(integrity_body["ok"], bool)
    assert "db_file" in integrity_body
    assert {"members", "teams", "channels", "contracts", "ledger_rows"}.issubset(integrity_body["counts"])
    assert {
        "orphan_team_members",
        "orphan_channels",
        "orphan_contracts",
        "orphan_ledger_receivers",
    }.issubset(integrity_body["issues"])

    backup = client.post("/api/admin/db/backup?label=qa_label-2026!!", headers=headers)
    assert backup.status_code == 200
    backup_body = backup.json()
    assert backup_body["ok"] is True
    assert Path(backup_body["source"]).resolve() == Path(integrity_body["db_file"]).resolve()
    assert backup_body["size_bytes"] > 0
    backup_path = Path(backup_body["backup"])
    assert backup_path.exists()
    assert backup_path.parent.name == "backups"
    assert backup_path.name.endswith("-qa_label-2026.db")
    assert "!" not in backup_path.name


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


def test_auth_bridge_sets_rollout_observability_headers() -> None:
    token = jwt.encode(
        {"sub": "jwt-header-user", "role": "member", "exp": int(time.time()) + 3600},
        DEFAULT_JWT_SECRET,
        algorithm="HS256",
    )
    jwt_response = client.get("/api/auth/whoami", headers={"Authorization": f"Bearer {token}"})
    assert jwt_response.status_code == 200
    assert jwt_response.headers["X-Auth-Mode"] in {"hybrid", "jwt_only"}
    assert jwt_response.headers["X-Auth-Source"] == "jwt"
    assert "X-Auth-Error" not in jwt_response.headers

    invalid_response = client.get(
        "/api/auth/whoami",
        headers={
            "Authorization": "Bearer invalid.token.value",
            "X-User-Id": "spoof-user",
            "X-User-Role": "owner",
        },
    )
    assert invalid_response.status_code == 401
    assert invalid_response.headers["X-Auth-Mode"] in {"hybrid", "jwt_only"}
    assert invalid_response.headers["X-Auth-Source"] == "header"
    assert invalid_response.headers["X-Auth-Error"] in {"jwt_invalid_or_expired", "jwt_invalid_identity_claims"}


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


def test_memory_scope_blocks_cross_user_member_access() -> None:
    owner_id = f"memory-owner-{uuid.uuid4().hex[:6]}"
    other_id = f"memory-other-{uuid.uuid4().hex[:6]}"
    own_headers = _headers(owner_id, "member")

    own_put = client.post(
        "/api/memory/put",
        headers=own_headers,
        json={
            "scope": "member",
            "scope_id": owner_id,
            "key": "preference",
            "value": {"tone": "concise"},
        },
    )
    assert own_put.status_code == 200

    cross_put = client.post(
        "/api/memory/put",
        headers=own_headers,
        json={
            "scope": "member",
            "scope_id": other_id,
            "key": "preference",
            "value": {"tone": "verbose"},
        },
    )
    assert cross_put.status_code == 403
    assert cross_put.json()["detail"] == "memory_scope_access_denied"

    cross_read = client.get(f"/api/memory/member/{other_id}", headers=own_headers)
    assert cross_read.status_code == 403
    assert cross_read.json()["detail"] == "memory_scope_access_denied"


def test_memory_transfer_requires_target_scope_permission() -> None:
    source_id = f"memory-source-{uuid.uuid4().hex[:6]}"
    target_id = f"memory-target-{uuid.uuid4().hex[:6]}"
    headers = _headers(source_id, "member")
    seeded = client.post(
        "/api/memory/put",
        headers=headers,
        json={"scope": "member", "scope_id": source_id, "key": "note", "value": "private"},
    )
    assert seeded.status_code == 200

    transfer = client.post(
        "/api/memory/filter-transfer",
        headers=headers,
        json={
            "source_scope": "member",
            "source_scope_id": source_id,
            "target_scope": "member",
            "target_scope_id": target_id,
        },
    )
    assert transfer.status_code == 403
    assert transfer.json()["detail"] == "memory_scope_access_denied"


def test_memory_scope_uses_database_as_source_of_truth() -> None:
    owner_id = f"memory-persist-{uuid.uuid4().hex[:6]}"
    headers = _headers(owner_id, "member")
    created = client.post(
        "/api/memory/put",
        headers=headers,
        json={
            "scope": "member",
            "scope_id": owner_id,
            "key": "persistent-preference",
            "value": {"tone": "precise"},
            "classification": "internal",
        },
    )
    assert created.status_code == 200

    memory_engine._storage.clear()
    fetched = client.get(f"/api/memory/member/{owner_id}", headers=headers)
    assert fetched.status_code == 200
    assert fetched.json()["records"] == [
        {
            "scope": "member",
            "scope_id": owner_id,
            "key": "persistent-preference",
            "value": {"tone": "precise"},
            "classification": "internal",
            "updated_at": fetched.json()["records"][0]["updated_at"],
        }
    ]


def test_memory_scope_normalizes_case_and_blocks_restricted_transfer() -> None:
    owner_id = f"memory-normalize-{uuid.uuid4().hex[:6]}"
    headers = _headers(owner_id, "member")
    created = client.post(
        "/api/memory/put",
        headers=headers,
        json={
            "scope": " MEMBER ",
            "scope_id": f" {owner_id} ",
            "key": " private-note ",
            "value": {"secret": True},
            "classification": " Restricted ",
        },
    )
    assert created.status_code == 200
    assert created.json()["scope"] == "member"
    assert created.json()["scope_id"] == owner_id
    assert created.json()["key"] == "private-note"

    transferred = client.post(
        "/api/memory/filter-transfer",
        headers=_headers("memory-admin", "admin"),
        json={
            "source_scope": " MEMBER ",
            "source_scope_id": f" {owner_id} ",
            "target_scope": " GLOBAL ",
            "target_scope_id": " shared ",
        },
    )
    assert transferred.status_code == 200
    assert transferred.json()["allowed"] is False
    assert transferred.json()["reasons"] == [
        "member_to_global_blocked",
        "restricted_records_cannot_publish_without_override",
    ]


def test_memory_scope_rejects_unknown_classification_and_large_value() -> None:
    owner_id = f"memory-limits-{uuid.uuid4().hex[:6]}"
    headers = _headers(owner_id, "member")
    unknown = client.post(
        "/api/memory/put",
        headers=headers,
        json={
            "scope": "member",
            "scope_id": owner_id,
            "key": "unknown",
            "value": "value",
            "classification": "private-ish",
        },
    )
    assert unknown.status_code == 400
    assert unknown.json()["detail"] == "invalid_classification:private-ish"

    too_large = client.post(
        "/api/memory/put",
        headers=headers,
        json={
            "scope": "member",
            "scope_id": owner_id,
            "key": "large",
            "value": "x" * 300_000,
        },
    )
    assert too_large.status_code == 413
    assert too_large.json()["detail"] == "memory_value_too_large"


def test_royalty_simulation_requires_authenticated_runtime_role() -> None:
    denied = client.post(
        "/api/ledger/royalty/simulate",
        json={"member_id": "missing", "provider_cost": 1},
    )
    assert denied.status_code == 403

    negative = client.post(
        "/api/ledger/royalty/simulate",
        headers=_headers("royalty-owner", "owner"),
        json={"member_id": "missing", "provider_cost": -1},
    )
    assert negative.status_code == 422


def test_studio_backend_auto_mode_does_not_open_human_gate() -> None:
    owner_user = f"auto-backend-{uuid.uuid4().hex[:6]}"
    graph = {
        "nodes": [
            {
                "id": "auto-backend",
                "type": "agentNode",
                "data": {
                    "label": "자동 백엔드",
                    "category": "backend",
                    "required_api": "mock",
                    "execution_mode": "auto",
                },
            }
        ],
        "edges": [],
        "loop_regions": [],
    }
    with TestClient(app) as scoped_client:
        created = scoped_client.post(
            "/api/missions",
            headers=_headers(owner_user, "member"),
            json={
                "goal": "studio auto backend",
                "budget": 1,
                "use_mock": True,
                "team_graph": graph,
            },
        )
        assert created.status_code == 200
        mission_id = created.json()["mission_id"]
        assert _wait_until(
            lambda: scoped_client.get(
                f"/api/missions/{mission_id}",
                headers=_headers(owner_user, "member"),
            ).json().get("status")
            == "completed",
            timeout=5.0,
        )
        assert mission_id not in pending_human_gates
        assert not any(
            row.get("type") == "human_gate_requested"
            for row in decision_log.list_by_mission(mission_id)
        )


def test_live_mission_rejects_provider_without_runtime_adapter() -> None:
    graph = {
        "nodes": [
            {
                "id": "anthropic-node",
                "type": "agentNode",
                "data": {
                    "label": "Claude worker",
                    "category": "writing",
                    "required_api": "anthropic",
                    "execution_mode": "auto",
                },
            }
        ],
        "edges": [],
    }
    response = client.post(
        "/api/missions",
        headers=_headers("runtime-provider-owner", "owner"),
        json={
            "goal": "provider preflight",
            "budget": 1,
            "use_mock": False,
            "team_graph": graph,
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == "runtime_provider_not_supported:anthropic"


def test_policy_real_mode_uses_explicit_key_availability(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    engine = PolicyEngine(Path(__file__).resolve().parents[1] / "policy_rules.yaml")
    allowed = engine.check_mission_start(
        budget=1,
        use_mock=False,
        api_key_available=True,
    )
    denied = engine.check_mission_start(
        budget=1,
        use_mock=False,
        api_key_available=False,
    )
    assert allowed.allowed is True
    assert denied.allowed is False
    assert denied.reasons == ["real_mode_without_openai_api_key"]


def test_real_worker_accepts_injected_database_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    captured: dict[str, str] = {}

    class FakeOpenAI:
        def __init__(self, *, api_key: str) -> None:
            captured["api_key"] = api_key

    monkeypatch.setattr("core.workers.AsyncOpenAI", FakeOpenAI)
    worker = LLMWorker(use_mock=False, api_key="db-registered-key")
    assert worker.has_api_key is True
    assert captured["api_key"] == "db-registered-key"


@pytest.mark.parametrize(
    ("graph", "detail"),
    [
        ({"nodes": [], "edges": [], "loop_regions": []}, "workflow_graph_no_nodes"),
        (
            {
                "nodes": [{"id": "a", "data": {}}],
                "edges": [{"id": "bad", "source": "a", "target": "missing"}],
                "loop_regions": [],
            },
            "workflow_graph_edge_node_not_found:a->missing",
        ),
        (
            {
                "nodes": [{"id": "a", "data": {}}, {"id": "b", "data": {}}],
                "edges": [
                    {"id": "ab", "source": "a", "target": "b"},
                    {"id": "ba", "source": "b", "target": "a"},
                ],
                "loop_regions": [],
            },
            "workflow_graph_cycle_requires_loop_region",
        ),
    ],
)
def test_mission_rejects_workflow_graph_that_would_execute_differently(
    graph: dict,
    detail: str,
) -> None:
    response = client.post(
        "/api/missions",
        headers=_headers("graph-validation-owner", "owner"),
        json={
            "goal": "reject misleading graph",
            "budget": 1,
            "use_mock": True,
            "team_graph": graph,
        },
    )
    assert response.status_code == 422
    assert response.json()["detail"] == detail


def test_task_snapshot_keeps_error_message() -> None:
    task = Task(id="failed-task", description="failure", role="qa")
    task.status = TaskStatus.FAILED
    task.error_message = "schema_mismatch"
    assert task.to_dict()["error_message"] == "schema_mismatch"


@pytest.mark.parametrize(
    ("category", "expected_role"),
    [
        ("글쓰기", "writer"),
        ("번역", "translator"),
        ("데이터", "data"),
        ("이미지", "image"),
        ("custom", "agent"),
    ],
)
def test_studio_non_webapp_agents_keep_domain_role_and_complete(
    category: str,
    expected_role: str,
) -> None:
    runtime = ComposerRuntime(
        use_mock=True,
        workflow_graph={
            "nodes": [
                {
                    "id": "domain-agent",
                    "type": "agentNode",
                    "data": {
                        "label": f"{category} agent",
                        "category": category,
                        "required_api": "mock",
                        "execution_mode": "auto",
                    },
                }
            ],
            "edges": [],
            "loop_regions": [],
        },
    )
    result = asyncio.run(runtime.run("domain agent runtime", budget=1))
    task = result["mission"]["tasks"][0]
    assert result["success"] is True
    assert task["role"] == expected_role
    assert task["status"] == "completed"
    assert task["artifacts"]


def test_cost_and_royalty_engines_reject_or_clamp_invalid_negative_costs() -> None:
    governor = CostGovernor(budget=1)
    with pytest.raises(ValueError, match="invalid_task_cost"):
        governor.record_cost("negative", -0.1)
    result = RoyaltyEngine().calculate(provider_cost=-1, royalty_rate=0.2)
    assert result.provider_cost == 0
    assert result.total_cost == 0
    with pytest.raises(ValueError, match="invalid_provider_cost"):
        RoyaltyEngine().calculate(provider_cost=float("inf"), royalty_rate=0.2)


@pytest.mark.parametrize("budget", [-1, float("inf"), float("nan")])
def test_cost_governor_rejects_invalid_budget(budget: float) -> None:
    with pytest.raises(ValueError, match="invalid_budget"):
        CostGovernor(budget=budget)


def test_validation_engine_does_not_treat_boolean_as_number(tmp_path: Path) -> None:
    schema = tmp_path / "schema.yaml"
    schema.write_text(
        "schemas:\n  score:\n    required_keys: [value]\n    key_types:\n      value: number\n",
        encoding="utf-8",
    )
    result = ValidationEngine(schema).validate("score", {"value": True})
    assert result.passed is False
    assert result.reasons == ["type_mismatch:value:number"]


def test_evaluation_engine_accepts_short_meaningful_schema_values() -> None:
    result = ComposerRuntime(use_mock=True).evaluation_engine.evaluate(
        "qa",
        {
            "test_scenarios": "로그인",
            "unit_tests": "API",
            "integration_tests": "E2E",
            "coverage_target": "85%",
        },
        execution_pass=True,
    )
    assert result.quality_pass is True
    assert result.checks["non_empty_ratio"] == 1.0


def test_runtime_separates_execution_and_quality_evaluation_events() -> None:
    events: list[dict] = []
    runtime = ComposerRuntime(
        use_mock=True,
        on_event=events.append,
        workflow_graph={
            "nodes": [
                {
                    "id": "writer",
                    "type": "agentNode",
                    "data": {
                        "label": "Writer",
                        "category": "글쓰기",
                        "required_api": "mock",
                        "execution_mode": "auto",
                    },
                }
            ],
            "edges": [],
            "loop_regions": [],
        },
    )
    result = asyncio.run(runtime.run("event separation", budget=1))
    assert result["success"] is True
    execution_events = [event for event in events if event.get("type") == "execution_result"]
    quality_events = [event for event in events if event.get("type") == "evaluation_result"]
    assert len(execution_events) == 1
    assert len(quality_events) == 1
    assert quality_events[0]["quality_pass"] is True


def test_decision_log_tolerates_malformed_timestamp(tmp_path: Path) -> None:
    log = DecisionLog(tmp_path / "events.jsonl")
    log.append({"type": "bad", "timestamp": "not-a-number", "mission_id": "m1"})
    log.append({"type": "good", "timestamp": 10, "mission_id": "m1"})
    rows = log.list_by_mission("m1")
    assert [row["type"] for row in rows] == ["bad", "good"]


def test_trust_without_evidence_is_neutral_not_perfect(tmp_path: Path) -> None:
    trust = TrustEngine(tmp_path / "trust.jsonl").get_trust("new-member")
    assert trust["score"] == 50
    assert trust["success_rate"] == 0
    assert trust["evidence_level"] == "none"


def test_trust_ignores_nonfinite_cost_and_latency(tmp_path: Path) -> None:
    engine = TrustEngine(tmp_path / "trust.jsonl")
    engine.append_event(
        {
            "type": "member_execution",
            "member_id": "finite-member",
            "success": True,
            "cost": float("inf"),
            "latency_ms": float("nan"),
        }
    )
    trust = engine.get_trust("finite-member")
    assert trust["score"] == 100
    assert trust["avg_cost"] == 0
    assert trust["avg_latency_ms"] == 0
