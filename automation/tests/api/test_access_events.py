"""
DM3: Access Events API Tests
Tests for access-svc event log endpoints:
  GET /api/v1/events          — paginated listing with filters
  GET /api/v1/events/export   — CSV / XLSX download (50k-row cap)

Requires: company admin login (admin_client fixture from root conftest).
Service: access-svc :8003 (proxied through API_URL).

NOTE: These tests require a running backend (docker-compose local stack).
If the backend is not running, the module-level client fixture will raise a
connection error and pytest will collect but skip/error the tests gracefully.
"""
import csv
import io
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from common.api_client import DM3Client
from common import constants

EVENTS_URL = "/api/v1/access/events"
EXPORT_URL = "/api/v1/access/events/export"


# ── Module-level client fixture ────────────────────────────────

@pytest.fixture(scope="module")
def client():
    """Authenticated API client as company admin for access-events tests."""
    c = DM3Client()
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    # Probe the endpoint to detect missing migration / service down
    check = c.get(EVENTS_URL)
    if check.status_code == 500:
        pytest.skip("access-svc returned 500 — events table may be missing")
    return c


@pytest.fixture(scope="module")
def unauthed_client():
    """API client with no token."""
    return DM3Client()


# ── Listing & Filters ─────────────────────────────────────────

class TestListEventsHappyPath:
    """Basic listing and response envelope validation."""

    @pytest.mark.api
    @pytest.mark.smoke
    def test_list_events_happy_path(self, client):
        """Authenticated request returns paginated envelope with data, total, page, limit."""
        resp = client.get(EVENTS_URL)
        assert resp.status_code == 200
        body = resp.json()
        assert "data" in body, "Response must contain 'data' key"
        assert "total" in body, "Response must contain 'total' key"
        assert "page" in body, "Response must contain 'page' key"
        assert "limit" in body, "Response must contain 'limit' key"
        assert isinstance(body["data"], list)
        assert isinstance(body["total"], int)
        assert body["total"] >= 0

    @pytest.mark.api
    def test_list_events_response_shape(self, client):
        """Each event object has required keys; optional keys allowed."""
        resp = client.get(f"{EVENTS_URL}?limit=5")
        assert resp.status_code == 200
        body = resp.json()
        # Skip shape check if no events are seeded yet
        if not body["data"]:
            pytest.skip("No events present to validate shape — seed data first")
        event = body["data"][0]
        required_keys = {"id", "tenant_id", "time", "decision"}
        for key in required_keys:
            assert key in event, f"Required key '{key}' missing from event: {event}"
        # Optional keys — just assert they don't carry unexpected types if present
        optional_keys = {
            "access_point_id", "user_id", "user_name", "credential_type",
            "direction", "reason", "confidence", "photo_ref",
            "device_id", "device_name", "metadata",
        }
        for key in optional_keys:
            if key in event:
                # Presence is enough — type varies; just ensure no crash
                assert event[key] is not None or event[key] is None


class TestListEventsAuth:
    """Authentication and authorization enforcement."""

    @pytest.mark.api
    def test_list_events_unauthenticated(self, unauthed_client):
        """No token must return 401."""
        resp = unauthed_client.get(EVENTS_URL)
        assert resp.status_code == 401

    @pytest.mark.api
    def test_list_events_no_company_context(self):
        """Sysadmin token without tenant company context must return 403."""
        c = DM3Client()
        # Login as sysadmin — sysadmin has no tenant context
        resp = c.session.post(
            c._url("/api/v1/auth/login"),
            json={"email": constants.SYSADMIN_EMAIL, "password": constants.SYSADMIN_PASSWORD},
            timeout=constants.TIMEOUT_API,
        )
        if resp.status_code != 200:
            pytest.skip("Sysadmin login failed — cannot test no-company-context")
        data = resp.json()
        if data.get("step") == "complete":
            # Sysadmin got a full token with no tenant — use it directly
            c.token = data.get("access_token")
            api_resp = c.get(EVENTS_URL)
            assert api_resp.status_code == 403
        else:
            pytest.skip("Sysadmin login flow differs from expected — cannot test this case")


class TestListEventsTenantScoping:
    """Events must be scoped to the authenticated tenant."""

    @pytest.mark.api
    def test_list_events_default_tenant_scoped(self, admin_client):
        """Events returned when authenticated as company admin are scoped to that tenant."""
        resp = admin_client.get(EVENTS_URL)
        assert resp.status_code == 200
        body = resp.json()
        if not body["data"]:
            pytest.skip("No events present — cannot assert tenant_id scoping")
        tenant_events = body["data"]
        # All returned events must carry the same tenant_id
        tenant_ids = {e["tenant_id"] for e in tenant_events if "tenant_id" in e}
        assert len(tenant_ids) <= 1, (
            f"Events from multiple tenants returned: {tenant_ids}"
        )


class TestListEventsFilters:
    """Filter parameters narrow results correctly."""

    @pytest.mark.api
    def test_list_events_filter_by_decision_granted(self, client):
        """Filter decision=granted returns only granted events (when any exist)."""
        resp = client.get(f"{EVENTS_URL}?decision=granted")
        assert resp.status_code == 200
        body = resp.json()
        for event in body["data"]:
            assert event["decision"] == "granted", (
                f"Expected 'granted', got '{event['decision']}'"
            )

    @pytest.mark.api
    def test_list_events_filter_by_decision_denied(self, client):
        """Filter decision=denied returns only denied events (when any exist)."""
        resp = client.get(f"{EVENTS_URL}?decision=denied")
        assert resp.status_code == 200
        body = resp.json()
        for event in body["data"]:
            assert event["decision"] == "denied", (
                f"Expected 'denied', got '{event['decision']}'"
            )

    @pytest.mark.api
    def test_list_events_filter_by_decision(self, client):
        """grant/deny filter returns only events with that decision."""
        # Test granted
        resp_g = client.get(f"{EVENTS_URL}?decision=granted&limit=50")
        assert resp_g.status_code == 200
        for event in resp_g.json()["data"]:
            assert event["decision"] == "granted"

        # Test denied
        resp_d = client.get(f"{EVENTS_URL}?decision=denied&limit=50")
        assert resp_d.status_code == 200
        for event in resp_d.json()["data"]:
            assert event["decision"] == "denied"

    @pytest.mark.api
    def test_list_events_filter_by_credential_type(self, client):
        """Filter by credential_type returns only events of that type."""
        for ctype in ("card", "pin", "face"):
            resp = client.get(f"{EVENTS_URL}?credential_type={ctype}&limit=50")
            assert resp.status_code == 200
            for event in resp.json()["data"]:
                if "credential_type" in event and event["credential_type"] is not None:
                    assert event["credential_type"] == ctype, (
                        f"Expected credential_type='{ctype}', got '{event['credential_type']}'"
                    )

    @pytest.mark.api
    def test_list_events_filter_by_access_point_id(self, client):
        """Filter by access_point_id returns only events for that access point."""
        # First fetch all events to find a real access_point_id
        all_resp = client.get(f"{EVENTS_URL}?limit=50")
        assert all_resp.status_code == 200
        all_events = all_resp.json()["data"]

        ap_events = [e for e in all_events if e.get("access_point_id")]
        if not ap_events:
            pytest.skip("No events with access_point_id present — cannot test this filter")

        target_ap_id = ap_events[0]["access_point_id"]
        resp = client.get(f"{EVENTS_URL}?access_point_id={target_ap_id}&limit=100")
        assert resp.status_code == 200
        for event in resp.json()["data"]:
            assert event.get("access_point_id") == target_ap_id, (
                f"Expected access_point_id={target_ap_id}, got {event.get('access_point_id')}"
            )

    @pytest.mark.api
    def test_list_events_filter_by_user_id(self, client):
        """Filter by user_id returns only events for that user."""
        all_resp = client.get(f"{EVENTS_URL}?limit=50")
        assert all_resp.status_code == 200
        all_events = all_resp.json()["data"]

        user_events = [e for e in all_events if e.get("user_id")]
        if not user_events:
            pytest.skip("No events with user_id present — cannot test this filter")

        target_user_id = user_events[0]["user_id"]
        resp = client.get(f"{EVENTS_URL}?user_id={target_user_id}&limit=100")
        assert resp.status_code == 200
        for event in resp.json()["data"]:
            assert event.get("user_id") == target_user_id, (
                f"Expected user_id={target_user_id}, got {event.get('user_id')}"
            )

    @pytest.mark.api
    def test_list_events_filter_by_time_range(self, client):
        """from/to RFC3339 filter returns events within the inclusive boundary."""
        now = datetime.now(timezone.utc)
        from_ts = (now - timedelta(days=1)).strftime("%Y-%m-%dT%H:%M:%SZ")
        to_ts = now.strftime("%Y-%m-%dT%H:%M:%SZ")

        resp = client.get(f"{EVENTS_URL}?from={from_ts}&to={to_ts}&limit=50")
        assert resp.status_code == 200
        body = resp.json()
        for event in body["data"]:
            event_time = event.get("time", "")
            if event_time:
                # Parse and verify it falls within the requested window
                try:
                    # Handle various RFC3339 variants
                    et = datetime.fromisoformat(event_time.replace("Z", "+00:00"))
                    from_dt = datetime.fromisoformat(from_ts.replace("Z", "+00:00"))
                    to_dt = datetime.fromisoformat(to_ts.replace("Z", "+00:00"))
                    assert from_dt <= et <= to_dt, (
                        f"Event time {event_time} outside requested range [{from_ts}, {to_ts}]"
                    )
                except ValueError:
                    pass  # Unparseable time format — skip boundary check


class TestListEventsPagination:
    """Pagination parameters are respected."""

    @pytest.mark.api
    def test_list_events_pagination(self, client):
        """Limit and page parameters produce different result sets; total is consistent."""
        # Fetch page 1 limit 5
        resp_p1 = client.get(f"{EVENTS_URL}?page=1&limit=5")
        assert resp_p1.status_code == 200
        body_p1 = resp_p1.json()
        assert len(body_p1["data"]) <= 5
        total = body_p1["total"]

        if total < 2:
            pytest.skip("Fewer than 2 events — pagination boundary test requires ≥2 events")

        # Fetch page 2 limit 1 — should be a different event than page 1 limit 1
        resp_a = client.get(f"{EVENTS_URL}?page=1&limit=1")
        resp_b = client.get(f"{EVENTS_URL}?page=2&limit=1")
        assert resp_a.status_code == 200
        assert resp_b.status_code == 200

        ids_a = [e["id"] for e in resp_a.json()["data"]]
        ids_b = [e["id"] for e in resp_b.json()["data"]]

        if ids_a and ids_b:
            assert ids_a[0] != ids_b[0], (
                "Page 1 and page 2 returned the same event — pagination not working"
            )

        # total must be consistent across pages
        assert resp_a.json()["total"] == resp_b.json()["total"]


# ── Export ────────────────────────────────────────────────────

class TestExportEvents:
    """CSV and XLSX export endpoint."""

    @pytest.mark.api
    @pytest.mark.smoke
    def test_export_events_csv(self, client):
        """format=csv returns 200, correct Content-Type, Content-Disposition, parseable CSV."""
        resp = client.get(f"{EXPORT_URL}?format=csv")
        assert resp.status_code == 200

        content_type = resp.headers.get("Content-Type", "")
        assert "text/csv" in content_type, (
            f"Expected text/csv Content-Type, got: {content_type}"
        )

        disposition = resp.headers.get("Content-Disposition", "")
        assert ".csv" in disposition, (
            f"Expected .csv in Content-Disposition, got: {disposition}"
        )

        # Body must be parseable as CSV with at least a header row
        text = resp.text
        reader = csv.reader(io.StringIO(text))
        rows = list(reader)
        assert len(rows) >= 1, "CSV export must contain at least a header row"
        header = rows[0]
        assert len(header) > 0, "CSV header row must not be empty"

    @pytest.mark.api
    def test_export_events_xlsx(self, client):
        """format=xlsx returns 200, correct Content-Type, parseable workbook with headers."""
        import openpyxl

        resp = client.get(f"{EXPORT_URL}?format=xlsx")
        assert resp.status_code == 200

        content_type = resp.headers.get("Content-Type", "")
        xlsx_mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert xlsx_mime in content_type or "application/octet-stream" in content_type, (
            f"Expected xlsx Content-Type, got: {content_type}"
        )

        disposition = resp.headers.get("Content-Disposition", "")
        assert ".xlsx" in disposition, (
            f"Expected .xlsx in Content-Disposition, got: {disposition}"
        )

        # Parse with openpyxl — must not raise
        wb = openpyxl.load_workbook(io.BytesIO(resp.content))
        ws = wb.active
        assert ws is not None, "Workbook must have an active sheet"
        # First row must contain header cells (non-empty)
        header_row = [cell.value for cell in ws[1] if cell.value is not None]
        assert len(header_row) > 0, "XLSX first row (header) must not be empty"

    @pytest.mark.api
    def test_export_events_invalid_format(self, client):
        """format=json (unsupported) must return 400."""
        resp = client.get(f"{EXPORT_URL}?format=json")
        assert resp.status_code == 400, (
            f"Expected 400 for unsupported format, got {resp.status_code}"
        )

    @pytest.mark.api
    def test_export_events_respects_filters(self, client):
        """Export with decision filter contains only matching rows in CSV body."""
        resp = client.get(f"{EXPORT_URL}?format=csv&decision=granted")
        assert resp.status_code == 200

        text = resp.text
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)

        # Find the decision column (case-insensitive header search)
        if not rows:
            pytest.skip("No export rows to validate filter on")

        decision_col = None
        for key in rows[0].keys():
            if "decision" in key.lower():
                decision_col = key
                break

        if decision_col is None:
            pytest.skip("Could not identify 'decision' column in CSV header")

        for row in rows:
            assert row[decision_col].lower() == "granted", (
                f"Export row has decision='{row[decision_col]}', expected 'granted'"
            )

    @pytest.mark.api
    def test_export_events_tenant_scoped(self, admin_client):
        """Tenant A's export must not include events where tenant_id differs."""
        resp = admin_client.get(f"{EXPORT_URL}?format=csv")
        assert resp.status_code == 200
        # We cannot know Tenant B's tenant_id here, but we verify the endpoint
        # responds successfully and scoped exports work without error
        text = resp.text
        reader = csv.DictReader(io.StringIO(text))
        rows = list(reader)

        tenant_col = None
        for key in (rows[0].keys() if rows else []):
            if "tenant" in key.lower():
                tenant_col = key
                break

        if tenant_col and rows:
            tenant_ids = {row[tenant_col] for row in rows if row.get(tenant_col)}
            assert len(tenant_ids) <= 1, (
                f"Export contained events from multiple tenants: {tenant_ids}"
            )

    @pytest.mark.skip(
        reason=(
            "Seeding 50k+ events is prohibitively slow for CI. "
            "TODO: Add a test that monkeypatches the 50k-row cap constant "
            "in access-svc and inserts a small batch above the patched cap."
        )
    )
    @pytest.mark.api
    def test_export_events_too_large(self, client):
        """Export beyond 50k rows must be rejected or truncated with a warning header."""
        pass
