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
    ("/manage/visitors", "Visitors"),
    ("/manage/contractors", "Contractors"),
    ("/manage/attendance", "Attendance"),
    ("/manage/deliveries", "Deliveries"),
    ("/manage/provisioning", "Provisioning"),
    ("/operate/room-booking", "Room Booking"),
    ("/operate/parking", "Parking"),
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


def _mock_common_apis(page) -> None:
    """Mock common API endpoints that many pages call."""
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
    # Catch-all for other API calls — return empty 200
    page.route("**/api/v1/**", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"data": [], "total": 0}),
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
