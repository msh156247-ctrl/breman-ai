from __future__ import annotations

from collections.abc import Callable
from typing import Any, Dict, Iterable, List


def ledger_row_touches_team(row: Dict[str, Any], team_ids: set[str]) -> bool:
    return (
        str(row.get("source_team_id", "")) in team_ids
        or str(row.get("target_team_id", "")) in team_ids
        or str(row.get("receiver_team_id", "")) in team_ids
        or str(row.get("team_id", "")) in team_ids
    )


def filter_workflow_graph_rows(
    teams: Iterable[Dict[str, Any]],
    channels: Iterable[Dict[str, Any]],
    ledger: Iterable[Dict[str, Any]],
    visible_team_ids: set[str],
) -> tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[Dict[str, Any]]]:
    visible_teams = [team for team in teams if str(team.get("id", "")) in visible_team_ids]
    visible_channels = [
        channel
        for channel in channels
        if str(channel.get("source_team_id", "")) in visible_team_ids
        and str(channel.get("target_team_id", "")) in visible_team_ids
    ]
    visible_ledger = [row for row in ledger if ledger_row_touches_team(row, visible_team_ids)]
    return visible_teams, visible_channels, visible_ledger


def build_workflow_graph_response(
    teams: Iterable[Dict[str, Any]],
    channels: Iterable[Dict[str, Any]],
    ledger: Iterable[Dict[str, Any]],
    *,
    find_active_contract: Callable[[str, str], Dict[str, Any] | None],
) -> Dict[str, Any]:
    channel_rows = list(channels)
    ledger_rows = list(ledger)
    nodes: List[Dict[str, Any]] = []
    for team in teams:
        team_id = str(team.get("id"))
        member_count = len(team.get("members", []))
        out_channels = [channel for channel in channel_rows if channel.get("source_team_id") == team_id]
        in_channels = [channel for channel in channel_rows if channel.get("target_team_id") == team_id]
        earned = sum(
            float(row.get("royalty_cost", 0.0))
            for row in ledger_rows
            if row.get("team_id") == team_id or row.get("source_team_id") == team_id
        )
        nodes.append(
            {
                "id": team_id,
                "name": team.get("name"),
                "domain": team.get("domain"),
                "member_count": member_count,
                "out_channels": len(out_channels),
                "in_channels": len(in_channels),
                "royalty_earned": round(earned, 6),
            }
        )

    edges: List[Dict[str, Any]] = []
    for channel in channel_rows:
        channel_id = str(channel.get("id"))
        src = str(channel.get("source_team_id", ""))
        dst = str(channel.get("target_team_id", ""))
        msg_count = len(channel.get("messages", []))
        edges.append(
            {
                "id": channel_id,
                "source": src,
                "target": dst,
                "topic": channel.get("topic"),
                "message_count": msg_count,
                "contract_id": (find_active_contract(src, dst) or {}).get("id"),
            }
        )

    return {
        "nodes": nodes,
        "edges": edges,
        "workflow_count": len(nodes),
        "connection_count": len(edges),
        "team_count": len(nodes),
        "channel_count": len(edges),
    }
