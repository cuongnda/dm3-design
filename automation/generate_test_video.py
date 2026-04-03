#!/usr/bin/env python3
"""
Generate video from test execution screenshots.
Converts step-by-step screenshots into a watchable MP4 with annotations.
Adapted from dmpw_automation/generate_test_video.py
"""
import json
import os
import glob
import shutil
import subprocess
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any


def _load_font(size, bold=False):
    """Load a font cross-platform, fallback to Pillow default."""
    from PIL import ImageFont
    candidates = [
        '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        '/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf' if bold else '/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf',
        'arial.ttf',
    ]
    for f in candidates:
        try:
            return ImageFont.truetype(f, size)
        except (IOError, OSError):
            continue
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


class TestVideoGenerator:
    """Generate videos from test execution screenshots."""

    def __init__(self, report_path: str):
        self.report_path = report_path
        with open(report_path, 'r', encoding='utf-8') as f:
            self.report_data = json.load(f)
        self.test_case_id = self.report_data['test_case_id']
        self.video_dir = "export/videos"
        self.temp_dir = f"export/videos/temp_{self.test_case_id}"

    def generate_video(self, fps: int = 1, duration_per_step: int = 3) -> str:
        """Generate video from screenshots. Returns path or None."""
        if not shutil.which('ffmpeg'):
            print(f"ffmpeg not found, skipping video for {self.test_case_id}")
            return None

        os.makedirs(self.video_dir, exist_ok=True)
        os.makedirs(self.temp_dir, exist_ok=True)

        try:
            frames = self._prepare_frames(duration_per_step)
            if not frames:
                print(f"No screenshots found for {self.test_case_id}")
                return None

            video_path = self._create_video(fps)
            if video_path:
                print(f"Video generated: {video_path}")
            return video_path
        except Exception as e:
            print(f"Video generation failed for {self.test_case_id}: {e}")
            return None
        finally:
            if os.path.exists(self.temp_dir):
                shutil.rmtree(self.temp_dir, ignore_errors=True)

    def _prepare_frames(self, duration_per_step: int) -> List[str]:
        """Create annotated frames from step screenshots."""
        frames = []
        counter = 0

        for step in self.report_data['steps']:
            for label in ('screenshot_before', 'screenshot_after'):
                src = step.get(label, '')
                if not src or not os.path.exists(src):
                    continue
                for _ in range(duration_per_step):
                    frame_path = f"{self.temp_dir}/frame_{counter:05d}.png"
                    phase_label = "BEFORE" if "before" in label else "AFTER"
                    self._annotate_frame(src, frame_path, step, phase_label)
                    if os.path.exists(frame_path):
                        frames.append(frame_path)
                        counter += 1

        print(f"Prepared {len(frames)} frames from {len(self.report_data['steps'])} steps")
        return frames

    def _annotate_frame(self, source: str, output: str, step: Dict, label: str):
        """Create annotated frame with step info banner."""
        try:
            from PIL import Image, ImageDraw

            img = Image.open(source).convert('RGBA')
            img.thumbnail((1920, 1080), Image.LANCZOS)
            canvas = Image.new('RGBA', (1920, 1080), (0, 0, 0, 255))
            ox = (1920 - img.width) // 2
            oy = (1080 - img.height) // 2
            canvas.paste(img, (ox, oy))

            overlay = Image.new('RGBA', (1920, 1080), (0, 0, 0, 0))
            draw = ImageDraw.Draw(overlay)
            draw.rectangle([0, 0, 1920, 180], fill=(0, 0, 0, 200))

            font_title = _load_font(30, bold=True)
            font_step = _load_font(26)
            font_info = _load_font(20)

            ok = step['status'] == 'completed'
            sc = (255, 255, 255) if ok else (255, 60, 60)
            icon = 'COMPLETED' if ok else 'FAILED'

            draw.text((20, 10), f"Test: {self.test_case_id}", fill=(255, 255, 255), font=font_title)
            action_desc = step['action'].replace('_', ' ').title()
            draw.text((20, 48), f"Step {step['counter']}: {action_desc} [{label}]", fill=sc, font=font_step)
            draw.text((20, 82), f"{step['phase'].upper()} | {icon} | {step.get('duration', 0):.2f}s", fill=sc, font=font_info)

            if step.get('error'):
                draw.text((20, 110), f"Error: {step['error'][:80]}", fill=(255, 60, 60), font=font_info)

            # Step counter top-right
            counter_text = f"{step['counter']}/{self.report_data['total_steps']}"
            draw.text((1800, 10), counter_text, fill=(255, 255, 255), font=font_info)

            canvas = Image.alpha_composite(canvas, overlay)
            canvas.convert('RGB').save(output, 'PNG')
        except ImportError:
            shutil.copy2(source, output)
        except Exception:
            shutil.copy2(source, output)

    def _create_video(self, fps: int) -> str:
        """Create MP4 video from prepared frames using ffmpeg."""
        ts = datetime.now().strftime("%Y%m%d_%H%M%S")
        video_path = os.path.join(self.video_dir, f"test_execution_{self.test_case_id}_{ts}.mp4")
        frame_pattern = os.path.join(self.temp_dir, "frame_%05d.png")

        cmd = [
            'ffmpeg', '-y',
            '-framerate', str(fps),
            '-i', frame_pattern,
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-preset', 'medium',
            '-crf', '22',
            '-vf', f'fps={fps}',
            video_path,
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True, text=True)
            return video_path
        except subprocess.CalledProcessError as e:
            print(f"ffmpeg failed: {e.stderr[:200]}")
            return None


def generate_videos_for_reports(report_dir: str = "export/execution_reports"):
    """Generate videos for all execution report JSONs."""
    json_files = glob.glob(f"{report_dir}/*.json")
    if not json_files:
        print("No execution reports found.")
        return []

    videos = []
    for jf in json_files:
        try:
            gen = TestVideoGenerator(jf)
            path = gen.generate_video(fps=1, duration_per_step=2)
            if path:
                videos.append(path)
        except Exception as e:
            print(f"Failed: {jf}: {e}")
    return videos


if __name__ == "__main__":
    generate_videos_for_reports()
