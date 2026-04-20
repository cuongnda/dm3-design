"""
DM3: API Integration Module Tests
Tests for OAuth clients + API tokens shipped in 1b6f9c31.
Covers: token CRUD, OAuth client CRUD, client_credentials token grant,
plugin gate enforcement.

Endpoints exercised:
  GET    /api/v1/auth/api-tokens
  POST   /api/v1/auth/api-tokens
  DELETE /api/v1/auth/api-tokens/{id}
  GET    /api/v1/auth/oauth-clients
  POST   /api/v1/auth/oauth-clients
  DELETE /api/v1/auth/oauth-clients/{id}
  POST   /api/v1/auth/token            (OAuth2 client_credentials)
  PUT    /api/v1/auth/system/companies/{id}/plugins  (sysadmin only)

Note: The /api/v1/auth/ plane is rate-limited at the gateway (Traefik:
ratelimit-auth — 20 req/min, burst 10). All HTTP calls in this file go
through `_send()` which retries on 429 with back-off so the suite can run
top-to-bottom without bucket starvation.
"""
import time
import uuid

import pytest
import requests
from common import constants
from common.api_client import DM3Client

AUTH = "/api/v1/auth"

# Retry config for the tight auth-plane rate limit.
_RETRY_ATTEMPTS = 6
_RETRY_WAIT_SECONDS = 3.5


def _send(method_callable, *args, **kwargs):
    """Call a requests/DM3Client method and retry on HTTP 429.

    Traefik's auth-plane limiter is 20 req/min with a 10-req burst. Tests
    that hit it repeatedly need back-off; we sleep ~3.5s per retry which is
    the steady-state refill cadence.
    """
    last = None
    for _ in range(_RETRY_ATTEMPTS):
        resp = method_callable(*args, **kwargs)
        if resp.status_code != 429:
            return resp
        last = resp
        time.sleep(_RETRY_WAIT_SECONDS)
    return last


def _login(email: str, password: str) -> tuple[DM3Client, str | None]:
    """Login with retries and return (client, tenant_id).

    tenant_id is None for the system admin (no tenant binding).
    """
    c = DM3Client()
    for _ in range(_RETRY_ATTEMPTS):
        resp = c.session.post(
            c._url(f"{AUTH}/login"),
            json={"email": email, "password": password},
            timeout=constants.TIMEOUT_API,
        )
        if resp.status_code == 429:
            time.sleep(_RETRY_WAIT_SECONDS)
            continue
        resp.raise_for_status()
        data = resp.json()
        if data.get("step") == "complete":
            c.token = data["access_token"]
            return c, data.get("user", {}).get("tenant_id")
        if data.get("step") == "select_company":
            companies = data.get("companies", [])
            assert companies, "no companies returned for two-step login"
            c.login_step2(data["temporary_token"], companies[0]["id"])
            return c, companies[0]["id"]
        raise AssertionError(f"unexpected login step: {data}")
    raise AssertionError("login kept hitting 429 after retries")


def _token_request(client: DM3Client, body: dict) -> requests.Response:
    """POST /auth/token with 429 retry. Uses raw requests (no bearer token)."""
    for _ in range(_RETRY_ATTEMPTS):
        resp = requests.post(
            client._url(f"{AUTH}/token"),
            json=body,
            timeout=constants.TIMEOUT_API,
        )
        if resp.status_code != 429:
            return resp
        time.sleep(_RETRY_WAIT_SECONDS)
    return resp


@pytest.fixture(scope="module")
def admin_session():
    """Company admin client + tenant id. Tenant has api_integration enabled."""
    client, tenant_id = _login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    return client, tenant_id


@pytest.fixture(scope="module")
def sysadmin():
    """System admin client for plugin toggling."""
    c, _ = _login(constants.SYSADMIN_EMAIL, constants.SYSADMIN_PASSWORD)
    return c


@pytest.fixture(scope="module")
def client(admin_session):
    return admin_session[0]


@pytest.fixture(scope="module")
def admin_tenant_id(admin_session):
    return admin_session[1]


@pytest.fixture(scope="module", autouse=True)
def ensure_api_integration_enabled(sysadmin, admin_tenant_id):
    """Guarantee api_integration plugin is enabled for the duration of this
    module and restore the original plugin list at teardown."""
    resp = _send(sysadmin.get, f"{AUTH}/system/companies/{admin_tenant_id}/plugins")
    assert resp.status_code == 200, f"could not read plugins: {resp.text}"
    original = list(resp.json().get("enabled_plugins") or [])

    if "api_integration" not in original:
        new_list = original + ["api_integration"]
        r = _send(
            sysadmin.put,
            f"{AUTH}/system/companies/{admin_tenant_id}/plugins",
            json={"enabled_plugins": new_list},
        )
        assert r.status_code == 200, f"enable plugin failed: {r.text}"

    yield

    _send(
        sysadmin.put,
        f"{AUTH}/system/companies/{admin_tenant_id}/plugins",
        json={"enabled_plugins": original},
    )


# ─── API Tokens ──────────────────────────────────────────────────


class TestAPITokens:
    """Test CRUD on tenant-scoped API tokens (dm3_live_* / dm3_test_*)."""

    @pytest.mark.api
    def test_list_api_tokens_returns_array(self, client):
        resp = _send(client.get, f"{AUTH}/api-tokens")
        assert resp.status_code == 200, resp.text
        assert isinstance(resp.json(), list)

    @pytest.mark.api
    def test_create_api_token_requires_name(self, client):
        resp = _send(client.post, f"{AUTH}/api-tokens",
                     json={"environment": "live", "scopes": ["read"]})
        assert resp.status_code == 400

    @pytest.mark.api
    def test_create_api_token_rejects_invalid_environment(self, client):
        resp = _send(client.post, f"{AUTH}/api-tokens", json={
            "name": "bad-env",
            "environment": "staging",
            "scopes": ["read"],
        })
        assert resp.status_code == 400

    @pytest.mark.api
    def test_create_live_token_returns_raw_once(self, client):
        resp = _send(client.post, f"{AUTH}/api-tokens", json={
            "name": f"live-token-{uuid.uuid4().hex[:6]}",
            "environment": "live",
            "scopes": ["read"],
        })
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert "token" in data, "raw token must be returned"
        assert data["token"].startswith("dm3_live_"), "live token must have dm3_live_ prefix"
        assert data["prefix"].startswith("dm3_live_")
        assert len(data["prefix"]) == 16, "prefix is stored as first 16 chars"
        assert data["status"] == "active"
        assert data["environment"] == "live"
        _send(client.delete, f"{AUTH}/api-tokens/{data['id']}")

    @pytest.mark.api
    def test_create_test_token_has_test_prefix(self, client):
        resp = _send(client.post, f"{AUTH}/api-tokens", json={
            "name": f"test-token-{uuid.uuid4().hex[:6]}",
            "environment": "test",
            "scopes": ["read"],
        })
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["token"].startswith("dm3_test_")
        assert data["environment"] == "test"
        _send(client.delete, f"{AUTH}/api-tokens/{data['id']}")

    @pytest.mark.api
    def test_created_token_appears_in_list(self, client):
        create = _send(client.post, f"{AUTH}/api-tokens", json={
            "name": f"visible-{uuid.uuid4().hex[:6]}",
            "environment": "live",
            "scopes": ["read"],
        })
        assert create.status_code == 201, create.text
        tid = create.json()["id"]
        try:
            listing = _send(client.get, f"{AUTH}/api-tokens").json()
            match = [t for t in listing if t["id"] == tid]
            assert len(match) == 1
            assert "token" not in match[0], "raw token must never appear in list"
        finally:
            _send(client.delete, f"{AUTH}/api-tokens/{tid}")

    @pytest.mark.api
    def test_revoke_api_token(self, client):
        create = _send(client.post, f"{AUTH}/api-tokens", json={
            "name": f"revoke-{uuid.uuid4().hex[:6]}",
            "environment": "live",
            "scopes": ["read"],
        })
        assert create.status_code == 201, create.text
        tid = create.json()["id"]

        revoke = _send(client.delete, f"{AUTH}/api-tokens/{tid}")
        assert revoke.status_code == 204

        # Second revoke → 404 (already revoked)
        again = _send(client.delete, f"{AUTH}/api-tokens/{tid}")
        assert again.status_code == 404

    @pytest.mark.api
    def test_revoke_nonexistent_token_returns_404(self, client):
        resp = _send(client.delete, f"{AUTH}/api-tokens/{uuid.uuid4()}")
        assert resp.status_code == 404

    @pytest.mark.api
    def test_api_tokens_requires_auth(self):
        anon = DM3Client()
        resp = _send(anon.get, f"{AUTH}/api-tokens")
        assert resp.status_code == 401


# ─── OAuth Clients ──────────────────────────────────────────────


class TestOAuthClients:
    """Test CRUD on tenant-scoped OAuth2 clients (client_credentials grant)."""

    @pytest.mark.api
    def test_list_oauth_clients_returns_array(self, client):
        resp = _send(client.get, f"{AUTH}/oauth-clients")
        assert resp.status_code == 200, resp.text
        assert isinstance(resp.json(), list)

    @pytest.mark.api
    def test_create_oauth_client_requires_name(self, client):
        resp = _send(client.post, f"{AUTH}/oauth-clients",
                     json={"description": "no name"})
        assert resp.status_code == 400

    @pytest.mark.api
    def test_create_oauth_client_returns_secret_once(self, client):
        resp = _send(client.post, f"{AUTH}/oauth-clients", json={
            "name": f"client-{uuid.uuid4().hex[:6]}",
            "description": "automation test",
            "grant_types": ["client_credentials"],
            "scopes": ["read"],
            "redirect_uris": [],
        })
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["client_id"].startswith("dm3c_")
        assert "client_secret" in data, "client_secret must be returned once"
        assert len(data["client_secret"]) >= 32
        assert data["status"] == "active"
        assert "client_credentials" in data["grant_types"]
        _send(client.delete, f"{AUTH}/oauth-clients/{data['id']}")

    @pytest.mark.api
    def test_created_client_in_list_without_secret(self, client):
        create = _send(client.post, f"{AUTH}/oauth-clients", json={
            "name": f"visible-client-{uuid.uuid4().hex[:6]}",
            "grant_types": ["client_credentials"],
            "scopes": ["read"],
            "redirect_uris": [],
        })
        assert create.status_code == 201, create.text
        cid = create.json()["id"]
        try:
            listing = _send(client.get, f"{AUTH}/oauth-clients").json()
            match = [c for c in listing if c["id"] == cid]
            assert len(match) == 1
            assert "client_secret" not in match[0], "secret must never appear in list"
        finally:
            _send(client.delete, f"{AUTH}/oauth-clients/{cid}")

    @pytest.mark.api
    def test_client_credentials_grant_issues_access_token(self, client):
        create = _send(client.post, f"{AUTH}/oauth-clients", json={
            "name": f"cc-grant-{uuid.uuid4().hex[:6]}",
            "grant_types": ["client_credentials"],
            "scopes": ["read"],
            "redirect_uris": [],
        })
        assert create.status_code == 201, create.text
        created = create.json()

        try:
            tok = _token_request(client, {
                "grant_type": "client_credentials",
                "client_id": created["client_id"],
                "client_secret": created["client_secret"],
            })
            assert tok.status_code == 200, f"token request failed: {tok.text}"
            body = tok.json()
            assert body["token_type"] == "Bearer"
            assert body["access_token"], "access_token must be present"
            assert body["expires_in"] > 0
        finally:
            _send(client.delete, f"{AUTH}/oauth-clients/{created['id']}")

    @pytest.mark.api
    def test_client_credentials_rejects_bad_secret(self, client):
        create = _send(client.post, f"{AUTH}/oauth-clients", json={
            "name": f"bad-secret-{uuid.uuid4().hex[:6]}",
            "grant_types": ["client_credentials"],
            "scopes": ["read"],
            "redirect_uris": [],
        })
        assert create.status_code == 201, create.text
        created = create.json()
        try:
            tok = _token_request(client, {
                "grant_type": "client_credentials",
                "client_id": created["client_id"],
                "client_secret": "this-is-wrong",
            })
            assert tok.status_code == 401
            assert tok.json().get("error") == "invalid_client"
        finally:
            _send(client.delete, f"{AUTH}/oauth-clients/{created['id']}")

    @pytest.mark.api
    def test_revoked_client_cannot_obtain_token(self, client):
        create = _send(client.post, f"{AUTH}/oauth-clients", json={
            "name": f"revoke-client-{uuid.uuid4().hex[:6]}",
            "grant_types": ["client_credentials"],
            "scopes": ["read"],
            "redirect_uris": [],
        })
        assert create.status_code == 201, create.text
        created = create.json()

        revoke = _send(client.delete, f"{AUTH}/oauth-clients/{created['id']}")
        assert revoke.status_code == 204

        tok = _token_request(client, {
            "grant_type": "client_credentials",
            "client_id": created["client_id"],
            "client_secret": created["client_secret"],
        })
        assert tok.status_code == 401
        assert tok.json().get("error") == "invalid_client"

    @pytest.mark.api
    def test_unsupported_grant_type_returns_400(self, client):
        resp = _token_request(client, {
            "grant_type": "magic_link",
            "client_id": "irrelevant",
            "client_secret": "irrelevant",
        })
        assert resp.status_code == 400
        assert resp.json().get("error") == "unsupported_grant_type"

    @pytest.mark.api
    def test_oauth_clients_requires_auth(self):
        anon = DM3Client()
        resp = _send(anon.get, f"{AUTH}/oauth-clients")
        assert resp.status_code == 401


# ─── Plugin Gate ────────────────────────────────────────────────


class TestPluginGate:
    """Verify routes are gated by the api_integration plugin.
    RequirePlugin reads claims.EnabledPlugins from the JWT, so the admin must
    re-login after the plugin is toggled to get a fresh claim set."""

    @pytest.mark.api
    def test_disabling_plugin_blocks_access(self, sysadmin, admin_tenant_id):
        current = _send(
            sysadmin.get, f"{AUTH}/system/companies/{admin_tenant_id}/plugins"
        ).json()["enabled_plugins"]

        without = [p for p in current if p != "api_integration"]
        r = _send(
            sysadmin.put,
            f"{AUTH}/system/companies/{admin_tenant_id}/plugins",
            json={"enabled_plugins": without},
        )
        assert r.status_code == 200, r.text
        assert "api_integration" not in r.json()["enabled_plugins"]

        try:
            fresh, _ = _login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)

            resp = _send(fresh.get, f"{AUTH}/api-tokens")
            assert resp.status_code == 403, resp.text
            body = resp.json()
            assert body.get("error") == "plugin_not_enabled"
            assert body.get("plugin") == "api_integration"

            resp = _send(fresh.get, f"{AUTH}/oauth-clients")
            assert resp.status_code == 403
        finally:
            _send(
                sysadmin.put,
                f"{AUTH}/system/companies/{admin_tenant_id}/plugins",
                json={"enabled_plugins": current},
            )

    @pytest.mark.api
    def test_reenabling_plugin_restores_access(self, sysadmin, admin_tenant_id):
        current = _send(
            sysadmin.get, f"{AUTH}/system/companies/{admin_tenant_id}/plugins"
        ).json()["enabled_plugins"]
        assert "api_integration" in current

        fresh, _ = _login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)

        resp = _send(fresh.get, f"{AUTH}/api-tokens")
        assert resp.status_code == 200, resp.text
        resp = _send(fresh.get, f"{AUTH}/oauth-clients")
        assert resp.status_code == 200, resp.text

    @pytest.mark.api
    def test_only_sysadmin_can_toggle_plugins(self, client, admin_tenant_id):
        """Tenant admin must not be able to modify plugin enablement."""
        resp = _send(
            client.put,
            f"{AUTH}/system/companies/{admin_tenant_id}/plugins",
            json={"enabled_plugins": ["core"]},
        )
        assert resp.status_code in (401, 403), \
            f"tenant admin must not update plugins (got {resp.status_code}: {resp.text})"
