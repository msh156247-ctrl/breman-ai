from __future__ import annotations

import argparse
import json
from pathlib import Path
import time
from urllib import request


def api_call(base_url: str, path: str, token: str, method: str = "GET", payload: dict | None = None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = request.Request(
        f"{base_url.rstrip('/')}{path}",
        data=data,
        method=method,
        headers={
            "Authorization": f"Bearer {token}",
            **({"Content-Type": "application/json"} if data else {}),
        },
    )
    with request.urlopen(req, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def workspace_payload(prefix: str) -> dict:
    return {
        "client_version": "workspace_settings_v4",
        "hired_agents": [],
        "library_agents": [],
        "project_units": [],
        "member_folders": [],
        "agent_folder_ids": {},
        "nodes": [
            {
                "id": f"{prefix}-1",
                "type": "agentNode",
                "position": {"x": 40, "y": 100},
                "data": {
                    "label": f"{prefix} Build",
                    "category": "개발",
                    "agent_id": "qa-builder",
                    "required_api": "openai",
                    "execution_mode": "confirm",
                    "approval_gate_stage": "before_run",
                    "approval_channels": ["admin_queue"],
                },
            },
            {
                "id": f"{prefix}-2",
                "type": "agentNode",
                "position": {"x": 360, "y": 100},
                "data": {
                    "label": f"{prefix} Review",
                    "category": "개발",
                    "agent_id": "qa-review",
                    "required_api": "openai",
                    "execution_mode": "auto",
                },
            },
            {
                "id": f"{prefix}-3",
                "type": "agentNode",
                "position": {"x": 680, "y": 100},
                "data": {
                    "label": f"{prefix} Finish",
                    "category": "개발",
                    "agent_id": "qa-finish",
                    "required_api": "openai",
                    "execution_mode": "auto",
                },
            },
        ],
        "edges": [
            {"id": f"{prefix}-e1", "source": f"{prefix}-1", "target": f"{prefix}-2"},
            {"id": f"{prefix}-e2", "source": f"{prefix}-2", "target": f"{prefix}-3"},
        ],
        "node_execution_states": {},
        "artifact_versions": [],
        "loop_regions": [],
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--session-file", required=True)
    args = parser.parse_args()
    session = json.loads(Path(args.session_file).read_text(encoding="utf-8"))
    base_url = session["api_base_url"]
    token_a = session["accounts"]["a"]["access_token"]
    token_b = session["accounts"]["b"]["access_token"]

    payload_a = workspace_payload("account-a")
    payload_b = workspace_payload("account-b")
    api_call(base_url, "/api/workspace/settings", token_a, "PUT", payload_a)
    api_call(base_url, "/api/workspace/settings", token_b, "PUT", payload_b)
    restored_a = api_call(base_url, "/api/workspace/settings", token_a)["settings"]
    restored_b = api_call(base_url, "/api/workspace/settings", token_b)["settings"]
    assert restored_a["nodes"][0]["id"] == "account-a-1"
    assert restored_b["nodes"][0]["id"] == "account-b-1"

    mission = api_call(
        base_url,
        "/api/missions",
        token_a,
        "POST",
        {
            "goal": "E2E approval mission",
            "budget": 2,
            "use_mock": True,
            "workflow_id": "qa-account-a",
            "workflow_label": "QA Account A",
            "workflow_graph": {
                "nodes": payload_a["nodes"],
                "edges": payload_a["edges"],
                "loop_regions": [],
            },
        },
    )
    mission_id = mission["mission_id"]
    deadline = time.time() + 20
    status = ""
    while time.time() < deadline:
        detail = api_call(base_url, f"/api/missions/{mission_id}", token_a)
        status = detail["status"]
        if status == "awaiting_approval":
            break
        time.sleep(0.2)
    assert status == "awaiting_approval", status
    api_call(base_url, f"/api/missions/{mission_id}/approve", token_a, "POST", {})

    while time.time() < deadline:
        detail = api_call(base_url, f"/api/missions/{mission_id}", token_a)
        status = detail["status"]
        if status in {"completed", "failed"}:
            break
        time.sleep(0.2)
    assert status == "completed", status
    timeline = api_call(base_url, f"/api/missions/{mission_id}/timeline", token_a)
    event_types = {event["type"] for event in timeline["events"]}
    assert {"human_gate_requested", "human_gate_approved", "mission_completed"} <= event_types
    print(json.dumps({"mission_id": mission_id, "status": status, "workspace_isolated": True}))


if __name__ == "__main__":
    main()
