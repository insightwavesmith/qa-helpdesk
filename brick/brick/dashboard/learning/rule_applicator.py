"""RuleApplicator — applies approved rules to actual files."""

from __future__ import annotations

from pathlib import Path
from dataclasses import dataclass

import yaml


@dataclass
class ApplyResult:
    success: bool
    file: str = ""
    error: str = ""
    lines_added: int = 0
    lines_removed: int = 0


class RuleApplicator:
    """Applies approved LearningProposal diffs to files."""

    def __init__(self, root_dir: str = "."):
        self.root_dir = Path(root_dir)

    def apply(self, proposal) -> ApplyResult:
        """Apply proposal's diff to target file."""
        diff = proposal.modified_diff or proposal.diff
        target = self.root_dir / proposal.target_file

        if not target.exists():
            return ApplyResult(success=False, error="Target file not found")

        original = target.read_text()

        try:
            match proposal.axis:
                case "block":
                    patched = self._apply_block_rule(original, diff)
                case "team":
                    patched = self._apply_team_rule(original, diff)
                case "link":
                    patched = self._apply_link_rule(original, diff)
                case _:
                    patched = self._apply_generic(original, diff)

            if target.suffix in (".yaml", ".yml"):
                yaml.safe_load(patched)

            target.write_text(patched)
            return ApplyResult(success=True, file=str(target))

        except Exception as e:
            target.write_text(original)
            return ApplyResult(success=False, file=str(target), error=str(e))

    def _apply_block_rule(self, content: str, diff: str) -> str:
        """Patch gates section in preset YAML."""
        data = yaml.safe_load(content)
        if "gates" not in data:
            data["gates"] = {}
        data["gates"]["_learned"] = diff
        return yaml.dump(data, allow_unicode=True)

    def _apply_team_rule(self, content: str, diff: str) -> str:
        """Add learned rule section to SKILL.md."""
        marker = "## 학습된 규칙 (Learning Harness)"
        if marker not in content:
            content += f"\n\n{marker}\n\n"
        content += f"- {diff}\n"
        return content

    def _apply_link_rule(self, content: str, diff: str) -> str:
        """Patch links section in preset YAML."""
        data = yaml.safe_load(content)
        if "links" not in data:
            data["links"] = []
        for link in data.get("links", []):
            if "max_retries" in diff:
                link["max_retries"] = int(diff.split("=")[-1].strip()) if "=" in diff else 5
        return yaml.dump(data, allow_unicode=True)

    def _apply_generic(self, content: str, diff: str) -> str:
        return content + f"\n{diff}\n"
