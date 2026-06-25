from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class EvaluationResult:
    execution_pass: bool
    quality_pass: bool
    score: float
    reasons: List[str] = field(default_factory=list)
    checks: Dict[str, Any] = field(default_factory=dict)


class EvaluationEngine:
    """실행 성공과 품질 평가를 분리하는 평가 엔진."""

    ROLE_MIN_FIELDS = {
        "architect": 3,
        "backend": 3,
        "frontend": 3,
        "qa": 4,
        "writer": 1,
        "translator": 1,
        "data": 1,
        "image": 1,
        "agent": 1,
    }

    def evaluate(self, role: str, artifacts: Dict[str, Any], execution_pass: bool) -> EvaluationResult:
        if not execution_pass:
            return EvaluationResult(
                execution_pass=False,
                quality_pass=False,
                score=0.0,
                reasons=["execution_failed"],
                checks={"artifact_count": 0},
            )

        if not isinstance(artifacts, dict):
            return EvaluationResult(
                execution_pass=True,
                quality_pass=False,
                score=0.0,
                reasons=["artifacts_not_object"],
                checks={"artifact_count": 0},
            )

        reasons: List[str] = []
        artifact_count = len(artifacts)
        min_fields = self.ROLE_MIN_FIELDS.get(role, 2)
        if artifact_count < min_fields:
            reasons.append(f"insufficient_artifacts:{artifact_count}<{min_fields}")

        non_empty_ratio = 0.0
        if artifact_count > 0:
            non_empty_count = 0
            for _, value in artifacts.items():
                if isinstance(value, str):
                    if value.strip():
                        non_empty_count += 1
                elif value not in (None, "", [], {}):
                    non_empty_count += 1
            non_empty_ratio = non_empty_count / artifact_count
            if non_empty_ratio < 0.8:
                reasons.append(f"low_non_empty_ratio:{round(non_empty_ratio, 2)}")

        score = 100.0
        score -= max(0, min_fields - artifact_count) * 12.0
        score -= max(0.0, (0.8 - non_empty_ratio)) * 40.0
        if reasons:
            score -= 10.0
        score = max(0.0, min(100.0, score))
        quality_pass = score >= 70.0 and not reasons

        return EvaluationResult(
            execution_pass=True,
            quality_pass=quality_pass,
            score=round(score, 2),
            reasons=reasons,
            checks={
                "artifact_count": artifact_count,
                "required_min_fields": min_fields,
                "non_empty_ratio": round(non_empty_ratio, 3),
            },
        )
