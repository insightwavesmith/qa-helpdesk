"""FileStore — CRUD operations for .bkit/ resource files."""

from __future__ import annotations

from datetime import datetime, timezone
from pathlib import Path
from typing import Callable

import yaml

from brick.dashboard.models.resource import BrickResource


class FileStore:
    """All resource CRUD resolves to file operations on .bkit/ directory."""

    KIND_PATHS: dict[str, str] = {
        "BlockType": "block-types",
        "Team": "teams",
        "Preset": "presets",
    }

    def __init__(self, root: str = ".bkit/"):
        self.root = Path(root)
        self._watchers: list[Callable] = []

    def _kind_dir(self, kind: str) -> Path:
        subdir = self.KIND_PATHS.get(kind)
        if subdir is None:
            raise ValueError(f"Unknown resource kind: {kind}")
        return self.root / subdir

    def _resource_path(self, kind: str, name: str) -> Path:
        return self._kind_dir(kind) / f"{name}.yaml"

    def _parse_yaml(self, path: Path) -> BrickResource:
        data = yaml.safe_load(path.read_text())
        return BrickResource(
            kind=data.get("kind", ""),
            name=data.get("name", ""),
            spec=data.get("spec", {}),
            labels=data.get("labels", {}),
            annotations=data.get("annotations", {}),
            status=data.get("status"),
            file_path=str(path),
            readonly=data.get("readonly", False),
            version=data.get("version", ""),
            updated_at=data.get("updated_at", ""),
        )

    def _to_yaml_dict(self, resource: BrickResource) -> dict:
        data: dict = {
            "kind": resource.kind,
            "name": resource.name,
            "spec": resource.spec,
            "labels": resource.labels,
            "annotations": resource.annotations,
            "readonly": resource.readonly,
        }
        if resource.version:
            data["version"] = resource.version
        if resource.updated_at:
            data["updated_at"] = resource.updated_at
        if resource.status is not None:
            data["status"] = resource.status
        return data

    def list(self, kind: str) -> list[BrickResource]:
        """Scan {root}/{kind_path}/ for .yaml files, parse each into BrickResource."""
        kind_dir = self._kind_dir(kind)
        if not kind_dir.exists():
            return []
        resources = []
        for path in sorted(kind_dir.glob("*.yaml")):
            try:
                resources.append(self._parse_yaml(path))
            except Exception:
                continue  # skip malformed files
        return resources

    def get(self, kind: str, name: str) -> BrickResource:
        """Read a single resource by kind and name."""
        path = self._resource_path(kind, name)
        if not path.exists():
            raise FileNotFoundError(f"{kind}/{name} not found at {path}")
        return self._parse_yaml(path)

    def create(self, resource: BrickResource) -> BrickResource:
        """Validate and write a new YAML resource file."""
        path = self._resource_path(resource.kind, resource.name)
        if path.exists():
            raise FileExistsError(f"{resource.kind}/{resource.name} already exists at {path}")

        # Ensure directory exists
        path.parent.mkdir(parents=True, exist_ok=True)

        resource.updated_at = datetime.now(timezone.utc).isoformat()
        resource.file_path = str(path)

        data = self._to_yaml_dict(resource)
        path.write_text(yaml.dump(data, allow_unicode=True, default_flow_style=False))
        return resource

    def update(self, resource: BrickResource) -> BrickResource:
        """Validate and overwrite an existing YAML resource file."""
        path = self._resource_path(resource.kind, resource.name)
        if not path.exists():
            raise FileNotFoundError(f"{resource.kind}/{resource.name} not found at {path}")

        # Check readonly
        existing = self._parse_yaml(path)
        if existing.readonly:
            raise PermissionError(f"Cannot update readonly resource: {resource.kind}/{resource.name}")

        resource.updated_at = datetime.now(timezone.utc).isoformat()
        resource.file_path = str(path)

        data = self._to_yaml_dict(resource)
        path.write_text(yaml.dump(data, allow_unicode=True, default_flow_style=False))
        return resource

    def delete(self, kind: str, name: str) -> bool:
        """Delete a resource file. Raises PermissionError if readonly."""
        path = self._resource_path(kind, name)
        if not path.exists():
            raise FileNotFoundError(f"{kind}/{name} not found at {path}")

        resource = self._parse_yaml(path)
        if resource.readonly:
            raise PermissionError(f"Cannot delete readonly resource: {kind}/{name}")

        path.unlink()
        return True

    def sync_all(self) -> int:
        """Scan all kind directories, re-read from disk. Returns count of synced resources."""
        count = 0
        for kind in self.KIND_PATHS:
            resources = self.list(kind)
            count += len(resources)
        return count

    def watch(self, callback: Callable) -> None:
        """Register a callback for file change notifications (Phase 1 stub)."""
        self._watchers.append(callback)

    def notify_changes(self) -> None:
        """Trigger all registered watchers. Called externally or by polling."""
        event = {"type": "change", "timestamp": datetime.now(timezone.utc).isoformat()}
        for cb in self._watchers:
            cb(event)
