from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List

from .ontology_loader import Ontology


@dataclass
class RoleProfile:
    name: str
    can_read: List[str]
    can_execute: List[str]
    can_write: List[str]
    needs_approval: List[str]


class RoleRegistry:
    def __init__(self, ontology: Ontology):
        self._profiles: Dict[str, RoleProfile] = {}

        def string_list(value: Any) -> List[str]:
            if not isinstance(value, list):
                return []
            return [str(item).strip() for item in value if str(item).strip()]

        for role_name, role_raw in ontology.roles.items():
            if not isinstance(role_raw, dict):
                continue
            self._profiles[role_name] = RoleProfile(
                name=role_name,
                can_read=string_list(role_raw.get("can_read")),
                can_execute=string_list(role_raw.get("can_execute")),
                can_write=string_list(role_raw.get("can_write")),
                needs_approval=string_list(role_raw.get("needs_approval")),
            )

    def get(self, role_name: str) -> RoleProfile | None:
        return self._profiles.get(role_name)

    def as_dict(self) -> Dict[str, Dict[str, Any]]:
        return {
            name: {
                "can_read": profile.can_read,
                "can_execute": profile.can_execute,
                "can_write": profile.can_write,
                "needs_approval": profile.needs_approval,
            }
            for name, profile in self._profiles.items()
        }
