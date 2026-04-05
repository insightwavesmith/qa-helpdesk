"""FastAPI server for Brick Dashboard API."""

from __future__ import annotations

from fastapi import FastAPI

from brick.dashboard.file_store import FileStore
from brick.dashboard.validation_pipeline import ValidationPipeline

app = FastAPI(title="Brick Dashboard API", version="0.1.0")

# Global instances — initialized on startup
file_store: FileStore | None = None
pipeline: ValidationPipeline | None = None


def create_app(root: str = "brick/") -> FastAPI:
    """Create FastAPI app with initialized stores."""
    global file_store, pipeline
    file_store = FileStore(root=root)
    pipeline = ValidationPipeline(store=file_store)

    # Auth DB 초기화
    from brick.auth.db import init_db
    init_db()

    from brick.dashboard.routes import (
        auth_routes, agent_routes,
        block_types, teams, presets, workflows,
        validation, type_catalog, resources, learning,
        engine_bridge, skyoffice,
    )
    app.include_router(auth_routes.router, prefix="/api/v1", tags=["auth"])
    app.include_router(agent_routes.router, prefix="/api/v1", tags=["agents"])
    app.include_router(block_types.router, prefix="/api/v1", tags=["block-types"])
    app.include_router(teams.router, prefix="/api/v1", tags=["teams"])
    app.include_router(presets.router, prefix="/api/v1", tags=["presets"])
    app.include_router(workflows.router, prefix="/api/v1", tags=["workflows"])
    app.include_router(validation.router, prefix="/api/v1", tags=["validation"])
    app.include_router(type_catalog.router, prefix="/api/v1", tags=["types"])
    app.include_router(resources.router, prefix="/api/v1", tags=["resources"])
    app.include_router(learning.router, prefix="/api/v1", tags=["learning"])

    engine_bridge.init_engine(root=root)
    # DI: EngineContainer를 app.state.engine에 저장 (Phase 1 #3)
    from brick.engine.engine_bootstrap import init_engine as _bootstrap_init
    from brick.engine.container import EngineContainer
    if not hasattr(app.state, "engine"):
        app.state.engine = EngineContainer(
            executor=engine_bridge.executor,
            preset_loader=engine_bridge.preset_loader,
            checkpoint_store=engine_bridge.checkpoint_store,
            state_machine=engine_bridge.state_machine,
            event_bus=engine_bridge.engine_event_bus,
            skyoffice_bridge=engine_bridge.skyoffice_bridge,
        )
    app.include_router(engine_bridge.router, prefix="/api/v1", tags=["engine-bridge"])

    # SkyOffice Bridge — Phase 3 실시간 상태 동기화
    if engine_bridge.skyoffice_bridge:
        skyoffice.init_skyoffice(engine_bridge.skyoffice_bridge)
    app.include_router(skyoffice.router, prefix="/api/v1", tags=["skyoffice"])

    return app
