from __future__ import annotations

import json
from typing import Any, Dict, List

from fastapi import HTTPException

from core.db import encrypt_provider_key

APPROVAL_CHANNEL_IDS = ("admin_queue", "email", "sms", "kakao")


def _clean_workspace_text(value: Any, max_len: int = 255) -> str:
    return str(value or "").strip()[:max_len]


def _require_json_payload_size(value: Any, *, max_bytes: int, detail_prefix: str) -> None:
    try:
        encoded = json.dumps(value, ensure_ascii=False, allow_nan=False).encode("utf-8")
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail=f"{detail_prefix}_not_json_safe") from exc
    if len(encoded) > max_bytes:
        raise HTTPException(status_code=413, detail=f"{detail_prefix}_too_large")


def _approval_channel_default_settings() -> Dict[str, Any]:
    return {
        "schema_version": 1,
        "public_base_url": "",
        "webhook_token_registered": False,
        "webhook_token_masked": None,
        "channels": {
            "admin_queue": {
                "enabled": True,
                "delivery_mode": "internal_queue",
                "target": "운영 관리자",
                "webhook_url": "",
            },
            "email": {"enabled": False, "delivery_mode": "webhook", "target": "", "webhook_url": ""},
            "sms": {"enabled": False, "delivery_mode": "webhook", "target": "", "webhook_url": ""},
            "kakao": {"enabled": False, "delivery_mode": "webhook", "target": "", "webhook_url": ""},
        },
    }


def _mask_secret(raw: str) -> str:
    value = str(raw or "").strip()
    if not value:
        return ""
    if len(value) <= 8:
        return f"{value[:1]}••••{value[-1:]}"
    return f"{value[:4]}••••{value[-4:]}"


def _normalize_approval_channel_settings(raw: Any, existing: Dict[str, Any] | None = None) -> Dict[str, Any]:
    defaults = _approval_channel_default_settings()
    source = raw if isinstance(raw, dict) else {}
    prior = existing if isinstance(existing, dict) else {}
    raw_channels = source.get("channels") if isinstance(source.get("channels"), dict) else {}
    prior_channels = prior.get("channels") if isinstance(prior.get("channels"), dict) else {}

    channels: Dict[str, Dict[str, Any]] = {}
    for channel_id in APPROVAL_CHANNEL_IDS:
        channel_source = raw_channels.get(channel_id) if isinstance(raw_channels.get(channel_id), dict) else {}
        channel_prior = prior_channels.get(channel_id) if isinstance(prior_channels.get(channel_id), dict) else {}
        channel_default = defaults["channels"][channel_id]
        enabled = channel_source.get("enabled", channel_prior.get("enabled", channel_default["enabled"]))
        channels[channel_id] = {
            "enabled": bool(enabled) if channel_id != "admin_queue" else True,
            "delivery_mode": _clean_workspace_text(
                channel_source.get("delivery_mode", channel_prior.get("delivery_mode", channel_default["delivery_mode"])),
                32,
            )
            or channel_default["delivery_mode"],
            "target": _clean_workspace_text(
                channel_source.get("target", channel_prior.get("target", channel_default["target"])),
                255,
            ),
            "webhook_url": _clean_workspace_text(
                channel_source.get("webhook_url", channel_prior.get("webhook_url", "")),
                2048,
            ),
        }

    raw_token = str(source.get("webhook_token") or "").strip()
    clear_token = bool(source.get("clear_webhook_token"))
    encrypted_token = ""
    masked_token: str | None = None
    if raw_token:
        encrypted_token = encrypt_provider_key(raw_token)
        masked_token = _mask_secret(raw_token)
    elif not clear_token:
        encrypted_token = str(prior.get("webhook_token_encrypted") or source.get("webhook_token_encrypted") or "")
        masked_token = (
            prior.get("webhook_token_masked")
            or source.get("webhook_token_masked")
            if (prior.get("webhook_token_masked") or source.get("webhook_token_masked"))
            else None
        )

    return {
        "schema_version": 1,
        "public_base_url": _clean_workspace_text(
            source.get("public_base_url", prior.get("public_base_url", "")),
            2048,
        ).rstrip("/"),
        "webhook_token_encrypted": encrypted_token,
        "webhook_token_registered": bool(encrypted_token),
        "webhook_token_masked": masked_token,
        "channels": channels,
    }


def _approval_channel_settings_response(settings: Dict[str, Any]) -> Dict[str, Any]:
    row = _normalize_approval_channel_settings(settings)
    return {
        key: value
        for key, value in row.items()
        if key != "webhook_token_encrypted"
    }


def _normalize_workspace_settings_payload(raw: Dict[str, Any]) -> Dict[str, Any]:
    def bounded_int(value: Any, default: int, minimum: int, maximum: int) -> int:
        try:
            parsed = int(value)
        except (TypeError, ValueError):
            parsed = default
        return min(maximum, max(minimum, parsed))

    def normalize_agents(value: Any) -> List[Dict[str, Any]]:
        rows: List[Dict[str, Any]] = []
        seen_ids: set[str] = set()
        for row in value or []:
            if not isinstance(row, dict):
                continue
            agent_id = _clean_workspace_text(row.get("id"), 128)
            if not agent_id or agent_id in seen_ids:
                continue
            rows.append({**row, "id": agent_id})
            seen_ids.add(agent_id)
            if len(rows) >= 250:
                break
        return rows

    folders: List[Dict[str, str]] = []
    seen_folder_ids: set[str] = set()
    for row in raw.get("member_folders") or []:
        if not isinstance(row, dict):
            continue
        folder_id = _clean_workspace_text(row.get("id"), 96)
        name = _clean_workspace_text(row.get("name"), 80)
        if not folder_id or not name or folder_id in seen_folder_ids:
            continue
        folders.append({"id": folder_id, "name": name})
        seen_folder_ids.add(folder_id)
        if len(folders) >= 80:
            break

    agent_folder_ids: Dict[str, str] = {}
    raw_assignments = raw.get("agent_folder_ids") or {}
    if isinstance(raw_assignments, dict):
        for agent_id, folder_id in raw_assignments.items():
            clean_agent_id = _clean_workspace_text(agent_id, 128)
            clean_folder_id = _clean_workspace_text(folder_id, 96)
            if clean_agent_id and clean_folder_id:
                agent_folder_ids[clean_agent_id] = clean_folder_id
            if len(agent_folder_ids) >= 1000:
                break

    hired_agents = normalize_agents(raw.get("hired_agents"))
    library_agents = normalize_agents(raw.get("library_agents"))

    project_units: List[Dict[str, Any]] = []
    seen_unit_ids: set[str] = set()
    for row in raw.get("project_units") or []:
        if not isinstance(row, dict):
            continue
        unit_id = _clean_workspace_text(row.get("id"), 160)
        if not unit_id or unit_id in seen_unit_ids:
            continue
        base_unit_id = _clean_workspace_text(row.get("base_unit_id"), 64)
        project_units.append({**row, "id": unit_id, "base_unit_id": base_unit_id})
        seen_unit_ids.add(unit_id)
        if len(project_units) >= 120:
            break

    nodes: List[Dict[str, Any]] = []
    seen_node_ids: set[str] = set()
    for row in raw.get("nodes") or []:
        if not isinstance(row, dict):
            continue
        node_id = _clean_workspace_text(row.get("id"), 160)
        if not node_id or node_id in seen_node_ids:
            continue
        node_type = _clean_workspace_text(row.get("type"), 64)
        position = row.get("position") if isinstance(row.get("position"), dict) else {}
        data = row.get("data") if isinstance(row.get("data"), dict) else {}
        nodes.append(
            {
                **row,
                "id": node_id,
                "type": node_type or "agentNode",
                "position": {
                    "x": float(position.get("x", 0)) if isinstance(position.get("x", 0), (int, float)) else 0,
                    "y": float(position.get("y", 0)) if isinstance(position.get("y", 0), (int, float)) else 0,
                },
                "data": data,
            }
        )
        seen_node_ids.add(node_id)
        if len(nodes) >= 500:
            break

    edges: List[Dict[str, Any]] = []
    seen_edge_ids: set[str] = set()
    seen_edge_pairs: set[tuple[str, str]] = set()
    for row in raw.get("edges") or []:
        if not isinstance(row, dict):
            continue
        source = _clean_workspace_text(row.get("source"), 160)
        target = _clean_workspace_text(row.get("target"), 160)
        edge_id = _clean_workspace_text(row.get("id"), 200) or f"{source}:{target}"
        pair = (source, target)
        if (
            not source
            or not target
            or source == target
            or source not in seen_node_ids
            or target not in seen_node_ids
            or edge_id in seen_edge_ids
            or pair in seen_edge_pairs
        ):
            continue
        edges.append({**row, "id": edge_id, "source": source, "target": target})
        seen_edge_ids.add(edge_id)
        seen_edge_pairs.add(pair)
        if len(edges) >= 1000:
            break

    node_execution_states: Dict[str, str] = {}
    allowed_node_states = {"idle", "running", "streaming", "waiting_input", "failed", "skipped", "completed"}
    raw_node_states = raw.get("node_execution_states")
    if isinstance(raw_node_states, dict):
        for node_id, state in raw_node_states.items():
            clean_node_id = _clean_workspace_text(node_id, 160)
            clean_state = _clean_workspace_text(state, 32).lower()
            if clean_node_id in seen_node_ids and clean_state in allowed_node_states:
                node_execution_states[clean_node_id] = clean_state

    artifact_versions: List[Dict[str, Any]] = []
    for row in raw.get("artifact_versions") or []:
        if not isinstance(row, dict):
            continue
        artifact_id = _clean_workspace_text(row.get("artifact_id"), 255)
        version = _clean_workspace_text(row.get("version"), 64)
        if artifact_id and version:
            artifact_versions.append({**row, "artifact_id": artifact_id, "version": version})
        if len(artifact_versions) >= 1000:
            break

    loop_regions: List[Dict[str, Any]] = []
    seen_loop_ids: set[str] = set()
    for row in raw.get("loop_regions") or []:
        if not isinstance(row, dict):
            continue
        loop_id = _clean_workspace_text(row.get("id"), 160)
        raw_node_ids = row.get("nodeIds") if isinstance(row.get("nodeIds"), list) else row.get("node_ids")
        loop_node_ids = [
            node_id
            for node_id in (_clean_workspace_text(value, 160) for value in raw_node_ids or [])
            if node_id in seen_node_ids
        ]
        loop_node_ids = list(dict.fromkeys(loop_node_ids))
        start_node_id = _clean_workspace_text(row.get("startNodeId") or row.get("start_node_id"), 160)
        end_node_id = _clean_workspace_text(row.get("endNodeId") or row.get("end_node_id"), 160)
        if (
            not loop_id
            or loop_id in seen_loop_ids
            or len(loop_node_ids) < 2
            or start_node_id not in loop_node_ids
            or end_node_id not in loop_node_ids
        ):
            continue
        loop_regions.append(
            {
                **row,
                "id": loop_id,
                "nodeIds": loop_node_ids,
                "startNodeId": start_node_id,
                "endNodeId": end_node_id,
                "repeatCount": bounded_int(row.get("repeatCount") or row.get("repeat_count"), 1, 1, 50),
            }
        )
        seen_loop_ids.add(loop_id)
        if len(loop_regions) >= 200:
            break

    return {
        "schema_version": 4,
        "client_version": _clean_workspace_text(raw.get("client_version"), 64) or "workspace_settings_v4",
        "hired_agents": hired_agents,
        "library_agents": library_agents,
        "project_units": project_units,
        "member_folders": folders,
        "agent_folder_ids": agent_folder_ids,
        "nodes": nodes,
        "edges": edges,
        "node_execution_states": node_execution_states,
        "artifact_versions": artifact_versions,
        "loop_regions": loop_regions,
        "approval_channel_settings": _normalize_approval_channel_settings(raw.get("approval_channel_settings")),
    }


def _workspace_settings_response_payload(settings: Dict[str, Any]) -> Dict[str, Any]:
    row = _normalize_workspace_settings_payload(settings)
    row["approval_channel_settings"] = _approval_channel_settings_response(row.get("approval_channel_settings", {}))
    if settings.get("updated_at"):
        row["updated_at"] = settings.get("updated_at")
    return row

