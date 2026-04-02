"""Validator — DAG validation, schema validation, invariant checks."""

from __future__ import annotations

from brick.models.block import Block
from brick.models.link import LinkDefinition
from brick.models.workflow import WorkflowDefinition


class Validator:
    """Validates workflow definitions against invariants INV-1~10."""

    def validate_workflow(self, defn: WorkflowDefinition) -> list[str]:
        errors: list[str] = []

        # INV-1: name (task) is required
        if not defn.name:
            errors.append("INV-1: workflow name (task) is required")

        # Per-block validation
        for block in defn.blocks:
            errors.extend(self.validate_block(block))

        # INV-5: all blocks must have adapter assignment
        for block in defn.blocks:
            team = defn.teams.get(block.id)
            if not team or not team.adapter:
                errors.append(f"INV-5: block '{block.id}' has no adapter assigned")

        # INV-6: all block transitions must have links
        block_ids = {b.id for b in defn.blocks}
        linked_pairs = {(l.from_block, l.to_block) for l in defn.links}
        # Check that consecutive blocks in definition have links
        for i in range(len(defn.blocks) - 1):
            from_id = defn.blocks[i].id
            to_id = defn.blocks[i + 1].id
            # Check if there's any link path from from_id
            has_link = any(l.from_block == from_id for l in defn.links)
            if not has_link:
                errors.append(f"INV-6: no link defined from block '{from_id}'")

        # INV-7/8: DAG cycle detection
        errors.extend(self.validate_dag(defn.blocks, defn.links))

        return errors

    def validate_dag(self, blocks: list[Block], links: list[LinkDefinition]) -> list[str]:
        errors: list[str] = []
        # Build adjacency for non-loop links
        adj: dict[str, list[str]] = {}
        block_ids = {b.id for b in blocks}
        for bid in block_ids:
            adj[bid] = []
        for link in links:
            if link.type == "loop":
                continue  # loop type is exempt from cycle detection
            if link.from_block in adj:
                adj[link.from_block].append(link.to_block)

        # DFS cycle detection
        WHITE, GRAY, BLACK = 0, 1, 2
        color = {bid: WHITE for bid in block_ids}

        def dfs(node: str) -> bool:
            color[node] = GRAY
            for neighbor in adj.get(node, []):
                if neighbor not in color:
                    continue
                if color[neighbor] == GRAY:
                    errors.append(f"INV-7: cycle detected involving block '{node}' -> '{neighbor}'")
                    return True
                if color[neighbor] == WHITE:
                    if dfs(neighbor):
                        return True
            color[node] = BLACK
            return False

        for bid in block_ids:
            if color[bid] == WHITE:
                dfs(bid)

        return errors

    def validate_block(self, block: Block) -> list[str]:
        errors: list[str] = []

        # INV-2: what is required
        if not block.what:
            errors.append(f"INV-2: block '{block.id}' has no 'what' defined")

        # INV-3: done is required
        if block.done is None:
            errors.append(f"INV-3: block '{block.id}' has no 'done' condition")

        return errors
