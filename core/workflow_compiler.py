from __future__ import annotations

from dataclasses import dataclass
import re
from typing import Any, Dict, List

from .models import Task
from .ontology_loader import Ontology
from .role_registry import RoleRegistry


@dataclass
class CompiledWorkflow:
    workflow_name: str
    tasks: Dict[str, Task]


class WorkflowCompiler:
    """Mission goal을 ontology workflow로 컴파일."""

    def __init__(self, ontology: Ontology, role_registry: RoleRegistry):
        self.ontology = ontology
        self.roles = role_registry

    @staticmethod
    def _contains_any(text: str, keywords: List[str]) -> bool:
        return any(keyword.lower() in text for keyword in keywords)

    @staticmethod
    def _matches_any_regex(text: str, patterns: List[str]) -> bool:
        for pattern in patterns:
            try:
                if re.search(pattern, text, flags=re.IGNORECASE):
                    return True
            except re.error:
                # 잘못된 정규식은 무시하여 런타임 안정성 유지
                continue
        return False

    def preview_routing(self, goal: str) -> Dict[str, Any]:
        text = goal.lower()
        rules = self.ontology.raw.get("routing_rules", [])
        if not isinstance(rules, list):
            return {
                "goal": goal,
                "selected_workflow": "webapp_default",
                "default_workflow": "webapp_default",
                "matched_rule": None,
                "rules_checked": [],
            }

        default_workflow = "webapp_default"
        sorted_rules = sorted(
            [rule for rule in rules if isinstance(rule, dict)],
            key=lambda r: int(r.get("priority", 0)),
            reverse=True,
        )

        for idx, rule in enumerate(sorted_rules):
            if isinstance(rule, dict) and rule.get("default") is True and isinstance(rule.get("workflow"), str):
                default_workflow = rule["workflow"]

        rules_checked: List[Dict[str, Any]] = []
        for idx, rule in enumerate(sorted_rules):
            workflow = rule.get("workflow")
            if not isinstance(workflow, str) or workflow not in self.ontology.workflows:
                continue
            if rule.get("default") is True:
                continue

            include_any = rule.get("include_any", [])
            exclude_any = rule.get("exclude_any", [])
            include_regex = rule.get("include_regex", [])
            exclude_regex = rule.get("exclude_regex", [])
            if (
                not isinstance(include_any, list)
                or not isinstance(exclude_any, list)
                or not isinstance(include_regex, list)
                or not isinstance(exclude_regex, list)
            ):
                continue

            include = self._contains_any(text, [str(v) for v in include_any]) or self._matches_any_regex(
                text, [str(v) for v in include_regex]
            )
            exclude = self._contains_any(text, [str(v) for v in exclude_any]) or self._matches_any_regex(
                text, [str(v) for v in exclude_regex]
            )
            summary = {
                "rule_index": idx,
                "workflow": workflow,
                "priority": int(rule.get("priority", 0)),
                "include_matched": include,
                "exclude_matched": exclude,
                "include_any": [str(v) for v in include_any],
                "exclude_any": [str(v) for v in exclude_any],
                "include_regex": [str(v) for v in include_regex],
                "exclude_regex": [str(v) for v in exclude_regex],
            }
            rules_checked.append(summary)
            if include and not exclude:
                return {
                    "goal": goal,
                    "selected_workflow": workflow,
                    "default_workflow": default_workflow,
                    "matched_rule": summary,
                    "rules_checked": rules_checked,
                }

        return {
            "goal": goal,
            "selected_workflow": default_workflow,
            "default_workflow": default_workflow,
            "matched_rule": None,
            "rules_checked": rules_checked,
        }

    def select_workflow(self, goal: str) -> str:
        return str(self.preview_routing(goal).get("selected_workflow", "webapp_default"))

    def compile(self, goal: str, workflow_name: str = "webapp_default") -> CompiledWorkflow:
        workflow = self.ontology.workflows.get(workflow_name)
        if not isinstance(workflow, dict):
            raise ValueError(f"Workflow not found: {workflow_name}")

        steps = workflow.get("steps", [])
        if not isinstance(steps, list):
            raise ValueError("Workflow steps must be a list")

        tasks: Dict[str, Task] = {}
        for step in steps:
            if not isinstance(step, dict):
                continue
            task_id = str(step.get("id", "")).strip()
            role = str(step.get("role", "")).strip()
            desc = str(step.get("description", "")).strip()
            dependencies = [str(dep) for dep in step.get("dependencies", [])]
            if not task_id or not role or not desc:
                continue

            # 역할 미정의 시 컴파일 실패로 막아 안전성 확보
            if self.roles.get(role) is None:
                raise ValueError(f"Role not defined in ontology: {role}")

            tasks[task_id] = Task(
                id=task_id,
                description=desc,
                role=role,
                dependencies=dependencies,
            )

        if not tasks:
            raise ValueError("No tasks compiled from workflow")
        return CompiledWorkflow(workflow_name=workflow_name, tasks=tasks)

    def compile_for_goal(self, goal: str) -> CompiledWorkflow:
        selected = self.select_workflow(goal)
        return self.compile(goal=goal, workflow_name=selected)
