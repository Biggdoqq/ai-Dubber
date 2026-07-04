"""Standalone worker: apply watermark/blur/text overlays to a whole video.

Reuses the legacy `video_effects.apply_effects_to_frame` renderer VERBATIM (the
~120 watermark/blur/text styles) by looping it over every frame, then re-muxes
the original audio with ffmpeg. Run as a subprocess of the worker python so the
cv2 + PyQt5 (QtGui text rasterization) imports stay isolated from the API
process — the same isolation pattern used for transcription/voxcpm/demucs.

Usage:
  python video_effects_worker.py --input IN.mp4 --output OUT.mp4 --config cfg.json

Emits "PROGRESS <pct> <msg>" lines on stdout for the job manager to parse.
"""
from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--output", required=True)
    ap.add_argument("--config", required=True)
    ap.add_argument("--ffmpeg", default="ffmpeg")
    args = ap.parse_args()

    import cv2  # noqa: PLC0415
    from video_effects import apply_effects_to_frame  # legacy renderer, unchanged

    with open(args.config, "r", encoding="utf-8") as fh:
        config = json.load(fh)

    cap = cv2.VideoCapture(args.input)
    if not cap.isOpened():
        print(f"ERROR: cannot open video {args.input}", file=sys.stderr)
        return 1

    fps = cap.get(cv2.CAP_PROP_FPS) or 25.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0

    temp_avi = args.output + ".temp.avi"
    fourcc = cv2.VideoWriter_fourcc(*"XVID")
    writer = cv2.VideoWriter(temp_avi, fourcc, fps, (width, height))

    idx = 0
    print("PROGRESS 5 Rendering overlays...", flush=True)
    while True:
        ret, frame = cap.read()
        if not ret:
            break
        try:
            frame = apply_effects_to_frame(frame, config)
        except Exception as exc:  # noqa: BLE001
            print(f"WARN: frame {idx} effect error: {exc}", file=sys.stderr)
        writer.write(frame)
        idx += 1
        if total and idx % 15 == 0:
            pct = 5 + int((idx / total) * 75)
            print(f"PROGRESS {pct} Rendering frame {idx}/{total}", flush=True)

    cap.release()
    writer.release()

    print("PROGRESS 82 Muxing audio...", flush=True)
    # Re-encode rendered video and copy the original audio track (if any).
    cmd = [
        args.ffmpeg, "-y",
        "-i", args.input,
        "-i", temp_avi,
        "-map", "1:v:0", "-map", "0:a:0?",
        "-c:v", "libx264", "-preset", "fast", "-crf", "20", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "320k",
        "-shortest",
        args.output,
    ]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding="utf-8", errors="replace")
    try:
        os.remove(temp_avi)
    except OSError:
        pass

    if proc.returncode != 0 or not os.path.exists(args.output):
        print(f"ERROR: ffmpeg mux failed: {(proc.stderr or '')[-400:]}", file=sys.stderr)
        return 1

    print("PROGRESS 100 Overlays applied!", flush=True)
    print(json.dumps({"success": True, "output": args.output}), flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
