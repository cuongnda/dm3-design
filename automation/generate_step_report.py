#!/usr/bin/env python3
"""
Generate HTML step-by-step execution report from JSON execution reports.
Supports both:
  - Web test reports (from WebTestExecutor: counter, action, params, data_captured)
  - API test reports (from daily_runner: step_id, description, phase)
"""
import json
import os
import glob


def _get_step_field(step, *keys, default=""):
    """Get first available field from step dict."""
    for k in keys:
        if k in step and step[k]:
            return step[k]
    return default


def generate_html_report(json_file_path: str) -> str:
    """Generate HTML report from execution JSON file. Returns HTML path."""
    with open(json_file_path, 'r', encoding='utf-8') as f:
        report = json.load(f)

    tc_id = report['test_case_id']
    tc_desc = report.get('test_case_description', {})
    title = tc_desc.get('title', '')
    failed_steps = [s for s in report['steps'] if s.get('status') in ('failed', 'error')]
    test_passed = len(failed_steps) == 0

    # Check for video
    video_dir = os.path.join(os.path.dirname(os.path.dirname(json_file_path)), "videos")
    video_files = glob.glob(f"{video_dir}/test_execution_{tc_id}_*.mp4")
    if not video_files:
        video_files = glob.glob(f"export/videos/test_execution_{tc_id}_*.mp4")
    video_path = video_files[0] if video_files else None

    # Build steps HTML
    steps_html = ""
    step_time_offset = 0
    for i, step in enumerate(report['steps'], 1):
        # Compatible with both web and API report formats
        phase = _get_step_field(step, 'phase', default='execute')
        action = _get_step_field(step, 'action', 'description', 'step_id', default=f'Step {i}')
        counter = step.get('counter', i)
        duration = step.get('duration', 0) or 0
        status = step.get('status', 'unknown')
        
        ok = status in ('completed', 'passed')
        status_class = "completed" if ok else "failed"
        status_icon = "PASS" if ok else "FAIL"

        # Parameters (web tests have params/data_captured, API tests may not)
        params = step.get('params', {})
        data_captured = step.get('data_captured', {})
        params_json = json.dumps(params, indent=2) if params else '{}'
        data_json = json.dumps(data_captured, indent=2) if data_captured else '{}'

        # Screenshots
        shots = ""
        for key, label in [('screenshot_before', 'Before'), ('screenshot_after', 'After')]:
            ss_path = step.get(key, '')
            if ss_path and os.path.exists(ss_path):
                rel = os.path.relpath(ss_path, os.path.dirname(json_file_path))
                shots += f'<div class="screenshot"><h4>{label}</h4><img src="{rel}" onclick="window.open(this.src)"></div>'
        if shots:
            shots = f'<div class="screenshots">{shots}</div>'

        error_html = ""
        if step.get('error'):
            error_html = f'<div class="error-box"><strong>Error:</strong><pre>{step["error"]}</pre></div>'

        video_btn = ""
        if video_path:
            video_btn = f'<button class="vid-btn" onclick="jumpToStep({step_time_offset})">▶ {step_time_offset}s</button>'
        step_time_offset += 4

        # Details section (only show if there's data)
        details_html = ""
        if params:
            details_html += f'<details><summary>Parameters</summary><pre class="code">{params_json}</pre></details>'
        if data_captured:
            details_html += f'<details><summary>Data Captured</summary><pre class="code">{data_json}</pre></details>'

        steps_html += f"""
        <div class="step">
          <div class="step-header {status_class}">
            <span class="phase-badge phase-{phase}">{phase.upper()}</span>
            <strong>Step {counter}: {action}</strong>
            <span class="step-meta">
              <span class="status-{status_class}">{status_icon}</span>
              <span>{duration:.2f}s</span>
              {video_btn}
            </span>
          </div>
          <div class="step-content">
            {details_html}
            {error_html}
            {shots}
          </div>
        </div>"""

    # Video section
    video_section = ""
    if video_path:
        rel_video = os.path.relpath(video_path, os.path.dirname(json_file_path))
        video_section = f"""
        <div class="video-section">
          <button class="video-open-btn" onclick="openVideoModal()">🎬 Watch Test Video</button>
        </div>
        <div id="videoModal" class="video-modal-overlay" onclick="if(event.target===this)closeVideoModal()">
          <div class="video-modal">
            <div class="video-modal-header">
              <h3>{tc_id} - {title}</h3>
              <button onclick="closeVideoModal()" class="close-btn">&times;</button>
            </div>
            <video id="testVideo" controls><source src="{rel_video}" type="video/mp4"></video>
            <div class="video-controls">
              <label>Speed: </label>
              <select id="playbackRate" onchange="document.getElementById('testVideo').playbackRate=parseFloat(this.value)">
                <option value="0.25">0.25x</option>
                <option value="0.5" selected>0.5x</option>
                <option value="1">1x</option>
                <option value="1.5">1.5x</option>
                <option value="2">2x</option>
              </select>
            </div>
          </div>
        </div>"""

    result_color = '#28a745' if test_passed else '#dc3545'
    result_text = 'PASSED' if test_passed else 'FAILED'
    total_duration = report.get('total_duration', 0) or 0

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Execution Report: {tc_id}</title>
<style>
body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 20px; background: #f5f5f5; }}
.container {{ max-width: 1200px; margin: 0 auto; background: #fff; padding: 24px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.08); }}
.header {{ background: linear-gradient(135deg, #1E3A5F, #3B82F6); color: #fff; padding: 20px; border-radius: 8px; margin-bottom: 20px; }}
.header h1 {{ margin: 0 0 8px; font-size: 20px; }}
.header p {{ margin: 4px 0; font-size: 13px; opacity: 0.9; }}
.summary {{ display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 24px; }}
.summary-card {{ background: #f8f9fa; padding: 16px; border-radius: 8px; text-align: center; }}
.summary-card h3 {{ margin: 0 0 8px; font-size: 12px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; }}
.summary-card .val {{ font-size: 24px; font-weight: 700; }}
.step {{ margin-bottom: 12px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }}
.step-header {{ padding: 12px 16px; display: flex; align-items: center; gap: 10px; background: #f8f9fa; }}
.step-header.completed {{ background: #d4edda; }}
.step-header.failed {{ background: #f8d7da; }}
.step-meta {{ margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 13px; }}
.step-content {{ padding: 12px 16px; }}
.step-content:empty {{ display: none; }}
.screenshots {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 12px; }}
.screenshot img {{ max-width: 100%; height: 280px; object-fit: contain; border: 1px solid #ddd; border-radius: 4px; cursor: pointer; }}
.code {{ background: #f8f9fa; padding: 12px; border-radius: 4px; font-size: 12px; overflow-x: auto; }}
.error-box {{ background: #f8d7da; padding: 12px; border-radius: 4px; margin-top: 8px; color: #721c24; }}
.error-box pre {{ margin: 4px 0 0; font-size: 12px; white-space: pre-wrap; word-break: break-all; }}
.phase-badge {{ padding: 3px 8px; border-radius: 4px; font-size: 11px; color: #fff; font-weight: 600; }}
.phase-setup {{ background: #6c757d; }}
.phase-execute {{ background: #28a745; }}
.phase-teardown {{ background: #6c757d; }}
.phase-verification {{ background: #ffc107; color: #000; }}
.status-completed {{ color: #28a745; font-weight: 600; }}
.status-failed {{ color: #dc3545; font-weight: 600; }}
.vid-btn {{ font-size: 11px; padding: 2px 8px; background: #3B82F6; color: #fff; border: none; border-radius: 4px; cursor: pointer; }}
.video-section {{ text-align: center; margin-bottom: 24px; }}
.video-open-btn {{ padding: 10px 24px; background: #3B82F6; color: #fff; border: none; border-radius: 6px; font-size: 15px; font-weight: 600; cursor: pointer; }}
.video-modal-overlay {{ display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.85); z-index: 1000; justify-content: center; align-items: center; }}
.video-modal-overlay.active {{ display: flex; }}
.video-modal {{ width: 90%; max-width: 1200px; background: #1a1a1a; border-radius: 12px; overflow: hidden; }}
.video-modal-header {{ display: flex; justify-content: space-between; align-items: center; padding: 14px 20px; background: #222; color: #fff; }}
.video-modal video {{ width: 100%; display: block; }}
.video-controls {{ padding: 10px 20px; background: #222; text-align: center; color: #ccc; font-size: 13px; }}
.close-btn {{ background: none; border: none; color: #fff; font-size: 28px; cursor: pointer; }}
details {{ margin-bottom: 8px; }}
summary {{ cursor: pointer; font-weight: 600; font-size: 13px; color: #4a5568; }}
</style>
<script>
function openVideoModal(){{ document.getElementById('videoModal').classList.add('active'); var v=document.getElementById('testVideo'); if(v){{v.playbackRate=0.5;v.play();}} }}
function closeVideoModal(){{ document.getElementById('videoModal').classList.remove('active'); var v=document.getElementById('testVideo'); if(v)v.pause(); }}
function jumpToStep(t){{ openVideoModal(); var v=document.getElementById('testVideo'); if(v){{v.currentTime=t;v.play();}} }}
document.addEventListener('keydown',function(e){{ if(e.key==='Escape')closeVideoModal(); }});
</script>
</head>
<body>
<div class="container">
  <div class="header">
    <h1>🔒 DM3 Step-by-Step Execution Report</h1>
    <p><strong>Test Case:</strong> {tc_id} {('— ' + title) if title else ''}</p>
    <p><strong>Time:</strong> {report.get('execution_timestamp', '')}</p>
  </div>
  <div class="summary">
    <div class="summary-card"><h3>Result</h3><div class="val" style="color:{result_color}">{result_text}</div></div>
    <div class="summary-card"><h3>Steps</h3><div class="val">{report.get('total_steps', 0)}</div></div>
    <div class="summary-card"><h3>Passed</h3><div class="val" style="color:#28a745">{report.get('steps_completed', 0)}</div></div>
    <div class="summary-card"><h3>Failed</h3><div class="val" style="color:#dc3545">{report.get('steps_failed', 0)}</div></div>
    <div class="summary-card"><h3>Duration</h3><div class="val">{total_duration:.1f}s</div></div>
  </div>
  {video_section}
  <h2>Execution Steps</h2>
  {steps_html}
</div>
</body>
</html>"""

    html_path = json_file_path.replace('.json', '.html')
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(html)
    return html_path


def generate_reports_for_all(report_dir: str = "export/execution_reports"):
    """Generate HTML reports for all JSON execution files."""
    json_files = glob.glob(f"{report_dir}/*.json")
    reports = []
    for jf in json_files:
        try:
            html = generate_html_report(jf)
            reports.append(html)
            print(f"Generated: {html}")
        except Exception as e:
            print(f"Failed: {jf}: {e}")
    return reports


if __name__ == "__main__":
    generate_reports_for_all()
