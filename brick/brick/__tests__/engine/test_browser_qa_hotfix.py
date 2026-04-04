"""브라우저 QA 핫픽스 검증 — auth_routes 등록, 엔진 인증, cancel 상태, 프리셋 spec.

수정 대상:
- server.py: auth_routes 서버 등록 (Critical 1)
- engine_bridge.py: 엔드포인트별 인증 적용 (Critical 2)
- engine_bridge.py: cancel 상태값 'cancelled' (Medium 3)
- presets.py: 프리셋 상세 spec 채우기 (Medium 5)
"""

from __future__ import annotations

import os
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest


# ── Critical 1: auth_routes 서버 등록 ─────────────────────────────────

def test_critical1_auth_routes_registered():
    """auth_routes가 서버에 등록되어 /api/v1/auth/* 라우트 존재."""
    os.environ["BRICK_DEV_MODE"] = "1"
    try:
        from brick.dashboard.server import create_app
        app = create_app(root="/tmp/brick-test-bqa")
        paths = [r.path for r in app.routes]
        assert any("/api/v1/auth/login" in p for p in paths), \
            f"/api/v1/auth/login not found in routes: {paths}"
        assert any("/api/v1/auth/me" in p for p in paths), \
            f"/api/v1/auth/me not found in routes: {paths}"
    finally:
        os.environ.pop("BRICK_DEV_MODE", None)


# ── Critical 2: 엔진 인증 ──────────────────────────────────────────────

def test_critical2_engine_start_requires_auth():
    """POST /engine/start에 require_role_dep('operator') Depends가 있어야 함."""
    from brick.dashboard.routes.engine_bridge import start_workflow
    # FastAPI endpoint의 dependant에서 dependencies 확인
    import inspect
    sig = inspect.signature(start_workflow)
    params = sig.parameters
    assert "user" in params, \
        "start_workflow에 user 파라미터(인증 Depends)가 없음"


def test_critical2_engine_health_no_auth():
    """GET /engine/health는 인증 파라미터 없이 접근 가능."""
    from brick.dashboard.routes.engine_bridge import health_check
    import inspect
    sig = inspect.signature(health_check)
    params = sig.parameters
    assert "user" not in params, \
        "health_check에 user 파라미터가 있으면 안 됨 (인증 불필요)"


def test_critical2_engine_cancel_requires_auth():
    """POST /engine/cancel에 인증 Depends가 있어야 함."""
    from brick.dashboard.routes.engine_bridge import cancel_workflow
    import inspect
    sig = inspect.signature(cancel_workflow)
    assert "user" in sig.parameters


def test_critical2_engine_status_requires_auth():
    """GET /engine/status에 인증 Depends가 있어야 함."""
    from brick.dashboard.routes.engine_bridge import get_status
    import inspect
    sig = inspect.signature(get_status)
    assert "user" in sig.parameters


def test_critical2_engine_suspend_requires_auth():
    """POST /engine/suspend에 인증 Depends가 있어야 함."""
    from brick.dashboard.routes.engine_bridge import suspend_workflow
    import inspect
    sig = inspect.signature(suspend_workflow)
    assert "user" in sig.parameters


def test_critical2_engine_resume_requires_auth():
    """POST /engine/resume에 인증 Depends가 있어야 함."""
    from brick.dashboard.routes.engine_bridge import resume_workflow
    import inspect
    sig = inspect.signature(resume_workflow)
    assert "user" in sig.parameters


def test_critical2_engine_retry_requires_auth():
    """POST /engine/retry-adapter에 인증 Depends가 있어야 함."""
    from brick.dashboard.routes.engine_bridge import retry_adapter
    import inspect
    sig = inspect.signature(retry_adapter)
    assert "user" in sig.parameters


def test_critical2_engine_hook_requires_auth():
    """POST /engine/hook에 인증 Depends가 있어야 함."""
    from brick.dashboard.routes.engine_bridge import trigger_hook
    import inspect
    sig = inspect.signature(trigger_hook)
    assert "user" in sig.parameters


def test_critical2_router_no_global_auth():
    """engine router에 router-level dependencies가 없어야 함 (per-endpoint 방식)."""
    from brick.dashboard.routes.engine_bridge import router
    # router.dependencies는 빈 리스트여야 함
    assert len(router.dependencies) == 0, \
        f"router-level dependencies가 남아있음: {router.dependencies}"


# ── Medium 3: cancel 상태값 ─────────────────────────────────────────────

def test_medium3_cancel_returns_cancelled():
    """cancel 후 응답 status가 'cancelled'."""
    import asyncio
    from brick.dashboard.routes import engine_bridge
    from brick.models.events import Event, WorkflowStatus
    from brick.models.workflow import WorkflowInstance

    mock_instance = MagicMock(spec=WorkflowInstance)
    mock_instance.status = WorkflowStatus.FAILED

    mock_cs = MagicMock()
    mock_cs.load.return_value = mock_instance

    mock_sm = MagicMock()
    mock_sm.transition.return_value = (mock_instance, [])

    mock_user = MagicMock()

    original_cs = engine_bridge.checkpoint_store
    original_sm = engine_bridge.state_machine
    engine_bridge.checkpoint_store = mock_cs
    engine_bridge.state_machine = mock_sm

    try:
        result = asyncio.run(
            engine_bridge.cancel_workflow("wf-test", user=mock_user)
        )
        assert result["status"] == "cancelled", \
            f"cancel 응답 status가 'cancelled'가 아님: {result['status']}"
    finally:
        engine_bridge.checkpoint_store = original_cs
        engine_bridge.state_machine = original_sm


# ── Medium 5: 프리셋 spec 비어있음 ──────────────────────────────────────

def test_medium5_preset_spec_not_empty():
    """GET /presets/{name}의 spec이 비어있지 않음."""
    import yaml
    from brick.dashboard.routes.presets import get_preset
    from brick.dashboard.models.resource import BrickResource

    # 테스트용 프리셋 YAML 생성
    test_dir = Path("/tmp/brick-test-bqa-presets/presets")
    test_dir.mkdir(parents=True, exist_ok=True)
    test_yaml = test_dir / "test-preset.yaml"
    test_yaml.write_text(yaml.dump({
        "$schema": "brick/preset-v2",
        "name": "test-preset",
        "description": "테스트 프리셋",
        "blocks": [{"id": "plan", "type": "Plan"}],
        "links": [{"from": "plan", "to": "do"}],
    }))

    mock_resource = BrickResource(
        kind="Preset",
        name="test-preset",
        spec={},
        file_path=str(test_yaml),
    )

    mock_store = MagicMock()
    mock_store.get.return_value = mock_resource

    with patch("brick.dashboard.routes.presets._get_deps", return_value=(mock_store, None)):
        result = get_preset("test-preset")
        assert result.get("spec"), "spec이 비어있음"
        assert "blocks" in result["spec"], "spec에 blocks가 없음"
        assert "links" in result["spec"], "spec에 links가 없음"

    # 정리
    test_yaml.unlink(missing_ok=True)
