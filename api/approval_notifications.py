from __future__ import annotations

import time
from collections.abc import Callable
from typing import Any, Dict, List


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
    "kakao": "kakao",
    "카톡": "kakao",
    "kakaotalk": "kakao",
}


def normalize_approval_channel(value: Any) -> str:
    raw = str(value or "").strip()
    if not raw:
        return ""
    return APPROVAL_CHANNEL_ALIASES.get(raw.lower(), raw.lower())


def normalize_approval_channels(value: Any) -> List[str]:
    raw_channels = value if isinstance(value, list) else ["admin_queue"]
    channels: List[str] = []
    for raw_channel in raw_channels:
        channel = normalize_approval_channel(raw_channel)
        if channel and channel not in channels:
            channels.append(channel)
    return channels or ["admin_queue"]


def approval_notification_id(mission_id: str, task_id: str, gate_stage: str, channel: str) -> str:
    return f"{mission_id}:{task_id}:{gate_stage}:{channel}"


def approval_notification_payload(
    notification: Dict[str, Any],
    *,
    public_url: Callable[[str, str], str],
) -> Dict[str, Any]:
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
        "approve_url": public_url(f"/runs?mission={mission_id}", mission_id),
        "ops_url": public_url(f"/chat/{mission_id}?tab=timeline", mission_id),
    }


def notification_row_from_event(event: Dict[str, Any]) -> Dict[str, Any]:
    mission_id = str(event.get("mission_id") or "")
    task_id = str(event.get("task_id") or "")
    gate_stage = str(event.get("gate_stage") or "before_run")
    channel = str(event.get("channel") or "admin_queue")
    return {
        "id": str(event.get("id") or approval_notification_id(mission_id, task_id, gate_stage, channel)),
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


def retryable_approval_notifications(
    rows: List[Dict[str, Any]],
    *,
    channels: List[str] | None = None,
    notification_ids: List[str] | None = None,
) -> List[Dict[str, Any]]:
    allowed_channels = {normalize_approval_channel(channel) for channel in channels or []}
    allowed_channels.discard("")
    allowed_ids = {str(notification_id or "").strip() for notification_id in notification_ids or []}
    allowed_ids.discard("")
    retryable_statuses = {"pending", "failed", "outbox_pending"}
    targets: List[Dict[str, Any]] = []
    for row in rows:
        channel = normalize_approval_channel(row.get("channel")) or "admin_queue"
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
