"""FastAPI server for Brick Dashboard API."""

from __future__ import annotations

from fastapi import FastAPI

from brick.dashboard.file_store import FileStore
from brick.dashboard.validation_pipeline import ValidationPipeline

app = FastAPI(title="Brick Dashboard API", version="0.1.0")

# Global instances — initialized on startup
file_store: FileStore | None = None
pipeline: ValidationPipeline | None = None


def create_app(root: str = ".bkit/") -> FastAPI:
    """Create FastAPI app with initialized stores."""
    global file_store, pipeline
    file_store = FileStore(root=root)
    pipeline = ValidationPipeline(store=file_store)

    from brick.dashboard.routes import (
        block_types, teams, presets, workflows,
        validation, type_catalog, resources, learning,
    )
    app.include_router(block_types.router, prefix="/api/v1", tags=["block-types"])
    app.include_router(teams.router, prefix="/api/v1", tags=["teams"])
    app.include_router(presets.router, prefix="/api/v1", tags=["presets"])
    app.include_router(workflows.router, prefix="/api/v1", tags=["workflows"])
    app.include_router(validation.router, prefix="/api/v1", tags=["validation"])
    app.include_router(type_catalog.router, prefix="/api/v1", tags=["types"])
    app.include_router(resources.router, prefix="/api/v1", tags=["resources"])
    app.include_router(learning.router, prefix="/api/v1", tags=["learning"])

    return app
