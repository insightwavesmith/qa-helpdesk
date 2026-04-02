"""ValidationPipeline — Resource validation for Brick Dashboard."""

from __future__ import annotations

from abc import ABC, abstractmethod
from collections import defaultdict

from brick.dashboard.models.resource import BrickResource, ValidationError, ValidationResult
from brick.dashboard.file_store import FileStore


class ResourceValidator(ABC):
    @abstractmethod
    def validate(self, resource: BrickResource, store: FileStore | None = None) -> list[ValidationError]:
        ...


class InvariantValidator(ResourceValidator):
    """INV-1~10 검증."""

    def validate(self, resource: BrickResource, store: FileStore | None = None) -> list[ValidationError]:
        errors: list[ValidationError] = []

        if resource.kind == "Workflow":
            # INV-1: Workflow must have task
            if "task" not in resource.spec or not resource.spec.get("task"):
                errors.append(ValidationError(
                    code="INV-1",
                    message="Workflow must have a 'task' field in spec",
                    field="spec.task",
                ))

        if resource.kind == "BlockType":
            # INV-2: BlockType must have default_what
            if "default_what" not in resource.spec:
                errors.append(ValidationError(
                    code="INV-2",
                    message="BlockType must have 'default_what' in spec",
                    field="spec.default_what",
                ))
            # INV-3: BlockType must have default_done
            if "default_done" not in resource.spec:
                errors.append(ValidationError(
                    code="INV-3",
                    message="BlockType must have 'default_done' in spec",
                    field="spec.default_done",
                ))

        if resource.kind == "Preset":
            blocks = resource.spec.get("blocks", [])
            teams = resource.spec.get("teams", {})

            # INV-5: Every block must have a team assigned
            for block in blocks:
                block_id = block.get("id", "")
                if block_id not in teams:
                    errors.append(ValidationError(
                        code="INV-5",
                        message=f"Block '{block_id}' has no team assigned",
                        field=f"spec.teams.{block_id}",
                    ))

        return errors


class SchemaValidator(ResourceValidator):
    """YAML 스키마 검증 — required fields per kind."""

    REQUIRED_FIELDS: dict[str, list[str]] = {
        "BlockType": ["name"],
        "Team": ["name"],
        "Preset": ["name"],
        "Workflow": ["name"],
    }

    REQUIRED_SPEC_FIELDS: dict[str, list[str]] = {
        "Preset": ["blocks"],
    }

    def validate(self, resource: BrickResource, store: FileStore | None = None) -> list[ValidationError]:
        errors: list[ValidationError] = []

        # Check top-level required fields
        required = self.REQUIRED_FIELDS.get(resource.kind, ["name"])
        for field_name in required:
            value = getattr(resource, field_name, None)
            if not value:
                errors.append(ValidationError(
                    code="SCHEMA",
                    message=f"{resource.kind} must have '{field_name}'",
                    field=field_name,
                ))

        # Check required spec fields
        spec_required = self.REQUIRED_SPEC_FIELDS.get(resource.kind, [])
        for field_name in spec_required:
            if field_name not in resource.spec or not resource.spec[field_name]:
                errors.append(ValidationError(
                    code="SCHEMA",
                    message=f"{resource.kind} spec must have '{field_name}'",
                    field=f"spec.{field_name}",
                ))

        return errors


class DAGValidator(ResourceValidator):
    """Preset DAG cycle detection (loop type exempt)."""

    def validate(self, resource: BrickResource, store: FileStore | None = None) -> list[ValidationError]:
        if resource.kind != "Preset":
            return []

        links = resource.spec.get("links", [])
        if not links:
            return []

        # Build adjacency list, excluding loop-type links
        graph: dict[str, list[str]] = defaultdict(list)
        for link in links:
            if link.get("type") == "loop":
                continue  # loop type exempt from cycle detection
            from_node = link.get("from", "")
            to_node = link.get("to", "")
            if from_node and to_node:
                graph[from_node].append(to_node)

        # DFS cycle detection
        visited: set[str] = set()
        in_stack: set[str] = set()

        def has_cycle(node: str) -> bool:
            visited.add(node)
            in_stack.add(node)
            for neighbor in graph.get(node, []):
                if neighbor not in visited:
                    if has_cycle(neighbor):
                        return True
                elif neighbor in in_stack:
                    return True
            in_stack.discard(node)
            return False

        # Collect all nodes
        all_nodes: set[str] = set()
        for link in links:
            all_nodes.add(link.get("from", ""))
            all_nodes.add(link.get("to", ""))
        all_nodes.discard("")

        for node in all_nodes:
            if node not in visited:
                if has_cycle(node):
                    return [ValidationError(
                        code="INV-7",
                        message="Preset DAG contains a cycle (non-loop links)",
                        field="spec.links",
                    )]

        return []


class ReferenceValidator(ResourceValidator):
    """Cross-reference validation — team/block references must exist."""

    KNOWN_ADAPTERS = {
        "claude_code", "claude_agent_teams", "human", "webhook",
    }

    def validate(self, resource: BrickResource, store: FileStore | None = None) -> list[ValidationError]:
        errors: list[ValidationError] = []

        if resource.kind == "Preset":
            teams = resource.spec.get("teams", {})
            for block_id, team_info in teams.items():
                adapter = team_info.get("adapter", "")
                if adapter and adapter not in self.KNOWN_ADAPTERS:
                    errors.append(ValidationError(
                        code="REFERENCE",
                        message=f"Block '{block_id}' references unknown adapter '{adapter}'",
                        severity="warning",
                        field=f"spec.teams.{block_id}.adapter",
                    ))

        return errors


class ReadonlyValidator(ResourceValidator):
    """Core preset modification blocked."""

    def validate(self, resource: BrickResource, store: FileStore | None = None) -> list[ValidationError]:
        if resource.readonly:
            return [ValidationError(
                code="READONLY",
                message=f"Resource '{resource.name}' is readonly and cannot be modified",
                field="readonly",
            )]
        return []


class AdapterCompatibilityValidator(ResourceValidator):
    """Adapter required fields check."""

    def validate(self, resource: BrickResource, store: FileStore | None = None) -> list[ValidationError]:
        errors: list[ValidationError] = []

        if resource.kind == "Team":
            if "adapter" not in resource.spec:
                errors.append(ValidationError(
                    code="ADAPTER",
                    message="Team must specify an adapter in spec",
                    severity="warning",
                    field="spec.adapter",
                ))

        return errors


class ValidationPipeline:
    def __init__(self, store: FileStore | None = None):
        self.store = store
        self.validators: list[ResourceValidator] = [
            InvariantValidator(),
            SchemaValidator(),
            DAGValidator(),
            ReferenceValidator(),
            ReadonlyValidator(),
            AdapterCompatibilityValidator(),
        ]

    def validate(self, resource: BrickResource) -> ValidationResult:
        errors: list[ValidationError] = []
        warnings: list[ValidationError] = []

        for v in self.validators:
            result = v.validate(resource, self.store)
            for e in result:
                if e.severity == "warning":
                    warnings.append(e)
                else:
                    errors.append(e)

        return ValidationResult(
            valid=len(errors) == 0,
            errors=errors,
            warnings=warnings,
        )
