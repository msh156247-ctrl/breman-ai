from __future__ import annotations

from collections.abc import Callable, Iterable
from typing import Any, Dict

from fastapi import HTTPException


ALLOWED_TEAM_ROLE_TYPES = {"executor", "supervisor", "channel_supervisor"}
CHANNEL_PUBLISH_ALLOWED_ROLES = {"supervisor", "channel_supervisor"}
TEAM_ROLE_PRIORITY = {"executor": 0, "supervisor": 1, "channel_supervisor": 2}


def resolve_team_member(team: Dict[str, Any] | None, member_id: str) -> Dict[str, Any] | None:
    if team is None:
        return None
    best_row: Dict[str, Any] | None = None
    best_priority = -1
    for row in team.get("members", []):
        if not isinstance(row, dict) or row.get("member_id") != member_id:
            continue
        priority = TEAM_ROLE_PRIORITY.get(str(row.get("role_type", "")), -1)
        if best_row is None or priority > best_priority:
            best_row = row
            best_priority = priority
    return best_row


def can_manage_team(
    identity: Dict[str, str],
    team: Dict[str, Any],
    resolve_member: Callable[[str, str], Dict[str, Any] | None],
) -> bool:
    role = identity.get("role", "viewer")
    if role in {"owner", "admin"}:
        return True
    user_id = identity.get("user_id", "")
    if not user_id:
        return False
    if str(team.get("created_by", "")) == user_id:
        return True
    row = resolve_member(str(team.get("id", "")), user_id)
    if row is None:
        return False
    return str(row.get("role_type", "")) in CHANNEL_PUBLISH_ALLOWED_ROLES


def require_team_manage_permission(
    identity: Dict[str, str],
    team: Dict[str, Any],
    resolve_member: Callable[[str, str], Dict[str, Any] | None],
) -> None:
    if not can_manage_team(identity, team, resolve_member):
        raise HTTPException(status_code=403, detail="team_manage_permission_required")


def can_view_team(
    identity: Dict[str, str],
    team: Dict[str, Any],
    resolve_member: Callable[[str, str], Dict[str, Any] | None],
) -> bool:
    role = identity.get("role", "viewer")
    if role in {"owner", "admin"}:
        return True
    user_id = identity.get("user_id", "")
    if not user_id:
        return False
    if str(team.get("created_by", "")) == user_id:
        return True
    return resolve_member(str(team.get("id", "")), user_id) is not None


def visible_team_ids(
    identity: Dict[str, str],
    teams: Iterable[Dict[str, Any]],
    resolve_member: Callable[[str, str], Dict[str, Any] | None],
) -> set[str]:
    visible: set[str] = set()
    for team in teams:
        team_id = str(team.get("id", ""))
        if team_id and can_view_team(identity, team, resolve_member):
            visible.add(team_id)
    return visible


def can_access_mission_owner(identity: Dict[str, str], owner_id: str | None) -> bool:
    role = identity.get("role", "viewer")
    if role in {"owner", "admin"}:
        return True
    return bool(owner_id and owner_id == identity.get("user_id"))
