from __future__ import annotations

import asyncio
import os
import smtplib
import time
from typing import Any, Callable, Dict, List
from urllib import error as urllib_error

from api.approval_notifications import (
    approval_notification_id,
    approval_notification_payload,
    normalize_approval_channel,
    normalize_approval_channels,
    notification_row_from_event,
    retryable_approval_notifications,
)
from api.approval_transport import post_json_webhook, send_smtp_approval_email
from api.websocket_manager import ConnectionManager
from core.decision_log import DecisionLog


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


class ApprovalNotificationRuntime:
    def __init__(
        self,
        *,
        outbox: Dict[str, List[Dict[str, Any]]],
        decision_log: DecisionLog,
        manager: ConnectionManager,
        get_channel_settings_for_mission: Callable[[str], Dict[str, Any]],
        decrypt_provider_key: Callable[[str], str],
        is_truthy: Callable[[Any], bool],
        post_json_webhook_fn: Callable[[str, Dict[str, Any], str], Dict[str, Any]] | None = None,
        send_smtp_approval_email_fn: Callable[[Dict[str, Any], Dict[str, Any]], None] | None = None,
    ) -> None:
        self.outbox = outbox
        self.decision_log = decision_log
        self.manager = manager
        self.get_channel_settings_for_mission = get_channel_settings_for_mission
        self.decrypt_provider_key = decrypt_provider_key
        self.is_truthy = is_truthy
        self.post_json_webhook_fn = post_json_webhook_fn or self._post_json_webhook
        self.send_smtp_approval_email_fn = send_smtp_approval_email_fn or self._send_smtp_approval_email

    def channel_env_overrides(self) -> Dict[str, bool]:
        return {
            "public_base_url": bool(os.getenv(APPROVAL_PUBLIC_BASE_URL_ENV)),
            "email_webhook": bool(os.getenv(APPROVAL_EMAIL_WEBHOOK_ENV) or os.getenv(APPROVAL_GENERIC_WEBHOOK_ENV)),
            "sms_webhook": bool(os.getenv(APPROVAL_SMS_WEBHOOK_ENV) or os.getenv(APPROVAL_GENERIC_WEBHOOK_ENV)),
            "kakao_webhook": bool(os.getenv(APPROVAL_KAKAO_WEBHOOK_ENV) or os.getenv(APPROVAL_GENERIC_WEBHOOK_ENV)),
            "webhook_token": bool(os.getenv(APPROVAL_WEBHOOK_TOKEN_ENV)),
            "smtp": bool(os.getenv(SMTP_HOST_ENV)),
        }

    def approval_notifications_for_gate(self, mission_id: str, task_id: str, gate_stage: str) -> List[Dict[str, Any]]:
        memory_rows = self.outbox.get(mission_id, [])
        if not memory_rows:
            memory_rows = self.rebuild_approval_notifications_from_log(mission_id)
        else:
            log_rows = self.rebuild_approval_notifications_from_log(mission_id)
            merged = {str(row.get("id") or ""): dict(row) for row in log_rows}
            merged.update({str(row.get("id") or ""): dict(row) for row in memory_rows})
            memory_rows = [row for key, row in merged.items() if key]
            self.outbox[mission_id] = memory_rows
        return [
            dict(row)
            for row in memory_rows
            if str(row.get("task_id") or "") == task_id and str(row.get("gate_stage") or "") == gate_stage
        ]

    def ensure_approval_notifications(self, gate: Dict[str, Any]) -> List[Dict[str, Any]]:
        mission_id = str(gate.get("mission_id") or "").strip()
        task_id = str(gate.get("task_id") or "").strip()
        gate_stage = str(gate.get("gate_stage") or "before_run").strip() or "before_run"
        if not mission_id:
            return []
        requested_at = gate.get("requested_at") or time.time()
        approval_target = str(gate.get("approval_target") or "").strip()
        channels = normalize_approval_channels(gate.get("approval_channels"))
        rows = self.outbox.setdefault(mission_id, [])
        existing_ids = {str(row.get("id") or "") for row in rows}
        created: List[Dict[str, Any]] = []
        for channel in channels:
            notification_id = approval_notification_id(mission_id, task_id, gate_stage, channel)
            if notification_id in existing_ids:
                continue
            now = time.time()
            row = {
                "id": notification_id,
                "mission_id": mission_id,
                "task_id": task_id,
                "gate_stage": gate_stage,
                "channel": channel,
                "target": self._approval_target_for_channel(mission_id, channel, approval_target),
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

    def resolve_approval_notifications(
        self,
        mission_id: str,
        task_id: str,
        gate_stage: str,
        approved_by: str,
        timestamp: float,
    ) -> List[Dict[str, Any]]:
        resolved: List[Dict[str, Any]] = []
        for row in self.outbox.get(mission_id, []):
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

    def rebuild_approval_notifications_from_log(self, mission_id: str) -> List[Dict[str, Any]]:
        rows_by_id: Dict[str, Dict[str, Any]] = {}
        for event in self.decision_log.list_by_mission(mission_id):
            if event.get("type") not in {
                "approval_notification_queued",
                "approval_notification_delivery",
                "approval_notification_resolved",
            }:
                continue
            row = notification_row_from_event(event)
            row_id = str(row.get("id") or "")
            if row_id:
                rows_by_id[row_id] = row
        rebuilt = list(rows_by_id.values())
        rebuilt.sort(key=lambda row: float(row.get("requested_at") or 0))
        if rebuilt:
            self.outbox[mission_id] = [dict(row) for row in rebuilt]
        return rebuilt

    def retryable_approval_notifications(
        self,
        mission_id: str,
        *,
        channels: List[str] | None = None,
        notification_ids: List[str] | None = None,
    ) -> List[Dict[str, Any]]:
        rows = self.outbox.get(mission_id, [])
        if not rows:
            rows = self.rebuild_approval_notifications_from_log(mission_id)
        return retryable_approval_notifications(rows, channels=channels, notification_ids=notification_ids)

    def recovered_pending_gate_from_log(self, mission_id: str, mission: Dict[str, Any]) -> Dict[str, Any] | None:
        if str(mission.get("status") or "") not in {"awaiting_approval", "blocked"}:
            return None
        latest_gate: Dict[str, Any] | None = None
        for event in self.decision_log.list_by_mission(mission_id):
            event_type = str(event.get("type") or "")
            if event_type == "human_gate_requested":
                latest_gate = event
            elif latest_gate is not None and event_type in {
                "human_gate_approved",
                "mission_completed",
                "mission_failed",
                "mission_cancelled",
            }:
                latest_gate = None
        if latest_gate is not None:
            return {
                "mission_id": mission_id,
                "task_id": str(latest_gate.get("task_id") or ""),
                "role": str(latest_gate.get("role") or ""),
                "gate_stage": str(latest_gate.get("gate_stage") or "before_run"),
                "approval_channels": normalize_approval_channels(latest_gate.get("approval_channels")),
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

    async def dispatch_approval_notification_and_emit(self, notification: Dict[str, Any]) -> Dict[str, Any] | None:
        mission_id = str(notification.get("mission_id") or "")
        notification_id = str(notification.get("id") or "")
        if not mission_id or not notification_id:
            return None
        delivery_update = await asyncio.to_thread(self._deliver_approval_notification, dict(notification))
        row = self._update_approval_notification_delivery(mission_id, notification_id, delivery_update)
        if row is None:
            return None
        event = {
            "type": "approval_notification_delivery",
            "message": f"📨 approval notification delivery {row.get('delivery_status')} via {row.get('channel')}",
            "timestamp": row.get("updated_at") or time.time(),
            **row,
        }
        self.decision_log.append(event)
        await self.manager.broadcast_all(event)
        await self.manager.broadcast_to_mission(mission_id, event)
        return row

    def _approval_settings_webhook_token(self, settings: Dict[str, Any]) -> str:
        encrypted = str(settings.get("webhook_token_encrypted") or "")
        if not encrypted:
            return ""
        try:
            return self.decrypt_provider_key(encrypted)
        except ValueError:
            return ""

    def _approval_public_url(self, path: str, mission_id: str = "") -> str:
        base_url = (os.getenv(APPROVAL_PUBLIC_BASE_URL_ENV) or "").strip().rstrip("/")
        if not base_url and mission_id:
            base_url = str(self.get_channel_settings_for_mission(mission_id).get("public_base_url") or "").strip().rstrip("/")
        if not base_url:
            return path
        return f"{base_url}{path}"

    def _approval_webhook_for_channel(self, channel: str, mission_id: str = "") -> str:
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
        settings = self.get_channel_settings_for_mission(mission_id)
        channels = settings.get("channels") if isinstance(settings.get("channels"), dict) else {}
        config = channels.get(channel) if isinstance(channels.get(channel), dict) else {}
        if not config.get("enabled"):
            return ""
        return str(config.get("webhook_url") or "").strip()

    def _approval_webhook_token_for_mission(self, mission_id: str) -> str:
        env_token = os.getenv(APPROVAL_WEBHOOK_TOKEN_ENV, "")
        if env_token:
            return env_token
        return self._approval_settings_webhook_token(self.get_channel_settings_for_mission(mission_id))

    def _approval_target_for_channel(self, mission_id: str, channel: str, explicit_target: str) -> str:
        if explicit_target:
            return explicit_target
        if channel == "admin_queue":
            return "admin_queue"
        settings = self.get_channel_settings_for_mission(mission_id)
        channels = settings.get("channels") if isinstance(settings.get("channels"), dict) else {}
        config = channels.get(channel) if isinstance(channels.get(channel), dict) else {}
        return str(config.get("target") or "").strip()

    def _deliver_approval_notification(self, notification: Dict[str, Any]) -> Dict[str, Any]:
        channel = normalize_approval_channel(notification.get("channel")) or "admin_queue"
        now = time.time()
        if channel == "admin_queue":
            return {
                "delivery_status": "queued",
                "delivery_transport": "internal_queue",
                "delivery_attempted_at": now,
                "updated_at": now,
            }
        payload = approval_notification_payload(notification, public_url=self._approval_public_url)
        mission_id = str(notification.get("mission_id") or "")
        webhook_url = self._approval_webhook_for_channel(channel, mission_id)
        try:
            if channel == "email" and not webhook_url:
                self.send_smtp_approval_email_fn(notification, payload)
                return {
                    "delivery_status": "sent",
                    "delivery_transport": "smtp",
                    "delivery_attempted_at": now,
                    "delivered_at": time.time(),
                    "updated_at": time.time(),
                    "delivery_error": "",
                }
            if webhook_url:
                self.post_json_webhook_fn(webhook_url, payload, self._approval_webhook_token_for_mission(mission_id))
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

    def _post_json_webhook(self, url: str, payload: Dict[str, Any], token: str = "") -> Dict[str, Any]:
        return post_json_webhook(
            url,
            payload,
            token,
            allow_private=self.is_truthy(os.getenv(APPROVAL_ALLOW_PRIVATE_WEBHOOKS_ENV)),
        )

    def _send_smtp_approval_email(self, notification: Dict[str, Any], payload: Dict[str, Any]) -> None:
        host = (os.getenv(SMTP_HOST_ENV) or "").strip()
        port = int(os.getenv(SMTP_PORT_ENV) or ("465" if self.is_truthy(os.getenv(SMTP_USE_SSL_ENV)) else "587"))
        username = (os.getenv(SMTP_USER_ENV) or "").strip()
        password = os.getenv(SMTP_PASSWORD_ENV) or ""
        sender = (os.getenv(SMTP_FROM_ENV) or username or "bremen@localhost").strip()
        send_smtp_approval_email(
            notification,
            payload,
            host=host,
            port=port,
            use_ssl=self.is_truthy(os.getenv(SMTP_USE_SSL_ENV)),
            username=username,
            password=password,
            sender=sender,
            smtp_module=smtplib,
        )

    def _update_approval_notification_delivery(
        self,
        mission_id: str,
        notification_id: str,
        delivery_update: Dict[str, Any],
    ) -> Dict[str, Any] | None:
        for row in self.outbox.get(mission_id, []):
            if str(row.get("id") or "") != notification_id:
                continue
            row.update(delivery_update)
            return dict(row)
        return None
