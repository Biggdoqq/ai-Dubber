"""Waveform peak extraction for the read-only timeline.

Ports the legacy `_generate_waveform_data` (AI_Dubber_PyQt5_Complete.py:7324):
decode the media's audio, normalize by the max-abs amplitude, and reduce it to a
peak array for drawing. A low-rate mono extract + fixed bucket count keeps the
payload bounded regardless of video length. numpy/pydub are imported lazily so
they stay out of the API process at startup (same pattern as audio_service).
"""
from __future__ import annotations

import os
import subprocess

from backend.config import settings

_NO_WINDOW = 0x08000000 if os.name == "nt" else 0


def generate_peaks(media_path: str, buckets: int = 800) -> dict:
    if not media_path or not os.path.exists(media_path):
        raise RuntimeError("Media file not found.")

    import numpy as np
    from pydub import AudioSegment
    AudioSegment.converter = settings.ffmpeg

    wav = str(settings.temp_dir / "waveform_src.wav")
    subprocess.run(
        [settings.ffmpeg, "-y", "-i", media_path, "-vn", "-ac", "1",
         "-ar", "8000", "-acodec", "pcm_s16le", wav],
        capture_output=True, creationflags=_NO_WINDOW,
    )
    if not os.path.exists(wav):
        raise RuntimeError("Failed to extract audio for waveform.")

    seg = AudioSegment.from_file(wav)
    samples = np.array(seg.get_array_of_samples(), dtype=np.float32)
    if samples.size == 0:
        return {"peaks": [], "buckets": 0}

    max_val = float(np.max(np.abs(samples))) or 1.0
    samples /= max_val

    buckets = max(1, min(buckets, samples.size))
    window = samples.size // buckets
    trimmed = samples[: window * buckets]
    reshaped = trimmed.reshape(buckets, window)
    peaks = np.max(np.abs(reshaped), axis=1)
    return {"peaks": [round(float(p), 4) for p in peaks], "buckets": int(buckets)}
