"""
E2E tests for spatial zone workflows.
Covers zone spatial metadata and access point placement tied to zones.
"""
import re
import uuid
import pytest

from common.api_client import APIClient
from common import constants

ACCESS_BASE = "/api/v1/access"


@pytest.fixture(scope="module")
def api():
    client = APIClient(base_url=constants.WEB_URL)
    client.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    return client


@pytest.fixture
def cleanup_ids(api):
    zone_ids: list[str] = []
    access_point_ids: list[str] = []
    yield {"zones": zone_ids, "access_points": access_point_ids}
    for ap_id in reversed(access_point_ids):
        api.delete(f"{ACCESS_BASE}/access-points/{ap_id}")
    for zone_id in reversed(zone_ids):
        api.delete(f"{ACCESS_BASE}/zones/{zone_id}")


def login_as_admin(page):
    page.goto(f"{constants.WEB_URL}/login")
    page.locator('[data-testid="login-input-email"]').fill(constants.ADMIN_EMAIL)
    page.locator('[data-testid="login-input-password"]').fill(constants.ADMIN_PASSWORD)
    page.locator('[data-testid="login-button-submit"]').click()
    page.wait_for_url(f"{constants.WEB_URL}/", timeout=15000)
    page.wait_for_load_state("networkidle")


def create_zone(api, name: str, parent_id: str | None = None):
    payload = {
        "name": name,
        "description": "Fixture zone for AP placement",
        "timezone": "Asia/Ho_Chi_Minh",
        "building": "Tower Seed",
        "floor": "L1",
        "map_image_url": "https://example.com/seed-map.png",
        "map_image_width": 1600,
        "map_image_height": 900,
        "map_metadata": {"origin": "top-left"},
    }
    if parent_id:
        payload["parent_id"] = parent_id
    response = api.post(
        f"{ACCESS_BASE}/zones",
        json=payload,
    )
    assert response.status_code == 201, response.text
    return response.json()


def find_zone_node_by_name(page, name: str):
    nodes = page.locator('[data-testid^="zones-tree-node-"]')
    for idx in range(nodes.count()):
        node = nodes.nth(idx)
        if name in (node.inner_text() or ""):
            return node
    raise AssertionError(f"Zone node not found for {name}")


def select_option_by_text(page, trigger, option_text: str):
    trigger.click()
    option = page.locator("button").filter(has_text=option_text).last
    option.wait_for(state="visible", timeout=10000)
    option.click()


class TestSpatialZones:
    @pytest.mark.web
    def test_create_and_update_zone_with_tree_navigation(self, page, api, cleanup_ids):
        suffix = uuid.uuid4().hex[:6]
        zone_name = f"E2E Zone {suffix}"
        updated_name = f"{zone_name} Updated"
        child_name = f"E2E Child Zone {suffix}"
        map_url = f"https://example.com/maps/{suffix}.png"
        updated_map_url = f"https://example.com/maps/{suffix}-v2.png"

        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/zones")
        page.wait_for_load_state("networkidle")

        page.get_by_test_id("zones-button-add").click()
        modal = page.locator('[role="dialog"]').last
        modal.locator("#zone-name").fill(zone_name)
        modal.locator("#zone-description").fill("Created by Playwright spatial zone test")
        modal.locator("input").nth(2).fill("Asia/Bangkok")
        modal.locator("input").nth(3).fill("123 E2E Street")
        modal.locator("input").nth(4).fill("Tower Alpha")
        modal.locator("input").nth(5).fill("L12")
        modal.locator("input").nth(6).fill("10.762622")
        modal.locator("input").nth(7).fill("106.660172")
        modal.locator("input").nth(8).fill(map_url)
        modal.locator("input").nth(9).fill("2048")
        modal.locator("input").nth(10).fill("1024")
        modal.get_by_role("button", name=re.compile("Save", re.I)).click()

        root_resp = api.get(f"{ACCESS_BASE}/zones?limit=200&search={zone_name}")
        assert root_resp.status_code == 200, root_resp.text
        root_items = root_resp.json().get("data") or []
        created_zone = next((item for item in root_items if item["name"] == zone_name), None)
        assert created_zone, root_resp.json()
        cleanup_ids["zones"].append(created_zone["id"])

        child_zone = create_zone(api, child_name, parent_id=created_zone["id"])
        cleanup_ids["zones"].append(child_zone["id"])

        page.reload()
        page.wait_for_load_state("networkidle")
        root_node = find_zone_node_by_name(page, zone_name)
        assert "Map ready" in root_node.inner_text() or "Đã có bản đồ" in root_node.inner_text()
        child_node = find_zone_node_by_name(page, child_name)
        assert child_name in child_node.inner_text()

        page.get_by_test_id("zones-input-search").fill(child_name)
        filtered_root = find_zone_node_by_name(page, zone_name)
        filtered_child = find_zone_node_by_name(page, child_name)
        assert zone_name in filtered_root.inner_text()
        assert child_name in filtered_child.inner_text()

        page.get_by_test_id("zones-input-search").fill("")
        root_node.get_by_test_id(f"zones-tree-open-{created_zone['id']}").click()
        page.wait_for_url(re.compile(r"/access/zones/" + created_zone["id"]))
        page.get_by_test_id(f"zone-detail-child-{child_zone['id']}").wait_for(state="visible", timeout=15000)

        page.goto(f"{constants.WEB_URL}/access/zones")
        page.wait_for_load_state("networkidle")
        root_node = find_zone_node_by_name(page, zone_name)
        root_node.get_by_test_id(f"zones-row-menu-{created_zone['id']}").click()
        page.get_by_role("menuitem", name=re.compile("Edit", re.I)).click()

        edit_modal = page.locator('[role="dialog"]').last
        edit_modal.locator("#zone-name").fill(updated_name)
        edit_modal.locator("#zone-description").fill("Updated by Playwright spatial zone test")
        edit_modal.locator("input").nth(2).fill("Asia/Tokyo")
        edit_modal.locator("input").nth(4).fill("Tower Beta")
        edit_modal.locator("input").nth(5).fill("L15")
        edit_modal.locator("input").nth(8).fill(updated_map_url)
        edit_modal.locator("input").nth(9).fill("4096")
        edit_modal.locator("input").nth(10).fill("2048")
        edit_modal.get_by_role("button", name=re.compile("Save", re.I)).click()

        updated_node = find_zone_node_by_name(page, updated_name)
        body_text = page.locator("body").inner_text()
        assert "Internal Server Error" not in body_text
        assert "Tower Beta" in updated_node.inner_text()
        assert "Asia/Tokyo" in updated_node.inner_text()

        updated_resp = api.get(f"{ACCESS_BASE}/zones/{created_zone['id']}")
        assert updated_resp.status_code == 200, updated_resp.text
        updated_zone = updated_resp.json().get("zone") or updated_resp.json()
        assert updated_zone["name"] == updated_name
        assert updated_zone["timezone"] == "Asia/Tokyo"
        assert updated_zone["building"] == "Tower Beta"
        assert updated_zone["floor"] == "L15"
        assert updated_zone["map_image_url"] == updated_map_url

    @pytest.mark.web
    def test_zone_detail_map_view_updates_access_point_coordinates(self, page, api, cleanup_ids):
        suffix = uuid.uuid4().hex[:6]
        zone = create_zone(api, f"E2E Placement Zone {suffix}")
        cleanup_ids["zones"].append(zone["id"])

        ap_name = f"E2E AP {suffix}"

        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/access-points")
        page.wait_for_load_state("networkidle")

        page.get_by_role("button", name=re.compile("New Access Point", re.I)).click()
        modal = page.locator('[role="dialog"]').last
        modal.locator("#ap-name").fill(ap_name)
        modal.locator("#ap-description").fill("Created with zone placement")
        select_option_by_text(page, modal.locator('button[data-slot="select"]').first, zone["name"])
        modal.locator("#ap-map-x").fill("0.25")
        modal.locator("#ap-map-y").fill("0.75")
        modal.locator("#ap-map-rotation").fill("15")
        modal.locator("#ap-map-label").fill("North Gate")
        modal.get_by_role("button", name=re.compile("Save", re.I)).click()

        ap_search = api.get(f"{ACCESS_BASE}/access-points?limit=200&search={ap_name}")
        assert ap_search.status_code == 200, ap_search.text
        ap_items = ap_search.json().get("data") or []
        created_ap = next((item for item in ap_items if item["name"] == ap_name), None)
        assert created_ap, ap_search.json()
        cleanup_ids["access_points"].append(created_ap["id"])

        page.goto(f"{constants.WEB_URL}/access/zones/{zone['id']}")
        page.wait_for_load_state("networkidle")
        page.get_by_test_id("zone-detail-tab-map").click()
        marker = page.get_by_test_id(f"zone-detail-marker-{created_ap['id']}")
        marker.wait_for(state="visible", timeout=15000)
        box = page.get_by_test_id("zone-detail-map-canvas").bounding_box()
        marker_box = marker.bounding_box()
        assert box is not None
        assert marker_box is not None
        page.mouse.move(marker_box["x"] + marker_box["width"] / 2, marker_box["y"] + marker_box["height"] / 2)
        page.mouse.down()
        page.mouse.move(box["x"] + box["width"] * 0.58, box["y"] + box["height"] * 0.32, steps=10)
        page.mouse.up()
        page.get_by_test_id(f"zone-detail-save-{created_ap['id']}").click()
        page.wait_for_timeout(1000)

        ap_detail = api.get(f"{ACCESS_BASE}/access-points/{created_ap['id']}")
        assert ap_detail.status_code == 200, ap_detail.text
        updated_ap = ap_detail.json().get("access_point") or ap_detail.json()
        assert updated_ap["zone_id"] == zone["id"]
        assert updated_ap["map_x"] == pytest.approx(0.58, abs=0.05)
        assert updated_ap["map_y"] == pytest.approx(0.32, abs=0.05)
