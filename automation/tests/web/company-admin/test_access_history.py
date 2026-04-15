"""
Web UI Tests: Access History page (/secure/access-history).
Uses the AccessHistoryPage page object.
All selectors are data-testid only — no CSS selectors or :has-text.

Tests use the same auth-injection + API-mocking pattern as other web tests
so they run without a live backend (Playwright mocks intercept network calls).

Requires: frontend dev server running at WEB_URL (default http://localhost:3000).
"""
import json
import re

import pytest
from playwright.sync_api import expect

from common.page_objects import AccessHistoryPage
from common import constants


# ── Shared helpers ────────────────────────────────────────────

def _inject_auth(page) -> None:
    """Inject Zustand auth state into localStorage before page load."""
    page.add_init_script("""() => {
        const state = {
            state: {
                token: 'dm3-test-token',
                refreshToken: 'dm3-test-refresh',
                user: {
                    id: 'test-user-id',
                    email: 'admin@duali.com',
                    name: 'Test Admin',
                    role: 'primary_manager',
                    tenant_id: '00000000-0000-0000-0000-000000000001',
                },
                isAuthenticated: true,
                enabledPlugins: ['visitors', 'parking', 'attendance'],
            },
            version: 0,
        };
        localStorage.setItem('dm3-auth', JSON.stringify(state));
    }""")


def _mock_common_apis(page) -> None:
    """Mock shared API calls that the shell/layout components make on every page."""
    page.route("**/api/v1/auth/tenant/**", lambda r: r.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps({
            "tenant": {
                "id": "00000000-0000-0000-0000-000000000001",
                "status": "active",
            }
        }),
    ))
    page.route("**/api/v1/access/stats", lambda r: r.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps({
            "doors_online": 0, "doors_offline": 0, "doors_alarm": 0,
            "doors_total": 0, "events_today": 0, "granted_today": 0,
            "denied_today": 0, "recent_events": [],
        }),
    ))


def _make_events_response(events: list[dict] | None = None) -> dict:
    """Build a standard events paginated envelope."""
    data = events or []
    return {"data": data, "total": len(data), "page": 1, "limit": 20}


def _mock_events_api(page, events: list[dict] | None = None) -> None:
    """Route all GET /api/v1/events requests to return controlled test data."""
    body = json.dumps(_make_events_response(events))
    page.route(
        "**/api/v1/events*",
        lambda r: r.fulfill(
            status=200,
            content_type="application/json",
            body=body,
        ) if "export" not in r.request.url else r.continue_(),
    )


def _setup(page) -> AccessHistoryPage:
    """Standard setup: inject auth, mock common APIs, return page object."""
    _inject_auth(page)
    _mock_common_apis(page)
    return AccessHistoryPage(page)


# ── Sidebar navigation ────────────────────────────────────────

@pytest.mark.web
class TestAccessHistorySidebarLink:
    """Verify the sidebar navigation link is present and correct."""

    @pytest.mark.smoke
    def test_sidebar_link_visible(self, page):
        """
        After login, the sidebar must contain the testid 'sys-link-access-history'
        and it must be visible.
        """
        hp = _setup(page)
        # Mock events so the page itself loads cleanly
        _mock_events_api(page)
        # Navigate to a landing page first so the sidebar renders
        page.route("**/api/v1/**", lambda r: r.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"data": [], "total": 0}),
        ))
        hp.goto("/")
        hp.expect_visible("sys-link-access-history")


# ── Page load ─────────────────────────────────────────────────

@pytest.mark.web
class TestAccessHistoryPageLoad:
    """Page loads cleanly with default filter state."""

    @pytest.mark.smoke
    def test_page_loads_with_default_filters(self, page):
        """
        Navigate to /secure/access-history.
        The page must not redirect to login, and either the events table
        or the empty state must be visible. The URL must point to the page
        (default 7-day filter is applied client-side, not necessarily URL-encoded).
        """
        hp = _setup(page)
        _mock_events_api(page, events=[])
        hp.open()

        # Not redirected to login
        hp.expect_url_not_contains("/login")

        # Main content visible
        hp.expect_main_visible()

        # No application crash
        body_text = page.locator("body").text_content() or ""
        assert "Application error" not in body_text

        # Either the table or empty state must render
        page.wait_for_load_state("networkidle")
        table_count = page.locator('[data-testid="access-history-table-events"]').count()
        empty_count = page.locator('[data-testid="access-history-empty"]').count()
        assert table_count > 0 or empty_count > 0, (
            "Neither the events table nor the empty state rendered on /secure/access-history"
        )


# ── Filter behaviour ──────────────────────────────────────────

@pytest.mark.web
class TestAccessHistoryFilters:
    """Filter interactions update the URL and re-render the table."""

    def test_filter_by_decision_updates_url(self, page):
        """
        Selecting 'denied' from the Decision filter must add decision=denied to the URL
        and the page must re-render without crashing.
        """
        hp = _setup(page)
        _mock_events_api(page, events=[])
        hp.open()
        page.wait_for_load_state("networkidle")

        # Mock the filtered response (decision=denied → empty is fine)
        page.route("**/api/v1/events*", lambda r: r.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"data": [], "total": 0, "page": 1, "limit": 20}),
        ) if "export" not in r.request.url else r.continue_())

        # Interact with the Decision filter
        hp.select_decision("denied")
        page.wait_for_load_state("networkidle")

        # URL must reflect the selected filter
        current_url = page.url
        assert "decision=denied" in current_url, (
            f"Expected 'decision=denied' in URL after selecting filter, got: {current_url}"
        )

    def test_clear_filters_removes_url_params(self, page):
        """
        After applying a filter, clicking Clear must remove the filter params from the URL.
        """
        hp = _setup(page)
        _mock_events_api(page, events=[])

        # Open the page with an existing filter in the URL
        hp.goto(f"{AccessHistoryPage.PATH}?decision=denied")
        page.wait_for_load_state("networkidle")

        hp.click_clear_filters()

        current_url = page.url
        assert "decision=denied" not in current_url, (
            f"URL still contains 'decision=denied' after clicking Clear: {current_url}"
        )

    def test_filters_persist_on_reload(self, page):
        """
        A filter applied via URL query param must still be active after a full page reload.
        """
        hp = _setup(page)
        _mock_events_api(page, events=[])

        # Navigate with filter already in URL (simulates user having applied it)
        hp.goto(f"{AccessHistoryPage.PATH}?decision=granted")
        page.wait_for_load_state("networkidle")

        # Reload the page — auth is re-injected via init_script
        hp.reload()

        current_url = page.url
        assert "decision=granted" in current_url, (
            f"Filter param 'decision=granted' was lost after page reload. URL: {current_url}"
        )

    def test_empty_state_when_no_results(self, page):
        """
        Filtering with an impossible access_point UUID must show the empty state testid.
        """
        impossible_uuid = "00000000-0000-0000-0000-000000000000"
        hp = _setup(page)

        # Return empty for any events request
        page.route("**/api/v1/events*", lambda r: r.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({"data": [], "total": 0, "page": 1, "limit": 20}),
        ) if "export" not in r.request.url else r.continue_())

        hp.goto(f"{AccessHistoryPage.PATH}?access_point_id={impossible_uuid}")
        page.wait_for_load_state("networkidle")

        hp.expect_visible("access-history-empty")


# ── Export ────────────────────────────────────────────────────

@pytest.mark.web
class TestAccessHistoryExport:
    """Export buttons trigger file downloads with correct filenames."""

    def test_export_csv_triggers_download(self, page):
        """
        Clicking the CSV export button must trigger a browser download.
        The downloaded filename must end with .csv.
        """
        hp = _setup(page)
        _mock_events_api(page, events=[])

        # Mock the export endpoint to serve a CSV file
        page.route("**/api/v1/events/export*", lambda r: r.fulfill(
            status=200,
            content_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": 'attachment; filename="access-events.csv"'},
            body="id,time,decision\n",
        ))

        hp.open()
        page.wait_for_load_state("networkidle")

        with page.expect_download() as download_info:
            hp.click_export_csv()

        download = download_info.value
        assert download.suggested_filename.endswith(".csv"), (
            f"Expected downloaded filename to end with .csv, got: {download.suggested_filename}"
        )


# ── Access point dropdown ─────────────────────────────────────

@pytest.mark.web
class TestAccessHistoryDropdowns:
    """Dropdowns show human-readable names, not raw UUIDs."""

    def test_access_point_dropdown_shows_names_not_uuids(self, page):
        """
        When the Access Point dropdown is opened, the visible option texts
        must not look like UUIDs (xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx).
        At least one option must be present and have a non-UUID label.
        """
        hp = _setup(page)
        _mock_events_api(page, events=[])

        # Mock the access points list endpoint
        page.route("**/api/v1/access-points*", lambda r: r.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "data": [
                    {"id": "aaaaaaaa-0000-0000-0000-000000000001", "name": "Main Entrance"},
                    {"id": "aaaaaaaa-0000-0000-0000-000000000002", "name": "Server Room"},
                ],
                "total": 2,
            }),
        ))

        hp.open()
        page.wait_for_load_state("networkidle")

        # Open the access point dropdown
        hp.filter_access_point.click()

        # UUID pattern — option text must NOT match this
        uuid_pattern = re.compile(
            r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$",
            re.IGNORECASE,
        )

        options = page.get_by_role("option").all()
        assert len(options) > 0, (
            "Access Point dropdown opened but contained no options"
        )

        for opt in options:
            text = (opt.text_content() or "").strip()
            if not text:
                continue
            assert not uuid_pattern.match(text), (
                f"Access Point dropdown option displays a raw UUID: '{text}'. "
                "Human-readable names are required."
            )
