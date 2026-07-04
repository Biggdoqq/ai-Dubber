"""Verification tests for the Utilities & System API endpoints."""
from __future__ import annotations

from fastapi.testclient import TestClient

from backend.app import app

client = TestClient(app)


def test_system_gpu_endpoint():
    resp = client.get("/api/system/gpu")
    assert resp.status_code == 200
    data = resp.json()
    assert "available" in data
    assert "encoders" in data


def test_system_cache_endpoint():
    resp = client.get("/api/system/cache")
    assert resp.status_code == 200
    data = resp.json()
    assert "cache_dir" in data
    assert "total_mb" in data
    assert "entries" in data


def test_clear_cache_all():
    resp = client.post("/api/system/cache/clear", json={"target": None})
    assert resp.status_code == 200
    data = resp.json()
    assert "freed_mb" in data
    assert "cleared" in data


def test_diagnostics_endpoint():
    resp = client.get("/api/diagnostics")
    assert resp.status_code == 200
    data = resp.json()
    assert "ffmpeg" in data
    assert "python_version" in data
    assert "paths" in data
    assert "workers_present" in data


def test_diagnostics_logs():
    resp = client.get("/api/diagnostics/logs", params={"limit": 10})
    assert resp.status_code == 200
    data = resp.json()
    assert "logs" in data
    assert isinstance(data["logs"], list)


def test_clear_logs():
    resp = client.post("/api/diagnostics/logs/clear")
    assert resp.status_code == 200
    data = resp.json()
    assert "cleared" in data
    assert data["cleared"] is True


def test_list_models():
    resp = client.get("/api/models")
    assert resp.status_code == 200
    data = resp.json()
    assert "models_dir" in data
    assert "models" in data
    assert isinstance(data["models"], list)
