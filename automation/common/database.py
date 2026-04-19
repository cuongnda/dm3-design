"""
DM3 DatabaseClient — minimal psycopg2 wrapper for tests that must seed state
that has no API path (e.g. account role assignment, department_manager_id).

Used only by tests in `tests/api/` that need to set up cross-cutting state
(roles, manager assignments, direct row inserts). Prefer the HTTP API when
an endpoint exists — this exists strictly for gaps.
"""
from __future__ import annotations

from contextlib import contextmanager
from typing import Any, Iterator

import psycopg2
import psycopg2.extras

from . import constants


class DatabaseClient:
    """Thin wrapper around psycopg2 with dict-row results and a commit helper."""

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        name: str | None = None,
        user: str | None = None,
        password: str | None = None,
    ) -> None:
        self.conn = psycopg2.connect(
            host=host or constants.DB_HOST,
            port=port or constants.DB_PORT,
            dbname=name or constants.DB_NAME,
            user=user or constants.DB_USER,
            password=password or constants.DB_PASSWORD,
        )
        self.conn.autocommit = False

    def close(self) -> None:
        try:
            self.conn.close()
        except Exception:
            pass

    @contextmanager
    def cursor(self) -> Iterator[psycopg2.extras.DictCursor]:
        cur = self.conn.cursor(cursor_factory=psycopg2.extras.DictCursor)
        try:
            yield cur
        finally:
            cur.close()

    def execute(self, sql: str, params: tuple | list | None = None) -> None:
        with self.cursor() as cur:
            cur.execute(sql, params or ())
        self.conn.commit()

    def fetchone(self, sql: str, params: tuple | list | None = None) -> dict | None:
        with self.cursor() as cur:
            cur.execute(sql, params or ())
            row = cur.fetchone()
            return dict(row) if row else None

    def fetchall(self, sql: str, params: tuple | list | None = None) -> list[dict]:
        with self.cursor() as cur:
            cur.execute(sql, params or ())
            return [dict(r) for r in cur.fetchall()]

    def insert_returning(self, sql: str, params: tuple | list) -> Any:
        """Run an INSERT ... RETURNING and commit; returns the first column of the returned row."""
        with self.cursor() as cur:
            cur.execute(sql, params)
            row = cur.fetchone()
        self.conn.commit()
        if row is None:
            return None
        return row[0]
