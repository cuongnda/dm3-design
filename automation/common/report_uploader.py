"""
Report Uploader — uploads test results to DV Tasks server API.
Follows the same pattern as dmpw_automation/client_api/upload_client.py
"""

import os
import zipfile
import tempfile
import requests
from pathlib import Path
from datetime import datetime


class ReportUploader:
    def __init__(self):
        self.server_url = os.getenv("REPORT_UPLOAD_URL", "").rstrip("/")
        self.token = os.getenv("REPORT_UPLOAD_TOKEN", "")
        self.prefix = os.getenv("REPORT_PREFIX", "dm3")
        self.timeout = int(os.getenv("REPORT_UPLOAD_TIMEOUT", "30"))
        self.enabled = bool(self.server_url and self.token)

    def upload(
        self,
        report_path: str,
        test_case_name: str = "dm3-automation",
        process_id: str = "",
        passed: int = 0,
        failed: int = 0,
        total: int = 0,
    ) -> bool:
        """Upload a report file (or directory) to the server."""
        if not self.enabled:
            return False

        report = Path(report_path)
        if not report.exists():
            print(f"Report not found: {report_path}")
            return False

        # If it's a directory, zip it first
        if report.is_dir():
            zip_path = self._zip_directory(report)
            upload_file = zip_path
        else:
            upload_file = report

        try:
            if not process_id:
                process_id = datetime.now().strftime("%Y%m%d%H%M%S")

            upload_name = f"{self.prefix}-{test_case_name}"

            headers = {}
            if self.token:
                headers["Authorization"] = f"Bearer {self.token}"

            with open(upload_file, "rb") as f:
                files = {"file": (upload_file.name if isinstance(upload_file, Path) else os.path.basename(upload_file), f)}
                data = {
                    "test_case_name": upload_name,
                    "process_id": process_id,
                    "module_pass": str(passed),
                    "module_failed": str(failed),
                    "module_total": str(total),
                    "module_review": "0",
                }

                resp = requests.post(
                    self.server_url,
                    headers=headers,
                    files=files,
                    data=data,
                    timeout=self.timeout,
                )

            if resp.status_code < 300:
                print(f"✅ Report uploaded: {upload_name} ({passed}/{total} passed)")
                return True
            else:
                print(f"❌ Upload failed: {resp.status_code} {resp.text[:200]}")
                return False

        except Exception as e:
            print(f"❌ Upload error: {e}")
            return False

    def _zip_directory(self, dir_path: Path) -> Path:
        """Zip a directory for upload."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        zip_path = Path(tempfile.gettempdir()) / f"{dir_path.name}_{timestamp}.zip"

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            for file in dir_path.rglob("*"):
                if file.is_file():
                    zf.write(file, file.relative_to(dir_path))

        return zip_path
