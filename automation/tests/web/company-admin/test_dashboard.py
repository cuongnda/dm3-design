"""
Dashboard web tests — ported from apps/console/e2e/dashboard.spec.ts.
Uses page objects and the shared auth injection fixture.
"""
import json

import pytest
from common.page_objects import DashboardPage


def _inject_auth(page) -> None:
    """Inject Zustand auth state into localStorage before navigation."""
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


@pytest.mark.web
class TestDashboardLayout:
    """Dashboard layout when authenticated."""

    def _setup(self, page) -> DashboardPage:
        _inject_auth(page)
        # Mock API calls the dashboard makes
        page.route("**/api/v1/auth/tenant/**", lambda r: r.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({"tenant": {"id": "00000000-0000-0000-0000-000000000001", "status": "active"}}),
        ))
        page.route("**/api/v1/access/stats", lambda r: r.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({
                "doors_online": 0, "doors_offline": 0, "doors_alarm": 0,
                "doors_total": 0, "events_today": 0, "granted_today": 0,
                "denied_today": 0, "recent_events": [],
            }),
        ))
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
