"""
API Tests: Company CRUD operations
Tests: list, create, get, update, suspend/activate, delete
Requires: sysadmin login (system_admin role)
"""
import pytest
import uuid
from automation.common.api_client import APIClient

BASE = "/api/v1/system"


@pytest.fixture(scope="module")
def client():
    c = APIClient()
    c.login("sysadmin@duali.com", "sysadmin123")
    return c


@pytest.fixture(scope="module")
def test_company(client):
    """Create a test company for CRUD operations, clean up after."""
    unique = uuid.uuid4().hex[:6]
    data = {
        "name": f"Test Company {unique}",
        "code": f"TST-{unique}",
        "email": f"admin-{unique}@test.com",
        "plan": "starter",
        "max_devices": 10,
        "max_users": 5,
    }
    resp = client.post(f"{BASE}/companies", json=data)
    assert resp.status_code == 201, f"Failed to create test company: {resp.text}"
    body = resp.json()
    yield body
    # Cleanup: suspend the company (soft delete)
    client.delete(f"{BASE}/companies/{body['company']['id']}")


class TestListCompanies:
    def test_list_returns_array(self, client):
        resp = client.get(f"{BASE}/companies")
        assert resp.status_code == 200
        body = resp.json()
        # Could be paginated {data: [...]} or plain array
        items = body.get("data", body) if isinstance(body, dict) else body
        assert isinstance(items, list)

    def test_list_has_user_count(self, client):
        resp = client.get(f"{BASE}/companies")
        body = resp.json()
        items = body.get("data", body) if isinstance(body, dict) else body
        if len(items) > 0:
            assert "user_count" in items[0]

    def test_list_has_device_count(self, client):
        resp = client.get(f"{BASE}/companies")
        body = resp.json()
        items = body.get("data", body) if isinstance(body, dict) else body
        if len(items) > 0:
            assert "device_count" in items[0]

    def test_list_pagination(self, client):
        resp = client.get(f"{BASE}/companies?page=1&limit=1")
        assert resp.status_code == 200


class TestCreateCompany:
    def test_create_success(self, client):
        unique = uuid.uuid4().hex[:6]
        resp = client.post(f"{BASE}/companies", json={
            "name": f"Create Test {unique}",
            "code": f"CT-{unique}",
            "email": f"ct-{unique}@test.com",
            "plan": "trial",
        })
        assert resp.status_code == 201
        body = resp.json()
        assert "company" in body
        assert "admin" in body
        assert body["admin"]["email"] == f"ct-{unique}@test.com"
        assert body["admin"]["role"] == "primary_manager"
        assert len(body["admin"]["password"]) > 0
        # Cleanup
        client.delete(f"{BASE}/companies/{body['company']['id']}")

    def test_create_missing_name(self, client):
        resp = client.post(f"{BASE}/companies", json={
            "code": "FAIL",
            "email": "fail@test.com",
        })
        assert resp.status_code == 400

    def test_create_missing_code(self, client):
        resp = client.post(f"{BASE}/companies", json={
            "name": "No Code",
            "email": "fail@test.com",
        })
        assert resp.status_code == 400

    def test_create_missing_email(self, client):
        resp = client.post(f"{BASE}/companies", json={
            "name": "No Email",
            "code": "NOEML",
        })
        assert resp.status_code == 400

    def test_create_duplicate_code(self, client, test_company):
        code = test_company["company"]["code"]
        resp = client.post(f"{BASE}/companies", json={
            "name": "Dup Code",
            "code": code,
            "email": "dup@test.com",
        })
        assert resp.status_code == 409


class TestGetCompany:
    def test_get_by_id(self, client, test_company):
        cid = test_company["company"]["id"]
        resp = client.get(f"{BASE}/companies/{cid}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == cid
        assert body["name"] == test_company["company"]["name"]

    def test_get_has_stats(self, client, test_company):
        cid = test_company["company"]["id"]
        resp = client.get(f"{BASE}/companies/{cid}")
        body = resp.json()
        assert "user_count" in body
        assert "device_count" in body
        assert "door_count" in body
        assert "event_count" in body

    def test_get_nonexistent(self, client):
        fake_id = "00000000-0000-0000-0000-000000000099"
        resp = client.get(f"{BASE}/companies/{fake_id}")
        assert resp.status_code == 404


class TestUpdateCompany:
    def test_update_name(self, client, test_company):
        cid = test_company["company"]["id"]
        resp = client.put(f"{BASE}/companies/{cid}", json={
            "name": "Updated Name",
        })
        assert resp.status_code == 200
        assert resp.json()["name"] == "Updated Name"

    def test_update_plan(self, client, test_company):
        cid = test_company["company"]["id"]
        resp = client.put(f"{BASE}/companies/{cid}", json={
            "plan": "enterprise",
        })
        assert resp.status_code == 200
        assert resp.json()["plan"] == "enterprise"

    def test_update_limits(self, client, test_company):
        cid = test_company["company"]["id"]
        resp = client.put(f"{BASE}/companies/{cid}", json={
            "max_devices": 100,
            "max_users": 50,
        })
        assert resp.status_code == 200
        body = resp.json()
        assert body["max_devices"] == 100
        assert body["max_users"] == 50

    def test_update_nonexistent(self, client):
        fake_id = "00000000-0000-0000-0000-000000000099"
        resp = client.put(f"{BASE}/companies/{fake_id}", json={"name": "X"})
        assert resp.status_code == 404


class TestSuspendCompany:
    def test_suspend_and_check(self, client):
        unique = uuid.uuid4().hex[:6]
        # Create
        resp = client.post(f"{BASE}/companies", json={
            "name": f"Suspend Test {unique}",
            "code": f"SUS-{unique}",
            "email": f"sus-{unique}@test.com",
        })
        cid = resp.json()["company"]["id"]

        # Suspend (DELETE = soft delete)
        resp = client.delete(f"{BASE}/companies/{cid}")
        assert resp.status_code == 204

        # Verify suspended
        resp = client.get(f"{BASE}/companies/{cid}")
        assert resp.json()["status"] == "suspended"

    def test_suspend_already_suspended(self, client):
        unique = uuid.uuid4().hex[:6]
        resp = client.post(f"{BASE}/companies", json={
            "name": f"Double Suspend {unique}",
            "code": f"DS-{unique}",
            "email": f"ds-{unique}@test.com",
        })
        cid = resp.json()["company"]["id"]
        client.delete(f"{BASE}/companies/{cid}")
        # Second suspend
        resp = client.delete(f"{BASE}/companies/{cid}")
        assert resp.status_code == 404
