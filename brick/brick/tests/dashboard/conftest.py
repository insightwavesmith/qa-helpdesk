"""Dashboard 테스트 공통 설정 — 개발 모드 인증 우회."""

from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True)
def _enable_dev_mode(monkeypatch):
    """모든 dashboard 테스트에서 BRICK_DEV_MODE=1 설정 (인증 우회)."""
    monkeypatch.setenv("BRICK_DEV_MODE", "1")
