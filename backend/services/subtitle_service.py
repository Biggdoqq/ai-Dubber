"""Subtitle editing algorithms — ported VERBATIM from the legacy app.

Sources (AI_Dubber_PyQt5_Complete.py):
  - smart auto-speed : 9736-9810   (speed = chars / (window * BASE_CPS), clamped)
  - merge rows       : 9812-9844
  - shift times      : 9846-9865
  - voice markers    : 7743-7752   (_auto_detect_gender_for_row heuristics)

These operate on the plain Subtitle data model instead of the QTableWidget, but
the math/semantics are unchanged. Do not "improve" the formulas.
"""
from __future__ import annotations

import re

from backend.models import Subtitle

# Male/female text markers ported verbatim from the legacy
# _auto_detect_gender_for_row (AI_Dubber_PyQt5_Complete.py:7743-7752).
MALE_MARKERS = (
    "he ", "him ", "his ", "himself",
    "លោក", "ប្រុស", "ប្អូនប្រុស", "បងប្រុស", "ប្តី",
    "គាត់", "brother", "sir", "mr ", "mr.", "father",
    "grandfather", "uncle", "son", "boy", "man ",
    "male", "king", "prince", "emperor", "lord",
)
FEMALE_MARKERS = (
    "she ", "her ", "hers", "herself",
    "នាង", "ស្រី", "ក្មេងស្រី", "ប្អូនស្រី", "បងស្រី",
    "ភរិយា", "mom", "mother", "sister", "miss ", "mrs ",
    "ms ", "girl", "woman", "female",
    "queen", "princess", "empress", "lady", "aunt", "daughter",
)


def smart_auto_speed(
    subs: list[Subtitle],
    language: str = "km",
    min_speed: float = 0.9,
    max_speed: float = 1.20,
) -> list[Subtitle]:
    """Set per-row TTS speed so the voice fits inside each row's time window.

    Reference rates at speed 1.0: Khmer ~14 cps, English ~16 cps (legacy values).
    """
    base_cps = 14.0 if language == "km" else 16.0
    for s in subs:
        text = (s.text or "").strip()
        if not text:
            continue
        window = s.end - s.start
        if window <= 0:
            continue
        needed = len(text) / (window * base_cps)
        s.speed = round(max(min_speed, min(max_speed, needed)), 2)
    return subs


def merge_rows(subs: list[Subtitle], indices: list[int]) -> list[Subtitle]:
    """Merge consecutive rows (by index) into the first; combine text with spaces.

    Mirrors the legacy guard: indices must be consecutive.
    """
    if len(indices) < 2:
        raise ValueError("Select at least two consecutive rows to merge")
    ordered = sorted(indices)
    if ordered != list(range(ordered[0], ordered[-1] + 1)):
        raise ValueError("Please select consecutive rows")

    first, last = ordered[0], ordered[-1]
    combined = " ".join(subs[r].text for r in ordered)
    subs[first].text = combined
    subs[first].end = subs[last].end

    for r in sorted(ordered[1:], reverse=True):
        del subs[r]
    return subs


def shift_times(subs: list[Subtitle], indices: list[int], offset: float) -> list[Subtitle]:
    """Shift start/end of the given rows by `offset` seconds (clamped at 0)."""
    for r in indices:
        if 0 <= r < len(subs):
            subs[r].start = max(0.0, subs[r].start + offset)
            subs[r].end = max(0.0, subs[r].end + offset)
    return subs


def auto_split_long_rows(subs: list[Subtitle], max_chars: int = 60) -> list[Subtitle]:
    """Split rows whose text exceeds `max_chars` into two timed rows.

    Ported verbatim from the legacy auto_split_long_rows (AI_Dubber_PyQt5_Complete
    .py:6842). Split-point priority: Khmer sentence break (។ ៕ ៖) near the middle,
    else space/comma/period near the middle, else hard character midpoint. The
    timestamp is split proportionally to the character split point.
    """
    result: list[Subtitle] = []
    for s in subs:
        text = (s.text or "").strip()
        if len(text) <= max_chars:
            result.append(s)
            continue

        mid = len(text) // 2
        best = -1
        for i in range(mid, len(text)):
            if text[i] in ("។", "៕", "៖"):
                best = i + 1
                break
        if best < 0:
            for i in range(mid, 0, -1):
                if text[i] in ("។", "៕", "៖"):
                    best = i + 1
                    break
        if best < 0:
            for i in range(mid, len(text)):
                if text[i] in (" ", ",", "."):
                    best = i + 1
                    break
        if best < 0:
            for i in range(mid, 0, -1):
                if text[i] in (" ", ",", "."):
                    best = i + 1
                    break
        if best < 0:
            best = mid

        part1 = text[:best].strip()
        part2 = text[best:].strip()
        if not part1 or not part2:
            result.append(s)
            continue

        t_mid = s.start + (s.end - s.start) * (best / len(text))
        first = Subtitle.from_dict({**s.to_dict(), "text": part1, "start": s.start, "end": t_mid})
        second = Subtitle.from_dict({**s.to_dict(), "text": part2, "start": t_mid, "end": s.end})
        result.append(first)
        result.append(second)
    return result


def auto_assign_voices(
    subs: list[Subtitle],
    male_voice: str = "km-KH-PisethNeural",
    female_voice: str = "km-KH-SreymomNeural",
) -> list[Subtitle]:
    """Assign a voice per row from gendered text cues.

    Ported from the legacy _auto_detect_gender_for_row (AI_Dubber_PyQt5_Complete
    .py:7725): scan the (lower-cased) row text for male/female role markers and
    set the voice accordingly. Prefers an already-set gender field, then falls
    back to text markers. Rows with no cue keep their existing voice.
    """
    for s in subs:
        gender = (s.gender or "").strip().lower()
        if gender == "male":
            s.voice = male_voice
            continue
        if gender == "female":
            s.voice = female_voice
            continue
        text = (s.text or "").lower()
        if any(m in text for m in MALE_MARKERS):
            s.voice = male_voice
            s.gender = "Male"
        elif any(m in text for m in FEMALE_MARKERS):
            s.voice = female_voice
            s.gender = "Female"
    return subs


def smart_cleanup(subs: list[Subtitle]) -> list[Subtitle]:
    """Tidy subtitle text: strip formatting tags, normalize whitespace, drop empties.

    Pure text hygiene (no meaning change): remove HTML/SRT tags (<i>, {\\an8}),
    speaker-label prefixes are left intact (see detect_characters), collapse
    repeated whitespace/newlines, trim, and drop rows that become empty.
    """
    result: list[Subtitle] = []
    for s in subs:
        text = s.text or ""
        text = re.sub(r"<[^>]+>", "", text)          # HTML-style tags
        text = re.sub(r"\{[^}]*\}", "", text)        # ASS/SSA override blocks
        text = re.sub(r"\s+", " ", text).strip()     # collapse whitespace
        if not text:
            continue
        s.text = text
        result.append(s)
    return result


# Speaker-label prefix, e.g. "JOHN:", "នាង ស្រី៖", "- Bob -"
_SPEAKER_RE = re.compile(r"^\s*[-–]?\s*([A-Z][A-Za-z .'ក-៿]{0,30}?)\s*[:：៖]\s*")


def detect_characters(subs: list[Subtitle]) -> dict:
    """Detect distinct speaker labels from row text prefixes.

    Heuristic (no ML): a leading "NAME:" / "NAME៖" prefix marks a speaker. Returns
    the unique speaker names and, per row, the detected speaker (or null). Does
    not mutate the subtitles — callers decide whether to map speakers to voices.
    """
    row_speakers: list[str | None] = []
    counts: dict[str, int] = {}
    for s in subs:
        text = (s.text or "").strip()
        m = _SPEAKER_RE.match(text)
        name = m.group(1).strip() if m else None
        row_speakers.append(name)
        if name:
            counts[name] = counts.get(name, 0) + 1
    characters = sorted(counts, key=lambda n: -counts[n])
    return {"characters": characters, "counts": counts, "row_speakers": row_speakers}
