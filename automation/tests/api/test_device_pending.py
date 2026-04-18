"""
API Tests: Pending Device Management
Tests: list pending, approve, reject (system admin only)
Service: device-gateway via nginx
"""
import pytest
import uuid
from common.api_client import DM3Client
from common import constants

PENDING_BASE = "/api/v1/gateway/devices/pending"


@pytest.fixture(scope="module")
def sysadmin_client():
    """Login as system admin."""
    c = DM3Client()
    c.login(constants.SYSADMIN_EMAIL, constants.SYSADMIN_PASSWORD)
    return c


@pytest.fixture(scope="module")
def admin_client():
    """Login as company admin."""
    c = DM3Client()
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    return c


# ── List Pending ─────────────────────────────────────────────────────────────

class TestListPending:
    @pytest.mark.api
    def test_list_pending_ok(self, sysadmin_client):
        """GET /devices/pending should return list (may be empty)."""
        resp = sysadmin_client.get(PENDING_BASE)
        assert resp.status_code == 200
        body = resp.json()
        # Should be a list or have a data/devices key
        assert isinstance(body, (list, dict))

    @pytest.mark.api
    def test_list_pending_requires_sysadmin(self, admin_client):
        """Company admin should not access pending devices."""
        resp = admin_client.get(PENDING_BASE)
        assert resp.status_code in [401, 403]


# ── Approve ──────────────────────────────────────────────────────────────────

class TestApprovePending:
    @pytest.mark.api
    def test_approve_not_found(self, sysadmin_client):
        """Approve non-existent pending device should return 400 or 404."""
        fake_id = str(uuid.uuid4())
        resp = sysadmin_client.post(f"{PENDING_BASE}/{fake_id}/approve", json={
            "company_id": str(uuid.uuid4()),
            "name": "Test Device",
        })
        assert resp.status_code in [400, 404]

    @pytest.mark.api
    def test_approve_requires_sysadmin(self, admin_client):
        """Company admin should not approve pending devices."""
        fake_id = str(uuid.uuid4())
        resp = admin_client.post(f"{PENDING_BASE}/{fake_id}/approve", json={
            "company_id": str(uuid.uuid4()),
            "name": "Test",
        })
        assert resp.status_code in [401, 403]


# ── Reject ───────────────────────────────────────────────────────────────────

class TestRejectPending:
    @pytest.mark.api
    def test_reject_not_found(self, sysadmin_client):
        """Reject non-existent pending device should return 404."""
        fake_id = str(uuid.uuid4())
        resp = sysadmin_client.post(f"{PENDING_BASE}/{fake_id}/reject")
        assert resp.status_code == 404

    @pytest.mark.api
    def test_reject_requires_sysadmin(self, admin_client):
        """Company admin should not reject pending devices."""
        fake_id = str(uuid.uuid4())
        resp = admin_client.post(f"{PENDING_BASE}/{fake_id}/reject")
        assert resp.status_code in [401, 403]
