"""Gameplay Recap endpoints (script generation + voiceover export)."""
from __future__ import annotations

from fastapi import APIRouter

from pydantic import BaseModel

from backend.services import recap_service as svc
from backend.services import settings_service
from backend.utils.jobs import jobs, Job

router = APIRouter(prefix="/api/recap", tags=["recap"])


class GenerateScriptRequest(BaseModel):
    video_path: str
    genre: str = "Gaming Highlights"
    duration: str = "Short"
    target_language: str = "Khmer"
    analysis_mode: str = "listen"  # listen | watch_listen | none


class ExportRecapRequest(BaseModel):
    video_path: str
    script: str
    output_path: str
    voice: str = "km-KH-PisethNeural"
    burn_subtitles: bool = True


@router.get("/options")
def options() -> dict:
    return {"genres": svc.GENRES, "durations": svc.DURATIONS}


@router.post("/generate-script")
def generate_script(req: GenerateScriptRequest) -> dict:
    cfg = settings_service.load_settings()

    def _task(job: Job):
        return svc.generate_script(
            req.video_path,
            genre=req.genre,
            duration=req.duration,
            target_language=req.target_language,
            analysis_mode=req.analysis_mode,
            groq_api_key=cfg.get("groq_api_key", ""),
            gemini_api_key=cfg.get("gemini_api_key", ""),
            groq_model=cfg.get("groq_model_name", "llama-3.3-70b-versatile"),
            gemini_model=cfg.get("gemini_model_name", "gemini-1.5-flash"),
            job=job,
        )

    job = jobs.run("recap_script", _task)
    return {"job_id": job.id}


@router.post("/export")
def export_recap(req: ExportRecapRequest) -> dict:
    def _task(job: Job):
        return svc.export_recap(
            req.video_path, req.script, req.output_path,
            voice=req.voice, burn_subtitles=req.burn_subtitles, job=job,
        )

    job = jobs.run("recap_export", _task)
    return {"job_id": job.id}
