from __future__ import annotations

import json
import os
from contextlib import contextmanager
from pathlib import Path
import sqlite3
from threading import Lock
from typing import Any, Dict, Iterable, Iterator, List


DECISION_LOG_MAX_BYTES_ENV = "BREMEN_DECISION_LOG_MAX_BYTES"
DECISION_LOG_ARCHIVE_COUNT_ENV = "BREMEN_DECISION_LOG_ARCHIVE_COUNT"
DEFAULT_DECISION_LOG_MAX_BYTES = 8 * 1024 * 1024
DEFAULT_DECISION_LOG_ARCHIVE_COUNT = 5


def _bounded_env_int(name: str, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(os.getenv(name, str(default)))
    except (TypeError, ValueError):
        value = default
    return min(maximum, max(minimum, value))


class DecisionLog:
    """Indexed JSONL event log with bounded archive rotation."""

    def __init__(
        self,
        file_path: str | Path,
        *,
        max_bytes: int | None = None,
        archive_count: int | None = None,
    ):
        self.path = Path(file_path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.max_bytes = max(
            1024,
            max_bytes
            if max_bytes is not None
            else _bounded_env_int(
                DECISION_LOG_MAX_BYTES_ENV,
                DEFAULT_DECISION_LOG_MAX_BYTES,
                1024,
                1024 * 1024 * 1024,
            ),
        )
        self.archive_count = max(
            0,
            archive_count
            if archive_count is not None
            else _bounded_env_int(
                DECISION_LOG_ARCHIVE_COUNT_ENV,
                DEFAULT_DECISION_LOG_ARCHIVE_COUNT,
                0,
                100,
            ),
        )
        self.index_path = self.path.with_name(f"{self.path.name}.index.sqlite3")
        self._lock = Lock()
        with self._lock:
            self._ensure_index_locked()

    def append(self, event: Dict[str, Any]) -> None:
        line = json.dumps(event, ensure_ascii=False, default=str)
        encoded_size = len((line + "\n").encode("utf-8"))
        with self._lock:
            self._ensure_index_locked()
            current_size = self.path.stat().st_size if self.path.exists() else 0
            if current_size > 0 and current_size + encoded_size > self.max_bytes:
                self._rotate_locked()
                self._rebuild_index_locked()
            with self.path.open("a", encoding="utf-8") as file_handle:
                file_handle.write(line + "\n")
            with self._connect() as connection:
                self._insert_event(connection, event, line)
                self._set_index_signature(connection, self._segments_signature())

    def list_by_mission(self, mission_id: str) -> List[Dict[str, Any]]:
        with self._lock:
            self._ensure_index_locked()
            with self._connect() as connection:
                rows = connection.execute(
                    """
                    SELECT payload
                    FROM events
                    WHERE mission_id = ?
                    ORDER BY timestamp ASC, id ASC
                    """,
                    (mission_id,),
                ).fetchall()
        return self._decode_rows(rows)

    def list_all(self) -> List[Dict[str, Any]]:
        with self._lock:
            self._ensure_index_locked()
            with self._connect() as connection:
                rows = connection.execute(
                    "SELECT payload FROM events ORDER BY timestamp ASC, id ASC"
                ).fetchall()
        return self._decode_rows(rows)

    def storage_status(self) -> Dict[str, Any]:
        with self._lock:
            self._ensure_index_locked()
            segments = self._segments()
            with self._connect() as connection:
                event_count = int(connection.execute("SELECT COUNT(*) FROM events").fetchone()[0])
        return {
            "path": str(self.path),
            "index_path": str(self.index_path),
            "max_bytes": self.max_bytes,
            "archive_count": self.archive_count,
            "segments": [
                {"path": str(segment), "bytes": segment.stat().st_size}
                for segment in segments
                if segment.exists()
            ],
            "event_count": event_count,
        }

    @staticmethod
    def _timestamp(item: Dict[str, Any]) -> float:
        try:
            return float(item.get("timestamp", 0))
        except (TypeError, ValueError):
            return 0.0

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        connection = sqlite3.connect(self.index_path, timeout=10)
        try:
            connection.execute("PRAGMA journal_mode=WAL")
            connection.execute("PRAGMA synchronous=NORMAL")
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS events (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    mission_id TEXT NOT NULL DEFAULT '',
                    timestamp REAL NOT NULL DEFAULT 0,
                    payload TEXT NOT NULL
                )
                """
            )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS ix_decision_events_mission_timestamp "
                "ON events(mission_id, timestamp, id)"
            )
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS metadata (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                )
                """
            )
            yield connection
            connection.commit()
        finally:
            connection.close()

    def _archive_path(self, index: int) -> Path:
        return self.path.with_name(f"{self.path.stem}.{index}{self.path.suffix}")

    def _segments(self) -> List[Path]:
        archives = [
            self._archive_path(index)
            for index in range(self.archive_count, 0, -1)
            if self._archive_path(index).exists()
        ]
        if self.path.exists():
            archives.append(self.path)
        return archives

    def _segments_signature(self) -> str:
        rows = []
        for segment in self._segments():
            stat = segment.stat()
            rows.append(
                {
                    "path": segment.name,
                    "size": stat.st_size,
                    "mtime_ns": stat.st_mtime_ns,
                }
            )
        return json.dumps(rows, separators=(",", ":"), sort_keys=True)

    def _ensure_index_locked(self) -> None:
        with self._connect() as connection:
            row = connection.execute(
                "SELECT value FROM metadata WHERE key = 'segments_signature'"
            ).fetchone()
            stored_signature = str(row[0]) if row else ""
        if stored_signature != self._segments_signature():
            self._rebuild_index_locked()

    def _rebuild_index_locked(self) -> None:
        with self._connect() as connection:
            connection.execute("DELETE FROM events")
            for event, raw_payload in self._iter_segment_events():
                self._insert_event(connection, event, raw_payload)
            self._set_index_signature(connection, self._segments_signature())

    def _iter_segment_events(self) -> Iterable[tuple[Dict[str, Any], str]]:
        for segment in self._segments():
            with segment.open("r", encoding="utf-8") as file_handle:
                for raw in file_handle:
                    text = raw.strip()
                    if not text:
                        continue
                    try:
                        event = json.loads(text)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(event, dict):
                        yield event, text

    def _insert_event(
        self,
        connection: sqlite3.Connection,
        event: Dict[str, Any],
        payload: str,
    ) -> None:
        connection.execute(
            "INSERT INTO events(mission_id, timestamp, payload) VALUES (?, ?, ?)",
            (
                str(event.get("mission_id") or ""),
                self._timestamp(event),
                payload,
            ),
        )

    @staticmethod
    def _set_index_signature(connection: sqlite3.Connection, signature: str) -> None:
        connection.execute(
            """
            INSERT INTO metadata(key, value)
            VALUES ('segments_signature', ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value
            """,
            (signature,),
        )

    def _rotate_locked(self) -> None:
        if self.archive_count <= 0:
            self.path.unlink(missing_ok=True)
            return
        oldest = self._archive_path(self.archive_count)
        oldest.unlink(missing_ok=True)
        for index in range(self.archive_count - 1, 0, -1):
            source = self._archive_path(index)
            if source.exists():
                source.replace(self._archive_path(index + 1))
        if self.path.exists():
            self.path.replace(self._archive_path(1))

    @staticmethod
    def _decode_rows(rows: Iterable[tuple[str]]) -> List[Dict[str, Any]]:
        events: List[Dict[str, Any]] = []
        for (payload,) in rows:
            try:
                event = json.loads(payload)
            except json.JSONDecodeError:
                continue
            if isinstance(event, dict):
                events.append(event)
        return events
