# AI Video Dubber — Modern Architecture (v2 migration)

The legacy PyQt5 desktop app has been migrated to a **localhost web app**:
a FastAPI backend (reusing all the original AI logic) + a React/Vite/TS/Tailwind
frontend, launched from a single EXE that auto-starts the backend and opens the
browser.

> The original `AI_Dubber_PyQt5_Complete.py` and all legacy modules are
> **unchanged**. The backend imports/wraps the existing standalone workers and
> ports the in-GUI algorithms verbatim. Nothing was rewritten or deleted.

## Layout

```
backend/                 FastAPI app (Python)
  app.py                 entry — wires routers + serves built frontend
  api/                   REST routers (one module per feature)
  services/              business logic (wraps legacy workers + ported algos)
  core/                  UI-free logic ported verbatim (SRT codecs, parse)
  models/                plain data models (Subtitle, Project) — the table decoupled
  utils/                 job manager, ffmpeg helpers
  config/                path resolution (bundled bin/models/workers)
  tests/                 verification suite (14 tests)
frontend/                React + Vite + TypeScript + Tailwind
  src/api/               REST client + types
  src/components/        UI (VideoPlayer, SubtitleTable, Toolbar, dialogs…)
  src/App.tsx            wires UI to the REST API
launcher.py              single-process launcher (backend + browser)
AI_Video_Dubber_Launcher.spec   PyInstaller spec
build_launcher.py        build + post-build (heavy-lib copy) helper
```

## Reuse map (legacy → backend)

| Feature | Reused from legacy |
|---|---|
| SRT time codecs / parse | `_srt_seconds_to_time` / `_srt_time_to_sec` (ported verbatim) |
| Auto-speed / merge / shift | `auto_speed_dialog` / `merge_selected_rows` / `shift_selected_times` |
| Transcription | `transcribe_worker_script.py` via subprocess (unchanged) |
| Translation | `TranslateWorker` engine chain NLLB→Groq→Gemini→Google (verbatim prompts) |
| TTS | edge-tts (`_generate_edge_tts` logic) + `voxcpm_worker_script.py` (unchanged) |
| MP3 export | `_execute_mp3_export` assembly (verbatim math) |
| Settings | reads/writes the same `~/.ai_video_dubber_settings.json` |

## Run (development)

```bash
# 1. Backend (port 8765)
PYTHONPATH=. venv_cpu/Scripts/python -m uvicorn backend.app:app --port 8765

# 2. Frontend dev server (port 5173, proxies /api → 8765)
cd frontend && npm run dev
```

## Run (production, single process)

```bash
cd frontend && npm run build        # produces frontend/dist
PYTHONPATH=. venv_cpu/Scripts/python launcher.py
# backend starts, browser opens at http://127.0.0.1:8765/
```

## Build the EXE

```bash
# everything: frontend build + PyInstaller + copy heavy ML libs
venv_cpu/Scripts/python build_launcher.py --all

# output: dist/AI_Video_Dubber/AI_Video_Dubber.exe
```

The spec **excludes** heavy ML libs (torch, faster_whisper, transformers,
demucs) from PyInstaller analysis and copies them in afterwards
(`build_launcher.py --postbuild`) — the same strategy the legacy `Build.py`
used to avoid analyzer crashes/bloat. ffmpeg (`bin/`), the worker scripts, and
the built frontend are bundled directly. Models stay in `models/` next to the
EXE (resolved at runtime by `backend/config/settings.py`).

## Tests

```bash
PYTHONPATH=. venv_cpu/Scripts/python backend/tests/test_phase_ab.py
```

## Notes / known follow-ups

- Video effects (watermark/blur/text) and the full video (not just MP3) export
  pipeline are not yet wired into the backend — the legacy `video_effects.py`
  and the ffmpeg `filter_complex` export remain to be ported as services.
- API keys are still stored in plaintext settings JSON (legacy behavior). The
  backend masks them when sending to the frontend (`redacted_settings`).
- The `legacy/` folder referenced in CLAUDE.md does not exist; no legacy code
  was modified.
