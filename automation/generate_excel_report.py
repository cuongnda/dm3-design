#!/usr/bin/env python3
"""
DM3 Automation — Excel Test Report Generator
Generates api_test_report.xlsx and web_test_report.xlsx from pytest results.

Usage:
    python generate_excel_report.py                    # from last test run (export/)
    python generate_excel_report.py --run-first        # run tests then generate
    python generate_excel_report.py --json report.json # from specific JSON
"""
import argparse
import json
import os
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

try:
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill, Alignment, Border, Side
    from openpyxl.utils import get_column_letter
except ImportError:
    print("ERROR: openpyxl not installed. Run: pip install openpyxl")
    sys.exit(1)

PROJECT_ROOT = Path(__file__).parent
EXPORT_DIR = PROJECT_ROOT / "export"

# ── Styles ────────────────────────────────────────────────────

HEADER_FONT = Font(name="Calibri", size=11, bold=True, color="FFFFFF")
HEADER_FILL = PatternFill(start_color="2F5496", end_color="2F5496", fill_type="solid")
PASS_FILL = PatternFill(start_color="C6EFCE", end_color="C6EFCE", fill_type="solid")
FAIL_FILL = PatternFill(start_color="FFC7CE", end_color="FFC7CE", fill_type="solid")
SKIP_FILL = PatternFill(start_color="FFF2CC", end_color="FFF2CC", fill_type="solid")
ERROR_FILL = PatternFill(start_color="F4CCCC", end_color="F4CCCC", fill_type="solid")
SUMMARY_FONT = Font(name="Calibri", size=11, bold=True)
TITLE_FONT = Font(name="Calibri", size=14, bold=True, color="2F5496")
SUBTITLE_FONT = Font(name="Calibri", size=11, italic=True, color="666666")
THIN_BORDER = Border(
    left=Side(style="thin"), right=Side(style="thin"),
    top=Side(style="thin"), bottom=Side(style="thin"),
)
PASS_FONT = Font(name="Calibri", size=11, bold=True, color="006100")
FAIL_FONT = Font(name="Calibri", size=11, bold=True, color="9C0006")


def style_header_row(ws, row, col_count):
    for col in range(1, col_count + 1):
        cell = ws.cell(row=row, column=col)
        cell.font = HEADER_FONT
        cell.fill = HEADER_FILL
        cell.alignment = Alignment(horizontal="center", vertical="center")
        cell.border = THIN_BORDER


def style_data_cell(ws, row, col, value=None):
    cell = ws.cell(row=row, column=col)
    cell.border = THIN_BORDER
    cell.alignment = Alignment(vertical="center", wrap_text=True)
    return cell


def auto_width(ws, min_width=10, max_width=60):
    for col in ws.columns:
        max_len = 0
        col_letter = get_column_letter(col[0].column)
        for cell in col:
            if cell.value:
                max_len = max(max_len, len(str(cell.value)))
        ws.column_dimensions[col_letter].width = min(max(max_len + 2, min_width), max_width)


# ── Collect Test Results ──────────────────────────────────────

def run_pytest_json(test_type="all"):
    """Run pytest with JSON output and return results."""
    json_path = EXPORT_DIR / f"test_results_{test_type}.json"
    cmd = [
        str(PROJECT_ROOT / "venv" / "bin" / "python"), "-m", "pytest",
        "--tb=no", "-q", "--no-header",
        f"--json-report", f"--json-report-file={json_path}",
    ]
    if test_type == "api":
        cmd.append("tests/api/")
    elif test_type == "web":
        cmd.append("tests/web/")
    else:
        cmd.append("tests/")

    env = os.environ.copy()
    env["HEADLESS"] = "true"
    subprocess.run(cmd, cwd=str(PROJECT_ROOT), env=env, timeout=600)
    return json_path


def collect_from_pytest_json(json_path: Path) -> dict:
    """Parse pytest-json-report output."""
    with open(json_path) as f:
        data = json.load(f)

    modules = {}
    for test in data.get("tests", []):
        node_id = test.get("nodeid", "")
        outcome = test.get("outcome", "unknown")
        duration = test.get("duration", 0)

        # Parse module from node_id: tests/api/test_system_admin.py::TestClass::test_name
        parts = node_id.split("::")
        file_path = parts[0] if parts else ""

        # Determine module name from file path
        if "tests/api/" in file_path:
            module_type = "api"
            module_name = Path(file_path).stem.replace("test_", "")
        elif "tests/web/" in file_path:
            module_type = "web"
            module_name = Path(file_path).stem.replace("test_", "")
        else:
            module_type = "other"
            module_name = Path(file_path).stem

        full_module = f"{module_type}-{module_name}"

        if full_module not in modules:
            modules[full_module] = {
                "name": full_module,
                "type": module_type,
                "tests": [],
                "passed": 0, "failed": 0, "skipped": 0, "error": 0,
            }

        # Test name
        test_name = parts[-1] if len(parts) > 1 else node_id
        class_name = parts[1] if len(parts) > 2 else ""

        modules[full_module]["tests"].append({
            "name": test_name,
            "class": class_name,
            "outcome": outcome,
            "duration": round(duration, 3),
            "node_id": node_id,
        })

        if outcome == "passed":
            modules[full_module]["passed"] += 1
        elif outcome == "failed":
            modules[full_module]["failed"] += 1
        elif outcome == "skipped":
            modules[full_module]["skipped"] += 1
        else:
            modules[full_module]["error"] += 1

    return {
        "timestamp": data.get("created", datetime.now().isoformat()),
        "duration": data.get("duration", 0),
        "modules": modules,
    }


def collect_from_last_run() -> dict:
    """Collect results from pytest cache / report.html as fallback."""
    # Try JSON report first
    json_files = sorted(EXPORT_DIR.glob("test_results_*.json"), reverse=True)
    if json_files:
        return collect_from_pytest_json(json_files[0])

    # Fallback: run pytest with JSON plugin
    print("No cached results found. Running tests...")
    json_path = run_pytest_json("all")
    return collect_from_pytest_json(json_path)


# ── Excel Generation ──────────────────────────────────────────

def generate_report(results: dict, test_type: str, output_path: Path):
    """Generate Excel report for API or Web tests."""
    wb = Workbook()

    # Filter modules by type
    modules = {k: v for k, v in results["modules"].items() if v["type"] == test_type}

    if not modules:
        print(f"  No {test_type} test results found, skipping.")
        return False

    # ── Summary Sheet ──
    ws = wb.active
    ws.title = "Summary"

    # Title
    ws.merge_cells("A1:G1")
    ws["A1"] = f"DM3 {test_type.upper()} Test Report"
    ws["A1"].font = TITLE_FONT

    ws.merge_cells("A2:G2")
    ws["A2"] = f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} | Duration: {results['duration']:.1f}s"
    ws["A2"].font = SUBTITLE_FONT

    # Summary table header
    row = 4
    headers = ["Module", "Total", "Passed", "Failed", "Skipped", "Error", "Pass Rate"]
    for col, h in enumerate(headers, 1):
        ws.cell(row=row, column=col, value=h)
    style_header_row(ws, row, len(headers))

    # Summary data
    total_all = {"total": 0, "passed": 0, "failed": 0, "skipped": 0, "error": 0}
    row += 1
    for mod_name in sorted(modules.keys()):
        mod = modules[mod_name]
        total = mod["passed"] + mod["failed"] + mod["skipped"] + mod["error"]
        rate = (mod["passed"] / total * 100) if total > 0 else 0

        ws.cell(row=row, column=1, value=mod_name).font = Font(bold=True)
        ws.cell(row=row, column=2, value=total)
        ws.cell(row=row, column=3, value=mod["passed"])
        ws.cell(row=row, column=4, value=mod["failed"])
        ws.cell(row=row, column=5, value=mod["skipped"])
        ws.cell(row=row, column=6, value=mod["error"])

        rate_cell = ws.cell(row=row, column=7, value=f"{rate:.0f}%")
        if rate == 100:
            rate_cell.font = PASS_FONT
            rate_cell.fill = PASS_FILL
        elif rate >= 80:
            rate_cell.fill = SKIP_FILL
        elif rate > 0:
            rate_cell.font = FAIL_FONT
            rate_cell.fill = FAIL_FILL
        else:
            rate_cell.fill = ERROR_FILL

        for col in range(1, 8):
            style_data_cell(ws, row, col)

        total_all["total"] += total
        total_all["passed"] += mod["passed"]
        total_all["failed"] += mod["failed"]
        total_all["skipped"] += mod["skipped"]
        total_all["error"] += mod["error"]
        row += 1

    # Total row
    overall_rate = (total_all["passed"] / total_all["total"] * 100) if total_all["total"] > 0 else 0
    ws.cell(row=row, column=1, value="TOTAL").font = SUMMARY_FONT
    ws.cell(row=row, column=2, value=total_all["total"]).font = SUMMARY_FONT
    ws.cell(row=row, column=3, value=total_all["passed"]).font = SUMMARY_FONT
    ws.cell(row=row, column=4, value=total_all["failed"]).font = SUMMARY_FONT
    ws.cell(row=row, column=5, value=total_all["skipped"]).font = SUMMARY_FONT
    ws.cell(row=row, column=6, value=total_all["error"]).font = SUMMARY_FONT
    total_rate_cell = ws.cell(row=row, column=7, value=f"{overall_rate:.0f}%")
    total_rate_cell.font = Font(name="Calibri", size=12, bold=True,
                                 color="006100" if overall_rate == 100 else "9C0006")
    for col in range(1, 8):
        style_data_cell(ws, row, col)
        ws.cell(row=row, column=col).fill = PatternFill(
            start_color="D9E2F3", end_color="D9E2F3", fill_type="solid"
        )

    auto_width(ws)

    # ── Per-Module Sheets ──
    for mod_name in sorted(modules.keys()):
        mod = modules[mod_name]
        # Sheet name max 31 chars
        sheet_name = mod_name[:31]
        ws_mod = wb.create_sheet(title=sheet_name)

        # Module header
        total = mod["passed"] + mod["failed"] + mod["skipped"] + mod["error"]
        rate = (mod["passed"] / total * 100) if total > 0 else 0

        ws_mod.merge_cells("A1:E1")
        ws_mod["A1"] = f"Module: {mod_name}"
        ws_mod["A1"].font = TITLE_FONT

        ws_mod["A3"] = "Total Tests:"
        ws_mod["B3"] = total
        ws_mod["A3"].font = SUMMARY_FONT
        ws_mod["A4"] = "Passed:"
        ws_mod["B4"] = mod["passed"]
        ws_mod["B4"].fill = PASS_FILL
        ws_mod["A4"].font = SUMMARY_FONT
        ws_mod["A5"] = "Failed:"
        ws_mod["B5"] = mod["failed"]
        if mod["failed"]:
            ws_mod["B5"].fill = FAIL_FILL
        ws_mod["A5"].font = SUMMARY_FONT
        ws_mod["A6"] = "Pass Rate:"
        ws_mod["B6"] = f"{rate:.0f}%"
        ws_mod["B6"].font = PASS_FONT if rate == 100 else FAIL_FONT
        ws_mod["A6"].font = SUMMARY_FONT

        # Test list
        row = 8
        headers = ["#", "Test Name", "Class", "Status", "Duration (s)"]
        for col, h in enumerate(headers, 1):
            ws_mod.cell(row=row, column=col, value=h)
        style_header_row(ws_mod, row, len(headers))

        row += 1
        for i, test in enumerate(mod["tests"], 1):
            ws_mod.cell(row=row, column=1, value=i)
            ws_mod.cell(row=row, column=2, value=test["name"])
            ws_mod.cell(row=row, column=3, value=test["class"])

            status_cell = ws_mod.cell(row=row, column=4, value=test["outcome"].upper())
            if test["outcome"] == "passed":
                status_cell.fill = PASS_FILL
                status_cell.font = PASS_FONT
            elif test["outcome"] == "failed":
                status_cell.fill = FAIL_FILL
                status_cell.font = FAIL_FONT
            elif test["outcome"] == "skipped":
                status_cell.fill = SKIP_FILL
            else:
                status_cell.fill = ERROR_FILL

            ws_mod.cell(row=row, column=5, value=test["duration"])

            for col in range(1, 6):
                style_data_cell(ws_mod, row, col)
            row += 1

        auto_width(ws_mod)

    # Save
    output_path.parent.mkdir(parents=True, exist_ok=True)
    wb.save(str(output_path))
    print(f"  ✅ {output_path.name}: {total_all['passed']}/{total_all['total']} passed ({overall_rate:.0f}%)")
    return True


# ── Main ──────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Generate Excel test reports")
    parser.add_argument("--run-first", action="store_true", help="Run tests before generating")
    parser.add_argument("--json", type=str, help="Path to pytest-json-report file")
    parser.add_argument("--output-dir", type=str, default=str(EXPORT_DIR), help="Output directory")
    args = parser.parse_args()

    output_dir = Path(args.output_dir)
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")

    print(f"\n{'='*60}")
    print(f"  DM3 Automation — Excel Report Generator")
    print(f"  {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print(f"{'='*60}\n")

    if args.run_first:
        print("Running tests...")
        # Run API tests
        print("  → API tests...")
        api_json = run_pytest_json("api")
        # Run Web tests
        print("  → Web tests...")
        web_json = run_pytest_json("web")
        print()

        api_results = collect_from_pytest_json(api_json)
        web_results = collect_from_pytest_json(web_json)
    elif args.json:
        json_path = Path(args.json)
        if not json_path.exists():
            print(f"ERROR: {json_path} not found")
            sys.exit(1)
        api_results = web_results = collect_from_pytest_json(json_path)
    else:
        # Run both to get fresh results
        print("Running all tests for fresh results...")
        print("  → API tests...")
        api_json = run_pytest_json("api")
        api_results = collect_from_pytest_json(api_json)
        print("  → Web tests...")
        web_json = run_pytest_json("web")
        web_results = collect_from_pytest_json(web_json)
        print()

    # Generate reports
    print("Generating Excel reports...")
    api_path = output_dir / f"api_test_report_{ts}.xlsx"
    web_path = output_dir / f"web_test_report_{ts}.xlsx"

    api_ok = generate_report(api_results, "api", api_path)
    web_ok = generate_report(web_results, "web", web_path)

    # Also save as latest (without timestamp)
    if api_ok:
        latest_api = output_dir / "api_test_report.xlsx"
        import shutil
        shutil.copy2(api_path, latest_api)
    if web_ok:
        latest_web = output_dir / "web_test_report.xlsx"
        import shutil
        shutil.copy2(web_path, latest_web)

    print(f"\n{'='*60}")
    print(f"  Reports saved to: {output_dir}/")
    if api_ok:
        print(f"    📊 {api_path.name}")
    if web_ok:
        print(f"    📊 {web_path.name}")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
