"""
DM3 Automation Test Constants
Load from .env file or use defaults for local development.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

# Load .env from automation root
env_path = Path(__file__).parent.parent / '.env'
if env_path.exists():
    load_dotenv(env_path)

# Backend API endpoint
API_URL = os.getenv('API_URL', 'http://localhost:8080')

# Frontend
WEB_URL = os.getenv('WEB_URL', 'http://localhost:3000')

# System Admin credentials
SYSADMIN_EMAIL = os.getenv('SYSADMIN_EMAIL', 'sysadmin@duali.com')
SYSADMIN_PASSWORD = os.getenv('SYSADMIN_PASSWORD', 'sysadmin123')

# Company Admin credentials
ADMIN_EMAIL = os.getenv('ADMIN_EMAIL', 'admin@duali.com')
ADMIN_PASSWORD = os.getenv('ADMIN_PASSWORD', 'admin123')

# MQTT
MQTT_HOST = os.getenv('MQTT_HOST', 'localhost')
MQTT_PORT = int(os.getenv('MQTT_PORT', '1884'))

# Timeouts
TIMEOUT_API = 10  # seconds
TIMEOUT_PAGE = 30000  # milliseconds (Playwright)
