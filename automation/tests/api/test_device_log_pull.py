"""
API Tests: Remote device log pull.

Covers the feature introduced in migration 000054:
    - POST   /api/v1/gateway/devices/{id}/logs/request
    - GET    /api/v1/gateway/devices/{id}/logs
    - GET    /api/v1/gateway/devices/{id}/logs/{request_id}

Wire spec: docs/architecture/mqtt-protocol.md §6.5.
Simulator contract: simulator/src/dm3_simulator/device.py._handle_log_request
(see docs/specs/devices/android-terminal.md §13.3 for the real-firmware spec
the simulator emulates — gzip text file, PUT to presigned URL, publish
cmd.logs.resp).

These tests exercise the full round-trip when a simulator device is connected.
They skip cleanly when no simulator is running so the api-only CI lane still
passes.
"""
from __future__ import annotations

import time
import uuid

import pytest

from common import constants
from common.api_client import DM3Client

BASE = "/api/v1/gateway/devices"


def _wait_for_status(client: DM3Client, device_db_id: str, request_id: str,
                     target: str, timeout_s: float = 10.0) -> dict:
    """Poll the request detail until status reaches `target` or timeout.

    The simulator upload path (gzip + PUT to MinIO + publish ack) typically
    resolves in well under a second, but we give it a few seconds for
    CI machines that are slower or when MinIO is reaching out over a link.
    """
    deadline = time.time() + timeout_s
    last_body: dict = {}
    while time.time() < deadline:
        resp = client.get(f"{BASE}/{device_db_id}/logs/{request_id}")
        assert resp.status_code == 200, f"GET detail failed: {resp.status_code} {resp.text}"
        last_body = resp.json()
        if last_body.get("status") == target:
            return last_body
        if last_body.get("status") == "failed":
            return last_body
        time.sleep(0.3)
    return last_body


@pytest.fixture(scope="module")
def admin_client():
    c = DM3Client()
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    return c


@pytest.fixture(scope="module")
def test_device(admin_client):
    """Create an isolated device so tests never collide with a real one.

    Device is a bare row — no simulator subscription — so lifecycle tests
    (request goes to 'sent' and stays there until a real device / simulator
    picks it up) work without requiring a live simulator.
    """
    uid = uuid.uuid4().hex[:6]
    resp = admin_client.post(BASE, json={
        "device_id": f"LOGPULL-{uid}",
        "name": f"Log Pull Test {uid}",
        "type": "terminal",
        "location": "Test Lab",
    })
    assert resp.status_code == 201, f"Create device failed: {resp.status_code} {resp.text}"
    data = resp.json()
    yield data
    admin_client.delete(f"{BASE}/{data['id']}")


# ── Validation ──────────────────────────────────────────────────────────────

class TestRequestValidation:
    @pytest.mark.api
    def test_unknown_device_returns_404(self, admin_client):
        resp = admin_client.post(
            f"{BASE}/00000000-0000-0000-0000-000000000000/logs/request",
            json={},
        )
        assert resp.status_code == 404

    @pytest.mark.api
    def test_invalid_level_min_returns_400(self, admin_client, test_device):
        resp = admin_client.post(
            f"{BASE}/{test_device['id']}/logs/request",
            json={"level_min": "bogus"},
        )
        assert resp.status_code == 400
        body = resp.json()
        assert "level_min" in (body.get("error") or body.get("message") or "")

    @pytest.mark.api
    def test_lines_max_zero_returns_400(self, admin_client, test_device):
        resp = admin_client.post(
            f"{BASE}/{test_device['id']}/logs/request",
            json={"lines_max": 0},
        )
        assert resp.status_code == 400

    @pytest.mark.api
    def test_lines_max_over_cap_returns_400(self, admin_client, test_device):
        resp = admin_client.post(
            f"{BASE}/{test_device['id']}/logs/request",
            json={"lines_max": 5_000_000},
        )
        assert resp.status_code == 400


# ── Request + list ──────────────────────────────────────────────────────────

class TestRequestCreation:
    @pytest.mark.api
    def test_empty_body_creates_sent_row(self, admin_client, test_device):
        """POST with no filters should still work — server uses sensible defaults."""
        resp = admin_client.post(f"{BASE}/{test_device['id']}/logs/request", json={})
        assert resp.status_code == 202, f"{resp.status_code} {resp.text}"
        body = resp.json()
        assert body["status"] == "sent"
        assert body["request_id"]
        assert body["object_key"].startswith("tenants/")
        assert body["object_key"].endswith(".txt.gz")
        assert body["device_id"] == test_device["device_id"]

    @pytest.mark.api
    def test_filters_are_echoed_back(self, admin_client, test_device):
        from_ts = int(time.time() * 1000) - 3_600_000
        to_ts = int(time.time() * 1000)
        resp = admin_client.post(
            f"{BASE}/{test_device['id']}/logs/request",
            json={
                "from_ts": from_ts,
                "to_ts": to_ts,
                "lines_max": 500,
                "level_min": "warn",
            },
        )
        assert resp.status_code == 202
        body = resp.json()
        assert body["from_ts"] == from_ts
        assert body["to_ts"] == to_ts
        assert body["lines_max"] == 500
        assert body["level_min"] == "warn"

    @pytest.mark.api
    def test_list_includes_recent_requests(self, admin_client, test_device):
        # One fresh request, then list and confirm it's there.
        post = admin_client.post(f"{BASE}/{test_device['id']}/logs/request", json={})
        assert post.status_code == 202
        request_id = post.json()["request_id"]

        resp = admin_client.get(f"{BASE}/{test_device['id']}/logs")
        assert resp.status_code == 200
        body = resp.json()
        items = body.get("items") or []
        assert any(it["request_id"] == request_id for it in items), (
            f"newly-created request {request_id} not in list"
        )

    @pytest.mark.api
    def test_detail_by_request_id(self, admin_client, test_device):
        post = admin_client.post(f"{BASE}/{test_device['id']}/logs/request", json={})
        assert post.status_code == 202
        request_id = post.json()["request_id"]

        resp = admin_client.get(f"{BASE}/{test_device['id']}/logs/{request_id}")
        assert resp.status_code == 200
        body = resp.json()
        assert body["request_id"] == request_id
        # Still 'sent' until (a) a real device / simulator acks, or (b) the
        # upload_url expires and a retention job flips status. Both valid
        # outcomes depending on when the test runs.
        assert body["status"] in ("sent", "uploaded", "failed", "expired")
        # download_url only appears when the device actually uploaded.
        if body["status"] != "uploaded":
            assert not body.get("download_url")

    @pytest.mark.api
    def test_detail_unknown_request_returns_404(self, admin_client, test_device):
        resp = admin_client.get(
            f"{BASE}/{test_device['id']}/logs/00000000-0000-0000-0000-000000000000"
        )
        assert resp.status_code == 404

    @pytest.mark.api
    def test_cross_device_request_isolation(self, admin_client, test_device):
        """A request created for device A must NOT be visible under device B."""
        # Create a second device.
        uid = uuid.uuid4().hex[:6]
        second = admin_client.post(BASE, json={
            "device_id": f"LOGPULL-OTHER-{uid}",
            "name": f"Log Pull Isolation {uid}",
            "type": "terminal",
            "location": "Test Lab",
        })
        assert second.status_code == 201
        second_id = second.json()["id"]
        try:
            post = admin_client.post(f"{BASE}/{test_device['id']}/logs/request", json={})
            request_id = post.json()["request_id"]

            resp = admin_client.get(f"{BASE}/{second_id}/logs/{request_id}")
            assert resp.status_code == 404, "request leaked across devices"
        finally:
            admin_client.delete(f"{BASE}/{second_id}")


# ── Round-trip with simulator (opt-in) ──────────────────────────────────────

class TestSimulatorRoundTrip:
    """End-to-end tests that only run when a simulator device is online.

    The simulator subscribes to /cmd, handles cmd.logs, uploads a synthetic
    gzipped log and publishes cmd.logs.resp (see simulator/device.py:_handle_log_request).
    When a real device / simulator is attached to a device_id, the request
    flips to 'uploaded' within a second or two.
    """

    @pytest.mark.api
    def test_round_trip_uploaded_within_timeout(self, admin_client):
        """Find an online device, request a log, wait for 'uploaded'.

        Skips gracefully when no device reports status='online' — avoids
        failing on dev boxes that don't run the simulator alongside pytest.
        """
        list_resp = admin_client.get(BASE)
        assert list_resp.status_code == 200
        body = list_resp.json()
        devices = body.get("devices") or body.get("data") or []
        online = [d for d in devices if d.get("status") == "online"]
        if not online:
            pytest.skip("no online device available for simulator round-trip")

        device = online[0]
        post = admin_client.post(f"{BASE}/{device['id']}/logs/request", json={
            "lines_max": 100,
            "level_min": "info",
        })
        assert post.status_code == 202, f"{post.status_code} {post.text}"
        request_id = post.json()["request_id"]

        final = _wait_for_status(admin_client, device["id"], request_id, "uploaded",
                                 timeout_s=15.0)
        assert final.get("status") == "uploaded", (
            f"round-trip did not complete: final state {final}"
        )
        assert final.get("lines_uploaded", 0) > 0
        assert final.get("bytes", 0) > 0
        # download_url must be present on completed requests so the admin UI
        # can hand it to the browser.
        assert final.get("download_url", "").startswith("http"), (
            f"missing download_url on uploaded row: {final}"
        )
