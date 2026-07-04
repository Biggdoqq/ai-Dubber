"""Video effects service.

Reuses the EXISTING legacy `Effect.py` (filter library, EFFECT_PRESETS,
FFMPEG_EFFECTS, EffectProcessor, AutoTextBlurEffect) without modification. The
module imports cv2/numpy/PIL, so it is run via a subprocess of the portable
worker python — the same isolation pattern used for transcription/voxcpm/demucs
— rather than imported into the API process.

The catalog (preset/ffmpeg-effect names + ranges) is read directly from the
worker so the UI always matches the legacy definitions.
"""
from __future__ import annotations

import json
import os
import subprocess

from backend.config import settings
from backend.utils.jobs import Job

_NO_WINDOW = 0x08000000 if os.name == "nt" else 0
_PROJECT_ROOT = settings.root


def list_effects() -> dict:
    """Return the legacy effect catalog (presets + ffmpeg effects + ranges)."""
    code = (
        "import json, Effect; "
        "print(json.dumps({"
        "'presets': list(Effect.EFFECT_PRESETS.keys()), "
        "'ffmpeg': Effect.FFMPEG_EFFECTS}))"
    )
    proc = subprocess.run(
        [settings.worker_python, "-c", code],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=str(_PROJECT_ROOT), creationflags=_NO_WINDOW,
    )
    out = (proc.stdout or "").strip().splitlines()
    for line in reversed(out):
        line = line.strip()
        if line.startswith("{"):
            try:
                return json.loads(line)
            except Exception:
                continue
    # Fallback static catalog if the worker can't import Effect (e.g. no cv2).
    return {
        "presets": [
            "Auto Blur Text/Titles", "Auto Blur Subtitles (Bottom)",
            "Cinematic Warm", "Cinematic Cool", "Vintage Film", "Noir",
            "Dreamy", "Dramatic", "Sepia Classic", "Glitch Art",
            "Sharp & Clear", "Soft Focus",
        ],
        "ffmpeg": {
            "Brightness": {"name": "brightness", "min": -1.0, "max": 1.0, "default": 0.0, "unit": ""},
            "Contrast": {"name": "contrast", "min": 0.0, "max": 2.0, "default": 1.0, "unit": "x"},
            "Saturation": {"name": "saturation", "min": 0.0, "max": 3.0, "default": 1.0, "unit": "x"},
            "Hue": {"name": "hue", "min": -180, "max": 180, "default": 0, "unit": "deg"},
            "Blur": {"name": "blur", "min": 1, "max": 50, "default": 5, "unit": "px"},
            "Sharpen": {"name": "sharpen", "min": 0.0, "max": 5.0, "default": 1.0, "unit": "x"},
            "Vignette": {"name": "vignette", "min": 0.0, "max": 1.0, "default": 0.5, "unit": ""},
            "Invert Colors": {"name": "invert"},
            "Edge Detect": {"name": "edge_detect"},
            "Old Film": {"name": "old_film"},
            "Speed": {"name": "speed", "min": 0.25, "max": 4.0, "default": 1.0, "unit": "x"},
            "Reverse": {"name": "reverse"},
        },
    }


def apply_effect(
    input_video: str,
    output_video: str,
    effect_name: str,
    value: float = 1.0,
    job: Job | None = None,
) -> dict:
    """Apply a legacy effect/preset to a video via Effect.apply_effect_to_video."""
    if not input_video or not os.path.exists(input_video):
        raise RuntimeError("Source video not found.")

    if job:
        job.progress = 5
        job.message = f"Applying effect: {effect_name}…"

    # Run the legacy convenience entrypoint verbatim in the worker python.
    code = (
        "import sys, Effect; "
        "Effect.apply_effect_to_video("
        f"input_video={input_video!r}, output_video={output_video!r}, "
        f"effect_name={effect_name!r}, value={float(value)!r}, "
        "progress_callback=lambda p, m: print(f'PROGRESS {p} {m}', flush=True))"
    )
    proc = subprocess.Popen(
        [settings.worker_python, "-c", code],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        encoding="utf-8", errors="replace",
        cwd=str(_PROJECT_ROOT), creationflags=_NO_WINDOW,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.strip()
        if line.startswith("PROGRESS") and job:
            parts = line.split(" ", 2)
            try:
                job.progress = max(5, min(99, int(parts[1])))
                if len(parts) > 2:
                    job.message = parts[2]
            except (ValueError, IndexError):
                pass
        if job and job._cancel.is_set():
            proc.kill()
            return {"cancelled": True}
    proc.wait()
    if proc.returncode != 0 or not os.path.exists(output_video):
        err = proc.stderr.read()[-600:] if proc.stderr else ""
        raise RuntimeError(f"Effect failed: {err}")

    if job:
        job.progress = 100
        job.message = "Effect applied!"
    return {"output": output_video, "effect": effect_name}


def apply_overlays(
    input_video: str,
    output_video: str,
    config: dict,
    job: Job | None = None,
) -> dict:
    """Render watermark/blur/text overlays onto a whole video.

    Reuses the legacy video_effects.apply_effects_to_frame renderer VERBATIM via
    `video_effects_worker.py` (subprocess of the worker python). `config` is the
    same {watermark, blur, text} dict the legacy app persists as
    video_effects_config.
    """
    if not input_video or not os.path.exists(input_video):
        raise RuntimeError("Source video not found.")

    cfg_path = str(settings.temp_dir / "video_effects_config.json")
    with open(cfg_path, "w", encoding="utf-8") as fh:
        json.dump(config or {}, fh, ensure_ascii=False)

    if job:
        job.progress = 5
        job.message = "Rendering overlays…"

    proc = subprocess.Popen(
        [settings.worker_python, str(settings.video_effects_worker),
         "--input", input_video, "--output", output_video,
         "--config", cfg_path, "--ffmpeg", settings.ffmpeg],
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        encoding="utf-8", errors="replace",
        cwd=str(_PROJECT_ROOT), creationflags=_NO_WINDOW,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.strip()
        if line.startswith("PROGRESS") and job:
            parts = line.split(" ", 2)
            try:
                job.progress = max(5, min(99, int(parts[1])))
                if len(parts) > 2:
                    job.message = parts[2]
            except (ValueError, IndexError):
                pass
        if job and job._cancel.is_set():
            proc.kill()
            return {"cancelled": True}
    proc.wait()
    if proc.returncode != 0 or not os.path.exists(output_video):
        err = proc.stderr.read()[-600:] if proc.stderr else ""
        raise RuntimeError(f"Overlay render failed: {err}")

    if job:
        job.progress = 100
        job.message = "Overlays applied!"
    return {"output": output_video}
