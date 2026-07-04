# Build Guide — AI Video Dubber (production EXE)

How to rebuild the single-EXE Windows release from source.

## Prerequisites

- **Python 3.11** with the project venv at `venv_cpu/` (already set up).
  It contains: fastapi, uvicorn, starlette (<1.0), pydantic, python-multipart,
  torch (CPU), faster-whisper, ctranslate2, edge-tts, pydub, deep-translator,
  requests, demucs, PyInstaller.
- **Node.js** (v18+) for the frontend build.
- **FFmpeg** binaries in `bin/` (`ffmpeg.exe`, `ffprobe.exe`) — already present.
- A faster-whisper model in the HF cache (`~/.cache/huggingface/hub/`) for the
  offline transcription bundle. `base` is downloaded by default.

> Note: `starlette` must be pinned `<1.0`. FastAPI 0.138's loose pin allowed
> starlette 1.3.x, which silently broke `app.include_router` (no routes
> registered). `venv_cpu` has the correct pin; don't upgrade it blindly.

## One-shot build

```bash
# from project root
PYTHONPATH=. venv_cpu/Scripts/python build_launcher.py --all
PYTHONPATH=. venv_cpu/Scripts/python assemble_release.py
```

`build_launcher.py --all` = frontend build + PyInstaller. `assemble_release.py`
copies the dist, builds the portable `python_runtime`, and bundles the model +
reference voices into `release/AI_Video_Dubber/`.

## Step by step

### 1. Build the React frontend
```bash
cd frontend && npm install && npm run build   # -> frontend/dist
```

### 2. Verify the backend (optional but recommended)
```bash
PYTHONPATH=. venv_cpu/Scripts/python backend/tests/test_phase_ab.py   # 14/14
```

### 3. Run PyInstaller
```bash
venv_cpu/Scripts/pyinstaller AI_Video_Dubber_Launcher.spec --noconfirm \
  --distpath dist --workpath build_launcher_work
```
Output: `dist/AI_Video_Dubber/` (EXE + `_internal/` with FastAPI, frontend, bin).

The spec **excludes** heavy ML libs (torch, faster_whisper, transformers,
demucs, scipy) and PyQt5 from analysis — they crash/bloat the analyzer. They are
shipped via the portable runtime instead (next step).

### 4. Assemble the release
```bash
PYTHONPATH=. venv_cpu/Scripts/python assemble_release.py
```
Produces `release/AI_Video_Dubber/`:
- `AI_Video_Dubber.exe`, `_internal/` (copied from dist)
- `python_runtime/` — base Python stdlib + venv ML site-packages (~1.2 GB)
- `models/hf_cache/hub/models--Systran--faster-whisper-base/` (~140 MB)
- `reference_voices/`

Granular flags: `--dist`, `--runtime`, `--models`.

## How runtime resolution works (so the EXE finds everything)

`backend/config/settings.py` resolves assets when frozen by searching, in order:
the **EXE directory**, then the bundled **`_MEIPASS`** dir, then the source tree.

| Asset | Resolves to (in release) |
|-------|--------------------------|
| `ffmpeg` / `ffprobe` | `_internal/bin/` (bundled) |
| frontend SPA | `_internal/frontend_dist/` (bundled) |
| `worker_python` | `python_runtime/python.exe` (beside EXE) — **never the EXE itself** |
| `models` | `models/` (beside EXE) |
| whisper HF cache | `models/hf_cache/` → sets `HF_HOME` + `HF_HUB_OFFLINE=1` |

The offline ML workers (faster-whisper, voxcpm) run as **subprocesses** of
`python_runtime/python.exe` — the same isolation strategy the legacy app used to
avoid Windows CUDA/OpenMP DLL crashes.

## Launch behavior

`launcher.py`: starts uvicorn (FastAPI) on `127.0.0.1:8765` in a thread, polls
`/api/ping` until ready, opens the browser, and stays alive hosting the server.
Env overrides: `DUBBER_PORT`, `DUBBER_HOST`, `DUBBER_OPEN_BROWSER=0`.

## Smoke test the build

```bash
cd release/AI_Video_Dubber
DUBBER_PORT=8770 DUBBER_OPEN_BROWSER=0 ./AI_Video_Dubber.exe &
curl http://127.0.0.1:8770/api/system/health     # ffmpeg=true, worker_python=python_runtime
curl http://127.0.0.1:8770/                        # SPA (id="root")
```

## Optional: enable VoxCPM offline TTS

Not bundled by default (package + ~4.7 GB model). To enable:
1. `venv_cpu/Scripts/pip install voxcpm` then re-run `assemble_release.py --runtime`.
2. Copy `models/VoxCPM2/` into `release/AI_Video_Dubber/models/`.

## Common issues

| Symptom | Cause / fix |
|---------|-------------|
| Only `/api/ping` route registered | starlette >= 1.0 installed; pin `<1.0`. |
| PyInstaller `PermissionError` on dist | a previous EXE is still running; close it, retry. |
| `worker_python` = the EXE path | old build; resolution now returns `python_runtime`. |
| Transcription "no JSON" / ffmpeg error | pass real Windows paths (use `/api/media/upload`); model must be in `models/`. |
| UnicodeEncodeError in build script | console is cp1252; scripts avoid non-ASCII output. |
