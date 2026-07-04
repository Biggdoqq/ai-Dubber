"""Core SRT time codecs and parsing.

Ported VERBATIM from AI_Dubber_PyQt5_Complete.py:207-226 (the module-level
helpers shared by ExportWorker & AIVideoDubberApp). Behavior is identical;
only the names are kept public. Do not "improve" — the legacy app depends on
these exact rounding/formatting semantics.
"""
from __future__ import annotations

import re
from datetime import timedelta


def srt_seconds_to_time(seconds: float) -> str:
    """Convert seconds (float) -> SRT timestamp string  HH:MM:SS,mmm"""
    td = timedelta(seconds=seconds)
    total_seconds = int(td.total_seconds())
    hours = total_seconds // 3600
    minutes = (total_seconds % 3600) // 60
    secs = total_seconds % 60
    millisecs = int((seconds - int(seconds)) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millisecs:03d}"


def srt_time_to_sec(time_str: str) -> float:
    """Parse SRT timestamp string -> seconds (float). Returns 0.0 on failure."""
    try:
        match = re.match(r"(\d{2}):(\d{2}):(\d{2}),(\d{3})", time_str)
        if match:
            h, m, s, ms = map(int, match.groups())
            return h * 3600 + m * 60 + s + ms / 1000.0
    except Exception:
        pass
    return 0.0


def parse_srt(content: str) -> list[dict]:
    """Parse SRT text into a list of subtitle dicts.

    Mirrors the legacy block-splitting logic (split on blank lines, ' --> '
    separator). Returns rows with start/end seconds + string timestamps + text.
    """
    rows: list[dict] = []
    blocks = re.split(r"\n\s*\n", content.strip())
    for block in blocks:
        lines = [ln for ln in block.splitlines() if ln.strip() != ""]
        if len(lines) < 2:
            continue
        # First line may be an index; find the line with ' --> '
        time_line_idx = None
        for i, ln in enumerate(lines):
            if "-->" in ln:
                time_line_idx = i
                break
        if time_line_idx is None:
            continue
        time_line = lines[time_line_idx]
        parts = time_line.split("-->")
        if len(parts) != 2:
            continue
        start_str = parts[0].strip()
        end_str = parts[1].strip()
        text = "\n".join(lines[time_line_idx + 1:]).strip()
        rows.append(
            {
                "start": srt_time_to_sec(start_str),
                "end": srt_time_to_sec(end_str),
                "start_str": start_str,
                "end_str": end_str,
                "text": text,
            }
        )
    return rows


def build_srt(rows: list[dict]) -> str:
    """Serialize subtitle rows back to SRT text."""
    out: list[str] = []
    for i, row in enumerate(rows, start=1):
        start = row.get("start")
        end = row.get("end")
        start_s = srt_seconds_to_time(start) if start is not None else row.get("start_str", "00:00:00,000")
        end_s = srt_seconds_to_time(end) if end is not None else row.get("end_str", "00:00:00,000")
        out.append(str(i))
        out.append(f"{start_s} --> {end_s}")
        out.append(str(row.get("text", "")).strip())
        out.append("")
    return "\n".join(out).strip() + "\n"
