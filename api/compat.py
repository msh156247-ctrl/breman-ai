from __future__ import annotations

from typing import Any, Dict


LEGACY_MISSION_FIELD_ALIASES = {
    "team_id": "workflow_id",
    "team_label": "workflow_label",
    "team_graph": "workflow_graph",
}


def mission_workflow_compatibility_fields(
    *,
    workflow_id: str | None,
    workflow_label: str | None,
    workflow_graph: Dict[str, Any] | None,
) -> Dict[str, Any]:
    """Expose canonical workflow fields plus deprecated team_* response aliases."""

    return {
        "workflow_id": workflow_id,
        "workflow_label": workflow_label,
        "workflow_graph": workflow_graph,
        "team_id": workflow_id,
        "team_label": workflow_label,
        "team_graph": workflow_graph,
    }


def legacy_api_metadata() -> Dict[str, Any]:
    return {
        "deprecated_fields": LEGACY_MISSION_FIELD_ALIASES,
        "deprecated_routes": {
            "/api/graph/teams": "/api/graph/workflows",
        },
        "policy": "Legacy names remain read/write compatible until a versioned API removes them.",
    }
