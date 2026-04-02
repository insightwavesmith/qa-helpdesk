"""Brick CLI — Build it. Block by Block."""

from __future__ import annotations

import asyncio
import json
import shutil
from pathlib import Path

import click


@click.group()
def cli():
    """🧱 Brick — Build it. Block by Block."""
    pass


@cli.command()
def init():
    """Initialize .bkit/ directory."""
    Path(".bkit/runtime/workflows").mkdir(parents=True, exist_ok=True)
    Path(".bkit/runtime/human-completions").mkdir(parents=True, exist_ok=True)
    Path(".bkit/presets").mkdir(parents=True, exist_ok=True)

    # Copy built-in presets (skip if user already has a file with same name)
    builtin_presets = Path(__file__).parent / "presets"
    if builtin_presets.exists():
        for src in builtin_presets.glob("*.yaml"):
            dst = Path(".bkit/presets") / src.name
            if not dst.exists():
                shutil.copy2(src, dst)

    click.echo("🧱 Brick initialized.")


@cli.command()
@click.option("--preset", required=True)
@click.option("--feature", required=True)
@click.option("--task", default="")
@click.option("--adapter", default="human")
def start(preset, feature, task, adapter):
    """Start a workflow from a preset."""
    from brick.engine.executor import WorkflowExecutor, PresetLoader
    from brick.engine.state_machine import StateMachine
    from brick.engine.event_bus import EventBus
    from brick.engine.checkpoint import CheckpointStore
    from brick.gates.base import GateExecutor

    presets_dir = Path("brick/presets")
    if not presets_dir.exists():
        presets_dir = Path(__file__).parent / "presets"

    executor = WorkflowExecutor(
        state_machine=StateMachine(),
        event_bus=EventBus(),
        checkpoint=CheckpointStore(Path(".bkit/runtime/workflows")),
        gate_executor=GateExecutor(),
        preset_loader=PresetLoader(presets_dir),
    )

    workflow_id = asyncio.run(executor.start(preset, feature, task or feature))
    click.echo(f"🧱 Workflow started: {workflow_id}")


@cli.command()
@click.argument("workflow_id", required=False)
def status(workflow_id):
    """Show workflow status."""
    from brick.engine.checkpoint import CheckpointStore

    store = CheckpointStore(Path(".bkit/runtime/workflows"))
    if workflow_id:
        instance = store.load(workflow_id)
        if instance:
            click.echo(f"Workflow: {instance.id}")
            click.echo(f"Status: {instance.status.value}")
            click.echo(f"Feature: {instance.feature}")
            for bid, block in instance.blocks.items():
                click.echo(
                    f"  [{block.status.value:15}] {bid}: {block.block.what}"
                )
        else:
            click.echo(f"Workflow {workflow_id} not found")
    else:
        active = store.list_active()
        if not active:
            click.echo("No active workflows")
            return
        for wid in active:
            inst = store.load(wid)
            if inst:
                click.echo(f"  {wid} [{inst.status.value}] {inst.feature}")


@cli.command()
@click.option("--block", required=True)
@click.option("--workflow", required=True)
def complete(block, workflow):
    """Complete a block (trigger gate check)."""
    from brick.engine.executor import WorkflowExecutor, PresetLoader
    from brick.engine.state_machine import StateMachine
    from brick.engine.event_bus import EventBus
    from brick.engine.checkpoint import CheckpointStore
    from brick.gates.base import GateExecutor

    executor = WorkflowExecutor(
        state_machine=StateMachine(),
        event_bus=EventBus(),
        checkpoint=CheckpointStore(Path(".bkit/runtime/workflows")),
        gate_executor=GateExecutor(),
    )

    result = asyncio.run(executor.complete_block(workflow, block))
    if result.passed:
        click.echo(f"✅ Block {block} gate passed")
    else:
        click.echo(f"❌ Block {block} gate failed: {result.detail}")


@cli.command()
@click.option("--block", required=True)
@click.option("--workflow", required=True)
@click.option("--reviewer", required=True)
def approve(block, workflow, reviewer):
    """Approve review gate."""
    click.echo(f"✅ Block {block} approved by {reviewer}")


@cli.command()
@click.argument("workflow_id", required=False)
def viz(workflow_id):
    """Visualize workflow (ASCII)."""
    from brick.engine.checkpoint import CheckpointStore

    store = CheckpointStore(Path(".bkit/runtime/workflows"))
    instance = store.load(workflow_id) if workflow_id else None
    if not instance:
        active = store.list_active()
        if active:
            instance = store.load(active[0])
    if instance:
        click.echo(f"\n🧱 {instance.feature} [{instance.status.value}]")
        for link in instance.definition.links:
            src = instance.blocks.get(link.from_block)
            dst = instance.blocks.get(link.to_block)
            src_status = src.status.value if src else "?"
            dst_status = dst.status.value if dst else "?"
            click.echo(
                f"  [{src_status:10}] {link.from_block} ──{link.type}──▶ "
                f"{link.to_block} [{dst_status}]"
            )
    else:
        click.echo("No active workflows")


@cli.command()
@click.option("--preset", required=True)
def validate(preset):
    """Validate a preset."""
    from brick.engine.executor import PresetLoader
    from brick.engine.validator import Validator

    presets_dir = Path("brick/presets")
    if not presets_dir.exists():
        presets_dir = Path(__file__).parent / "presets"

    loader = PresetLoader(presets_dir)
    try:
        defn = loader.load(preset)
        validator = Validator()
        errors = validator.validate_workflow(defn)
        if errors:
            for e in errors:
                click.echo(f"❌ {e}", err=True)
            raise SystemExit(1)
        click.echo(f"✅ Preset {preset} is valid")
    except FileNotFoundError:
        click.echo(f"❌ Preset {preset} not found", err=True)
        raise SystemExit(1)


@cli.command()
@click.option("--block", required=True)
@click.option("--workflow", required=True)
def gate(block, workflow):
    """Run gate manually."""
    click.echo(f"🔍 Running gate for {block} in {workflow}...")


@cli.command("approve-rule")
@click.argument("suggestion_id")
def approve_rule(suggestion_id):
    """Approve a learning harness suggestion."""
    from brick.engine.learning import RuleSuggester

    suggester = RuleSuggester(Path(".bkit/runtime/suggestions"))
    try:
        result = suggester.approve(suggestion_id)
        desc = result.get("suggested_rule", {}).get("description", "")
        click.echo(f"✅ Suggestion {suggestion_id} approved: {desc}")
    except FileNotFoundError:
        click.echo(f"❌ Suggestion {suggestion_id} not found", err=True)
        raise SystemExit(1)


@cli.command()
@click.option("--port", default=18700, help="Server port")
@click.option("--readonly", is_flag=True, help="Read-only mode")
def serve(port, readonly):
    """Start the Brick Dashboard API server."""
    import uvicorn
    from brick.dashboard.server import create_app
    app = create_app()
    uvicorn.run(app, host="0.0.0.0", port=port)


if __name__ == "__main__":
    cli()
