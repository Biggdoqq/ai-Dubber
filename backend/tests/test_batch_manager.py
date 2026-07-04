"""Verification tests for the Batch Manager API endpoints."""
from __future__ import annotations

import os
import tempfile
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app import app
from backend.utils.jobs import jobs

client = TestClient(app)


def test_batch_import_srt_invalid_folder():
    # Folder doesn't exist
    resp = client.post("/api/batch/import-srt", json={"folder": "nonexistent_folder_xyz"})
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    
    # Poll job to terminal state (should fail because folder doesn't exist)
    job = jobs.get(job_id)
    assert job is not None
    # Wait for job to finish
    import time
    for _ in range(20):
        if job.status in ("done", "error", "cancelled"):
            break
        time.sleep(0.05)
    assert job.status == "error"
    assert "Not a folder" in str(job.error)


def test_batch_import_srt_valid():
    with tempfile.TemporaryDirectory() as tmpdir:
        srt_path = Path(tmpdir) / "test1.srt"
        srt_path.write_text(
            "1\n00:00:01,000 --> 00:00:02,000\nHello World\n",
            encoding="utf-8"
        )
        
        resp = client.post("/api/batch/import-srt", json={"folder": tmpdir})
        assert resp.status_code == 200
        job_id = resp.json()["job_id"]
        
        job = jobs.get(job_id)
        assert job is not None
        import time
        for _ in range(20):
            if job.status in ("done", "error", "cancelled"):
                break
            time.sleep(0.05)
        
        assert job.status == "done"
        res = job.result
        assert "files" in res
        assert len(res["files"]) == 1
        assert res["files"][0]["ok"] is True
        assert res["files"][0]["count"] == 1


def test_batch_translate_srt():
    with tempfile.TemporaryDirectory() as tmpdir:
        srt_path = Path(tmpdir) / "test_translate.srt"
        srt_path.write_text(
            "1\n00:00:01,000 --> 00:00:02,000\nHello\n",
            encoding="utf-8"
        )
        
        resp = client.post(
            "/api/batch/translate-srt",
            json={
                "files": [str(srt_path)],
                "source_lang": "en",
                "target_lang": "km",
                "engine": "google"
            }
        )
        assert resp.status_code == 200
        job_id = resp.json()["job_id"]
        
        job = jobs.get(job_id)
        assert job is not None
        import time
        for _ in range(50):
            if job.status in ("done", "error", "cancelled"):
                break
            time.sleep(0.1)
        
        # Note: if google translation service needs internet, it might fail or pass,
        # but the request itself and the job status transitions should be valid.
        assert job.status in ("done", "error")
        if job.status == "done":
            assert job.result["ok"] == 1
            out_file = Path(tmpdir) / "test_translate_km.srt"
            assert out_file.exists()


def test_batch_video_to_mp3_schema():
    # Basic schema and routing test
    resp = client.post(
        "/api/batch/video-to-mp3",
        json={
            "videos": [],
            "output_folder": "some_folder"
        }
    )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    job = jobs.get(job_id)
    assert job is not None
