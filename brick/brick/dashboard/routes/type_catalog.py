"""Type catalog routes — read-only plugin discovery."""

from __future__ import annotations

import importlib.metadata

from fastapi import APIRouter

router = APIRouter()


def _discover_entry_points(group: str) -> list[dict]:
    """Discover plugins registered via entry_points."""
    results = []
    try:
        eps = importlib.metadata.entry_points()
        # Python 3.12+ returns SelectableGroups, 3.9+ returns dict
        if hasattr(eps, "select"):
            entries = eps.select(group=group)
        elif isinstance(eps, dict):
            entries = eps.get(group, [])
        else:
            entries = [ep for ep in eps if ep.group == group]

        for ep in entries:
            info = {
                "name": ep.name,
                "module": ep.value,
                "config_schema": {},
            }
            # Try to load and get config schema if available
            try:
                cls = ep.load()
                if hasattr(cls, "config_schema"):
                    info["config_schema"] = cls.config_schema()
            except Exception:
                pass
            results.append(info)
    except Exception:
        pass
    return results


@router.get("/adapter-types")
def list_adapter_types():
    return _discover_entry_points("brick.adapters")


@router.get("/gate-types")
def list_gate_types():
    return _discover_entry_points("brick.gates")


@router.get("/link-types")
def list_link_types():
    return _discover_entry_points("brick.links")
