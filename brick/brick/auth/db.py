"""SQLite DB 초기화 + 쿼리 헬퍼."""

from __future__ import annotations

import sqlite3
from pathlib import Path

_SCHEMA_PATH = Path(__file__).parent / "schema.sql"

_connection: sqlite3.Connection | None = None


def get_db(db_path: str = ".bkit/brick.db") -> sqlite3.Connection:
    """싱글턴 DB 커넥션. WAL 모드 + row_factory 설정."""
    global _connection
    if _connection is not None:
        return _connection
    return _open(db_path)


def _open(db_path: str) -> sqlite3.Connection:
    global _connection
    Path(db_path).parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    _connection = conn
    return conn


def init_db(db_path: str = ".bkit/brick.db") -> sqlite3.Connection:
    """스키마 생성 + 기본 워크스페이스 삽입."""
    conn = _open(db_path)
    schema = _SCHEMA_PATH.read_text()
    conn.executescript(schema)
    conn.commit()
    return conn


def close_db() -> None:
    """테스트 정리용."""
    global _connection
    if _connection is not None:
        _connection.close()
        _connection = None
