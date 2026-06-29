from __future__ import annotations

import json
from typing import Any, Dict

from fastapi import HTTPException


def workflow_runtime_providers(graph: Dict[str, Any] | None) -> set[str]:
    if not isinstance(graph, dict):
        return {"openai"}
    providers: set[str] = set()
    raw_nodes = graph.get("nodes")
    for node in raw_nodes if isinstance(raw_nodes, list) else []:
        if not isinstance(node, dict):
            continue
        data = node.get("data") if isinstance(node.get("data"), dict) else {}
        agent_id = str(data.get("agent_id") or "").strip().lower()
        category = str(data.get("category") or "").strip().lower()
        if agent_id in {"router", "hitl", "human_approval"} or "router" in category or "hitl" in category:
            continue
        provider = str(data.get("required_api") or data.get("provider") or "openai").strip().lower()
        providers.add(provider or "openai")
    return providers or {"openai"}


def validate_workflow_graph_shape(graph: Dict[str, Any] | None) -> None:
    if graph is None:
        return
    try:
        encoded_size = len(json.dumps(graph, ensure_ascii=False, allow_nan=False).encode("utf-8"))
    except (TypeError, ValueError) as exc:
        raise HTTPException(status_code=422, detail="workflow_graph_not_serializable") from exc
    if encoded_size > 2_000_000:
        raise HTTPException(status_code=413, detail="workflow_graph_too_large")

    nodes = graph.get("nodes", [])
    edges = graph.get("edges", [])
    loop_regions = graph.get("loop_regions", [])
    if not isinstance(nodes, list) or not isinstance(edges, list) or not isinstance(loop_regions, list):
        raise HTTPException(status_code=422, detail="workflow_graph_invalid_shape")
    if len(nodes) > 500 or len(edges) > 2_000 or len(loop_regions) > 100:
        raise HTTPException(status_code=413, detail="workflow_graph_limits_exceeded")
    if not nodes:
        raise HTTPException(status_code=422, detail="workflow_graph_no_nodes")

    node_ids = [
        str(node.get("id") or "").strip()
        for node in nodes
        if isinstance(node, dict) and str(node.get("id") or "").strip()
    ]
    if len(node_ids) != len(nodes):
        raise HTTPException(status_code=422, detail="workflow_graph_node_id_required")
    if len(set(node_ids)) != len(node_ids):
        raise HTTPException(status_code=422, detail="workflow_graph_duplicate_node_id")

    node_id_set = set(node_ids)
    runtime_edges: list[tuple[str, str]] = []
    seen_edge_pairs: set[tuple[str, str]] = set()
    for edge in edges:
        if not isinstance(edge, dict):
            raise HTTPException(status_code=422, detail="workflow_graph_edge_invalid")
        source = str(edge.get("source") or "").strip()
        target = str(edge.get("target") or "").strip()
        if not source or not target:
            raise HTTPException(status_code=422, detail="workflow_graph_edge_endpoint_required")
        if source not in node_id_set or target not in node_id_set:
            raise HTTPException(status_code=422, detail=f"workflow_graph_edge_node_not_found:{source}->{target}")
        if source == target:
            raise HTTPException(status_code=422, detail=f"workflow_graph_self_edge:{source}")
        pair = (source, target)
        if pair in seen_edge_pairs:
            raise HTTPException(status_code=422, detail=f"workflow_graph_duplicate_edge:{source}->{target}")
        seen_edge_pairs.add(pair)
        runtime_edges.append(pair)

    for node in nodes:
        data = node.get("data") if isinstance(node.get("data"), dict) else {}
        raw_branches = data.get("condition_branches")
        dsl = data.get("condition_dsl")
        if not isinstance(raw_branches, list) and isinstance(dsl, dict):
            checks = dsl.get("checks")
            if isinstance(checks, list):
                branch_check = next(
                    (
                        check
                        for check in checks
                        if isinstance(check, dict)
                        and check.get("kind") == "branches"
                        and isinstance(check.get("branches"), list)
                    ),
                    None,
                )
                raw_branches = branch_check.get("branches") if isinstance(branch_check, dict) else []
        for branch in raw_branches if isinstance(raw_branches, list) else []:
            if not isinstance(branch, dict) or str(branch.get("action") or "node") != "node":
                continue
            source = str(node.get("id") or "").strip()
            target = str(branch.get("targetNodeId") or branch.get("target_node_id") or "").strip()
            if not target or target not in node_id_set:
                raise HTTPException(status_code=422, detail=f"workflow_graph_branch_node_not_found:{source}->{target}")
            if source == target:
                raise HTTPException(status_code=422, detail=f"workflow_graph_self_edge:{source}")
            pair = (source, target)
            if pair not in seen_edge_pairs:
                seen_edge_pairs.add(pair)
                runtime_edges.append(pair)

    adjacency: Dict[str, list[str]] = {node_id: [] for node_id in node_ids}
    indegree: Dict[str, int] = {node_id: 0 for node_id in node_ids}
    for source, target in runtime_edges:
        adjacency[source].append(target)
        indegree[target] += 1
    queue = [node_id for node_id in node_ids if indegree[node_id] == 0]
    visited = 0
    while queue:
        current = queue.pop()
        visited += 1
        for target in adjacency[current]:
            indegree[target] -= 1
            if indegree[target] == 0:
                queue.append(target)
    if visited != len(node_ids):
        raise HTTPException(status_code=422, detail="workflow_graph_cycle_requires_loop_region")

    for region in loop_regions:
        if not isinstance(region, dict):
            raise HTTPException(status_code=422, detail="workflow_graph_loop_region_invalid")
        raw_region_nodes = region.get("nodeIds", region.get("node_ids"))
        if not isinstance(raw_region_nodes, list):
            raise HTTPException(status_code=422, detail="workflow_graph_loop_nodes_required")
        region_nodes = [str(node_id or "").strip() for node_id in raw_region_nodes]
        if len(region_nodes) < 2:
            raise HTTPException(status_code=422, detail="workflow_graph_loop_requires_two_nodes")
        if len(set(region_nodes)) != len(region_nodes):
            raise HTTPException(status_code=422, detail="workflow_graph_loop_duplicate_node")
        missing_region_nodes = [node_id for node_id in region_nodes if node_id not in node_id_set]
        if missing_region_nodes:
            raise HTTPException(
                status_code=422,
                detail=f"workflow_graph_loop_node_not_found:{','.join(missing_region_nodes)}",
            )
