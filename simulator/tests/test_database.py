"""Tests for database operations."""

from __future__ import annotations

import pytest

from dm3_simulator.database import DeviceDatabase


@pytest.fixture
async def db():
    database = DeviceDatabase(":memory:")
    await database.connect()
    yield database
    await database.close()


@pytest.mark.asyncio
async def test_upsert_and_get_person(db):
    await db.upsert_person("p1", "Nguyễn Văn A")
    person = await db.get_person("p1")
    assert person is not None
    assert person.name == "Nguyễn Văn A"
    assert person.status == "active"


@pytest.mark.asyncio
async def test_delete_person(db):
    await db.upsert_person("p1", "Test")
    await db.upsert_credential("c1", "p1", "card", "AABB")
    await db.delete_person("p1")
    assert await db.get_person("p1") is None
    assert await db.lookup_credential("card", "AABB") is None


@pytest.mark.asyncio
async def test_lookup_credential(db):
    await db.upsert_person("p1", "Test Person")
    await db.upsert_credential("c1", "p1", "card", "AABB")
    person = await db.lookup_credential("card", "AABB")
    assert person is not None
    assert person.person_id == "p1"


@pytest.mark.asyncio
async def test_person_count(db):
    assert await db.get_person_count() == 0
    await db.upsert_person("p1", "A")
    await db.upsert_person("p2", "B")
    assert await db.get_person_count() == 2


@pytest.mark.asyncio
async def test_blacklist(db):
    await db.upsert_person("p1", "Bad Person")
    assert await db.is_blacklisted("p1") is False
    await db.add_to_blacklist("p1", reason="terminated")
    assert await db.is_blacklisted("p1") is True
    await db.remove_from_blacklist("p1")
    assert await db.is_blacklisted("p1") is False


@pytest.mark.asyncio
async def test_event_queue(db):
    assert await db.get_queue_depth() == 0
    await db.queue_event("msg-1", "topic/test", '{"data": 1}')
    await db.queue_event("msg-2", "topic/test", '{"data": 2}')
    assert await db.get_queue_depth() == 2

    events = await db.get_pending_events(limit=10)
    assert len(events) == 2

    await db.mark_events_sent(["msg-1", "msg-2"])
    assert await db.get_queue_depth() == 0

    deleted = await db.flush_sent_events()
    assert deleted == 2


@pytest.mark.asyncio
async def test_sync_state(db):
    assert await db.get_sync_state("version") is None
    await db.set_sync_state("version", "42")
    assert await db.get_sync_state("version") == "42"


@pytest.mark.asyncio
async def test_person_groups(db):
    await db.upsert_person_group("g1", ["p1", "p2", "p3"])
    assert await db.person_in_groups("p1", ["g1"]) is True
    assert await db.person_in_groups("p4", ["g1"]) is False
    assert await db.person_in_groups("p1", ["g2"]) is False


@pytest.mark.asyncio
async def test_access_rules(db):
    await db.upsert_access_rule({
        "rule_id": "r1", "name": "Test Rule",
        "door_ids": ["door-1", "door-2"],
        "person_group_ids": ["g1"],
        "schedule_json": None,
        "anti_passback": False, "multi_factor": False,
        "priority": 10, "enabled": True,
    })
    rules = await db.get_matching_rules("door-1", "p1")
    assert len(rules) == 1
    assert rules[0].rule_id == "r1"

    rules2 = await db.get_matching_rules("door-999", "p1")
    assert len(rules2) == 0


@pytest.mark.asyncio
async def test_bulk_upsert_persons(db):
    persons = [
        {"person_id": f"p{i}", "name": f"Person {i}", "credentials": [
            {"id": f"c{i}", "type": "card", "value": f"CARD{i:04d}"}
        ]} for i in range(10)
    ]
    count = await db.bulk_upsert_persons(persons)
    assert count == 10
    assert await db.get_person_count() == 10
    assert await db.lookup_credential("card", "CARD0005") is not None


@pytest.mark.asyncio
async def test_failed_attempts_lockout(db):
    await db.upsert_person("p1", "Test")
    assert await db.is_locked_out("p1") is False

    # Increment 5 times (default max)
    for _ in range(5):
        await db.increment_failed_attempts("p1", max_attempts=5, lockout_ms=300_000)

    assert await db.is_locked_out("p1") is True

    await db.reset_failed_attempts("p1")
    assert await db.is_locked_out("p1") is False
