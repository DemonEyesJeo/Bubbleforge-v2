#!/usr/bin/env python3
"""
Bubbleforge Core
================
Shared logic used by both the desktop (tkinter) and mobile (Kivy) frontends.
Handles data models, chat rendering (PIL), and file I/O.

To add fonts: drop .ttf or .otf files into the  mobile/fonts/  directory.
The font family name is the file stem (e.g. Roboto-Regular.ttf → "Roboto-Regular").
"""

from __future__ import annotations

import json
import logging
import math
import os
import random
import shutil
import subprocess
import sys
import threading
import time
import warnings
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

try:
    from PIL import Image, ImageDraw, ImageFont
    PIL_AVAILABLE = True
except ImportError:
    PIL_AVAILABLE = False

# ── Platform detection ────────────────────────────────────────────────────

try:
    from kivy.utils import platform as _kivy_platform
    _ON_ANDROID = (_kivy_platform == "android")
except ImportError:
    _ON_ANDROID = False

log = logging.getLogger("bubbleforge.core")

# ── Font resolution ───────────────────────────────────────────────────────
# The frontend sets this to the directory where .ttf / .otf fonts live.
# On Android this will be  <app>/fonts/  (bundled in APK via buildozer).
# On desktop it defaults to  mobile/fonts/  relative to this file.

_FONTS_DIR: Path = Path(__file__).parent / "fonts"
_font_path_cache: Dict[str, Optional[str]] = {}
_FONT_ALIAS_FILE = "font_aliases.json"

# ── OpenMoji PNG color-emoji helpers (local-first) ─────────────────────────
_OPENMOJI_LOCAL_ROOTS = [
    Path(__file__).resolve().parent.parent / "openmoji-17.0.0",
    Path(__file__).resolve().parent / "openmoji-17.0.0",
]
_OPENMOJI_CDN = "https://cdn.jsdelivr.net/gh/hfg-gmuend/openmoji@master/{variant}/72x72/{codepoint}.png"
_emoji_png_mem: Dict[tuple, Any] = {}          # (char, size) → PIL Image | None
_emoji_png_lock = threading.Lock()             # guards _emoji_png_mem for background thread safety

# Bubbleforge accent color: replace TypeStory purple accents with BF orange.
_BF_ACCENT_RGB = (219, 171, 105)


def _openmoji_codepoint_variants(emoji_char: str) -> List[str]:
    """Return uppercase OpenMoji codepoint variants with practical fallbacks.

    OpenMoji does not provide every composite/tone/ZWJ sequence variant. Include
    simplified fallbacks so unsupported sequences still resolve to a usable base.
    """
    cps = [f"{ord(c):04X}" for c in emoji_char]
    skin_tones = {"1F3FB", "1F3FC", "1F3FD", "1F3FE", "1F3FF"}
    no_vs_list = [cp for cp in cps if cp != "FE0F"]
    no_zwj_list = [cp for cp in no_vs_list if cp != "200D"]
    no_tone_list = [cp for cp in no_zwj_list if cp not in skin_tones]

    full = "-".join(cps)
    no_vs = "-".join(no_vs_list)
    no_zwj = "-".join(no_zwj_list)
    no_tone = "-".join(no_tone_list)
    base_only = no_tone_list[0] if no_tone_list else ""
    out: List[str] = []
    for candidate in (full, no_vs, no_zwj, no_tone, base_only):
        if candidate and candidate not in out:
            out.append(candidate)
    return out


def _find_local_openmoji_png(codepoint_variants: List[str]) -> Optional[Path]:
    for root in _OPENMOJI_LOCAL_ROOTS:
        for variant in ("color", "black"):
            base = root / variant / "72x72"
            for cp in codepoint_variants:
                p = base / f"{cp}.png"
                if p.is_file():
                    return p
    return None


def load_emoji_png(emoji_char: str, size: int = 64) -> Optional[Any]:
    """Return a PIL RGBA image for *emoji_char* using OpenMoji PNGs.

    Downloads on first use and caches to mobile/fonts/emoji/.
    Returns None if download fails or PIL is unavailable.
    """
    if not PIL_AVAILABLE:
        return None
    key = (emoji_char, size)
    # Thread-safe cache check — avoids redundant disk I/O when multiple
    # background threads request the same emoji simultaneously.
    with _emoji_png_lock:
        if key in _emoji_png_mem:
            return _emoji_png_mem[key]

    cache_dir = Path(__file__).parent / "fonts" / "emoji"
    cache_dir.mkdir(parents=True, exist_ok=True)

    codepoints = _openmoji_codepoint_variants(emoji_char)
    cache_stem = codepoints[0] if codepoints else "unknown"
    cache_file = cache_dir / f"om_{cache_stem}.png"

    if not cache_file.exists():
        local_png = _find_local_openmoji_png(codepoints)
        if local_png is not None:
            try:
                shutil.copyfile(local_png, cache_file)
            except Exception:
                pass

    allow_network = str(os.environ.get("BF_EMOJI_ALLOW_NETWORK", "0")).strip().lower() in {
        "1", "true", "yes", "on"
    }
    if allow_network and not cache_file.exists():
        try:
            import requests  # type: ignore
            for cp in codepoints:
                for variant in ("color", "black"):
                    url = _OPENMOJI_CDN.format(variant=variant, codepoint=cp)
                    try:
                        resp = requests.get(url, timeout=8)
                        if resp.status_code == 200:
                            cache_file.write_bytes(resp.content)
                            break
                    except Exception:
                        continue
                if cache_file.exists():
                    break
        except ImportError:
            pass

    if not cache_file.exists():
        with _emoji_png_lock:
            _emoji_png_mem[key] = None
        return None

    try:
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="Palette images with Transparency expressed in bytes should be converted to RGBA images",
                category=UserWarning,
            )
            with Image.open(cache_file) as src_img:
                img = src_img.convert("RGBA")
        if size != img.width or size != img.height:
            img = img.resize((size, size), Image.LANCZOS)
        with _emoji_png_lock:
            _emoji_png_mem[key] = img
        return img
    except Exception:
        with _emoji_png_lock:
            _emoji_png_mem[key] = None
        return None


def set_fonts_dir(path: str) -> None:
    """Override the fonts directory (call this from main.py on startup)."""
    global _FONTS_DIR
    _FONTS_DIR = Path(path)
    _FONTS_DIR.mkdir(parents=True, exist_ok=True)
    _font_path_cache.clear()


def _font_alias_path() -> Path:
    return _FONTS_DIR / _FONT_ALIAS_FILE


def _load_font_aliases() -> Dict[str, str]:
    p = _font_alias_path()
    if not p.is_file():
        return {}
    try:
        data = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(data, dict):
            out: Dict[str, str] = {}
            for k, v in data.items():
                if isinstance(k, str) and isinstance(v, str) and v.strip():
                    out[k] = v.strip()
            return out
    except Exception:
        pass
    return {}


def _save_font_aliases(aliases: Dict[str, str]) -> None:
    p = _font_alias_path()
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(json.dumps(aliases, indent=2), encoding="utf-8")


def list_font_entries() -> List[Dict[str, str]]:
    """Return discovered font entries with display names and file metadata."""
    if not _FONTS_DIR.is_dir():
        return []
    aliases = _load_font_aliases()
    entries: List[Dict[str, str]] = []
    for f in sorted(_FONTS_DIR.iterdir(), key=lambda p: p.name.lower()):
        if f.suffix.lower() not in (".ttf", ".otf"):
            continue
        alias = aliases.get(f.name, "").strip()
        display = alias if alias else f.stem
        entries.append({
            "name": display,
            "alias": alias,
            "file": f.name,
            "stem": f.stem,
            "path": str(f),
        })

    # Disambiguate duplicate display names.
    seen: Dict[str, int] = {}
    for e in entries:
        n = e["name"]
        seen[n] = seen.get(n, 0) + 1
    for e in entries:
        if seen.get(e["name"], 0) > 1:
            e["name"] = f"{e['name']} ({e['file']})"
    return entries


def set_font_alias(font_file: str, alias: str) -> None:
    """Set or clear a display alias for a specific font file."""
    aliases = _load_font_aliases()
    font_file = (font_file or "").strip()
    alias = (alias or "").strip()
    if not font_file:
        return
    if alias:
        aliases[font_file] = alias
    else:
        aliases.pop(font_file, None)
    _save_font_aliases(aliases)
    _font_path_cache.clear()


def import_fonts_from_paths(paths: List[str]) -> Tuple[int, int]:
    """Import .ttf/.otf files from file/dir paths. Returns (imported, skipped)."""
    _FONTS_DIR.mkdir(parents=True, exist_ok=True)
    imported = 0
    skipped = 0
    exts = {".ttf", ".otf"}

    def _iter_font_files(p: Path) -> List[Path]:
        if p.is_file() and p.suffix.lower() in exts:
            return [p]
        if p.is_dir():
            return [x for x in p.rglob("*") if x.is_file() and x.suffix.lower() in exts]
        return []

    for raw in paths or []:
        try:
            src = Path(raw).expanduser()
        except Exception:
            skipped += 1
            continue
        files = _iter_font_files(src)
        if not files:
            skipped += 1
            continue
        for f in files:
            try:
                dest = _FONTS_DIR / f.name
                if dest.exists():
                    base = f.stem
                    ext = f.suffix
                    i = 2
                    while True:
                        cand = _FONTS_DIR / f"{base}_{i}{ext}"
                        if not cand.exists():
                            dest = cand
                            break
                        i += 1
                shutil.copy2(f, dest)
                imported += 1
            except Exception:
                skipped += 1

    _font_path_cache.clear()
    return imported, skipped


def available_fonts() -> List[str]:
    """Return a list of font family names found in the fonts directory."""
    return [e["name"] for e in list_font_entries()]


def _resolve_font_path(family: str) -> Optional[str]:
    """Return a file path for the given font family name, or None."""
    if family in _font_path_cache:
        return _font_path_cache[family]

    path: Optional[str] = None
    fam_raw = (family or "").strip()
    fam_key = fam_raw.lower().replace(" ", "").replace("-", "").replace("_", "")

    # Prefer a bundled readable sans font whenever project uses "default"
    # or an empty family value.
    preferred_defaults = [
        "JosefinSansRegular-x3LYV",
        "JosefinSansSemibold-p7Z0v",
    ]
    if fam_key in ("", "default", "system") and _FONTS_DIR.is_dir():
        for preferred in preferred_defaults:
            for ext in (".ttf", ".otf"):
                p = _FONTS_DIR / f"{preferred}{ext}"
                if p.is_file():
                    path = str(p)
                    break
            if path:
                break

    # 1. Local fonts/ directory (works everywhere including Android)
    if path is None and _FONTS_DIR.is_dir():
        aliases = _load_font_aliases()
        for f in _FONTS_DIR.iterdir():
            if f.suffix.lower() in (".ttf", ".otf"):
                stem_key = f.stem.lower().replace(" ", "").replace("-", "").replace("_", "")
                alias = aliases.get(f.name, "")
                alias_key = alias.lower().replace(" ", "").replace("-", "").replace("_", "")
                file_key = f.name.lower().replace(" ", "").replace("-", "").replace("_", "")
                if stem_key == fam_key or alias_key == fam_key or file_key == fam_key:
                    path = str(f)
                    break

    # Final local fallback if requested family is missing: pick first bundled font.
    if path is None and _FONTS_DIR.is_dir():
        for f in sorted(_FONTS_DIR.iterdir(), key=lambda p: p.name.lower()):
            if f.suffix.lower() in (".ttf", ".otf"):
                path = str(f)
                break

    # 2. fc-match (Linux / macOS, not available on Android)
    if path is None and not _ON_ANDROID:
        try:
            result = subprocess.run(
                ["fc-match", "--format=%{file}", family],
                capture_output=True, text=True, timeout=2,
            )
            candidate = result.stdout.strip()
            if candidate and os.path.isfile(candidate):
                path = candidate
        except Exception:
            pass

    # 3. Windows Fonts directory
    if path is None and sys.platform == "win32":
        wd = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"
        for stem in (family, family.replace(" ", "")):
            for ext in (".ttf", ".otf", ".TTF", ".OTF"):
                p = wd / (stem + ext)
                if p.is_file():
                    path = str(p)
                    break
            if path:
                break

    _font_path_cache[family] = path
    return path


# ── Data models ───────────────────────────────────────────────────────────

@dataclass
class CharacterGroup:
    gid: int
    name: str
    color: str = "#888888"


DEFAULT_LEFT_BUBBLE_HEX = "#7D8085"
DEFAULT_RIGHT_BUBBLE_HEX = "#7D8085"
DEFAULT_LEFT_TEXT_HEX = "#FFFFFF"
DEFAULT_RIGHT_TEXT_HEX = "#FFFFFF"


def default_bubble_for_side(side: str) -> str:
    return DEFAULT_RIGHT_BUBBLE_HEX if (side or "").strip().lower() == "right" else DEFAULT_LEFT_BUBBLE_HEX


def default_text_for_side(side: str) -> str:
    return DEFAULT_RIGHT_TEXT_HEX if (side or "").strip().lower() == "right" else DEFAULT_LEFT_TEXT_HEX


@dataclass
class Character:
    cid: int
    name: str
    alias: Optional[str] = None
    side: str = "left"           # "left" | "right"
    bubble_hex: str = DEFAULT_LEFT_BUBBLE_HEX
    font_hex: str = DEFAULT_LEFT_TEXT_HEX
    avatar_path: Optional[str] = None
    groups: List[int] = field(default_factory=list)  # list of gids


@dataclass
class Message:
    speaker: str
    text: str
    is_comment: bool = False
    media_path: Optional[str] = None   # path to image/GIF for media messages
    scene_type: str = "chat"           # "chat" | "title" | "quote"
    duration: float = 2.0              # seconds to display this message
    # Per-scene style overrides (None = use project default)
    scene_bg_hex: Optional[str] = None      # card/strip background color
    scene_text_hex: Optional[str] = None    # text color
    scene_font_family: Optional[str] = None # font override
    scene_font_size: Optional[int] = None   # font size override
    scene_bold: bool = False
    scene_italic: bool = False
    scene_align: str = "center"             # "left" | "center" | "right"
    scene_valign: str = "center"            # "top" | "center" | "bottom"
    scene_bg_mode: str = "gradient"         # "gradient" | "color" | "image"
    scene_bg_image_path: Optional[str] = None
    scene_bg_image_anchor: str = "full"     # "full" | "top" | "bottom"
    scene_title_shadow_style: str = "soft"  # "none" | "soft" | "strong"
    delivery_status: str = ""               # "" | "sent" | "delivered" | "read"
    reactions: List[str] = field(default_factory=list)  # emoji strings
    # Optional per-chat-bubble overrides (None = use character/project defaults)
    chat_bubble_hex: Optional[str] = None
    chat_text_hex: Optional[str] = None
    chat_font_family: Optional[str] = None
    chat_font_size: Optional[int] = None
    chat_corner_radius: Optional[int] = None
    chat_timestamp: Optional[str] = None
    chat_timestamp_sec: Optional[float] = None
    is_scene_root: bool = False
    bubble_side: Optional[str] = None
    audio_path: Optional[str] = None   # path to voice-note / audio clip
    typing_fakeout_enabled: bool = False
    typing_fakeout_cycles: int = 1
    parenthetical: Optional[str] = None  # screen-direction note, e.g. "(whispering)"


@dataclass
class RenderSettings:
    theme: str = "dark"
    bg_color: str = "#121212"
    bg_image_path: Optional[str] = None
    bg_dim: float = 0.0          # 0.0 = no overlay, 1.0 = fully black
    music_path: Optional[str] = None
    music_volume: float = 0.8
    export_fps: int = 30
    export_keyboard_animation_enabled: bool = True
    export_typing_fakeout_enabled: bool = True
    export_typing_duration: float = 0.08
    typing_indicator_duration: float = 1.2
    typing_indicator_gap: float = 0.4
    sfx_type: str = "soft"
    keyboard_style: str = "ios"
    export_keyboard_sfx_type: str = "Off"

    font_family: str = "default"
    font_size: int = 28
    label_size: int = 22

    # Project-scoped script export defaults (uniform across scenes in this project).
    script_format: str = "PDF"
    script_style: str = "Screenplay"
    script_font: str = "default"
    script_font_size: int = 17
    script_paper_size: str = "A4"
    script_bold_names: bool = False
    script_page_number: bool = True
    script_paper_effect: bool = False

    corner_radius: int = 22
    h_padding: int = 16
    v_padding: int = 14
    msg_spacing: int = 6
    max_bubble_width_pct: float = 0.68

    avatar_size: int = 80
    show_avatars: bool = True
    show_left_avatar: bool = True
    show_right_avatar: bool = True
    show_left_name: bool = True
    show_right_name: bool = True
    show_left_typing: bool = True
    show_right_typing: bool = True
    story_icon_path: Optional[str] = None
    override_primary_bubble_color: bool = True

    # Device/status header emulation
    header_mode: str = "off"          # "off" | "ios" | "android"
    header_time: str = "9:41"
    header_date: str = "Tue, Jan 9"
    header_show_wifi: bool = True
    header_show_signal: bool = True
    header_show_battery: bool = True
    header_battery_pct: int = 92
    header_network: str = ""          # "" | "4G" | "LTE" | "5G" | "No signal"
    header_show_email: bool = False
    header_show_text: bool = False
    header_show_missed_call: bool = False
    header_show_alarm: bool = False
    header_show_calendar_appt: bool = False

    canvas_w: int = 720
    canvas_h: int = 1280


@dataclass
class Project:
    title: str = "Untitled Story"
    aspect: str = "vertical"
    characters: List[Character] = field(default_factory=list)
    messages: List[Message] = field(default_factory=list)
    groups: List[CharacterGroup] = field(default_factory=list)
    settings: RenderSettings = field(default_factory=RenderSettings)
    _next_cid: int = field(default=1, repr=False)
    _next_gid: int = field(default=1, repr=False)

    def add_group(self, name: str, color: str = "#888888") -> CharacterGroup:
        g = CharacterGroup(self._next_gid, name, color)
        self._next_gid += 1
        self.groups.append(g)
        return g

    def add_character(self, name: str, side: str = "left",
                      bubble: Optional[str] = None, font_c: Optional[str] = None,
                      avatar: Optional[str] = None, alias: Optional[str] = None) -> Character:
        side_norm = (side or "left").strip().lower()
        bubble_hex = (bubble or default_bubble_for_side(side_norm)).strip()
        font_hex = (font_c or default_text_for_side(side_norm)).strip()
        ch = Character(
            cid=self._next_cid,
            name=name,
            alias=alias,
            side=side_norm,
            bubble_hex=bubble_hex,
            font_hex=font_hex,
            avatar_path=avatar,
        )
        self._next_cid += 1
        self.characters.append(ch)
        return ch

    def get_character(self, name: str) -> Optional[Character]:
        for ch in self.characters:
            if ch.name == name:
                return ch
        return None

    def to_story_config(self) -> Dict[str, Any]:
        name_to_idx: Dict[str, int] = {}
        char_entries: List[Dict[str, Any]] = []
        left_id = right_id = None

        for idx, ch in enumerate(self.characters, 1):
            name_to_idx[ch.name] = idx
            char_entries.append({
                "characterID": idx,
                "name": ch.name,
                "avatarImageFile": (
                    os.path.basename(ch.avatar_path) if ch.avatar_path
                    else f"{ch.name.lower()}.jpg"
                ),
                "color": _hex_to_rgb_floats(ch.bubble_hex),
                "fontColor": _hex_to_rgb_floats(ch.font_hex),
                "sound": 0,
            })
            if ch.side == "left" and left_id is None:
                left_id = idx
            if ch.side == "right" and right_id is None:
                right_id = idx

        if left_id is None and char_entries:
            left_id = char_entries[0]["characterID"]
        if right_id is None and len(char_entries) > 1:
            right_id = char_entries[1]["characterID"]

        messages_out: List[Dict[str, Any]] = []
        for m in self.messages:
            idx = name_to_idx.get(m.speaker, 1)
            ch = self.get_character(m.speaker)
            side = ch.side if ch else "left"
            mk = "leftMessage" if side == "left" else "rightMessage"
            ck = "leftCharacter" if side == "left" else "rightCharacter"
            if m.is_comment:
                messages_out.append({"comment": 1, ck: idx, mk: m.speaker})
            else:
                messages_out.append({"comment": 0, ck: idx, mk: m.text})

        return {
            "name": self.title,
            "aspectRatio": self.aspect,
            "quality": -1,
            "backgroundImageFile": (
                "background.jpg" if self.settings.bg_image_path else "bg_default"
            ),
            "insertVideoTitle": 0,
            "videoTitle": self.title,
            "hideCorrections": 0,
            "showTyping": "showTypingNone",
            "speed": -1,
            "typingSound": "typingSoundOff",
            "colorTheme": self.settings.theme,
            "leftCharacter": left_id,
            "rightCharacter": right_id,
            "characters": char_entries,
            "messages": messages_out,
        }


# ── Colour helpers ────────────────────────────────────────────────────────

def _hex_to_rgb_floats(h: str) -> Dict[str, float]:
    h = h.strip().lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    if len(h) != 6:
        h = "555555"
    return {
        "r": float(int(h[0:2], 16)),
        "g": float(int(h[2:4], 16)),
        "b": float(int(h[4:6], 16)),
    }


def _hex_to_rgb(h: str) -> Tuple[int, int, int]:
    d = _hex_to_rgb_floats(h)
    return int(d["r"]), int(d["g"]), int(d["b"])


def _rgb_floats_to_hex(d) -> str:
    """Convert either a dict {"r":R,"g":G,"b":B} (0-255 range) or a list/tuple
    [R, G, B] (also 0-255 range, as produced by to_story_config) to a hex string."""
    if isinstance(d, (list, tuple)):
        r_raw = d[0] if len(d) > 0 else 0
        g_raw = d[1] if len(d) > 1 else 0
        b_raw = d[2] if len(d) > 2 else 0
    else:
        r_raw = d.get("r", 0) if d else 0
        g_raw = d.get("g", 0) if d else 0
        b_raw = d.get("b", 0) if d else 0
    r = max(0, min(255, int(r_raw)))
    g = max(0, min(255, int(g_raw)))
    b = max(0, min(255, int(b_raw)))
    return f"#{r:02X}{g:02X}{b:02X}"


def hex_to_kivy_color(h: str) -> List[float]:
    """Convert #RRGGBB to a Kivy (r,g,b,1) float tuple."""
    r, g, b = _hex_to_rgb(h)
    return [r / 255, g / 255, b / 255, 1.0]


# ── File I/O ──────────────────────────────────────────────────────────────

def load_story_file(path: str) -> Project:
    with zipfile.ZipFile(path, "r") as zf:
        cfg = json.loads(zf.read("config.json").decode("utf-8"))

    proj = Project()
    proj.title = cfg.get("name", "Untitled")
    proj.aspect = cfg.get("aspectRatio", "vertical")
    proj.settings.theme = cfg.get("colorTheme", "dark")

    left_id = cfg.get("leftCharacter")
    right_id = cfg.get("rightCharacter")

    id_to_char: Dict[int, Character] = {}
    for cd in cfg.get("characters", []):
        cid = int(cd["characterID"])
        side = "left" if cid == left_id else ("right" if cid == right_id else "left")
        ch = Character(
            cid=cid,
            name=cd.get("name", f"C{cid}"),
            side=side,
            bubble_hex=_rgb_floats_to_hex(cd.get("color", {"r": 233, "g": 233, "b": 235})),
            font_hex=_rgb_floats_to_hex(cd.get("fontColor", {"r": 0, "g": 0, "b": 0})),
        )
        id_to_char[cid] = ch
        proj.characters.append(ch)

    if proj.characters:
        proj._next_cid = max(ch.cid for ch in proj.characters) + 1

    for row in cfg.get("messages", []):
        is_comment = bool(row.get("comment", 0))
        scene_type = row.get("scene_type", "chat")
        duration = row.get("duration", 2.0)
        if "leftMessage" in row:
            cid = int(row.get("leftCharacter", 0))
            ch = id_to_char.get(cid)
            proj.messages.append(Message(ch.name if ch else "Unknown", row["leftMessage"], is_comment, None, scene_type, duration))
        elif "rightMessage" in row:
            cid = int(row.get("rightCharacter", 0))
            ch = id_to_char.get(cid)
            proj.messages.append(Message(ch.name if ch else "Unknown", row["rightMessage"], is_comment, None, scene_type, duration))

    return proj


def save_story_file(proj: Project, out_path: str) -> None:
    cfg = proj.to_story_config()
    with zipfile.ZipFile(out_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("config.json", json.dumps(cfg, indent=2))
        for ch in proj.characters:
            if ch.avatar_path and os.path.isfile(ch.avatar_path):
                zf.write(ch.avatar_path, arcname=os.path.basename(ch.avatar_path))
        if proj.settings.bg_image_path and os.path.isfile(proj.settings.bg_image_path):
            zf.write(proj.settings.bg_image_path, arcname="background.jpg")


def save_project(proj: Project, out_path: str) -> None:
    rs = proj.settings
    data = {
        "title": proj.title,
        "aspect": proj.aspect,
        "groups": [
            {"gid": g.gid, "name": g.name, "color": g.color}
            for g in proj.groups
        ],
        "characters": [
            {
                "cid": ch.cid, "name": ch.name, "alias": ch.alias, "side": ch.side,
                "bubble_hex": ch.bubble_hex, "font_hex": ch.font_hex,
                "avatar_path": ch.avatar_path, "groups": ch.groups,
            }
            for ch in proj.characters
        ],
        "messages": [
            {
                "speaker": m.speaker, "text": m.text, "is_comment": m.is_comment,
                "media_path": m.media_path, "audio_path": m.audio_path,
                "scene_type": m.scene_type, "duration": m.duration,
                "scene_bg_hex": m.scene_bg_hex, "scene_text_hex": m.scene_text_hex,
                "scene_font_family": m.scene_font_family, "scene_font_size": m.scene_font_size,
                "scene_bold": m.scene_bold, "scene_italic": m.scene_italic,
                "scene_align": m.scene_align,
                "scene_valign": m.scene_valign,
                "scene_bg_mode": m.scene_bg_mode,
                "scene_bg_image_path": m.scene_bg_image_path,
                "scene_bg_image_anchor": m.scene_bg_image_anchor,
                "scene_title_shadow_style": m.scene_title_shadow_style,
                "delivery_status": m.delivery_status,
                "reactions": m.reactions,
                "chat_bubble_hex": m.chat_bubble_hex,
                "chat_text_hex": m.chat_text_hex,
                "chat_font_family": m.chat_font_family,
                "chat_font_size": m.chat_font_size,
                "chat_corner_radius": m.chat_corner_radius,
                "chat_timestamp": m.chat_timestamp,
                "chat_timestamp_sec": m.chat_timestamp_sec,
                "is_scene_root": bool(m.is_scene_root),
                "bubble_side": m.bubble_side,
                "typing_fakeout_enabled": bool(m.typing_fakeout_enabled),
                "typing_fakeout_cycles": int(m.typing_fakeout_cycles or 1),
                "parenthetical": m.parenthetical,
            }
            for m in proj.messages
        ],
        "settings": {
            "theme": rs.theme, "bg_color": rs.bg_color,
            "bg_image_path": rs.bg_image_path,
            "bg_dim": rs.bg_dim,
            "music_path": rs.music_path,
            "music_volume": rs.music_volume,
            "export_fps": int(rs.export_fps or 30),
            "export_keyboard_animation_enabled": bool(rs.export_keyboard_animation_enabled),
            "export_typing_fakeout_enabled": bool(rs.export_typing_fakeout_enabled),
            "export_typing_duration": float(rs.export_typing_duration or 0.08),
            "typing_indicator_duration": float(rs.typing_indicator_duration or 1.2),
            "typing_indicator_gap": float(rs.typing_indicator_gap or 0.4),
            "sfx_type": str(rs.sfx_type or "soft"),
            "keyboard_style": str(rs.keyboard_style or "ios"),
            "export_keyboard_sfx_type": str(rs.export_keyboard_sfx_type or "Off"),
            "font_family": rs.font_family, "font_size": rs.font_size,
            "label_size": rs.label_size, "corner_radius": rs.corner_radius,
            "script_format": rs.script_format,
            "script_style": rs.script_style,
            "script_font": rs.script_font,
            "script_font_size": int(rs.script_font_size or 17),
            "script_paper_size": rs.script_paper_size,
            "script_bold_names": bool(rs.script_bold_names),
            "script_page_number": bool(rs.script_page_number),
            "script_paper_effect": bool(rs.script_paper_effect),
            "h_padding": rs.h_padding, "v_padding": rs.v_padding,
            "msg_spacing": rs.msg_spacing,
            "max_bubble_width_pct": rs.max_bubble_width_pct,
            "avatar_size": rs.avatar_size, "show_avatars": rs.show_avatars,
            "show_left_avatar": bool(rs.show_left_avatar),
            "show_right_avatar": bool(rs.show_right_avatar),
            "show_left_name": bool(rs.show_left_name),
            "show_right_name": bool(rs.show_right_name),
            "show_left_typing": bool(rs.show_left_typing),
            "show_right_typing": bool(rs.show_right_typing),
            "story_icon_path": rs.story_icon_path,
            "override_primary_bubble_color": bool(rs.override_primary_bubble_color),
            "header_mode": rs.header_mode,
            "header_time": rs.header_time,
            "header_date": rs.header_date,
            "header_show_wifi": rs.header_show_wifi,
            "header_show_signal": rs.header_show_signal,
            "header_show_battery": rs.header_show_battery,
            "header_battery_pct": rs.header_battery_pct,
            "header_network": rs.header_network,
            "header_show_email": rs.header_show_email,
            "header_show_text": rs.header_show_text,
            "header_show_missed_call": rs.header_show_missed_call,
            "header_show_alarm": rs.header_show_alarm,
            "header_show_calendar_appt": rs.header_show_calendar_appt,
            "canvas_w": rs.canvas_w, "canvas_h": rs.canvas_h,
        },
    }
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2)


def load_project(path: str) -> Project:
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    proj = Project()
    proj.title = data.get("title", "Untitled")
    proj.aspect = data.get("aspect", "vertical")

    for gd in data.get("groups", []):
        proj.groups.append(CharacterGroup(
            gid=gd["gid"], name=gd["name"], color=gd.get("color", "#888888"),
        ))

    for cd in data.get("characters", []):
        side = (cd.get("side", "left") or "left").strip().lower()
        proj.characters.append(Character(
            cid=cd["cid"], name=cd["name"], alias=cd.get("alias"), side=side,
            bubble_hex=cd.get("bubble_hex", default_bubble_for_side(side)),
            font_hex=cd.get("font_hex", default_text_for_side(side)),
            avatar_path=cd.get("avatar_path"),
            groups=cd.get("groups", []),
        ))

    for md in data.get("messages", []):
        raw_scene_type = md.get("scene_type", "chat")
        raw_duration = md.get("duration", 2.0)

        # Backward-compat repair: some saved projects may have scene_type/duration swapped.
        if isinstance(raw_duration, str) and raw_duration in {"chat", "title", "quote"} and raw_scene_type in (None, "", 0):
            raw_scene_type, raw_duration = raw_duration, 2.0

        scene_type = raw_scene_type if isinstance(raw_scene_type, str) else "chat"
        if scene_type not in {"chat", "title", "quote"}:
            scene_type = "chat"

        try:
            duration = float(raw_duration)
            if duration <= 0:
                duration = 2.0
        except Exception:
            duration = 2.0

        scene_bg_mode = (md.get("scene_bg_mode") or "").strip().lower()
        if scene_bg_mode not in {"gradient", "color", "image"}:
            if md.get("scene_bg_image_path"):
                scene_bg_mode = "image"
            elif md.get("scene_bg_hex"):
                scene_bg_mode = "gradient"
            else:
                scene_bg_mode = "gradient"

        msg = Message(
            speaker=md["speaker"],
            text=md["text"],
            is_comment=md.get("is_comment", False),
            media_path=md.get("media_path"),
            scene_type=scene_type,
            duration=duration,
            scene_bg_hex=md.get("scene_bg_hex"),
            scene_text_hex=md.get("scene_text_hex"),
            scene_font_family=md.get("scene_font_family"),
            scene_font_size=md.get("scene_font_size"),
            scene_bold=md.get("scene_bold", False),
            scene_italic=md.get("scene_italic", False),
            scene_align=md.get("scene_align", "center"),
            scene_valign=md.get("scene_valign", "center"),
            scene_bg_mode=scene_bg_mode,
            scene_bg_image_path=md.get("scene_bg_image_path"),
            scene_bg_image_anchor=md.get("scene_bg_image_anchor", "full"),
            scene_title_shadow_style=md.get("scene_title_shadow_style", "soft"),
        )
        if msg.scene_valign not in {"top", "center", "bottom"}:
            msg.scene_valign = "center"
        if msg.scene_bg_image_anchor not in {"full", "top", "bottom"}:
            msg.scene_bg_image_anchor = "full"
        if msg.scene_title_shadow_style not in {"none", "soft", "strong"}:
            msg.scene_title_shadow_style = "soft"
        msg.delivery_status = md.get("delivery_status", "")
        msg.reactions = md.get("reactions", [])
        msg.chat_bubble_hex = md.get("chat_bubble_hex")
        msg.chat_text_hex = md.get("chat_text_hex")
        msg.chat_font_family = md.get("chat_font_family")
        msg.chat_font_size = md.get("chat_font_size")
        msg.chat_corner_radius = md.get("chat_corner_radius")
        msg.chat_timestamp = md.get("chat_timestamp")
        try:
            ts_sec = md.get("chat_timestamp_sec")
            msg.chat_timestamp_sec = None if ts_sec is None else float(ts_sec)
        except Exception:
            msg.chat_timestamp_sec = None
        msg.is_scene_root = bool(md.get("is_scene_root", False))
        msg.bubble_side = md.get("bubble_side")
        msg.audio_path = md.get("audio_path")
        msg.typing_fakeout_enabled = bool(md.get("typing_fakeout_enabled", False))
        try:
            msg.typing_fakeout_cycles = max(1, min(4, int(md.get("typing_fakeout_cycles", 1) or 1)))
        except Exception:
            msg.typing_fakeout_cycles = 1
        msg.parenthetical = md.get("parenthetical") or None
        proj.messages.append(msg)

    s = data.get("settings", {})
    rs = proj.settings
    for k in (
        "theme", "bg_color", "bg_image_path", "bg_dim", "music_path", "music_volume",
        "export_fps", "export_keyboard_animation_enabled", "export_typing_fakeout_enabled",
        "export_typing_duration", "typing_indicator_duration", "typing_indicator_gap", "sfx_type", "keyboard_style", "export_keyboard_sfx_type",
        "font_family", "font_size",
        "script_format", "script_style", "script_font", "script_font_size",
        "script_paper_size", "script_bold_names", "script_page_number", "script_paper_effect",
        "label_size", "corner_radius", "h_padding", "v_padding", "msg_spacing",
        "max_bubble_width_pct", "avatar_size", "show_avatars",
        "show_left_avatar", "show_right_avatar",
        "show_left_name", "show_right_name",
        "show_left_typing", "show_right_typing",
        "story_icon_path",
        "override_primary_bubble_color",
        "header_mode", "header_time", "header_date",
        "header_show_wifi", "header_show_signal", "header_show_battery",
        "header_battery_pct",
        "header_network", "header_show_email", "header_show_text",
        "header_show_missed_call", "header_show_alarm", "header_show_calendar_appt",
        "canvas_w", "canvas_h",
    ):
        if k in s:
            setattr(rs, k, s[k])

    if proj.characters:
        try:
            proj._next_cid = max(int(ch.cid) for ch in proj.characters) + 1
        except (TypeError, ValueError):
            proj._next_cid = len(proj.characters) + 1
    if proj.groups:
        try:
            proj._next_gid = max(int(g.gid) for g in proj.groups) + 1
        except (TypeError, ValueError):
            proj._next_gid = len(proj.groups) + 1

    return proj


# ── Renderer ──────────────────────────────────────────────────────────────

class ChatRenderer:
    def __init__(self, proj: Project):
        self.proj = proj
        self._font_cache: Dict[Tuple, Any] = {}
        self._avatar_cache: Dict[str, Any] = {}
        self._scene_bg_cache: Dict[Tuple[str, int, int], Any] = {}
        self._media_meta_cache: Dict[Tuple[str, int, int], Tuple[int, int]] = {}
        self._media_thumb_cache: Dict[Tuple[str, int, int, int, int], Any] = {}
        self._keyboard_overlay_cache: Dict[Tuple[int, int, str], Tuple[Any, Dict[str, Tuple[int, int, int, int]]]] = {}
        self._gif_timing_cache: Dict[str, Tuple[List[int], int]] = {}
        self._hit_regions: List[Tuple[int, int, int, int, str, int]] = []  # (x1, y1, x2, y2, type, index)
        self._last_window_start = 0
        self._last_window_end = -1
        self._last_window_total = 0
        self._last_scroll_px = 0.0
        self._last_max_scroll_px = 0.0
        self._last_viewport_h = 0.0
        self._last_total_h = 0.0

    def invalidate(self) -> None:
        self._font_cache.clear()
        self._avatar_cache.clear()
        self._scene_bg_cache.clear()
        self._media_meta_cache.clear()
        self._media_thumb_cache.clear()
        self._keyboard_overlay_cache.clear()
        self._gif_timing_cache.clear()
        self._hit_regions.clear()
        _font_path_cache.clear()

    def _media_stat_key(self, path: str) -> Tuple[str, int, int]:
        try:
            st = os.stat(path)
            return (path, int(getattr(st, "st_mtime_ns", int(st.st_mtime * 1_000_000_000))), int(st.st_size))
        except Exception:
            return (path, 0, 0)

    def _get_media_size(self, path: str) -> Optional[Tuple[int, int]]:
        if not path or not os.path.isfile(path):
            return None
        key = self._media_stat_key(path)
        cached = self._media_meta_cache.get(key)
        if cached is not None:
            return cached
        try:
            with Image.open(path) as im:
                w, h = im.size
            if w > 0 and h > 0:
                self._media_meta_cache[key] = (int(w), int(h))
                return (int(w), int(h))
        except Exception:
            return None
        return None

    def _get_media_thumb(self, path: str, thumb_w: int, thumb_h: int) -> Optional[Any]:
        if not path or not os.path.isfile(path):
            return None
        frame_idx = 0
        try:
            with Image.open(path) as _probe:
                if getattr(_probe, "is_animated", False):
                    frame_idx = self._gif_frame_index(path)
        except Exception:
            frame_idx = 0
        stat_key = self._media_stat_key(path)
        key = (stat_key[0], stat_key[1], stat_key[2], int(thumb_w), int(thumb_h), int(frame_idx))
        cached = self._media_thumb_cache.get(key)
        if cached is not None:
            return cached.copy()
        try:
            with Image.open(path) as src:
                if getattr(src, "is_animated", False):
                    try:
                        src.seek(frame_idx)
                    except Exception:
                        pass
                mimg = src.convert("RGB")
            sw, sh = mimg.size
            if sw <= 0 or sh <= 0:
                return None
            target_ratio = float(thumb_w) / float(max(1, thumb_h))
            src_ratio = float(sw) / float(sh)
            if src_ratio > target_ratio:
                crop_w = int(sh * target_ratio)
                crop_h = sh
                cx = (sw - crop_w) // 2
                cy = 0
            else:
                crop_w = sw
                crop_h = int(sw / target_ratio)
                cx = 0
                cy = (sh - crop_h) // 2
            mimg = mimg.crop((cx, cy, cx + crop_w, cy + crop_h)).resize((int(thumb_w), int(thumb_h)), Image.LANCZOS)
            self._media_thumb_cache[key] = mimg
            return mimg.copy()
        except Exception:
            return None

    def _get_scene_bg_image(self, path: str, w: int, h: int, anchor: str = "full", fill_rgb: Optional[Tuple[int, int, int]] = None):
        key = (path, int(w), int(h), (anchor or "full").lower(), tuple(fill_rgb) if fill_rgb else None)
        cached = self._scene_bg_cache.get(key)
        if cached is not None:
            return cached
        try:
            if not path or not os.path.isfile(path):
                return None
            im = Image.open(path).convert("RGB")
            src_w, src_h = im.size
            if src_w <= 0 or src_h <= 0:
                return None
            anchor_mode = (anchor or "full").strip().lower()
            if anchor_mode not in {"full", "top", "bottom"}:
                anchor_mode = "full"
            target_ratio = w / float(h)
            src_ratio = src_w / float(src_h)

            if anchor_mode == "full":
                # Keep full image visible (contain) and letterbox with fill color.
                canvas = Image.new("RGB", (w, h), fill_rgb or (18, 18, 20))
                if src_ratio > target_ratio:
                    fit_w = w
                    fit_h = max(1, int(w / src_ratio))
                else:
                    fit_h = h
                    fit_w = max(1, int(h * src_ratio))
                fitted = im.resize((fit_w, fit_h), Image.Resampling.LANCZOS)
                px = (w - fit_w) // 2
                py = (h - fit_h) // 2
                canvas.paste(fitted, (px, py))
                im = canvas
            else:
                # Fill-crop with explicit vertical anchor (top or bottom).
                if src_ratio > target_ratio:
                    crop_w = int(src_h * target_ratio)
                    crop_h = src_h
                    x0 = (src_w - crop_w) // 2
                    y0 = 0
                else:
                    crop_w = src_w
                    crop_h = int(src_w / target_ratio)
                    x0 = 0
                    if anchor_mode == "top":
                        y0 = 0
                    else:  # bottom
                        y0 = max(0, src_h - crop_h)
                im = im.crop((x0, y0, x0 + crop_w, y0 + crop_h)).resize((w, h), Image.Resampling.LANCZOS)
            self._scene_bg_cache[key] = im
            return im
        except Exception:
            return None

    def _gif_frame_index(self, gif_path: str) -> int:
        try:
            cached = self._gif_timing_cache.get(gif_path)
            if cached is None:
                starts: List[int] = []
                total = 0
                with Image.open(gif_path) as gim:
                    nframes = int(getattr(gim, "n_frames", 1) or 1)
                    for i in range(max(1, nframes)):
                        try:
                            gim.seek(i)
                        except Exception:
                            break
                        starts.append(total)
                        dur = int((gim.info or {}).get("duration", 100) or 100)
                        if dur < 20:
                            dur = 100
                        total += dur
                if not starts:
                    starts = [0]
                    total = 100
                self._gif_timing_cache[gif_path] = (starts, max(1, total))
                cached = self._gif_timing_cache[gif_path]

            starts, total = cached
            t = int(time.time() * 1000) % max(1, total)
            idx = 0
            for i, s in enumerate(starts):
                if s <= t:
                    idx = i
                else:
                    break
            return idx
        except Exception:
            return 0

    def element_at(self, x: int, y: int) -> Optional[Dict[str, Any]]:
        """Find which character or message is at pixel (x, y)."""
        # Search in reverse (last registered = drawn last = highest priority)
        for x1, y1, x2, y2, etype, idx in reversed(self._hit_regions):
            if x1 <= x <= x2 and y1 <= y <= y2:
                return {"type": etype, "index": idx}
        return None

    def message_hit_slots(self) -> List[Tuple[int, float]]:
        """Return [(msg_index, img_y_center), ...] sorted by Y for the last rendered frame.
        Used to determine drag-to-reorder target slot from an image Y coordinate."""
        slots: Dict[int, Tuple[int, int]] = {}
        for _x1, y1, _x2, y2, etype, idx in self._hit_regions:
            if etype in ("bubble", "scene"):
                if idx not in slots:
                    slots[idx] = (y1, y2)
                else:
                    oy1, oy2 = slots[idx]
                    slots[idx] = (min(oy1, y1), max(oy2, y2))
        return sorted(
            [(idx, (y1 + y2) / 2.0) for idx, (y1, y2) in slots.items()],
            key=lambda t: t[1],
        )

    def get_message_bubble_bounds(self, msg_idx: int) -> Optional[Tuple[int, int, int, int]]:
        """Return (x1, y1, x2, y2) in image coordinates for the bubble of a message.
        Used for anchored reaction menu placement. Returns None if not found."""
        x1, y1, x2, y2 = None, None, None, None
        for bx1, by1, bx2, by2, etype, idx in self._hit_regions:
            if etype == "bubble" and idx == msg_idx:
                if x1 is None:
                    x1, y1, x2, y2 = bx1, by1, bx2, by2
                else:
                    x1 = min(x1, bx1)
                    y1 = min(y1, by1)
                    x2 = max(x2, bx2)
                    y2 = max(y2, by2)
        if x1 is not None:
            return (int(x1), int(y1), int(x2), int(y2))
        return None

    def get_scroll_window(self) -> Tuple[int, int, int]:
        """Return (start_idx, end_idx, total_revealed) for the last rendered frame."""
        return (self._last_window_start, self._last_window_end, self._last_window_total)

    def get_scroll_metrics(self) -> Tuple[float, float, float, float]:
        """Return (scroll_px, max_scroll_px, viewport_h, total_content_h)."""
        return (
            float(self._last_scroll_px),
            float(self._last_max_scroll_px),
            float(self._last_viewport_h),
            float(self._last_total_h),
        )

    def get_page_scroll_positions(
        self,
        upto_index: int,
        size: Optional[Tuple[int, int]] = None,
        bottom_reserved: int = 0,
        play_mode: bool = False,
    ) -> List[int]:
        """Return top-anchored scroll offsets for page-aligned exports.

        Pages advance on message boundaries when possible so exports do not rely on
        raster slicing. If a single message is taller than the viewport, the helper
        falls back to intra-message scroll positions to avoid missing content.
        """
        rs = self.proj.settings
        w = size[0] if size else rs.canvas_w
        h = size[1] if size else rs.canvas_h
        if upto_index < 0 or not self.proj.messages:
            return [0]

        probe = self._make_background(max(1, int(w)), max(1, int(h)))
        draw = ImageDraw.Draw(probe)
        font_msg = self._get_font(rs.font_size)
        font_lbl = self._get_font(rs.label_size)
        header_reserved = self._draw_device_header(draw, rs, w, h)

        inset = 16
        header_mode = (getattr(rs, "header_mode", "off") or "off").lower()
        header_clearance = 30 if header_mode == "ios" else 24 if header_mode == "android" else 0
        safe_l = inset
        safe_t = inset + header_reserved + header_clearance + max(2, int(rs.avatar_size * 0.08))
        safe_r = w - inset
        safe_b = h - inset - max(0, int(bottom_reserved or 0))
        safe_w = safe_r - safe_l

        music_path = getattr(rs, "music_path", None)
        has_music_source = bool(music_path and os.path.isfile(music_path))
        show_timing_controls = False if play_mode else bool(getattr(rs, "show_timing_controls", False) and has_music_source)
        timing_lane_w = 108 if show_timing_controls else 0

        av_sz = rs.avatar_size if rs.show_avatars else 0
        av_gap = av_sz + 10 if av_sz > 0 else 0
        reorder_lane_w = 0
        bubble_lane_l = safe_l
        bubble_lane_r = safe_r - timing_lane_w - reorder_lane_w
        bubble_lane_w = max(120, bubble_lane_r - bubble_lane_l)
        side_gutter = av_gap if rs.show_avatars else 0
        bubble_lane_max = max(120, bubble_lane_w - side_gutter - 10)
        max_bw = min(bubble_lane_max, int((bubble_lane_w - 6) * max(0.98, float(rs.max_bubble_width_pct))))

        max_idx = min(int(upto_index) + 1, len(self.proj.messages))
        if max_idx <= 0:
            return [0]

        scene_start_idx = 0
        for j in range(max_idx - 1, -1, -1):
            msg = self.proj.messages[j]
            if bool(getattr(msg, "is_scene_root", False)) or getattr(msg, "scene_type", "chat") in ("title", "quote", "narrator"):
                scene_start_idx = j
                break

        local_total = max_idx - scene_start_idx
        if local_total <= 0:
            return [0]

        viewport_h = max(1, safe_b - safe_t)
        gap = int(rs.msg_spacing)
        est_heights: List[int] = []
        for j in range(scene_start_idx, max_idx):
            item_h = self._estimate_message_height(
                draw,
                self.proj.messages[j],
                font_msg,
                font_lbl,
                rs,
                safe_w,
                max_bw,
                av_sz,
                av_gap,
            )
            est_heights.append(int(item_h))

        total_content_h = sum(est_heights) + gap * max(0, local_total - 1)
        max_scroll_px = max(0, total_content_h - viewport_h)
        if max_scroll_px <= 0:
            return [0]

        tops: List[int] = []
        cursor = 0
        for idx, item_h in enumerate(est_heights):
            tops.append(int(cursor))
            cursor += int(item_h)
            if idx < len(est_heights) - 1:
                cursor += gap

        positions: List[int] = [0]
        page_used = 0
        for idx, item_h in enumerate(est_heights):
            item_top = tops[idx]
            item_h = int(item_h)
            if item_h > viewport_h:
                if page_used > 0 and positions[-1] != min(item_top, max_scroll_px):
                    positions.append(min(item_top, max_scroll_px))
                last_chunk_start = positions[-1]
                chunk_start = item_top
                while chunk_start + viewport_h < item_top + item_h and chunk_start < max_scroll_px:
                    if positions[-1] != min(chunk_start, max_scroll_px):
                        positions.append(min(chunk_start, max_scroll_px))
                    last_chunk_start = min(chunk_start, max_scroll_px)
                    chunk_start += viewport_h
                page_used = max(0, (item_top + item_h) - last_chunk_start)
                continue

            needed = item_h if page_used <= 0 else page_used + gap + item_h
            if page_used > 0 and needed > viewport_h:
                new_pos = min(item_top, max_scroll_px)
                if positions[-1] != new_pos:
                    positions.append(new_pos)
                page_used = item_h
            else:
                page_used = needed

        deduped: List[int] = []
        for pos in positions:
            pos = int(max(0, min(pos, max_scroll_px)))
            if not deduped or deduped[-1] != pos:
                deduped.append(pos)
        if deduped[-1] != int(max_scroll_px) and total_content_h - deduped[-1] > viewport_h:
            deduped.append(int(max_scroll_px))
        return deduped

    def _mark_region(self, x1: int, y1: int, x2: int, y2: int, element_type: str, index: int) -> None:
        """Register a rectangular hit region for tap-to-edit."""
        self._hit_regions.append((x1, y1, x2, y2, element_type, index))

    def _get_font(self, size: int, family: Optional[str] = None) -> Any:
        ff = family or self.proj.settings.font_family
        key = (ff, size)
        if key in self._font_cache:
            return self._font_cache[key]
        path = _resolve_font_path(ff)
        if path:
            try:
                f = ImageFont.truetype(path, size)
                self._font_cache[key] = f
                return f
            except Exception:
                pass
        try:
            f = ImageFont.load_default(size=size)
        except TypeError:
            f = ImageFont.load_default()
        self._font_cache[key] = f
        return f

    def _get_emoji_font(self, size: int) -> Any:
        """Return a PIL font capable of rendering emoji glyphs."""
        key = ("__emoji__", size)
        if key in self._font_cache:
            return self._font_cache[key]
        candidates = [
            "/usr/local/share/fonts/google-noto-emoji-fonts/NotoEmoji-Regular.ttf",
            "/usr/share/fonts/google-noto-emoji-fonts/NotoEmoji-Regular.ttf",
            "/usr/share/fonts/noto/NotoEmoji-Regular.ttf",
            "/usr/local/share/fonts/gdouros-symbola/Symbola.ttf",
            "/usr/share/fonts/gdouros-symbola/Symbola.ttf",
        ]
        for path in candidates:
            if os.path.isfile(path):
                try:
                    f = ImageFont.truetype(path, size)
                    self._font_cache[key] = f
                    return f
                except Exception:
                    continue
        f = self._get_font(size)
        self._font_cache[key] = f
        return f

    def _get_avatar(self, ch: Character) -> Optional[Any]:
        if not ch.avatar_path or not os.path.isfile(ch.avatar_path):
            return None
        if ch.avatar_path not in self._avatar_cache:
            try:
                self._avatar_cache[ch.avatar_path] = Image.open(ch.avatar_path).convert("RGBA")
            except Exception:
                return None
        return self._avatar_cache[ch.avatar_path]

    def _make_background(self, w: int, h: int) -> Any:
        rs = self.proj.settings
        img = Image.new("RGB", (w, h), _hex_to_rgb(rs.bg_color))
        if rs.bg_image_path and os.path.isfile(rs.bg_image_path):
            try:
                src = Image.open(rs.bg_image_path).convert("RGB")
                sw, sh = src.size
                # Cover mode: scale so image fills entire canvas, crop excess
                scale = max(w / sw, h / sh)
                nw, nh = int(sw * scale), int(sh * scale)
                src = src.resize((nw, nh), Image.LANCZOS)
                ox, oy = (nw - w) // 2, (nh - h) // 2
                src = src.crop((ox, oy, ox + w, oy + h))
                img.paste(src, (0, 0))
            except Exception:
                pass
        # Dim overlay for readability
        dim = getattr(rs, 'bg_dim', 0.0)
        if dim > 0.0:
            alpha = int(dim * 255)
            overlay = Image.new("RGBA", (w, h), (0, 0, 0, alpha))
            img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
        return img

    def _wrap_text(self, draw: Any, text: str, font: Any, max_w: int) -> List[str]:
        def _measure_width(txt: str) -> int:
            try:
                left, _top, right, _bottom = draw.textbbox((0, 0), txt, font=font)
                return int(max(0, right - left))
            except Exception:
                try:
                    return int(draw.textlength(txt, font=font))
                except Exception:
                    return len(txt) * 10

        words = text.split(" ")
        lines: List[str] = []
        cur = ""
        for word in words:
            candidate = (cur + " " + word).strip()
            tw = _measure_width(candidate)
            if tw <= max_w or not cur:
                cur = candidate
            else:
                lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
        return lines or [""]

    def _measure_text_width(self, draw: Any, txt: str, font: Any) -> int:
        try:
            left, _top, right, _bottom = draw.textbbox((0, 0), txt, font=font)
            return int(max(0, right - left))
        except Exception:
            try:
                return int(draw.textlength(txt, font=font))
            except Exception:
                return len(txt) * 10

    def _is_emoji_candidate_char(self, ch: str) -> bool:
        cp = ord(ch)
        return (
            0x1F000 <= cp <= 0x1FAFF
            or 0x2600 <= cp <= 0x27BF
            or cp in (0x200D, 0xFE0F)
        )

    def _split_keep_spaces(self, text: str) -> List[str]:
        if not text:
            return []
        out: List[str] = []
        cur = text[0]
        is_space = text[0].isspace()
        for ch in text[1:]:
            if ch.isspace() == is_space:
                cur += ch
            else:
                out.append(cur)
                cur = ch
                is_space = ch.isspace()
        out.append(cur)
        return out

    def _tokenize_chat_text(self, text: str) -> List[Tuple[str, str]]:
        """Tokenize text into ('text'|'emoji', value) while preserving mixed content."""
        tokens: List[Tuple[str, str]] = []
        buf = ""
        i = 0
        n = len(text)
        while i < n:
            ch = text[i]
            if not self._is_emoji_candidate_char(ch):
                buf += ch
                i += 1
                continue

            matched = None
            max_end = min(n, i + 8)
            for end in range(max_end, i, -1):
                cand = text[i:end]
                if any(c.isspace() for c in cand):
                    continue
                if load_emoji_png(cand, size=48) is not None:
                    matched = cand
                    break

            if matched is None:
                buf += ch
                i += 1
                continue

            if buf:
                tokens.append(("text", buf))
                buf = ""
            tokens.append(("emoji", matched))
            i += len(matched)

        if buf:
            tokens.append(("text", buf))
        return tokens

    def _measure_chat_tokens_width(self, draw: Any, tokens: List[Tuple[str, str]], font: Any, line_h: int) -> int:
        emoji_sz = max(18, int(line_h * 0.92))
        emoji_gap = max(1, int(line_h * 0.10))
        total = 0
        for kind, val in tokens:
            if kind == "text":
                total += self._measure_text_width(draw, val, font)
            else:
                total += emoji_sz + emoji_gap
        return total

    def _wrap_chat_tokens(self, draw: Any, text: str, font: Any, max_w: int, line_h: int) -> List[List[Tuple[str, str]]]:
        """Wrap mixed text+emoji content into token lines using visual widths."""
        lines_out: List[List[Tuple[str, str]]] = []
        paragraphs = (text or "").split("\n") or [""]
        for para in paragraphs:
            para_tokens = self._tokenize_chat_text(para)
            if not para_tokens:
                lines_out.append([("text", "")])
                continue

            line: List[Tuple[str, str]] = []
            line_w = 0
            for kind, val in para_tokens:
                if kind == "text":
                    for piece in self._split_keep_spaces(val):
                        pw = self._measure_chat_tokens_width(draw, [("text", piece)], font, line_h)
                        if line and (line_w + pw > max_w) and (not piece.isspace()):
                            lines_out.append(line)
                            line = []
                            line_w = 0
                        line.append(("text", piece))
                        line_w += pw
                else:
                    ew = self._measure_chat_tokens_width(draw, [("emoji", val)], font, line_h)
                    if line and (line_w + ew > max_w):
                        lines_out.append(line)
                        line = []
                        line_w = 0
                    line.append(("emoji", val))
                    line_w += ew

            if not line:
                line = [("text", "")]
            lines_out.append(line)
        return lines_out or [[("text", "")]]

    def _draw_chat_token_line(self, img: Any, draw: Any, tokens: List[Tuple[str, str]], tx: int, ty: int, font: Any, font_col: Tuple[int, int, int], line_h: int) -> int:
        """Draw one wrapped token line and return consumed line height."""
        emoji_sz = max(18, int(line_h * 0.92))
        emoji_gap = max(1, int(line_h * 0.10))
        x = int(tx)
        y = int(ty)
        for kind, val in tokens:
            if kind == "text":
                draw.text((x, y), val, fill=font_col, font=font)
                x += self._measure_text_width(draw, val, font)
                continue
            em = load_emoji_png(val, size=emoji_sz)
            if em is not None:
                py = int(y + max(0, (line_h - emoji_sz) // 2))
                # Keep paste coordinates int-safe to avoid PIL composition errors.
                img.paste(em, (int(x), int(py)), em)
            else:
                draw.text((x, y), val, fill=font_col, font=font)
            x += emoji_sz + emoji_gap
        return max(line_h, emoji_sz)

    def _draw_centered_avatar_initial(
        self,
        draw: Any,
        ax: int,
        ay: int,
        av_sz: int,
        initial: str,
        font: Any,
        fill: Tuple[int, int, int],
    ) -> None:
        """Draw an initial centered in an avatar circle using font bbox metrics."""
        try:
            draw.text(
                (ax + av_sz / 2.0, ay + av_sz / 2.0),
                initial,
                fill=fill,
                font=font,
                anchor="mm",
            )
            return
        except Exception:
            pass
        try:
            x0, y0, x1, y1 = draw.textbbox((0, 0), initial, font=font)
            tw = x1 - x0
            th = y1 - y0
            tx = ax + (av_sz - tw) // 2 - x0
            ty = ay + (av_sz - th) // 2 - y0
        except Exception:
            try:
                tw = int(draw.textlength(initial, font=font))
            except Exception:
                tw = av_sz // 2
            tx = ax + (av_sz - tw) // 2
            ty = ay + (av_sz - int(getattr(font, "size", av_sz // 2))) // 2
        draw.text((tx, ty), initial, fill=fill, font=font)

    def _avatar_initial_style(
        self,
        rs: RenderSettings,
        bubble_col: Tuple[int, int, int],
    ) -> Tuple[Any, Tuple[int, int, int]]:
        """Return a font/color for avatar initial letters (TypeStory-style: large, bold)."""
        init_size = max(14, int(rs.avatar_size * 0.44))
        init_font = self._get_font(init_size, family="Roboto")
        lum = int(0.299 * bubble_col[0] + 0.587 * bubble_col[1] + 0.114 * bubble_col[2])
        init_col = (240, 240, 240) if lum < 140 else (40, 40, 40)
        return init_font, init_col

    def _estimate_message_height(self, draw: Any, m: Message, font_msg: Any,
                                 font_lbl: Any, rs: RenderSettings,
                                 safe_w: int, max_bw: int, av_sz: int,
                                 av_gap: int) -> int:
        """Estimate vertical space consumed by one rendered item."""
        if getattr(m, "is_scene_root", False) and getattr(m, "scene_type", "chat") == "chat":
            return 0
        if m.scene_type == "title":
            return 220 + rs.msg_spacing

        if m.scene_type == "quote":
            qfont = self._get_font(rs.font_size + 4)
            lines = self._wrap_text(draw, f'"{m.text}"', qfont, safe_w - 48)
            try:
                asc, desc = qfont.getmetrics()
                lh = asc + desc
            except Exception:
                lh = rs.font_size + 8
            qh = len(lines) * lh + 2 * rs.v_padding + 8
            if m.speaker:
                qh += rs.label_size + 12
            return qh + rs.msg_spacing

        if m.is_comment:
            return 28 + rs.msg_spacing

        ch = self.proj.get_character(m.speaker)
        is_right = (ch.side == "right") if ch else False
        show_side_avatar = bool(getattr(rs, "show_right_avatar", getattr(rs, "show_avatars", True))) if is_right else bool(getattr(rs, "show_left_avatar", getattr(rs, "show_avatars", True)))
        show_side_name = bool(getattr(rs, "show_right_name", True)) if is_right else bool(getattr(rs, "show_left_name", True))
        has_audio = bool(getattr(m, "audio_path", None) and os.path.isfile(m.audio_path))
        display_text = m.text if (m.text or "").strip() else ("Voice note" if has_audio else "")
        timestamp = (getattr(m, "chat_timestamp", None) or "").strip()
        msg_font = self._get_font(
            int(m.chat_font_size) if m.chat_font_size else rs.font_size,
            family=m.chat_font_family or rs.font_family,
        )
        text_max_w = max(80, max_bw - 2 * rs.h_padding)
        try:
            asc, desc = msg_font.getmetrics()
            line_h = asc + desc
        except Exception:
            line_h = (int(m.chat_font_size) if m.chat_font_size else rs.font_size) + 4
        wrapped_lines = self._wrap_chat_tokens(draw, display_text, msg_font, text_max_w, line_h)

        bh = len(wrapped_lines) * line_h + max(0, len(wrapped_lines) - 1) * 4 + 2 * rs.v_padding
        if m.media_path and os.path.isfile(m.media_path):
            bh += 120 + rs.v_padding
        if has_audio:
            bh += 42 + rs.v_padding

        ts_h = 0
        if timestamp:
            ts_h = max(rs.label_size + 6, 16) + 6

        label_font_size = max(10, int(getattr(rs, "label_size", 22) or 22))
        lbl_h = (label_font_size + 6) if show_side_name else 0
        if show_side_avatar and av_sz > 0:
            body_h = max(bh, av_sz)
        else:
            body_h = bh
        return ts_h + lbl_h + body_h + rs.msg_spacing

    def _draw_device_header(self, draw: Any, rs: RenderSettings,
                            w: int, h: int) -> int:
        """Draw optional iOS/Android status/header chrome and return reserved top px."""
        mode = (getattr(rs, "header_mode", "off") or "off").lower()
        if mode not in ("ios", "android"):
            return 0

        time_text = getattr(rs, "header_time", "9:41") or "9:41"
        date_text = getattr(rs, "header_date", "Tue, Jan 9") or ""
        show_wifi = bool(getattr(rs, "header_show_wifi", True))
        show_signal = bool(getattr(rs, "header_show_signal", True))
        show_battery = bool(getattr(rs, "header_show_battery", True))
        network_text = (getattr(rs, "header_network", "") or "").strip()
        notif_flags = [
            (bool(getattr(rs, "header_show_email", False)), "@"),
            (bool(getattr(rs, "header_show_text", False)), "SMS"),
            (bool(getattr(rs, "header_show_missed_call", False)), "!"),
            (bool(getattr(rs, "header_show_alarm", False)), "A"),
            (bool(getattr(rs, "header_show_calendar_appt", False)), "C"),
        ]
        bat_pct = int(max(0, min(100, getattr(rs, "header_battery_pct", 92))))

        fg = (220, 220, 220)
        bar_bg = (24, 24, 24)
        if mode == "ios":
            top_h = 44
            draw.rectangle([0, 0, w, top_h], fill=bar_bg)

            # iPhone notch / sensor island
            notch_w = int(w * 0.34)
            notch_h = 24
            nx1 = (w - notch_w) // 2
            ny1 = 2
            nx2 = nx1 + notch_w
            ny2 = ny1 + notch_h
            draw.rounded_rectangle([nx1, ny1, nx2, ny2], 12, fill=(8, 8, 8))

            sfont = self._get_font(18)
            draw.text((20, 14), time_text, fill=fg, font=sfont)

            xr = w - 22
            if show_battery:
                bw, bh = 24, 12
                bx1, by1 = xr - bw, 14
                draw.rounded_rectangle([bx1, by1, bx1 + bw, by1 + bh], 3,
                                       outline=fg, width=2)
                draw.rectangle([bx1 + bw + 1, by1 + 3, bx1 + bw + 3, by1 + bh - 3], fill=fg)
                fill_w = int((bw - 4) * bat_pct / 100)
                draw.rectangle([bx1 + 2, by1 + 2, bx1 + 2 + fill_w, by1 + bh - 2], fill=fg)
                xr = bx1 - 10
            if show_wifi:
                draw.arc([xr - 16, 14, xr, 28], 200, 340, fill=fg, width=2)
                draw.arc([xr - 12, 16, xr - 4, 26], 205, 335, fill=fg, width=2)
                draw.ellipse([xr - 9, 24, xr - 7, 26], fill=fg)
                xr -= 20
            if show_signal:
                for i in range(4):
                    x = xr - (i * 5)
                    y = 26 - (i * 3)
                    draw.rectangle([x, y, x + 3, 28], fill=fg)

            if network_text:
                nfont = self._get_font(12)
                try:
                    nw = int(draw.textlength(network_text, font=nfont))
                except Exception:
                    nw = len(network_text) * 7
                draw.text((max(8, xr - nw - 6), 13), network_text, fill=fg, font=nfont)

            nx = 18
            nfont = self._get_font(11)
            for on, label in notif_flags:
                if not on:
                    continue
                draw.rounded_rectangle([nx, 30, nx + 22, 42], 6, fill=(54, 54, 54))
                draw.text((nx + 4, 31), label, fill=fg, font=nfont)
                nx += 26

            reserved = 52
        else:
            top_h = 32
            draw.rectangle([0, 0, w, top_h], fill=bar_bg)
            sfont = self._get_font(16)
            draw.text((16, 8), time_text, fill=fg, font=sfont)

            xr = w - 16
            if show_battery:
                bw, bh = 22, 10
                bx1, by1 = xr - bw, 10
                draw.rectangle([bx1, by1, bx1 + bw, by1 + bh], outline=fg, width=2)
                draw.rectangle([bx1 + bw + 1, by1 + 3, bx1 + bw + 3, by1 + bh - 3], fill=fg)
                fill_w = int((bw - 4) * bat_pct / 100)
                draw.rectangle([bx1 + 2, by1 + 2, bx1 + 2 + fill_w, by1 + bh - 2], fill=fg)
                xr = bx1 - 8
            if show_wifi:
                draw.arc([xr - 14, 8, xr, 22], 200, 340, fill=fg, width=2)
                draw.ellipse([xr - 8, 18, xr - 6, 20], fill=fg)
                xr -= 18
            if show_signal:
                for i in range(4):
                    x = xr - (i * 5)
                    y = 20 - (i * 2)
                    draw.rectangle([x, y, x + 3, 22], fill=fg)

            if network_text:
                nfont = self._get_font(11)
                try:
                    nw = int(draw.textlength(network_text, font=nfont))
                except Exception:
                    nw = len(network_text) * 7
                draw.text((max(8, xr - nw - 6), 9), network_text, fill=fg, font=nfont)

            nx = 14
            nfont = self._get_font(10)
            for on, label in notif_flags:
                if not on:
                    continue
                draw.rounded_rectangle([nx, 24, nx + 20, 34], 5, fill=(52, 52, 52))
                draw.text((nx + 4, 24), label, fill=fg, font=nfont)
                nx += 24

            reserved = 40

        # Date/subtitle row below status indicators (shared by both modes)
        if date_text:
            dfont = self._get_font(15)
            try:
                dw = int(draw.textlength(date_text, font=dfont))
            except Exception:
                dw = len(date_text) * 8
            draw.text(((w - dw) // 2, reserved - 4), date_text, fill=(165, 165, 165), font=dfont)
            reserved += 18

        convo_title = (self.proj.title or "").strip()
        icon_path = getattr(rs, "story_icon_path", None)
        if convo_title or (icon_path and os.path.isfile(icon_path)):
            row_h = 56
            row_y = reserved + 4
            cx = 22
            cy = row_y + row_h // 2
            rad = 18
            icon_drawn = False
            if icon_path and os.path.isfile(icon_path):
                try:
                    av = Image.open(icon_path).convert("RGBA").resize((rad * 2, rad * 2), Image.LANCZOS)
                    mask = Image.new("L", (rad * 2, rad * 2), 0)
                    ImageDraw.Draw(mask).ellipse([0, 0, rad * 2, rad * 2], fill=255)
                    img_rgba = draw._image if hasattr(draw, "_image") else None
                    if img_rgba is not None:
                        img_rgba.paste(av, (cx - rad, cy - rad), mask)
                        icon_drawn = True
                except Exception:
                    icon_drawn = False
            if not icon_drawn:
                draw.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(54, 56, 62))

            if convo_title:
                tfont = self._get_font(34 if mode == "ios" else 30)
                draw.text((cx + rad + 12, cy - (18 if mode == "ios" else 16)), convo_title, fill=(236, 238, 242), font=tfont)
            reserved += row_h

        return reserved

    def render_frame(self, upto_index: int,
                     size: Optional[Tuple[int, int]] = None,
                     scroll_steps: int = 0,
                     scroll_px: float = 0.0,
                     reorder_mode: bool = False,
                     bottom_reserved: int = 0,
                     expanded_timestamp_idx: int = -1,
                     play_mode: bool = False) -> Any:
        self._hit_regions.clear()  # Clear hit regions for this render
        self._last_window_start = 0
        self._last_window_end = -1
        self._last_window_total = 0
        self._last_scroll_px = 0.0
        self._last_max_scroll_px = 0.0
        self._last_viewport_h = 0.0
        self._last_total_h = 0.0
        rs = self.proj.settings
        w = size[0] if size else rs.canvas_w
        h = size[1] if size else rs.canvas_h

        img = self._make_background(w, h)
        draw = ImageDraw.Draw(img)

        font_msg = self._get_font(rs.font_size)
        font_lbl = self._get_font(rs.label_size)

        header_reserved = self._draw_device_header(draw, rs, w, h)

        inset = 16
        header_mode = (getattr(rs, "header_mode", "off") or "off").lower()
        header_clearance = 0
        if header_mode == "ios":
            header_clearance = 30
        elif header_mode == "android":
            header_clearance = 24
        safe_l, safe_t = inset, inset + header_reserved + header_clearance + max(2, int(rs.avatar_size * 0.08))
        safe_r, safe_b = w - inset, h - inset - max(0, int(bottom_reserved or 0))
        safe_w = safe_r - safe_l

        music_path = getattr(rs, "music_path", None)
        has_music_source = bool(music_path and os.path.isfile(music_path))
        # In play_mode, forcibly disable timing controls/arrows regardless of settings
        show_timing_controls = False if play_mode else bool(getattr(rs, "show_timing_controls", False) and has_music_source)
        # Only reserve lane when timing controls are active and music source exists.
        # 108 px gives enough room for label (~60px) + icon (32px) + padding on either side.
        timing_lane_w = 108 if show_timing_controls else 0

        av_sz = rs.avatar_size if rs.show_avatars else 0
        # Leave intentional breathing room between avatar edge and bubble edge.
        av_gap = av_sz + 10 if av_sz > 0 else 0
        side_margin = 0
        _arrow_shaft = 18
        # Reserve enough lane so long bubbles never visually clip into arrow strokes.
        _arrow_gutter = _arrow_shaft * 2 + 10
        # In reorder mode, carve out a dedicated handle lane on the right edge.
        # This shifts right-side bubbles+avatars left and prevents any overlap with arrows.
        reorder_lane_w = 44 if reorder_mode else 0
        bubble_lane_l = safe_l + side_margin
        bubble_lane_r = safe_r - side_margin - timing_lane_w - reorder_lane_w
        bubble_lane_w = max(120, bubble_lane_r - bubble_lane_l)
        side_gutter = av_gap if rs.show_avatars else 0
        bubble_lane_max = max(120, bubble_lane_w - side_gutter - 10)
        max_bw = min(bubble_lane_max, int((bubble_lane_w - 6) * max(0.98, float(rs.max_bubble_width_pct))))
        # Hard content rails (invisible red lines): keep speaker name + bubble inside these bounds.
        # This prevents long left-side messages from drifting too far right toward the arrow/avatar lane.
        content_l = safe_l + (av_sz + 8 if rs.show_avatars and av_sz > 0 else 0)
        content_r = bubble_lane_r - (av_sz + 10 if rs.show_avatars and av_sz > 0 else _arrow_gutter)
        if content_r <= content_l + 80:
            content_l = bubble_lane_l
            content_r = bubble_lane_r - _arrow_gutter

        # Choose a visible message window that fits the available height.
        max_idx = min(upto_index + 1, len(self.proj.messages))
        if max_idx <= 0:
            return img
        scene_start_idx = 0
        for j in range(max_idx - 1, -1, -1):
            m_j = self.proj.messages[j]
            # Treat both explicit scene roots and non-chat scene type markers
            # (title/quote/narrator) as hard scene boundaries, matching the
            # scene-marker logic used in play mode.
            if bool(getattr(m_j, "is_scene_root", False)) or getattr(m_j, "scene_type", "chat") in ("title", "quote", "narrator"):
                scene_start_idx = j
                break
        local_total = max_idx - scene_start_idx
        if local_total <= 0:
            return img
        self._last_window_total = local_total

        viewport_h = max(1, safe_b - safe_t)
        self._last_viewport_h = float(viewport_h)
        gap = rs.msg_spacing
        est_heights: List[int] = []
        for j in range(scene_start_idx, max_idx):
            item_h = self._estimate_message_height(
                draw, self.proj.messages[j], font_msg, font_lbl,
                rs, safe_w, max_bw, av_sz, av_gap,
            )
            est_heights.append(item_h)

        # ── Top-anchored scroll ─────────────────────────────────────────
        # Virtual layout: all max_idx messages stacked top-to-bottom with gap.
        # At scroll_steps=0 the first message starts at safe_t.
        # Increasing scroll shifts content upward to reveal later messages.
        total_content_h = sum(est_heights) + gap * max(0, local_total - 1)

        effective_steps = max(0, int(scroll_steps))

        # Pixel amount scrolled = height of the first effective_steps messages.
        scroll_px_offset = 0
        for j in range(0, min(local_total, effective_steps)):
            scroll_px_offset += est_heights[j] + gap

        # Cap to avoid scrolling past the last message.
        max_scroll_px = max(0, total_content_h - viewport_h)
        try:
            extra_scroll_px = max(0.0, float(scroll_px or 0.0))
        except Exception:
            extra_scroll_px = 0.0
        scroll_px_offset = int(min(float(scroll_px_offset) + extra_scroll_px, float(max_scroll_px)))

        # y_start: where message[0]'s top is drawn after scroll.
        y_start = safe_t - scroll_px_offset

        # Find first message that intersects the visible viewport.
        start_idx = 0
        y_probe = y_start
        while start_idx < local_total and (y_probe + est_heights[start_idx]) < safe_t:
            y_probe += est_heights[start_idx] + gap
            start_idx += 1
        if start_idx >= local_total:
            return img
        end_idx = local_total - 1

        self._last_window_start = scene_start_idx + start_idx
        self._last_window_end = scene_start_idx + end_idx
        self._last_total_h = float(total_content_h)
        self._last_max_scroll_px = float(max_scroll_px)
        self._last_scroll_px = float(scroll_px_offset)

        # Keep the right speaker avatar/bubble column stable across rows while timing is visible.
        right_lane_cluster_inset = 0
        if show_timing_controls and rs.show_avatars and av_sz > 0:
            max_stamp_label_w = 0
            ts_measure_font = self._get_font(max(11, rs.label_size - 1))
            for k in range(start_idx, end_idx + 1):
                mk = self.proj.messages[scene_start_idx + k]
                if bool(getattr(mk, "is_comment", False)) or getattr(mk, "scene_type", "chat") != "chat":
                    continue
                stamp = ""
                if getattr(mk, "chat_timestamp_sec", None) is not None:
                    try:
                        s = float(getattr(mk, "chat_timestamp_sec", 0.0))
                        st = int(max(0, round(s)))
                        stamp = f"{st // 60:02d}:{st % 60:02d}.{int((s - int(s)) * 10):d}"
                    except Exception:
                        stamp = ""
                else:
                    stamp = (getattr(mk, "chat_timestamp", None) or "").strip()
                if stamp:
                    try:
                        sw = int(draw.textlength(stamp, font=ts_measure_font))
                    except Exception:
                        sw = len(stamp) * 8
                    max_stamp_label_w = max(max_stamp_label_w, sw)

            ts_r_preview = 16
            ts_cx_preview = max(safe_l + 22, safe_r - reorder_lane_w - 20)
            timing_content_left = int(ts_cx_preview - ts_r_preview)
            if max_stamp_label_w > 0:
                timing_content_left = int(ts_cx_preview - ts_r_preview - max_stamp_label_w - 14)
            desired_cluster_right_edge = int(timing_content_left - 16)
            right_lane_cluster_inset = max(0, int(bubble_lane_r - desired_cluster_right_edge))

        # Advance y to the first visible message.
        y = y_probe

        for i in range(start_idx, end_idx + 1):
            if y > safe_b:
                break
            real_i = scene_start_idx + i
            m = self.proj.messages[real_i]

            # Root markers for chat scenes are structural and should not render as bubbles.
            if bool(getattr(m, "is_scene_root", False)) and getattr(m, "scene_type", "chat") == "chat":
                continue

            # ── Title card scene ──────────────────────────────────────────
            if m.scene_type == "title":
                bg_mode = (getattr(m, "scene_bg_mode", "gradient") or "gradient").lower()
                bg_col = _hex_to_rgb(m.scene_bg_hex) if m.scene_bg_hex else None
                txt_col = _hex_to_rgb(m.scene_text_hex) if m.scene_text_hex else (232, 233, 238)
                fsize = int(m.scene_font_size or (rs.font_size + 10))
                # Match title editor default typography when no explicit scene font is set.
                tfont = self._get_font(fsize, family=m.scene_font_family or "Roboto-Light")
                # TypeStory-style title: fill entire canvas, then draw centred headline.
                if bg_mode == "image":
                    bg_im = self._get_scene_bg_image(
                        getattr(m, "scene_bg_image_path", None) or "",
                        max(1, w),
                        max(1, h),
                        anchor=(getattr(m, "scene_bg_image_anchor", "full") or "full"),
                        fill_rgb=(bg_col or (18, 18, 20)),
                    )
                    if bg_im is not None:
                        img.paste(bg_im, (0, 0, w, h))
                    else:
                        draw.rectangle([0, 0, w, h], fill=(bg_col or (44, 134, 239)))
                elif bg_mode == "color":
                    draw.rectangle([0, 0, w, h], fill=(bg_col or (44, 134, 239)))
                else:  # gradient
                    r0, g0, b0 = bg_col or (44, 134, 239)
                    # Keep gradient math in sync with title editor preview texture.
                    r1 = max(0, min(255, int(r0 * 0.62 + 116)))
                    g1 = max(0, min(255, int(g0 * 0.52 + 36)))
                    b1 = max(0, min(255, int(b0 * 0.75 + 126)))
                    # Fast vectorised gradient — replaces the O(w*h) pixel loop.
                    try:
                        import numpy as _np
                        _gx = _np.linspace(0.0, 0.74, w, dtype=_np.float32)
                        _gy = _np.linspace(0.0, 0.26, h, dtype=_np.float32)
                        _t = _np.clip(_gx[_np.newaxis, :] + _gy[:, _np.newaxis], 0.0, 1.0)
                        _r = _np.clip((1 - _t) * r0 + _t * r1, 0, 255).astype(_np.uint8)
                        _g = _np.clip((1 - _t) * g0 + _t * g1, 0, 255).astype(_np.uint8)
                        _b = _np.clip((1 - _t) * b0 + _t * b1, 0, 255).astype(_np.uint8)
                        grad = Image.fromarray(
                            _np.stack([_r, _g, _b], axis=2), "RGB"
                        )
                    except Exception:
                        # Fallback for environments without numpy
                        grad = Image.new("RGB", (w, h))
                        px = grad.load()
                        for gy in range(h):
                            for gx in range(w):
                                t = min(1.0, max(0.0, 0.74 * gx / w + 0.26 * gy / h))
                                px[gx, gy] = (
                                    int((1 - t) * r0 + t * r1),
                                    int((1 - t) * g0 + t * g1),
                                    int((1 - t) * b0 + t * b1),
                                )
                    img.paste(grad, (0, 0))
                try:
                    lines = self._wrap_text(draw, m.text, tfont, safe_w - 32)
                    asc, desc = tfont.getmetrics()
                    lh = asc + desc
                    total_h = len(lines) * lh
                    valign = (getattr(m, "scene_valign", "center") or "center").lower()
                    avail_h = max(0, safe_b - safe_t - total_h)
                    if valign == "top":
                        ty = safe_t + int(max(24, (safe_b - safe_t) * 0.16))
                    elif valign == "bottom":
                        ty = safe_b - total_h - int(max(24, (safe_b - safe_t) * 0.16))
                    else:
                        # Centre text in the full visible safe area, not in a partial title_h band.
                        ty = safe_t + (avail_h // 2)
                    shadow_style = (getattr(m, "scene_title_shadow_style", "soft") or "soft").lower()
                    for ln in lines:
                        try:
                            tw = int(draw.textlength(ln, font=tfont))
                        except Exception:
                            tw = len(ln) * 14
                        align = getattr(m, 'scene_align', 'center')
                        if align == 'left':
                            tx = safe_l + 16
                        elif align == 'right':
                            tx = safe_r - tw - 16
                        else:
                            tx = (w - tw) // 2
                        if shadow_style == "soft":
                            draw.text((int(tx), int(ty + 3)), ln, fill=(16, 18, 22), font=tfont)
                        elif shadow_style == "strong":
                            draw.text((int(tx), int(ty + 2)), ln, fill=(8, 10, 14), font=tfont)
                            draw.text((int(tx + 1), int(ty + 4)), ln, fill=(8, 10, 14), font=tfont)
                        draw.text((int(tx), int(ty)), ln, fill=txt_col, font=tfont)
                        ty += lh
                except Exception:
                    try:
                        tw = int(draw.textlength(m.text, font=tfont))
                    except Exception:
                        tw = len(m.text) * 14
                    shadow_style = (getattr(m, "scene_title_shadow_style", "soft") or "soft").lower()
                    tx = (w - tw) // 2
                    ty = safe_t + (safe_b - safe_t - fsize) // 2
                    if shadow_style == "soft":
                        draw.text((tx, ty + 3), m.text, fill=(16, 18, 22), font=tfont)
                    elif shadow_style == "strong":
                        draw.text((tx, ty + 2), m.text, fill=(8, 10, 14), font=tfont)
                        draw.text((tx + 1, ty + 4), m.text, fill=(8, 10, 14), font=tfont)
                    draw.text(((w - tw) // 2, safe_t + (safe_b - safe_t - fsize) // 2),
                              m.text, fill=txt_col, font=tfont)
                self._mark_region(0, 0, w, h, "scene", real_i)
                y += (safe_b - safe_t) + rs.msg_spacing
                continue

            # ── Quote / monologue scene ───────────────────────────────────
            if m.scene_type == "quote":
                bg_col = _hex_to_rgb(m.scene_bg_hex) if m.scene_bg_hex else None
                txt_col = _hex_to_rgb(m.scene_text_hex) if m.scene_text_hex else (220, 220, 220)
                fsize = (m.scene_font_size or rs.font_size) + 4
                qfont = self._get_font(fsize, family=m.scene_font_family or rs.font_family)
                quote_text = f'"{m.text}"'
                lines = self._wrap_text(draw, quote_text, qfont, safe_w - 48)
                try:
                    asc, desc = qfont.getmetrics()
                    lh = asc + desc
                except Exception:
                    lh = fsize + 8
                qh = len(lines) * lh + 2 * rs.v_padding + 8
                if bg_col is not None:
                    draw.rounded_rectangle([safe_l + 12, y, safe_r - 12, y + qh], 12, fill=bg_col)
                align = getattr(m, 'scene_align', 'center')
                ty = y + rs.v_padding
                for ln in lines:
                    try:
                        tw = int(draw.textlength(ln, font=qfont))
                    except Exception:
                        tw = len(ln) * 10
                    if align == 'left':
                        tx = safe_l + 24
                    elif align == 'right':
                        tx = safe_r - tw - 24
                    else:
                        tx = (w - tw) // 2
                    draw.text((tx, ty), ln, fill=txt_col, font=qfont)
                    ty += lh + 4
                if m.speaker:
                    attr_font = self._get_font(rs.label_size)
                    attr_speaker = (getattr(self.proj.get_character(m.speaker), "alias", None) or m.speaker)
                    attr = f"— {attr_speaker}"
                    try:
                        aw = int(draw.textlength(attr, font=attr_font))
                    except Exception:
                        aw = len(attr) * 9
                    draw.text((safe_r - aw - 12, ty + 4), attr, fill=(150, 150, 150), font=attr_font)
                    qh += rs.label_size + 12
                self._mark_region(safe_l + 12, y, safe_r - 12, y + qh, "scene", real_i)
                y += qh + rs.msg_spacing
                continue

            ch = self.proj.get_character(m.speaker)
            ch_idx = next((idx for idx, c in enumerate(self.proj.characters)
                           if c.name == m.speaker), -1)
            msg_side = getattr(m, "bubble_side", None)
            is_right = (msg_side == "right") if msg_side in ("left", "right") else ((ch.side == "right") if ch else False)
            show_side_avatar = bool(getattr(rs, "show_right_avatar", getattr(rs, "show_avatars", True))) if is_right else bool(getattr(rs, "show_left_avatar", getattr(rs, "show_avatars", True)))
            show_side_name = bool(getattr(rs, "show_right_name", True)) if is_right else bool(getattr(rs, "show_left_name", True))
            side_default_bubble = _hex_to_rgb(default_bubble_for_side("right" if is_right else "left"))
            side_default_text = _hex_to_rgb(default_text_for_side("right" if is_right else "left"))

            use_side_palette = False
            if ch and not getattr(m, "chat_bubble_hex", None):
                ch_bubble = (getattr(ch, "bubble_hex", "") or "").strip().lower()
                ch_font = (getattr(ch, "font_hex", "") or "").strip().lower()
                if ch_bubble in {
                    "",
                    "#dcf8c6",
                    "#e9e9eb",
                    "#d6d8dd",
                    "#565a61",
                    "#e7a243",
                    "#7d8085",
                    "#ff9500",
                }:
                    use_side_palette = True
                if ch_font in {"", "#000000", "#ffffff"}:
                    use_side_palette = True

            bubble_col = _hex_to_rgb(m.chat_bubble_hex) if getattr(m, "chat_bubble_hex", None) else (
                side_default_bubble if use_side_palette else (_hex_to_rgb(ch.bubble_hex) if ch else side_default_bubble)
            )
            font_col = _hex_to_rgb(m.chat_text_hex) if getattr(m, "chat_text_hex", None) else (
                side_default_text if use_side_palette else (_hex_to_rgb(ch.font_hex) if ch else side_default_text)
            )
            # Avatar/chip color should represent the actor identity, not per-message overrides.
            avatar_bubble_col = _hex_to_rgb(ch.bubble_hex) if (ch and getattr(ch, "bubble_hex", None)) else side_default_bubble
            has_audio = bool(getattr(m, "audio_path", None) and os.path.isfile(m.audio_path))
            has_media = bool(getattr(m, "media_path", None) and os.path.isfile(m.media_path))
            display_text = m.text if (m.text or "").strip() else ("Voice note" if has_audio else "")
            is_media_only = bool(has_media and (not has_audio) and not (m.text or "").strip())
            timestamp = (getattr(m, "chat_timestamp", None) or "").strip()
            msg_font = self._get_font(
                int(m.chat_font_size) if getattr(m, "chat_font_size", None) else rs.font_size,
                family=getattr(m, "chat_font_family", None) or rs.font_family,
            )

            # Typestory-style system announcement / centered system media.
            if m.is_comment and (m.speaker or "").strip().lower() == "system":
                has_media = bool(getattr(m, "media_path", None) and os.path.isfile(m.media_path))
                ann_text = (m.text or "").strip()

                if has_media:
                    media_top = y + 6
                    media_h = int(max(120, min(260, (safe_b - safe_t) * 0.32)))
                    media_w = int(max(140, min(safe_w - 36, media_h * 1.24)))
                    media_x1 = int((w - media_w) // 2)
                    media_x2 = media_x1 + media_w
                    media_y1 = media_top
                    media_y2 = media_top + media_h
                    try:
                        simg = Image.open(m.media_path)
                        if getattr(simg, "is_animated", False):
                            try:
                                simg.seek(self._gif_frame_index(m.media_path))
                            except Exception:
                                pass
                        simg = simg.convert("RGB")
                        tw, th = simg.size
                        if tw > 0 and th > 0:
                            target_ratio = media_w / float(media_h)
                            src_ratio = tw / float(th)
                            if src_ratio > target_ratio:
                                crop_w = int(th * target_ratio)
                                crop_h = th
                                cx = (tw - crop_w) // 2
                                cy = 0
                            else:
                                crop_w = tw
                                crop_h = int(tw / target_ratio)
                                cx = 0
                                cy = (th - crop_h) // 2
                            simg = simg.crop((cx, cy, cx + crop_w, cy + crop_h)).resize((media_w, media_h), Image.LANCZOS)
                        img.paste(simg, (media_x1, media_y1))
                    except Exception:
                        draw.rounded_rectangle([media_x1, media_y1, media_x2, media_y2], 10, fill=(56, 56, 60))
                    used_h = media_h + 10

                    if ann_text:
                        ann_font = self._get_font(
                            m.scene_font_size or max(rs.label_size + 2, rs.font_size - 2),
                            family=m.scene_font_family or rs.font_family,
                        )
                        lines = self._wrap_text(draw, ann_text, ann_font, safe_w - 80)
                        try:
                            asc, desc = ann_font.getmetrics()
                            line_h = asc + desc
                        except Exception:
                            line_h = max(rs.label_size + 4, rs.font_size)
                        ann_color = _hex_to_rgb(m.scene_text_hex) if m.scene_text_hex else (145, 145, 150)
                        ty = media_y2 + 8
                        for ln in lines:
                            try:
                                tw = int(draw.textlength(ln, font=ann_font))
                            except Exception:
                                tw = len(ln) * 10
                            tx = (w - tw) // 2
                            draw.text((tx, ty), ln, fill=ann_color, font=ann_font)
                            ty += line_h + 6
                        used_h = (ty - y)

                    self._mark_region(media_x1, media_y1, media_x2, media_y2, "bubble", real_i)
                    y += int(used_h) + rs.msg_spacing + 8
                    continue

                ann_font = self._get_font(
                    m.scene_font_size or max(rs.label_size + 2, rs.font_size - 2),
                    family=m.scene_font_family or rs.font_family,
                )
                lines = self._wrap_text(draw, ann_text, ann_font, safe_w - 80)
                try:
                    asc, desc = ann_font.getmetrics()
                    line_h = asc + desc
                except Exception:
                    line_h = max(rs.label_size + 4, rs.font_size)
                text_h = len(lines) * line_h + max(0, len(lines) - 1) * 6
                ty = y + 6
                ann_color = _hex_to_rgb(m.scene_text_hex) if m.scene_text_hex else (145, 145, 150)
                for ln in lines:
                    try:
                        tw = int(draw.textlength(ln, font=ann_font))
                    except Exception:
                        tw = len(ln) * 10
                    tx = (w - tw) // 2
                    draw.text((tx, ty), ln, fill=ann_color, font=ann_font)
                    ty += line_h + 6
                self._mark_region(safe_l, y, safe_r, y + text_h + 12, "scene", real_i)
                y += text_h + rs.msg_spacing + 12
                continue

            # Comment chip
            if m.is_comment:
                chip_bg = _hex_to_rgb(m.scene_bg_hex) if m.scene_bg_hex else (50, 50, 50)
                chip_fg = _hex_to_rgb(m.scene_text_hex) if m.scene_text_hex else (210, 210, 210)
                chip_font = self._get_font(
                    m.scene_font_size or rs.label_size,
                    family=m.scene_font_family or rs.font_family
                )
                try:
                    tw = int(draw.textlength(m.text, font=chip_font))
                except Exception:
                    tw = len(m.text) * 9
                chip_fsize = m.scene_font_size or rs.label_size
                chip_w, chip_h = tw + 20, chip_fsize + 14
                draw.rounded_rectangle(
                    [safe_l, y, safe_l + chip_w, y + chip_h], 10, fill=chip_bg
                )
                draw.text((safe_l + 10, y + 7), m.text, fill=chip_fg, font=chip_font)
                self._mark_region(safe_l, y, safe_l + chip_w, y + chip_h, "scene", real_i)
                y += chip_h + rs.msg_spacing
                continue

            side_gutter = av_gap if show_side_avatar else 0
            right_cluster_inset = right_lane_cluster_inset if (show_timing_controls and is_right and show_side_avatar and av_sz > 0) else 0
            text_max_w = max(80, max_bw - 2 * rs.h_padding)

            try:
                asc, desc = msg_font.getmetrics()
                line_h = asc + desc
            except Exception:
                line_h = (int(m.chat_font_size) if getattr(m, "chat_font_size", None) else rs.font_size) + 4
            wrapped_lines = self._wrap_chat_tokens(draw, display_text, msg_font, text_max_w, line_h)

            txt_w = max(self._measure_chat_tokens_width(draw, ln_tokens, msg_font, line_h) for ln_tokens in wrapped_lines)

            min_inner_w = 0
            if has_media:
                min_inner_w = max(min_inner_w, 140)
            if has_audio:
                min_inner_w = max(min_inner_w, 140)
            min_bubble_w = (2 * rs.h_padding) + min_inner_w if min_inner_w > 0 else (2 * rs.h_padding)

            bw = min(max_bw, max(txt_w + 2 * rs.h_padding, min_bubble_w))
            bh = len(wrapped_lines) * line_h + max(0, len(wrapped_lines) - 1) * 4 + 2 * rs.v_padding

            if is_right:
                x2 = bubble_lane_r - side_gutter - right_cluster_inset
                x1 = x2 - bw
                x1 = max(x1, max(bubble_lane_l + _arrow_gutter, content_l))  # keep left gutter clear for arrow
            else:
                x1 = max(bubble_lane_l + side_gutter, content_l)
                x2 = x1 + bw
                x2 = min(x2, min(bubble_lane_r - _arrow_gutter, content_r))  # keep right gutter + hard margin

            x1 = max(x1, bubble_lane_l)
            x2 = min(x2, bubble_lane_r)

            # Re-wrap against the FINAL clamped bubble width so text cannot spill past edges.
            inner_w = max(40, int(x2 - x1) - 2 * rs.h_padding)
            wrapped_lines = self._wrap_chat_tokens(draw, display_text, msg_font, inner_w, line_h)
            txt_w = max(self._measure_chat_tokens_width(draw, ln_tokens, msg_font, line_h) for ln_tokens in wrapped_lines)

            bw_target = min(max_bw, max(txt_w + 2 * rs.h_padding, min_bubble_w))
            if is_right:
                # Keep right edge anchored; adjust left edge only.
                x1 = max(x2 - bw_target, max(bubble_lane_l + _arrow_gutter, content_l))
            else:
                # Keep left edge anchored; adjust right edge only.
                x2 = min(x1 + bw_target, min(bubble_lane_r - _arrow_gutter, content_r))

            bw = int(max(1, x2 - x1))
            bh = len(wrapped_lines) * line_h + max(0, len(wrapped_lines) - 1) * 4 + 2 * rs.v_padding

            # Timestamps are only visible while timing controls are active.

            # Speaker name label above bubble
            if show_side_name:
                lbl_text = (getattr(ch, "alias", None) or m.speaker)
                label_font_size = max(10, int(getattr(rs, "label_size", 22) or 22))
                label_font = self._get_font(label_font_size)
                try:
                    lw = int(draw.textlength(lbl_text, font=label_font))
                except Exception:
                    lw = len(lbl_text) * 9
                lbl_h = label_font_size + 2
                lbl_x = (x2 - lw - 4) if is_right else x1
                lbl_y = max(0, y)
                draw.text((lbl_x, lbl_y), lbl_text, fill=(160, 160, 160), font=label_font)
                # Register name label as tappable → opens message edit
                self._mark_region(max(0, x1), max(0, lbl_y), min(img.width, x2), min(img.height, lbl_y + lbl_h), "bubble", real_i)
                y += lbl_h + 6  # extra gap between name and bubble top

            # ── Media thumbnail (image attachment) ───────────────────────
            media_box_h = 0
            if has_media:
                # Dynamically size the media box based on image aspect ratio
                try:
                    mw, mh = self._get_media_size(m.media_path) or (1, 1)
                    box_w = max(1, bw if is_media_only else (bw - 2 * rs.h_padding))
                    aspect = mw / float(mh)
                    # Prefer a max box height, but allow landscape/portrait fit
                    max_h = 180
                    min_h = 96
                    if aspect >= 1.0:
                        # Landscape: fit width, limit height
                        media_box_w = box_w
                        media_box_h = max(min_h, min(int(box_w / aspect), max_h))
                    else:
                        # Portrait: fit height, limit width
                        media_box_h = max(min_h, min(max_h, int(box_w * aspect)))
                        media_box_w = min(box_w, int(media_box_h * aspect))
                        if media_box_w < 80:
                            media_box_w = box_w
                            media_box_h = max(min_h, min(int(box_w / aspect), max_h))
                except Exception:
                    media_box_w = max(1, bw if is_media_only else (bw - 2 * rs.h_padding))
                    media_box_h = 180
                if is_media_only:
                    bh = int(media_box_h)
                else:
                    bh += media_box_h + rs.v_padding
            if has_audio:
                bh += 42 + rs.v_padding

            bubble_radius = int(getattr(m, "chat_corner_radius", 0) or rs.corner_radius)
            if not is_media_only:
                draw.rounded_rectangle([x1, y, x2, y + bh], radius=bubble_radius, fill=bubble_col)

            tx = int(x1 if is_media_only else (x1 + rs.h_padding))
            ty = int(y if is_media_only else (y + rs.v_padding))

            # Paste media thumbnail first
            if has_media:
                try:
                    # Use calculated media_box_w/h
                    mimg = self._get_media_thumb(m.media_path, int(media_box_w), int(media_box_h))
                    if mimg is None:
                        raise RuntimeError("media thumb unavailable")
                    mask = Image.new("L", (int(media_box_w), int(media_box_h)), 0)
                    ImageDraw.Draw(mask).rounded_rectangle([0, 0, int(media_box_w), int(media_box_h)], radius=12, fill=255)
                    img.paste(mimg, (int(tx), int(ty)), mask)
                    ty += int(media_box_h + (0 if is_media_only else rs.v_padding))
                except Exception:
                    pass

            if has_audio:
                audio_h = 36
                audio_w = max(140, bw - 2 * rs.h_padding)
                chip_bg = (255, 255, 255, 36) if sum(bubble_col) < 420 else (0, 0, 0, 42)
                chip_x1 = tx
                chip_y1 = ty
                chip_x2 = min(x2 - rs.h_padding, chip_x1 + audio_w)
                chip_y2 = chip_y1 + audio_h
                draw.rounded_rectangle([chip_x1, chip_y1, chip_x2, chip_y2], radius=12, fill=chip_bg)

                px = chip_x1 + 10
                py = chip_y1 + 9
                draw.polygon([(px, py), (px, py + 18), (px + 14, py + 9)], fill=font_col)

                bar_x = px + 26
                mid_y = chip_y1 + audio_h // 2
                for idx_bar, bar_h in enumerate((8, 13, 18, 10, 16, 11, 7)):
                    bx = bar_x + idx_bar * 8
                    draw.line([(bx, mid_y - bar_h // 2), (bx, mid_y + bar_h // 2)], fill=font_col, width=2)

                dur = probe_audio_duration(getattr(m, "audio_path", None))
                dur_text = f"{int(dur // 60)}:{int(dur % 60):02d}" if dur > 0 else "voice"
                try:
                    dw = int(draw.textlength(dur_text, font=font_lbl))
                except Exception:
                    dw = len(dur_text) * 8
                draw.text((chip_x2 - dw - 10, chip_y1 + 9), dur_text, fill=font_col, font=font_lbl)
                ty += audio_h + rs.v_padding

            if (display_text or "").strip():
                for ln_tokens in wrapped_lines:
                    used_h = self._draw_chat_token_line(img, draw, ln_tokens, tx, ty, msg_font, font_col, line_h)
                    ty += used_h + 4

            # Mark bubble region for tap-to-edit.
            self._mark_region(max(0, x1), max(0, y), min(img.width, x2), min(img.height, y + bh), "bubble", real_i)

            # ── Delivery status (right-aligned bubbles only) ───────────────
            extra_h = 0
            ds = getattr(m, "delivery_status", "")
            if ds:
                ds_color = (90, 180, 255) if ds == "read" else (160, 160, 160)
                tick_count = 1 if ds == "sent" else 2
                # Draw checkmarks as PIL lines (no font dependency)
                tick_w, tick_h = 10, 7
                gap = 5
                total_tick_w = tick_count * tick_w + (tick_count - 1) * gap
                tx0 = x2 - total_tick_w - 6 if is_right else x1 + 6
                ty0 = y + bh + 5
                for t in range(tick_count):
                    ox = tx0 + t * (tick_w + gap)
                    # Short downstroke then upstroke (✓ shape)
                    draw.line([(ox, ty0 + tick_h // 2),
                               (ox + tick_w // 3, ty0 + tick_h),
                               (ox + tick_w, ty0)],
                              fill=ds_color, width=2)
                extra_h = tick_h + 8

            # ── Reactions ─────────────────────────────────────────────────
            reactions = getattr(m, "reactions", [])
            reaction_h = 0
            if reactions:
                chip_h = max(40, rs.label_size + 18)
                px_size = chip_h - 6           # emoji pixel size
                ry = y + bh + extra_h + 4
                spacing = 4
                cur_x = x1 + 4
                rx_font = self._get_emoji_font(max(14, rs.label_size))
                for emoji in reactions[:6]:    # cap at 6
                    emoji_img = load_emoji_png(emoji, size=px_size)
                    chip_w = px_size + 10
                    if emoji_img:
                        img.paste(emoji_img, (cur_x + 3, ry + 3), emoji_img)
                    else:
                        draw.text((cur_x + 3, ry + 3), emoji,
                                  fill=(255, 255, 255), font=rx_font)
                    cur_x += chip_w + spacing
                reaction_h = chip_h + 6
                extra_h += reaction_h

            arrow_center_x = None
            arrow_center_y = None
            arrow_half = 22
            if (not play_mode) and (not m.is_comment) and m.scene_type == "chat":
                arrow_center_y = y + bh // 2
                # Keep arrows locked to avatar lanes so they remain visually aligned.
                shaft = _arrow_shaft
                ts_r = 16
                stamp_label = ""
                stamp_label_w = 0
                if show_timing_controls:
                    if getattr(m, "chat_timestamp_sec", None) is not None:
                        try:
                            ts_seconds = float(getattr(m, "chat_timestamp_sec", 0.0))
                            ts_total = int(max(0, round(ts_seconds)))
                            stamp_label = f"{ts_total // 60:02d}:{ts_total % 60:02d}.{int((ts_seconds - int(ts_seconds)) * 10):d}"
                        except Exception:
                            stamp_label = ""
                    elif timestamp:
                        stamp_label = str(timestamp)
                    if stamp_label:
                        try:
                            stamp_label_w = int(draw.textlength(stamp_label, font=font_lbl))
                        except Exception:
                            stamp_label_w = len(stamp_label) * 8
                if is_right:
                    if show_side_avatar and av_sz > 0:
                        arrow_center_x = safe_l + (av_sz // 2)
                    else:
                        arrow_center_x = safe_l + shaft + 6
                else:
                    if show_side_avatar and av_sz > 0:
                        arrow_center_x = bubble_lane_r - right_lane_cluster_inset - (av_sz // 2)
                    else:
                        reserve_for_time = 104 if show_timing_controls else 16
                        if show_timing_controls and stamp_label_w > 0:
                            reserve_for_time = max(reserve_for_time, stamp_label_w + ts_r + shaft + 44)
                        arrow_center_x = safe_r - reserve_for_time - shaft
                if show_timing_controls and not is_right and arrow_center_x is not None:
                    # Keep a hard minimum gap between arrow lane and timestamp lane/text.
                    ts_cx_preview = max(safe_l + 22, safe_r - reorder_lane_w - 20)
                    ts_left_edge = int(ts_cx_preview - ts_r)
                    if stamp_label_w > 0:
                        ts_left_edge = int(ts_cx_preview - ts_r - stamp_label_w - 14)
                    min_gap = 22
                    arrow_right_edge = int(arrow_center_x + shaft)
                    max_arrow_right = int(ts_left_edge - min_gap)
                    if arrow_right_edge > max_arrow_right:
                        arrow_center_x = int(max(safe_l + shaft + 4, arrow_center_x - (arrow_right_edge - max_arrow_right)))
                arrow_color = _BF_ACCENT_RGB
                wing = 8
                if is_right:
                    draw.line([(arrow_center_x - shaft, arrow_center_y), (arrow_center_x + shaft - 6, arrow_center_y)], fill=arrow_color, width=3)
                    draw.line([(arrow_center_x - shaft, arrow_center_y), (arrow_center_x - shaft + wing, arrow_center_y - wing)], fill=arrow_color, width=3)
                    draw.line([(arrow_center_x - shaft, arrow_center_y), (arrow_center_x - shaft + wing, arrow_center_y + wing)], fill=arrow_color, width=3)
                else:
                    draw.line([(arrow_center_x - shaft + 6, arrow_center_y), (arrow_center_x + shaft, arrow_center_y)], fill=arrow_color, width=3)
                    draw.line([(arrow_center_x + shaft, arrow_center_y), (arrow_center_x + shaft - wing, arrow_center_y - wing)], fill=arrow_color, width=3)
                    draw.line([(arrow_center_x + shaft, arrow_center_y), (arrow_center_x + shaft - wing, arrow_center_y + wing)], fill=arrow_color, width=3)
                self._mark_region(
                    max(0, arrow_center_x - arrow_half),
                    max(0, arrow_center_y - arrow_half),
                    min(img.width, arrow_center_x + arrow_half),
                    min(img.height, arrow_center_y + arrow_half),
                    "side_toggle",
                    real_i,
                )

                if reorder_mode:
                    # Handle always occupies the center of the reserved reorder lane.
                    # bubble_lane_r already ends before the lane, so no overlap is possible.
                    handle_cx = bubble_lane_r + reorder_lane_w // 2
                    handle_cy = y + bh // 2
                    handle_col = (102, 104, 112)
                    line_len = 18
                    gap = 6
                    for off in (-gap, 0, gap):
                        yy = handle_cy + off
                        draw.line(
                            [(handle_cx - line_len // 2, yy), (handle_cx + line_len // 2, yy)],
                            fill=handle_col,
                            width=3,
                        )
                    self._mark_region(
                        max(0, handle_cx - 16),
                        max(0, handle_cy - 16),
                        min(img.width, handle_cx + 16),
                        min(img.height, handle_cy + 16),
                        "drag_handle",
                        real_i,
                    )

                if show_timing_controls:
                    # Timestamp controls live in a stable lane on the right.
                    # Keep ordering consistent on both sides: label then icon.
                    icon_pad = 4
                    ts_cx = max(safe_l + 22, safe_r - reorder_lane_w - 20)
                    ts_cy = y + bh // 2
                    ts_col = _BF_ACCENT_RGB
                    ts_label = stamp_label

                    if ts_label:
                        ts_font = self._get_font(max(11, rs.label_size - 1))
                        try:
                            ts_w = int(draw.textlength(ts_label, font=ts_font))
                        except Exception:
                            ts_w = len(ts_label) * 8
                        ts_x = max(safe_l + 6, ts_cx - ts_r - ts_w - 14)
                        draw.text((ts_x, ts_cy - 8), ts_label, fill=ts_col, font=ts_font)
                    # Supersample timestamp icon then downsample for smoother edges.
                    _ov = 4
                    icon_w = ts_r * 2 + icon_pad * 2
                    big_w = icon_w * _ov
                    icon_big = Image.new("RGBA", (big_w, big_w), (0, 0, 0, 0))
                    icon_draw = ImageDraw.Draw(icon_big)
                    cx_big = big_w // 2
                    cy_big = big_w // 2
                    r_big = ts_r * _ov
                    stroke_big = max(1, 3 * _ov)
                    ts_rgba = (int(ts_col[0]), int(ts_col[1]), int(ts_col[2]), 255)

                    icon_draw.ellipse(
                        [cx_big - r_big, cy_big - r_big, cx_big + r_big, cy_big + r_big],
                        outline=ts_rgba,
                        width=stroke_big,
                    )
                    icon_draw.line([(cx_big, cy_big - 8 * _ov), (cx_big, cy_big - 1 * _ov)], fill=ts_rgba, width=stroke_big)
                    icon_draw.line([(cx_big, cy_big), (cx_big + 5 * _ov, cy_big + 2 * _ov)], fill=ts_rgba, width=max(1, 2 * _ov))
                    icon_draw.line([(cx_big - 5 * _ov, cy_big - 18 * _ov), (cx_big + 5 * _ov, cy_big - 18 * _ov)], fill=ts_rgba, width=stroke_big)

                    icon_small = icon_big.resize((icon_w, icon_w), Image.LANCZOS)
                    icon_x = ts_cx - (icon_w // 2)
                    icon_y = ts_cy - (icon_w // 2)
                    try:
                        img.alpha_composite(icon_small, (icon_x, icon_y))
                    except Exception:
                        img.paste(icon_small, (icon_x, icon_y), icon_small)
                    self._mark_region(
                        max(0, ts_cx - 20),
                        max(0, ts_cy - 20),
                        min(img.width, ts_cx + 20),
                        min(img.height, ts_cy + 20),
                        "timestamp",
                        real_i,
                    )

            if show_side_avatar and av_sz > 0:
                # Always vertically centered on the bubble
                av_top = y + max(0, (bh - av_sz) // 2)
                av_img = self._get_avatar(ch) if ch else None
                # For right-side speakers, avatar lives just outside bubble_lane_r (in the side_gutter).
                # bubble_lane_r already accounts for reorder_lane_w, so avatar shifts left in reorder mode.
                right_avatar_edge = bubble_lane_r - right_cluster_inset
                av_left = (right_avatar_edge - av_sz) if is_right else safe_l
                if av_img:
                    av = av_img.copy().resize((av_sz, av_sz), Image.LANCZOS)
                    # Supersample mask for sharp anti-aliased circle edge
                    _ov = 4
                    _mask_big = Image.new("L", (av_sz * _ov, av_sz * _ov), 0)
                    ImageDraw.Draw(_mask_big).ellipse(
                        [0, 0, av_sz * _ov - 1, av_sz * _ov - 1], fill=255
                    )
                    mask = _mask_big.resize((av_sz, av_sz), Image.LANCZOS)
                    img.paste(av, (av_left, av_top), mask)
                elif ch:
                    ax, ay = av_left, av_top
                    # Supersample initial-letter avatar for sharp circle
                    _ov = 4
                    _av_big = Image.new("RGBA", (av_sz * _ov, av_sz * _ov), (0, 0, 0, 0))
                    ImageDraw.Draw(_av_big).ellipse(
                        [0, 0, av_sz * _ov - 1, av_sz * _ov - 1],
                        fill=avatar_bubble_col + (255,)
                    )
                    _av_sm = _av_big.resize((av_sz, av_sz), Image.LANCZOS)
                    img.paste(_av_sm, (ax, ay), _av_sm)
                    init = ch.name[0].upper()
                    init_font, init_col = self._avatar_initial_style(rs, avatar_bubble_col)
                    self._draw_centered_avatar_initial(draw, av_left, av_top, av_sz, init, init_font, init_col)
                # Mark avatar region for tap-to-edit character.
                if ch_idx >= 0:
                    self._mark_region(max(0, av_left), max(0, av_top), min(img.width, av_left + av_sz), min(img.height, av_top + av_sz), "character", ch_idx)
                # Also register as msg_avatar (message index) for short-tap to open message edit
                self._mark_region(max(0, av_left), max(0, av_top), min(img.width, av_left + av_sz), min(img.height, av_top + av_sz), "msg_avatar", real_i)
                y += max(bh + extra_h, av_sz) + rs.msg_spacing
            else:
                y += bh + extra_h + rs.msg_spacing

        return img

    def render_all_frames(self, size: Optional[Tuple[int, int]] = None) -> List[Any]:
        """Return one PIL image per message (cumulative reveal)."""
        return [
            self.render_frame(i, size=size)
            for i in range(len(self.proj.messages))
        ]

    def _keyboard_overlay_assets(self, width: int, kb_h: int, style: str) -> Tuple[Any, Dict[str, Tuple[int, int, int, int]]]:
        style_norm = (str(style or "ios").strip().lower() or "ios")
        if style_norm not in ("ios", "android"):
            style_norm = "ios"
        key = (int(width), int(kb_h), style_norm)
        cached = self._keyboard_overlay_cache.get(key)
        if cached is not None:
            base, rects = cached
            return base.copy(), dict(rects)

        base = Image.new("RGBA", (int(width), int(kb_h)), (0, 0, 0, 0))
        draw = ImageDraw.Draw(base)

        if style_norm == "android":
            shell = (34, 37, 41, 230)
            key_bg = (58, 62, 67, 245)
            key_round = 3
        else:
            shell = (224, 228, 236, 236)
            key_bg = (251, 252, 255, 252)
            key_round = max(6, int(kb_h * 0.034))

        shell_r = max(10, int(kb_h * 0.08))
        draw.rounded_rectangle([0, 0, width, kb_h], radius=shell_r, fill=shell)

        pad_x = max(10, int(width * 0.028))
        pad_top = max(8, int(kb_h * 0.06))
        pad_bottom = max(8, int(kb_h * 0.07))
        gap = max(4, int(kb_h * 0.02))
        rows = [
            ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
            ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
            ["shift", "z", "x", "c", "v", "b", "n", "m", "backspace"],
            ["123", "space", "return"],
        ]
        row_units = [
            [1.0] * 10,
            [1.0] * 9,
            [1.45] + ([1.0] * 7) + [1.45],
            [1.6, 5.0, 1.9],
        ]

        avail_h = max(40, kb_h - pad_top - pad_bottom - (gap * 3))
        key_h = max(12, avail_h // 4)
        rects: Dict[str, Tuple[int, int, int, int]] = {}

        y = pad_top
        for r_i, row in enumerate(rows):
            units = row_units[r_i]
            total_units = max(1.0, float(sum(units)))
            avail_w = max(80, width - (2 * pad_x) - (gap * (len(row) - 1)))
            unit_w = float(avail_w) / total_units
            row_w = sum(int(round(u * unit_w)) for u in units) + gap * (len(row) - 1)
            x = pad_x + max(0, (avail_w - row_w) // 2)

            for item, u in zip(row, units):
                kw = max(12, int(round(u * unit_w)))
                x2 = x + kw
                y2 = y + key_h
                draw.rounded_rectangle([x, y, x2, y2], radius=key_round, fill=key_bg)
                rects[item] = (x, y, x2, y2)
                x = x2 + gap
            y += key_h + gap

        self._keyboard_overlay_cache[key] = (base.copy(), dict(rects))
        return base, rects

    @staticmethod
    def _keyboard_key_for_char(ch: str, intra: float = 1.0) -> str:
        if ch == " ":
            return "space"
        if ch in ("\n", "\r"):
            return "return"
        if ch == "\b":
            return "backspace"
        if ch.isalpha():
            if ch.isupper() and float(intra) < 0.35:
                return "shift"
            return ch.lower()
        if ch.isdigit() or ch in "!?.,:;@#%&*()[]{}<>/\\\"'+-=":
            return "123"
        return "123"

    def _keyboard_active_for_progress(self, msg_text: str, progress: float) -> Tuple[Optional[str], float]:
        chars = [c for c in str(msg_text or "") if c not in ("\n", "\r", "\t")]
        if not chars:
            return None, 0.0
        p = max(0.0, min(0.999, float(progress)))
        pos = p * float(len(chars))
        idx = max(0, min(len(chars) - 1, int(pos)))
        intra = pos - float(idx)
        key = self._keyboard_key_for_char(chars[idx], intra)
        if intra <= 0.4:
            strength = 1.0
        else:
            strength = max(0.0, 1.0 - ((intra - 0.4) / 0.6))
        return key, float(strength)

    def _draw_keyboard_overlay(self, img: Any, style: str, slide: float,
                               active_key: Optional[str], active_strength: float) -> Any:
        slide_t = max(0.0, min(1.0, float(slide)))
        if slide_t <= 0.001:
            return img

        w, h = img.size
        kb_h = max(140, int(h * 0.30))
        base, rects = self._keyboard_overlay_assets(w, kb_h, style)
        y = int(h - kb_h + round((1.0 - slide_t) * kb_h))

        out = img.convert("RGBA")
        out.paste(base, (0, y), base)

        key_name = (str(active_key or "").strip().lower() or None)
        if key_name and float(active_strength) > 0.0 and key_name in rects:
            x1, y1, x2, y2 = rects[key_name]
            pulse = max(0.0, min(1.0, float(active_strength)))
            inflate = int(round(2.0 * pulse))
            if (str(style or "ios").strip().lower() == "android"):
                fill = (255, 190, 108, int(140 + (90 * pulse)))
            else:
                fill = (255, 255, 255, int(120 + (95 * pulse)))
            draw = ImageDraw.Draw(out)
            draw.rounded_rectangle(
                [x1 - inflate, y + y1 - inflate, x2 + inflate, y + y2 + inflate],
                radius=max(3, int((y2 - y1) * 0.20)),
                fill=fill,
            )

        return out.convert("RGB")

    def render_frame_with_typing(
        self,
        upto_index: int,
        next_msg_index: int,
        dot_phase: float,       # 0.0 – 1.0 controls which dots are lit
        size: Optional[Tuple[int, int]] = None,
        play_mode: bool = False,
        show_keyboard: bool = False,
        keyboard_style: str = "ios",
        keyboard_progress: float = 0.0,
        keyboard_active_key: Optional[str] = None,
        keyboard_active_strength: float = 1.0,
        keyboard_slide: float = 1.0,
    ) -> Any:
        """Render a 'typing in progress' frame.

        Shows all messages up to (but not including) next_msg_index, then draws
        an animated three-dot typing bubble positioned right below the last bubble.
        dot_phase cycles 0→1 and controls which dot is brightest.
        """
        if next_msg_index >= len(self.proj.messages):
            return self.render_frame(upto_index, size=size, play_mode=play_mode)

        next_msg = self.proj.messages[next_msg_index]
        # Skip typing indicator for scene/title/quote cards and comments
        if next_msg.scene_type in ("title", "quote") or next_msg.is_comment:
            return self.render_frame(upto_index, size=size, play_mode=play_mode)

        rs = self.proj.settings
        target_scroll_px, _target_max_scroll_px, _viewport_h, _total_content_h = self.get_scroll_metrics()
        target_bubble = next(
            (region for region in self._hit_regions if region[4] == "bubble" and region[5] == next_msg_index),
            None,
        )
        if target_bubble is None:
            return self.render_frame(upto_index, size=size, play_mode=play_mode)

        base = self.render_frame(upto_index, size=size, scroll_px=target_scroll_px, play_mode=play_mode)
        w = base.width
        h = base.height

        ch = self.proj.get_character(next_msg.speaker)
        is_right = (ch.side == "right") if ch else False
        show_side_typing = bool(getattr(rs, "show_right_typing", True)) if is_right else bool(getattr(rs, "show_left_typing", True))
        if not show_side_typing:
            return self.render_frame(upto_index, size=size, scroll_px=target_scroll_px, play_mode=play_mode)
        show_side_name = bool(getattr(rs, "show_right_name", True)) if is_right else bool(getattr(rs, "show_left_name", True)
        )
        show_side_avatar = bool(getattr(rs, "show_right_avatar", getattr(rs, "show_avatars", True))) if is_right else bool(getattr(rs, "show_left_avatar", getattr(rs, "show_avatars", True)))
        bubble_col = _hex_to_rgb(ch.bubble_hex) if ch else (233, 233, 235)

        img = base.copy()
        draw = ImageDraw.Draw(img)

        inset = 16
        safe_l = inset
        safe_r = w - inset
        safe_b = h - inset
        av_sz = rs.avatar_size if show_side_avatar else 0
        av_gap = av_sz + 4 if av_sz > 0 else 0

        bubble_y1 = int(target_bubble[1])
        bubble_y2 = int(target_bubble[3])
        dot_bw = 72   # bubble width
        dot_bh = 36   # bubble height
        dot_corner = 12

        label_font_size = max(10, int(getattr(rs, "label_size", 22) or 22))
        label_font = self._get_font(label_font_size)
        lbl_h = label_font_size + 6
        by = max(inset, min(bubble_y1, safe_b - dot_bh - 4))
        lbl_y = max(inset, by - lbl_h - 2)

        if is_right:
            bx2 = min(safe_r - av_gap, int(target_bubble[2]))
            bx1 = bx2 - dot_bw
        else:
            bx1 = max(safe_l + av_gap, int(target_bubble[0]))
            bx2 = bx1 + dot_bw

        bx1 = max(safe_l, bx1)
        bx2 = min(safe_r, bx2)
        if bx2 - bx1 < dot_bw:
            if is_right:
                bx1 = max(safe_l, bx2 - dot_bw)
            else:
                bx2 = min(safe_r, bx1 + dot_bw)

        # Speaker label above typing bubble.
        if show_side_name:
            lbl_text = (getattr(ch, "alias", None) or next_msg.speaker)
            try:
                lw = int(draw.textlength(lbl_text, font=label_font))
            except Exception:
                lw = len(lbl_text) * 9
            lbl_x = (bx2 - lw - 2) if is_right else (bx1 + 6)
            draw.text((lbl_x, lbl_y), lbl_text, fill=(160, 160, 160), font=label_font)

        draw.rounded_rectangle([bx1, by, bx2, by + dot_bh], dot_corner, fill=bubble_col)

        # Avatar at bubble side (both left/right).
        if show_side_avatar and av_sz > 0 and ch:
            av_top = by + max(0, (bubble_y2 - bubble_y1 - av_sz) // 2)
            av_left = (safe_r - av_sz) if is_right else safe_l
            av_img = self._get_avatar(ch)
            if av_img:
                av = av_img.copy().resize((av_sz, av_sz), Image.LANCZOS)
                mask = Image.new("L", (av_sz, av_sz), 0)
                ImageDraw.Draw(mask).ellipse([0, 0, av_sz, av_sz], fill=255)
                img.paste(av, (av_left, av_top), mask)
            else:
                ax, ay = av_left, av_top
                draw.ellipse([ax, ay, ax + av_sz, ay + av_sz], fill=bubble_col)
                init = ch.name[0].upper()
                init_font, init_col = self._avatar_initial_style(rs, bubble_col)
                self._draw_centered_avatar_initial(draw, ax, ay, av_sz, init, init_font, init_col)

        # Three animated dots (staggered vertical bounce)
        dot_r_sm = 5
        centers_x = [bx1 + 16, bx1 + 36, bx1 + 56]
        cy = by + dot_bh // 2
        dot_fill = (245, 246, 248)

        for k, cx in enumerate(centers_x):
            phase_offset = k / 3.0
            wave = max(0.0, math.sin(math.pi * ((dot_phase - phase_offset) % 1.0)))
            y_off = int(round(4.0 * wave))
            draw.ellipse([cx - dot_r_sm, cy - dot_r_sm - y_off,
                          cx + dot_r_sm, cy + dot_r_sm - y_off],
                         fill=dot_fill)

        if bool(show_keyboard):
            txt = str(getattr(next_msg, "text", "") or "").strip()
            if txt:
                key_name = keyboard_active_key
                key_strength = float(keyboard_active_strength)
                if key_name is None:
                    key_name, key_strength = self._keyboard_active_for_progress(txt, keyboard_progress)
                img = self._draw_keyboard_overlay(
                    img,
                    style=keyboard_style,
                    slide=keyboard_slide,
                    active_key=key_name,
                    active_strength=key_strength,
                )

        return img


# ── MP4 export ────────────────────────────────────────────────────────────

def _organic_typing_duration(msg_text: str, msg_index: int,
                              base_duration: float) -> float:
    """Return a per-message typing duration that feels organic.

    Scales with word count (longer messages → longer typing) and adds a small
    deterministic jitter seeded on the message content so every message differs
    but the export is reproducible.
    """
    words = len(msg_text.split())
    # Base: 0.3s + 0.06s per word, capped at base_duration * 2
    length_based = min(0.3 + words * 0.06, base_duration * 2.0)
    # Blend toward the user-chosen base (so the slider still matters)
    blended = (length_based + base_duration) / 2.0
    # Deterministic jitter ±20% seeded on text content
    seed_val = hash(msg_text + str(msg_index)) & 0xFFFFFF
    jitter = (seed_val / 0xFFFFFF - 0.5) * 0.4  # range -0.2 … +0.2
    return max(0.2, blended * (1.0 + jitter))


def probe_audio_duration(path: Optional[str]) -> float:
    """Best-effort audio duration probe for common local files."""
    if not path or not os.path.isfile(path):
        return 0.0

    # Cache by file stat so repeated preview renders don't keep re-probing.
    # This path runs inside render_frame, so misses here directly cause UI stalls.
    global _audio_duration_cache
    if "_audio_duration_cache" not in globals():
        _audio_duration_cache = {}

    try:
        st = os.stat(path)
        cache_key = (path, int(getattr(st, "st_mtime_ns", int(st.st_mtime * 1_000_000_000))), int(st.st_size))
    except Exception:
        cache_key = (path, 0, 0)

    cached = _audio_duration_cache.get(cache_key)
    if cached is not None:
        return float(cached)

    # Clear stale cache entries for the same path if the file changed.
    try:
        stale_keys = [k for k in _audio_duration_cache.keys() if isinstance(k, tuple) and len(k) >= 1 and k[0] == path and k != cache_key]
        for k in stale_keys:
            _audio_duration_cache.pop(k, None)
    except Exception:
        pass

    try:
        import wave
        with wave.open(path, "rb") as wf:
            frames = wf.getnframes()
            rate = wf.getframerate() or 1
            dur = max(0.0, frames / float(rate))
            _audio_duration_cache[cache_key] = dur
            return dur
    except Exception:
        pass

    try:
        ffmpeg = _get_ffmpeg()
        ffprobe = str(Path(ffmpeg).with_name("ffprobe")) if ffmpeg else "ffprobe"
        proc = subprocess.run(
            [
                ffprobe,
                "-v", "error",
                "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1",
                path,
            ],
            capture_output=True,
            text=True,
            check=False,
            timeout=0.35,
        )
        if proc.returncode == 0:
            dur = max(0.0, float((proc.stdout or "0").strip() or 0.0))
            _audio_duration_cache[cache_key] = dur
            return dur
    except subprocess.TimeoutExpired:
        pass
    except Exception:
        pass

    _audio_duration_cache[cache_key] = 0.0
    return 0.0


def export_mp4(proj: Project, out_path: str,
               fps: float = 30.0,
               size: Optional[Tuple[int, int]] = None,
               on_progress: Optional[Callable[[int, int], None]] = None,
               on_scene: Optional[Callable[[int, int], None]] = None,
               cancel_event=None,
               typing_duration: float = 0.8,
               typing_indicator_duration: float = 1.2,
               typing_indicator_gap: float = 0.4,
               typing_enabled: bool = True,
               typing_rewrite_enabled: bool = False,
               keyboard_style: str = "ios",
               music_path: Optional[str] = None,
               sfx_enabled: bool = False,
               sfx_type: str = "off",
               music_volume: float = 0.8,
               encode_quality: int = 8) -> None:
    """
    Export the project as an MP4 video with per-message timing.

    Each message plays out as:
      1. An organic-length typing dots animation (when typing_enabled)
      2. The message bubble appears and holds for msg.duration seconds

    Optional audio:
      music_path  — path to an MP3/WAV/OGG to mix in as background music
    sfx_type    — keyboard SFX profile: off|soft|mechanical|typewriter|retro

    Requires imageio and imageio-ffmpeg:
        pip install imageio imageio-ffmpeg
    """
    try:
        import imageio
    except ImportError as exc:
        raise RuntimeError(
            "imageio not installed. Run: pip install imageio imageio-ffmpeg"
        ) from exc

    renderer = ChatRenderer(proj)
    total = len(proj.messages)
    if total == 0:
        raise ValueError("No messages to export.")

    rs = proj.settings
    sfx_type_norm = (str(sfx_type or getattr(rs, "sfx_type", "soft") or "soft").strip().lower())
    if sfx_type_norm in ("", "none"):
        sfx_type_norm = "off"
    w = size[0] if size else rs.canvas_w
    h = size[1] if size else rs.canvas_h

    # imageio needs even dimensions for most codecs
    w = w if w % 2 == 0 else w + 1
    h = h if h % 2 == 0 else h + 1

    # Compute per-message indicator and fakeout frame counts upfront.
    def _indicator_frames(i: int) -> int:
        if not typing_enabled:
            return 0
        msg = proj.messages[i]
        if i == 0:
            return 0
        if getattr(msg, "scene_type", None) in ("title", "quote") or getattr(msg, "is_comment", False):
            return 0
        dur = max(0.1, float(typing_indicator_duration or 1.2))
        return max(1, int(fps * dur))

    def _fakeout_count(i: int) -> int:
        if not typing_rewrite_enabled:
            return 0
        if _indicator_frames(i) <= 0:
            return 0
        # Export rail currently exposes fakeout as a boolean toggle.
        return 1

    gap_frames = max(1, int(fps * max(0.05, float(typing_indicator_gap or 0.4))))

    def _stamp_sec(i: int) -> Optional[float]:
        m = proj.messages[i]
        if getattr(m, "scene_type", None) in ("title", "quote") or getattr(m, "is_comment", False):
            return None
        raw = getattr(m, "chat_timestamp_sec", None)
        try:
            if raw is None:
                return None
            val = float(raw)
            if val < 0:
                return None
            return val
        except Exception:
            return None

    stamp_secs: List[Optional[float]] = [_stamp_sec(i) for i in range(total)]

    per_msg_indicator_base = [_indicator_frames(i) for i in range(total)]
    for i in range(total):
        if stamp_secs[i] is not None:
            per_msg_indicator_base[i] = 0
    per_msg_fakeouts = [_fakeout_count(i) for i in range(total)]
    per_msg_indicator_total = [
        (per_msg_indicator_base[i] * (1 + per_msg_fakeouts[i])) + (gap_frames * per_msg_fakeouts[i])
        for i in range(total)
    ]

    # Build frame-accurate schedule that honors stamped message reveal times.
    pre_delay_frames: List[int] = [0] * total
    hold_frames_plan: List[int] = [1] * total
    msg_appear_secs: List[float] = [0.0] * total
    cursor_sec = 0.0

    def _next_stamp_after(i: int) -> Optional[float]:
        for j in range(i + 1, total):
            s = stamp_secs[j]
            if s is not None:
                return s
        return None

    for i in range(total):
        stamp = stamp_secs[i]
        if stamp is not None and stamp > cursor_sec:
            pre = max(0, int(round((stamp - cursor_sec) * fps)))
            pre_delay_frames[i] = pre
            cursor_sec += pre / fps

        cursor_sec += per_msg_indicator_total[i] / fps
        msg_appear_secs[i] = cursor_sec

        duration = max(1.0 / fps, float(getattr(proj.messages[i], "duration", 2.0) or 2.0))
        if stamp is not None:
            nxt = _next_stamp_after(i)
            if nxt is not None and nxt > msg_appear_secs[i]:
                duration = max(1.0 / fps, nxt - msg_appear_secs[i])

        hold = max(1, int(round(duration * fps)))
        hold_frames_plan[i] = hold
        cursor_sec += hold / fps

    total_frames = int(sum(pre_delay_frames) + sum(per_msg_indicator_total) + sum(hold_frames_plan))
    keypress_secs: List[float] = []

    try:
        _enc_q = int(encode_quality)
    except Exception:
        _enc_q = 8
    _enc_q = max(1, min(10, _enc_q))

    writer = imageio.get_writer(
        out_path,
        fps=fps,
        codec="libx264",
        quality=_enc_q,
        macro_block_size=1,
    )
    _cancelled = False
    try:
        emitted = 0
        for i in range(total):
            if cancel_event is not None and cancel_event.is_set():
                _cancelled = True
                break
            if on_scene:
                on_scene(i + 1, total)
            prev_idx = i - 1
            ind_frames = per_msg_indicator_base[i]
            fakeouts = per_msg_fakeouts[i]
            msg_text = str(getattr(proj.messages[i], "text", "") or "")
            typing_chars = [c for c in msg_text if c not in ("\n", "\r", "\t")]

            # Optional lead-in gap before this message (for stamped timing).
            pre = pre_delay_frames[i]
            if pre > 0:
                pre_frame = renderer.render_frame(prev_idx, size=(w, h), play_mode=True)
                arr_pre = _pil_to_numpy(pre_frame, w, h)
                for _ in range(pre):
                    writer.append_data(arr_pre)
                    emitted += 1
                    if on_progress:
                        on_progress(emitted, total_frames)

            # ── Typing indicator sequence (show -> optional fakeouts -> show) ──────────
            if ind_frames > 0:
                segment_total = max(1, 1 + int(fakeouts))
                prev_key_idx = -1

                def _emit_indicator(frames: int, segment_index: int) -> None:
                    nonlocal emitted, prev_key_idx
                    for t in range(frames):
                        phase = (t / max(1, frames)) * 2.0
                        seg_progress = (float(t + 1) / max(1.0, float(frames)))
                        full_progress = min(1.0, (float(segment_index) + seg_progress) / float(segment_total))
                        edge = 0.18
                        if seg_progress < edge:
                            slide = seg_progress / edge
                        elif seg_progress > (1.0 - edge):
                            slide = (1.0 - seg_progress) / edge
                        else:
                            slide = 1.0
                        key_name: Optional[str] = None
                        key_strength = 0.0
                        if typing_chars:
                            key_name, key_strength = renderer._keyboard_active_for_progress(msg_text, full_progress)
                            key_idx = max(0, min(len(typing_chars) - 1, int(full_progress * len(typing_chars))))
                            if segment_index == 0 and key_idx != prev_key_idx:
                                t_now = emitted / float(max(1.0, fps))
                                keypress_secs.append(float(t_now))
                                prev_key_idx = key_idx
                        frame = renderer.render_frame_with_typing(
                            upto_index=prev_idx,
                            next_msg_index=i,
                            dot_phase=phase,
                            size=(w, h),
                            play_mode=True,
                            show_keyboard=bool(typing_chars),
                            keyboard_style=keyboard_style,
                            keyboard_progress=full_progress,
                            keyboard_active_key=key_name,
                            keyboard_active_strength=key_strength,
                            keyboard_slide=slide,
                        )
                        arr = _pil_to_numpy(frame, w, h)
                        writer.append_data(arr)
                        emitted += 1
                        if on_progress:
                            on_progress(emitted, total_frames)

                _emit_indicator(ind_frames, 0)
                if fakeouts > 0:
                    erased = renderer.render_frame(prev_idx, size=(w, h), play_mode=True)
                    arr_erased = _pil_to_numpy(erased, w, h)
                    for k in range(fakeouts):
                        for _g in range(gap_frames):
                            writer.append_data(arr_erased)
                            emitted += 1
                            if on_progress:
                                on_progress(emitted, total_frames)
                        _emit_indicator(ind_frames, k + 1)

            # ── Hold frame: message is now visible ────────────────────────
            hold_frames = hold_frames_plan[i]
            rendered_msg = renderer.render_frame(i, size=(w, h), play_mode=True)
            arr = _pil_to_numpy(rendered_msg, w, h)
            for _ in range(hold_frames):
                writer.append_data(arr)
                emitted += 1
                if on_progress:
                    on_progress(emitted, total_frames)

    finally:
        writer.close()

    # If the user cancelled, delete the partial file and return quietly.
    if _cancelled:
        try:
            Path(out_path).unlink(missing_ok=True)
        except Exception:
            pass
        return

    # ── Optional audio mixing pass ────────────────────────────────────────
    def _as_float(v: Any, fallback: float) -> float:
        try:
            if isinstance(v, (list, tuple)):
                return float(v[0])
            return float(v)
        except Exception:
            return fallback

    if music_path is None:
        music_path = getattr(proj.settings, "music_path", None)
    music_volume = _as_float(music_volume, 0.8)
    if abs(music_volume - 0.8) < 1e-6:
        music_volume = _as_float(getattr(proj.settings, "music_volume", 0.8) or 0.8, 0.8)

    sfx_for_mix = (sfx_type_norm not in ("", "off", "none"))
    need_audio = music_path or sfx_for_mix or any(getattr(m, "audio_path", None) for m in proj.messages)
    if need_audio:
        try:
            _mix_audio(
                video_path=out_path,
                total_frames=total_frames,
                fps=fps,
                messages=proj.messages,
                per_msg_typing=per_msg_indicator_total,
                keypress_secs=keypress_secs,
                msg_appear_secs=msg_appear_secs,
                music_path=music_path,
                sfx_type=sfx_type_norm,
                music_volume=music_volume,
            )
        except Exception as exc:
            log.warning("Audio mix failed; keeping silent MP4 output. Error: %s", exc)


def _get_ffmpeg() -> str:
    """Return path to ffmpeg binary — prefer imageio-ffmpeg's bundled copy."""
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def _mix_audio(video_path: str, total_frames: int, fps: float,
               messages: list, per_msg_typing: list,
               keypress_secs: List[float],
               msg_appear_secs: Optional[List[float]],
               music_path: Optional[str],
               sfx_type: str = "off",
               music_volume: float = 0.8) -> None:
    """Mix background music and/or SFX into *video_path* in-place."""
    import shutil
    import tempfile

    ffmpeg = _get_ffmpeg()
    total_dur = total_frames / fps
    try:
        if isinstance(music_volume, (list, tuple)):
            music_volume = float(music_volume[0])
        else:
            music_volume = float(music_volume)
    except Exception:
        music_volume = 0.8

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        audio_inputs: list[str] = []   # list of WAV paths to sum

        # ── Background music ─────────────────────────────────────────────
        if music_path and os.path.isfile(music_path):
            music_trimmed = str(tmp / "music.wav")
            vol_db = 20 * math.log10(max(0.01, music_volume))
            fade_start = max(0, total_dur - 1.5)
            subprocess.run([
                ffmpeg, "-y", "-i", music_path,
                "-t", str(total_dur),
                "-af", f"volume={vol_db:.1f}dB,afade=t=out:st={fade_start:.2f}:d=1.5",
                "-ar", "44100", "-ac", "2",
                music_trimmed,
            ], check=True, capture_output=True)
            audio_inputs.append(music_trimmed)

        # ── SFX track: one click per keypress timestamp ───────────────────
        _stype = (str(sfx_type or "off")).strip().lower()
        if _stype not in ("", "off", "none"):
            if _stype not in ("soft", "mechanical", "typewriter", "retro"):
                _stype = "soft"

            root = Path(__file__).resolve().parent / "audio" / "keyboard_sfx" / _stype
            pool: List[str] = []
            if root.exists() and root.is_dir():
                for name in sorted(os.listdir(root)):
                    p = root / name
                    if p.is_file() and p.suffix.lower() in (".wav", ".ogg"):
                        pool.append(str(p))
            if not pool:
                log.warning("Keyboard SFX disabled for this export: no clips found in %s", root)
            elif keypress_secs:
                sfx_path = str(tmp / "sfx.wav")
                subprocess.run([
                    ffmpeg, "-y",
                    "-f", "lavfi", "-i",
                    f"anullsrc=r=44100:cl=stereo:d={total_dur}",
                    sfx_path,
                ], check=True, capture_output=True)

                overlays: list[str] = [sfx_path]
                for i, t_click in enumerate(keypress_secs):
                    clip = random.choice(pool)
                    click_wav = str(tmp / f"click_{i}.wav")
                    delayed = str(tmp / f"click_delayed_{i}.wav")
                    subprocess.run([
                        ffmpeg, "-y",
                        "-i", clip,
                        "-t", "0.08",
                        "-ar", "44100", "-ac", "2",
                        click_wav,
                    ], check=True, capture_output=True)
                    subprocess.run([
                        ffmpeg, "-y",
                        "-i", click_wav,
                        "-af", f"adelay={int(float(t_click) * 1000)}|{int(float(t_click) * 1000)},apad=pad_dur={total_dur}",
                        "-t", str(total_dur),
                        "-ar", "44100", "-ac", "2",
                        delayed,
                    ], check=True, capture_output=True)
                    overlays.append(delayed)

                if len(overlays) > 1:
                    inputs = []
                    for p in overlays:
                        inputs += ["-i", p]
                    mixed_sfx = str(tmp / "sfx_mixed.wav")
                    subprocess.run([
                        ffmpeg, "-y", *inputs,
                        "-filter_complex", f"amix=inputs={len(overlays)}:duration=first:normalize=0",
                        "-ar", "44100", "-ac", "2",
                        mixed_sfx,
                    ], check=True, capture_output=True)
                    audio_inputs.append(mixed_sfx)

        # ── Voice-note overlays ──────────────────────────────────────────
        frame_cursor = 0
        voice_overlays: list[str] = []
        for i, msg in enumerate(messages):
            tf = per_msg_typing[i]
            frame_cursor += tf
            if msg_appear_secs and i < len(msg_appear_secs):
                t_voice = max(0.0, float(msg_appear_secs[i]))
            else:
                t_voice = frame_cursor / fps
            frame_cursor += max(1, int(fps * getattr(msg, "duration", 2.0)))

            audio_path = getattr(msg, "audio_path", None)
            if not audio_path or not os.path.isfile(audio_path):
                continue

            delayed = str(tmp / f"voice_{i}.wav")
            try:
                subprocess.run([
                    ffmpeg, "-y",
                    "-i", audio_path,
                    "-af", f"adelay={int(t_voice * 1000)}|{int(t_voice * 1000)},apad=pad_dur={total_dur}",
                    "-t", str(total_dur),
                    "-ar", "44100", "-ac", "2",
                    delayed,
                ], check=True, capture_output=True)
                voice_overlays.append(delayed)
            except Exception:
                continue

        if voice_overlays:
            if len(voice_overlays) == 1:
                audio_inputs.append(voice_overlays[0])
            else:
                voice_mix = str(tmp / "voice_mix.wav")
                vinputs = []
                for p in voice_overlays:
                    vinputs += ["-i", p]
                subprocess.run([
                    ffmpeg, "-y", *vinputs,
                    "-filter_complex", f"amix=inputs={len(voice_overlays)}:duration=first:normalize=0",
                    "-ar", "44100", "-ac", "2",
                    voice_mix,
                ], check=True, capture_output=True)
                audio_inputs.append(voice_mix)

        if not audio_inputs:
            return   # nothing to mix

        # ── Combine all audio streams then mux with video ─────────────────
        if len(audio_inputs) == 1:
            final_audio = audio_inputs[0]
        else:
            ainputs = []
            for p in audio_inputs:
                ainputs += ["-i", p]
            final_audio = str(tmp / "final_audio.wav")
            subprocess.run([
                ffmpeg, "-y", *ainputs,
                "-filter_complex", f"amix=inputs={len(audio_inputs)}:duration=first:normalize=0",
                final_audio,
            ], check=True, capture_output=True)

        # Mux audio into video
        muxed = str(tmp / "muxed.mp4")
        subprocess.run([
            ffmpeg, "-y",
            "-i", video_path,
            "-i", final_audio,
            "-c:v", "copy", "-c:a", "aac", "-b:a", "192k",
            "-shortest",
            muxed,
        ], check=True, capture_output=True)
        shutil.move(muxed, video_path)


def _pil_to_numpy(img: Any, w: int, h: int):
    """Convert a PIL image to a numpy uint8 RGB array, resizing if needed."""
    import numpy as np
    rgb = img.convert("RGB")
    if rgb.size != (w, h):
        rgb = rgb.resize((w, h), Image.LANCZOS)
    return np.array(rgb, dtype="uint8")
