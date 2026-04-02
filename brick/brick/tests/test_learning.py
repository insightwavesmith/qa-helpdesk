"""BK-101~105: Learning Harness tests."""

import json
from pathlib import Path

import pytest

from brick.engine.event_bus import EventBus
from brick.engine.learning import LearningCollector, PatternAnalyzer, RuleSuggester
from brick.models.events import Event


@pytest.fixture
def event_bus():
    return EventBus()


@pytest.fixture
def storage_dir(tmp_path):
    return tmp_path / "learning"


@pytest.fixture
def suggestions_dir(tmp_path):
    return tmp_path / "suggestions"


@pytest.fixture
def collector(event_bus, storage_dir):
    return LearningCollector(event_bus, storage_dir)


class TestLearningCollector:
    def test_collects_failures(self, event_bus, collector):
        event_bus.publish(Event(type="block.gate_failed", data={"error": "tsc failed"}))
        event_bus.publish(Event(type="adapter.failed", data={"error": "timeout"}))
        assert len(collector.get_failures()) == 2

    def test_writes_log_file(self, event_bus, collector, storage_dir):
        event_bus.publish(Event(type="block.gate_failed", data={"error": "build"}))
        log_path = storage_dir / "failure-log.jsonl"
        assert log_path.exists()
        lines = log_path.read_text().strip().split("\n")
        assert len(lines) == 1


class TestPatternAnalyzer:
    def test_bk101_pattern_detection_3plus(self):
        """BK-101: PatternAnalyzer가 3+ 실패에서 패턴 감지."""
        failures = [
            {"type": "block.gate_failed", "data": {"error": "tsc"}, "timestamp": 1.0},
            {"type": "block.gate_failed", "data": {"error": "tsc"}, "timestamp": 2.0},
            {"type": "block.gate_failed", "data": {"error": "tsc"}, "timestamp": 3.0},
        ]
        analyzer = PatternAnalyzer(min_occurrences=3)
        patterns = analyzer.analyze(failures)
        assert len(patterns) == 1
        assert patterns[0]["count"] == 3
        assert "tsc" in patterns[0]["signature"]

    def test_bk104_below_threshold_ignored(self):
        """BK-104: 3회 미만 실패 → 패턴 무시."""
        failures = [
            {"type": "block.gate_failed", "data": {"error": "tsc"}, "timestamp": 1.0},
            {"type": "block.gate_failed", "data": {"error": "tsc"}, "timestamp": 2.0},
        ]
        analyzer = PatternAnalyzer(min_occurrences=3)
        patterns = analyzer.analyze(failures)
        assert len(patterns) == 0


class TestRuleSuggester:
    def test_bk102_creates_suggestion_files(self, suggestions_dir):
        """BK-102: RuleSuggester가 제안 파일 생성."""
        suggester = RuleSuggester(suggestions_dir)
        patterns = [
            {"signature": "block.gate_failed::tsc", "count": 5, "examples": []},
        ]
        paths = suggester.suggest(patterns)
        assert len(paths) == 1
        assert paths[0].exists()
        data = json.loads(paths[0].read_text())
        assert data["pattern"] == "block.gate_failed::tsc"
        assert data["status"] == "pending"

    def test_bk103_auto_applied_always_false(self, suggestions_dir):
        """BK-103: 제안 auto_applied = False (자동 적용 차단 확인)."""
        suggester = RuleSuggester(suggestions_dir)
        patterns = [
            {"signature": "adapter.failed::timeout", "count": 3, "examples": []},
        ]
        paths = suggester.suggest(patterns)
        data = json.loads(paths[0].read_text())
        assert data["auto_applied"] is False

    def test_bk105_approve_changes_status(self, suggestions_dir):
        """BK-105: approve 후 status=approved."""
        suggester = RuleSuggester(suggestions_dir)
        patterns = [
            {"signature": "block.gate_failed::build", "count": 4, "examples": []},
        ]
        suggester.suggest(patterns)
        result = suggester.approve("suggestion-1")
        assert result["status"] == "approved"

    def test_approve_not_found(self, suggestions_dir):
        suggester = RuleSuggester(suggestions_dir)
        with pytest.raises(FileNotFoundError):
            suggester.approve("nonexistent")


class TestE2ELearning:
    def test_full_cycle(self, event_bus, storage_dir, tmp_path):
        """Full learning cycle: collect → analyze → suggest → approve."""
        collector = LearningCollector(event_bus, storage_dir)

        # Generate 4 failures with same error
        for i in range(4):
            event_bus.publish(
                Event(
                    type="block.gate_failed",
                    data={"error": "tsc_noEmit_failed"},
                )
            )
        # 1 different failure
        event_bus.publish(
            Event(type="adapter.failed", data={"error": "timeout"})
        )

        assert len(collector.get_failures()) == 5

        analyzer = PatternAnalyzer(min_occurrences=3)
        patterns = analyzer.analyze(collector.get_failures())
        assert len(patterns) == 1  # Only the tsc pattern (4 >= 3)

        suggestions_dir = tmp_path / "suggestions"
        suggester = RuleSuggester(suggestions_dir)
        paths = suggester.suggest(patterns)
        assert len(paths) == 1

        # Approve
        result = suggester.approve("suggestion-1")
        assert result["status"] == "approved"
        assert result["auto_applied"] is False
