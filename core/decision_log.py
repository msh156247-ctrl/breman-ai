from __future__ import annotations

import json
from pathlib import Path
from threading import Lock
from typing import Any, Dict, List


class DecisionLog:
    """간단한 JSONL 기반 의사결정/이벤트 로그 저장소."""

    def __init__(self, file_path: str | Path):
        self.path = Path(file_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()

    def append(self, event: Dict[str, Any]) -> None:
        line = json.dumps(event, ensure_ascii=False)
        with self._lock:
            with self.path.open("a", encoding="utf-8") as f:
                f.write(line + "\n")

    def list_by_mission(self, mission_id: str) -> List[Dict[str, Any]]:
        if not self.path.exists():
            return []
        rows: List[Dict[str, Any]] = []
        with self.path.open("r", encoding="utf-8") as f:
            for raw in f:
                text = raw.strip()
                if not text:
                    continue
                try:
                    event = json.loads(text)
                except json.JSONDecodeError:
                    continue
                if event.get("mission_id") == mission_id:
                    rows.append(event)
        rows.sort(key=lambda item: float(item.get("timestamp", 0)))
        return rows
