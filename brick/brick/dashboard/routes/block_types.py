"""Block Type CRUD routes."""

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


@router.get("/block-types", response_model=list[ResourceResponse])
def list_block_types():
    store, _ = _get_deps()
    resources = store.list("BlockType")
    return [_to_response(r) for r in resources]


@router.post("/block-types", response_model=ResourceResponse, status_code=201)
def create_block_type(body: ResourceSpec):
    store, pipeline = _get_deps()
    resource = BrickResource(
        kind="BlockType",
        name=body.name,
        spec=body.spec,
        labels=body.labels,
        annotations=body.annotations,
        readonly=body.readonly,
    )
    result = pipeline.validate(resource)
    if not result.valid:
        raise HTTPException(
            status_code=400,
            detail={
                "errors": [dataclasses.asdict(e) for e in result.errors],
                "warnings": [dataclasses.asdict(e) for e in result.warnings],
            },
        )
    try:
        created = store.create(resource)
    except FileExistsError:
        raise HTTPException(status_code=409, detail=f"BlockType '{body.name}' already exists")
    return _to_response(created)


@router.get("/block-types/{name}", response_model=ResourceResponse)
def get_block_type(name: str):
    store, _ = _get_deps()
    try:
        r = store.get("BlockType", name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"BlockType '{name}' not found")
    return _to_response(r)


@router.put("/block-types/{name}", response_model=ResourceResponse)
def update_block_type(name: str, body: ResourceSpec):
    store, pipeline = _get_deps()
    resource = BrickResource(
        kind="BlockType",
        name=name,
        spec=body.spec,
        labels=body.labels,
        annotations=body.annotations,
        readonly=body.readonly,
    )
    result = pipeline.validate(resource)
    if not result.valid:
        # Filter out READONLY errors — FileStore handles that
        non_readonly = [e for e in result.errors if e.code != "READONLY"]
        if non_readonly:
            raise HTTPException(
                status_code=400,
                detail={
                    "errors": [dataclasses.asdict(e) for e in non_readonly],
                },
            )
    try:
        updated = store.update(resource)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"BlockType '{name}' not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"BlockType '{name}' is readonly")
    return _to_response(updated)


@router.delete("/block-types/{name}", status_code=204)
def delete_block_type(name: str):
    store, _ = _get_deps()
    try:
        store.delete("BlockType", name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"BlockType '{name}' not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"BlockType '{name}' is readonly")
