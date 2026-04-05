"""be_13~be_15: PresetLoader 모듈 분리 + 변수 치환 안전화 TDD."""

from pathlib import Path


def test_be13_preset_loader_importable_from_own_module():
    """be_13: from brick.engine.preset_loader import PresetLoader 성공."""
    from brick.engine.preset_loader import PresetLoader
    assert PresetLoader is not None


def test_be14_preset_loader_variable_substitution_recursive():
    """be_14: 중첩 dict/list 내부 변수까지 치환."""
    from brick.engine.preset_loader import PresetLoader
    loader = PresetLoader(presets_dir=Path("/tmp"))
    data = {
        "blocks": [{"what": "요구사항 {feature}"}],
        "meta": {"name": "{project}"},
    }
    result = loader._substitute_variables(data, {"feature": "login", "project": "bscamp"})
    assert result["blocks"][0]["what"] == "요구사항 login"
    assert result["meta"]["name"] == "bscamp"


def test_be15_preset_loader_no_yaml_dump_replace_pattern():
    """be_15: _substitute_variables()가 yaml.dump를 호출하지 않음."""
    from brick.engine.preset_loader import PresetLoader
    from unittest.mock import patch
    loader = PresetLoader(presets_dir=Path("/tmp"))
    with patch("yaml.dump") as mock_dump:
        loader._substitute_variables({"key": "{val}"}, {"val": "x"})
        mock_dump.assert_not_called()
