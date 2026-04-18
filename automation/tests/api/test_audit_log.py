"""
DM3: Audit Log API Tests
Tests for audit-svc query API endpoints (/api/v1/audit/).
System admin and tenant-scoped audit log access.
"""
import time

import pytest
from common import constants
from common.api_client import DM3Client


AUDIT_URL = "/api/v1/audit"


# ─── Auth & Access Control ────────────────────────────────────

class TestAuditAuth:
    """Test audit API authentication and authorization."""

    @pytest.mark.api
    def test_audit_requires_auth(self):
        """Audit logs endpoint should reject unauthenticated requests."""
        client = DM3Client()
        resp = client.get(f"{AUDIT_URL}/logs")
        assert resp.status_code == 401

    @pytest.mark.api
    def test_audit_requires_system_admin(self, admin_client):
        """System audit logs should reject non-system-admin users."""
        resp = admin_client.get(f"{AUDIT_URL}/logs")
        assert resp.status_code == 403

    @pytest.mark.api
    def test_tenant_audit_requires_auth(self):
        """Tenant audit logs should reject unauthenticated requests."""
        client = DM3Client()
        resp = client.get(f"{AUDIT_URL}/tenant/logs")
        assert resp.status_code == 401

    @pytest.mark.api
    def test_tenant_audit_allowed_for_company_admin(self, admin_client):
        """Tenant audit logs should be accessible by company admin."""
        resp = admin_client.get(f"{AUDIT_URL}/tenant/logs")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "total" in data


# ─── System Admin: List Logs ─────────────────────────────────

class TestAuditLogsList:
    """Test system admin audit log listing."""

    @pytest.mark.api
    @pytest.mark.smoke
    def test_list_audit_logs(self, sysadmin_client):
        """GET /audit/logs should return paginated list."""
        resp = sysadmin_client.get(f"{AUDIT_URL}/logs")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "total" in data
        assert isinstance(data["data"], list)
        assert isinstance(data["total"], int)

    @pytest.mark.api
    def test_list_audit_logs_pagination(self, sysadmin_client):
        """Pagination params should be respected."""
        resp = sysadmin_client.get(f"{AUDIT_URL}/logs?page=1&limit=5")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) <= 5

    @pytest.mark.api
    def test_list_audit_logs_filter_service(self, sysadmin_client):
        """Filter by service name should work."""
        resp = sysadmin_client.get(f"{AUDIT_URL}/logs?service=auth-svc")
        assert resp.status_code == 200
        data = resp.json()
        for entry in data["data"]:
            assert entry["service"] == "auth-svc"

    @pytest.mark.api
    def test_list_audit_logs_filter_status(self, sysadmin_client):
        """Filter by status should work."""
        resp = sysadmin_client.get(f"{AUDIT_URL}/logs?status=success")
        assert resp.status_code == 200
        data = resp.json()
        for entry in data["data"]:
            assert entry["status"] == "success"

    @pytest.mark.api
    def test_list_audit_logs_entry_structure(self, sysadmin_client):
        """Each audit entry should have expected fields."""
        resp = sysadmin_client.get(f"{AUDIT_URL}/logs?limit=1")
        assert resp.status_code == 200
        data = resp.json()
        if data["data"]:
            entry = data["data"][0]
            # Required fields
            assert "id" in entry
            assert "time" in entry
            assert "service" in entry
            assert "action" in entry
            assert "status" in entry


# ─── System Admin: Stats ─────────────────────────────────────

class TestAuditStats:
    """Test audit statistics endpoint."""

    @pytest.mark.api
    def test_get_audit_stats(self, sysadmin_client):
        """GET /audit/stats should return statistics."""
        resp = sysadmin_client.get(f"{AUDIT_URL}/stats")
        assert resp.status_code == 200
        data = resp.json()
        assert "total" in data

    @pytest.mark.api
    def test_stats_requires_system_admin(self, admin_client):
        """Stats should reject non-system-admin users."""
        resp = admin_client.get(f"{AUDIT_URL}/stats")
        assert resp.status_code == 403


# ─── System Admin: Export ─────────────────────────────────────

class TestAuditExport:
    """Test audit log CSV export."""

    @pytest.mark.api
    def test_export_audit_logs(self, sysadmin_client):
        """GET /audit/export should return CSV."""
        resp = sysadmin_client.get(f"{AUDIT_URL}/export")
        assert resp.status_code == 200
        content_type = resp.headers.get("Content-Type", "")
        assert "text/csv" in content_type or "application/octet-stream" in content_type

    @pytest.mark.api
    def test_export_requires_system_admin(self, admin_client):
        """Export should reject non-system-admin users."""
        resp = admin_client.get(f"{AUDIT_URL}/export")
        assert resp.status_code == 403


# ─── Tenant-Scoped Logs ──────────────────────────────────────

class TestTenantAuditLogs:
    """Test tenant-scoped audit log access."""

    @pytest.mark.api
    @pytest.mark.smoke
    def test_list_tenant_audit_logs(self, admin_client):
        """GET /audit/tenant/logs should return paginated list for tenant."""
        resp = admin_client.get(f"{AUDIT_URL}/tenant/logs")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "total" in data
        assert isinstance(data["data"], list)

    @pytest.mark.api
    def test_tenant_logs_pagination(self, admin_client):
        """Tenant logs should support pagination."""
        resp = admin_client.get(f"{AUDIT_URL}/tenant/logs?page=1&limit=5")
        assert resp.status_code == 200
        data = resp.json()
        assert len(data["data"]) <= 5

    @pytest.mark.api
    def test_tenant_export(self, admin_client):
        """GET /audit/tenant/export should return CSV for tenant."""
        resp = admin_client.get(f"{AUDIT_URL}/tenant/export")
        assert resp.status_code == 200
        content_type = resp.headers.get("Content-Type", "")
        assert "text/csv" in content_type or "application/octet-stream" in content_type


# ─── Audit Trail Generation ──────────────────────────────────

class TestAuditTrailGeneration:
    """Verify that CRUD actions generate audit entries."""

    @pytest.mark.api
    def test_login_generates_audit_entry(self, sysadmin_client):
        """Login action should produce an audit trail entry."""
        # Perform a fresh login to generate an audit event
        client = DM3Client()
        client.login(constants.SYSADMIN_EMAIL, constants.SYSADMIN_PASSWORD)

        # Retry: audit-svc batches NATS messages (50 entries / 100ms flush),
        # so the entry may not be queryable immediately.
        data = None
        for _ in range(5):
            time.sleep(0.5)
            resp = sysadmin_client.get(
                f"{AUDIT_URL}/logs?action=auth.login&service=auth-svc&limit=1"
            )
            assert resp.status_code == 200
            data = resp.json()
            if data["total"] > 0:
                break

        assert data["total"] > 0
        entry = data["data"][0]
        assert entry["action"] == "auth.login"
        assert entry["service"] == "auth-svc"
        assert entry["status"] == "success"
