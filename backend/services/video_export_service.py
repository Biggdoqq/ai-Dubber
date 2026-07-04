"""Video dub export service (.mp4).

Reuses the existing MP3 dub assembly verbatim (export_service.export_mp3 ->
the legacy _execute_mp3_export math) to build the dub audio track, then muxes
it onto the source video with ffmpeg. The mux/encoder logic is ported from the
legacy _execute_video_export (AI_Dubber_PyQt5_Complete.py:909-2026):

  - encoder fallback chain h264_nvenc -> h264_mf -> libx264 (GPU then CPU)
  - optional burn-subtitles via a generated .ass (subtitles= filter)
  - optional quality scaling preset (720/1080/4K/original)
  - AAC 320k / 48kHz, +faststart, -avoid_negative_ts make_zero

No working algorithm is rewritten — the audio pipeline is the existing service
and the ffmpeg flags mirror the legacy command.
"""
from __future__ import annotations

import os
import shutil
import subprocess

from backend.config import settings
from backend.core.srt import srt_seconds_to_time
from backend.models import Subtitle
from backend.services import export_service
from backend.utils import ffmpeg
from backend.utils.jobs import Job

_NO_WINDOW = 0x08000000 if os.name == "nt" else 0

# Quality presets: target height (None = keep original). Mirrors the legacy
# ExportOptionsDialog presets (Mobile/720/1080/4K/Original).
QUALITY_PRESETS = {
    "mobile": 480,
    "720p": 720,
    "1080p": 1080,
    "4k": 2160,
    "original": None,
}


def _ass_timestamp(seconds: float) -> str:
    """ASS uses H:MM:SS.cs (centiseconds)."""
    if seconds < 0:
        seconds = 0
    h = int(seconds // 3600)
    m = int((seconds % 3600) // 60)
    s = int(seconds % 60)
    cs = int(round((seconds - int(seconds)) * 100))
    if cs == 100:
        cs = 99
    return f"{h}:{m:02d}:{s:02d}.{cs:02d}"


def _build_ass(subtitles: list[Subtitle], path: str, font_size: int = 28) -> bool:
    """Write a minimal .ass for hardsub (legacy burn-subtitle format)."""
    rows = [s for s in subtitles if (s.text or "").strip()]
    if not rows:
        return False
    header = [
        "[Script Info]",
        "ScriptType: v4.00+",
        "PlayResX: 1920",
        "PlayResY: 1080",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, "
        "Bold, Italic, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        f"Style: Default,Khmer OS Battambang,{font_size},&H00FFFFFF,&H00000000,&H80000000,"
        "1,0,1,2,1,2,20,20,40,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    lines = list(header)
    for s in rows:
        text = (s.text or "").replace("\n", "\\N").strip()
        lines.append(
            f"Dialogue: 0,{_ass_timestamp(s.start)},{_ass_timestamp(s.end)},Default,,0,0,0,,{text}"
        )
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("\n".join(lines))
    return True


def export_video(
    subtitles: list[Subtitle],
    video_path: str,
    output_path: str,
    video_duration: float = 0.0,
    dub_volume: int = 100,
    auto_sync_speed: bool = True,
    audio_start_offset_ms: int = 0,
    burn_subtitles: bool = False,
    quality: str = "original",
    use_gpu: bool = False,
    subtitle_font_size: int = 28,
    video_encoder: str | None = None,
    job: Job | None = None,
) -> dict:
    if not video_path or not os.path.exists(video_path):
        raise RuntimeError("Source video not found. Load a video first.")

    if video_duration <= 0:
        video_duration = ffmpeg.probe_duration(video_path)
    if video_duration <= 0:
        raise RuntimeError("Could not determine video duration.")

    temp_dir = settings.temp_dir / "video_export"
    shutil.rmtree(temp_dir, ignore_errors=True)
    temp_dir.mkdir(parents=True, exist_ok=True)

    total_rows = max(1, len([s for s in subtitles if (s.text or "").strip()]))

    # --- 1. Build the dub audio track via the EXISTING mp3 assembly ---
    # Progress slice 5 → 85 maps onto the TTS assembly phase.
    if job:
        job.progress = 5
        job.message = f"Generating dub audio… (0/{total_rows} rows)"

    # Proxy Job that forwards progress into the parent's 5–85 range.
    class _ProxyJob:
        """Thin proxy so export_service can report per-row progress."""
        def __init__(self, parent: "Job", total: int) -> None:
            self._parent = parent
            self._total = total

        def _set(self, pct: int, msg: str) -> None:
            if self._parent:
                # Map 0-100 from sub-task → 5-85 in parent.
                self._parent.progress = 5 + int(pct * 0.80)
                self._parent.message = msg

        @property
        def progress(self) -> int:
            return self._parent.progress if self._parent else 0

        @progress.setter
        def progress(self, v: int) -> None:
            self._set(v, self._parent.message if self._parent else "")

        @property
        def message(self) -> str:
            return self._parent.message if self._parent else ""

        @message.setter
        def message(self, v: str) -> None:
            if self._parent:
                self._parent.message = v

        @property
        def _cancel(self):
            return self._parent._cancel if self._parent else None

    proxy = _ProxyJob(job, total_rows) if job else None

    dub_audio = str(temp_dir / "dub_audio.mp3")
    export_service.export_mp3(
        subtitles,
        video_duration=video_duration,
        output_path=dub_audio,
        dub_volume=dub_volume,
        auto_sync_speed=auto_sync_speed,
        audio_start_offset_ms=audio_start_offset_ms,
        job=proxy,  # type: ignore[arg-type]
    )

    # --- 2. Build the video filter chain (scale + optional hardsub) ---
    v_filters = []
    height = QUALITY_PRESETS.get(quality, None)
    if height:
        v_filters.append(f"scale=-2:{height}")

    ass_path = None
    if burn_subtitles:
        ass_path = str(temp_dir / "burn_subs.ass")
        if _build_ass(subtitles, ass_path, font_size=subtitle_font_size):
            ass_esc = ass_path.replace("\\", "/").replace(":", "\\:")
            v_filters.append(f"subtitles='{ass_esc}'")
        else:
            ass_path = None

    v_filters.append("format=yuv420p")
    vf = ",".join(v_filters)

    # --- 3. Mux: video + dub audio, encoder fallback nvenc -> mf -> libx264 ---
    if job:
        job.progress = 85
        job.message = "Muxing video…"

    def _cmd(v_codec: str, quality_flag: list[str]) -> list[str]:
        return [
            settings.ffmpeg, "-y",
            "-i", video_path,
            "-i", dub_audio,
            "-map", "0:v:0", "-map", "1:a:0",
            "-vf", vf,
            "-c:v", v_codec, "-preset", "fast", *quality_flag,
            "-c:a", "aac", "-ac", "2", "-b:a", "320k", "-ar", "48000",
            "-avoid_negative_ts", "make_zero",
            "-max_muxing_queue_size", "9999",
            "-movflags", "+faststart",
            "-t", str(video_duration),
            output_path,
        ]

    # Encoder candidates: direct encoder override or GPU first, then CPU fallback.
    candidates: list[tuple[str, list[str]]] = []
    if video_encoder:
        if video_encoder == "h264_nvenc":
            candidates.append(("h264_nvenc", ["-cq", "20"]))
        elif video_encoder == "h264_mf":
            candidates.append(("h264_mf", ["-b:v", "6M"]))
        elif video_encoder == "h264_qsv":
            candidates.append(("h264_qsv", ["-global_quality", "20"]))
        elif video_encoder == "libx264":
            candidates.append(("libx264", ["-crf", "20"]))
        else:
            candidates.append((video_encoder, []))
    else:
        if use_gpu:
            candidates.append(("h264_nvenc", ["-cq", "20"]))
            candidates.append(("h264_mf", ["-b:v", "6M"]))
        candidates.append(("libx264", ["-crf", "20"]))

    last_err = ""
    used = None
    for codec, qflag in candidates:
        proc = subprocess.run(
            _cmd(codec, qflag), capture_output=True, text=True,
            encoding="utf-8", errors="replace", creationflags=_NO_WINDOW,
        )
        if proc.returncode == 0 and os.path.exists(output_path):
            used = codec
            break
        last_err = (proc.stderr or "")[-800:]

    shutil.rmtree(temp_dir, ignore_errors=True)
    if used is None:
        raise RuntimeError(f"Video export failed (all encoders):\n{last_err}")

    if job:
        job.progress = 100
        job.message = "Video export complete!"
    return {"output": output_path, "encoder": used, "burned_subtitles": bool(ass_path)}
