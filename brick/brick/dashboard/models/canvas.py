"""Canvas models for React Flow state representation."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class CanvasNode:
    """React Flow 노드."""

    id: str
    type: str = "blockNode"
    position: dict = field(default_factory=lambda: {"x": 0, "y": 0})
    data: dict = field(default_factory=dict)


@dataclass
class CanvasEdge:
    """React Flow 엣지."""

    id: str
    source: str
    target: str
    type: str = "linkEdge"
    data: dict = field(default_factory=dict)


@dataclass
class CanvasState:
    """React Flow 캔버스 전체 상태."""

    nodes: list[CanvasNode] = field(default_factory=list)
    edges: list[CanvasEdge] = field(default_factory=list)
