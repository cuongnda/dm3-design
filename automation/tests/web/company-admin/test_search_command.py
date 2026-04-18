"""
Search command palette web tests — ported from apps/console/e2e/search-command.spec.ts.
"""
import json

import pytest
from common.page_objects import DashboardPage


def _inject_auth(page) -> None:
    """Inject Zustand auth state + token keys into localStorage."""
    page.add_init_script("""
        localStorage.setItem('dm3-token', 'dm3-test-token');
        localStorage.setItem('dm3-refresh', 'dm3-test-refresh');
        localStorage.setItem('dm3-lang', 'en');
        const state = {
            state: {
                user: {
                    id: 'test-user-id',
                    email: 'admin@duali.com',
                    name: 'Test Admin',
                    role: 'primary_manager',
                    initials: 'TA',
                },
                isAuthenticated: true,
                enabledPlugins: ['visitors', 'parking', 'attendance'],
            },
            version: 0,
        };
        localStorage.setItem('dm3-auth', JSON.stringify(state));
    """)


def _mock_apis(page) -> None:
    """Mock common API endpoints — catch-all first, specific after (last wins)."""
    page.route("**/api/v1/**", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"data": [], "total": 0, "page": 1, "limit": 20}),
    ))
    page.route("**/api/v1/gateway/devices", lambda r: r.fulfill(
        status=200, content_type="application/json", body=json.dumps([]),
    ))
    page.route("**/api/v1/notifications/unread-count", lambda r: r.fulfill(
        status=200, content_type="application/json", body=json.dumps({"count": 0}),
    ))
    page.route("**/api/v1/auth/tenant/**", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"tenant": {"id": "00000000-0000-0000-0000-000000000001", "status": "active"}}),
    ))
    page.route("**/api/v1/auth/me", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({
            "id": "test-user-id", "email": "admin@duali.com",
            "name": "Test Admin", "role": "primary_manager",
            "company_id": "00000000-0000-0000-0000-000000000001",
            "preferred_language": "en",
            "enabled_plugins": ["visitors", "parking", "attendance"],
        }),
    ))


@pytest.mark.web
class TestSearchCommandPalette:
    """Command palette (Cmd+K) tests."""

    def _setup(self, page) -> DashboardPage:
        _inject_auth(page)
        _mock_apis(page)
        db = DashboardPage(page)
        db.navigate()
        return db

    def test_opens_with_keyboard(self, page):
        """Cmd+K should open the command palette."""
        db = self._setup(page)
        db.open_command_palette()
        db.expect_command_palette_visible()
        from playwright.sync_api import expect
        expect(page.locator('input[placeholder*="Search"]')).to_be_visible()

    def test_shows_page_results(self, page):
        """Command palette should show Pages group with navigation items."""
        db = self._setup(page)
        db.open_command_palette()
        db.expect_command_palette_visible()
        db.expect_command_results("Pages", "Dashboard", "Access Control")

    def test_search_filters_results(self, page):
        """Typing in command palette should filter results."""
        db = self._setup(page)
        db.search_command("parking")
        from playwright.sync_api import expect
        expect(page.locator('[cmdk-item]:has-text("Parking")')).to_be_visible()

    def test_navigates_on_selection(self, page):
        """Selecting an item should navigate to that page."""
        db = self._setup(page)
        db.search_command("CCTV")
        db.select_command_item("CCTV")
        db.expect_url_contains("/secure/cctv")

    def test_closes_with_escape(self, page):
        """Escape should close the command palette."""
        db = self._setup(page)
        db.open_command_palette()
        db.expect_command_palette_visible()
        db.close_command_palette()
        db.expect_command_palette_hidden()
