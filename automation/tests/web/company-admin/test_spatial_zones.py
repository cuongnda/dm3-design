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


def create_zone(api, name: str):
    response = api.post(
        f"{ACCESS_BASE}/zones",
        json={
            "name": name,
            "description": "Fixture zone for AP placement",
            "timezone": "Asia/Ho_Chi_Minh",
            "building": "Tower Seed",
            "floor": "L1",
            "map_image_url": "https://example.com/seed-map.png",
            "map_image_width": 1600,
            "map_image_height": 900,
            "map_metadata": {"origin": "top-left"},
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def find_zone_by_name(page, name: str):
    rows = page.locator("table tbody tr")
    for idx in range(rows.count()):
        row = rows.nth(idx)
        if name in (row.inner_text() or ""):
            return row
    raise AssertionError(f"Zone row not found for {name}")


def select_option_by_text(page, trigger, option_text: str):
    trigger.click()
    option = page.locator("button").filter(has_text=option_text).last
    option.wait_for(state="visible", timeout=10000)
    option.click()


class TestSpatialZones:
    @pytest.mark.web
    def test_create_and_update_zone_with_spatial_metadata(self, page, api, cleanup_ids):
        suffix = uuid.uuid4().hex[:6]
        zone_name = f"E2E Zone {suffix}"
        updated_name = f"{zone_name} Updated"
        map_url = f"https://example.com/maps/{suffix}.png"
        updated_map_url = f"https://example.com/maps/{suffix}-v2.png"

        login_as_admin(page)
        page.goto(f"{constants.WEB_URL}/access/zones")
        page.wait_for_load_state("networkidle")

        page.get_by_role("button", name=re.compile("Add Zone", re.I)).click()
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
        page.screenshot(path="/tmp/dm3-zone-before-save.png", full_page=True)
        modal.get_by_role("button", name=re.compile("Save", re.I)).click()
        expect_row = page.locator("table tbody tr").filter(has_text=zone_name).first
        expect_row.wait_for(state="visible", timeout=15000)

        zone_resp = api.get(f"{ACCESS_BASE}/zones?limit=200&search={zone_name}")
        assert zone_resp.status_code == 200, zone_resp.text
        zone_body = zone_resp.json()
        zone_items = zone_body.get("data") or zone_body.get("items") or []
        created_zone = next((item for item in zone_items if item["name"] == zone_name), None)
        assert created_zone, zone_body
        cleanup_ids["zones"].append(created_zone["id"])
        created_detail_resp = api.get(f"{ACCESS_BASE}/zones/{created_zone['id']}")
        assert created_detail_resp.status_code == 200, created_detail_resp.text
        created_detail = created_detail_resp.json().get("zone") or created_detail_resp.json()
        assert created_detail["timezone"] == "Asia/Bangkok"
        assert created_detail["building"] == "Tower Alpha"
        assert created_detail["floor"] == "L12"
        assert created_detail["map_image_url"] == map_url
        assert "Configured" in expect_row.inner_text()

        row = find_zone_by_name(page, zone_name)
        row.locator("button").last.click()
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

        updated_row = page.locator("table tbody tr").filter(has_text=updated_name).first
        updated_row.wait_for(state="visible", timeout=15000)
        page.screenshot(path="/tmp/dm3-zone-after-save.png", full_page=True)
        body_text = page.locator("body").inner_text()
        assert "Internal Server Error" not in body_text

        updated_resp = api.get(f"{ACCESS_BASE}/zones/{created_zone['id']}")
        assert updated_resp.status_code == 200, updated_resp.text
        updated_body = updated_resp.json()
        updated_zone = updated_body.get("zone") or updated_body
        assert updated_zone["name"] == updated_name
        assert updated_zone["timezone"] == "Asia/Tokyo"
        assert updated_zone["building"] == "Tower Beta"
        assert updated_zone["floor"] == "L15"
        assert updated_zone["map_image_url"] == updated_map_url
        assert "Tower Beta" in updated_row.inner_text()
        assert "Asia/Tokyo" in updated_row.inner_text()

    @pytest.mark.web
    def test_create_and_update_access_point_with_zone_placement(self, page, api, cleanup_ids):
        suffix = uuid.uuid4().hex[:6]
        zone = create_zone(api, f"E2E Placement Zone {suffix}")
        cleanup_ids["zones"].append(zone["id"])

        ap_name = f"E2E AP {suffix}"
        updated_ap_name = f"{ap_name} Updated"

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
        page.screenshot(path="/tmp/dm3-access-point-before-save.png", full_page=True)
        modal.get_by_role("button", name=re.compile("Save", re.I)).click()

        card = page.locator("text=" + ap_name).first
        card.wait_for(state="visible", timeout=15000)
        page.locator("text=" + zone["name"]).first.wait_for(state="visible", timeout=15000)

        ap_search = api.get(f"{ACCESS_BASE}/access-points?limit=200&search={ap_name}")
        assert ap_search.status_code == 200, ap_search.text
        ap_body = ap_search.json()
        ap_items = ap_body.get("data") or ap_body.get("items") or []
        created_ap = next((item for item in ap_items if item["name"] == ap_name), None)
        assert created_ap, ap_body
        cleanup_ids["access_points"].append(created_ap["id"])
        created_ap_detail_resp = api.get(f"{ACCESS_BASE}/access-points/{created_ap['id']}")
        assert created_ap_detail_resp.status_code == 200, created_ap_detail_resp.text
        created_ap_detail = created_ap_detail_resp.json().get("access_point") or created_ap_detail_resp.json()
        assert created_ap_detail["zone_id"] == zone["id"]
        assert created_ap_detail["map_x"] == pytest.approx(0.25)
        assert created_ap_detail["map_y"] == pytest.approx(0.75)
        assert created_ap_detail["map_rotation"] == pytest.approx(15)

        page.goto(f"{constants.WEB_URL}/access/access-points/{created_ap['id']}")
        page.wait_for_load_state("networkidle")
        page.get_by_role("button", name=re.compile("Edit", re.I)).click()
        edit_modal = page.locator('[role="dialog"]').last
        edit_modal.locator("#edit-ap-name").fill(updated_ap_name)
        edit_modal.locator("#edit-ap-desc").fill("Updated placement via detail page")
        edit_modal.locator("#edit-ap-map-x").fill("0.55")
        edit_modal.locator("#edit-ap-map-y").fill("0.35")
        edit_modal.locator("#edit-ap-map-rotation").fill("90")
        edit_modal.locator("#edit-ap-map-label").fill("West Door")
        edit_modal.get_by_role("button", name=re.compile("Save", re.I)).click()

        page.get_by_role("heading", name=updated_ap_name).wait_for(state="visible", timeout=15000)
        page.screenshot(path="/tmp/dm3-access-point-after-save.png", full_page=True)
        detail_text = page.locator("body").inner_text()
        assert "Internal Server Error" not in detail_text

        page.goto(f"{constants.WEB_URL}/access/access-points")
        page.wait_for_load_state("networkidle")
        listing_text = page.locator("body").inner_text()
        assert updated_ap_name in listing_text
        assert zone["name"] in listing_text

        ap_detail = api.get(f"{ACCESS_BASE}/access-points/{created_ap['id']}")
        assert ap_detail.status_code == 200, ap_detail.text
        ap_detail_body = ap_detail.json()
        updated_ap = ap_detail_body.get("access_point") or ap_detail_body
        assert updated_ap["name"] == updated_ap_name
        assert updated_ap["zone_id"] == zone["id"]
        assert updated_ap["map_x"] == pytest.approx(0.55)
        assert updated_ap["map_y"] == pytest.approx(0.35)
        assert updated_ap["map_rotation"] == pytest.approx(90)
