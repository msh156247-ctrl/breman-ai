from __future__ import annotations

import time
from typing import Any, Dict, Iterable, List

from api.compat import mission_workflow_compatibility_fields


def mission_response_snapshot(mission: Dict[str, Any]) -> Dict[str, Any]:
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


def mission_artifacts_response(mission_id: str, mission: Dict[str, Any]) -> Dict[str, Any]:
    tasks = mission.get("tasks", [])
    task_rows = [task for task in tasks if isinstance(task, dict)] if isinstance(tasks, list) else []
    artifacts = {
        task.get("id"): task.get("artifacts", {})
        for task in task_rows
        if task.get("status") == "completed" and task.get("artifacts")
    }
    return {
        "mission_id": mission_id,
        "artifacts": artifacts,
        "total_tasks": len(task_rows),
        "completed_tasks": len(artifacts),
    }


def mission_timeline_response(mission_id: str, events: Iterable[Dict[str, Any]]) -> Dict[str, Any]:
    rows = list(events)
    return {"mission_id": mission_id, "events": rows, "count": len(rows)}


def mission_evaluations_response(
    mission_id: str,
    cached_rows: List[Dict[str, Any]],
    timeline_events: Iterable[Dict[str, Any]],
) -> Dict[str, Any]:
    rows = cached_rows or [event for event in timeline_events if event.get("type") == "evaluation_result"]
    return {"mission_id": mission_id, "evaluations": rows, "count": len(rows)}


def pending_approval_row(
    mission_id: str,
    pending: Dict[str, Any],
    mission: Dict[str, Any],
    *,
    approval_channels: List[str],
    owner_id: str | None,
    notifications: List[Dict[str, Any]],
    runtime_active: bool = True,
    can_approve: bool = True,
) -> Dict[str, Any]:
    task_id = str(pending.get("task_id") or "")
    gate_stage = str(pending.get("gate_stage") or "before_run")
    is_runtime_active = bool(pending.get("runtime_active", runtime_active))
    is_approvable = bool(pending.get("can_approve", can_approve)) and is_runtime_active
    return {
        "mission_id": mission_id,
        "task_id": task_id,
        "role": str(pending.get("role") or ""),
        "gate_stage": gate_stage,
        "approval_channels": approval_channels,
        "approval_target": str(pending.get("approval_target") or ""),
        "requested_at": pending.get("requested_at") or time.time(),
        "mission_goal": str(mission.get("goal") or ""),
        "mission_status": str(mission.get("status") or ""),
        "owner_id": owner_id,
        "runtime_active": is_runtime_active,
        "can_approve": is_approvable,
        "recovery_reason": str(pending.get("recovery_reason") or ""),
        "notifications": notifications,
    }
