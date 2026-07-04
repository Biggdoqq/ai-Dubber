"""Audio dub export service.

Ports the legacy `_execute_mp3_export` assembly (AI_Dubber_PyQt5_Complete.py:
2095-2309) onto the plain Subtitle model: per-row TTS -> optional auto-sync
speed -> overrun trim -> echo -> global x per-row volume -> overlay onto a
silent base of the full video duration -> final MP3 at 320k.

Math/semantics are unchanged (volume_boost=6dB, OVERRUN_TOLERANCE, echo decay
formula, etc.). Qt table access is replaced by the Subtitle dataclass and Qt
progress signals by a job/callback.
"""
from __future__ import annotations

import logging
import math
import os
import shutil

from pydub import AudioSegment
from backend.config import settings

# Explicitly configure pydub to use the settings-resolved ffmpeg binary path
AudioSegment.converter = settings.ffmpeg

from backend.models import Subtitle
from backend.services import tts_service
from backend.services import settings_service
from backend.utils.jobs import Job

_log = logging.getLogger(__name__)


def _resolve_voice(sub: Subtitle) -> tuple[str, str | None]:
    """Resolve a row's voice + optional reference wav via character profiles."""
    voice = sub.voice or "km-KH-SreymomNeural"
    ref_wav = None
    profiles = settings_service.load_character_profiles()
    if voice in profiles:
        prof = profiles[voice]
        ref = prof.get("ref_wav")
        if ref and os.path.exists(ref):
            ref_wav = ref
    return voice, ref_wav


def export_mp3(
    subtitles: list[Subtitle],
    video_duration: float,
    output_path: str,
    dub_volume: int = 100,
    auto_sync_speed: bool = True,
    audio_start_offset_ms: int = 0,
    audio_format: str = "mp3",
    job: Job | None = None,
) -> dict:
    if video_duration <= 0:
        raise RuntimeError("Video duration is 0. Please load a video before exporting.")

    temp_dir = settings.temp_dir / "mp3_export"
    if temp_dir.exists():
        shutil.rmtree(temp_dir, ignore_errors=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    total = len(subtitles)
    clips: list[dict] = []

    vol_percent = dub_volume
    volume_db = 20 * math.log10(vol_percent / 100.0) if vol_percent > 0 else 0

    for i, sub in enumerate(subtitles):
        if job and job._cancel.is_set():
            return {"cancelled": True}

        text = (sub.text or "").strip()
        if not text:
            continue

        if job:
            job.progress = int(5 + ((i + 1) / total) * 85)
            job.message = f"Generating audio {i + 1}/{total}…"

        voice, ref_wav = _resolve_voice(sub)
        current_speed = float(sub.speed or 1.0)

        start_ms = sub.start * 1000
        end_ms = sub.end * 1000
        start_ms = max(0, start_ms + max(0, audio_start_offset_ms))
        end_ms = max(start_ms + 100, end_ms)

        next_start_ms = subtitles[i + 1].start * 1000 if i + 1 < total else None
        max_allowed_ms = int(end_ms - start_ms)
        if next_start_ms is not None:
            max_allowed_ms = min(max_allowed_ms, int(next_start_ms - start_ms))

        clip_path = str(temp_dir / f"clip_{i}.mp3")
        tts_service.synthesize(text, voice=voice, speed=current_speed,
                               reference_wav=ref_wav, out_path=clip_path,
                               pitch=int(sub.pitch or 0))
        clip = AudioSegment.from_file(clip_path)
        # Normalize to 48 kHz stereo immediately — prevents sample-rate
        # mismatch artifacts (clicks/pops) when overlaying clips onto the
        # silent base which pydub creates at its default rate.
        clip = clip.set_frame_rate(48000).set_channels(2)
        clip_duration_ms = len(clip)

        # Auto-sync speed: regenerate edge clips faster to fit window.
        if auto_sync_speed and max_allowed_ms > 100 and clip_duration_ms > max_allowed_ms * 1.05:
            ratio = clip_duration_ms / max_allowed_ms
            needed_speed = round(min(1.35, max(current_speed, current_speed * ratio)), 2)
            if needed_speed != current_speed and not voice.startswith("voxcpm2:"):
                tts_service.generate_edge_tts(text, voice, needed_speed, clip_path)
                clip = AudioSegment.from_file(clip_path)
                clip = clip.set_frame_rate(48000).set_channels(2)
                clip_duration_ms = len(clip)
                current_speed = needed_speed

        # pydub stretch fallback for voxcpm/custom audio.
        if auto_sync_speed and max_allowed_ms > 100 and clip_duration_ms > max_allowed_ms * 1.05:
            if voice.startswith("voxcpm2:"):
                stretch = min(1.35, clip_duration_ms / max_allowed_ms)
                if stretch > 1.05:
                    try:
                        from pydub.effects import speedup
                        clip = speedup(clip, playback_speed=stretch)
                        clip_duration_ms = len(clip)
                    except Exception as exc:  # noqa: BLE001
                        _log.warning("pydub speedup failed for row %d (continuing): %s", i, exc)

        overrun = 1.05 if auto_sync_speed else 2.0
        if max_allowed_ms > 100 and clip_duration_ms > max_allowed_ms * overrun:
            keep_ms = int(max_allowed_ms * overrun)
            fade_ms = min(200, keep_ms // 4)  # smooth 200ms fade-out, not 120ms hard cut
            clip = clip[:keep_ms].fade_out(fade_ms)
        # Short fade-in on every clip to avoid click/pop at clip start.
        clip = clip.fade_in(30)

        # Echo.
        try:
            echo_val = float(sub.echo or 0)
            if echo_val > 0:
                delay = 150
                decay_db = (100 - echo_val) / 100 * 16 + 4
                echo_clip = clip.apply_gain(-decay_db)
                silent_base = AudioSegment.silent(duration=len(clip) + delay)
                clip = silent_base.overlay(clip).overlay(echo_clip, position=delay)
        except Exception as exc:  # noqa: BLE001
            _log.warning("Echo processing failed for row %d (continuing): %s", i, exc)

        # Volume: global x per-row, +6 dB boost (legacy).
        row_vol_pct = max(0.0, float(sub.volume if sub.volume is not None else 100))
        effective_vol_pct = vol_percent * (row_vol_pct / 100.0)
        if effective_vol_pct <= 0 or vol_percent == 0:
            clip = AudioSegment.silent(duration=len(clip))
        else:
            volume_boost = 6.0
            if effective_vol_pct != vol_percent:
                row_db = 20 * math.log10(effective_vol_pct / 100.0)
                clip = clip + (row_db + volume_boost)
            else:
                clip = clip + (volume_db + volume_boost)

        if start_ms < 0:
            trim_ms = abs(int(start_ms))
            clip = clip[trim_ms:] if len(clip) > trim_ms else AudioSegment.silent(duration=10)
            start_ms = 0

        adjusted = str(temp_dir / f"adj_{i}.wav")
        clip.export(adjusted, format="wav", parameters=["-acodec", "pcm_s16le"])
        clips.append({"path": adjusted, "start_ms": start_ms})

    if job:
        job.progress = 95
        job.message = "Combining audio…"

    # Build the final silent base at 48 kHz stereo (matches all normalized clips).
    final = AudioSegment.silent(duration=int(video_duration * 1000), frame_rate=48000)
    final = final.set_channels(2)
    for c in clips:
        seg = AudioSegment.from_file(c["path"])
        seg = seg.set_frame_rate(48000).set_channels(2)
        final = final.overlay(seg, position=int(c["start_ms"]))

    fmt = "wav" if audio_format.lower() == "wav" else "mp3"
    if fmt == "wav":
        final.export(output_path, format="wav", parameters=["-acodec", "pcm_s16le", "-ar", "48000"])
    else:
        # loudnorm pass via ffmpeg for even volume across all clips.
        import subprocess as _sp
        _NO_WIN = 0x08000000 if __import__('os').name == 'nt' else 0
        raw_mp3 = output_path + ".raw.mp3"
        final.export(raw_mp3, format="mp3", bitrate="320k")
        proc = _sp.run(
            [settings.ffmpeg, "-y", "-i", raw_mp3,
             "-af", "loudnorm=I=-16:TP=-1.5:LRA=11",
             "-b:a", "320k", output_path],
            capture_output=True, creationflags=_NO_WIN,
        )
        __import__('os').unlink(raw_mp3)
        if proc.returncode != 0 or not __import__('os').path.exists(output_path):
            # fallback: use the raw mp3 directly if loudnorm fails
            __import__('shutil').move(raw_mp3 if __import__('os').path.exists(raw_mp3) else output_path, output_path)
    shutil.rmtree(temp_dir, ignore_errors=True)

    if job:
        job.progress = 100
        job.message = "Export complete!"
    return {"output": output_path, "clips": len(clips), "format": fmt}
