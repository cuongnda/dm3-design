"""
TC_SYS_ADMIN_01~04: System Admin Login & Dashboard Web Tests
Data-driven tests using Playwright + data-testid selectors.
"""
import pytest
from common.web_executor import WebTestExecutor, load_test_data_with_ids


FILE_TEST_DATA = "data/web/system-admin/test_system_login.data.json"


@pytest.mark.web
@pytest.mark.system_admin
@pytest.mark.parametrize("test_case", load_test_data_with_ids(FILE_TEST_DATA))
def test_system_admin_login(page, test_case, request):
    """Data-driven system admin login & dashboard tests."""
    request.node.test_case_id = test_case["case_id"]
    request.node.is_reviewed = test_case.get("description", {}).get("is_reviewed", False)

    executor = WebTestExecutor(page)
    try:
        executor.execute_test_case(test_case)
    except Exception as e:
        pytest.fail(f"Test case {test_case['case_id']} failed: {str(e)}")
