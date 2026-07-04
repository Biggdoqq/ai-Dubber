# AI Restore Report — Phase 3

**Generated:** 2026-07-01
**Scope:** Restore the missing **AI features** identified in `FEATURE_PARITY_REPORT.md`, reusing the existing legacy Python logic (never rewriting working algorithms), exposing everything through FastAPI, and building the required React UI.

**Guiding constraint honored:** every AI capability below is a **faithful port** of legacy logic or a **subprocess wrapper** around an existing legacy worker script. No working algorithm was rewritten. The legacy `.py` files were not modified.

---

## What was restored this phase

| Feature | How it was restored | Backend | API | React UI |
|---|---|---|---|---|
| Gemini transcription | Ported `GeminiTranscriptionWorker` (MAIN:2875) — multi-key rotation, model-fallback chain, 429/400/403 skip, 503 retry — verbatim | ✅ `transcription_service.transcribe_gemini` | ✅ `POST /api/transcribe` (engine=gemini) | ✅ AI Tools → engine select |
| Groq transcription (selectable) | Existing `transcribe_groq` now reachable via engine param + UI | ✅ (existing) | ✅ `POST /api/transcribe` (engine=groq) | ✅ AI Tools → engine select |
| Auto-split by silence | Ported `SilenceDetectWorker` (MAIN:3719) — FFmpeg `silencedetect`, segment build + long-segment split — verbatim | ✅ `transcription_service.detect_silence_segments` | ✅ `POST /api/transcribe/silence-split` | ✅ AI Tools → Split |
| Batch SRT generator | Ported `BatchSRTWorker` (MAIN:4398) — per-video extract → whisper subprocess → split → write `.srt` | ✅ `transcription_service.batch_transcribe` | ✅ `POST /api/transcribe/batch` | ✅ AI Tools → Batch |
| Demucs vocal removal | Ported `remove_vocal_from_video` (MAIN:10843) — extract → `demucs.separate mdx_extra --two-stems` (subprocess) → mux | ✅ `audio_service.remove_vocals` | ✅ `POST /api/audio/remove-vocals` | ✅ AI Tools → Remove Vocals |
| Noise reduction | Ported `_apply_noise_reduction` (MAIN:2028) — `noisereduce` lib with FFmpeg `afftdn` fallback | ✅ `audio_service.reduce_noise` | ✅ `POST /api/audio/reduce-noise` | ✅ AI Tools → Reduce Noise |
| GPU toggle (transcribe/demucs) | Surfaced the existing `use_gpu` param + GPU device probe in worker runtime | ✅ | ✅ params | ✅ AI Tools → Use GPU checkbox |

### Already present before this phase (verified, listed for completeness)

| Feature | Reuse origin | Status |
|---|---|---|
| Faster-Whisper (offline) | `transcribe_worker_script.py` via subprocess | ✅ end-to-end |
| Google / Groq / Gemini / NLLB translation | `translation_service` (legacy `TranslateWorker` engine chain) | ✅ engines + UI |
| Edge TTS | `tts_service.generate_edge_tts` (legacy `_generate_edge_tts`) | ✅ preview + export |
| VoxCPM2 neural cloning | `voxcpm_worker_script.py` via subprocess | ⚠ wired; pkg+model not bundled |
| Voice Manager / catalog | `GET /api/system/voices` (edge + `VOXCPM_VOICE_OPTIONS`) + per-row Voice column | ✅ |
| Character Profiles | `settings_service` + `GET/PUT /api/settings/characters` + Characters tab (Phase 2) | ✅ |
| Auto-Speed | `subtitle_service.smart_auto_speed` | ✅ toolbar |
| Audio Merge (rows) | `subtitle_service.merge_rows` | ✅ toolbar |
| Audio Effects (echo/volume/auto-sync at export) | `export_service.export_mp3` (legacy `_execute_mp3_export`) | ✅ |
| FFmpeg | `utils/ffmpeg.py` + bundled `bin/` | ✅ |
| Subtitle Editor | `SubtitleTable` + SRT routes (Phase 1/2) | ✅ |
| Batch Processing | new batch transcription endpoint (above) | ✅ |

---

## Features in the request that have NO legacy logic to reuse

The brief listed these, but they do **not exist** in the legacy codebase, so there is no working algorithm to reuse. Per the "never rewrite / reuse existing logic" constraint, I did **not** fabricate them from scratch. Flagging explicitly:

- **XTTS** — the legacy app explicitly **removed** XTTS: `AI_Dubber_PyQt5_Complete.py:10941` shows the handler returns *"XTTS Voice Cloning functionality has been removed to save memory."* There is no XTTS code to port. (VoxCPM2 is the legacy neural-cloning engine and is wired.)
- **RVC** — no RVC implementation exists. `RVC_Backend.spec` references an `RVC_Backend.py` that is **not present** in the repo (noted in `docs/MODULES.md`). Nothing to reuse.
- **OCR** — there is **no OCR** anywhere in the legacy code. Auto-text-blur in `Effect.py` is a classical OpenCV edge/contour heuristic (`AutoTextBlurEffect`), not OCR. The only `easyocr`/`tesseract` hits are unused third-party packages in `venv_cpu/`.

To add any of XTTS / RVC / OCR would require building new functionality (new dependencies + models), which is outside "restore existing AI features." Recommend a separate scoped task if these are genuinely wanted.

---

## Files changed

**Backend (ported logic + new endpoints):**
- `backend/services/transcription_service.py` — added `transcribe_gemini`, `detect_silence_segments`, `batch_transcribe`; hardened `transcribe_groq` (key check)
- `backend/services/audio_service.py` — **new**: `remove_vocals` (Demucs), `reduce_noise`
- `backend/api/transcribe_routes.py` — gemini engine branch + `/silence-split` + `/batch` routes
- `backend/api/audio_routes.py` — **new**: `/api/audio/remove-vocals`, `/api/audio/reduce-noise`
- `backend/api/schemas.py` — `target_lang` on transcribe; `SilenceSplitRequest`, `BatchTranscribeRequest`
- `backend/app.py` — registered `audio_routes`

**Frontend (UI):**
- `frontend/src/components/AIToolsDialog.tsx` — **new**: engine-selectable transcription, silence split, vocal removal, noise reduction, batch SRT, GPU toggle
- `frontend/src/App.tsx` — Tools menu entry "AI Tools…", dialog wiring, whisper-model load from settings
- `frontend/src/api/client.ts` — `transcribe(target_lang)`, `silenceSplit`, `batchTranscribe`, `removeVocals`, `reduceNoise`

**No legacy `.py` files modified. No working algorithm rewritten.**

---

## Verification

- **Backend import:** `PYTHONPATH=. venv_cpu/Scripts/python -c "from backend.app import app"` → OK, 19 routes registered.
- **Frontend build:** `npm run build` (tsc -b && vite build) → passes, 43 modules, no type errors.
- **Not exercised at runtime this phase** (build-level only). Cloud paths (Gemini/Groq) need API keys; Demucs needs the `demucs` package + models in the runtime; VoxCPM needs its package + 4.7 GB model. These are environment/bundle dependencies, not code gaps — same as documented in `STATUS.md`.

## Runtime dependency notes (unchanged from legacy)

- **Demucs vocal removal** requires `demucs` installed in `worker_python` (the portable runtime / `venv_cpu`). The service auto-detects CUDA in the worker runtime and falls back to CPU.
- **Noise reduction** uses `noisereduce` if present, else FFmpeg `afftdn` (always available via bundled ffmpeg).
- **Gemini/Groq transcription** require API keys set in Settings → API Keys.
