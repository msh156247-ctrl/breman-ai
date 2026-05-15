from __future__ import annotations

from typing import Any, Dict

from .models import Mission, Task


class ContextRouter:
    """Context Explosion 방지 - 브래맨 핵심 레이어."""

    ROLE_CONTEXTS = {
        "architect": {
            "needs": ["requirements"],
            "system_prompt": """당신은 시스템 아키텍처 전문가입니다.
주어진 요구사항을 분석하여 JSON으로 반환하세요.""",
        },
        "backend": {
            "needs": ["architecture", "tech_stack", "api_design"],
            "system_prompt": """당신은 백엔드 개발 전문가입니다.
FastAPI 기준으로 구현 계획을 JSON으로 반환하세요.""",
        },
        "frontend": {
            "needs": ["architecture", "api_endpoints"],
            "system_prompt": """당신은 프론트엔드 개발 전문가입니다.
Next.js 기준으로 구현 계획을 JSON으로 반환하세요.""",
        },
        "qa": {
            "needs": ["api_endpoints", "pages_structure"],
            "system_prompt": """당신은 QA 엔지니어입니다.
테스트 계획을 JSON으로 반환하세요.""",
        },
    }

    def build_worker_context(
        self,
        task: Task,
        mission: Mission,
        dependency_artifacts: Dict[str, Any],
    ) -> Dict[str, Any]:
        role_config = self.ROLE_CONTEXTS.get(task.role, {})
        needed_keys = role_config.get("needs", [])
        filtered_artifacts: Dict[str, Any] = {}

        for dep_artifacts in dependency_artifacts.values():
            for key, value in dep_artifacts.items():
                if key in needed_keys:
                    filtered_artifacts[key] = value

        return {
            "task_id": task.id,
            "task_description": task.description,
            "role": task.role,
            "mission_goal": mission.goal,
            "dependency_outputs": filtered_artifacts,
            "system_prompt": role_config.get("system_prompt", "주어진 태스크를 완수하세요."),
        }
