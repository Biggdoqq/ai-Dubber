"""System/health endpoints."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from backend.config import settings
from backend.services import gpu_service, cache_service
from backend.utils import ffmpeg

router = APIRouter(prefix="/api/system", tags=["system"])


@router.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "ffmpeg": ffmpeg.available(),
        "ffmpeg_path": settings.ffmpeg,
        "worker_python": settings.worker_python,
        "models_dir": str(settings.models_dir),
    }


@router.get("/gpu")
def gpu() -> dict:
    return gpu_service.gpu_info()


@router.get("/cache")
def cache() -> dict:
    return cache_service.cache_info()


class ClearCacheRequest(BaseModel):
    target: str | None = None  # subdir name, or None to clear all


@router.post("/cache/clear")
def clear_cache(req: ClearCacheRequest) -> dict:
    return cache_service.clear_cache(req.target)


@router.get("/voices")
def voices() -> dict:
    """Static voice catalog for the UI (edge defaults + voxcpm presets)."""
    edge = [
        {"id": "km-KH-SreymomNeural", "label": "Khmer Female (Sreymom)", "engine": "edge"},
        {"id": "km-KH-PisethNeural", "label": "Khmer Male (Piseth)", "engine": "edge"},
        {"id": "en-US-JennyNeural", "label": "English Female (Jenny)", "engine": "edge"},
    ]
    voxcpm = []
    try:
        from voxcpm_support import VOXCPM_VOICE_OPTIONS  # reuse legacy catalog
        for key in VOXCPM_VOICE_OPTIONS:
            voxcpm.append({"id": f"voxcpm2:{key}", "label": f"VoxCPM: {key}", "engine": "voxcpm"})
    except Exception:
        pass
    return {"edge": edge, "voxcpm": voxcpm}
