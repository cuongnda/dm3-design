"""
Tenant Isolation Test Configuration

Shared fixtures and configuration for tenant isolation tests.
"""

import pytest
import os
from typing import Generator
from automation.common.api_client import ApiClient
from automation.common.database import DatabaseClient


@pytest.fixture(scope="session")
def api_client() -> Generator[ApiClient, None, None]:
    """Create API client for testing"""
    base_url = os.getenv("DM3_API_URL", "http://localhost:8000")
    client = ApiClient(base_url=base_url)
    yield client
    client.close()


@pytest.fixture(scope="session")
def db_client() -> Generator[DatabaseClient, None, None]:
    """Create database client for direct database testing"""
    db_url = os.getenv("DM3_DATABASE_URL", "postgresql://dm3:dm3secret@localhost:5433/dm3")
    client = DatabaseClient(db_url=db_url)
    yield client
    client.close()


@pytest.fixture(autouse=True)
def cleanup_test_data(api_client: ApiClient):
    """Automatically cleanup test data after each test"""
    yield
    # Cleanup any test data that might have been created
    # This runs after each test
    api_client.cleanup_test_data()


@pytest.fixture(scope="function")
def isolated_test_env(api_client: ApiClient, db_client: DatabaseClient):
    """Create an isolated test environment for each test"""
    # Create a transaction savepoint for database isolation
    db_client.begin_transaction()
    
    yield {
        'api_client': api_client,
        'db_client': db_client
    }
    
    # Rollback transaction to cleanup
    db_client.rollback_transaction()


# Test marks for categorizing tests
pytest.mark.tenant_isolation = pytest.mark.mark("tenant_isolation")
pytest.mark.security = pytest.mark.mark("security") 
pytest.mark.database = pytest.mark.mark("database")
pytest.mark.api = pytest.mark.mark("api")


def pytest_configure(config):
    """Configure pytest with custom markers"""
    config.addinivalue_line(
        "markers", "tenant_isolation: mark test as tenant isolation test"
    )
    config.addinivalue_line(
        "markers", "security: mark test as security-related test"
    )
    config.addinivalue_line(
        "markers", "database: mark test as database-level test"
    )
    config.addinivalue_line(
        "markers", "api: mark test as API-level test"
    )


def pytest_collection_modifyitems(config, items):
    """Automatically mark tests based on their file location"""
    for item in items:
        # Add tenant_isolation mark to all tests in this directory
        if "tenant_isolation" in str(item.fspath):
            item.add_marker(pytest.mark.tenant_isolation)
        
        # Add specific markers based on test file names
        if "test_tenant_security" in str(item.fspath):
            item.add_marker(pytest.mark.security)
        elif "test_tenant_database" in str(item.fspath):
            item.add_marker(pytest.mark.database)
        elif "test_tenant_api" in str(item.fspath):
            item.add_marker(pytest.mark.api)