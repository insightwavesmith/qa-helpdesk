"""PresetLoader — YAML 프리셋 로딩 및 WorkflowDefinition 변환."""

from __future__ import annotations

from pathlib import Path

import yaml

from brick.models.block import Block, DoneCondition, GateHandler, GateConfig
from brick.models.link import LinkDefinition
from brick.models.team import TeamDefinition
from brick.models.workflow import WorkflowDefinition


class PresetLoader:
    """Load and parse YAML preset files into WorkflowDefinition."""

    def __init__(self, presets_dir: Path):
        self.presets_dir = presets_dir

    def load(self, name: str) -> WorkflowDefinition:
        path = self.presets_dir / f"{name}.yaml"
        if not path.exists():
            raise FileNotFoundError(f"Preset {name} not found at {path}")
        data = yaml.safe_load(path.read_text())
        defn = self._parse_preset(data)
        # Handle extends
        if data.get("extends"):
            base = self.load(data["extends"])
            defn = self._merge(base, defn, data.get("overrides", {}))
        return defn

    def _substitute_variables(self, data, variables: dict[str, str]):
        """재귀적 dict/list walk로 변수 치환. yaml.dump 사용 안 함."""
        if isinstance(data, str):
            for key, value in variables.items():
                data = data.replace(f"{{{key}}}", value)
            return data
        elif isinstance(data, dict):
            return {k: self._substitute_variables(v, variables) for k, v in data.items()}
        elif isinstance(data, list):
            return [self._substitute_variables(item, variables) for item in data]
        return data

    def _parse_preset(self, data: dict) -> WorkflowDefinition:
        # Spec wrapper detection: kind+spec -> read content from spec
        if "kind" in data and "spec" in data:
            inner = data["spec"]
        else:
            inner = data

        # 축1: {project}/{feature} 변수 치환 — 재귀 dict walk 방식 (#23)
        project = data.get("project", "")
        feature = data.get("feature", "")
        if project or feature:
            inner = self._substitute_variables(inner, {"project": project, "feature": feature})

        blocks = []
        for b in inner.get("blocks", []):
            done_data = b.get("done", {})
            gate_config = None
            gate_data = b.get("gate")
            if gate_data:
                handlers = []
                for h in gate_data.get("handlers", []):
                    approval_data = h.get("approval")
                    approval_config = None
                    if approval_data:
                        from brick.models.block import ApprovalConfig
                        approval_config = ApprovalConfig(
                            approver=approval_data.get("approver", ""),
                            channel=approval_data.get("channel", "slack"),
                            slack_channel=approval_data.get("slack_channel", "C0AN7ATS4DD"),
                            dashboard_url=approval_data.get("dashboard_url", ""),
                            timeout_seconds=approval_data.get("timeout_seconds", 86400),
                            on_timeout=approval_data.get("on_timeout", "escalate"),
                            reminder_interval=approval_data.get("reminder_interval", 3600),
                            max_reminders=approval_data.get("max_reminders", 3),
                            context_artifacts=approval_data.get("context_artifacts", []),
                        )
                    handlers.append(GateHandler(
                        type=h["type"],
                        command=h.get("command"),
                        url=h.get("url"),
                        headers=h.get("headers"),
                        prompt=h.get("prompt"),
                        model=h.get("model"),
                        agent_prompt=h.get("agent_prompt"),
                        timeout=h.get("timeout", 30),
                        on_fail=h.get("on_fail", "fail"),
                        confidence_threshold=h.get("confidence_threshold", 0.8),
                        retries=h.get("retries", 1),
                        metric=h.get("metric"),
                        threshold=h.get("threshold"),
                        approval=approval_config,
                    ))
                gate_config = GateConfig(
                    handlers=handlers,
                    evaluation=gate_data.get("evaluation", "sequential"),
                    on_fail=gate_data.get("on_fail", "retry"),
                    max_retries=gate_data.get("max_retries", 3),
                )

            blocks.append(
                Block(
                    id=b["id"],
                    what=b.get("what", ""),
                    done=DoneCondition(
                        artifacts=done_data.get("artifacts", []),
                        metrics=done_data.get("metrics", {}),
                        custom=done_data.get("custom", []),
                    ),
                    type=b.get("type", "Custom"),
                    description=b.get("description", ""),
                    gate=gate_config,
                )
            )
        links = []
        for link in inner.get("links", []):
            links.append(
                LinkDefinition(
                    from_block=link["from"],
                    to_block=link["to"],
                    type=link.get("type", "sequential"),
                    condition=link.get("condition", {}),
                    max_retries=link.get("max_retries", 3),
                    merge_strategy=link.get("merge_strategy", "all"),
                    schedule=link.get("schedule", ""),
                    branches=link.get("branches", []),
                    on_fail=link.get("on_fail"),
                    notify=link.get("notify", {}),
                )
            )
        teams: dict[str, TeamDefinition] = {}
        for block_id, team_data in inner.get("teams", {}).items():
            if team_data is None:
                continue
            if isinstance(team_data, str):
                teams[block_id] = TeamDefinition(
                    block_id=block_id,
                    adapter=team_data,
                    config={},
                )
            else:
                teams[block_id] = TeamDefinition(
                    block_id=block_id,
                    adapter=team_data.get("team", team_data.get("adapter", "human")),
                    config=team_data.get("config", team_data.get("override", {})),
                )

        return WorkflowDefinition(
            name=data.get("name", ""),
            description=data.get("description", ""),
            blocks=blocks,
            links=links,
            teams=teams,
            schema=data.get("$schema", "brick/preset-v2"),
            extends=data.get("extends"),
            overrides=data.get("overrides", {}),
            project=project,
            feature=feature,
        )

    def _merge(
        self,
        base: WorkflowDefinition,
        child: WorkflowDefinition,
        overrides: dict,
    ) -> WorkflowDefinition:
        """Merge child onto base, applying overrides."""
        block_map = {b.id: b for b in base.blocks}
        for b in child.blocks:
            block_map[b.id] = b
        merged_blocks = list(block_map.values())

        merged_links = child.links if child.links else base.links

        merged_teams = {**base.teams, **child.teams}

        for block_id, block_overrides in overrides.items():
            if block_id in block_map:
                block = block_map[block_id]
                if "what" in block_overrides:
                    block.what = block_overrides["what"]

        return WorkflowDefinition(
            name=child.name or base.name,
            description=child.description or base.description,
            blocks=merged_blocks,
            links=merged_links,
            teams=merged_teams,
            schema=child.schema,
        )
