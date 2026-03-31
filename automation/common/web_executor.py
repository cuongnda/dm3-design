"""
DM3 Web Test Executor — data-driven test runner for Playwright.
Reads JSON test data and executes steps using data-testid selectors.
"""
import json
import time
from typing import Dict, Any, List
from pathlib import Path
from playwright.sync_api import Page

from . import constants


class WebTestExecutor:
    """Execute data-driven web test cases."""

    def __init__(self, page: Page):
        self.page = page
        self.base_url = constants.WEB_URL

    def execute_test_case(self, test_case: Dict[str, Any]):
        """Execute a full test case: steps + verification."""
        # Setup
        for step in test_case.get("setup", []):
            self._execute_step(step)

        # Main steps
        for step in test_case.get("steps", []):
            self._execute_step(step)

        # Verification
        for check in test_case.get("verification", []):
            self._execute_verification(check)

    def _execute_step(self, step: Dict[str, Any]):
        """Execute a single test step."""
        action = step["action"]
        data = step.get("data", {})

        if action == "goto":
            url = data.get("url", "/")
            self.page.goto(f"{self.base_url}{url}")

        elif action == "fill":
            testid = data.get("testid")
            value = data.get("value", "")
            if testid:
                self.page.locator(f'[data-testid="{testid}"]').fill(value)

        elif action == "click":
            testid = data.get("testid")
            text = data.get("text")
            if testid:
                self.page.locator(f'[data-testid="{testid}"]').click()
            elif text:
                self.page.get_by_text(text, exact=False).first.click()

        elif action == "select":
            testid = data.get("testid")
            value = data.get("value")
            if testid and value:
                self.page.locator(f'[data-testid="{testid}"]').select_option(value)

        elif action == "wait":
            ms = data.get("ms", 1000)
            time.sleep(ms / 1000)

        elif action == "wait_url":
            url = data.get("url")
            if url:
                self.page.wait_for_url(f"**{url}*", timeout=10000)

        elif action == "login_sysadmin":
            self._login(constants.SYSADMIN_EMAIL, constants.SYSADMIN_PASSWORD)

        elif action == "login_admin":
            self._login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)

        elif action == "press":
            key = data.get("key", "Enter")
            self.page.keyboard.press(key)

        elif action == "screenshot":
            name = data.get("name", "screenshot")
            self.page.screenshot(path=f"export/{name}.png")

        else:
            raise ValueError(f"Unknown action: {action}")

    def _execute_verification(self, check: Dict[str, Any]):
        """Execute a verification step."""
        action = check["action"]
        data = check.get("data", {})

        if action == "visible":
            testid = data.get("testid")
            text = data.get("text")
            if testid:
                assert self.page.locator(f'[data-testid="{testid}"]').is_visible(), \
                    f"Element [data-testid=\"{testid}\"] not visible"
            elif text:
                assert self.page.get_by_text(text, exact=False).first.is_visible(), \
                    f"Text '{text}' not visible"

        elif action == "not_visible":
            testid = data.get("testid")
            text = data.get("text")
            if testid:
                assert not self.page.locator(f'[data-testid="{testid}"]').is_visible(), \
                    f"Element [data-testid=\"{testid}\"] should not be visible"
            elif text:
                assert not self.page.get_by_text(text, exact=False).first.is_visible(), \
                    f"Text '{text}' should not be visible"

        elif action == "url_contains":
            url = data.get("url", "")
            current = self.page.url
            assert url in current, f"URL '{current}' does not contain '{url}'"

        elif action == "value_equals":
            testid = data.get("testid")
            expected = data.get("value")
            if testid:
                actual = self.page.locator(f'[data-testid="{testid}"]').input_value()
                assert actual == expected, f"Value '{actual}' != '{expected}'"

        elif action == "count":
            testid = data.get("testid")
            expected = data.get("count", 0)
            actual = self.page.locator(f'[data-testid="{testid}"]').count()
            assert actual >= expected, f"Count {actual} < {expected}"

        elif action == "text_contains":
            testid = data.get("testid")
            expected = data.get("text")
            if testid:
                actual = self.page.locator(f'[data-testid="{testid}"]').text_content()
                assert expected in (actual or ""), f"Text '{actual}' doesn't contain '{expected}'"

        else:
            raise ValueError(f"Unknown verification: {action}")

    def _login(self, email: str, password: str):
        """Helper: login via UI."""
        self.page.goto(f"{self.base_url}/login")
        self.page.locator('[data-testid="login-input-email"]').fill(email)
        self.page.locator('[data-testid="login-input-password"]').fill(password)
        self.page.locator('[data-testid="login-button-submit"]').click()
        self.page.wait_for_timeout(2000)


def load_test_data(file_path: str) -> List[Dict]:
    """Load and return test cases from JSON file with IDs for parametrize."""
    path = Path(__file__).parent.parent / file_path
    with open(path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    return data


def load_test_data_with_ids(file_path: str):
    """Load test data and return as pytest parametrize args."""
    data = load_test_data(file_path)
    return [
        pytest.param(tc, id=tc.get("case_id", f"case_{i}"))
        for i, tc in enumerate(data)
    ]


# Need pytest for param
import pytest
