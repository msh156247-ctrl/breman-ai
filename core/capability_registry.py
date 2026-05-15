from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import yaml


class CapabilityRegistry:
    def __init__(self, path: str | Path):
        target = Path(path)
        if not target.exists():
            raise FileNotFoundError(f"Capabilities file not found: {target}")
        raw = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
        if not isinstance(raw, dict):
            raise ValueError("Capabilities config must be a mapping")
        capabilities = raw.get("capabilities", [])
        if not isinstance(capabilities, list):
            raise ValueError("capabilities must be a list")

        self.version = str(raw.get("version", "unknown"))
        self._capabilities: List[Dict[str, Any]] = []
        self._by_id: Dict[str, Dict[str, Any]] = {}
        for item in capabilities:
            if not isinstance(item, dict):
                continue
            cap_id = str(item.get("id", "")).strip()
            if not cap_id:
                continue
            row = {
                "id": cap_id,
                "category": str(item.get("category", "general")),
                "description": str(item.get("description", "")),
            }
            self._capabilities.append(row)
            self._by_id[cap_id] = row

    def list_all(self) -> List[Dict[str, Any]]:
        return list(self._capabilities)

    def exists(self, cap_id: str) -> bool:
        return cap_id in self._by_id

    def validate(self, cap_ids: List[str]) -> Dict[str, List[str]]:
        valid: List[str] = []
        invalid: List[str] = []
        for cap in cap_ids:
            if self.exists(cap):
                valid.append(cap)
            else:
                invalid.append(cap)
        return {"valid": valid, "invalid": invalid}
