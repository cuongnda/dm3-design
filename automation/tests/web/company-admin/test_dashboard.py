"""
Dashboard web tests — ported from apps/console/e2e/dashboard.spec.ts.
Uses page objects and the shared auth injection fixture.
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


def _mock_common_apis(page) -> None:
    """Mock common API endpoints — catch-all first, specific after (last wins)."""
    page.route("**/api/v1/**", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"data": [], "total": 0, "page": 1, "limit": 20}),
    ))
    page.route("**/api/v1/access/stats", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({
            "doors_online": 0, "doors_offline": 0, "doors_alarm": 0,
            "doors_total": 0, "events_today": 0, "granted_today": 0,
            "denied_today": 0, "recent_events": [],
        }),
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
class TestDashboardLayout:
    """Dashboard layout when authenticated."""

    def _setup(self, page) -> DashboardPage:
        _inject_auth(page)
        _mock_common_apis(page)
        db = DashboardPage(page)
        db.navigate()
        return db

    def test_dashboard_loads(self, page):
        """Authenticated user should see dashboard, not login."""
        db = self._setup(page)
        db.expect_loaded()

    def test_sidebar_visible(self, page):
        """Sidebar navigation should be visible."""
        db = self._setup(page)
        db.expect_sidebar_visible()

    def test_topbar_visible(self, page):
        """Top bar should be visible."""
        db = self._setup(page)
        db.expect_topbar_visible()
