# ARCHITECTURE.md

> Phase 1 — Current-state architecture of the AI Video Dubber (read-only analysis).
> This describes the system **as it exists today**, not a proposed target. No code was changed.

## 1. High-level shape

```
                         ┌─────────────────────────────────────────┐
                         │   main()  (entry, file:14639)            │
                         │   • QApplication + Fusion style          │
                         │   • LICENSE GATE (hard, no bypass)        │
                         │   • instantiate AIVideoDubberApp          │
                         └───────────────────┬─────────────────────┘
                                             │
              ┌──────────────────────────────▼───────────────────────────────┐
              │   AIVideoDubberApp(QMainWindow)  (file:4801, ~7,000 lines)     │
              │   The monolith. Owns ALL state + ALL feature logic.           │
              │                                                                │
              │   State: current_video, srt_data, video_capture,              │
              │          subtitle_table, video_effects_config,                │
              │          character_profiles, undo/redo stacks                 │
              └───┬───────────────┬──────────────┬──────────────┬────────────┘
                  │               │              │              │
        ┌─────────▼──────┐ ┌──────▼──────┐ ┌─────▼──────┐ ┌─────▼─────────┐
        │  UI widgets    │ │ QThread     │ │  Dialogs   │ │ Settings /    │
        │  (Qt-bound)    │ │ workers (14)│ │  (~15)     │ │ persistence   │
        │  Timeline,     │ │ async jobs  │ │            │ │ JSON files    │
        │  VideoLabel,   │ │             │ │            │ │               │
        │  Waveform,     │ │             │ │            │ │               │
        │  table         │ │             │ │            │ │               │
        └────────────────┘ └──────┬──────┘ └────────────┘ └───────────────┘
                                  │
            ┌──────────────────────┼───────────────────────────────┐
            │       Subprocess isolation boundary (Windows CUDA)    │
            ▼                      ▼                                 ▼
   ┌────────────────┐   ┌────────────────────┐          ┌────────────────────┐
   │ faster-whisper │   │ Demucs             │          │ VoxCPM2            │
   │ (transcribe_   │   │ python -m demucs   │          │ (voxcpm_worker_    │
   │  worker_script)│   │ .separate          │          │  script.py)        │
   └────────────────┘   └────────────────────┘          └────────────────────┘

   External tools:  ffmpeg / ffprobe (subprocess, bundled bin/)
   Cloud APIs:      Groq · Gemini · Edge TTS · Google Translate · WorldTimeAPI
   License backend: Google Apps Script Web App
```

## 2. Process & threading model

- **Main thread:** Qt event loop, all widget rendering, `QTimer`-driven video playback (`_update_video_frame`, file:7036).
- **A dedicated asyncio loop thread** (`_start_async_loop_thread`, file:5104) services Edge TTS (`edge_tts` is async).
- **14 QThread workers** run blocking jobs and report via `progress`/`finished` `pyqtSignal`; cancellation via a `_cancelled` flag.
- **Subprocess isolation** is a deliberate architectural decision: faster-whisper, Demucs, and VoxCPM each run in a **separate Python process** to avoid Windows CUDA/OpenMP DLL conflicts (`WinError 1114`, OpenMP duplicate-lib crashes). Worker scripts do their own `os.add_dll_directory` / `KMP_DUPLICATE_LIB_OK=True` setup.

### QThread workers
| Worker | file:line | Job | Calls |
|---|---|---|---|
| `GPUSetupWorker` | 231 | Install CUDA/CPU torch | `pip` subprocess |
| `ExportWorker` | 639 | TTS gen + mux + sync verify | `edge_tts`, `ffmpeg`, `pydub`, `torchaudio` |
| `GroqTranscriptionWorker` | 2830 | Cloud STT | Groq REST |
| `GeminiTranscriptionWorker` | 2875 | Cloud STT + translate | Gemini REST |
| `TranslateWorker` | 3030 | Translate subtitles | NLLB / Groq / Gemini / Google |
| `SilenceDetectWorker` | 3719 | Split by silence | `pydub` / ffmpeg |
| `BatchVideoToMP3Worker` | 3818 | Bulk video→MP3 | `ffmpeg` |
| `UpdateCheckWorker` | 3895 | Check version.json | `requests` |
| `UpdateDownloadWorker` | 3947 | Download update | `requests` |
| `RowTTSPreviewWorker` | 4006 | Single-row preview | `edge_tts` |
| `DubPreviewWorker` | 4045 | Pre-generate dub clips | `edge_tts`, `pydub` |
| `BatchSRTWorker` | 4398 | Batch transcription | offline Whisper |
| `VoxCPMWorker` | 13342 | Neural TTS | `voxcpm_support` |
| `VoxCPMBatchWorker` | 13383 | Batch neural TTS | `voxcpm_support` |

## 3. UI structure

`QMainWindow` → horizontal `QSplitter` (left 420 : right 780), file:5119.

- **Left panel** (`_create_left_panel`, 5145): video preview (`InteractiveVideoLabel`, file:4118 — draws draggable/resizable effect overlays), playback controls, tools grid (Auto-Sync, Auto-Speed, Merge, Video Effects, GPU Setup), GPU checkbox.
- **Right panel** (`_create_right_panel`, 5417): translation controls, the 11-column `subtitle_table` (Start/End/Text/Pitch/Speed/Vol/Voice/Play/Audio/DL/Echo), and the embedded `TimelineWidget` (file:2403 — custom-painted, pan/drag timeline).
- **`_WaveformCanvas`** (file:12046): animated audio waveform.
- **~15 dialogs:** GPUSetup, BatchSRT, ExportProgress, ExportOptions, UserGuide, FindReplace, Settings, EffectSelection, VoxCPMVoicePicker, VoxCPMTool, CharacterManager.

## 4. Data flow — the dub pipeline

```
Load video (cv2.VideoCapture)
   │
   ├─► [optional] Auto-transcribe ──► whisper/groq/gemini ──► segments {start,end,text}
   │                                                              │
   │                                                              ▼
   │                                              subtitle_table (11 cols) ◄─── Import SRT
   │                                                              │
   ├─► Translate ──► NLLB→Groq→Gemini→Google ──► {text, gender, emotion} per row
   │                                                              │
   ├─► Auto-speed / merge / sync / shift (pure algorithms on rows)│
   │                                                              ▼
   ├─► Per-row TTS ──► Edge TTS  OR  voxcpm2:<prompt> (cloning) ──► audio clips
   │                       (gender + emotion drive voice & speed)
   │                                                              │
   ├─► [optional] Demucs vocal separation ──► background track    │
   │                                                              ▼
   └─► Export: ffmpeg filter_complex  (adelay sync + watermark + blur + text PNG overlay
                + scale + h264_nvenc | h264_mf | libx264, aac 320k)  ──►  final .mp4 / .mp3
```

## 5. Persistence

| Store | Location | Format | Written by |
|---|---|---|---|
| App settings | `~/.ai_video_dubber_settings.json` | JSON | `_save_settings` (6308) |
| Project file | `*.aivd` (user-chosen) | JSON `{video, subtitles[][]}` | `_save_to_file` (11659) |
| Auto-save | `<temp>/autosave_project.aivd` | JSON | `auto_save_project` (11686), every 5 min |
| Character profiles | `./character_profiles.json` (CWD) | JSON `{name:{gender,ref_wav}}` | `_save_character_profiles` (7578) |
| License state | `~/.ai_dubber_license.dat` + AppData + registry | custom | `License.py` |
| Status flags | `startup_torch_status.txt`, `transcription_import_status.txt` | text | bootstrap / workers |

**Inconsistency:** settings live in `~` but `character_profiles.json` and error logs are written to the **current working directory** — fragile when launched from an arbitrary folder.

## 6. Cross-cutting bootstrapping (file:1–138, runs before everything)

1. `KMP_DUPLICATE_LIB_OK=True` (OpenMP crash guard).
2. `multiprocessing.freeze_support()` + PyInstaller child-process suppression (prevents recursive GUI spawn).
3. UTF-8 wrap of stdout/stderr.
4. Frozen-build path setup; `bin/` prepended to PATH; **torch DLL injection** via `os.add_dll_directory`.
5. `subprocess.run`/`Popen` monkey-patched with `CREATE_NO_WINDOW` (no console flashes).

## 7. Architectural observations

- **Monolith:** one ~7,000-line class owns all state and logic; algorithms are interleaved with `subtitle_table` widget access rather than a data model.
- **No service boundary:** business logic and Qt are not separated — the table *is* the model.
- **Subprocess-as-isolation** is the only real module boundary, and it exists for DLL-stability reasons, not design.
- **Duplication:** time codecs in 4 places (207/217, 840/844, 9931/9935, 3110); translation engine logic implemented twice; two effect renderers (preview cv2/Qt vs export ffmpeg) that can drift.
- **Windows-bound** throughout (`wmic`, `winreg`, `winsound`, `CREATE_NO_WINDOW`, `os.startfile`).
