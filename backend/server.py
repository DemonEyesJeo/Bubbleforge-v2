"""Bubbleforge v2 export backend.

Runs alongside the web frontend and executes exports through backend/core.py
with progress updates available via /api/export/<job_id>.
"""

import threading
import uuid
from pathlib import Path
from typing import Any, Dict, Tuple

from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from PIL import Image, ImageDraw, ImageFont
from werkzeug.utils import secure_filename

from core import Message, Project, export_mp4

app = Flask(__name__)
CORS(app)

jobs = {}  # job_id -> status dict
UPLOADS_DIR = Path(__file__).resolve().parent / 'uploads'


def _safe_int(v: Any, fallback: int) -> int:
    try:
        return int(v)
    except Exception:
        return int(fallback)


def _safe_float(v: Any, fallback: float) -> float:
    try:
        return float(v)
    except Exception:
        return float(fallback)


def _resolution_to_size(label: str) -> Tuple[int, int]:
    norm = (str(label or "1080p").strip().lower())
    if norm == "720p":
        return (720, 1280)
    if norm == "4k":
        return (2160, 3840)
    return (1080, 1920)


def _load_font(size: int, bold: bool = False):
    candidates = [
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/liberation-sans/LiberationSans-Bold.ttf" if bold else "/usr/share/fonts/liberation-sans/LiberationSans-Regular.ttf",
    ]
    for path in candidates:
        try:
            return ImageFont.truetype(path, size=size)
        except Exception:
            continue
    return ImageFont.load_default()


def _wrap_text(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    words = str(text or "").split()
    if not words:
        return [""]
    lines: list[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        box = draw.textbbox((0, 0), candidate, font=font)
        if box[2] - box[0] <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def _render_pdf_pages(proj: Project, size: Tuple[int, int]) -> list[Image.Image]:
    width, height = size
    title_font = _load_font(max(28, width // 28), bold=True)
    name_font = _load_font(max(18, width // 54), bold=True)
    body_font = _load_font(max(20, width // 60), bold=False)
    small_font = _load_font(max(14, width // 72), bold=False)
    messages = list(getattr(proj, "messages", []) or [])

    pages: list[Image.Image] = []
    page = Image.new("RGB", (width, height), color=(12, 12, 12))
    draw = ImageDraw.Draw(page)
    draw.text((56, 48), proj.title, fill=(245, 245, 247), font=title_font)
    draw.text((56, 96), f"{len(messages)} message{'s' if len(messages) != 1 else ''}", fill=(170, 170, 180), font=small_font)

    y = 150
    line_height = draw.textbbox((0, 0), "Ag", font=body_font)[3] - draw.textbbox((0, 0), "Ag", font=body_font)[1]

    if not messages:
        draw.text((56, 150), "No messages to export.", fill=(170, 170, 180), font=body_font)
        return [page]

    for index, msg in enumerate(messages):
        speaker = getattr(msg, "speaker", "")
        msg_text = getattr(msg, "text", "")
        actor = next((a for a in proj.characters if a.name == speaker), None)
        side_right = bool(actor and actor.side == "right")
        bubble_color = actor.bubble_hex if actor else ("#2979FF" if side_right else "#2A2A2E")
        rgb = tuple(int(bubble_color.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        text_color = (255, 255, 255) if side_right else (230, 230, 235)
        max_text_width = int(width * 0.56)
        text_lines = _wrap_text(draw, str(msg_text), body_font, max_text_width)
        bubble_h = max(70, 28 + line_height * len(text_lines))
        bubble_w = min(max_text_width + 36, width - 112)

        if y + bubble_h + 72 > height and index > 0:
            pages.append(page)
            page = Image.new("RGB", (width, height), color=(12, 12, 12))
            draw = ImageDraw.Draw(page)
            draw.text((56, 48), proj.title, fill=(245, 245, 247), font=title_font)
            draw.text((56, 96), f"{len(messages)} message{'s' if len(messages) != 1 else ''}", fill=(170, 170, 180), font=small_font)
            y = 150
            line_height = draw.textbbox((0, 0), "Ag", font=body_font)[3] - draw.textbbox((0, 0), "Ag", font=body_font)[1]

        x = width - bubble_w - 56 if side_right else 56
        draw.rounded_rectangle([x, y, x + bubble_w, y + bubble_h], radius=24, fill=rgb)
        text_y = y + 18
        for line in text_lines:
            draw.text((x + 18, text_y), line, fill=text_color, font=body_font)
            text_y += line_height + 4
        if actor:
            draw.text((x, y + bubble_h + 8), actor.name, fill=(145, 145, 155), font=name_font)
        y += bubble_h + 52

    pages.append(page)
    return pages


def _export_pdf(proj: Project, out_path: Path, size: Tuple[int, int]) -> None:
    pages = _render_pdf_pages(proj, size)
    first, *rest = pages
    first.save(out_path, save_all=True, append_images=rest)


def _export_png_sequence(proj: Project, out_dir: Path, size: Tuple[int, int]) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    for index, page in enumerate(_render_pdf_pages(proj, size), start=1):
        page.save(out_dir / f"scene_{index:02d}.png")


def _project_from_frontend(payload: Dict[str, Any]) -> Tuple[Project, Tuple[int, int], str]:
    proj = Project()
    proj.title = str(payload.get("name") or "Untitled Story")

    actors = list(payload.get("actors") or [])
    actor_map: Dict[str, str] = {}
    for actor in actors:
        aid = str(actor.get("id") or "")
        name = str(actor.get("name") or "Actor").strip() or "Actor"
        side = str(actor.get("side") or "left").strip().lower() or "left"
        color = str(actor.get("color") or "#7D8085")
        avatar = actor.get("avatar")
        ch = proj.add_character(name=name, side=side, bubble=color, avatar=avatar)
        actor_map[aid] = ch.name

    scenes = list(payload.get("scenes") or [])
    active_scene_id = str(payload.get("active_scene_id") or "")
    active_scene = None
    for scene in scenes:
        if str(scene.get("id") or "") == active_scene_id:
            active_scene = scene
            break
    if active_scene is None and scenes:
        active_scene = scenes[0]

    for row in list((active_scene or {}).get("messages") or []):
        aid = str(row.get("actor_id") or "")
        speaker = actor_map.get(aid) or (proj.characters[0].name if proj.characters else "Narrator")
        text = str(row.get("text") or "")
        if not text.strip():
            continue
        proj.messages.append(Message(speaker=speaker, text=text, duration=2.0))

    rs = dict(payload.get("render_settings") or {})
    proj.settings.export_fps = _safe_int(rs.get("fps", 30), 30)
    proj.settings.export_typing_duration = _safe_float(rs.get("typing_duration", 0.08), 0.08)
    proj.settings.typing_indicator_duration = _safe_float(rs.get("typing_indicator_duration", 1.2), 1.2)
    proj.settings.typing_indicator_gap = _safe_float(rs.get("typing_indicator_gap", 0.4), 0.4)
    proj.settings.export_typing_fakeout_enabled = bool(rs.get("fakeout", True))
    proj.settings.music_path = rs.get("music_path") or None
    proj.settings.music_volume = _safe_float(rs.get("music_volume", 0.7), 0.7)
    proj.settings.loop_music = bool(rs.get("loop_music", True))
    proj.settings.fade_music = bool(rs.get("fade_music", True))
    proj.settings.sfx_type = str(rs.get("sfx_type") or "soft").strip().lower() or "soft"
    proj.settings.keyboard_style = str(rs.get("keyboard_style") or "ios").strip().lower() or "ios"

    fmt = str(rs.get("format") or "mp4").strip().lower()
    out_size = _resolution_to_size(str(rs.get("resolution") or "1080p"))
    return proj, out_size, fmt

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'version': '2.0.0'})


@app.route('/api/music-upload', methods=['POST'])
def music_upload():
    file = request.files.get('music')
    if file is None:
        return jsonify({'error': 'No music file provided'}), 400
    if not file.filename:
        return jsonify({'error': 'Empty filename'}), 400

    safe_name = secure_filename(file.filename)
    suffix = Path(safe_name).suffix.lower()
    if suffix not in {'.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'}:
        return jsonify({'error': 'Unsupported audio format'}), 400

    UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
    out_name = f"{uuid.uuid4().hex}{suffix}"
    out_path = UPLOADS_DIR / out_name
    file.save(out_path)
    return jsonify({'path': str(out_path), 'url': f'/api/uploads/{out_name}', 'name': safe_name})


@app.route('/api/uploads/<path:filename>', methods=['GET'])
def serve_upload(filename):
    safe_name = secure_filename(filename)
    if safe_name != filename:
        return jsonify({'error': 'Invalid filename'}), 400
    return send_from_directory(UPLOADS_DIR, safe_name)


@app.route('/api/exports/<path:filename>', methods=['GET'])
def serve_export(filename):
    safe_name = secure_filename(filename)
    if safe_name != filename:
        return jsonify({'error': 'Invalid filename'}), 400
    exports_dir = Path(__file__).resolve().parent / 'exports'
    return send_from_directory(exports_dir, safe_name, as_attachment=True)

@app.route('/api/export', methods=['POST'])
def export():
    data = request.json or {}
    project = data.get('project')
    if not project:
        return jsonify({'error': 'No project data'}), 400

    job_id = str(uuid.uuid4())
    jobs[job_id] = {'status': 'queued', 'progress': 0}

    thread = threading.Thread(target=_run_export, args=(job_id, project), daemon=True)
    thread.start()

    return jsonify({'job_id': job_id, 'status': 'queued'})

@app.route('/api/export/<job_id>', methods=['GET'])
def export_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job)

def _run_export(job_id, project):
    try:
        jobs[job_id]['status'] = 'running'
        jobs[job_id]['progress'] = 0

        proj, out_size, fmt = _project_from_frontend(project)
        if not proj.messages:
            raise ValueError('No messages to export in active scene')

        out_dir = Path(__file__).resolve().parent / 'exports'
        out_dir.mkdir(parents=True, exist_ok=True)
        rs_in = dict(project.get('render_settings') or {})

        if fmt == 'mp4':
            out_path = out_dir / f'bubbleforge_{job_id}.mp4'

            def _on_progress(current: int, total: int):
                pct = int((float(current) / float(max(1, total))) * 100)
                jobs[job_id]['progress'] = max(0, min(99, pct))

            export_mp4(
                proj,
                str(out_path),
                fps=float(proj.settings.export_fps or 30),
                size=out_size,
                on_progress=_on_progress,
                typing_duration=float(proj.settings.export_typing_duration or 0.08),
                typing_indicator_duration=float(proj.settings.typing_indicator_duration or 1.2),
                typing_indicator_gap=float(proj.settings.typing_indicator_gap or 0.4),
                typing_enabled=bool(rs_in.get('typing_animation', True)),
                typing_rewrite_enabled=bool(proj.settings.export_typing_fakeout_enabled),
                keyboard_style=str(proj.settings.keyboard_style or 'ios'),
                music_path=proj.settings.music_path,
                sfx_type=str(proj.settings.sfx_type or 'soft'),
                music_volume=float(proj.settings.music_volume or 0.7),
                loop_music=bool(getattr(proj.settings, 'loop_music', True)),
                fade_music=bool(getattr(proj.settings, 'fade_music', True)),
            )
        elif fmt == 'pdf':
            out_path = out_dir / f'bubbleforge_{job_id}.pdf'
            jobs[job_id]['progress'] = 35
            _export_pdf(proj, out_path, out_size)
        elif fmt == 'png_sequence':
            out_path = out_dir / f'bubbleforge_{job_id}_png'
            jobs[job_id]['progress'] = 35
            _export_png_sequence(proj, out_path, out_size)
        else:
            raise ValueError(f"Format '{fmt}' is not supported yet")

        jobs[job_id]['status'] = 'done'
        jobs[job_id]['progress'] = 100
        jobs[job_id]['output_path'] = str(out_path)
        jobs[job_id]['output_url'] = f"/api/exports/{out_path.name}"
    except Exception as e:
        jobs[job_id]['status'] = 'error'
        jobs[job_id]['error'] = str(e)

if __name__ == '__main__':
    print('Bubbleforge v2 backend — http://localhost:5000')
    app.run(port=5000, debug=True)
