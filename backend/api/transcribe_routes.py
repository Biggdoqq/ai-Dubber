"""Transcription endpoints (async via job manager)."""
from __future__ import annotations

from fastapi import APIRouter

from backend.api.schemas import (
    TranscribeRequest,
    SilenceSplitRequest,
    BatchTranscribeRequest,
)
from backend.services import transcription_service as svc
from backend.services import settings_service
from backend.utils.jobs import jobs, Job

router = APIRouter(prefix="/api/transcribe", tags=["transcribe"])


@router.post("")
def transcribe(req: TranscribeRequest) -> dict:
    cfg = settings_service.load_settings()

    def _task(job: Job):
        if req.engine == "groq":
            return svc.transcribe_groq(req.path, cfg.get("groq_api_key", ""), job=job)
        if req.engine == "gemini":
            return svc.transcribe_gemini(
                req.path,
                cfg.get("gemini_api_key", ""),
                target_lang=req.target_lang or "Khmer",
                model_name=cfg.get("gemini_model_name", "gemini-1.5-flash"),
                job=job,
            )
        return svc.transcribe_offline(req.path, req.model_size, req.use_gpu, job=job)

    job = jobs.run("transcribe", _task)
    return {"job_id": job.id}


@router.post("/silence-split")
def silence_split(req: SilenceSplitRequest) -> dict:
    def _task(job: Job):
        return svc.detect_silence_segments(
            req.path,
            silence_thresh=req.silence_thresh,
            min_silence=req.min_silence,
            min_speech=req.min_speech,
            max_seg=req.max_seg,
            job=job,
        )

    job = jobs.run("silence_split", _task)
    return {"job_id": job.id}


@router.post("/batch")
def batch_transcribe(req: BatchTranscribeRequest) -> dict:
    def _task(job: Job):
        return svc.batch_transcribe(
            req.videos,
            model_size=req.model_size,
            use_gpu=req.use_gpu,
            max_seg=req.max_seg,
            job=job,
        )

    job = jobs.run("batch_transcribe", _task)
    return {"job_id": job.id}
