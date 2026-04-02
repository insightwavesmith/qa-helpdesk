"""Learning Harness — failure collection, pattern analysis, rule suggestions."""

from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

from brick.engine.event_bus import EventBus
from brick.models.events import Event


class LearningCollector:
    """Subscribes to failure events and collects failure logs."""

    def __init__(self, event_bus: EventBus, storage_dir: Path):
        self.event_bus = event_bus
        self.storage_dir = storage_dir
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.failures: list[dict] = []

        event_bus.subscribe("block.gate_failed", self._on_failure)
        event_bus.subscribe("adapter.failed", self._on_failure)

    def _on_failure(self, event: Event) -> None:
        entry = {
            "type": event.type,
            "data": event.data,
            "timestamp": event.timestamp,
        }
        self.failures.append(entry)
        log_path = self.storage_dir / "failure-log.jsonl"
        with open(log_path, "a") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

    def get_failures(self) -> list[dict]:
        return self.failures


class PatternAnalyzer:
    """Analyzes failure logs for repeated patterns (3+ occurrences = pattern)."""

    def __init__(self, min_occurrences: int = 3):
        self.min_occurrences = min_occurrences

    def analyze(self, failures: list[dict]) -> list[dict]:
        counter: Counter[str] = Counter()
        for f in failures:
            sig = self._signature(f)
            counter[sig] += 1

        patterns = []
        for sig, count in counter.items():
            if count >= self.min_occurrences:
                examples = [
                    f for f in failures if self._signature(f) == sig
                ][:3]
                patterns.append(
                    {"signature": sig, "count": count, "examples": examples}
                )
        return patterns

    def _signature(self, failure: dict) -> str:
        error = failure.get("data", {}).get("error", "unknown")
        return f"{failure.get('type', 'unknown')}::{error}"


class RuleSuggester:
    """Generates rule suggestions from detected patterns. NEVER auto-applies."""

    def __init__(self, suggestions_dir: Path):
        self.suggestions_dir = suggestions_dir
        self.suggestions_dir.mkdir(parents=True, exist_ok=True)

    def suggest(self, patterns: list[dict]) -> list[Path]:
        created = []
        for i, pattern in enumerate(patterns):
            suggestion = {
                "id": f"suggestion-{i + 1}",
                "pattern": pattern["signature"],
                "occurrences": pattern["count"],
                "suggested_rule": self._generate_rule(pattern),
                "status": "pending",
                "auto_applied": False,
            }
            path = self.suggestions_dir / f"suggestion-{i + 1}.json"
            path.write_text(json.dumps(suggestion, indent=2, ensure_ascii=False))
            created.append(path)
        return created

    def _generate_rule(self, pattern: dict) -> dict:
        sig = pattern["signature"]
        if "gate_failed" in sig:
            return {
                "type": "gate_handler",
                "action": "add_retry",
                "description": f"반복 실패 패턴 감지: {sig}",
            }
        if "adapter.failed" in sig:
            return {
                "type": "adapter_fallback",
                "action": "add_fallback",
                "description": f"어댑터 실패 패턴: {sig}",
            }
        return {
            "type": "generic",
            "action": "review",
            "description": f"검토 필요: {sig}",
        }

    def approve(self, suggestion_id: str) -> dict:
        path = self.suggestions_dir / f"{suggestion_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"Suggestion {suggestion_id} not found")
        data = json.loads(path.read_text())
        data["status"] = "approved"
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        return data

    def reject(self, suggestion_id: str, reason: str = "") -> dict:
        """Reject a suggestion with reason."""
        path = self.suggestions_dir / f"{suggestion_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"Suggestion {suggestion_id} not found")
        data = json.loads(path.read_text())
        data["status"] = "rejected"
        data["reject_reason"] = reason
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        return data

    def rollback(self, suggestion_id: str) -> dict:
        """Rollback a previously approved suggestion."""
        path = self.suggestions_dir / f"{suggestion_id}.json"
        if not path.exists():
            raise FileNotFoundError(f"Suggestion {suggestion_id} not found")
        data = json.loads(path.read_text())
        if data.get("status") != "approved":
            raise ValueError(f"Cannot rollback: suggestion status is '{data.get('status')}', not 'approved'")
        data["status"] = "rolled_back"
        path.write_text(json.dumps(data, indent=2, ensure_ascii=False))
        return data

    def list_suggestions(self, status: str | None = None) -> list[dict]:
        """List all suggestions, optionally filtered by status."""
        suggestions = []
        for path in sorted(self.suggestions_dir.glob("*.json")):
            try:
                data = json.loads(path.read_text())
                if status is None or data.get("status") == status:
                    suggestions.append(data)
            except Exception:
                continue
        return suggestions
