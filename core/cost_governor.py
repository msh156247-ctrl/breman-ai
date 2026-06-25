from __future__ import annotations

import math
from typing import Dict, Tuple

from .models import Task


class CostGovernor:
    """비용/재시도 제한 관리."""

    def __init__(self, budget: float = 5.0, max_retries: int = 3):
        normalized_budget = float(budget)
        normalized_retries = int(max_retries)
        if not math.isfinite(normalized_budget) or normalized_budget < 0:
            raise ValueError(f"invalid_budget:{budget}")
        if normalized_retries < 0:
            raise ValueError(f"invalid_max_retries:{max_retries}")
        self.budget = normalized_budget
        self.max_retries = normalized_retries
        self.spent = 0.0
        self.retry_counts: Dict[str, int] = {}

    def can_execute(self, task: Task) -> Tuple[bool, str]:
        if self.spent >= self.budget:
            return False, f"예산 초과: ${self.spent:.4f} / ${self.budget:.2f}"
        retries = self.retry_counts.get(task.id, 0)
        if retries >= self.max_retries:
            return False, f"재시도 초과: {retries}/{self.max_retries}"
        return True, "OK"

    def record_cost(self, task_id: str, cost: float) -> None:
        normalized = float(cost)
        if not math.isfinite(normalized) or normalized < 0:
            raise ValueError(f"invalid_task_cost:{task_id}:{cost}")
        self.spent += normalized

    def record_retry(self, task_id: str) -> None:
        self.retry_counts[task_id] = self.retry_counts.get(task_id, 0) + 1

    def status(self) -> Dict[str, float]:
        usage_percent = round((self.spent / self.budget) * 100, 1) if self.budget > 0 else 100.0
        return {
            "spent": round(self.spent, 4),
            "budget": self.budget,
            "remaining": round(max(0.0, self.budget - self.spent), 4),
            "usage_percent": usage_percent,
        }
