"""Phase A/B verification tests: ported algorithms + API surface.

Run: venv_cpu/Scripts/python.exe -m pytest backend/tests -q
(or executed directly without pytest via the __main__ block).
"""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app import app
from backend.core import srt
from backend.models import Subtitle, Project
from backend.services import subtitle_service as subs

client = TestClient(app)


# ---- core SRT codecs (must match legacy semantics exactly) ----

def test_srt_seconds_to_time():
    assert srt.srt_seconds_to_time(0) == "00:00:00,000"
    assert srt.srt_seconds_to_time(1.5) == "00:00:01,500"
    assert srt.srt_seconds_to_time(3661.25) == "01:01:01,250"


def test_srt_time_to_sec_roundtrip():
    for s in (0.0, 1.5, 61.0, 3661.25):
        assert abs(srt.srt_time_to_sec(srt.srt_seconds_to_time(s)) - s) < 0.001


def test_srt_time_to_sec_bad_input():
    assert srt.srt_time_to_sec("garbage") == 0.0


def test_parse_and_build_srt():
    text = "1\n00:00:01,000 --> 00:00:02,500\nHello\n\n2\n00:00:03,000 --> 00:00:04,000\nWorld"
    rows = srt.parse_srt(text)
    assert len(rows) == 2
    assert rows[0]["text"] == "Hello"
    assert rows[0]["start"] == 1.0 and rows[0]["end"] == 2.5
    rebuilt = srt.build_srt(rows)
    assert "00:00:01,000 --> 00:00:02,500" in rebuilt
    assert "Hello" in rebuilt


# ---- ported subtitle algorithms ----

def test_auto_speed_formula():
    # 28 chars in a 1s window at 14 cps -> needed=2.0 -> clamped to max 1.2
    s = Subtitle(start=0, end=1, text="x" * 28)
    subs.smart_auto_speed([s], language="km", min_speed=0.9, max_speed=1.2)
    assert s.speed == 1.2
    # short text, long window -> clamps to min
    s2 = Subtitle(start=0, end=10, text="hi")
    subs.smart_auto_speed([s2], language="km", min_speed=0.9, max_speed=1.2)
    assert s2.speed == 0.9


def test_merge_rows():
    rows = [
        Subtitle(start=0, end=1, text="a"),
        Subtitle(start=1, end=2, text="b"),
        Subtitle(start=2, end=3, text="c"),
    ]
    subs.merge_rows(rows, [0, 1])
    assert len(rows) == 2
    assert rows[0].text == "a b"
    assert rows[0].end == 2


def test_merge_rejects_nonconsecutive():
    rows = [Subtitle(text="a"), Subtitle(text="b"), Subtitle(text="c")]
    try:
        subs.merge_rows(rows, [0, 2])
        assert False, "should have raised"
    except ValueError:
        pass


def test_shift_times_clamps_at_zero():
    rows = [Subtitle(start=1, end=2, text="a")]
    subs.shift_times(rows, [0], -5)
    assert rows[0].start == 0.0 and rows[0].end == 0.0


# ---- project aivd roundtrip (legacy compatibility) ----

def test_project_aivd_roundtrip():
    proj = Project(video="v.mp4", subtitles=[Subtitle(start=1, end=2, text="hi", voice="km-KH-PisethNeural")])
    data = proj.to_aivd()
    back = Project.from_aivd(data)
    assert back.video == "v.mp4"
    assert back.subtitles[0].text == "hi"
    assert back.subtitles[0].voice == "km-KH-PisethNeural"


# ---- API surface ----

def test_ping():
    assert client.get("/api/ping").json() == {"pong": True}


def test_health():
    r = client.get("/api/system/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_srt_endpoints():
    r = client.post("/api/srt/parse", json={"content": "1\n00:00:01,000 --> 00:00:02,000\nHi"})
    assert r.status_code == 200 and r.json()["count"] == 1


def test_subtitle_endpoints():
    payload = {"subtitles": [{"start": 0, "end": 1, "text": "x" * 28}], "language": "km"}
    r = client.post("/api/subtitles/auto-speed", json=payload)
    assert r.status_code == 200
    assert r.json()["subtitles"][0]["speed"] == 1.2


def test_settings_endpoints():
    r = client.get("/api/settings")
    assert r.status_code == 200


if __name__ == "__main__":
    import sys
    fns = [v for k, v in sorted(globals().items()) if k.startswith("test_") and callable(v)]
    failed = 0
    for fn in fns:
        try:
            fn()
            print(f"PASS {fn.__name__}")
        except Exception as exc:  # noqa: BLE001
            failed += 1
            print(f"FAIL {fn.__name__}: {exc}")
    print(f"\n{len(fns) - failed}/{len(fns)} passed")
    sys.exit(1 if failed else 0)
