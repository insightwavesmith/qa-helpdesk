"""TeammateLifecycleManager — 팀원 수명관리."""

from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from brick.models.team import TeamDefinition


class TeammateLifecycleManager:
    """팀원 idle 감지 → 정책 기반 조치."""

    def __init__(self, adapter):
        self.adapter = adapter
        self._timers: dict[str, float] = {}

    def _find_spec(self, teammate_name: str, team_def: TeamDefinition):
        """TeamDefinition에서 teammate spec 찾기."""
        for spec in team_def.teammates:
            if spec.name == teammate_name:
                return spec
        return None

    async def on_teammate_idle(self, teammate_name: str, team_def: TeamDefinition):
        """팀원 idle 감지 시 정책 실행."""
        spec = self._find_spec(teammate_name, team_def)

        # ephemeral은 항상 terminate
        if spec and spec.lifetime == "ephemeral":
            await self.adapter.terminate_member(teammate_name)
            return

        # persistent는 idle_policy에 따라 처리
        policy = team_def.idle_policy

        # timeout 대기
        if policy.timeout_seconds > 0:
            await asyncio.sleep(policy.timeout_seconds)

        # notify_before 처리
        if policy.notify_before:
            await self._notify_leader(
                teammate_name, policy.action
            )

        if policy.action == "terminate":
            await self.adapter.terminate_member(teammate_name)
        elif policy.action == "suspend":
            await self.adapter.suspend_member(teammate_name)
        elif policy.action == "keep":
            pass  # 아무것도 안 함

    def on_task_assigned(self, teammate_name: str):
        """TASK 배정 → idle 타이머 리셋."""
        self._timers.pop(teammate_name, None)

    async def _notify_leader(self, teammate_name: str, action: str):
        """리더에게 알림 전송."""
        pass  # 실제 구현은 adapter의 send_signal 등 사용
