from __future__ import annotations

import asyncio
import json
import os
from typing import Any, Dict

from dotenv import load_dotenv
from openai import AsyncOpenAI

load_dotenv()


class LLMWorker:
    """실 LLM 또는 mock 워커."""

    def __init__(self, use_mock: bool = True, api_key: str | None = None):
        self.use_mock = use_mock
        self.client = None
        self.has_api_key = use_mock
        if not use_mock:
            resolved_api_key = str(api_key or os.getenv("OPENAI_API_KEY") or "").strip()
            if not resolved_api_key:
                raise ValueError("OPENAI_API_KEY 환경변수가 필요합니다")
            self.has_api_key = True
            self.client = AsyncOpenAI(api_key=resolved_api_key)

    async def execute(self, context: Dict[str, Any]) -> Dict[str, Any]:
        if self.use_mock:
            return await self._mock_execute(context)
        provider = str(context.get("provider") or "openai").strip().lower()
        if provider != "openai":
            raise ValueError(f"runtime_provider_not_supported:{provider}")
        return await self._real_execute(context)

    async def _real_execute(self, context: Dict[str, Any]) -> Dict[str, Any]:
        assert self.client is not None
        user_prompt = (
            f"미션: {context['mission_goal']}\n"
            f"태스크: {context['task_description']}\n\n"
            f"이전 단계 결과:\n{json.dumps(context['dependency_outputs'], ensure_ascii=False, indent=2)}\n\n"
            "JSON 형식으로만 응답하세요."
        )
        requested_model = str(context.get("model") or "").strip().lower()
        model = requested_model if requested_model.startswith("gpt-") else "gpt-4o-mini"
        response = await self.client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": context["system_prompt"]},
                {"role": "user", "content": user_prompt},
            ],
            response_format={"type": "json_object"},
            temperature=0.2,
        )
        content = response.choices[0].message.content or "{}"
        artifacts = json.loads(content)
        usage = response.usage
        prompt_tokens = usage.prompt_tokens if usage else 0
        completion_tokens = usage.completion_tokens if usage else 0
        cost = (prompt_tokens * 0.00015 + completion_tokens * 0.0006) / 1000
        return {"artifacts": artifacts, "cost": cost, "confidence": 0.9}

    async def _mock_execute(self, context: Dict[str, Any]) -> Dict[str, Any]:
        await asyncio.sleep(1.0)
        role = context["role"]
        mock_artifacts = {
            "architect": {
                "architecture": "마이크로서비스 아키텍처",
                "tech_stack": "FastAPI + Next.js + PostgreSQL",
                "api_design": "RESTful API",
                "database": "PostgreSQL with SQLAlchemy",
            },
            "backend": {
                "api_endpoints": "/auth/login, /auth/register, /posts, /posts/{id}",
                "db_models": "User, Post, Comment",
                "auth_system": "JWT 기반 인증",
                "code_structure": "routers/, models/, schemas/, services/",
            },
            "frontend": {
                "pages_structure": "pages/index, pages/login, pages/posts",
                "components": "Header, PostCard, LoginForm",
                "state_management": "Zustand",
                "api_integration": "fetch + query hooks",
            },
            "qa": {
                "test_scenarios": "로그인, 회원가입, 포스트 CRUD",
                "unit_tests": "API 엔드포인트 테스트",
                "integration_tests": "E2E 사용자 플로우",
                "coverage_target": "85%",
            },
            "writer": {
                "result": f"{context['mission_goal']}에 맞춘 콘텐츠 초안",
                "format": "structured_content",
            },
            "translator": {
                "result": f"{context['mission_goal']}에 맞춘 번역 결과",
                "format": "localized_content",
            },
            "data": {
                "result": f"{context['mission_goal']}에 대한 데이터 분석 결과",
                "insights": ["핵심 지표와 이상 징후를 확인했습니다."],
            },
            "image": {
                "result": f"{context['mission_goal']}에 맞춘 이미지 생성 명세",
                "asset_type": "image_spec",
            },
            "agent": {
                "result": f"{context['mission_goal']}에 대한 {context['task_description']} 결과",
            },
        }
        return {
            "artifacts": mock_artifacts.get(role, {"result": f"Mock output for {role}"}),
            "cost": 0.001,
            "confidence": 0.95,
        }
