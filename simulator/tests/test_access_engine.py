"""Tests for the access decision engine."""

from __future__ import annotations

import time

import pytest

from dm3_simulator.access_engine import AccessEngine, evaluate_schedule
from dm3_simulator.database import DeviceDatabase


@pytest.fixture
async def db():
    """Create a fresh in-memory database."""
    database = DeviceDatabase(":memory:")
    await database.connect()
    yield database
    await database.close()


@pytest.fixture
async def engine(db):
    """Create an access engine with a database."""
    return AccessEngine(db)


async def _seed_person_with_rule(db, door_id="door-001"):
    """Helper: create a person with card credential and an access rule."""
    person_id = "person-001"
    await db.upsert_person(person_id, "Nguyễn Văn A")
    await db.upsert_credential("cred-001", person_id, "card", "AABBCCDD")

    await db.upsert_person_group("group-001", [person_id])
    await db.upsert_access_rule({
        "rule_id": "rule-001",
        "name": "Office Hours",
        "door_ids": [door_id],
        "person_group_ids": ["group-001"],
        "schedule_json": {
            "timezone": "UTC",
            "periods": [{"days": [1, 2, 3, 4, 5, 6, 7], "start": "00:00", "end": "23:59"}],
        },
        "anti_passback": False,
        "multi_factor": False,
        "priority": 10,
        "enabled": True,
    })
    return person_id


@pytest.mark.asyncio
async def test_granted(db, engine):
    """Test: valid credential + matching rule = granted."""
    await _seed_person_with_rule(db)
    decision = await engine.evaluate("card", "AABBCCDD", "door-001")
    assert decision.granted is True
    assert decision.reason == "authorized"
    assert decision.person_id == "person-001"
    assert decision.person_name == "Nguyễn Văn A"
    assert decision.rule_id == "rule-001"
    assert decision.decision_time_ms >= 0


@pytest.mark.asyncio
async def test_denied_unknown_credential(db, engine):
    """Test: unknown credential = denied."""
    decision = await engine.evaluate("card", "UNKNOWN", "door-001")
    assert decision.granted is False
    assert decision.reason == "denied_unknown"
    assert decision.person_id is None


@pytest.mark.asyncio
async def test_denied_wrong_door(db, engine):
    """Test: valid credential but no rule for this door = denied_zone."""
    await _seed_person_with_rule(db, door_id="door-001")
    decision = await engine.evaluate("card", "AABBCCDD", "door-999")
    assert decision.granted is False
    assert decision.reason == "denied_zone"


@pytest.mark.asyncio
async def test_denied_outside_schedule(db, engine):
    """Test: valid credential but outside schedule = denied_time."""
    person_id = "person-002"
    await db.upsert_person(person_id, "Trần Thị B")
    await db.upsert_credential("cred-002", person_id, "card", "11223344")
    await db.upsert_person_group("group-002", [person_id])

    # Rule with schedule that never matches (day 0 doesn't exist)
    await db.upsert_access_rule({
        "rule_id": "rule-002",
        "name": "Never",
        "door_ids": ["door-001"],
        "person_group_ids": ["group-002"],
        "schedule_json": {
            "timezone": "UTC",
            "periods": [{"days": [], "start": "00:00", "end": "23:59"}],
        },
        "priority": 10, "enabled": True,
        "anti_passback": False, "multi_factor": False,
    })

    decision = await engine.evaluate("card", "11223344", "door-001")
    assert decision.granted is False
    assert decision.reason == "denied_time"


@pytest.mark.asyncio
async def test_denied_blacklist(db, engine):
    """Test: blacklisted person = denied even with valid rule."""
    await _seed_person_with_rule(db)
    await db.add_to_blacklist("person-001", reason="terminated")

    decision = await engine.evaluate("card", "AABBCCDD", "door-001")
    assert decision.granted is False
    assert decision.reason == "denied_blacklist"


@pytest.mark.asyncio
async def test_denied_inactive_person(db, engine):
    """Test: inactive person = denied."""
    await db.upsert_person("person-003", "Lê Văn C", status="suspended")
    await db.upsert_credential("cred-003", "person-003", "card", "55667788")
    await db.upsert_person_group("group-003", ["person-003"])
    await db.upsert_access_rule({
        "rule_id": "rule-003", "name": "All Access",
        "door_ids": ["door-001"], "person_group_ids": ["group-003"],
        "schedule_json": {"timezone": "UTC", "periods": [{"days": [1,2,3,4,5,6,7], "start": "00:00", "end": "23:59"}]},
        "priority": 10, "enabled": True,
        "anti_passback": False, "multi_factor": False,
    })

    decision = await engine.evaluate("card", "55667788", "door-001")
    assert decision.granted is False
    assert decision.reason == "denied_inactive"


@pytest.mark.asyncio
async def test_denied_expired_person(db, engine):
    """Test: expired person validity = denied."""
    past = int(time.time() * 1000) - 86400_000  # yesterday
    await db.upsert_person("person-004", "Phạm Văn D", valid_until=past)
    await db.upsert_credential("cred-004", "person-004", "card", "DEADBEEF")
    await db.upsert_person_group("group-004", ["person-004"])
    await db.upsert_access_rule({
        "rule_id": "rule-004", "name": "All",
        "door_ids": ["door-001"], "person_group_ids": ["group-004"],
        "schedule_json": {"timezone": "UTC", "periods": [{"days": [1,2,3,4,5,6,7], "start": "00:00", "end": "23:59"}]},
        "priority": 10, "enabled": True,
        "anti_passback": False, "multi_factor": False,
    })

    decision = await engine.evaluate("card", "DEADBEEF", "door-001")
    assert decision.granted is False
    assert decision.reason == "denied_expired"


@pytest.mark.asyncio
async def test_lockdown_denies_all(db, engine):
    """Test: lockdown mode denies all access."""
    await _seed_person_with_rule(db)
    engine.lockdown_active = True

    decision = await engine.evaluate("card", "AABBCCDD", "door-001")
    assert decision.granted is False
    assert decision.reason == "lockdown_active"


@pytest.mark.asyncio
async def test_face_credential(db, engine):
    """Test: face credential type works."""
    await db.upsert_person("person-005", "Hoàng Văn E")
    await db.upsert_credential("cred-005", "person-005", "face", "face_hash_123")
    await db.upsert_person_group("group-005", ["person-005"])
    await db.upsert_access_rule({
        "rule_id": "rule-005", "name": "Face Access",
        "door_ids": ["door-001"], "person_group_ids": ["group-005"],
        "schedule_json": {"timezone": "UTC", "periods": [{"days": [1,2,3,4,5,6,7], "start": "00:00", "end": "23:59"}]},
        "priority": 10, "enabled": True,
        "anti_passback": False, "multi_factor": False,
    })

    decision = await engine.evaluate("face", "face_hash_123", "door-001")
    assert decision.granted is True
    assert decision.person_name == "Hoàng Văn E"


def test_evaluate_schedule_match():
    """Test schedule evaluation — matching time."""
    from datetime import datetime
    schedule = {
        "timezone": "UTC",
        "periods": [{"days": [1, 2, 3, 4, 5], "start": "08:00", "end": "18:00"}],
    }
    # Use a known Wednesday at 12:00 UTC
    # 2026-02-18 is a Wednesday (day 3)
    import pytz
    ts = int(datetime(2026, 2, 18, 12, 0, 0, tzinfo=pytz.UTC).timestamp() * 1000)
    assert evaluate_schedule(schedule, ts) is True


def test_evaluate_schedule_no_match():
    """Test schedule evaluation — outside time."""
    from datetime import datetime
    schedule = {
        "timezone": "UTC",
        "periods": [{"days": [1, 2, 3, 4, 5], "start": "08:00", "end": "18:00"}],
    }
    # Saturday at 12:00
    import pytz
    ts = int(datetime(2026, 2, 21, 12, 0, 0, tzinfo=pytz.UTC).timestamp() * 1000)
    assert evaluate_schedule(schedule, ts) is False
