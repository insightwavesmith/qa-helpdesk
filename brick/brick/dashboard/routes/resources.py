"""Unified resource API routes."""

from __future__ import annotations

import dataclasses
from typing import Optional

from fastapi import APIRouter, Query

from brick.dashboard.routes.schemas import ResourceResponse

router = APIRouter()


def _get_deps():
    from brick.dashboard.server import file_store
    return file_store


def _to_response(r) -> dict:
    return dataclasses.asdict(r)


@router.get("/resources", response_model=list[ResourceResponse])
def list_resources(
    kind: Optional[str] = Query(None, description="Filter by resource kind"),
    label: Optional[str] = Query(None, description="Filter by label (key:value)"),
):
    store = _get_deps()
    all_resources = []

    kinds_to_scan = [kind] if kind else list(store.KIND_PATHS.keys())

    for k in kinds_to_scan:
        try:
            all_resources.extend(store.list(k))
        except ValueError:
            continue

    # Filter by label if provided
    if label and ":" in label:
        label_key, label_value = label.split(":", 1)
        all_resources = [
            r for r in all_resources
            if r.labels.get(label_key) == label_value
        ]

    return [_to_response(r) for r in all_resources]
