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

    # Fallback registry: used when entry_points are unavailable (no pip install -e .)
    _FALLBACK_ADAPTERS = {
        "claude_agent_teams": "brick.adapters.claude_agent_teams:ClaudeAgentTeamsAdapter",
        "claude_code": "brick.adapters.claude_code:SingleClaudeCodeAdapter",
        "human": "brick.adapters.human:HumanAdapter",
        "webhook": "brick.adapters.webhook:WebhookAdapter",
    }
    _FALLBACK_GATES = {
        "artifact_exists": "brick.gates.artifact_exists:ArtifactExistsGate",
        "match_rate": "brick.gates.match_rate:MatchRateGate",
        "prompt_eval": "brick.gates.prompt_eval:PromptEvalGate",
        "agent_eval": "brick.gates.agent_eval:AgentEvalGate",
    }
    _FALLBACK_LINKS = {
        "sequential": "brick.links.sequential:SequentialLink",
        "parallel": "brick.links.parallel:ParallelLink",
        "compete": "brick.links.compete:CompeteLink",
    }
    _FALLBACK_MAP = {
        "brick.adapters": _FALLBACK_ADAPTERS,
        "brick.gates": _FALLBACK_GATES,
        "brick.links": _FALLBACK_LINKS,
    }

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
        results = self._discover_via_entry_points(group)
        if not results:
            results = self._discover_via_fallback(group)
        return results

    def _discover_via_entry_points(self, group: str) -> list[PluginMetadata]:
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

    def _discover_via_fallback(self, group: str) -> list[PluginMetadata]:
        """Fallback: import known plugins directly when entry_points unavailable."""
        import importlib
        results = []
        fallback = self._FALLBACK_MAP.get(group, {})
        for name, module_path in fallback.items():
            mod_name, cls_name = module_path.rsplit(":", 1)
            meta = PluginMetadata(
                name=name,
                display_name=name.replace("_", " ").title(),
                icon="\U0001f50c",
                description=f"Plugin: {module_path}",
            )
            try:
                mod = importlib.import_module(mod_name)
                cls = getattr(mod, cls_name)
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

    def _load_adapter_class(self, adapter_name: str):
        """Load adapter class via entry_points or fallback."""
        # Try entry_points first
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
                    return ep.load()
        except Exception:
            pass

        # Fallback: direct import
        import importlib as _importlib
        fallback = self._FALLBACK_ADAPTERS.get(adapter_name)
        if fallback:
            mod_name, cls_name = fallback.rsplit(":", 1)
            try:
                mod = _importlib.import_module(mod_name)
                return getattr(mod, cls_name)
            except Exception:
                pass
        return None

    def get_management_capabilities(self, adapter_name: str) -> dict:
        """Check which management features an adapter supports."""
        from brick.adapters.management import TeamManagementAdapter

        cls = self._load_adapter_class(adapter_name)
        if cls is not None:
            is_manageable = issubclass(cls, TeamManagementAdapter)
            return {
                "adapter": adapter_name,
                "has_management": is_manageable,
                "skills_tab": is_manageable,
                "mcp_tab": is_manageable,
                "model_tab": is_manageable,
                "members_tab": True,
            }

        return {
            "adapter": adapter_name,
            "has_management": False,
            "error": "Adapter not found",
        }
