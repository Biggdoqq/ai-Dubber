"""Update manager endpoints."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.services import update_service as svc
from backend.utils.jobs import jobs, Job

router = APIRouter(prefix="/api/update", tags=["update"])


class CheckRequest(BaseModel):
    update_url: str | None = None


class DownloadRequest(BaseModel):
    download_url: str
    save_path: str | None = None


@router.post("/check")
def check(req: CheckRequest) -> dict:
    try:
        return svc.check_update(req.update_url)
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Update check failed: {exc}")


@router.post("/download")
def download(req: DownloadRequest) -> dict:
    def _task(job: Job):
        return svc.download_update(req.download_url, req.save_path, job=job)

    job = jobs.run("download_update", _task)
    return {"job_id": job.id}
