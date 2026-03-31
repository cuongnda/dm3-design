"""
Root conftest.py — shared fixtures for all DM3 automation tests.
"""
import os
import pytest
from common.api_client import DM3Client
from common import constants


@pytest.fixture(scope="session")
def sysadmin_client():
    """Authenticated API client as system admin."""
    client = DM3Client()
    client.login(constants.SYSADMIN_EMAIL, constants.SYSADMIN_PASSWORD)
    return client


@pytest.fixture(scope="session")
def admin_client():
    """Authenticated API client as company admin."""
    client = DM3Client()
    client.login(constants.ADMIN_EMAIL, constants.ADMIN_PASSWORD)
    return client


@pytest.fixture
def page(request):
    """Playwright page fixture for web tests."""
    from playwright.sync_api import sync_playwright

    headless = os.environ.get('HEADLESS', 'true').lower() == 'true'
    with sync_playwright() as p:
        browser = p.chromium.launch(
            headless=headless,
            args=['--no-sandbox', '--disable-dev-shm-usage'] if headless else None
        )
        context = browser.new_context(
            viewport={"width": 1920, "height": 1080},
        )
        pg = context.new_page()
        pg.set_default_timeout(constants.TIMEOUT_PAGE)
        yield pg
        context.close()
        browser.close()
