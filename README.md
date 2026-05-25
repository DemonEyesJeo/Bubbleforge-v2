# Bubbleforge v2

Chat-style story export app. Build cinematic conversations, export MP4 videos, PDFs, and image sequences.

## Stack

- **Frontend:** Vanilla JS + Vite (no framework)
- **Android:** Capacitor
- **Export backend:** Python / Flask + PIL + ffmpeg (same core as v1)

## Development

### Run Today (Fastest)

```bash
# If your Python virtual environment is already active:
npm install
npm run dev:today

# Frontend: http://127.0.0.1:5173
# Backend:  http://127.0.0.1:5000
```

### Run Today (Two Terminals)

```bash
# Terminal 1 (frontend)
npm install
npm run dev:local
# -> http://127.0.0.1:5173

# Terminal 2 (backend)
pip install -r backend/requirements.txt
npm run backend

# Optional backend check
npm run health
```

If you use a virtual environment, activate it before `npm run backend` so Flask/Pillow/moviepy are available.

```bash
# Install deps
npm install

# Start frontend dev server
npm run dev
# → http://localhost:5173

# Start export backend (separate terminal)
cd backend
pip install -r requirements.txt
python server.py
# → http://localhost:5000
```

## Build for Android

```bash
npm install -g @capacitor/cli
npm run build
npx cap sync android
npx cap open android
```

## Project structure

```
src/
  main.js              # Entry point, screen registration
  style.css            # Design system + all component styles
  store.js             # Data model + localStorage persistence
  router.js            # Screen stack navigation
  screens/
    home.js            # My Stories screen
    conversation.js    # Scene editor
    actor-editor.js    # Create / edit actors
    play.js            # Playback preview with keyboard overlay
  components/
    bubble.js          # Message bubble renderer
    hub-panel.js       # Story hub sliding panel
    export-rail.js     # Export bottom sheet
    keyboard.js        # Keyboard overlay + SFX
    icons.js           # SVG icon library
  assets/
    audio/keyboard_sfx/{soft,mechanical,typewriter,retro}/

backend/
  server.py            # Flask export API
  core.py              # PIL rendering pipeline (from v1)
  requirements.txt
```

## Audio

SFX clips live in `src/assets/audio/keyboard_sfx/`. Each style folder contains numbered `.wav` clips (`click_01.wav` … `click_N.wav`). The keyboard component picks one randomly per keypress for natural variation.

- `soft/` — 41 clips (iPhone soft tap)
- `mechanical/` — 20 clips (generated variations from one source)
- `typewriter/` — drop clips here when ready
- `retro/` — drop clips here when ready
