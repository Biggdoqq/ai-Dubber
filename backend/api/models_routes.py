"""Model + download manager endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services import models_service as svc
from backend.utils.jobs import jobs, Job

router = APIRouter(prefix="/api/models", tags=["models"])


class DownloadRequest(BaseModel):
    key: str


@router.get("")
def list_models() -> dict:
    return svc.list_models()


@router.post("/download")
def download(req: DownloadRequest) -> dict:
    try:
        svc._model_by_key(req.key) or (_ for _ in ()).throw(ValueError("unknown"))
    except Exception:
        raise HTTPException(status_code=404, detail=f"Unknown model '{req.key}'")

    def _task(job: Job):
        return svc.download_model(req.key, job=job)

    job = jobs.run("download_model", _task)
    return {"job_id": job.id}


@router.delete("/{key}")
def delete(key: str) -> dict:
    try:
        return svc.delete_model(key)
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
