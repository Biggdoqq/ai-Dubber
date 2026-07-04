"""Video effects endpoints (reuse legacy Effect.py via worker subprocess)."""
from __future__ import annotations

from fastapi import APIRouter
from pydantic import BaseModel

from backend.services import effects_service as svc
from backend.utils.jobs import jobs, Job

router = APIRouter(prefix="/api/effects", tags=["effects"])


class ApplyEffectRequest(BaseModel):
    input_video: str
    output_video: str
    effect_name: str
    value: float = 1.0


class ApplyOverlaysRequest(BaseModel):
    input_video: str
    output_video: str
    config: dict  # {watermark, blur, text} — legacy video_effects_config shape


@router.get("")
def list_effects() -> dict:
    return svc.list_effects()


@router.post("/apply")
def apply_effect(req: ApplyEffectRequest) -> dict:
    def _task(job: Job):
        return svc.apply_effect(
            req.input_video, req.output_video, req.effect_name, req.value, job=job
        )

    job = jobs.run("apply_effect", _task)
    return {"job_id": job.id}


@router.post("/overlays")
def apply_overlays(req: ApplyOverlaysRequest) -> dict:
    def _task(job: Job):
        return svc.apply_overlays(req.input_video, req.output_video, req.config, job=job)

    job = jobs.run("apply_overlays", _task)
    return {"job_id": job.id}
