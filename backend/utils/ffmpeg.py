"""FFmpeg helpers — thin wrappers around the bundled binaries.

Uses the same bundled bin/ffmpeg the legacy app relies on. Subprocess calls
suppress the console window on Windows (mirrors the legacy CREATE_NO_WINDOW
monkeypatch) so no terminal flashes when launched from the EXE.
"""
from __future__ import annotations

import json
import subprocess
from pathlib import Path

from backend.config import settings

_NO_WINDOW = 0x08000000 if __import__("os").name == "nt" else 0


def _run(cmd: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(
        cmd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=_NO_WINDOW,
    )


def probe_duration(media_path: str) -> float:
    """Return media duration in seconds (0.0 on failure)."""
    cmd = [
        settings.ffprobe, "-v", "error", "-show_entries", "format=duration",
        "-of", "json", media_path,
    ]
    proc = _run(cmd)
    try:
        data = json.loads(proc.stdout or "{}")
        return float(data.get("format", {}).get("duration", 0.0))
    except Exception:
        return 0.0


def extract_audio(video_path: str, out_wav: str, sample_rate: int = 16000) -> str:
    """Extract mono PCM wav for transcription (matches legacy 16k mono path)."""
    cmd = [
        settings.ffmpeg, "-y", "-i", video_path,
        "-vn", "-ac", "1", "-ar", str(sample_rate), "-acodec", "pcm_s16le",
        out_wav,
    ]
    proc = _run(cmd)
    if proc.returncode != 0:
        raise RuntimeError(f"ffmpeg audio extract failed: {proc.stderr[-500:]}")
    return out_wav


def available() -> bool:
    proc = _run([settings.ffmpeg, "-version"])
    return proc.returncode == 0
