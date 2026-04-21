"""
Tenant Isolation: Face Enrollment

The MQTT handler for evt.face_result must scope by the tenant_id from
the topic, NOT the payload. A rogue device in tenant B publishing an ack
that names tenant A's user/credential must not mutate tenant A's data.

Simulates the handler's UPDATE statement directly (same query the Go
code runs) so this test doesn't need a live MQTT broker.
"""
from __future__ import annotations

import uuid

import pytest

from common.database import DatabaseClient


FACE_RESULT_UPDATE = """
UPDATE dm3_identity.credentials
   SET status = %s, updated_at = now()
  FROM dm3_identity.users u
 WHERE u.id = dm3_identity.credentials.user_id
   AND dm3_identity.credentials.tenant_id = %s
   AND dm3_identity.credentials.user_id   = %s
   AND dm3_identity.credentials.type      = 'face'
   AND dm3_identity.credentials.value     = %s
   AND dm3_identity.credentials.status    = 'invalid'
   AND (u.is_deleted = false OR u.is_deleted IS NULL)
"""


@pytest.fixture(scope="module")
def db() -> DatabaseClient:
    return DatabaseClient()


@pytest.fixture
def two_tenants(db: DatabaseClient):
    """Seed two throw-away tenants, each with a user + M_<code> invalid face credential."""
    tenants = []
    for _ in range(2):
        code = f"fe-iso-{uuid.uuid4().hex[:6]}"
        tenant_id = db.insert_returning(
            """INSERT INTO dm3_auth.tenants (name, code, status, created_at, updated_at)
                VALUES (%s, %s, 'active', now(), now()) RETURNING id""",
            (code, code),
        )
        user_code = f"888{uuid.uuid4().hex[:3]}"
        user_id = db.insert_returning(
            """INSERT INTO dm3_identity.users
                 (tenant_id, first_name, last_name, email, user_code, status, created_at, updated_at)
               VALUES (%s, 'Iso', 'Test', %s, %s, 'active', now(), now()) RETURNING id""",
            (tenant_id, f"iso.{user_code}@example.com", user_code),
        )
        value = f"M_{user_code}"
        db.execute(
            """INSERT INTO dm3_identity.credentials
                 (tenant_id, user_id, type, value, status, valid_from, valid_until)
               VALUES (%s, %s, 'face', %s, 'invalid', now(), TIMESTAMPTZ '3000-01-01')""",
            (tenant_id, user_id, value),
        )
        tenants.append({"tenant_id": str(tenant_id), "user_id": str(user_id), "value": value})

    yield tenants

    for t in tenants:
        db.execute("DELETE FROM dm3_identity.credentials WHERE tenant_id = %s", (t["tenant_id"],))
        db.execute("DELETE FROM dm3_identity.users WHERE tenant_id = %s", (t["tenant_id"],))
        db.execute("DELETE FROM dm3_auth.tenants WHERE id = %s", (t["tenant_id"],))


def _status(db: DatabaseClient, tenant_id: str, user_id: str) -> str:
    row = db.fetchone(
        """SELECT status FROM dm3_identity.credentials
            WHERE tenant_id = %s AND user_id = %s AND type = 'face'""",
        (tenant_id, user_id),
    )
    return row["status"] if row else ""


@pytest.mark.tenant_isolation
def test_cross_tenant_face_result_is_dropped(db: DatabaseClient, two_tenants):
    """A 'face_result' scoped to tenant B must not flip tenant A's credential."""
    a, b = two_tenants

    # Simulate a rogue device in tenant B publishing an ack that names
    # tenant A's user + credential. Handler scope = tenant B → zero rows
    # match, tenant A's credential stays 'invalid'.
    db.execute(FACE_RESULT_UPDATE, ("active", b["tenant_id"], a["user_id"], a["value"]))

    assert _status(db, a["tenant_id"], a["user_id"]) == "invalid", \
        "tenant A's credential must not be flipped by tenant B's ack"
    assert _status(db, b["tenant_id"], b["user_id"]) == "invalid", \
        "tenant B's credential must also be untouched (different user_id)"


@pytest.mark.tenant_isolation
def test_same_tenant_face_result_succeeds(db: DatabaseClient, two_tenants):
    """Positive control: same-tenant ack on the correct user flips status."""
    a, _b = two_tenants
    db.execute(FACE_RESULT_UPDATE, ("active", a["tenant_id"], a["user_id"], a["value"]))
    assert _status(db, a["tenant_id"], a["user_id"]) == "active"
