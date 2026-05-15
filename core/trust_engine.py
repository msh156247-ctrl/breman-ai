from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

from .decision_log import DecisionLog


class TrustEngine:
    """멤버별 신뢰 지표 계산 (v1: 로그 기반 단순 집계)."""

    def __init__(self, trust_log_path: str | Path):
        self.log = DecisionLog(trust_log_path)

    def append_event(self, event: Dict[str, Any]) -> None:
        self.log.append(event)

    def _collect_member_events(self, member_id: str) -> List[Dict[str, Any]]:
        if not self.log.path.exists():
            return []
        events: List[Dict[str, Any]] = []
        for raw in self.log.path.read_text(encoding="utf-8").splitlines():
            text = raw.strip()
            if not text:
                continue
            try:
                import json

                row = json.loads(text)
            except Exception:
                continue
            if row.get("member_id") == member_id:
                events.append(row)
        return events

    def get_trust(self, member_id: str, member_profile: Dict[str, Any] | None = None) -> Dict[str, Any]:
        events = self._collect_member_events(member_id)
        exec_events = [e for e in events if e.get("type") == "member_execution"]
        review_events = [e for e in events if e.get("type") == "member_review"]
        incident_events = [e for e in events if e.get("type") == "member_incident"]

        run_count = len(exec_events)
        success_count = sum(1 for e in exec_events if bool(e.get("success")))
        pass_count = sum(1 for e in review_events if bool(e.get("pass")))
        review_count = len(review_events)
        total_cost = sum(float(e.get("cost", 0.0)) for e in exec_events)
        total_latency = sum(float(e.get("latency_ms", 0.0)) for e in exec_events)

        success_rate = (success_count / run_count) if run_count else 1.0
        review_pass_rate = (pass_count / review_count) if review_count else 1.0
        avg_cost = (total_cost / run_count) if run_count else 0.0
        avg_latency = (total_latency / run_count) if run_count else 0.0
        incident_count = len(incident_events)

        base_score = 100.0
        base_score -= (1.0 - success_rate) * 35.0
        base_score -= (1.0 - review_pass_rate) * 25.0
        base_score -= min(incident_count * 8.0, 30.0)
        base_score -= min(avg_cost * 10.0, 10.0)
        base_score -= min(avg_latency / 3000.0, 10.0)

        # capability 풍부도에 따른 보정 (너무 크게 반영되지 않도록 제한)
        capability_bonus = 0.0
        if member_profile:
            caps = member_profile.get("capabilities", [])
            if isinstance(caps, list):
                capability_bonus = min(len(caps) * 0.8, 6.0)

        score = max(0.0, min(100.0, base_score + capability_bonus))
        return {
            "member_id": member_id,
            "score": round(score, 2),
            "success_rate": round(success_rate, 4),
            "review_pass_rate": round(review_pass_rate, 4),
            "avg_cost": round(avg_cost, 6),
            "avg_latency_ms": round(avg_latency, 2),
            "incident_count": incident_count,
            "run_count": run_count,
            "review_count": review_count,
        }
