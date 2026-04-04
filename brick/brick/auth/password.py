"""비밀번호 해싱 — scrypt (Python hashlib 기본)."""

from __future__ import annotations

import hashlib
import os

# 타이밍 공격 방어용 더미 해시
DUMMY_HASH = "scrypt:00000000000000000000000000000000:" + "0" * 128


def hash_password(password: str) -> str:
    """scrypt 해싱. 반환 형식: scrypt:{salt_hex}:{dk_hex}"""
    salt = os.urandom(16)
    dk = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=64)
    return f"scrypt:{salt.hex()}:{dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    """저장된 해시와 비교."""
    try:
        _, salt_hex, dk_hex = stored.split(":")
        salt = bytes.fromhex(salt_hex)
        dk = hashlib.scrypt(password.encode(), salt=salt, n=2**14, r=8, p=1, dklen=64)
        return dk.hex() == dk_hex
    except (ValueError, TypeError):
        return False
