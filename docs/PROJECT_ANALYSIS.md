# PROJECT_ANALYSIS.md

> Phase 1 — Read-only analysis of the AI Video Dubber project.
> No source files were modified, rewritten, or deleted in producing this document.

## 1. What this project is

A **PyQt5 desktop application for AI-powered video dubbing**, with a bilingual Khmer/English UI. It ingests a video, transcribes speech, translates subtitles, generates dubbed audio (text-to-speech, including neural voice cloning), applies visual effects (watermark / blur / text overlay), and exports a finished video or audio track. It is licensed commercial software with machine-bound activation.

- **Primary platform:** Windows 11 (heavy Windows coupling — `wmic`, `winreg`, `winsound`, `CREATE_NO_WINDOW`, `os.startfile`).
- **Distribution:** PyInstaller / Nuitka frozen builds, both online (download ML libs later) and full-offline (~1.5–6 GB) variants.
- **Current version:** `2.0.0` (`version.json`).

## 2. Headline numbers

| Metric | Value |
|---|---|
| Total Python LOC analyzed | ~24,250 |
| Main app file | `AI_Dubber_PyQt5_Complete.py` — **14,699 lines** |
| QThread background workers | 14 (in main file) + more in tools |
| PyQt dialog classes | ~15 |
| Translation engines | 4 (NLLB-200, Groq, Gemini, Google Translate) |
| Speech-recognition engines | 3 (faster-whisper offline, Groq cloud, Gemini cloud) |
| TTS engines | 2 (Edge TTS, VoxCPM2 voice cloning) |
| Markdown docs already in repo | 23 |

## 3. Core capabilities (verified in code)

- **Video:** preview/playback via `cv2.VideoCapture`, seek, frame-by-frame effect overlay editor.
- **Subtitles:** SRT import/export/parse, 11-column editable table, auto-split long rows, merge, time-shift, smart-sync.
- **Transcription:** offline faster-whisper (default, subprocess-isolated) plus Groq and Gemini cloud paths.
- **Translation:** NLLB-200 offline → Groq LLM → Gemini → Google Translate, with automatic fallback on quota/error. LLM paths also return per-row gender + emotion.
- **TTS / dubbing:** Edge TTS (free, online) and VoxCPM2 (offline neural cloning from reference WAVs). Gender + emotion drive voice and speed selection.
- **Effects:** watermark (chroma-key, animated), blur (20 styles), text overlay (gradients, animations) — built in `video_effects.py`; a second generic filter/preset library in `Effect.py`; heuristic auto-text-blur via classical OpenCV (no OCR).
- **Audio separation:** Demucs (subprocess, `htdemucs`/`mdx_extra`) for vocal removal.
- **Export:** FFmpeg `filter_complex` mux with GPU (`h264_nvenc`, CPU fallback to `libx264`) or `h264_mf` fallback; MP3 export; CapCut export.
- **Licensing:** machine-bound key activation with Google Apps Script online check, offline grace period, and clock-rollback detection.
- **Auto-update:** checks GitHub `version.json`, downloads and launches updater.

## 4. Architectural shape

A **monolithic GUI** (`AIVideoDubberApp`, ~7,000 lines inside one class) drives every feature. Long-running jobs run on `QThread` workers that communicate via `pyqtSignal`. Heavy ML work (Whisper, Demucs, VoxCPM) is deliberately **run in separate Python subprocesses** to dodge Windows CUDA/OpenMP DLL conflicts (`KMP_DUPLICATE_LIB_OK=True`, manual `os.add_dll_directory`).

The genuinely reusable business logic exists but is **interleaved with the Qt widget layer**: nearly every algorithm reads and writes `subtitle_table` cells directly instead of operating on a data model.

## 5. Key risks identified (detail in MIGRATION_PLAN.md)

1. **Security — forgeable licenses.** The HMAC signing secret is symmetric and hardcoded in plaintext (`google_sheets_keygen.gs`, and compared in plaintext in the main app) and only trivially obfuscated in `License.py`. Anyone with the secret can mint unlimited valid keys.
2. **Security — leaked/committed secrets.** A hardcoded Gemini API key in `test_gemini_context.py`; a hardcoded Google Apps Script license URL; plaintext API keys in the user settings JSON; `License_Database.xlsx` with customer machine IDs + Telegram handles (PII) in the repo.
3. **Source exposure.** `AI_Video_Dubber_Protected.py` is just base64-encoded source (`exec(b64decode(...))`); `protected_code.txt` and `.c` files expose the source in several forms.
4. **Duplicated logic.** Time codecs duplicated in 4 places; translation engine logic implemented twice; two divergent effect renderers (preview vs export) that can drift.
5. **Windows lock-in.** `wmic`, `winreg`, `winsound`, `CREATE_NO_WINDOW`, hardcoded `C:\...\Python311` paths in specs.
6. **Inconsistent persistence roots.** Settings in `~`, but `character_profiles.json` and error logs in the current working directory.

## 6. Scope note on project rules

- **No `legacy/` folder exists** at the project root, so the "never modify legacy" rule currently has no on-disk target. If legacy code lives elsewhere, point me to it.
- The working tree is **dirty** (many `M`/`MM` files, untracked build logs, a 1.9 GB zip). A clean baseline is advisable before any Phase 2 changes.

See `ARCHITECTURE.md`, `MODULES.md`, `DEPENDENCY_GRAPH.md`, and `MIGRATION_PLAN.md` for detail.
