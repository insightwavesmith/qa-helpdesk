"""Workflow models for Brick Engine."""

from __future__ import annotations

import time
from dataclasses import dataclass, field
from typing import Any

from brick.models.events import WorkflowStatus, BlockStatus
from brick.models.block import Block, DoneCondition, GateConfig
from brick.models.team import TeamDefinition
from brick.models.link import LinkDefinition


@dataclass
class BlockInstance:
    block: Block
    status: BlockStatus = BlockStatus.PENDING
    adapter: str = ""
    execution_id: str | None = None
    artifacts: list[str] = field(default_factory=list)
    metrics: dict = field(default_factory=dict)
    retry_count: int = 0
    started_at: float | None = None
    completed_at: float | None = None
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "block": {
                "id": self.block.id,
                "what": self.block.what,
                "done": {
                    "artifacts": self.block.done.artifacts,
                    "metrics": self.block.done.metrics,
                    "custom": self.block.done.custom,
                },
                "type": self.block.type,
                "description": self.block.description,
                "timeout": self.block.timeout,
                "idempotent": self.block.idempotent,
                "metadata": self.block.metadata,
                "fallback_adapter": self.block.fallback_adapter,
            },
            "status": self.status.value,
            "adapter": self.adapter,
            "execution_id": self.execution_id,
            "artifacts": self.artifacts,
            "metrics": self.metrics,
            "retry_count": self.retry_count,
            "started_at": self.started_at,
            "completed_at": self.completed_at,
            "error": self.error,
        }

    @classmethod
    def from_dict(cls, data: dict) -> BlockInstance:
        block_data = data["block"]
        block = Block(
            id=block_data["id"],
            what=block_data["what"],
            done=DoneCondition(
                artifacts=block_data["done"].get("artifacts", []),
                metrics=block_data["done"].get("metrics", {}),
                custom=block_data["done"].get("custom", []),
            ),
            type=block_data.get("type", "Custom"),
            description=block_data.get("description", ""),
            timeout=block_data.get("timeout"),
            idempotent=block_data.get("idempotent", True),
            metadata=block_data.get("metadata", {}),
            fallback_adapter=block_data.get("fallback_adapter"),
        )
        return cls(
            block=block,
            status=BlockStatus(data["status"]),
            adapter=data.get("adapter", ""),
            execution_id=data.get("execution_id"),
            artifacts=data.get("artifacts", []),
            metrics=data.get("metrics", {}),
            retry_count=data.get("retry_count", 0),
            started_at=data.get("started_at"),
            completed_at=data.get("completed_at"),
            error=data.get("error"),
        )


@dataclass
class WorkflowDefinition:
    name: str
    description: str = ""
    blocks: list[Block] = field(default_factory=list)
    links: list[LinkDefinition] = field(default_factory=list)
    teams: dict[str, TeamDefinition] = field(default_factory=dict)
    gates: dict[str, GateConfig] = field(default_factory=dict)
    events: dict[str, list] = field(default_factory=dict)
    schema: str = "brick/preset-v2"
    extends: str | None = None
    overrides: dict = field(default_factory=dict)
    level: int = 2  # L0-L3

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "description": self.description,
            "blocks": [
                {
                    "id": b.id,
                    "what": b.what,
                    "done": {"artifacts": b.done.artifacts, "metrics": b.done.metrics, "custom": b.done.custom},
                    "type": b.type,
                    "description": b.description,
                }
                for b in self.blocks
            ],
            "links": [
                {
                    "from_block": l.from_block,
                    "to_block": l.to_block,
                    "type": l.type,
                    "condition": l.condition,
                    "max_retries": l.max_retries,
                    **({"schedule": l.schedule} if l.schedule else {}),
                    **({"branches": l.branches} if l.branches else {}),
                    **({"on_fail": l.on_fail} if l.on_fail else {}),
                    **({"notify": l.notify} if l.notify else {}),
                }
                for l in self.links
            ],
            "teams": {
                k: {"block_id": v.block_id, "adapter": v.adapter, "config": v.config}
                for k, v in self.teams.items()
            },
            "schema": self.schema,
            "level": self.level,
        }

    @classmethod
    def from_dict(cls, data: dict) -> WorkflowDefinition:
        blocks = [
            Block(
                id=b["id"],
                what=b["what"],
                done=DoneCondition(
                    artifacts=b["done"].get("artifacts", []),
                    metrics=b["done"].get("metrics", {}),
                    custom=b["done"].get("custom", []),
                ),
                type=b.get("type", "Custom"),
                description=b.get("description", ""),
            )
            for b in data.get("blocks", [])
        ]
        links = [
            LinkDefinition(
                from_block=l["from_block"],
                to_block=l["to_block"],
                type=l.get("type", "sequential"),
                condition=l.get("condition", {}),
                max_retries=l.get("max_retries", 3),
                schedule=l.get("schedule", ""),
                branches=l.get("branches", []),
                on_fail=l.get("on_fail"),
                notify=l.get("notify", {}),
            )
            for l in data.get("links", [])
        ]
        teams = {
            k: TeamDefinition(block_id=v["block_id"], adapter=v["adapter"], config=v.get("config", {}))
            for k, v in data.get("teams", {}).items()
        }
        return cls(
            name=data["name"],
            description=data.get("description", ""),
            blocks=blocks,
            links=links,
            teams=teams,
            schema=data.get("schema", "brick/preset-v2"),
            level=data.get("level", 2),
        )


@dataclass
class WorkflowInstance:
    id: str
    definition: WorkflowDefinition
    feature: str
    task: str
    status: WorkflowStatus = WorkflowStatus.PENDING
    blocks: dict[str, BlockInstance] = field(default_factory=dict)
    current_block_id: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    metrics: dict = field(default_factory=dict)
    context: dict = field(default_factory=dict)

    @classmethod
    def from_definition(cls, defn: WorkflowDefinition, feature: str, task: str) -> WorkflowInstance:
        instance = cls(
            id=f"{feature}-{int(time.time())}",
            definition=defn,
            feature=feature,
            task=task,
        )
        for block in defn.blocks:
            adapter = defn.teams.get(block.id, TeamDefinition(block_id=block.id, adapter="")).adapter
            instance.blocks[block.id] = BlockInstance(block=block, adapter=adapter)
        return instance

    def get_first_block(self) -> BlockInstance:
        if self.definition.blocks:
            return self.blocks[self.definition.blocks[0].id]
        raise ValueError("No blocks in workflow")

    def get_current_block(self) -> BlockInstance | None:
        if self.current_block_id:
            return self.blocks.get(self.current_block_id)
        return None

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "definition": self.definition.to_dict(),
            "feature": self.feature,
            "task": self.task,
            "status": self.status.value,
            "blocks": {k: v.to_dict() for k, v in self.blocks.items()},
            "current_block_id": self.current_block_id,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
            "metrics": self.metrics,
            "context": self.context,
        }

    @classmethod
    def from_dict(cls, data: dict) -> WorkflowInstance:
        defn = WorkflowDefinition.from_dict(data["definition"])
        instance = cls(
            id=data["id"],
            definition=defn,
            feature=data["feature"],
            task=data["task"],
            status=WorkflowStatus(data["status"]),
            current_block_id=data.get("current_block_id"),
            created_at=data.get("created_at", time.time()),
            updated_at=data.get("updated_at", time.time()),
            metrics=data.get("metrics", {}),
            context=data.get("context", {}),
        )
        for k, v in data.get("blocks", {}).items():
            instance.blocks[k] = BlockInstance.from_dict(v)
        return instance
