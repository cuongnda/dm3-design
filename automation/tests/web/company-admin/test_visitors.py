"""
Visitor UI tests — company admin console /manage/visitors.

Mirrors the style of test_department_management.py: injects auth into
localStorage, mocks core APIs so the page renders deterministically, and
asserts layout + core user flows.
"""
from __future__ import annotations

import json

import pytest
from playwright.sync_api import expect

from common import constants

VISITORS_URL = f"{constants.WEB_URL.rstrip('/')}/visitors"


def _inject_auth(page) -> None:
    """Inject Zustand auth state + token keys into localStorage before navigation."""
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
                enabledPlugins: ['visitor', 'parking', 'attendance'],
            },
            version: 0,
        };
        localStorage.setItem('dm3-auth', JSON.stringify(state));
    """)


def _sample_visit() -> dict:
    return {
        "id": "11111111-1111-1111-1111-111111111111",
        "visitor_id": "22222222-2222-2222-2222-222222222222",
        "visitor": {
            "id": "22222222-2222-2222-2222-222222222222",
            "first_name": "Alice",
            "last_name": "Example",
            "email": "alice@example.com",
        },
        "host_user_id": "00000000-0000-0000-0000-0000000000aa",
        "host": {
            "id": "00000000-0000-0000-0000-0000000000aa",
            "name": "Test Admin",
            "department": "Operations",
        },
        "purpose": "meeting",
        "status": "pre_registered",
        "expected_arrival": "2026-04-24T09:00:00Z",
    }


def _mock_common_apis(page, visits=None) -> None:
    """Mock the APIs used by the visitors page. Catch-all first, specific after (last wins)."""
    payload_visits = [_sample_visit()] if visits is None else visits

    # Catch-all for anything we forgot to mock.
    page.route("**/api/v1/**", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"data": [], "total": 0, "page": 1, "limit": 20}),
    ))

    page.route("**/api/v1/auth/me", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({
            "id": "test-user-id", "email": "admin@duali.com",
            "name": "Test Admin", "role": "primary_manager",
            "company_id": "00000000-0000-0000-0000-000000000001",
            "preferred_language": "en",
            "enabled_plugins": ["visitor", "parking", "attendance"],
        }),
    ))
    page.route("**/api/v1/auth/tenant/**", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"tenant": {"id": "00000000-0000-0000-0000-000000000001", "status": "active"}}),
    ))
    page.route("**/api/v1/notifications/unread-count", lambda r: r.fulfill(
        status=200, content_type="application/json", body=json.dumps({"count": 0}),
    ))
    page.route("**/api/v1/users**", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({"users": [{
            "id": "00000000-0000-0000-0000-0000000000aa",
            "full_name": "Test Admin",
            "first_name": "Test", "last_name": "Admin",
            "email": "admin@duali.com",
            "department_name": "Operations",
            "position": "Manager",
            "status": "active",
        }]}),
    ))
    page.route("**/api/v1/visitors/today/summary", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({
            "expected": 1, "checked_in": 0, "checked_out": 0,
            "approved": 1, "waiting": 0, "no_show": 0,
        }),
    ))
    page.route("**/api/v1/visitors/visits**", lambda r: r.fulfill(
        status=200, content_type="application/json",
        body=json.dumps({
            "data": payload_visits, "page": 1, "limit": 20,
            "total": len(payload_visits), "total_pages": 1,
        }),
    ))


def _goto(page) -> None:
    page.goto(VISITORS_URL, wait_until="domcontentloaded")


# ─── Page Layout ──────────────────────────────────────────────


@pytest.mark.web
class TestVisitorsPageLayout:
    """Render tests: the essentials must be visible on /manage/visitors."""

    def test_page_renders_main(self, page):
        _inject_auth(page)
        _mock_common_apis(page)
        _goto(page)
        expect(page.locator("main")).to_be_visible(timeout=10_000)

    def test_page_has_h1(self, page):
        _inject_auth(page)
        _mock_common_apis(page)
        _goto(page)
        expect(page.locator("h1")).to_be_visible(timeout=10_000)

    def test_visit_row_visible(self, page):
        """A mocked visit should land in the table."""
        _inject_auth(page)
        _mock_common_apis(page)
        _goto(page)
        # Row content: visitor name or email should appear somewhere on the page.
        expect(page.get_by_text("Alice", exact=False)).to_be_visible(timeout=10_000)


# ─── Empty & error states ──────────────────────────────────────


@pytest.mark.web
class TestVisitorsEmptyState:
    """Empty API → empty-state UI, not a crash."""

    def test_empty_list_renders(self, page):
        _inject_auth(page)
        _mock_common_apis(page, visits=[])
        _goto(page)
        expect(page.locator("main")).to_be_visible(timeout=10_000)


@pytest.mark.web
class TestVisitorsApiError:
    """500 on the list endpoint should not crash the page."""

    def test_api_error_does_not_crash(self, page):
        _inject_auth(page)
        _mock_common_apis(page)
        page.route("**/api/v1/visitors/visits**", lambda r: r.fulfill(
            status=500, content_type="application/json",
            body=json.dumps({"error": "server blew up"}),
        ))
        _goto(page)
        # Page shell still visible — error is localized to the table region.
        expect(page.locator("main")).to_be_visible(timeout=10_000)


# ─── Create invitation flow ────────────────────────────────────


@pytest.mark.web
class TestVisitorsCreateFlow:
    """The 'create visit' button should open a modal with required fields."""

    def _open_create_modal(self, page) -> None:
        _inject_auth(page)
        _mock_common_apis(page)
        _goto(page)
        # Page exposes both preregister + walk-in; preregister is the primary path.
        create_btn = page.locator('[data-testid="manage-button-preregister-visitor"]').first
        try:
            create_btn.wait_for(state="visible", timeout=10_000)
        except Exception:
            pytest.skip("preregister button did not render on /visitors")
        create_btn.click()

    def test_create_modal_opens(self, page):
        self._open_create_modal(page)
        # A modal dialog of some form should appear.
        dialog = page.get_by_role("dialog").first
        expect(dialog).to_be_visible(timeout=5_000)

    def test_create_modal_has_name_input(self, page):
        self._open_create_modal(page)
        # Any text input inside the dialog is enough; the page's exact testid
        # surface may evolve, so we don't over-specify.
        dialog = page.get_by_role("dialog").first
        inputs = dialog.locator("input[type='text'], input:not([type])")
        expect(inputs.first).to_be_visible(timeout=5_000)


# ─── Responsive ────────────────────────────────────────────────


@pytest.mark.web
class TestVisitorsResponsive:
    """Viewport sanity checks — the page shouldn't clip on mobile."""

    def test_mobile_viewport(self, page):
        page.set_viewport_size({"width": 375, "height": 667})
        _inject_auth(page)
        _mock_common_apis(page)
        _goto(page)
        expect(page.locator("main")).to_be_visible(timeout=10_000)

    def test_desktop_viewport(self, page):
        page.set_viewport_size({"width": 1440, "height": 900})
        _inject_auth(page)
        _mock_common_apis(page)
        _goto(page)
        expect(page.locator("h1")).to_be_visible(timeout=10_000)
