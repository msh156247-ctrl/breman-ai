from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List


VALID_SCOPES = {"global", "team", "mission", "member", "ephemeral"}


@dataclass
class MemoryRecord:
    scope: str
    scope_id: str
    key: str
    value: Any
    classification: str = "internal"


class MemoryScopeEngine:
    """
    메모리 스코프 엔진.
    - 저장은 (scope, scope_id) 버킷으로 분리
    - cross-scope 전송은 정책 기반 필터로 허용/차단
    """

    def __init__(self) -> None:
        self._storage: Dict[str, Dict[str, Dict[str, MemoryRecord]]] = {}

    def put(self, record: MemoryRecord) -> None:
        if record.scope not in VALID_SCOPES:
            raise ValueError(f"invalid_scope:{record.scope}")
        self._storage.setdefault(record.scope, {}).setdefault(record.scope_id, {})[record.key] = record

    def get_scope(self, scope: str, scope_id: str) -> List[Dict[str, Any]]:
        bucket = self._storage.get(scope, {}).get(scope_id, {})
        return [
            {
                "scope": rec.scope,
                "scope_id": rec.scope_id,
                "key": rec.key,
                "value": rec.value,
                "classification": rec.classification,
            }
            for rec in bucket.values()
        ]

    def filter_transfer(
        self,
        source_scope: str,
        source_scope_id: str,
        target_scope: str,
        target_scope_id: str,
        allow_external: bool = False,
    ) -> Dict[str, Any]:
        if source_scope not in VALID_SCOPES:
            return {"allowed": False, "reasons": [f"invalid_source_scope:{source_scope}"], "records": []}
        if target_scope not in VALID_SCOPES:
            return {"allowed": False, "reasons": [f"invalid_target_scope:{target_scope}"], "records": []}

        source_records = self.get_scope(source_scope, source_scope_id)
        reasons: List[str] = []

        # 기본 정책:
        # - ephemeral은 외부 스코프로 승격 불가
        if source_scope == "ephemeral" and target_scope != "ephemeral":
            reasons.append("ephemeral_cannot_promote_to_persistent_scope")

        # - member -> global 전송 차단 (승격 위험)
        if source_scope == "member" and target_scope == "global":
            reasons.append("member_to_global_blocked")

        # - classification=restricted 는 external publish 금지
        restricted_records = [r for r in source_records if str(r.get("classification")) == "restricted"]
        if restricted_records and not allow_external and target_scope in {"team", "global"}:
            reasons.append("restricted_records_cannot_publish_without_override")

        allowed = len(reasons) == 0
        if not allowed:
            return {"allowed": False, "reasons": reasons, "records": []}

        # 허용 시 target 버킷으로 복사
        for row in source_records:
            self.put(
                MemoryRecord(
                    scope=target_scope,
                    scope_id=target_scope_id,
                    key=row["key"],
                    value=row["value"],
                    classification=str(row.get("classification", "internal")),
                )
            )
        return {"allowed": True, "reasons": [], "records": source_records}
