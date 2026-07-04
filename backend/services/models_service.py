"""Model + download manager service.

- Download Manager: resumable HTTP download (reuses the resume/416 logic from
  the legacy `download_model_direct.py`), driven by the job manager so the
  frontend can poll progress and cancel.
- Model Manager: inventory of the local model assets (faster-whisper HF cache,
  VoxCPM2, NLLB) under `settings.models_dir`, with on-disk size + presence.

Nothing here imports torch/ML libs — it only inspects the filesystem and
streams bytes, so it is safe to call from the API process.
"""
from __future__ import annotations

import os
import time
import urllib.request
import urllib.error
from pathlib import Path

from backend.config import settings
from backend.utils.jobs import Job

# Known model assets the legacy app uses. `key` is stable; `path` is relative
# to models_dir; `url` (when set) is the canonical HuggingFace source.
KNOWN_MODELS = [
    {
        "key": "whisper-base",
        "label": "Faster-Whisper (base)",
        "path": "hf_cache/hub/models--Systran--faster-whisper-base",
        "url": None,  # multi-file HF snapshot; managed by faster-whisper itself
        "note": "Offline transcription model (bundled).",
    },
    {
        "key": "voxcpm2",
        "label": "VoxCPM2 (neural TTS / cloning)",
        "path": "VoxCPM2/model.safetensors",
        "url": "https://huggingface.co/openbmb/VoxCPM2/resolve/main/model.safetensors",
        "note": "~4.5 GB. Required for offline voice cloning.",
    },
    {
        "key": "nllb-600m",
        "label": "NLLB-200 distilled 600M",
        "path": "nllb",
        "url": None,
        "note": "Offline translation model (managed by transformers).",
    },
]


def _dir_size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    total = 0
    if path.is_dir():
        for root, _dirs, files in os.walk(path):
            for f in files:
                try:
                    total += os.path.getsize(os.path.join(root, f))
                except OSError:
                    pass
    return total


def list_models() -> dict:
    models = []
    base = settings.models_dir
    for m in KNOWN_MODELS:
        target = base / m["path"]
        size = _dir_size(target)
        models.append({
            "key": m["key"],
            "label": m["label"],
            "note": m["note"],
            "path": str(target),
            "installed": target.exists() and size > 0,
            "size_mb": round(size / 1024 / 1024, 1),
            "downloadable": bool(m["url"]),
        })
    return {"models_dir": str(base), "models": models}


def _model_by_key(key: str) -> dict | None:
    for m in KNOWN_MODELS:
        if m["key"] == key:
            return m
    return None


def download_model(key: str, job: Job | None = None) -> dict:
    """Resumable download of a known model. Resume/416 handling is ported
    verbatim from the legacy `download_model_direct.py`."""
    m = _model_by_key(key)
    if not m:
        raise ValueError(f"Unknown model '{key}'")
    if not m["url"]:
        raise ValueError(f"Model '{key}' is not directly downloadable.")
    dest = settings.models_dir / m["path"]
    return download_url(m["url"], str(dest), job=job)


def download_url(url: str, dest: str, job: Job | None = None) -> dict:
    """Generic resumable downloader (legacy download_model_direct.py logic)."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)

    current_size = os.path.getsize(dest) if os.path.exists(dest) else 0

    req = urllib.request.Request(url, headers={
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
    if current_size > 0:
        req.add_header("Range", f"bytes={current_size}-")

    try:
        response = urllib.request.urlopen(req, timeout=30)
        status_code = response.getcode()
    except urllib.error.HTTPError as e:
        if e.code == 416:  # range not satisfiable -> restart clean
            try:
                os.remove(dest)
            except OSError:
                pass
            current_size = 0
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            response = urllib.request.urlopen(req, timeout=30)
            status_code = response.getcode()
        else:
            raise RuntimeError(f"HTTP error {e.code}: {e}")

    content_length = int(response.info().get("Content-Length", 0))
    if status_code == 206:
        total_size = current_size + content_length
        mode = "ab"
    else:
        total_size = content_length
        current_size = 0
        mode = "wb"

    chunk_size = 1024 * 1024
    downloaded = current_size
    start = time.time()
    last_report = 0.0

    with open(dest, mode) as fh:
        while True:
            if job and job._cancel.is_set():
                return {"cancelled": True, "downloaded_mb": round(downloaded / 1024 / 1024, 1)}
            chunk = response.read(chunk_size)
            if not chunk:
                break
            fh.write(chunk)
            downloaded += len(chunk)
            now = time.time()
            if now - last_report >= 1.0 or (total_size and downloaded >= total_size):
                last_report = now
                if job and total_size:
                    job.progress = max(0, min(100, int(downloaded / total_size * 100)))
                    session = downloaded - current_size
                    speed = session / (now - start) / 1024 / 1024 if now > start else 0
                    job.message = (f"{downloaded/1024/1024:.0f}/{total_size/1024/1024:.0f} MB "
                                   f"({speed:.1f} MB/s)")

    if total_size and downloaded < total_size:
        raise RuntimeError(f"Download incomplete: {downloaded}/{total_size} bytes")
    return {"output": dest, "size_mb": round(downloaded / 1024 / 1024, 1)}


def delete_model(key: str) -> dict:
    """Remove a downloaded model file/dir to free space."""
    m = _model_by_key(key)
    if not m:
        raise ValueError(f"Unknown model '{key}'")
    target = settings.models_dir / m["path"]
    if target.is_file():
        target.unlink()
    elif target.is_dir():
        import shutil
        shutil.rmtree(target, ignore_errors=True)
    return {"deleted": str(target)}
