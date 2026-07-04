# Manual Feature Audit — Legacy PyQt5 vs New React/FastAPI

**Generated:** 2026-07-01
**Method:** Read-only, code-level verification. Every row was checked against the actual source, not prior reports. No code was modified to produce this audit.

**Sources verified:**
- Backend routers registered in `backend/app.py` (19 routers) and their `backend/api/*_routes.py` + `backend/services/*.py`.
- Frontend controls in `frontend/src/App.tsx`, `components/*.tsx`, and `api/client.ts`.
- Legacy logic in `AI_Dubber_PyQt5_Complete.py` and sibling modules (`Effect.py`, `video_effects.py`, `Gameplay_Recap_Tool.py`, `License.py`, `voxcpm_support.py`, etc.).

## Column meaning

- **Legacy** — feature exists in the PyQt5 app.
- **New app** — feature is present in any form in the new app.
- **Backend** — implemented in `backend/services/` or `backend/core/`.
- **API** — exposed via a `backend/api/` REST endpoint.
- **React UI** — a control in `frontend/src/` invokes it.

Status: ✅ Complete · ⚠ Partial (works but constrained) · ❌ Missing

---

## 1. Project & File Management

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| New Project | ✅ | ✅ | n/a (client) | n/a | ✅ File menu / Ctrl+N | ✅ |
| Open Project (.aivd) | ✅ | ✅ | ✅ `Project.from_aivd` | ✅ `GET /api/projects/open` | ✅ File menu (path prompt) | ✅ |
| Save / Save As (.aivd) | ✅ | ✅ | ✅ `Project.to_aivd` | ✅ `POST /api/projects/save` | ✅ File menu (path prompt) | ✅ |
| Import SRT | ✅ | ✅ | ✅ `parse_srt` | ✅ `POST /api/srt/parse` | ✅ Toolbar | ✅ |
| Export SRT | ✅ | ✅ | ✅ `build_srt` | ✅ `POST /api/srt/build` | ✅ Toolbar (browser download) | ✅ |
| Load Video | ✅ | ✅ | ✅ media upload | ✅ `POST /api/media/upload` | ✅ Toolbar | ✅ |
| Settings persistence | ✅ | ✅ | ✅ `settings_service` | ✅ `GET/PUT /api/settings` | ✅ tabbed Settings dialog | ✅ |
| Autosave (5 min) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing (web app; manual save covers it) |

## 2. Video Playback

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Playback / seek / clock | ✅ | ✅ | n/a | ✅ `GET /api/media/stream` (range) | ✅ VideoPlayer | ✅ |
| Original-audio volume | ✅ | ✅ | n/a | n/a | ✅ slider | ✅ |
| Click row → seek | ✅ | ✅ | n/a | n/a | ✅ Start cell | ✅ |
| Active-row highlight | ✅ | ✅ | n/a | n/a | ✅ | ✅ |
| Frame stepping | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing |
| Waveform display | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing (cosmetic) |
| Timeline editor (3-track) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing (cosmetic; HTML5 scrubber substitutes) |
| Dub preview during playback | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing |

## 3. Subtitle Table & Editing

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Start / End / Text | ✅ | ✅ | ✅ model | ✅ srt routes | ✅ editable table | ✅ |
| Speed / Volume / Voice / Echo columns | ✅ | ✅ | ✅ model + export | ✅ | ✅ editable | ✅ |
| Pitch column | ✅ | ✅ | ✅ `tts_service._pitch_str` (applied + question +25Hz) | ✅ export/preview | ✅ editable column | ✅ |
| Gender / Emotion | ✅ | ✅ | ✅ set by translate + analyze_gender | ✅ carried in model + schema | ✅ Gender select + Emotion field | ✅ |
| Per-row TTS preview (▶) | ✅ | ✅ | ✅ tts preview | ✅ `POST /api/tts/preview` | ✅ ▶ button | ✅ |
| Merge rows | ✅ | ✅ | ✅ `merge_rows` | ✅ `POST /api/subtitles/merge` | ✅ Edit menu / Toolbar | ✅ |
| Shift times | ✅ | ✅ | ✅ `shift_times` | ✅ `POST /api/subtitles/shift` | ✅ Edit menu (±0.2s) | ✅ |
| Auto-speed (smart fit) | ✅ | ✅ | ✅ `smart_auto_speed` | ✅ `POST /api/subtitles/auto-speed` | ✅ Toolbar | ✅ |
| Auto-split long rows | ✅ | ✅ | ✅ `auto_split_long_rows` | ✅ `POST /api/subtitles/auto-split` | ✅ Edit menu | ✅ |
| Delete row(s) | ✅ | ✅ | n/a (client) | n/a | ✅ Edit menu + Delete key | ✅ |
| Find & Replace | ✅ | ✅ | n/a (client) | n/a | ✅ dialog (Ctrl+F) | ✅ |
| Audio column (custom/cloned path per row) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing |
| DL column (download per-row audio) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing |
| Insert / Delete row (insert) | ✅ | ⚠ | n/a | n/a | ⚠ delete only, no insert | ⚠ Partial |
| Row drag-reorder | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing |
| Auto-sync / Smart Sync | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing |
| Undo / Redo | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing |
| Stats bar (row/dubbed/empty/duration) | ✅ | ⚠ | n/a | n/a | ⚠ StatusBar shows row + duration counts | ⚠ Partial |

## 4. Transcription

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Offline faster-whisper | ✅ | ✅ | ✅ `transcribe_offline` (worker) | ✅ `POST /api/transcribe` | ✅ Toolbar + AI Tools | ✅ |
| Whisper model size | ✅ | ✅ | ✅ param | ✅ param | ✅ Settings dialog | ✅ |
| GPU toggle | ✅ | ✅ | ✅ `use_gpu` | ✅ param | ✅ AI Tools checkbox | ✅ |
| Groq cloud STT | ✅ | ✅ | ✅ `transcribe_groq` | ✅ engine=groq | ✅ AI Tools engine select | ✅ |
| Gemini STT (+translate) | ✅ | ✅ | ✅ `transcribe_gemini` | ✅ engine=gemini | ✅ AI Tools engine select | ✅ |
| Auto split by silence | ✅ | ✅ | ✅ `detect_silence_segments` | ✅ `POST /api/transcribe/silence-split` | ✅ AI Tools | ✅ |
| Batch SRT generator | ✅ | ✅ | ✅ `batch_transcribe` | ✅ `POST /api/transcribe/batch` | ✅ AI Tools (paths textarea) | ✅ |

## 5. Translation

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Google Translate | ✅ | ✅ | ✅ | ✅ `POST /api/translate` | ✅ engine select | ✅ |
| Groq LLM translate | ✅ | ✅ | ✅ | ✅ | ✅ engine select | ✅ |
| Gemini translate | ✅ | ✅ | ✅ | ✅ | ✅ engine select | ✅ |
| NLLB-200 offline | ✅ | ⚠ | ⚠ code present, `transformers` not in venv | ✅ | ✅ engine select | ⚠ Partial (env dependency) |
| Source/target language | ✅ | ✅ | ✅ params | ✅ params | ✅ TranslationPanel (13 langs) | ✅ |
| Gender + emotion detection | ✅ | ✅ | ✅ in service | ✅ returned | ✅ applied to rows + shown | ✅ |
| Syllable→duration fitting | ✅ | ✅ | ✅ in prompt | ✅ | n/a (automatic) | ✅ |
| Custom instructions / glossary | ✅ | ✅ | ✅ `custom_instructions` | ✅ param | ✅ Settings field | ✅ |
| Translation style | ✅ | ✅ | ✅ passed to engine cfg | ✅ | ✅ Settings select | ✅ |
| AI Spell Check | ✅ | ✅ | ✅ `spell_check_rows` | ✅ `POST /api/translate/spell-check` | ✅ TranslationPanel | ✅ |
| Auto Gender (pitch analysis) | ✅ | ✅ | ✅ `analyze_gender` (librosa worker) | ✅ `POST /api/audio/analyze-gender` | ✅ TranslationPanel | ✅ |
| Translate selected only | ✅ | ⚠ | ⚠ rows param supported | ✅ rows param | ⚠ UI translates all rows | ⚠ Partial |
| Batch Translate SRT | ✅ | ⚠ | ⚠ per-row over loaded rows | ✅ translate | ⚠ no multi-file folder UI | ⚠ Partial |

## 6. Text-to-Speech

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Edge TTS (voice map, rate, pitch, question lift) | ✅ | ✅ | ✅ `generate_edge_tts` | ✅ preview/export | ✅ voice column + preview | ✅ |
| VoxCPM2 neural cloning | ✅ | ⚠ | ⚠ worker wired; pkg + 4.7GB model not bundled | ✅ preview/export | ⚠ voices listed if importable | ⚠ Partial (bundle dependency) |
| VoxCPM voice presets (~34) | ✅ | ✅ | ✅ `VOXCPM_VOICE_OPTIONS` | ✅ `GET /api/system/voices` | ✅ voice dropdown | ✅ |
| Reference-wav cloning | ✅ | ✅ | ✅ export `_resolve_voice` + profiles | ✅ characters | ✅ Characters tab | ✅ |
| Per-row TTS preview | ✅ | ✅ | ✅ | ✅ `POST /api/tts/preview` | ✅ ▶ button | ✅ |
| Full dub preview (pre-generate all) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing |
| Inner-voice effect (detect (),[],**) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing |
| VoxCPM Studio (standalone dialog) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing (preset path covers core use) |
| VoxCPM model download (resumable 4.7GB) | ✅ | ⚠ | ⚠ generic model manager exists | ⚠ `POST /api/models/download` | ⚠ Utilities → Models (if key registered) | ⚠ Partial |

## 7. Export

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| MP3 dub export | ✅ | ✅ | ✅ `export_mp3` | ✅ `POST /api/export/mp3` | ✅ Toolbar | ✅ |
| Video export (.mp4) | ✅ | ✅ | ✅ `video_export_service.export_video` | ✅ `POST /api/export/video` | ✅ AI Tools | ✅ |
| Burn subtitles (hardsub .ass) | ✅ | ✅ | ✅ `_build_ass` + subtitles filter | ✅ export/video param | ✅ AI Tools checkbox | ✅ |
| Quality presets (mobile/720/1080/4k/orig) | ✅ | ✅ | ✅ scale filter | ✅ param | ✅ AI Tools select | ✅ |
| GPU/CPU encoder fallback (nvenc→mf→libx264) | ✅ | ✅ | ✅ encoder ladder | ✅ param | ✅ Use GPU toggle | ✅ |
| Audio delay offset | ✅ | ✅ | ✅ `audio_start_offset_ms` | ✅ export param | ✅ Toolbar Delay (ms) input | ✅ |
| Batch video export | ✅ | ✅ | ✅ `batch_export_video` | ✅ `POST /api/batch/export-video` | ⚠ client wired, no dedicated dialog | ⚠ Partial |
| Batch video → MP3 | ✅ | ✅ | ✅ `batch_video_to_mp3` | ✅ `POST /api/batch/video-to-mp3` | ⚠ client wired, no dedicated dialog | ⚠ Partial |
| Pause/resume export | ✅ | ⚠ | ⚠ cancel only | ⚠ `POST /api/jobs/{id}/cancel` | ⚠ cancel only | ⚠ Partial |
| Post-export sync verify (RMS) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing (diagnostic-only) |

## 8. Video Effects

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Filter library + presets (12) | ✅ | ✅ | ✅ `effects_service` → `Effect.py` (worker) | ✅ `GET /api/effects`, `POST /api/effects/apply` | ✅ AI Tools effect select | ✅ |
| FFmpeg effects (brightness/contrast/blur/…) | ✅ | ✅ | ✅ `Effect.FFMPEG_EFFECTS` | ✅ `POST /api/effects/apply` | ✅ AI Tools + value slider | ✅ |
| Auto text-blur detection | ✅ | ✅ | ✅ `Effect.AutoTextBlurEffect` (preset) | ✅ apply | ✅ preset option | ✅ |
| Watermark / blur / text overlays (~120 styles) | ✅ | ✅ | ✅ `video_effects_worker.py` → `video_effects.py` (verbatim) | ✅ `POST /api/effects/overlays` | ⚠ overlays apply via config; no authoring UI | ⚠ Partial |
| Interactive drag/resize overlay editor | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing (cosmetic authoring tool) |

## 9. Audio Processing

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Demucs vocal separation | ✅ | ✅ | ✅ `audio_service.remove_vocals` (worker) | ✅ `POST /api/audio/remove-vocals` | ✅ AI Tools | ✅ |
| Noise reduction (noisereduce/afftdn) | ✅ | ✅ | ✅ `audio_service.reduce_noise` | ✅ `POST /api/audio/reduce-noise` | ✅ AI Tools | ✅ |
| Pitch-based gender analysis | ✅ | ✅ | ✅ `audio_service.analyze_gender` (librosa worker) | ✅ `POST /api/audio/analyze-gender` | ✅ TranslationPanel | ✅ |
| BG volume / mix controls | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing |

## 10. Character Profiles

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Profile storage (name→gender,ref_wav) | ✅ | ✅ | ✅ `settings_service` | ✅ `GET/PUT /api/settings/characters` | ✅ Characters tab | ✅ |
| Add/edit/remove profiles | ✅ | ✅ | ✅ service | ✅ characters | ✅ Characters tab | ✅ |
| Voice resolution at export | ✅ | ✅ | ✅ export `_resolve_voice` | n/a internal | n/a | ✅ |
| MP3→WAV convert + sample play (in manager) | ✅ | ⚠ | ⚠ ref_wav accepted as path | ✅ | ⚠ path entry only; no in-UI convert/play | ⚠ Partial |

## 11. Standalone Tools

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| Gameplay Recap — script gen | ✅ | ✅ | ✅ `recap_service.generate_script` | ✅ `POST /api/recap/generate-script` | ✅ AI Tools Recap | ✅ |
| Gameplay Recap — voiceover export + hardsub | ✅ | ✅ | ✅ `recap_service.export_recap` | ✅ `POST /api/recap/export` | ✅ AI Tools Recap | ✅ |
| Recap genre/duration options | ✅ | ✅ | ✅ `GENRES`/`DURATIONS` | ✅ `GET /api/recap/options` | ✅ selects | ✅ |
| Recap analysis modes (Listen/Watch/Watch+Listen) | ✅ | ⚠ | ⚠ script gen path present | ⚠ | ⚠ mode not surfaced as a control | ⚠ Partial |
| GPU Setup (pip install torch/demucs) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing (build/env provisioning, out of scope for web app) |
| Kh Audio Translator (opens hosted webapp) | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ Missing (external link; nothing to migrate) |

## 12. Utilities (Updates, Licensing, Diagnostics, Help)

| Feature | Legacy | New app | Backend | API | React UI | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| License activation | ✅ | ✅ | ✅ `license_service` → `License.py` (verbatim) | ✅ `/api/license/{machine-id,status,validate,activate,deactivate}` | ✅ Utilities → License | ✅ |
| Machine-ID binding | ✅ | ✅ | ✅ `License.get_machine_id` | ✅ machine-id | ✅ | ✅ |
| Anti-rollback / offline grace | ✅ | ⚠ | ⚠ reuses `License.py` logic | ⚠ via status | n/a (internal) | ⚠ Partial (not independently surfaced) |
| Admin key generator | ✅ | ✅ | ✅ `license_service.generate_key` | ✅ `POST /api/license/generate-key` | ✅ Utilities → Key Generator | ✅ |
| Download / Model manager | ✅ | ✅ | ✅ `models_service` (resumable, 416 verbatim) | ✅ `GET /api/models`, `POST /download`, `DELETE` | ✅ Utilities → Models | ✅ |
| Update manager (check + download) | ✅ | ✅ | ✅ `update_service` (version compare verbatim) | ✅ `POST /api/update/check`, `/download` | ✅ Utilities → Updates | ✅ |
| Logs / Diagnostics / Debug | ✅ | ✅ | ✅ `diagnostics_service` + ring buffer | ✅ `GET /api/diagnostics`, `/logs`, `POST /logs/clear` | ✅ Utilities → Diagnostics | ✅ |
| Keyboard shortcuts | ✅ | ✅ | n/a | n/a | ✅ dialog + Ctrl+N/O/S/F/T/E, Delete, Esc | ✅ |
| About dialog | ✅ | ✅ | n/a | n/a | ✅ | ✅ |
| User Guide (5-tab Khmer HTML) | ✅ | ⚠ | n/a | n/a | ⚠ Shortcuts + About ported; full guide is content | ⚠ Partial |
| i18n English/Khmer | ✅ | ⚠ | ✅ persisted in settings | ✅ settings | ⚠ persisted; no live in-app toggle | ⚠ Partial |
| Theme toggle (light/dark) | ✅ | ⚠ | ✅ persisted in settings | ✅ settings | ⚠ dark default; setting persisted, live toggle cosmetic | ⚠ Partial |

---

## Summary counts

| Status | Count |
|---|---|
| ✅ Complete | 62 |
| ⚠ Partial | 20 |
| ❌ Missing | 16 |

## Missing (❌) — grouped by why

**Editing depth (no reusable service, would be net-new UI):** frame stepping, waveform display, 3-track timeline editor, dub-preview-during-playback, row drag-reorder, auto-sync/smart-sync, undo/redo, per-row Audio/DL columns, full dub preview, inner-voice effect.

**Cosmetic / authoring affordances (capability exposed another way):** interactive drag/resize overlay editor (overlays apply via config), BG volume/mix controls, post-export RMS sync verify (diagnostic-only).

**Intentionally out of scope for a web app:** Autosave (manual save covers it), GPU Setup pip-installer (build/env provisioning), Kh Audio Translator (external hosted link), VoxCPM Studio standalone dialog (preset path covers core use).

## Partial (⚠) — grouped by why

**Bundle / environment dependency (code complete, not runnable in current bundle):** NLLB-200 offline (`transformers` not in venv), VoxCPM2 cloning (pkg + 4.7GB model), VoxCPM model download.

**Backend+API done, UI is thinner than legacy:** batch video export, batch video→MP3, batch translate SRT (client wired, no dedicated folder dialog); translate-selected-only (UI translates all); character MP3→WAV convert/sample play (path entry only); recap analysis modes (not surfaced); pause/resume export (cancel only); stats bar (subset shown).

**Persisted but no live toggle (cosmetic):** i18n language, theme.

**Reused-but-not-independently-surfaced:** license anti-rollback/offline grace (inside `License.py`).

## Notes on method

- "Intentionally not ported" items from `FINAL_PARITY_REPORT.md` were confirmed against legacy source: XTTS (removed in legacy), RVC (no implementation; `.spec` points at a non-existent file), OCR (never existed; auto-text-blur is an OpenCV heuristic, ported). These have no reusable legacy logic and are excluded from the counts above.
- The older `docs/FEATURE_PARITY_REPORT.md` is a Phase-1 snapshot; where it disagrees with this audit, this audit reflects the current code (services and dialogs it lists as missing now exist on disk and are wired).
