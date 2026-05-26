"""Bubbleforge v2 export backend.

Runs alongside the web frontend and executes exports through backend/core.py
with progress updates available via /api/export/<job_id>.
"""

import threading
import time
import uuid
from shutil import make_archive
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
cancel_events = {}  # job_id -> threading.Event
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


def _script_render_options(rs: Dict[str, Any]) -> Dict[str, Any]:
    return {
        'style': str(rs.get('script_style') or 'screenplay').strip().lower(),
        'font_size': _safe_int(rs.get('script_font_size', 14), 14),
        'bold_names': bool(rs.get('script_bold_names', True)),
        'page_numbers': bool(rs.get('script_page_numbers', rs.get('script_page_number', True))),
        'paper_effect': bool(rs.get('script_paper_effect', False)),
    }


def _render_pdf_pages(proj: Project, size: Tuple[int, int], script_opts: Dict[str, Any] | None = None) -> list[Image.Image]:
    opts = dict(script_opts or {})
    style = str(opts.get('style') or 'screenplay').lower()
    font_size = max(10, min(24, _safe_int(opts.get('font_size', 14), 14)))
    bold_names = bool(opts.get('bold_names', True))
    page_numbers = bool(opts.get('page_numbers', True))
    paper_effect = bool(opts.get('paper_effect', False))

    width, height = size
    title_font = _load_font(max(24, font_size + 10), bold=True)
    name_font = _load_font(max(14, font_size + 2), bold=bold_names)
    body_font = _load_font(max(14, font_size + (0 if style == 'condensed' else 2)), bold=False)
    small_font = _load_font(max(11, font_size - 1), bold=False)
    messages = list(getattr(proj, "messages", []) or [])

    if style == 'condensed':
        max_text_ratio = 0.64
        bubble_gap = 38
        page_top = 138
    elif style == 'reduced':
        max_text_ratio = 0.60
        bubble_gap = 44
        page_top = 144
    else:
        max_text_ratio = 0.56
        bubble_gap = 52
        page_top = 150

    bg_color = (245, 241, 231) if paper_effect else (12, 12, 12)
    title_color = (38, 38, 42) if paper_effect else (245, 245, 247)
    meta_color = (95, 95, 104) if paper_effect else (170, 170, 180)
    default_text_color = (36, 36, 40) if paper_effect else (230, 230, 235)

    pages: list[Image.Image] = []
    page = Image.new("RGB", (width, height), color=bg_color)
    draw = ImageDraw.Draw(page)
    draw.text((56, 48), proj.title, fill=title_color, font=title_font)
    draw.text((56, 96), f"{len(messages)} message{'s' if len(messages) != 1 else ''}", fill=meta_color, font=small_font)

    y = page_top
    line_height = draw.textbbox((0, 0), "Ag", font=body_font)[3] - draw.textbbox((0, 0), "Ag", font=body_font)[1]

    if not messages:
        draw.text((56, page_top), "No messages to export.", fill=meta_color, font=body_font)
        return [page]

    for index, msg in enumerate(messages):
        speaker = getattr(msg, "speaker", "")
        msg_text = getattr(msg, "text", "")
        actor = next((a for a in proj.characters if a.name == speaker), None)
        side_right = bool(actor and actor.side == "right")
        bubble_color = actor.bubble_hex if actor else ("#2979FF" if side_right else "#2A2A2E")
        rgb = tuple(int(bubble_color.lstrip("#")[i:i+2], 16) for i in (0, 2, 4))
        text_color = (255, 255, 255) if side_right else default_text_color
        max_text_width = int(width * max_text_ratio)
        text_lines = _wrap_text(draw, str(msg_text), body_font, max_text_width)
        bubble_h = max(64, 24 + line_height * len(text_lines))
        bubble_w = min(max_text_width + 36, width - 112)

        if y + bubble_h + 72 > height and index > 0:
            pages.append(page)
            page = Image.new("RGB", (width, height), color=bg_color)
            draw = ImageDraw.Draw(page)
            draw.text((56, 48), proj.title, fill=title_color, font=title_font)
            draw.text((56, 96), f"{len(messages)} message{'s' if len(messages) != 1 else ''}", fill=meta_color, font=small_font)
            y = page_top
            line_height = draw.textbbox((0, 0), "Ag", font=body_font)[3] - draw.textbbox((0, 0), "Ag", font=body_font)[1]

        x = width - bubble_w - 56 if side_right else 56
        draw.rounded_rectangle([x, y, x + bubble_w, y + bubble_h], radius=24, fill=rgb)
        text_y = y + 18
        for line in text_lines:
            draw.text((x + 18, text_y), line, fill=text_color, font=body_font)
            text_y += line_height + 4
        if actor:
            draw.text((x, y + bubble_h + 8), actor.name, fill=meta_color, font=name_font)
        y += bubble_h + bubble_gap

    pages.append(page)
    if page_numbers:
        total = len(pages)
        for idx, pg in enumerate(pages, start=1):
            d = ImageDraw.Draw(pg)
            d.text((width - 96, height - 34), f"{idx}/{total}", fill=meta_color, font=small_font)
    return pages


def _render_script_pages(proj: Project, size: Tuple[int, int], script_opts: Dict[str, Any] | None = None) -> list[Image.Image]:
    opts = dict(script_opts or {})
    style = str(opts.get('style') or 'screenplay').strip().lower()
    font_size = max(10, min(24, _safe_int(opts.get('font_size', 14), 14)))
    bold_names = bool(opts.get('bold_names', True))
    page_numbers = bool(opts.get('page_numbers', True))
    paper_effect = bool(opts.get('paper_effect', False))

    width, height = size
    bg_color = (246, 241, 231) if paper_effect else (252, 252, 252)
    ink = (27, 27, 30)
    meta = (90, 90, 98)

    if style == 'condensed':
        margin_x = int(width * 0.07)
        top_pad = int(height * 0.08)
        line_gap = 2
        name_gap = 6
        between_msgs = 8
        dialogue_x = int(width * 0.17)
        dialogue_w = int(width * 0.66)
    elif style == 'reduced':
        margin_x = int(width * 0.08)
        top_pad = int(height * 0.085)
        line_gap = 3
        name_gap = 7
        between_msgs = 10
        dialogue_x = int(width * 0.20)
        dialogue_w = int(width * 0.60)
    else:
        margin_x = int(width * 0.11)
        top_pad = int(height * 0.09)
        line_gap = 4
        name_gap = 8
        between_msgs = 12
        dialogue_x = int(width * 0.25)
        dialogue_w = int(width * 0.50)

    name_font = _load_font(max(12, font_size + 1), bold=bold_names)
    body_font = _load_font(max(12, font_size), bold=False)
    title_font = _load_font(max(16, font_size + 6), bold=True)
    small_font = _load_font(max(10, font_size - 2), bold=False)

    messages = list(getattr(proj, 'messages', []) or [])
    pages: list[Image.Image] = []

    def _new_page(page_index: int) -> tuple[Image.Image, ImageDraw.ImageDraw, int]:
        page = Image.new('RGB', (width, height), color=bg_color)
        draw = ImageDraw.Draw(page)
        if paper_effect:
            for y in range(0, height, 4):
                tint = 246 - (y % 8)
                draw.line((0, y, width, y), fill=(tint, tint - 1, tint - 4), width=1)
        draw.text((margin_x, int(top_pad * 0.52)), str(proj.title or 'UNTITLED').upper(), fill=ink, font=title_font)
        draw.text((margin_x, int(top_pad * 0.52) + 32), f"{len(messages)} lines", fill=meta, font=small_font)
        y = top_pad + 56
        if page_numbers:
            page_no = str(page_index)
            w = draw.textbbox((0, 0), page_no, font=small_font)[2]
            draw.text((width - margin_x - w, int(top_pad * 0.52)), page_no, fill=meta, font=small_font)
        return page, draw, y

    page, draw, y = _new_page(1)
    if not messages:
        draw.text((margin_x, y), 'No dialogue in active scene.', fill=meta, font=body_font)
        return [page]

    for msg in messages:
        speaker = str(getattr(msg, 'speaker', '') or 'CHARACTER').strip().upper()
        text = str(getattr(msg, 'text', '') or '').strip()
        if not text:
            continue
        lines = _wrap_text(draw, text, body_font, dialogue_w)
        name_h = draw.textbbox((0, 0), 'A', font=name_font)[3]
        body_h = draw.textbbox((0, 0), 'Ag', font=body_font)[3]
        block_h = name_h + name_gap + (len(lines) * body_h) + (max(0, len(lines) - 1) * line_gap) + between_msgs

        if y + block_h > height - int(top_pad * 0.6):
            pages.append(page)
            page, draw, y = _new_page(len(pages) + 1)

        if style == 'screenplay':
            name_w = draw.textbbox((0, 0), speaker, font=name_font)[2]
            name_x = max(margin_x, (width // 2) - (name_w // 2))
        else:
            name_x = dialogue_x + 8

        draw.text((name_x, y), speaker, fill=ink, font=name_font)
        ty = y + name_h + name_gap
        for line in lines:
            draw.text((dialogue_x, ty), line, fill=ink, font=body_font)
            ty += body_h + line_gap
        y = ty + between_msgs

    pages.append(page)
    return pages


def _export_pdf(proj: Project, out_path: Path, size: Tuple[int, int], script_opts: Dict[str, Any] | None = None, script_mode: bool = False) -> None:
    pages = _render_script_pages(proj, size, script_opts) if script_mode else _render_pdf_pages(proj, size, script_opts)
    first, *rest = pages
    first.save(out_path, save_all=True, append_images=rest)


def _export_png_sequence(proj: Project, out_dir: Path, size: Tuple[int, int], script_opts: Dict[str, Any] | None = None, script_mode: bool = False) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    renderer = _render_script_pages if script_mode else _render_pdf_pages
    for index, page in enumerate(renderer(proj, size, script_opts), start=1):
        page.save(out_dir / f"scene_{index:02d}.png")


def _zip_png_sequence(out_dir: Path) -> Path:
    archive_path = Path(make_archive(str(out_dir), 'zip', root_dir=str(out_dir)))
    return archive_path


def _normalize_format(value: Any) -> str:
    raw = str(value or '').strip().lower()
    aliases = {
        'script_pdf': 'pdf',
        'script_png': 'png',
        'script_jpg': 'jpg',
        'script_jpeg': 'jpg',
        'script_webp': 'webp',
        'jpeg': 'jpg',
    }
    return aliases.get(raw, raw or 'mp4')


def _script_paper_to_size(paper: str) -> Tuple[int, int]:
    norm = str(paper or 'a4').strip().lower()
    if norm == 'letter':
        return (1275, 1650)
    return (1240, 1754)


def _project_from_frontend(payload: Dict[str, Any], requested_format: str | None = None) -> Tuple[Project, Tuple[int, int], str]:
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

    req_raw = str(requested_format or '').strip().lower()
    fmt = _normalize_format(req_raw or rs.get("format") or "mp4")
    script_mode = req_raw.startswith('script_')
    if script_mode and fmt in {'pdf', 'png', 'jpg', 'webp'}:
        out_size = _script_paper_to_size(str(rs.get('script_paper') or 'a4'))
    else:
        out_size = _resolution_to_size(str(rs.get("resolution") or "1080p"))
    return proj, out_size, fmt


def _recent_exports(limit: int = 10) -> list[Dict[str, Any]]:
    rows: list[Dict[str, Any]] = []
    for job_id, job in jobs.items():
        if str(job.get('status') or '').lower() != 'done':
            continue
        output_url = job.get('output_url')
        output_path = job.get('output_path')
        if not output_url or not output_path:
            continue
        rows.append({
            'job_id': job_id,
            'output_type': job.get('output_type') or 'mp4',
            'output_url': output_url,
            'output_path': output_path,
            'frame_count': int(job.get('frame_count') or 0),
            'finished_at': float(job.get('finished_at') or 0.0),
            'duration_s': int(job.get('duration_s') or 0),
        })

    rows.sort(key=lambda r: r.get('finished_at') or 0, reverse=True)
    return rows[: max(1, int(limit))]

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


@app.route('/api/exports/recent', methods=['GET'])
def recent_exports():
    limit = _safe_int(request.args.get('limit', 10), 10)
    return jsonify({'exports': _recent_exports(limit)})

@app.route('/api/export', methods=['POST'])
def export():
    data = request.json or {}
    project = data.get('project')
    if not project:
        return jsonify({'error': 'No project data'}), 400

    requested_format = str(data.get('format')).strip().lower() if data.get('format') is not None else None

    job_id = str(uuid.uuid4())
    jobs[job_id] = {
        'status': 'queued',
        'progress': 0,
        'created_at': time.time(),
        'requested_format': _normalize_format(requested_format) if requested_format else None,
    }
    cancel_events[job_id] = threading.Event()

    thread = threading.Thread(target=_run_export, args=(job_id, project, requested_format), daemon=True)
    thread.start()

    return jsonify({'job_id': job_id, 'status': 'queued'})

@app.route('/api/export/<job_id>', methods=['GET'])
def export_status(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404
    return jsonify(job)


@app.route('/api/export/<job_id>/cancel', methods=['POST'])
def export_cancel(job_id):
    job = jobs.get(job_id)
    if not job:
        return jsonify({'error': 'Job not found'}), 404

    status = str(job.get('status') or '').lower()
    if status in ('done', 'error', 'canceled'):
        return jsonify({'job_id': job_id, 'status': status})

    ev = cancel_events.get(job_id)
    if ev is not None:
        ev.set()
    if status in ('queued', 'running'):
        jobs[job_id]['status'] = 'cancelling'
    return jsonify({'job_id': job_id, 'status': jobs[job_id]['status']})

def _run_export(job_id, project, requested_format=None):
    cancel_event = cancel_events.get(job_id)
    try:
        jobs[job_id]['status'] = 'running'
        jobs[job_id]['progress'] = 0

        if cancel_event is not None and cancel_event.is_set():
            jobs[job_id]['status'] = 'canceled'
            return

        proj, out_size, fmt = _project_from_frontend(project, requested_format)
        script_mode = str(requested_format or '').strip().lower().startswith('script_')
        if not proj.messages:
            raise ValueError('No messages to export in active scene')

        out_dir = Path(__file__).resolve().parent / 'exports'
        out_dir.mkdir(parents=True, exist_ok=True)
        rs_in = dict(project.get('render_settings') or {})

        script_opts = _script_render_options(rs_in)

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
                cancel_event=cancel_event,
            )
            if cancel_event is not None and cancel_event.is_set():
                jobs[job_id]['status'] = 'canceled'
                return
            jobs[job_id]['output_type'] = 'mp4'
        elif fmt == 'pdf':
            if cancel_event is not None and cancel_event.is_set():
                jobs[job_id]['status'] = 'canceled'
                return
            out_path = out_dir / f'bubbleforge_{job_id}.pdf'
            jobs[job_id]['progress'] = 35
            _export_pdf(proj, out_path, out_size, script_opts, script_mode=script_mode)
            jobs[job_id]['output_type'] = 'pdf'
        elif fmt == 'png_sequence':
            if cancel_event is not None and cancel_event.is_set():
                jobs[job_id]['status'] = 'canceled'
                return
            out_path = out_dir / f'bubbleforge_{job_id}_png'
            jobs[job_id]['progress'] = 35
            _export_png_sequence(proj, out_path, out_size, script_opts, script_mode=script_mode)
            frame_count = len(list(out_path.glob('*.png')))
            jobs[job_id]['frame_count'] = frame_count
            jobs[job_id]['progress'] = 80
            zip_path = _zip_png_sequence(out_path)
            jobs[job_id]['progress'] = 95
            jobs[job_id]['output_type'] = 'png_sequence'
            jobs[job_id]['output_archive_path'] = str(zip_path)
            jobs[job_id]['output_archive_url'] = f"/api/exports/{zip_path.name}"
        elif fmt in {'png', 'jpg', 'webp'}:
            if cancel_event is not None and cancel_event.is_set():
                jobs[job_id]['status'] = 'canceled'
                return
            ext = 'jpg' if fmt == 'jpg' else fmt
            out_path = out_dir / f'bubbleforge_{job_id}.{ext}'
            jobs[job_id]['progress'] = 35
            page_renderer = _render_script_pages if script_mode else _render_pdf_pages
            page = page_renderer(proj, out_size, script_opts)[0]
            if fmt == 'jpg':
                page.convert('RGB').save(out_path, format='JPEG', quality=95)
            elif fmt == 'webp':
                page.convert('RGB').save(out_path, format='WEBP', quality=95)
            else:
                page.save(out_path, format='PNG')
            jobs[job_id]['progress'] = 90
            jobs[job_id]['output_type'] = fmt
        else:
            raise ValueError(f"Format '{fmt}' is not supported yet")

        jobs[job_id]['status'] = 'done'
        jobs[job_id]['progress'] = 100
        jobs[job_id]['output_path'] = str(out_path)
        jobs[job_id]['finished_at'] = time.time()
        jobs[job_id]['duration_s'] = max(0, int((jobs[job_id]['finished_at'] - float(jobs[job_id].get('created_at') or jobs[job_id]['finished_at']))))
        if out_path.is_file():
            jobs[job_id]['output_url'] = f"/api/exports/{out_path.name}"
        else:
            jobs[job_id]['output_url'] = jobs[job_id].get('output_archive_url')
    except Exception as e:
        jobs[job_id]['status'] = 'error'
        jobs[job_id]['error'] = str(e)
    finally:
        cancel_events.pop(job_id, None)

if __name__ == '__main__':
    print('Bubbleforge v2 backend — http://localhost:5000')
    app.run(port=5000, debug=True)
