# DEPENDENCY_GRAPH.md

> Phase 1 — Dependency relationships (read-only analysis). Internal module imports, external libraries, runtime tools, cloud services, and data files.

## 1. Internal module import graph

```
                          main()  (entry)
                            │
                            ▼
              AI_Dubber_PyQt5_Complete.py ──────────────┐
                  │   │   │   │   │   │                  │
   ┌──────────────┘   │   │   │   │   └────────────┐     │
   ▼                  ▼   │   │   ▼                ▼     ▼
License.py     Effect.py  │   │  voxcpm_support.py  Gameplay_Recap_Tool.py
   ▲               ▲       │   │       │                  │
   │               │       │   │       ▼                  │ (own __main__,
KeyGen.py   Effect_Examples │  video_  voxcpm_worker_     │  also embeddable)
                            │  effects  script.py         │
                            │   .py                       │
                            ▼                             ▼
                  deep_translator              (faster_whisper, edge_tts,
                  (GoogleTranslator)            google.genai/openai, moviepy)

  Offline_Transcription.py ──► transcribe_worker_script.py
        ▲                              ▲
        │                              │
  (main app auto_transcribe,    Auto_SRT_Generator.py (standalone, own subprocess)
   BatchSRTWorker)

  download_model_direct.py  (standalone util → models/VoxCPM2/)
  Kh Audio Translator.py    (standalone → opens browser, no internal deps)
  test_gemini_context.py    (standalone test, hardcoded key)
```

**Guarded/optional imports in the main file** (each behind an `_AVAILABLE` flag):
`deep_translator` (146), `Effect` (153), `video_effects.VideoEffectsDialog` (179), `voxcpm_support` (191), `Gameplay_Recap_Tool` (199), `License` (inside `main()`/`__init__`). `VOICE_CLONE_AVAILABLE = False` (187, explicitly disabled).

## 2. "Depended on by" table

| Module | Imported by | Coupling |
|---|---|---|
| `License.py` | main app (startup gate), `KeyGen.py` | hard gate — app exits without it |
| `Effect.py` | main app, `Effect_Examples.py` | optional flag |
| `video_effects.py` | main app | optional flag |
| `voxcpm_support.py` | main app, `voxcpm_worker_script.py` | optional flag |
| `Gameplay_Recap_Tool.py` | main app (optional), self (`__main__`) | optional flag |
| `transcribe_worker_script.py` | `Offline_Transcription.py`, build scripts | subprocess target |
| `Offline_Transcription.py` | main app | QThread wrapper |
| `Effect_Examples.py` | nothing | demo only |

## 3. External Python dependencies (grouped)

From `requirements_pyqt5.txt` + `Gameplay_Recap_Requirements.txt` + observed imports:

| Group | Packages | Used by |
|---|---|---|
| **UI** | `PyQt5` | main app, dialogs, all workers, KeyGen, License dialog, Gameplay tool |
| **AI / ML** | `torch`, `torchaudio`, `faster-whisper`, `demucs`, `transformers` (NLLB), `groq`, `google-genai` / `openai`, `VoxCPM` (`openbmb/VoxCPM2`) | transcription, translation, TTS, vocal separation |
| **Media** | `opencv-python` (cv2), `Pillow`, `pydub`, `pygame`, `moviepy` (Gameplay only), `librosa`, `numpy` | preview, audio, effects, waveform |
| **TTS / translate** | `edge-tts`, `deep-translator` | dubbing, fallback translation |
| **Networking** | `requests` (lazy), `urllib` | Groq/Gemini REST, update check, license online check |
| **System** | `psutil`, stdlib (`subprocess`, `asyncio`, `multiprocessing`, `winreg`, `winsound`) | process mgmt, Windows integration |
| **Build** | `PyInstaller`, `Nuitka`, `pyarmor` (artifacts), base64 wrapper | packaging |

**Notably NOT used** despite appearing in URLs/text: `spleeter` (no), the `openai` *package* in the main app (the `/openai/v1/...` strings are Groq/Gemini OpenAI-compatible endpoints), `googletrans` (replaced by `deep-translator`), any OCR lib (`pytesseract`/`easyocr` only in unused venv packages).

## 4. Runtime tools (subprocess, not pip)

| Tool | Invoked from | Purpose |
|---|---|---|
| `ffmpeg` / `ffprobe` | main app export, `Effect.py`, `Gameplay_Recap_Tool.py`, `Auto_SRT_Generator.py`, `voxcpm_worker_script.py` | audio extract, silencedetect, mux, encode (`h264_nvenc`/`h264_mf`/`libx264`), atempo |
| `python -m demucs.separate` | main app | vocal separation |
| embedded `python.exe` | frozen build | spawn worker subprocesses |
| `pip` | `GPUSetupWorker` | install CUDA/CPU torch on demand |
| `wmic` | `License.py` | machine fingerprint |

**ffmpeg resolution:** bundled `bin/` is prepended to `PATH`; main app also sets `FFMPEG_BINARY`. The other call sites assume bare `ffmpeg` on PATH (no explicit path) — a latent inconsistency.

## 5. External cloud services

| Service | Used for | Auth |
|---|---|---|
| Groq API (`api.groq.com`) | LLM translation (`llama-3.3-70b`), Whisper STT (`whisper-large-v3`) | API key (settings) |
| Google Gemini (`generativelanguage.googleapis.com`) | translation, audio STT | API key(s) (settings) |
| Edge TTS (Microsoft) | dubbing audio | none (anonymous) |
| Google Translate (via deep-translator) | fallback translation | none |
| HuggingFace Hub | model downloads (whisper, NLLB, VoxCPM) | none |
| Google Apps Script | license activation/verify backend | hardcoded URL |
| WorldTimeAPI / timeapi.io | secure time (anti-rollback) | none |
| GitHub releases | auto-update (`version.json` + zip) | none |

## 6. Data / model files

| Path | Consumed by | In repo? |
|---|---|---|
| `~/.ai_video_dubber_settings.json` | settings load/save | runtime |
| `*.aivd` project files | open/save project | user |
| `./character_profiles.json` | voice resolution | yes (CWD) |
| `~/.ai_dubber_license.dat` + AppData + registry | License | runtime |
| `models/` (whisper hub, VoxCPM2, NLLB) | transcription/TTS/translation | gitignored |
| `demucs_models/` | vocal separation | empty |
| `reference_voices/*.wav` | VoxCPM cloning | yes (3 files) |
| `bin/ffmpeg` | all media ops | gitignored |
| `version.json` | update check | yes |
| `License_Database.xlsx` | issued keys (PII) | ⚠️ yes |

## 7. Coupling hotspots (for migration sequencing)

1. **`subtitle_table` is the de-facto data model** — nearly every algorithm reads/writes cells directly. Decoupling this into a plain subtitle data structure unblocks almost all logic extraction.
2. **License is a hard startup gate** in `main()` (file:14648) — must be preserved or replaced before the app boots at all.
3. **Subprocess isolation boundary** (whisper/demucs/voxcpm) is the cleanest existing seam — these workers are already near-services.
4. **Two effect renderers** (`apply_effects_to_frame` preview vs ffmpeg export `filter_complex`) share no code and can drift.
5. **Time codecs duplicated 4×** — a trivial first consolidation target.
