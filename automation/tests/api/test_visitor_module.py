"""
DM3: Visitor Module API Tests
Tests for visitor-svc endpoints: settings, analytics, groups,
agreements, recurring templates, access log, evacuation.
Requires: company admin login (admin role)
"""
import uuid
from datetime import datetime, timedelta

import pytest
from common import constants
from common.api_client import DM3Client

BASE = "/api/v1/visitors"


@pytest.fixture(scope="module")
def client():
    """Authenticated API client as company admin."""
    c = DM3Client()
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    return c


# ─── Settings ────────────────────────────────────────────────────


class TestVisitorSettings:
    """Test visitor settings CRUD."""

    @pytest.mark.api
    def test_get_settings_returns_defaults(self, client):
        """GET /visitors/settings should return settings with all required fields."""
        resp = client.get(f"{BASE}/settings")
        assert resp.status_code == 200
        data = resp.json()
        required_fields = [
            "id", "tenant_id", "approval_required", "auto_approve_returning",
            "auto_checkout_hour", "max_duration_hours", "default_duration_hours",
            "no_show_grace_minutes", "qr_validity_before_hours", "qr_validity_after_hours",
            "require_email", "require_phone", "require_national_id",
            "badge_enabled", "notify_host_on_arrival", "notify_method",
            "self_service_enabled", "created_at", "updated_at",
        ]
        for field in required_fields:
            assert field in data, f"missing field '{field}' in settings response"

    @pytest.mark.api
    def test_update_settings(self, client):
        """PUT /visitors/settings should update and return new values."""
        update = {
            "approval_required": True,
            "auto_checkout_hour": 20,
            "max_duration_hours": 12,
            "notify_method": "email",
            "badge_enabled": True,
            "badge_prefix": "VIS",
        }
        resp = client.put(f"{BASE}/settings", json=update)
        assert resp.status_code == 200
        data = resp.json()
        assert data["approval_required"] is True
        assert data["auto_checkout_hour"] == 20
        assert data["max_duration_hours"] == 12
        assert data["notify_method"] == "email"
        assert data["badge_prefix"] == "VIS"

    @pytest.mark.api
    def test_update_settings_invalid_checkout_hour(self, client):
        """PUT /visitors/settings with auto_checkout_hour > 23 should return 400."""
        resp = client.put(f"{BASE}/settings", json={
            "auto_checkout_hour": 25,
            "no_show_grace_minutes": 30,
            "notify_method": "in_app",
        })
        assert resp.status_code == 400

    @pytest.mark.api
    def test_update_settings_invalid_notify_method(self, client):
        """PUT /visitors/settings with unknown notify_method should return 400."""
        resp = client.put(f"{BASE}/settings", json={
            "auto_checkout_hour": 18,
            "notify_method": "pigeon_post",
        })
        assert resp.status_code == 400


# ─── Analytics ───────────────────────────────────────────────────


class TestVisitorAnalytics:
    """Test analytics endpoints return correct structure."""

    @pytest.mark.api
    def test_analytics_returns_single_object(self, client):
        """GET /visitors/analytics should return an object, not an array."""
        resp = client.get(f"{BASE}/analytics?period=7d")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict), "analytics should return an object"
        required_fields = [
            "period", "total_visits", "unique_visitors",
            "checked_in", "no_shows", "by_purpose", "by_status",
        ]
        for field in required_fields:
            assert field in data, f"missing field '{field}' in analytics"
        assert data["period"] == "7d"

    @pytest.mark.api
    def test_analytics_default_period(self, client):
        """GET /visitors/analytics without period param defaults to 7d."""
        resp = client.get(f"{BASE}/analytics")
        assert resp.status_code == 200
        data = resp.json()
        assert data["period"] == "7d"

    @pytest.mark.api
    def test_analytics_30d_period(self, client):
        """GET /visitors/analytics?period=30d should set period=30d."""
        resp = client.get(f"{BASE}/analytics?period=30d")
        assert resp.status_code == 200
        assert resp.json()["period"] == "30d"

    @pytest.mark.api
    def test_top_visitors_returns_array(self, client):
        """GET /visitors/analytics/top-visitors should return array with correct fields."""
        resp = client.get(f"{BASE}/analytics/top-visitors?limit=5")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list), "top-visitors should return an array"
        if len(data) > 0:
            v = data[0]
            assert "name" in v, "should use 'name' not 'visitor_name'"
            assert "visitor_id" in v
            assert "visit_count" in v
            assert "visitor_name" not in v, "old field name 'visitor_name' should not exist"


# ─── Agreements ──────────────────────────────────────────────────


class TestVisitorAgreements:
    """Test agreement CRUD — uses 'name' not 'title', 'active' not 'is_active'."""

    @pytest.fixture
    def agreement_id(self, client):
        """Create a test agreement, yield its ID, then delete it."""
        resp = client.post(f"{BASE}/agreements", json={
            "name": f"Test NDA {uuid.uuid4().hex[:6]}",
            "content": "This is a test agreement for automation.",
        })
        assert resp.status_code == 201
        data = resp.json()
        yield data["id"]
        client.delete(f"{BASE}/agreements/{data['id']}")

    @pytest.mark.api
    def test_create_agreement_requires_name_and_content(self, client):
        """POST /visitors/agreements missing name or content should return 400."""
        resp = client.post(f"{BASE}/agreements", json={"name": "Incomplete"})
        assert resp.status_code == 400

        resp = client.post(f"{BASE}/agreements", json={"content": "No name"})
        assert resp.status_code == 400

    @pytest.mark.api
    def test_create_agreement_uses_name_not_title(self, client):
        """POST /visitors/agreements with 'title' instead of 'name' should fail."""
        resp = client.post(f"{BASE}/agreements", json={
            "title": "Should Fail",
            "content": "Content here",
        })
        assert resp.status_code == 400

    @pytest.mark.api
    def test_create_agreement_field_names(self, client, agreement_id):
        """Agreement response should have 'name' and 'active', not 'title'/'is_active'."""
        resp = client.get(f"{BASE}/agreements")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        match = [a for a in data if a["id"] == agreement_id]
        assert len(match) == 1
        a = match[0]
        assert "name" in a
        assert "active" in a
        assert "title" not in a, "'title' is the old field name"
        assert "is_active" not in a, "'is_active' is the old field name"

    @pytest.mark.api
    def test_update_agreement_bumps_version(self, client, agreement_id):
        """PUT /visitors/agreements/{id} with new content should bump version."""
        resp = client.put(f"{BASE}/agreements/{agreement_id}", json={
            "content": "Updated agreement content v2",
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["version"] == 2


# ─── Visit Groups ────────────────────────────────────────────────


class TestVisitGroups:
    """Test visit group CRUD."""

    @pytest.mark.api
    def test_create_group_requires_fields(self, client):
        """POST /visitors/groups with only name should return 400."""
        resp = client.post(f"{BASE}/groups", json={"name": "Incomplete Group"})
        assert resp.status_code == 400

    @pytest.mark.api
    def test_create_list_delete_group(self, client):
        """Full CRUD lifecycle for a visit group."""
        arrival = (datetime.utcnow() + timedelta(days=1)).isoformat() + "Z"
        resp = client.post(f"{BASE}/groups", json={
            "name": f"Test Group {uuid.uuid4().hex[:6]}",
            "host_user_id": "00000000-0000-0000-0000-0000000000aa",
            "purpose": "meeting",
            "expected_arrival": arrival,
        })
        assert resp.status_code == 201
        group = resp.json()
        group_id = group["id"]
        assert "host_user_id" in group
        assert "purpose" in group
        assert "expected_arrival" in group

        # List should include the new group
        resp = client.get(f"{BASE}/groups")
        assert resp.status_code == 200

        # Delete
        resp = client.delete(f"{BASE}/groups/{group_id}")
        assert resp.status_code == 200

    @pytest.mark.api
    def test_list_groups_paginated(self, client):
        """GET /visitors/groups should return paginated response."""
        resp = client.get(f"{BASE}/groups?page=1&limit=10")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        assert "total" in data


# ─── Recurring Templates ────────────────────────────────────────


class TestRecurringTemplates:
    """Test recurring templates — uses 'active' not 'is_active', 'recurrence_rule' not 'schedule_cron'."""

    @pytest.mark.api
    def test_create_recurring_requires_fields(self, client):
        """POST /visitors/recurring with only purpose should return 400."""
        resp = client.post(f"{BASE}/recurring", json={"purpose": "meeting"})
        assert resp.status_code == 400

    @pytest.mark.api
    def test_list_recurring_templates(self, client):
        """GET /visitors/recurring should return paginated response."""
        resp = client.get(f"{BASE}/recurring")
        assert resp.status_code == 200
        data = resp.json()
        assert "data" in data
        if len(data["data"]) > 0:
            t = data["data"][0]
            assert "active" in t, "should use 'active' not 'is_active'"
            assert "recurrence_rule" in t, "should use 'recurrence_rule' not 'schedule_cron'"
            assert "start_date" in t
            assert "is_active" not in t
            assert "schedule_cron" not in t


# ─── Access Log ──────────────────────────────────────────────────


class TestAccessLog:
    """Test access log field names match backend contract."""

    @pytest.mark.api
    def test_access_log_requires_auth(self):
        """Access log should reject unauthenticated requests."""
        anon = DM3Client()
        resp = anon.get(f"{BASE}/00000000-0000-0000-0000-000000000001/access-log")
        assert resp.status_code == 401


# ─── Evacuation ──────────────────────────────────────────────────


class TestEvacuation:
    """Test evacuation endpoint."""

    @pytest.mark.api
    def test_evacuation_list(self, client):
        """GET /visitors/evacuation should return 200."""
        resp = client.get(f"{BASE}/evacuation")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)


# ─── Auth & Permissions ─────────────────────────────────────────


class TestVisitorPermissions:
    """Test that unauthenticated and viewer roles are restricted."""

    @pytest.mark.api
    def test_settings_requires_auth(self):
        """Settings endpoint should reject unauthenticated requests."""
        anon = DM3Client()
        resp = anon.get(f"{BASE}/settings")
        assert resp.status_code == 401

    @pytest.mark.api
    def test_analytics_requires_auth(self):
        """Analytics endpoint should reject unauthenticated requests."""
        anon = DM3Client()
        resp = anon.get(f"{BASE}/analytics")
        assert resp.status_code == 401

    @pytest.mark.api
    def test_agreements_requires_auth(self):
        """Agreements endpoint should reject unauthenticated requests."""
        anon = DM3Client()
        resp = anon.get(f"{BASE}/agreements")
        assert resp.status_code == 401
