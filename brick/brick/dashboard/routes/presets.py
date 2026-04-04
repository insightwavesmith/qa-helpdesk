"""Preset CRUD + validate routes."""

from __future__ import annotations

import dataclasses

from fastapi import APIRouter, HTTPException

from brick.dashboard.routes.schemas import ResourceSpec, ResourceResponse, ValidationResultResponse, ValidationErrorResponse
from brick.dashboard.models.resource import BrickResource

router = APIRouter()


def _get_deps():
    from brick.dashboard.server import file_store, pipeline
    return file_store, pipeline


def _to_response(r: BrickResource) -> dict:
    return dataclasses.asdict(r)


@router.get("/presets", response_model=list[ResourceResponse])
def list_presets():
    store, _ = _get_deps()
    return [_to_response(r) for r in store.list("Preset")]


@router.post("/presets", response_model=ResourceResponse, status_code=201)
def create_preset(body: ResourceSpec):
    store, pipeline = _get_deps()
    resource = BrickResource(
        kind="Preset", name=body.name, spec=body.spec,
        labels=body.labels, annotations=body.annotations, readonly=body.readonly,
    )
    try:
        created = store.create(resource)
    except FileExistsError:
        raise HTTPException(status_code=409, detail=f"Preset '{body.name}' already exists")
    return _to_response(created)


@router.get("/presets/{name}", response_model=ResourceResponse)
def get_preset(name: str):
    store, _ = _get_deps()
    try:
        resource = store.get("Preset", name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found")
    resp = _to_response(resource)
    # Preset YAML은 blocks/links/teams 등을 top-level에 배치 (spec wrapper 없음)
    if not resp.get("spec") and resource.file_path:
        import yaml
        from pathlib import Path
        raw = yaml.safe_load(Path(resource.file_path).read_text())
        meta_keys = {"kind", "name", "labels", "annotations", "readonly",
                     "version", "updated_at", "status", "spec", "file_path"}
        resp["spec"] = {k: v for k, v in raw.items() if k not in meta_keys}
    return resp


@router.put("/presets/{name}", response_model=ResourceResponse)
def update_preset(name: str, body: ResourceSpec):
    store, _ = _get_deps()
    resource = BrickResource(
        kind="Preset", name=name, spec=body.spec,
        labels=body.labels, annotations=body.annotations, readonly=body.readonly,
    )
    try:
        updated = store.update(resource)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Preset '{name}' is readonly")
    return _to_response(updated)


@router.delete("/presets/{name}", status_code=204)
def delete_preset(name: str):
    store, _ = _get_deps()
    try:
        store.delete("Preset", name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Preset '{name}' is readonly")


@router.post("/presets/{name}/validate", response_model=ValidationResultResponse)
def validate_preset(name: str):
    store, pipeline = _get_deps()
    try:
        resource = store.get("Preset", name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Preset '{name}' not found")
    result = pipeline.validate(resource)
    return {
        "valid": result.valid,
        "errors": [dataclasses.asdict(e) for e in result.errors],
        "warnings": [dataclasses.asdict(e) for e in result.warnings],
    }
