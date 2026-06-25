from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    WAITING_INPUT = "waiting_input"
    SKIPPED = "skipped"
    COMPLETED = "completed"
    FAILED = "failed"


class MissionStatus(Enum):
    PLANNING = "planning"
    RUNNING = "running"
    AWAITING_APPROVAL = "awaiting_approval"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Task:
    id: str
    description: str
    role: str
    dependencies: List[str] = field(default_factory=list)
    status: TaskStatus = TaskStatus.PENDING
    artifacts: Dict[str, Any] = field(default_factory=dict)
    retry_count: int = 0
    cost: float = 0.0
    confidence: float = 0.0
    error_message: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "description": self.description,
            "role": self.role,
            "dependencies": self.dependencies,
            "status": self.status.value,
            "artifacts": self.artifacts,
            "confidence": self.confidence,
            "cost": self.cost,
            "retry_count": self.retry_count,
            "error_message": self.error_message,
            "metadata": self.metadata,
        }


@dataclass
class Mission:
    goal: str
    id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    status: MissionStatus = MissionStatus.PLANNING
    tasks: Dict[str, Task] = field(default_factory=dict)
    total_cost: float = 0.0
    budget: float = 5.0
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "goal": self.goal,
            "status": self.status.value,
            "total_cost": self.total_cost,
            "budget": self.budget,
            "created_at": self.created_at.isoformat(),
            "tasks": [task.to_dict() for task in self.tasks.values()],
        }
