# UI Feature Gap — Legacy PyQt5 vs Current React/FastAPI

**Generated:** 2026-07-01
**Source of truth:** the legacy PyQt5 desktop app. The automated migration/parity reports are **not** treated as authoritative.
**Method:** read-only, code-level. Every row below was verified by reading the actual source on both sides — no doc was trusted, no code was modified.

Legacy UI read from:
- `AI_Dubber_PyQt5_Complete.py` — menus (5955–6110), toolbar (6112–6162), status bar (6164–6209), left panel (5145–5233), subtitle table (5531–5545), 11 dialog classes.
- `video_effects.py` (VideoEffectsDialog:14), `License.py` (LicenseActivationDialog:573), `Offline_Transcription.py` (WhisperDialog:161).

React UI read from `frontend/src/` — `App.tsx`, `Toolbar.tsx`, `MenuBar.tsx`, `StatusBar.tsx`, `VideoPlayer.tsx`, `SubtitleTable.tsx`, `TranslationPanel.tsx`, `AIToolsDialog.tsx`, `BatchToolsDialog.tsx`, `UtilitiesDialog.tsx`, `SettingsDialog.tsx`, `CharactersPanel.tsx`, `FindReplaceDialog.tsx`, `ShortcutsDialog.tsx`, `AboutDialog.tsx`, and the backend contract in `api/client.ts`.

## Legend

- ✅ **Ported** — equivalent control exists in React and is wired to a working backend/action.
- ⚠ **Consolidated** — the capability is reachable, but discoverability/faithfulness differs (e.g. a top-level legacy action is now buried in a hub dialog, or a live control is now only a persisted setting). **Not counted as full parity.**
- ⚠ **Partial** — works but constrained (missing sub-controls, or backend-limited).
- ❌ **Missing** — no React equivalent.

## Priority (bounded by the project's restore rules)

The CLAUDE.md rules forbid rewriting business logic; only existing backend functionality may be surfaced. So:
- **Critical / High** are reserved for gaps whose backend already exists — the missing piece is *only* UI wiring.
- Gaps that would require **new business logic** (Undo/Redo engine, drag-to-edit Timeline, animated Waveform) cannot be High no matter their user impact — they are **Deferred** with a note. (A *read-only* waveform timeline was restorable and has been done — see §Timeline — because its data reuses the existing `_generate_waveform_data` algorithm.)

---

## 1. Menu Bar

| Legacy item | Legacy ref | React | Status |
|---|---|---|---|
| File › New Project (Ctrl+N) | 5960 | File › New Project (Ctrl+N) | ✅ |
| File › Open Project (Ctrl+O) | 5965 | File › Open Project (Ctrl+O) — path via `prompt()` | ✅ |
| File › Save (Ctrl+S) | 5972 | File › Save Project (Ctrl+S) — path via `prompt()` | ✅ |
| File › Save As | 5977 | — folded into Save | ⚠ Consolidated (acceptable in web app) |
| File › Exit | 5983 | — (browser tab) | ❌ obsolete for web app |
| Edit › Undo (Ctrl+Z) | 5990 | — | ❌ Missing (needs new logic — Deferred) |
| Edit › Redo (Ctrl+Y) | 5996 | — | ❌ Missing (needs new logic — Deferred) |
| Edit › Find & Replace (Ctrl+F) | 6004 | Edit › Find & Replace (Ctrl+F) | ✅ |
| Edit › Delete Selected Row (Delete) | 6009 | Edit › Delete Selected Row(s) (Delete) | ✅ |
| Tools › Auto Transcribe (Ctrl+T) | 6018 | Tools › Transcribe + AIToolsDialog | ✅ |
| Tools › Auto Split by Silence (Ctrl+Shift+S) | 6023 | inside AIToolsDialog | ⚠ Consolidated (no discrete item / hotkey) |
| Tools › Batch SRT Generator (Ctrl+Shift+B) | 6029 | inside AIToolsDialog | ⚠ Consolidated |
| Tools › Gameplay Recap (Ctrl+Shift+G) | 6036 | inside AIToolsDialog | ⚠ Consolidated |
| Tools › Remove Vocal | 6042 | **Tools › Remove Vocal** (discrete) + AIToolsDialog Audio Cleanup | ✅ RESTORED 2026-07-01 |
| Tools › Export Video (Ctrl+E) | 6046 | inside AIToolsDialog | ⚠ Consolidated (Ctrl+E is bound to Export **MP3** in React) |
| Tools › GPU Setup | 6052 | — | ❌ obsolete (bundled runtime handles provisioning) |
| Tools › AI VoxCPM Khmer (Studio) | 6057 | — | ❌ Missing (see §8) |
| Tools › Character Manager | 6061 | Tools › Character Manager (tab) | ✅ |
| Tools › Video Effects › Select / Cinematic / Vintage / Noir / Clear | 6067–6091 | Video Effects section in AIToolsDialog | ⚠ Partial (see §7) |
| Help › User Guide (Khmer) | 6096 | — | ❌ Missing (content, not logic) |
| Help › About | 6102 | Help › About | ✅ |
| Help › Keyboard Shortcuts | 6108 | Help › Keyboard Shortcuts | ✅ |

---

## 2. Toolbar

| Legacy button | Legacy ref | React | Status |
|---|---|---|---|
| Load Video | 6121 | Load Video | ✅ |
| Import SRT | 6122 | Import SRT | ✅ |
| Export SRT | 6123 | Export SRT | ✅ |
| 📦 Batch Videos | 6124 | Batch Video→MP3 in BatchToolsDialog; **video-export batch has no UI** | ⚠ Partial (see §11) |
| 🌐 Batch Translate SRT | 6125 | — (React Translate acts on loaded rows only) | ❌ Missing (backend is per-row translate; no folder-batch UI) |
| 🌐 Kh Audio Translator | 6126 | **🌐 Kh Translator** toolbar button → opens hosted app in new tab | ✅ RESTORED 2026-07-01 |
| Remove Vocal | 6128 | AIToolsDialog | ⚠ Consolidated |
| 🎬 Effects | 6130 | AIToolsDialog | ⚠ Consolidated |
| 🎤 VoxCPM | 6132 | voice option in row dropdown + **🔍 voice picker with preview** (SubtitleTable) | ⚠ Consolidated (no standalone Studio; see §8) |
| **🧰 AI Tools / 📦 Batch / 🛠 Utilities** | — | **added** toolbar buttons opening existing dialogs | ✅ RESTORED 2026-07-01 |
| ⚙ Settings | 6134 | Settings (toolbar + menu) | ✅ |
| 🌐 Language selector (English/ខ្មែរ) | 6151 | — (persisted in Settings only) | ⚠ Consolidated → see §12 |
| 🌙 Theme toggle | 6158 | — (persisted in Settings only) | ⚠ Consolidated → see §12 |
| Delay (ms) input | — | **new** in React toolbar (`audioDelayMs`) | ➕ React addition (legacy exposed this elsewhere) |

---

## 3. Status Bar

| Legacy | Legacy ref | React (`StatusBar.tsx`) | Status |
|---|---|---|---|
| Inline progress bar + label | 6174–6183 | JobProgress modal + Ready/Working dot | ✅ (relocated) |
| ⏸️ Pause button | 6186 | — | ❌ Missing (needs new job-control logic — Deferred, see §11) |
| ✖ Cancel button | 6195 | Cancel in JobProgress modal | ✅ |
| — | — | Rows / Dubbed / Empty counts, Duration, filename, FFmpeg health | ➕ React additions |

---

## 4. Video Player (left panel)

| Legacy | Legacy ref | React (`VideoPlayer.tsx`) | Status |
|---|---|---|---|
| Video preview | 5168 | HTML5 `<video>` streamed via `/api/media/stream` | ✅ |
| Play / Stop | 5183 | Play/Pause + Stop | ✅ |
| Seek | — | seek slider | ✅ |
| Original-audio volume | — | volume slider (0–150) | ✅ |
| **InteractiveVideoLabel** — drag/resize effect overlays | 4118 | — | ❌ Missing (authoring convenience; needs new UI — Deferred, see §7) |

---

## 5. Left-panel Tools grid + GPU

| Legacy button | Legacy ref | React | Status |
|---|---|---|---|
| Auto-Sync | 5195 → `auto_sync_dialog` (9708) | folded into Export MP3 (`auto_sync_speed=true`) | ⚠ Consolidated (no standalone Auto-Sync control) |
| Auto-Speed | 5196 → `auto_speed_dialog` (9735) | Toolbar / Tools › Auto-Speed | ✅ |
| Merge Rows | 5197 | Toolbar Merge / Edit › Merge Selected | ✅ |
| Video Effects | 5198 | AIToolsDialog | ⚠ Consolidated |
| GPU Setup | 5199 | — | ❌ obsolete (bundled runtime) |
| GPU Acceleration checkbox | 5216 | "Use GPU (CUDA)" checkbox in AIToolsDialog | ✅ (relocated) |

---

## 6. Subtitle Table

Legacy 11 columns (5531–5545) vs React columns (`SubtitleTable.tsx`).

| Col | Legacy | React | Status |
|---|---|---|---|
| Start | ✅ | ✅ (click-to-seek) | ✅ |
| End | ✅ | ✅ | ✅ |
| Text | ✅ | ✅ editable | ✅ |
| Pitch | ✅ | ✅ (was previously hidden; now shown) | ✅ |
| Speed | ✅ | ✅ | ✅ |
| Vol | ✅ | ✅ | ✅ |
| Voice | ✅ | ✅ dropdown | ✅ |
| ▶ Play (preview) | ✅ | ✅ ▶ button → `/api/tts/preview` | ✅ |
| **Audio** (attach custom per-row audio) | col 8 (5541) | — | ❌ Missing (no backend; Deferred) |
| **DL** (download per-row clip) | col 9 (5542) | — | ❌ Missing (no backend; Deferred) |
| Echo | ✅ | ✅ | ✅ |
| Gender | — | ➕ column added | ➕ React addition |
| Emotion | — | ➕ column added | ➕ React addition |

---

## 7. Video Effects

| Legacy | Legacy ref | React | Status |
|---|---|---|---|
| Effect presets + FFmpeg filters | `Effect.py` / `EffectSelectionDialog` (13194) | AIToolsDialog effect select + value slider → `/api/effects/apply` | ✅ |
| Watermark / blur / text overlays (~120 styles) | `VideoEffectsDialog` (video_effects.py:14) | **EffectsOverlaysDialog.tsx** (blur/watermark/text tabs) → `POST /api/effects/overlays`; opened via "Overlays…" in AI Tools | ✅ RESTORED 2026-07-01 (config editor; renderer reused verbatim) |
| Interactive drag/resize placement | `InteractiveVideoLabel` (4118) | — | ❌ Missing (needs new canvas UI — Deferred) |
| Clear Effect | 6089 → `clear_effect` (11730) | — | ⛔ N/A — legacy resets a *persisted* `selected_effect` applied at export time (11745); React effects are one-shot `api.applyEffect` calls with no persisted selection to clear. Not restorable as-is without inventing that state model (new logic). |

---

## 8. TTS / VoxCPM

| Legacy | Legacy ref | React | Status |
|---|---|---|---|
| Edge TTS voices + per-row preview | — | voice dropdown + ▶ preview | ✅ |
| VoxCPM voice presets (~34) | `VoxCPMVoicePickerDialog` (13434) | **VoicePickerDialog.tsx** — searchable list + per-voice ▶ preview (🔍 in table voice cell) | ✅ RESTORED 2026-07-01 |
| VoxCPM Studio (standalone + project TTS) | `VoxCPMToolDialog` (13575) | **VoxCPMStudioDialog.tsx** — text → voice/speed/ref-wav → Generate (play + download WAV) via existing `/api/tts/preview`; Tools › VoxCPM Voice Studio | ✅ RESTORED 2026-07-01 (UI over existing endpoint; offline gen still needs bundled `voxcpm` pkg + 4.7 GB model) |
| Reference-wav cloning via character profiles | `CharacterManagerDialog` (14323) | CharactersPanel (path entry) | ⚠ Partial (see §10) |

---

## 9. Transcription / Translation / Audio

| Legacy | React | Status |
|---|---|---|
| Offline Whisper / Groq / Gemini STT | AIToolsDialog engine select | ✅ |
| Model size + GPU toggle | Settings + AIToolsDialog | ✅ |
| Translation engines (Google/Groq/Gemini/NLLB) | TranslationPanel engine select | ✅ |
| Source/target language | TranslationPanel | ✅ |
| AI Spell Check | TranslationPanel button | ✅ |
| Auto Gender (pitch analysis) | TranslationPanel button | ✅ |
| Remove Vocals (Demucs) / Reduce Noise | AIToolsDialog Audio Cleanup | ✅ |
| Gameplay Recap (script + voiceover export) | AIToolsDialog Recap section | ✅ |

---

## 10. Character Manager

| Legacy (`CharacterManagerDialog` 14323) | React (`CharactersPanel.tsx`) | Status |
|---|---|---|
| Add/edit/remove profile (name, gender, ref_wav) | ✅ same CRUD → `/api/settings/characters` | ✅ |
| MP3 → WAV convert | — | ❌ Missing (needs small backend endpoint) |
| Play/audition reference sample | — | ❌ Missing (needs backend/stream) |

---

## 11. Batch & Job control

| Legacy | React | Status |
|---|---|---|
| Batch Video → MP3 | BatchToolsDialog | ✅ |
| Batch Import SRT (folder) | BatchToolsDialog | ✅ |
| Batch Video Export (.mp4) | `api.batchExportVideo` exists; **no dialog** | ⚠ Partial — blocked by a missing per-video subtitle-pairing model (would be new logic) |
| Batch Translate SRT (folder) | — | ❌ Missing (no folder-batch translate UI) |
| Pause / Resume export | Cancel only (`/api/jobs/{id}/cancel`) | ⚠ Partial — pause/resume needs a new job-manager primitive (Deferred) |

---

## 12. Chrome / Utilities (mostly at parity)

| Legacy | React | Status |
|---|---|---|
| License activation / machine-ID / key-gen | UtilitiesDialog (License + Key Generator tabs) | ✅ |
| Model / download manager | UtilitiesDialog Models tab | ✅ |
| Update check + download | UtilitiesDialog Updates tab | ✅ |
| Logs / Diagnostics | UtilitiesDialog Diagnostics tab | ✅ |
| Settings persistence (all keys) | SettingsDialog (4 tabs) | ✅ |
| Live theme toggle (light/dark) | persisted in Settings; no instant toggle, dark-only CSS | ⚠ Consolidated — needs a light palette (new CSS, not just wiring) |
| Live language selector (EN/ខ្មែរ) | persisted in Settings; no live toggle; strings not externalized | ⚠ Consolidated — needs an i18n string table (new work) |

---

## Summary of true gaps (legacy has it, React does not)

**RESTORED 2026-07-01 (this pass — UI wiring over existing backend, verified `tsc` + `npm run build` green):**
- ✅ Main toolbar — added **AI Tools / Batch / Utilities** buttons opening existing dialogs.
- ✅ Kh Audio Translator — **🌐 Kh Translator** button opens the hosted app in a new tab (legacy behavior was identical: `webbrowser.open` a URL).
- ✅ VoxCPM voice picker — new `VoicePickerDialog.tsx`, searchable list + per-voice ▶ preview via existing `/api/tts/preview`; 🔍 button in the table voice cell.
- ✅ Remove Vocal — discrete **Tools › Remove Vocal** entry wired to existing `api.removeVocals`.
- ✅ Video overlays editor — new `EffectsOverlaysDialog.tsx` (blur/watermark/text tabs) produces the legacy `{blur, watermark, text}` config and posts to existing `POST /api/effects/overlays` (renderer reused verbatim). Opened via "Overlays…" in AI Tools.

**Assessed this pass — NOT restorable as pure wiring (would need new logic; correctly left alone):**
- ⛔ Clear Effect — legacy resets a *persisted* effect selection applied at export time; React effects are one-shot calls with no such state to clear.
- ✅ Timeline (read-only) — RESTORED 2026-07-01. The waveform *data* comes from existing legacy logic (`_generate_waveform_data` 7324: ffmpeg extract → normalize by max-abs → downsample), now wrapped as `GET /api/media/waveform` (`waveform_service.py`) and drawn in `TimelinePanel.tsx` (waveform track + subtitle blocks + playhead + click-to-seek). Drag-to-edit timing and pan/zoom remain ⛔ deferred (new UI-gesture logic, no legacy backend to reuse).
- ⛔ `_WaveformCanvas` (12046) — decorative sine animation, not real audio; cosmetic only, not ported.
- ⛔ GPU Setup — pip-installs torch/demucs; env provisioning handled by the bundled runtime, no runtime backend.
- ✅ VoxCPM Studio — RESTORED 2026-07-01. `VoxCPMStudioDialog.tsx` (Tools › VoxCPM Voice Studio) drives the existing `/api/tts/preview` (text/voice/speed/ref-wav → play + download WAV); no new backend. Offline generation still needs the bundled `voxcpm` pkg + 4.7 GB model, surfaced in the UI.

**Verified already at parity this pass:** AI Spell Check (`/api/translate/spell-check` → TranslationPanel), Settings pages (all backend `SETTING_KEYS` surfaced across 4 tabs), Preview controls (VideoPlayer + per-row TTS), Export controls (MP3 toolbar + video export in AI Tools), Subtitle editor.

**Still needs a small new backend surface (not done):**
1. Character Manager MP3→WAV convert + sample playback.
2. Batch Translate SRT (folder) UI + batch endpoint.
3. Batch Video Export (.mp4) dialog — needs a per-video subtitle-pairing model first.

**Blocked by the "no new business logic" rule (Deferred):**
4. Undo / Redo (needs an action-history model).
5. Pause / Resume export (needs job-manager pause primitive).
6. Timeline (3-track) + Waveform panels.
7. Interactive drag/resize overlay editor.
8. Per-row **Audio** + **DL** table columns (need new per-row audio storage/download).
9. Live theme toggle (needs light-mode CSS) and live language selector (needs i18n table).

**Bundle/content-blocked, not code gaps:**
10. VoxCPM Studio dialog (pkg + 4.7 GB model not bundled).
11. User Guide (Khmer help content).

**Intentionally not ported (obsolete in a web app):**
12. Save As (folded into Save), Exit, GPU Setup dialog.

**React improvements over legacy:** Gender & Emotion table columns, global dub-delay input, live row counts / FFmpeg health in the status bar, and a dedicated Models/Diagnostics/Updates utilities hub.
