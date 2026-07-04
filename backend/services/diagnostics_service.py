"""Diagnostics + debug service.

Aggregates environment/runtime info the legacy app surfaced ad-hoc (ffmpeg
availability, worker python, model presence, platform) plus the in-memory log
buffer, so the Diagnostics/Debug UI can show one health snapshot.
"""
from __future__ import annotations

import platform
import sys
from pathlib import Path

from backend.config import settings
from backend.utils import ffmpeg, logbuffer


def diagnostics() -> dict:
    models_dir = settings.models_dir
    return {
        "app_version": "2.0.0",
        "platform": platform.platform(),
        "python_version": sys.version.split()[0],
        "frozen": bool(getattr(sys, "frozen", False)),
        "ffmpeg": {
            "available": ffmpeg.available(),
            "ffmpeg_path": settings.ffmpeg,
            "ffprobe_path": settings.ffprobe,
        },
        "worker_python": settings.worker_python,
        "paths": {
            "root": str(settings.root),
            "models_dir": str(models_dir),
            "models_dir_exists": models_dir.is_dir(),
            "temp_dir": str(settings.temp_dir),
            "settings_file": str(settings.settings_file),
            "settings_file_exists": settings.settings_file.exists(),
            "transcribe_worker": str(settings.transcribe_worker),
            "voxcpm_worker": str(settings.voxcpm_worker),
        },
        "workers_present": {
            "transcribe": Path(settings.transcribe_worker).exists(),
            "voxcpm": Path(settings.voxcpm_worker).exists(),
        },
    }


def get_logs(limit: int = 200, level: str | None = None) -> dict:
    return {"logs": logbuffer.get_logs(limit=limit, level=level)}


def clear_logs() -> dict:
    logbuffer.clear()
    return {"cleared": True}
