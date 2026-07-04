"""Verification tests for the Effects Studio API endpoints."""
from __future__ import annotations

import os
import tempfile
import time
from pathlib import Path
from fastapi.testclient import TestClient

from backend.app import app
from backend.utils.jobs import jobs

client = TestClient(app)


def test_list_audio_effects():
    resp = client.get("/api/audio/audio-effects")
    assert resp.status_code == 200
    data = resp.json()
    assert "effects" in data
    assert "Bass Boost" in data["effects"]
    assert "Vocal Clarity" in data["effects"]


def test_list_video_effects():
    resp = client.get("/api/effects")
    assert resp.status_code == 200
    data = resp.json()
    assert "presets" in data
    assert "ffmpeg" in data
    assert "Cinematic Warm" in data["presets"]
    assert "Contrast" in data["ffmpeg"]


def test_vocal_removal_invalid_file():
    resp = client.post(
        "/api/audio/remove-vocals",
        json={
            "video_path": "nonexistent_video_path.mp4",
            "output_path": "output_path.mp4",
            "use_gpu": False
        }
    )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    job = jobs.get(job_id)
    assert job is not None
    
    # Wait for job
    for _ in range(20):
        if job.status in ("done", "error", "cancelled"):
            break
        time.sleep(0.05)
    
    assert job.status == "error"
    assert "Load a video first" in str(job.error)


def test_reduce_noise_invalid_file():
    resp = client.post(
        "/api/audio/reduce-noise",
        json={
            "input_path": "nonexistent_audio_path.wav",
            "output_path": "output_path.wav"
        }
    )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    job = jobs.get(job_id)
    assert job is not None
    
    # Wait for job
    for _ in range(20):
        if job.status in ("done", "error", "cancelled"):
            break
        time.sleep(0.05)
    
    assert job.status == "error"
    assert "Input file not found" in str(job.error)


def test_enhance_voice_invalid_file():
    resp = client.post(
        "/api/audio/enhance-voice",
        json={
            "input_path": "nonexistent_audio_path.wav",
            "output_path": "output_path.wav"
        }
    )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    job = jobs.get(job_id)
    assert job is not None
    
    # Wait for job
    for _ in range(20):
        if job.status in ("done", "error", "cancelled"):
            break
        time.sleep(0.05)
    
    assert job.status == "error"
    assert "Input file not found" in str(job.error)


def test_apply_audio_effect_invalid():
    resp = client.post(
        "/api/audio/audio-effect",
        json={
            "input_path": "nonexistent.wav",
            "output_path": "output.wav",
            "effect_name": "Bass Boost"
        }
    )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    job = jobs.get(job_id)
    assert job is not None
    
    for _ in range(20):
        if job.status in ("done", "error", "cancelled"):
            break
        time.sleep(0.05)
    
    assert job.status == "error"
    assert "Input file not found" in str(job.error)


def test_apply_video_effect_invalid():
    resp = client.post(
        "/api/effects/apply",
        json={
            "input_video": "nonexistent.mp4",
            "output_video": "output.mp4",
            "effect_name": "Contrast",
            "value": 1.5
        }
    )
    assert resp.status_code == 200
    job_id = resp.json()["job_id"]
    job = jobs.get(job_id)
    assert job is not None
    
    for _ in range(20):
        if job.status in ("done", "error", "cancelled"):
            break
        time.sleep(0.05)
    
    assert job.status == "error"
    assert "Source video not found" in str(job.error)
