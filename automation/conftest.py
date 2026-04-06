"""
Root conftest.py — shared fixtures and pytest-html hooks for DM3 automation.
Matches dmpw_automation report format: Review column, Detail Report + Video links.
"""
import os
import re
import glob
import json
import pytest
from pathlib import Path
from common.api_client import DM3Client
from common import constants


# ── pytest-html plugin reference ──────────────────────────────

@pytest.hookimpl(tryfirst=True)
def pytest_configure(config):
    global pytest_html
    pytest_html = config.pluginmanager.getplugin("html")


# ── API Fixtures ──────────────────────────────────────────────

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


# ── Playwright Page Fixture ───────────────────────────────────

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
        context = browser.new_context(viewport={"width": 1920, "height": 1080})
        pg = context.new_page()
        pg.set_default_timeout(constants.TIMEOUT_PAGE)
        yield pg
        context.close()
        browser.close()


# ── pytest-html Hooks (matching dmpw_automation format) ───────

@pytest.hookimpl(hookwrapper=True)
def pytest_runtest_makereport(item, call):
    """Store test_case_id on the report for pytest-html hooks."""
    outcome = yield
    rep = outcome.get_result()

    # Store test_case_id if available
    if hasattr(item, 'test_case_id'):
        rep.test_case_id = item.test_case_id
    if hasattr(item, 'is_reviewed'):
        rep.is_reviewed = item.is_reviewed


def pytest_html_results_table_header(cells):
    """Add Review column header to results table."""
    cells.append('<th class="sortable" data-column-type="review">Review</th>')


def pytest_html_results_summary(prefix, summary, postfix):
    """Inject video modal overlay and script into report HTML."""
    prefix.extend([
        '<div id="videoModalOverlay" style="display:none;position:fixed;top:0;left:0;width:100%;height:100%;'
        'background:rgba(0,0,0,0.85);z-index:10000;justify-content:center;align-items:center;cursor:pointer;"'
        ' onclick="if(event.target===this){closeVideoModal()}">'
        '<div style="position:relative;width:90%;max-width:1100px;background:#1a1a1a;border-radius:12px;'
        'overflow:hidden;cursor:default;" onclick="event.stopPropagation()">'
        '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:#222;color:#fff;">'
        '<span id="videoModalTitle" style="font-weight:600;font-size:15px;"></span>'
        '<button onclick="closeVideoModal()" style="background:none;border:none;color:#fff;font-size:26px;'
        'cursor:pointer;line-height:1;">&times;</button></div>'
        '<video id="reportVideo" controls style="width:100%;display:block;"></video>'
        '<div style="display:flex;gap:10px;padding:10px 20px;background:#222;align-items:center;justify-content:center;">'
        '<label style="color:#ccc;font-size:13px;">Speed:</label>'
        '<select id="reportPlaybackRate" onchange="document.getElementById(\'reportVideo\').playbackRate='
        'parseFloat(this.value)" style="padding:4px 8px;border-radius:4px;border:1px solid #555;background:#333;color:#fff;">'
        '<option value="0.25">0.25x</option>'
        '<option value="0.5" selected>0.5x</option>'
        '<option value="1">1x</option>'
        '<option value="1.5">1.5x</option>'
        '<option value="2">2x</option>'
        '</select></div></div></div>',
        '<script>'
        'function openVideoModal(src, title){'
        'var o=document.getElementById("videoModalOverlay");'
        'var v=document.getElementById("reportVideo");'
        'document.getElementById("videoModalTitle").textContent="Video: "+title;'
        'v.src=src;v.playbackRate=0.5;'
        'document.getElementById("reportPlaybackRate").value="0.5";'
        'o.style.display="flex";v.play();'
        '}'
        'function closeVideoModal(){'
        'var o=document.getElementById("videoModalOverlay");'
        'var v=document.getElementById("reportVideo");'
        'v.pause();v.src="";o.style.display="none";'
        '}'
        'document.addEventListener("keydown",function(e){if(e.key==="Escape")closeVideoModal();});'
        '</script>',
    ])


# Track test index per module for TC_xxx_NN mapping
_module_test_counter = {}


def pytest_html_results_table_row(report, cells):
    """Add Detail Report + Video links and Review status to each test row."""
    test_case_id = getattr(report, 'test_case_id', None)
    is_reviewed = getattr(report, 'is_reviewed', None)

    # Only process 'call' phase (skip setup/teardown)
    if report.when != 'call':
        cells.append(f'<td class="col-review" style="text-align:center;"><span style="color:#999;font-size:12px;">-</span></td>')
        return

    # Try to find test_case_id from execution reports if not set
    if not test_case_id and hasattr(report, 'nodeid'):
        nodeid = report.nodeid
        
        # Method 1: Match by function name in web test execution reports
        func_match = re.search(r'::(\w+)(?:\[|$)', nodeid)
        if func_match:
            func_name = func_match.group(1)
            for jf in sorted(glob.glob("export/execution_reports/execution_steps_*.json"), reverse=True):
                basename = os.path.basename(jf)
                sanitized = func_name.replace(" ", "_").replace("/", "_")
                if sanitized in basename:
                    try:
                        with open(jf, 'r', encoding='utf-8') as f:
                            data = json.load(f)
                        test_case_id = data.get('test_case_id', '')
                        break
                    except Exception:
                        continue

        # Method 2: For API tests — use module + counter to find TC_xxx_NN
        if not test_case_id:
            # Extract module from path: tests/api/test_access_time.py -> api-access-time
            path_match = re.search(r'tests/(api|web)/(?:.*/)?test_(\w+)\.py', nodeid)
            if path_match:
                test_type = path_match.group(1)
                module_name = path_match.group(2).replace("_", "-")
                module_slug = f"{test_type}-{module_name}"
                tc_prefix = "TC_" + module_slug.upper().replace("-", "_")
                
                # Increment counter for this module
                if module_slug not in _module_test_counter:
                    _module_test_counter[module_slug] = 0
                _module_test_counter[module_slug] += 1
                tc_num = f"{_module_test_counter[module_slug]:02d}"
                test_case_id = f"{tc_prefix}_{tc_num}"

    if test_case_id:
        # Find latest execution report HTML
        pattern = f"export/execution_reports/execution_steps_{test_case_id}_*.html"
        html_files = sorted(glob.glob(pattern), reverse=True)

        # Find latest execution report JSON (for step detail page generation)
        json_pattern = f"export/execution_reports/execution_steps_{test_case_id}_*.json"
        json_files = sorted(glob.glob(json_pattern), reverse=True)

        # Find latest video
        video_pattern = f"export/videos/test_execution_{test_case_id}_*.mp4"
        video_files = sorted(glob.glob(video_pattern), reverse=True)

        links_html = ""
        # Detail report link
        if html_files:
            rel = os.path.relpath(html_files[0], 'export')
            links_html += f'<a href="{rel}" target="_blank" style="margin-right:10px;">📊 Detail</a>'
        elif json_files:
            # JSON exists but HTML not yet generated — link to JSON
            rel = os.path.relpath(json_files[0], 'export')
            links_html += f'<a href="{rel}" target="_blank" style="margin-right:10px;">📊 Detail</a>'
        
        # Video link
        if video_files:
            rel = os.path.relpath(video_files[0], 'export')
            links_html += (
                f'<a href="#" onclick="openVideoModal(\'{rel}\',\'{test_case_id}\');return false;">'
                f'🎬 Video</a>'
            )

        if links_html:
            cells[-1] = f'<td class="col-links">{links_html}</td>'

    # Append Review cell (always, to match header)
    if is_reviewed:
        review_html = '<span style="background:#d4edda;color:#155724;padding:2px 8px;border-radius:10px;font-size:12px;font-weight:bold;">✓</span>'
    else:
        review_html = '<span style="color:#999;font-size:12px;">-</span>'
    cells.append(f'<td class="col-review" style="text-align:center;">{review_html}</td>')
