#!/usr/bin/env python3
"""
DM3 Automation Daily Runner

Runs pytest tests, captures screenshots, generates videos + HTML reports,
and uploads results to DV Tasks server API.

Pipeline: test -> screenshots -> video -> step report -> upload

Usage:
    python daily_runner.py                  # Run all tests once
    python daily_runner.py --api            # API tests only
    python daily_runner.py --web            # Web tests only
    python daily_runner.py --watch          # Watch mode (check every 3 min)

Background:
    nohup python daily_runner.py --watch >> logs/runner.log 2>&1 &
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
from datetime import datetime
from pathlib import Path

PROJECT_DIR = Path(__file__).parent.absolute()
TESTS_DIR = PROJECT_DIR / "tests"
EXPORT_DIR = PROJECT_DIR / "export"
LOGS_DIR = PROJECT_DIR / "logs"
STATE_FILE = LOGS_DIR / "runner_state.json"

LOGS_DIR.mkdir(exist_ok=True)
EXPORT_DIR.mkdir(exist_ok=True)


def log(msg: str):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{ts}] {msg}", flush=True)


# ── State Management ──────────────────────────────────────────

def load_state() -> dict:
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"last_commit": "", "last_run": "", "runs": 0}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


# ── Git Operations ────────────────────────────────────────────

def get_current_commit() -> str:
    repo_dir = PROJECT_DIR.parent
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, cwd=repo_dir
        )
        return result.stdout.strip()
    except Exception:
        return ""


def get_changed_files(since_commit: str) -> list:
    repo_dir = PROJECT_DIR.parent
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", since_commit, "HEAD"],
            capture_output=True, text=True, cwd=repo_dir
        )
        files = result.stdout.strip().split("\n")
        return [f for f in files if f.startswith("automation/") or f.startswith("backend/")]
    except Exception:
        return []


# ── Test Execution ────────────────────────────────────────────

def run_tests(test_type: str = "all") -> dict:
    """Run pytest and return results summary."""
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    report_html = EXPORT_DIR / f"report_{timestamp}.html"
    report_json = EXPORT_DIR / f"report_{timestamp}.json"

    cmd = [
        sys.executable, "-m", "pytest",
        "--tb=short",
        f"--html={report_html}",
        "--self-contained-html",
        "--json-report", f"--json-report-file={report_json}",
        "-v",
    ]

    if test_type == "api":
        cmd.append("tests/api/")
    elif test_type == "web":
        cmd.append("tests/web/")
    else:
        cmd.append("tests/")

    log(f"Running: {' '.join(cmd)}")
    start = time.time()

    # Stream output in real-time so user can see progress
    result = subprocess.run(cmd, cwd=PROJECT_DIR)
    duration = time.time() - start

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


# ── Post-test: Generate Videos & Step Reports ─────────────────

def generate_reports():
    """Generate video + HTML step reports from execution JSONs."""
    report_dir = str(EXPORT_DIR / "execution_reports")

    # Generate step HTML reports
    try:
        from generate_step_report import generate_reports_for_all
        reports = generate_reports_for_all(report_dir)
        log(f"Generated {len(reports)} step reports")
    except Exception as e:
        log(f"Step report generation failed: {e}")

    # Generate videos (requires ffmpeg)
    if os.environ.get("GENERATE_VIDEO", "true").lower() == "true":
        try:
            from generate_test_video import generate_videos_for_reports
            videos = generate_videos_for_reports(report_dir)
            log(f"Generated {len(videos)} videos")
        except Exception as e:
            log(f"Video generation failed: {e}")


# ── Upload ────────────────────────────────────────────────────

def upload_report(summary: dict):
    """Upload test results to DV Tasks server."""
    from common.report_uploader import ReportUploader

    uploader = ReportUploader()
    if not uploader.enabled:
        log("Report upload disabled (missing REPORT_UPLOAD_URL or REPORT_UPLOAD_TOKEN)")
        return

    # Prepare upload directory with all artifacts
    upload_dir = Path(tempfile.mkdtemp(prefix="dm3_upload_"))
    try:
        # Copy pytest HTML report
        if summary.get("report_html") and Path(summary["report_html"]).exists():
            shutil.copy2(summary["report_html"], upload_dir / "report.html")

        # Copy execution reports (JSON + HTML)
        exec_dir = EXPORT_DIR / "execution_reports"
        if exec_dir.exists():
            dst = upload_dir / "execution_reports"
            dst.mkdir(exist_ok=True)
            for f in exec_dir.iterdir():
                if f.is_file() and f.suffix in ('.json', '.html'):
                    shutil.copy2(f, dst / f.name)

        # Copy screenshots
        screenshots_dir = EXPORT_DIR / "screenshots"
        if screenshots_dir.exists():
            shutil.copytree(screenshots_dir, upload_dir / "screenshots", dirs_exist_ok=True)

        # Copy videos
        videos_dir = EXPORT_DIR / "videos"
        if videos_dir.exists():
            dst = upload_dir / "videos"
            dst.mkdir(exist_ok=True)
            for f in videos_dir.glob("*.mp4"):
                shutil.copy2(f, dst / f.name)

        success = uploader.zip_and_upload(
            source_dir=str(upload_dir),
            test_case_name="dm3-automation",
            process_id=summary["timestamp"],
            passed=summary["passed"],
            failed=summary["failed"],
            total=summary["total"],
        )
        if success:
            log("Report uploaded to DV Tasks")
        else:
            log("Report upload failed")
    except Exception as e:
        log(f"Upload error: {e}")
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)


# ── Cleanup ───────────────────────────────────────────────────

def cleanup_old_files(retention_days: int = 2):
    """Remove old export files to save disk."""
    cutoff = time.time() - retention_days * 86400
    removed = 0

    for pattern in ["export/screenshots/steps/*", "export/videos/*.mp4",
                    "export/execution_reports/*", "export/report_*.html",
                    "export/report_*.json"]:
        import glob
        for f in glob.glob(str(PROJECT_DIR / pattern)):
            p = Path(f)
            try:
                if p.is_file() and p.stat().st_mtime < cutoff:
                    p.unlink()
                    removed += 1
                elif p.is_dir() and p.stat().st_mtime < cutoff:
                    shutil.rmtree(p, ignore_errors=True)
                    removed += 1
            except Exception:
                pass

    if removed:
        log(f"Cleaned up {removed} old files (>{retention_days} days)")


# ── Run Modes ─────────────────────────────────────────────────

def run_once(test_type: str = "all"):
    """Full pipeline: test -> video -> report -> upload."""
    log(f"Starting test run (type={test_type})")

    # Cleanup old files
    cleanup_old_files()

    # 1. Run tests (screenshots captured automatically by WebTestExecutor)
    summary = run_tests(test_type)

    # 2. Generate videos + step reports from execution JSONs
    if test_type in ("web", "all"):
        generate_reports()

    # 3. Upload everything
    try:
        upload_report(summary)
    except Exception as e:
        log(f"Upload failed: {e}")

    # Save state
    state = load_state()
    state["last_commit"] = get_current_commit()
    state["last_run"] = datetime.now().isoformat()
    state["runs"] = state.get("runs", 0) + 1
    state["last_summary"] = summary
    save_state(state)

    return summary


def watch_mode(interval: int = 180):
    """Watch for git commits and run tests on changes."""
    log(f"Watch mode started (interval={interval}s)")
    state = load_state()

    while True:
        try:
            current = get_current_commit()

            if current and current != state.get("last_commit"):
                changed = get_changed_files(state.get("last_commit", ""))
                if changed:
                    log(f"New commit: {current[:8]} ({len(changed)} changed files)")
                    run_once("all")
                    state = load_state()
                else:
                    log("New commit but no test-related changes")
                    state["last_commit"] = current
                    save_state(state)

            # Full run at midnight
            now = datetime.now()
            if now.hour == 0 and now.minute < 5:
                log("Midnight full test run")
                run_once("all")
                time.sleep(300)

        except KeyboardInterrupt:
            log("Watch mode stopped")
            break
        except Exception as e:
            log(f"Error in watch loop: {e}")

        time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="DM3 Automation Daily Runner")
    parser.add_argument("--watch", action="store_true", help="Watch mode")
    parser.add_argument("--api", action="store_true", help="API tests only")
    parser.add_argument("--web", action="store_true", help="Web tests only")
    parser.add_argument("--interval", type=int, default=180, help="Watch interval (seconds)")
    parser.add_argument("--no-video", action="store_true", help="Skip video generation")
    args = parser.parse_args()

    if args.no_video:
        os.environ["GENERATE_VIDEO"] = "false"

    if args.watch:
        watch_mode(args.interval)
    else:
        test_type = "api" if args.api else "web" if args.web else "all"
        summary = run_once(test_type)
        sys.exit(0 if summary["failed"] == 0 else 1)


if __name__ == "__main__":
    main()
