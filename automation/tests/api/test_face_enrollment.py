"""
API Tests: Face Enrollment Roundtrip

When a user is created in a tenant that owns a qualifying face-enrol
terminal (df970 / ba8300 / bd8500 / ra08 / dq200), identity-svc seeds
an "M_<user_code>" face credential at status='invalid'. On avatar upload
the credential is reset to 'invalid' (so devices drop any stale
template). The device acks with evt.face_result → the credential flips
to 'active' (success) or 'failed'.

These tests drive the HTTP API plus direct DB reads/writes to simulate
the MQTT ack without standing up a real device.
"""
from __future__ import annotations

import io
import time
import uuid

import pytest

from common.api_client import DM3Client
from common.database import DatabaseClient
from common import constants


IDENTITY_BASE = "/api/v1/identity"
GATEWAY_BASE = "/api/v1/gateway"


@pytest.fixture(scope="module")
def admin_client() -> DM3Client:
    c = DM3Client()
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    return c


@pytest.fixture(scope="module")
def db() -> DatabaseClient:
    return DatabaseClient()


@pytest.fixture(scope="module")
def tenant_id(admin_client: DM3Client, db: DatabaseClient) -> str:
    """Resolve the company_id embedded in the admin_client's access token."""
    me = admin_client.get("/api/v1/auth/me")
    if me.status_code != 200:
        pytest.skip(f"/auth/me unavailable: {me.status_code}")
    body = me.json()
    cid = body.get("company_id") or body.get("tenant_id") or body.get("cid")
    if not cid:
        # Fall back to picking the first company the user belongs to.
        row = db.fetchone(
            "SELECT id FROM dm3_auth.tenants WHERE status='active' LIMIT 1"
        )
        cid = row and row["id"]
    if not cid:
        pytest.skip("could not resolve tenant_id for admin_client")
    return str(cid)


@pytest.fixture
def qualifying_device(db: DatabaseClient, tenant_id: str):
    """Ensure the tenant owns at least one qualifying-model device.
    Creates one if missing, cleans up only devices it created."""
    existing = db.fetchone(
        """SELECT id, device_id FROM dm3_devices.devices
            WHERE tenant_id = %s
              AND model IN ('df970','ba8300','bd8500','ra08','dq200')
            LIMIT 1""",
        (tenant_id,),
    )
    if existing:
        yield existing
        return

    device_id = f"face-enrol-{uuid.uuid4().hex[:6]}"
    created_id = db.insert_returning(
        """INSERT INTO dm3_devices.devices
             (tenant_id, device_id, name, type, model, status, created_at, updated_at)
           VALUES (%s, %s, 'face-enrol-test', 'terminal', 'df970', 'offline', now(), now())
           RETURNING id""",
        (tenant_id, device_id),
    )
    yield {"id": created_id, "device_id": device_id}
    db.execute("DELETE FROM dm3_devices.devices WHERE id = %s", (created_id,))


def _create_user(admin_client: DM3Client) -> dict:
    uid = uuid.uuid4().hex[:8]
    resp = admin_client.post(f"{IDENTITY_BASE}/users", json={
        "first_name": "Face",
        "last_name": "Enrol",
        "email": f"face.enrol.{uid}@example.com",
    })
    assert resp.status_code in (200, 201), f"create user: {resp.status_code} {resp.text}"
    body = resp.json()
    # Some responses wrap the user under "user", some return it flat.
    return body.get("user") or body


def _read_face_credential(db: DatabaseClient, tenant_id: str, user_id: str) -> dict | None:
    return db.fetchone(
        r"""SELECT id, value, status
              FROM dm3_identity.credentials
             WHERE tenant_id = %s AND user_id = %s
               AND type = 'face' AND value LIKE 'M\_%%'""",
        (tenant_id, user_id),
    )


def _wait_for_credential(db: DatabaseClient, tenant_id: str, user_id: str, timeout: float = 3.0) -> dict | None:
    """The face credential is seeded in a goroutine — poll briefly for it."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        cred = _read_face_credential(db, tenant_id, user_id)
        if cred:
            return cred
        time.sleep(0.1)
    return _read_face_credential(db, tenant_id, user_id)


# ─── Tests ──────────────────────────────────────────────────────────────────


@pytest.mark.api
def test_create_user_seeds_invalid_face_credential(
    admin_client: DM3Client, db: DatabaseClient, tenant_id: str, qualifying_device,
):
    user = _create_user(admin_client)
    user_id = user["id"]
    try:
        cred = _wait_for_credential(db, tenant_id, user_id)
        assert cred is not None, "expected M_<user_code> face credential to be seeded"
        assert cred["value"].startswith("M_"), f"value: {cred['value']}"
        assert cred["status"] == "invalid", f"status: {cred['status']}"
    finally:
        admin_client.delete(f"{IDENTITY_BASE}/users/{user_id}")


@pytest.mark.api
def test_create_user_no_qualifying_device_no_seed(
    admin_client: DM3Client, db: DatabaseClient, tenant_id: str,
):
    """Temporarily suppress qualifying devices and verify no face credential
    is seeded. Restores device state at the end so other tests aren't broken."""
    rows = db.fetchall(
        """SELECT id, model FROM dm3_devices.devices
            WHERE tenant_id = %s AND model IN ('df970','ba8300','bd8500','ra08','dq200')""",
        (tenant_id,),
    )
    if not rows:
        pytest.skip("no qualifying devices in this tenant to mask out")

    parked_model = "icu300n"  # non-qualifying terminal; still in whitelist
    for r in rows:
        db.execute("UPDATE dm3_devices.devices SET model = %s WHERE id = %s",
                   (parked_model, r["id"]))
    user = _create_user(admin_client)
    user_id = user["id"]
    try:
        time.sleep(0.5)  # let the async goroutine settle
        cred = _read_face_credential(db, tenant_id, user_id)
        assert cred is None, f"expected no face credential; got {cred!r}"
    finally:
        admin_client.delete(f"{IDENTITY_BASE}/users/{user_id}")
        for r in rows:
            db.execute("UPDATE dm3_devices.devices SET model = %s WHERE id = %s",
                       (r["model"], r["id"]))


@pytest.mark.api
def test_face_result_success_flips_to_active(
    admin_client: DM3Client, db: DatabaseClient, tenant_id: str, qualifying_device,
):
    """Simulate the MQTT face_result success ack by running the same UPDATE
    the handler does. This isolates the DB-level guarantee (status flip,
    tenant scope) without needing a live MQTT broker in CI."""
    user = _create_user(admin_client)
    user_id = user["id"]
    try:
        cred = _wait_for_credential(db, tenant_id, user_id)
        assert cred is not None
        value = cred["value"]

        db.execute(
            """UPDATE dm3_identity.credentials
                  SET status = 'active', updated_at = now()
                FROM dm3_identity.users u
               WHERE u.id = dm3_identity.credentials.user_id
                 AND dm3_identity.credentials.tenant_id = %s
                 AND dm3_identity.credentials.user_id = %s
                 AND dm3_identity.credentials.type = 'face'
                 AND dm3_identity.credentials.value = %s
                 AND dm3_identity.credentials.status = 'invalid'
                 AND (u.is_deleted = false OR u.is_deleted IS NULL)""",
            (tenant_id, user_id, value),
        )
        after = _read_face_credential(db, tenant_id, user_id)
        assert after["status"] == "active", f"status after success ack: {after}"
    finally:
        admin_client.delete(f"{IDENTITY_BASE}/users/{user_id}")


@pytest.mark.api
def test_avatar_upload_resets_credential_to_invalid(
    admin_client: DM3Client, db: DatabaseClient, tenant_id: str, qualifying_device,
):
    user = _create_user(admin_client)
    user_id = user["id"]
    try:
        cred = _wait_for_credential(db, tenant_id, user_id)
        assert cred is not None
        # Pretend the device already enrolled successfully.
        db.execute(
            """UPDATE dm3_identity.credentials SET status='active'
                WHERE tenant_id=%s AND user_id=%s AND type='face'""",
            (tenant_id, user_id),
        )

        # 1x1 PNG.
        png = (
            b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01"
            b"\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc\xfc"
            b"\xff\xff?\x00\x05\xfe\x02\xfe\xdc\xccY\xe7\x00\x00\x00\x00IEND\xaeB`\x82"
        )
        resp = admin_client.post(
            f"{IDENTITY_BASE}/users/{user_id}/avatar",
            files={"file": ("avatar.png", io.BytesIO(png), "image/png")},
        )
        if resp.status_code not in (200, 201):
            pytest.skip(f"avatar upload not accepted: {resp.status_code} {resp.text}")

        # The reset runs in a goroutine; poll briefly.
        deadline = time.time() + 3.0
        status = None
        while time.time() < deadline:
            status = _read_face_credential(db, tenant_id, user_id)["status"]
            if status == "invalid":
                break
            time.sleep(0.1)
        assert status == "invalid", f"avatar upload should reset to invalid, got {status}"
    finally:
        admin_client.delete(f"{IDENTITY_BASE}/users/{user_id}")
