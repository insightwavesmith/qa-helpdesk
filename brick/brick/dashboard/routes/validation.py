"""Validation endpoints."""

from __future__ import annotations

import dataclasses

from fastapi import APIRouter

from brick.dashboard.routes.schemas import ResourceSpec, ValidationResultResponse, ValidationErrorResponse
from brick.dashboard.models.resource import BrickResource

router = APIRouter()


def _get_deps():
    from brick.dashboard.server import pipeline
    return pipeline


@router.post("/validate/preset", response_model=ValidationResultResponse)
def validate_preset(body: ResourceSpec):
    pipe = _get_deps()
    resource = BrickResource(
        kind="Preset", name=body.name, spec=body.spec,
        labels=body.labels, annotations=body.annotations, readonly=body.readonly,
    )
    result = pipe.validate(resource)
    return {
        "valid": result.valid,
        "errors": [dataclasses.asdict(e) for e in result.errors],
        "warnings": [dataclasses.asdict(e) for e in result.warnings],
    }


@router.post("/validate/block-type", response_model=ValidationResultResponse)
def validate_block_type(body: ResourceSpec):
    pipe = _get_deps()
    resource = BrickResource(
        kind="BlockType", name=body.name, spec=body.spec,
        labels=body.labels, annotations=body.annotations, readonly=body.readonly,
    )
    result = pipe.validate(resource)
    return {
        "valid": result.valid,
        "errors": [dataclasses.asdict(e) for e in result.errors],
        "warnings": [dataclasses.asdict(e) for e in result.warnings],
    }


@router.post("/validate/workflow-graph", response_model=ValidationResultResponse)
def validate_workflow_graph(body: ResourceSpec):
    pipe = _get_deps()
    resource = BrickResource(
        kind="Preset", name=body.name, spec=body.spec,
        labels=body.labels, annotations=body.annotations, readonly=body.readonly,
    )
    result = pipe.validate(resource)
    return {
        "valid": result.valid,
        "errors": [dataclasses.asdict(e) for e in result.errors],
        "warnings": [dataclasses.asdict(e) for e in result.warnings],
    }


@router.get("/invariants")
def list_invariants():
    """List all INV rules with description."""
    return [
        {"code": "INV-1", "description": "Workflow must have a 'task' field", "kind": "Workflow"},
        {"code": "INV-2", "description": "BlockType must have 'default_what'", "kind": "BlockType"},
        {"code": "INV-3", "description": "BlockType must have 'default_done'", "kind": "BlockType"},
        {"code": "INV-5", "description": "Every block must have a team assigned", "kind": "Preset"},
        {"code": "INV-7", "description": "Preset DAG must not contain cycles", "kind": "Preset"},
        {"code": "SCHEMA", "description": "Required fields must be present", "kind": "all"},
        {"code": "REFERENCE", "description": "Cross-references must exist", "kind": "Preset"},
        {"code": "READONLY", "description": "Readonly resources cannot be modified", "kind": "all"},
        {"code": "ADAPTER", "description": "Team must specify an adapter", "kind": "Team"},
    ]
