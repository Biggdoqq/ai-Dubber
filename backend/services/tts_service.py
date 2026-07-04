"""Text-to-speech service.

- Edge TTS: ported from the legacy `_generate_edge_tts` (voice mapping, rate
  formula, speaker-tag stripping, +0Hz pitch, silence fallback).
- VoxCPM2: reuses the EXISTING `voxcpm_worker_script.py` via subprocess (the
  legacy isolation pattern), unchanged.
"""
from __future__ import annotations

import asyncio
import os
import re
import subprocess
import threading
from pathlib import Path

from backend.config import settings

_NO_WINDOW = 0x08000000 if os.name == "nt" else 0

# Speaker tags the legacy app strips before speaking, e.g. "[ប្រុស]:", "(ស្រី)៖".
_TAG_RE = re.compile(r"^\s*[\[\(][^\]\)]*[\]\)]\s*[::\u003a\u17d6]?\s*")

# ---------------------------------------------------------------------------
# Shared background event loop — avoids the overhead / latency of calling
# asyncio.run() (which creates + destroys a full event loop) for every TTS
# row. This was the primary cause of choppy / uneven audio output.
# ---------------------------------------------------------------------------
_loop: asyncio.AbstractEventLoop | None = None
_loop_lock = threading.Lock()


def _get_loop() -> asyncio.AbstractEventLoop:
    global _loop
    with _loop_lock:
        if _loop is None or _loop.is_closed():
            _loop = asyncio.new_event_loop()
            t = threading.Thread(target=_loop.run_forever, daemon=True)
            t.start()
        return _loop


def _run_async(coro):
    """Run a coroutine on the shared background loop and block until done."""
    future = asyncio.run_coroutine_threadsafe(coro, _get_loop())
    return future.result(timeout=60)


def _strip_speaker_tags(text: str) -> str:
    return _TAG_RE.sub("", text).strip()


def _map_edge_voice(voice: str) -> str:
    """Map a friendly/legacy voice token to an edge-tts voice id."""
    v = (voice or "").lower()
    if "piseth" in v or ("km" in v and "male" in v):
        return "km-KH-PisethNeural"
    if "jenny" in v or ("en" in v and "female" in v):
        return "en-US-JennyNeural"
    if voice and voice.startswith(("km-", "en-", "th-", "zh-", "ja-", "ko-")):
        return voice  # already an explicit edge voice id
    return "km-KH-SreymomNeural"  # Khmer female default


def _rate_str(speed: float) -> str:
    return f"{int(round((speed - 1) * 100)):+d}%"


def _pitch_str(text: str, pitch: int = 0) -> str:
    """Per-row pitch + native +25Hz lift on questions (legacy _generate_edge_tts:10283)."""
    base = int(pitch or 0)
    stripped = text.strip()
    if stripped.endswith("?") or stripped.endswith("\u17d6?") or stripped.endswith("\uff1f"):
        base += 25
    return f"{base:+d}Hz"


async def _edge_save(text: str, voice: str, rate: str, pitch: str, out_path: str) -> None:
    import edge_tts
    comm = edge_tts.Communicate(text, voice, rate=rate, pitch=pitch)
    await comm.save(out_path)


def generate_edge_tts(text: str, voice: str = "", speed: float = 1.0,
                      out_path: str | None = None, pitch: int = 0) -> str:
    clean = _strip_speaker_tags(text)
    edge_voice = _map_edge_voice(voice)
    rate = _rate_str(speed)
    pitch_str = _pitch_str(clean, pitch)
    out_path = out_path or str(settings.temp_dir / "tts_edge.mp3")

    last_err = None
    # Use the shared persistent event loop — avoids per-row loop creation
    # which was causing latency spikes that made audio sound choppy.
    for attempt in range(3):
        try:
            _run_async(_edge_save(clean, edge_voice, rate, pitch_str, out_path))
            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                return out_path
        except Exception as exc:  # noqa: BLE001
            last_err = exc
            import time
            time.sleep(0.5 * (attempt + 1))  # short back-off on retry
    # Fallback: 200ms of silence so the pipeline never hard-fails.
    subprocess.run(
        [settings.ffmpeg, "-y", "-f", "lavfi", "-i", "anullsrc=r=24000:cl=mono",
         "-t", "0.2", out_path],
        capture_output=True, creationflags=_NO_WINDOW,
    )
    if not (os.path.exists(out_path) and os.path.getsize(out_path) > 0):
        raise RuntimeError(f"Edge TTS failed: {last_err}")
    return out_path


def generate_voxcpm(text: str, voice_id: str, speed: float = 1.0,
                    reference_wav: str | None = None, out_path: str | None = None) -> str:
    """Neural TTS via the existing voxcpm worker script (subprocess-isolated)."""
    out_path = out_path or str(settings.temp_dir / "tts_voxcpm.wav")
    cmd = [
        settings.worker_python, str(settings.voxcpm_worker),
        "--text", text,
        "--voice", voice_id.replace("voxcpm2:", ""),
        "--speed", str(speed),
        "--output", out_path,
    ]
    if reference_wav:
        cmd += ["--ref_wav", reference_wav]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8",
                          errors="replace", creationflags=_NO_WINDOW)
    if proc.returncode != 0 or not os.path.exists(out_path):
        raise RuntimeError(f"VoxCPM worker failed: {proc.stderr[-500:]}")
    return out_path


def synthesize(text: str, voice: str = "", speed: float = 1.0,
               reference_wav: str | None = None, out_path: str | None = None,
               pitch: int = 0) -> str:
    """Dispatch by voice id prefix, mirroring the legacy dispatch."""
    if voice and voice.startswith("voxcpm2:"):
        return generate_voxcpm(text, voice, speed, reference_wav, out_path)
    return generate_edge_tts(text, voice, speed, out_path, pitch=pitch)
