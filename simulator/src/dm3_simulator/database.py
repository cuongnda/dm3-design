"""SQLite database operations for virtual devices."""

from __future__ import annotations

import json
import time
from typing import Any

import aiosqlite

from dm3_simulator.models import (
    AccessRule,
    CredentialRecord,
    PersonRecord,
)

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS persons (
    person_id       TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    status          TEXT DEFAULT 'active',
    valid_from      INTEGER,
    valid_until     INTEGER,
    created_at      INTEGER DEFAULT (strftime('%s','now') * 1000),
    updated_at      INTEGER DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS credentials (
    id              TEXT PRIMARY KEY,
    person_id       TEXT NOT NULL REFERENCES persons(person_id),
    type            TEXT NOT NULL,
    value           TEXT NOT NULL,
    status          TEXT DEFAULT 'active',
    valid_from      INTEGER,
    valid_until     INTEGER,
    UNIQUE(type, value)
);

CREATE INDEX IF NOT EXISTS idx_credentials_type_value ON credentials(type, value);
CREATE INDEX IF NOT EXISTS idx_credentials_person ON credentials(person_id);

CREATE TABLE IF NOT EXISTS access_rules (
    rule_id         TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    door_ids        TEXT NOT NULL,
    person_group_ids TEXT NOT NULL,
    schedule_json   TEXT,
    anti_passback   INTEGER DEFAULT 0,
    multi_factor    INTEGER DEFAULT 0,
    priority        INTEGER DEFAULT 0,
    enabled         INTEGER DEFAULT 1,
    valid_from      INTEGER,
    valid_until     INTEGER
);

CREATE TABLE IF NOT EXISTS person_groups (
    group_id        TEXT PRIMARY KEY,
    person_ids      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_person_groups_lookup ON person_groups(group_id);

CREATE TABLE IF NOT EXISTS blacklist (
    person_id       TEXT PRIMARY KEY,
    name            TEXT,
    reason          TEXT,
    effective_from  INTEGER,
    effective_until INTEGER,
    credentials     TEXT
);

CREATE TABLE IF NOT EXISTS event_queue (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    message_id      TEXT NOT NULL UNIQUE,
    timestamp_ms    INTEGER NOT NULL,
    topic           TEXT NOT NULL,
    payload_json    TEXT NOT NULL,
    retry_count     INTEGER DEFAULT 0,
    status          TEXT DEFAULT 'pending',
    created_at      INTEGER DEFAULT (strftime('%s','now') * 1000)
);

CREATE INDEX IF NOT EXISTS idx_event_queue_status ON event_queue(status, timestamp_ms);

CREATE TABLE IF NOT EXISTS sync_state (
    key             TEXT PRIMARY KEY,
    value           TEXT NOT NULL,
    updated_at      INTEGER DEFAULT (strftime('%s','now') * 1000)
);

CREATE TABLE IF NOT EXISTS config (
    key             TEXT PRIMARY KEY,
    value_json      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS anti_passback_state (
    person_id       TEXT PRIMARY KEY,
    last_direction  TEXT NOT NULL,
    last_door_id    TEXT NOT NULL,
    timestamp_ms    INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS failed_attempts (
    person_id       TEXT PRIMARY KEY,
    count           INTEGER DEFAULT 0,
    locked_until    INTEGER DEFAULT 0
);
"""


class DeviceDatabase:
    """Async SQLite database for a single virtual device."""

    def __init__(self, db_path: str = ":memory:") -> None:
        self.db_path = db_path
        self._db: aiosqlite.Connection | None = None

    async def connect(self) -> None:
        """Open database connection and create schema."""
        self._db = await aiosqlite.connect(self.db_path)
        self._db.row_factory = aiosqlite.Row
        await self._db.executescript(SCHEMA_SQL)
        await self._db.commit()

    async def close(self) -> None:
        """Close database connection."""
        if self._db:
            await self._db.close()
            self._db = None

    @property
    def db(self) -> aiosqlite.Connection:
        assert self._db is not None, "Database not connected"
        return self._db

    # --- Person operations ---

    async def upsert_person(
        self, person_id: str, name: str, status: str = "active",
        valid_from: int | None = None, valid_until: int | None = None,
    ) -> None:
        """Insert or update a person record."""
        now = int(time.time() * 1000)
        await self.db.execute(
            """INSERT INTO persons (person_id, name, status, valid_from, valid_until, updated_at)
               VALUES (?, ?, ?, ?, ?, ?)
               ON CONFLICT(person_id) DO UPDATE SET
                 name=excluded.name, status=excluded.status,
                 valid_from=excluded.valid_from, valid_until=excluded.valid_until,
                 updated_at=excluded.updated_at""",
            (person_id, name, status, valid_from, valid_until, now),
        )
        await self.db.commit()

    async def delete_person(self, person_id: str) -> None:
        """Delete a person and their credentials."""
        await self.db.execute("DELETE FROM credentials WHERE person_id = ?", (person_id,))
        await self.db.execute("DELETE FROM persons WHERE person_id = ?", (person_id,))
        await self.db.commit()

    async def get_person(self, person_id: str) -> PersonRecord | None:
        """Get a person by ID."""
        async with self.db.execute(
            "SELECT * FROM persons WHERE person_id = ?", (person_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return PersonRecord(**dict(row))
        return None

    async def get_person_count(self) -> int:
        """Get total number of persons."""
        async with self.db.execute("SELECT COUNT(*) FROM persons") as cursor:
            row = await cursor.fetchone()
            return row[0] if row else 0

    # --- Credential operations ---

    async def upsert_credential(
        self, cred_id: str, person_id: str, cred_type: str, value: str,
        status: str = "active", valid_from: int | None = None,
        valid_until: int | None = None,
    ) -> None:
        """Insert or update a credential."""
        await self.db.execute(
            """INSERT INTO credentials (id, person_id, type, value, status, valid_from, valid_until)
               VALUES (?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 person_id=excluded.person_id, type=excluded.type, value=excluded.value,
                 status=excluded.status, valid_from=excluded.valid_from,
                 valid_until=excluded.valid_until""",
            (cred_id, person_id, cred_type, value, status, valid_from, valid_until),
        )
        await self.db.commit()

    async def lookup_credential(
        self, cred_type: str, cred_value: str
    ) -> PersonRecord | None:
        """Look up a person by credential type and value."""
        async with self.db.execute(
            """SELECT p.* FROM persons p
               JOIN credentials c ON c.person_id = p.person_id
               WHERE c.type = ? AND c.value = ? AND c.status = 'active'""",
            (cred_type, cred_value),
        ) as cursor:
            row = await cursor.fetchone()
            if row:
                return PersonRecord(**dict(row))
        return None

    # --- Access rule operations ---

    async def upsert_access_rule(self, rule: dict[str, Any]) -> None:
        """Insert or update an access rule."""
        await self.db.execute(
            """INSERT INTO access_rules
               (rule_id, name, door_ids, person_group_ids, schedule_json,
                anti_passback, multi_factor, priority, enabled, valid_from, valid_until)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(rule_id) DO UPDATE SET
                 name=excluded.name, door_ids=excluded.door_ids,
                 person_group_ids=excluded.person_group_ids,
                 schedule_json=excluded.schedule_json,
                 anti_passback=excluded.anti_passback, multi_factor=excluded.multi_factor,
                 priority=excluded.priority, enabled=excluded.enabled,
                 valid_from=excluded.valid_from, valid_until=excluded.valid_until""",
            (
                rule["rule_id"], rule["name"],
                json.dumps(rule.get("door_ids", [])),
                json.dumps(rule.get("person_group_ids", [])),
                json.dumps(rule.get("schedule_json")) if rule.get("schedule_json") else None,
                int(rule.get("anti_passback", False)),
                int(rule.get("multi_factor", False)),
                rule.get("priority", 0),
                int(rule.get("enabled", True)),
                rule.get("valid_from"),
                rule.get("valid_until"),
            ),
        )
        await self.db.commit()

    async def get_matching_rules(self, door_id: str, person_id: str) -> list[AccessRule]:
        """Get access rules that include a given door, sorted by priority DESC."""
        rules: list[AccessRule] = []
        async with self.db.execute(
            "SELECT * FROM access_rules ORDER BY priority DESC"
        ) as cursor:
            async for row in cursor:
                r = dict(row)
                door_ids = json.loads(r["door_ids"])
                if door_id in door_ids:
                    rules.append(AccessRule(
                        rule_id=r["rule_id"],
                        name=r["name"],
                        door_ids=door_ids,
                        person_group_ids=json.loads(r["person_group_ids"]),
                        schedule_json=json.loads(r["schedule_json"]) if r["schedule_json"] else None,
                        anti_passback=bool(r["anti_passback"]),
                        multi_factor=bool(r["multi_factor"]),
                        priority=r["priority"],
                        enabled=bool(r["enabled"]),
                        valid_from=r["valid_from"],
                        valid_until=r["valid_until"],
                    ))
        return rules

    async def person_in_groups(self, person_id: str, group_ids: list[str]) -> bool:
        """Check if a person belongs to any of the given groups."""
        for gid in group_ids:
            async with self.db.execute(
                "SELECT person_ids FROM person_groups WHERE group_id = ?", (gid,)
            ) as cursor:
                row = await cursor.fetchone()
                if row:
                    person_ids = json.loads(row[0])
                    if person_id in person_ids:
                        return True
        return False

    async def upsert_person_group(self, group_id: str, person_ids: list[str]) -> None:
        """Insert or update a person group."""
        await self.db.execute(
            """INSERT INTO person_groups (group_id, person_ids) VALUES (?, ?)
               ON CONFLICT(group_id) DO UPDATE SET person_ids=excluded.person_ids""",
            (group_id, json.dumps(person_ids)),
        )
        await self.db.commit()

    # --- Blacklist operations ---

    async def is_blacklisted(self, person_id: str) -> bool:
        """Check if a person is on the blacklist."""
        now = int(time.time() * 1000)
        async with self.db.execute(
            """SELECT 1 FROM blacklist WHERE person_id = ?
               AND (effective_from IS NULL OR effective_from <= ?)
               AND (effective_until IS NULL OR effective_until >= ?)""",
            (person_id, now, now),
        ) as cursor:
            return await cursor.fetchone() is not None

    async def add_to_blacklist(
        self, person_id: str, name: str | None = None, reason: str | None = None,
        effective_from: int | None = None, effective_until: int | None = None,
    ) -> None:
        """Add a person to the blacklist."""
        await self.db.execute(
            """INSERT INTO blacklist (person_id, name, reason, effective_from, effective_until)
               VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(person_id) DO UPDATE SET
                 name=excluded.name, reason=excluded.reason,
                 effective_from=excluded.effective_from, effective_until=excluded.effective_until""",
            (person_id, name, reason, effective_from, effective_until),
        )
        await self.db.commit()

    async def remove_from_blacklist(self, person_id: str) -> None:
        """Remove a person from the blacklist."""
        await self.db.execute("DELETE FROM blacklist WHERE person_id = ?", (person_id,))
        await self.db.commit()

    # --- Failed attempts / lockout ---

    async def is_locked_out(self, person_id: str) -> bool:
        """Check if a person is locked out due to failed attempts."""
        now = int(time.time() * 1000)
        async with self.db.execute(
            "SELECT locked_until FROM failed_attempts WHERE person_id = ?", (person_id,)
        ) as cursor:
            row = await cursor.fetchone()
            if row and row[0] > now:
                return True
        return False

    async def increment_failed_attempts(
        self, person_id: str | None, max_attempts: int = 5, lockout_ms: int = 300_000
    ) -> None:
        """Increment failed attempts; lock out if threshold exceeded."""
        if not person_id:
            return
        now = int(time.time() * 1000)
        async with self.db.execute(
            "SELECT count FROM failed_attempts WHERE person_id = ?", (person_id,)
        ) as cursor:
            row = await cursor.fetchone()

        if row:
            new_count = row[0] + 1
            locked_until = (now + lockout_ms) if new_count >= max_attempts else 0
            await self.db.execute(
                "UPDATE failed_attempts SET count = ?, locked_until = ? WHERE person_id = ?",
                (new_count, locked_until, person_id),
            )
        else:
            await self.db.execute(
                "INSERT INTO failed_attempts (person_id, count, locked_until) VALUES (?, 1, 0)",
                (person_id,),
            )
        await self.db.commit()

    async def reset_failed_attempts(self, person_id: str | None) -> None:
        """Reset failed attempts on successful access."""
        if not person_id:
            return
        await self.db.execute("DELETE FROM failed_attempts WHERE person_id = ?", (person_id,))
        await self.db.commit()

    # --- Anti-passback ---

    async def get_last_direction(self, person_id: str) -> str | None:
        """Get last access direction for anti-passback."""
        async with self.db.execute(
            "SELECT last_direction FROM anti_passback_state WHERE person_id = ?", (person_id,)
        ) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else None

    async def update_anti_passback(
        self, person_id: str, direction: str, door_id: str
    ) -> None:
        """Update anti-passback state after access."""
        now = int(time.time() * 1000)
        await self.db.execute(
            """INSERT INTO anti_passback_state (person_id, last_direction, last_door_id, timestamp_ms)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(person_id) DO UPDATE SET
                 last_direction=excluded.last_direction, last_door_id=excluded.last_door_id,
                 timestamp_ms=excluded.timestamp_ms""",
            (person_id, direction, door_id, now),
        )
        await self.db.commit()

    # --- Event queue ---

    async def queue_event(
        self, message_id: str, topic: str, payload_json: str
    ) -> None:
        """Queue an event for later publishing."""
        now = int(time.time() * 1000)
        await self.db.execute(
            """INSERT OR IGNORE INTO event_queue (message_id, timestamp_ms, topic, payload_json)
               VALUES (?, ?, ?, ?)""",
            (message_id, now, topic, payload_json),
        )
        await self.db.commit()

    async def get_pending_events(self, limit: int = 100) -> list[dict[str, Any]]:
        """Get pending events from the queue."""
        events: list[dict[str, Any]] = []
        async with self.db.execute(
            "SELECT * FROM event_queue WHERE status = 'pending' ORDER BY timestamp_ms LIMIT ?",
            (limit,),
        ) as cursor:
            async for row in cursor:
                events.append(dict(row))
        return events

    async def mark_events_sent(self, message_ids: list[str]) -> None:
        """Mark events as sent."""
        if not message_ids:
            return
        placeholders = ",".join("?" * len(message_ids))
        await self.db.execute(
            f"UPDATE event_queue SET status = 'sent' WHERE message_id IN ({placeholders})",
            message_ids,
        )
        await self.db.commit()

    async def get_queue_depth(self) -> int:
        """Get number of pending events in the queue."""
        async with self.db.execute(
            "SELECT COUNT(*) FROM event_queue WHERE status = 'pending'"
        ) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else 0

    async def flush_sent_events(self) -> int:
        """Delete sent events from the queue. Returns count deleted."""
        async with self.db.execute(
            "DELETE FROM event_queue WHERE status = 'sent'"
        ) as cursor:
            count = cursor.rowcount
        await self.db.commit()
        return count

    # --- Sync state ---

    async def get_sync_state(self, key: str) -> str | None:
        """Get a sync state value."""
        async with self.db.execute(
            "SELECT value FROM sync_state WHERE key = ?", (key,)
        ) as cursor:
            row = await cursor.fetchone()
            return row[0] if row else None

    async def set_sync_state(self, key: str, value: str) -> None:
        """Set a sync state value."""
        now = int(time.time() * 1000)
        await self.db.execute(
            """INSERT INTO sync_state (key, value, updated_at) VALUES (?, ?, ?)
               ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at""",
            (key, value, now),
        )
        await self.db.commit()

    # --- Config ---

    async def set_config(self, key: str, value: Any) -> None:
        """Store a config value."""
        await self.db.execute(
            """INSERT INTO config (key, value_json) VALUES (?, ?)
               ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json""",
            (key, json.dumps(value)),
        )
        await self.db.commit()

    async def get_config(self, key: str) -> Any | None:
        """Get a config value."""
        async with self.db.execute(
            "SELECT value_json FROM config WHERE key = ?", (key,)
        ) as cursor:
            row = await cursor.fetchone()
            return json.loads(row[0]) if row else None

    # --- Bulk operations for seeding ---

    async def bulk_upsert_persons(
        self, persons: list[dict[str, Any]]
    ) -> int:
        """Bulk insert/update persons and their credentials."""
        count = 0
        for p in persons:
            await self.upsert_person(
                p["person_id"], p["name"], p.get("status", "active"),
                p.get("valid_from"), p.get("valid_until"),
            )
            for c in p.get("credentials", []):
                await self.upsert_credential(
                    c["id"], p["person_id"], c["type"], c["value"],
                    c.get("status", "active"), c.get("valid_from"), c.get("valid_until"),
                )
            count += 1
        return count
