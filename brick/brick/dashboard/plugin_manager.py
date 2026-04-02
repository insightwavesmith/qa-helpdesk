"""Plugin Manager — dynamic plugin discovery, metadata, config schema, form validation."""

from __future__ import annotations

import importlib.metadata
from dataclasses import dataclass, field


@dataclass
class PluginMetadata:
    name: str
    display_name: str
    icon: str
    description: str
    config_schema: dict = field(default_factory=dict)


class PluginManager:
    """Discovers and manages Brick plugins via entry_points."""

    def __init__(self):
        self._cache: dict[str, list[PluginMetadata]] = {}

    def discover_adapters(self) -> list[PluginMetadata]:
        """Discover adapter plugins with metadata."""
        return self._discover("brick.adapters")

    def discover_gates(self) -> list[PluginMetadata]:
        return self._discover("brick.gates")

    def discover_links(self) -> list[PluginMetadata]:
        return self._discover("brick.links")

    def _discover(self, group: str) -> list[PluginMetadata]:
        results = []
        try:
            eps = importlib.metadata.entry_points()
            if hasattr(eps, "select"):
                entries = eps.select(group=group)
            elif isinstance(eps, dict):
                entries = eps.get(group, [])
            else:
                entries = [ep for ep in eps if ep.group == group]

            for ep in entries:
                meta = PluginMetadata(
                    name=ep.name,
                    display_name=ep.name.replace("_", " ").title(),
                    icon="\U0001f50c",
                    description=f"Plugin: {ep.value}",
                )
                try:
                    cls = ep.load()
                    if hasattr(cls, "config_schema"):
                        meta.config_schema = cls.config_schema()
                    if hasattr(cls, "display_name"):
                        meta.display_name = cls.display_name
                    if hasattr(cls, "icon"):
                        meta.icon = cls.icon
                    if hasattr(cls, "description") and isinstance(cls.description, str):
                        meta.description = cls.description
                except Exception:
                    pass
                results.append(meta)
        except Exception:
            pass
        return results

    def validate_config(self, schema: dict, config: dict) -> list[str]:
        """Validate config values against JSON Schema (simplified)."""
        errors = []
        required = schema.get("required", [])
        properties = schema.get("properties", {})

        for field_name in required:
            if field_name not in config or not config[field_name]:
                label = properties.get(field_name, {}).get("title", field_name)
                errors.append(f"\ud544\uc218 \ud544\ub4dc '{label}' \uac12\uc774 \ube44\uc5b4\uc788\uc2b5\ub2c8\ub2e4")

        for field_name, value in config.items():
            if field_name in properties:
                expected_type = properties[field_name].get("type", "string")
                if expected_type == "number" and not isinstance(value, (int, float)):
                    errors.append(f"'{field_name}'\uc740 \uc22b\uc790\uc5ec\uc57c \ud569\ub2c8\ub2e4")
                elif expected_type == "boolean" and not isinstance(value, bool):
                    errors.append(f"'{field_name}'\uc740 \ubd88\ub9ac\uc5b8\uc774\uc5b4\uc57c \ud569\ub2c8\ub2e4")

        return errors

    def get_management_capabilities(self, adapter_name: str) -> dict:
        """Check which management features an adapter supports."""
        from brick.adapters.management import TeamManagementAdapter

        try:
            eps = importlib.metadata.entry_points()
            if hasattr(eps, "select"):
                entries = list(eps.select(group="brick.adapters"))
            elif isinstance(eps, dict):
                entries = eps.get("brick.adapters", [])
            else:
                entries = [ep for ep in eps if ep.group == "brick.adapters"]

            for ep in entries:
                if ep.name == adapter_name:
                    cls = ep.load()
                    is_manageable = issubclass(cls, TeamManagementAdapter)
                    return {
                        "adapter": adapter_name,
                        "has_management": is_manageable,
                        "skills_tab": is_manageable,
                        "mcp_tab": is_manageable,
                        "model_tab": is_manageable,
                        "members_tab": True,
                    }
        except Exception:
            pass

        return {
            "adapter": adapter_name,
            "has_management": False,
            "error": "Adapter not found",
        }
