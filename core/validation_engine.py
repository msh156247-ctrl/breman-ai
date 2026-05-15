from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List

import yaml


@dataclass
class ValidationResult:
    passed: bool
    reasons: List[str] = field(default_factory=list)


class ValidationEngine:
    TYPE_MAP = {
        "string": str,
        "number": (int, float),
        "integer": int,
        "boolean": bool,
        "object": dict,
        "array": list,
    }

    def __init__(self, schema_path: str | Path):
        target = Path(schema_path)
        if not target.exists():
            raise FileNotFoundError(f"Artifact schema file not found: {target}")
        raw = yaml.safe_load(target.read_text(encoding="utf-8")) or {}
        if not isinstance(raw, dict):
            raise ValueError("Artifact schema must be a mapping")
        schemas = raw.get("schemas", {})
        if not isinstance(schemas, dict):
            raise ValueError("schemas must be a mapping")
        self.schemas: Dict[str, Dict[str, Any]] = schemas

    def validate(self, role: str, artifacts: Dict[str, Any]) -> ValidationResult:
        schema = self.schemas.get(role)
        if not isinstance(schema, dict):
            return ValidationResult(False, [f"schema_not_found_for_role:{role}"])
        if not isinstance(artifacts, dict):
            return ValidationResult(False, ["artifacts_not_object"])

        reasons: List[str] = []
        required_keys = schema.get("required_keys", [])
        key_types = schema.get("key_types", {})
        if not isinstance(required_keys, list) or not isinstance(key_types, dict):
            return ValidationResult(False, [f"invalid_schema_definition:{role}"])

        for key in required_keys:
            if key not in artifacts:
                reasons.append(f"missing_key:{key}")

        for key, expected_name in key_types.items():
            if key not in artifacts:
                continue
            expected_type = self.TYPE_MAP.get(str(expected_name))
            if expected_type is None:
                continue
            if not isinstance(artifacts[key], expected_type):
                reasons.append(f"type_mismatch:{key}:{expected_name}")

        return ValidationResult(passed=(len(reasons) == 0), reasons=reasons)
