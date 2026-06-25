from __future__ import annotations

from typing import Dict, List

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self.global_connections: List[WebSocket] = []
        self.mission_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, mission_id: str | None = None) -> None:
        await websocket.accept()
        if mission_id:
            self.mission_connections.setdefault(mission_id, []).append(websocket)
        else:
            self.global_connections.append(websocket)

    def disconnect(self, websocket: WebSocket, mission_id: str | None = None) -> None:
        if websocket in self.global_connections:
            self.global_connections.remove(websocket)
        if mission_id and mission_id in self.mission_connections:
            connections = self.mission_connections[mission_id]
            if websocket in connections:
                connections.remove(websocket)
            if not connections:
                self.mission_connections.pop(mission_id, None)

    async def broadcast_to_mission(self, mission_id: str, message: dict) -> None:
        disconnected: List[WebSocket] = []
        for connection in self.mission_connections.get(mission_id, []):
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for connection in disconnected:
            self.disconnect(connection, mission_id)

    async def broadcast_all(self, message: dict) -> None:
        disconnected: List[WebSocket] = []
        for connection in list(self.global_connections):
            try:
                await connection.send_json(message)
            except Exception:
                disconnected.append(connection)
        for connection in disconnected:
            self.disconnect(connection)
