"""BrickUser 모델 + RBAC 역할 체계."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

Role = Literal["admin", "operator", "viewer"]

ROLE_LEVELS: dict[str, int] = {"viewer": 0, "operator": 1, "admin": 2}


@dataclass
class BrickUser:
    id: int
    username: str
    display_name: str
    role: Role
    workspace_id: int
    created_at: float
    updated_at: float
    last_login_at: float | None = None


def require_role(user: BrickUser, min_role: str) -> bool:
    """user.role 이 min_role 이상인지 판단."""
    return ROLE_LEVELS.get(user.role, -1) >= ROLE_LEVELS[min_role]
