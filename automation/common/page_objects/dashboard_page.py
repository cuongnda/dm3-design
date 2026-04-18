"""
Dashboard page object — the landing page after login.
"""
from __future__ import annotations

from playwright.sync_api import expect

from .base_page import BasePage


class DashboardPage(BasePage):
    """Selectors and assertions for the main dashboard (/)."""

    PATH = "/"

    # ── Locators ──────────────────────────────────────────────

    @property
    def sidebar(self):
        return self.page.locator("nav, [class*='sidebar'], aside").first

    @property
    def topbar(self):
        return self.page.locator("header, [class*='topbar']").first

    @property
    def main_content(self):
        return self.page.locator("main")

    # ── Actions ───────────────────────────────────────────────

    def navigate(self) -> None:
        self.goto(self.PATH)

    def open_command_palette(self) -> None:
        self.page.keyboard.press("Meta+k")

    def close_command_palette(self) -> None:
        self.page.keyboard.press("Escape")

    def search_command(self, query: str) -> None:
        self.open_command_palette()
        search_input = self.page.locator('input[placeholder*="Search"]')
        expect(search_input).to_be_visible(timeout=5_000)
        search_input.fill(query)

    def select_command_item(self, text: str) -> None:
        self.page.locator(f'[cmdk-item]:has-text("{text}")').click()

    # ── Assertions ────────────────────────────────────────────

    def expect_loaded(self) -> None:
        self.expect_url_not_contains("/login")
        expect(self.main_content).to_be_visible()

    def expect_sidebar_visible(self) -> None:
        expect(self.sidebar).to_be_visible()

    def expect_topbar_visible(self) -> None:
        expect(self.topbar).to_be_visible()

    def expect_command_palette_visible(self) -> None:
        expect(
            self.page.locator("[cmdk-dialog], [role='dialog']").first
        ).to_be_visible(timeout=5_000)

    def expect_command_palette_hidden(self) -> None:
        expect(
            self.page.locator("[cmdk-dialog], [role='dialog']")
        ).not_to_be_visible()

    def expect_command_results(self, *texts: str) -> None:
        for text in texts:
            expect(self.page.get_by_text(text)).to_be_visible()
