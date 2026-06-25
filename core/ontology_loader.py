from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict

import yaml


@dataclass
class Ontology:
    raw: Dict[str, Any]

    @property
    def roles(self) -> Dict[str, Dict[str, Any]]:
        roles = self.raw.get("roles", {})
        return roles if isinstance(roles, dict) else {}

    @property
    def workflows(self) -> Dict[str, Dict[str, Any]]:
        workflows = self.raw.get("workflows", {})
        return workflows if isinstance(workflows, dict) else {}

    @property
    def units(self) -> Dict[str, Dict[str, Any]]:
        units = self.raw.get("units", {})
        return units if isinstance(units, dict) else {}


def load_ontology(path: str | Path) -> Ontology:
    target = Path(path)
    if not target.exists():
        raise FileNotFoundError(f"Ontology file not found: {target}")
    data = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
    if not isinstance(data, dict):
        raise ValueError("Ontology must be a mapping object")
    return Ontology(raw=data)
