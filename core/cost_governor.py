from __future__ import annotations

from typing import Dict, Tuple

from .models import Task


class CostGovernor:
    """비용/재시도 제한 관리."""

    def __init__(self, budget: float = 5.0, max_retries: int = 3):
        self.budget = budget
        self.max_retries = max_retries
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
        self.spent += cost

    def record_retry(self, task_id: str) -> None:
        self.retry_counts[task_id] = self.retry_counts.get(task_id, 0) + 1

    def status(self) -> Dict[str, float]:
        return {
            "spent": round(self.spent, 4),
            "budget": self.budget,
            "remaining": round(self.budget - self.spent, 4),
            "usage_percent": round((self.spent / self.budget) * 100, 1),
        }
