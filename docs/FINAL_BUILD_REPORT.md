# Final Build Report — Phase 6 Production

**Generated:** 2026-06-30
**Verdict:** Production release built, smoke-tested, and verified. All test suites green. Three real bugs found during verification were fixed and re-verified against the running EXE.

---

## Verification results

| Suite | Result | What it covers |
|---|---|---|
| `backend/tests/test_phase_ab.py` | **14/14 pass** | Core SRT codecs, ported algorithms (auto-speed/merge/shift), .aivd roundtrip, base API surface |
| `backend/tests/test_phase6_full.py` (new) | **27/27 pass** | Every `/api` endpoint group: system, srt, subtitles (incl. auto-split), settings, characters, projects, license, key-gen, models, diagnostics, effects, recap, tts, update |
| `backend/tests/test_phase6_workflow.py` (new) | **6/6 pass** | End-to-end with a real Khmer audio fixture: media probe → offline faster-whisper transcription → edge-TTS synthesis → full MP3 dub export (file written) |

The workflow suite exercises the heavy offline pipelines (subprocess workers), not just dispatch — it confirms transcription returns real segments and the MP3 export writes a non-empty file.

## Release EXE smoke test

Launched `release/AI_Video_Dubber/AI_Video_Dubber.exe` on isolated ports (`DUBBER_OPEN_BROWSER=0`) and verified live over HTTP:

| Check | Result |
|---|---|
| EXE launches, backend auto-starts | ✅ |
| `/api/ping` | ✅ `{"pong":true}` |
| `/api/system/health` (ffmpeg + python_runtime resolved) | ✅ both paths resolve into the release tree |
| `/api/effects` (Phase-5 feature in frozen build) | ✅ 12 presets returned |
| `/api/recap/options` | ✅ genres + durations |
| `/api/license/machine-id`, `/status`, `/generate-key` | ✅ after fix (see Bug 3) |
| SPA root (`id="root"`) | ✅ served |

## Bugs found and fixed

### Bug 1 — subprocess output decoded as cp1252, crashing on Khmer text
**Symptom:** `UnicodeDecodeError: 'charmap' codec can't decode byte 0x8f` in a subprocess reader thread when transcribing Khmer audio.
**Root cause:** 8 `subprocess.run`/`Popen` calls used `text=True` without `encoding="utf-8"`. On Windows the default is cp1252, which fails on non-ASCII worker output (Khmer transcripts, ffmpeg progress, demucs logs).
**Fix:** added `encoding="utf-8", errors="replace"` to every text-mode subprocess call in `backend/utils/ffmpeg.py`, `backend/services/{audio,effects,transcription,tts}_service.py`. (`video_export_service`, `recap_service`, `batch_service` already had it.)
**Re-verified:** workflow suite 6/6, no decode errors.

### Bug 2 — build script crashed on final status print
**Symptom:** `build_launcher.py` raised `UnicodeEncodeError` printing a `✓` glyph under the Windows cp1252 console (after the build itself succeeded).
**Fix:** replaced `[✓]` with `[OK]` in `build_launcher.py`.

### Bug 3 — license endpoints 500 in the frozen EXE
**Symptom:** `/api/license/*` returned `{"detail":"No module named 'PyQt5'"}` in the release EXE (worked in dev).
**Root cause:** `license_service` reuses the legacy `License.py`, which does a module-level `from PyQt5 ... import`. PyQt5 is intentionally excluded from the PyInstaller analysis (heavy, GUI-only), so the import failed once frozen.
**Fix:** `license_service._stub_pyqt5()` injects lightweight stand-in `PyQt5`/`QtWidgets`/`QtCore`/`QtGui` modules into `sys.modules` only when the real PyQt5 is absent, so the legacy crypto/activation functions import headlessly. The legacy `License.py` was **not modified**. In dev (PyQt5 present) the stub is a no-op.
**Re-verified:** rebuilt EXE → machine-id, status, generate-key all 200.

## Build pipeline changes

- **`AI_Video_Dubber_Launcher.spec`** — added `video_effects_worker.py`, `Effect.py`, `video_effects.py` to bundled datas so the Phase-5 effects/overlays features work in the frozen build (they run as worker subprocesses).
- Rebuilt via `build_launcher.py --build` (frontend already built), re-assembled the app dist into the release via `assemble_release.py --dist`.

## Release artifacts

```
release/AI_Video_Dubber/
  AI_Video_Dubber.exe          one-click launcher (~14.9 MB)
  _internal/                   FastAPI + React build + ffmpeg + worker scripts
                               (incl. video_effects_worker.py, Effect.py, video_effects.py)
  python_runtime/              portable Python for offline ML subprocess workers
  models/hf_cache/hub/         faster-whisper base model (offline transcription)
  reference_voices/            VoxCPM cloning samples
```

All five top-level entries present; `python_runtime/python.exe` and the bundled whisper model confirmed in place.

## Feature parity

Per `docs/FINAL_PARITY_REPORT.md`, every legacy feature with reusable logic is wired end-to-end (53 `/api` endpoints). This phase confirmed those endpoints **run**, not just register — including the offline transcription/TTS/export pipeline against real Khmer audio and the previously-broken license subsystem now working in the frozen EXE. No missing features remain; the ⚠ items documented in the parity report are bundle dependencies (VoxCPM 4.7 GB model) or cosmetic affordances, not gaps.

## How to rebuild

```bash
cd frontend && npm run build && cd ..
PYTHONPATH=. venv_cpu/Scripts/python build_launcher.py --build
PYTHONPATH=. venv_cpu/Scripts/python build_launcher.py --postbuild   # heavy ML libs + embedded python
PYTHONPATH=. venv_cpu/Scripts/python assemble_release.py             # full release (dist + runtime + models)
```

Smoke test:
```bash
cd release/AI_Video_Dubber
DUBBER_PORT=8770 DUBBER_OPEN_BROWSER=0 ./AI_Video_Dubber.exe &
curl http://127.0.0.1:8770/api/system/health
```

## Test suites added this phase

- `backend/tests/test_phase6_full.py` — 27 endpoint assertions across every router.
- `backend/tests/test_phase6_workflow.py` — 6 end-to-end pipeline assertions using a real audio fixture (UTF-8 stdout so Khmer paths don't crash the console).
