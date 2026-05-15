from __future__ import annotations

from typing import Any, Dict, List

from .models import Task, TaskStatus


class TaskGraphEngine:
    """DAG 기반 태스크 실행 엔진."""

    def __init__(self, tasks: Dict[str, Task]):
        self.tasks = tasks
        self._validate_no_cycles()

    def _validate_no_cycles(self) -> None:
        visited, rec_stack = set(), set()

        def has_cycle(node_id: str) -> bool:
            if node_id not in self.tasks:
                return False
            visited.add(node_id)
            rec_stack.add(node_id)

            for dep_id in self.tasks[node_id].dependencies:
                if dep_id not in visited:
                    if has_cycle(dep_id):
                        return True
                elif dep_id in rec_stack:
                    return True

            rec_stack.discard(node_id)
            return False

        for task_id in self.tasks:
            if task_id not in visited and has_cycle(task_id):
                raise ValueError(f"순환 의존성 감지: {task_id}")

    def get_executable_tasks(self) -> List[Task]:
        executable: List[Task] = []
        for task in self.tasks.values():
            if task.status != TaskStatus.PENDING:
                continue
            if self._dependencies_satisfied(task):
                executable.append(task)
        return executable

    def _dependencies_satisfied(self, task: Task) -> bool:
        for dep_id in task.dependencies:
            dep_task = self.tasks.get(dep_id)
            if not dep_task or dep_task.status != TaskStatus.COMPLETED:
                return False
        return True

    def get_dependency_artifacts(self, task: Task) -> Dict[str, Any]:
        artifacts: Dict[str, Any] = {}
        for dep_id in task.dependencies:
            dep_task = self.tasks.get(dep_id)
            if dep_task and dep_task.artifacts:
                artifacts[dep_id] = dep_task.artifacts
        return artifacts

    def is_completed(self) -> bool:
        return all(t.status == TaskStatus.COMPLETED for t in self.tasks.values())

    def is_failed(self) -> bool:
        return any(t.status == TaskStatus.FAILED for t in self.tasks.values())

    def progress(self) -> float:
        if not self.tasks:
            return 0.0
        completed = sum(1 for t in self.tasks.values() if t.status == TaskStatus.COMPLETED)
        return completed / len(self.tasks)
