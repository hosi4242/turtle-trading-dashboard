from __future__ import annotations

import sqlite3
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
DB_PATH = DATA_DIR / "turtle-dashboard.sqlite3"
DEFAULT_CODES = ("005930", "000660", "005380")


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(DB_PATH, timeout=10)
    connection.row_factory = sqlite3.Row
    return connection


def initialize() -> None:
    with connect() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS watchlist (
                code TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                added_at TEXT NOT NULL
            )
            """
        )
        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        for code in DEFAULT_CODES:
            connection.execute(
                "INSERT OR IGNORE INTO watchlist(code, name, added_at) VALUES (?, ?, ?)",
                (code, code, now),
            )


def list_codes() -> list[str]:
    with connect() as connection:
        rows = connection.execute("SELECT code FROM watchlist ORDER BY added_at, code").fetchall()
        return [str(row["code"]) for row in rows]


def add_stock(code: str, name: str) -> None:
    with connect() as connection:
        connection.execute(
            """
            INSERT INTO watchlist(code, name, added_at) VALUES (?, ?, ?)
            ON CONFLICT(code) DO UPDATE SET name = excluded.name
            """,
            (code, name, datetime.now(timezone.utc).isoformat(timespec="seconds")),
        )
