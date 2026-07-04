"""Cache manager service.

Inspects and clears the app's working cache under `settings.temp_dir` (the only
directory this touches — models/settings/projects are never in scope). Each
service scratches its own subdir there (mp3_export, video_export, vocal_removal,
noise_reduction, jobs, …); this surfaces their sizes and lets the UI reclaim space.
"""
from __future__ import annotations

import os
import shutil
from pathlib import Path

from backend.config import settings


def _dir_size(path: Path) -> int:
    total = 0
    if path.is_file():
        try:
            return path.stat().st_size
        except OSError:
            return 0
    if path.is_dir():
        for root, _dirs, files in os.walk(path):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass
    return total


def cache_info() -> dict:
    """List entries in temp_dir with their sizes (largest first) + total."""
    base = settings.temp_dir
    entries = []
    total = 0
    if base.is_dir():
        for child in base.iterdir():
            size = _dir_size(child)
            total += size
            entries.append({
                "name": child.name,
                "is_dir": child.is_dir(),
                "size_mb": round(size / 1024 / 1024, 2),
            })
    entries.sort(key=lambda e: -e["size_mb"])
    return {
        "cache_dir": str(base),
        "total_mb": round(total / 1024 / 1024, 2),
        "entries": entries,
    }


def clear_cache(target: str | None = None) -> dict:
    """Delete a single cache subdir/file (by name) or everything in temp_dir.

    `target` is a bare entry name (no path separators) resolved inside temp_dir;
    anything escaping temp_dir is rejected so this can never touch other paths.
    """
    base = settings.temp_dir.resolve()
    if not base.is_dir():
        return {"cleared": [], "freed_mb": 0.0}

    if target:
        if os.sep in target or (os.altsep and os.altsep in target) or target in ("..", "."):
            raise ValueError("Invalid cache target.")
        path = (base / target).resolve()
        if path.parent != base or not path.exists():
            raise ValueError("Cache target not found.")
        targets = [path]
    else:
        targets = list(base.iterdir())

    freed = 0
    cleared = []
    for p in targets:
        size = _dir_size(p)
        try:
            if p.is_dir():
                shutil.rmtree(p, ignore_errors=True)
            else:
                p.unlink()
            freed += size
            cleared.append(p.name)
        except OSError:
            pass
    return {"cleared": cleared, "freed_mb": round(freed / 1024 / 1024, 2)}
