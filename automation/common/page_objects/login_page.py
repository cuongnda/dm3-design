"""
Login page object — covers the two-step DM3 login flow.
"""
from __future__ import annotations

from playwright.sync_api import expect

from .base_page import BasePage


class LoginPage(BasePage):
    """Selectors and actions for /login."""

    PATH = "/login"

    # ── Locators ──────────────────────────────────────────────

    @property
    def email_input(self):
        return self.page.locator('input[type="email"]')

    @property
    def password_input(self):
        return self.page.locator('input[type="password"]')

    @property
    def submit_button(self):
        return self.page.locator('[data-testid="login-button-submit"]')

    @property
    def sign_in_button(self):
        return self.page.locator('button:has-text("Sign In")')

    @property
    def sso_button(self):
        return self.page.get_by_text("Sign in with SSO")

    @property
    def forgot_password_link(self):
        return self.page.get_by_text("Forgot password?")

    @property
    def brand_title(self):
        return self.page.get_by_text("DUALL MASTER 3.0")

    # ── Actions ───────────────────────────────────────────────

    def navigate(self) -> None:
        self.goto(self.PATH)

    def fill_email(self, email: str) -> None:
        self.email_input.fill(email)

    def fill_password(self, password: str) -> None:
        self.password_input.fill(password)

    def submit(self) -> None:
        self.submit_button.click()

    def login(self, email: str, password: str) -> None:
        self.navigate()
        self.fill_email(email)
        self.fill_password(password)
        self.submit()

    def select_company(self, company_id: str) -> None:
        self.page.locator(f'[data-testid="login-button-company-{company_id}"]').click()

    # ── Assertions ────────────────────────────────────────────

    def expect_form_visible(self) -> None:
        expect(self.brand_title).to_be_visible()
        expect(self.email_input).to_be_visible()
        expect(self.password_input).to_be_visible()
        expect(self.sign_in_button).to_be_visible()

    def expect_email_prefilled(self, email: str) -> None:
        expect(self.email_input).to_have_value(email)

    def expect_company_list_visible(self, *company_names: str) -> None:
        for name in company_names:
            expect(self.page.get_by_text(name)).to_be_visible()

    def expect_error_message(self, message: str) -> None:
        expect(self.page.get_by_text(message)).to_be_visible(timeout=10_000)

    def expect_redirected_away(self) -> None:
        expect(self.page).not_to_have_url(f"**{self.PATH}**")
        self.expect_main_visible()

    def expect_password_type(self, expected_type: str) -> None:
        expect(self.password_input).to_have_attribute("type", expected_type)

    def toggle_password_visibility(self) -> None:
        toggle = self.page.locator(
            'input[type="password"] + button, '
            'input[type="password"] ~ button, '
            'input[type="text"] + button, '
            'input[type="text"] ~ button'
        ).first
        toggle.click()
