# MODULES.md

> Phase 1 — Module-by-module inventory (read-only analysis).
> For each module: what it does, who depends on it, reusability, UI vs business logic, and whether it should stay unchanged during a migration.

Legend — **Type:** UI = Qt-coupled · LOGIC = pure/near-pure business logic · MIXED = both · TOOL = build/admin · CONFIG = data file.

---

## A. Application core

### `AI_Dubber_PyQt5_Complete.py` (14,699 lines) — **MIXED**
The monolith. Contains the entry point, the `AIVideoDubberApp` main window (~7,000-line class), 14 QThread workers, ~15 dialogs, and all feature logic.
- **Depended on by:** the entire app (it *is* the app). Imports Effect, video_effects, voxcpm_support, Gameplay_Recap_Tool, License, deep_translator.
- **Reusable:** Partially. Pure algorithms (SRT parsing, time codecs, auto-speed, merge, sync, voice resolution, translation orchestration, export pipeline internals) are extractable; everything bound to `subtitle_table` and Qt widgets is not.
- **Keep unchanged?** No — this is the primary migration target. Extract the logic, replace the UI.
- **Notable internals:** time codecs `_srt_seconds_to_time`/`_srt_time_to_sec` (file:207/217); `ExportWorker` (639); `TranslateWorker` (3030); settings `_load_settings`/`_save_settings` (6260/6308); project save `_save_to_file` (11659).

---

## B. AI / ML pipeline

### `Offline_Transcription.py` (243 lines) — **MIXED**
`WhisperTranscriptionWorker(QThread)` (file:36) that **spawns a subprocess** (does not run Whisper in-process) to avoid Windows CUDA DLL crashes. GPU→CPU auto-retry. Writes `transcription_import_status.txt`.
- **Depends on:** `transcribe_worker_script.py` (the subprocess target), torch (for GPU check).
- **Reusable:** The subprocess-orchestration pattern is reusable; the QThread wrapper is thin.
- **Keep unchanged?** Mostly — the subprocess isolation is load-bearing on Windows+CUDA.

### `transcribe_worker_script.py` (78 lines) — **LOGIC**
Standalone CLI worker. `from faster_whisper import WhisperModel`; `model.transcribe(beam_size=5, vad_filter=True, ...)`; emits JSON `{success, segments, language}`. compute_type forced `int8`.
- **Depended on by:** `Offline_Transcription.py`, `BatchSRTWorker`, build scripts (copied into bundle).
- **Reusable:** **Directly reusable** — pure, CLI-driven, no UI. Prime candidate for a service.
- **Keep unchanged?** Yes.

### `Auto_SRT_Generator.py` (470 lines) — **MIXED**
Standalone batch SRT tool. `SRTWorker(QThread)` (file:46) extracts audio (ffmpeg → 16kHz mono), runs whisper subprocess, splits segments longer than `max_seg` proportionally, writes `.srt`. Pure helpers: `seconds_to_srt` (29), `extract_audio` (37), segment-splitting (117–134).
- **Reusable:** Helper functions are pure and reusable; the rest is PyQt.
- **Keep unchanged?** Helpers yes; UI no.

### `voxcpm_support.py` (1,153 lines) — **LOGIC**
Main VoxCPM2 neural-TTS/voice-cloning API. `generate_voxcpm_audio(...)` (file:914), `VOXCPM_VOICE_OPTIONS` presets (282), model download `ensure_voxcpm_model_downloaded` (766), stable per-voice seed (637), in-process load with external-CUDA-subprocess fallback (1015). Uses a plain `progress_callback`, **not** Qt signals.
- **Depended on by:** main app (`VoxCPMWorker`, `VoxCPMBatchWorker`, voice pickers), `voxcpm_worker_script.py`.
- **Reusable:** **Highly reusable** — almost entirely UI-free business logic. No API keys (fully local).
- **Keep unchanged?** Yes — strong service candidate.

### `voxcpm_worker_script.py` (198 lines) — **LOGIC**
Simpler standalone VoxCPM worker. argparse `--text/--voice/--speed/--output/--ref_wav`; loads `VoxCPM.from_pretrained('openbmb/VoxCPM2')`; writes 48kHz wav; speed via ffmpeg atempo.
- **Reusable:** Directly reusable.
- **Keep unchanged?** Yes.

### `download_model_direct.py` (90 lines) — **TOOL/LOGIC**
Resumable downloader for the VoxCPM2 `model.safetensors` into `models/VoxCPM2/`.
- **Reusable:** Yes, standalone utility.

### `Kh Audio Translator.py` (115 lines) — **UI (thin)**
A launcher that opens a hosted ai.studio web app in the browser (file:16). No local pipeline.
- **Reusable:** No real logic to migrate. Disposable.

### `test_gemini_context.py` (111 lines) — **TOOL (test)**
Ad-hoc Gemini test. ⚠️ **Contains a hardcoded Gemini API key (file:16)** — leaked secret, rotate/remove.
- **Keep unchanged?** No — scrub the key.

**Engines summary (implemented inside the main file):**
- **Translation:** NLLB-200 offline (transformers) → Groq LLM (`llama-3.3-70b-versatile`) → Gemini (`gemini-1.5-flash`) → Google Translate (deep-translator). Auto-fallback on quota.
- **Transcription:** faster-whisper (offline default), Groq (`whisper-large-v3`), Gemini audio.
- **TTS:** Edge TTS (free, Khmer/English neural voices) + VoxCPM2 (offline cloning).

---

## C. Video / effects

### `video_effects.py` (1,966 lines) — **MIXED**
The user-facing watermark/blur/text subsystem.
- `VideoEffectsDialog(QDialog)` (file:14) — full Qt settings UI (3 tabs), Windows-registry font enumeration (767). **UI.**
- `apply_effects_to_frame(frame, config)` (file:1143) — applies blur (20 styles), watermark (chroma-key, animated), text overlay. Pure cv2/numpy, **but uses PyQt5 QtGui (QImage/QPainter) for text rasterization** (1547+). **Near-LOGIC.**
- **Depended on by:** main app (file:180 dialog, file:7004 renderer).
- **Reusable:** Renderer reusable if Qt text rasterization is decoupled; dialog is Qt-only.
- **Keep unchanged?** Renderer mostly; dialog no.

### `Effect.py` (1,012 lines) — **LOGIC**
Separate generic filter/preset library (color grade, cinematic, glitch, film grain, letterbox, **auto-text-blur**). Class hierarchy under `VideoEffect` (file:16); `EffectProcessor` (685) runs effects via ffmpeg `-vf` or cv2; `EFFECT_PRESETS`/`FFMPEG_EFFECTS` (871). No Qt.
- `AutoTextBlurEffect.detect_text_regions` (564) — **classical OpenCV** text-region heuristic (Canny→dilate→contours). **Not OCR.**
- **Depended on by:** main app (file:154), `Effect_Examples.py`.
- **Reusable:** **Directly reusable** — clean, portable, no UI.
- **Keep unchanged?** Yes.

### `Effect_Examples.py` (112 lines) — **TOOL (demo)**
Sample harness importing `Effect.py`. Not used at runtime. Disposable.

### `Gameplay_Recap_Tool.py` (890 lines) — **MIXED (standalone + embeddable)**
A complete `QMainWindow` app (own `__main__`, own `QSettings`) that is **also** imported by the main app (file:199). Pipeline: MoviePy audio extract → faster-whisper → Gemini/OpenAI script gen → edge_tts voiceover → ffmpeg hardsub. Uses MoviePy (different media stack from the main app's direct-ffmpeg).
- **Reusable:** Workers reusable if split from UI; currently logic and UI intermixed in QThreads.
- **Keep unchanged?** As a standalone tool, yes; for migration, refactor workers out.

**No OCR anywhere** — auto-blur is heuristic OpenCV only. The only `easyocr`/`tesseract` hits are in `venv_cpu/` third-party packages, unused.

---

## D. Licensing & key generation

### `License.py` (876 lines) — **MIXED**
Three-layer licensing: (1) crypto key validation `validate_key` (file:197), key format `HG-[b64]-[checksum]`, signing `_sign_payload` (166); (2) machine binding `get_machine_id` (63) via `wmic` BIOS/board/volume + registry MachineGuid (Windows-only); (3) online check `_call_google_script` (357) against a Google Apps Script. Anti-rollback via secure network time + triple last-run store; `LicenseActivationDialog` (573) is Qt UI.
- **Depended on by:** main app startup gate (file:14648), KeyGen.py.
- **Reusable:** Crypto/keygen/machine-ID logic reusable; **`get_machine_id` is Windows-only**; activation dialog is Qt.
- ⚠️ **Security:** signing secret is symmetric, only XOR-obfuscated (file:31–53), and **hardcoded in plaintext** in `google_sheets_keygen.gs` and compared in plaintext in the main app (file:14663). Hardcoded Apps Script URL (file:56). Anyone with the secret can forge keys.
- **Keep unchanged?** Logic yes (until redesigned to asymmetric signing); dialog no.

### `KeyGen.py` (385 lines) — **UI (admin)**
PyQt5 admin GUI; imports `generate_key`/`get_machine_id` from License.py. Produces `HG-...` tokens, copy-to-clipboard only.
- **Reusable:** No (UI-coupled admin tool).

### `google_sheets_keygen.gs` + `.html` — **TOOL (server)**
Google Apps Script keygen + license DB (sheet schema: Key/MachineID/Telegram/Expiry/Status) and a glassmorphism sidebar UI. `generateKeyGAS` (gs:106) re-implements License.generate_key.
- ⚠️ **Security:** signing secret hardcoded in plaintext (`gs:90`).
- **Reusable:** Replace with a real backend in any serious migration. Keygen logic is duplicated across 3 languages — must stay in lockstep or consolidate.

---

## E. Build, packaging & config

### `Build.py` (646) / `Build_FullOffline.py` (598) / `Build_Nuitka.py` (247) — **TOOL**
PyInstaller (first two) and Nuitka (third) builders. All exclude heavy ML libs from the analyzer then copy them post-build, and embed a real `python.exe`+stdlib into `_internal/` so the app can spawn subprocess workers. Full-offline bundles everything (~1.5–6 GB); Build.py supports a lightweight "standard" build.
- **Reusable:** Reference only — fragile hardcoded `C:\...\Python311` paths and manual lib lists.

### `generate_protected.py` (1.5 KB) / `pack_release.py` (1.9 KB) — **TOOL**
`generate_protected.py` base64-encodes the source into `AI_Video_Dubber_Protected.py` (runtime `exec(b64decode(...))`) — ⚠️ **obfuscation theater, not encryption.** `pack_release.py` orchestrates protect→build→zip.
- **Reusable:** Drop the base64 "protection"; the zip/release flow is reusable.

### `.spec` files (AI_Video_Dubber, _V2, _Pro, RVC_Backend) — **CONFIG**
PyInstaller specs with differing entry scripts, excludes, and bundled data. Embed absolute machine-specific paths — not portable. `RVC_Backend.spec` references `RVC_Backend.py` which is **not present** in the repo.

### Config / data files — **CONFIG**
- `version.json` — `{version: "2.0.0", url: GitHub release zip, changelog}`.
- `character_profiles.json` — `{name: {gender, ref_wav}}`; ref_wav paths are absolute under `reference_voices/` or user Music.
- `requirements_pyqt5.txt` / `Gameplay_Recap_Requirements.txt` — dependency lists (see DEPENDENCY_GRAPH.md).
- `License_Database.xlsx` — ⚠️ customer machine IDs + Telegram handles (PII) committed to repo.

---

## F. Model & data directories

| Dir | Contents | Notes |
|---|---|---|
| `models/` | faster-whisper HF cache (`hub/`), VoxCPM2 (`VoxCPM2/`), NLLB cache | gitignored |
| `demucs_models/` | Demucs weights (`htdemucs`/`mdx_extra`) | **empty** in repo, gitignored |
| `reference_voices/` | 3 sample WAVs for VoxCPM cloning | |
| `separated/` | Demucs output | gitignored |
| `bin/` | bundled ffmpeg/ffprobe | gitignored, on PATH |
| `obf/`, `obfuscated/`, `*.c` | pyarmor/Cython/Nuitka experiments | source-exposing |
