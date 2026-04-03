"""
DM3 Web Test Executor — data-driven test runner for Playwright.
Reads JSON test data and executes steps using data-testid selectors.
Captures before/after screenshots and generates execution report JSON.
"""
import json
import os
import time
from datetime import datetime
from typing import Dict, Any, List
from pathlib import Path
from playwright.sync_api import Page

from . import constants

PROJECT_ROOT = Path(__file__).parent.parent


class WebTestExecutor:
    """Execute data-driven web test cases with screenshot capture."""

    def __init__(self, page: Page = None, headless: bool = True):
        self.base_url = constants.WEB_URL
        self._owns_browser = page is None
        self._step_results: List[Dict] = []
        self._current_case_id: str = ""
        self._execution_start: float = 0

        if page is not None:
            self.page = page
            self._playwright = None
            self._browser = None
        else:
            from playwright.sync_api import sync_playwright
            self._playwright = sync_playwright().start()
            self._browser = self._playwright.chromium.launch(
                headless=headless,
                args=['--no-sandbox', '--disable-dev-shm-usage'] if headless else None,
            )
            context = self._browser.new_context(viewport={"width": 1920, "height": 1080})
            self.page = context.new_page()
            self.page.set_default_timeout(constants.TIMEOUT_PAGE)

    def close(self):
        """Close browser resources if self-managed."""
        if self._owns_browser:
            if self._browser:
                self._browser.close()
            if self._playwright:
                self._playwright.stop()

    def login(self, email: str, password: str):
        """Public login helper."""
        self._login(email, password)

    def run(self, test_case, case_id: str = ""):
        """Alias for execute_test_case."""
        self.execute_test_case(test_case, case_id=case_id)

    # ── Screenshot & Execution Report ──────────────────────────

    def _take_screenshot(self, label: str) -> str:
        """Take a screenshot and return the path."""
        if not self._current_case_id:
            return ""
        screenshot_dir = PROJECT_ROOT / "export" / "screenshots" / "steps" / self._current_case_id
        screenshot_dir.mkdir(parents=True, exist_ok=True)
        path = screenshot_dir / f"{label}.png"
        try:
            self.page.screenshot(path=str(path), full_page=False)
        except Exception:
            return ""
        return str(path)

    def _save_execution_report(self, test_case: Dict[str, Any]):
        """Save step-by-step execution report as JSON."""
        report_dir = PROJECT_ROOT / "export" / "execution_reports"
        report_dir.mkdir(parents=True, exist_ok=True)

        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        total_duration = time.time() - self._execution_start
        completed = sum(1 for s in self._step_results if s["status"] == "completed")
        failed = sum(1 for s in self._step_results if s["status"] == "failed")

        desc = test_case.get("description", "")
        if isinstance(desc, dict):
            title = desc.get("title", "")
        else:
            title = str(desc)

        report = {
            "test_case_id": self._current_case_id,
            "test_case_description": {
                "case_id": self._current_case_id,
                "title": title,
            },
            "execution_timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "total_steps": len(self._step_results),
            "steps_completed": completed,
            "steps_failed": failed,
            "total_duration": round(total_duration, 2),
            "steps": self._step_results,
            "test_data_final": {},
            "validation_failure_details": [],
        }

        path = report_dir / f"execution_steps_{self._current_case_id}_{ts}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(report, f, indent=2, ensure_ascii=False)
        return str(path)

    # ── Test Case Execution ────────────────────────────────────

    def execute_test_case(self, test_case: Dict[str, Any], case_id: str = ""):
        """Execute a full test case with screenshot capture."""
        self._current_case_id = case_id or test_case.get("case_id", test_case.get("description", "unknown"))
        if isinstance(self._current_case_id, dict):
            self._current_case_id = self._current_case_id.get("case_id", "unknown")
        # Sanitize for filename safety
        self._current_case_id = self._current_case_id.replace(" ", "_").replace("/", "_")[:80]
        self._step_results = []
        self._execution_start = time.time()
        counter = 0

        all_steps = []
        for step in test_case.get("setup", []):
            all_steps.append(("setup", step))
        for step in test_case.get("steps", []):
            phase = "verification" if step.get("action", "").startswith("assert_") else "execute"
            all_steps.append((phase, step))
        for check in test_case.get("verification", []):
            all_steps.append(("verification", check))

        for phase, step in all_steps:
            counter += 1
            action = step.get("action", "unknown")
            step_start = time.time()

            # Screenshot before
            screenshot_before = self._take_screenshot(f"step_{counter:03d}_before")

            # Execute
            error_msg = None
            try:
                if phase == "verification" and not action.startswith("assert_"):
                    self._execute_verification(step)
                else:
                    self._execute_step(step)
                status = "completed"
            except Exception as e:
                status = "failed"
                error_msg = str(e)

            # Screenshot after
            screenshot_after = self._take_screenshot(f"step_{counter:03d}_after")

            self._step_results.append({
                "counter": counter,
                "action": action,
                "phase": phase,
                "status": status,
                "duration": round(time.time() - step_start, 2),
                "screenshot_before": screenshot_before,
                "screenshot_after": screenshot_after,
                "params": {k: v for k, v in step.items() if k != "action"},
                "data_captured": {},
                "error": error_msg,
            })

            if status == "failed":
                break

        # Save execution report JSON
        self._save_execution_report(test_case)

        # Re-raise the last failure so pytest marks it as FAILED
        failed = [s for s in self._step_results if s["status"] == "failed"]
        if failed:
            raise AssertionError(failed[-1]["error"])

    # ── Step Execution ─────────────────────────────────────────

    def _resolve_data(self, step: Dict[str, Any]) -> Dict[str, Any]:
        """Extract data dict from step — supports both nested and flat formats."""
        if "data" in step:
            return step["data"]
        return {k: v for k, v in step.items() if k != "action"}

    def _execute_step(self, step: Dict[str, Any]):
        """Execute a single test step."""
        action = step["action"]

        # Route assert_* actions to verification
        if action.startswith("assert_"):
            verification_action = action[len("assert_"):]
            self._execute_verification({"action": verification_action, "data": self._resolve_data(step)})
            return

        data = self._resolve_data(step)

        if action in ("goto", "navigate"):
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

        elif action in ("select", "select_option"):
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

        elif action == "enabled":
            testid = data.get("testid")
            if testid:
                assert self.page.locator(f'[data-testid="{testid}"]').is_enabled(), \
                    f"Element [data-testid=\"{testid}\"] is not enabled"

        elif action == "disabled":
            testid = data.get("testid")
            if testid:
                assert not self.page.locator(f'[data-testid="{testid}"]').is_enabled(), \
                    f"Element [data-testid=\"{testid}\"] should be disabled"

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


import pytest
