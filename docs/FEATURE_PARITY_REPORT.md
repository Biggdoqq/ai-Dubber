# Feature Parity Report — Legacy PyQt5 vs New React/FastAPI

**Generated:** 2026-07-01
**Purpose:** Complete feature inventory of the legacy PyQt5 application compared against the new FastAPI backend + React frontend. This is a read-only audit; no code was modified.

**Conclusion up front:** The migration is **NOT complete**. The new app covers the core subtitle → translate → TTS → MP3-dub loop well, but a large set of legacy capabilities are missing — most significantly **all video export and video effects**, **Demucs vocal separation**, **batch tools**, **project/character UI**, the **Gameplay Recap tool**, **licensing**, and many per-row/editing features.

## Legend

- **Backend?** — Is the capability implemented in `backend/services/` or `backend/core/`?
- **API?** — Is there a REST endpoint in `backend/api/` exposing it?
- **React UI?** — Is there a control in `frontend/src/` that uses it?
- **Status:** ✅ Complete · ⚠ Partial · ❌ Missing

Legacy file shorthand: `MAIN` = `AI_Dubber_PyQt5_Complete.py`.

---

## 1. Project & File Management

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| New Project | Reset workspace to empty | MAIN `new_project` (5960) | ❌ | ❌ | ❌ | ❌ Missing |
| Open Project (.aivd) | Load video + subtitle table from JSON | MAIN `open_project`/`_save_to_file` (11642) | ✅ `Project.from_aivd` | ✅ `GET /api/projects/open` | ❌ no Open UI | ⚠ Partial |
| Save / Save As (.aivd) | Persist project to JSON | MAIN `save_project` (5972) | ✅ `Project.to_aivd` | ✅ `POST /api/projects/save` | ❌ no Save UI | ⚠ Partial |
| Autosave (5 min) | Periodic autosave to temp | MAIN `auto_save_project` (11686) | ❌ | ❌ | ❌ | ❌ Missing |
| Import SRT | Load `.srt` into table | MAIN `import_srt` (6122) | ✅ `parse_srt` | ✅ `POST /api/srt/parse` | ✅ Toolbar | ✅ Complete |
| Export SRT | Save table to `.srt` | MAIN `export_srt` (6123) | ✅ `build_srt` | ✅ `POST /api/srt/build` | ✅ Toolbar | ✅ Complete |
| Load Video | Open a video for preview | MAIN `load_video_dialog` (6121) | ✅ media upload | ✅ `POST /api/media/upload` | ✅ Toolbar | ✅ Complete |
| Settings persistence | Read/write `~/.ai_video_dubber_settings.json` | MAIN `_load/_save_settings` (6260) | ✅ `settings_service` | ✅ `GET/PUT /api/settings` | ⚠ partial (4 of ~18 keys) | ⚠ Partial |

## 2. Video Playback

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| Video preview / playback | Play/pause/stop, seek | MAIN `_update_video_frame` (7036) | n/a (client) | ✅ `GET /api/media/stream` (range) | ✅ `VideoPlayer.tsx` | ✅ Complete |
| Seek scrubber + clock | Timeline scrub, time display | MAIN playback controls (5340) | n/a | ✅ stream | ✅ `VideoPlayer.tsx` | ✅ Complete |
| Original audio volume | Adjust original track volume | MAIN `_on_volume_changed` | n/a | n/a | ✅ volume slider (0–150) | ✅ Complete |
| Click row → seek video | Jump playhead to subtitle time | MAIN `on_cell_clicked` (9526) | n/a | n/a | ✅ Start cell click-to-seek | ✅ Complete |
| Active-row highlight | Highlight row at playhead | MAIN `_update_treeview_highlight` (9939) | n/a | n/a | ✅ activeRow highlight | ✅ Complete |
| Frame stepping | Step single frames | MAIN `_update_video_frame` | ❌ | ❌ | ❌ | ❌ Missing |
| Waveform display | Audio waveform canvas | MAIN `_generate_waveform_data` (7324), `_WaveformCanvas` (12046) | ❌ | ❌ | ❌ | ❌ Missing |
| Timeline editor (3-track) | Waveform/subtitle/dub tracks, drag/resize/pan/zoom | MAIN `TimelineWidget` (2403), `_create_timeline_group` (5667) | ❌ | ❌ | ❌ | ❌ Missing |
| Dub preview during playback | Play generated TTS per row while playing | MAIN `prepare_dub_preview` (10236), `DubPreviewWorker` (4045) | ❌ | ❌ | ❌ | ❌ Missing |

## 3. Subtitle Table & Editing

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| Start / End / Text columns | Core subtitle fields, editable | MAIN table (5530) | ✅ model | ✅ srt routes | ✅ `SubtitleTable.tsx` | ✅ Complete |
| Speed column | Per-row TTS speed | MAIN col 4 | ✅ model | ✅ | ✅ editable | ✅ Complete |
| Volume column | Per-row volume % | MAIN col 5 | ✅ model | ✅ | ✅ editable | ✅ Complete |
| Voice column | Per-row voice selection | MAIN col 6, `_show_row_voice_picker` (7628) | ✅ model | ✅ voices | ✅ select dropdown | ✅ Complete |
| Echo column | Per-row echo amount | MAIN col 10 | ✅ model + export | ✅ | ✅ editable | ✅ Complete |
| Pitch column | Per-row pitch | MAIN col 3 | ✅ `tts_service._pitch_str` applies pitch + question +25Hz | ✅ carried & applied | ✅ editable column in `SubtitleTable.tsx` | ✅ Complete |
| Play (per-row TTS preview) | ▶ button generates+plays clip | MAIN col 7 (10045) | ✅ tts preview | ✅ `POST /api/tts/preview` | ✅ ▶ button | ✅ Complete |
| Audio column (custom/cloned path) | Attach custom audio file per row | MAIN col 8 | ❌ | ❌ | ❌ | ❌ Missing |
| DL column | Download per-row audio | MAIN col 9 | ❌ | ❌ | ❌ | ❌ Missing |
| Gender / Emotion | Detected per-row metadata | MAIN translate (10615) | ✅ written by translate + analyze_gender | ✅ carried in model + schema | ✅ Gender select + Emotion field in `SubtitleTable.tsx` | ✅ Complete |
| Insert / Delete row | Add/remove subtitle rows | MAIN `_hotkey_delete_row` (6009) | ❌ | ❌ | ❌ | ❌ Missing |
| Row drag-reorder | Reorder rows by drag | MAIN internal-move (5605) | ❌ | ❌ | ❌ | ❌ Missing |
| Merge rows | Merge consecutive rows | MAIN `merge_selected_rows` | ✅ `merge_rows` | ✅ `POST /api/subtitles/merge` | ✅ Toolbar | ✅ Complete |
| Shift times | Nudge times ±offset | MAIN `shift_selected_times` (5775) | ✅ `shift_times` | ✅ `POST /api/subtitles/shift` | ❌ API exists, not called | ⚠ Partial |
| Auto-speed (smart fit) | Fit TTS speed to duration (cps) | MAIN `auto_speed_dialog` (9735) | ✅ `smart_auto_speed` | ✅ `POST /api/subtitles/auto-speed` | ✅ Toolbar | ✅ Complete |
| Auto-split long rows | Split rows > N chars | MAIN `auto_split_long_rows` (6842) | ❌ | ❌ | ❌ | ❌ Missing |
| Auto-sync | Sync subtitle timing | MAIN `auto_sync_dialog` | ❌ | ❌ | ❌ | ❌ Missing |
| Smart Sync (selected) | Smart timing sync on selection | MAIN `smart_sync_selected` | ❌ | ❌ | ❌ | ❌ Missing |
| Find & Replace | Search/replace in text | MAIN `FindReplaceDialog` (12750) | ❌ | ❌ | ❌ | ❌ Missing |
| Undo / Redo | Multi-action undo stack | MAIN `undo`/`redo` (9557/9635) | ❌ | ❌ | ❌ | ❌ Missing |
| Stats bar | Row/dubbed/empty/duration counts | MAIN `_update_stats_bar` (5617) | ❌ | ❌ | ❌ | ❌ Missing |

## 4. Transcription (Speech → Text)

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| Offline faster-whisper | Subprocess Whisper, CPU int8 / GPU float16, auto-fallback | MAIN `auto_transcribe` (10671), `Offline_Transcription.py`, `transcribe_worker_script.py` | ✅ `transcribe_offline` | ✅ `POST /api/transcribe` | ✅ Transcribe button | ✅ Complete |
| Whisper model size | tiny/base/small/medium/large-v2 | MAIN settings; `Offline_Transcription` | ✅ param | ✅ param | ✅ Settings dialog | ✅ Complete |
| GPU toggle | Use CUDA for transcription | MAIN `cb_use_gpu` (5242) | ✅ `use_gpu` param | ✅ param | ❌ not exposed | ⚠ Partial |
| Groq cloud transcription | Whisper-large-v3 via Groq | MAIN `GroqTranscriptionWorker` (2830) | ✅ `transcribe_groq` | ⚠ engine param exists, route hardcodes whisper | ❌ not selectable | ⚠ Partial |
| Gemini transcription | Audio transcription via Gemini | MAIN `GeminiTranscriptionWorker` (2875) | ❌ | ❌ | ❌ | ❌ Missing |
| Auto split by silence | FFmpeg silencedetect → rows | MAIN `auto_split_by_silence` (7360), `SilenceDetectWorker` (3719) | ❌ | ❌ | ❌ | ❌ Missing |
| Batch SRT generator | Drag-drop batch video → .srt | MAIN `BatchSRTDialog` (4544); `Auto_SRT_Generator.py` | ❌ | ❌ | ❌ | ❌ Missing |

## 5. Translation

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| Google Translate | Free engine (deep-translator) | MAIN `TranslateWorker` (3030) | ✅ | ✅ `POST /api/translate` | ✅ engine select | ✅ Complete |
| Groq LLM translate | llama-3.3-70b, 429 backoff, Google fallback | MAIN `TranslateWorker` | ✅ | ✅ | ✅ engine select | ✅ Complete |
| Gemini translate | Multi-key, JSON schema, key rotation | MAIN `TranslateWorker` | ✅ | ✅ | ✅ engine select | ✅ Complete |
| NLLB-200 offline | Local transformers translation | MAIN `TranslateWorker` | ⚠ code present, `transformers` not in venv | ✅ | ✅ engine select | ⚠ Partial |
| Source/target language | Language pair selection | MAIN `translation_languages_full` (5069) | ✅ params | ✅ params | ✅ `TranslationPanel.tsx` (13 langs) | ✅ Complete |
| Gender + emotion detection | LLM tags gender/emotion → voice/speed | MAIN translate (10615) | ✅ in service | ✅ returned | ❌ not surfaced in UI | ⚠ Partial |
| Syllable→duration fitting | Prompt fits translation to time | MAIN translate prompt | ✅ in prompt | ✅ | n/a (automatic) | ✅ Complete |
| Translate selected only | Translate subset of rows | MAIN "Selected Only" (5424) | ⚠ row list supported | ✅ rows param | ❌ translates all | ⚠ Partial |
| Custom instructions / glossary | User translation rules | MAIN settings (advanced) | ✅ `custom_instructions` param | ✅ param | ❌ no input field | ⚠ Partial |
| Translation style | Default/Formal/Casual/Movie/Youthful | MAIN settings | ❌ setting unused | ❌ | ❌ | ❌ Missing |
| Apply Auto Gender | Pitch-analyze rows → gender | MAIN `apply_auto_gender`, `_analyze_audio_pitch_for_row` (8062) | ❌ | ❌ | ❌ | ❌ Missing |
| AI Spell Check | LLM round-trip spell correction | MAIN `spell_check_subtitles` (7764) | ❌ | ❌ | ❌ | ❌ Missing |
| Batch Translate SRT | Translate many .srt files | MAIN `batch_translate_srt` (8319) | ❌ | ❌ | ❌ | ❌ Missing |

## 6. Text-to-Speech (TTS)

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| Edge TTS | Free neural voices (Khmer/English), rate from speed | MAIN `_generate_edge_tts` (10252) | ✅ `generate_edge_tts` | ✅ via preview/export | ✅ voice select + preview | ✅ Complete |
| Question pitch (+25Hz) | Raise pitch on question lines | MAIN edge TTS (10252) | ❌ forces +0Hz | ❌ | ❌ | ❌ Missing |
| VoxCPM2 neural cloning | Offline voice clone TTS | `voxcpm_support.py`, `voxcpm_worker_script.py`; MAIN `VoxCPMWorker` (13342) | ⚠ worker wired, pkg+4.7GB model not bundled | ✅ via preview/export | ⚠ voices listed if importable | ⚠ Partial |
| VoxCPM voice presets | ~34 character/drama/tiktok presets | `voxcpm_support.py` `VOXCPM_VOICE_OPTIONS` (282) | ✅ list exposed | ✅ `GET /api/system/voices` | ⚠ shown only if module imports | ⚠ Partial |
| VoxCPM reference-wav cloning | Clone from sample WAV | `voxcpm_support.py` (914) | ✅ export `_resolve_voice` | ⚠ preview ignores ref_wav | ❌ no clone UI | ⚠ Partial |
| Per-row TTS preview | Generate+play single row | MAIN `preview_row_tts` (10105) | ✅ | ✅ `POST /api/tts/preview` | ✅ ▶ button | ✅ Complete |
| Full dub preview | Pre-generate all rows | MAIN `prepare_dub_preview` (10236) | ❌ | ❌ | ❌ | ❌ Missing |
| Inner-voice effect | Detect (),[],** → soft + echo | MAIN `_detect_inner_voice` (848) | ❌ | ❌ | ❌ | ❌ Missing |
| Apply voice/speed/echo to all | Bulk-apply timeline controls | MAIN timeline group (5667) | ❌ | ❌ | ❌ | ❌ Missing |
| VoxCPM Studio | Standalone + project TTS studio dialog | MAIN `VoxCPMToolDialog` (13575) | ❌ | ❌ | ❌ | ❌ Missing |
| VoxCPM model download | Resumable 4.7GB model fetch | `voxcpm_support.ensure_voxcpm_model_downloaded` (762), `download_model_direct.py` | ❌ | ❌ | ❌ | ❌ Missing |

## 7. Export

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| MP3 dub export | Assemble TTS clips → 320k MP3, auto-sync, echo, volume | MAIN `_execute_mp3_export` (2095) | ✅ `export_mp3` | ✅ `POST /api/export/mp3` | ✅ Export MP3 button | ✅ Complete |
| **Video export (.mp4)** | TTS + mux + filter_complex adelay sync | MAIN `_execute_video_export` (909), `ExportWorker` (639) | ❌ | ❌ | ❌ | ❌ Missing |
| Export options dialog | Quality preset (Mobile/720/1080/4K/Original) | MAIN `ExportOptionsDialog` (12346) | ❌ | ❌ | ❌ | ❌ Missing |
| Burn subtitles (hardsub) | .ass generation, font/pos/color | MAIN export (909) | ❌ | ❌ | ❌ | ❌ Missing |
| GPU/CPU encoder | h264_nvenc → h264_mf → libx264 | MAIN export | ❌ | ❌ | ❌ | ❌ Missing |
| Post-export sync verify | RMS energy per-clip check | MAIN `_verify_sync` (2311) | ❌ | ❌ | ❌ | ❌ Missing |
| Pause/resume export | Suspend export process | MAIN `ExportProgressDialog` (12144) | ❌ (cancel only) | ⚠ job cancel only | ⚠ cancel only | ⚠ Partial |
| Batch video export | Folder/manual, auto-pair video+SRT, concat | MAIN `batch_videos` (8536) | ❌ | ❌ | ❌ | ❌ Missing |
| Batch video → MP3 | Bulk extract audio | MAIN `BatchVideoToMP3Worker` (3818) | ❌ | ❌ | ❌ | ❌ Missing |

## 8. Video Effects

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| Watermark/logo overlay | Image/video watermark, scale/rotate/opacity/position | `video_effects.py` (294) | ❌ | ❌ | ❌ | ❌ Missing |
| Watermark chroma-key | Green/blue/black/white key removal | `video_effects.py` (1322) | ❌ | ❌ | ❌ | ❌ Missing |
| Watermark animations (20) | Pulse, spin, bounce, orbit, etc. | `video_effects.py` (1343) | ❌ | ❌ | ❌ | ❌ Missing |
| Watermark style filters (20) | Vibrant, cyberpunk, neon, etc. | `video_effects.py` (1444) | ❌ | ❌ | ❌ | ❌ Missing |
| Region blur (20 styles) | Rect/circle blur, mosaic, motion, etc. | `video_effects.py` (1152) | ❌ | ❌ | ❌ | ❌ Missing |
| Text overlay | Fonts (Win registry), size/pos/rotate | `video_effects.py` (709) | ❌ | ❌ | ❌ | ❌ Missing |
| Text color styles (21) | Gradients, neon, fire, rainbow, etc. | `video_effects.py` (811) | ❌ | ❌ | ❌ | ❌ Missing |
| Text bg boxes (20) | Glassmorphism, VHS, cinema bar, etc. | `video_effects.py` (914) | ❌ | ❌ | ❌ | ❌ Missing |
| Text shadow/glow (20) | TikTok glow, neon, 3D shadow, etc. | `video_effects.py` (929) | ❌ | ❌ | ❌ | ❌ Missing |
| Text animations (20) | Scroll, bounce, typewriter, etc. | `video_effects.py` (1560) | ❌ | ❌ | ❌ | ❌ Missing |
| Interactive overlay editor | Drag/resize overlays on preview | MAIN `InteractiveVideoLabel` (4118) | ❌ | ❌ | ❌ | ❌ Missing |
| Generic filter library | Color/cinematic/glitch/grain/letterbox | `Effect.py` (28–513) | ❌ | ❌ | ❌ | ❌ Missing |
| Effect presets (12) | Cinematic Warm, Noir, Vintage, etc. | `Effect.py` `EFFECT_PRESETS` (871) | ❌ | ❌ | ❌ | ❌ Missing |
| FFmpeg effects | brightness/contrast/blur/vignette/etc. | `Effect.py` `EffectProcessor` (685) | ❌ | ❌ | ❌ | ❌ Missing |
| Auto text-blur detection | OpenCV text-region detect + blur | `Effect.py` `AutoTextBlurEffect` (548) | ❌ | ❌ | ❌ | ❌ Missing |
| Effect selection dialog | Pick presets/ffmpeg effects | MAIN `EffectSelectionDialog` (13194) | ❌ | ❌ | ❌ | ❌ Missing |
| video_effects_config persistence | Stores effect config in settings | MAIN settings | ⚠ key stored, never rendered | ⚠ stored | ❌ | ⚠ Partial |

## 9. Audio Processing

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| Demucs vocal separation | Remove original vocals (mdx_extra, GPU/CPU) | MAIN `remove_vocal_from_video` (10843) | ❌ | ❌ | ❌ | ❌ Missing |
| Noise reduction | noisereduce / FFmpeg afftdn on BG | MAIN `_apply_noise_reduction` (2028) | ❌ | ❌ | ❌ | ❌ Missing |
| BG volume / mix controls | Background track gain | MAIN timeline group (5667) | ❌ | ❌ | ❌ | ❌ Missing |
| Audio delay offset | Global dub delay (default 80ms) | MAIN bottom bar (5775) | ✅ `audio_start_offset_ms` | ✅ export param | ✅ Toolbar delay (ms) input, passed to `exportMp3` | ✅ Complete |
| Pitch-based gender analysis | librosa yin + HPSS per row | MAIN `_analyze_audio_pitch_for_row` (8062) | ❌ | ❌ | ❌ | ❌ Missing |

## 10. Character Profiles

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| Character profiles storage | name → {gender, ref_wav} JSON | MAIN `_load/_save_character_profiles` (7566) | ✅ `settings_service` | ✅ `GET/PUT /api/settings/characters` | ❌ no UI (client fn unused) | ⚠ Partial |
| Character Manager dialog | Add/edit chars, MP3→WAV, sample play | MAIN `CharacterManagerDialog` (14323) | ❌ | ❌ | ❌ | ❌ Missing |
| Character voice resolution | Map char name → ref_wav at export | MAIN `_resolve_character_voice` (11342) | ✅ export `_resolve_voice` | n/a internal | n/a | ⚠ Partial |

## 11. Standalone Tools

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| Gameplay Recap (TikTok) | STT/vision → LLM script → edge TTS → hardsub | `Gameplay_Recap_Tool.py` (whole) | ❌ | ❌ | ❌ | ❌ Missing |
| — Analysis modes | Listen / Watch (Gemini vision) / Watch+Listen | `Gameplay_Recap_Tool.py` (18) | ❌ | ❌ | ❌ | ❌ Missing |
| — Word-level TikTok subs | 3-word chunk timing via word timestamps | `Gameplay_Recap_Tool.py` (212) | ❌ | ❌ | ❌ | ❌ Missing |
| — BGM mixing + hardsub | Background music + burned subs | `Gameplay_Recap_Tool.py` (154) | ❌ | ❌ | ❌ | ❌ Missing |
| Kh Audio Translator | Opens hosted web app in browser | `Kh Audio Translator.py`; MAIN (6126) | ❌ | ❌ | ❌ | ❌ Missing (disposable) |
| GPU Setup (PyTorch install) | Install CUDA/CPU torch, Demucs, whisper via pip | MAIN `GPUSetupDialog` (447), `GPUSetupWorker` (231) | ❌ | ❌ | ❌ | ❌ Missing |

## 12. Updates, Licensing, Help

| Feature | Description | Legacy file(s) | Backend? | API? | React UI? | Status |
|---|---|---|---|---|---|---|
| Auto-update check/download | version.json check, download + updater.bat | MAIN `UpdateCheckWorker` (3895), `_launch_updater` (6484) | ❌ | ❌ | ❌ | ❌ Missing |
| License activation | Machine-locked signed key + online verify | `License.py` (whole); MAIN gate (14648) | ❌ | ❌ | ❌ | ❌ Missing |
| Machine ID binding | BIOS/board/volume + registry | `License.py` `get_machine_id` (63) | ❌ | ❌ | ❌ | ❌ Missing |
| Anti-rollback / offline grace | Multi-channel last-run, 7-day grace | `License.py` (282) | ❌ | ❌ | ❌ | ❌ Missing |
| Admin key generator | Generate HG-keys, durations/presets | `KeyGen.py`; `google_sheets_keygen.gs` | ❌ | ❌ | ❌ | ❌ Missing (admin tool) |
| User Guide | 5-tab Khmer HTML guide | MAIN `UserGuideDialog` (12536) | ❌ | ❌ | ❌ | ❌ Missing |
| About dialog | Version + license info | MAIN `show_about` (7790) | ❌ | ❌ | ❌ | ❌ Missing |
| Keyboard shortcuts | Hotkeys + reference dialog | MAIN `keyPressEvent` (11940) | ❌ | ❌ | ⚠ click-to-seek only | ❌ Missing |
| i18n English/Khmer | UI language toggle | MAIN `self.i18n` (4964) | ❌ | ❌ | ❌ | ❌ Missing |
| Theme toggle (light/dark) | Sci-Fi HUD / light theme | MAIN `_apply_theme` (6538) | ❌ | ❌ | ⚠ dark-only static | ⚠ Partial |

---

## Summary Counts

| Status | Count (approx.) |
|---|---|
| ✅ Complete | ~22 |
| ⚠ Partial | ~24 |
| ❌ Missing | ~58 |

## Biggest Gaps (by impact)

1. **Video export pipeline** — the entire `.mp4` render path (TTS mux, `filter_complex` adelay sync, GPU encoders, burn-subtitles, quality presets, sync verification) is absent. The new app only exports MP3 audio.
2. **Video effects** — neither `video_effects.py` (interactive watermark/blur/text editor, ~120 styles total) nor `Effect.py` (filter library, presets, auto-text-blur) has any backend, API, or UI.
3. **Demucs vocal separation + noise reduction** — no backend or endpoint.
4. **Batch tools** — Batch SRT generator, Batch Translate SRT, Batch Videos, Batch Video→MP3 all missing.
5. **Editing depth** — undo/redo, find/replace, insert/delete/reorder rows, auto-sync, auto-split, stats bar, timeline/waveform are all missing.
6. **Project & Character UI** — backend + API exist for projects and character profiles, but there is no React UI to use them.
7. **Gameplay Recap tool** — entire standalone pipeline not ported.
8. **Secondary engines** — Gemini transcription missing; Groq transcription and NLLB present but not selectable/runnable; per-row pitch and question-pitch not applied.
9. **Auxiliary systems** — licensing, auto-update, GPU setup, user guide, i18n, theme toggle not ported (some intentionally out of scope for a web app).

## Notes on "Partial" classifications

- Several capabilities exist in the **backend/API but have no React control** (project save/open, character profiles, subtitle shift, custom translation instructions, GPU transcription toggle, audio delay offset). These are the cheapest parity wins — wiring only.
- **VoxCPM** and **NLLB** are code-complete but not runnable in the current bundle (missing package/model in `venv_cpu` / release). Marked ⚠ for that reason.
- **Pitch / gender / emotion** flow through the data model but are not displayed/edited in the table and (for pitch) not applied during TTS.
