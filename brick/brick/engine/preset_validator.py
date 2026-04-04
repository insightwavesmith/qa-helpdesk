"""PresetValidator — 프리셋 스키마 검증. 에러가 있으면 워크플로우 시작을 차단."""

from __future__ import annotations

import re
from dataclasses import dataclass

# 기본값 상수 (하위호환 — 레지스트리 미전달 시 사용)
DEFAULT_LINK_TYPES = {"sequential", "parallel", "compete", "loop", "cron", "branch", "hook"}
DEFAULT_GATE_TYPES = {"command", "http", "prompt", "agent", "review", "metric", "approval", "artifact"}
DEFAULT_ADAPTERS = {"claude_agent_teams", "claude_code", "claude_local", "codex", "human",
                    "human_management", "management", "mcp_bridge", "webhook"}


@dataclass
class ValidationError:
    field: str
    message: str
    severity: str = "error"  # error | warning


class PresetValidator:
    """프리셋 로드 시 스키마 검증. 에러가 있으면 워크플로우 시작을 차단."""

    def __init__(
        self,
        gate_types: set[str] | None = None,
        link_types: set[str] | None = None,
        adapter_types: set[str] | None = None,
    ):
        # 레지스트리 미전달 시 기존 상수를 기본값으로 (하위호환)
        self._gate_types = gate_types if gate_types is not None else DEFAULT_GATE_TYPES
        self._link_types = link_types if link_types is not None else DEFAULT_LINK_TYPES
        self._adapter_types = adapter_types if adapter_types is not None else DEFAULT_ADAPTERS

    def validate(self, definition: 'WorkflowDefinition') -> list[ValidationError]:
        errors: list[ValidationError] = []

        block_ids = set()
        for block in definition.blocks:
            # 블록 ID 중복 검사
            if block.id in block_ids:
                errors.append(ValidationError(
                    field=f"blocks[{block.id}]",
                    message=f"블록 ID '{block.id}' 중복",
                ))
            block_ids.add(block.id)

            # what 필드 존재 확인
            if not block.what:
                errors.append(ValidationError(
                    field=f"blocks[{block.id}].what",
                    message=f"블록 '{block.id}'에 what 필드 없음",
                ))

        # 링크 검증
        for i, link in enumerate(definition.links):
            # from/to 블록 존재 확인
            if link.from_block not in block_ids:
                errors.append(ValidationError(
                    field=f"links[{i}].from",
                    message=f"링크 from '{link.from_block}'이 존재하지 않는 블록",
                ))
            if link.to_block not in block_ids:
                errors.append(ValidationError(
                    field=f"links[{i}].to",
                    message=f"링크 to '{link.to_block}'이 존재하지 않는 블록",
                ))

            # 링크 타입 유효성
            if link.type not in self._link_types:
                errors.append(ValidationError(
                    field=f"links[{i}].type",
                    message=f"알 수 없는 링크 타입: '{link.type}'",
                ))

            # cron 링크에 schedule 필수
            if link.type == "cron" and not link.schedule:
                errors.append(ValidationError(
                    field=f"links[{i}].schedule",
                    message=f"cron 링크에 schedule 필드 없음",
                ))

            # compete 링크에 teams 경고
            if link.type == "compete" and not link.teams:
                errors.append(ValidationError(
                    field=f"links[{i}].teams",
                    message=f"compete 링크에 teams 없음 — sequential로 동작",
                    severity="warning",
                ))

            # condition 파싱 검증
            if link.condition and isinstance(link.condition, str):
                if not self._validate_condition_syntax(link.condition):
                    errors.append(ValidationError(
                        field=f"links[{i}].condition",
                        message=f"조건식 파싱 불가: '{link.condition}'",
                    ))

        # 팀 검증
        for block in definition.blocks:
            if block.id not in definition.teams:
                errors.append(ValidationError(
                    field=f"teams[{block.id}]",
                    message=f"블록 '{block.id}'에 팀 미할당",
                ))
            else:
                team = definition.teams[block.id]
                if team.adapter not in self._adapter_types:
                    errors.append(ValidationError(
                        field=f"teams[{block.id}].adapter",
                        message=f"알 수 없는 어댑터: '{team.adapter}'",
                        severity="warning",
                    ))

        # gate handler 타입 검증
        for block in definition.blocks:
            if block.gate:
                for j, handler in enumerate(block.gate.handlers):
                    if handler.type not in self._gate_types:
                        errors.append(ValidationError(
                            field=f"blocks[{block.id}].gate.handlers[{j}].type",
                            message=f"알 수 없는 게이트 타입: '{handler.type}'",
                        ))

        return errors

    def _validate_condition_syntax(self, condition: str) -> bool:
        """조건식 문법 검증 (평가하지 않고 파싱만)."""
        pattern = r'^\s*\w+\s*(>=|<=|>|<|==|!=)\s*.+\s*$'
        return bool(re.match(pattern, condition.strip()))
