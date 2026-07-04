"""FastAPI application entry point.

Wires every feature router. Long-running work (transcribe/translate/export) is
dispatched to the job manager and polled via /api/jobs/{id}.
"""
from __future__ import annotations

import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.api import (
    srt_routes,
    subtitle_routes,
    jobs_routes,
    transcribe_routes,
    translate_routes,
    tts_routes,
    export_routes,
    audio_routes,
    settings_routes,
    projects_routes,
    media_routes,
    system_routes,
    license_routes,
    models_routes,
    update_routes,
    diagnostics_routes,
    batch_routes,
    effects_routes,
    recap_routes,
)

from backend.utils import logbuffer

logbuffer.install()

app = FastAPI(title="AI Video Dubber API", version="2.0.0")

# Dev: Vite runs on 5173; in production the frontend is served same-origin.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (
    system_routes,
    srt_routes,
    subtitle_routes,
    media_routes,
    transcribe_routes,
    translate_routes,
    tts_routes,
    export_routes,
    audio_routes,
    settings_routes,
    projects_routes,
    jobs_routes,
    license_routes,
    models_routes,
    update_routes,
    diagnostics_routes,
    batch_routes,
    effects_routes,
    recap_routes,
):
    app.include_router(module.router)


@app.get("/api/ping")
def ping() -> dict:
    return {"pong": True}


# ---- Serve the built frontend (production) ----
# In a frozen build the SPA lives next to the executable; in source it's
# frontend/dist. Mounted last so /api/* routes always win.
def _frontend_dist() -> str | None:
    candidates = []
    base = getattr(__import__("sys"), "_MEIPASS", None)
    if base:
        candidates.append(os.path.join(base, "frontend_dist"))
    here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    candidates.append(os.path.join(here, "frontend", "dist"))
    for c in candidates:
        if os.path.isdir(c) and os.path.isfile(os.path.join(c, "index.html")):
            return c
    return None


_dist = _frontend_dist()
if _dist:
    app.mount("/assets", StaticFiles(directory=os.path.join(_dist, "assets")), name="assets")

    @app.get("/")
    def _index() -> FileResponse:
        return FileResponse(os.path.join(_dist, "index.html"))

    @app.get("/{full_path:path}")
    def _spa_fallback(full_path: str) -> FileResponse:
        # SPA client-side routing: serve a real file if it exists, else index.html.
        candidate = os.path.join(_dist, full_path)
        if full_path and os.path.isfile(candidate):
            return FileResponse(candidate)
        return FileResponse(os.path.join(_dist, "index.html"))
