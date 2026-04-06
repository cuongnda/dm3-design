"""
Web Tests: Device Management (System Admin)
Data-driven tests using WebTestExecutor.
"""
import json
import pytest
from pathlib import Path
from common.web_executor import WebTestExecutor

DATA_FILE = Path(__file__).parent.parent.parent.parent / "data" / "web" / "system-admin" / "test_device_management.data.json"


@pytest.fixture(scope="module")
def executor():
    exe = WebTestExecutor(headless=True)
    exe.login("sysadmin@duali.com", "sysadmin123")
    yield exe
    exe.close()


@pytest.fixture(scope="module")
def test_data():
    return json.loads(DATA_FILE.read_text())


def test_system_devices_page(executor, test_data):
    executor.run(test_data["test_system_devices_page"])


def test_pending_devices_page(executor, test_data):
    executor.run(test_data["test_pending_devices_page"])
