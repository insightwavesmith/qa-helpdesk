"""BrickResource and validation models for Brick Dashboard."""

from dataclasses import dataclass, field


@dataclass
class BrickResource:
    """모든 Brick 리소스의 공통 구조 (K8s Resource Model 경량화)."""

    kind: str               # BlockType, Team, Preset, Workflow, LinkType, GateType
    name: str               # 리소스 이름 (유일)
    spec: dict              # kind별 명세 (YAML의 내용)
    labels: dict = field(default_factory=dict)
    annotations: dict = field(default_factory=dict)
    status: dict | None = None
    file_path: str = ""
    readonly: bool = False
    version: str = ""
    updated_at: str = ""


@dataclass
class ValidationError:
    code: str         # INV-1, SCHEMA, READONLY, etc.
    message: str
    severity: str = "error"   # error | warning
    field: str = ""           # 문제 필드 경로


@dataclass
class ValidationResult:
    valid: bool
    errors: list[ValidationError] = field(default_factory=list)
    warnings: list[ValidationError] = field(default_factory=list)
