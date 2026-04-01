"""
DM3-67: Account Management API Tests
Tests for user account CRUD operations and password management.
"""
import pytest
from common import constants
from common.api_client import DM3Client


class TestAccountManagementAPI:
    """Test account management API endpoints."""

    def setup_method(self):
        """Setup test client with system admin auth."""
        self.client = DM3Client()
        self.client.login(constants.SYSADMIN_EMAIL, constants.SYSADMIN_PASSWORD)

    @pytest.mark.api
    @pytest.mark.smoke
    def test_list_accounts(self):
        """Should list user accounts with pagination."""
        response = self.client.get("/api/v1/system/accounts")
        assert response.status_code == 200
        
        data = response.json()
        assert "data" in data
        assert "total" in data
        assert "page" in data
        assert isinstance(data["data"], list)

        # Check account structure
        if data["data"]:
            account = data["data"][0]
            required_fields = ["id", "email", "name", "role", "status", "companies", "created_at"]
            for field in required_fields:
                assert field in account

    @pytest.mark.api
    def test_list_accounts_with_search(self):
        """Should filter accounts by search term."""
        # Search by email
        response = self.client.get("/api/v1/system/accounts", params={"search": "sysadmin"})
        assert response.status_code == 200
        
        data = response.json()
        assert data["data"]
        # Should find system admin
        found_sysadmin = any(acc["email"] == "sysadmin@duali.com" for acc in data["data"])
        assert found_sysadmin

    @pytest.mark.api
    def test_list_accounts_filter_by_role(self):
        """Should filter accounts by role."""
        response = self.client.get("/api/v1/system/accounts", params={"role": "system_admin"})
        assert response.status_code == 200
        
        data = response.json()
        if data["data"]:
            # All returned accounts should be system_admin
            for account in data["data"]:
                assert account["role"] == "system_admin"

    @pytest.mark.api
    def test_create_account_success(self):
        """Should create new user account."""
        # First get a company to assign
        companies_resp = self.client.get("/api/v1/system/companies")
        assert companies_resp.status_code == 200
        companies = companies_resp.json()
        
        if not companies:
            pytest.skip("No companies available for account creation test")
        
        company_id = companies[0]["id"]
        
        account_data = {
            "email": f"test-user-{pytest.current_test_id}@example.com",
            "name": "Test User",
            "role": "manager",
            "company_id": company_id
        }
        
        response = self.client.post("/api/v1/system/accounts", json=account_data)
        assert response.status_code == 201
        
        data = response.json()
        assert data["user"]["email"] == account_data["email"]
        assert data["user"]["name"] == account_data["name"]
        assert data["user"]["role"] == account_data["role"]
        assert data["password"]  # Generated password
        
        # Cleanup
        self.client.delete(f"/api/v1/system/accounts/{data['user']['id']}")

    @pytest.mark.api
    def test_create_account_system_admin(self):
        """Should create system admin when no company specified."""
        account_data = {
            "email": f"test-sysadmin-{pytest.current_test_id}@example.com",
            "name": "Test System Admin",
            "role": "viewer"  # Should be overridden to system_admin
        }
        
        response = self.client.post("/api/v1/system/accounts", json=account_data)
        assert response.status_code == 201
        
        data = response.json()
        assert data["user"]["role"] == "system_admin"  # Auto-assigned
        assert len(data["user"]["companies"]) == 0  # No company assignments
        
        # Cleanup
        self.client.delete(f"/api/v1/system/accounts/{data['user']['id']}")

    @pytest.mark.api
    def test_create_account_missing_fields(self):
        """Should fail when required fields missing."""
        account_data = {
            "email": "incomplete@example.com"
            # Missing name
        }
        
        response = self.client.post("/api/v1/system/accounts", json=account_data)
        assert response.status_code == 400

    @pytest.mark.api
    def test_create_account_duplicate_email(self):
        """Should fail when email already exists."""
        account_data = {
            "email": "sysadmin@duali.com",  # Existing email
            "name": "Duplicate User"
        }
        
        response = self.client.post("/api/v1/system/accounts", json=account_data)
        assert response.status_code == 409

    @pytest.mark.api
    def test_get_account_success(self):
        """Should get account details with companies."""
        # Get system admin account
        list_resp = self.client.get("/api/v1/system/accounts", params={"role": "system_admin"})
        accounts = list_resp.json()["data"]
        
        if not accounts:
            pytest.skip("No system admin account found")
        
        account_id = accounts[0]["id"]
        
        response = self.client.get(f"/api/v1/system/accounts/{account_id}")
        assert response.status_code == 200
        
        account = response.json()
        assert account["id"] == account_id
        assert account["role"] == "system_admin"
        assert "companies" in account

    @pytest.mark.api
    def test_get_account_not_found(self):
        """Should return 404 for non-existent account."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = self.client.get(f"/api/v1/system/accounts/{fake_id}")
        assert response.status_code == 404

    @pytest.mark.api
    def test_update_account_success(self):
        """Should update account details."""
        # Create test account first
        account_data = {
            "email": f"test-update-{pytest.current_test_id}@example.com",
            "name": "Test Update User",
            "role": "viewer"
        }
        
        create_resp = self.client.post("/api/v1/system/accounts", json=account_data)
        account = create_resp.json()["user"]
        account_id = account["id"]
        
        try:
            # Update account
            update_data = {
                "name": "Updated Name",
                "status": "active"
            }
            
            response = self.client.patch(f"/api/v1/system/accounts/{account_id}", json=update_data)
            assert response.status_code == 200
            
            updated_account = response.json()
            assert updated_account["name"] == "Updated Name"
            
        finally:
            # Cleanup
            self.client.delete(f"/api/v1/system/accounts/{account_id}")

    @pytest.mark.api
    def test_delete_account_success(self):
        """Should soft-delete account (set inactive)."""
        # Create test account first
        account_data = {
            "email": f"test-delete-{pytest.current_test_id}@example.com",
            "name": "Test Delete User"
        }
        
        create_resp = self.client.post("/api/v1/system/accounts", json=account_data)
        account = create_resp.json()["user"]
        account_id = account["id"]
        
        # Delete account
        response = self.client.delete(f"/api/v1/system/accounts/{account_id}")
        assert response.status_code == 200
        
        # Verify account is inactive
        get_resp = self.client.get(f"/api/v1/system/accounts/{account_id}")
        if get_resp.status_code == 200:
            account = get_resp.json()
            assert account["status"] == "inactive"

    @pytest.mark.api
    def test_delete_system_admin_forbidden(self):
        """Should not allow deleting system admin accounts."""
        # Get system admin account
        list_resp = self.client.get("/api/v1/system/accounts", params={"role": "system_admin"})
        accounts = list_resp.json()["data"]
        
        if not accounts:
            pytest.skip("No system admin account found")
        
        account_id = accounts[0]["id"]
        
        response = self.client.delete(f"/api/v1/system/accounts/{account_id}")
        assert response.status_code == 404  # Cannot delete system admin

    @pytest.mark.api
    def test_reset_password_success(self):
        """Should reset account password."""
        # Create test account first
        account_data = {
            "email": f"test-password-{pytest.current_test_id}@example.com",
            "name": "Test Password User"
        }
        
        create_resp = self.client.post("/api/v1/system/accounts", json=account_data)
        account = create_resp.json()["user"]
        account_id = account["id"]
        
        try:
            # Reset password
            response = self.client.post(f"/api/v1/system/accounts/{account_id}/reset-password")
            assert response.status_code == 200
            
            data = response.json()
            assert data["password"]  # New password generated
            assert data["message"]
            
        finally:
            # Cleanup
            self.client.delete(f"/api/v1/system/accounts/{account_id}")

    @pytest.mark.api
    def test_reset_password_not_found(self):
        """Should return 404 for non-existent account."""
        fake_id = "00000000-0000-0000-0000-000000000000"
        response = self.client.post(f"/api/v1/system/accounts/{fake_id}/reset-password")
        assert response.status_code == 404


class TestAccountManagementAuth:
    """Test account management access control."""

    @pytest.mark.api
    def test_list_accounts_requires_system_admin(self):
        """Non-system-admin should not access account management."""
        # Try with no auth
        client = DM3Client()
        response = client.get("/api/v1/system/accounts")
        assert response.status_code == 401

        # TODO: Test with regular user when available
        # Should return 403 for non-system-admin users