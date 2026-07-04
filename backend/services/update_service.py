"""Update manager service.

Reuses the legacy update logic:
- version check + semantic compare (UpdateCheckWorker, AI_Dubber_PyQt5_Complete
  .py:3895) — fetch version.json, compare against the running APP_VERSION.
- update download (UpdateDownloadWorker, :3947) — stream the release zip to disk
  with progress, driven by the job manager.
"""
from __future__ import annotations

import json
import os
import re
import urllib.request

from backend.config import settings
from backend.utils.jobs import Job

APP_VERSION = "2.0.0"  # matches AI_Dubber_PyQt5_Complete.py APP_VERSION
DEFAULT_UPDATE_URL = (
    "https://raw.githubusercontent.com/heangpy-cell/Heang-Dubber-Releases/main/version.json"
)


def _parse_ver(v_str: str) -> list[int]:
    return [int(x) for x in re.sub(r"[^0-9.]", "", v_str).split(".") if x.isdigit()]


def check_update(update_url: str | None = None) -> dict:
    """Fetch the remote version.json and compare versions (legacy semantics)."""
    url = update_url or DEFAULT_UPDATE_URL
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=10) as response:
        data = json.loads(response.read().decode("utf-8"))

    remote_ver = data.get("version", "")
    local = _parse_ver(APP_VERSION)
    remote = _parse_ver(remote_ver)
    n = max(len(local), len(remote))
    local += [0] * (n - len(local))
    remote += [0] * (n - len(remote))

    return {
        "has_update": remote > local,
        "current_version": APP_VERSION,
        "version": remote_ver,
        "url": data.get("url", ""),
        "changelog": data.get("changelog", ""),
    }


def download_update(download_url: str, save_path: str | None = None, job: Job | None = None) -> dict:
    """Stream the update zip to disk (legacy UpdateDownloadWorker logic)."""
    save_path = save_path or str(settings.temp_dir / "update_download.zip")
    req = urllib.request.Request(download_url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=30) as response:
        total = int(response.info().get("Content-Length", 0))
        downloaded = 0
        chunk_size = 8192 * 8
        with open(save_path, "wb") as fh:
            while True:
                if job and job._cancel.is_set():
                    try:
                        os.remove(save_path)
                    except OSError:
                        pass
                    return {"cancelled": True}
                chunk = response.read(chunk_size)
                if not chunk:
                    break
                fh.write(chunk)
                downloaded += len(chunk)
                if job and total > 0:
                    job.progress = max(0, min(100, int(downloaded * 100 / total)))
                    job.message = f"{downloaded/1024/1024:.1f}/{total/1024/1024:.1f} MB"
    return {"output": save_path, "size_mb": round(downloaded / 1024 / 1024, 1)}
