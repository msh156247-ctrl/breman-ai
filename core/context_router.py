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
        "writer": {
            "needs": [],
            "system_prompt": """당신은 콘텐츠 작성 전문가입니다.
요청 목적과 독자에 맞는 결과를 JSON 객체로 반환하세요.""",
        },
        "translator": {
            "needs": [],
            "system_prompt": """당신은 번역 및 현지화 전문가입니다.
의미와 문체를 보존한 결과를 JSON 객체로 반환하세요.""",
        },
        "data": {
            "needs": [],
            "system_prompt": """당신은 데이터 분석 전문가입니다.
근거, 분석 결과, 권고 사항을 JSON 객체로 반환하세요.""",
        },
        "image": {
            "needs": [],
            "system_prompt": """당신은 이미지 제작 워크플로우 전문가입니다.
이미지 요구사항과 생성 결과 메타데이터를 JSON 객체로 반환하세요.""",
        },
        "agent": {
            "needs": [],
            "system_prompt": """당신은 주어진 역할을 수행하는 전문 에이전트입니다.
요청된 산출물을 구조화된 JSON 객체로 반환하세요.""",
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

        metadata_prompt = ""
        if isinstance(task.metadata, dict):
            metadata_prompt = str(task.metadata.get("system_prompt") or "").strip()

        return {
            "task_id": task.id,
            "task_description": task.description,
            "role": task.role,
            "mission_goal": mission.goal,
            "dependency_outputs": filtered_artifacts,
            "system_prompt": metadata_prompt or role_config.get("system_prompt", "주어진 태스크를 완수하세요."),
            "provider": str(task.metadata.get("required_api") or task.metadata.get("provider") or "openai").lower()
            if isinstance(task.metadata, dict)
            else "openai",
            "model": str(task.metadata.get("model_name") or task.metadata.get("model") or "")
            if isinstance(task.metadata, dict)
            else "",
        }
