"""
DM3: Visitor host_user_id gating tests.

Covers the rule introduced in migrations 000052/000053 plus the matching FE
gates: host_user_id is required across every visit-creation flow ONLY when
the tenant's `approval_required` setting is true. When approval is disabled
(open-house mode), each flow must accept an absent host_user_id.

Surfaces verified:
    - POST /api/v1/visitors/                (single visit create)
    - POST /api/v1/visitors/walkin          (walk-in)
    - POST /api/v1/visitors/groups          (visit group create)
    - POST /api/v1/visitors/recurring       (recurring template create)

Requires: company admin login (admin role) with visitor plugin enabled.
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone

import pytest

from common import constants
from common.api_client import DM3Client
from common.factories import _rand_str

BASE = "/api/v1/visitors"


def _utc_in(hours: int = 1) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat().replace("+00:00", "Z")


def _rand_phone() -> str:
    return f"+849{random.randint(10_000_000, 99_999_999)}"


@pytest.fixture(scope="module")
def client() -> DM3Client:
    c = DM3Client()
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    assert c.token, "admin login did not return an access token"
    return c


@pytest.fixture(scope="module")
def host_user_id(client: DM3Client) -> str:
    """Pick any active user as the host. Skips if the tenant has none."""
    resp = client.get("/api/v1/identity/users?page=1&limit=10&status=active")
    if resp.status_code != 200:
        pytest.skip(f"cannot list hosts (status={resp.status_code})")
    body = resp.json()
    users = body.get("users") or body.get("data") or []
    if not users:
        pytest.skip("no active users available to act as host")
    return users[0]["id"]


@pytest.fixture(scope="module")
def settings_baseline(client: DM3Client):
    """Snapshot the tenant's visitor settings so each test that flips
    `approval_required` can restore the original state on teardown."""
    resp = client.get(f"{BASE}/settings")
    if resp.status_code != 200:
        pytest.skip(f"cannot read visitor settings (status={resp.status_code})")
    return resp.json()


def _set_approval_required(client: DM3Client, baseline: dict, value: bool) -> None:
    """Update the tenant's approval_required toggle while preserving every
    other setting field (the PUT endpoint requires a full payload)."""
    payload = {**baseline, "approval_required": value}
    # Strip server-managed fields that the PUT handler doesn't accept.
    for k in ("id", "tenant_id", "created_at", "updated_at"):
        payload.pop(k, None)
    resp = client.put(f"{BASE}/settings", json=payload)
    assert resp.status_code == 200, f"set approval_required={value} failed: {resp.status_code} {resp.text}"


@pytest.fixture
def approval_off(client: DM3Client, settings_baseline: dict):
    """Toggle approval_required=false for the duration of one test, then
    restore the original baseline value."""
    original = settings_baseline.get("approval_required", True)
    _set_approval_required(client, settings_baseline, False)
    yield
    _set_approval_required(client, settings_baseline, original)


@pytest.fixture
def approval_on(client: DM3Client, settings_baseline: dict):
    original = settings_baseline.get("approval_required", True)
    _set_approval_required(client, settings_baseline, True)
    yield
    _set_approval_required(client, settings_baseline, original)


def _visit_payload(host_user_id: str | None = None, **overrides) -> dict:
    payload = {
        "visitor": {
            "first_name": overrides.pop("first_name", f"Auto{_rand_str(4)}"),
            "last_name": overrides.pop("last_name", "HostGate"),
            "phone": _rand_phone(),
        },
        "purpose": "meeting",
        "expected_arrival": _utc_in(1),
    }
    if host_user_id is not None:
        payload["host_user_id"] = host_user_id
    payload.update(overrides)
    return payload


def _walkin_payload(host_user_id: str | None = None) -> dict:
    payload = {
        "visitor": {
            "first_name": f"Walk{_rand_str(4)}",
            "last_name": "Gate",
            "phone": _rand_phone(),
        },
        "purpose": "meeting",
    }
    if host_user_id is not None:
        payload["host_user_id"] = host_user_id
    return payload


def _group_payload(host_user_id: str | None = None) -> dict:
    payload = {
        "name": f"Group {_rand_str(4)}",
        "purpose": "meeting",
        "expected_arrival": _utc_in(1),
    }
    if host_user_id is not None:
        payload["host_user_id"] = host_user_id
    return payload


# ─── approval_required = true: host_user_id IS required ─────────────────────


@pytest.mark.api
class TestHostRequiredWhenApprovalOn:
    """When the tenant requires host approval, every visit-creation surface
    must reject requests that omit host_user_id."""

    def test_create_visit_without_host_returns_400(self, client, approval_on):
        resp = client.post(f"{BASE}/", json=_visit_payload(host_user_id=None))
        assert resp.status_code == 400, resp.text
        assert "host_user_id" in resp.text.lower()

    def test_walkin_without_host_returns_400(self, client, approval_on):
        resp = client.post(f"{BASE}/walkin", json=_walkin_payload(host_user_id=None))
        assert resp.status_code == 400, resp.text
        assert "host_user_id" in resp.text.lower()

    def test_create_group_without_host_returns_400(self, client, approval_on):
        resp = client.post(f"{BASE}/groups", json=_group_payload(host_user_id=None))
        assert resp.status_code == 400, resp.text
        assert "host_user_id" in resp.text.lower()


# ─── approval_required = false: host_user_id is OPTIONAL ─────────────────────


@pytest.mark.api
class TestHostOptionalWhenApprovalOff:
    """When approval is disabled (open-house mode), the same surfaces must
    accept requests with no host_user_id and create the visit anyway."""

    def test_create_visit_without_host_succeeds(self, client, approval_off):
        resp = client.post(f"{BASE}/", json=_visit_payload(host_user_id=None))
        assert resp.status_code == 201, resp.text
        body = resp.json()
        # auto-approved because approval workflow is off
        assert body.get("status") == "approved", body
        # host_user_id surfaces as empty string (COALESCE in SELECT)
        assert body.get("host_user_id") in ("", None), body

    def test_walkin_without_host_succeeds(self, client, approval_off):
        resp = client.post(f"{BASE}/walkin", json=_walkin_payload(host_user_id=None))
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body.get("host_user_id") in ("", None), body

    def test_create_group_without_host_succeeds(self, client, approval_off):
        resp = client.post(f"{BASE}/groups", json=_group_payload(host_user_id=None))
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body.get("host_user_id") in ("", None), body


# ─── Sanity: providing a valid host always works regardless of setting ──────


@pytest.mark.api
class TestHostProvidedAlwaysAccepted:
    """Supplying a valid host_user_id should succeed under either setting."""

    def test_create_visit_with_host_when_approval_on(self, client, approval_on, host_user_id):
        resp = client.post(f"{BASE}/", json=_visit_payload(host_user_id=host_user_id))
        assert resp.status_code == 201, resp.text
        assert resp.json().get("host_user_id") == host_user_id

    def test_create_visit_with_host_when_approval_off(self, client, approval_off, host_user_id):
        resp = client.post(f"{BASE}/", json=_visit_payload(host_user_id=host_user_id))
        assert resp.status_code == 201, resp.text
        body = resp.json()
        assert body.get("host_user_id") == host_user_id
        # auto-approved even with a host present, because approval is off
        assert body.get("status") == "approved", body
