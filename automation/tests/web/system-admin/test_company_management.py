"""
Web Tests: Company Management (list, detail, create)
Uses data-driven approach with WebTestExecutor
"""
import json
import pytest
from pathlib import Path
from automation.common.web_executor import WebTestExecutor


DATA_FILE = Path(__file__).parent.parent.parent.parent / "data" / "web" / "system-admin" / "test_company_management.data.json"


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


def test_company_list_page(executor, test_data):
    executor.run(test_data["test_company_list_page"])


def test_company_search(executor, test_data):
    executor.run(test_data["test_company_search"])


def test_company_navigate_to_detail(executor, test_data):
    executor.run(test_data["test_company_navigate_to_detail"])


def test_company_detail_edit_mode(executor, test_data):
    executor.run(test_data["test_company_detail_edit_mode"])


def test_create_company_page(executor, test_data):
    executor.run(test_data["test_create_company_page"])
