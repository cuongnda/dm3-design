"""
Department management page object.
Ported from tests/helpers/page-objects.ts DepartmentManagementPage.
"""
from __future__ import annotations

import json

from playwright.sync_api import expect

from .base_page import BasePage


class DepartmentPage(BasePage):
    """Selectors and actions for /manage/departments."""

    PATH = "/manage/departments"

    # ── Page-level locators ───────────────────────────────────

    @property
    def page_title(self):
        return self.page.locator('h1:has-text("Department Management")')

    @property
    def create_button(self):
        return self.page.locator('button:has-text("Create Department")')

    @property
    def import_export_button(self):
        return self.page.locator('button:has-text("Import/Export")')

    @property
    def search_input(self):
        return self.by_testid("search-filters-search-input")

    @property
    def advanced_filters_toggle(self):
        return self.by_testid("search-filters-advanced-toggle")

    @property
    def stats_grid(self):
        return self.by_testid("stats-grid")

    @property
    def view_mode_toggle(self):
        return self.by_testid("view-mode-toggle")

    # View mode buttons
    @property
    def grid_view_button(self):
        return self.by_testid("view-mode-toggle-grid")

    @property
    def table_view_button(self):
        return self.by_testid("view-mode-toggle-table")

    @property
    def tree_view_button(self):
        return self.by_testid("view-mode-toggle-tree")

    # Data containers
    @property
    def department_cards(self):
        return self.by_testid_like("department-card")

    @property
    def data_table(self):
        return self.by_testid("data-table")

    @property
    def bulk_action_bar(self):
        return self.by_testid("bulk-action-bar")

    @property
    def pagination(self):
        return self.by_testid("data-table-pagination")

    # Modal locators
    @property
    def modal(self):
        return self.page.locator('[role="dialog"]')

    @property
    def form_name(self):
        return self.by_testid("department-form-name")

    @property
    def form_number(self):
        return self.by_testid("department-form-number")

    @property
    def form_description(self):
        return self.by_testid("department-form-description")

    @property
    def form_submit(self):
        return self.by_testid("department-form-submit")

    # ── Navigation ────────────────────────────────────────────

    def navigate(self) -> None:
        self.goto(self.PATH)

    # ── Page assertions ───────────────────────────────────────

    def expect_loaded(self) -> None:
        expect(self.page_title).to_be_visible()
        expect(self.create_button).to_be_visible()
        expect(self.stats_grid).to_be_visible()

    # ── View mode ─────────────────────────────────────────────

    def switch_to_table_view(self) -> None:
        self.table_view_button.click()
        expect(self.table_view_button).to_have_attribute("aria-pressed", "true")
        expect(self.data_table).to_be_visible()

    def switch_to_grid_view(self) -> None:
        self.grid_view_button.click()
        expect(self.grid_view_button).to_have_attribute("aria-pressed", "true")

    # ── Search & filter ───────────────────────────────────────

    def search(self, query: str) -> None:
        self.search_input.fill(query)
        self.page.wait_for_timeout(500)  # debounce

    def open_advanced_filters(self) -> None:
        self.advanced_filters_toggle.click()

    def select_filter(self, key: str, value: str) -> None:
        self.by_testid(f"search-filters-filter-{key}").click()
        self.by_testid(f"search-filters-filter-{key}-{value}").click()

    def reset_filters(self) -> None:
        self.by_testid("search-filters-reset").click()

    # ── CRUD ──────────────────────────────────────────────────

    def open_create_modal(self) -> None:
        self.create_button.click()
        expect(self.modal).to_be_visible()

    def fill_department_form(
        self,
        name: str | None = None,
        number: str | None = None,
        description: str | None = None,
    ) -> None:
        if name is not None:
            self.form_name.fill(name)
        if number is not None:
            self.form_number.fill(number)
        if description is not None:
            self.form_description.fill(description)

    def submit_form(self) -> None:
        self.form_submit.click()

    def create_department(self, name: str, number: str, description: str = "") -> None:
        self.open_create_modal()
        self.fill_department_form(name=name, number=number, description=description)
        self.submit_form()
        expect(self.modal).not_to_be_visible()

    # ── Table selection ───────────────────────────────────────

    def select_row(self, index: int) -> None:
        self.by_testid(f"data-table-select-{index}").click()

    def select_all(self) -> None:
        self.by_testid("data-table-select-all").click()

    def clear_selection(self) -> None:
        self.by_testid("bulk-action-bar-clear").click()

    def expect_bulk_bar_visible(self, count: int) -> None:
        expect(self.bulk_action_bar).to_be_visible()
        expect(self.page.get_by_text(f"{count} items selected")).to_be_visible()

    def expect_bulk_bar_hidden(self) -> None:
        expect(self.bulk_action_bar).not_to_be_visible()

    # ── Import / Export ───────────────────────────────────────

    def open_import_export(self) -> None:
        self.import_export_button.click()
        expect(self.modal).to_be_visible()

    # ── API mocking ───────────────────────────────────────────

    def mock_departments(self, departments: list[dict], total: int | None = None) -> None:
        actual_total = total if total is not None else len(departments)

        def handler(route):
            route.fulfill(
                status=200,
                content_type="application/json",
                body=json.dumps({
                    "departments": departments[:20],
                    "pagination": {
                        "page": 1,
                        "limit": 20,
                        "total": actual_total,
                        "total_pages": max(1, -(-actual_total // 20)),
                    },
                }),
            )

        self.page.route("**/api/v1/departments*", handler)

    def mock_empty(self) -> None:
        self.mock_departments([], total=0)

    def mock_error(self, status: int = 500, message: str = "Server error") -> None:
        self.mock_api("**/api/v1/departments*", status, {"error": message})
