"""
DM3 API Client — shared helper for API tests.
"""
import requests
from . import constants


class DM3Client:
    """Authenticated API client for DM3 backend."""

    def __init__(self, base_url: str = None):
        self.auth_url = base_url or constants.API_AUTH
        self.session = requests.Session()
        self.token = None

    def login(self, email: str = None, password: str = None) -> dict:
        """Login and store access token."""
        email = email or constants.SYSADMIN_EMAIL
        password = password or constants.SYSADMIN_PASSWORD

        resp = self.session.post(
            f"{self.auth_url}/api/v1/auth/login",
            json={"email": email, "password": password},
            timeout=constants.TIMEOUT_API,
        )
        resp.raise_for_status()
        data = resp.json()

        if data.get("step") == "complete":
            self.token = data["access_token"]
        elif data.get("step") == "select_company":
            # Auto-select first company
            companies = data.get("companies", [])
            if companies:
                self.login_step2(data["temporary_token"], companies[0]["id"])
        return data

    def login_step2(self, temp_token: str, company_id: str) -> dict:
        """Complete two-step login with company selection."""
        resp = self.session.post(
            f"{self.auth_url}/api/v1/auth/login-step2",
            json={"temporary_token": temp_token, "company_id": company_id},
            timeout=constants.TIMEOUT_API,
        )
        resp.raise_for_status()
        data = resp.json()
        self.token = data.get("access_token")
        return data

    @property
    def headers(self) -> dict:
        h = {"Content-Type": "application/json"}
        if self.token:
            h["Authorization"] = f"Bearer {self.token}"
        return h

    def get(self, url: str, **kwargs) -> requests.Response:
        return self.session.get(url, headers=self.headers, timeout=constants.TIMEOUT_API, **kwargs)

    def post(self, url: str, **kwargs) -> requests.Response:
        return self.session.post(url, headers=self.headers, timeout=constants.TIMEOUT_API, **kwargs)

    def put(self, url: str, **kwargs) -> requests.Response:
        return self.session.put(url, headers=self.headers, timeout=constants.TIMEOUT_API, **kwargs)

    def delete(self, url: str, **kwargs) -> requests.Response:
        return self.session.delete(url, headers=self.headers, timeout=constants.TIMEOUT_API, **kwargs)
