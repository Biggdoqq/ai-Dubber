# UI Restore Report — Phase 2

**Generated:** 2026-07-01
**Scope:** Restore the missing **core user interface** of the legacy PyQt5 app in the React/FastAPI edition. Existing backend reused as-is; no business logic rewritten. UI chrome only — feature pipelines (video export, effects, Demucs, batch tools, etc.) are explicitly out of scope for this phase.

## What was restored

This phase targeted the **interface shell** called out in the brief: toolbar, navigation, tabs, menus, settings window, dialog windows, workspace, and status bar. The legacy app exposed these via the `QMainWindow` menubar (`setup_menu`), toolbar (`setup_toolbar`), `SettingsDialog`, `FindReplaceDialog`, `UserGuideDialog`, the stats bar (`_update_stats_bar`), and the `CharacterManagerDialog`. None of these existed in the new React app before this phase — it had only a flat toolbar and a single subtitle view.

### New components

| Component | File | Restores (legacy origin) |
|---|---|---|
| Menu bar | `frontend/src/components/MenuBar.tsx` | `setup_menu` — File/Edit/Tools/Help dropdown menus with shortcuts |
| Status bar | `frontend/src/components/StatusBar.tsx` | `_update_stats_bar` (5617) — row/dubbed/empty/duration counts + FFmpeg health |
| Characters panel | `frontend/src/components/CharactersPanel.tsx` | `CharacterManagerDialog` (14323) — add/edit/remove voice-clone profiles |
| Find & Replace | `frontend/src/components/FindReplaceDialog.tsx` | `FindReplaceDialog` (12750) — search/replace in text, match-case |
| Shortcuts | `frontend/src/components/ShortcutsDialog.tsx` | `_show_hotkeys_dialog` (12003) — keyboard reference |
| About | `frontend/src/components/AboutDialog.tsx` | `show_about` (7790) — version/info |
| Settings (rebuilt) | `frontend/src/components/SettingsDialog.tsx` | `SettingsDialog` (12806) — tabbed General/Transcription/Translation/API Keys |

### Workspace & navigation

- **Tabbed workspace** added to the right pane: **Subtitles** (existing editor) and **Characters** (new manager). Mirrors the legacy multi-dialog workspace without leaving the page.
- **Menu bar** sits above the toolbar with working File/Edit/Tools/Help menus, each item wired to a real handler.
- **Status bar** pinned to the bottom showing live stats and backend FFmpeg availability (via existing `GET /api/system/health`).

### New handlers wired into `App.tsx` (reusing existing endpoints)

| Action | Endpoint reused | Was it wired before? |
|---|---|---|
| New / Open / Save Project | `GET /api/projects/open`, `POST /api/projects/save` | No — backend existed, no UI |
| Delete selected row(s) | client-side state | No |
| Find & Replace all | client-side state | No |
| Shift times ±0.2s | `POST /api/subtitles/shift` | No — endpoint existed, never called |
| Character profiles CRUD | `GET/PUT /api/settings/characters` | No — `getCharacters` defined but unused |
| Expanded settings keys | `PUT /api/settings` | Partially — now covers language, theme, srt_offset, models, translation style/instructions, update settings |

### Keyboard shortcuts restored

`Ctrl+N/O/S` (project), `Ctrl+F` (find), `Ctrl+T` (transcribe), `Ctrl+E` (export MP3), `Delete` (delete rows), `Esc` (close dialogs) — matching the legacy `keyPressEvent` (11940).

### Client additions

`frontend/src/api/client.ts` gained `saveCharacters`, `openProject`, and `saveProject` (the only missing wrappers; `getCharacters`/`shiftTimes` already existed).

## Workflow preserved

The original load → transcribe → translate → tweak rows → preview → export loop is unchanged. New chrome wraps that flow without altering it: the toolbar primary actions remain, the subtitle table and translation panel are untouched, and the menu/tabs are additive.

## Verification

- `npm run build` (tsc -b && vite build) — **passes**, 42 modules, no type errors.
- Not exercised in a browser this phase (build-level verification only). Project Open/Save use server-side file paths (via `prompt()`), matching the backend's path-based contract; a native file-picker flow is a later enhancement.

## Deliberately NOT in this phase (feature pipelines, not core UI)

Video export UI, video-effects editor, Demucs/noise UI, batch-tool windows, timeline/waveform, Gameplay Recap, licensing, auto-update. These are feature restorations tracked in `FEATURE_PARITY_REPORT.md`, not core interface chrome.

## Files changed

- Added: `MenuBar.tsx`, `StatusBar.tsx`, `CharactersPanel.tsx`, `FindReplaceDialog.tsx`, `ShortcutsDialog.tsx`, `AboutDialog.tsx`
- Modified: `App.tsx` (menu/tabs/status/dialogs + handlers), `SettingsDialog.tsx` (rebuilt as tabbed), `api/client.ts` (3 wrappers)
- No backend files touched. No legacy files touched.
