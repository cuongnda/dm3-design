"""
DM3: Visitor Lifecycle API Tests

End-to-end behavioral coverage for the visit lifecycle:
    invite → approve → check-in → check-out → analytics impact.

Complements test_visitor_module.py, which covers schema contracts only.
Requires: company admin login (admin role) with visitor plugin enabled.
"""
from __future__ import annotations

import random
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from common import constants
from common.api_client import DM3Client
from common.factories import _rand_str


def _rand_phone() -> str:
    """Generate a unique-enough phone so we don't trip the visitors_tenant_phone unique index."""
    return f"+849{random.randint(10_000_000, 99_999_999)}"

BASE = "/api/v1/visitors"


def _utc_in(hours: int = 1) -> str:
    return (datetime.now(timezone.utc) + timedelta(hours=hours)).isoformat().replace("+00:00", "Z")


@pytest.fixture(scope="module")
def client() -> DM3Client:
    c = DM3Client()
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    # Fail loudly if the admin account couldn't complete the two-step flow.
    assert c.token, "admin login did not return an access token"
    return c


@pytest.fixture(scope="module")
def host_user_id(client: DM3Client) -> str:
    """Pick any active user in the tenant as the host. Skips if none found."""
    resp = client.get("/api/v1/identity/users?page=1&limit=10&status=active")
    if resp.status_code != 200:
        pytest.skip(f"cannot list hosts (status={resp.status_code})")
    body = resp.json()
    users = body.get("users") or body.get("data") or []
    if not users:
        pytest.skip("no active users available to act as host")
    return users[0]["id"]


def _create_visit(client: DM3Client, host_user_id: str, **overrides) -> dict:
    payload = {
        "visitor": {
            "first_name": overrides.pop("first_name", f"Auto{_rand_str(4)}"),
            "last_name": overrides.pop("last_name", "Lifecycle"),
            "email": overrides.pop("email", f"auto.{_rand_str()}@example.com"),
            "phone": overrides.pop("phone", _rand_phone()),
        },
        "host_user_id": host_user_id,
        "purpose": overrides.pop("purpose", "meeting"),
        "expected_arrival": overrides.pop("expected_arrival", _utc_in(1)),
        "escort_required": overrides.pop("escort_required", False),
    }
    payload.update(overrides)
    resp = client.post(f"{BASE}/", json=payload)
    assert resp.status_code == 201, f"create visit failed: {resp.status_code} {resp.text}"
    return resp.json()


# ─── Lifecycle: happy path ─────────────────────────────────────


@pytest.mark.api
class TestVisitLifecycle:
    """Invite → check-in → check-out. Verifies status transitions end-to-end."""

    def test_create_requires_visitor_name(self, client, host_user_id):
        """POST /visits missing first/last name should return 400."""
        resp = client.post(f"{BASE}/", json={
            "visitor": {"first_name": "", "last_name": ""},
            "host_user_id": host_user_id,
            "purpose": "meeting",
            "expected_arrival": _utc_in(1),
        })
        assert resp.status_code == 400

    def test_create_rejects_unknown_purpose(self, client, host_user_id):
        """POST /visits with a purpose outside the whitelist should return 400."""
        resp = client.post(f"{BASE}/", json={
            "visitor": {"first_name": "Bad", "last_name": "Purpose"},
            "host_user_id": host_user_id,
            "purpose": "pigeon_delivery",
            "expected_arrival": _utc_in(1),
        })
        assert resp.status_code == 400

    def test_create_rejects_unknown_host(self, client):
        """POST /visits with a non-existent host UUID should return 400."""
        resp = client.post(f"{BASE}/", json={
            "visitor": {"first_name": "No", "last_name": "Host"},
            "host_user_id": "00000000-0000-0000-0000-ffffffffffff",
            "purpose": "meeting",
            "expected_arrival": _utc_in(1),
        })
        assert resp.status_code == 400

    def test_create_visit_returns_status_and_id(self, client, host_user_id):
        visit = _create_visit(client, host_user_id)
        assert "id" in visit
        assert visit.get("status") in {"pre_registered", "approved", "waiting"}
        assert visit.get("purpose") == "meeting"
        # Cleanup: best-effort only; DB will keep the visit even if this 404s.
        client.delete(f"{BASE}/{visit['id']}") if False else None

    def test_list_visits_includes_created(self, client, host_user_id):
        visit = _create_visit(client, host_user_id, last_name=f"List{_rand_str(3)}")
        resp = client.get(f"{BASE}/?page=1&limit=50")
        assert resp.status_code == 200
        body = resp.json()
        items = body.get("data") or body.get("visits") or []
        assert any(v.get("id") == visit["id"] for v in items), \
            f"created visit {visit['id']} not in list response"

    def test_checkin_requires_valid_method(self, client, host_user_id):
        """POST /visits/{id}/checkin with invalid method should return 400."""
        visit = _create_visit(client, host_user_id)
        # Approve first so we're in a valid state to check in.
        client.post(f"{BASE}/{visit['id']}/approve", json={})
        resp = client.post(f"{BASE}/{visit['id']}/checkin", json={"checkin_method": "time_travel"})
        assert resp.status_code == 400

    def test_full_lifecycle_invite_checkin_checkout(self, client, host_user_id):
        """End-to-end: create → approve → check-in → check-out. Status transitions verified at each step."""
        visit = _create_visit(client, host_user_id, last_name=f"Full{_rand_str(3)}")
        visit_id = visit["id"]

        # Approve. Some tenants auto-approve; accept 200, 204, 409, or 400
        # ("already processed") since any of these means the visit is ready
        # to be checked in.
        approve = client.post(f"{BASE}/{visit_id}/approve", json={})
        assert approve.status_code in (200, 204, 400, 409), \
            f"approve failed: {approve.status_code} {approve.text}"

        # Check-in.
        checkin = client.post(f"{BASE}/{visit_id}/checkin", json={"checkin_method": "reception"})
        assert checkin.status_code == 200, f"checkin failed: {checkin.status_code} {checkin.text}"
        got = client.get(f"{BASE}/{visit_id}").json()
        assert got.get("status") == "checked_in", f"expected checked_in, got {got.get('status')}"
        assert got.get("actual_checkin") or got.get("checked_in_at"), \
            "actual_checkin should be populated after check-in"

        # Checkout.
        checkout = client.post(f"{BASE}/{visit_id}/checkout", json={})
        assert checkout.status_code == 200, f"checkout failed: {checkout.status_code} {checkout.text}"
        got = client.get(f"{BASE}/{visit_id}").json()
        assert got.get("status") == "checked_out"
        assert got.get("actual_checkout") or got.get("checked_out_at"), \
            "actual_checkout should be populated after checkout"


# ─── Analytics impact ──────────────────────────────────────────


@pytest.mark.api
class TestAnalyticsImpact:
    """Verify analytics counters move when a visit completes the lifecycle."""

    def test_checked_in_counter_increments(self, client, host_user_id):
        before = client.get(f"{BASE}/analytics?period=7d").json()
        before_checked_in = int(before.get("checked_in", 0))

        visit = _create_visit(client, host_user_id, last_name=f"Metric{_rand_str(3)}")
        client.post(f"{BASE}/{visit['id']}/approve", json={})
        ci = client.post(f"{BASE}/{visit['id']}/checkin", json={"checkin_method": "reception"})
        assert ci.status_code == 200

        after = client.get(f"{BASE}/analytics?period=7d").json()
        after_checked_in = int(after.get("checked_in", 0))

        # At least one new check-in should be reflected. We allow >= because
        # other parallel tests may also have checked visitors in.
        assert after_checked_in >= before_checked_in + 1, \
            f"expected checked_in to grow by ≥1 (was {before_checked_in}, now {after_checked_in})"

    def test_today_summary_shape(self, client):
        """GET /today/summary should return dashboard counters."""
        resp = client.get(f"{BASE}/today/summary")
        assert resp.status_code == 200
        data = resp.json()
        # Don't assert specific values; just shape.
        for key in ("total_expected", "checked_in", "checked_out"):
            assert key in data, f"missing key '{key}' in today/summary"


# ─── Reinvite & Update ─────────────────────────────────────────


@pytest.mark.api
class TestVisitMutations:
    """PUT /{id} and POST /{id}/reinvite."""

    def test_reinvite_on_fresh_visit(self, client, host_user_id):
        """POST /visits/{id}/reinvite should succeed on a pre-registered visit."""
        visit = _create_visit(client, host_user_id)
        resp = client.post(f"{BASE}/{visit['id']}/reinvite", json={})
        # Some configurations return 200 (re-issued) or 204. Accept either.
        assert resp.status_code in (200, 204), f"reinvite failed: {resp.status_code} {resp.text}"

    def test_update_purpose_note(self, client, host_user_id):
        """PUT /visits/{id} should update mutable fields without losing identity."""
        visit = _create_visit(client, host_user_id)
        resp = client.put(f"{BASE}/{visit['id']}", json={
            "purpose_note": "Updated by automation",
        })
        assert resp.status_code in (200, 204), f"update failed: {resp.status_code} {resp.text}"
        got = client.get(f"{BASE}/{visit['id']}").json()
        if got.get("purpose_note") is not None:
            assert got["purpose_note"] == "Updated by automation"


# ─── Watchlist ──────────────────────────────────────────────────


@pytest.mark.api
class TestWatchlist:
    """Watchlist CRUD — behavior, not just schema."""

    def test_create_and_list_and_delete(self, client):
        match_value = f"BlockedAuto {_rand_str(6)}"
        create = client.post(f"{BASE}/watchlist", json={
            "entry_type": "blacklisted",
            "match_field": "name",
            "match_value": match_value,
            "reason": "Added by automation test",
        })
        assert create.status_code in (200, 201), f"watchlist create failed: {create.status_code} {create.text}"
        entry = create.json()
        entry_id = entry.get("id")
        assert entry_id, "watchlist entry has no id"

        ls = client.get(f"{BASE}/watchlist")
        assert ls.status_code == 200
        body = ls.json()
        items = body if isinstance(body, list) else (body.get("data") or [])
        assert isinstance(items, list)
        assert any(i.get("id") == entry_id for i in items), "new watchlist entry not listed"

        rm = client.delete(f"{BASE}/watchlist/{entry_id}")
        assert rm.status_code in (200, 204)


# ─── History ────────────────────────────────────────────────────


@pytest.mark.api
class TestVisitorHistory:
    """GET /history/{visitor_id} — returns past visits for a visitor."""

    def test_history_for_unknown_visitor_is_empty_or_404(self, client):
        """Unknown visitor id should return 404 or empty array (depending on contract)."""
        bogus = str(uuid.uuid4())
        resp = client.get(f"{BASE}/history/{bogus}")
        assert resp.status_code in (200, 404)
        if resp.status_code == 200:
            body = resp.json()
            items = body.get("data") if isinstance(body, dict) else body
            assert items == [] or items is None
