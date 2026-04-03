"""ProposalApplier — 승인된 제안을 실제로 반영."""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from brick.review.models import Proposal, ProposalType


class ProposalApplier:
    """승인된 제안을 실제로 반영."""

    def __init__(self, workspace_root: str = ".", project_key: str = ""):
        self.root = Path(workspace_root)
        self.project_key = project_key

    async def apply(self, proposal: Proposal) -> bool:
        """제안 타입에 따라 적절한 반영 메서드 호출."""
        handlers = {
            ProposalType.MEMORY_UPDATE: self._apply_memory_update,
            ProposalType.POSTMORTEM_ENTRY: self._apply_postmortem,
        }
        handler = handlers.get(proposal.type)
        if handler:
            await handler(proposal)
            return True
        return False

    async def _apply_memory_update(self, proposal: Proposal) -> None:
        """agent memory에 교훈 저장."""
        memory_dir = Path.home() / ".claude/projects" / self.project_key / "memory"
        memory_dir.mkdir(parents=True, exist_ok=True)
        filename = f"lesson_{proposal.lesson_id.lower()}.md"
        content = (
            "---\n"
            f"name: {proposal.description[:50]}\n"
            f"description: {proposal.description}\n"
            "type: feedback\n"
            "---\n\n"
            f"{proposal.description}\n\n"
            f"**Why:** {proposal.diff_preview}\n"
            f"**How to apply:** 다음 PDCA에서 {proposal.target} 확인\n"
        )
        (memory_dir / filename).write_text(content)

    async def _apply_postmortem(self, proposal: Proposal) -> None:
        """postmortem/index.json에 항목 추가."""
        index_path = self.root / "docs/postmortem/index.json"
        if not index_path.exists():
            return
        index = json.loads(index_path.read_text())
        index.append({
            "id": proposal.id,
            "date": datetime.now().isoformat(),
            "feature": proposal.target,
            "lesson": proposal.description,
            "auto_generated": True,
            "source": "r-brick",
        })
        index_path.write_text(json.dumps(index, indent=2, ensure_ascii=False))
