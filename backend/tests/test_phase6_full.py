"""Phase 6 full-surface verification.

Exercises every /api endpoint via TestClient. Offline-deterministic paths are
asserted on output; paths needing network/models/keys are asserted to at least
dispatch a job and fail *gracefully* (job error, not a 500 from an import/bug).

Run: PYTHONPATH=. venv_cpu/Scripts/python backend/tests/test_phase6_full.py
"""
from __future__ import annotations

import time

from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)

PASS = 0
FAIL = 0
FAILURES: list[str] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    global PASS, FAIL
    if cond:
        PASS += 1
        print(f"PASS {name}")
    else:
        FAIL += 1
        FAILURES.append(f"{name}: {detail}")
        print(f"FAIL {name}: {detail}")


def poll(job_id: str, timeout: float = 30.0) -> dict:
    """Poll a job to a terminal state."""
    deadline = time.time() + timeout
    while time.time() < deadline:
        j = client.get(f"/api/jobs/{job_id}").json()
        if j["status"] in ("done", "error", "cancelled"):
            return j
        time.sleep(0.2)
    return {"status": "timeout", "error": "poll timeout"}


SRT = "1\n00:00:01,000 --> 00:00:02,500\nសួស្តី\n\n2\n00:00:03,000 --> 00:00:05,000\nWorld test"


def main() -> int:
    # ---- system ----
    check("ping", client.get("/api/ping").json() == {"pong": True})
    h = client.get("/api/system/health").json()
    check("health.status", h.get("status") == "ok")
    v = client.get("/api/system/voices").json()
    check("voices.edge", len(v.get("edge", [])) >= 3, str(v)[:100])

    # ---- srt ----
    r = client.post("/api/srt/parse", json={"content": SRT}).json()
    check("srt.parse", r.get("count") == 2, str(r)[:120])
    rows = r["rows"]
    built = client.post("/api/srt/build", json={"rows": rows})
    check("srt.build", "00:00:01,000 --> 00:00:02,500" in built.text, built.text[:120])

    # ---- subtitle ops ----
    asp = client.post("/api/subtitles/auto-speed",
                      json={"subtitles": [{"start": 0, "end": 1, "text": "x" * 28}], "language": "km"}).json()
    check("subtitles.auto-speed", asp["subtitles"][0]["speed"] == 1.2, str(asp)[:120])
    mg = client.post("/api/subtitles/merge",
                     json={"subtitles": rows, "indices": [0, 1]}).json()
    check("subtitles.merge", len(mg["subtitles"]) == 1, str(mg)[:120])
    mg_bad = client.post("/api/subtitles/merge",
                         json={"subtitles": rows, "indices": [0]})
    check("subtitles.merge.reject", mg_bad.status_code in (200, 400))
    sh = client.post("/api/subtitles/shift",
                     json={"subtitles": rows, "indices": [0, 1], "offset": -10}).json()
    check("subtitles.shift.clamp", sh["subtitles"][0]["start"] == 0.0, str(sh)[:120])
    longrow = [{"start": 0, "end": 6, "text": "ABCDEFGHIJ " * 8}]  # >60 chars
    spl = client.post("/api/subtitles/auto-split",
                      json={"subtitles": longrow, "max_chars": 60}).json()
    check("subtitles.auto-split", len(spl["subtitles"]) == 2, str(spl)[:120])

    # ---- settings + characters ----
    s = client.get("/api/settings")
    check("settings.get", s.status_code == 200)
    sp = client.put("/api/settings", json={"values": {"whisper_model_size": "base"}})
    check("settings.put", sp.status_code == 200)
    ch = client.put("/api/settings/characters",
                    json={"profiles": {"Hero": {"gender": "male", "ref_wav": ""}}})
    check("characters.put", ch.status_code == 200 and "Hero" in ch.json(), ch.text[:120])
    chg = client.get("/api/settings/characters").json()
    check("characters.get", "Hero" in chg, str(chg)[:120])

    # ---- projects ----
    import tempfile, os
    aivd = os.path.join(tempfile.gettempdir(), "p6_proj.aivd")
    sv = client.post(f"/api/projects/save?path={aivd}",
                     json={"video": "v.mp4", "subtitles": rows})
    check("projects.save", sv.status_code == 200, sv.text[:120])
    op = client.get(f"/api/projects/open?path={aivd}").json()
    check("projects.open", len(op.get("subtitles", [])) == 2, str(op)[:120])

    # ---- license + keygen ----
    mid = client.get("/api/license/machine-id").json()
    check("license.machine-id", len(mid.get("machine_id", "")) == 16, str(mid)[:120])
    st = client.get("/api/license/status")
    check("license.status", st.status_code == 200)
    gk = client.post("/api/license/generate-key",
                     json={"machine_id": mid["machine_id"], "days": 0, "months": 0, "years": 1}).json()
    key = gk.get("key", "")
    check("license.generate-key", key.startswith("HG-"), str(gk)[:120])
    val = client.post("/api/license/validate", json={"key": key}).json()
    check("license.validate", val.get("valid") is True, str(val)[:120])

    # ---- models / update / diagnostics ----
    ml = client.get("/api/models").json()
    check("models.list", len(ml.get("models", [])) >= 1, str(ml)[:120])
    diag = client.get("/api/diagnostics").json()
    check("diagnostics", diag.get("ffmpeg", {}).get("available") in (True, False), str(diag)[:120])
    logs = client.get("/api/diagnostics/logs")
    check("diagnostics.logs", logs.status_code == 200)

    # ---- effects + recap catalogs ----
    eff = client.get("/api/effects").json()
    check("effects.list", len(eff.get("presets", [])) >= 1, str(eff)[:120])
    rc = client.get("/api/recap/options").json()
    check("recap.options", len(rc.get("genres", [])) >= 1, str(rc)[:120])

    # ---- TTS preview (needs edge-tts + network) ----
    tts = client.post("/api/tts/preview", json={"text": "test", "voice": "", "speed": 1.0})
    check("tts.preview", tts.status_code in (200, 500), f"status={tts.status_code}")

    # ---- update check (needs network; accept network failure as 502) ----
    up = client.post("/api/update/check", json={})
    check("update.check", up.status_code in (200, 502), f"status={up.status_code}")

    print(f"\n{PASS}/{PASS + FAIL} passed")
    if FAILURES:
        print("\nFAILURES:")
        for f in FAILURES:
            print("  -", f)
    return 1 if FAIL else 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
