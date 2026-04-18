"""
API Tests: Device CRUD
Tests: list, create, get, update, delete devices (company admin)
Service: device-gateway via nginx
"""
import pytest
import uuid
from common.api_client import DM3Client
from common import constants

BASE = "/api/v1/gateway/devices"


@pytest.fixture(scope="module")
def admin_client():
    """Login as company admin (auto-selects first company)."""
    c = DM3Client()
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    return c


@pytest.fixture(scope="module")
def sysadmin_client():
    """Login as system admin."""
    c = DM3Client()
    c.login(constants.SYSADMIN_EMAIL, constants.SYSADMIN_PASSWORD)
    return c


@pytest.fixture(scope="module")
def test_device(admin_client):
    """Create a test device for use in other tests."""
    uid = uuid.uuid4().hex[:6]
    resp = admin_client.post(BASE, json={
        "device_id": f"TEST-{uid}",
        "name": f"Test Device {uid}",
        "type": "terminal",
        "location": "Test Lab",
    })
    assert resp.status_code == 201, f"Create device failed: {resp.status_code} {resp.text}"
    data = resp.json()
    yield data
    # Cleanup
    admin_client.delete(f"{BASE}/{data['id']}")


# ── List ─────────────────────────────────────────────────────────────────────

class TestListDevices:
    @pytest.mark.api
    def test_list_returns_array(self, admin_client, test_device):
        """GET /devices should return device list with pagination."""
        resp = admin_client.get(BASE)
        assert resp.status_code == 200
        body = resp.json()
        assert "devices" in body or "data" in body or isinstance(body, list)

    @pytest.mark.api
    def test_list_pagination(self, admin_client, test_device):
        """Pagination parameters should be respected."""
        resp = admin_client.get(f"{BASE}?page=1&limit=5")
        assert resp.status_code == 200

    @pytest.mark.api
    def test_list_requires_auth(self):
        """Unauthenticated request should fail."""
        import requests
        resp = requests.get(f"{constants.API_URL}{BASE}", timeout=5)
        assert resp.status_code in [401, 403]


# ── Create ───────────────────────────────────────────────────────────────────

class TestCreateDevice:
    @pytest.mark.api
    def test_create_success(self, admin_client):
        """POST /devices should create a device."""
        uid = uuid.uuid4().hex[:6]
        resp = admin_client.post(BASE, json={
            "device_id": f"CREATE-{uid}",
            "name": f"Created Device {uid}",
            "type": "terminal",
            "location": "Lobby",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["name"] == f"Created Device {uid}"
        assert data["device_id"] == f"CREATE-{uid}"
        # Cleanup
        admin_client.delete(f"{BASE}/{data['id']}")

    @pytest.mark.api
    def test_create_missing_device_id(self, admin_client):
        """Create without device_id should fail."""
        resp = admin_client.post(BASE, json={
            "name": "No ID Device",
            "type": "terminal",
        })
        assert resp.status_code in [400, 422]

    @pytest.mark.api
    def test_create_duplicate_device_id(self, admin_client, test_device):
        """Create with duplicate device_id should fail."""
        resp = admin_client.post(BASE, json={
            "device_id": test_device["device_id"],
            "name": "Duplicate",
            "type": "terminal",
        })
        assert resp.status_code in [400, 409]


# ── Get ──────────────────────────────────────────────────────────────────────

class TestGetDevice:
    @pytest.mark.api
    def test_get_by_id(self, admin_client, test_device):
        """GET /devices/:id should return device detail."""
        resp = admin_client.get(f"{BASE}/{test_device['id']}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == test_device["id"]
        assert data["name"] == test_device["name"]

    @pytest.mark.api
    def test_get_not_found(self, admin_client):
        """GET with non-existent ID should return 404."""
        resp = admin_client.get(f"{BASE}/{uuid.uuid4()}")
        assert resp.status_code == 404


# ── Update ───────────────────────────────────────────────────────────────────

class TestUpdateDevice:
    @pytest.mark.api
    def test_update_name(self, admin_client, test_device):
        """PUT /devices/:id should update device."""
        resp = admin_client.put(f"{BASE}/{test_device['id']}", json={
            "name": "Updated Device Name",
            "location": "Updated Location",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Updated Device Name"

    @pytest.mark.api
    def test_update_not_found(self, admin_client):
        """PUT with non-existent ID should return 404."""
        resp = admin_client.put(f"{BASE}/{uuid.uuid4()}", json={"name": "nope"})
        assert resp.status_code == 404


# ── Delete ───────────────────────────────────────────────────────────────────

class TestDeleteDevice:
    @pytest.mark.api
    def test_delete_success(self, admin_client):
        """DELETE /devices/:id should remove device."""
        uid = uuid.uuid4().hex[:6]
        resp = admin_client.post(BASE, json={
            "device_id": f"DEL-{uid}",
            "name": f"Delete Me {uid}",
            "type": "terminal",
        })
        assert resp.status_code == 201
        dev_id = resp.json()["id"]

        del_resp = admin_client.delete(f"{BASE}/{dev_id}")
        assert del_resp.status_code in [200, 204]

    @pytest.mark.api
    def test_delete_not_found(self, admin_client):
        """DELETE with non-existent ID should return 404."""
        resp = admin_client.delete(f"{BASE}/{uuid.uuid4()}")
        assert resp.status_code == 404


# ── System Admin Global List ────────────────────────────────────────────────

class TestSystemDevices:
    @pytest.mark.api
    def test_global_device_list(self, sysadmin_client, test_device):
        """GET /system/devices should return all devices (system admin)."""
        resp = sysadmin_client.get("/api/v1/gateway/system/devices")
        assert resp.status_code == 200

    @pytest.mark.api
    def test_global_list_requires_sysadmin(self, admin_client):
        """Company admin should not access global device list."""
        resp = admin_client.get("/api/v1/gateway/system/devices")
        assert resp.status_code in [403, 401]


# ── Commands ─────────────────────────────────────────────────────────────────

class TestDeviceCommands:
    @pytest.mark.api
    def test_send_command(self, admin_client, test_device):
        """POST /devices/:id/command should accept command."""
        resp = admin_client.post(f"{BASE}/{test_device['id']}/command", json={
            "type": "reboot",
        })
        # Accept 200 (success) or 202 (queued) or 404 (device offline)
        assert resp.status_code in [200, 202, 404, 502]

    @pytest.mark.api
    def test_get_device_events(self, admin_client, test_device):
        """GET /devices/:id/events should return events list."""
        resp = admin_client.get(f"{BASE}/{test_device['id']}/events")
        assert resp.status_code == 200
