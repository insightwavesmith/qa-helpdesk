"""System Layer — INV banner, readonly badge, save blocking helpers."""

from __future__ import annotations

from brick.dashboard.models.resource import BrickResource, ValidationResult
from brick.dashboard.validation_pipeline import ValidationPipeline


class SystemLayerHelper:
    """Backend helpers for System Layer UI components."""

    def __init__(self, pipeline: ValidationPipeline):
        self.pipeline = pipeline

    def get_invariant_banner(self, resource: BrickResource) -> dict | None:
        """Check resource for INV violations → return banner data or None."""
        result = self.pipeline.validate(resource)
        inv_errors = [e for e in result.errors if e.code.startswith("INV-")]
        if inv_errors:
            return {
                "type": "error",
                "color": "#DC2626",
                "violations": [{"code": e.code, "message": e.message} for e in inv_errors],
            }
        return None

    def get_readonly_badge(self, resource: BrickResource) -> dict | None:
        """If resource is readonly (Core preset) → return badge data."""
        if resource.readonly:
            return {
                "type": "readonly",
                "icon": "\U0001f512",
                "label": "Core",
                "message": f"'{resource.name}'은 Core 프리셋입니다. 수정할 수 없습니다.",
            }
        return None

    def can_save(self, resource: BrickResource) -> dict:
        """Check if resource can be saved (no INV violations, not readonly)."""
        result = self.pipeline.validate(resource)
        return {
            "enabled": result.valid,
            "violations": [{"code": e.code, "message": e.message} for e in result.errors],
        }
