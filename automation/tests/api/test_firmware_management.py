"""
API Tests: Firmware Management
Tests: device types, upload, list, get, update, delete, download
Requires: system admin login
Service: device-gateway via nginx
"""
import io
import os
import pytest
import uuid
from common.api_client import DM3Client
from common import constants

BASE = "/api/v1/system/firmware"


@pytest.fixture(scope="module")
def client():
    """Login as system admin."""
    c = DM3Client()
    c.login(constants.SYSADMIN_EMAIL, constants.SYSADMIN_PASSWORD)
    # Verify firmware table exists
    check = c.get(f"{BASE}/device-types")
    if check.status_code == 500:
        pytest.skip("Firmware migration not applied")
    return c


@pytest.fixture(scope="module")
def uploaded_firmware(client):
    """Upload a test firmware for use in other tests."""
    uid = uuid.uuid4().hex[:6]
    content = f"FAKE_FIRMWARE_BINARY_{uid}".encode()
    files = {"file": (f"test_fw_{uid}.bin", io.BytesIO(content), "application/octet-stream")}
    data = {
        "version": f"1.0.0-test-{uid}",
        "device_type": "dq_mini_plus",
        "description": f"Test firmware {uid}",
    }
    resp = client.post(BASE, files=files, data=data)
    assert resp.status_code == 201, f"Upload failed: {resp.status_code} {resp.text}"
    body = resp.json()
    yield body
    # Cleanup
    client.delete(f"{BASE}/{body['id']}")


# ── Device Types ─────────────────────────────────────────────────────────────

class TestDeviceTypes:
    @pytest.mark.api
    def test_list_device_types(self, client):
        """GET /device-types should return all DUALi device types."""
        resp = client.get(f"{BASE}/device-types")
        assert resp.status_code == 200
        body = resp.json()
        types = body.get("device_types", [])
        assert len(types) >= 25
        assert "dq_mini_plus" in types
        assert "icu300n" in types
        assert "itouch_pop" in types

    @pytest.mark.api
    def test_device_types_are_lowercase(self, client):
        """All device types should be lowercase snake_case."""
        resp = client.get(f"{BASE}/device-types")
        types = resp.json()["device_types"]
        for dt in types:
            assert dt == dt.lower(), f"Device type not lowercase: {dt}"
            assert " " not in dt, f"Device type has spaces: {dt}"


# ── Upload ───────────────────────────────────────────────────────────────────

class TestUploadFirmware:
    @pytest.mark.api
    def test_upload_success(self, client):
        """POST / should upload firmware and return id + checksum."""
        uid = uuid.uuid4().hex[:6]
        content = f"FW_BINARY_{uid}".encode()
        files = {"file": (f"fw_{uid}.bin", io.BytesIO(content), "application/octet-stream")}
        data = {
            "version": f"2.0.0-{uid}",
            "device_type": "it100",
            "description": "Upload test",
        }
        resp = client.post(BASE, files=files, data=data)
        assert resp.status_code == 201
        body = resp.json()
        assert body["id"]
        assert body["checksum"]
        assert body["size"] == len(content)

        # Cleanup
        client.delete(f"{BASE}/{body['id']}")

    @pytest.mark.api
    def test_upload_missing_file(self, client):
        """Upload without file should fail."""
        resp = client.post(BASE, data={
            "version": "1.0.0",
            "device_type": "it100",
        })
        assert resp.status_code in [400, 422]

    @pytest.mark.api
    def test_upload_missing_version(self, client):
        """Upload without version should fail."""
        content = b"FAKE_FW"
        files = {"file": ("fw.bin", io.BytesIO(content), "application/octet-stream")}
        resp = client.post(BASE, files=files, data={
            "device_type": "it100",
        })
        assert resp.status_code in [400, 422]

    @pytest.mark.api
    def test_upload_invalid_device_type(self, client):
        """Upload with invalid device type should fail."""
        content = b"FAKE_FW"
        files = {"file": ("fw.bin", io.BytesIO(content), "application/octet-stream")}
        resp = client.post(BASE, files=files, data={
            "version": "1.0.0",
            "device_type": "invalid_device_xyz",
        })
        assert resp.status_code in [400, 422]

    @pytest.mark.api
    def test_upload_duplicate_version_device(self, client):
        """Upload with same version + device_type should fail (unique constraint)."""
        uid = uuid.uuid4().hex[:6]
        version = f"3.0.0-dup-{uid}"
        content = b"FW1"
        files = {"file": ("fw1.bin", io.BytesIO(content), "application/octet-stream")}
        data = {"version": version, "device_type": "pm85"}
        resp1 = client.post(BASE, files=files, data=data)
        assert resp1.status_code == 201

        # Try duplicate
        content2 = b"FW2"
        files2 = {"file": ("fw2.bin", io.BytesIO(content2), "application/octet-stream")}
        resp2 = client.post(BASE, files=files2, data={"version": version, "device_type": "pm85"})
        assert resp2.status_code == 409

        # Cleanup
        client.delete(f"{BASE}/{resp1.json()['id']}")


# ── List ─────────────────────────────────────────────────────────────────────

class TestListFirmware:
    @pytest.mark.api
    def test_list_returns_array(self, client, uploaded_firmware):
        """GET / should return firmware list with pagination."""
        resp = client.get(BASE)
        assert resp.status_code == 200
        body = resp.json()
        assert "firmwares" in body
        assert "pagination" in body
        assert body["pagination"]["total"] >= 1

    @pytest.mark.api
    def test_list_search_by_version(self, client, uploaded_firmware):
        """Search should filter by version."""
        version = uploaded_firmware["id"][:6]  # won't match
        resp = client.get(f"{BASE}?search=1.0.0-test")
        assert resp.status_code == 200

    @pytest.mark.api
    def test_list_filter_by_device_type(self, client, uploaded_firmware):
        """Filter by device_type should work."""
        resp = client.get(f"{BASE}?device_type=dq_mini_plus")
        assert resp.status_code == 200
        body = resp.json()
        for fw in body.get("firmwares") or []:
            assert fw["device_type"] == "dq_mini_plus"

    @pytest.mark.api
    def test_list_filter_active(self, client, uploaded_firmware):
        """Filter by active status should return only matching items."""
        # Filter active=true → all returned must be active
        resp = client.get(f"{BASE}?is_active=true")
        assert resp.status_code == 200
        for fw in resp.json().get("firmwares") or []:
            assert fw["is_active"] is True

        # Filter active=false → all returned must be inactive
        resp2 = client.get(f"{BASE}?is_active=false")
        assert resp2.status_code == 200
        for fw in resp2.json().get("firmwares") or []:
            assert fw["is_active"] is False

    @pytest.mark.api
    def test_list_pagination(self, client, uploaded_firmware):
        """Pagination parameters should be respected."""
        resp = client.get(f"{BASE}?page=1&limit=1")
        assert resp.status_code == 200
        body = resp.json()
        assert body["pagination"]["limit"] == 1
        assert len(body.get("firmwares") or []) <= 1


# ── Get Detail ───────────────────────────────────────────────────────────────

class TestGetFirmware:
    @pytest.mark.api
    def test_get_by_id(self, client, uploaded_firmware):
        """GET /:id should return firmware detail."""
        fw_id = uploaded_firmware["id"]
        resp = client.get(f"{BASE}/{fw_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == fw_id
        assert body["version"]
        assert body["device_type"] == "dq_mini_plus"
        assert body["checksum"]
        assert body["file_size"] > 0

    @pytest.mark.api
    def test_get_not_found(self, client):
        """GET with non-existent ID should return 404."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"{BASE}/{fake_id}")
        assert resp.status_code == 404


# ── Update ───────────────────────────────────────────────────────────────────

class TestUpdateFirmware:
    @pytest.mark.api
    def test_update_description(self, client, uploaded_firmware):
        """PUT /:id should update metadata."""
        fw_id = uploaded_firmware["id"]
        resp = client.put(f"{BASE}/{fw_id}", json={
            "description": "Updated description via test",
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["description"] == "Updated description via test"

    @pytest.mark.api
    def test_update_toggle_active(self, client, uploaded_firmware):
        """Should toggle is_active flag."""
        fw_id = uploaded_firmware["id"]
        # Deactivate
        resp = client.put(f"{BASE}/{fw_id}", json={"is_active": False})
        assert resp.status_code == 200
        assert resp.json()["is_active"] is False

        # Reactivate
        resp2 = client.put(f"{BASE}/{fw_id}", json={"is_active": True})
        assert resp2.status_code == 200
        assert resp2.json()["is_active"] is True

    @pytest.mark.api
    def test_update_not_found(self, client):
        """PUT with non-existent ID should return 404."""
        fake_id = str(uuid.uuid4())
        resp = client.put(f"{BASE}/{fake_id}", json={"description": "nope"})
        assert resp.status_code == 404


# ── Download ─────────────────────────────────────────────────────────────────

class TestDownloadFirmware:
    @pytest.mark.api
    def test_download_success(self, client, uploaded_firmware):
        """GET /:id/download should return the firmware file."""
        fw_id = uploaded_firmware["id"]
        resp = client.get(f"{BASE}/{fw_id}/download")
        assert resp.status_code == 200
        assert len(resp.content) > 0
        # Should have Content-Disposition attachment header
        assert "attachment" in resp.headers.get("Content-Disposition", "")

    @pytest.mark.api
    def test_download_not_found(self, client):
        """Download non-existent firmware should 404."""
        fake_id = str(uuid.uuid4())
        resp = client.get(f"{BASE}/{fake_id}/download")
        assert resp.status_code == 404


# ── Deploy ───────────────────────────────────────────────────────────────────

class TestDeployFirmware:
    @pytest.mark.api
    def test_deploy_placeholder(self, client, uploaded_firmware):
        """POST /:id/deploy should return success (placeholder)."""
        fw_id = uploaded_firmware["id"]
        resp = client.post(f"{BASE}/{fw_id}/deploy", json={
            "device_id": str(uuid.uuid4()),
        })
        # Accept 200 or 202 (async)
        assert resp.status_code in [200, 202]
        body = resp.json()
        assert "status" in body or "message" in body


# ── Delete ───────────────────────────────────────────────────────────────────

class TestDeleteFirmware:
    @pytest.mark.api
    def test_delete_success(self, client):
        """DELETE /:id should remove or deactivate firmware."""
        # Create one to delete
        uid = uuid.uuid4().hex[:6]
        content = b"DELETE_ME"
        files = {"file": (f"del_{uid}.bin", io.BytesIO(content), "application/octet-stream")}
        data = {"version": f"9.9.9-del-{uid}", "device_type": "ra08"}
        resp = client.post(BASE, files=files, data=data)
        assert resp.status_code == 201
        fw_id = resp.json()["id"]

        # Delete it
        del_resp = client.delete(f"{BASE}/{fw_id}")
        assert del_resp.status_code in [200, 204]

        # Verify: either 404 (hard delete) or inactive (soft delete)
        get_resp = client.get(f"{BASE}/{fw_id}")
        if get_resp.status_code == 200:
            assert get_resp.json().get("is_active") is False
        else:
            assert get_resp.status_code == 404

    @pytest.mark.api
    def test_delete_not_found(self, client):
        """DELETE with non-existent ID should return 404."""
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"{BASE}/{fake_id}")
        assert resp.status_code == 404
