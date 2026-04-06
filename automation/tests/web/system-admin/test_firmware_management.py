"""
Web Tests: Firmware Management (System Admin)
Data-driven tests using WebTestExecutor.
"""
import json
import pytest
from pathlib import Path
from common.web_executor import WebTestExecutor

DATA_FILE = Path(__file__).parent.parent.parent.parent / "data" / "web" / "system-admin" / "test_firmware_management.data.json"


@pytest.fixture(scope="module")
def executor():
    """Create executor, login as sysadmin, yield, close."""
    exe = WebTestExecutor(headless=True)
    exe.login("sysadmin@duali.com", "sysadmin123")
    yield exe
    exe.close()


@pytest.fixture(scope="module")
def test_data():
    return json.loads(DATA_FILE.read_text())


@pytest.fixture(scope="module", autouse=True)
def seed_firmware(executor):
    """Upload a firmware via API so list page has data."""
    import requests
    from common import constants

    session = requests.Session()
    login_resp = session.post(
        f"{constants.API_URL}/api/v1/auth/login",
        json={"email": constants.SYSADMIN_EMAIL, "password": constants.SYSADMIN_PASSWORD},
    )
    if login_resp.status_code != 200:
        return
    token = login_resp.json().get("access_token")
    headers = {"Authorization": f"Bearer {token}"}

    import io, uuid
    uid = uuid.uuid4().hex[:6]
    files = {"file": (f"webtest_{uid}.bin", io.BytesIO(b"WEB_TEST_FW"), "application/octet-stream")}
    data = {"version": f"0.1.0-webtest-{uid}", "device_type": "dq_mini_plus", "description": "Web test seed"}
    session.post(f"{constants.API_URL}/api/v1/system/firmware", headers=headers, files=files, data=data)


def test_firmware_list_page(executor, test_data):
    executor.run(test_data["test_firmware_list_page"])


def test_firmware_search(executor, test_data):
    executor.run(test_data["test_firmware_search"])


def test_navigate_to_upload(executor, test_data):
    executor.run(test_data["test_navigate_to_upload"])


def test_upload_form_validation(executor, test_data):
    executor.run(test_data["test_upload_form_validation"])


def test_firmware_detail_page(executor, test_data):
    executor.run(test_data["test_firmware_detail_page"])
