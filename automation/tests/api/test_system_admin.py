"""
DM3-292: System Admin API Tests
Tests for system stats, company CRUD, and auth flow.
"""
import pytest
from common import constants
from common.api_client import DM3Client


# ─── Auth Flow ────────────────────────────────────────────────

class TestSystemAdminAuth:
    """Test system admin authentication flow."""

    @pytest.mark.api
    @pytest.mark.smoke
    def test_sysadmin_login_success(self):
        """System admin should login without company selection."""
        client = DM3Client()
        data = client.login(constants.SYSADMIN_EMAIL, constants.SYSADMIN_PASSWORD)
        assert data["step"] == "complete"
        assert data["access_token"]
        assert data["user"]["role"] == "system_admin"
        assert data["user"]["email"] == constants.SYSADMIN_EMAIL

    @pytest.mark.api
    def test_sysadmin_login_wrong_password(self):
        """Wrong password should return 401."""
        client = DM3Client()
        import requests
        resp = client.session.post(
            f"{constants.API_AUTH}/api/v1/auth/login",
            json={"email": constants.SYSADMIN_EMAIL, "password": "wrongpassword"},
        )
        assert resp.status_code == 401

    @pytest.mark.api
    def test_sysadmin_login_invalid_email(self):
        """Non-existent email should return 401."""
        client = DM3Client()
        import requests
        resp = client.session.post(
            f"{constants.API_AUTH}/api/v1/auth/login",
            json={"email": "notexist@duali.com", "password": "test123"},
        )
        assert resp.status_code == 401

    @pytest.mark.api
    def test_sysadmin_me_endpoint(self, sysadmin_client):
        """GET /auth/me should return system admin profile."""
        resp = sysadmin_client.get(f"{constants.API_AUTH}/api/v1/auth/me")
        assert resp.status_code == 200
        data = resp.json()
        assert data["email"] == constants.SYSADMIN_EMAIL
        assert data["status"] == "active"


# ─── System Stats ─────────────────────────────────────────────

class TestSystemStats:
    """Test system stats endpoint."""

    @pytest.mark.api
    @pytest.mark.smoke
    def test_get_system_stats(self, sysadmin_client):
        """GET /system/stats should return all stat categories."""
        resp = sysadmin_client.get(f"{constants.API_AUTH}/api/v1/system/stats")
        assert resp.status_code == 200
        data = resp.json()

        # Verify structure
        assert "companies" in data
        assert "users" in data
        assert "devices" in data
        assert "recent" in data

        # Verify company stats
        assert data["companies"]["total"] >= 0
        assert data["companies"]["active"] >= 0
        assert data["companies"]["suspended"] >= 0
        assert data["companies"]["active"] + data["companies"]["suspended"] <= data["companies"]["total"]

        # Verify user stats
        assert data["users"]["total"] >= 0
        assert data["users"]["active"] >= 0

        # Verify recent stats
        assert data["recent"]["new_companies_7d"] >= 0
        assert data["recent"]["new_users_7d"] >= 0
        assert data["recent"]["new_devices_7d"] >= 0

    @pytest.mark.api
    def test_stats_requires_auth(self):
        """Stats endpoint should reject unauthenticated requests."""
        client = DM3Client()
        resp = client.get(f"{constants.API_AUTH}/api/v1/system/stats")
        assert resp.status_code == 401

    @pytest.mark.api
    def test_stats_requires_system_admin(self, admin_client):
        """Stats endpoint should reject non-system-admin users."""
        resp = admin_client.get(f"{constants.API_AUTH}/api/v1/system/stats")
        assert resp.status_code == 403


# ─── Company CRUD ─────────────────────────────────────────────

class TestCompanyCRUD:
    """Test company management endpoints."""

    @pytest.mark.api
    @pytest.mark.smoke
    def test_list_companies(self, sysadmin_client):
        """GET /system/companies should return paginated list."""
        resp = sysadmin_client.get(f"{constants.API_AUTH}/api/v1/system/companies")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "total" in data
        assert isinstance(data["data"], list)

    @pytest.mark.api
    def test_create_company(self, sysadmin_client):
        """POST /system/companies should create company + admin user."""
        resp = sysadmin_client.post(
            f"{constants.API_AUTH}/api/v1/system/companies",
            json={
                "name": "Test Automation Corp",
                "code": "AUTOTEST",
                "email": "auto@test.com",
                "plan": "starter",
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["company"]["name"] == "Test Automation Corp"
        assert data["company"]["code"] == "AUTOTEST"
        assert data["company"]["status"] == "active"
        assert data["admin"]["email"] == "auto@test.com"
        assert data["admin"]["password"]  # auto-generated password
        assert data["admin"]["role"] == "primary_manager"

        # Store for cleanup
        self.__class__._created_company_id = data["company"]["id"]

    @pytest.mark.api
    def test_get_company(self, sysadmin_client):
        """GET /system/companies/:id should return company details."""
        company_id = getattr(self.__class__, '_created_company_id', None)
        if not company_id:
            pytest.skip("No company created")

        resp = sysadmin_client.get(f"{constants.API_AUTH}/api/v1/system/companies/{company_id}")
        assert resp.status_code == 200
        data = resp.json()
        assert data["id"] == company_id
        assert data["name"] == "Test Automation Corp"

    @pytest.mark.api
    def test_update_company(self, sysadmin_client):
        """PUT /system/companies/:id should update company fields."""
        company_id = getattr(self.__class__, '_created_company_id', None)
        if not company_id:
            pytest.skip("No company created")

        resp = sysadmin_client.put(
            f"{constants.API_AUTH}/api/v1/system/companies/{company_id}",
            json={"name": "Test Automation Corp Updated", "plan": "enterprise"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["name"] == "Test Automation Corp Updated"
        assert data["plan"] == "enterprise"

    @pytest.mark.api
    def test_suspend_company(self, sysadmin_client):
        """DELETE /system/companies/:id should suspend (soft delete)."""
        company_id = getattr(self.__class__, '_created_company_id', None)
        if not company_id:
            pytest.skip("No company created")

        resp = sysadmin_client.delete(f"{constants.API_AUTH}/api/v1/system/companies/{company_id}")
        assert resp.status_code == 204

        # Verify suspended
        resp = sysadmin_client.get(f"{constants.API_AUTH}/api/v1/system/companies/{company_id}")
        assert resp.json()["status"] == "suspended"

    @pytest.mark.api
    def test_create_company_duplicate_code(self, sysadmin_client):
        """Creating company with duplicate code should fail."""
        # Create first
        resp = sysadmin_client.post(
            f"{constants.API_AUTH}/api/v1/system/companies",
            json={"name": "Dup Test", "code": "DUPTEST", "email": "dup@test.com"},
        )
        if resp.status_code == 201:
            self.__class__._dup_company_id = resp.json()["company"]["id"]

        # Try duplicate
        resp = sysadmin_client.post(
            f"{constants.API_AUTH}/api/v1/system/companies",
            json={"name": "Dup Test 2", "code": "DUPTEST", "email": "dup2@test.com"},
        )
        assert resp.status_code == 409

    @pytest.mark.api
    def test_create_company_missing_fields(self, sysadmin_client):
        """Creating company without required fields should fail."""
        resp = sysadmin_client.post(
            f"{constants.API_AUTH}/api/v1/system/companies",
            json={"name": "No Code"},
        )
        assert resp.status_code == 400

    @pytest.mark.api
    def test_company_not_found(self, sysadmin_client):
        """Getting non-existent company should return 404."""
        resp = sysadmin_client.get(
            f"{constants.API_AUTH}/api/v1/system/companies/00000000-0000-0000-0000-000000000000"
        )
        assert resp.status_code == 404


# ─── User Management ─────────────────────────────────────────

class TestUserManagement:
    """Test user management endpoints (system admin access)."""

    @pytest.mark.api
    def test_list_users(self, sysadmin_client):
        """GET /users should return paginated list."""
        resp = sysadmin_client.get(f"{constants.API_AUTH}/api/v1/users")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "total" in data

    @pytest.mark.api
    def test_list_roles(self, sysadmin_client):
        """GET /roles should return available roles."""
        resp = sysadmin_client.get(f"{constants.API_AUTH}/api/v1/roles")
        assert resp.status_code == 200
        roles = resp.json()
        assert isinstance(roles, list)
        assert len(roles) > 0
        role_names = [r["name"] for r in roles]
        assert "admin" in role_names
