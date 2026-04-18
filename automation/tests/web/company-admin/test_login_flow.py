"""
Login flow web tests — ported from apps/console/e2e/login.spec.ts.
Uses page objects for stable selectors and clean test bodies.
"""
import json

import pytest
from common.page_objects import LoginPage


MOCK_TEMP_TOKEN = "temp-token"
MOCK_COMPANY_A = "00000000-0000-0000-0000-000000000001"
MOCK_COMPANY_B = "00000000-0000-0000-0000-000000000002"


@pytest.mark.web
class TestLoginPage:
    """Login page UI and form tests."""

    def test_shows_login_form(self, page):
        """Login page should show brand, email, password, and sign-in button."""
        login = LoginPage(page)
        login.navigate()
        login.expect_form_visible()

    def test_email_prefilled(self, page):
        """Email field should be pre-filled with default admin address."""
        login = LoginPage(page)
        login.navigate()
        login.expect_email_prefilled("admin@duali.com")

    def test_sso_and_forgot_password_visible(self, page):
        """SSO button and forgot-password link should be visible."""
        login = LoginPage(page)
        login.navigate()
        from playwright.sync_api import expect
        expect(login.sso_button).to_be_visible()
        expect(login.forgot_password_link).to_be_visible()

    def test_password_visibility_toggle(self, page):
        """Clicking the eye icon should toggle password field type."""
        login = LoginPage(page)
        login.navigate()
        login.expect_password_type("password")
        login.toggle_password_visibility()
        login.expect_password_type("text")

    def test_unauthenticated_redirect(self, page):
        """Unauthenticated visit to / should redirect to /login."""
        login = LoginPage(page)
        page.goto("/")
        login.expect_url_contains("/login")


@pytest.mark.web
class TestLoginErrors:
    """Login error handling tests."""

    def test_invalid_credentials_shows_error(self, page):
        """Invalid login should show error message."""
        login = LoginPage(page)
        login.mock_api(
            "**/api/v1/auth/login",
            401,
            {"message": "Invalid email or password"},
        )
        login.navigate()
        login.fill_password("wrong-password")
        login.sign_in_button.click()
        login.expect_error_message("Invalid email or password")


@pytest.mark.web
class TestTwoStepLogin:
    """Two-step company-selection login flow."""

    def _mock_login_flow(self, page) -> None:
        """Set up route mocks for the complete two-step login."""
        # Step 1: returns company list
        page.route("**/api/v1/auth/login", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "step": "select_company",
                "temporary_token": MOCK_TEMP_TOKEN,
                "user": {"id": "multi-user", "name": "Multi User", "email": "multi@test.com"},
                "companies": [
                    {"id": MOCK_COMPANY_A, "name": "Alpha Co", "code": "ALPHA", "role": "primary_manager", "logo_url": None},
                    {"id": MOCK_COMPANY_B, "name": "Beta Co", "code": "BETA", "role": "viewer", "logo_url": None},
                ],
            }),
        ))

        # Step 2: returns tokens
        page.route("**/api/v1/auth/login-step2", lambda route: route.fulfill(
            status=200,
            content_type="application/json",
            body=json.dumps({
                "step": "complete",
                "access_token": "access-token",
                "refresh_token": "refresh-token",
                "user": {
                    "id": "multi-user", "name": "Multi User",
                    "email": "multi@test.com", "role": "viewer",
                    "tenant_id": MOCK_COMPANY_B,
                },
            }),
        ))

        # Tenant endpoints
        page.route("**/api/v1/auth/tenant/current", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({"tenant": {
                "id": MOCK_COMPANY_B, "company_id": MOCK_COMPANY_B,
                "company_name": "Beta Co", "company_code": "BETA",
                "plan": "starter", "status": "active",
                "max_devices": 50, "max_users": 20,
            }}),
        ))

        page.route("**/api/v1/auth/tenant/stats", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({"usage": {
                "devices": {"current": 1, "limit": 50},
                "users": {"current": 2, "limit": 20},
                "persons": {"current": 3, "limit": 100},
            }}),
        ))

        page.route("**/api/v1/access/stats", lambda route: route.fulfill(
            status=200, content_type="application/json",
            body=json.dumps({
                "doors_online": 0, "doors_offline": 0, "doors_alarm": 0,
                "doors_total": 0, "events_today": 0, "granted_today": 0,
                "denied_today": 0, "recent_events": [],
            }),
        ))

    def test_two_step_company_selection(self, page):
        """Full two-step login: credentials -> company list -> dashboard."""
        self._mock_login_flow(page)

        login = LoginPage(page)
        login.navigate()
        login.fill_email("multi@test.com")
        login.fill_password("password123")
        login.submit()

        # Company list should appear
        login.expect_company_list_visible("Alpha Co", "Beta Co")

        # Select Beta Co
        login.select_company(MOCK_COMPANY_B)

        # Should land on dashboard
        login.expect_redirected_away()

        # Verify token stored
        token = page.evaluate("() => localStorage.getItem('dm3-token')")
        assert token == "access-token"
