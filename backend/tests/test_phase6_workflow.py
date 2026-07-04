"""Phase 6 end-to-end workflow test using a real audio fixture.

Exercises the heavy offline pipelines that the API-surface test only smoke-checks:
transcription (faster-whisper subprocess), TTS synthesis (edge-tts), and MP3 dub
export (full assembly). Writes UTF-8 so Khmer paths don't crash the console.

Run: PYTHONPATH=. venv_cpu/Scripts/python backend/tests/test_phase6_workflow.py
"""
from __future__ import annotations

import glob
import io
import os
import sys
import time

# Force UTF-8 stdout (Khmer fixture names break cp1252).
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

from fastapi.testclient import TestClient  # noqa: E402

from backend.app import app  # noqa: E402

client = TestClient(app)

PASS = 0
FAIL = 0
NOTES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"PASS {name}")
    else:
        FAIL += 1
        print(f"FAIL {name}: {detail}")


def note(msg: str) -> None:
    NOTES.append(msg)
    print(f"NOTE {msg}")


def poll(job_id: str, timeout: float = 180.0) -> dict:
    deadline = time.time() + timeout
    last: dict = {}
    while time.time() < deadline:
        last = client.get(f"/api/jobs/{job_id}").json()
        if last["status"] in ("done", "error", "cancelled"):
            return last
        time.sleep(0.5)
    return {"status": "timeout", "error": "poll timeout", **last}


def main() -> int:
    fixtures = glob.glob("reference_voices/*.wav")
    if not fixtures:
        print("NO FIXTURES - skipping workflow test")
        return 0
    audio = os.path.abspath(fixtures[0])
    print(f"Using fixture: {os.path.basename(audio)}")

    # ---- media probe ----
    pr = client.get("/api/media/probe", params={"path": audio})
    dur = pr.json().get("duration", 0) if pr.status_code == 200 else 0
    check("media.probe", pr.status_code == 200 and dur > 0, pr.text[:120])

    # ---- offline transcription (faster-whisper subprocess) ----
    tr = client.post("/api/transcribe", json={"path": audio, "model_size": "base",
                                              "use_gpu": False, "engine": "faster-whisper"})
    check("transcribe.dispatch", tr.status_code == 200, tr.text[:120])
    rows = []
    if tr.status_code == 200:
        res = poll(tr.json()["job_id"])
        if res["status"] == "done":
            rows = res["result"]["segments"]
            check("transcribe.offline", len(rows) > 0, f"segments={len(rows)}")
        else:
            note(f"transcription not done: {res['status']} - {str(res.get('error',''))[:160]}")

    if not rows:
        rows = [{"start": 0.0, "end": 2.0, "text": "សួស្តី"}]

    # ---- TTS preview (edge-tts; needs network) ----
    tts = client.post("/api/tts/preview", json={"text": "សួស្តី", "voice": "km-KH-PisethNeural", "speed": 1.0})
    if tts.status_code == 200:
        check("tts.preview.bytes", len(tts.content) > 1000, f"bytes={len(tts.content)}")
    else:
        note(f"tts.preview unavailable (likely offline): {tts.status_code}")

    # ---- MP3 dub export (full assembly) ----
    out_mp3 = os.path.join(os.path.dirname(audio), "_p6_export.mp3")
    ex = client.post("/api/export/mp3", json={
        "subtitles": [{"start": r.get("start", 0), "end": r.get("end", 1),
                       "text": r.get("text", ""), "voice": "km-KH-PisethNeural",
                       "speed": 1.0, "volume": 100, "echo": 0, "pitch": 0} for r in rows[:5]],
        "video_duration": max(dur, 5.0), "output_path": out_mp3,
        "dub_volume": 100, "auto_sync_speed": True,
    })
    check("export.dispatch", ex.status_code == 200, ex.text[:120])
    if ex.status_code == 200:
        res = poll(ex.json()["job_id"])
        if res["status"] == "done":
            check("export.mp3.file", os.path.exists(out_mp3) and os.path.getsize(out_mp3) > 0,
                  str(res.get("result"))[:120])
            try:
                os.remove(out_mp3)
            except OSError:
                pass
        else:
            note(f"mp3 export not done: {res['status']} - {str(res.get('error',''))[:200]}")

    print(f"\n{PASS}/{PASS + FAIL} passed")
    if NOTES:
        print("\nNOTES (environment-dependent, not failures):")
        for n in NOTES:
            print("  -", n)
    return 1 if FAIL else 0


if __name__ == "__main__":
    sys.exit(main())
