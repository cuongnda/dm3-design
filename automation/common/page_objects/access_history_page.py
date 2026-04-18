"""
Access History page object.
Selectors and typed interactions for /secure/access-history.
All selectors use data-testid attributes only.
"""
from __future__ import annotations

import json

from playwright.sync_api import Page, expect

from .base_page import BasePage


class AccessHistoryPage(BasePage):
    """Typed page object for the Access History page at /secure/access-history."""

    PATH = "/secure/access-history"

    # ── Locators ──────────────────────────────────────────────

    @property
    def filter_access_point(self):
        return self.by_testid("access-history-select-access-point")

    @property
    def filter_user(self):
        return self.by_testid("access-history-select-user")

    @property
    def filter_decision(self):
        return self.by_testid("access-history-select-decision")

    @property
    def filter_credential_type(self):
        return self.by_testid("access-history-select-credential-type")

    @property
    def export_csv_button(self):
        return self.by_testid("access-history-button-export-csv")

    @property
    def export_xlsx_button(self):
        return self.by_testid("access-history-button-export-xlsx")

    @property
    def clear_button(self):
        return self.by_testid("access-history-button-clear")

    @property
    def events_table(self):
        return self.by_testid("access-history-table-events")

    @property
    def empty_state(self):
        return self.by_testid("access-history-empty")

    @property
    def sidebar_link(self):
        return self.by_testid("sys-link-access-history")

    # ── Navigation ────────────────────────────────────────────

    def open(self) -> None:
        """Navigate to the Access History page and wait for load."""
        self.goto(self.PATH)

    # ── Filter interactions ───────────────────────────────────

    def select_access_point(self, name: str) -> None:
        """Select an access point by its visible name in the dropdown."""
        self.filter_access_point.click()
        # Option items rendered inside the select dropdown
        self.page.get_by_role("option", name=name).click()

    def select_user(self, name: str) -> None:
        """Select a user by their visible name in the dropdown."""
        self.filter_user.click()
        self.page.get_by_role("option", name=name).click()

    def _select_from_custom_select(self, testid: str, option_label: str) -> None:
        """Select an option in the custom @dm3/ui <Select> component.

        The component renders a <div data-testid="..."> wrapping a trigger
        <button> and a portaled panel of option <button>s. Options are plain
        buttons (no role="option", no testid) whose accessible name is their
        visible label. Open the panel by clicking the trigger, then click
        the option button by exact name.
        """
        container = self.by_testid(testid)
        container.locator("button").first.click()
        # Option buttons live in a React portal (not inside container).
        self.page.get_by_role("button", name=option_label, exact=True).click()

    # Decision option labels — keep in sync with
    # apps/console/src/i18n/locales/en/secure.json accessHistory.filters.*
    _DECISION_LABELS = {
        "": "All decisions",
        "granted": "Granted",
        "denied": "Denied",
    }

    def select_decision(self, value: str) -> None:
        """Select a decision value. ``value`` is the backing value
        ('granted'/'denied'/''); internally mapped to the visible label.
        """
        label = self._DECISION_LABELS.get(value, value.capitalize())
        self._select_from_custom_select("access-history-select-decision", label)

    def select_credential_type(self, value: str) -> None:
        """Select a credential type by value (e.g. 'card', 'pin', 'face').
        Credential-type labels are the raw value, so pass the value as label.
        """
        self._select_from_custom_select("access-history-select-credential-type", value)

    def set_date_range(self, from_date: str, to_date: str) -> None:
        """
        Set the date range filter.
        Accepts date strings in a format the date picker understands (e.g. 'YYYY-MM-DD').
        Implementation depends on the date range component — tries testid-based inputs first.
        """
        from_input = self.page.locator('[data-testid*="date-from"], [data-testid*="from-date"]').first
        to_input = self.page.locator('[data-testid*="date-to"], [data-testid*="to-date"]').first
        if from_input.count() > 0:
            from_input.fill(from_date)
        if to_input.count() > 0:
            to_input.fill(to_date)

    def click_export_csv(self) -> None:
        """Click the CSV export button."""
        self.export_csv_button.click()

    def click_export_xlsx(self) -> None:
        """Click the XLSX export button."""
        self.export_xlsx_button.click()

    def click_clear_filters(self) -> None:
        """Click the Clear filters button.

        Avoid networkidle — the app runs a WS reconnect loop that never settles.
        """
        self.clear_button.click()
        self.page.wait_for_timeout(300)

    # ── Assertions / Queries ──────────────────────────────────

    def rows(self):
        """Return a Locator for all visible event rows in the table."""
        return self.by_testid_like("access-history-row-")

    def is_loading(self) -> bool:
        """Return True if a loading indicator is currently visible."""
        spinner = self.page.locator('[data-testid*="loading"], [aria-label*="loading"]')
        return spinner.count() > 0 and spinner.first.is_visible()

    def expect_table_or_empty_state_visible(self, timeout: int = 15_000) -> None:
        """Assert that either the events table or the empty state is visible."""
        table_visible = self.events_table.is_visible() if self.events_table.count() > 0 else False
        empty_visible = self.empty_state.is_visible() if self.empty_state.count() > 0 else False
        assert table_visible or empty_visible, (
            "Neither access-history-table-events nor access-history-empty is visible"
        )

    # ── API Mocking ───────────────────────────────────────────

    def mock_events(self, events: list[dict], total: int | None = None) -> None:
        """Route API calls for events list to return controlled data."""
        actual_total = total if total is not None else len(events)

        def handler(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "data": events,
                    "total": actual_total,
                    "page": 1,
                    "limit": 20,
                }),
            )

        self.page.route("**/api/v1/access/events*", handler)

    def mock_empty(self) -> None:
        """Mock the events API to return an empty list."""
        self.mock_events([], total=0)

    def mock_export(self, content: str = "id,time,decision\n", content_type: str = "text/csv") -> None:
        """Mock the export endpoint."""
        def handler(route):
            route.fulfill(
                status=200,
                content_type=content_type,
                headers={"Content-Disposition": 'attachment; filename="events.csv"'},
                body=content,
            )
        self.page.route("**/api/v1/access/events/export*", handler)
