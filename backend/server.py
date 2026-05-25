"""Bubbleforge v2 export backend.

Runs alongside the web frontend and executes exports through backend/core.py
with progress updates available via /api/export/<job_id>.
"""

import threading
import uuid
from pathlib import Path
from typing import Any, Dict, Tuple

from flask import Flask, jsonify, request
from flask_cors import CORS

from core import Message, Project, export_mp4

app = Flask(__name__)
CORS(app)

jobs = {}  # job_id -> status dict


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
    proj.settings.sfx_type = str(rs.get("sfx_type") or "soft").strip().lower() or "soft"
    proj.settings.keyboard_style = str(rs.get("keyboard_style") or "ios").strip().lower() or "ios"

    fmt = str(rs.get("format") or "mp4").strip().lower()
    out_size = _resolution_to_size(str(rs.get("resolution") or "1080p"))
    return proj, out_size, fmt

@app.route('/api/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'version': '2.0.0'})

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
        if fmt != 'mp4':
            raise ValueError(f"Format '{fmt}' is not wired yet in backend. Select MP4 for now.")

        out_dir = Path(__file__).resolve().parent / 'exports'
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f'bubbleforge_{job_id}.mp4'

        def _on_progress(current: int, total: int):
            pct = int((float(current) / float(max(1, total))) * 100)
            jobs[job_id]['progress'] = max(0, min(99, pct))

        rs_in = dict(project.get('render_settings') or {})
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
        )

        jobs[job_id]['status'] = 'done'
        jobs[job_id]['progress'] = 100
        jobs[job_id]['output_path'] = str(out_path)
    except Exception as e:
        jobs[job_id]['status'] = 'error'
        jobs[job_id]['error'] = str(e)

if __name__ == '__main__':
    print('Bubbleforge v2 backend — http://localhost:5000')
    app.run(port=5000, debug=True)
