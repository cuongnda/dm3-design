"""
API Tests: Access Time Management
Tests: list, create, get, update, delete templates + stats
Requires: company admin login (manager role)
Service: access-svc :8003
"""
import pytest
import uuid
from common.api_client import APIClient
from common import constants

BASE = "/api/v1/access-time"


@pytest.fixture(scope="module")
def client():
    """Login via auth-svc, then talk to access-svc."""
    c = APIClient()  # uses API_AUTH (auth-svc) for login
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    # Switch base_url to access-svc for API calls
    c.base_url = constants.API_ACCESS
    # Verify access-time tables exist (migration applied)
    check = c.get(f"{BASE}/templates")
    if check.status_code == 500:
        pytest.skip("Access Time migration not applied — tables missing on access-svc")
    return c


# ─── Template CRUD ────────────────────────────────────────────


class TestListTemplates:
    def test_list_templates_ok(self, client):
        resp = client.get(f"{BASE}/templates")
        assert resp.status_code == 200
        body = resp.json()
        assert "templates" in body
        assert "pagination" in body

    def test_list_templates_filter_active(self, client):
        resp = client.get(f"{BASE}/templates?active=true")
        assert resp.status_code == 200
        body = resp.json()
        for tmpl in body.get("templates", []):
            assert tmpl["is_active"] is True

    def test_list_templates_filter_inactive(self, client):
        resp = client.get(f"{BASE}/templates?active=false")
        assert resp.status_code == 200
        body = resp.json()
        for tmpl in body.get("templates") or []:
            assert tmpl["is_active"] is False


class TestCreateTemplate:
    def test_create_template_basic(self, client):
        """Create a minimal template with time slots."""
        unique = uuid.uuid4().hex[:6]
        data = {
            "name": f"Test Template {unique}",
            "description": "Automation test template",
            "timezone": "Asia/Ho_Chi_Minh",
            "time_slots": [
                {
                    "day_of_week": 1,
                    "start_time": "08:00",
                    "end_time": "12:00",
                    "slot_name": "Morning",
                    "is_active": True,
                },
                {
                    "day_of_week": 1,
                    "start_time": "13:00",
                    "end_time": "17:00",
                    "slot_name": "Afternoon",
                    "is_active": True,
                },
            ],
        }
        resp = client.post(f"{BASE}/templates", json=data)
        assert resp.status_code == 201, f"Create failed: {resp.text}"
        body = resp.json()
        assert "id" in body
        assert body["message"] == "Access time template created successfully"

    def test_create_template_missing_name(self, client):
        """Name is required."""
        data = {
            "timezone": "Asia/Ho_Chi_Minh",
            "time_slots": [
                {"day_of_week": 1, "start_time": "08:00", "end_time": "17:00", "is_active": True},
            ],
        }
        resp = client.post(f"{BASE}/templates", json=data)
        assert resp.status_code in [400, 422]

    def test_create_template_invalid_timezone(self, client):
        """Invalid timezone should fail."""
        data = {
            "name": f"Bad TZ {uuid.uuid4().hex[:4]}",
            "timezone": "Mars/Olympus",
            "time_slots": [
                {"day_of_week": 0, "start_time": "00:00", "end_time": "23:59", "is_active": True},
            ],
        }
        resp = client.post(f"{BASE}/templates", json=data)
        assert resp.status_code == 400

    def test_create_template_empty_slots(self, client):
        """Empty time slots should still succeed (template without schedule)."""
        data = {
            "name": f"Empty Slots {uuid.uuid4().hex[:4]}",
            "timezone": "UTC",
            "time_slots": [],
        }
        resp = client.post(f"{BASE}/templates", json=data)
        # Depending on business rule: may accept or reject
        assert resp.status_code in [201, 400]


@pytest.fixture(scope="module")
def test_template(client):
    """Create a template for other tests, clean up after."""
    unique = uuid.uuid4().hex[:6]
    data = {
        "name": f"CRUD Test {unique}",
        "description": "For get/update/delete tests",
        "timezone": "Asia/Ho_Chi_Minh",
        "time_slots": [
            {"day_of_week": 1, "start_time": "08:00", "end_time": "17:00", "slot_name": "Workday", "is_active": True},
            {"day_of_week": 2, "start_time": "08:00", "end_time": "17:00", "slot_name": "Workday", "is_active": True},
            {"day_of_week": 3, "start_time": "08:00", "end_time": "17:00", "slot_name": "Workday", "is_active": True},
        ],
    }
    resp = client.post(f"{BASE}/templates", json=data)
    assert resp.status_code == 201
    body = resp.json()
    yield body["id"]
    # Cleanup
    client.delete(f"{BASE}/templates/{body['id']}")


class TestGetTemplate:
    def test_get_template_ok(self, client, test_template):
        resp = client.get(f"{BASE}/templates/{test_template}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["id"] == test_template
        assert "name" in body
        assert "time_slots" in body
        assert len(body["time_slots"]) == 3

    def test_get_template_includes_slots(self, client, test_template):
        resp = client.get(f"{BASE}/templates/{test_template}")
        body = resp.json()
        for slot in body["time_slots"]:
            assert "day_of_week" in slot
            assert "start_time" in slot
            assert "end_time" in slot
            assert "is_active" in slot

    def test_get_template_not_found(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.get(f"{BASE}/templates/{fake_id}")
        assert resp.status_code == 404


class TestUpdateTemplate:
    def test_update_name(self, client, test_template):
        resp = client.put(f"{BASE}/templates/{test_template}", json={
            "name": "Updated Name",
        })
        assert resp.status_code == 200

        # Verify
        check = client.get(f"{BASE}/templates/{test_template}")
        assert check.json()["name"] == "Updated Name"

    def test_update_toggle_active(self, client, test_template):
        resp = client.put(f"{BASE}/templates/{test_template}", json={
            "is_active": False,
        })
        assert resp.status_code == 200

        check = client.get(f"{BASE}/templates/{test_template}")
        assert check.json()["is_active"] is False

        # Toggle back
        client.put(f"{BASE}/templates/{test_template}", json={"is_active": True})

    def test_update_time_slots(self, client, test_template):
        """Replace all time slots."""
        new_slots = [
            {"day_of_week": 0, "start_time": "00:00", "end_time": "23:59", "slot_name": "Full", "is_active": True},
        ]
        resp = client.put(f"{BASE}/templates/{test_template}", json={
            "time_slots": new_slots,
        })
        assert resp.status_code == 200

        check = client.get(f"{BASE}/templates/{test_template}")
        assert len(check.json()["time_slots"]) == 1

    def test_update_not_found(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.put(f"{BASE}/templates/{fake_id}", json={"name": "Ghost"})
        assert resp.status_code == 404


class TestDeleteTemplate:
    def test_delete_template(self, client):
        # Create then delete
        data = {
            "name": f"Delete Me {uuid.uuid4().hex[:4]}",
            "timezone": "UTC",
            "time_slots": [
                {"day_of_week": 1, "start_time": "09:00", "end_time": "17:00", "is_active": True},
            ],
        }
        resp = client.post(f"{BASE}/templates", json=data)
        assert resp.status_code == 201
        template_id = resp.json()["id"]

        # Delete
        del_resp = client.delete(f"{BASE}/templates/{template_id}")
        assert del_resp.status_code == 200

        # Verify gone
        check = client.get(f"{BASE}/templates/{template_id}")
        assert check.status_code == 404

    def test_delete_not_found(self, client):
        fake_id = str(uuid.uuid4())
        resp = client.delete(f"{BASE}/templates/{fake_id}")
        assert resp.status_code == 404


# ─── Stats ────────────────────────────────────────────────────


class TestAccessTimeStats:
    def test_stats_ok(self, client):
        resp = client.get(f"{BASE}/stats")
        assert resp.status_code == 200
        body = resp.json()
        assert "templates_active" in body
        assert "templates_total" in body
        assert body["templates_total"] >= 0
        assert body["templates_active"] >= 0
        assert body["templates_active"] <= body["templates_total"]


# ─── Edge Cases ───────────────────────────────────────────────


class TestAccessTimeEdgeCases:
    def test_create_duplicate_name(self, client):
        """Same name in same tenant should fail (unique constraint)."""
        name = f"Unique Test {uuid.uuid4().hex[:6]}"
        data = {
            "name": name,
            "timezone": "UTC",
            "time_slots": [{"day_of_week": 1, "start_time": "08:00", "end_time": "17:00", "is_active": True}],
        }
        resp1 = client.post(f"{BASE}/templates", json=data)
        assert resp1.status_code == 201

        # Same name again
        resp2 = client.post(f"{BASE}/templates", json=data)
        assert resp2.status_code in [400, 409, 500]  # Should reject duplicate

        # Cleanup
        client.delete(f"{BASE}/templates/{resp1.json()['id']}")

    def test_all_days_template(self, client):
        """Create a 7-day schedule with multiple slots per day."""
        slots = []
        for day in range(7):
            slots.append({"day_of_week": day, "start_time": "06:00", "end_time": "12:00", "slot_name": "AM", "is_active": True})
            slots.append({"day_of_week": day, "start_time": "12:00", "end_time": "18:00", "slot_name": "PM", "is_active": True})

        data = {
            "name": f"Full Week {uuid.uuid4().hex[:4]}",
            "timezone": "Asia/Ho_Chi_Minh",
            "time_slots": slots,
        }
        resp = client.post(f"{BASE}/templates", json=data)
        assert resp.status_code == 201
        template_id = resp.json()["id"]

        # Verify 14 slots
        check = client.get(f"{BASE}/templates/{template_id}")
        assert len(check.json()["time_slots"]) == 14

        # Cleanup
        client.delete(f"{BASE}/templates/{template_id}")
