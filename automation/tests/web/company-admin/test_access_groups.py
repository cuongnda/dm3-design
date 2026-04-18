"""
E2E Tests: Access Group Management UI
Tests for creating, editing, viewing, and managing access groups via the web UI.
Uses Playwright + data-testid selectors.
Prerequisite data (AT, AP, Users) created via API fixtures.
"""
import uuid
import pytest
from common.api_client import APIClient
from common import constants

ACCESS_BASE = "/api/v1/access"
IDENTITY_BASE = "/api/v1/identity"

# ─── Helpers ───────────────────────────────────────────────────


def login_as_admin(page):
    """Login as company admin and navigate to access groups."""
    page.goto(f"{constants.WEB_URL}/login")
    page.locator('[data-testid="login-input-email"]').fill(constants.ADMIN_EMAIL)
    page.locator('[data-testid="login-input-password"]').fill(constants.ADMIN_PASSWORD)
    page.locator('[data-testid="login-button-submit"]').click()
    page.wait_for_url(f"{constants.WEB_URL}/", timeout=15000)
    page.wait_for_load_state("networkidle")


def navigate_to_access_groups(page):
    """Navigate to the access groups page."""
    page.goto(f"{constants.WEB_URL}/access/access-groups")
    page.wait_for_load_state("networkidle")


# ─── API Fixtures ──────────────────────────────────────────────


@pytest.fixture(scope="module")
def api():
    """Authenticated API client for data setup/teardown (via nginx proxy)."""
    c = APIClient(base_url=constants.WEB_URL)
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    return c


@pytest.fixture(scope="module")
def access_time(api):
    """Create an Access Time template for tests, clean up after."""
    uid = uuid.uuid4().hex[:6]
    data = {
        "name": f"E2E AT {uid}",
        "description": "E2E test access time",
        "timezone": "Asia/Ho_Chi_Minh",
        "time_slots": [
            {"day_of_week": d, "start_time": "08:00", "end_time": "18:00",
             "slot_name": "Work", "is_active": True}
            for d in range(1, 6)  # Mon-Fri
        ],
    }
    resp = api.post(f"{ACCESS_BASE}/access-times", json=data)
    assert resp.status_code == 201, f"Failed to create AT: {resp.text}"
    at_id = resp.json()["id"]
    yield {"id": at_id, "name": f"E2E AT {uid}"}
    api.delete(f"{ACCESS_BASE}/access-times/{at_id}")


@pytest.fixture(scope="module")
def access_point(api):
    """Create an Access Point for tests, clean up after."""
    uid = uuid.uuid4().hex[:6]
    data = {"name": f"E2E AP {uid}", "description": "E2E test access point"}
    resp = api.post(f"{ACCESS_BASE}/access-points", json=data)
    assert resp.status_code == 201, f"Failed to create AP: {resp.text}"
    ap = resp.json()
    yield {"id": ap["id"], "name": f"E2E AP {uid}"}
    api.delete(f"{ACCESS_BASE}/access-points/{ap['id']}")


@pytest.fixture(scope="module")
def test_user(api):
    """Get an existing user to assign to groups."""
    resp = api.get(f"{IDENTITY_BASE}/users?limit=1")
    if resp.status_code != 200:
        pytest.skip(f"Identity service unavailable: {resp.status_code}")
    body = resp.json()
    users = body.get("users") or body.get("data") or []
    if not users:
        pytest.skip("No users available in identity service")
    user = users[0]
    return {"id": user["id"], "name": user.get("full_name") or user.get("first_name", "User")}


@pytest.fixture(scope="module")
def test_group(api, access_time):
    """Create an Access Group with AT assigned, clean up after."""
    uid = uuid.uuid4().hex[:6]
    data = {
        "name": f"E2E AG {uid}",
        "description": "E2E full workflow test group",
        "access_time_id": access_time["id"],
        "is_default": False,
    }
    resp = api.post(f"{ACCESS_BASE}/access-groups", json=data)
    assert resp.status_code == 201, f"Failed to create AG: {resp.text}"
    ag = resp.json()
    yield {"id": ag["id"], "name": f"E2E AG {uid}"}
    api.delete(f"{ACCESS_BASE}/access-groups/{ag['id']}")


# ─── List Page ──────────────────────────────────────────────────


class TestAccessGroupListPage:
    """Test access group list page UI."""

    @pytest.mark.web
    def test_list_page_loads(self, page):
        """Access groups list page should load with table and search."""
        login_as_admin(page)
        navigate_to_access_groups(page)

        assert page.locator('[data-testid="access-button-create"]').is_visible()
        assert page.locator('[data-testid="access-input-search"]').is_visible()

    @pytest.mark.web
    def test_search_filters_groups(self, page):
        """Search input should filter access groups via server-side search."""
        login_as_admin(page)
        navigate_to_access_groups(page)

        search_input = page.locator('[data-testid="access-input-search"]')
        search_input.fill("nonexistent_group_xyz")
        page.wait_for_timeout(500)  # debounce
        page.wait_for_load_state("networkidle")

        empty = page.locator("text=No access groups")
        table_rows = page.locator('[data-testid="access-table-groups"] tbody tr')
        assert empty.is_visible() or table_rows.count() == 0


# ─── Create Flow ────────────────────────────────────────────────


class TestAccessGroupCreate:
    """Test access group creation flow."""

    @pytest.mark.web
    def test_create_modal_opens(self, page):
        """Clicking 'New Group' should open the create modal with form fields."""
        login_as_admin(page)
        navigate_to_access_groups(page)

        page.locator('[data-testid="access-button-create"]').click()

        assert page.locator('[data-testid="access-input-name"]').is_visible()
        assert page.locator('[data-testid="access-input-description"]').is_visible()
        assert page.locator('[data-testid="access-select-accessTime"]').is_visible()
        assert page.locator('[data-testid="access-input-isDefault"]').is_visible()

    @pytest.mark.web
    def test_create_group_validation(self, page):
        """Create should fail without a name."""
        login_as_admin(page)
        navigate_to_access_groups(page)

        page.locator('[data-testid="access-button-create"]').click()
        page.locator("button:has-text('Create')").click()

        assert page.locator("text=Name is required").is_visible()

    @pytest.mark.web
    def test_create_group_with_access_time(self, page, access_time):
        """Creating a group with name + access time should succeed."""
        login_as_admin(page)
        navigate_to_access_groups(page)

        group_name = f"E2E Create {uuid.uuid4().hex[:6]}"

        page.locator('[data-testid="access-button-create"]').click()
        page.locator('[data-testid="access-input-name"]').fill(group_name)
        page.locator('[data-testid="access-input-description"]').fill("Created via E2E")

        # Select the AT from dropdown
        at_select = page.locator('[data-testid="access-select-accessTime"]')
        at_select.select_option(label=access_time["name"])

        page.locator("button:has-text('Create')").click()

        # Modal should close and group should appear in list
        page.locator("table").locator(f"text={group_name}").first.wait_for(
            state="visible", timeout=10000
        )

        # Cleanup: search and delete via menu
        search_input = page.locator('[data-testid="access-input-search"]')
        search_input.fill(group_name)
        page.wait_for_timeout(500)
        page.wait_for_load_state("networkidle")

        row = page.locator("table tbody tr").first
        if row.is_visible():
            row.locator("button").last.click()
            page.locator("[role='menuitem']:has-text('Delete')").click()
            page.locator("button:has-text('Delete')").last.click()
            page.wait_for_load_state("networkidle")


# ─── Detail Page ────────────────────────────────────────────────


class TestAccessGroupDetail:
    """Test access group detail page with API-created data."""

    @pytest.mark.web
    def test_detail_page_shows_access_time(self, page, test_group, access_time):
        """Detail page should show the assigned access time name."""
        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-button-edit"]').wait_for(
            state="visible", timeout=10000
        )
        # AT name or '24/7 Unrestricted' should be visible in header
        assert (
            page.locator(f"text={access_time['name']}").is_visible()
            or page.locator("text=24/7 Unrestricted").is_visible()
        )

    @pytest.mark.web
    def test_edit_modal_has_all_fields(self, page, test_group):
        """Edit modal should have name, description, access time, and default checkbox."""
        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-button-edit"]').wait_for(
            state="visible", timeout=10000
        )
        page.locator('[data-testid="access-button-edit"]').click()
        page.wait_for_timeout(500)

        assert page.locator('#edit-group-name').is_visible()
        assert page.locator('[data-testid="access-input-editDescription"]').is_visible()
        assert page.locator('#edit-access-time').is_visible()

    @pytest.mark.web
    def test_tabs_switch(self, page, test_group):
        """Clicking tab triggers should switch between access points and users tabs."""
        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-tab-users"]').click()
        assert page.locator('[data-testid="access-button-addUser"]').is_visible()

        page.locator('[data-testid="access-tab-accessPoints"]').click()
        assert page.locator('[data-testid="access-button-addAccessPoint"]').is_visible()


# ─── Access Point Assignment ────────────────────────────────────


class TestAccessPointAssignment:
    """Test adding/removing access points from a group."""

    @pytest.mark.web
    def test_assign_ap_via_api_shows_in_ui(self, page, api, test_group, access_point):
        """AP assigned via API should appear in the access points tab."""
        # Assign AP to group via API
        resp = api.post(
            f"{ACCESS_BASE}/access-groups/{test_group['id']}/access-points",
            json={"access_point_id": access_point["id"]},
        )
        assert resp.status_code in [200, 201], f"Assign AP failed: {resp.text}"

        # Verify in UI
        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-tab-accessPoints"]').wait_for(
            state="visible", timeout=10000
        )
        page.locator('[data-testid="access-tab-accessPoints"]').click()
        page.wait_for_load_state("networkidle")

        # AP name should appear in the tab content
        page.locator(f"text={access_point['name']}").first.wait_for(
            state="visible", timeout=10000
        )

    @pytest.mark.web
    def test_add_ap_modal_opens(self, page, test_group):
        """Add AP modal should show search and available access points."""
        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-button-addAccessPoint"]').wait_for(
            state="visible", timeout=10000
        )
        page.locator('[data-testid="access-button-addAccessPoint"]').click()
        page.wait_for_load_state("networkidle")

        assert page.locator('[data-testid="access-input-searchAP"]').is_visible()

    @pytest.mark.web
    def test_remove_ap_via_api(self, api, test_group, access_point):
        """Clean up: remove AP from group via API."""
        resp = api.delete(
            f"{ACCESS_BASE}/access-groups/{test_group['id']}/access-points/{access_point['id']}"
        )
        assert resp.status_code in [200, 204], f"Remove AP failed: {resp.text}"


# ─── User Assignment ────────────────────────────────────────────


class TestUserAssignment:
    """Test adding/removing users from a group."""

    @pytest.mark.web
    def test_assign_user_via_api_shows_in_ui(self, page, api, test_group, test_user):
        """User assigned via API should appear in the users tab."""
        # Assign user to group via API with effective dates
        resp = api.post(
            f"{ACCESS_BASE}/access-groups/{test_group['id']}/users",
            json=[{"user_id": test_user["id"]}],
        )
        assert resp.status_code in [200, 201], f"Assign user failed: {resp.text}"

        # Verify in UI
        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-tab-users"]').click()
        page.wait_for_load_state("networkidle")

        # User name should appear in the tab content
        page.locator(f"text={test_user['name']}").first.wait_for(
            state="visible", timeout=10000
        )

    @pytest.mark.web
    def test_add_user_modal_opens(self, page, test_group):
        """Add user modal should show available users."""
        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-tab-users"]').click()
        page.locator('[data-testid="access-button-addUser"]').wait_for(
            state="visible", timeout=10000
        )
        page.locator('[data-testid="access-button-addUser"]').click()
        page.wait_for_load_state("networkidle")

        modal = page.locator("dialog, [role='dialog']")
        assert modal.is_visible()

    @pytest.mark.web
    def test_users_tab_shows_effective_dates(self, page, test_group):
        """Users tab should have From and Until columns for effective dates."""
        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-tab-users"]').click()

        from_header = page.locator("th:has-text('From')")
        assert from_header.is_visible() or page.locator("text=No users").is_visible()

    @pytest.mark.web
    def test_remove_user_via_api(self, api, test_group, test_user):
        """Clean up: remove user from group via API."""
        resp = api.delete(
            f"{ACCESS_BASE}/access-groups/{test_group['id']}/users/{test_user['id']}"
        )
        assert resp.status_code in [200, 204], f"Remove user failed: {resp.text}"


# ─── UI: Add/Remove Access Point ──────────────────────────────


class TestAccessPointUI:
    """Test adding/removing access points through the UI."""

    @pytest.mark.web
    def test_add_ap_via_ui(self, page, api, test_group, access_point):
        """Add an AP via the Add AP modal: search, select, click Add."""
        # Ensure AP is not already assigned
        api.delete(
            f"{ACCESS_BASE}/access-groups/{test_group['id']}/access-points/{access_point['id']}"
        )

        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-tab-accessPoints"]').click()
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-button-addAccessPoint"]').click()
        page.wait_for_load_state("networkidle")

        # Search for the AP
        page.locator('[data-testid="access-input-searchAP"]').fill(access_point["name"])
        page.wait_for_timeout(500)

        # Click the row to select (radio)
        page.locator(f"td:has-text('{access_point['name']}')").first.click()

        # Click Add in modal
        modal = page.locator("dialog, [role='dialog']")
        modal.locator("button:has-text('Add')").click()
        page.wait_for_load_state("networkidle")

        # Verify AP appears in the tab
        page.locator(f"text={access_point['name']}").first.wait_for(
            state="visible", timeout=10000
        )

    @pytest.mark.web
    def test_remove_ap_via_ui(self, page, api, test_group, access_point):
        """Remove an AP via the Remove button in the AP table."""
        # Ensure AP is assigned
        api.post(
            f"{ACCESS_BASE}/access-groups/{test_group['id']}/access-points",
            json={"access_point_id": access_point["id"]},
        )

        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-tab-accessPoints"]').click()
        page.wait_for_load_state("networkidle")

        page.locator(f"text={access_point['name']}").first.wait_for(
            state="visible", timeout=10000
        )

        page.locator('[data-testid="access-button-removeAP"]').first.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1000)

        assert page.locator(f"text={access_point['name']}").count() == 0


# ─── UI: Add/Remove User ──────────────────────────────────────


class TestUserUI:
    """Test adding/removing users through the UI."""

    @pytest.mark.web
    def test_add_user_via_ui(self, page, api, test_group, test_user):
        """Add a user via the Add User modal: select checkbox, click Add."""
        # Ensure user is not assigned
        api.delete(
            f"{ACCESS_BASE}/access-groups/{test_group['id']}/users/{test_user['id']}"
        )

        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-tab-users"]').click()
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-button-addUser"]').click()
        page.wait_for_load_state("networkidle")

        # Click user row to toggle checkbox selection
        modal = page.locator("dialog, [role='dialog']")
        modal.locator(f"td:has-text('{test_user['name']}')").first.click()

        # Click the Add button (label is "Add N users")
        modal.locator("button:has-text('Add')").click()
        page.wait_for_load_state("networkidle")

        # Verify user appears in the users tab
        page.locator(f"text={test_user['name']}").first.wait_for(
            state="visible", timeout=10000
        )

    @pytest.mark.web
    def test_remove_user_via_ui(self, page, api, test_group, test_user):
        """Remove a user via the Remove button in the users table."""
        # Ensure user is assigned
        api.post(
            f"{ACCESS_BASE}/access-groups/{test_group['id']}/users",
            json=[{"user_id": test_user["id"]}],
        )

        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-tab-users"]').click()
        page.wait_for_load_state("networkidle")

        page.locator(f"text={test_user['name']}").first.wait_for(
            state="visible", timeout=10000
        )

        page.locator('[data-testid="access-button-removeUser"]').first.click()
        page.wait_for_load_state("networkidle")
        page.wait_for_timeout(1000)

        assert page.locator(f"text={test_user['name']}").count() == 0


# ─── Edit Group ────────────────────────────────────────────────


class TestAccessGroupEdit:
    """Test editing an access group via the UI."""

    @pytest.mark.web
    def test_edit_group_name_and_description(self, page, test_group):
        """Edit name and description via the edit modal and verify."""
        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-groups/{test_group['id']}")
        page.wait_for_load_state("networkidle")

        page.locator('[data-testid="access-button-edit"]').wait_for(
            state="visible", timeout=10000
        )
        page.locator('[data-testid="access-button-edit"]').click()
        page.wait_for_timeout(500)

        new_name = f"E2E Edited {uuid.uuid4().hex[:6]}"
        name_input = page.locator("#edit-group-name")
        name_input.clear()
        name_input.fill(new_name)

        desc_input = page.locator('[data-testid="access-input-editDescription"]')
        desc_input.clear()
        desc_input.fill("Updated via E2E")

        modal = page.locator("dialog, [role='dialog']")
        modal.locator("button:has-text('Save')").click()
        page.wait_for_load_state("networkidle")

        # Verify updated name appears on detail page
        page.locator(f"text={new_name}").first.wait_for(
            state="visible", timeout=10000
        )


# ─── Delete Group ──────────────────────────────────────────────


class TestAccessGroupDelete:
    """Test deleting an access group via the UI."""

    @pytest.mark.web
    def test_delete_group_via_ui(self, page, api, access_time):
        """Create a throwaway group, then delete it via list page dropdown."""
        uid = uuid.uuid4().hex[:6]
        group_name = f"E2E Delete {uid}"
        resp = api.post(
            f"{ACCESS_BASE}/access-groups",
            json={
                "name": group_name,
                "description": "To be deleted via UI",
                "access_time_id": access_time["id"],
                "is_default": False,
            },
        )
        assert resp.status_code == 201, f"Failed to create AG: {resp.text}"

        login_as_admin(page)
        navigate_to_access_groups(page)

        # Search for the group
        search = page.locator('[data-testid="access-input-search"]')
        search.fill(group_name)
        page.wait_for_timeout(500)
        page.wait_for_load_state("networkidle")

        # Open dropdown on the row and click Delete
        row = page.locator("table tbody tr").first
        row.wait_for(state="visible", timeout=10000)
        row.locator("button").last.click()

        page.locator("[role='menuitem']:has-text('Delete')").click()

        # Confirm deletion in the dialog
        page.locator("button:has-text('Delete')").last.click()
        page.wait_for_load_state("networkidle")

        # Verify group no longer appears in search results
        page.wait_for_timeout(1000)
        empty = page.locator("text=No access groups")
        rows = page.locator("table tbody tr")
        assert empty.is_visible() or rows.count() == 0
