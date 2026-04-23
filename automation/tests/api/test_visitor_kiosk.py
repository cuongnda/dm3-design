"""
DM3: Visitor Kiosk & QR API Tests

Covers the kiosk-adjacent surface:
    - Public QR lookup (no auth)
    - Kiosk token CRUD (admin-only; cleartext returned once)
    - Legacy /register-visit endpoint reachability & auth semantics

These paths protect the LPR desktop app and printed-QR fast lane. Bugs
here silently break door lobbies, so they get behavioral coverage.
Requires: company admin login with visitor plugin enabled.
"""
from __future__ import annotations

import pytest

from common import constants
from common.api_client import DM3Client
from common.factories import _rand_str

BASE = "/api/v1/visitors"


@pytest.fixture(scope="module")
def client() -> DM3Client:
    c = DM3Client()
    c.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    assert c.token, "admin login did not return an access token"
    return c


# ─── Public QR lookup ──────────────────────────────────────────


@pytest.mark.api
class TestQRLookup:
    """GET /visitors/qr/{token} — unauthenticated public endpoint."""

    def test_qr_lookup_is_public(self):
        """The QR endpoint must NOT require authentication (kiosk scanners are anonymous)."""
        anon = DM3Client()
        resp = anon.get(f"{BASE}/qr/token-does-not-exist")
        # Must not 401 — it's a public lookup. Unknown token should be 404.
        assert resp.status_code != 401, "QR lookup must be public; got 401"
        assert resp.status_code in (404, 400), \
            f"expected 404/400 for unknown QR token, got {resp.status_code}"

    def test_qr_lookup_rejects_empty_token(self):
        """Bare /qr/ (no token path param) should not succeed."""
        anon = DM3Client()
        resp = anon.get(f"{BASE}/qr/")
        # chi returns 404 for unmatched route, or 400 for empty param.
        assert resp.status_code in (404, 400, 405)


# ─── Kiosk Token CRUD ──────────────────────────────────────────


@pytest.mark.api
class TestKioskTokens:
    """Mint, list, revoke kiosk bearer tokens. Cleartext returned only on create."""

    def test_create_requires_name(self, client):
        resp = client.post(f"{BASE}/kiosk-tokens", json={})
        assert resp.status_code == 400

    def test_full_kiosk_token_lifecycle(self, client):
        name = f"auto-kiosk-{_rand_str(6)}"
        create = client.post(f"{BASE}/kiosk-tokens", json={"name": name})
        assert create.status_code in (200, 201), \
            f"create kiosk token failed: {create.status_code} {create.text}"
        body = create.json()

        # Cleartext token must be returned exactly once here.
        token = body.get("token") or body.get("plaintext") or body.get("secret")
        assert token, f"cleartext token missing from create response: {body}"
        assert len(token) >= 32, "kiosk tokens should be long random strings"

        token_id = body.get("id") or body.get("token_id")
        assert token_id, f"token id missing from create response: {body}"

        # List should include it (without cleartext).
        ls = client.get(f"{BASE}/kiosk-tokens")
        assert ls.status_code == 200
        body = ls.json()
        items = body if isinstance(body, list) else (body.get("data") or [])
        assert isinstance(items, list)
        match = [t for t in items if t.get("id") == token_id]
        assert match, "newly-minted kiosk token not present in list"
        # Cleartext must NOT leak in the list response.
        for key in ("token", "plaintext", "secret"):
            assert key not in match[0], f"list response leaked '{key}'"

        # Revoke.
        rm = client.delete(f"{BASE}/kiosk-tokens/{token_id}")
        assert rm.status_code in (200, 204)

    def test_kiosk_token_usable_on_legacy_endpoint(self, client):
        """A freshly-minted kiosk token must authenticate against /register-visit."""
        name = f"auto-legacy-{_rand_str(6)}"
        create = client.post(f"{BASE}/kiosk-tokens", json={"name": name})
        assert create.status_code in (200, 201)
        token = create.json().get("token") or create.json().get("plaintext") or create.json().get("secret")
        token_id = create.json().get("id") or create.json().get("token_id")
        assert token, "no cleartext kiosk token"

        # Call /register-visit WITHOUT a valid body — we just want to prove
        # that the bearer token is accepted at the middleware layer. We
        # therefore accept any non-401 response (most likely 400 for bad body).
        anon = DM3Client()
        # DM3Client always rewrites Authorization from its own session token,
        # so use the raw session here.
        r = anon.session.post(
            anon._url(f"{BASE}/legacy-register"),
            headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
            json={},
            timeout=constants.TIMEOUT_API,
        )
        assert r.status_code != 401, \
            f"kiosk token should have been accepted but got 401: {r.text}"

        # Cleanup.
        client.delete(f"{BASE}/kiosk-tokens/{token_id}")


# ─── Auth: kiosk endpoints reject bad credentials ──────────────


@pytest.mark.api
class TestKioskAuth:
    """Kiosk-auth middleware must refuse missing/bad tokens."""

    def test_legacy_register_requires_kiosk_token(self):
        """POST /legacy-register without a bearer token should 401."""
        anon = DM3Client()
        resp = anon.post(f"{BASE}/legacy-register", json={})
        assert resp.status_code == 401

    def test_legacy_register_rejects_random_token(self):
        """POST /legacy-register with a bogus bearer token should 401."""
        anon = DM3Client()
        r = anon.session.post(
            anon._url(f"{BASE}/legacy-register"),
            headers={"Authorization": "Bearer not-a-real-kiosk-token", "Content-Type": "application/json"},
            json={},
            timeout=constants.TIMEOUT_API,
        )
        assert r.status_code == 401

    def test_bare_register_visit_requires_kiosk_token(self):
        """POST /register-visit (legacy bare path) should also require kiosk auth."""
        anon = DM3Client()
        resp = anon.post("/register-visit", json={})
        # Local stack may not proxy the bare path through the edge proxy, so
        # accept 401 (enforced by kiosk middleware) or 404/405 (no route).
        assert resp.status_code in (401, 404, 405)


# ─── Auth: user JWT cannot create kiosk tokens without admin perm ──


@pytest.mark.api
class TestKioskTokenPermissions:
    """Only users with company.settings.manage may mint kiosk tokens."""

    def test_anonymous_cannot_create_kiosk_token(self):
        anon = DM3Client()
        resp = anon.post(f"{BASE}/kiosk-tokens", json={"name": "should-fail"})
        assert resp.status_code == 401

    def test_anonymous_cannot_list_kiosk_tokens(self):
        anon = DM3Client()
        resp = anon.get(f"{BASE}/kiosk-tokens")
        assert resp.status_code == 401
