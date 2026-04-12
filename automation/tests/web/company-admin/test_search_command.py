"""
Search command palette web tests — ported from apps/console/e2e/search-command.spec.ts.
"""
import json

import pytest
from common.page_objects import DashboardPage


def _inject_auth(page) -> None:
    """Inject Zustand auth state into localStorage."""
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


def _mock_apis(page) -> None:
    page.route("**/api/v1/**", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"data": [], "total": 0}),
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
