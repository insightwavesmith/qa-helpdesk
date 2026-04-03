"""Engine Bridge — FastAPI router bridging Dashboard to Brick Engine (EP-1~8)."""

from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from brick.engine.checkpoint import CheckpointStore
from brick.engine.event_bus import EventBus
from brick.engine.executor import PresetLoader, WorkflowExecutor
from brick.engine.state_machine import StateMachine
from brick.engine.validator import Validator
from brick.gates.base import GateExecutor
from brick.models.events import (
    BlockStatus,
    Event,
    StartBlockCommand,
    WorkflowStatus,
)
from brick.models.workflow import WorkflowInstance

router = APIRouter(prefix="/engine", tags=["engine-bridge"])

# Global instances — initialized via init_engine()
executor: WorkflowExecutor | None = None
preset_loader: PresetLoader | None = None
checkpoint_store: CheckpointStore | None = None
state_machine: StateMachine | None = None


# ── Pydantic request models ──────────────────────────────────────────

class StartRequest(BaseModel):
    preset_name: str
    feature: str
    task: str


class CompleteBlockRequest(BaseModel):
    workflow_id: str
    block_id: str
    metrics: dict | None = None
    artifacts: list[str] | None = None


class RetryAdapterRequest(BaseModel):
    workflow_id: str
    block_id: str


# ── Init ─────────────────────────────────────────────────────────────

def init_engine(root: str = ".bkit/") -> None:
    """Initialize engine components. Called from server.py create_app()."""
    global executor, preset_loader, checkpoint_store, state_machine

    root_path = Path(root)
    sm = StateMachine()
    eb = EventBus()
    cs = CheckpointStore(base_dir=root_path / "runtime" / "workflows")
    ge = GateExecutor()
    val = Validator()
    pl = PresetLoader(presets_dir=root_path / "presets")

    we = WorkflowExecutor(
        state_machine=sm,
        event_bus=eb,
        checkpoint=cs,
        gate_executor=ge,
        preset_loader=pl,
        validator=val,
    )

    executor = we
    preset_loader = pl
    checkpoint_store = cs
    state_machine = sm


# ── Helpers ──────────────────────────────────────────────────────────

def _serialize_instance(instance: WorkflowInstance) -> dict:
    """Convert WorkflowInstance to API response dict."""
    return {
        "workflow_id": instance.id,
        "status": instance.status.value,
        "current_block_id": instance.current_block_id,
        "blocks_state": _serialize_blocks_state(instance),
        "context": instance.context,
        "definition": instance.definition.to_dict(),
        "feature": instance.feature,
        "task": instance.task,
        "created_at": instance.created_at,
        "updated_at": instance.updated_at,
    }


def _serialize_blocks_state(instance: WorkflowInstance) -> dict:
    """Extract blocks_state dict from instance."""
    return {
        block_id: {
            "status": bi.status.value,
            "adapter": bi.adapter,
            "execution_id": bi.execution_id,
            "artifacts": bi.artifacts,
            "metrics": bi.metrics,
            "retry_count": bi.retry_count,
            "started_at": bi.started_at,
            "completed_at": bi.completed_at,
            "error": bi.error,
        }
        for block_id, bi in instance.blocks.items()
    }


def _get_next_blocks(instance: WorkflowInstance, completed_block_id: str) -> list[str]:
    """Find next blocks by checking links + current statuses."""
    next_ids = []
    for link in instance.definition.links:
        if link.from_block != completed_block_id:
            continue
        to_block = instance.blocks.get(link.to_block)
        if to_block and to_block.status in (BlockStatus.QUEUED, BlockStatus.RUNNING):
            next_ids.append(link.to_block)
    return next_ids


def _count_active_workflows() -> int:
    """Count active workflows from checkpoint store."""
    if not checkpoint_store:
        return 0
    return len(checkpoint_store.list_active())


# ── EP-1: POST /engine/start ─────────────────────────────────────────

@router.post("/start")
async def start_workflow(req: StartRequest):
    """Start a new workflow from a preset."""
    if not executor:
        raise HTTPException(status_code=500, detail="Engine not initialized")

    try:
        workflow_id = await executor.start(req.preset_name, req.feature, req.task)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="preset_not_found")
    except ValueError as e:
        error_msg = str(e)
        if "Validation errors" in error_msg:
            raise HTTPException(status_code=422, detail="validation_failed")
        raise HTTPException(status_code=400, detail=error_msg)

    instance = checkpoint_store.load(workflow_id)
    if not instance:
        raise HTTPException(status_code=500, detail="Failed to load workflow after start")

    return _serialize_instance(instance)


# ── EP-2: POST /engine/complete-block ────────────────────────────────

@router.post("/complete-block")
async def complete_block(req: CompleteBlockRequest):
    """Complete a block and run gate checks."""
    if not executor or not checkpoint_store:
        raise HTTPException(status_code=500, detail="Engine not initialized")

    instance = checkpoint_store.load(req.workflow_id)
    if not instance:
        raise HTTPException(status_code=404, detail="workflow_not_found")

    block_inst = instance.blocks.get(req.block_id)
    if not block_inst:
        raise HTTPException(status_code=404, detail="block_not_found")

    # Inject metrics into context BEFORE calling executor.complete_block()
    if req.metrics:
        instance.context.update(req.metrics)
        checkpoint_store.save(req.workflow_id, instance)

    # Inject artifacts into block
    if req.artifacts:
        block_inst.artifacts = req.artifacts
        checkpoint_store.save(req.workflow_id, instance)

    gate_result = await executor.complete_block(req.workflow_id, req.block_id)

    # Reload instance after complete_block (state may have changed)
    instance = checkpoint_store.load(req.workflow_id)

    next_blocks = _get_next_blocks(instance, req.block_id)

    # Build adapter_results from next blocks
    adapter_results = []
    for nb_id in next_blocks:
        nb = instance.blocks.get(nb_id)
        if nb:
            adapter_results.append({
                "block_id": nb_id,
                "adapter": nb.adapter,
                "started": nb.status in (BlockStatus.RUNNING, BlockStatus.QUEUED),
                "execution_id": nb.execution_id,
            })

    return {
        "workflow_id": req.workflow_id,
        "block_id": req.block_id,
        "block_status": instance.blocks[req.block_id].status.value,
        "gate_result": {
            "passed": gate_result.passed,
            "type": gate_result.type,
            "detail": gate_result.detail,
            "metrics": gate_result.metrics,
        },
        "next_blocks": next_blocks,
        "adapter_results": adapter_results,
        "blocks_state": _serialize_blocks_state(instance),
        "context": instance.context,
    }


# ── EP-3: GET /engine/status/{workflow_id} ───────────────────────────

@router.get("/status/{workflow_id}")
async def get_status(workflow_id: str):
    """Get workflow status with events."""
    if not checkpoint_store:
        raise HTTPException(status_code=500, detail="Engine not initialized")

    instance = checkpoint_store.load(workflow_id)
    if not instance:
        raise HTTPException(status_code=404, detail="workflow_not_found")

    events = checkpoint_store.load_events(workflow_id)
    result = _serialize_instance(instance)
    result["events"] = [
        {"type": e.type, "data": e.data, "timestamp": e.timestamp, "id": e.id}
        for e in events
    ]
    return result


# ── EP-4: POST /engine/suspend/{workflow_id} ─────────────────────────

@router.post("/suspend/{workflow_id}")
async def suspend_workflow(workflow_id: str):
    """Suspend a running workflow."""
    if not checkpoint_store or not state_machine:
        raise HTTPException(status_code=500, detail="Engine not initialized")

    instance = checkpoint_store.load(workflow_id)
    if not instance:
        raise HTTPException(status_code=404, detail="workflow_not_found")

    event = Event(type="workflow.suspend")
    instance, _commands = state_machine.transition(instance, event)
    checkpoint_store.save(workflow_id, instance)

    return {"workflow_id": workflow_id, "status": instance.status.value}


# ── EP-5: POST /engine/resume/{workflow_id} ──────────────────────────

@router.post("/resume/{workflow_id}")
async def resume_workflow(workflow_id: str):
    """Resume a suspended workflow."""
    if not checkpoint_store or not state_machine:
        raise HTTPException(status_code=500, detail="Engine not initialized")

    instance = checkpoint_store.load(workflow_id)
    if not instance:
        raise HTTPException(status_code=404, detail="workflow_not_found")

    event = Event(type="workflow.resume")
    instance, _commands = state_machine.transition(instance, event)
    checkpoint_store.save(workflow_id, instance)

    return _serialize_instance(instance)


# ── EP-6: POST /engine/cancel/{workflow_id} ──────────────────────────

@router.post("/cancel/{workflow_id}")
async def cancel_workflow(workflow_id: str):
    """Cancel a workflow (sets status to failed)."""
    if not checkpoint_store or not state_machine:
        raise HTTPException(status_code=500, detail="Engine not initialized")

    instance = checkpoint_store.load(workflow_id)
    if not instance:
        raise HTTPException(status_code=404, detail="workflow_not_found")

    event = Event(type="workflow.fail")
    instance, _commands = state_machine.transition(instance, event)
    checkpoint_store.save(workflow_id, instance)

    return {"workflow_id": workflow_id, "status": instance.status.value}


# ── EP-7: GET /engine/health ─────────────────────────────────────────

@router.get("/health")
async def health_check():
    """Engine health check."""
    presets_count = 0
    if preset_loader:
        try:
            presets_count = len(list(preset_loader.presets_dir.glob("*.yaml")))
        except Exception:
            pass

    return {
        "status": "ok",
        "engine_version": "0.1.0",
        "presets_loaded": presets_count,
        "active_workflows": _count_active_workflows(),
    }


# ── EP-8: POST /engine/retry-adapter ────────────────────────────────

@router.post("/retry-adapter")
async def retry_adapter(req: RetryAdapterRequest):
    """Retry adapter for a QUEUED block."""
    if not executor or not checkpoint_store:
        raise HTTPException(status_code=500, detail="Engine not initialized")

    instance = checkpoint_store.load(req.workflow_id)
    if not instance:
        raise HTTPException(status_code=404, detail="workflow_not_found")

    block_inst = instance.blocks.get(req.block_id)
    if not block_inst:
        raise HTTPException(status_code=404, detail="block_not_found")

    if block_inst.status != BlockStatus.QUEUED:
        raise HTTPException(
            status_code=409,
            detail=f"Block {req.block_id} is not in QUEUED state (current: {block_inst.status.value})",
        )

    # Re-execute StartBlockCommand
    cmd = StartBlockCommand(block_id=req.block_id, adapter=block_inst.adapter)
    instance = await executor._execute_command(instance, cmd)

    # Reload
    instance = checkpoint_store.load(req.workflow_id)

    return {
        "workflow_id": req.workflow_id,
        "block_id": req.block_id,
        "status": instance.blocks[req.block_id].status.value,
        "execution_id": instance.blocks[req.block_id].execution_id,
    }
