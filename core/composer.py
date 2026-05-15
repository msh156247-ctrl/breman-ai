from __future__ import annotations

import asyncio
import time
from pathlib import Path
from typing import Any, Callable, Dict, Optional

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

    def __init__(self, use_mock: bool = True, on_event: Optional[Callable[[Dict[str, Any]], None]] = None):
        self.use_mock = use_mock
        self.context_router = ContextRouter()
        self.worker = LLMWorker(use_mock=use_mock)
        schema_path = Path(__file__).resolve().parents[1] / "artifact_schemas.yaml"
        policy_path = Path(__file__).resolve().parents[1] / "policy_rules.yaml"
        self.validation_engine = ValidationEngine(schema_path=schema_path)
        self.policy_engine = PolicyEngine(policy_path=policy_path, policy_set="default")
        self.evaluation_engine = EvaluationEngine()
        self.on_event = on_event or self._default_event_handler
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
        if self.workflow_compiler is not None:
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
        mission_policy = self.policy_engine.check_mission_start(budget=mission.budget, use_mock=self.use_mock)
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

        success = graph.is_completed()
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

    async def _execute_task(
        self,
        task: Task,
        mission: Mission,
        graph: TaskGraphEngine,
        governor: CostGovernor,
    ) -> None:
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

        # MVP Human Gate 시뮬레이션: backend 태스크 시작 전 승인 이벤트 발생
        if task.role == "backend":
            self._emit(
                "human_gate_requested",
                "⚠️ [HUMAN GATE] Backend-AI가 데이터베이스 스키마 승인을 요청합니다. 계속 진행하시겠습니까?",
                mission_id=mission.id,
                task_id=task.id,
                role=task.role,
            )
            await asyncio.sleep(3.0)
            self._emit(
                "human_gate_approved",
                "✅ 승인 완료. Backend 작업을 재개합니다.",
                mission_id=mission.id,
                task_id=task.id,
                role=task.role,
            )

        task.status = TaskStatus.RUNNING
        self._emit(
            "task_started",
            f"🔧 [{task.role.upper()}] 시작: {task.description[:50]}...",
            mission_id=mission.id,
            task_id=task.id,
            role=task.role,
        )
        try:
            dep_artifacts = graph.get_dependency_artifacts(task)
            context = self.context_router.build_worker_context(task, mission, dep_artifacts)
            result = await self.worker.execute(context)
            task.artifacts = result["artifacts"]
            task.cost = result["cost"]
            task.confidence = result["confidence"]
            self._emit(
                "evaluation_result",
                f"🧪 [{task.role.upper()}] execution_pass=True quality_pass=pending",
                mission_id=mission.id,
                task_id=task.id,
                role=task.role,
                execution_pass=True,
                quality_pass=False,
                score=0.0,
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
