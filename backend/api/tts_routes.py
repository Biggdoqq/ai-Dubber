"""Text-to-speech endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from fastapi.responses import FileResponse

from backend.api.schemas import TTSRequest
from backend.services import tts_service as svc

router = APIRouter(prefix="/api/tts", tags=["tts"])


@router.post("/preview")
def preview(req: TTSRequest) -> FileResponse:
    try:
        out = svc.synthesize(
            req.text, voice=req.voice, speed=req.speed, reference_wav=req.reference_wav
        )
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=str(exc))
    media = "audio/wav" if out.endswith(".wav") else "audio/mpeg"
    return FileResponse(out, media_type=media, filename="preview" + out[out.rfind("."):])
