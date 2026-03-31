#!/usr/bin/env python3
"""
DM3 Automation Daily Runner

Watches git commits and runs pytest tests automatically.
Uploads results to DV Tasks server API.

Usage:
    python daily_runner.py                  # Run once
    python daily_runner.py --watch          # Watch mode (check every 3 min)
    python daily_runner.py --full           # Full test run

Background:
    nohup python daily_runner.py --watch >> logs/runner.log 2>&1 &
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.absolute()
TESTS_DIR = PROJECT_DIR / "tests"
EXPORT_DIR = PROJECT_DIR / "export"
LOGS_DIR = PROJECT_DIR / "logs"
STATE_FILE = LOGS_DIR / "runner_state.json"

# Ensure dirs exist
LOGS_DIR.mkdir(exist_ok=True)
EXPORT_DIR.mkdir(exist_ok=True)


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"last_commit": "", "last_run": "", "runs": 0}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def get_current_commit() -> str:
    """Get current HEAD commit hash from the main repo."""
    repo_dir = PROJECT_DIR.parent  # duall-master root
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, cwd=repo_dir
        )
        return result.stdout.strip()
    except Exception:
        return ""


def get_changed_files(since_commit: str) -> list[str]:
    """Get changed test-related files since a commit."""
    repo_dir = PROJECT_DIR.parent
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", since_commit, "HEAD"],
            capture_output=True, text=True, cwd=repo_dir
        )
        files = result.stdout.strip().split("\n")
        # Filter for automation-related changes
        return [f for f in files if f.startswith("automation/") or f.startswith("backend/")]
    except Exception:
        return []


def run_tests(test_type: str = "all", markers: str = "") -> dict:
    """Run pytest and return results summary."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_html = EXPORT_DIR / f"report_{timestamp}.html"
    report_json = EXPORT_DIR / f"report_{timestamp}.json"

    cmd = [
        sys.executable, "-m", "pytest",
        "--tb=short",
        f"--html={report_html}",
        "--self-contained-html",
        f"--json-report", f"--json-report-file={report_json}",
        "-v",
    ]

    if test_type == "api":
        cmd.append("tests/api/")
    elif test_type == "web":
        cmd.append("tests/web/")
    else:
        cmd.append("tests/")

    if markers:
        cmd.extend(["-m", markers])

    log(f"Running: {' '.join(cmd)}")
    start = time.time()

    result = subprocess.run(
        cmd, capture_output=True, text=True, cwd=PROJECT_DIR
    )

    duration = time.time() - start

    # Parse JSON report if available
    summary = {
        "timestamp": timestamp,
        "duration": round(duration, 1),
        "returncode": result.returncode,
        "passed": 0,
        "failed": 0,
        "errors": 0,
        "total": 0,
        "report_html": str(report_html) if report_html.exists() else None,
        "report_json": str(report_json) if report_json.exists() else None,
    }

    if report_json.exists():
        try:
            data = json.loads(report_json.read_text())
            s = data.get("summary", {})
            summary["passed"] = s.get("passed", 0)
            summary["failed"] = s.get("failed", 0)
            summary["errors"] = s.get("error", 0)
            summary["total"] = s.get("total", 0)
        except Exception:
            pass

    log(f"Results: {summary['passed']} passed, {summary['failed']} failed, "
        f"{summary['errors']} errors / {summary['total']} total ({summary['duration']}s)")

    return summary


def upload_report(summary: dict):
    """Upload test report to DV Tasks server API."""
    from automation.common.report_uploader import ReportUploader

    uploader = ReportUploader()
    if not uploader.enabled:
        log("Report upload disabled (missing config)")
        return

    if summary.get("report_html"):
        uploader.upload(
            report_path=summary["report_html"],
            test_case_name="dm3-automation",
            process_id=summary["timestamp"],
            passed=summary["passed"],
            failed=summary["failed"],
            total=summary["total"],
        )
        log("Report uploaded to DV Tasks")


def run_once(test_type: str = "all"):
    """Single test run."""
    log(f"Starting test run (type={test_type})")
    summary = run_tests(test_type)

    try:
        upload_report(summary)
    except Exception as e:
        log(f"Upload failed: {e}")

    state = load_state()
    state["last_commit"] = get_current_commit()
    state["last_run"] = datetime.now().isoformat()
    state["runs"] = state.get("runs", 0) + 1
    state["last_summary"] = summary
    save_state(state)

    return summary


def watch_mode(interval: int = 180):
    """Watch for commits and run tests on changes."""
    log(f"Watch mode started (interval={interval}s)")
    state = load_state()

    while True:
        try:
            current = get_current_commit()

            if current and current != state.get("last_commit"):
                changed = get_changed_files(state.get("last_commit", ""))
                if changed:
                    log(f"New commit detected: {current[:8]} ({len(changed)} changed files)")
                    summary = run_once("all")
                    state = load_state()
                else:
                    log(f"New commit but no test-related changes")
                    state["last_commit"] = current
                    save_state(state)

            # Full run at midnight
            now = datetime.now()
            if now.hour == 0 and now.minute < 5:
                log("Midnight full test run")
                run_once("all")
                time.sleep(300)  # Wait 5 min to avoid re-trigger

        except KeyboardInterrupt:
            log("Watch mode stopped")
            break
        except Exception as e:
            log(f"Error in watch loop: {e}")

        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="DM3 Automation Daily Runner")
    parser.add_argument("--watch", action="store_true", help="Watch mode")
    parser.add_argument("--full", action="store_true", help="Full test run")
    parser.add_argument("--api", action="store_true", help="API tests only")
    parser.add_argument("--web", action="store_true", help="Web tests only")
    parser.add_argument("--interval", type=int, default=180, help="Watch interval (seconds)")
    args = parser.parse_args()

    if args.watch:
        watch_mode(args.interval)
    else:
        test_type = "api" if args.api else "web" if args.web else "all"
        summary = run_once(test_type)
        sys.exit(0 if summary["failed"] == 0 else 1)


if __name__ == "__main__":
    main()
