"""
Base page object — shared helpers for all page objects.
All selectors use data-testid for stability.
"""
from __future__ import annotations

from playwright.sync_api import Page, expect


class BasePage:
    """Common navigation, wait, and assertion helpers."""

    def __init__(self, page: Page) -> None:
        self.page = page

    # ── Navigation ────────────────────────────────────────────

    def goto(self, path: str) -> None:
        self.page.goto(path)
        self.page.wait_for_load_state("networkidle")

    def reload(self) -> None:
        self.page.reload()
        self.page.wait_for_load_state("networkidle")

    # ── Selectors ─────────────────────────────────────────────

    def by_testid(self, testid: str):
        return self.page.locator(f'[data-testid="{testid}"]')

    def by_testid_like(self, partial: str):
        return self.page.locator(f'[data-testid*="{partial}"]')

    def by_role(self, role: str, **kwargs):
        return self.page.get_by_role(role, **kwargs)

    def by_text(self, text: str):
        return self.page.get_by_text(text)

    # ── Waits & Assertions ────────────────────────────────────

    def expect_visible(self, testid: str, timeout: int = 10_000) -> None:
        expect(self.by_testid(testid)).to_be_visible(timeout=timeout)

    def expect_not_visible(self, testid: str, timeout: int = 5_000) -> None:
        expect(self.by_testid(testid)).not_to_be_visible(timeout=timeout)

    def expect_url_contains(self, fragment: str) -> None:
        expect(self.page).to_have_url(f"**{fragment}**")

    def expect_url_not_contains(self, fragment: str) -> None:
        expect(self.page).not_to_have_url(f"**{fragment}**")

    def expect_main_visible(self) -> None:
        expect(self.page.locator("main")).to_be_visible(timeout=10_000)

    # ── Interactions ──────────────────────────────────────────

    def fill(self, testid: str, value: str) -> None:
        self.by_testid(testid).fill(value)

    def click(self, testid: str) -> None:
        self.by_testid(testid).click()

    def click_text(self, text: str) -> None:
        self.page.get_by_text(text).click()

    # ── Route mocking ─────────────────────────────────────────

    def mock_api(self, url_pattern: str, status: int, body: dict) -> None:
        """Mock an API endpoint with a JSON response."""
        import json

        def handler(route):
            route.fulfill(
                status=status,
                content_type="application/json",
                body=json.dumps(body),
            )

        self.page.route(url_pattern, handler)

    # ── Screenshots ───────────────────────────────────────────

    def screenshot(self, path: str, full_page: bool = True) -> None:
        self.page.screenshot(path=path, full_page=full_page)
