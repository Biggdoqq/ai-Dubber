"""Subtitle editing endpoints (auto-speed, merge, shift)."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.api.schemas import SubtitleModel
from backend.models import Subtitle
from backend.services import subtitle_service as svc

router = APIRouter(prefix="/api/subtitles", tags=["subtitles"])


class AutoSpeedRequest(BaseModel):
    subtitles: list[SubtitleModel]
    language: str = "km"
    min_speed: float = 0.9
    max_speed: float = 1.20


class MergeRequest(BaseModel):
    subtitles: list[SubtitleModel]
    indices: list[int]


class ShiftRequest(BaseModel):
    subtitles: list[SubtitleModel]
    indices: list[int]
    offset: float


class AutoSplitRequest(BaseModel):
    subtitles: list[SubtitleModel]
    max_chars: int = 60


class AutoVoiceRequest(BaseModel):
    subtitles: list[SubtitleModel]
    male_voice: str = "km-KH-PisethNeural"
    female_voice: str = "km-KH-SreymomNeural"


class CleanupRequest(BaseModel):
    subtitles: list[SubtitleModel]


class DetectCharactersRequest(BaseModel):
    subtitles: list[SubtitleModel]


def _to_models(subs: list[Subtitle]) -> list[dict]:
    return [s.to_dict() for s in subs]


def _from_models(items: list[SubtitleModel]) -> list[Subtitle]:
    return [Subtitle(**s.model_dump()) for s in items]


@router.post("/auto-speed")
def auto_speed(req: AutoSpeedRequest) -> dict:
    subs = _from_models(req.subtitles)
    svc.smart_auto_speed(subs, req.language, req.min_speed, req.max_speed)
    return {"subtitles": _to_models(subs)}


@router.post("/merge")
def merge(req: MergeRequest) -> dict:
    subs = _from_models(req.subtitles)
    try:
        svc.merge_rows(subs, req.indices)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    return {"subtitles": _to_models(subs)}


@router.post("/shift")
def shift(req: ShiftRequest) -> dict:
    subs = _from_models(req.subtitles)
    svc.shift_times(subs, req.indices, req.offset)
    return {"subtitles": _to_models(subs)}


@router.post("/auto-split")
def auto_split(req: AutoSplitRequest) -> dict:
    subs = _from_models(req.subtitles)
    result = svc.auto_split_long_rows(subs, req.max_chars)
    return {"subtitles": _to_models(result)}


@router.post("/auto-voice")
def auto_voice(req: AutoVoiceRequest) -> dict:
    subs = _from_models(req.subtitles)
    svc.auto_assign_voices(subs, req.male_voice, req.female_voice)
    return {"subtitles": _to_models(subs)}


@router.post("/cleanup")
def cleanup(req: CleanupRequest) -> dict:
    subs = _from_models(req.subtitles)
    result = svc.smart_cleanup(subs)
    return {"subtitles": _to_models(result)}


@router.post("/detect-characters")
def detect_characters(req: DetectCharactersRequest) -> dict:
    subs = _from_models(req.subtitles)
    return svc.detect_characters(subs)
