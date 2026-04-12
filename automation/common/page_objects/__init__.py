"""Page Object classes for DM3 web tests."""
from .base_page import BasePage
from .login_page import LoginPage
from .dashboard_page import DashboardPage
from .department_page import DepartmentPage

__all__ = ["BasePage", "LoginPage", "DashboardPage", "DepartmentPage"]
