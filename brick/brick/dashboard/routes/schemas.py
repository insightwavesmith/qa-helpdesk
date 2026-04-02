"""Pydantic models for Brick Dashboard API request/response."""

from __future__ import annotations

from pydantic import BaseModel


class ResourceSpec(BaseModel):
    kind: str
    name: str
    spec: dict = {}
    labels: dict = {}
    annotations: dict = {}
    readonly: bool = False


class ResourceResponse(BaseModel):
    kind: str
    name: str
    spec: dict
    labels: dict = {}
    annotations: dict = {}
    status: dict | None = None
    file_path: str = ""
    readonly: bool = False
    version: str = ""
    updated_at: str = ""


class ValidationErrorResponse(BaseModel):
    code: str
    message: str
    severity: str = "error"
    field: str = ""


class ValidationResultResponse(BaseModel):
    valid: bool
    errors: list[ValidationErrorResponse] = []
    warnings: list[ValidationErrorResponse] = []


class MemberSpec(BaseModel):
    name: str
    role: str = ""
    model: str = ""


class ModelConfig(BaseModel):
    default: str
    fallback: str = ""


class McpToggle(BaseModel):
    enabled: bool


class SkillSpec(BaseModel):
    name: str
    path: str = ""


class GateAction(BaseModel):
    reason: str = ""
