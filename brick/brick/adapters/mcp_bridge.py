"""MCPBridge — claude-peers 기반 TASK 전달 브릿지."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import aiohttp


class MCPBridge:
    """claude-peers broker를 통한 MCP 메시지 전달."""

    def __init__(self, broker_port: int = 7899, cache_dir: Path | None = None):
        self.broker_port = broker_port
        self.cache_dir = cache_dir or Path(".bkit/runtime")
        self._peer_cache: dict[str, str] = {}

    async def find_peer(self, session: str, role: str) -> str | None:
        """peer-map.json → broker API 순서로 peer_id 탐색."""
        # 1) 캐시 확인
        cache_key = f"{session}:{role}"
        if cache_key in self._peer_cache:
            return self._peer_cache[cache_key]

        # 2) peer-map.json 파일에서 탐색
        peer_map_path = self.cache_dir / "peer-map.json"
        if peer_map_path.exists():
            try:
                data = json.loads(peer_map_path.read_text())
                for peer_id, info in data.items():
                    if info.get("session") == session and info.get("role") == role:
                        self._peer_cache[cache_key] = peer_id
                        return peer_id
            except (json.JSONDecodeError, OSError):
                pass

        # 3) broker API 폴백
        try:
            async with aiohttp.ClientSession() as sess:
                resp = await sess.post(
                    f"http://localhost:{self.broker_port}/list_peers",
                    json={"scope": "repo"},
                )
                if resp.status == 200:
                    peers = await resp.json()
                    for peer in peers:
                        summary = peer.get("summary", "")
                        if role in summary and session in summary:
                            peer_id = peer["id"]
                            self._peer_cache[cache_key] = peer_id
                            return peer_id
        except Exception:
            pass

        return None

    async def send_task(
        self,
        peer_id: str,
        message: dict,
        ack_timeout: int = 30,
    ) -> tuple[bool, str | None]:
        """메시지 전송 + ACK 대기. Returns (success, execution_id or error)."""
        try:
            async with aiohttp.ClientSession() as sess:
                # 메시지 전송
                await sess.post(
                    f"http://localhost:{self.broker_port}/send_message",
                    json={"to": peer_id, "text": json.dumps(message)},
                )

                # ACK 대기
                return await self._wait_ack(
                    sess, message.get("execution_id", ""), ack_timeout
                )
        except Exception as e:
            return False, str(e)

    async def _wait_ack(
        self,
        session: aiohttp.ClientSession,
        execution_id: str,
        timeout: int,
    ) -> tuple[bool, str | None]:
        """ACK 메시지 폴링."""
        deadline = asyncio.get_event_loop().time() + timeout
        while asyncio.get_event_loop().time() < deadline:
            try:
                resp = await session.post(
                    f"http://localhost:{self.broker_port}/check_messages",
                    json={},
                )
                if resp.status == 200:
                    messages = await resp.json()
                    for msg in messages:
                        text = msg.get("text", "")
                        try:
                            data = json.loads(text)
                        except (json.JSONDecodeError, TypeError):
                            continue
                        if data.get("type") == "BLOCK_TASK_ACK":
                            if data.get("accepted"):
                                return True, data.get("execution_id", execution_id)
                            return False, data.get("reason", "rejected")
            except Exception:
                pass
            await asyncio.sleep(1)

        return False, "ACK 타임아웃"
