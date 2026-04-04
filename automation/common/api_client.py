"""
DM3 API Client — shared helper for API tests.
"""
import requests
from . import constants


class DM3Client:
    """Authenticated API client for DM3 backend."""

    def __init__(self, base_url: str = None):
        self.base_url = (base_url or constants.API_AUTH).rstrip("/")
        self.auth_url = self.base_url
        self.session = requests.Session()
        self.token = None

    def _url(self, path: str) -> str:
        """Build full URL from relative path."""
        if path.startswith("http"):
            return path
        return f"{self.base_url}{path}"

    def login(self, email: str = None, password: str = None) -> dict:
        """Login and store access token."""
        email = email or constants.SYSADMIN_EMAIL
        password = password or constants.SYSADMIN_PASSWORD

        resp = self.session.post(
            self._url("/api/v1/auth/login"),
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
            self._url("/api/v1/auth/login-step2"),
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

    def get(self, path: str, **kwargs) -> requests.Response:
        return self.session.get(self._url(path), headers=self.headers, timeout=constants.TIMEOUT_API, **kwargs)

    def post(self, path: str, **kwargs) -> requests.Response:
        headers = self.headers
        # Don't set Content-Type for multipart uploads — requests sets it automatically
        if "files" in kwargs:
            headers = {k: v for k, v in headers.items() if k.lower() != "content-type"}
        return self.session.post(self._url(path), headers=headers, timeout=constants.TIMEOUT_API, **kwargs)

    def put(self, path: str, **kwargs) -> requests.Response:
        return self.session.put(self._url(path), headers=self.headers, timeout=constants.TIMEOUT_API, **kwargs)

    def patch(self, path: str, **kwargs) -> requests.Response:
        return self.session.patch(self._url(path), headers=self.headers, timeout=constants.TIMEOUT_API, **kwargs)

    def delete(self, path: str, **kwargs) -> requests.Response:
        return self.session.delete(self._url(path), headers=self.headers, timeout=constants.TIMEOUT_API, **kwargs)

# Alias for backward compatibility
APIClient = DM3Client
