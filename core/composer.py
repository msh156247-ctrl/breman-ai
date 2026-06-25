from __future__ import annotations

import asyncio
import ast
from datetime import datetime, timedelta, timezone
import re
import time
from pathlib import Path
from typing import Any, Awaitable, Callable, Dict, Optional
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .context_router import ContextRouter
from .cost_governor import CostGovernor
from .evaluation_engine import EvaluationEngine
from .models import Mission, MissionStatus, Task, TaskStatus
from .ontology_loader import load_ontology
from .policy_engine import PolicyEngine
from .role_registry import RoleRegistry
from .task_graph import TaskGraphEngine
from .validation_engine import ValidationEngine
from .workflow_compiler import WorkflowCompiler
from .workers import LLMWorker


class ComposerRuntime:
    """브래맨 오케스트레이션 엔진."""

    def __init__(
        self,
        use_mock: bool = True,
        on_event: Optional[Callable[[Dict[str, Any]], None]] = None,
        wait_for_human_gate: Optional[Callable[[Dict[str, Any]], Awaitable[Dict[str, Any] | None]]] = None,
        workflow_graph: Optional[Dict[str, Any]] = None,
        api_key: str | None = None,
    ):
        self.use_mock = use_mock
        self.context_router = ContextRouter()
        self.worker = LLMWorker(use_mock=use_mock, api_key=api_key)
        schema_path = Path(__file__).resolve().parents[1] / "artifact_schemas.yaml"
        policy_path = Path(__file__).resolve().parents[1] / "policy_rules.yaml"
        self.validation_engine = ValidationEngine(schema_path=schema_path)
        self.policy_engine = PolicyEngine(policy_path=policy_path, policy_set="default")
        self.evaluation_engine = EvaluationEngine()
        self.on_event = on_event or self._default_event_handler
        self.wait_for_human_gate = wait_for_human_gate
        self.workflow_graph = workflow_graph if isinstance(workflow_graph, dict) else None
        self._governor: Optional[CostGovernor] = None
        self.workflow_compiler: Optional[WorkflowCompiler] = None
        self.role_registry: Optional[RoleRegistry] = None
        self._load_ontology_runtime()

    def _load_ontology_runtime(self) -> None:
        try:
            ontology_path = Path(__file__).resolve().parents[1] / "ontology.yaml"
            ontology = load_ontology(ontology_path)
            self.role_registry = RoleRegistry(ontology)
            self.workflow_compiler = WorkflowCompiler(ontology, self.role_registry)
        except Exception:
            self.workflow_compiler = None
            self.role_registry = None

    def _default_event_handler(self, event: Dict[str, Any]) -> None:
        print(event.get("message", ""))

    def _emit(self, event_type: str, message: str, **kwargs: Any) -> None:
        event = {"type": event_type, "message": message, "timestamp": time.time(), **kwargs}
        self.on_event(event)

    def plan_mission(self, goal: str, budget: float = 5.0) -> Mission:
        self._emit("planning_started", f"🧠 [COMPOSER] 미션 분석: '{goal}'")
        tasks: Dict[str, Task]
        compiled_from = "fallback"
        routing_preview: Dict[str, Any] | None = None
        if self.workflow_graph and isinstance(self.workflow_graph.get("nodes"), list) and self.workflow_graph.get("nodes"):
            tasks = self._tasks_from_workflow_graph(self.workflow_graph)
            compiled_from = "workflow_graph"
            self._emit(
                "workflow_runtime_prepared",
                f"🧩 [WORKFLOW] Studio graph compiled ({len(tasks)} tasks)",
                planning_source=compiled_from,
                graph_counts={
                    "nodes": len(self.workflow_graph.get("nodes", [])),
                    "edges": len(self.workflow_graph.get("edges", [])),
                    "loop_regions": len(self.workflow_graph.get("loop_regions", [])),
                },
                loop_regions=self.workflow_graph.get("loop_regions", []),
            )
        elif self.workflow_compiler is not None:
            try:
                routing_preview = self.workflow_compiler.preview_routing(goal=goal)
                selected_workflow = str(routing_preview.get("selected_workflow", "webapp_default"))
                self._emit(
                    "routing_selected",
                    f"🧭 [ROUTER] workflow={selected_workflow} selected",
                    selected_workflow=selected_workflow,
                    routing_preview=routing_preview,
                )
                compiled = self.workflow_compiler.compile(goal=goal, workflow_name=selected_workflow)
                tasks = compiled.tasks
                compiled_from = f"ontology:{compiled.workflow_name}"
            except Exception:
                tasks = self._fallback_tasks()
        else:
            tasks = self._fallback_tasks()
        mission = Mission(goal=goal, tasks=tasks, budget=budget)
        self._emit(
            "planning_completed",
            f"📋 [COMPOSER] Task Graph 생성 완료 ({len(tasks)}개 태스크, source={compiled_from})",
            mission_id=mission.id,
            planning_source=compiled_from,
        )
        return mission

    def _tasks_from_workflow_graph(self, graph: Dict[str, Any]) -> Dict[str, Task]:
        raw_nodes = graph.get("nodes", [])
        raw_edges = graph.get("edges", [])
        nodes = [node for node in raw_nodes if isinstance(node, dict) and str(node.get("id") or "").strip()]
        node_id_rows = [str(node.get("id")) for node in nodes]
        if len(node_id_rows) != len(set(node_id_rows)):
            raise ValueError("workflow_graph_duplicate_node_id")
        node_ids = {str(node.get("id")) for node in nodes}
        tasks: Dict[str, Task] = {}

        for index, node in enumerate(nodes):
            node_id = str(node.get("id"))
            data = node.get("data") if isinstance(node.get("data"), dict) else {}
            label = str(data.get("label") or node_id).strip() or node_id
            role = self._workflow_role_from_node(data)
            metadata = {
                **data,
                "workflow_node_type": node.get("type"),
                "workflow_position": node.get("position") if isinstance(node.get("position"), dict) else {},
                "workflow_step_index": index + 1,
            }
            tasks[node_id] = Task(
                id=node_id,
                description=str(data.get("system_prompt") or label),
                role=role,
                metadata=metadata,
            )

        non_dag_edges = []
        virtual_edges = []
        adjacency: Dict[str, list[str]] = {node_id: [] for node_id in node_ids}

        def path_exists(start: str, target: str) -> bool:
            stack = [start]
            visited: set[str] = set()
            while stack:
                current = stack.pop()
                if current == target:
                    return True
                if current in visited:
                    continue
                visited.add(current)
                stack.extend(adjacency.get(current, []))
            return False

        def add_runtime_edge(source: str, target: str, edge: Dict[str, Any], *, virtual: bool = False) -> bool:
            if source not in node_ids or target not in node_ids or source == target:
                return False
            target_task = tasks.get(target)
            if target_task is None:
                return False
            if target in adjacency[source]:
                return True
            if path_exists(target, source):
                non_dag_edges.append(edge)
                return False
            adjacency[source].append(target)
            if source not in target_task.dependencies:
                target_task.dependencies.append(source)
            if virtual:
                virtual_edges.append(edge)
            return True

        for edge in raw_edges if isinstance(raw_edges, list) else []:
            if not isinstance(edge, dict):
                continue
            source = str(edge.get("source") or "")
            target = str(edge.get("target") or "")
            add_runtime_edge(source, target, edge)

        for source, task in tasks.items():
            branches = self._condition_branches_from_definition(task.metadata if isinstance(task.metadata, dict) else {})
            if task.role != "router" or not isinstance(branches, list):
                continue
            for branch in branches:
                if not isinstance(branch, dict) or str(branch.get("action") or "node") != "node":
                    continue
                target = str(branch.get("targetNodeId") or branch.get("target_node_id") or "").strip()
                virtual_edge = {
                    "id": f"branch-{source}-{target}",
                    "source": source,
                    "target": target,
                    "virtual": True,
                    "branch_id": branch.get("id"),
                    "branch_label": branch.get("label"),
                }
                add_runtime_edge(source, target, virtual_edge, virtual=True)

        raw_loop_regions = graph.get("loop_regions", [])
        normalized_loop_regions = [
            self._normalize_loop_region(region, tasks, raw_edges)
            for region in (raw_loop_regions if isinstance(raw_loop_regions, list) else [])
            if isinstance(region, dict)
        ]
        if normalized_loop_regions:
            graph["loop_regions"] = normalized_loop_regions

        if non_dag_edges:
            for task in tasks.values():
                task.metadata.setdefault("workflow_non_dag_edges", non_dag_edges)
        if virtual_edges:
            for task in tasks.values():
                task.metadata.setdefault("workflow_virtual_edges", virtual_edges)
        for task in tasks.values():
            task.metadata.setdefault("workflow_loop_regions", normalized_loop_regions)
        return tasks or self._fallback_tasks()

    def _condition_branches_from_definition(self, definition: Dict[str, Any]) -> list[Dict[str, Any]]:
        branches = definition.get("condition_branches")
        if isinstance(branches, list):
            return [branch for branch in branches if isinstance(branch, dict)]

        dsl = definition.get("condition_dsl")
        if not isinstance(dsl, dict) or dsl.get("engine") != "condition_dsl_v1":
            return []
        checks = dsl.get("checks")
        if not isinstance(checks, list):
            return []
        for check in checks:
            if not isinstance(check, dict) or check.get("kind") != "branches":
                continue
            dsl_branches = check.get("branches")
            if isinstance(dsl_branches, list):
                return [branch for branch in dsl_branches if isinstance(branch, dict)]
        return []

    def _workflow_role_from_node(self, data: Dict[str, Any]) -> str:
        agent_id = str(data.get("agent_id") or "").lower()
        category = str(data.get("category") or "").lower()
        label = str(data.get("label") or "").lower()
        if agent_id == "router" or "router" in category or "조건" in label:
            return "router"
        if agent_id in {"hitl", "human_approval"} or "hitl" in category or "approval" in label:
            return "human_approval"
        if "검토" in category or "qa" in category:
            return "qa"
        if "개발" in category or "backend" in category or "development" in category:
            return "backend"
        if "기획" in category or "architect" in category:
            return "architect"
        if "frontend" in category:
            return "frontend"
        if "글쓰기" in category or "writing" in category or "content" in category or "copy" in category:
            return "writer"
        if "번역" in category or "translation" in category or "translator" in category:
            return "translator"
        if "데이터" in category or "data" in category or "analysis" in category:
            return "data"
        if "이미지" in category or "image" in category or "design" in category:
            return "image"
        if "review" in label or "리뷰" in label:
            return "qa"
        if "code" in label or "코드" in label:
            return "backend"
        if "plan" in label:
            return "architect"
        if "copy" in label or "카피" in label or "글" in label:
            return "writer"
        if "data" in label or "데이터" in label or "분석" in label:
            return "data"
        if "image" in label or "이미지" in label or "디자인" in label:
            return "image"
        if "translate" in label or "번역" in label:
            return "translator"
        return "agent"

    def _fallback_tasks(self) -> Dict[str, Task]:
        return {
            "t1_arch": Task(id="t1_arch", description="시스템 아키텍처 설계 및 기술 스택 결정", role="architect"),
            "t2_backend": Task(
                id="t2_backend",
                description="FastAPI 백엔드 API 및 인증 시스템 구현",
                role="backend",
                dependencies=["t1_arch"],
            ),
            "t3_frontend": Task(
                id="t3_frontend",
                description="Next.js 프론트엔드 UI 및 API 연동 구현",
                role="frontend",
                dependencies=["t1_arch"],
            ),
            "t4_qa": Task(
                id="t4_qa",
                description="통합 테스트 시나리오 및 QA 계획 수립",
                role="qa",
                dependencies=["t2_backend", "t3_frontend"],
            ),
        }

    async def execute_mission(self, mission: Mission) -> bool:
        mission_policy = self.policy_engine.check_mission_start(
            budget=mission.budget,
            use_mock=self.use_mock,
            api_key_available=self.worker.has_api_key,
        )
        self._emit(
            "policy_check",
            f"🛡️ [POLICY] mission_start allowed={mission_policy.allowed}",
            mission_id=mission.id,
            scope="mission_start",
            allowed=mission_policy.allowed,
            reasons=mission_policy.reasons,
            warnings=mission_policy.warnings,
            details=mission_policy.details,
        )
        if not mission_policy.allowed:
            mission.status = MissionStatus.FAILED
            self._emit(
                "mission_failed",
                f"💥 [FAILED] 정책 위반으로 미션 차단: {mission_policy.reasons}",
                mission_id=mission.id,
                success=False,
                policy_reasons=mission_policy.reasons,
            )
            return False

        mission.status = MissionStatus.RUNNING
        graph = TaskGraphEngine(mission.tasks)
        governor = CostGovernor(budget=mission.budget)
        self._governor = governor

        self._emit("mission_started", f"🚀 [ENGINE] 미션 실행 시작 (ID: {mission.id})", mission_id=mission.id)
        while not graph.is_completed() and not graph.is_failed():
            executable = graph.get_executable_tasks()
            if not executable:
                self._emit("execution_blocked", "⚠️ [ENGINE] 실행 가능한 태스크 없음", mission_id=mission.id)
                break

            self._emit(
                "parallel_execution",
                f"⚡ [ENGINE] 병렬 실행: {[t.id for t in executable]}",
                mission_id=mission.id,
            )
            await asyncio.gather(*[self._execute_task(task, mission, graph, governor) for task in executable])

        if not graph.is_failed():
            await self._process_loop_regions(mission, graph, governor)

        success = graph.is_completed() and not graph.is_failed()
        mission.status = MissionStatus.COMPLETED if success else MissionStatus.FAILED
        cost_status = governor.status()
        self._emit(
            "mission_completed" if success else "mission_failed",
            f"{'🎉 [SUCCESS]' if success else '💥 [FAILED]'} 미션 {'완료' if success else '실패'}! 비용: ${cost_status['spent']:.4f} / ${cost_status['budget']:.2f}",
            mission_id=mission.id,
            success=success,
            cost=cost_status,
        )
        return success

    def _workflow_loop_regions(self) -> list[Dict[str, Any]]:
        if not self.workflow_graph or not isinstance(self.workflow_graph.get("loop_regions"), list):
            return []
        return [region for region in self.workflow_graph.get("loop_regions", []) if isinstance(region, dict)]

    def _normalize_loop_region(
        self,
        region: Dict[str, Any],
        tasks: Dict[str, Task],
        raw_edges: Any,
    ) -> Dict[str, Any]:
        raw_node_ids = region.get("nodeIds")
        if raw_node_ids is None:
            raw_node_ids = region.get("node_ids")
        if not isinstance(raw_node_ids, list):
            raw_node_ids = []

        seen: set[str] = set()
        node_ids: list[str] = []
        for raw_id in raw_node_ids:
            node_id = str(raw_id or "").strip()
            if node_id and node_id in tasks and node_id not in seen:
                seen.add(node_id)
                node_ids.append(node_id)

        order = {
            task_id: int(task.metadata.get("workflow_step_index", index + 1)) if isinstance(task.metadata, dict) else index + 1
            for index, (task_id, task) in enumerate(tasks.items())
        }
        node_ids.sort(key=lambda task_id: order.get(task_id, 0))

        warnings: list[str] = []
        if not node_ids:
            return {
                **region,
                "semantics_version": "loop_region_v1",
                "valid": False,
                "nodeIds": [],
                "node_ids": [],
                "semantic_warnings": ["loop_region_has_no_valid_nodes"],
            }

        def valid_region_node(value: Any, fallback: str) -> str:
            node_id = str(value or "").strip()
            if node_id in node_ids:
                return node_id
            if node_id:
                warnings.append(f"invalid_region_node:{node_id}")
            return fallback

        start_node_id = valid_region_node(region.get("startNodeId", region.get("start_node_id")), node_ids[0])
        end_node_id = valid_region_node(region.get("endNodeId", region.get("end_node_id")), node_ids[-1])
        exit_condition_node_id = valid_region_node(
            region.get("exitConditionNodeId", region.get("exit_condition_node_id")),
            end_node_id,
        )

        finish_sentinels = {"__finish__", "__end__", "finish", "end", ""}
        requested_exit_node_id = str(region.get("exitNodeId", region.get("exit_node_id", "__finish__")) or "").strip()
        if requested_exit_node_id.lower() in finish_sentinels:
            exit_node_id = "__finish__"
            exit_action = "finish"
        elif requested_exit_node_id in tasks and requested_exit_node_id not in node_ids:
            exit_node_id = requested_exit_node_id
            exit_action = "goto_node"
        else:
            exit_node_id = "__finish__"
            exit_action = "finish"
            warnings.append(f"invalid_exit_node:{requested_exit_node_id or '__empty__'}")

        max_iterations = self._loop_repeat_count(region)
        edge_rows = [edge for edge in raw_edges if isinstance(edge, dict)] if isinstance(raw_edges, list) else []
        internal_edge_ids: list[str] = []
        incoming_edge_ids: list[str] = []
        outgoing_edge_ids: list[str] = []
        node_set = set(node_ids)
        for edge in edge_rows:
            edge_id = str(edge.get("id") or f"{edge.get('source', '')}->{edge.get('target', '')}")
            source = str(edge.get("source") or "")
            target = str(edge.get("target") or "")
            if source in node_set and target in node_set:
                internal_edge_ids.append(edge_id)
            elif source not in node_set and target in node_set:
                incoming_edge_ids.append(edge_id)
            elif source in node_set and target not in node_set:
                outgoing_edge_ids.append(edge_id)

        execution_semantics = {
            "version": "loop_region_v1",
            "first_pass": "normal_dag_execution",
            "repeat_pass": "rerun_region_tasks_in_step_order",
            "exit_check": "after_exit_condition_node_each_iteration",
            "condition_satisfied": exit_action,
            "condition_not_satisfied": "repeat_from_start_until_max_iterations",
            "repeat_start_node_id": start_node_id,
            "repeat_end_node_id": end_node_id,
            "exit_condition_node_id": exit_condition_node_id,
            "exit_node_id": exit_node_id,
            "max_iterations": max_iterations,
        }

        return {
            **region,
            "semantics_version": "loop_region_v1",
            "valid": True,
            "nodeIds": node_ids,
            "node_ids": node_ids,
            "entryNodeId": start_node_id,
            "entry_node_id": start_node_id,
            "startNodeId": start_node_id,
            "start_node_id": start_node_id,
            "endNodeId": end_node_id,
            "end_node_id": end_node_id,
            "repeatStartNodeId": start_node_id,
            "repeat_start_node_id": start_node_id,
            "repeatEndNodeId": end_node_id,
            "repeat_end_node_id": end_node_id,
            "exitConditionNodeId": exit_condition_node_id,
            "exit_condition_node_id": exit_condition_node_id,
            "exitNodeId": exit_node_id,
            "exit_node_id": exit_node_id,
            "exit_action": exit_action,
            "repeatCount": max_iterations,
            "repeat_count": max_iterations,
            "maxIterations": max_iterations,
            "max_iterations": max_iterations,
            "internal_edge_ids": internal_edge_ids,
            "incoming_edge_ids": incoming_edge_ids,
            "outgoing_edge_ids": outgoing_edge_ids,
            "runtime_semantics": execution_semantics,
            "semantic_warnings": warnings,
        }

    def _loop_region_task_ids(self, region: Dict[str, Any], mission: Mission) -> list[str]:
        raw_ids = region.get("nodeIds")
        if raw_ids is None:
            raw_ids = region.get("node_ids")
        if not isinstance(raw_ids, list):
            raw_ids = []
        task_ids: list[str] = []
        for raw_id in raw_ids:
            task_id = str(raw_id or "").strip()
            if task_id and task_id in mission.tasks and task_id not in task_ids:
                task_ids.append(task_id)
        return task_ids

    def _loop_repeat_count(self, region: Dict[str, Any]) -> int:
        raw_count = region.get("repeatCount", region.get("repeat_count", 1))
        try:
            count = int(raw_count)
        except (TypeError, ValueError):
            count = 1
        return max(1, min(count, 50))

    def _loop_exit_condition(self, region: Dict[str, Any]) -> str:
        return str(region.get("exitCondition") or region.get("exit_condition") or "").strip()

    def _loop_exit_condition_definition(self, region: Dict[str, Any]) -> Dict[str, Any]:
        expression = self._loop_exit_condition(region)
        mode = str(region.get("exitConditionMode") or region.get("exit_condition_mode") or "").strip()
        explicit_mode = bool(mode)
        data_path = str(region.get("exitConditionDataPath") or region.get("exit_condition_data_path") or "").strip()
        time_rule = str(region.get("exitConditionTimeRule") or region.get("exit_condition_time_rule") or "").strip()
        if not mode:
            if data_path and time_rule:
                mode = "composite"
            elif data_path:
                mode = "data"
            elif time_rule:
                mode = "time"
            elif expression:
                mode = "condition"
            else:
                mode = "always"
        return {
            "condition_mode": mode,
            "condition_expression": expression,
            "condition_time_rule": time_rule,
            "condition_data_path": data_path,
            "condition_operator": region.get("exitConditionOperator", region.get("exit_condition_operator", "==")),
            "condition_value": region.get("exitConditionValue", region.get("exit_condition_value")),
            "_explicit_mode": explicit_mode,
        }

    def _loop_exit_task(self, region: Dict[str, Any], mission: Mission) -> Task | None:
        task_ids = self._loop_region_task_ids(region, mission)
        candidates = [
            region.get("exitConditionNodeId"),
            region.get("exit_condition_node_id"),
            region.get("endNodeId"),
            region.get("end_node_id"),
            task_ids[-1] if task_ids else None,
        ]
        for candidate in candidates:
            task_id = str(candidate or "").strip()
            if task_id in mission.tasks:
                return mission.tasks[task_id]
        return None

    def _loop_exit_result(
        self,
        region: Dict[str, Any],
        mission: Mission,
        graph: TaskGraphEngine,
        iteration: int,
        max_iterations: int,
    ) -> Dict[str, Any]:
        condition_definition = self._loop_exit_condition_definition(region)
        expression = str(condition_definition.get("condition_expression") or "").strip()
        exit_task = self._loop_exit_task(region, mission)
        artifacts = exit_task.artifacts if exit_task is not None and isinstance(exit_task.artifacts, dict) else {}
        context = (
            self._build_condition_context(exit_task, mission, graph.get_dependency_artifacts(exit_task))
            if exit_task is not None
            else {
                "mission": {
                    "goal": mission.goal,
                    "budget": mission.budget,
                    "total_cost": mission.total_cost,
                    "status": mission.status.value,
                },
                "task": {},
                "deps": {},
                "payload": {},
                "previous": {},
                "result": {},
                "budget": mission.budget,
                "spent": mission.total_cost,
                "true": True,
                "false": False,
                "null": None,
            }
        )
        context["result"] = artifacts
        context["payload"] = artifacts
        context["loop"] = {
            "id": region.get("id"),
            "name": region.get("name"),
            "iteration": iteration,
            "max_iterations": max_iterations,
        }
        if isinstance(context.get("previous"), dict):
            context["previous"] = {**context["previous"], **artifacts}

        if not expression:
            has_structured_condition = any(
                str(condition_definition.get(key) or "").strip()
                for key in ("condition_time_rule", "condition_data_path")
            ) or bool(condition_definition.get("_explicit_mode"))
            if has_structured_condition:
                evaluation = self._evaluate_condition_definition(condition_definition, context, source="loop_exit")
                result = {
                    "satisfied": bool(evaluation.get("allowed")),
                    "expression": expression,
                    "exit_task_id": exit_task.id if exit_task else None,
                    "reason": "condition_satisfied" if evaluation.get("allowed") else "condition_not_satisfied",
                    "condition": evaluation,
                }
                self._emit(
                    "workflow_loop_condition_evaluated",
                    f"🔁 [LOOP] {region.get('name') or region.get('id') or 'loop'} 종료 조건 평가: {result['satisfied']}",
                    mission_id=mission.id,
                    loop_region_id=region.get("id"),
                    loop_region_name=region.get("name"),
                    semantics_version=region.get("semantics_version"),
                    iteration=iteration,
                    max_iterations=max_iterations,
                    exit_condition_node_id=region.get("exit_condition_node_id") or region.get("exitConditionNodeId"),
                    exit_node_id=region.get("exit_node_id") or region.get("exitNodeId"),
                    exit_action=region.get("exit_action"),
                    **result,
                )
                return result
            return {
                "satisfied": False,
                "expression": "",
                "exit_task_id": exit_task.id if exit_task else None,
                "reason": "no_exit_condition",
            }
        evaluation = self._evaluate_condition_definition(condition_definition, context, source="loop_exit")
        result = {
            "satisfied": bool(evaluation.get("allowed")),
            "expression": expression,
            "exit_task_id": exit_task.id if exit_task else None,
            "reason": "condition_satisfied" if evaluation.get("allowed") else "condition_not_satisfied",
            "condition": evaluation,
        }
        if evaluation.get("checks", {}).get("error"):
            result["reason"] = "condition_error"
            result["error"] = evaluation["checks"]["error"]
        self._emit(
            "workflow_loop_condition_evaluated",
            f"🔁 [LOOP] {region.get('name') or region.get('id') or 'loop'} 종료 조건 평가: {result['satisfied']}",
            mission_id=mission.id,
            loop_region_id=region.get("id"),
            loop_region_name=region.get("name"),
            semantics_version=region.get("semantics_version"),
            iteration=iteration,
            max_iterations=max_iterations,
            exit_condition_node_id=region.get("exit_condition_node_id") or region.get("exitConditionNodeId"),
            exit_node_id=region.get("exit_node_id") or region.get("exitNodeId"),
            exit_action=region.get("exit_action"),
            **result,
        )
        return result

    def _archive_loop_iteration(self, task: Task, region: Dict[str, Any], iteration: int) -> None:
        history = task.metadata.setdefault("workflow_loop_history", [])
        if not isinstance(history, list):
            history = []
            task.metadata["workflow_loop_history"] = history
        history.append(
            {
                "loop_region_id": region.get("id"),
                "loop_region_name": region.get("name"),
                "iteration": iteration,
                "status": task.status.value,
                "artifacts": task.artifacts,
                "cost": task.cost,
                "retry_count": task.retry_count,
            }
        )

    def _record_loop_summary(
        self,
        tasks: list[Task],
        region: Dict[str, Any],
        iterations: int,
        reason: str,
        exit_result: Dict[str, Any],
    ) -> None:
        summary = {
            "loop_region_id": region.get("id"),
            "loop_region_name": region.get("name"),
            "semantics_version": region.get("semantics_version"),
            "node_ids": region.get("node_ids") or region.get("nodeIds") or [],
            "repeat_start_node_id": region.get("repeat_start_node_id") or region.get("startNodeId"),
            "repeat_end_node_id": region.get("repeat_end_node_id") or region.get("endNodeId"),
            "exit_condition_node_id": region.get("exit_condition_node_id") or region.get("exitConditionNodeId"),
            "exit_node_id": region.get("exit_node_id") or region.get("exitNodeId"),
            "exit_action": region.get("exit_action"),
            "iterations": iterations,
            "reason": reason,
            "exit_result": exit_result,
            "runtime_semantics": region.get("runtime_semantics"),
        }
        for task in tasks:
            summaries = task.metadata.setdefault("workflow_loop_summaries", [])
            if not isinstance(summaries, list):
                summaries = []
                task.metadata["workflow_loop_summaries"] = summaries
            summaries.append(summary)

    async def _process_loop_regions(
        self,
        mission: Mission,
        graph: TaskGraphEngine,
        governor: CostGovernor,
    ) -> None:
        for region in self._workflow_loop_regions():
            task_ids = self._loop_region_task_ids(region, mission)
            region_tasks = sorted(
                [mission.tasks[task_id] for task_id in task_ids],
                key=lambda task: int(task.metadata.get("workflow_step_index", 0)) if isinstance(task.metadata, dict) else 0,
            )
            region_id = str(region.get("id") or "loop")
            max_iterations = self._loop_repeat_count(region)
            if not region_tasks:
                self._emit(
                    "workflow_loop_skipped",
                    f"🔁 [LOOP] {region_id} 반복 영역에 실행할 노드가 없습니다.",
                    mission_id=mission.id,
                    loop_region_id=region.get("id"),
                    loop_region=region,
                    semantics_version=region.get("semantics_version"),
                    semantic_warnings=region.get("semantic_warnings", []),
                )
                continue

            self._emit(
                "workflow_loop_started",
                f"🔁 [LOOP] {region.get('name') or region_id} 반복 영역 평가 시작",
                mission_id=mission.id,
                loop_region_id=region.get("id"),
                loop_region_name=region.get("name"),
                semantics_version=region.get("semantics_version"),
                task_ids=task_ids,
                node_ids=region.get("node_ids") or task_ids,
                repeat_start_node_id=region.get("repeat_start_node_id") or region.get("startNodeId"),
                repeat_end_node_id=region.get("repeat_end_node_id") or region.get("endNodeId"),
                exit_condition_node_id=region.get("exit_condition_node_id") or region.get("exitConditionNodeId"),
                exit_node_id=region.get("exit_node_id") or region.get("exitNodeId"),
                exit_action=region.get("exit_action"),
                iteration=1,
                max_iterations=max_iterations,
                runtime_semantics=region.get("runtime_semantics"),
                semantic_warnings=region.get("semantic_warnings", []),
            )
            exit_result = self._loop_exit_result(region, mission, graph, iteration=1, max_iterations=max_iterations)
            iterations = 1
            reason = "exit_condition_satisfied" if exit_result.get("satisfied") else "max_iterations_reached"

            if not exit_result.get("satisfied"):
                for iteration in range(2, max_iterations + 1):
                    iterations = iteration
                    self._emit(
                        "workflow_loop_iteration_started",
                        f"🔁 [LOOP] {region.get('name') or region_id} {iteration}/{max_iterations}회차 실행",
                        mission_id=mission.id,
                        loop_region_id=region.get("id"),
                        loop_region_name=region.get("name"),
                        semantics_version=region.get("semantics_version"),
                        iteration=iteration,
                        max_iterations=max_iterations,
                        task_ids=task_ids,
                        repeat_start_node_id=region.get("repeat_start_node_id") or region.get("startNodeId"),
                        repeat_end_node_id=region.get("repeat_end_node_id") or region.get("endNodeId"),
                    )
                    for task in region_tasks:
                        self._archive_loop_iteration(task, region, iteration - 1)
                        task.status = TaskStatus.PENDING
                        task.retry_count = 0
                        task.error_message = None
                        await self._execute_task(task, mission, graph, governor)
                        if task.status == TaskStatus.FAILED:
                            reason = "task_failed"
                            break
                    self._emit(
                        "workflow_loop_iteration_completed",
                        f"🔁 [LOOP] {region.get('name') or region_id} {iteration}회차 완료",
                        mission_id=mission.id,
                        loop_region_id=region.get("id"),
                        loop_region_name=region.get("name"),
                        semantics_version=region.get("semantics_version"),
                        iteration=iteration,
                        max_iterations=max_iterations,
                        task_statuses={task.id: task.status.value for task in region_tasks},
                    )
                    if graph.is_failed():
                        break
                    exit_result = self._loop_exit_result(region, mission, graph, iteration=iteration, max_iterations=max_iterations)
                    if exit_result.get("satisfied"):
                        reason = "exit_condition_satisfied"
                        break

            self._record_loop_summary(region_tasks, region, iterations, reason, exit_result)
            self._emit(
                "workflow_loop_exited",
                f"🔁 [LOOP] {region.get('name') or region_id} 종료: {reason}",
                mission_id=mission.id,
                loop_region_id=region.get("id"),
                loop_region_name=region.get("name"),
                semantics_version=region.get("semantics_version"),
                node_ids=region.get("node_ids") or task_ids,
                repeat_start_node_id=region.get("repeat_start_node_id") or region.get("startNodeId"),
                repeat_end_node_id=region.get("repeat_end_node_id") or region.get("endNodeId"),
                exit_condition_node_id=region.get("exit_condition_node_id") or region.get("exitConditionNodeId"),
                exit_node_id=region.get("exit_node_id") or region.get("exitNodeId"),
                exit_action=region.get("exit_action"),
                iterations=iterations,
                max_iterations=max_iterations,
                reason=reason,
                exit_result=exit_result,
                runtime_semantics=region.get("runtime_semantics"),
                task_statuses={task.id: task.status.value for task in region_tasks},
            )
            if graph.is_failed():
                break

    def _build_condition_context(
        self,
        task: Task,
        mission: Mission,
        dependency_artifacts: Dict[str, Any],
        extra_context: Dict[str, Any] | None = None,
    ) -> Dict[str, Any]:
        merged_result: Dict[str, Any] = {}
        for artifacts in dependency_artifacts.values():
            if isinstance(artifacts, dict):
                merged_result.update(artifacts)
        now = datetime.now()
        context = {
            "mission": {
                "goal": mission.goal,
                "budget": mission.budget,
                "total_cost": mission.total_cost,
                "status": mission.status.value,
            },
            "task": {
                "id": task.id,
                "role": task.role,
                "retry_count": task.retry_count,
                "status": task.status.value,
            },
            "tasks": {
                task_id: {
                    "id": item.id,
                    "role": item.role,
                    "status": item.status.value,
                    "artifacts": item.artifacts,
                    "confidence": item.confidence,
                    "cost": item.cost,
                    "retry_count": item.retry_count,
                }
                for task_id, item in mission.tasks.items()
            },
            "deps": dependency_artifacts,
            "payload": dependency_artifacts,
            "previous": merged_result,
            "result": merged_result,
            "budget": mission.budget,
            "spent": mission.total_cost,
            "now": {
                "iso": now.isoformat(),
                "hour": now.hour,
                "minute": now.minute,
                "weekday": now.weekday(),
                "is_weekend": now.weekday() >= 5,
                "epoch": time.time(),
            },
            "true": True,
            "false": False,
            "null": None,
        }
        if isinstance(extra_context, dict):
            context.update(extra_context)
        return context

    def _condition_mode(self, definition: Dict[str, Any]) -> str:
        expression = str(definition.get("condition_expression") or definition.get("expression") or "").strip()
        mode = str(definition.get("condition_mode") or definition.get("mode") or "").strip()
        if expression.lower() == "else":
            return "else"
        if mode:
            return mode
        return "condition" if expression else "always"

    def _evaluate_condition_dsl_contract(
        self,
        dsl: Dict[str, Any],
        context: Dict[str, Any],
        *,
        source: str,
        fallback: Dict[str, Any],
    ) -> Dict[str, Any]:
        mode = str(dsl.get("mode") or self._condition_mode(fallback) or "always").strip() or "always"
        checks: Dict[str, Any] = {
            "mode": mode,
            "source": source,
            "engine": "condition_dsl_v1",
            "contract": "condition_dsl",
            "check_results": [],
        }
        raw_checks = dsl.get("checks")
        check_rows = raw_checks if isinstance(raw_checks, list) else []

        try:
            if mode == "always" and not check_rows:
                return {"allowed": True, "mode": mode, "source": source, "checks": checks}
            if mode in {"never", "blocked"}:
                return {"allowed": False, "mode": mode, "source": source, "checks": checks}
            if mode == "else":
                checks["expression"] = "else"
                return {"allowed": True, "mode": mode, "source": source, "checks": checks}

            allowed = True
            evaluated_any_runnable_check = False
            for index, raw_check in enumerate(check_rows):
                if not isinstance(raw_check, dict):
                    continue
                kind = str(raw_check.get("kind") or "").strip()
                row: Dict[str, Any] = {"index": index, "kind": kind}

                if kind == "always":
                    row["allowed"] = True
                elif kind == "time":
                    time_rule = str(raw_check.get("rule") or raw_check.get("condition_time_rule") or "").strip()
                    time_ok = self._time_rule_matches(
                        time_rule,
                        str(raw_check.get("timezone") or raw_check.get("condition_timezone") or ""),
                    )
                    row.update({"rule": time_rule, "allowed": time_ok})
                    checks["time_rule"] = time_rule
                    checks["time_ok"] = time_ok
                    evaluated_any_runnable_check = True
                    allowed = allowed and time_ok
                elif kind == "data":
                    path = str(raw_check.get("path") or raw_check.get("condition_data_path") or "").strip()
                    operator_name = str(raw_check.get("operator") or raw_check.get("condition_operator") or "==").strip()
                    expected = raw_check.get("value", raw_check.get("condition_value"))
                    actual = self._resolve_context_path(context, path) if path else None
                    data_ok = self._compare_values(actual, expected, operator_name)
                    row.update(
                        {
                            "path": path,
                            "operator": operator_name,
                            "expected": expected,
                            "actual": actual,
                            "allowed": data_ok,
                        }
                    )
                    checks.update(
                        {
                            "data_path": path,
                            "operator": operator_name,
                            "expected": expected,
                            "actual": actual,
                            "data_ok": data_ok,
                        }
                    )
                    evaluated_any_runnable_check = True
                    allowed = allowed and data_ok
                elif kind == "expression":
                    expression = str(raw_check.get("expression") or raw_check.get("condition_expression") or "").strip()
                    expression_ok = bool(self._safe_eval_expression(expression, context)) if expression else False
                    row.update({"expression": expression, "allowed": expression_ok})
                    checks["expression"] = expression
                    checks["expression_ok"] = expression_ok
                    evaluated_any_runnable_check = True
                    allowed = allowed and expression_ok
                elif kind == "branches":
                    branches = raw_check.get("branches")
                    row.update(
                        {
                            "branch_count": len(branches) if isinstance(branches, list) else 0,
                            "allowed": True,
                        }
                    )
                else:
                    row.update({"allowed": False, "error": f"unsupported_check_kind:{kind or '__empty__'}"})
                    checks["error"] = row["error"]
                    evaluated_any_runnable_check = True
                    allowed = False

                checks["check_results"].append(row)
                if not allowed:
                    break

            if not check_rows and mode == "condition":
                checks["error"] = "missing_condition_dsl_checks"
                return {"allowed": False, "mode": mode, "source": source, "checks": checks}
            if check_rows and not evaluated_any_runnable_check:
                allowed = True
            return {"allowed": allowed, "mode": mode, "source": source, "checks": checks}
        except Exception as exc:
            checks["error"] = str(exc)
            return {"allowed": False, "mode": mode, "source": source, "checks": checks}

    def _evaluate_condition_definition(
        self,
        definition: Dict[str, Any],
        context: Dict[str, Any],
        *,
        source: str,
    ) -> Dict[str, Any]:
        dsl = definition.get("condition_dsl")
        if isinstance(dsl, dict) and dsl.get("engine") == "condition_dsl_v1":
            return self._evaluate_condition_dsl_contract(dsl, context, source=source, fallback=definition)

        mode = self._condition_mode(definition)
        checks: Dict[str, Any] = {"mode": mode, "source": source, "engine": "condition_dsl_v1"}

        try:
            if mode == "always":
                return {"allowed": True, "mode": mode, "source": source, "checks": checks}
            if mode in {"never", "blocked"}:
                return {"allowed": False, "mode": mode, "source": source, "checks": checks}
            if mode == "else":
                checks["expression"] = "else"
                return {"allowed": True, "mode": mode, "source": source, "checks": checks}

            if mode in {"time", "composite"}:
                time_rule = str(definition.get("condition_time_rule") or definition.get("time_rule") or "").strip()
                time_ok = self._time_rule_matches(
                    time_rule,
                    str(definition.get("condition_timezone") or definition.get("timezone") or ""),
                )
                checks["time_rule"] = time_rule
                checks["time_ok"] = time_ok
                if mode == "time":
                    return {"allowed": time_ok, "mode": mode, "source": source, "checks": checks}
                if not time_ok:
                    return {"allowed": False, "mode": mode, "source": source, "checks": checks}

            if mode in {"data", "composite"}:
                path = str(definition.get("condition_data_path") or definition.get("data_path") or "").strip()
                operator_name = str(definition.get("condition_operator") or definition.get("operator") or "==").strip()
                expected = definition.get("condition_value", definition.get("value"))
                actual = self._resolve_context_path(context, path) if path else None
                data_ok = self._compare_values(actual, expected, operator_name)
                checks.update(
                    {
                        "data_path": path,
                        "operator": operator_name,
                        "expected": expected,
                        "actual": actual,
                        "data_ok": data_ok,
                    }
                )
                if mode == "data":
                    return {"allowed": data_ok, "mode": mode, "source": source, "checks": checks}
                if not data_ok:
                    return {"allowed": False, "mode": mode, "source": source, "checks": checks}

            expression = str(definition.get("condition_expression") or definition.get("expression") or "").strip()
            if expression:
                expression_ok = bool(self._safe_eval_expression(expression, context))
                checks["expression"] = expression
                checks["expression_ok"] = expression_ok
                return {"allowed": expression_ok, "mode": mode, "source": source, "checks": checks}
            if mode == "condition":
                checks["error"] = "missing_condition_expression"
                return {"allowed": False, "mode": mode, "source": source, "checks": checks}
            return {"allowed": True, "mode": mode, "source": source, "checks": checks}
        except Exception as exc:
            checks["error"] = str(exc)
            return {"allowed": False, "mode": mode, "source": source, "checks": checks}

    def _condition_allows_task(
        self,
        task: Task,
        mission: Mission,
        dependency_artifacts: Dict[str, Any],
    ) -> Dict[str, Any]:
        metadata = task.metadata if isinstance(task.metadata, dict) else {}
        context = self._build_condition_context(task, mission, dependency_artifacts)
        return self._evaluate_condition_definition(metadata, context, source="task")

    def _time_rule_matches(self, rule: str, timezone_name: str = "") -> bool:
        if not rule:
            return True
        lowered = rule.lower()
        if lowered in {"false", "never", "blocked"} or "불가" in rule:
            return False
        try:
            tz = ZoneInfo(timezone_name) if timezone_name else None
        except ZoneInfoNotFoundError:
            fixed_offsets = {
                "Asia/Seoul": timezone(timedelta(hours=9)),
                "UTC": timezone.utc,
            }
            tz = fixed_offsets.get(timezone_name)
            if tz is None:
                return False
        now = datetime.now(tz) if tz is not None else datetime.now()
        if ("weekday" in lowered or "평일" in rule) and now.weekday() >= 5:
            return False
        if ("weekend" in lowered or "주말" in rule) and now.weekday() < 5:
            return False
        match = re.search(r"(\d{1,2}):(\d{2})\s*[-~]\s*(\d{1,2}):(\d{2})", rule)
        current = now.hour * 60 + now.minute
        if match:
            start_hour, start_min, end_hour, end_min = [int(part) for part in match.groups()]
            if start_hour > 23 or end_hour > 23 or start_min > 59 or end_min > 59:
                return False
            start = start_hour * 60 + start_min
            end = end_hour * 60 + end_min
            if start <= end:
                return start <= current <= end
            return current >= start or current <= end

        single_time = re.search(r"(\d{1,2}):(\d{2})", rule)
        if single_time:
            hour, minute = [int(part) for part in single_time.groups()]
            if hour > 23 or minute > 59:
                return False
            threshold = hour * 60 + minute
            if "이후" in rule or "after" in lowered:
                return current >= threshold
            if "이전" in rule or "before" in lowered:
                return current <= threshold
            return current == threshold

        return any(token in lowered for token in {"always", "daily", "weekday", "weekend"}) or any(
            token in rule for token in {"항상", "매일", "평일", "주말"}
        )

    def _resolve_context_path(self, context: Dict[str, Any], path: str) -> Any:
        current: Any = context
        for part in path.split("."):
            key = part.strip()
            if not key:
                continue
            if isinstance(current, dict):
                current = current.get(key)
            elif isinstance(current, list) and key.isdigit():
                index = int(key)
                current = current[index] if 0 <= index < len(current) else None
            else:
                current = getattr(current, key, None)
            if current is None:
                break
        return current

    def _coerce_compare_value(self, value: Any) -> Any:
        if isinstance(value, str):
            stripped = value.strip()
            lowered = stripped.lower()
            if lowered == "true":
                return True
            if lowered == "false":
                return False
            if lowered in {"none", "null"}:
                return None
            try:
                return float(stripped) if "." in stripped else int(stripped)
            except ValueError:
                return stripped
        return value

    def _compare_values(self, actual: Any, expected: Any, operator_name: str) -> bool:
        left = self._coerce_compare_value(actual)
        right = self._coerce_compare_value(expected)
        if operator_name == "contains":
            return str(right) in str(left)
        if operator_name == "==":
            return left == right
        if operator_name == "!=":
            return left != right
        try:
            if operator_name == ">=":
                return left >= right
            if operator_name == ">":
                return left > right
            if operator_name == "<=":
                return left <= right
            if operator_name == "<":
                return left < right
        except TypeError:
            return False
        return False

    def _safe_eval_expression(self, expression: str, context: Dict[str, Any]) -> Any:
        parsed = ast.parse(expression, mode="eval")
        return self._eval_ast(parsed.body, context)

    def _condition_functions(self, context: Dict[str, Any]) -> Dict[str, Callable[..., Any]]:
        def resolve_path(path: Any, fallback: Any = None) -> Any:
            value = self._resolve_context_path(context, str(path or ""))
            return fallback if value is None else value

        def exists(value: Any) -> bool:
            return value is not None and value != "" and value != [] and value != {}

        def contains(value: Any, needle: Any) -> bool:
            if isinstance(value, dict):
                return str(needle) in value
            if isinstance(value, (list, tuple, set)):
                return needle in value
            return str(needle) in str(value)

        def matches(value: Any, pattern: Any) -> bool:
            try:
                return re.search(str(pattern), str(value), flags=re.IGNORECASE) is not None
            except re.error:
                return False

        def to_number(value: Any, fallback: float = 0.0) -> float:
            try:
                return float(value)
            except (TypeError, ValueError):
                return fallback

        return {
            "path": resolve_path,
            "exists": exists,
            "contains": contains,
            "matches": matches,
            "startswith": lambda value, prefix: str(value).startswith(str(prefix)),
            "endswith": lambda value, suffix: str(value).endswith(str(suffix)),
            "lower": lambda value: str(value).lower(),
            "upper": lambda value: str(value).upper(),
            "text": lambda value: "" if value is None else str(value),
            "number": to_number,
            "count": lambda value: len(value) if isinstance(value, (dict, list, tuple, set, str)) else 0,
            "any": lambda value: any(bool(item) for item in value) if isinstance(value, (list, tuple, set)) else bool(value),
            "all": lambda value: all(bool(item) for item in value) if isinstance(value, (list, tuple, set)) else bool(value),
        }

    def _eval_ast(self, node: ast.AST, context: Dict[str, Any]) -> Any:
        if isinstance(node, ast.Constant):
            return node.value
        if isinstance(node, ast.Name):
            return context.get(node.id)
        if isinstance(node, ast.List):
            return [self._eval_ast(item, context) for item in node.elts]
        if isinstance(node, ast.Tuple):
            return tuple(self._eval_ast(item, context) for item in node.elts)
        if isinstance(node, ast.Dict):
            return {self._eval_ast(key, context): self._eval_ast(value, context) for key, value in zip(node.keys, node.values)}
        if isinstance(node, ast.Attribute):
            base = self._eval_ast(node.value, context)
            if isinstance(base, dict):
                return base.get(node.attr)
            return getattr(base, node.attr, None)
        if isinstance(node, ast.Subscript):
            base = self._eval_ast(node.value, context)
            key = self._eval_ast(node.slice, context)
            if isinstance(base, dict):
                return base.get(str(key))
            if isinstance(base, list) and isinstance(key, int) and 0 <= key < len(base):
                return base[key]
            return None
        if isinstance(node, ast.BoolOp):
            values = [bool(self._eval_ast(value, context)) for value in node.values]
            if isinstance(node.op, ast.And):
                return all(values)
            if isinstance(node.op, ast.Or):
                return any(values)
        if isinstance(node, ast.UnaryOp):
            operand = self._eval_ast(node.operand, context)
            if isinstance(node.op, ast.Not):
                return not bool(operand)
            if isinstance(node.op, ast.USub):
                return -operand
            if isinstance(node.op, ast.UAdd):
                return +operand
        if isinstance(node, ast.BinOp):
            left = self._eval_ast(node.left, context)
            right = self._eval_ast(node.right, context)
            if isinstance(node.op, ast.Add):
                return left + right
            if isinstance(node.op, ast.Sub):
                return left - right
            if isinstance(node.op, ast.Mult):
                return left * right
            if isinstance(node.op, ast.Div):
                return left / right
            if isinstance(node.op, ast.Mod):
                return left % right
        if isinstance(node, ast.Compare):
            left = self._eval_ast(node.left, context)
            for op, comparator in zip(node.ops, node.comparators):
                right = self._eval_ast(comparator, context)
                if isinstance(op, ast.Eq):
                    ok = left == right
                elif isinstance(op, ast.NotEq):
                    ok = left != right
                elif isinstance(op, ast.Gt):
                    ok = left > right
                elif isinstance(op, ast.GtE):
                    ok = left >= right
                elif isinstance(op, ast.Lt):
                    ok = left < right
                elif isinstance(op, ast.LtE):
                    ok = left <= right
                elif isinstance(op, ast.In):
                    ok = left in right
                elif isinstance(op, ast.NotIn):
                    ok = left not in right
                else:
                    ok = False
                if not ok:
                    return False
                left = right
            return True
        if isinstance(node, ast.Call):
            if not isinstance(node.func, ast.Name):
                raise ValueError("unsupported_condition_function")
            functions = self._condition_functions(context)
            fn = functions.get(node.func.id)
            if fn is None:
                raise ValueError(f"unsupported_condition_function:{node.func.id}")
            args = [self._eval_ast(arg, context) for arg in node.args]
            kwargs = {kw.arg: self._eval_ast(kw.value, context) for kw in node.keywords if kw.arg}
            return fn(*args, **kwargs)
        raise ValueError(f"unsupported_condition_syntax:{type(node).__name__}")

    def _approval_stage(self, task: Task) -> str:
        metadata = task.metadata if isinstance(task.metadata, dict) else {}
        return str(metadata.get("approval_gate_stage") or "after_result")

    def _approval_required(self, task: Task, stage: str) -> bool:
        metadata = task.metadata if isinstance(task.metadata, dict) else {}
        execution_mode = str(metadata.get("execution_mode") or "auto")
        gate_stage = self._approval_stage(task)
        # Keep the legacy fallback mission's backend gate, but let Studio graph
        # nodes follow the execution mode explicitly configured by the user.
        if self.workflow_graph is None and task.role == "backend" and stage == "before_run":
            return True
        if execution_mode != "confirm":
            return False
        return gate_stage == stage or gate_stage == "both"

    async def _await_task_approval(self, task: Task, mission: Mission, stage: str) -> Dict[str, Any] | None:
        metadata = task.metadata if isinstance(task.metadata, dict) else {}
        mission.status = MissionStatus.AWAITING_APPROVAL
        task.status = TaskStatus.WAITING_INPUT
        gate = {
            "mission_id": mission.id,
            "task_id": task.id,
            "role": task.role,
            "gate_stage": stage,
            "approval_channels": metadata.get("approval_channels") or ["admin_queue"],
            "approval_target": metadata.get("approval_target") or "",
            "requested_at": time.time(),
        }
        self._emit(
            "human_gate_requested",
            f"⚠️ [HUMAN GATE] {task.description[:48]} 승인 대기 ({stage})",
            **gate,
        )
        approval: Dict[str, Any] | None = None
        if self.wait_for_human_gate is not None:
            approval = await self.wait_for_human_gate(gate)
            if approval is None:
                mission.status = MissionStatus.FAILED
                task.status = TaskStatus.FAILED
                task.error_message = "human_gate_approval_missing"
                raise RuntimeError("human_gate_approval_missing")
        mission.status = MissionStatus.RUNNING
        self._emit(
            "human_gate_approved",
            "✅ 승인 완료. 다음 실행을 재개합니다.",
            mission_id=mission.id,
            task_id=task.id,
            role=task.role,
            gate_stage=stage,
            approved_by=(approval or {}).get("approved_by"),
            approved_role=(approval or {}).get("approved_role"),
        )
        return approval

    def _workflow_adjacency(self) -> Dict[str, list[str]]:
        adjacency: Dict[str, list[str]] = {}
        if not self.workflow_graph:
            return adjacency

        raw_edges = self.workflow_graph.get("edges", [])
        for edge in raw_edges if isinstance(raw_edges, list) else []:
            if not isinstance(edge, dict):
                continue
            source = str(edge.get("source") or "").strip()
            target = str(edge.get("target") or "").strip()
            if not source or not target or source == target:
                continue
            adjacency.setdefault(source, [])
            if target not in adjacency[source]:
                adjacency[source].append(target)

        raw_nodes = self.workflow_graph.get("nodes", [])
        for node in raw_nodes if isinstance(raw_nodes, list) else []:
            if not isinstance(node, dict):
                continue
            source = str(node.get("id") or "").strip()
            data = node.get("data") if isinstance(node.get("data"), dict) else {}
            branches = self._condition_branches_from_definition(data if isinstance(data, dict) else {})
            if not source or not isinstance(branches, list):
                continue
            for branch in branches:
                if not isinstance(branch, dict) or str(branch.get("action") or "node") != "node":
                    continue
                target = str(branch.get("targetNodeId") or branch.get("target_node_id") or "").strip()
                if not target or target == source:
                    continue
                adjacency.setdefault(source, [])
                if target not in adjacency[source]:
                    adjacency[source].append(target)
        return adjacency

    def _workflow_descendants(self, start_ids: list[str], adjacency: Dict[str, list[str]]) -> set[str]:
        seen: set[str] = set()
        stack = [node_id for node_id in start_ids if node_id]
        while stack:
            node_id = stack.pop()
            if node_id in seen:
                continue
            seen.add(node_id)
            stack.extend(adjacency.get(node_id, []))
        return seen

    def _select_router_branch(
        self,
        task: Task,
        mission: Mission,
        graph: TaskGraphEngine,
    ) -> tuple[Dict[str, Any] | None, list[Dict[str, Any]], list[Dict[str, Any]]]:
        branches = self._condition_branches_from_definition(task.metadata if isinstance(task.metadata, dict) else {})
        evaluated: list[Dict[str, Any]] = []
        selected_branch: Dict[str, Any] | None = None
        if not isinstance(branches, list):
            return selected_branch, [], evaluated

        context = self._build_condition_context(task, mission, graph.get_dependency_artifacts(task))
        for index, branch in enumerate(branches):
            if not isinstance(branch, dict):
                continue
            expression = str(branch.get("expression") or "").strip()
            branch_definition = dict(branch)
            if "condition_expression" not in branch_definition and expression:
                branch_definition["condition_expression"] = expression
            has_condition_keys = any(
                key in branch_definition
                for key in (
                    "condition_mode",
                    "mode",
                    "condition_expression",
                    "expression",
                    "condition_time_rule",
                    "time_rule",
                    "condition_data_path",
                    "data_path",
                )
            )
            if not has_condition_keys:
                branch_definition["condition_mode"] = "condition"
            evaluation = self._evaluate_condition_definition(branch_definition, context, source="router")
            matched = bool(evaluation.get("allowed"))
            row = {
                "branch_id": branch.get("id") or f"branch-{index + 1}",
                "label": branch.get("label") or f"분기 {index + 1}",
                "expression": expression,
                "matched": matched,
                "action": branch.get("action") or "node",
                "targetNodeId": branch.get("targetNodeId") or branch.get("target_node_id") or "",
                "mode": evaluation.get("mode"),
                "checks": evaluation.get("checks", {}),
            }
            if evaluation.get("checks", {}).get("error"):
                row["error"] = evaluation["checks"]["error"]
            evaluated.append(row)
            if matched and selected_branch is None:
                selected_branch = dict(branch)
                selected_branch.setdefault("id", row["branch_id"])
                selected_branch.setdefault("label", row["label"])
                selected_branch["condition"] = evaluation
        return selected_branch, [branch for branch in branches if isinstance(branch, dict)], evaluated

    def _apply_router_branch(
        self,
        task: Task,
        mission: Mission,
        selected_branch: Dict[str, Any] | None,
        branches: list[Dict[str, Any]],
        evaluated_branches: list[Dict[str, Any]],
    ) -> Dict[str, Any]:
        adjacency = self._workflow_adjacency()
        direct_targets = [target for target in adjacency.get(task.id, []) if target in mission.tasks]
        selected_action = str((selected_branch or {}).get("action") or "none")
        selected_target = (
            str((selected_branch or {}).get("targetNodeId") or (selected_branch or {}).get("target_node_id") or "").strip()
            if selected_action == "node"
            else ""
        )
        selected_targets = [selected_target] if selected_target in mission.tasks else []
        selected_reachable = self._workflow_descendants(selected_targets, adjacency) if selected_targets else set()

        if selected_targets:
            skip_candidates: set[str] = set()
            for target in direct_targets:
                if target in selected_targets:
                    continue
                skip_candidates.update(self._workflow_descendants([target], adjacency))
            skip_candidates.difference_update(selected_reachable)
        else:
            skip_candidates = self._workflow_descendants(direct_targets, adjacency)

        skipped_task_ids: list[str] = []
        selected_branch_id = (selected_branch or {}).get("id")
        for task_id in sorted(skip_candidates):
            if task_id == task.id:
                continue
            route_task = mission.tasks.get(task_id)
            if not route_task or route_task.status != TaskStatus.PENDING:
                continue
            route_task.status = TaskStatus.SKIPPED
            route_task.confidence = 1.0
            route_task.artifacts = {
                "skipped": True,
                "route": {
                    "router_task_id": task.id,
                    "selected_branch_id": selected_branch_id,
                    "selected_action": selected_action,
                    "selected_target_id": selected_target,
                },
            }
            skipped_task_ids.append(task_id)

        if selected_action == "notify":
            self._emit(
                "workflow_route_notification",
                "🧭 [ROUTER] 알림 분기가 선택되었습니다.",
                mission_id=mission.id,
                task_id=task.id,
                selected_branch=selected_branch,
                notify_message=(selected_branch or {}).get("notifyMessage") or (selected_branch or {}).get("notify_message") or "",
            )

        route_result = {
            "selected_branch": selected_branch,
            "evaluated_branches": evaluated_branches,
            "selected_action": selected_action,
            "selected_target_id": selected_target,
            "direct_targets": direct_targets,
            "skipped_task_ids": skipped_task_ids,
            "branch_count": len(branches),
        }
        self._emit(
            "workflow_route_applied",
            "🧭 [ROUTER] 선택된 분기 기준으로 실행 경로를 정리했습니다.",
            mission_id=mission.id,
            task_id=task.id,
            **route_result,
        )
        return route_result

    async def _execute_virtual_task(self, task: Task, mission: Mission, graph: TaskGraphEngine) -> None:
        if self._approval_required(task, "before_run") or task.role == "human_approval":
            await self._await_task_approval(task, mission, "before_run")
        task.status = TaskStatus.RUNNING
        self._emit(
            "task_started",
            f"🔧 [{task.role.upper()}] 시작: {task.description[:50]}...",
            mission_id=mission.id,
            task_id=task.id,
            role=task.role,
        )
        if task.role == "router":
            selected_branch, branches, evaluated_branches = self._select_router_branch(task, mission, graph)
            route_result = self._apply_router_branch(task, mission, selected_branch, branches, evaluated_branches)
            task.artifacts = {"route": route_result, "virtual": True}
            self._emit(
                "workflow_route_evaluated",
                "🧭 [ROUTER] 조건 분기 평가 완료",
                mission_id=mission.id,
                task_id=task.id,
                selected_branch=selected_branch,
                evaluated_branches=evaluated_branches,
            )
        else:
            task.artifacts = {
                "approval_gate": True,
                "approval_channels": task.metadata.get("approval_channels", ["admin_queue"]) if isinstance(task.metadata, dict) else ["admin_queue"],
                "virtual": True,
            }
        task.cost = 0.0
        task.confidence = 1.0
        task.status = TaskStatus.COMPLETED
        self._emit(
            "task_completed",
            f"✅ [{task.role.upper()}] 가상 단계 완료",
            mission_id=mission.id,
            task_id=task.id,
            role=task.role,
            progress=graph.progress(),
            cost=0.0,
        )

    async def _execute_task(
        self,
        task: Task,
        mission: Mission,
        graph: TaskGraphEngine,
        governor: CostGovernor,
    ) -> None:
        dep_artifacts = graph.get_dependency_artifacts(task)
        condition_result = self._condition_allows_task(task, mission, dep_artifacts)
        if condition_result.get("mode") != "always":
            self._emit(
                "workflow_condition_evaluated",
                f"🔎 [CONDITION] task={task.id} allowed={condition_result.get('allowed')}",
                mission_id=mission.id,
                task_id=task.id,
                role=task.role,
                **condition_result,
            )
        if not condition_result.get("allowed"):
            task.status = TaskStatus.SKIPPED
            task.confidence = 1.0
            task.artifacts = {"skipped": True, "condition": condition_result}
            self._emit(
                "task_skipped",
                f"⏭️ [{task.role.upper()}] 조건 미충족으로 건너뜀",
                mission_id=mission.id,
                task_id=task.id,
                role=task.role,
                condition=condition_result,
            )
            return

        if task.role in {"human_approval", "router"}:
            await self._execute_virtual_task(task, mission, graph)
            return

        task_policy = self.policy_engine.check_task_execution(
            role=task.role,
            spent=governor.spent,
            budget=mission.budget,
            external_publish=False,
        )
        self._emit(
            "policy_check",
            f"🛡️ [POLICY] task={task.id} allowed={task_policy.allowed}",
            mission_id=mission.id,
            task_id=task.id,
            scope="task_pre_execution",
            allowed=task_policy.allowed,
            reasons=task_policy.reasons,
            warnings=task_policy.warnings,
            details=task_policy.details,
        )
        if not task_policy.allowed:
            task.status = TaskStatus.FAILED
            task.error_message = ",".join(task_policy.reasons)
            self._emit(
                "task_blocked",
                f"🚫 [{task.role.upper()}] 정책 위반으로 실행 차단: {task_policy.reasons}",
                mission_id=mission.id,
                task_id=task.id,
                role=task.role,
                policy_reasons=task_policy.reasons,
            )
            return

        can_run, reason = governor.can_execute(task)
        if not can_run:
            task.status = TaskStatus.FAILED
            task.error_message = reason
            self._emit("task_blocked", f"🚫 [{task.role.upper()}] 실행 차단: {reason}", mission_id=mission.id, task_id=task.id)
            return

        if self._approval_required(task, "before_run"):
            await self._await_task_approval(task, mission, "before_run")

        task.status = TaskStatus.RUNNING
        self._emit(
            "task_started",
            f"🔧 [{task.role.upper()}] 시작: {task.description[:50]}...",
            mission_id=mission.id,
            task_id=task.id,
            role=task.role,
        )
        try:
            context = self.context_router.build_worker_context(task, mission, dep_artifacts)
            result = await self.worker.execute(context)
            task.artifacts = result["artifacts"]
            task.cost = result["cost"]
            task.confidence = result["confidence"]
            self._emit(
                "execution_result",
                f"⚙️ [{task.role.upper()}] execution_pass=True quality_check=pending",
                mission_id=mission.id,
                task_id=task.id,
                role=task.role,
                execution_pass=True,
                stage="execution",
            )

            governor.record_cost(task.id, result["cost"])
            mission.total_cost += result["cost"]

            validation = self.validation_engine.validate(task.role, task.artifacts)
            if not validation.passed:
                governor.record_retry(task.id)
                task.retry_count += 1
                task.error_message = ",".join(validation.reasons)
                if task.retry_count < governor.max_retries:
                    task.status = TaskStatus.PENDING
                    self._emit(
                        "task_validation_failed",
                        f"⚠️ [{task.role.upper()}] 산출물 검증 실패, 재시도 {task.retry_count}/{governor.max_retries}: {validation.reasons}",
                        mission_id=mission.id,
                        task_id=task.id,
                        role=task.role,
                        reasons=validation.reasons,
                    )
                else:
                    task.status = TaskStatus.FAILED
                    self._emit(
                        "task_failed",
                        f"❌ [{task.role.upper()}] 검증 최종 실패: {validation.reasons}",
                        mission_id=mission.id,
                        task_id=task.id,
                        role=task.role,
                        reasons=validation.reasons,
                    )
                return

            quality = self.evaluation_engine.evaluate(task.role, task.artifacts, execution_pass=True)
            self._emit(
                "evaluation_result",
                f"🧪 [{task.role.upper()}] execution_pass={quality.execution_pass} quality_pass={quality.quality_pass} score={quality.score}",
                mission_id=mission.id,
                task_id=task.id,
                role=task.role,
                execution_pass=quality.execution_pass,
                quality_pass=quality.quality_pass,
                score=quality.score,
                reasons=quality.reasons,
                checks=quality.checks,
                stage="quality",
            )
            if not quality.quality_pass:
                governor.record_retry(task.id)
                task.retry_count += 1
                task.error_message = ",".join(quality.reasons) if quality.reasons else "quality_gate_failed"
                if task.retry_count < governor.max_retries:
                    task.status = TaskStatus.PENDING
                    self._emit(
                        "task_quality_failed",
                        f"⚠️ [{task.role.upper()}] 품질 게이트 실패, 재시도 {task.retry_count}/{governor.max_retries}: {quality.reasons}",
                        mission_id=mission.id,
                        task_id=task.id,
                        role=task.role,
                        score=quality.score,
                        reasons=quality.reasons,
                    )
                else:
                    task.status = TaskStatus.FAILED
                    self._emit(
                        "task_failed",
                        f"❌ [{task.role.upper()}] 품질 게이트 최종 실패: {quality.reasons}",
                        mission_id=mission.id,
                        task_id=task.id,
                        role=task.role,
                        score=quality.score,
                        reasons=quality.reasons,
                    )
                return

            if self._approval_required(task, "after_result"):
                await self._await_task_approval(task, mission, "after_result")
                task.status = TaskStatus.RUNNING

            task.status = TaskStatus.COMPLETED
            self._emit(
                "task_completed",
                f"✅ [{task.role.upper()}] 완료! 비용: ${result['cost']:.4f}, 진행률: {graph.progress()*100:.0f}%",
                mission_id=mission.id,
                task_id=task.id,
                role=task.role,
                progress=graph.progress(),
                cost=result["cost"],
            )
        except Exception as exc:
            governor.record_retry(task.id)
            task.retry_count += 1
            task.error_message = str(exc)
            self._emit(
                "evaluation_result",
                f"🧪 [{task.role.upper()}] execution_pass=False quality_pass=False score=0.0",
                mission_id=mission.id,
                task_id=task.id,
                role=task.role,
                execution_pass=False,
                quality_pass=False,
                score=0.0,
                reasons=[str(exc)],
                stage="execution_exception",
            )
            if task.retry_count < governor.max_retries:
                task.status = TaskStatus.PENDING
                self._emit(
                    "task_retry",
                    f"🔄 [{task.role.upper()}] 재시도 {task.retry_count}/{governor.max_retries}: {str(exc)[:60]}",
                    mission_id=mission.id,
                    task_id=task.id,
                )
            else:
                task.status = TaskStatus.FAILED
                self._emit(
                    "task_failed",
                    f"❌ [{task.role.upper()}] 최종 실패: {str(exc)[:60]}",
                    mission_id=mission.id,
                    task_id=task.id,
                )

    async def run(self, goal: str, budget: float = 5.0) -> Dict[str, Any]:
        mission = self.plan_mission(goal, budget)
        success = await self.execute_mission(mission)
        return {
            "mission_id": mission.id,
            "goal": mission.goal,
            "success": success,
            "mission": mission.to_dict(),
            "cost_summary": self._governor.status() if self._governor else {},
        }
