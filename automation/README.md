# DM3 Automation Tests

Python + pytest + Playwright test suite for Duall Master 3.0.

## Structure

```
automation/
├── common/                 # Shared utilities
│   ├── constants.py        # Config from .env
│   └── api_client.py       # Authenticated HTTP client
├── tests/
│   ├── api/                # Backend API tests (no browser)
│   │   └── test_system_admin.py
│   └── web/                # Frontend UI tests (Playwright)
│       └── (coming soon)
├── data/                   # Test data files
│   ├── api/
│   └── web/
├── export/                 # Test reports (gitignored)
├── conftest.py             # Root fixtures
├── pytest.ini              # pytest configuration
├── requirements.txt        # Python dependencies
├── .env.template           # Environment template
└── README.md
```

## Quick Start

```bash
cd automation

# Setup
cp .env.template .env          # Edit with your config
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
playwright install chromium     # For web tests

# Run all tests
pytest

# Run only API tests
pytest tests/api/ -m api

# Run only web tests
pytest tests/web/ -m web

# Run smoke tests
pytest -m smoke

# Run with HTML report
pytest --html=export/report.html
```

## Markers

| Marker | Description |
|--------|-------------|
| `api` | API tests (no browser needed) |
| `web` | Web UI tests (requires Playwright) |
| `smoke` | Quick validation tests |
| `integration` | Full integration tests |
| `system_admin` | System admin module tests |

## Environment Variables

See `.env.template` for all available config options.

## Adding Tests

### API Tests
1. Create `tests/api/test_<module>.py`
2. Use `sysadmin_client` or `admin_client` fixtures
3. Mark with `@pytest.mark.api`

### Web Tests
1. Create `tests/web/<module>/test_<feature>.py`
2. Use `page` fixture for Playwright browser
3. Mark with `@pytest.mark.web`
