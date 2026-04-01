"""
Web Tests: Account Management (list, detail, create)
Uses data-driven approach with WebTestExecutor
"""
import json
import pytest
from pathlib import Path
from automation.common.web_executor import WebTestExecutor


DATA_FILE = Path(__file__).parent.parent.parent.parent / "data" / "web" / "system-admin" / "test_account_management.data.json"


@pytest.fixture(scope="module")
def test_data():
    return json.loads(DATA_FILE.read_text())


@pytest.fixture(scope="module")
def executor(test_data):
    exe = WebTestExecutor(headless=True)
    # Login as sysadmin first
    exe.login("sysadmin@duali.com", "sysadmin123")
    yield exe
    exe.close()


def test_account_list_page(executor, test_data):
    """Test account list page loads and displays accounts."""
    executor.run(test_data["test_account_list_page"])


def test_account_search_functionality(executor, test_data):
    """Test search accounts by email/name."""
    executor.run(test_data["test_account_search"])


def test_account_filter_by_role(executor, test_data):
    """Test filter accounts by role dropdown."""
    executor.run(test_data["test_account_filter_role"])


def test_account_filter_by_status(executor, test_data):
    """Test filter accounts by status dropdown."""
    executor.run(test_data["test_account_filter_status"])


def test_navigate_to_create_account(executor, test_data):
    """Test navigation to create account page."""
    executor.run(test_data["test_navigate_to_create"])


def test_create_account_form_validation(executor, test_data):
    """Test create account form validation."""
    executor.run(test_data["test_create_form_validation"])


def test_create_account_success_flow(executor, test_data):
    """Test successful account creation flow."""
    executor.run(test_data["test_create_account_success"])


def test_create_system_admin_account(executor, test_data):
    """Test creating system admin (no company)."""
    executor.run(test_data["test_create_system_admin"])


def test_account_detail_page(executor, test_data):
    """Test account detail page display."""
    executor.run(test_data["test_account_detail_page"])


def test_account_edit_mode(executor, test_data):
    """Test editing account information."""
    executor.run(test_data["test_account_edit_mode"])


def test_account_reset_password(executor, test_data):
    """Test reset password functionality."""
    executor.run(test_data["test_reset_password"])


def test_account_status_toggle(executor, test_data):
    """Test activate/deactivate account."""
    executor.run(test_data["test_toggle_account_status"])


def test_pagination_functionality(executor, test_data):
    """Test pagination controls."""
    executor.run(test_data["test_pagination"])