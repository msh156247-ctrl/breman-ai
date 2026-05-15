from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List
import os

import yaml


@dataclass
class PolicyCheckResult:
    allowed: bool
    reasons: List[str] = field(default_factory=list)
    warnings: List[str] = field(default_factory=list)
    details: Dict[str, Any] = field(default_factory=dict)


class PolicyEngine:
    def __init__(self, policy_path: str | Path, policy_set: str = "default"):
        target = Path(policy_path)
        if not target.exists():
            raise FileNotFoundError(f"Policy file not found: {target}")
        raw = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
        if not isinstance(raw, dict):
            raise ValueError("Policy file must be a mapping")
        sets = raw.get("policy_sets", {})
        if not isinstance(sets, dict):
            raise ValueError("policy_sets must be a mapping")
        selected = sets.get(policy_set, {})
        if not isinstance(selected, dict):
            raise ValueError(f"Policy set not found or invalid: {policy_set}")
        self.policy_set_name = policy_set
        self.rules = selected
        self.version = str(raw.get("version", "unknown"))

    def check_mission_start(self, budget: float, use_mock: bool) -> PolicyCheckResult:
        reasons: List[str] = []
        warnings: List[str] = []

        max_budget = float(self.rules.get("max_budget_per_mission", 999999))
        if budget > max_budget:
            reasons.append(f"budget_exceeds_policy:{budget}>{max_budget}")

        require_key = bool(self.rules.get("require_api_key_when_real_mode", True))
        if require_key and (not use_mock) and (not os.getenv("OPENAI_API_KEY")):
            reasons.append("real_mode_without_openai_api_key")

        return PolicyCheckResult(
            allowed=(len(reasons) == 0),
            reasons=reasons,
            warnings=warnings,
            details={
                "budget": budget,
                "max_budget_per_mission": max_budget,
                "use_mock": use_mock,
                "policy_set": self.policy_set_name,
            },
        )

    def check_task_execution(
        self,
        role: str,
        spent: float,
        budget: float,
        external_publish: bool = False,
    ) -> PolicyCheckResult:
        reasons: List[str] = []
        warnings: List[str] = []

        blocked_roles = self.rules.get("blocked_task_roles", [])
        if isinstance(blocked_roles, list) and role in blocked_roles:
            reasons.append(f"role_blocked_by_policy:{role}")

        approval_roles = self.rules.get("approval_required_roles", [])
        if isinstance(approval_roles, list) and role in approval_roles:
            warnings.append(f"approval_required_for_role:{role}")

        if bool(self.rules.get("external_publish_block", True)) and external_publish:
            reasons.append("external_publish_blocked")

        ratio = (spent / budget) if budget > 0 else 0.0
        soft_warn_ratio = float(self.rules.get("soft_spend_ratio_warning", 0.9))
        if ratio >= soft_warn_ratio:
            warnings.append(f"high_spend_ratio:{round(ratio, 3)}")

        return PolicyCheckResult(
            allowed=(len(reasons) == 0),
            reasons=reasons,
            warnings=warnings,
            details={
                "role": role,
                "spent": spent,
                "budget": budget,
                "spend_ratio": round(ratio, 4),
                "policy_set": self.policy_set_name,
            },
        )
