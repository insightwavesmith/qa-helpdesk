"""Bidirectional converters: Preset YAML dict ↔ React Flow CanvasState."""

from __future__ import annotations

from collections import defaultdict, deque

from brick.dashboard.models.canvas import CanvasEdge, CanvasNode, CanvasState


class DagreLayoutEngine:
    """Simple dagre-inspired auto-layout for DAGs."""

    HORIZONTAL_SPACING = 250
    VERTICAL_SPACING = 150
    NODE_WIDTH = 200
    NODE_HEIGHT = 100

    def layout(self, nodes: list[str], edges: list[tuple[str, str]]) -> dict[str, dict]:
        """Compute positions for all nodes using topological layering."""
        if not nodes:
            return {}

        children: dict[str, list[str]] = defaultdict(list)
        in_degree: dict[str, int] = {n: 0 for n in nodes}

        for src, tgt in edges:
            children[src].append(tgt)
            in_degree[tgt] = in_degree.get(tgt, 0) + 1

        # Topological sort + layer assignment (longest path from roots)
        layers: dict[str, int] = {}
        queue = deque()
        for n in nodes:
            if in_degree[n] == 0:
                queue.append(n)
                layers[n] = 0

        while queue:
            node = queue.popleft()
            for child in children[node]:
                candidate_layer = layers[node] + 1
                if child not in layers or candidate_layer > layers[child]:
                    layers[child] = candidate_layer
                in_degree[child] -= 1
                if in_degree[child] == 0:
                    queue.append(child)

        # Handle isolated nodes (no edges)
        for n in nodes:
            if n not in layers:
                layers[n] = 0

        # Group nodes by layer
        layer_groups: dict[int, list[str]] = defaultdict(list)
        for n, layer in layers.items():
            layer_groups[layer].append(n)

        # Assign positions
        positions: dict[str, dict] = {}
        for layer_idx, group in sorted(layer_groups.items()):
            x = layer_idx * self.HORIZONTAL_SPACING
            for rank, node_id in enumerate(group):
                y = rank * self.VERTICAL_SPACING
                positions[node_id] = {"x": x, "y": y}

        return positions


class PresetToCanvasConverter:
    """프리셋 YAML dict → React Flow CanvasState."""

    def __init__(self) -> None:
        self._layout_engine = DagreLayoutEngine()

    def convert(self, preset: dict, layout: dict | None = None) -> CanvasState:
        blocks = preset.get("blocks", [])
        links = preset.get("links", [])
        teams = preset.get("teams", {})
        gates = preset.get("gates", {})

        # Build auto-layout if no explicit layout provided
        if layout is None:
            node_ids = [b.get("id", f"block-{i}") for i, b in enumerate(blocks)]
            edge_pairs = [(l.get("from", ""), l.get("to", "")) for l in links]
            auto_positions = self._layout_engine.layout(node_ids, edge_pairs)
        else:
            auto_positions = {}

        nodes = []
        for i, block in enumerate(blocks):
            block_id = block.get("id", f"block-{i}")
            if layout and block_id in layout:
                pos = layout[block_id]
            elif block_id in auto_positions:
                pos = auto_positions[block_id]
            else:
                pos = {"x": i * 250, "y": 100}

            nodes.append(
                CanvasNode(
                    id=block_id,
                    type="blockNode",
                    position=pos,
                    data={
                        "block": block,
                        "team": teams.get(block_id),
                        "gate": gates.get(block_id),
                    },
                )
            )

        edges = []
        for link in links:
            from_id = link.get("from", "")
            to_id = link.get("to", "")
            edge_id = f"{from_id}-{to_id}"
            extra = {k: v for k, v in link.items() if k not in ("from", "to", "type")}
            edges.append(
                CanvasEdge(
                    id=edge_id,
                    source=from_id,
                    target=to_id,
                    type="linkEdge",
                    data={"link_type": link.get("type", "sequential"), **extra},
                )
            )

        return CanvasState(nodes=nodes, edges=edges)


class CanvasToPresetConverter:
    """React Flow CanvasState → 프리셋 dict."""

    def convert(self, canvas: CanvasState, original_preset: dict | None = None) -> dict:
        preset = original_preset.copy() if original_preset else {}

        blocks = []
        teams = {}
        gates = {}

        for node in canvas.nodes:
            block_data = node.data.get("block", {})
            blocks.append(block_data)

            team_data = node.data.get("team")
            if team_data:
                teams[node.id] = team_data

            gate_data = node.data.get("gate")
            if gate_data:
                gates[node.id] = gate_data

        links = []
        for edge in canvas.edges:
            link = {
                "from": edge.source,
                "to": edge.target,
                "type": edge.data.get("link_type", "sequential"),
            }
            for k, v in edge.data.items():
                if k != "link_type":
                    link[k] = v
            links.append(link)

        preset["blocks"] = blocks
        preset["links"] = links
        preset["teams"] = teams
        if gates:
            preset["gates"] = gates

        return preset
