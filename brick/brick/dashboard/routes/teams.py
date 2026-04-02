"""Team CRUD + Sub-resource routes."""

from __future__ import annotations

import dataclasses

from fastapi import APIRouter, HTTPException

from brick.dashboard.routes.schemas import (
    ResourceSpec, ResourceResponse, MemberSpec, ModelConfig, McpToggle, SkillSpec,
)
from brick.dashboard.models.resource import BrickResource

router = APIRouter()


def _get_deps():
    from brick.dashboard.server import file_store, pipeline
    return file_store, pipeline


def _to_response(r: BrickResource) -> dict:
    return dataclasses.asdict(r)


# --- Team CRUD ---

@router.get("/teams", response_model=list[ResourceResponse])
def list_teams():
    store, _ = _get_deps()
    return [_to_response(r) for r in store.list("Team")]


@router.post("/teams", response_model=ResourceResponse, status_code=201)
def create_team(body: ResourceSpec):
    store, _ = _get_deps()
    resource = BrickResource(
        kind="Team", name=body.name, spec=body.spec,
        labels=body.labels, annotations=body.annotations, readonly=body.readonly,
    )
    try:
        created = store.create(resource)
    except FileExistsError:
        raise HTTPException(status_code=409, detail=f"Team '{body.name}' already exists")
    return _to_response(created)


@router.get("/teams/{name}", response_model=ResourceResponse)
def get_team(name: str):
    store, _ = _get_deps()
    try:
        return _to_response(store.get("Team", name))
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Team '{name}' not found")


@router.put("/teams/{name}", response_model=ResourceResponse)
def update_team(name: str, body: ResourceSpec):
    store, _ = _get_deps()
    resource = BrickResource(
        kind="Team", name=name, spec=body.spec,
        labels=body.labels, annotations=body.annotations, readonly=body.readonly,
    )
    try:
        updated = store.update(resource)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Team '{name}' not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Team '{name}' is readonly")
    return _to_response(updated)


@router.delete("/teams/{name}", status_code=204)
def delete_team(name: str):
    store, _ = _get_deps()
    try:
        store.delete("Team", name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Team '{name}' not found")
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Team '{name}' is readonly")


# --- Sub-resources: Members ---

def _get_team(name: str) -> BrickResource:
    store, _ = _get_deps()
    try:
        return store.get("Team", name)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail=f"Team '{name}' not found")


def _save_team(team: BrickResource) -> BrickResource:
    store, _ = _get_deps()
    # Bypass readonly check for sub-resource updates by writing directly
    try:
        return store.update(team)
    except PermissionError:
        raise HTTPException(status_code=403, detail=f"Team '{team.name}' is readonly")


@router.get("/teams/{name}/members")
def list_members(name: str):
    team = _get_team(name)
    return team.spec.get("members", [])


@router.post("/teams/{name}/members", status_code=201)
def add_member(name: str, body: MemberSpec):
    team = _get_team(name)
    members = team.spec.setdefault("members", [])
    members.append({"name": body.name, "role": body.role, "model": body.model})
    _save_team(team)
    return {"name": body.name, "role": body.role, "model": body.model}


@router.put("/teams/{name}/members/{mid}")
def update_member(name: str, mid: str, body: MemberSpec):
    team = _get_team(name)
    members = team.spec.get("members", [])
    for m in members:
        if m.get("name") == mid:
            m["role"] = body.role
            m["model"] = body.model
            _save_team(team)
            return m
    raise HTTPException(status_code=404, detail=f"Member '{mid}' not found")


@router.delete("/teams/{name}/members/{mid}", status_code=204)
def delete_member(name: str, mid: str):
    team = _get_team(name)
    members = team.spec.get("members", [])
    original_len = len(members)
    team.spec["members"] = [m for m in members if m.get("name") != mid]
    if len(team.spec["members"]) == original_len:
        raise HTTPException(status_code=404, detail=f"Member '{mid}' not found")
    _save_team(team)


# --- Sub-resources: Skills ---

@router.get("/teams/{name}/skills")
def list_skills(name: str):
    team = _get_team(name)
    return team.spec.get("skills", [])


@router.put("/teams/{name}/skills/{sid}")
def update_skill(name: str, sid: str, body: SkillSpec):
    team = _get_team(name)
    skills = team.spec.get("skills", [])
    for s in skills:
        if s.get("name") == sid:
            s["path"] = body.path
            _save_team(team)
            return s
    raise HTTPException(status_code=404, detail=f"Skill '{sid}' not found")


# --- Sub-resources: MCP Servers ---

@router.get("/teams/{name}/mcp")
def list_mcp(name: str):
    team = _get_team(name)
    return team.spec.get("mcp_servers", [])


@router.put("/teams/{name}/mcp/{sid}")
def toggle_mcp(name: str, sid: str, body: McpToggle):
    team = _get_team(name)
    servers = team.spec.get("mcp_servers", [])
    for s in servers:
        if s.get("name") == sid:
            s["enabled"] = body.enabled
            _save_team(team)
            return s
    raise HTTPException(status_code=404, detail=f"MCP server '{sid}' not found")


# --- Sub-resources: Model Config ---

@router.get("/teams/{name}/model")
def get_model_config(name: str):
    team = _get_team(name)
    return team.spec.get("model_config", {})


@router.put("/teams/{name}/model")
def update_model_config(name: str, body: ModelConfig):
    team = _get_team(name)
    team.spec["model_config"] = {"default": body.default, "fallback": body.fallback}
    _save_team(team)
    return team.spec["model_config"]


# --- Sub-resources: Status ---

@router.get("/teams/{name}/status")
def get_team_status(name: str):
    team = _get_team(name)
    return {
        "name": team.name,
        "adapter": team.spec.get("adapter", ""),
        "members_count": len(team.spec.get("members", [])),
        "model_config": team.spec.get("model_config", {}),
        "status": team.status or {"phase": "idle"},
    }
