# Automation Runner Setup Guide

## Prerequisites
- Python 3.11+
- pip packages: `pytest`, `pytest-html`, `pytest-json-report`, `playwright`, `requests`
- Chrome/Chromium (for web tests)

## Installation

```bash
cd automation/
pip install -r requirements.txt
playwright install chromium
cp .env.example .env
# Edit .env with your values
```

## Running Tests

### Manual Run
```bash
# All tests
python daily_runner.py

# API tests only
python daily_runner.py --api

# Web tests only
python daily_runner.py --web
```

### Watch Mode (CI-like)
Watches git commits every 3 minutes, runs tests on changes.
Full run at midnight.

```bash
# Foreground
python daily_runner.py --watch

# Background (production)
nohup python daily_runner.py --watch >> logs/runner.log 2>&1 &

# Custom interval (5 minutes)
python daily_runner.py --watch --interval 300
```

### Systemd Service (recommended for production)
```ini
# /etc/systemd/system/dm3-test-runner.service
[Unit]
Description=DM3 Automation Test Runner
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/path/to/duall-master/automation
ExecStart=/usr/bin/python3 daily_runner.py --watch
Restart=always
RestartSec=10
Environment=PYTHONPATH=/path/to/duall-master/automation

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable dm3-test-runner
sudo systemctl start dm3-test-runner
sudo journalctl -u dm3-test-runner -f
```

## Report Upload

Reports are uploaded to the DV Tasks server API automatically after each run.
Configure in `.env`:

```
REPORT_UPLOAD_URL=http://demo.demasterpro.com:5001/api/automation/upload
REPORT_UPLOAD_TOKEN=your_token_here
REPORT_PREFIX=dm3
```

Reports are also saved locally in `export/` directory.

## Bug Reporter (Backend Integration)

Backend services auto-report 5xx errors to DV Tasks as bug tickets.
Set env vars for each service:

```
BUG_REPORTER_ENABLED=true
BUG_REPORTER_URL=https://tasks.duali.vn/api
BUG_REPORTER_TOKEN=your_token
BUG_REPORTER_PROJECT_ID=51e00fe3-f950-4682-8199-1df6ba9e71ac
```

Features:
- Auto-creates bug task on 5xx errors
- Captures stack trace for panics
- Deduplication (same error won't create duplicate bugs within 1 hour)
- Non-blocking (reports in background goroutine)

## File Structure
```
automation/
├── daily_runner.py          # Main runner script
├── .env                     # Config (not in git)
├── .env.example             # Config template
├── common/
│   ├── api_client.py        # API test client
│   ├── web_executor.py      # Web test executor
│   ├── report_uploader.py   # Upload to DV Tasks
│   └── constants.py
├── tests/
│   ├── api/                 # API test cases
│   └── web/                 # Web test cases (Playwright)
├── data/web/                # Test data (JSON)
├── export/                  # Generated reports (gitignored)
├── logs/                    # Runner logs (gitignored)
└── docs/                    # Documentation
```
