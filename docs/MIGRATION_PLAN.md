# MIGRATION_PLAN.md

> Phase 1 — Migration plan (analysis only). This document recommends a path; it does **not** implement it.
> Per project rules: no code was modified, rewritten, or deleted. This is the plan to review before any Phase 2 work begins.

## 0. Guiding constraints (from CLAUDE.md)

- Never modify the `legacy/` folder. **(None exists today — confirm location before relying on this rule.)**
- Never delete existing code; reuse existing business logic; never rewrite working algorithms.
- Work in small incremental steps; keep commits small; ask before destructive changes; document before coding.

These constraints push toward a **strangler-fig migration**: stand new surfaces up alongside the working monolith, extract logic into reusable modules *without rewriting the algorithms*, and leave `AI_Dubber_PyQt5_Complete.py` running until each piece is proven.

---

## 1. Files that can be REUSED DIRECTLY (little/no change)

These are already UI-free or CLI-driven business logic. Reuse as-is; wrap, don't rewrite.

| File | Why it's reusable |
|---|---|
| `transcribe_worker_script.py` | Pure CLI worker; `faster_whisper` → JSON segments. No Qt. |
| `voxcpm_worker_script.py` | Pure CLI worker; argparse → wav. No Qt. |
| `voxcpm_support.py` | Uses `progress_callback`, not Qt signals; ~all business logic. No API keys. |
| `Effect.py` | Standalone filter/preset library + `AutoTextBlurEffect` (classical CV). No Qt. |
| `download_model_direct.py` | Standalone resumable model downloader. |
| `Auto_SRT_Generator.py` (helpers only) | `seconds_to_srt`, `extract_audio`, segment-splitting are pure functions. |
| License crypto core | `generate_key`, `validate_key`, `parse_key_info`, `_sign_payload` — pure math (but see Risk R1: redesign signing). |

---

## 2. Files that MUST be REFACTORED (logic worth keeping, wrapper must change)

Extract the algorithm into a UI-free module; replace the Qt/`subtitle_table` shell. **Move the algorithm, don't rewrite it.**

| File / unit | What to extract | What to drop/replace |
|---|---|---|
| `AI_Dubber_PyQt5_Complete.py` — time codecs (207/217, 840/844, 9931/9935, 3110) | One canonical `srt_time <-> seconds` module | The 3 duplicate copies |
| `AI_Dubber_PyQt5_Complete.py` — `TranslateWorker` (3030) | Engine HTTP/fallback orchestration (NLLB→Groq→Gemini→Google) | `QThread`/`pyqtSignal` → return values / callbacks |
| `AI_Dubber_PyQt5_Complete.py` — `ExportWorker` (639) | Export pipeline internals: edge-tts gen, inner-voice effect, noise reduction, sync verify, ffmpeg command assembly | Qt progress signals → callback |
| `AI_Dubber_PyQt5_Complete.py` — auto-speed (9778), merge (9829), shift (9860), smart-sync (9886), `_parse_srt` (8194), voice resolution (11325–11369) | Pure algorithms operating on a **subtitle data model** | Direct `subtitle_table` cell reads/writes |
| `Offline_Transcription.py` | Subprocess-orchestration pattern | Thin `QThread` wrapper |
| `video_effects.py` — `apply_effects_to_frame` (1143) | Blur/watermark/text frame renderer | Decouple the QtGui text rasterization (1547+) so it doesn't need PyQt |
| `Gameplay_Recap_Tool.py` workers | `ScriptGenerationWorker`, `ExportVideoWorker` logic | Split from the embedded `QMainWindow` |

**Key enabler:** introduce a plain subtitle data structure (list of dicts/dataclass with start/end/text/pitch/speed/vol/voice/echo/gender/emotion). Nearly every algorithm currently uses `subtitle_table` as its model; this single extraction unblocks most of the logic.

---

## 3. Files TIGHTLY COUPLED to PyQt (UI layer — reimplement, do not port)

These are presentation; in a migration their logic is already covered above, and the widgets themselves are replaced by the new front end.

- `AI_Dubber_PyQt5_Complete.py` — `AIVideoDubberApp` window, all `_create_*` panels, all `*_dialog` handlers, theme/language appliers, undo/redo snapshots.
- Custom widgets: `TimelineWidget` (2403), `InteractiveVideoLabel` (4118), `_WaveformCanvas` (12046).
- All ~15 dialog classes (Settings, ExportOptions, EffectSelection, VoxCPM pickers, CharacterManager, etc.).
- `video_effects.py` — `VideoEffectsDialog` (incl. Windows-registry font enumeration).
- `License.py` — `LicenseActivationDialog`.
- `KeyGen.py` — admin GUI.
- `Kh Audio Translator.py` — browser launcher (disposable).
- `Gameplay_Recap_Tool.py` — the `QMainWindow` shell.

---

## 4. Candidate BACKEND SERVICES (recommendation only — no service code in Phase 1)

If the target is a service-oriented architecture, these are the natural service boundaries. They already run as subprocesses or are UI-free, so they map cleanly. **This is a recommendation to review, not an instruction to build.**

| Proposed service | Backed by | Notes |
|---|---|---|
| Transcription service | `transcribe_worker_script.py` + Groq/Gemini paths | Subprocess isolation already exists; keep it on Windows+CUDA. |
| Translation service | extracted `TranslateWorker` engines | Stateless; needs Groq/Gemini keys from a secret store. |
| TTS service | `voxcpm_support.py` + edge-tts wrapper | VoxCPM is GPU-heavy; keep subprocess/queue model. |
| Vocal-separation service | `python -m demucs.separate` orchestration | Already subprocess; wrap as job. |
| Export/render service | extracted `ExportWorker` ffmpeg pipeline | Long-running; needs job/progress streaming. |
| Effects/render helpers | `Effect.py`, extracted `apply_effects_to_frame` | CPU + optional GPU. |
| Licensing service | License crypto + online check | **Redesign to asymmetric signing first (Risk R1).** |

Cross-cutting: a **job/queue layer** is needed because transcription, separation, TTS, and export are all long-running and currently rely on Qt's `progress`/`finished` signals.

---

## 5. Estimated migration ORDER (incremental, each step independently shippable)

Ordered to respect "small steps" and to de-risk early. Each step leaves the existing app working.

0. **Pre-work / hygiene (no behavior change)**
   - Clean the dirty working tree to a known baseline.
   - Rotate the leaked Gemini key (`test_gemini_context.py`); remove `License_Database.xlsx` (PII) and `AI_Video_Dubber_Protected.py` / `protected_code.txt` / `*.c` from the tree if not needed (confirm first — destructive).
1. **Consolidate time codecs** into one module; point all 4 call sites at it. Lowest-risk extraction; proves the reuse pattern.
2. **Extract the subtitle data model** from `subtitle_table`. The keystone — unblocks everything else.
3. **Extract pure subtitle algorithms** (auto-speed, merge, shift, smart-sync, SRT parse/serialize) against the new model. Reuse the existing math verbatim.
4. **Extract transcription orchestration** (already subprocess-isolated → cleanest seam).
5. **Extract translation orchestration** (engine fallback chain).
6. **Extract TTS orchestration** (edge-tts + VoxCPM dispatch).
7. **Extract the export/ffmpeg pipeline** (most complex; reconcile the two effect renderers — see Risk R4).
8. **Redesign licensing** to asymmetric signing; stand up a real backend to replace Google Apps Script.
9. **Front-end / service surfaces** (Phase 2+, out of scope here).

---

## 6. RISKS

| # | Risk | Impact | Mitigation |
|---|---|---|---|
| R1 | **Forgeable licenses** — symmetric secret, hardcoded plaintext in `google_sheets_keygen.gs` & main app, XOR-obfuscated in `License.py`. | Anyone with the secret mints unlimited keys. | Move to asymmetric signing (private key server-side only) **before** any license refactor. |
| R2 | **Leaked/committed secrets** — Gemini key in `test_gemini_context.py`; hardcoded Apps Script URL; plaintext API keys in settings JSON; `License_Database.xlsx` PII. | Credential abuse, data leak. | Rotate keys, purge from repo/history, move secrets to OS keychain / server secret store. |
| R3 | **Source exposure** — `AI_Video_Dubber_Protected.py` is base64 `exec`; `.c` files & `protected_code.txt`. | No real IP protection. | Drop base64 "protection"; if obfuscation matters, use real tooling and don't commit outputs. |
| R4 | **Two divergent effect renderers** — preview (cv2/Qt, animated) vs export (ffmpeg `filter_complex`, static). | Preview ≠ final output. | Reconcile to a single source of truth during step 7. |
| R5 | **Windows lock-in** — `wmic`, `winreg`, `winsound`, `CREATE_NO_WINDOW`, hardcoded `C:\...\Python311` in specs. | Blocks cross-platform; `get_machine_id` won't port. | Abstract platform calls behind interfaces; new machine-fingerprint source if going cross-platform. |
| R6 | **CUDA/OpenMP DLL fragility** — the subprocess isolation exists to dodge `WinError 1114` / OpenMP crashes. | Naive "simplification" reintroduces crashes. | **Preserve subprocess isolation** for whisper/demucs/voxcpm. Don't inline them. |
| R7 | **Monolith coupling** — algorithms read/write `subtitle_table` directly. | Hard to extract logic safely. | Data-model extraction (step 2) first; characterization tests around each algorithm before moving it. |
| R8 | **No test suite observed.** | Refactors can silently break working algorithms (violates "never rewrite working algorithms"). | Add characterization/golden tests per algorithm before extraction. |
| R9 | **Inconsistent persistence roots** — settings in `~`, `character_profiles.json` + logs in CWD. | Data loss when launched from another dir. | Centralize a config/data path resolver during step 2/3. |
| R10 | **Missing `RVC_Backend.py`** referenced by `RVC_Backend.spec`. | Build target references absent source. | Confirm whether RVC backend is in scope before touching specs. |

---

## 7. RECOMMENDATIONS

1. **Strangler-fig, not rewrite.** Keep `AI_Dubber_PyQt5_Complete.py` running. Extract logic into UI-free modules it imports, so behavior is identical and reversible at each step. This satisfies "reuse business logic / never rewrite working algorithms."
2. **Data model first.** The single highest-leverage move is extracting the subtitle data structure from `subtitle_table`. Almost every other extraction depends on it.
3. **Add characterization tests before moving any algorithm.** Lock current outputs (auto-speed, sync, SRT round-trip, export command strings) so an extraction can be proven equivalent. There is no test suite today (R8).
4. **Treat security as a blocker, not a phase.** R1–R3 (forgeable licenses, leaked secrets, source exposure) should be addressed early; they're cheap relative to the damage.
5. **Preserve subprocess isolation** for GPU workloads (R6) — it's load-bearing, not accidental.
6. **Reconcile the two effect renderers** before/at export extraction (R4) to avoid baking in preview/output drift.
7. **Confirm scope questions before Phase 2:** (a) where (if anywhere) is the `legacy/` folder the rules reference; (b) is `RVC_Backend.py` in scope; (c) target architecture (stay desktop / web front end / service split) — this determines whether section 4's services are built at all.

---

## 8. Status

Phase 1 analysis complete. The five docs (`PROJECT_ANALYSIS.md`, `ARCHITECTURE.md`, `MODULES.md`, `DEPENDENCY_GRAPH.md`, `MIGRATION_PLAN.md`) are written under `docs/`. No source files were modified, rewritten, or deleted. **Awaiting your next instruction — Phase 2 not started.**
