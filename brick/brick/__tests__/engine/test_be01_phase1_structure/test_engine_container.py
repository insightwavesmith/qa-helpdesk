"""Phase 1B TDD: EngineContainer + engine_routes 전역 변수 검증."""

import re
from pathlib import Path


def test_be24_engine_container_importable():
    """be_24: EngineContainer dataclass 임포트 성공."""
    from brick.engine.container import EngineContainer

    assert EngineContainer is not None


def test_be25_engine_routes_no_global_variables():
    """be_25: engine_routes.py에 모듈 레벨 전역 변수 없음."""
    content = Path("brick/engine/engine_routes.py").read_text()
    global_vars = re.findall(
        r"^(executor|preset_loader|checkpoint_store|state_machine|engine_event_bus)\s*[=:]",
        content,
        re.MULTILINE,
    )
    assert len(global_vars) == 0, f"전역 변수 발견: {global_vars}"
