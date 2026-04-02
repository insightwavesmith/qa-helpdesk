"""StateMachine — pure functional state transitions. Zero side effects."""

from __future__ import annotations

import copy
import time

from brick.models.events import (
    Event, Command, StartBlockCommand, CheckGateCommand,
    EmitEventCommand, SaveCheckpointCommand,
    WorkflowStatus, BlockStatus,
)
from brick.models.workflow import WorkflowInstance, BlockInstance


class StateMachine:
    """Pure functional state machine. transition() returns a NEW WorkflowInstance."""

    def transition(
        self, workflow: WorkflowInstance, event: Event
    ) -> tuple[WorkflowInstance, list[Command]]:
        wf = copy.deepcopy(workflow)
        wf.updated_at = time.time()

        if event.type.startswith("workflow."):
            return self._handle_workflow_event(wf, event)
        elif event.type.startswith("block."):
            return self._handle_block_event(wf, event)
        else:
            return wf, []

    def _handle_workflow_event(
        self, wf: WorkflowInstance, event: Event
    ) -> tuple[WorkflowInstance, list[Command]]:
        commands: list[Command] = []

        if event.type == "workflow.start":
            if wf.status != WorkflowStatus.PENDING:
                return wf, []
            wf.status = WorkflowStatus.RUNNING
            first_block = wf.get_first_block()
            first_block.status = BlockStatus.QUEUED
            wf.current_block_id = first_block.block.id
            commands.append(StartBlockCommand(
                block_id=first_block.block.id,
                adapter=first_block.adapter,
            ))
            commands.append(EmitEventCommand(
                event=Event(type="workflow.started", data={"workflow_id": wf.id}),
            ))
            commands.append(SaveCheckpointCommand())

        elif event.type == "workflow.suspend":
            if wf.status == WorkflowStatus.RUNNING:
                wf.status = WorkflowStatus.SUSPENDED
                commands.append(SaveCheckpointCommand())

        elif event.type == "workflow.resume":
            if wf.status == WorkflowStatus.SUSPENDED:
                wf.status = WorkflowStatus.RUNNING
                commands.append(SaveCheckpointCommand())

        elif event.type == "workflow.fail":
            if wf.status == WorkflowStatus.RUNNING:
                wf.status = WorkflowStatus.FAILED
                commands.append(SaveCheckpointCommand())

        return wf, commands

    def _handle_block_event(
        self, wf: WorkflowInstance, event: Event
    ) -> tuple[WorkflowInstance, list[Command]]:
        commands: list[Command] = []
        block_id = event.data.get("block_id", wf.current_block_id)
        if not block_id or block_id not in wf.blocks:
            return wf, []

        block_inst = wf.blocks[block_id]

        if event.type == "block.started":
            if block_inst.status in (BlockStatus.QUEUED, BlockStatus.PENDING):
                block_inst.status = BlockStatus.RUNNING
                block_inst.started_at = time.time()
                commands.append(SaveCheckpointCommand())

        elif event.type == "block.completed":
            if block_inst.status == BlockStatus.RUNNING:
                block_inst.status = BlockStatus.GATE_CHECKING
                block_inst.artifacts = event.data.get("artifacts", [])
                block_inst.metrics = event.data.get("metrics", {})
                commands.append(CheckGateCommand(block_id=block_id))
                commands.append(SaveCheckpointCommand())

        elif event.type == "block.gate_passed":
            if block_inst.status == BlockStatus.GATE_CHECKING:
                block_inst.status = BlockStatus.COMPLETED
                block_inst.completed_at = time.time()

                # Find next block via links
                next_blocks = self._find_next_blocks(wf, block_id)
                if next_blocks:
                    for next_id in next_blocks:
                        next_block = wf.blocks[next_id]
                        next_block.status = BlockStatus.QUEUED
                        wf.current_block_id = next_id
                        commands.append(StartBlockCommand(
                            block_id=next_id,
                            adapter=next_block.adapter,
                        ))
                else:
                    # Check if all blocks completed
                    if self._all_blocks_completed(wf):
                        wf.status = WorkflowStatus.COMPLETED
                        commands.append(EmitEventCommand(
                            event=Event(type="workflow.completed", data={"workflow_id": wf.id}),
                        ))
                commands.append(SaveCheckpointCommand())

        elif event.type == "block.gate_failed":
            gate_config = block_inst.block.gate
            on_fail = gate_config.on_fail if gate_config else "fail"
            max_retries = gate_config.max_retries if gate_config else 0

            if on_fail == "retry" and block_inst.retry_count < max_retries:
                block_inst.retry_count += 1
                block_inst.status = BlockStatus.RUNNING
                commands.append(StartBlockCommand(
                    block_id=block_id,
                    adapter=block_inst.adapter,
                ))
            elif on_fail == "skip":
                block_inst.status = BlockStatus.COMPLETED
                block_inst.completed_at = time.time()
                next_blocks = self._find_next_blocks(wf, block_id)
                if next_blocks:
                    for next_id in next_blocks:
                        wf.blocks[next_id].status = BlockStatus.QUEUED
                        wf.current_block_id = next_id
                        commands.append(StartBlockCommand(
                            block_id=next_id,
                            adapter=wf.blocks[next_id].adapter,
                        ))
                elif self._all_blocks_completed(wf):
                    wf.status = WorkflowStatus.COMPLETED
            else:
                block_inst.status = BlockStatus.FAILED
                block_inst.error = event.data.get("error", "Gate check failed")
                wf.status = WorkflowStatus.FAILED

            commands.append(SaveCheckpointCommand())

        elif event.type == "block.failed":
            block_inst.status = BlockStatus.FAILED
            block_inst.error = event.data.get("error", "Block execution failed")
            wf.status = WorkflowStatus.FAILED
            commands.append(SaveCheckpointCommand())

        return wf, commands

    def _find_next_blocks(self, wf: WorkflowInstance, block_id: str) -> list[str]:
        next_ids = []
        for link in wf.definition.links:
            if link.from_block == block_id:
                next_ids.append(link.to_block)
        return next_ids

    def _all_blocks_completed(self, wf: WorkflowInstance) -> bool:
        return all(
            bi.status == BlockStatus.COMPLETED
            for bi in wf.blocks.values()
        )
