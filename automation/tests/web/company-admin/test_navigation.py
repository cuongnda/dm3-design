"""
Navigation web tests — ported from apps/console/e2e/navigation.spec.ts.
Verifies every console page loads without crashing.
"""
import json

import pytest
from common.page_objects import BasePage


# All console pages to smoke-test
PAGES = [
    ("/", "Dashboard"),
    ("/secure/access-control", "Access Control"),
    ("/secure/cctv", "CCTV"),
    ("/secure/intrusion", "Intrusion"),
    ("/secure/intercom", "Intercom"),
    ("/secure/ai-detection", "AI Detection"),
    ("/secure/emergency", "Emergency"),
    ("/manage/identities", "Identities"),
    ("/visitors", "Visitors"),
    ("/manage/contractors", "Contractors"),
    ("/manage/attendance", "Attendance"),
    ("/manage/deliveries", "Deliveries"),
    ("/manage/provisioning", "Provisioning"),
    ("/operate/room-booking", "Room Booking"),
    ("/parking", "Parking"),
    ("/operate/maintenance", "Maintenance"),
    ("/operate/guard-tour", "Guard Tour"),
    ("/operate/keys", "Key Management"),
    ("/operate/iot-energy", "IoT Energy"),
    ("/smart/ai-assistant", "AI Assistant"),
    ("/smart/analytics", "Analytics"),
    ("/smart/automation", "Automation"),
    ("/devices", "Devices"),
    ("/settings", "Settings"),
]


def _inject_auth(page) -> None:
    """Inject Zustand auth state + token keys into localStorage.

    The token lives in its own localStorage keys (dm3-token / dm3-refresh),
    separate from the Zustand persist slice (dm3-auth).
    """
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
                enabledPlugins: ['visitor', 'parking', 'cctv', 'attendance'],
            },
            version: 0,
        };
        localStorage.setItem('dm3-auth', JSON.stringify(state));
    """)


def _mock_common_apis(page) -> None:
    """Mock common API endpoints that many pages call.

    Playwright matches routes in reverse registration order (last wins),
    so register the catch-all FIRST, then specific endpoints AFTER.
    """
    # 1) Catch-all — any unmocked /api/v1/* returns an empty paginated envelope.
    page.route("**/api/v1/**", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"data": [], "total": 0, "page": 1, "limit": 20}),
    ))
    # 2) Specific endpoints whose shape must match consumer expectations.
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
    # 3) /auth/me MUST succeed or checkAuth() will clear tokens.
    page.route("**/api/v1/auth/me", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({
            "id": "test-user-id", "email": "admin@duali.com",
            "name": "Test Admin", "role": "primary_manager",
            "company_id": "00000000-0000-0000-0000-000000000001",
            "preferred_language": "en",
            "enabled_plugins": ["visitor", "parking", "cctv", "attendance"],
        }),
    ))


@pytest.mark.web
class TestAllPagesLoad:
    """Smoke test: every page loads without crashing."""

    @pytest.mark.parametrize("path,name", PAGES, ids=[p[1] for p in PAGES])
    def test_page_loads(self, page, path: str, name: str):
        """Page '{name}' at {path} should load without redirect to login."""
        _inject_auth(page)
        _mock_common_apis(page)
        bp = BasePage(page)
        bp.goto(path)
        bp.expect_url_not_contains("/login")
        bp.expect_main_visible()
        # No crash
        body_text = page.locator("body").text_content()
        assert "Application error" not in (body_text or "")
