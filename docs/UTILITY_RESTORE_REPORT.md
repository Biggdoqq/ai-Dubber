# Utility Restore Report — Phase 4

**Generated:** 2026-06-30
**Scope:** Restore every missing utility from `FEATURE_PARITY_REPORT.md` section 12 (and related), reusing existing legacy modules. Expose via FastAPI, build React UI.

**Constraint honored:** every utility wraps or ports existing legacy logic. No working algorithm rewritten. No legacy `.py` modified — `License.py` and `download_model_direct.py` are imported/ported as-is.

---

## What was restored

| Utility | How restored | Backend | API | React UI |
|---|---|---|---|---|
| License (activation) | Lazy-import legacy `License.py` `LicenseManager` (machine ID, validate, activate, deactivate, status) | ✅ `license_service` | ✅ `/api/license/{machine-id,status,validate,activate,deactivate}` | ✅ Utilities → License |
| Key Generator (admin) | Reuse `License.generate_key` + KeyGen.py duration-precedence logic (KeyGen.py:300) ported verbatim | ✅ `license_service.generate_key` | ✅ `POST /api/license/generate-key` | ✅ Utilities → Key Generator |
| Download Manager | Resumable HTTP download with resume/416 handling ported from `download_model_direct.py` | ✅ `models_service.download_url` | ✅ via `/api/models/download` | ✅ Utilities → Models (progress) |
| Model Manager | Inventory of whisper/VoxCPM2/NLLB assets under `models_dir` (size, presence) | ✅ `models_service.list_models` / `delete_model` | ✅ `GET /api/models`, `DELETE /api/models/{key}` | ✅ Utilities → Models |
| Update Manager | Version check + semantic compare (UpdateCheckWorker :3895) and download (UpdateDownloadWorker :3947) ported | ✅ `update_service` | ✅ `POST /api/update/check`, `/api/update/download` | ✅ Utilities → Updates |
| Export (single) | Existing MP3 export (Phase 1) | ✅ `export_service.export_mp3` | ✅ `POST /api/export/mp3` | ✅ Toolbar |
| Import (single) | Existing SRT import (Phase 1) | ✅ `core.srt.parse_srt` | ✅ `POST /api/srt/parse` | ✅ Toolbar |
| Batch Export | Loop existing `export_mp3` over N items | ✅ `batch_service.batch_export_mp3` | ✅ `POST /api/batch/export-mp3` | ✅ via client (batch) |
| Batch Import | Scan folder for *.srt, parse each via `core.srt` | ✅ `batch_service.batch_import_srt` | ✅ `POST /api/batch/import-srt` | ✅ via client (batch) |
| Logs | In-memory ring buffer log handler attached at startup | ✅ `utils/logbuffer` | ✅ `GET /api/diagnostics/logs`, `POST .../clear` | ✅ Utilities → Diagnostics |
| Diagnostics | Aggregate ffmpeg/python/model/path health snapshot | ✅ `diagnostics_service.diagnostics` | ✅ `GET /api/diagnostics` | ✅ Utilities → Diagnostics |
| Debug tools | Copy-diagnostics + log viewer with level coloring | ✅ (diagnostics) | ✅ (diagnostics) | ✅ Utilities → Diagnostics |

---

## Files added

**Backend services:** `license_service.py`, `models_service.py`, `update_service.py`, `diagnostics_service.py`, `batch_service.py`
**Backend routes:** `license_routes.py`, `models_routes.py`, `update_routes.py`, `diagnostics_routes.py`, `batch_routes.py`
**Backend utils:** `logbuffer.py`
**Backend modified:** `app.py` (registered 5 routers + `logbuffer.install()`)

**Frontend:** `UtilitiesDialog.tsx` (5-tab: License / Key Generator / Models / Updates / Diagnostics)
**Frontend modified:** `api/client.ts` (license/keygen/models/update/diagnostics/batch methods), `App.tsx` (Tools → Utilities menu + dialog wiring)

---

## Reuse notes (no rewrites)

- **License.py** imports PyQt5 at module level but builds no widgets on import, so `license_service` lazy-imports it (`@lru_cache`) — kept out of app startup so a missing PyQt5 never breaks the API. Verified importable in `venv_cpu`.
- **`is_activated()` is NOT called by `/api/license/status`** — it performs an online Google Sheets check and network time fetch. Status uses the offline `validate_key` + `parse_key_info` instead, so the UI stays responsive. Full online activation still runs through `LicenseManager.activate` on the activate endpoint, exactly as legacy.
- **Download/resume logic** is the byte-for-byte algorithm from `download_model_direct.py` (Range header, 416 → restart clean, 206 vs full, 1 MiB chunks), adapted only to report progress via the job manager instead of `print`.
- **Update version compare** is the exact semantic-version padding/compare from `UpdateCheckWorker`.

---

## Security note (carried from legacy, unchanged)

The HG-key signing secret in `License.py` is symmetric and only XOR-obfuscated (flagged in `docs/MODULES.md`). Exposing `generate-key` over the local API means anyone who can reach the localhost server can mint keys. This matches the legacy trust model (admin runs KeyGen locally) but is worth noting if the server is ever bound beyond `127.0.0.1`. Not changed this phase — out of scope for "restore utilities."

---

## Verification

- **Backend import:** `from backend.app import app` → OK, **25 routes** registered.
- **Frontend build:** `npm run build` (tsc -b && vite build) → passes, **44 modules**, no type errors.
- **Not exercised at runtime this phase** (build-level only). License online verification and update/model downloads need network; license activation needs a valid key for this machine.
