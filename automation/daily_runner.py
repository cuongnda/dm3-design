#!/usr/bin/env python3
"""
DM3 Automation Daily Runner

Watches git commits and runs pytest tests automatically.
Uploads results per-module to DV Tasks, matching DMPW report format.

Usage:
    python daily_runner.py                  # Auto mode (watch + nightly)
    python daily_runner.py --once           # Run once, all tests
    python daily_runner.py --once --api     # Run once, API tests only
    python daily_runner.py --once --web     # Run once, Web tests only
    python daily_runner.py --module access-time  # Run single module
    python daily_runner.py status           # Check if running
    python daily_runner.py stop             # Stop running instance

Background:
    nohup python daily_runner.py >> logs/runner.log 2>&1 &
"""

import argparse
import glob
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import threading
from datetime import datetime, timedelta
from pathlib import Path

# Project paths
PROJECT_DIR = Path(__file__).parent.absolute()
TESTS_DIR = PROJECT_DIR / "tests"
TESTS_API_DIR = TESTS_DIR / "api"
TESTS_WEB_DIR = TESTS_DIR / "web"
EXPORT_DIR = PROJECT_DIR / "export"
LOGS_DIR = PROJECT_DIR / "logs"
STATE_FILE = LOGS_DIR / "runner_state.json"

# Ensure dirs exist
LOGS_DIR.mkdir(exist_ok=True)
EXPORT_DIR.mkdir(exist_ok=True)

# Thread-safe print
_print_lock = threading.Lock()

# Track running subprocesses for clean shutdown
_running_procs = []
_running_procs_lock = threading.Lock()


def _kill_all_procs():
    with _running_procs_lock:
        for proc in list(_running_procs):
            try:
                proc.terminate()
            except Exception:
                pass


def _signal_handler(sig, frame):
    print("\n[SIGNAL] Stopping all test processes...", flush=True)
    _kill_all_procs()
    pid_file = LOGS_DIR / "automation.pid"
    if pid_file.exists():
        pid_file.unlink(missing_ok=True)
    sys.exit(1)


signal.signal(signal.SIGINT, _signal_handler)
signal.signal(signal.SIGTERM, _signal_handler)


def log(msg: str, tag: str = "MAIN"):
    ts = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with _print_lock:
        print(f"[{ts}] [{tag}] {msg}", flush=True)


# =============================================================================
# MODULE ORDER — controls upload naming (dm3-module-{N}-{slug})
# =============================================================================

MODULE_ORDER = {
    # API modules (1-9)
    "api-system-admin": 1,
    "api-company-crud": 2,
    "api-account-management": 3,
    "api-access-time": 4,
    # Web modules (10+)
    "web-system-login": 10,
    "web-company-management": 11,
    "web-account-management": 12,
}


def get_module_upload_name(slug: str) -> str:
    """E.g., 'api-access-time' -> 'module-4-api-access-time'"""
    num = MODULE_ORDER.get(slug)
    if num:
        return f"module-{num}-{slug}"
    return slug


def get_test_type(test_file: str) -> str:
    """Determine if test is api or web from path."""
    if "/api/" in test_file or "\\api\\" in test_file:
        return "api"
    elif "/web/" in test_file or "\\web\\" in test_file:
        return "web"
    return "other"


def get_module_slug(test_file: str) -> str:
    """Extract module slug with api/web prefix.
    
    tests/api/test_access_time.py -> 'api-access-time'
    tests/web/system-admin/test_company_management.py -> 'web-company-management'
    """
    p = Path(test_file)
    test_type = get_test_type(test_file)
    name = p.stem.replace("test_", "").replace("_", "-")
    return f"{test_type}-{name}"


# =============================================================================
# GIT OPERATIONS
# =============================================================================

def get_current_commit() -> str:
    repo_dir = PROJECT_DIR.parent  # duall-master root
    try:
        result = subprocess.run(
            ["git", "rev-parse", "HEAD"],
            capture_output=True, text=True, cwd=repo_dir,
        )
        return result.stdout.strip()
    except Exception:
        return ""


def get_changed_files(since_commit: str) -> list:
    repo_dir = PROJECT_DIR.parent
    try:
        result = subprocess.run(
            ["git", "diff", "--name-only", since_commit, "HEAD"],
            capture_output=True, text=True, cwd=repo_dir,
        )
        files = result.stdout.strip().split("\n")
        return [f for f in files if f.startswith("automation/") or f.startswith("backend/")]
    except Exception:
        return []


# =============================================================================
# STATE MANAGEMENT
# =============================================================================

def load_state() -> dict:
    if STATE_FILE.exists():
        try:
            return json.loads(STATE_FILE.read_text())
        except Exception:
            pass
    return {"last_commit": "", "last_run": "", "runs": 0}


def save_state(state: dict):
    STATE_FILE.write_text(json.dumps(state, indent=2))


# =============================================================================
# TEST DISCOVERY
# =============================================================================

def discover_test_files(test_type: str = "all") -> list:
    """Find all test files."""
    files = []
    if test_type in ("api", "all"):
        files.extend(sorted(glob.glob(str(TESTS_API_DIR / "test_*.py"))))
    if test_type in ("web", "all"):
        files.extend(sorted(glob.glob(str(TESTS_WEB_DIR / "**/test_*.py"), recursive=True)))
    return files


def map_changed_to_tests(changed_files: list) -> list:
    """Map changed files to test files that should run."""
    test_files = set()
    for f in changed_files:
        p = Path(f)
        # Direct test file change
        if f.startswith("automation/tests/") and f.endswith(".py"):
            full = PROJECT_DIR / f.replace("automation/", "", 1)
            if full.exists():
                test_files.add(str(full))
        # Backend change -> run API tests
        elif f.startswith("backend/"):
            for tf in TESTS_API_DIR.glob("test_*.py"):
                test_files.add(str(tf))
    return sorted(test_files)


# =============================================================================
# HOST_WEB INJECTION
# =============================================================================

def _get_host_web() -> str:
    """Get HOST_WEB from environment for DV Tasks server column."""
    from dotenv import load_dotenv
    env_path = PROJECT_DIR / '.env'
    if env_path.exists():
        load_dotenv(env_path, override=False)
    return os.environ.get("WEB_URL", os.environ.get("BASE_URL", ""))


def _inject_host_web(report_html: Path):
    """Inject HOST_WEB comment into pytest-html report so DV Tasks can parse the server column.
    
    DV Tasks' _parse_report_html() looks for: HOST_WEB: <url>
    """
    if not report_html.exists():
        return
    host_web = _get_host_web()
    if not host_web:
        return
    try:
        content = report_html.read_text(encoding='utf-8')
        # Check if already injected
        if 'HOST_WEB:' in content:
            return
        # Inject as HTML comment after <head>
        content = content.replace('<head>', f'<head>\n<!-- HOST_WEB: {host_web} -->', 1)
        report_html.write_text(content, encoding='utf-8')
    except Exception:
        pass


# =============================================================================
# INJECT DETAIL/VIDEO LINKS INTO PYTEST HTML REPORT
# =============================================================================

def _inject_report_links(report_html: Path, module_slug: str):
    """Post-process pytest-html report to add Detail Report + Video links.
    
    Conftest hooks can't add these because execution_reports are generated
    AFTER pytest finishes. So we parse the HTML and inject links per test row.
    
    Each row in pytest-html has a 'Links' column (last <td> before Review column).
    We match test rows by index to TC_xxx_NN execution reports.
    """
    if not report_html.exists():
        return

    exec_dir = EXPORT_DIR / "execution_reports"
    tc_prefix = "TC_" + module_slug.upper().replace("-", "_")
    
    # Find all execution report files for this module
    html_files = {}  # tc_num -> relative path
    json_files = {}
    video_files = {}
    
    import re as _re
    
    if exec_dir.exists():
        for f in exec_dir.iterdir():
            if tc_prefix in f.name and f.suffix == '.html':
                m = _re.search(rf'{tc_prefix}_(\d+)', f.name)
                if m:
                    html_files[int(m.group(1))] = f"execution_reports/{f.name}"
            elif tc_prefix in f.name and f.suffix == '.json':
                m = _re.search(rf'{tc_prefix}_(\d+)', f.name)
                if m:
                    json_files[int(m.group(1))] = f"execution_reports/{f.name}"
    
    vid_dir = EXPORT_DIR / "videos"
    if vid_dir.exists():
        for f in vid_dir.iterdir():
            if tc_prefix in f.name and f.suffix == '.mp4':
                m = _re.search(rf'{tc_prefix}_(\d+)', f.name)
                if m:
                    video_files[int(m.group(1))] = f"videos/{f.name}"

    if not html_files and not json_files:
        return

    try:
        content = report_html.read_text(encoding='utf-8')
    except Exception:
        return
    
    # Find all test result rows and inject links
    # pytest-html rows have: <td class="col-links">...</td>
    # We need to replace each row's links cell with Detail + Video links
    
    # Count test rows (each <td class="col-result"> is one test)
    # Strategy: find all <td class="col-links"> and replace them in order
    
    tc_counter = 0
    
    def replace_links(match):
        nonlocal tc_counter
        tc_counter += 1
        tc_num = tc_counter
        
        links_html = ""
        if tc_num in html_files:
            links_html += f'<a href="{html_files[tc_num]}" target="_blank" style="margin-right:8px;">📊 Detail</a>'
        elif tc_num in json_files:
            links_html += f'<a href="{json_files[tc_num]}" target="_blank" style="margin-right:8px;">📊 Detail</a>'
        
        if tc_num in video_files:
            tc_id = f"{tc_prefix}_{tc_num:02d}"
            links_html += f'<a href="#" onclick="openVideoModal(\'{video_files[tc_num]}\',\'{tc_id}\');return false;">🎬 Video</a>'
        
        if links_html:
            return f'<td class="col-links">{links_html}</td>'
        return match.group(0)
    
    # pytest-html 4.x stores table data inside a JSON blob (data-jsonblob attribute)
    # Links cells appear as escaped HTML: &lt;td class=\&quot;col-links\&quot;&gt;&lt;/td&gt;
    # We need to replace them inside the JSON string
    
    # First try: raw HTML replacement (older pytest-html versions)
    content = _re.sub(r'<td class="col-links">\s*</td>', replace_links, content)
    
    # Second: JSON blob replacement (pytest-html 4.x) 
    # Pattern inside JSON: <td class=\"col-links\"></td>  (with escaped quotes)
    tc_counter = 0  # Reset counter for JSON blob pass
    
    def replace_links_json(match):
        nonlocal tc_counter
        tc_counter += 1
        tc_num = tc_counter
        
        links_html = ""
        if tc_num in html_files:
            links_html += f'<a href=\\"{html_files[tc_num]}\\" target=\\"_blank\\" style=\\"margin-right:8px;\\">📊 Detail</a>'
        elif tc_num in json_files:
            links_html += f'<a href=\\"{json_files[tc_num]}\\" target=\\"_blank\\" style=\\"margin-right:8px;\\">📊 Detail</a>'
        
        if tc_num in video_files:
            tc_id = f"{tc_prefix}_{tc_num:02d}"
            links_html += f'<a href=\\"#\\" onclick=\\"openVideoModal(\'{video_files[tc_num]}\',\'{tc_id}\');return false;\\">🎬 Video</a>'
        
        if links_html:
            return f'<td class=\\"col-links\\">{links_html}</td>'
        return match.group(0)
    
    content = _re.sub(
        r'<td class=\\"col-links\\">\\s*</td>|<td class=\\"col-links\\"></td>',
        replace_links_json,
        content
    )
    
    # Third: HTML numeric entity encoded (pytest-html 4.x data-jsonblob uses &#34; for quotes)
    # Actual pattern: &lt;td class=\&#34;col-links\&#34;&gt;&lt;/td&gt;
    tc_counter = 0
    Q = '\\&#34;'  # escaped quote in jsonblob

    def replace_links_entity(match):
        nonlocal tc_counter
        tc_counter += 1
        tc_num = tc_counter

        links_html = ""
        if tc_num in html_files:
            links_html += f'&lt;a href={Q}{html_files[tc_num]}{Q} target={Q}_blank{Q} style={Q}margin-right:8px;{Q}&gt;\U0001f4ca Detail&lt;/a&gt;'
        elif tc_num in json_files:
            links_html += f'&lt;a href={Q}{json_files[tc_num]}{Q} target={Q}_blank{Q} style={Q}margin-right:8px;{Q}&gt;\U0001f4ca Detail&lt;/a&gt;'

        if tc_num in video_files:
            tc_id = f"{tc_prefix}_{tc_num:02d}"
            links_html += f'&lt;a href={Q}#{Q} onclick={Q}openVideoModal(\'{video_files[tc_num]}\',\'{tc_id}\');return false;{Q}&gt;\U0001f3ac Video&lt;/a&gt;'

        if links_html:
            return f'&lt;td class={Q}col-links{Q}&gt;{links_html}&lt;/td&gt;'
        return match.group(0)

    content = _re.sub(
        r'&lt;td class=\\&#34;col-links\\&#34;&gt;&lt;/td&gt;',
        replace_links_entity,
        content
    )
    
    try:
        report_html.write_text(content, encoding='utf-8')
    except Exception:
        pass


# =============================================================================
# EXECUTION REPORTS (for DV Tasks compatibility)
# =============================================================================

def _generate_execution_reports(report_json: Path, module_slug: str):
    """Convert pytest JSON report to execution_reports/*.json files.
    
    DV Tasks' _parse_test_cases() expects execution_steps_TC_*.json files
    with fields: test_case_id, steps, total_steps, steps_completed, steps_failed,
    total_duration, test_case_description, execution_timestamp.
    
    We generate one file per test function from pytest-json-report output.
    """
    if not report_json.exists():
        return

    try:
        data = json.loads(report_json.read_text())
    except Exception:
        return

    exec_dir = EXPORT_DIR / "execution_reports"
    exec_dir.mkdir(exist_ok=True)

    tests = data.get("tests", [])
    tc_prefix = "TC_" + module_slug.upper().replace("-", "_")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    for i, test in enumerate(tests, 1):
        nodeid = test.get("nodeid", "")
        outcome = test.get("outcome", "unknown")
        duration = test.get("duration", 0) or 0

        # Build test_case_id: TC_API_ACCESS_TIME_01
        tc_num = f"{i:02d}"
        tc_id = f"{tc_prefix}_{tc_num}"

        # Extract test name for title
        # "tests/api/test_access_time.py::TestCreateTemplate::test_create_template_basic"
        parts = nodeid.split("::")
        title = parts[-1] if parts else nodeid
        class_name = parts[-2] if len(parts) >= 2 else ""
        if class_name:
            title = f"{class_name} > {title}"

        # Build steps from call/setup/teardown phases
        steps = []
        for phase_name in ["setup", "call", "teardown"]:
            phase = test.get(phase_name, {})
            if not phase:
                continue
            phase_outcome = phase.get("outcome", "passed")
            crash = phase.get("crash", {})
            longrepr = phase.get("longrepr", "")
            
            step = {
                "step_id": f"step_{phase_name}",
                "phase": phase_name if phase_name != "call" else "execute",
                "description": f"{phase_name}: {title}",
                "status": "passed" if phase_outcome == "passed" else "failed",
                "duration": phase.get("duration", 0) or 0,
                "error": "",
                "screenshot_before": "",
                "screenshot_after": "",
            }
            if phase_outcome != "passed":
                error_msg = ""
                if crash:
                    error_msg = f"{crash.get('path', '')}:{crash.get('lineno', '')} - {crash.get('message', '')}"
                elif longrepr:
                    error_msg = str(longrepr)[:500]
                step["error"] = error_msg
            steps.append(step)

        steps_total = len(steps)
        steps_failed = sum(1 for s in steps if s["status"] == "failed")
        steps_completed = sum(1 for s in steps if s["status"] == "passed")

        execution_report = {
            "test_case_id": tc_id,
            "test_case_description": {
                "case_id": tc_id,
                "title": title,
                "is_reviewed": False,
            },
            "steps": steps,
            "total_steps": steps_total,
            "steps_completed": steps_completed,
            "steps_failed": steps_failed,
            "total_duration": duration,
            "execution_timestamp": ts,
        }

        filename = f"execution_steps_{tc_id}_{ts}.json"
        (exec_dir / filename).write_text(
            json.dumps(execution_report, indent=2, ensure_ascii=False),
            encoding="utf-8",
        )

    if tests:
        log(f"Generated {len(tests)} execution reports", tag=module_slug)


# =============================================================================
# SINGLE TEST FILE EXECUTION
# =============================================================================

def run_single_test(test_file: str) -> dict:
    """Run a single test file with pytest. Returns result dict."""
    module_slug = get_module_slug(test_file)
    report_html = EXPORT_DIR / f"report_{module_slug}.html"
    report_json = EXPORT_DIR / f"report_{module_slug}.json"

    log(f"Running: {Path(test_file).name}", tag=module_slug)
    start = time.time()

    cmd = [
        sys.executable, "-m", "pytest",
        test_file,
        "-v", "--tb=short",
        f"--html={report_html}",
        "--self-contained-html",
        "--json-report",
        f"--json-report-file={report_json}",
    ]

    proc = subprocess.Popen(
        cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, cwd=PROJECT_DIR,
    )
    with _running_procs_lock:
        _running_procs.append(proc)
    try:
        proc.communicate()
    finally:
        with _running_procs_lock:
            try:
                _running_procs.remove(proc)
            except ValueError:
                pass

    duration = time.time() - start

    # Parse JSON report
    passed = failed = errors = total = 0
    if report_json.exists():
        try:
            data = json.loads(report_json.read_text())
            s = data.get("summary", {})
            passed = s.get("passed", 0)
            failed = s.get("failed", 0)
            errors = s.get("error", 0)
            total = s.get("total", 0)
        except Exception:
            pass

    # Inject HOST_WEB into report.html so DV Tasks can parse the server column
    _inject_host_web(report_html)

    # Generate execution_reports/*.json from pytest results
    # DV Tasks counts Pass/Review/All from these files
    _generate_execution_reports(report_json, module_slug)

    status = "PASSED" if proc.returncode == 0 else "FAILED"
    log(f"{status}: {passed}P/{failed}F/{errors}E = {total} total ({duration:.1f}s)", tag=module_slug)

    return {
        "file": test_file,
        "module": module_slug,
        "passed": passed,
        "failed": failed,
        "errors": errors,
        "total": total,
        "duration": round(duration, 1),
        "report_html": str(report_html) if report_html.exists() else None,
        "report_json": str(report_json) if report_json.exists() else None,
        "success": proc.returncode == 0,
    }


# =============================================================================
# UPLOAD PER-MODULE (matching DMPW pattern)
# =============================================================================

def _get_web_test_titles(pytest_json: dict) -> set:
    """Extract web test case titles from pytest JSON report.
    
    WebTestExecutor names files by test case title.
    We need these to match execution_reports files for web test modules.
    """
    titles = set()
    for t in pytest_json.get("tests", []):
        nodeid = t.get("nodeid", "")
        if "/web/" not in nodeid:
            continue
        # Extract the parameterized name or function name
        # e.g., tests/web/.../test_company_management.py::test_data_driven[test_case0]
        parts = nodeid.split("::")
        if len(parts) >= 2:
            func = parts[-1]
            # For parameterized tests, the title comes from the test data
            # But we can also try matching by the test function name parts
            titles.add(func)
    
    # Also scan execution_reports for files that DON'T start with TC_ prefix
    # These are WebTestExecutor-generated files
    exec_dir = EXPORT_DIR / "execution_reports"
    if exec_dir.exists():
        for f in exec_dir.iterdir():
            if f.is_file() and f.suffix == '.json' and not f.name.startswith('execution_steps_TC_'):
                # Extract title from filename: execution_steps_TITLE_TIMESTAMP.json
                name = f.stem  # execution_steps_TITLE_TIMESTAMP
                if name.startswith('execution_steps_'):
                    rest = name[len('execution_steps_'):]
                    # Remove timestamp suffix: _YYYYMMDD_HHMMSS
                    import re as _re2
                    rest = _re2.sub(r'_\d{8}_\d{6}$', '', rest)
                    if rest:
                        titles.add(rest)
    
    return titles


def upload_module_report(result: dict, process_id: str):
    """Upload a single module's test report to DV Tasks.
    
    Creates a ZIP with:
    - report.html (pytest HTML report for this module)
    - execution_reports/*.json (if web tests have them)
    """
    from common.report_uploader import ReportUploader

    uploader = ReportUploader()
    if not uploader.enabled:
        return

    module_slug = result["module"]
    upload_name = get_module_upload_name(module_slug)

    upload_dir = Path(tempfile.mkdtemp(prefix=f"dm3_upload_{module_slug}_"))
    try:
        # Copy pytest HTML report as report.html
        if result.get("report_html") and Path(result["report_html"]).exists():
            shutil.copy2(result["report_html"], upload_dir / "report.html")

        # Copy execution reports for this module (if any)
        # Both TC_xxx_ prefixed (from _generate_execution_reports) and
        # title-named (from WebTestExecutor) files need to be included
        exec_dir = EXPORT_DIR / "execution_reports"
        tc_prefix = "TC_" + module_slug.upper().replace("-", "_")

        # Build list of web test titles from pytest JSON report
        web_test_titles = set()
        if result.get("report_json") and Path(result["report_json"]).exists():
            try:
                rj = json.loads(Path(result["report_json"]).read_text())
                for t in rj.get("tests", []):
                    # Extract test title from nodeid for web tests
                    nodeid = t.get("nodeid", "")
                    if "/web/" in nodeid:
                        # Web tests store title as parameterized ID
                        # e.g., test_company_management.py::test_data_driven[test_case0]
                        # The WebTestExecutor uses the test case title as filename
                        pass  # Will be matched below
                web_test_titles = _get_web_test_titles(rj)
            except Exception:
                pass

        if exec_dir.exists():
            out_exec = upload_dir / "execution_reports"
            out_exec.mkdir(exist_ok=True)
            for f in exec_dir.iterdir():
                if not f.is_file():
                    continue
                # Match by TC prefix
                if tc_prefix in f.name.upper():
                    shutil.copy2(f, out_exec / f.name)
                # Match WebTestExecutor files by title
                elif web_test_titles:
                    fname_upper = f.name.upper()
                    for title in web_test_titles:
                        sanitized = title.replace(" ", "_").replace("/", "_")
                        if sanitized.upper() in fname_upper:
                            shutil.copy2(f, out_exec / f.name)
                            break

        # Copy screenshots for this module (all subdirs for web tests)
        ss_dir = EXPORT_DIR / "screenshots"
        if ss_dir.exists():
            out_ss = upload_dir / "screenshots"
            for subdir in ss_dir.iterdir():
                if subdir.is_dir():
                    # Check if this screenshot dir belongs to our module
                    subdir_upper = subdir.name.upper()
                    match = tc_prefix in subdir_upper
                    if not match and web_test_titles:
                        for title in web_test_titles:
                            sanitized = title.replace(" ", "_").replace("/", "_")
                            if sanitized.upper() in subdir_upper:
                                match = True
                                break
                    if match:
                        dest = out_ss / subdir.relative_to(ss_dir)
                        if subdir.is_dir():
                            shutil.copytree(subdir, dest, dirs_exist_ok=True)

        # Copy videos for this module
        vid_dir = EXPORT_DIR / "videos"
        if vid_dir.exists():
            out_vid = upload_dir / "videos"
            out_vid.mkdir(exist_ok=True)
            for f in vid_dir.iterdir():
                if not f.is_file():
                    continue
                fname_upper = f.name.upper()
                match = tc_prefix in fname_upper
                if not match and web_test_titles:
                    for title in web_test_titles:
                        sanitized = title.replace(" ", "_").replace("/", "_")
                        if sanitized.upper() in fname_upper:
                            match = True
                            break
                if match:
                    shutil.copy2(f, out_vid / f.name)

        log(f"Uploading {upload_name} (P={result['passed']} F={result['failed']} T={result['total']})...", tag=module_slug)

        success = uploader.zip_and_upload(
            source_dir=str(upload_dir),
            test_case_name=upload_name,
            process_id=process_id,
            passed=result["passed"],
            failed=result["failed"],
            total=result["total"],
        )
        if success:
            log(f"Upload OK: {upload_name}", tag=module_slug)
        else:
            log(f"Upload FAILED: {upload_name}", tag=module_slug)

    except Exception as e:
        log(f"Upload error: {e}", tag=module_slug)
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)


def upload_summary_report(results: list, process_id: str):
    """Upload combined 'all' summary to DV Tasks (like DMPW's dmpw-all).
    
    Creates a summary HTML + merged execution reports.
    """
    from common.report_uploader import ReportUploader

    uploader = ReportUploader()
    if not uploader.enabled:
        return

    total_passed = sum(r["passed"] for r in results)
    total_failed = sum(r["failed"] for r in results)
    total_errors = sum(r["errors"] for r in results)
    total_tests = sum(r["total"] for r in results)
    total_modules = len(results)
    total_duration = sum(r["duration"] for r in results)

    pass_rate = round(total_passed / max(total_tests, 1) * 100, 1)
    host_web = os.environ.get("WEB_URL", os.environ.get("BASE_URL", ""))

    upload_dir = Path(tempfile.mkdtemp(prefix="dm3_upload_all_"))
    try:
        # Generate summary HTML (matching DMPW style)
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>DM3 Automation Summary</title></head>
<body style="margin:0;padding:20px;font-family:Segoe UI,Arial,sans-serif;background:linear-gradient(135deg,#1E3A5F,#3B82F6);min-height:100vh;display:flex;align-items:center;justify-content:center;">
<!-- HOST_WEB: {host_web} -->
<div style="background:#fff;border-radius:16px;padding:40px;max-width:520px;width:100%;box-shadow:0 20px 60px rgba(0,0,0,.3);">
<h1 style="text-align:center;color:#2d3748;font-size:24px;margin:0 0 4px;">🔒 DM3 Automation</h1>
<p style="text-align:center;color:#a0aec0;font-size:13px;margin:0 0 28px;">Duall Master 3.0 — Test Summary</p>
<table style="width:100%;border-collapse:separate;border-spacing:12px;" cellpadding="0">
<tr>
<td colspan="2" style="background:#f7fafc;border-radius:12px;padding:20px;text-align:center;">
<div style="font-size:42px;font-weight:700;color:#4a5568;">{total_tests}</div>
<div style="font-size:12px;color:#718096;margin-top:4px;text-transform:uppercase;letter-spacing:.5px;">Total Tests</div>
</td>
</tr>
<tr>
<td style="background:#f0fff4;border-radius:12px;padding:18px;text-align:center;width:50%;">
<div style="font-size:36px;font-weight:700;color:#38a169;">{total_passed}</div>
<div style="font-size:12px;color:#718096;margin-top:4px;text-transform:uppercase;">Passed</div>
</td>
<td style="background:#fff5f5;border-radius:12px;padding:18px;text-align:center;width:50%;">
<div style="font-size:36px;font-weight:700;color:#e53e3e;">{total_failed + total_errors}</div>
<div style="font-size:12px;color:#718096;margin-top:4px;text-transform:uppercase;">Failed</div>
</td>
</tr>
<tr>
<td style="background:#ebf8ff;border-radius:12px;padding:18px;text-align:center;">
<div style="font-size:36px;font-weight:700;color:#3182ce;">{total_modules}</div>
<div style="font-size:12px;color:#718096;margin-top:4px;text-transform:uppercase;">Modules</div>
</td>
<td style="background:#faf5ff;border-radius:12px;padding:18px;text-align:center;">
<div style="font-size:36px;font-weight:700;color:#805ad5;">{int(total_duration)}s</div>
<div style="font-size:12px;color:#718096;margin-top:4px;text-transform:uppercase;">Duration</div>
</td>
</tr>
</table>
<div style="margin:20px 12px 0;">
<div style="display:flex;justify-content:space-between;font-size:12px;color:#718096;margin-bottom:4px;"><span>Pass Rate</span><span>{pass_rate}%</span></div>
<div style="background:#edf2f7;border-radius:8px;height:10px;overflow:hidden;">
<div style="width:{pass_rate}%;height:100%;border-radius:8px;background:linear-gradient(90deg,#38a169,#48bb78);"></div>
</div>
</div>
<div style="margin:16px 12px 0;">
<h3 style="font-size:13px;color:#4a5568;margin:0 0 8px;">Module Results</h3>
{''.join(f'<div style="display:flex;justify-content:space-between;padding:4px 0;font-size:12px;border-bottom:1px solid #edf2f7;"><span style="color:#4a5568;">{r["module"]}</span><span style="color:{"#38a169" if r["success"] else "#e53e3e"};font-weight:600;">{r["passed"]}/{r["total"]} {"✓" if r["success"] else "✗"}</span></div>' for r in results)}
</div>
<p style="text-align:center;color:#cbd5e0;font-size:11px;margin:24px 0 0;padding-top:16px;border-top:1px solid #edf2f7;">Generated: {timestamp} • Process: {process_id}</p>
</div>
</body></html>"""

        (upload_dir / "report.html").write_text(html, encoding="utf-8")

        # Copy all execution reports
        exec_dir = EXPORT_DIR / "execution_reports"
        if exec_dir.exists():
            out_exec = upload_dir / "execution_reports"
            out_exec.mkdir(exist_ok=True)
            for f in exec_dir.iterdir():
                if f.is_file() and f.suffix in ('.json', '.html'):
                    shutil.copy2(f, out_exec / f.name)

        log(f"Uploading summary: all (P={total_passed} F={total_failed} T={total_tests})", tag="ALL")

        success = uploader.zip_and_upload(
            source_dir=str(upload_dir),
            test_case_name="all",
            process_id=process_id,
            passed=total_passed,
            failed=total_failed + total_errors,
            total=total_tests,
        )
        if success:
            log(f"Summary upload OK (process_id={process_id})", tag="ALL")
        else:
            log("Summary upload FAILED", tag="ALL")

    except Exception as e:
        log(f"Summary upload error: {e}", tag="ALL")
    finally:
        shutil.rmtree(upload_dir, ignore_errors=True)


# =============================================================================
# REPORT GENERATION (step reports + videos)
# =============================================================================

def _generate_module_artifacts(module_slug: str):
    """Generate step HTML reports + videos for a specific module.
    
    Must be called BEFORE upload so that ZIP includes HTML + videos.
    """
    exec_dir = EXPORT_DIR / "execution_reports"
    tc_prefix = "TC_" + module_slug.upper().replace("-", "_")
    
    # Find JSON files for this module
    module_json_files = []
    if exec_dir.exists():
        for f in exec_dir.iterdir():
            if f.is_file() and f.suffix == '.json' and tc_prefix in f.name:
                module_json_files.append(str(f))

    if not module_json_files:
        return

    # Generate step HTML reports from JSON
    html_count = 0
    try:
        from generate_step_report import generate_html_report
        for jf in module_json_files:
            try:
                generate_html_report(jf)
                html_count += 1
            except Exception as e:
                log(f"Step report failed: {Path(jf).name}: {e}", tag=module_slug)
    except ImportError:
        pass

    # Generate videos from screenshots (if any)
    video_count = 0
    if os.environ.get("GENERATE_VIDEO", "true").lower() == "true":
        try:
            from generate_test_video import generate_video_for_report
            for jf in module_json_files:
                try:
                    result = generate_video_for_report(jf)
                    if result:
                        video_count += 1
                except Exception:
                    pass
        except ImportError:
            # Try the batch function
            try:
                from generate_test_video import generate_videos_for_reports
                videos = generate_videos_for_reports(str(exec_dir), tc_prefix=tc_prefix)
                video_count = len(videos)
            except ImportError:
                pass
            except Exception:
                pass

    if html_count or video_count:
        log(f"Generated {html_count} step reports, {video_count} videos", tag=module_slug)


def generate_reports():
    """Generate ALL step reports + videos (fallback for any missed during per-module)."""
    report_dir = str(EXPORT_DIR / "execution_reports")

    # Generate step HTML reports for any remaining JSON without HTML
    try:
        from generate_step_report import generate_reports_for_all
        reports = generate_reports_for_all(report_dir)
        log(f"Generated {len(reports)} step reports")
    except ImportError:
        pass
    except Exception as e:
        log(f"Step report generation failed: {e}")

    # Generate videos for any remaining
    if os.environ.get("GENERATE_VIDEO", "true").lower() == "true":
        try:
            from generate_test_video import generate_videos_for_reports
            videos = generate_videos_for_reports(report_dir)
            log(f"Generated {len(videos)} videos")
        except ImportError:
            pass
        except Exception as e:
            log(f"Video generation failed: {e}")


# =============================================================================
# RUN PIPELINE
# =============================================================================

def run_all_tests(test_type: str = "all", upload: bool = True) -> dict:
    """Full pipeline: discover → run each module → upload per-module → upload summary."""
    process_id = datetime.now().strftime('%Y%m%d%H%M%S')
    log(f"{'='*60}")
    log(f"  DM3 TEST RUN — type={test_type}, process_id={process_id}")
    log(f"{'='*60}")

    # Clean old exports
    if EXPORT_DIR.exists():
        shutil.rmtree(EXPORT_DIR)
    EXPORT_DIR.mkdir(exist_ok=True)
    (EXPORT_DIR / "execution_reports").mkdir(exist_ok=True)
    (EXPORT_DIR / "screenshots").mkdir(exist_ok=True)
    (EXPORT_DIR / "videos").mkdir(exist_ok=True)

    # Discover test files
    test_files = discover_test_files(test_type)
    if not test_files:
        log("No test files found")
        return {"results": [], "process_id": process_id}

    log(f"Found {len(test_files)} test files")
    for tf in test_files:
        log(f"  - {Path(tf).name}")

    # Run each test file → generate reports → upload per-module
    results = []
    for test_file in test_files:
        result = run_single_test(test_file)
        results.append(result)

        # Generate step HTML reports + videos for THIS module BEFORE uploading
        _generate_module_artifacts(result["module"])

        # Inject Detail Report + Video links into pytest-html report
        # (must be AFTER step reports + videos are generated)
        report_html = EXPORT_DIR / f"report_{result['module']}.html"
        _inject_report_links(report_html, result["module"])

        # NOW upload with all artifacts (JSON + HTML + videos + links)
        if upload:
            try:
                upload_module_report(result, process_id)
            except Exception as e:
                log(f"Upload error for {result['module']}: {e}")

    # Upload combined summary ("all") — all artifacts already generated
    if upload and results:
        try:
            upload_summary_report(results, process_id)
        except Exception as e:
            log(f"Summary upload error: {e}")

    # Print summary
    total_p = sum(r["passed"] for r in results)
    total_f = sum(r["failed"] for r in results)
    total_e = sum(r["errors"] for r in results)
    total_t = sum(r["total"] for r in results)

    log(f"\n{'='*60}")
    log(f"  SUMMARY: {total_p} passed, {total_f} failed, {total_e} errors / {total_t} total")
    log(f"  Modules: {len(results)}")
    for r in results:
        status = "✓" if r["success"] else "✗"
        log(f"    {status} {r['module']}: {r['passed']}/{r['total']} ({r['duration']}s)")
    log(f"{'='*60}")

    return {"results": results, "process_id": process_id}


def run_module(module_name: str, upload: bool = True) -> dict:
    """Run tests for a specific module."""
    process_id = datetime.now().strftime('%Y%m%d%H%M%S')

    # Find test files matching module name
    test_files = []
    for pattern in [
        str(TESTS_API_DIR / f"test_{module_name.replace('-', '_')}.py"),
        str(TESTS_WEB_DIR / f"**/*{module_name}*/test_*.py"),
        str(TESTS_WEB_DIR / f"**/test_{module_name.replace('-', '_')}.py"),
    ]:
        test_files.extend(glob.glob(pattern, recursive=True))

    if not test_files:
        log(f"No test files found for module: {module_name}")
        return {"results": [], "process_id": process_id}

    results = []
    for test_file in sorted(set(test_files)):
        result = run_single_test(test_file)
        results.append(result)
        if upload:
            try:
                upload_module_report(result, process_id)
            except Exception as e:
                log(f"Upload error: {e}")

    return {"results": results, "process_id": process_id}


# =============================================================================
# WATCH / AUTO MODE
# =============================================================================

def check_and_run():
    """Check for new commits, run affected tests."""
    log("Checking for new commits...")

    state = load_state()
    current = get_current_commit()

    if not current:
        log("Could not get current commit")
        return

    last = state.get("last_commit", "")
    if not last:
        log("First run — saving baseline commit")
        state["last_commit"] = current
        save_state(state)
        return

    if current == last:
        log("No new commits")
        return

    log(f"New commits: {last[:8]} -> {current[:8]}")
    changed = get_changed_files(last)

    if not changed:
        log("No relevant files changed")
        state["last_commit"] = current
        save_state(state)
        return

    log(f"Changed files: {len(changed)}")
    test_files = map_changed_to_tests(changed)

    if test_files:
        log(f"Running {len(test_files)} affected test files")
        process_id = datetime.now().strftime('%Y%m%d%H%M%S')
        results = []
        for tf in test_files:
            result = run_single_test(tf)
            results.append(result)
            try:
                upload_module_report(result, process_id)
            except Exception as e:
                log(f"Upload error: {e}")
    else:
        log("No test files affected by changes")

    state["last_commit"] = current
    state["last_run"] = datetime.now().isoformat()
    state["runs"] = state.get("runs", 0) + 1
    save_state(state)


def auto_mode(check_interval: int = 180):
    """Fully automatic: watch commits + nightly full run."""
    # PID file
    pid_file = LOGS_DIR / "automation.pid"
    pid_file.write_text(f"{os.getpid()}\n{datetime.now().isoformat()}\n")

    log("=" * 60)
    log(f"  DM3 AUTO MODE (PID: {os.getpid()})")
    log(f"  Check interval: {check_interval // 60} min")
    log(f"  Nightly full run: 00:00-06:00")
    log("=" * 60)

    # Background git pull
    stop_event = threading.Event()
    pull_thread = threading.Thread(
        target=_git_pull_worker, args=(check_interval, stop_event),
        daemon=True, name="GitPull",
    )
    pull_thread.start()

    last_nightly = None

    while True:
        try:
            now = datetime.now()

            # Nightly full run
            if 0 <= now.hour < 6 and last_nightly != now.date():
                log("NIGHTLY FULL TEST RUN")
                run_all_tests("all", upload=True)
                last_nightly = now.date()
            else:
                check_and_run()

            log(f"Next check: {(now + timedelta(seconds=check_interval)).strftime('%H:%M:%S')}")
            time.sleep(check_interval)

        except KeyboardInterrupt:
            log("Stopping...")
            stop_event.set()
            pull_thread.join(timeout=5)
            pid_file.unlink(missing_ok=True)
            break
        except Exception as e:
            log(f"Error: {e}")
            time.sleep(60)


def _git_pull_worker(interval: int, stop_event: threading.Event):
    """Background thread: git pull periodically."""
    repo_dir = PROJECT_DIR.parent
    while not stop_event.is_set():
        try:
            result = subprocess.run(
                ["git", "pull", "--quiet"],
                capture_output=True, text=True, cwd=repo_dir,
            )
            if result.returncode == 0:
                log(f"Pull OK (HEAD: {get_current_commit()[:8]})", tag="PULL")
            else:
                log(f"Pull failed: {result.stderr.strip()}", tag="PULL")
        except Exception as e:
            log(f"Pull error: {e}", tag="PULL")
        stop_event.wait(interval)


# =============================================================================
# STATUS / STOP
# =============================================================================

def check_status():
    pid_file = LOGS_DIR / "automation.pid"
    if not pid_file.exists():
        print("📊 Automation is NOT running (no PID file)")
        return False
    try:
        lines = pid_file.read_text().strip().split("\n")
        pid = int(lines[0])
        os.kill(pid, 0)  # Check if alive
        print(f"✅ Automation is RUNNING (PID: {pid}, started: {lines[1] if len(lines) > 1 else '?'})")
        return True
    except (OSError, ValueError):
        print("❌ PID file exists but process is dead — cleaning up")
        pid_file.unlink(missing_ok=True)
        return False


def stop_automation():
    pid_file = LOGS_DIR / "automation.pid"
    if not pid_file.exists():
        print("📊 Automation is not running")
        return
    try:
        pid = int(pid_file.read_text().strip().split("\n")[0])
        os.kill(pid, signal.SIGTERM)
        time.sleep(2)
        try:
            os.kill(pid, 0)
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
        print(f"✅ Automation stopped (PID: {pid})")
    except Exception as e:
        print(f"❌ Error: {e}")
    pid_file.unlink(missing_ok=True)


# =============================================================================
# MAIN
# =============================================================================

def main():
    if len(sys.argv) > 1 and sys.argv[1] in ("status", "stop", "help", "--help", "-h"):
        cmd = sys.argv[1]
        if cmd == "status":
            check_status()
        elif cmd == "stop":
            stop_automation()
        else:
            print(__doc__)
        return

    parser = argparse.ArgumentParser(description="DM3 Automation Daily Runner")
    parser.add_argument("--once", action="store_true", help="Run once and exit")
    parser.add_argument("--api", action="store_true", help="API tests only")
    parser.add_argument("--web", action="store_true", help="Web tests only")
    parser.add_argument("--module", type=str, help="Run specific module")
    parser.add_argument("--no-upload", action="store_true", help="Skip upload")
    parser.add_argument("--no-video", action="store_true", help="Skip video generation")
    parser.add_argument("--interval", type=int, default=180, help="Check interval (seconds)")
    args = parser.parse_args()

    if args.no_video:
        os.environ["GENERATE_VIDEO"] = "false"

    upload = not args.no_upload

    if args.module:
        run_module(args.module, upload=upload)
    elif args.once:
        test_type = "api" if args.api else "web" if args.web else "all"
        data = run_all_tests(test_type, upload=upload)
        has_failures = any(not r["success"] for r in data["results"])
        sys.exit(1 if has_failures else 0)
    else:
        # Auto mode (default)
        auto_mode(check_interval=args.interval)


if __name__ == "__main__":
    main()
