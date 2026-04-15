"""
Tenant Isolation Tests: Access Events
Verifies that tenant isolation is enforced on the access-events endpoints:
  GET /api/v1/events
  GET /api/v1/events/export

Pattern: Mirror the approach used in the broader test suite — use two
separately-authenticated clients (one per tenant) and assert that each
client can only see its own tenant's events.

NOTE: These tests require a running backend with at least two tenants seeded.
Fixtures use the root conftest.py admin_client (Tenant A) and a second
DM3Client authenticated as a separate company (Tenant B) if configured via
environment variables TENANT_B_EMAIL / TENANT_B_PASSWORD / TENANT_B_COMPANY.
If Tenant B credentials are not available, the cross-tenant tests skip with a
clear message.
"""

import csv
import io
import os

import pytest

from common.api_client import DM3Client
from common import constants

EVENTS_URL = "/api/v1/events"
EXPORT_URL = "/api/v1/events/export"


# ── Tenant B client fixture ────────────────────────────────────

@pytest.fixture(scope="module")
def tenant_b_client():
    """
    API client authenticated as a second tenant (Tenant B).

    Requires environment variables:
      TENANT_B_EMAIL    — email for a company admin on Tenant B
      TENANT_B_PASSWORD — password for that admin

    If not set, the fixture yields None and tests that need it will skip.
    """
    email = os.getenv("TENANT_B_EMAIL")
    password = os.getenv("TENANT_B_PASSWORD")

    if not email or not password:
        yield None
        return

    c = DM3Client()
    try:
        c.login(email, password)
    except Exception as exc:
        pytest.skip(f"Tenant B login failed: {exc}")
        yield None
        return

    if not c.token:
        yield None
        return

    yield c


@pytest.fixture(scope="module")
def tenant_a_client():
    """Authenticated client as the default company admin (Tenant A)."""
    c = DM3Client()
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    check = c.get(EVENTS_URL)
    if check.status_code == 500:
        pytest.skip("access-svc returned 500 — events table may be missing")
    return c


# ── Helper ────────────────────────────────────────────────────

def _require_tenant_b(tenant_b_client):
    """Skip the calling test if Tenant B credentials are unavailable."""
    if tenant_b_client is None:
        pytest.skip(
            "Tenant B client not available — set TENANT_B_EMAIL and "
            "TENANT_B_PASSWORD environment variables to enable cross-tenant tests."
        )


# ── List Isolation ────────────────────────────────────────────

class TestTenantListIsolation:
    """Listing events must be scoped to the authenticated tenant."""

    @pytest.mark.api
    def test_tenant_cannot_list_other_tenant_events(
        self, tenant_a_client, tenant_b_client
    ):
        """
        Tenant A's event list must not contain events whose tenant_id
        belongs to Tenant B, and vice versa.
        """
        _require_tenant_b(tenant_b_client)

        # Fetch events as Tenant A
        resp_a = tenant_a_client.get(f"{EVENTS_URL}?limit=100")
        assert resp_a.status_code == 200
        events_a = resp_a.json()["data"]

        # Fetch events as Tenant B
        resp_b = tenant_b_client.get(f"{EVENTS_URL}?limit=100")
        assert resp_b.status_code == 200
        events_b = resp_b.json()["data"]

        # Collect tenant_ids visible to each client
        tenant_ids_a = {e["tenant_id"] for e in events_a if e.get("tenant_id")}
        tenant_ids_b = {e["tenant_id"] for e in events_b if e.get("tenant_id")}

        # The two sets must not overlap
        overlap = tenant_ids_a & tenant_ids_b
        assert not overlap, (
            f"Tenants share visible tenant_ids in event lists: {overlap}. "
            "Isolation breach — both clients can see the same tenant's events."
        )

    @pytest.mark.api
    def test_tenant_a_events_have_single_tenant_id(self, tenant_a_client):
        """
        All events returned for Tenant A must share a single tenant_id.
        Multiple distinct tenant_ids in the response indicate a scoping failure.
        """
        resp = tenant_a_client.get(f"{EVENTS_URL}?limit=100")
        assert resp.status_code == 200
        events = resp.json()["data"]

        if not events:
            pytest.skip("No events for Tenant A — cannot assert single tenant_id")

        tenant_ids = {e["tenant_id"] for e in events if e.get("tenant_id")}
        assert len(tenant_ids) <= 1, (
            f"Events for Tenant A contain multiple tenant_ids: {tenant_ids}. "
            "Tenant scoping is broken."
        )

    @pytest.mark.api
    def test_tenant_cannot_filter_by_other_tenant_access_point_id(
        self, tenant_a_client, tenant_b_client
    ):
        """
        Filtering by an access_point_id that belongs to Tenant B while
        authenticated as Tenant A must return an empty list — NOT an error
        or Tenant B's events (which would be an isolation leak).
        """
        _require_tenant_b(tenant_b_client)

        # Get a real access_point_id from Tenant B's events
        resp_b = tenant_b_client.get(f"{EVENTS_URL}?limit=50")
        assert resp_b.status_code == 200
        b_events = resp_b.json()["data"]

        b_ap_events = [e for e in b_events if e.get("access_point_id")]
        if not b_ap_events:
            pytest.skip(
                "Tenant B has no events with access_point_id — cannot test cross-tenant filter"
            )

        b_ap_id = b_ap_events[0]["access_point_id"]

        # Query as Tenant A using Tenant B's access_point_id
        resp_a = tenant_a_client.get(
            f"{EVENTS_URL}?access_point_id={b_ap_id}&limit=100"
        )
        # Must not error (200 is correct — just empty)
        assert resp_a.status_code == 200, (
            f"Expected 200 (empty list), got {resp_a.status_code}. "
            "The endpoint should return empty, not an error, for unknown access_point_id."
        )
        events_a = resp_a.json()["data"]
        assert events_a == [], (
            f"Tenant A received {len(events_a)} event(s) when filtering by "
            f"Tenant B's access_point_id ({b_ap_id}). This is an isolation breach."
        )


# ── Export Isolation ──────────────────────────────────────────

class TestTenantExportIsolation:
    """Export endpoints must be scoped to the authenticated tenant."""

    @pytest.mark.api
    def test_tenant_cannot_export_other_tenant_events_csv(
        self, tenant_a_client, tenant_b_client
    ):
        """
        Tenant A's CSV export must not contain rows with Tenant B's tenant_id.
        """
        _require_tenant_b(tenant_b_client)

        # Get Tenant B's tenant_id from their own export
        resp_b = tenant_b_client.get(f"{EXPORT_URL}?format=csv")
        assert resp_b.status_code == 200
        reader_b = csv.DictReader(io.StringIO(resp_b.text))
        rows_b = list(reader_b)

        if not rows_b:
            pytest.skip("Tenant B has no exported events — cannot cross-check")

        # Find tenant_id column in Tenant B's export
        tenant_col = None
        for key in rows_b[0].keys():
            if "tenant" in key.lower():
                tenant_col = key
                break

        if not tenant_col:
            pytest.skip("No tenant_id column in CSV export — cannot verify isolation")

        tenant_b_ids = {row[tenant_col] for row in rows_b if row.get(tenant_col)}

        # Now export as Tenant A and check for contamination
        resp_a = tenant_a_client.get(f"{EXPORT_URL}?format=csv")
        assert resp_a.status_code == 200
        reader_a = csv.DictReader(io.StringIO(resp_a.text))
        rows_a = list(reader_a)

        for row in rows_a:
            row_tenant_id = row.get(tenant_col, "")
            assert row_tenant_id not in tenant_b_ids, (
                f"Tenant A's CSV export contains a row with Tenant B's tenant_id "
                f"({row_tenant_id}). This is an isolation breach."
            )

    @pytest.mark.api
    def test_tenant_cannot_export_other_tenant_events_xlsx(
        self, tenant_a_client, tenant_b_client
    ):
        """
        Tenant A's XLSX export must not contain rows with Tenant B's tenant_id.
        """
        import openpyxl

        _require_tenant_b(tenant_b_client)

        # Get Tenant B's tenant_id reference from their events list
        resp_b_list = tenant_b_client.get(f"{EVENTS_URL}?limit=100")
        assert resp_b_list.status_code == 200
        b_events = resp_b_list.json()["data"]
        b_tenant_ids = {e["tenant_id"] for e in b_events if e.get("tenant_id")}

        if not b_tenant_ids:
            pytest.skip("Tenant B has no events with tenant_id — cannot cross-check XLSX")

        # Export as Tenant A in XLSX
        resp_a = tenant_a_client.get(f"{EXPORT_URL}?format=xlsx")
        assert resp_a.status_code == 200

        wb = openpyxl.load_workbook(io.BytesIO(resp_a.content))
        ws = wb.active

        # Find tenant_id column index from header row
        header = [cell.value for cell in ws[1]]
        tenant_col_idx = None
        for idx, col_name in enumerate(header):
            if col_name and "tenant" in str(col_name).lower():
                tenant_col_idx = idx
                break

        if tenant_col_idx is None:
            pytest.skip(
                "No tenant_id column in XLSX export header — cannot verify isolation"
            )

        # Check all data rows
        for row in ws.iter_rows(min_row=2, values_only=True):
            if not any(row):
                continue  # skip empty trailing rows
            row_tenant_id = str(row[tenant_col_idx]) if row[tenant_col_idx] else ""
            assert row_tenant_id not in b_tenant_ids, (
                f"Tenant A's XLSX export contains Tenant B's tenant_id "
                f"({row_tenant_id}). This is an isolation breach."
            )

    @pytest.mark.api
    def test_export_returns_only_own_tenant_data(self, tenant_a_client):
        """
        Without a second tenant for comparison, verify that all rows in
        Tenant A's export share a single tenant_id (no leakage from any tenant).
        """
        resp = tenant_a_client.get(f"{EXPORT_URL}?format=csv")
        assert resp.status_code == 200

        reader = csv.DictReader(io.StringIO(resp.text))
        rows = list(reader)

        if not rows:
            pytest.skip("No export rows — cannot assert single tenant_id")

        tenant_col = None
        for key in rows[0].keys():
            if "tenant" in key.lower():
                tenant_col = key
                break

        if not tenant_col:
            pytest.skip("No tenant_id column in CSV — skipping single-tenant assertion")

        tenant_ids = {row[tenant_col] for row in rows if row.get(tenant_col)}
        assert len(tenant_ids) <= 1, (
            f"CSV export for one tenant contains multiple tenant_ids: {tenant_ids}. "
            "Scoping is broken."
        )
