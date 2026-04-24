"""
DM3: Access events filter — multi-select + credential-type alias tests.

Covers the splitCSV() + expandCredentialTypes() helpers added to
backend/internal/access/handlers.go that back the multi-select FE filters
on the Access History page:
    - ?user_id=a,b,c       → WHERE user_id = ANY($n::uuid[])
    - ?decision=granted,denied → WHERE decision IN (...)
    - ?credential_type=plate   → WHERE credential_type IN ('plate','plate_number')
                              (Hanet ANPR rows store plate_number;
                               parking-svc stores plate)

These are smoke tests: they assert the API ACCEPTS the param shapes without
500'ing and that the pagination contract holds. Result-content assertions
would need seeded events per tenant, which we don't bootstrap here.

Requires: company admin login.
"""
from __future__ import annotations

import uuid

import pytest

from common import constants
from common.api_client import DM3Client

EVENTS_URL = "/api/v1/access/events"


@pytest.fixture(scope="module")
def client() -> DM3Client:
    c = DM3Client()
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    check = c.get(EVENTS_URL)
    if check.status_code == 500:
        pytest.skip("access-svc returned 500 — events table may be missing")
    return c


def _assert_pagination_envelope(body: dict) -> None:
    """Every list endpoint returns the same Paginated envelope: data + total + page + limit."""
    assert "data" in body and isinstance(body["data"], list), body
    assert "total" in body, body
    assert "page" in body, body
    assert "limit" in body, body


# ─── user_id multi-select ───────────────────────────────────────────────────


@pytest.mark.api
class TestUserIdFilter:
    def test_single_user_id_accepted(self, client):
        uid = str(uuid.uuid4())
        resp = client.get(f"{EVENTS_URL}?user_id={uid}")
        assert resp.status_code == 200, resp.text
        _assert_pagination_envelope(resp.json())

    def test_csv_user_ids_accepted(self, client):
        uids = ",".join(str(uuid.uuid4()) for _ in range(3))
        resp = client.get(f"{EVENTS_URL}?user_id={uids}")
        assert resp.status_code == 200, resp.text
        _assert_pagination_envelope(resp.json())

    def test_csv_with_blank_tokens_accepted(self, client):
        """splitCSV must drop empty tokens — `?user_id=,,uuid,,` should not 500."""
        uid = str(uuid.uuid4())
        resp = client.get(f"{EVENTS_URL}?user_id=,,{uid},,")
        assert resp.status_code == 200, resp.text
        _assert_pagination_envelope(resp.json())

    def test_invalid_uuid_returns_500_or_400(self, client):
        """Postgres rejects malformed UUIDs in ANY($::uuid[]). Either a clean
        4xx from the BE or a 500 is acceptable; we just want it not to silently
        return all events as if the filter were absent."""
        resp = client.get(f"{EVENTS_URL}?user_id=not-a-uuid")
        assert resp.status_code in (400, 500), resp.text


# ─── decision multi-select ──────────────────────────────────────────────────


@pytest.mark.api
class TestDecisionFilter:
    def test_single_decision_accepted(self, client):
        resp = client.get(f"{EVENTS_URL}?decision=granted")
        assert resp.status_code == 200, resp.text
        _assert_pagination_envelope(resp.json())

    def test_csv_decisions_accepted(self, client):
        resp = client.get(f"{EVENTS_URL}?decision=granted,denied")
        assert resp.status_code == 200, resp.text
        _assert_pagination_envelope(resp.json())

    def test_blank_decision_filter_ignored(self, client):
        """Empty string after `decision=` should be treated as no filter,
        not as `decision=''` which would never match."""
        baseline = client.get(EVENTS_URL).json()
        filtered = client.get(f"{EVENTS_URL}?decision=").json()
        assert filtered["total"] == baseline["total"], (filtered, baseline)


# ─── credential_type multi-select + plate alias ─────────────────────────────


@pytest.mark.api
class TestCredentialTypeFilter:
    def test_single_credential_type_accepted(self, client):
        resp = client.get(f"{EVENTS_URL}?credential_type=card")
        assert resp.status_code == 200, resp.text
        _assert_pagination_envelope(resp.json())

    def test_csv_credential_types_accepted(self, client):
        resp = client.get(f"{EVENTS_URL}?credential_type=card,face,qr")
        assert resp.status_code == 200, resp.text
        _assert_pagination_envelope(resp.json())

    def test_plate_filter_includes_plate_number_rows(self, client):
        """The FE only sends `plate`; expandCredentialTypes() must broaden the
        WHERE to also cover Hanet's `plate_number` storage convention. We can't
        guarantee the tenant has both vocabularies seeded, but we CAN verify
        that the filter result is at least as large as a strict `plate` query
        executed via two-token CSV (which exercises the same code path)."""
        plate_only = client.get(f"{EVENTS_URL}?credential_type=plate").json()
        explicit = client.get(f"{EVENTS_URL}?credential_type=plate,plate_number").json()
        # The aliased filter should match every row the explicit two-token
        # filter matches — same set of values.
        assert plate_only["total"] == explicit["total"], (plate_only, explicit)

    def test_unknown_credential_type_passes_through(self, client):
        """Tokens not in the alias table should fall through as exact-match
        (no expansion), and an unknown value just returns 0 rows."""
        resp = client.get(f"{EVENTS_URL}?credential_type=neverseen_xyz")
        assert resp.status_code == 200, resp.text
        body = resp.json()
        _assert_pagination_envelope(body)
        assert body["total"] == 0, body


# ─── Combined filters ───────────────────────────────────────────────────────


@pytest.mark.api
class TestCombinedFilters:
    def test_user_decision_credential_combined(self, client):
        uid = str(uuid.uuid4())
        url = (
            f"{EVENTS_URL}?user_id={uid}"
            "&decision=granted,denied"
            "&credential_type=card,face,plate"
        )
        resp = client.get(url)
        assert resp.status_code == 200, resp.text
        _assert_pagination_envelope(resp.json())
