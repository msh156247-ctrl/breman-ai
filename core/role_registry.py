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
        for role_name, role_raw in ontology.roles.items():
            if not isinstance(role_raw, dict):
                continue
            self._profiles[role_name] = RoleProfile(
                name=role_name,
                can_read=list(role_raw.get("can_read", [])),
                can_execute=list(role_raw.get("can_execute", [])),
                can_write=list(role_raw.get("can_write", [])),
                needs_approval=list(role_raw.get("needs_approval", [])),
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
