"""
Report Uploader — zips and uploads test results to DV Tasks server API.
Uses curl for upload (avoids Python SSL issues).
Adapted from dmpw_automation/client_api/upload_client.py
"""
import json
import os
import subprocess
import tempfile
import time
import zipfile
from datetime import datetime
from pathlib import Path

from dotenv import load_dotenv

# Ensure .env is loaded
_env_path = Path(__file__).parent.parent / '.env'
if _env_path.exists():
    load_dotenv(_env_path)

# Configuration
_host = os.getenv('REPORT_UPLOAD_URL', '').rstrip('/')
SERVER_URL = _host if '/api/' in _host else f"{_host}/api/automation/upload" if _host else ''
UPLOAD_TOKEN = os.getenv('REPORT_UPLOAD_TOKEN', '')
REPORT_PREFIX = os.getenv('REPORT_PREFIX', 'dm3')
UPLOAD_TIMEOUT = int(os.getenv('REPORT_UPLOAD_TIMEOUT', '60'))
MAX_RETRIES = 3
RETRY_DELAY = 2


class ReportUploader:
    """Zip and upload report directory to DV Tasks server."""

    def __init__(self):
        self.server_url = SERVER_URL
        self.token = UPLOAD_TOKEN
        self.prefix = REPORT_PREFIX
        self.timeout = UPLOAD_TIMEOUT
        self.enabled = bool(self.server_url and self.token)

    def zip_and_upload(
        self,
        source_dir: str,
        test_case_name: str = "dm3-automation",
        process_id: str = "",
        passed: int = 0,
        failed: int = 0,
        review: int = 0,
        total: int = 0,
    ) -> bool:
        """Zip a directory and upload to server. Returns True on success."""
        source = Path(source_dir)
        if not source.is_dir():
            print(f"Not a directory: {source_dir}")
            return False

        # Create ZIP
        ts = datetime.now().strftime('%Y%m%d_%H%M%S')
        zip_path = Path(tempfile.gettempdir()) / f"{source.name}_{ts}.zip"

        try:
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                count = 0
                for fp in source.rglob("*"):
                    if fp.is_file():
                        zf.write(fp, fp.relative_to(source))
                        count += 1
            print(f"ZIP created: {count} files, {zip_path.stat().st_size / 1024:.1f} KB")

            # Upload via curl
            # Prefix with dash separator: "dm3" + "module-1-foo" -> "dm3-module-1-foo"
            if self.prefix:
                sep = "-" if self.prefix and not self.prefix.endswith("-") else ""
                upload_name = f"{self.prefix}{sep}{test_case_name}"
            else:
                upload_name = test_case_name
            if not process_id:
                process_id = ts

            for attempt in range(MAX_RETRIES):
                try:
                    cmd = [
                        'curl', '-s', '-X', 'POST', self.server_url,
                        '-F', f'file=@{zip_path}',
                        '--max-time', str(self.timeout),
                        '-w', '\n%{http_code}',
                    ]
                    cmd.extend(['-F', f'test_case_name={upload_name}'])
                    cmd.extend(['-F', f'process_id={process_id}'])
                    if total > 0:
                        cmd.extend(['-F', f'pass={passed}'])
                        cmd.extend(['-F', f'failed={failed}'])
                        cmd.extend(['-F', f'review={review}'])
                        cmd.extend(['-F', f'total={total}'])
                    if self.token:
                        cmd.extend(['-H', f'Authorization: Bearer {self.token}'])

                    result = subprocess.run(cmd, capture_output=True, text=True, timeout=self.timeout + 30)
                    lines = result.stdout.strip().rsplit('\n', 1)
                    body = lines[0] if len(lines) > 1 else ''
                    status = int(lines[-1]) if lines else 0

                    if status in (200, 201):
                        try:
                            resp = json.loads(body)
                            print(f"Upload OK: {upload_name} -> {resp.get('folder_name', '')}")
                        except Exception:
                            print(f"Upload OK: {upload_name}")
                        return True
                    else:
                        print(f"Upload failed ({status}): {body[:200]}")
                        if attempt < MAX_RETRIES - 1:
                            time.sleep(RETRY_DELAY)
                except Exception as e:
                    print(f"Upload error (attempt {attempt + 1}/{MAX_RETRIES}): {e}")
                    if attempt < MAX_RETRIES - 1:
                        time.sleep(RETRY_DELAY)
            return False
        finally:
            try:
                os.remove(zip_path)
            except Exception:
                pass

    def upload(self, report_path: str, **kwargs) -> bool:
        """Upload a single file or directory."""
        path = Path(report_path)
        if path.is_dir():
            return self.zip_and_upload(str(path), **kwargs)

        # Single file — create temp dir with the file
        tmp = Path(tempfile.mkdtemp(prefix="dm3_upload_"))
        try:
            import shutil
            shutil.copy2(path, tmp / path.name)
            return self.zip_and_upload(str(tmp), **kwargs)
        finally:
            import shutil
            shutil.rmtree(tmp, ignore_errors=True)
