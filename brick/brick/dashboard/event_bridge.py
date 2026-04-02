"""EventBridge — Engine EventBus → WebSocket relay with filters and reconnection."""

from __future__ import annotations

import asyncio
import json
import time
from collections import deque
from dataclasses import dataclass, field

from brick.engine.event_bus import EventBus
from brick.engine.checkpoint import CheckpointStore
from brick.models.events import Event


@dataclass
class WebSocketClient:
    """Represents a connected WebSocket client with optional filters."""
    send: callable  # async callable to send message
    workflow_filter: str = ""  # empty = all
    type_filter: str = ""  # empty = all, supports prefix match like "block.*"
    last_seq: int = 0
    connected_at: float = field(default_factory=time.time)


class EventBridge:
    """Bridges Engine EventBus events to WebSocket clients."""

    BUFFER_MAX = 1000
    BUFFER_TTL = 300  # 5 minutes

    def __init__(self, event_bus: EventBus | None = None, checkpoint: CheckpointStore | None = None):
        self.event_bus = event_bus
        self.checkpoint = checkpoint
        self._clients: list[WebSocketClient] = []
        self._buffer: deque = deque(maxlen=self.BUFFER_MAX)
        self._sequence: int = 0

        if self.event_bus:
            self.event_bus.subscribe("*", self._on_engine_event)

    def _on_engine_event(self, event: Event) -> None:
        """Called when Engine emits an event. Queue for WS broadcast."""
        self._sequence += 1
        message = {
            "type": event.type,
            "data": event.data,
            "timestamp": event.timestamp,
            "sequence": self._sequence,
        }
        if "workflow_id" in event.data:
            message["workflow_id"] = event.data["workflow_id"]
        if "block_id" in event.data:
            message["block_id"] = event.data["block_id"]
        self._buffer.append({"message": message, "time": time.time()})

    async def broadcast(self, message: dict) -> None:
        """Send message to all matching clients."""
        for client in list(self._clients):
            if self._matches_filters(client, message):
                try:
                    await client.send(json.dumps(message))
                except Exception:
                    self._clients.remove(client)

    def _matches_filters(self, client: WebSocketClient, message: dict) -> bool:
        """Check if message matches client's filters."""
        # Workflow filter
        if client.workflow_filter:
            msg_wf = message.get("workflow_id", "")
            if client.workflow_filter.endswith("*"):
                if not msg_wf.startswith(client.workflow_filter[:-1]):
                    return False
            elif msg_wf != client.workflow_filter:
                return False

        # Type filter (supports prefix match like "block.*")
        if client.type_filter:
            msg_type = message.get("type", "")
            if client.type_filter.endswith("*"):
                if not msg_type.startswith(client.type_filter[:-1]):
                    return False
            elif msg_type != client.type_filter:
                return False

        return True

    async def connect(self, client: WebSocketClient) -> None:
        """Register client and send initial snapshot."""
        self._clients.append(client)
        snapshot = await self._build_snapshot()
        await client.send(json.dumps(snapshot))

    async def disconnect(self, client: WebSocketClient) -> None:
        """Remove client."""
        if client in self._clients:
            self._clients.remove(client)

    async def handle_reconnect(self, client: WebSocketClient, last_seq: int) -> None:
        """Handle reconnection: send missed events or full snapshot."""
        self._clients.append(client)

        now = time.time()
        buffer_events = [
            e for e in self._buffer
            if e["message"].get("sequence", 0) > last_seq
            and now - e["time"] <= self.BUFFER_TTL
        ]

        if buffer_events and last_seq > 0 and (now - client.connected_at <= self.BUFFER_TTL):
            for evt in buffer_events:
                if self._matches_filters(client, evt["message"]):
                    await client.send(json.dumps(evt["message"]))
        else:
            snapshot = await self._build_snapshot()
            await client.send(json.dumps(snapshot))

    async def _build_snapshot(self) -> dict:
        """Build sync.snapshot message from checkpoint store."""
        workflows = []
        if self.checkpoint:
            for wf_id in self.checkpoint.list_active():
                instance = self.checkpoint.load(wf_id)
                if instance:
                    workflows.append({
                        "id": instance.id,
                        "status": instance.status.value,
                        "current_block": instance.current_block_id,
                        "feature": instance.feature,
                    })
        return {
            "type": "sync.snapshot",
            "workflows": workflows,
            "sequence": self._sequence,
        }
