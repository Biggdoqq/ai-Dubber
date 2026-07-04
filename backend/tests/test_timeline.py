"""Verification tests for the Timeline & Waveform API endpoints."""
from __future__ import annotations

import os
import tempfile
from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)


def test_media_probe_nonexistent():
    resp = client.get("/api/media/probe", params={"path": "nonexistent_file.mp4"})
    assert resp.status_code == 404


def test_media_waveform_nonexistent():
    resp = client.get("/api/media/waveform", params={"path": "nonexistent_file.mp4", "buckets": 100})
    assert resp.status_code == 404


def test_media_waveform_valid():
    # We can use our created test video from AppData/Temp as input
    src_video = "C:\\Users\\heang\\AppData\\Local\\Temp\\test_input.mp4"
    if os.path.exists(src_video):
        resp = client.get("/api/media/waveform", params={"path": src_video, "buckets": 150})
        assert resp.status_code == 200
        data = resp.json()
        assert "peaks" in data
        assert len(data["peaks"]) == 150
        # Peaks should be floats
        assert all(isinstance(p, float) for p in data["peaks"])
