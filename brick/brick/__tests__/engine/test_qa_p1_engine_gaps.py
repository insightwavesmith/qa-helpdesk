"""P1-엔진 95건 QA 갭 테스트.

기존 테스트에서 커버되지 않은 E-GT-017/018, E-PV-005/006, E-PL-007 검증.
"""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest
import yaml

from brick.engine.executor import PresetLoader
from brick.engine.preset_validator import (
    PresetValidator,
    ValidationError,
    DEFAULT_GATE_TYPES,
    DEFAULT_LINK_TYPES,
    DEFAULT_ADAPTERS,
)
from brick.gates.concrete import ConcreteGateExecutor
from brick.models.block import Block, DoneCondition, GateConfig, GateHandler
from brick.models.gate import GateResult
from brick.models.link import LinkDefinition
from brick.models.team import TeamDefinition
from brick.models.workflow import WorkflowDefinition


# ──────────────────────────────────────
# E-GT-017, E-GT-018: metric gate 격리 테스트
# ──────────────────────────────────────


class TestMetricGateIsolation:
    """metric gate가 context에서 변수를 읽어 threshold와 비교하는 동작을 독립 검증."""

    @pytest.mark.asyncio
    async def test_egt017_metric_threshold_pass(self):
        """E-GT-017: actual >= threshold → passed=True."""
        executor = ConcreteGateExecutor()
        handler = GateHandler(type="metric", metric="match_rate", threshold=90.0)
        context = {"match_rate": 95}
        result = await executor._run_metric(handler, context)
        assert result.passed is True
        assert "match_rate" in result.detail
        assert result.metadata["actual"] == 95.0

    @pytest.mark.asyncio
    async def test_egt017_metric_threshold_exact_boundary(self):
        """E-GT-017b: actual == threshold (경계값) → passed=True."""
        executor = ConcreteGateExecutor()
        handler = GateHandler(type="metric", metric="score", threshold=80.0)
        context = {"score": 80}
        result = await executor._run_metric(handler, context)
        assert result.passed is True

    @pytest.mark.asyncio
    async def test_egt017_metric_threshold_fail(self):
        """E-GT-017c: actual < threshold → passed=False."""
        executor = ConcreteGateExecutor()
        handler = GateHandler(type="metric", metric="match_rate", threshold=90.0)
        context = {"match_rate": 70}
        result = await executor._run_metric(handler, context)
        assert result.passed is False

    @pytest.mark.asyncio
    async def test_egt018_metric_missing_variable(self):
        """E-GT-018: context에 변수 없음 → passed=False."""
        executor = ConcreteGateExecutor()
        handler = GateHandler(type="metric", metric="match_rate", threshold=90.0)
        context = {}  # match_rate 없음
        result = await executor._run_metric(handler, context)
        assert result.passed is False
        assert "not found" in result.detail

    @pytest.mark.asyncio
    async def test_egt018_metric_non_numeric(self):
        """E-GT-018b: 변수가 비숫자 → passed=False."""
        executor = ConcreteGateExecutor()
        handler = GateHandler(type="metric", metric="match_rate", threshold=90.0)
        context = {"match_rate": "not-a-number"}
        result = await executor._run_metric(handler, context)
        assert result.passed is False
        assert "not numeric" in result.detail

    @pytest.mark.asyncio
    async def test_egt018_metric_no_threshold(self):
        """E-GT-018c: threshold 미설정 → passed=False."""
        executor = ConcreteGateExecutor()
        handler = GateHandler(type="metric", metric="match_rate", threshold=None)
        context = {"match_rate": 95}
        result = await executor._run_metric(handler, context)
        assert result.passed is False
        assert "No threshold" in result.detail


# ──────────────────────────────────────
# E-PV-005: cron 링크 schedule 누락 검증
# ──────────────────────────────────────


class TestPresetValidatorCronSchedule:
    """PresetValidator가 cron 링크에 schedule 없으면 에러 반환."""

    def test_epv005_cron_schedule_missing(self):
        """E-PV-005: cron link에 schedule 미설정 → 에러."""
        blocks = [
            Block(id="a", what="A", done=DoneCondition()),
            Block(id="b", what="B", done=DoneCondition()),
        ]
        defn = WorkflowDefinition(
            name="cron-test",
            blocks=blocks,
            links=[LinkDefinition(from_block="a", to_block="b", type="cron", schedule="")],
            teams={
                "a": TeamDefinition(block_id="a", adapter="human"),
                "b": TeamDefinition(block_id="b", adapter="human"),
            },
        )
        validator = PresetValidator()
        errors = validator.validate(defn)
        schedule_errors = [e for e in errors if "schedule" in e.message]
        assert len(schedule_errors) >= 1, "cron link without schedule should produce error"

    def test_epv005_cron_schedule_present(self):
        """E-PV-005b: cron link에 schedule 있음 → 에러 없음."""
        blocks = [
            Block(id="a", what="A", done=DoneCondition()),
            Block(id="b", what="B", done=DoneCondition()),
        ]
        defn = WorkflowDefinition(
            name="cron-valid",
            blocks=blocks,
            links=[LinkDefinition(from_block="a", to_block="b", type="cron", schedule="*/5 * * * *")],
            teams={
                "a": TeamDefinition(block_id="a", adapter="human"),
                "b": TeamDefinition(block_id="b", adapter="human"),
            },
        )
        validator = PresetValidator()
        errors = validator.validate(defn)
        schedule_errors = [e for e in errors if "schedule" in e.message]
        assert len(schedule_errors) == 0


# ──────────────────────────────────────
# E-PV-006: 레지스트리 연동 검증
# ──────────────────────────────────────


class TestPresetValidatorRegistry:
    """PresetValidator가 실제 등록된 gate/adapter/link 타입 기준 검증."""

    def test_epv006_custom_registry_gate_type(self):
        """E-PV-006: 커스텀 레지스트리에 없는 gate 타입 → 에러."""
        blocks = [
            Block(
                id="b1",
                what="step",
                done=DoneCondition(),
                gate=GateConfig(handlers=[GateHandler(type="custom_gate")]),
            ),
        ]
        defn = WorkflowDefinition(
            name="registry-test",
            blocks=blocks,
            links=[],
            teams={"b1": TeamDefinition(block_id="b1", adapter="human")},
        )
        # 커스텀 레지스트리에 custom_gate 없음
        validator = PresetValidator(gate_types={"command", "http"})
        errors = validator.validate(defn)
        gate_errors = [e for e in errors if "게이트 타입" in e.message]
        assert len(gate_errors) == 1
        assert "custom_gate" in gate_errors[0].message

    def test_epv006_custom_registry_gate_type_pass(self):
        """E-PV-006b: 커스텀 레지스트리에 등록된 gate 타입 → 에러 없음."""
        blocks = [
            Block(
                id="b1",
                what="step",
                done=DoneCondition(),
                gate=GateConfig(handlers=[GateHandler(type="custom_gate")]),
            ),
        ]
        defn = WorkflowDefinition(
            name="registry-test",
            blocks=blocks,
            links=[],
            teams={"b1": TeamDefinition(block_id="b1", adapter="human")},
        )
        validator = PresetValidator(gate_types={"command", "http", "custom_gate"})
        errors = validator.validate(defn)
        gate_errors = [e for e in errors if "게이트 타입" in e.message]
        assert len(gate_errors) == 0

    def test_epv006_custom_registry_adapter(self):
        """E-PV-006c: 커스텀 레지스트리에 없는 adapter → warning."""
        blocks = [Block(id="b1", what="step", done=DoneCondition())]
        defn = WorkflowDefinition(
            name="registry-test",
            blocks=blocks,
            links=[],
            teams={"b1": TeamDefinition(block_id="b1", adapter="custom_adapter")},
        )
        validator = PresetValidator(adapter_types={"human", "webhook"})
        errors = validator.validate(defn)
        adapter_warns = [e for e in errors if "어댑터" in e.message and e.severity == "warning"]
        assert len(adapter_warns) == 1
        assert "custom_adapter" in adapter_warns[0].message

    def test_epv006_custom_registry_link_type(self):
        """E-PV-006d: 커스텀 레지스트리에 없는 link 타입 → 에러."""
        blocks = [
            Block(id="a", what="A", done=DoneCondition()),
            Block(id="b", what="B", done=DoneCondition()),
        ]
        defn = WorkflowDefinition(
            name="registry-test",
            blocks=blocks,
            links=[LinkDefinition(from_block="a", to_block="b", type="custom_link")],
            teams={
                "a": TeamDefinition(block_id="a", adapter="human"),
                "b": TeamDefinition(block_id="b", adapter="human"),
            },
        )
        validator = PresetValidator(link_types={"sequential", "loop"})
        errors = validator.validate(defn)
        link_errors = [e for e in errors if "링크 타입" in e.message]
        assert len(link_errors) == 1
        assert "custom_link" in link_errors[0].message


# ──────────────────────────────────────
# E-PL-007: teams 문자열 형식 지원
# ──────────────────────────────────────


class TestPresetLoaderTeamsString:
    """PresetLoader가 teams: {block_id: "adapter_name"} 문자열을 TeamDefinition으로 변환."""

    def test_epl007_teams_string_format(self, tmp_path: Path):
        """E-PL-007: teams에 문자열 값 → TeamDefinition 변환."""
        preset_yaml = {
            "name": "string-teams",
            "blocks": [
                {"id": "do", "what": "Do work", "done": {}},
            ],
            "links": [],
            "teams": {"do": "claude_local"},
        }
        preset_dir = tmp_path / "presets"
        preset_dir.mkdir()
        (preset_dir / "string-teams.yaml").write_text(yaml.dump(preset_yaml))

        loader = PresetLoader(preset_dir)
        defn = loader.load("string-teams")

        assert "do" in defn.teams
        team = defn.teams["do"]
        assert isinstance(team, TeamDefinition)
        assert team.adapter == "claude_local"
        assert team.block_id == "do"
        assert team.config == {}

    def test_epl007_teams_dict_format(self, tmp_path: Path):
        """E-PL-007b: teams에 dict 값 → 정상 파싱 (기존 동작)."""
        preset_yaml = {
            "name": "dict-teams",
            "blocks": [
                {"id": "plan", "what": "Plan", "done": {}},
            ],
            "links": [],
            "teams": {"plan": {"adapter": "human", "config": {"role": "PM_LEADER"}}},
        }
        preset_dir = tmp_path / "presets"
        preset_dir.mkdir()
        (preset_dir / "dict-teams.yaml").write_text(yaml.dump(preset_yaml))

        loader = PresetLoader(preset_dir)
        defn = loader.load("dict-teams")

        assert "plan" in defn.teams
        team = defn.teams["plan"]
        assert team.adapter == "human"
        assert team.config.get("role") == "PM_LEADER"

    def test_epl007_teams_none_skip(self, tmp_path: Path):
        """E-PL-007c: teams에 None 값 → 스킵."""
        preset_yaml = {
            "name": "none-teams",
            "blocks": [
                {"id": "plan", "what": "Plan", "done": {}},
            ],
            "links": [],
            "teams": {"plan": None},
        }
        preset_dir = tmp_path / "presets"
        preset_dir.mkdir()
        (preset_dir / "none-teams.yaml").write_text(yaml.dump(preset_yaml))

        loader = PresetLoader(preset_dir)
        defn = loader.load("none-teams")

        assert "plan" not in defn.teams
