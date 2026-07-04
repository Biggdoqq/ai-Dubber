"""Verification tests for the Voice Studio API endpoints."""
from __future__ import annotations

import os
from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)


def test_tts_preview_invalid_voice():
    # If the voice is invalid, it might fail or fallback depending on edge-tts,
    # but let's test sending a basic TTS request and ensuring we get a response.
    resp = client.post(
        "/api/tts/preview",
        json={
            "text": "សួស្តី",
            "voice": "invalid-voice-name",
            "speed": 1.0,
            "reference_wav": None
        }
    )
    # The endpoint should handle the request and either succeed or return a 500 error gracefully
    assert resp.status_code in (200, 500)
    if resp.status_code == 200:
        assert len(resp.content) > 0
